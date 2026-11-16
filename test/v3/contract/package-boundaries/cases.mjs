/**
 * R-SHARED black-box cases: PLAT-EP-07 static rows (TQ-R5 decided B, `fc19e02`) and HOST-EP-03
 * rows 1–2. Requirements R-ARCH-08 (amended by requirements 1.40: one library per side,
 * `dsh-connector-shared` and `fishball-shared`; SPLIT-SHARED) and R-BND-01. The library rows run once
 * per library; the cross-side decision table and the library contents are SPLIT-SHARED's
 * (test/v3/contract/split-shared/). Technique: EP (both cases are equivalence-partition
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
import { REPO } from '../../../support/constants.mjs'
import {
  BUNDLED_FIELDS, DEP_FIELDS, DSH_FIELD, DSH_SIDE, EMBED_CONNECTOR_ALLOWED, FEATURES, JS_FILE, LATER, LIBRARIES, NPM, ROOT_WORKSPACE,
  RUNTIME_DEP_FIELD, SDK, SET_SIDE, SHARED_READER, V3, V3_NAMES, sideOf,
} from './constants.mjs'
import { manifestNames, npmTempRoot, observe, readManifest } from './packages.mjs'

const NODE_MODULES_DIR = 'node_modules/'
export const has = (pkg) => readManifest(pkg.dir) !== null
export const edgesTo = (unit, name) => (unit?.refs ?? []).filter((r) => r.target === name)
export const describeRef = (r) => `${r.file}: ${r.kind} ${JSON.stringify(r.specifier)}`
export const unitOf = async (name) => (await observe()).units.get(name)
export const manifestEdges = (manifest, names) => manifestNames(manifest, [...DEP_FIELDS, ...BUNDLED_FIELDS]).filter((e) => names.includes(e.name))
const manifestMissing = (lib) => lib.dir.split(path.sep).slice(-2).join('/') + '/package.json is missing'
/** The packed V3 packages (own folders only) that import `name`, other than `name` itself. */
export const importersOf = (units, name) => [...units.values()].filter((u) => u.own && u.name !== name && edgesTo(u, name).length > 0)

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
/**
 * Run `fn` only at integration (`gate.env` set to `gate.on`): it boots a host DSH. Outside
 * integration the test is registered as skipped under the same name, so both SDK runs list it.
 */
export function integrationCase(sdk, id, row, title, fn, gate) {
  const name = caseName(sdk, id, row, title)
  if (process.env[gate.env] === gate.on) test(name, fn)
  else test(name, { skip: gate.skip }, () => {})
}

/** A package that does not import the given set (code or manifest). */
export async function assertNoEdges(from, names) {
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
 * Which V3 packages use each module of library `name`: a package uses a module it imports, and every
 * module that one imports inside the library (an `index.js` re-exporting `files.js` makes both used).
 */
function libraryUsage(units, name) {
  const library = units.get(name)
  const internal = new Map()
  for (const r of library.refs) if (r.target === undefined && r.libraryModule !== undefined) internal.set(r.file, [...(internal.get(r.file) ?? []), r.libraryModule])
  const closure = (start) => {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) for (const next of internal.get(queue.shift()) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
    return seen
  }
  const usage = new Map()
  for (const unit of units.values()) {
    if (unit.name === name) continue
    for (const r of edgesTo(unit, name)) {
      if (r.libraryModule === undefined) continue
      for (const m of closure(r.libraryModule)) usage.set(m, new Set([...(usage.get(m) ?? []), unit.name]))
    }
  }
  return usage
}

export function registerSharedCases(sdk) {
  for (const lib of LIBRARIES) registerLibraryCases(sdk, lib)
  registerPackageCases(sdk)
}

/** The rows every library meets on its own (PLAT-EP-07 rows 3, 4, 5, 6, 7a, 7b), for one library. */
function registerLibraryCases(sdk, lib) {
  const others = () => V3_NAMES.filter((n) => n !== lib.name)
  // ---- PLAT-EP-07 row 4: the library is not a plugin ----
  caseTest(sdk, 'PLAT-EP-07', 4, `${lib.name} exists in ${ROOT_WORKSPACE(lib)} and is a root workspace`, () => {
    const manifest = readManifest(lib.dir)
    assert.ok(manifest, manifestMissing(lib))
    assert.equal(manifest.name, lib.name)
    assert.ok(readManifest(REPO).workspaces?.includes(ROOT_WORKSPACE(lib)), 'root workspaces lack ' + ROOT_WORKSPACE(lib))
  })
  caseTest(sdk, 'PLAT-EP-07', 4, `${lib.name} manifest has no dsh field (no bundle, row, client or service)`, () => {
    const manifest = readManifest(lib.dir)
    assert.ok(manifest, manifestMissing(lib))
    assert.equal(Object.hasOwn(manifest, DSH_FIELD), false, 'dsh field present: ' + JSON.stringify(manifest[DSH_FIELD]))
  })
  caseTest(sdk, 'PLAT-EP-07', 4, `DSH's own bundle inspection refuses ${lib.name} as not-a-bundle`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const answer = await dshInspect(sdk, lib.dir)
    assert.equal(answer.status, SDK.inspect.refused, JSON.stringify(answer))
    assert.equal(answer.problem, SDK.inspect.notABundle, JSON.stringify(answer))
  })
  caseTest(sdk, 'PLAT-EP-07', 4, `${lib.name} is not listed on any Plugins page of a started DSH`, null, LATER.pluginsPage)

  // ---- rows 3 and 7b: no edge out of the library (the other side's library included) ----
  caseTest(sdk, 'PLAT-EP-07', '3/7b', `${lib.name} code imports no other V3 package and leaves its own folder by no path`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const unit = await unitOf(lib.name)
    assert.deepEqual(unit.parseErrors, [], 'unparsed shipped files')
    assert.deepEqual(unit.refs.filter((r) => r.target !== undefined || r.outside).map(describeRef), [])
  })
  caseTest(sdk, 'PLAT-EP-07', '3/7b', `${lib.name} manifest names no V3 package in any dependency field`, () => {
    const manifest = readManifest(lib.dir)
    assert.ok(manifest, manifestMissing(lib))
    assert.deepEqual(manifestEdges(manifest, others()), [])
  })

  // ---- row 5: every importer depends on and bundles the library ----
  caseTest(sdk, 'PLAT-EP-07', 5, `every V3 package importing ${lib.name} lists it in dependencies and bundleDependencies`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const importers = importersOf((await observe()).units, lib.name)
    assert.ok(importers.length > 0, 'no V3 package imports ' + lib.name)
    const missing = []
    for (const u of importers) {
      if (!Object.hasOwn(u.manifest[RUNTIME_DEP_FIELD] ?? {}, lib.name)) missing.push(u.name + ': not in ' + RUNTIME_DEP_FIELD)
      if (!BUNDLED_FIELDS.some((f) => (u.manifest[f] ?? []).includes(lib.name))) missing.push(u.name + ': not in ' + BUNDLED_FIELDS.join('/'))
    }
    assert.deepEqual(missing, [])
  })
  caseTest(sdk, 'PLAT-EP-07', 5, `every importer's packed tarball contains ${lib.name}'s packed files`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const { packed, units } = await observe()
    const prefix = NPM.bundledDir(lib.name)
    const importers = importersOf(units, lib.name)
    assert.ok(importers.length > 0, 'no V3 package imports ' + lib.name)
    const missing = []
    for (const u of importers) for (const f of packed[lib.name]) if (!packed[u.name].includes(prefix + f)) missing.push(u.name + ' lacks ' + prefix + f)
    assert.deepEqual(missing, [])
  })

  // ---- row 6: the library holds only modules its side uses ----
  caseTest(sdk, 'PLAT-EP-07', 6, `every ${lib.name} module is used by another V3 package (none is dead weight)`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const { units, packed } = await observe()
    const usage = libraryUsage(units, lib.name)
    const js = packed[lib.name].filter((f) => JS_FILE.test(f))
    assert.ok(js.length > 0, lib.name + ' ships no module')
    assert.deepEqual(js.filter((m) => !usage.has(m)), [], 'modules no V3 package imports')
  })
  // R-ARCH-08 says each library holds modules "more than one" package of its side uses, but the
  // SPLIT-SHARED contents (design §1.0b row 5, plan §5) put the admin protocol and files in
  // dsh-connector-shared for the instance alone, and fishball-shared serves core alone until F-UI.
  // The two-users rule is left open until Fishball reconciles the two texts.
  caseTest(sdk, 'PLAT-EP-07', 6, `every ${lib.name} module is used by at least two V3 packages`, null, LATER.twoUsers)
  caseTest(sdk, 'PLAT-EP-07', 6, `no ${lib.name} module is also a live copy in a plugin package (one owner per side)`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const { units } = await observe()
    const own = new Map([...units.get(lib.name).digests].map(([f, digest]) => [digest, f]))
    const copies = []
    // A copy in the other side's library is required (1.40: one copy per side); a copy in a plugin is not.
    for (const u of units.values()) {
      if (LIBRARIES.some((l) => l.name === u.name)) continue
      for (const [f, digest] of u.digests) if (own.has(digest)) copies.push(`${u.name}/${f} = ${lib.name}/${own.get(digest)}`)
    }
    assert.deepEqual(copies, [])
  })

  // ---- row 7a (amended by 1.40): edges into the library come only from its own side ----
  caseTest(sdk, 'PLAT-EP-07', '7a', `every edge into ${lib.name} comes from a package of the ${sideOf(lib.name).id} side`, async () => {
    assert.ok(has(lib), manifestMissing(lib))
    const { units } = await observe()
    const side = sideOf(lib.name)
    const from = [...units.values()].filter((u) => u.name !== lib.name && (edgesTo(u, lib.name).length > 0 || manifestEdges(u.manifest, [lib.name]).length > 0)).map((u) => u.name)
    assert.ok(from.length > 0, 'no V3 package imports ' + lib.name)
    assert.deepEqual(from.filter((n) => sideOf(n) !== side), [])
  })
}

/** The rows about the plugin packages (PLAT-EP-07 rows 1, 2, 7c, 8, 9; HOST-EP-03 rows 1–2). */
function registerPackageCases(sdk) {
  // ---- rows 1 and 2 (= HOST-EP-03 row 1): core and the instance never reach each other ----
  caseTest(sdk, 'PLAT-EP-07', 1, 'dsh-instance (and any bundle it ships) imports or depends on fishball-core: never', async () => {
    await assertNoEdges(V3.instance.name, [V3.core.name])
  })
  caseTest(sdk, 'PLAT-EP-07', 2, 'fishball-core imports or depends on dsh-instance: never', async () => {
    await assertNoEdges(V3.core.name, [V3.instance.name])
  }, has(V3.core) ? undefined : LATER.core)
  // Amended by 1.40: each imports its own side's library, never the other's.
  caseTest(sdk, 'HOST-EP-03', 1, "neither core nor the instance imports the other; core imports fishball-shared, the instance dsh-connector-shared", async () => {
    for (const [from, to] of [[V3.core.name, V3.instance.name], [V3.instance.name, V3.core.name]]) await assertNoEdges(from, [to])
    for (const [name, lib] of [[V3.core.name, V3.shared.name], [V3.instance.name, V3.dshShared.name]]) assert.ok(edgesTo(await unitOf(name), lib).length > 0, name + ' imports nothing from ' + lib)
  }, has(V3.core) ? undefined : LATER.core)
  caseTest(sdk, 'HOST-EP-03', 1, 'the instance imports dsh-connector-shared and reaches nothing of fishball-shared (code or manifest)', async () => {
    assert.ok(has(V3.dshShared), 'packages/dsh-connector-shared/package.json is missing')
    assert.ok(edgesTo(await unitOf(V3.instance.name), V3.dshShared.name).length > 0, 'no instance file imports dsh-connector-shared')
    await assertNoEdges(V3.instance.name, [V3.shared.name])
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'skills-store.js imports the moved file helpers from fishball-shared (wherever it is shipped)', async () => {
    assert.ok(has(V3.shared), 'packages/shared/package.json is missing')
    const { units } = await observe()
    // R-SHARED (3) names skills-store.js as a reader of the helpers; it is core's (Fishball side), so its library is fishball-shared.
    const readers = [...units.values()].flatMap((u) => u.files.filter((f) => path.posix.basename(f) === SHARED_READER).map((f) => ({ u, f })))
    assert.ok(readers.length > 0, 'no V3 package ships ' + SHARED_READER)
    for (const { u, f } of readers) assert.ok(edgesTo(u, V3.shared.name).some((r) => r.file === f), `${u.name}/${f} does not import fishball-shared`)
  })

  // F-UI (R-FB-14, R-ARCH-10): fishball-ui is Fishball-side only. It reaches neither the instance nor
  // core (core is reached through its published routes), and neither reaches fishball-ui.
  caseTest(sdk, 'PLAT-EP-07', 2, 'fishball-ui imports or depends on dsh-instance or fishball-core: never', async () => {
    await assertNoEdges(V3.ui.name, [V3.instance.name, V3.core.name])
  }, has(V3.ui) ? undefined : LATER.ui)
  caseTest(sdk, 'PLAT-EP-07', 1, 'dsh-instance and fishball-core import or depend on fishball-ui: never', async () => {
    for (const from of [V3.instance.name, V3.core.name]) await assertNoEdges(from, [V3.ui.name])
  }, has(V3.ui) ? undefined : LATER.ui)

  // ---- row 7c: the other cross-package edges are unchanged ----
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the connector imports and depends on no Fishball-side package (fishball-shared included)', async () => {
    await assertNoEdges(V3.connector.name, [...SET_SIDE, V3.shared.name])
  })
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the feature plugin imports and depends on no fishball-core module', async () => {
    for (const name of FEATURES) await assertNoEdges(name, [V3.core.name])
  })
  caseTest(sdk, 'PLAT-EP-07', '7c', 'the feature plugin names no dsh-instance peer (it finds core through the optional fishballInstance? inject)', null, LATER.featurePeers)
  caseTest(sdk, 'PLAT-EP-07', '7c', 'embed-UI imports no connector code (only dsh-connector/tools)', async () => {
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
    // The connector has its own, unrelated slim/host/ folder (its MCP host side): only the Fishball-set side and the libraries are checked.
    const elsewhere = []
    for (const name of [...LIBRARIES.map((l) => l.name), ...SET_SIDE]) for (const f of units.get(name)?.files.filter((x) => !x.startsWith(NODE_MODULES_DIR)).filter(isDshSide) ?? []) elsewhere.push(name + '/' + f)
    assert.deepEqual(elsewhere, [])
  })
  // The status-line part of row 2 is R-CORE's (it re-homes that module): test/v3/fishball-core/package/cases.mjs.

  // ---- rows 8 and 9: later tasks ----
  caseTest(sdk, 'PLAT-EP-07', 8, 'host DSH of a running hosted setup loads no set module (dsh-connector-shared may load; fishball-shared never)', null, LATER.hostTrace)
  caseTest(sdk, 'PLAT-EP-07', 9, 'standalone install of the core tarball installs and starts with no registry access', null, LATER.standalone)
}
