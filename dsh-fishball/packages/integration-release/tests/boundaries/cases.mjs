/**
 * Package boundaries across every Fishball package (old test/v3/contract/package-boundaries, whose entry
 * files were deleted in 6b7c53bf, so none of these rows ran in the 0377153f baseline), plus the test
 * restructure's two new rows. Requirements: R-ARCH-08 (one library per side; amended by 1.40, the DSH
 * side's packages left this repository in 6b7c53bf), R-BND-01, F-UI (R-FB-14, R-ARCH-10), REMOVE-V2b,
 * SHELVE-BOARD's code half, docs/testing/README.md (2026-11-22). constants.mjs quotes each.
 *
 * Techniques: EP (one partition per package or per library module), BVA and EP on the row-6 counting
 * rule over synthetic tables (its own oracle check), EP per holder × kind of reference (SHELVE-EP-01),
 * the rules' own samples (REL-TESTS rule).
 * Level: unit (manifests, npm pack listings, specifiers and tokens of shipped JS) and integration (DSH's
 * own bundle inspection of the current DSH).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { caseTest } from 'fishball-test-helpers/cases'
import { importDsh } from 'fishball-test-helpers/dsh'
import { CARRIED, CASE, CLIENT, FEATURES, FIELDS, FISHBALL, INSPECT, LIBRARIES, MIN_LIBRARY_USERS, MOVED_INTO_CORE, NAMES, SCAN, SHARED_READER, SHELVED_BOARD, TESTS_RULE, USERS_RULE } from '../constants.mjs'
import { bareName, describeRef, dirOf, edgesTo, manifestNames, observe, packedFiles, packedFilesAt, readManifest } from '../support/scan.mjs'
import { removeTemps, tempDir } from '../support/temp.mjs'

const show = (v) => JSON.stringify(v)
const unitOf = async (name) => (await observe()).get(name)
const manifestEdges = (manifest, names) => manifestNames(manifest, [...FIELDS.deps, ...FIELDS.bundled]).filter((e) => names.includes(e.name))

/** A package that reaches none of `names` (code or manifest). */
async function assertNoEdges(from, names) {
  const unit = await unitOf(from)
  assert.ok(unit, from + ' is not packed')
  const code = unit.refs.filter((r) => names.includes(r.target)).map(describeRef)
  const manifest = manifestEdges(unit.manifest, names).map((e) => `package.json ${e.field}: ${e.name}`)
  assert.deepEqual([...code, ...manifest], [], `${from} reaches ${names.join(', ')}`)
}

/** DSH's own path inspection (the Plugins page's add) of the current DSH, offline, against a throwaway profile. */
async function dshInspect(dir) {
  const { PluginManager } = await importDsh(INSPECT.manager)
  const scratch = tempDir(INSPECT.tempPrefix)
  fs.writeFileSync(path.join(scratch, INSPECT.manifest), show({ name: INSPECT.profileName, dependencies: {} }))
  fs.writeFileSync(path.join(scratch, INSPECT.anchor), show({ dependencies: {} }))
  // Only the fields inspect() reads for a local path; registries are answered empty, so nothing is fetched.
  const self = { profile: { dir: scratch, installAnchor: path.join(scratch, INSPECT.anchor) }, registries: async () => ({ registry: null, fallbackRegistries: [], resolved: null }) }
  return PluginManager.prototype.inspect.call(self, dir)
}

/**
 * Which packages use each module of library `name`: a package uses a module it imports and every module
 * that one imports inside the library (a re-export makes both used).
 */
export function libraryUsage(units, name) {
  const internal = new Map()
  for (const r of units.get(name).refs) if (r.libraryModule !== undefined) internal.set(r.file, [...(internal.get(r.file) ?? []), r.libraryModule])
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
/** Row 6: the `modules` of library `name` fewer than MIN_LIBRARY_USERS packages use, as "<module>: <users>". */
export function underusedModules(units, name, modules) {
  const usage = libraryUsage(units, name)
  return modules.map((m) => ({ m, users: [...(usage.get(m) ?? [])].sort() })).filter(({ users }) => users.length < MIN_LIBRARY_USERS)
    .map(({ m, users }) => `${m}: ${users.length ? users.join(', ') : 'no importer'}`)
}
/** A synthetic unit table for one USERS_RULE case. */
function usersRuleUnits({ direct, via }) {
  const library = FISHBALL.library
  const libraryRefs = [{ file: USERS_RULE.reexport, specifier: './' + USERS_RULE.module, libraryModule: USERS_RULE.module }]
  const importers = new Map()
  const add = (name, libraryModule) => {
    if (name === library) { libraryRefs.push({ file: 'fbtest-self-' + libraryRefs.length + '.js', specifier: './' + USERS_RULE.module, libraryModule }); return }
    const refs = importers.get(name) ?? []
    refs.push({ file: 'fbtest-' + refs.length + '.js', specifier: library, target: library, libraryModule })
    importers.set(name, refs)
  }
  for (const name of direct) add(name, USERS_RULE.module)
  for (const name of via) add(name, USERS_RULE.reexport)
  return new Map([[library, { name: library, refs: libraryRefs }], ...[...importers].map(([name, refs]) => [name, { name, refs }])])
}

export function registerBoundaryCases() {
  after(removeTemps)
  for (const lib of LIBRARIES) registerLibraryCases(lib)
  for (const c of USERS_RULE.cases) {
    caseTest(CASE.plat, '6 rule', `${c.partition}: the module ${c.pass ? 'passes' : 'fails'} the at-least-two-users check`, () => {
      const failing = underusedModules(usersRuleUnits(c), FISHBALL.library, [USERS_RULE.module])
      assert.equal(failing.length === 0, c.pass, show(failing))
    })
  }
  registerPackageCases()
  registerShelvedBoardCases()
  registerRestructureCases()
}

function registerLibraryCases(lib) {
  const others = NAMES.filter((n) => n !== lib)
  caseTest(CASE.plat, 4, `${lib} manifest has no dsh field (no bundle, row, client or service)`, () => {
    const manifest = readManifest(dirOf(lib))
    assert.equal(Object.hasOwn(manifest, FIELDS.dsh), false, 'dsh field present: ' + show(manifest[FIELDS.dsh]))
  })
  caseTest(CASE.plat, 4, `DSH's own bundle inspection refuses ${lib} as not-a-bundle`, async () => {
    const answer = await dshInspect(dirOf(lib))
    assert.equal(answer.status, INSPECT.refused, show(answer))
    assert.equal(answer.problem, INSPECT.notABundle, show(answer))
  })
  caseTest(CASE.plat, '3/7b', `${lib} code imports no other Fishball package and leaves its own folder by no path`, async () => {
    const unit = await unitOf(lib)
    assert.deepEqual(unit.parseErrors, [], 'unparsed shipped files')
    assert.deepEqual(unit.refs.filter((r) => r.target !== undefined || r.outside).map(describeRef), [])
  })
  caseTest(CASE.plat, '3/7b', `${lib} manifest names no Fishball package in any dependency field`, () => {
    assert.deepEqual(manifestEdges(readManifest(dirOf(lib)), others), [])
  })
  caseTest(CASE.plat, 5, `every Fishball package importing ${lib} (or its carrier) lists it in dependencies and bundleDependencies`, async () => {
    const units = await observe()
    const importers = [...units.values()].filter((u) => u.name !== lib && edgesTo(u, lib).length > 0)
    assert.ok(importers.length > 0, 'no Fishball package imports ' + lib)
    const missing = []
    for (const u of importers) {
      const owner = CARRIED[u.name] ?? u.name
      const manifest = units.get(owner).manifest
      if (!Object.hasOwn(manifest[FIELDS.runtime] ?? {}, lib)) missing.push(`${u.name} (manifest of ${owner}): not in ${FIELDS.runtime}`)
      if (!FIELDS.bundled.some((f) => (manifest[f] ?? []).includes(lib))) missing.push(`${u.name} (manifest of ${owner}): not in ${FIELDS.bundled.join('/')}`)
    }
    assert.deepEqual(missing, [])
  })
  caseTest(CASE.plat, 6, `every ${lib} module is used by another Fishball package (none is dead weight)`, async () => {
    const units = await observe()
    const js = units.get(lib).js
    assert.ok(js.length > 0, lib + ' ships no module')
    const usage = libraryUsage(units, lib)
    assert.deepEqual(js.filter((m) => !usage.has(m)), [], 'modules no Fishball package imports')
  })
  caseTest(CASE.plat, 6, `every ${lib} module is imported by at least ${MIN_LIBRARY_USERS} Fishball packages`, async () => {
    const units = await observe()
    assert.deepEqual(underusedModules(units, lib, units.get(lib).js), [], '(module: importers)')
  })
  caseTest(CASE.plat, 6, `no ${lib} module is also a live copy in a plugin package (one owner)`, async () => {
    const units = await observe()
    const own = new Map([...units.get(lib).digests].map(([f, digest]) => [digest, f]))
    const copies = []
    for (const u of units.values()) {
      if (LIBRARIES.includes(u.name)) continue
      for (const [f, digest] of u.digests) if (own.has(digest)) copies.push(`${u.name}/${f} = ${lib}/${own.get(digest)}`)
    }
    assert.deepEqual(copies, [])
  })
}

function registerPackageCases() {
  caseTest(CASE.plat, 2, `${FISHBALL.ui} imports or depends on ${FISHBALL.core}: never (core is reached through its published routes)`, async () => {
    await assertNoEdges(FISHBALL.ui, [FISHBALL.core])
  })
  caseTest(CASE.plat, 1, `${FISHBALL.core} imports or depends on ${FISHBALL.ui}: never`, async () => {
    await assertNoEdges(FISHBALL.core, [FISHBALL.ui])
  })
  caseTest(CASE.plat, '7c', 'no amenity imports or depends on fishball-core (each finds core only through the fishballInstance service)', async () => {
    for (const name of FEATURES) await assertNoEdges(name, [FISHBALL.core])
  })
  caseTest(CASE.plat, '7c', 'no amenity imports or depends on another amenity, fishball-ui or the umbrella', async () => {
    for (const name of FEATURES) await assertNoEdges(name, [...FEATURES.filter((n) => n !== name), FISHBALL.ui, FISHBALL.amenities])
  })
  caseTest(CASE.plat, '7c', 'no package other than the umbrella names an amenity in its manifest, and none imports one', async () => {
    for (const name of [FISHBALL.core, FISHBALL.ui, FISHBALL.library]) await assertNoEdges(name, [...FEATURES, FISHBALL.amenities])
  })
  caseTest(CASE.plat, '7c', 'every cross-package import names a published export of its target (no deep path into another package)', async () => {
    const units = await observe()
    const deep = []
    for (const u of units.values()) {
      for (const r of u.refs) {
        if (r.target === undefined || r.specifier === null) continue
        if (r.specifier.startsWith('.') || r.specifier.startsWith('/')) { deep.push(`${u.name} ${describeRef(r)} (a path into ${r.target})`); continue }
        const sub = r.specifier === bareName(r.specifier) ? '.' : '.' + r.specifier.slice(bareName(r.specifier).length)
        const exportsOf = units.get(r.target)?.manifest?.[FIELDS.exports] ?? {}
        if (!Object.hasOwn(exportsOf, sub)) deep.push(`${u.name} ${describeRef(r)} (${r.target} exports no ${sub})`)
      }
    }
    assert.deepEqual(deep, [])
  })
  caseTest(CASE.plat, '7c', 'a package declares dsh.client only when it ships browser code (a client entry), and the reverse', async () => {
    const units = await observe()
    const wrong = []
    for (const u of units.values()) {
      const declares = u.manifest?.[FIELDS.dsh]?.[FIELDS.client] !== undefined
      const ships = u.files.some((f) => CLIENT.file.test(f))
      if (declares !== ships) wrong.push(`${u.name}: dsh.client ${declares ? 'declared' : 'absent'}, client entry ${ships ? 'shipped' : 'not shipped'}`)
    }
    assert.deepEqual(wrong, [])
  })
  caseTest(CASE.host, 1, `${SHARED_READER} imports nothing from ${FISHBALL.library} (the file helpers moved into core)`, async () => {
    const units = await observe()
    const readers = [...units.values()].flatMap((u) => u.js.filter((f) => path.posix.basename(f) === SHARED_READER).map((f) => ({ u, f })))
    assert.ok(readers.length > 0, 'no Fishball package ships ' + SHARED_READER)
    assert.deepEqual(readers.flatMap(({ u, f }) => edgesTo(u, FISHBALL.library).filter((r) => r.file === f).map((r) => u.name + ' ' + describeRef(r))), [])
  })
  caseTest(CASE.host, 1, `${FISHBALL.core} imports none of ${MOVED_INTO_CORE.map((m) => m.specifier).join(', ')} (moved into core)`, async () => {
    const unit = await unitOf(FISHBALL.core)
    const moved = (r) => MOVED_INTO_CORE.some((m) => r.specifier === m.specifier || r.libraryModule === m.file)
    assert.deepEqual(edgesTo(unit, FISHBALL.library).filter(moved).map(describeRef), [])
  })
}

function registerShelvedBoardCases() {
  const { pkg, holders, mention, prose, samples } = SHELVED_BOARD
  caseTest(CASE.shelve, 'rule', 'the board-mention rule flags the package name, a board route, the board_ tool prefix and the word, and none of dashboard, clipboard, onboarding, keyboard, taskboard', () => {
    assert.deepEqual(samples.hit.filter((t) => !mention.test(t)), [])
    assert.deepEqual(samples.clean.filter((t) => mention.test(t)), [])
  })
  for (const holder of holders) {
    caseTest(CASE.shelve, 'code ' + holder, `no identifier or string of ${holder}'s shipped JS names ${pkg} or the board`, async () => {
      const unit = await unitOf(holder)
      assert.ok(unit.js.length > 0, holder + ' ships no JS (precondition)')
      const hits = []
      for (const f of unit.js) {
        const t = unit.tokens.get(f)
        assert.equal(t?.error, undefined, `${f} does not parse: ${t?.error}`)
        for (const v of [...t.names, ...t.strings]) if (mention.test(v)) hits.push(`${f}: ${show(v)}`)
      }
      assert.deepEqual(hits, [])
    })
    caseTest(CASE.shelve, 'data ' + holder, `no shipped data file of ${holder} (its patch, package.json, files; READMEs aside) names ${pkg} or the board`, async () => {
      const unit = await unitOf(holder)
      const data = unit.files.filter((f) => !SCAN.js.test(f) && !prose.test(f) && !f.split('/').includes('node_modules'))
      assert.ok(data.length > 0, holder + ' ships no data file (precondition)')
      assert.deepEqual(data.filter((f) => mention.test(fs.readFileSync(path.join(unit.dir, f), 'utf8'))), [])
    })
    caseTest(CASE.shelve, 'manifest ' + holder, `${holder}'s manifest names ${pkg} in no dependency, peer, optional-peer or bundle field`, () => {
      const named = manifestNames(readManifest(dirOf(holder)), [...FIELDS.deps, ...FIELDS.bundled, FIELDS.peersMeta]).filter((e) => e.name === pkg)
      assert.deepEqual(named, [])
    })
  }
}

/** Tests never ship, and fishball-test-helpers is a development dependency only. */
function registerRestructureCases() {
  caseTest(CASE.tests, 'rule', 'the tests-folder rule flags a tests/, test/ or __tests__/ segment and none of its look-alikes', () => {
    assert.deepEqual(TESTS_RULE.samples.hit.filter((s) => !TESTS_RULE.folder.test(s)), [])
    assert.deepEqual(TESTS_RULE.samples.clean.filter((s) => TESTS_RULE.folder.test(s)), [])
  })
  for (const name of NAMES) {
    caseTest(CASE.tests, name, `npm pack --dry-run of ${name} lists no file under a tests/ folder`, async () => {
      assert.deepEqual((await packedFiles(name)).filter((f) => TESTS_RULE.folder.test(f)), [])
    })
  }
  // Meaningful in a controlled world: a package shipping a folder whose tests/ is not excluded does list
  // it, and the exclusion core's manifest uses for fishball-ui (`!ui/tests/`) drops it (so the rows
  // above would fail if a package shipped its tests).
  for (const c of TESTS_RULE.controlled) {
    caseTest(CASE.tests, 'controlled ' + c.partition, `a synthetic package whose files are ${JSON.stringify(c.files)} ${c.ships ? 'ships' : 'does not ship'} its ${TESTS_RULE.sample.file} (npm pack --dry-run, the rule above)`, async () => {
      const dir = tempDir(TESTS_RULE.sample.prefix)
      fs.writeFileSync(path.join(dir, 'package.json'), show({ name: TESTS_RULE.sample.name, version: TESTS_RULE.sample.version, files: c.files }))
      for (const f of [TESTS_RULE.sample.file, TESTS_RULE.sample.kept]) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), '') }
      const listed = await packedFilesAt(dir)
      assert.ok(listed.includes(TESTS_RULE.sample.kept), 'precondition: the folder ships: ' + show(listed))
      assert.equal(listed.some((f) => TESTS_RULE.folder.test(f)), c.ships, show(listed))
    })
  }
  caseTest(CASE.tests, 'helpers private', `${FISHBALL.helpers} is private (never published or packed into a release)`, () => {
    assert.equal(readManifest(dirOf(FISHBALL.helpers))[FIELDS.private], true)
  })
  for (const name of NAMES) {
    caseTest(CASE.helpers, name, `no shipped file of ${name} imports ${FISHBALL.helpers}, and it cannot be a runtime or bundled dependency`, async () => {
      const unit = await unitOf(name)
      const code = unit.refs.filter((r) => r.specifier !== null && bareName(r.specifier) === FISHBALL.helpers).map(describeRef)
      const manifest = manifestNames(unit.manifest, [...FIELDS.deps, ...FIELDS.bundled, FIELDS.peersMeta])
        .filter((e) => e.name === FISHBALL.helpers && e.field !== FIELDS.dev).map((e) => 'package.json ' + e.field)
      assert.deepEqual([...code, ...manifest], [])
    })
  }
}
