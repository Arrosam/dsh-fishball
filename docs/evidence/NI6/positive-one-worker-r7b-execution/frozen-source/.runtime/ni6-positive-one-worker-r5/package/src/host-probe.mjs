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
  harness: { root: `${packagesRoot}/dsh`, package: 'package.json', version: '0.2.1-alpha.1', source: 'lib/bin.js', hash: '1a03dee18683483ff6a1b27b2a1e650230da6bcca9a0f55f7d81b3308c3f307f' },
  cordis: { root: `${packagesRoot}/cordis`, package: 'package.json', version: '4.0.5-alpha.1', source: 'lib/index.js', hash: '6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e' },
  sessions: { root: `${packagesRoot}/dsh-session`, package: 'package.json', version: '0.2.1-alpha.1', source: 'lib/index.js', hash: 'b847e7ec736ce4049ec40ea0b20753bad5d7c2388785b4369d2bf00baa32472b' },
  approval: { root: `${packagesRoot}/dsh-user-approval`, package: 'package.json', version: '0.2.1-alpha.1', source: 'lib/index.js', hash: '6a5ad1ba3c3dc3abbbae52e6c8c4463970ee0c1c8988cebb0d5cf2acd17ee90b' },
  web: { root: `${packagesRoot}/dsh-web-app`, package: 'package.json', version: '0.2.1-alpha.1', source: 'lib/index.js', hash: 'c8b9ba271bddffd052cdba8ae86f758fc1a377bc058e7d81f9cc2571a8c6ed85' },
  webServer: { root: `${packagesRoot}/dsh-host-webserver`, package: 'package.json', version: '0.2.1-alpha.1', source: 'lib/index.js', hash: '6efea1375eadeff62d5cfb6d1f515ff75a939d40405a62e5d138e8e7a6b18df5' },
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
  try {
    const digest = value => createHash('sha256').update(value).digest('hex');
    hashes.runtimeLock = digest(readFileSync(`${DSH_WEB_RUNTIME_ROOT}/package-lock.json`));
    checks.runtimeLock = hashes.runtimeLock === digest(readFileSync(new URL('../scripts/dsh-web-runtime-lock.json', import.meta.url)));
  } catch { checks.runtimeLock = false; }
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
