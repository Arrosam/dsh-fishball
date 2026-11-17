/**
 * SPLIT-SHARED black-box cases: one library per side (requirements 1.40; R-ARCH-08 as amended,
 * R-ARCH-01, R-BND-01; design `9a531192` §1.0, §1.0b row 5, §1.0c, §6.3a "One copy per side").
 * The Use Cases and the case list with their derivation are in cases.md beside this file.
 *
 * Levels: unit (manifests, packed listings and import specifiers through the R-SHARED observation
 * layer; the library modules loaded on their own, with DSH's packages from the SDK under test) and
 * integration (the instance's public `composedProfile` placing a child profile in a scratch tree;
 * it writes files only and starts no process). The per-library rows that hold for any library
 * (not a plugin, root workspace, no edge out, importers bundle it) are PLAT-EP-07's, registered for
 * both libraries by ../package-boundaries/cases.mjs; they are not repeated here.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { after } from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO, TEST_HOMES } from '../../../support/constants.mjs'
import { assertNoEdges, caseTest, describeRef, edgesTo, has, importersOf, manifestEdges, unitOf } from '../package-boundaries/cases.mjs'
import { MOVED_INTO_CORE, NPM, SDK, SIDES, V3 } from '../package-boundaries/constants.mjs'
import { observe, readManifest } from '../package-boundaries/packages.mjs'
import { WITHDRAWN_BY, withdrawnRow } from '../../dsh-instance/host/withdrawn.mjs'
import {
  ADMIN_PROTOCOL, BASE, CODE_SAMPLES, CORE_CHILD_HALVES, DSH_EXPORTS, DSH_MODULES, DSH_MOVED_TO, EXPECTED_LIBRARY, FILES_MODULE, FINGERPRINT_SAMPLES, FORMER_INTERIM_COPIES,
  HOST_PEERS, INSIDE_CASES, LONG_RUN, MANIFEST_EXPORT, NO_LIBRARY, PLACED, PROFILE_SAMPLES, REDACT, REDACT_SAMPLES, SDK_SCOPE, SHARED_EXPORTS, moduleFile, sdkModules,
  subpath,
} from './constants.mjs'

const show = (v) => JSON.stringify(v)
const names = (pkgs) => pkgs.map((p) => p.name)
const otherSide = (side) => Object.values(SIDES).find((s) => s !== side)
const libraryFile = (lib, module) => path.join(lib.dir, moduleFile(module))
/**
 * The DSH side's copy of `module`: dsh-connector-shared's, or, for a module C-WIRE-2 moved out of it
 * (R-ARCH-08 strict, DSH_MOVED_TO), the file in the package that is its only user.
 */
function dshFile(module) {
  const moved = DSH_MOVED_TO[module]
  if (moved === undefined) return libraryFile(V3.dshShared, module)
  const [pkg, ...dirs] = moved
  return path.join(pkg.dir, ...dirs, moduleFile(module))
}
/** The copy of `module` in `lib` (the DSH side's library resolves moved modules to their new home). */
const copyFile = (lib, module) => (lib === V3.dshShared ? dshFile(module) : libraryFile(lib, module))
const needLibrary = (lib) => assert.ok(has(lib), path.relative(REPO, lib.dir) + '/package.json is missing')

// -------------------------------------------------------------------------------- module loading

let hooked = false
/** Resolve DSH's own packages from the SDK under test, for every module this process loads. */
function resolveSdk(sdk) {
  if (hooked) return
  hooked = true
  const parentURL = pathToFileURL(path.join(sdkModules(sdk), '..', 'package.json')).href
  registerHooks({ resolve: (specifier, context, next) => next(specifier, specifier.startsWith(SDK_SCOPE) ? { ...context, parentURL } : context) })
}
const load = (sdk, file) => { resolveSdk(sdk); return import(pathToFileURL(file).href) }

/** A scratch directory under the run's `.runtime` folder, removed by `cleanup` (a test's or the file's `after`). */
function scratch(cleanup, prefix) {
  const root = path.dirname(TEST_HOMES)
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(root, prefix)))
  cleanup(() => {
    // Guard the one recursive delete: a directory this file created directly under `root`.
    if (path.dirname(dir) !== fs.realpathSync(root) || !path.basename(dir).startsWith(prefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * The library as it was at BASE (packages/shared at 131ad65f), written out as module files once per
 * process: every differential row loads it, and a loaded module stays cached, so it is removed when
 * the file ends. Called at registration (outside any test), so `after` is the file's hook.
 */
let baseDir
function baseLibrary() {
  if (baseDir) return baseDir
  baseDir = path.join(scratch(after, 'fbtest-split-base-'), 'shared')
  fs.mkdirSync(baseDir)
  for (const module of DSH_MODULES) {
    const source = execFileSync('git', ['show', `${BASE.ref}:${BASE.folder}/${moduleFile(module)}`], { cwd: REPO, encoding: 'utf8' })
    fs.writeFileSync(path.join(baseDir, moduleFile(module)), source)
  }
  fs.writeFileSync(path.join(baseDir, 'package.json'), show({ type: 'module' }))
  return baseDir
}
const baseModule = (sdk, module) => load(sdk, path.join(baseLibrary(), moduleFile(module)))

/**
 * A plain, comparable picture of a module's exports: each name with its kind, and every frozen data
 * object's content (a RegExp by its source, a Set by its values, a function by its arity).
 */
function surface(module) {
  const picture = (v) => {
    if (v instanceof RegExp) return { regexp: v.toString() }
    if (v instanceof Set) return { set: [...v].map(picture) }
    if (typeof v === 'function') return { function: v.length }
    if (Array.isArray(v)) return v.map(picture)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, picture(x)]))
    return v
  }
  return Object.fromEntries(Object.keys(module).sort().map((k) => [k, picture(module[k])]))
}
const SYNC_HOST_MODULE = 'provider-sync-host'
/** A row I-HOST withdrew: still listed, skipped with the reason. */
const withdrawn = (sdk, id, row, title, reason = WITHDRAWN_BY.halves) => withdrawnRow(sdk, id, row, title, reason)
const outcome = (fn) => { try { return { value: fn() } } catch (error) { return { error: error?.code ?? error?.message } } }

// -------------------------------------------------------------------------------- placement world

/**
 * A scratch checkout for the instance's placement: copies of the instance, core and fishball-ui under
 * `packages/`, and a root `node_modules` standing in for the instance's dependency graph
 * (dsh-connector-shared, dsh-connector). Core gets its own `node_modules/fishball-shared` copy with
 * a marker module, and the root graph holds a decoy fishball-shared with another marker: the placed
 * copy must be core's (requirement 7), never one the instance's graph resolves.
 */
function placementTree(t) {
  const root = scratch((fn) => t.after(fn), PLACED.tempPrefix)
  const tree = path.join(root, 'tree')
  const noModules = (src) => !src.split(path.sep).includes('node_modules')
  // I-HOST (Q1, Q2): placement also places fishball-ui, so the tree carries its folder too.
  // Re-baselined (SHELVE-BOARD): no board folder, so placement is shown to need none. The user,
  // 2026-11-18: "fishball-board先从这次release中移除…先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"
  for (const p of [V3.instance, V3.core, V3.ui]) fs.cpSync(p.dir, path.join(tree, path.relative(REPO, p.dir)), { recursive: true, verbatimSymlinks: true, filter: noModules })
  const graph = path.join(tree, 'node_modules')
  fs.mkdirSync(graph)
  for (const p of [V3.dshShared, V3.connector]) fs.symlinkSync(p.dir, path.join(graph, p.name))
  const marker = (dir, name) => { fs.cpSync(V3.shared.dir, dir, { recursive: true, filter: noModules }); fs.writeFileSync(path.join(dir, name), 'export {}\n'); return name }
  const coreMarker = marker(path.join(tree, path.relative(REPO, V3.core.dir), 'node_modules', V3.shared.name), 'fbtest-core-copy.js')
  // fishball-ui bundles fishball-shared the same way (I-HOST: placed once); its copy carries the same
  // marker, so "a Fishball-side package's own copy, never the instance graph's" is still what is checked.
  marker(path.join(tree, path.relative(REPO, V3.ui.dir), 'node_modules', V3.shared.name), coreMarker)
  const decoyMarker = marker(path.join(graph, V3.shared.name), 'fbtest-instance-graph-decoy.js')
  const home = path.join(root, 'home')
  fs.mkdirSync(home)
  return { tree, home, coreMarker, decoyMarker }
}
/** composedProfile of the tree's instance for `home` (lays out and places; no process). */
async function compose(sdk, tree, home) {
  const module = await import(pathToFileURL(path.join(tree, path.relative(REPO, V3.instance.dir), 'src', 'native-runtime', 'index.js')).href)
  return module.composedProfile({ mainHome: home, installAnchor: path.join(sdkModules(sdk), SDK_SCOPE + 'dsh', 'package.json') })
}
const listTree = (dir) => fs.readdirSync(dir, { recursive: true }).map((f) => f.split(path.sep).join('/')).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort()

// ================================================================================ registration

export function registerSplitCases(sdk) {
  baseLibrary()
  // ---------------------------------------------------------------- SPLIT-DT-01: no edge across the sides
  for (const side of Object.values(SIDES)) {
    const other = otherSide(side)
    for (const from of side.packages) {
      // Since F-WIRE core has no V2 edge to dsh-connector left (design §1.0b row 2), so every package,
      // core included, is banned the whole other side.
      const banned = names(other.packages)
      caseTest(sdk, 'SPLIT-DT-01', `${side.id}→${other.id} ${from.name}`, `${from.name} imports and lists in no dependency field any ${other.id}-side package (${banned.join(', ')})`, async () => {
        await assertNoEdges(from.name, banned)
      }, has(from) ? undefined : 'the task that creates ' + from.name)
    }
  }
  // Was a REMOVE-V2 todo: core's ./contract import and dsh-connector peer went with F-WIRE (R-ARCH-10).
  caseTest(sdk, 'SPLIT-DT-01', 'Fishball→DSH fishball-core dsh-connector', 'fishball-core imports and depends on nothing of dsh-connector', async () => {
    await assertNoEdges(V3.core.name, [V3.connector.name])
  }, has(V3.core) ? undefined : 'the task that creates ' + V3.core.name)

  // ---------------------------------------------------------------- SPLIT-UC-01/02: each package uses its own side's library
  for (const [name, expected] of Object.entries(EXPECTED_LIBRARY)) {
    const uc = expected === V3.dshShared.name ? 'SPLIT-UC-01' : 'SPLIT-UC-02'
    caseTest(sdk, uc, 'main', `${name} imports ${expected}, lists it in dependencies and bundleDependencies, and reaches no other library`, async () => {
      const unit = await unitOf(name)
      assert.ok(edgesTo(unit, expected).length > 0, name + ' imports nothing from ' + expected)
      const manifest = unit.manifest
      assert.ok(Object.hasOwn(manifest.dependencies ?? {}, expected), expected + ' not in dependencies')
      assert.ok((manifest.bundleDependencies ?? manifest.bundledDependencies ?? []).includes(expected), expected + ' not in bundleDependencies')
      const other = PLACED.libraries.filter((n) => n !== expected)
      assert.deepEqual([...unit.refs.filter((r) => other.includes(r.target)).map(describeRef), ...manifestEdges(manifest, other).map((e) => e.field + ': ' + e.name)], [])
    })
  }
  // C-WIRE-2 (R-ARCH-08 strict): the adapter owns its oauth-client and takes no library at all.
  for (const name of NO_LIBRARY) {
    caseTest(sdk, 'SPLIT-UC-01', `main (${name})`, `${name} imports no library and names none in a dependency field (R-ARCH-08 strict, C-WIRE-2)`, async () => {
      const unit = await unitOf(name)
      assert.deepEqual([...unit.refs.filter((r) => PLACED.libraries.includes(r.target)).map(describeRef), ...manifestEdges(unit.manifest, PLACED.libraries).map((e) => e.field + ': ' + e.name)], [])
    })
  }
  caseTest(sdk, 'SPLIT-UC-01', 'A1', 'every DSH-side importer of a library module takes it from dsh-connector-shared/<module> (an exported subpath)', async () => {
    const wrong = []
    for (const p of SIDES.dsh.packages.filter((x) => x !== V3.dshShared && has(x))) {
      for (const r of (await unitOf(p.name)).refs) if (r.target === V3.dshShared.name && !DSH_EXPORTS.map((m) => V3.dshShared.name + '/' + m).includes(r.specifier)) wrong.push(p.name + ' ' + describeRef(r))
    }
    assert.deepEqual(wrong, [])
  })
  caseTest(sdk, 'SPLIT-UC-02', 'A1', `no Fishball-side package imports fishball-shared/${REDACT} (it is provider-sync-host's internal helper only)`, async () => {
    const hits = []
    for (const p of SIDES.fishball.packages.filter((x) => x !== V3.shared && has(x))) {
      for (const r of (await unitOf(p.name)).refs) if (r.target === V3.shared.name && r.libraryModule === moduleFile(REDACT)) hits.push(p.name + ' ' + describeRef(r))
    }
    assert.deepEqual(hits, [])
  })

  // ---------------------------------------------------------------- SPLIT-EP-01: what dsh-connector-shared holds
  // Re-baselined by C-WIRE-2 (R-ARCH-08 strict): exactly ./redact, ./request-host and ./package.json.
  caseTest(sdk, 'SPLIT-EP-01', 1, `dsh-connector-shared exports exactly ${[...DSH_EXPORTS.map(subpath), MANIFEST_EXPORT].join(', ')}, each a shipped file`, () => {
    needLibrary(V3.dshShared)
    const exports = readManifest(V3.dshShared.dir).exports ?? {}
    for (const module of DSH_EXPORTS) {
      assert.equal(exports[subpath(module)], subpath(moduleFile(module)), subpath(module) + ': ' + show(exports[subpath(module)]))
      assert.ok(fs.existsSync(libraryFile(V3.dshShared, module)), moduleFile(module) + ' is missing')
    }
    assert.deepEqual(Object.keys(exports).sort(), [...DSH_EXPORTS.map(subpath), MANIFEST_EXPORT].sort())
  })
  for (const [module, [pkg, ...dirs]] of Object.entries(DSH_MOVED_TO)) {
    caseTest(sdk, 'SPLIT-EP-01', `1 (${module} moved)`, `${module} left dsh-connector-shared for ${pkg.name}/${[...dirs, moduleFile(module)].join('/')}, its only user (R-ARCH-08 strict, C-WIRE-2)`, () => {
      needLibrary(V3.dshShared)
      assert.equal(Object.hasOwn(readManifest(V3.dshShared.dir).exports ?? {}, subpath(module)), false, subpath(module) + ' is still exported')
      assert.equal(fs.existsSync(libraryFile(V3.dshShared, module)), false, moduleFile(module) + ' still ships in dsh-connector-shared')
      assert.ok(fs.existsSync(dshFile(module)), path.relative(REPO, dshFile(module)) + ' is missing')
    })
  }
  caseTest(sdk, 'SPLIT-EP-01', '1 (D14)', `dsh-connector-shared no longer holds ${ADMIN_PROTOCOL} (no ${subpath(ADMIN_PROTOCOL)} export, no ${moduleFile(ADMIN_PROTOCOL)})`, () => {
    needLibrary(V3.dshShared)
    assert.equal(Object.hasOwn(readManifest(V3.dshShared.dir).exports ?? {}, subpath(ADMIN_PROTOCOL)), false, subpath(ADMIN_PROTOCOL) + ' is still exported')
    assert.equal(fs.existsSync(libraryFile(V3.dshShared, ADMIN_PROTOCOL)), false, moduleFile(ADMIN_PROTOCOL) + ' still ships')
  })
  // Re-baselined by C-WIRE-2 (R-ARCH-08 strict): the provider-sync modules that needed host peers left.
  caseTest(sdk, 'SPLIT-EP-01', 2, 'dsh-connector-shared has no peerDependencies (its provider-sync modules moved into the instance, C-WIRE-2)', () => {
    needLibrary(V3.dshShared)
    const peers = readManifest(V3.dshShared.dir).peerDependencies ?? {}
    assert.deepEqual(Object.keys(peers).sort(), [...HOST_PEERS].sort())
  })
  // Rewritten by REMOVE-V2b (R-ARCH-08 strict, Fishball 2026-11-16): the row was "fishball-shared keeps
  // ./files (one copy per library)". files and oauth-client had one Fishball-side user, core, and moved
  // into it, so fishball-shared now holds only ui-seam. dsh-connector-shared's ./files is row 1's.
  caseTest(sdk, 'SPLIT-EP-01', 3, `fishball-shared exports exactly ${Object.keys(SHARED_EXPORTS).join(', ')} and ships no ${MOVED_INTO_CORE.map((m) => m.file).join(' or ')}`, () => {
    needLibrary(V3.shared)
    assert.deepEqual(readManifest(V3.shared.dir).exports ?? {}, SHARED_EXPORTS)
    for (const { module, file } of MOVED_INTO_CORE) assert.equal(fs.existsSync(libraryFile(V3.shared, module)), false, 'fishball-shared still ships ' + file)
  })
  caseTest(sdk, 'SPLIT-EP-01', 4, 'release packer: no tarball carries the other side\'s library', async () => {
    const { packed } = await observe()
    const wrong = []
    for (const side of Object.values(SIDES)) {
      const foreign = NPM.bundledDir(otherSide(side).library.name)
      for (const p of side.packages) for (const f of packed[p.name] ?? []) if (f.startsWith(foreign)) wrong.push(p.name + ': ' + f)
    }
    assert.deepEqual(wrong, [])
  })
  caseTest(sdk, 'SPLIT-EP-01', 5, 'release packer: every importer of a library is of that library\'s side', async () => {
    const { units } = await observe()
    const wrong = []
    for (const side of Object.values(SIDES)) for (const u of importersOf(units, side.library.name)) if (!side.packages.some((p) => p.name === u.name)) wrong.push(u.name + ' → ' + side.library.name)
    assert.deepEqual(wrong, [])
  })

  // ---------------------------------------------------------------- SPLIT-DT-02: the interim copies (requirement 5)
  const halvesPresent = () => CORE_CHILD_HALVES.every((f) => fs.existsSync(path.join(V3.core.dir, f)))
  // I-HOST moved core's child halves into the instance (src/child/), so the table's "halves
  // present" rule is withdrawn and its "halves moved" rule now runs.
  for (const module of FORMER_INTERIM_COPIES) {
    withdrawn(sdk, 'SPLIT-DT-02', 'halves present', `core's child halves exist → fishball-shared ships its own ${moduleFile(module)}`)
  }
  withdrawn(sdk, 'SPLIT-DT-02', 'halves present', "core's child halves import the admin protocol and provider-sync from fishball-shared only")
  caseTest(sdk, 'SPLIT-DT-02', 'halves moved', "core's child halves gone (I-HOST) → fishball-shared drops the interim copies", () => {
    assert.equal(halvesPresent(), false, 'precondition: core no longer ships ' + CORE_CHILD_HALVES.join(', '))
    for (const module of FORMER_INTERIM_COPIES) assert.equal(fs.existsSync(libraryFile(V3.shared, module)), false, 'fishball-shared still ships ' + moduleFile(module))
  })

  // ---------------------------------------------------------------- SPLIT-EP-02: drift guard between the two copies
  // The interim copies are gone (I-HOST), and REMOVE-V2b moved fishball-shared's `files` into core
  // (R-ARCH-08 strict), so no module has two library copies left to compare: every row is withdrawn.
  for (const module of FORMER_INTERIM_COPIES) withdrawn(sdk, 'SPLIT-EP-02', module, `${moduleFile(module)}: the two libraries' copies hold the same code below their header comment`)
  withdrawn(sdk, 'SPLIT-EP-02', FILES_MODULE, `${moduleFile(FILES_MODULE)}: the two libraries' copies hold the same code below their header comment`, WITHDRAWN_BY.sharedSingleUsers)

  // ---------------------------------------------------------------- SPLIT-EP/BVA inside(root, file), dsh-connector-shared's copy
  // fishball-shared's rows are withdrawn by REMOVE-V2b (its files.js moved into core); the same names stay listed.
  for (const lib of [V3.dshShared, V3.shared]) {
    for (const [id, title, root, file, expected] of INSIDE_CASES) {
      const [caseId, row, name] = ['SPLIT-' + id.split('-')[0] + '-03', `${lib.name} ${id}`, `inside(${show(root)}, ${show(file)}) is ${expected}: ${title}`]
      if (lib === V3.shared) { withdrawn(sdk, caseId, row, name, WITHDRAWN_BY.sharedSingleUsers); continue }
      caseTest(sdk, caseId, row, name, async () => {
        const { inside } = await load(sdk, copyFile(lib, FILES_MODULE))
        assert.equal(inside(root, file), expected)
      })
    }
  }

  // ---------------------------------------------------------------- SPLIT-EP-04: moved, behaviour unchanged (differential against BASE)
  // I-HOST renamed provider-sync-host's Fishball words to the neutral ones (design §1.0c:
  // dsh-sync-default, dsh-sync-default-model, dsh-provider-sync), so its "same constants as at BASE"
  // row is withdrawn; test/v3/dsh-instance/host SYNC names checks the new values.
  withdrawn(sdk, 'SPLIT-EP-04', SYNC_HOST_MODULE, `dsh-connector-shared/${SYNC_HOST_MODULE} has the same exports and constant values as fishball-shared/${SYNC_HOST_MODULE} at ${BASE.ref}`)
  // C-WIRE-2 (R-ARCH-08 strict): a moved module is compared at its new home (dshFile), behaviour unchanged.
  for (const module of DSH_MODULES.filter((m) => m !== SYNC_HOST_MODULE)) {
    caseTest(sdk, 'SPLIT-EP-04', module, `the DSH side's ${module} (${path.relative(REPO, dshFile(module))}) has the same exports and constant values as fishball-shared/${module} at ${BASE.ref}`, async (t) => {
      needLibrary(V3.dshShared)
      assert.deepEqual(surface(await load(sdk, dshFile(module))), surface(await baseModule(sdk, module)))
    })
  }
  // R-FIX-REDACT changed redaction on purpose, so this row's oracle is the requirements, no longer BASE.
  caseTest(sdk, 'SPLIT-EP-04', 'redact', 'redact masks every sample as the requirements say (Authorization, assignments, JSON, long runs at 31/32/33, paths, empty)', async (t) => {
    const now = (await load(sdk, libraryFile(V3.dshShared, REDACT))).redact
    for (const [text, expected] of REDACT_SAMPLES) assert.equal(now(text), expected, show(text))
    assert.equal(now(LONG_RUN.below), LONG_RUN.below, 'a 31-character run must stay unmasked')
    assert.notEqual(now(LONG_RUN.at), LONG_RUN.at, 'a 32-character run must be masked')
  })
  caseTest(sdk, 'SPLIT-EP-04', 'provider-sync', 'syncFingerprint and unsafeProfileReason answer as before', async (t) => {
    const now = await load(sdk, dshFile('provider-sync'))
    const before = await baseModule(sdk, 'provider-sync')
    for (const v of FINGERPRINT_SAMPLES) assert.equal(now.syncFingerprint(v), before.syncFingerprint(v), show(v))
    for (const p of PROFILE_SAMPLES) assert.deepEqual(outcome(() => now.unsafeProfileReason(p, true)), outcome(() => before.unsafeProfileReason(p, true)), show(p))
  })
  caseTest(sdk, 'SPLIT-EP-04', 'provider-sync-codec', 'safeCode and the frame codec (request, encode, decode, acceptRequest) answer as before', async (t) => {
    const now = await load(sdk, dshFile('provider-sync-codec'))
    const before = await baseModule(sdk, 'provider-sync-codec')
    for (const c of CODE_SAMPLES) assert.equal(now.safeCode(c), before.safeCode(c), show(c))
    const peer = Object.fromEntries(now.PROVIDER_SYNC_TARGET.identity.keys.map((k) => [k, 'fbtest-' + k]))
    const action = now.PROVIDER_SYNC_TARGET.actions.inventory
    const run = (m) => {
      const codec = m.createProviderSyncCodec()
      const frame = outcome(() => codec.request(action, peer, {}, 'fbtest-id'))
      const encoded = outcome(() => codec.encode(frame.value))
      return [frame, encoded, outcome(() => codec.acceptRequest(codec.decode(encoded.value))), outcome(() => codec.decode('{')), outcome(() => codec.request('fbtest-unknown', peer, {}, 'id'))]
    }
    assert.deepEqual(run(now), run(before))
  })
  // remove-v2-followups D14 deleted admin-protocol from dsh-connector-shared (its one user, the
  // instance's admin relay, went with I-READY), so there is no new module to compare with BASE.
  withdrawn(sdk, 'SPLIT-EP-04', ADMIN_PROTOCOL, `dsh-connector-shared/${ADMIN_PROTOCOL} has the same exports and constant values as fishball-shared/${ADMIN_PROTOCOL} at ${BASE.ref}`, WITHDRAWN_BY.adminProtocol)
  withdrawn(sdk, 'SPLIT-EP-04', ADMIN_PROTOCOL, 'refusal, refusalOf and the protocol validators answer as before', WITHDRAWN_BY.adminProtocol)

  // ---------------------------------------------------------------- SPLIT-UC-04: hosted-child placement (requirement 7)
  caseTest(sdk, 'SPLIT-UC-04', 'main', 'the child profile places both libraries as dependencies, never bundles, and excludes dsh-connector', async (t) => {
    const { tree, home } = placementTree(t)
    const { paths } = await compose(sdk, tree, home)
    const manifest = JSON.parse(fs.readFileSync(path.join(paths.profile, PLACED.manifest), 'utf8'))
    for (const name of PLACED.libraries) {
      for (const dir of PLACED.dirs) assert.ok(fs.existsSync(path.join(paths.profile, dir, name, PLACED.manifest)), `${name} not in ${dir}/`)
      assert.equal((manifest.dsh?.profile?.bundles ?? []).includes(name), false, name + ' is a profile bundle')
      assert.ok(Object.hasOwn(manifest.dependencies ?? {}, name), name + ' is not a profile dependency')
    }
    // I-READY removes the old contract-only connector, even when the source graph offers it.
    for (const dir of PLACED.dirs) assert.equal(fs.existsSync(path.join(paths.profile, dir, V3.connector.name)), false, V3.connector.name + ' was placed in ' + dir)
    assert.equal(Object.hasOwn(manifest.dependencies ?? {}, V3.connector.name), false)
    assert.equal((manifest.dsh?.profile?.bundles ?? []).includes(V3.connector.name), false)
  })
  caseTest(sdk, 'SPLIT-UC-04', 'main', "the placed dsh-connector-shared is exactly the library's shipped files", async (t) => {
    const { tree, home } = placementTree(t)
    const { paths } = await compose(sdk, tree, home)
    const shipped = listTree(V3.dshShared.dir).filter((f) => f === PLACED.manifest || readManifest(V3.dshShared.dir).files.some((e) => path.matchesGlob(f, e)))
    for (const dir of PLACED.dirs) assert.deepEqual(listTree(path.join(paths.profile, dir, V3.dshShared.name)), shipped, dir)
  })
  caseTest(sdk, 'SPLIT-UC-04', 'A1', "the placed fishball-shared is core's own copy, never one the instance's dependency graph resolves", async (t) => {
    const { tree, home, coreMarker, decoyMarker } = placementTree(t)
    const { paths } = await compose(sdk, tree, home)
    for (const dir of PLACED.dirs) {
      const placed = listTree(path.join(paths.profile, dir, V3.shared.name))
      assert.ok(placed.includes(coreMarker), `${dir}: not core's copy: ${show(placed)}`)
      assert.equal(placed.includes(decoyMarker), false, `${dir}: the instance graph's copy was placed`)
    }
  })
  caseTest(sdk, 'SPLIT-UC-04', 'ST', 'a second start on the same home places both libraries again, still beside the bundles and never as bundles', async (t) => {
    const { tree, home } = placementTree(t)
    await compose(sdk, tree, home)
    const { paths } = await compose(sdk, tree, home)
    const manifest = JSON.parse(fs.readFileSync(path.join(paths.profile, PLACED.manifest), 'utf8'))
    for (const name of PLACED.libraries) {
      for (const dir of PLACED.dirs) assert.ok(fs.existsSync(path.join(paths.profile, dir, name, PLACED.manifest)), `${name} not in ${dir}/`)
      assert.equal((manifest.dsh?.profile?.bundles ?? []).includes(name), false, name + ' is a profile bundle')
    }
  })
  // Placement's existing rule (I-PLACE): a source it cannot read refuses the start with a typed code. Requirement 7 adds
  // that core's library comes from core's location only, so with none there the instance's graph must not fill in.
  caseTest(sdk, 'SPLIT-UC-04', 'E1', "core's fishball-shared missing (and none in the instance's graph): composition is refused with a typed code", async (t) => {
    const { tree, home } = placementTree(t)
    fs.rmSync(path.join(tree, path.relative(REPO, V3.core.dir), 'node_modules'), { recursive: true, force: true })
    fs.rmSync(path.join(tree, 'node_modules', V3.shared.name), { recursive: true, force: true })
    await assert.rejects(compose(sdk, tree, home), (error) => typeof error?.code === 'string' && error.code.length > 0)
  })
}
