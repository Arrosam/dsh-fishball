import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';

if (process.version !== 'v22.22.2') throw new Error('RUNTIME_UNSUPPORTED');
const root = fileURLToPath(new URL('../', import.meta.url));
export const paths = Object.freeze({ home: `${root}.runtime/dsh-web-home`, workspace: `${root}.runtime/dsh-web-workspace`,
  agents: `${root}.runtime/dsh-web-agents`, evidence: `${root}.runtime/dsh-web-evidence`, private: `${root}.runtime/dsh-web-private` });
export function webEnvironment() {
  return Object.freeze({ PATH: '/opt/homebrew/bin:/usr/bin:/bin', DSH_HOME: paths.home, DSH_AGENTS_HOME: paths.agents,
    DSH_TELEMETRY_DISABLED: '1', DSH_PERMISSION_MODE: 'read-only' });
}
export function profilePatch(generation = 1) {
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > 100) throw new Error('GENERATION_INVALID');
  return JSON.stringify([
    { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: true, trustedHosts: [] } },
    { id: 'session-title-llm', disabled: true },
    { id: 'deepseek-account', disabled: true },
    { id: 'llm-deepseek-account', disabled: true },
    { id: 'account-controller', disabled: true },
    { insert: [{ id: 'bubbles-m1-fixture', name: fileURLToPath(new URL('./web-fixture.mjs', import.meta.url)),
      config: { generation, databasePath: `${paths.home}/bubbles.sqlite` } }] },
  ], null, 2) + '\n';
}
export const patchPath = `${paths.home}/profiles/web/cordis.patch.yml`;
export function prepareWeb() {
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true, mode: 0o700 });
  const profile = `${paths.home}/profiles/web`;
  mkdirSync(profile, { recursive: true });
  const manifest = `${profile}/package.json`;
  if (!existsSync(manifest)) writeFileSync(manifest, JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }, null, 2) + '\n');
  if (!existsSync(patchPath)) writeFileSync(patchPath, profilePatch());
}
export function createSafeOutput(write) {
  const maximum = 32768;
  let pending = '';
  let suppressed = false;
  const redact = text => text.replace(/(https?:\/\/[^\s?]+)\?[^\s)]+/g, '$1?[redacted]');
  const flush = newline => {
    write(suppressed ? 'HOST_LOG_LINE_SUPPRESSED\n' : redact(pending) + (newline ? '\n' : ''));
    pending = '';
    suppressed = false;
  };
  return Object.freeze({
    write(chunk) {
      const parts = String(chunk).split('\n');
      for (let index = 0; index < parts.length; index++) {
        if (!suppressed) {
          if (pending.length + parts[index].length > maximum) { pending = ''; suppressed = true; }
          else pending += parts[index];
        }
        if (index < parts.length - 1) flush(true);
      }
    },
    end() { if (pending || suppressed) flush(false); },
  });
}
export function startWeb() {
  prepareWeb();
  const child = spawn(process.execPath, [`${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai/dsh/lib/bin.js`,
    '--profile', 'web', '--host', '127.0.0.1', '--port', '3080', '--no-open'], {
    cwd: paths.workspace, env: webEnvironment(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Stream chunks do not preserve URL/line boundaries. Buffer each bounded
  // line before redaction; suppress overflow rather than flushing raw pieces.
  const stdout = createSafeOutput(value => process.stdout.write(value));
  const stderr = createSafeOutput(value => process.stderr.write(value));
  child.stdout.on('data', data => stdout.write(data));
  child.stderr.on('data', data => stderr.write(data));
  child.stdout.on('end', () => stdout.end());
  child.stderr.on('end', () => stderr.end());
  return child;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = startWeb();
  console.log(JSON.stringify({ host: 'DSH Web 0.2.1-alpha.1', url: 'http://127.0.0.1:3080', pid: child.pid,
    authentication: 'ephemeral private access file; token omitted from evidence' }));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => { console.error('WEB_LAUNCH_FAILED'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
