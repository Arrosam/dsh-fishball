import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, parse, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createSafeOutput } from './dsh-web.mjs';
const base = fileURLToPath(new URL('../.runtime/dsh-web-runtime-fixture/', import.meta.url));
export const runtimePaths = Object.freeze({ base, home: `${base}home`, agents: `${base}agents`, workspace: `${base}workspace`, private: `${base}private`, evidence: `${base}evidence` });
export const runtimeFiles = Object.freeze({ key: `${runtimePaths.private}/runtime-key.bin`, auth: `${runtimePaths.private}/auth-record.json`, access: `${runtimePaths.private}/access.json`, state: `${runtimePaths.evidence}/state.json`, database: `${runtimePaths.home}/runtime.sqlite` });
const hostSources = Object.freeze({
  'dsh-client-connection/lib/index.js': '0ebcca7583e082716f79b0b55bc1749d48269cc8db2989b043b321b57abd3684',
  'dsh-credentials/lib/index.js': '1b6afdb04e966285e0732eb766eb0a12f3f9c0821c8caacfd192ce1ac88bee7a',
  'dsh-base/cordis.patch.yml': 'a2cc57868a4d016609801e28781262515483dde29b41c2742d9a3b27a6f52f77',
  'dsh-web-app/cordis.patch.yml': '3e1f923309612ed8551141127409d662e78758e2d0d125218a3f70514417e472',
});
export function verifyRuntimeFixtureHost() {
  if (process.version !== 'v22.22.2') throw new Error('RUNTIME_UNSUPPORTED');
  try {
    for (const [path, hash] of Object.entries(hostSources)) {
      const pkg = path.split('/')[0], prefix = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
      if (JSON.parse(readFileSync(`${prefix}/${pkg}/package.json`, 'utf8')).version !== '0.2.1-rc.2' || createHash('sha256').update(readFileSync(`${prefix}/${path}`)).digest('hex') !== hash) throw new Error();
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
    // Public Loader entry injection merges into the unchanged official
    // Connection fiber; preserve its package and browser client metadata.
    { id: 'connection', inject: ['webServer'], config: { trustedHosts: [] } },
    // Patch.name is an expected-name guard, never a replacement. Disable
    // the shipped provider and insert one distinct trusted synthetic provider.
    { id: 'credentials', disabled: true },
    { insert: [
      { id: 'df-runtime-synthetic-credentials', name: fileURLToPath(new URL('./runtime-web-credentials.mjs', import.meta.url)), config: {} },
      { id: 'df-runtime-synthetic-fixture', name: fileURLToPath(new URL('./runtime-web-fixture.mjs', import.meta.url)), config: {} },
    ] },
  ], null, 2) + '\n';
}
function entry(path) {
  try { return lstatSync(path); } catch (error) { if (error?.code === 'ENOENT') return undefined; throw new Error('FIXTURE_PATH_INVALID'); }
}
// Trusted fixture setup only. Preflight every ancestor before creating any
// directory; dangling symlinks are existing unsafe entries, not absence.
export function prepareRuntimeDirectories(paths) {
  try {
    const base = resolve(paths.base), planned = [...Object.values(paths), `${paths.home}/profiles`, `${paths.home}/profiles/web`].map(path => resolve(path));
    if (planned.some(path => { const tail = relative(base, path); return tail === '..' || tail.startsWith('../') || tail.startsWith('/'); })) throw new Error();
    const ancestors = new Set();
    for (const path of planned) {
      let cursor = path;
      while (cursor !== parse(cursor).root) { ancestors.add(cursor); cursor = dirname(cursor); }
    }
    for (const path of ancestors) {
      const current = entry(path);
      if (current && (!current.isDirectory() || current.isSymbolicLink())) throw new Error();
    }
    for (const path of [...ancestors].sort((a, b) => a.length - b.length)) {
      if (!entry(path)) mkdirSync(path, { mode: 0o700 });
    }
    for (const path of planned) { if (realpathSync(path) !== path) throw new Error(); chmodSync(path, 0o700); }
  } catch { throw new Error('FIXTURE_PATH_INVALID'); }
}
export function prepareRuntimeWeb() {
  verifyRuntimeFixtureHost();
  prepareRuntimeDirectories(runtimePaths);
  const profile = `${runtimePaths.home}/profiles/web`;
  for (const file of [runtimeFiles.key, runtimeFiles.auth, runtimeFiles.access, runtimeFiles.state, `${profile}/package.json`, `${profile}/cordis.patch.yml`]) {
    if (entry(file)) { try { checkPrivateFile(file, file === runtimeFiles.key ? 32 : undefined); } catch { throw new Error('FIXTURE_PRIVATE_FILE_INVALID'); } }
  }
  if (!entry(runtimeFiles.key)) writeFileSync(runtimeFiles.key, randomBytes(32), { flag: 'wx', mode: 0o600 });
  checkPrivateFile(runtimeFiles.key, 32);
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
    prepareRuntimeWeb(); console.log(JSON.stringify({ result: 'prepared', target: 'DSH Web 0.2.1-rc.2', port: 3080, profile: 'separate project synthetic runtime', privateFiles: 'key/auth/access; values omitted' }));
  } else {
    const child = startRuntimeWeb(); console.log(JSON.stringify({ result: 'launched', pid: child.pid, url: 'http://127.0.0.1:3080', target: 'DSH Web 0.2.1-rc.2' }));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('RUNTIME_WEB_LAUNCH_FAILED'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
}
