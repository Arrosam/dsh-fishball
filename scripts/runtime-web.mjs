import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createSafeOutput } from './dsh-web.mjs';
const base = fileURLToPath(new URL('../.runtime/dsh-web-runtime-fixture/', import.meta.url));
export const runtimePaths = Object.freeze({ base, home: `${base}home`, agents: `${base}agents`, workspace: `${base}workspace`, private: `${base}private`, evidence: `${base}evidence` });
export const runtimeFiles = Object.freeze({ key: `${runtimePaths.private}/runtime-key.bin`, auth: `${runtimePaths.private}/auth-record.json`, access: `${runtimePaths.private}/access.json`, state: `${runtimePaths.evidence}/state.json`, database: `${runtimePaths.home}/runtime.sqlite` });
const hostSources = Object.freeze({
  'dsh-client-connection/lib/index.js': '3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d',
  'dsh-credentials/lib/index.js': 'c1008e2a37c62ba13e61c2ffdd7451c886e214f131c30ced1a5a67bf06a8df5e',
  'dsh-base/cordis.patch.yml': '9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d',
  'dsh-web-app/cordis.patch.yml': '3073a35dbb1dafd933143e7c299452256073f9f7f5f129aeeeba85a55fa85192',
});
export function verifyRuntimeFixtureHost() {
  if (process.version !== 'v22.22.2') throw new Error('RUNTIME_UNSUPPORTED');
  try {
    for (const [path, hash] of Object.entries(hostSources)) {
      const pkg = path.split('/')[0], prefix = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
      if (JSON.parse(readFileSync(`${prefix}/${pkg}/package.json`, 'utf8')).version !== '0.2.1-alpha.1' || createHash('sha256').update(readFileSync(`${prefix}/${path}`)).digest('hex') !== hash) throw new Error();
    }
  } catch { throw new Error('FIXTURE_HOST_PROVENANCE_UNSUPPORTED'); }
  return hostSources;
}
export function runtimeWebEnvironment() {
  return Object.freeze({ PATH: '/opt/homebrew/bin:/usr/bin:/bin', DSH_HOME: runtimePaths.home, DSH_AGENTS_HOME: runtimePaths.agents, DSH_TELEMETRY_DISABLED: '1', DSH_PERMISSION_MODE: 'read-only' });
}
export function checkPrivateFile(path, length) {
  const entry = lstatSync(path);
  if (!entry.isFile() || (entry.mode & 0o077) !== 0 || length !== undefined && entry.size !== length) throw new Error('FIXTURE_PRIVATE_FILE_INVALID');
}
export function runtimeProfilePatch() {
  const disabled = ['session-title-llm', 'deepseek-account', 'llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'account-controller', 'shell-env', 'bash-sandbox', 'pwsh-sandbox',
    'tool-bash', 'tool-pwsh', 'tool-jobs', 'tool-fs', 'tool-fs-search', 'tool-skill', 'tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent', 'tool-subagent-fork', 'tool-workflow', 'tool-result-pruner', 'tool-todo', 'tool-goal', 'tool-ralph', 'tool-web'];
  return JSON.stringify([
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: true, trustedHosts: [] } },
    { id: 'approval', config: { policy: 'never' } },
    ...disabled.map(id => ({ id, disabled: true })),
    { id: 'credentials', name: fileURLToPath(new URL('./runtime-web-credentials.mjs', import.meta.url)), config: {} },
    { insert: [{ id: 'df-runtime-synthetic-fixture', name: fileURLToPath(new URL('./runtime-web-fixture.mjs', import.meta.url)), config: {} }] },
  ], null, 2) + '\n';
}
export function prepareRuntimeWeb() {
  verifyRuntimeFixtureHost();
  for (const path of Object.values(runtimePaths)) {
    if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) throw new Error('FIXTURE_PATH_INVALID');
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (realpathSync(path) !== resolve(path)) throw new Error('FIXTURE_PATH_INVALID');
    chmodSync(path, 0o700);
  }
  if (!existsSync(runtimeFiles.key)) writeFileSync(runtimeFiles.key, randomBytes(32), { flag: 'wx', mode: 0o600 });
  checkPrivateFile(runtimeFiles.key, 32);
  for (const file of [runtimeFiles.auth, runtimeFiles.access, runtimeFiles.state]) if (existsSync(file)) checkPrivateFile(file);
  const profile = `${runtimePaths.home}/profiles/web`;
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  for (const file of ['package.json', 'cordis.patch.yml']) if (existsSync(`${profile}/${file}`) && !lstatSync(`${profile}/${file}`).isFile()) throw new Error('FIXTURE_PATH_INVALID');
  writeFileSync(`${profile}/package.json`, JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(`${profile}/cordis.patch.yml`, runtimeProfilePatch(), { mode: 0o600 });
}
export function startRuntimeWeb() {
  if (process.version !== 'v22.22.2') throw new Error('RUNTIME_UNSUPPORTED');
  prepareRuntimeWeb();
  const child = spawn(process.execPath, [`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh/lib/bin.js`, '--profile', 'web', '--host', '127.0.0.1', '--port', '3080', '--no-open'], { cwd: runtimePaths.workspace, env: runtimeWebEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = createSafeOutput(value => process.stdout.write(value)), stderr = createSafeOutput(value => process.stderr.write(value));
  child.stdout.on('data', value => stdout.write(value)); child.stderr.on('data', value => stderr.write(value));
  child.stdout.on('end', () => stdout.end()); child.stderr.on('end', () => stderr.end());
  return child;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--prepare')) {
    prepareRuntimeWeb(); console.log(JSON.stringify({ result: 'prepared', target: 'DSH Web 0.2.1-alpha.1', port: 3080, profile: 'separate project synthetic runtime', privateFiles: 'key/auth/access; values omitted' }));
  } else {
    const child = startRuntimeWeb(); console.log(JSON.stringify({ result: 'launched', pid: child.pid, url: 'http://127.0.0.1:3080', target: 'DSH Web 0.2.1-alpha.1' }));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('RUNTIME_WEB_LAUNCH_FAILED'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
}
