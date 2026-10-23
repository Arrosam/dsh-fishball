import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BootstrapError, HOST_TARGET } from './config.mjs';

// The supported installation is one exact flat npm host graph, supplied by
// normal Node resolution (including the public DSH profile peer resolver).
// Development links are external setup, never a product/runtime fallback.
let resolvedHostRoot;
try {
  const manifest = realpathSync(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json')));
  const metadata = JSON.parse(readFileSync(manifest, 'utf8'));
  if (metadata.name === '@deepseek-ai/dsh') resolvedHostRoot = resolve(dirname(manifest), '../../..');
} catch { /* Missing peers fail the capability gate without path disclosure. */ }
export const DSH_WEB_RUNTIME_ROOT = resolvedHostRoot;
// Owner decision 2026-10-23 (docs/owner-amendment-2026-10-23-live-install.md):
// the host graph is identified per package, not by lock-file bytes. Each
// installed package must match the pinned name/version/integrity/flags, with
// no extra or missing package. Only the download URL (`resolved`, a mirror
// choice) and the install-root row ("") are ignored. The lock is read from the
// npm root `package-lock.json`, else npm's `node_modules/.package-lock.json`.
const lockProjection = text => {
  const lock = JSON.parse(text);
  if (lock === null || typeof lock !== 'object' || lock.lockfileVersion !== 3 || lock.packages === null || typeof lock.packages !== 'object') throw new Error();
  const rows = Object.keys(lock.packages).filter(key => key !== '').sort().map(key => {
    const { resolved, ...row } = lock.packages[key];
    return [key, Object.fromEntries(Object.keys(row).sort().map(field => [field, row[field]]))];
  });
  return JSON.stringify(rows);
};
let pinnedLock;
export function hostLockMatches(root = resolvedHostRoot) {
  try {
    pinnedLock ??= lockProjection(readFileSync(new URL('../scripts/dsh-web-runtime-lock.json', import.meta.url), 'utf8'));
    let text;
    try { text = readFileSync(`${root}/package-lock.json`, 'utf8'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; text = readFileSync(`${root}/node_modules/.package-lock.json`, 'utf8'); }
    return typeof root === 'string' && lockProjection(text) === pinnedLock;
  } catch { return false; }
}
const packagesRoot = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
export function resolveHostSource(packageName, source = 'lib/index.js') {
  try {
    if (!resolvedHostRoot || !/^@deepseek-ai\/[a-z0-9-]+$/.test(packageName) || typeof source !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(source) || source.split('/').some(part => !part || part === '.' || part === '..')) throw new Error();
    const metadataPath = realpathSync(fileURLToPath(import.meta.resolve(`${packageName}/package.json`)));
    const expectedPath = resolve(resolvedHostRoot, 'node_modules', packageName, 'package.json');
    if (metadataPath !== expectedPath || !metadataPath.startsWith(`${resolvedHostRoot}/node_modules/`) || JSON.parse(readFileSync(metadataPath, 'utf8')).name !== packageName) throw new Error();
    const expectedSource = resolve(dirname(metadataPath), source);
    const sourcePath = realpathSync(expectedSource);
    if (sourcePath !== expectedSource || !sourcePath.startsWith(`${dirname(metadataPath)}/`)) throw new Error();
    return sourcePath;
  } catch { throw new BootstrapError('HOST_CAPABILITY_UNSUPPORTED'); }
}
const definitions = Object.freeze({
  harness: { root: `${packagesRoot}/dsh`, package: 'package.json', version: '0.2.1-rc.2', source: 'lib/bin.js', hash: '80112efe368efb1a39720c7ada0af00442e5131fb2744edaaff8a3e8bb499e6f' },
  cordis: { root: `${packagesRoot}/cordis`, package: 'package.json', version: '4.0.5', source: 'lib/index.js', hash: '6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e' },
  sessions: { root: `${packagesRoot}/dsh-session`, package: 'package.json', version: '0.2.1-rc.2', source: 'lib/index.js', hash: '2f5dd07cb5c744a29abbb8003a8a4cefd9e582c6e2538074ca299a0ddd02a3bf' },
  approval: { root: `${packagesRoot}/dsh-user-approval`, package: 'package.json', version: '0.2.1-rc.2', source: 'lib/index.js', hash: '6a5ad1ba3c3dc3abbbae52e6c8c4463970ee0c1c8988cebb0d5cf2acd17ee90b' },
  web: { root: `${packagesRoot}/dsh-web-app`, package: 'package.json', version: '0.2.1-rc.2', source: 'lib/index.js', hash: '6662ca712368c56fb8818efa53039ef92ce215a328a76b9cdd5e1bed624a0e84' },
  webServer: { root: `${packagesRoot}/dsh-host-webserver`, package: 'package.json', version: '0.2.1-rc.2', source: 'lib/index.js', hash: '08907285802f0edd3aeb68c91fb443be2804879ab3d41104c4600424be06f3ab' },
});
let installed;
try {
  installed = {
    cordis: await import(pathToFileURL(resolveHostSource('@deepseek-ai/cordis')).href),
    sessions: await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-session')).href),
    approval: await import(pathToFileURL(resolveHostSource('@deepseek-ai/dsh-user-approval')).href),
  };
} catch { /* Missing installation is a capability failure, never fallback. */ }

export function probeHost(ctx) {
  const checks = {};
  const versions = {};
  const hashes = {};
  for (const [key, definition] of Object.entries(definitions)) {
    try {
      resolveHostSource(`@deepseek-ai/${definition.root.split('/').at(-1)}`, definition.source);
      versions[key] = JSON.parse(readFileSync(`${definition.root}/${definition.package}`, 'utf8')).version;
      checks[`${key}Version`] = versions[key] === definition.version;
      if (definition.hash) {
        hashes[key] = createHash('sha256').update(readFileSync(`${definition.root}/${definition.source ?? definition.package}`)).digest('hex');
        checks[`${key}Source`] = hashes[key] === definition.hash;
      }
    } catch { checks[`${key}Version`] = false; }
  }
  // Class identity binds the service to these installed public implementations;
  // the Cordis global brand alone intentionally works across package copies.
  try {
    checks.nativeContext = !!installed && installed.cordis.Context.is(ctx) && ctx instanceof installed.cordis.Context;
    checks.sessionsProvenance = !!installed && ctx.sessions instanceof installed.sessions.SessionStore;
    checks.approvalProvenance = !!installed && ctx.approval instanceof installed.approval.ApprovalService;
    for (const method of ['provide', 'effect', 'on']) checks[`context.${method}`] = typeof ctx?.[method] === 'function';
    for (const method of ['create', 'get', 'list']) checks[`sessions.${method}`] = typeof ctx?.sessions?.[method] === 'function';
    for (const method of ['request', 'effectivePolicy']) checks[`approval.${method}`] = typeof ctx?.approval?.[method] === 'function';
  } catch { checks.nativeContext = false; }
  checks.runtimeVersion = process.version === 'v22.22.2';
  checks.runtimeLock = hostLockMatches();
  let sqliteVersion;
  try {
    const db = new DatabaseSync(':memory:');
    try { sqliteVersion = db.prepare('SELECT sqlite_version() AS version').get().version; }
    finally { db.close(); }
    checks.sqlite = typeof sqliteVersion === 'string';
  } catch { checks.sqlite = false; }
  const failures = Object.keys(checks).filter(key => checks[key] !== true);
  return Object.freeze({ target: HOST_TARGET, supported: failures.length === 0,
    runtime: Object.freeze({ node: process.version, sqlite: sqliteVersion ?? 'unavailable' }),
    versions: Object.freeze(versions), hashes: Object.freeze(hashes),
    checks: Object.freeze(checks), failures: Object.freeze(failures),
    identityBridge: 'pending', permissionBridge: 'deny-all',
  });
}

export function requireHost(ctx) {
  const report = probeHost(ctx);
  if (!report.supported) throw new BootstrapError('HOST_CAPABILITY_UNSUPPORTED');
  return report;
}
