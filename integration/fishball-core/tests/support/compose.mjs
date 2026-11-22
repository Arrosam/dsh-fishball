/**
 * A hosted child's composition with the REAL fishball-core of the sibling dsh-fishball checkout.
 *
 * - `composeChild(sdk, scope)`: the instance's public `composedProfile` (its manifest export
 *   './native-runtime') on a fresh canonical main home: the same layout, placement, profile load
 *   and launch overlay a start runs, with no child process. The instance finds fishball-core
 *   through FISHBALL_REPO (README "Placement": the sibling workspace folders of a source checkout).
 * - `effective(sdk, composed, {profileLayer})`: the effective rows, composed with the SDK's own
 *   dsh-app-boot in the order a start applies them (design §5a.2): the bundle layers and the
 *   profile's own patch (composedProfile's `entries`), then the launch overlay. `profileLayer` is
 *   the owner's profile patch, written to the child profile's patch file before the compose.
 * - `corePatch(sdk)`: core's bundle patch as that SDK's DSH parses it (loadOverlayPatches).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from '@dsh-instance/test-helpers/constants'
import { importBound, importSdk, runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { tempRoot } from '@dsh-instance/test-helpers/scratch'
import { SIBLING, siblingPackage, siblingRepo } from '@dsh-instance/test-helpers/siblings'

export const INSTANCE_DIR = path.join(REPO, 'packages', 'dsh-instance')
export const CORE = Object.freeze({ folder: 'core', name: 'fishball-core', manifest: 'package.json' })
const EXPORT = Object.freeze({ subpath: './native-runtime', name: 'composedProfile' })
const ANCHOR = Object.freeze(['@deepseek-ai', 'dsh', 'package.json'])
const BOOT = '@deepseek-ai/dsh-app-boot'
/** The child profile under the main home (README "The child"). */
export const CHILD_PROFILE = Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball'])

export const coreDir = () => siblingPackage('fishball', CORE.folder)
export const coreManifest = () => JSON.parse(fs.readFileSync(path.join(coreDir(), CORE.manifest), 'utf8'))
export const bootOf = (sdk) => importSdk(sdk, BOOT)

/** The instance's './native-runtime' export, read from its manifest (never a deep path). */
async function nativeRuntime(sdk) {
  const manifest = JSON.parse(fs.readFileSync(path.join(INSTANCE_DIR, 'package.json'), 'utf8'))
  return importBound(sdk, path.join(INSTANCE_DIR, manifest.exports[EXPORT.subpath]))
}

/** composedProfile on a fresh main home under `scope`'s temp root: {mainHome, profile, paths, entries, overlay, record}. */
export async function composeChild(sdk, scope, { mainHome } = {}) {
  process.env[SIBLING.fishball.env] = siblingRepo('fishball')
  const home = mainHome ?? fs.realpathSync(tempRoot(scope))
  const profile = path.join(home, ...CHILD_PROFILE)
  const mod = await nativeRuntime(sdk)
  const out = await mod[EXPORT.name]({ mainHome: home, installAnchor: path.join(runtimeOf(sdk), ...ANCHOR) })
  return { mainHome: home, profile, ...out }
}

/** The effective rows of a composition (bundle layers + profile patch, then the launch overlay). */
export async function effective(sdk, composed) {
  const boot = await bootOf(sdk)
  return boot.composeEntries([[{ insert: composed.entries }], composed.overlay])
}

/** Write the owner's profile patch (the child profile's own patch file, as DSH saves it) before a compose. */
export async function ownerPatch(sdk, profile, rows) {
  const boot = await bootOf(sdk)
  fs.writeFileSync(path.join(profile, boot.PROFILE_PATCH_FILENAME), JSON.stringify(rows))
}

/** Core's bundle patch as DSH parses it: its patch ops. */
export async function corePatch(sdk) {
  const boot = await bootOf(sdk)
  const manifest = coreManifest()
  return boot.bundlePatchPaths(coreDir(), manifest.dsh.bundle).flatMap((file) => boot.loadOverlayPatches('fbtest', file))
}
/** Every row core's patch inserts (top level). */
export const insertedBy = (patches) => patches.flatMap((p) => p?.insert ?? [])

/** Every row with `id`, nested group and preset rows included. */
export function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row.id === id) out.push(row)
    if (row.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}

/** A path row's file (file: URL or absolute path), or null for a package specifier. */
export function rowFile(name) {
  if (typeof name !== 'string') return null
  if (name.startsWith('file:')) return new URL(name).pathname
  return path.isAbsolute(name) ? name : null
}
/** The folder of the nearest package.json at or above `file`. */
export function nearestManifestDir(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, CORE.manifest))) return fs.realpathSync(dir)
    if (path.dirname(dir) === dir) return null
  }
}
export { pathToFileURL }