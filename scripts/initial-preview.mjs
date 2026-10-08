import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const profileName = 'df-initial-preview';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const refuse = code => { throw new Error(code); };
let ownedLock;
function releaseLock() {
  if (!ownedLock) return;
  try {
    regular(ownedLock.path);
    if (JSON.parse(readFileSync(ownedLock.path)).launchId === ownedLock.launchId) unlinkSync(ownedLock.path);
  } catch {}
  ownedLock = undefined;
}

function options(argv) {
  const result = { stateRoot: join(root, '.runtime/initial-preview') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') return { help: true };
    const field = { '--host-root': 'hostRoot', '--state-root': 'stateRoot' }[argv[i]];
    if (!field || !argv[i + 1] || argv[i + 1].startsWith('--') || (field === 'hostRoot' && result.hostRoot)) refuse('ARGUMENT_INVALID');
    result[field] = resolve(argv[++i]);
  }
  if (!result.hostRoot) refuse('HOST_ROOT_REQUIRED');
  return result;
}

function directory(path, create = false) {
  if (create && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const fact = lstatSync(path);
  if (!fact.isDirectory() || fact.isSymbolicLink() || realpathSync(path) !== path || fact.uid !== process.getuid() || (fact.mode & 0o022)) refuse('DIRECTORY_UNSAFE');
}

function regular(path) {
  const fact = lstatSync(path);
  if (!fact.isFile() || fact.isSymbolicLink() || fact.nlink !== 1 || fact.uid !== process.getuid() || realpathSync(path) !== path || (fact.mode & 0o022)) refuse('FILE_UNSAFE');
}

function writeOwned(path, value) {
  if (existsSync(path)) regular(path);
  const temporary = path + '.' + randomUUID() + '.tmp';
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); }
  finally { closeSync(fd); }
  renameSync(temporary, path);
}

function alias(path, target) {
  if (existsSync(path)) {
    if (!lstatSync(path).isSymbolicLink() || realpathSync(path) !== target) refuse('PEER_ALIAS_CONFLICT');
  } else {
    // lstat also refuses a dangling pre-existing link rather than replacing it.
    try { lstatSync(path); refuse('PEER_ALIAS_CONFLICT'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    symlinkSync(target, path, 'dir');
  }
}

function prepare({ hostRoot, stateRoot }) {
  if (process.version !== 'v22.22.2') refuse('NODE_22_22_2_REQUIRED');
  directory(hostRoot);
  const hostModules = join(hostRoot, 'node_modules');
  const packageInfo = JSON.parse(readFileSync(join(root, 'package.json')));
  const native = JSON.parse(readFileSync(join(root, 'native-source-manifest.json')));
  if (packageInfo.name !== 'dsh-fishball' || packageInfo.version !== '0.1.0-preview.1' || hash(join(hostRoot, 'package-lock.json')) !== native.host.lockDigest || hash(join(root, 'scripts/dsh-web-runtime-lock.json')) !== native.host.lockDigest) refuse('HOST_OR_PACKAGE_PIN_MISMATCH');
  for (const entry of native.host.modules) {
    const packagePath = join(hostModules, entry.name);
    if (realpathSync(packagePath) !== packagePath) refuse('HOST_LAYOUT_UNSUPPORTED');
    const metadata = JSON.parse(readFileSync(join(packagePath, 'package.json')));
    if (metadata.name !== entry.name || metadata.version !== entry.version) refuse('HOST_VERSION_MISMATCH');
    for (const file of entry.files) if (hash(join(packagePath, file.path)) !== file.digest) refuse('HOST_SOURCE_PIN_MISMATCH');
  }
  // Resolve peers for both the checkout and an extracted standalone package.
  const peerRoot = join(root, 'node_modules');
  directory(peerRoot, true);
  const scope = join(peerRoot, '@deepseek-ai');
  // An existing development namespace link is valid only to this exact host.
  if (existsSync(scope) && lstatSync(scope).isSymbolicLink()) {
    if (realpathSync(scope) !== join(hostModules, '@deepseek-ai')) refuse('PEER_ALIAS_CONFLICT');
  } else {
    directory(scope, true);
    for (const peer of Object.keys(packageInfo.peerDependencies)) {
      const target = join(hostModules, peer);
      if (realpathSync(target) !== target) refuse('HOST_LAYOUT_UNSUPPORTED');
      alias(join(scope, peer.split('/')[1]), target);
    }
  }
  if (!isAbsolute(stateRoot) || stateRoot === root || stateRoot === hostRoot || stateRoot.startsWith(hostRoot + '/')) refuse('STATE_ROOT_INVALID');
  directory(dirname(stateRoot), true);
  const marker = join(stateRoot, 'owner.json');
  const owner = { schema: 'df.initial-preview-owner/v1', packageRoot: root, hostRoot, uid: process.getuid(), profile: profileName };
  if (existsSync(stateRoot)) {
    directory(stateRoot);
    regular(marker);
    if (JSON.stringify(JSON.parse(readFileSync(marker))) !== JSON.stringify(owner)) refuse('STATE_ROOT_NOT_OWNED');
  } else {
    directory(stateRoot, true);
    writeFileSync(marker, JSON.stringify(owner) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const paths = { stateRoot, home: join(stateRoot, 'home'), agents: join(stateRoot, 'agents-home'), workspace: join(stateRoot, 'workspace'), private: join(stateRoot, 'private') };
  for (const path of Object.values(paths)) {
    directory(path, true);
    if (lstatSync(path).mode & 0o077) refuse('PREVIEW_DIRECTORY_NOT_PRIVATE');
  }
  // Claim before changing this profile. A crash-left lock is never auto-replayed.
  const launchId = randomUUID();
  const lockPath = join(paths.private, 'launcher.lock');
  const lock = openSync(lockPath, 'wx', 0o600);
  ownedLock = { path: lockPath, launchId };
  try { writeFileSync(lock, JSON.stringify({ pid: process.pid, launchId }) + '\n'); }
  finally { closeSync(lock); }
  directory(join(paths.home, 'profiles'), true);
  const profile = join(paths.home, 'profiles', profileName);
  directory(profile, true);
  paths.data = join(profile, 'df-data');
  directory(paths.data, true);
  if (lstatSync(paths.data).mode & 0o077) refuse('PREVIEW_DIRECTORY_NOT_PRIVATE');
  const localModules = join(profile, 'node_modules');
  directory(localModules, true);
  alias(join(localModules, 'dsh-fishball'), root);
  writeOwned(join(profile, 'package.json'), { name: 'dsh-profile-df-initial-preview', private: true, dependencies: { 'dsh-fishball': packageInfo.version }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } });
  const selection = { provider: 'df-testing-local', model: 'df-testing-worker-v1', agentPreset: 'df-initial-preview-read-only', reasoningEffort: 'deterministic', maxOutputTokens: 128 };
  const installed = { databasePath: join(paths.data, 'runtime.sqlite'), limits: { queueCapacity: 4, maxActive: 1, maxAttempts: 1, maxTasks: 64, maxActionsPerTask: 16, maxEventsPerTask: 256, maxMetadataBytes: 4096 }, memory: { enabled: true, byteLimit: 16384, tokenLimit: 16384 }, worker: { enabled: true, selection, environment: { root: paths.workspace, cwd: paths.workspace }, persistence: { directory: join(paths.data, 'df-sessions-initial-preview'), compression: 'none', retention: 'owner-managed' }, bounds: { requestBytes: 16384, resultBytes: 1024 }, policy: { maxRuntimeMs: 60000, maxUsageUnits: 65536, maxCostEstimateMicros: 0 }, charges: { runtimeMs: 15000, usageUnits: 32768 }, previewTtlMs: 60000, grantTtlMs: 60000 }, audit: { enabled: false }, automation: { enabled: false }, results: { enabled: false } };
  const disabled = ['deepseek-account', 'llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'account-controller', 'ui-settings-account', 'session-title-llm', 'session-telemetry-otel', 'desktop-product-telemetry', 'product-analytics', 'otel', 'llm-retry', 'web-search-deepseek', 'web-fetch-http', 'tool-web', 'open-in-app', 'ui-open-in-app', 'directory-picker', 'office-to-pdf', 'workspace-changes', 'preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'];
  const accessPath = join(paths.private, `access-${launchId}.json`);
  const readyPath = join(paths.private, `ready-${launchId}.json`);
  const patch = [
    ...disabled.map(id => ({ id, disabled: true })),
    { id: 'webserver', config: { host: '127.0.0.1', port: 3091, compression: 'none' } },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: true, trustedHosts: [] } },
    // Preserve the original Connection plugin; both dependencies belong to it.
    { id: 'connection', inject: ['webRuntime', 'webServer'], config: { trustedHosts: [], cookieMaxAgeDays: 1, recovery: {} } },
    { id: 'credentials', config: { dshHome: paths.home, path: join(paths.home, '.credentials.yaml'), watch: true } },
    { id: 'session-persistence-jsonl', config: { root: installed.worker.persistence.directory, compression: installed.worker.persistence.compression } },
    { id: 'agent-loop', config: { agents: [] } },
    { id: 'approval', config: { policy: 'never' } },
    { id: 'agent-default-model', config: { provider: selection.provider, model: selection.model } },
    { id: 'agent-preset-registry', config: { default: selection.agentPreset } },
    { insert: [
      { id: 'df-initial-preview-testing', name: 'dsh-fishball/testing-provider', config: {} },
      { id: 'df-initial-preview-installed', name: 'dsh-fishball/installed', config: installed },
      { id: 'df-initial-preview-host', name: join(root, 'scripts/initial-preview-host.mjs'), config: { profile, accessPath, readyPath, packageRoot: root, packageVersion: packageInfo.version, clientDigest: native.product.files.find(file => file.path === 'lib/client.js').digest, databasePath: installed.databasePath, launchId } },
    ] },
  ];
  writeOwned(join(profile, 'cordis.patch.yml'), patch);
  return { paths, profile, accessPath, readyPath, launchId, hostRoot, packageInfo };
}

export function startInitialPreview(input) {
  if (ownedLock) refuse('INITIAL_PREVIEW_ALREADY_RUNNING');
  process.umask(0o077);
  let launch;
  try { launch = prepare(input); }
  catch (error) { releaseLock(); throw error; }
  const logs = {};
  let child;
  try {
    for (const name of ['stdout', 'stderr']) logs[name] = openSync(join(launch.paths.private, `${name}-${launch.launchId}.log`), 'wx', 0o600);
    child = spawn(process.execPath, [join(launch.hostRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', profileName, '--host', '127.0.0.1', '--port', '3091', '--no-open'], { cwd: launch.paths.workspace, env: { HOME: launch.paths.home, DSH_HOME: launch.paths.home, DSH_AGENTS_HOME: launch.paths.agents, TMPDIR: launch.paths.private, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', DSH_TELEMETRY_DISABLED: '1', DSH_PERMISSION_MODE: 'workspace-write' }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    for (const fd of Object.values(logs)) closeSync(fd);
    releaseLock();
    throw error;
  }
  const bytes = { stdout: 0, stderr: 0 };
  let failed = false, stopped = false, ready = false;
  const stop = signal => { if (!stopped) { stopped = true; child.kill(signal); } };
  for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
    // Raw startup errors may include credentials; they remain in owned private files.
    if (bytes[name] + chunk.length > 16 * 1024 * 1024) { failed = true; stop('SIGTERM'); return; }
    try { writeSync(logs[name], chunk); bytes[name] += chunk.length; }
    catch { failed = true; stop('SIGTERM'); }
  });
  const poll = setInterval(() => {
    if (ready || !existsSync(launch.readyPath)) return;
    try {
      regular(launch.readyPath);
      const identity = JSON.parse(readFileSync(launch.readyPath));
      if (identity.launchId !== launch.launchId || identity.pid !== child.pid || identity.port !== 3091 || identity.host !== '127.0.0.1') refuse('READY_IDENTITY_MISMATCH');
      if (!identity.ok) { failed = true; stop('SIGTERM'); console.error('INITIAL_PREVIEW_NOT_READY'); return; }
      ready = true;
      console.log(JSON.stringify({ status: 'ready', endpoint: 'http://127.0.0.1:3091', profile: profileName, package: launch.packageInfo.version, setup: identity.setupPhase }));
    } catch { failed = true; stop('SIGTERM'); console.error('INITIAL_PREVIEW_NOT_READY'); }
  }, 200);
  const startupTimer = setTimeout(() => { if (!ready) { failed = true; stop('SIGTERM'); console.error('INITIAL_PREVIEW_STARTUP_TIMEOUT'); } }, 60000);
  // Repeated explicit signals still reach the original CLI shutdown controller.
  const forwardInt = () => { stopped = true; child.kill('SIGINT'); };
  const forwardTerm = () => { stopped = true; child.kill('SIGTERM'); };
  process.on('SIGINT', forwardInt); process.on('SIGTERM', forwardTerm);
  child.on('error', () => { failed = true; console.error('INITIAL_PREVIEW_LAUNCH_FAILED'); });
  // close follows both original stdout/stderr EOF. No profile/task data is deleted.
  child.on('close', code => {
    clearInterval(poll); clearTimeout(startupTimer);
    process.off('SIGINT', forwardInt); process.off('SIGTERM', forwardTerm);
    for (const fd of Object.values(logs)) closeSync(fd);
    releaseLock();
    console.log(JSON.stringify({ status: 'stopped', exitCode: code, privateStateRetained: true }));
    process.exitCode = failed ? 1 : (code ?? 1);
  });
  try { writeOwned(join(launch.paths.private, 'current-launch.json'), { launchId: launch.launchId, pid: child.pid ?? null, accessPath: launch.accessPath, readyPath: launch.readyPath }); }
  catch { failed = true; stop('SIGTERM'); console.error('INITIAL_PREVIEW_METADATA_FAILED'); }
  console.log(JSON.stringify({ status: 'starting', endpoint: 'http://127.0.0.1:3091', profile: profileName, package: launch.packageInfo.version }));
  return child;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const input = options(process.argv.slice(2));
    if (input.help) console.log('node scripts/initial-preview.mjs --host-root /absolute/pinned/host [--state-root /absolute/owned/preview]\nSynthetic local preview on127.0.0.1:3091. Ctrl+C quits the host; state is retained.');
    else startInitialPreview(input);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'INITIAL_PREVIEW_REFUSED';
    console.error(code); process.exitCode = 1;
  }
}
