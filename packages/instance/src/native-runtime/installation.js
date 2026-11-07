import { readFile, realpath, lstat, chmod, readdir, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { RUNTIME, HOST_LAUNCH, fail, NativeRuntimeError } from './constants.js'
import { inside, privateDirectory, writePrivate, exists, snapshotPath } from './files.js'

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
 * plus ELECTRON_RUN_AS_NODE=1 under an Electron host) and the isolated private set, which no main
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
 * existing manifest. The slim child must run the core only (§2.1, §2.3), so the configured base
 * bundle leads and the legacy Web bundle is dropped; every bundle the owner installed into the
 * child profile afterwards is kept in order. The replaced manifest's exact bytes are kept first
 * under a new private name (exclusive create, so no earlier backup is ever overwritten); a backup
 * that cannot be written stops the start before the manifest changes.
 */
async function slimProfileBundles(boot, profileDir) {
  const manifest = boot.readProfileManifest(RUNTIME.profileName, profileDir)
  const current = manifest.dsh?.profile?.bundles ?? []
  const retained = current.filter(name => !RUNTIME.profile.bundles.includes(name) && name !== RUNTIME.profile.legacyBundle)
  const bundles = [...RUNTIME.profile.bundles, ...retained]
  const unchanged = current.length === bundles.length && current.every((name, index) => name === bundles[index])
  if (unchanged) return
  const file = path.join(profileDir, RUNTIME.profile.manifest)
  const stamp = new Date().toISOString().replace(/[-:.]/g, '')
  await writePrivate(file + RUNTIME.profile.manifestBackupInfix + stamp, await readFile(file), true)
  boot.writeProfileBundles(profileDir, manifest, bundles)
}

export async function initializeProfile(paths, installation, preflight, mainWorkspaces) {
  const args = { mainHome: paths.mainHome, runtimeRoot: paths.root, workspace: paths.workspace, mainWorkspaces, installRoot: installation.installRoot, profileDir: paths.profile }
  // First reject ambient ancestry before importing even the installation's metadata API.
  await preflight(args)
  await validateStartupFiles(paths)
  const boot = await import(pathToFileURL(installation.bootPath).href)
  if (boot.resolveProfileDir(RUNTIME.profileName, paths.home) !== paths.profile) fail('PROFILE_PATH_MISMATCH')
  const fresh = !await exists(path.join(paths.profile, 'package.json'))
  boot.initProfile(paths.profile, RUNTIME.profile.bundles)
  if (fresh) await privateTree(paths.profile)
  await slimProfileBundles(boot, paths.profile)
  await validateStartupFiles(paths)
  const profile = boot.loadProfileDirectory('fishball', paths.profile, installation.installAnchor)
  if (profile.skippedBundles.length) fail('PROFILE_INCOMPATIBLE', 'Private profile contains missing or incompatible bundles.')
  const resolution = await boot.createRuntimeResolution({ installAnchor: installation.installAnchor, profile, home: paths.home })
  const result = await preflight({ ...args, resolution })
  const homePatches = boot.loadOptionalPatches('fishball', path.join(paths.home, boot.PROFILE_PATCH_FILENAME)) ?? []
  const entries = boot.composeEntries([...profile.layers.map(layer => layer.patches), profile.patches, homePatches])
  return { warnings: result.warnings ?? [], entries }
}

/** Snapshot only owned integration code, never the main profile or its dependency graph. */
export async function copyChildCode(paths, record) {
  const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
  // Native package interception covers the profile, not sibling launch metadata directories.
  // Direct placement keeps every existing ancestor within the completed profile preflight.
  const destination = snapshotPath(paths, record.instanceId)
  await privateDirectory(paths.profile)
  // Exclusive creation prevents reusing a partial or older instance's module tree.
  await mkdir(destination, { mode: RUNTIME.privateDirectoryMode })
  await writePrivate(path.join(destination, RUNTIME.marker), record, true)
  await writePrivate(path.join(destination, 'package.json'), { type: 'module', private: true }, true)
  // Lifecycle modules are JavaScript; the slim app tree also ships its UI assets, so that copy
  // keeps every file and its bytes unchanged: decoding as UTF-8 would corrupt PNG, font and other
  // binary assets (§2.4).
  const javascript = file => file.endsWith('.js')
  const everyFile = () => true
  async function copy(source, target, keep) {
    const info = await lstat(source)
    if (info.isSymbolicLink()) fail('UNSAFE_INTEGRATION_SOURCE')
    if (info.isDirectory()) {
      await mkdir(target, { mode: RUNTIME.privateDirectoryMode })
      for (const entry of await readdir(source)) await copy(path.join(source, entry), path.join(target, entry), keep)
    } else if (keep(source)) await writePrivate(target, await readFile(source), true)
  }
  await mkdir(path.join(destination, 'src'), { mode: RUNTIME.privateDirectoryMode })
  await copy(path.join(sourceRoot, 'native-child.js'), path.join(destination, 'native-child.js'), javascript)
  await copy(path.join(sourceRoot, 'src', 'native-runtime'), path.join(destination, 'src', 'native-runtime'), javascript)
  if (await exists(path.join(sourceRoot, 'src', 'native-control'))) await copy(path.join(sourceRoot, 'src', 'native-control'), path.join(destination, 'src', 'native-control'), javascript)
  await copy(path.join(sourceRoot, 'src', 'slim'), path.join(destination, 'src', 'slim'), everyFile)
  // M1: the instance's src/slim shims and persona import `fishball-connector/contract`. Node finds
  // it in the snapshot's own node_modules, inside the private profile the preflight already
  // accepted (DSH routes a bare name to a local node_modules under the profile natively). Only the
  // contract directory and a manifest with that one export are copied, never the rest of the
  // connector, so the child sees what a third-party instance sees. The source is the installed
  // export, resolved by the same name the shims use (JavaScript only, like the lifecycle code).
  const contract = RUNTIME.contractPackage
  const contractEntry = fileURLToPath(import.meta.resolve(contract.name + '/' + contract.directory))
  const contractTarget = path.join(destination, contract.modules, contract.name)
  await mkdir(path.join(destination, contract.modules), { mode: RUNTIME.privateDirectoryMode })
  await mkdir(contractTarget, { mode: RUNTIME.privateDirectoryMode })
  const contractExport = './' + contract.directory
  await writePrivate(path.join(contractTarget, contract.manifest), { name: contract.name, type: 'module', private: true, exports: { [contractExport]: contractExport + '/' + path.basename(contractEntry) } }, true)
  await copy(path.dirname(contractEntry), path.join(contractTarget, contract.directory), javascript)
  // T07 registers Fishball's persona from src/persona.js in the chat agent's scope; its text
  // dependencies (PILE_NOTE, ANSWER_PLACE) are the contract's, copied above.
  await copy(path.join(sourceRoot, 'src', 'persona.js'), path.join(destination, 'src', 'persona.js'), javascript)
  // T16's child target imports the shared preview/confirm engine and dynamically imports the
  // pi-ai host adapter beside it (src/slim/child/provider-sync-target.js: '../../provider-sync.js').
  // Both modules ship with the slim tree so the target applies the same reviewed rules as the main host.
  await copy(path.join(sourceRoot, 'src', 'provider-sync.js'), path.join(destination, 'src', 'provider-sync.js'), javascript)
  await copy(path.join(sourceRoot, 'src', 'provider-sync-host.js'), path.join(destination, 'src', 'provider-sync-host.js'), javascript)
  // Only so the snapshot's copy of src/slim/host/admin.js has no dangling import; the list reaches the page through the main-side relay (admin.plugins.get), never from the child.
  await copy(path.join(sourceRoot, 'src', 'recommended.js'), path.join(destination, 'src', 'recommended.js'), javascript)
  return path.join(destination, 'native-child.js')
}
