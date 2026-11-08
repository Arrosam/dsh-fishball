import { constants } from 'node:fs'
import { open, mkdir, lstat, realpath, rename, unlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { RUNTIME, RUNTIME_LIMITS, fail } from './constants.js'

export const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
export async function exists(file) {
  try { return await lstat(file) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
/** A real directory (not a link to one), owned by this user and closed to everyone else. */
function assertPrivate(info) {
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || info.uid !== process.getuid()) fail('UNSAFE_DIRECTORY', 'Attached directories must be owned private directories.')
}
export async function privateDirectory(directory) {
  try { await mkdir(directory, { mode: RUNTIME.privateDirectoryMode }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  assertPrivate(await lstat(directory))
  return directory
}
export async function readPrivate(file, limit = RUNTIME_LIMITS.maxMetadataBytes) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077) || info.size > limit) fail('UNSAFE_METADATA', 'Invalid private lifecycle metadata.')
    return await handle.readFile('utf8')
  } finally { await handle.close() }
}
// Buffers are written verbatim: copied code snapshots include binary assets, and a UTF-8
// round-trip would replace every non-UTF-8 byte and corrupt the file.
export async function writePrivate(file, value, exclusive = false) {
  const content = Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : JSON.stringify(value) + '\n'
  if (exclusive) {
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, RUNTIME.privateFileMode)
    try { await handle.writeFile(content); await handle.sync() } finally { await handle.close() }
    return
  }
  const temporary = file + '.' + randomUUID()
  await writePrivate(temporary, content, true)
  try { await rename(temporary, file) } catch (error) { await unlink(temporary).catch(() => {}); throw error }
}
export async function jsonPrivate(file) { return JSON.parse(await readPrivate(file)) }
export function validId(value) { return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) }
export function pathsFor(mainHome) {
  const root = path.join(mainHome, 'fishball', 'runtime')
  const home = path.join(root, 'dsh-home')
  return { mainHome, root, home, profile: path.join(home, 'profiles', RUNTIME.profileName), workspace: path.join(root, 'workspace'), osHome: path.join(root, 'os-home'), agentsHome: path.join(root, 'agents-home'), tmp: path.join(root, 'tmp'), launches: path.join(root, 'launches') }
}
/**
 * The layout for a canonical main home, and the runtime root's parent (`<home>/fishball`) if it
 * exists. The home and that parent must be their own real paths, so no symbolic link anywhere
 * above the root can send a later write or delete outside this home.
 */
async function homeLayout(mainHome) {
  if (!path.isAbsolute(mainHome) || await realpath(mainHome) !== mainHome) fail('INVALID_MAIN_HOME', 'Main home must be a canonical absolute directory.')
  const paths = pathsFor(mainHome)
  const parent = path.dirname(paths.root)
  const parentInfo = await exists(parent)
  if (parentInfo && (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || await realpath(parent) !== parent)) fail('UNSAFE_DIRECTORY')
  return { paths, parent, parentInfo }
}
/**
 * The runtime layout when its root already exists, or undefined when it does not; it creates
 * nothing (uninstall, design §0.10). The root must be a private directory of this user, not a
 * link; its owner marker is checked by prepareLayout afterwards.
 */
export async function existingLayout(mainHome) {
  const { paths, parentInfo } = await homeLayout(mainHome)
  if (!parentInfo) return undefined
  const rootInfo = await exists(paths.root)
  if (!rootInfo) return undefined
  assertPrivate(rootInfo)
  return paths
}
export async function prepareLayout(mainHome) {
  const { paths, parent, parentInfo } = await homeLayout(mainHome)
  if (!parentInfo) await privateDirectory(parent)
  const rootInfo = await exists(paths.root)
  if (!rootInfo) {
    await privateDirectory(paths.root)
    await writePrivate(path.join(paths.root, RUNTIME.marker), { format: RUNTIME.format, hostId: randomUUID(), mainHome }, true)
    await writePrivate(path.join(paths.root, RUNTIME.secret), randomBytes(RUNTIME.secretBytes).toString('hex'), true)
  }
  await privateDirectory(paths.root)
  const marker = await jsonPrivate(path.join(paths.root, RUNTIME.marker))
  if (marker.format !== RUNTIME.format || !validId(marker.hostId) || marker.mainHome !== mainHome) fail('UNOWNED_RUNTIME', 'Existing attached directory is not owned by this lifecycle.')
  const secret = await readPrivate(path.join(paths.root, RUNTIME.secret))
  if (!/^[a-f0-9]{64}$/.test(secret)) fail('UNSAFE_SECRET')
  for (const directory of [paths.home, paths.osHome, paths.agentsHome, paths.tmp, paths.workspace, paths.launches, path.join(paths.home, 'profiles'), paths.profile]) await privateDirectory(directory)
  return { paths, marker, secret }
}
export function launchPath(paths, instanceId) {
  if (!validId(instanceId)) fail('INVALID_INSTANCE')
  return path.join(paths.launches, instanceId)
}
export function snapshotPath(paths, instanceId) {
  if (!validId(instanceId)) fail('INVALID_INSTANCE')
  return path.join(paths.profile, RUNTIME.codeSnapshotPrefix + instanceId)
}
export async function removeLaunch(paths, record) {
  const directory = launchPath(paths, record.instanceId)
  await privateDirectory(directory)
  const owner = await jsonPrivate(path.join(directory, RUNTIME.marker))
  if (owner.instanceId !== record.instanceId || owner.hostId !== record.hostId) fail('UNOWNED_LAUNCH')
  const active = await jsonPrivate(path.join(paths.root, RUNTIME.active))
  if (active.instanceId !== record.instanceId || active.hostId !== record.hostId) fail('OWNERSHIP_CHANGED')
  // Atomic directory retirement elects one cleaner across concurrent main owners.
  // A loser cannot unlink a successor's active record after the winner starts it.
  const retired = directory + '.retired'
  await rename(directory, retired)
  const current = await jsonPrivate(path.join(paths.root, RUNTIME.active))
  if (current.instanceId !== record.instanceId || current.hostId !== record.hostId) fail('OWNERSHIP_CHANGED')
  await unlink(path.join(paths.root, RUNTIME.active))
  // No data/profile cleanup: only the exact dead instance's retired launch directory.
  // Instance-bound code snapshots stay in the profile; never broaden deletion into user state.
  await rm(retired, { recursive: true })
}
/**
 * Delete the runtime root and everything in it (uninstall, design §0.10). The caller has already
 * proved the tree is this home's (existingLayout, then prepareLayout's owner marker) and that its
 * child is dead. The root is first renamed beside itself, as removeLaunch retires a launch: the rename
 * is atomic, so the runtime path is either the whole proven tree or gone, and a later start or
 * reinstall never meets a half-deleted tree it cannot prove. `rm` with `recursive` then removes a
 * symbolic link itself, never what it points to, so nothing outside the root is reached. A crash
 * during that `rm` leaves only the renamed folder, which nothing reads.
 */
export async function removeRuntime(paths) {
  if (await realpath(paths.root) !== paths.root) fail('UNSAFE_DIRECTORY')
  const retired = paths.root + RUNTIME.retiredRootInfix + randomUUID()
  await rename(paths.root, retired)
  await rm(retired, { recursive: true })
}
export async function lifecycleLog(paths, code, limit) {
  // Deliberately log no exception messages, CLI output, URLs or protocol payloads.
  const allowed = new Set(['START', 'READY', 'REATTACH', 'DETACH', 'STOP', 'RECOVER', 'FAILED', 'CHILD_BOOT', 'CHILD_LISTEN', 'CHILD_READY', 'CHILD_FAILED'])
  if (!allowed.has(code)) return
  const file = path.join(paths.root, RUNTIME.log)
  let previous = ''
  if (await exists(file)) previous = await readPrivate(file, limit)
  const line = JSON.stringify({ time: new Date().toISOString(), code }) + '\n'
  const lines = (previous + line).split('\n')
  while (Buffer.byteLength(lines.join('\n')) > limit && lines.length > 1) lines.shift()
  await writePrivate(file, lines.join('\n'))
}
