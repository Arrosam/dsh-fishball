/**
 * Executable T-SK scenarios. Each is one requirement behaviour, written once and shared by every case
 * id whose oracle it is: a UC, EP, BVA, DT or ST case often restates the same behaviour from its own
 * technique. Every expectation comes from the case title, S1–S8, the SK-SEAM decisions, Q1–Q6 and the
 * public tool contract (constants.mjs CONTRACT). None comes from the implementation.
 *
 * Signature: `(t) => Promise<void>`, on the current DSH. Fixtures live under the run's temp
 * directory and are removed by the harness after each test.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { CASE, CONTRACT, FIXTURE, HARNESS, HOSTILE, KEYS, LAYOUT, SAMPLE, SDK_PACKAGES } from './constants.mjs'
import { placeSkill, placeSymlinkedDirectory, placeSymlinkedSkill, skillDocument } from './fixtures.mjs'
import { inodeOf, openTrace, traced } from './fs-trace.mjs'
import {
  assertCommitted, assertFailure, bootChild, childBase, escapingCalls, freshChild, names, privateEntries,
  readsThrough, resultText, skillFile, TOOL_NAMES, tree, within,
} from './harness.mjs'
import { importDsh } from 'fishball-test-helpers/dsh'
import { loadSdk, nativeLibrary, nativeSkill } from './native-oracle.mjs'

const { code: CODE, field: FIELD } = CONTRACT
const OPS = Object.freeze(Object.keys(CONTRACT.tool))
const NAMED_OPS = Object.freeze(['read', 'create', 'update', 'remove'])

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

/** A native document for `name` (SAMPLE content unless overridden). */
export const doc = (name = SAMPLE.name, overrides = {}) => skillDocument({ ...SAMPLE, name, ...overrides })

/** Tool arguments for one operation on `name` with document `document`. */
function argsFor(op, name, document = doc(name)) {
  if (op === 'list' || op === 'reload') return {}
  if (op === 'create' || op === 'update') return { name, document }
  return { name }
}

/** Create `name` through the tool and require a committed success; returns the document. */
export async function seed(child, name = SAMPLE.name, overrides = {}) {
  const document = doc(name, overrides)
  assertCommitted(await child.call('create', { name, document }), name)
  return document
}

const fileText = (child, name) => readFile(skillFile(child, name), 'utf8')
const exists = (file) => stat(file).then(() => true, () => false)

/** The manager can list, read and load `name` with `body`. */
async function assertVisible(child, name, body, description = SAMPLE.description) {
  const listed = await child.call('list')
  assert.equal(listed.ok, true, JSON.stringify(listed))
  assert.ok(names(listed.skills).includes(name), `list lacks ${name}: ${JSON.stringify(listed)}`)
  assert.deepEqual(await child.call('read', { name }), { ok: true, name, description, body })
  const loaded = await child.load(name)
  assert.equal(loaded?.content, body, 'registry load of ' + name)
  assert.equal(loaded.provider, CONTRACT.provider)
  const catalog = await child.catalog()
  assert.equal(catalog.complete, true)
  assert.ok(names(privateEntries(catalog)).includes(name), 'manager model catalog lacks ' + name)
}

/** The manager's list, read and load do not resolve `name`. */
async function assertAbsent(child, name) {
  const listed = await child.call('list')
  assert.equal(listed.ok, true, JSON.stringify(listed))
  assert.ok(!names(listed.skills).includes(name), `list still has ${name}`)
  assertFailure(await child.call('read', { name }), CODE.notFound)
  assert.equal(await child.load(name), undefined, 'registry still loads ' + name)
  assert.ok(!names((await child.catalog()).skills).includes(name), 'model catalog still has ' + name)
}

/** The stock native provider (format oracle) loads `name` from the child's root with exactly these fields. */
async function assertNativeLoadable(child, name, { description = SAMPLE.description, body = SAMPLE.body } = {}) {
  const skill = await nativeSkill(child.dirs.root, name)
  assert.ok(skill, 'native discovery does not load ' + name)
  assert.equal(skill.description, description)
  assert.equal(skill.content, body)
  assert.equal(skill.invocation.modelInvocable, true, 'S6: model-loadable')
}

/** No approval was requested for anything this child did (S3). */
const assertNoApproval = (child) => assert.deepEqual(child.approvals, [], 'an approval was requested')

/** No traced call at all: refused before any filesystem access. */
function assertNoFilesystem(calls, what) {
  assert.deepEqual(calls.map((call) => `${call.op} ${call.path ?? ''}`), [], what + ' touched the filesystem')
}

/** No traced write anywhere. */
const assertNoWrites = (calls, what) => assert.deepEqual(calls.filter((call) => call.write).map((call) => `${call.op} ${call.path}`), [], what + ' wrote')

/** No result text claims a slash-menu refresh or an erasure of delivered text (decision 3, ST-09-T4). */
function assertNoClaims(child, op, args, result) {
  const text = resultText(child, op, args, result)
  assert.doesNotMatch(text, HOSTILE.menuClaim, 'a result claims a menu refresh')
  assert.doesNotMatch(text, HOSTILE.erasureClaim, 'a result claims erasure')
}

/** Every operation once, each expected to succeed, as [op, args, result] triples. */
async function allOperations(child, name) {
  const plan = [
    ['list', {}], ['read', { name }], ['create', argsFor('create', CASE.fresh)],
    ['update', argsFor('update', name, doc(name, { body: CASE.revisedBody }))], ['reload', {}], ['remove', { name: CASE.fresh }],
  ]
  const runs = []
  for (const [op, args] of plan) runs.push([op, args, await child.call(op, args)])
  return runs
}

/** Temporarily point the process's home environment at `values` (restored afterwards). */
async function withEnvironment(values, fn) {
  const saved = Object.fromEntries(CASE.main.env.map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  try {
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

/**
 * Main-home sources (Q6a): ~/.dsh/skills, ~/.agents/skills, project .dsh/skills and .agents/skills,
 * a custom dir. Each holds a uniquely named skill. `collide` also places SAMPLE.name in ~/.dsh/skills.
 */
async function mainHome(dirs, { collide = false } = {}) {
  const { main } = dirs
  const project = path.join(main, CASE.main.project)
  const roots = {
    [CASE.main.names.dsh]: path.join(main, CASE.main.dshHome, LAYOUT.root),
    [CASE.main.names.agents]: path.join(main, CASE.main.agentsHome, LAYOUT.root),
    [CASE.main.names.projectDsh]: path.join(project, CASE.main.dshHome, LAYOUT.root),
    [CASE.main.names.projectAgents]: path.join(project, CASE.main.agentsHome, LAYOUT.root),
    [CASE.main.names.custom]: path.join(main, CASE.main.custom),
  }
  await mkdir(path.join(project, CASE.main.gitMarker), { recursive: true })
  for (const [name, root] of Object.entries(roots)) await placeSkill(root, name, doc(name, { body: CASE.main.body }))
  if (collide) await placeSkill(roots[CASE.main.names.dsh], SAMPLE.name, doc(SAMPLE.name, { body: CASE.main.body }))
  const env = {
    HOME: main, USERPROFILE: main,
    DSH_HOME: path.join(main, CASE.main.dshHome), DSH_AGENTS_HOME: path.join(main, CASE.main.agentsHome),
  }
  return { names: Object.keys(roots), project, env }
}

/** A worker scope with its own stock filesystem skill provider over `root` (its own library). */
async function workerWithOwnLibrary(child, root, options) {
  const { FileSystemSkillProvider } = await importDsh(SDK_PACKAGES.filesystem)
  const worker = child.worker(HARNESS.workerIds.session, options)
  worker.scope.ctx.get('skills').registerProvider((control) => new FileSystemSkillProvider(worker.scope.ctx, control, { includeDefaultRoots: false, customSkillDirs: [root], watch: false }))
  return worker
}

/** Calls of every operation as `agent` (with optional extra exec fields) must be refused before I/O. */
async function assertRefusedFor(child, agent, { extra = {}, generation = child.current } = {}) {
  for (const op of OPS) {
    const args = argsFor(op, op === 'create' ? CASE.fresh : SAMPLE.name)
    const before = await tree(child.dirs.base)
    const { value, calls } = await traced(() => child.call(op, args, { generation, agent, extra }))
    assertFailure(value, CODE.notManager)
    assert.equal(value.skills, undefined, op + ' leaked a catalog to a non-manager')
    assert.equal(value.body, undefined, op + ' leaked a body to a non-manager')
    assertNoFilesystem(calls, `${op} by a non-manager`)
    assert.deepEqual(await tree(child.dirs.base), before)
  }
}

// ---------------------------------------------------------------------------------------------
// EP-19 / DT-01 visibility and callers
// ---------------------------------------------------------------------------------------------

/** EP-19-01, DT-09-R1, DT-01-R1: own skill lists, reads and loads, no approval, ordinary fs read-only. */
export async function ownSkillAvailable(t) {
  const child = await freshChild(t)
  await seed(child)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
  await assertOrdinaryWritesDenied(child, skillFile(child, SAMPLE.name))
  assertNoApproval(child)
}

/**
 * The child's ordinary routes against `file`: ctx.fs write/edit (and rc.1 delete/move) are denied by
 * read-only; the sandboxed shell either runs confined or refuses to run unconfined. No byte changes
 * and no approval is requested.
 */
async function assertOrdinaryWritesDenied(child, file) {
  const before = await tree(child.dirs.base)
  const fs = child.root.get('fs')
  const target = await fs.resolve(file)
  const destination = await fs.resolve(file + HARNESS.homeDirectory)
  const attempts = [
    ['writeText', () => fs.writeText(target, HARNESS.workerBody)],
    ['editText', () => fs.editText(target, { oldString: LAYOUT.frontmatter, newString: HARNESS.workerBody, replaceAll: true })],
  ]
  // rc.5's filesystem seam has no delete/move mutation, so there is no such ordinary route to deny.
  if (typeof fs.deleteFile === 'function') attempts.push(['deleteFile', () => fs.deleteFile(target)])
  if (typeof fs.moveFile === 'function') attempts.push(['moveFile', () => fs.moveFile(target, destination, {})])
  for (const [label, attempt] of attempts) {
    await assert.rejects(attempt, (error) => error.code === CONTRACT.sandbox.denied, label + ' was not denied by read-only')
  }
  await assertShellDenied(child, file)
  assert.deepEqual(await tree(child.dirs.base), before, 'an ordinary route changed bytes')
  assertNoApproval(child)
}

/** The read-only sandboxed shell: confined (no write) or refused (SANDBOX_UNAVAILABLE); never unconfined. */
async function assertShellDenied(child, file) {
  const fibers = []
  for (const pkg of [SDK_PACKAGES.subprocess, SDK_PACKAGES.sandbox, SDK_PACKAGES.bashSandbox]) {
    fibers.push(await child.root.plugin((await importDsh(pkg)).default, {}))
  }
  try {
    const shell = child.root.get('shell')
    const spec = shell.resolve({ command: HARNESS.shellWrite(file), workdir: child.dirs.home })
    const outcome = await shell.execute(spec).then((execution) => execution.result()).then((result) => ({ result }), (error) => ({ error }))
    if (outcome.error) assert.equal(outcome.error.code, CONTRACT.sandbox.unavailable, String(outcome.error))
    else assert.notEqual(outcome.result.exitCode, 0, 'the read-only shell wrote into the skills root')
  } finally {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  }
}

/** EP-19-02, UC-25-A1: main-home sources never appear; not-found; nothing copied into the child. */
export async function mainHomeExcluded(t) {
  const dirs = await childBase(t)
  const main = await mainHome(dirs)
  await withEnvironment(main.env, async () => {
    const child = await bootChild(t, dirs)
    await seed(child, FIXTURE.privateSkill)
    const before = await tree(dirs.home)
    const listed = await child.call('list')
    assert.deepEqual(names(listed.skills), [FIXTURE.privateSkill])
    const reload = await child.call('reload')
    assert.deepEqual(names(reload.skills), [FIXTURE.privateSkill])
    const catalog = await child.catalog(child.current.live, { cwd: main.project })
    for (const name of main.names) {
      assert.ok(!names(catalog.skills).includes(name), 'manager model catalog has main-home ' + name)
      assert.equal(await child.load(name, child.current.live, { cwd: main.project }), undefined, 'load resolved main-home ' + name)
      assertFailure(await child.call('read', { name }), CODE.notFound)
    }
    assert.deepEqual(await tree(dirs.home), before, 'something was copied or imported into the child home')
  })
}

/** EP-19-03: on a main-home collision the private body loads, never the main one. */
export async function mainCollisionPrivateWins(t) {
  const dirs = await childBase(t)
  const main = await mainHome(dirs, { collide: true })
  await withEnvironment(main.env, async () => {
    const child = await bootChild(t, dirs)
    await seed(child)
    assert.equal((await child.load(SAMPLE.name, child.current.live, { cwd: main.project }))?.content, SAMPLE.body)
    assert.equal((await child.call('read', { name: SAMPLE.name })).body, SAMPLE.body)
  })
}

/**
 * EP-19-04 (Q6): a bundled/preset contribution colliding with a private name. No presence assertion;
 * the winner is the native layer rule's choice, so either body may load, but nothing else may. The
 * private library itself is unaltered.
 */
export async function bundledCollisionUnaltered(t) {
  const child = await freshChild(t)
  const document = await seed(child)
  const disposeGlobal = child.registry.register({ name: SAMPLE.name, description: SAMPLE.description, content: CASE.bundledBody, source: 'bundled' })
  t.after(disposeGlobal)
  assert.ok([SAMPLE.body, CASE.bundledBody].includes((await child.load(SAMPLE.name))?.content))
  assert.equal((await child.call('read', { name: SAMPLE.name })).body, SAMPLE.body)
  assert.equal(await fileText(child, SAMPLE.name), document)
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
}

/** EP-19-05, UC-25-E1, DT-02-R10: absent name → not-found, no fallback, the manager keeps working. */
export async function absentNotFound(t) {
  const dirs = await childBase(t)
  const main = await mainHome(dirs)
  await withEnvironment(main.env, async () => {
    const child = await bootChild(t, dirs)
    await seed(child)
    const before = await tree(dirs.base)
    for (const name of [CASE.absent, CASE.main.names.dsh]) {
      assertFailure(await child.call('read', { name }), CODE.notFound)
      assert.equal(await child.load(name), undefined)
    }
    assert.deepEqual(await tree(dirs.base), before)
    await assertVisible(child, SAMPLE.name, SAMPLE.body)
    const worker = child.worker()
    assert.deepEqual(child.visibleTools(worker.live), [], 'the worker gained the dedicated tool')
    assert.equal(await child.load(SAMPLE.name, worker.live), undefined, 'the worker gained library access')
  })
}

/**
 * EP-19-07, DT-09-R5, UC-25-A2: a worker with its own same-named skill. No manager operation touches
 * the worker's file or catalog. The private skill never enters the worker's catalog. What Fishball can
 * hand off is its own complete body text (read), never a path or locator.
 */
export async function workerOwnSameName(t) {
  const child = await freshChild(t)
  await seed(child)
  const workerRoot = path.join(child.dirs.base, CASE.workerRoot)
  await placeSkill(workerRoot, SAMPLE.name, doc(SAMPLE.name, { body: HARNESS.workerBody }))
  const before = await tree(workerRoot)
  const worker = await workerWithOwnLibrary(child, workerRoot)
  const handoff = await child.call('read', { name: SAMPLE.name })
  assert.deepEqual(handoff, { ok: true, name: SAMPLE.name, description: SAMPLE.description, body: SAMPLE.body })
  assert.doesNotMatch(JSON.stringify(handoff), new RegExp(child.dirs.base), 'the hand-off material carries a path')
  for (const [op, , result] of await allOperations(child, SAMPLE.name)) assert.equal(result.ok, true, op + ': ' + JSON.stringify(result))
  assert.deepEqual(await tree(workerRoot), before, "the worker's own skill file changed")
  assert.equal((await child.load(SAMPLE.name, worker.live))?.content, HARNESS.workerBody, "the worker's own skill stopped loading")
  assert.deepEqual(privateEntries(await child.catalog(worker.live)), [], "the private skill entered the worker's catalog")
  assert.deepEqual(child.visibleTools(worker.live), [])
  await assertRefusedFor(child, worker.live)
}

/**
 * EP-19-06, DT-01-R3/R4, ST-12-T4: native subagent, managed worker and a worker composed under the
 * same standing preset as the manager. None sees the private catalog or the tools, and every tool
 * call as a worker is refused before I/O. The global (main/preset) view has neither.
 */
export async function workerIsolated(t) {
  const child = await freshChild(t)
  const preset = Object.freeze({ id: 'fbtest-preset' })
  await child.current.dispose()
  await child.mount({ parent: preset })
  await seed(child)
  const workers = [child.worker(HARNESS.workerIds.subagent), child.worker(HARNESS.workerIds.session, { parent: preset })]
  for (const scope of [...workers.map((worker) => worker.live), preset, null]) {
    assert.deepEqual(privateEntries(await child.catalog(scope)), [], 'a non-manager view holds the private catalog')
    assert.equal(await child.load(SAMPLE.name, scope), undefined, 'a non-manager view loads the private skill')
    assert.deepEqual(child.visibleTools(scope ?? undefined), [], 'a non-manager view has the dedicated tool')
  }
  for (const worker of workers) await assertRefusedFor(child, worker.live)
  await assertOrdinaryWritesDenied(child, skillFile(child, SAMPLE.name))
}

// ---------------------------------------------------------------------------------------------
// EP-20 / DT-02 operations
// ---------------------------------------------------------------------------------------------

/** EP-20-01: list = exactly the valid private skills; no write, approval or side effect. */
export async function listExactValid(t) {
  const child = await freshChild(t)
  await seed(child)
  await seed(child, CASE.other)
  await placeSkill(child.dirs.root, CASE.bypass.corrupt, SAMPLE.body)
  await mkdir(path.join(child.dirs.root, CASE.absent))
  const before = await tree(child.dirs.base)
  const { value, calls } = await child.tracedCall('list')
  assert.equal(value.ok, true, JSON.stringify(value))
  assert.deepEqual(names(value.skills), [CASE.other, SAMPLE.name].sort())
  for (const skill of value.skills) assert.deepEqual(skill, { name: skill.name, description: SAMPLE.description })
  assertNoWrites(calls, 'list')
  assert.deepEqual(await tree(child.dirs.base), before)
  assertNoApproval(child)
}

/** EP-20-02, DT-02-R9: read = the complete current document fields; nothing written. */
export async function readCurrent(t) {
  const child = await freshChild(t)
  await seed(child)
  const before = await tree(child.dirs.base)
  const { value, calls } = await child.tracedCall('read', { name: SAMPLE.name })
  assert.deepEqual(value, { ok: true, name: SAMPLE.name, description: SAMPLE.description, body: SAMPLE.body })
  assertNoWrites(calls, 'read')
  assert.deepEqual(await tree(child.dirs.base), before)
}

/**
 * EP-20-03, DT-02-R1, UC-26-M/A1, ST-09-T1, DT-09-R2, EP-22-01, DT-03-R2, ST-11-T1, UC-LIFE-A1:
 * a fresh child with no skills folder lists empty; the first create makes the root and exactly
 * one complete native document. The next list, read, load and model catalog show it with no restart
 * and no approval.
 */
export async function createPublishes(t) {
  const child = await freshChild(t)
  assert.equal(await exists(child.dirs.root), false, 'fixture: no skills folder yet')
  assert.deepEqual(await child.call('list'), { ok: true, skills: [] })
  const document = doc()
  const result = await child.call('create', { name: SAMPLE.name, document })
  assertCommitted(result, SAMPLE.name)
  assertNoClaims(child, 'create', { name: SAMPLE.name, document }, result)
  const files = await tree(child.dirs.home)
  assert.deepEqual(Object.keys(files).sort(), [LAYOUT.root, path.join(LAYOUT.root, SAMPLE.name), path.join(LAYOUT.root, SAMPLE.name, LAYOUT.file)])
  await assertNativeLoadable(child, SAMPLE.name)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
  assertNoApproval(child)
}

/** EP-20-04, DT-02-R4, UC-27-M, ST-09-T3, ST-11-T2: update → next load new; already-loaded text unchanged. */
export async function updatePublishes(t) {
  const child = await freshChild(t)
  await seed(child)
  const delivered = await child.load(SAMPLE.name)
  const deliveredRead = await child.call('read', { name: SAMPLE.name })
  const args = { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }
  const result = await child.call('update', args)
  assertCommitted(result, SAMPLE.name)
  assertNoClaims(child, 'update', args, result)
  await assertVisible(child, SAMPLE.name, CASE.revisedBody)
  await assertNativeLoadable(child, SAMPLE.name, { body: CASE.revisedBody })
  assert.equal(delivered.content, SAMPLE.body, 'an already-loaded body was rewritten')
  assert.equal(deliveredRead.body, SAMPLE.body, 'an already-delivered read result was rewritten')
}

/** EP-20-05, DT-02-R7, DT-09-R3, UC-27-E1, ST-09-T4, BVA-C-03: remove → gone; root and others unchanged. */
export async function removeLeavesOthers(t) {
  const child = await freshChild(t)
  await seed(child)
  await seed(child, CASE.other)
  const delivered = await child.load(SAMPLE.name)
  const otherBefore = await tree(path.join(child.dirs.root, CASE.other))
  const args = { name: SAMPLE.name }
  const result = await child.call('remove', args)
  assertCommitted(result, SAMPLE.name)
  assertNoClaims(child, 'remove', args, result)
  await assertAbsent(child, SAMPLE.name)
  assert.deepEqual(names((await child.call('list')).skills), [CASE.other])
  assert.deepEqual(await tree(path.join(child.dirs.root, CASE.other)), otherBefore, 'another skill changed')
  assert.equal(await exists(child.dirs.root), true, 'the root was removed')
  assert.equal(delivered.content, SAMPLE.body, 'already-delivered text was changed')
  await assertVisible(child, CASE.other, SAMPLE.body)
}

/** EP-20-06, DT-02-R12: reload invalidates and returns a fresh complete catalog; success only when complete. */
export async function reloadFresh(t) {
  const child = await freshChild(t)
  assert.deepEqual(await child.call('reload'), { ok: true, skills: [] })
  await seed(child)
  await child.call('list')
  // A bypass-made skill is discovered by the fresh catalog that reload forces (watcher is off).
  await placeSkill(child.dirs.root, CASE.other, doc(CASE.other))
  const reload = await child.call('reload')
  assert.equal(reload.ok, true)
  assert.deepEqual(names(reload.skills), [CASE.other, SAMPLE.name].sort())
  assert.deepEqual(names(privateEntries(await child.catalog())), [CASE.other, SAMPLE.name].sort())
  const fault = child.installFault()
  fault.mode = HARNESS.faultMode.incomplete
  assertFailure(await child.call('reload'), CODE.catalogIncomplete)
}

/** EP-20-07, DT-01-R2, UC-28-E1: ordinary write/edit/delete/move/shell on the root denied; the tool still writes. */
export async function ordinaryRouteDenied(t) {
  const child = await freshChild(t)
  await seed(child)
  await assertOrdinaryWritesDenied(child, skillFile(child, SAMPLE.name))
  await assertOrdinaryWritesDenied(child, path.join(child.dirs.root, CASE.other, LAYOUT.file))
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
}

/** EP-20-08, DT-01-R5, DT-01-R3: workers, side agents, look-alikes and nested dispatches are refused before I/O. */
export async function nonManagerRefused(t) {
  const child = await freshChild(t)
  await seed(child)
  const manager = child.current.live
  const worker = child.worker()
  const side = child.worker('fbtest-side-agent')
  // Same session id, different object: identity is the live agent, not a name.
  const lookalike = Object.freeze({ id: manager.id })
  for (const agent of [worker.live, side.live, lookalike, undefined]) await assertRefusedFor(child, agent)
  // A nested dispatch inside a worker turn: the receiving agent is the worker whatever the call says.
  await assertRefusedFor(child, worker.live, { extra: { parent: { agent: manager }, rootCallId: 'fbtest-root-call', ...HOSTILE.identityFlags } })
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
}

/** EP-20-09: widening attempts leave read-only effective and the tool confined to its own root. */
export async function wideningIneffective(t) {
  const child = await freshChild(t)
  await seed(child)
  const before = await tree(child.dirs.base)
  for (const op of OPS) {
    const args = { ...argsFor(op, SAMPLE.name, doc(SAMPLE.name, { body: CASE.revisedBody })), ...HOSTILE.escalation }
    assertFailure(await child.call(op, args), CODE.invalidArguments)
  }
  assert.deepEqual(await tree(child.dirs.base), before)
  assert.equal(child.root.get('sandboxPolicy').resolve().mode, CONTRACT.sandbox.readOnly)
  await assertOrdinaryWritesDenied(child, skillFile(child, SAMPLE.name))
  // Even with the session widened, the dedicated tool still writes only its own root by name.
  for (const mode of HOSTILE.widenedModes) {
    const policy = child.root.get('sandboxPolicy')
    const resolve = policy.resolve
    policy.resolve = () => ({ mode, workspaceRoot: child.dirs.base })
    try {
      await assertPathNamesRefused(child)
      const outside = await tree(child.dirs.outside)
      assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
      assert.deepEqual(await tree(child.dirs.outside), outside)
    } finally {
      policy.resolve = resolve
    }
  }
  assertNoApproval(child)
}

/** EP-20-10: a root, path, command or extra file in the input is refused; the schema takes only name/document. */
export async function extraInputRefused(t) {
  const child = await freshChild(t)
  await seed(child)
  for (const definition of Object.values(child.current.tools)) {
    const keys = Object.keys(definition.parameters?.properties ?? {})
    assert.deepEqual(keys.filter((key) => !CONTRACT.argumentKeys.includes(key)), [], definition.name + ' accepts more than a name and a document')
  }
  const before = await tree(child.dirs.base)
  for (const op of OPS) {
    for (const extra of HOSTILE.extraArguments) {
      const { value, calls } = await child.tracedCall(op, { ...argsFor(op, op === 'create' ? CASE.fresh : SAMPLE.name), ...extra })
      assertFailure(value, CODE.invalidArguments)
      assertNoWrites(calls, op + ' with ' + Object.keys(extra))
    }
  }
  assert.deepEqual(await tree(child.dirs.base), before)
}

// ---------------------------------------------------------------------------------------------
// BVA-12 and EP-21 names and paths
// ---------------------------------------------------------------------------------------------

/** One BVA-12 value: a valid name is accepted and loads natively under it; an invalid one is refused before any path use. */
export function nameBoundary([value, valid]) {
  return async (t) => {
    const child = await freshChild(t)
    if (valid) {
      assertCommitted(await child.call('create', { name: value, document: doc(value) }), value)
      await assertNativeLoadable(child, value)
      assert.deepEqual(await child.call('read', { name: value }), { ok: true, name: value, description: SAMPLE.description, body: SAMPLE.body })
      assertCommitted(await child.call('update', { name: value, document: doc(value, { body: CASE.revisedBody }) }), value)
      assert.equal((await child.load(value))?.content, CASE.revisedBody)
      assertCommitted(await child.call('remove', { name: value }), value)
      await assertAbsent(child, value)
      return
    }
    await seed(child)
    await assertNamesRefused(child, [value])
  }
}

/** Each name is refused by every named operation with invalid-name, before any filesystem call; nothing changes. */
async function assertNamesRefused(child, values) {
  const before = await tree(child.dirs.base)
  for (const value of values) {
    for (const op of NAMED_OPS) {
      const { value: result, calls } = await child.tracedCall(op, argsFor(op, value, doc(value)))
      assertFailure(result, CODE.invalidName, { field: FIELD.name })
      assertNoFilesystem(calls, `${op} ${JSON.stringify(value)}`)
    }
  }
  assert.deepEqual(await tree(child.dirs.base), before, 'a refused name changed bytes')
}

/** EP-21-02..05 partitions of path-shaped names. */
const PATH_NAMES = Object.freeze({
  absolute: HOSTILE.absoluteNames, traversal: HOSTILE.traversalNames, sibling: HOSTILE.siblingNames, alias: HOSTILE.aliasNames,
})
/** Sibling directories a prefix check would confuse with `skills` (EP-21-04's "skills*" fixture). */
const SIBLING_DIRECTORIES = Object.freeze(['skills-evil', 'skills2'])

/** Path-shaped names, with the sibling `skills*` directories in place so a prefix escape would show. */
async function assertPathNamesRefused(child, kinds = Object.keys(PATH_NAMES)) {
  for (const sibling of SIBLING_DIRECTORIES) await placeSkill(path.join(child.dirs.home, sibling), CASE.other, doc(CASE.other))
  await assertNamesRefused(child, kinds.flatMap((kind) => PATH_NAMES[kind]))
}

/** EP-21-02..05, UC-26-E2, DT-02-R11: path-shaped names are refused before any filesystem call. */
export function pathNamesRefused(...kinds) {
  return async (t) => {
    const child = await freshChild(t)
    await seed(child)
    await assertPathNamesRefused(child, kinds.length === 0 ? undefined : kinds)
  }
}

/**
 * EP-21-06/07, DT-04-R1/R2: an escaping symlink (file or directory). list/read/load refuse it
 * BEFORE reading the target; the marker appears nowhere; update/remove leave the target intact.
 */
export function escapingSymlink(kind) {
  return async (t) => {
    const child = await freshChild(t)
    await seed(child)
    const foreignDir = path.join(child.dirs.outside, FIXTURE.leak)
    await mkdir(foreignDir)
    const foreign = path.join(foreignDir, LAYOUT.file)
    await writeFile(foreign, skillDocument({ name: FIXTURE.leak, description: SAMPLE.description, body: FIXTURE.leakMarker }))
    if (kind === 'file') await placeSymlinkedSkill(child.dirs.root, FIXTURE.leak, foreign)
    else await placeSymlinkedDirectory(child.dirs.root, FIXTURE.leak, foreignDir)
    const foreignInodes = [inodeOf(await stat(foreign)), inodeOf(await stat(foreignDir))]
    const outsideBefore = await tree(child.dirs.outside)
    const link = path.join(child.dirs.root, FIXTURE.leak)

    const window = openTrace()
    const seen = []
    try {
      for (const op of ['list', 'reload']) seen.push(await child.call(op))
      seen.push(await child.call('read', { name: FIXTURE.leak }))
      seen.push(await child.catalog(), await child.load(FIXTURE.leak))
    } finally {
      window.stop()
    }
    assert.deepEqual(readsThrough(window.entries, link, foreignInodes).map((call) => `${call.op} ${call.path}`), [], 'the target was read')
    assert.doesNotMatch(JSON.stringify(seen), new RegExp(FIXTURE.leakMarker), 'the foreign marker reached a result or catalog')
    assert.equal(seen[2].ok, false, 'read of an escaping entry succeeded')
    assert.ok(names((await child.call('list')).skills).includes(SAMPLE.name), 'the valid skill stopped listing')

    for (const op of ['update', 'remove']) {
      const { calls } = await child.tracedCall(op, argsFor(op, FIXTURE.leak, doc(FIXTURE.leak, { body: CASE.revisedBody })))
      assert.deepEqual(escapingCalls(calls.filter((call) => call.write), child.dirs.root), [], op + ' wrote outside the root')
      assert.deepEqual(await tree(child.dirs.outside), outsideBefore, op + ' changed the link target')
    }
    await assertVisible(child, SAMPLE.name, SAMPLE.body)
  }
}

// ---------------------------------------------------------------------------------------------
// EP-21 / BVA-D / BVA-B document format
// ---------------------------------------------------------------------------------------------

/** The raw front matter for an invalid shape that skillDocument cannot build. */
const rawDocument = (frontmatter, body = SAMPLE.body) => [LAYOUT.frontmatter, frontmatter, LAYOUT.frontmatter, body].join('\n')

/** Invalid documents by partition: [label, document builder(name), field or undefined]. */
export const INVALID_DOCUMENTS = Object.freeze({
  frontmatter: Object.freeze([
    ['missing front matter', () => SAMPLE.body],
    ['no closing ---', (name) => [LAYOUT.frontmatter, `name: ${name}`, `description: ${SAMPLE.description}`, SAMPLE.body].join('\n')],
  ]),
  missingFields: Object.freeze([
    ['missing name', () => skillDocument({ description: SAMPLE.description, body: SAMPLE.body })],
    ['missing description', (name) => skillDocument({ name, body: SAMPLE.body })],
    ['non-string name', () => skillDocument({ name: CASE.nonString.number, description: SAMPLE.description, body: SAMPLE.body })],
    ['non-string description', (name) => skillDocument({ name, description: CASE.nonString.list, body: SAMPLE.body })],
  ]),
  mismatch: Object.freeze([['front-matter name differs', () => doc(FIXTURE.mismatchDocument)]]),
  disabled: Object.freeze([['disable-model-invocation: true', (name) => doc(name, { extra: { [KEYS.disableModel]: true } })]]),
  legacy: Object.freeze(KEYS.legacy.map((key) => [key, (name) => doc(name, { extra: { [key]: false } })])),
  blankDescription: Object.freeze([['whitespace-only description', (name) => doc(name, { description: CASE.description.space }), FIELD.description]]),
  emptyDescription: Object.freeze([['empty description', (name) => doc(name, { description: CASE.description.empty }), FIELD.description]]),
  emptyBody: Object.freeze([['empty body', (name) => doc(name, { body: CASE.body.empty }), FIELD.body]]),
  whitespaceBody: Object.freeze([['whitespace-only body', (name) => doc(name, { body: CASE.body.whitespace }), FIELD.body]]),
  encoding: Object.freeze([
    ['not valid UTF-8 (lone surrogate)', (name) => doc(name, { body: SAMPLE.body + HOSTILE.loneSurrogate })],
    ['unparseable YAML', () => rawDocument(HOSTILE.unparseableFrontmatter)],
  ]),
})

/**
 * Each invalid document: create (target absent) and update (target present) are refused with
 * invalid-document (and the named field), nothing is written and the prior version is byte-identical.
 */
export function invalidDocuments(...partitions) {
  return async (t) => {
    const child = await freshChild(t)
    const existing = await seed(child)
    for (const [label, build, field] of partitions.flatMap((partition) => INVALID_DOCUMENTS[partition])) {
      const before = await tree(child.dirs.base)
      const created = await child.call('create', { name: CASE.fresh, document: build(CASE.fresh) })
      assertFailure(created, CODE.invalidDocument, { field })
      const updated = await child.call('update', { name: SAMPLE.name, document: build(SAMPLE.name) })
      assertFailure(updated, CODE.invalidDocument, { field })
      assert.deepEqual(await tree(child.dirs.base), before, label + ' changed bytes')
      assert.equal(await fileText(child, SAMPLE.name), existing, label + ': the prior version changed')
    }
    assert.equal(await exists(path.join(child.dirs.root, CASE.fresh)), false)
    await assertVisible(child, SAMPLE.name, SAMPLE.body)
  }
}

/** EP-21-11 (second half): disable-model-invocation false is accepted and stays model-loadable. */
async function assertDisableFalseAccepted(child) {
  const name = CASE.fresh
  assertCommitted(await child.call('create', { name, document: doc(name, { extra: { [KEYS.disableModel]: false } }) }), name)
  const { isModelInvocable } = await loadSdk()
  assert.equal(isModelInvocable(await child.load(name)), true)
}

/** EP-21-11: true refused (both operations), absent or false accepted. */
export async function disableModelInvocation(t) {
  await invalidDocuments('disabled')(t)
  const child = await freshChild(t)
  await seed(child)
  await assertDisableFalseAccepted(child)
}

/**
 * An accepted content boundary: create commits and the native, tool and registry loads return
 * these values. `trimmed` compares descriptions after trimming (BVA-D-04: stored spacing unspecified).
 */
export function acceptedContent({ description = SAMPLE.description, body = SAMPLE.body, trimmed = false }) {
  const same = (actual, what) => trimmed ? assert.equal(actual?.trim(), description.trim(), what) : assert.equal(actual, description, what)
  return async (t) => {
    const child = await freshChild(t)
    assertCommitted(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { description, body }) }), SAMPLE.name)
    const native = await nativeSkill(child.dirs.root, SAMPLE.name)
    assert.ok(native, 'not native-loadable')
    same(native.description, 'native description')
    assert.equal(native.content, body)
    assert.equal(native.invocation.modelInvocable, true, 'an injected key changed the invocation policy')
    const read = await child.call('read', { name: SAMPLE.name })
    assert.equal(read.body, body)
    same(read.description, 'read description')
    assert.equal((await child.load(SAMPLE.name))?.content, body)
  }
}

/** EP-21-01: the S6 sample is accepted, the stored bytes load natively with the same fields, and the directory equals the name. */
export async function validBundle(t) {
  const child = await freshChild(t)
  assertCommitted(await child.call('create', { name: SAMPLE.name, document: doc() }), SAMPLE.name)
  const { skills } = await nativeLibrary(child.dirs.root)
  assert.deepEqual(skills.map((skill) => [skill.name, skill.description, skill.content, path.basename(path.dirname(skill.path))]), [[SAMPLE.name, SAMPLE.description, SAMPLE.body, SAMPLE.name]])
}

/** UC-26-E1: blank description or empty body → validation error naming the field, nothing written; a corrected retry succeeds. */
export async function correctedRetry(t) {
  await invalidDocuments('blankDescription', 'emptyBody')(t)
  const child = await freshChild(t)
  const before = await tree(child.dirs.base)
  assertFailure(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { description: CASE.description.space }) }), CODE.invalidDocument, { field: FIELD.description })
  assertFailure(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.body.empty }) }), CODE.invalidDocument, { field: FIELD.body })
  assert.deepEqual(await tree(child.dirs.base), before)
  assertCommitted(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { description: CASE.correctedDescription }) }), SAMPLE.name)
  await assertVisible(child, SAMPLE.name, SAMPLE.body, CASE.correctedDescription)
}

// ---------------------------------------------------------------------------------------------
// EP-21-17 / DT-04 bypass-produced states (Q1/Q2: only safety is asserted)
// ---------------------------------------------------------------------------------------------

/** Settle `promise` or, past the watchdog, release any FIFO reader and fail: the manager must stay usable. */
async function settles(promise, fifo, what) {
  let timer
  const watchdog = new Promise((resolve) => { timer = setTimeout(() => resolve(watchdog), CASE.fifoWatchdogMs) })
  const winner = await Promise.race([promise.then(() => undefined, () => undefined), watchdog])
  clearTimeout(timer)
  if (winner === watchdog) {
    // Non-blocking: if nobody is reading the FIFO the hang is elsewhere, and the case fails anyway.
    await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK).then((writer) => writer.close(), () => undefined)
    await promise.catch(() => undefined)
    assert.fail(what + ' hung on a non-regular SKILL.md')
  }
  return promise.catch((error) => ({ thrown: error }))
}

/** Bypass entries placed directly in the root (never through the tool). */
async function placeBypassEntries(child) {
  const { root, outside } = child.dirs
  await placeSkill(root, CASE.bypass.corrupt, CASE.bypass.garbage)
  await placeSkill(root, FIXTURE.mismatchDirectory, doc(FIXTURE.mismatchDocument))
  const fifoDir = path.join(root, CASE.bypass.fifo)
  await mkdir(fifoDir)
  const fifo = path.join(fifoDir, LAYOUT.file)
  await promisify(execFile)(CASE.mkfifo, [fifo])
  await mkdir(path.join(root, CASE.bypass.nonRegular, LAYOUT.file), { recursive: true })
  const hardTarget = path.join(outside, CASE.bypass.hardTarget)
  await writeFile(hardTarget, doc(CASE.bypass.hard))
  await mkdir(path.join(root, CASE.bypass.hard))
  await link(hardTarget, path.join(root, CASE.bypass.hard, LAYOUT.file))
  await writeFile(path.join(root, CASE.bypass.stray), FIXTURE.leakMarker)
  // Inside links point at a sacrificial skill: DT-04-R3 gives no oracle for a write through them.
  await symlink(path.join(root, CASE.renamed), path.join(root, CASE.bypass.alias))
  await placeSymlinkedSkill(root, CASE.bypass.fileLink, skillFile(child, CASE.renamed))
  return {
    fifo,
    entries: [CASE.bypass.corrupt, FIXTURE.mismatchDirectory, CASE.bypass.fifo, CASE.bypass.nonRegular, CASE.bypass.hard, CASE.bypass.alias, CASE.bypass.fileLink],
  }
}

/**
 * EP-21-17, DT-04-R3/R5: corrupt, mismatched, FIFO, directory-as-file, hardlinked and inside-alias
 * entries. Every operation on them settles; nothing outside the root is read by path or written; the
 * manager, the tool and the valid skill keep working. The entries' own results are not asserted.
 */
export async function bypassShapesSafe(t) {
  const child = await freshChild(t)
  await seed(child)
  await seed(child, CASE.renamed)
  const { fifo, entries } = await placeBypassEntries(child)
  const outsideBefore = await tree(child.dirs.outside)
  const window = openTrace()
  try {
    for (const op of ['list', 'reload']) await settles(child.call(op), fifo, op)
    await settles(child.catalog(), fifo, 'catalog')
    for (const name of entries) {
      for (const op of ['read', 'update', 'remove']) await settles(child.call(op, argsFor(op, name, doc(name, { body: CASE.revisedBody }))), fifo, `${op} ${name}`)
      await settles(child.load(name), fifo, 'load ' + name)
    }
  } finally {
    window.stop()
  }
  assert.deepEqual(escapingCalls(window.entries, child.dirs.root).map((call) => `${call.op} ${call.path} ${call.to ?? ''}`), [], 'a call left the root')
  assert.deepEqual(await tree(child.dirs.outside), outsideBefore, 'something outside the root was written')
  const listed = await child.call('list')
  assert.equal(listed.ok, true, 'list stopped working: ' + JSON.stringify(listed))
  assert.ok(names(listed.skills).includes(SAMPLE.name), 'another skill stopped listing')
  assert.equal((await child.load(SAMPLE.name))?.content, SAMPLE.body, 'another skill stopped loading')
  assertCommitted(await child.call('create', { name: CASE.other, document: doc(CASE.other) }), CASE.other)
}

/** DT-04-R4 (Q2): removing a <name>/ holding extra files touches nothing outside <root>/<name>/. */
export async function removeWithExtras(t) {
  const child = await freshChild(t)
  await seed(child)
  await seed(child, CASE.other)
  const dir = path.join(child.dirs.root, SAMPLE.name)
  await writeFile(path.join(dir, CASE.bypass.extra), FIXTURE.leakMarker)
  await mkdir(path.join(dir, CASE.bypass.extraDir))
  await writeFile(path.join(dir, CASE.bypass.extraDir, CASE.bypass.extra), FIXTURE.leakMarker)
  const outsideName = async () => Object.fromEntries(Object.entries(await tree(child.dirs.base)).filter(([relative]) => !within(path.relative(child.dirs.base, dir), relative)))
  const before = await outsideName()
  const { calls } = await child.tracedCall('remove', { name: SAMPLE.name })
  assert.deepEqual(calls.filter((call) => call.write && [call.path, call.to].some((target) => target !== undefined && !within(dir, target))).map((call) => `${call.op} ${call.path} ${call.to ?? ''}`), [], 'remove wrote outside <root>/<name>/')
  assert.deepEqual(await outsideName(), before, 'remove changed something outside <root>/<name>/')
  await assertVisible(child, CASE.other, SAMPLE.body)
}

// ---------------------------------------------------------------------------------------------
// EP-22 / DT-03 / ST-10 outcomes
// ---------------------------------------------------------------------------------------------

/** EP-22-06, UC-27-A3, DT-02-R5/R8: update/remove of an absent name → not-found; nothing created or changed. */
export async function mutateAbsentNotFound(t) {
  const child = await freshChild(t)
  await seed(child)
  const before = await tree(child.dirs.base)
  assertFailure(await child.call('update', { name: CASE.absent, document: doc(CASE.absent) }), CODE.notFound)
  assertFailure(await child.call('remove', { name: CASE.absent }), CODE.notFound)
  assert.deepEqual(await tree(child.dirs.base), before)
  await assertAbsent(child, CASE.absent)
}

/** EP-22-07, UC-27-A2, DT-02-R2: create of an existing name → conflict; existing bytes unchanged, no merge. */
export async function createConflict(t) {
  const child = await freshChild(t)
  const existing = await seed(child)
  const before = await tree(child.dirs.base)
  assertFailure(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), CODE.conflict)
  assert.deepEqual(await tree(child.dirs.base), before)
  assert.equal(await fileText(child, SAMPLE.name), existing)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
}

/** DT-02-R3: create with an invalid name or document is a validation error in every target state. */
export async function createInvalidAnyState(t) {
  const child = await freshChild(t)
  const checkBoth = async () => {
    const before = await tree(child.dirs.base)
    assertFailure(await child.call('create', { name: HOSTILE.traversalNames[0], document: doc(HOSTILE.traversalNames[0]) }), CODE.invalidName, { field: FIELD.name })
    assertFailure(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.body.empty }) }), CODE.invalidDocument, { field: FIELD.body })
    assert.deepEqual(await tree(child.dirs.base), before)
  }
  await checkBoth()
  await seed(child)
  await checkBoth()
  assert.equal((await child.call('read', { name: SAMPLE.name })).body, SAMPLE.body)
}

/** DT-02-R6: update with an invalid document leaves the old version byte-identical. */
export const updateInvalidKeepsOld = invalidDocuments('frontmatter', 'emptyBody', 'blankDescription', 'mismatch')

/** Make `dir` refuse new entries for the duration of `fn` (a pre-commit permission fault). */
async function withReadOnlyDirectory(dir, fn) {
  await chmod(dir, HARNESS.mode.noWrite)
  try {
    return await fn()
  } finally {
    await chmod(dir, HARNESS.mode.owner)
  }
}

/**
 * EP-22-02, UC-28-M, DT-09-R6, DT-03-R1, ST-10-T1, UC-27-E2: an update hits a permission fault
 * before commit. The result is not committed; the old version stays byte-identical and loadable;
 * no catalog-change claim and no approval; a retry after the fault succeeds.
 */
export async function updatePreCommitFault(t) {
  const child = await freshChild(t)
  const old = await seed(child)
  const before = await tree(child.dirs.base)
  const result = await withReadOnlyDirectory(path.join(child.dirs.root, SAMPLE.name), () => child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }))
  assertFailure(result, CODE.writeFailed)
  assert.equal(result.skills, undefined, 'a failed update reported a catalog')
  assert.deepEqual(await tree(child.dirs.base), before, 'the failed update left bytes behind')
  assert.equal(await fileText(child, SAMPLE.name), old)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
  await assertNativeLoadable(child, SAMPLE.name)
  assertNoApproval(child)
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
}

/** UC-28-A1, ST-10-T2: a create hits a fault before commit; no partial or loadable skill; a later create is not blocked. */
export async function createPreCommitFault(t) {
  const child = await freshChild(t)
  await seed(child, CASE.other)
  const before = await tree(child.dirs.base)
  const result = await withReadOnlyDirectory(child.dirs.root, () => child.call('create', { name: SAMPLE.name, document: doc() }))
  assertFailure(result, CODE.writeFailed)
  assert.deepEqual(await tree(child.dirs.base), before, 'a partial skill or leftover remains')
  assert.deepEqual((await nativeLibrary(child.dirs.root)).skills.map((skill) => skill.name), [CASE.other])
  await assertAbsent(child, SAMPLE.name)
  assertCommitted(await child.call('create', { name: SAMPLE.name, document: doc() }), SAMPLE.name)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
}

/**
 * EP-22-04, DT-09-R7, DT-03-R3/R5, UC-28-A2, ST-10-T3/T4/T5: the write commits and the catalog
 * read-back fails. The outcome is a distinct committed refresh-failed result. The file is complete
 * and new. A reload that fails again is reported truthfully. A reload after recovery converges, and a
 * retried create gets a conflict, not a duplicate.
 */
export async function refreshFailure(t) {
  const child = await freshChild(t)
  await seed(child)
  const fault = child.installFault()
  for (const mode of [HARNESS.faultMode.incomplete, HARNESS.faultMode.throws]) {
    fault.mode = mode
    const updated = doc(SAMPLE.name, { body: mode + CASE.revisedBody })
    const result = await child.call('update', { name: SAMPLE.name, document: updated })
    assertFailure(result, CODE.refreshFailed, { committed: true })
    assert.equal(result.name, SAMPLE.name)
    assert.equal(result.cause, CONTRACT.catalogCause.otherSource, 'the incomplete source is not named')
    assert.equal(await fileText(child, SAMPLE.name), updated, 'the committed file is not the complete new version')
    await assertNativeLoadable(child, SAMPLE.name, { body: mode + CASE.revisedBody })
    const again = await child.call('reload')
    assert.notEqual(again.ok, true, 'a reload over an incomplete catalog reported success')
    assert.equal(await fileText(child, SAMPLE.name), updated, 'the failed reload changed the file')
  }
  const created = doc(CASE.fresh)
  assertFailure(await child.call('create', { name: CASE.fresh, document: created }), CODE.refreshFailed, { committed: true })
  fault.mode = HARNESS.faultMode.ok
  const reload = await child.call('reload')
  assert.equal(reload.ok, true, JSON.stringify(reload))
  assert.deepEqual(names(reload.skills), [CASE.fresh, SAMPLE.name].sort())
  assert.equal((await child.load(SAMPLE.name))?.content, HARNESS.faultMode.throws + CASE.revisedBody)
  assertFailure(await child.call('create', { name: CASE.fresh, document: created }), CODE.conflict)
  assert.equal(await fileText(child, CASE.fresh), created)
  assert.deepEqual(names((await child.call('list')).skills), [CASE.fresh, SAMPLE.name].sort())
}

/** ST-11-T6: an incomplete discovery (both SDK shapes: none published, or partial) is never a successful reload. */
export async function incompleteNeverSuccess(t) {
  const child = await freshChild(t)
  await seed(child)
  const fault = child.installFault()
  for (const mode of [HARNESS.faultMode.incomplete, HARNESS.faultMode.throws]) {
    fault.mode = mode
    const reload = await child.call('reload')
    assertFailure(reload, CODE.catalogIncomplete)
    assert.equal(reload.cause, CONTRACT.catalogCause.otherSource, 'the incomplete source is not named')
    const created = await child.call('create', { name: mode, document: doc(mode) })
    assert.notEqual(created.ok, true, 'a create over an incomplete catalog reported plain success')
  }
}

/**
 * Sweep one mutation with an abort at every filesystem step (and before the first). After each, the
 * state is the whole old or the whole new document; `committed` matches it; a success implies the
 * new state; and a later read/list reports the state that exists (DT-03-R4: no silent rollback).
 */
async function cancellationSweep(child, op) {
  const control = op === 'create' ? CASE.fresh : SAMPLE.name
  if (op === 'update') await seed(child, control)
  const steps = (await child.tracedCall(op, argsFor(op, control, doc(control, { body: CASE.revisedBody })))).calls.length
  assert.ok(steps > 0, 'fixture: the mutation made no filesystem call')
  for (let step = 0; step <= steps + 1; step++) {
    const name = `cancel-${op}-${step}`
    const old = op === 'update' ? await seed(child, name) : undefined
    const next = doc(name, { body: CASE.revisedBody })
    const controller = new AbortController()
    if (step === 0) controller.abort()
    let seen = 0
    const window = openTrace({ onCall: () => { if (++seen === step) controller.abort() } })
    let result
    try {
      result = await child.call(op, { name, document: next }, { signal: controller.signal })
    } finally {
      window.stop()
    }
    const file = skillFile(child, name)
    const state = (await exists(file)) ? await readFile(file, 'utf8') : undefined
    assert.ok([old, next].includes(state), `step ${step}: torn or mixed state ${JSON.stringify(state)}`)
    const isNew = state === next
    assert.equal(result.committed, isNew, `step ${step}: result ${JSON.stringify(result)} does not match the ${isNew ? 'new' : 'old'} state`)
    if (result.ok) assert.ok(isNew, `step ${step}: success without the new state`)
    if (!result.ok && !result.committed) assert.ok([CODE.cancelled, CODE.writeFailed, CODE.failed].includes(result.code), `step ${step}: ${result.code}`)
    const read = await child.call('read', { name })
    if (state === undefined) assertFailure(read, CODE.notFound)
    else assert.equal(read.body, isNew ? CASE.revisedBody : SAMPLE.body, `step ${step}: a later read reports another state`)
    if (state === undefined) assertCommitted(await child.call('create', { name, document: next }), name)
    assert.deepEqual(Object.keys(await tree(path.join(child.dirs.root, name))), [LAYOUT.file], `step ${step}: leftover entries`)
    // Keep the library the same size each step, so step k means the same filesystem call each time.
    assertCommitted(await child.call('remove', { name }), name)
  }
}

/** EP-22-03, UC-28-A3, ST-10-T6, DT-03-R4: cancellation at every step of create and update is truthful and whole. */
export async function cancellationTruthful(t) {
  const child = await freshChild(t)
  for (const op of ['create', 'update']) await cancellationSweep(child, op)
}

/** Two concurrent same-name attempts, several rounds: one complete winner; each result truthful (Q5). */
async function concurrentSameName(child, op) {
  for (let round = 0; round < CASE.concurrencyRounds; round++) {
    const name = `race-${op}-${round}`
    if (op === 'update') await seed(child, name)
    const documents = [doc(name, { body: SAMPLE.body + ' A' }), doc(name, { body: SAMPLE.body + ' B' })]
    const results = await Promise.all(documents.map((document) => child.call(op, { name, document })))
    const final = await readFile(skillFile(child, name), 'utf8')
    assert.ok(documents.includes(final), `round ${round}: torn or mixed SKILL.md`)
    results.forEach((result, index) => {
      assert.equal(typeof result.ok, 'boolean', 'an attempt did not settle to a result')
      if (!result.committed) assert.notEqual(final, documents[index], `round ${round}: a "not committed" write is the final state`)
    })
    const winners = results.filter((result) => result.committed)
    if (op === 'create') {
      assert.equal(winners.length, 1, `round ${round}: create overwrote: ${JSON.stringify(results)}`)
      assertFailure(results.find((result) => !result.committed), CODE.conflict)
    }
    assert.ok(winners.length >= 1, `round ${round}: no attempt committed`)
    assert.deepEqual(Object.keys(await tree(path.join(child.dirs.root, name))), [LAYOUT.file], `round ${round}: leftover entries`)
  }
}

/** ST-10-T7, UC-28-E2: concurrent creates and updates on one name. */
export async function concurrencyOneWinner(t) {
  const child = await freshChild(t)
  for (const op of ['create', 'update']) await concurrentSameName(child, op)
}

/** ST-10-X1: none of the forbidden states arises across faults, cancellation and races; nothing outside mutates. */
export async function forbiddenStatesAbsent(t) {
  const child = await freshChild(t)
  const outsideBefore = await tree(child.dirs.outside)
  const homeSiblings = async () => Object.keys(await tree(child.dirs.home)).filter((relative) => !within(LAYOUT.root, relative))
  const siblingsBefore = await homeSiblings()
  await cancellationSweep(child, 'update')
  await concurrentSameName(child, 'update')
  await withReadOnlyDirectory(path.join(child.dirs.root, SAMPLE.name), async () => {
    assertFailure(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.thirdBody }) }), CODE.writeFailed)
  })
  const { skills } = await nativeLibrary(child.dirs.root)
  for (const skill of skills) assert.ok([SAMPLE.body, CASE.revisedBody, SAMPLE.body + ' A', SAMPLE.body + ' B'].includes(skill.content), 'a mixed body was published: ' + skill.name)
  assert.deepEqual(await tree(child.dirs.outside), outsideBefore)
  assert.deepEqual(await homeSiblings(), siblingsBefore)
}

/** EP-22-05, DT-09-R8: sensitive, duplicate and contradictory content is not policed; writes stay confined and complete. */
export async function semanticNotPoliced(t) {
  const child = await freshChild(t)
  const outsideBefore = await tree(child.dirs.outside)
  assertCommitted(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: HOSTILE.secretBody }) }), SAMPLE.name)
  assertCommitted(await child.call('create', { name: CASE.other, document: doc(CASE.other, { body: HOSTILE.secretBody }) }), CASE.other)
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
  await assertNativeLoadable(child, SAMPLE.name, { body: CASE.revisedBody })
  await assertNativeLoadable(child, CASE.other, { body: HOSTILE.secretBody })
  assert.deepEqual(Object.keys(await tree(child.dirs.home)).filter((relative) => !within(LAYOUT.root, relative)), [])
  assert.deepEqual(await tree(child.dirs.outside), outsideBefore)
  assertNoApproval(child)
}

/** UC-26-A2: with no create call, nothing writes the library (no autonomous writer) and nothing claims success. */
export async function noCallNoChange(t) {
  const child = await freshChild(t)
  await seed(child)
  const before = await tree(child.dirs.base)
  await child.call('list')
  await child.call('reload')
  await child.current.dispose()
  await child.mount()
  assert.deepEqual(await tree(child.dirs.base), before)
  assert.deepEqual(child.approvals, [])
}

/** UC-27-A1: rename = create new + remove old; each reports its own outcome; no atomic-rename claim. */
export async function renameTwoSteps(t) {
  const child = await freshChild(t)
  await seed(child)
  const createArgs = { name: CASE.renamed, document: doc(CASE.renamed) }
  const created = await child.call('create', createArgs)
  assertCommitted(created, CASE.renamed)
  const removeArgs = { name: SAMPLE.name }
  const removed = await child.call('remove', removeArgs)
  assertCommitted(removed, SAMPLE.name)
  for (const [op, args, result] of [['create', createArgs, created], ['remove', removeArgs, removed]]) assert.doesNotMatch(resultText(child, op, args, result), CASE.renameClaim)
  assert.deepEqual(names((await child.call('list')).skills), [CASE.renamed])
  await assertAbsent(child, SAMPLE.name)
  await assertVisible(child, CASE.renamed, SAMPLE.body)
}

// ---------------------------------------------------------------------------------------------
// BVA-C catalog size
// ---------------------------------------------------------------------------------------------

/** BVA-C-01: absent root and present-but-empty root both list and reload an empty complete catalog. */
export async function emptyLibrary(t) {
  const child = await freshChild(t)
  for (const state of ['absent', 'empty']) {
    if (state === 'empty') await mkdir(child.dirs.root, { recursive: true })
    assert.deepEqual(await child.call('list'), { ok: true, skills: [] }, state)
    assert.deepEqual(await child.call('reload'), { ok: true, skills: [] }, state)
  }
}

/** BVA-C-02: one skill lists exactly; after removing it, list returns 0. */
export async function oneThenZero(t) {
  const child = await freshChild(t)
  await seed(child)
  assert.deepEqual(await child.call('list'), { ok: true, skills: [{ name: SAMPLE.name, description: SAMPLE.description }] })
  assertCommitted(await child.call('remove', { name: SAMPLE.name }), SAMPLE.name)
  assert.deepEqual(await child.call('list'), { ok: true, skills: [] })
}

// ---------------------------------------------------------------------------------------------
// ST-09 / ST-11 / ST-12 lifecycle
// ---------------------------------------------------------------------------------------------

/** ST-09-T5: after remove, a create of the same name loads the new body, not the removed one. */
export async function recreateAfterRemove(t) {
  const child = await freshChild(t)
  await seed(child)
  assertCommitted(await child.call('remove', { name: SAMPLE.name }), SAMPLE.name)
  await seed(child, SAMPLE.name, { body: CASE.thirdBody })
  await assertVisible(child, SAMPLE.name, CASE.thirdBody)
}

/** ST-09-X1: update/remove while Absent → not-found, stays Absent; create while Visible → conflict, stays Visible. */
export async function invalidTransitions(t) {
  const child = await freshChild(t)
  assertFailure(await child.call('update', { name: SAMPLE.name, document: doc() }), CODE.notFound)
  assertFailure(await child.call('remove', { name: SAMPLE.name }), CODE.notFound)
  await assertAbsent(child, SAMPLE.name)
  await seed(child)
  assertFailure(await child.call('create', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), CODE.conflict)
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
}

/** Every dedicated tool appears exactly once for the manager and not at all for a worker or the global view. */
function assertToolsOnce(child, live) {
  assert.deepEqual(child.toolOccurrences(live), Object.fromEntries(TOOL_NAMES.map((name) => [name, 1])))
  assert.deepEqual(child.visibleTools(child.worker().live), [])
  assert.deepEqual(child.visibleTools(undefined), [])
}

/** The S4 private-skills prompt sections a scope's assembled system prompt holds. */
async function privateSections(child, scope) {
  return (await child.promptSections(scope)).filter((section) => section.name === CONTRACT.section.name)
}

/**
 * S4 (with S2, decision 2): the manager scope has exactly one private-skills section. Its text says
 * the private_skill_* tools are the one exception to read-only, and that a worker gets text, not a
 * name. No worker scope and no global view has the section.
 */
async function assertPromptSection(child, live = child.current.live) {
  const sections = await privateSections(child, live)
  assert.equal(sections.length, 1, 'the manager prompt does not hold exactly one private-skills section')
  const { text } = sections[0]
  for (const [label, pattern] of Object.entries(CONTRACT.section).filter(([key]) => key !== 'name')) {
    assert.match(text, pattern, `the section text lacks "${label}": ${text}`)
  }
  for (const scope of [child.worker().live, child.worker(HARNESS.workerIds.session).live, null]) {
    assert.deepEqual(await privateSections(child, scope), [], 'a worker or the global prompt holds the private-skills section')
  }
}

/** Every operation as the not-yet-published manager is refused before I/O, with nothing leaked. */
async function assertUnpublishedRefused(child) {
  assert.equal(child.manager.sessionId(), undefined, 'fixture: the id is already published')
  await assertRefusedFor(child, child.current.live)
}

/**
 * The production first-create / cold-resume path (X1/X2): `manager.sessionId()` is undefined while
 * the setup runs and is published afterwards. The provider, the tools and the section are mounted.
 * Before publication every tool answers not-manager. After it, every tool works.
 */
async function assertDeferredPublication(child, expected) {
  await child.current.dispose()
  const generation = await child.mount({ publish: HARNESS.publish.never })
  assertToolsOnce(child, generation.live)
  assert.equal((await privateSections(child, generation.live)).length, 1, 'the section was not mounted before publication')
  await assertUnpublishedRefused(child)
  generation.publish()
  assert.equal(child.manager.sessionId(), generation.live.id)
  await assertProviderOnce(child, expected)
  await assertPromptSection(child, generation.live)
  for (const [op, , result] of await allOperations(child, SAMPLE.name)) assert.equal(result.ok, true, `${op} after publication: ${JSON.stringify(result)}`)
}

/** The private catalog holds each skill exactly once (no duplicate provider). */
async function assertProviderOnce(child, expected) {
  const entries = privateEntries(await child.catalog())
  assert.deepEqual(names(entries), [...expected].sort())
  const listed = await child.call('list')
  assert.deepEqual(names(listed.skills), [...expected].sort())
}

/**
 * ST-09-T2, UC-LIFE-M, ST-12-T3: a manager resume (new generation) and a child restart (dispose,
 * then boot over the same home) re-register exactly once for the manager only. Earlier skills list
 * and load unchanged, and the worker and global catalogs still lack them.
 */
export async function restartKeepsLibrary(t) {
  let child = await freshChild(t)
  await seed(child)
  await seed(child, CASE.other)
  const before = await tree(child.dirs.root)
  // 'cold' is the production path: a restarted child whose manager id is published only after setup.
  for (const step of ['resume', 'restart', 'cold']) {
    if (step === 'resume') {
      await child.current.dispose()
      await child.mount()
    } else child = await child.restart()
    if (step === 'cold') {
      await child.current.dispose()
      await child.mount({ publish: HARNESS.publish.never })
      await assertUnpublishedRefused(child)
      child.current.publish()
    }
    assert.equal(child.setups.length, 1, step + ': the setup was registered more than once')
    assertToolsOnce(child, child.current.live)
    await assertProviderOnce(child, [SAMPLE.name, CASE.other])
    await assertVisible(child, SAMPLE.name, SAMPLE.body)
    assert.equal((await privateSections(child, child.current.live)).length, 1, step + ': the section is not there exactly once')
    assert.deepEqual(privateEntries(await child.catalog(child.worker().live)), [])
    assert.deepEqual(privateEntries(await child.catalog(null)), [])
    assert.deepEqual(await tree(child.dirs.root), before, step + ' changed the library')
  }
}

/**
 * ST-12-T1: setup registers the six tools, the provider and the S4 section for the singleton manager
 * scope only. That includes the first-create path, where the id is published after setup, and a
 * generation that is not the singleton manager, which gets nothing.
 */
export async function setupManagerOnly(t) {
  const child = await freshChild(t)
  await seed(child)
  assert.deepEqual(child.setups.map((setup) => setup.pluginId), [CONTRACT.pluginId])
  assertToolsOnce(child, child.current.live)
  assert.deepEqual(names(privateEntries(await child.catalog())), [SAMPLE.name])
  assert.deepEqual(privateEntries(await child.catalog(null)), [])
  await assertPromptSection(child)
  await assertDeferredPublication(child, [SAMPLE.name])
  // A generation whose live agent is not the singleton manager session gains no capability.
  await child.current.dispose()
  // Whether such a setup refuses by throwing is not specified, so only the capability is asserted.
  await child.mount({ id: HARNESS.workerIds.session, sessionId: HARNESS.sessionId }).catch(() => undefined)
  const stranger = child.current
  assert.deepEqual(privateEntries(await child.catalog(stranger.live)), [], 'a non-singleton scope got the private provider')
  assert.deepEqual(await privateSections(child, stranger.live), [], 'a non-singleton scope got the private-skills section')
  for (const op of OPS) {
    const definition = stranger.tools?.[CONTRACT.tool[op]]
    if (definition === undefined) continue
    const result = await definition.execute(argsFor(op, op === 'create' ? CASE.fresh : SAMPLE.name), { agent: stranger.live, signal: new AbortController().signal })
    assertFailure(result, CODE.notManager)
  }
}

/** ST-12-T2: after disposal the registration is released and stale-generation calls cannot list or mutate. */
export async function disposalFences(t) {
  const child = await freshChild(t)
  await seed(child)
  const stale = child.current
  assert.equal((await privateSections(child, stale.live)).length, 1, 'fixture: the section is mounted')
  await stale.dispose()
  assert.deepEqual(privateEntries(await child.catalog(stale.live)), [], 'the provider outlived its generation')
  assert.deepEqual(child.visibleTools(stale.live), [], 'the tools outlived their generation')
  assert.deepEqual(await privateSections(child, stale.live), [], 'the section outlived its generation')
  await assertRefusedFor(child, stale.live, { generation: stale })
  await child.mount()
  await assertRefusedFor(child, stale.live, { generation: stale })
  await assertVisible(child, SAMPLE.name, SAMPLE.body)
}

/** ST-11-T3: no watcher; a bypass edit appears after an explicit reload; the bypass safety rules still apply. */
export async function watcherOffBypass(t) {
  const child = await freshChild(t)
  await seed(child)
  const window = openTrace()
  try {
    await child.current.dispose()
    await child.mount()
    await child.call('list')
    await placeSkill(child.dirs.root, CASE.other, doc(CASE.other))
    await writeFile(path.join(child.dirs.outside, LAYOUT.file), skillDocument({ name: FIXTURE.leak, description: SAMPLE.description, body: FIXTURE.leakMarker }))
    await placeSymlinkedSkill(child.dirs.root, FIXTURE.leak, path.join(child.dirs.outside, LAYOUT.file))
    const reload = await child.call('reload')
    assert.ok(names(reload.skills).includes(CASE.other), 'the bypass edit is not visible after an explicit reload')
    assert.doesNotMatch(JSON.stringify([reload, await child.catalog(), await child.load(FIXTURE.leak)]), new RegExp(FIXTURE.leakMarker))
  } finally {
    window.stop()
  }
  assert.deepEqual(window.entries.filter((call) => call.op === 'watch' || call.op === 'watchFile').map((call) => call.path), [], 'a host watcher was started')
}

/**
 * ST-11-T4: an in-flight request keeps its inputs, and invalidation schedules no wake or turn. A
 * catalog observed before the mutation is not changed, and the manager facade is never asked for
 * anything beyond its session identity and setup registration.
 */
export async function noWakeOnInvalidate(t) {
  const child = await freshChild(t)
  await seed(child)
  const inflight = await child.catalog()
  const frozen = JSON.stringify(inflight)
  child.managerReads.length = 0
  await seed(child, CASE.other)
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { body: CASE.revisedBody }) }), SAMPLE.name)
  await child.call('reload')
  assert.equal(JSON.stringify(inflight), frozen, 'an in-flight catalog was mutated')
  assert.deepEqual([...new Set(child.managerReads)].filter((key) => key !== 'sessionId'), [], 'the mutation reached for a manager wake or turn')
}

/**
 * ST-11-T5, UC-UI-M: no approval for any of the six operations; no result claims a menu refresh.
 * Samuel never has to view or approve anything because the manager's own prompt (S4) carries the
 * rule: these tools are the one exception to read-only, and workers get text, not names.
 */
export async function noUiObligation(t) {
  const child = await freshChild(t)
  await seed(child)
  await assertPromptSection(child)
  for (const [op, args, result] of await allOperations(child, SAMPLE.name)) {
    assert.equal(result.ok, true, op + ': ' + JSON.stringify(result))
    assertNoClaims(child, op, args, result)
  }
  assertNoApproval(child)
}

/** ST-11-T1: after a successful mutation the next list/load and the next model-step catalog reflect it, with no restart. */
export async function nextCallFresh(t) {
  const child = await freshChild(t)
  await child.catalog()
  await seed(child)
  assert.ok(names((await child.catalog()).skills).includes(SAMPLE.name))
  assertCommitted(await child.call('update', { name: SAMPLE.name, document: doc(SAMPLE.name, { description: CASE.correctedDescription }) }), SAMPLE.name)
  assert.equal((await child.catalog()).skills.find((skill) => skill.name === SAMPLE.name)?.description, CASE.correctedDescription)
  assertCommitted(await child.call('remove', { name: SAMPLE.name }), SAMPLE.name)
  assert.deepEqual(privateEntries(await child.catalog()), [])
  assert.equal(await child.load(SAMPLE.name), undefined)
}

/** DT-09-R4: ordinary writes and outside targets are refused, nothing outside mutates, no bypass. */
export async function ordinaryOrOutsideRefused(t) {
  await ordinaryRouteDenied(t)
  await pathNamesRefused()(t)
  await escapingSymlink('dir')(t)
}

/** Run several scenarios for one case whose oracle spans them (each on its own fixture). */
export function all(...scenarios) {
  return async (t) => {
    for (const scenario of scenarios) await scenario(t)
  }
}
