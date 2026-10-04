import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BootstrapError, HOST_TARGET } from './config.mjs';

export const DESKTOP_APP_ROOT = '/Applications/DSH Desktop.app/Contents/Resources/app';
const packagesRoot = `${DESKTOP_APP_ROOT}/node_modules/@deepseek-ai`;
const definitions = Object.freeze({
  desktop: { package: 'package.json', root: DESKTOP_APP_ROOT, version: '0.9.1', hash: 'fc1389b7779ce658572760f9b304e1e9f01b0b551959861cb79869b6428887db' },
  harness: { root: `${packagesRoot}/dsh`, package: 'package.json', version: '0.1.5-rc.2' },
  cordis: { root: `${packagesRoot}/cordis`, package: 'package.json', version: '4.0.2', source: 'lib/index.js', hash: '1729cdbf8ee40b17c8839e06bf96491490548559e11ef7e411271e0754e751c5' },
  sessions: { root: `${packagesRoot}/dsh-session`, package: 'package.json', version: '0.1.5-rc.2', source: 'lib/index.js', hash: '05e94f57d96e7979670a5b51024c8591572eb0051ce793613dbdec35cf2c47bf' },
  approval: { root: `${packagesRoot}/dsh-user-approval`, package: 'package.json', version: '0.1.5-rc.2', source: 'lib/index.js', hash: 'fbd3f2e348358d27234739f8cbc4bdb2d6450b0a6b1b207572463977b14a5ecb' },
});
let installed;
try {
  installed = {
    cordis: await import(pathToFileURL(`${definitions.cordis.root}/lib/index.js`).href),
    sessions: await import(pathToFileURL(`${definitions.sessions.root}/lib/index.js`).href),
    approval: await import(pathToFileURL(`${definitions.approval.root}/lib/index.js`).href),
  };
} catch { /* Missing installation is a capability failure, never fallback. */ }

export function probeHost(ctx) {
  const checks = {};
  const versions = {};
  const hashes = {};
  for (const [key, definition] of Object.entries(definitions)) {
    try {
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
  checks.runtimeVersion = process.version === 'v24.9.0';
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
