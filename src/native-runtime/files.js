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
export async function privateDirectory(directory) {
  try { await mkdir(directory, { mode: RUNTIME.privateDirectoryMode }) } catch (error) { if (error.code !== 'EEXIST') throw error }
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || info.uid !== process.getuid()) fail('UNSAFE_DIRECTORY', 'Attached directories must be owned private directories.')
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
export async function writePrivate(file, value, exclusive = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value) + '\n'
  if (exclusive) {
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, RUNTIME.privateFileMode)
    try { await handle.writeFile(text); await handle.sync() } finally { await handle.close() }
    return
  }
  const temporary = file + '.' + randomUUID()
  await writePrivate(temporary, text, true)
  try { await rename(temporary, file) } catch (error) { await unlink(temporary).catch(() => {}); throw error }
}
export async function jsonPrivate(file) { return JSON.parse(await readPrivate(file)) }
export function validId(value) { return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) }
export function pathsFor(mainHome) {
  const root = path.join(mainHome, 'fishball', 'runtime')
  const home = path.join(root, 'dsh-home')
  return { mainHome, root, home, profile: path.join(home, 'profiles', RUNTIME.profileName), workspace: path.join(root, 'workspace'), osHome: path.join(root, 'os-home'), agentsHome: path.join(root, 'agents-home'), tmp: path.join(root, 'tmp'), launches: path.join(root, 'launches') }
}
export async function prepareLayout(mainHome) {
  if (!path.isAbsolute(mainHome) || await realpath(mainHome) !== mainHome) fail('INVALID_MAIN_HOME', 'Main home must be a canonical absolute directory.')
  const paths = pathsFor(mainHome)
  const parent = path.dirname(paths.root)
  const parentInfo = await exists(parent)
  if (parentInfo) {
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || await realpath(parent) !== parent) fail('UNSAFE_DIRECTORY')
  } else await privateDirectory(parent)
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
