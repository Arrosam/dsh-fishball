/**
 * How the placement cases reach the package and build their fixtures. Only public surfaces:
 * - shippedFiles, the export of src/native-runtime/placement.js whose contract is its JSDoc (the
 *   files a package ships); FBTEST_PLACEMENT_FROM names another dsh-instance folder to take it from,
 *   so the same cases can be run against the code before a fix (the fab3837 regression demo);
 * - composedProfile, the package export "./native-runtime": a start's layout, placement, profile
 *   load and launch overlay, with no child process;
 * - a fake dsh-fishball checkout that FISHBALL_REPO points at (never the real sibling checkout).
 */
import fs from 'node:fs'
import path from 'node:path'
import { bindRoot, importBound, importSdk, runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { tempRoot } from '@dsh-instance/test-helpers/scratch'
import { importInstance } from '../support/instance.mjs'
import { CHILD, FAKE_REPO, MANIFEST, PLACEMENT_FROM, PLACEMENT_MODULE, RUNTIME_MODULE, SET, SHIPPED_PRESETS } from './constants.mjs'

/** A POSIX fixture path in the platform's separator. */
export const native = (posix) => posix.split('/').join(path.sep)
const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)

/** Write one file, creating its folders; objects are written as JSON. */
export function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}

/** The placement module under test: this package's, or the one in FBTEST_PLACEMENT_FROM. */
export function placementModule(sdk) {
  const from = process.env[PLACEMENT_FROM]
  if (!from) return importInstance(sdk, PLACEMENT_MODULE)
  bindRoot(from)
  return importBound(sdk, path.join(from, PLACEMENT_MODULE))
}

/** The installed DSH package.json of one SDK: the installation the child runs. */
export const installAnchor = (sdk) => path.join(runtimeOf(sdk), ...CHILD.anchor)
export const bootOf = (sdk) => importSdk(sdk, CHILD.bootPackage)

/** <mainHome>/fishball/runtime/dsh-home/profiles/fishball */
export const childProfile = (mainHome) => path.join(mainHome, ...CHILD.profile)
export const profileManifest = (mainHome) => readJson(path.join(childProfile(mainHome), MANIFEST))
export const profileBundles = (mainHome) => profileManifest(mainHome)?.dsh?.profile?.bundles ?? []
export const fishballBundles = (mainHome) => profileBundles(mainHome).filter((name) => name.startsWith(SET.prefix))
export const placementRecordFile = (mainHome) => path.join(childProfile(mainHome), CHILD.record.file)
export const placementRecord = (mainHome) => readJson(placementRecordFile(mainHome))
export const placedCopy = (mainHome, name, dir) => path.join(childProfile(mainHome), dir, name)

/** Write the child profile's bundle list as DSH's plugin manager does while the child is down (an owner switch). */
export function setProfileBundles(mainHome, bundles) {
  const file = path.join(childProfile(mainHome), MANIFEST)
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  manifest.dsh.profile.bundles = [...bundles]
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
}

/**
 * Delete a placed package's copies while the child is down (both folders), leaving the profile's
 * bundle list as it is: whether it was on or off when deleted stays in that list.
 */
export function deleteCopies(mainHome, name) {
  const profile = childProfile(mainHome)
  for (const dir of CHILD.copyDirs) {
    const target = placedCopy(mainHome, name, dir)
    // Guard the recursive delete: a placed package folder directly inside the child profile.
    if (path.dirname(path.dirname(target)) !== profile || path.basename(target) !== name) throw new Error('unexpected placed copy ' + target)
    fs.rmSync(target, { recursive: true, force: true })
  }
}

/**
 * Every trace of a package `name` in a child profile: a vendor/ or node_modules/ entry, a
 * dependency, a bundle, a placement-record entry or an install spec `name@…`.
 */
export function tracesOf(mainHome, name) {
  const profile = childProfile(mainHome)
  const manifest = profileManifest(mainHome) ?? {}
  const record = placementRecord(mainHome)
  const copies = CHILD.copyDirs.flatMap((dir) => {
    const at = path.join(profile, dir)
    return fs.existsSync(at) ? fs.readdirSync(at).filter((entry) => entry.startsWith(name)).map((entry) => dir + '/' + entry) : []
  })
  return [
    ...copies,
    ...(Object.hasOwn(manifest.dependencies ?? {}, name) ? ['dependencies.' + name] : []),
    ...(profileBundles(mainHome).includes(name) ? ['dsh.profile.bundles holds ' + name] : []),
    ...(JSON.stringify(record ?? null).includes(name) ? [CHILD.record.file + ' names ' + name] : []),
    ...(JSON.stringify(manifest).includes(name + '@') ? ['an install spec ' + name + '@…'] : []),
  ]
}

/** The fake core's guard patch: what K3 says core's patch does to the DSH-shipped presets (switches them off). */
const corePatch = (presets) => presets.map((id) => `- { id: ${id}, disabled: true }`).join('\n') + '\n'

/**
 * A fake dsh-fishball checkout under `root`: packages/core is fishball-core (its files list holds
 * "ui/" and "!ui/tests/", as the real core's does), with its bundled library fishball-shared at
 * core's version in its own node_modules, plus sibling folders of the retired fishball-ui and the
 * shelved fishball-board, which must never be placed.
 * @returns {{repo: string, core: string}}
 */
export function fakeFishball(root, { presets = SHIPPED_PRESETS, engines = FAKE_REPO.engines } = {}) {
  const repo = path.join(root, FAKE_REPO.root)
  const packages = path.join(repo, FAKE_REPO.packages)
  const core = path.join(packages, FAKE_REPO.coreFolder)
  writeFile(path.join(repo, MANIFEST), { name: FAKE_REPO.root, private: true })
  writeFile(path.join(core, MANIFEST), {
    name: SET.core, version: SET.version, type: 'module', files: [...FAKE_REPO.coreFiles], engines,
    dependencies: { [SET.library]: SET.version }, bundleDependencies: [SET.library],
    dsh: { bundle: { patch: './' + FAKE_REPO.patch } },
  })
  writeFile(path.join(core, FAKE_REPO.patch), corePatch(presets))
  for (const rel of FAKE_REPO.coreTree) writeFile(path.join(core, native(rel)), '// ' + rel + '\n')
  const library = path.join(core, CHILD.copyDirs[1], SET.library)
  writeFile(path.join(library, MANIFEST), { name: SET.library, version: SET.version, type: 'module', files: [...FAKE_REPO.libraryFiles] })
  for (const rel of FAKE_REPO.libraryFiles) writeFile(path.join(library, rel), '// ' + rel + '\n')
  for (const { folder, name } of FAKE_REPO.others) {
    const dir = path.join(packages, folder)
    writeFile(path.join(dir, MANIFEST), { name, version: SET.version, files: [FAKE_REPO.patch], dsh: { bundle: { patch: './' + FAKE_REPO.patch } } })
    writeFile(path.join(dir, FAKE_REPO.patch), '[]\n')
  }
  return { repo, core }
}

/** Point FISHBALL_REPO at `repo` for this case; the previous value comes back at its cleanup. */
export function useFishballRepo(scope, repo) {
  const before = process.env[FAKE_REPO.env]
  process.env[FAKE_REPO.env] = repo
  scope.defer(() => { if (before === undefined) delete process.env[FAKE_REPO.env]; else process.env[FAKE_REPO.env] = before })
}

/**
 * One composition world: a fresh temp root with a fake dsh-fishball and a canonical main home.
 * `compose()` runs the package's composedProfile on that home (as many times as a case needs).
 */
export async function composeWorld(scope, sdk, fixture = {}) {
  const root = tempRoot(scope)
  const fake = fakeFishball(root, fixture)
  useFishballRepo(scope, fake.repo)
  const mainHome = path.join(root, 'main')
  fs.mkdirSync(mainHome)
  const { composedProfile } = await importInstance(sdk, RUNTIME_MODULE)
  return { root, ...fake, mainHome, compose: () => composedProfile({ mainHome, installAnchor: installAnchor(sdk) }) }
}

/**
 * The rows a launched child would run: its profile loaded by the SDK's own dsh-app-boot (bundle
 * layers, profile patch) and the launch overlay applied after them, as `dsh --patch` does.
 */
export async function effectiveRows(sdk, mainHome, overlay) {
  const boot = await bootOf(sdk)
  const profile = boot.loadProfileDirectory(CHILD.binName, childProfile(mainHome), installAnchor(sdk))
  return boot.composeEntries([...profile.layers.map((layer) => layer.patches), profile.patches, overlay])
}

/** Every row with `id` (or DSH package `name`), nested group and preset rows included. */
export function findRows(rows, match, out = []) {
  for (const row of rows) {
    if (row.id === match || row.name === match) out.push(row)
    if (row.group && Array.isArray(row.config)) findRows(row.config, match, out)
    if (Array.isArray(row.config?.plugins)) findRows(row.config.plugins, match, out)
  }
  return out
}
export const insertedOf = (ops) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
export const touchedOf = (ops) => ops.map((op) => op?.id).filter((id) => id !== undefined)
