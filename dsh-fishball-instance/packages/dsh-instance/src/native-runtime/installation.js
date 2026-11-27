import { readFile, realpath, lstat, chmod, readdir, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { RUNTIME, PLACEMENT, HOST_LAUNCH, fail, NativeRuntimeError } from './constants.js'
import { privateDirectory, writePrivate, exists, snapshotPath, writeProfileBundles, sameBundles } from './files.js'
import { inside } from '../lib/files.js'
import { declaredLiveLinks, placeBundles, snapshotLifecycle } from './placement.js'

export async function resolveInstallation(installAnchor) {
  if (typeof installAnchor !== 'string' || !path.isAbsolute(installAnchor)) fail('INVALID_INSTALLATION')
  const anchor = await realpath(installAnchor)
  const manifest = JSON.parse(await readFile(anchor, 'utf8'))
  if (manifest.name !== RUNTIME.packageName || typeof manifest.version !== 'string' || typeof manifest.bin?.dsh !== 'string') fail('INVALID_INSTALLATION')
  const directory = path.dirname(anchor)
  const bin = await realpath(path.resolve(directory, manifest.bin.dsh))
  if (!inside(directory, bin) || !(await lstat(bin)).isFile()) fail('INVALID_BIN')
  // Both flat and pnpm installations are rooted above their outermost node_modules.
  const parts = directory.split(path.sep)
  const index = parts.indexOf('node_modules')
  if (index < 1) fail('UNSUPPORTED_INSTALLATION', 'An installed DSH package anchor is required.')
  const installRoot = parts.slice(0, index).join(path.sep) || path.sep
  const require = createRequire(anchor)
  const bootPath = await realpath(require.resolve('@deepseek-ai/dsh-app-boot'))
  if (!inside(installRoot, bootPath)) fail('INVALID_BOOT_API')
  return { installAnchor: anchor, installRoot, bin, version: manifest.version, bootPath }
}

/**
 * The child's exec arguments: the main process's own, in order, without debugger flags
 * (HOST_LAUNCH). The child's preload and DSH arguments follow them.
 * @param {string[]} execArgv - the main process's `process.execArgv`.
 * @returns {string[]} a new array; the input is not changed.
 */
export function childExecArgv(execArgv) {
  const kept = []
  for (let index = 0; index < execArgv.length; index++) {
    const argument = execArgv[index]
    if (!HOST_LAUNCH.debugFlagPrefixes.some(prefix => argument.startsWith(prefix))) kept.push(argument)
    else if (HOST_LAUNCH.debugFlagsWithValue.includes(argument)) index++
  }
  return kept
}

/**
 * The child's whole environment: the main process's runtime variables (HOST_LAUNCH.runtimeEnv,
 * plus ELECTRON_RUN_AS_NODE=1 under an Electron host only) and the isolated private set, which no main
 * value can override. PATH follows the main process's: its absolute entries in order, because a
 * relative entry would resolve against the child's private workspace instead.
 * @param paths - the runtime's private layout (files.js pathsFor).
 * @param host - the running main process (`process`, or a stand-in with execPath/env/versions).
 */
export function isolatedEnvironment(paths, host) {
  const env = {}
  for (const name of HOST_LAUNCH.runtimeEnv) if (host.env[name] !== undefined) env[name] = host.env[name]
  if (host.versions.electron) env[HOST_LAUNCH.electronAsNode.name] = HOST_LAUNCH.electronAsNode.value
  Object.assign(env, {
    PATH: (host.env.PATH ?? '').split(path.delimiter).filter(part => path.isAbsolute(part)).join(path.delimiter),
    HOME: paths.osHome,
    USERPROFILE: paths.osHome,
    DSH_HOME: paths.home,
    DSH_AGENTS_HOME: paths.agentsHome,
    XDG_CONFIG_HOME: path.join(paths.osHome, 'config'),
    XDG_CACHE_HOME: path.join(paths.osHome, 'cache'),
    XDG_DATA_HOME: path.join(paths.osHome, 'data'),
    XDG_STATE_HOME: path.join(paths.osHome, 'state'),
    APPDATA: path.join(paths.osHome, 'config'),
    LOCALAPPDATA: path.join(paths.osHome, 'data'),
    TMPDIR: paths.tmp,
    TMP: paths.tmp,
    TEMP: paths.tmp,
    DSH_TELEMETRY_DISABLED: '1',
  })
  return env
}

export async function runProbe(spawn, command, args, options, timeoutMs, maxBytes) {
  return new Promise((resolve, reject) => {
    let child
    try { child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { reject(new NativeRuntimeError('PROBE_FAILED')); return }
    let output = ''
    let done = false
    let failure
    const finish = (error, code) => {
      if (done) return
      done = true; clearTimeout(timer)
      if (error) reject(error); else resolve({ code, output })
    }
    const timer = setTimeout(() => { failure = new NativeRuntimeError('PROBE_TIMEOUT'); child.kill('SIGKILL') }, timeoutMs)
    child.on('error', () => { failure = new NativeRuntimeError('PROBE_FAILED') })
    child.stdout.on('data', data => {
      output += data.toString('utf8')
      if (Buffer.byteLength(output) > maxBytes) { failure = new NativeRuntimeError('PROBE_OUTPUT_LIMIT'); child.kill('SIGKILL') }
    })
    // close commits both process exit and complete stdout; timeout also waits for owned-handle cleanup.
    child.on('close', code => finish(failure, code))
  })
}

async function privateTree(directory) {
  const info = await lstat(directory)
  if (info.isSymbolicLink()) fail('UNSAFE_PROFILE')
  if (info.isDirectory()) {
    await chmod(directory, RUNTIME.privateDirectoryMode)
    for (const entry of await readdir(directory)) await privateTree(path.join(directory, entry))
  } else if (info.isFile()) await chmod(directory, RUNTIME.privateFileMode)
}

async function validateStartupFiles(paths) {
  // Validate file identities only, never read credential/config contents here.
  const files = [
    [paths.profile, ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', '.npmrc']],
    [paths.home, ['.env', '.credentials.yaml', 'settings.yaml', 'settings.yml', 'cordis.patch.yml']],
    [paths.workspace, ['.env']],
  ]
  for (const [root, names] of files) for (const name of names) {
    const info = await exists(path.join(root, name))
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid())) fail('UNSAFE_STARTUP_FILE', 'Private startup files must be owned regular unlinked files.')
  }
}

/**
 * The attached profile was first created with the Web bundle, and initProfile never rewrites an
 * existing manifest. Restore the native Web bundle after base; every bundle installed into the
 * child profile afterwards is kept in order (files.js writeProfileBundles keeps a backup).
 */
async function nativeProfileBundles(boot, profileDir) {
  const manifest = boot.readProfileManifest(RUNTIME.profileName, profileDir)
  const current = manifest.dsh?.profile?.bundles ?? []
  const retained = current.filter(name => !RUNTIME.profile.bundles.includes(name))
  const bundles = [...RUNTIME.profile.bundles, ...retained]
  if (sameBundles(current, bundles)) return
  await writeProfileBundles(boot, profileDir, manifest, bundles)
}

export async function initializeProfile(paths, installation, preflight, mainWorkspaces, signal, fishballLiveRepo) {
  const args = { mainHome: paths.mainHome, runtimeRoot: paths.root, workspace: paths.workspace, mainWorkspaces, installRoot: installation.installRoot, profileDir: paths.profile }
  // The layout is already privately owned. Validate the startup manifest before reading its
  // exact prior live-link declarations, then reject ambient ancestry before importing DSH.
  await validateStartupFiles(paths)
  await preflight({ ...args, replacingLinks: await declaredLiveLinks(paths.profile) })
  const boot = await import(pathToFileURL(installation.bootPath).href)
  if (boot.resolveProfileDir(RUNTIME.profileName, paths.home) !== paths.profile) fail('PROFILE_PATH_MISMATCH')
  const fresh = !await exists(path.join(paths.profile, 'package.json'))
  boot.initProfile(paths.profile, RUNTIME.profile.bundles)
  if (fresh) await privateTree(paths.profile)
  await nativeProfileBundles(boot, paths.profile)
  // The plugin set, placed before the profile loads (design §8.1).
  const liveLinks = await placeBundles(paths, boot, installation, signal, fishballLiveRepo)
  await validateStartupFiles(paths)
  const profile = boot.loadProfileDirectory('fishball', paths.profile, installation.installAnchor)
  // Every enabled bundle DSH skipped blocks the start, named with DSH's reason (R-BND-03); the
  // host's launch detail bounds and redacts that message before any page shows it.
  if (profile.skippedBundles.length) {
    // The first blocking bundle's name travels as a field (K3 `ChildStatus.plugin`, HOST-ST-01 #3);
    // the message names them all, with DSH's reasons.
    throw Object.assign(new NativeRuntimeError(PLACEMENT.code.incompatible, PLACEMENT.incompatible(profile.skippedBundles)), { [PLACEMENT.pluginField]: profile.skippedBundles[0].packageName })
  }
  const resolution = await boot.createRuntimeResolution({ installAnchor: installation.installAnchor, profile, home: paths.home })
  const result = await preflight({ ...args, resolution, liveLinks })
  const homePatches = boot.loadOptionalPatches('fishball', path.join(paths.home, boot.PROFILE_PATCH_FILENAME)) ?? []
  const entries = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, homePatches])
  return { warnings: result.warnings ?? [], entries, hmrRoots: [...liveLinks.values()] }
}

/**
 * Snapshot only the instance's own lifecycle code, never the main profile or its dependency graph.
 * The plugin set and its libraries are placed bundles now
 * (placement.js), which the lifecycle modules find through the profile's node_modules.
 */
export async function copyChildCode(paths, record) {
  // Native package interception covers the profile, not sibling launch metadata directories.
  // Direct placement keeps every existing ancestor within the completed profile preflight.
  const destination = snapshotPath(paths, record.instanceId)
  await privateDirectory(paths.profile)
  // Exclusive creation prevents reusing a partial or older instance's module tree.
  await mkdir(destination, { mode: RUNTIME.privateDirectoryMode })
  await writePrivate(path.join(destination, RUNTIME.marker), record, true)
  await writePrivate(path.join(destination, 'package.json'), { type: 'module', private: true }, true)
  return snapshotLifecycle(destination)
}
