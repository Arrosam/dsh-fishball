/**
 * R-SHARED black-box cases: PLAT-EP-07 static rows (TQ-R5 decided B, `fc19e02`) and HOST-EP-03
 * rows 1–2. Requirements R-ARCH-08 and R-BND-01. Technique: EP (both cases are equivalence-partition
 * cases; each test name carries the case id, its row and the partition it checks).
 *
 * Level: unit (static analysis of manifests, packed listings and import specifiers). Row 8 (module
 * trace of a running hosted setup), row 9 (standalone install) and every row whose package a later
 * task creates are `todo`, naming that task. Each SDK entry file registers the same cases with its
 * own SDK in the name: the static rows read no SDK code; DSH's own bundle inspection (row 4) does.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../support/constants.mjs'
import {
  BUNDLED_FIELDS, DEP_FIELDS, DSH_FIELD, DSH_SIDE, EMBED_CONNECTOR_ALLOWED, FEATURES, JS_FILE, LATER, NPM, ROOT_WORKSPACE,
  RUNTIME_DEP_FIELD, SDK, SET_SIDE, SHARED_READER, V3, V3_NAMES,
} from './constants.mjs'
import { manifestNames, npmTempRoot, observe, readManifest } from './packages.mjs'

const NODE_MODULES_DIR = 'node_modules/'
const has = (pkg) => readManifest(pkg.dir) !== null
const edgesTo = (unit, name) => (unit?.refs ?? []).filter((r) => r.target === name)
const describeRef = (r) => `${r.file}: ${r.kind} ${JSON.stringify(r.specifier)}`
const unitOf = async (name) => (await observe()).units.get(name)
const manifestEdges = (manifest, names) => manifestNames(manifest, [...DEP_FIELDS, ...BUNDLED_FIELDS]).filter((e) => names.includes(e.name))

/**
 * One case per test, named "<case id> row <n> [SDK x] <partition>"; `todo` names the owning task.
 * A part that does not start with a digit (a use-case flow such as "main 2" or "A4") is used as it is.
 */
export function caseName(sdk, id, row, title) {
  const part = /^\d/.test(String(row)) ? 'row ' + row : row
  return `${id} ${part} [SDK ${sdk}] ${title}`
}
export function caseTest(sdk, id, row, title, fn, todo) {
  const name = caseName(sdk, id, row, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, fn)
}

/** A package that does not import the given set (code or manifest). */
async function assertNoEdges(from, names) {
  const unit = await unitOf(from)
  assert.ok(unit, from + ' is not packed')
  const code = unit.refs.filter((r) => names.includes(r.target)).map(describeRef)
  const manifest = manifestEdges(unit.manifest, names).map((e) => `package.json ${e.field}: ${e.name}`)
  assert.deepEqual([...code, ...manifest], [], `${from} reaches ${names.join(', ')}`)
}

/** DSH's own path inspection (the Plugins page's "add" check) on the installed SDK, offline, against a throwaway profile. */
export async function dshInspect(sdk, dir) {
  const { PluginManager } = await import(pathToFileURL(path.join(SDK.versionsDir, sdk, SDK.managerEntry)).href)
  const scratch = await mkdtemp(path.join(npmTempRoot(), SDK.inspect.tempPrefix))
  try {
    fs.writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ name: 'fbtest-inspect-profile', dependencies: {} }))
    fs.writeFileSync(path.join(scratch, 'anchor.json'), JSON.stringify({ dependencies: {} }))
    // Only the fields inspect() reads for a local path; registries are answered empty, so nothing is fetched.
    const self = { profile: { dir: scratch, installAnchor: path.join(scratch, 'anchor.json') }, registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) }
    return await PluginManager.prototype.inspect.call(self, dir)
  } finally {
    if (path.dirname(scratch) !== path.resolve(NPM.tempRoot) || !path.basename(scratch).startsWith(SDK.inspect.tempPrefix)) throw new Error('unexpected temp dir ' + scratch)
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * Which V3 packages use each fishball-shared module: a package uses a module it imports, and every
 * module that one imports inside the library (an `index.js` re-exporting `files.js` makes both used).
 */
function sharedUsage(units) {
  const shared = units.get(V3.shared.name)
  const internal = new Map()
  for (const r of shared.refs) if (r.target === undefined && r.sharedModule !== undefined) internal.set(r.file, [...(internal.get(r.file) ?? []), r.sharedModule])
  const closure = (start) => {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) for (const next of internal.get(queue.shift()) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
    return seen
  }
  const usage = new Map()
  for (const unit of units.values()) {
    if (unit.name === V3.shared.name) continue
    for (const r of edgesTo(unit, V3.shared.name)) {
      if (r.sharedModule === undefined) continue
      for (const m of closure(r.sharedModule)) usage.set(m, new Set([...(usage.get(m) ?? []), unit.name]))
    }
  }
  return usage
}

export function registerSharedCases(sdk) {
  // ---- PLAT-EP-07 row 4: the library is not a plugin ----
  caseTest(sdk, 'PLAT-EP-07', 4, 'fishball-shared exists in packages/shared and is a root workspace', () => {
    const manifest = readManifest(V3.shared.dir)
    assert.ok(manifest, 'packages/shared/package.json is missing')
    assert.equal(manifest.name, V3.shared.name)
    assert.ok(readManifest(REPO).workspaces?.includes(ROOT_WORKSPACE), 'root workspaces lack ' + ROOT_WORKSPACE)
  })
  caseTest(sdk, 'PLAT-EP-07', 4, 'fishball-shared manifest has no dsh field (no bundle, row, client or service)', () => {
    const manifest = readManifest(V3.shared.dir)
    assert.ok(manifest, 'packages/shared/package.json is missing')
    assert.equal(Object.hasOwn(manifest, DSH_FIELD), false, 'dsh field present: ' + JSON.stringify(manifest[DSH_FIELD]))
  })
  caseTest(sdk, 'PLAT-EP-07', 4, "DSH's own bundle inspection refuses fishball-shared as not-a-bundle", async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const answer = await dshInspect(sdk, V3.shared.dir)
    assert.equal(answer.status, SDK.inspect.refused, JSON.stringify(answer))
    assert.equal(answer.problem, SDK.inspect.notABundle, JSON.stringify(answer))
  })
  caseTest(sdk, 'PLAT-EP-07', 4, 'fishball-shared is not listed on any Plugins page of a started DSH', null, LATER.pluginsPage)

  // ---- rows 3 and 7b: no edge out of the library ----
  caseTest(sdk, 'PLAT-EP-07', '3/7b', 'fishball-shared code imports no other V3 package and leaves its own folder by no path', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const unit = await unitOf(V3.shared.name)
    assert.deepEqual(unit.parseErrors, [], 'unparsed shipped files')
    assert.deepEqual(unit.refs.filter((r) => r.target !== undefined || r.outside).map(describeRef), [])
  })
  caseTest(sdk, 'PLAT-EP-07', '3/7b', 'fishball-shared manifest names no V3 package in any dependency field', () => {
    const manifest = readManifest(V3.shared.dir)
    assert.ok(manifest, 'packages/shared/package.json is missing')
    assert.deepEqual(manifestEdges(manifest, V3_NAMES.filter((n) => n !== V3.shared.name)), [])
  })

  // ---- rows 1 and 2 (= HOST-EP-03 row 1): core and the instance never reach each other ----
  caseTest(sdk, 'PLAT-EP-07', 1, 'fishball-instance (and any bundle it ships) imports or depends on fishball-core: never', async () => {
    await assertNoEdges(V3.instance.name, [V3.core.name])
  })
  caseTest(sdk, 'PLAT-EP-07', 2, 'fishball-core imports or depends on fishball-instance: never', async () => {
    await assertNoEdges(V3.core.name, [V3.instance.name])
  }, has(V3.core) ? undefined : LATER.core)
  caseTest(sdk, 'HOST-EP-03', 1, 'neither core nor the instance imports the other; both import fishball-shared', async () => {
    for (const [from, to] of [[V3.core.name, V3.instance.name], [V3.instance.name, V3.core.name]]) await assertNoEdges(from, [to])
    for (const name of [V3.core.name, V3.instance.name]) assert.ok(edgesTo(await unitOf(name), V3.shared.name).length > 0, name + ' imports nothing from fishball-shared')
  }, has(V3.core) ? undefined : LATER.core)
  caseTest(sdk, 'HOST-EP-03', 1, 'the instance imports fishball-shared (R-SHARED: it depends on the library)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const unit = await unitOf(V3.instance.name)
    assert.ok(edgesTo(unit, V3.shared.name).length > 0, 'no instance file imports fishball-shared')
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'skills-store.js imports the moved file helpers from fishball-shared (wherever it is shipped)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units } = await observe()
    // R-SHARED (3) names skills-store.js as a reader of the moved helpers; R-CORE later moves the file to core.
    const readers = [...units.values()].flatMap((u) => u.files.filter((f) => path.posix.basename(f) === SHARED_READER).map((f) => ({ u, f })))
    assert.ok(readers.length > 0, 'no V3 package ships ' + SHARED_READER)
    for (const { u, f } of readers) assert.ok(edgesTo(u, V3.shared.name).some((r) => r.file === f), `${u.name}/${f} does not import fishball-shared`)
  })

  // ---- row 5: every importer depends on and bundles the library ----
  caseTest(sdk, 'PLAT-EP-07', 5, 'every V3 package importing fishball-shared lists it in dependencies and bundleDependencies', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units } = await observe()
    const importers = [...units.values()].filter((u) => u.own && u.name !== V3.shared.name && edgesTo(u, V3.shared.name).length > 0)
    assert.ok(importers.some((u) => u.name === V3.instance.name), 'the instance is not among the importers')
    const missing = []
    for (const u of importers) {
      if (!Object.hasOwn(u.manifest[RUNTIME_DEP_FIELD] ?? {}, V3.shared.name)) missing.push(u.name + ': not in ' + RUNTIME_DEP_FIELD)
      if (!BUNDLED_FIELDS.some((f) => (u.manifest[f] ?? []).includes(V3.shared.name))) missing.push(u.name + ': not in ' + BUNDLED_FIELDS.join('/'))
    }
    assert.deepEqual(missing, [])
  })
  caseTest(sdk, 'PLAT-EP-07', 5, "every importer's packed tarball contains fishball-shared's packed files", async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { packed, units } = await observe()
    const prefix = NPM.bundledDir(V3.shared.name)
    const importers = [...units.values()].filter((u) => u.own && u.name !== V3.shared.name && edgesTo(u, V3.shared.name).length > 0)
    assert.ok(importers.length > 0, 'no V3 package imports fishball-shared')
    const missing = []
    for (const u of importers) for (const f of packed[V3.shared.name]) if (!packed[u.name].includes(prefix + f)) missing.push(u.name + ' lacks ' + prefix + f)
    assert.deepEqual(missing, [])
  })

  // ---- row 6: the library holds only modules more than one package uses ----
  caseTest(sdk, 'PLAT-EP-07', 6, 'every fishball-shared module is used by another V3 package (none is dead weight)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units, packed } = await observe()
    const usage = sharedUsage(units)
    const js = packed[V3.shared.name].filter((f) => JS_FILE.test(f))
    assert.ok(js.length > 0, 'fishball-shared ships no module')
    assert.deepEqual(js.filter((m) => !usage.has(m)), [], 'modules no V3 package imports')
  })
  caseTest(sdk, 'PLAT-EP-07', 6, 'every fishball-shared module is used by at least two V3 packages', async () => {
    const { units, packed } = await observe()
    const usage = sharedUsage(units)
    const one = packed[V3.shared.name].filter((f) => JS_FILE.test(f)).filter((m) => (usage.get(m)?.size ?? 0) < 2)
    assert.deepEqual(one.map((m) => m + ': ' + [...(usage.get(m) ?? [])].join(', ')), [])
  }, has(V3.core) ? undefined : LATER.rowSixTwoPackages)
  caseTest(sdk, 'PLAT-EP-07', 6, 'no fishball-shared module is also a live copy in another package (one owner)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units } = await observe()
    const own = new Map([...units.get(V3.shared.name).digests].map(([f, digest]) => [digest, f]))
    const copies = []
    for (const u of units.values()) {
      if (u.name === V3.shared.name) continue
      for (const [f, digest] of u.digests) if (own.has(digest)) copies.push(`${u.name}/${f} = ${V3.shared.name}/${own.get(digest)}`)
    }
    assert.deepEqual(copies, [])
  })

  // ---- row 7a: edges into the library are allowed from every V3 package (TQ-R5 = B) ----
  caseTest(sdk, 'PLAT-EP-07', '7a', 'every edge into fishball-shared comes from a V3 package (connector and embed-UI included)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units } = await observe()
    const from = [...units.values()].filter((u) => u.name !== V3.shared.name && edgesTo(u, V3.shared.name).length > 0).map((u) => u.name)
    assert.ok(from.length > 0, 'no V3 package imports fishball-shared')
    assert.deepEqual(from.filter((n) => !V3_NAMES.includes(n)), [])
  })

  // ---- row 7c: the other cross-package edges are unchanged ----
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the connector imports and depends on no Fishball-set package or fishball-hosted-settings', async () => {
    await assertNoEdges(V3.connector.name, SET_SIDE)
  })
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the feature plugins import and depend on no fishball-core module', async () => {
    for (const name of FEATURES) await assertNoEdges(name, [V3.core.name])
  })
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the feature plugins name no fishball-instance peer (they find core through the optional fishballInstance? inject)', null, LATER.featurePeers)
  caseTest(sdk, 'PLAT-EP-07', '7c', 'embed-UI imports no connector code (only fishball-connector/tools)', async () => {
    const unit = await unitOf(V3.embed.name)
    const code = edgesTo(unit, V3.connector.name).filter((r) => !EMBED_CONNECTOR_ALLOWED.includes(r.specifier)).map(describeRef)
    assert.deepEqual(code, [])
  }, has(V3.embed) ? undefined : LATER.embed)

  // ---- HOST-EP-03 row 2: DSH-side modules stay in the instance ----
  caseTest(sdk, 'HOST-EP-03', 2, 'native-web.js, settings-relay.js and slim/host/* are shipped by the instance and by no other V3 package', async () => {
    const { units } = await observe()
    const isDshSide = (f) => DSH_SIDE.basenames.includes(path.posix.basename(f)) || f.includes(DSH_SIDE.folder)
    const instance = units.get(V3.instance.name).files.filter(isDshSide)
    for (const base of DSH_SIDE.basenames) assert.ok(instance.some((f) => path.posix.basename(f) === base), 'the instance does not ship ' + base)
    assert.ok(instance.some((f) => f.includes(DSH_SIDE.folder)), 'the instance does not ship ' + DSH_SIDE.folder)
    // The connector has its own, unrelated slim/host/ folder (its MCP host side): only the Fishball-set side and the library are checked.
    const elsewhere = []
    for (const name of [V3.shared.name, ...SET_SIDE]) for (const f of units.get(name)?.files.filter((x) => !x.startsWith(NODE_MODULES_DIR)).filter(isDshSide) ?? []) elsewhere.push(name + '/' + f)
    assert.deepEqual(elsewhere, [])
  })
  // The status-line part of row 2 is R-CORE's (it re-homes that module): test/v3/core/cases.mjs.

  // ---- rows 8, 9 and the hosted settings bundle: later tasks ----
  caseTest(sdk, 'PLAT-EP-07', '7a', 'fishball-hosted-settings may import fishball-shared and then bundles it', null, LATER.hostedSettings)
  caseTest(sdk, 'PLAT-EP-07', 8, 'host DSH of a running hosted setup loads no set or hosted-settings module (fishball-shared may load)', null, LATER.hostTrace)
  caseTest(sdk, 'PLAT-EP-07', 9, 'standalone install of the core tarball installs and starts with no registry access', null, LATER.standalone)
}
