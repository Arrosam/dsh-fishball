/**
 * The one place that binds the I-PLACE cases to the instance's placement (the seam the I-PLACE dev
 * session relayed through Fishball, 2026-11-15; constants.mjs RELAYED). If the surface differs,
 * only this file is adapted; no case changes.
 *
 *   childProfile(H)            <H>/fishball/runtime/dsh-home/profiles/fishball
 *   placementRecord(H)         {format: 1, placed: [names]} from fishball-placement.json (mode 0600),
 *                              or null before the first placement. A name is listed once its
 *                              first placement completed. On/off is NOT in the record: it is the
 *                              child profile's `dsh.profile.bundles`.
 *   profileBundles(H)          the child profile's `dsh.profile.bundles`
 *   launchOverlays(H)          every live start's ops from <H>/fishball/runtime/launches/<id>/launch.patch.yml
 *                              (a JSON array of patch ops, removed when that child stops)
 *   launchOverlayExport()      an async `launchOverlay(paths, …)` whose ops come from the relayed
 *                              `composedProfile({mainHome: paths.mainHome, installAnchor})` of
 *                              fishball-instance/native-runtime (dev a10a6774); the V2 pure
 *                              `launchOverlay(…, entries)` refused an empty `entries` list
 *                              (UNSUPPORTED_PROFILE)
 *   placedCopy(H, name, dir)   <profile>/<dir>/<name> for dir in vendor, node_modules
 *   blockedBy(status)          the bundle a PROFILE_INCOMPATIBLE start names: K3 ChildStatus `plugin`
 *                              (PROPOSED) when present, else the name in the relayed message
 *                              "Enabled bundles cannot load: <name> (<reason>)" (dev 6d13f6a1)
 *
 * Every read is of a file the instance writes or of a public export: no module of the placement is
 * imported other than the relayed `composedProfile`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SDK, V3 } from '../shared/constants.mjs'
import { RELAYED } from './constants.mjs'

/**
 * The composedProfile seam (dev a10a6774, relayed by Fishball 2026-11-15): its export name, the
 * SDK's dsh package.json as the install anchor, and the test file name that carries the SDK.
 */
const COMPOSE = Object.freeze({
  name: 'composedProfile',
  anchor: Object.freeze(['node_modules', '@deepseek-ai', 'dsh', 'package.json']),
  sdkFile: /^sdk-(.+)\.test\.mjs$/,
})

export const childProfile = (home) => path.join(home, ...RELAYED.childProfile)
/** The child's own DSH home (the profile's `profiles/<name>` parent's parent). */
export const childHome = (home) => path.dirname(path.dirname(childProfile(home)))
export const placementFile = (home) => path.join(childProfile(home), RELAYED.record.file)

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)

export function placementRecord(home) {
  return readJson(placementFile(home))
}
export const placementMode = (home) => fs.statSync(placementFile(home)).mode & 0o777

export function profileManifest(home) {
  return readJson(path.join(childProfile(home), 'package.json'))
}
export const profileBundles = (home) => profileManifest(home)?.dsh?.profile?.bundles ?? []

/** Write the child profile's bundle list as DSH's plugin manager would while the child is down (an owner switch). */
export function setProfileBundles(home, bundles) {
  const file = path.join(childProfile(home), 'package.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  manifest.dsh.profile.bundles = [...bundles]
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
}

/** Every live start's launch overlay ops (one array per launch folder). */
export function launchOverlays(home) {
  const dir = path.join(home, ...RELAYED.launches)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).map((id) => path.join(dir, id, RELAYED.launchFile)).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
}

/** The SDK this test process runs: the file is `sdk-<version>.test.mjs` (one process per file under node --test). */
function processSdk() {
  const match = COMPOSE.sdkFile.exec(path.basename(process.argv[1] ?? ''))
  if (!match) throw new Error('cannot tell the SDK from the test file ' + process.argv[1])
  return match[1]
}

/**
 * The launch overlay a start would write, from the relayed `composedProfile` (dev a10a6774): it lays
 * out, places and loads the child profile under `mainHome` and returns `{paths, entries, overlay,
 * record}`, creating no launch directory and starting no process. The cases call the result with
 * the V2 `launchOverlay` arguments; only `paths.mainHome` is used, made canonical and created here
 * (composedProfile requires a canonical realpath directory). The SDK's dsh package.json is the
 * install anchor.
 */
export async function launchOverlayExport() {
  const module = await import(pathToFileURL(path.join(V3.instance.dir, ...RELAYED.overlayModule.file)).href)
  const composedProfile = module[COMPOSE.name]
  const installAnchor = path.join(SDK.versionsDir, processSdk(), ...COMPOSE.anchor)
  return async function launchOverlay(paths) {
    fs.mkdirSync(paths.mainHome, { recursive: true })
    const { overlay } = await composedProfile({ mainHome: fs.realpathSync(paths.mainHome), installAnchor })
    return overlay
  }
}

export const placedCopy = (home, name, dir) => path.join(childProfile(home), dir, name)

export function blockedBy(status) {
  if (typeof status?.[RELAYED.blocked.field] === 'string') return status[RELAYED.blocked.field]
  for (const text of RELAYED.blocked.texts.map((k) => status?.[k]).filter((v) => typeof v === 'string')) {
    const match = RELAYED.blocked.message.exec(text)
    if (match) return match[1]
  }
  return undefined
}

/** Remove a placed package from the child profile while the child is down, as a native remove does (dependency and both copies). */
export function removePlaced(home, name) {
  const profile = childProfile(home)
  const file = path.join(profile, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete manifest.dependencies?.[name]
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((b) => b !== name)
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  for (const dir of RELAYED.copyDirs) {
    const target = placedCopy(home, name, dir)
    // Guard the one recursive delete: a placed package folder directly inside the child profile.
    if (path.dirname(path.dirname(target)) !== profile || path.basename(target) !== name) throw new Error('unexpected placed copy ' + target)
    fs.rmSync(target, { recursive: true, force: true })
  }
}
