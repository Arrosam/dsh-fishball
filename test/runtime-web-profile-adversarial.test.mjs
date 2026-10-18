import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { runtimeProfilePatch } from '../scripts/runtime-web.mjs';
const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const includePath = `${packages}/cordis-plugin-include/lib/index.js`;
const { applyEntryPatches, entryListSchema } = await import(pathToFileURL(includePath));
const yaml = createRequire(includePath)('js-yaml');
const hash = data => createHash('sha256').update(data).digest('hex');
function compiledProfile() {
  const layers = ['dsh-base', 'dsh-web-app'].map(name => {
    const data = readFileSync(`${packages}/${name}/cordis.patch.yml`);
    const expected = name === 'dsh-base' ? 'a2cc57868a4d016609801e28781262515483dde29b41c2742d9a3b27a6f52f77' : '3e1f923309612ed8551141127409d662e78758e2d0d125218a3f70514417e472';
    assert.equal(hash(data), expected);
    return yaml.load(data.toString('utf8'), { schema: entryListSchema });
  });
  layers.push(JSON.parse(runtimeProfilePatch()));
  const warnings = [];
  const entries = layers.reduce((entries, layer) => applyEntryPatches(entries, layer, message => warnings.push(message)), []);
  const flat = [];
  function visit(entries) { for (const entry of entries) { flat.push(entry); if (entry.group && Array.isArray(entry.config)) visit(entry.config); } }
  visit(entries);
  return { entries: flat, warnings };
}
test('independent compiled official profile must disable the default credential provider and select one exact synthetic module', () => {
  const { entries, warnings } = compiledProfile();
  const defaults = entries.filter(entry => entry.name === '@deepseek-ai/dsh-credentials-local');
  assert.equal(defaults.length, 1, 'exact official credential row expected');
  assert.equal(defaults[0].disabled, true, 'compiled default provider must be disabled before mounting');
  const synthetic = entries.filter(entry => typeof entry.name === 'string' && entry.name.endsWith('/runtime-web-credentials.mjs') && entry.disabled !== true);
  assert.equal(synthetic.length, 1, 'one explicit synthetic provider expected');
  assert.equal(warnings.some(message => message.includes('name mismatch')), false, 'no skipped provider selection');
  const connection = entries.filter(entry => entry.id === 'connection');
  assert.equal(connection.length, 1); assert.equal(connection[0].name, '@deepseek-ai/dsh-client-connection');
  assert.deepEqual(connection[0].inject, ['webServer']); assert.deepEqual(connection[0].config, { trustedHosts: [] });
});

import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, lstatSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { FixtureCredentialProvider, createFixtureCredentialPlugin } from '../scripts/runtime-web-credentials.mjs';
import { verifyFixtureCredentialBacking } from '../scripts/runtime-web-fixture.mjs';
const { Context } = await import(pathToFileURL(`${packages}/cordis/lib/index.js`));
const { CredentialProvider } = await import(pathToFileURL(`${packages}/dsh-credentials/lib/index.js`));
const nativeRecord = () => ({ kind: 'grant', payload: { version: 1, secret: randomBytes(32).toString('base64url') } });
const readyGate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function backingFixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'df-profile-backing-independent-')), ctx = new Context(); ctx.logger.exporters?.clear?.();
  const path = join(directory, 'synthetic-private-auth.json');
  try { await run({ directory, path, ctx }); }
  finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
}
async function backingDenied(run) {
  let error; try { await run(); } catch (caught) { error = caught; }
  assert.ok(error, 'expected denied selected-provider verification');
  assert.equal(error.message === 'FIXTURE_CREDENTIAL_BACKING_UNAVAILABLE', true, 'expected stable private verification error');
}
test('independent selected real public provider returns only frozen metadata and preserves its private record', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path));
  await ctx.plugin(createFixtureCredentialPlugin(path));
  assert.equal(ctx.credentials instanceof FixtureCredentialProvider, true);
  const result = await verifyFixtureCredentialBacking(ctx, path);
  assert.deepEqual(result, { provider: 'FixtureCredentialProvider', configured: true, kind: 'grant', nativeBrowserAuth: 'unchanged' });
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.hasOwn(result, 'secret'), false); assert.equal(Object.hasOwn(result, 'path'), false);
  assert.equal(hash(readFileSync(path)), before); assert.equal(lstatSync(path).mode & 0o077, 0);
}));
test('independent missing native credential carrier cannot pass selected-provider verification', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path));
  await backingDenied(() => verifyFixtureCredentialBacking(ctx, path)); assert.equal(hash(readFileSync(path)), before);
}));
test('independent public provider with a spoofed constructor name is denied before its metadata callback', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path)); let calls = 0;
  const Lookalike = class FixtureCredentialProvider extends CredentialProvider {
    async describeRecord() { calls++; return { configured: true, kind: 'grant', writable: true }; }
  };
  await ctx.plugin({ apply(c) { new Lookalike(c); } });
  await backingDenied(() => verifyFixtureCredentialBacking(ctx, path));
  assert.equal(calls, 0); assert.equal(hash(readFileSync(path)), before);
}));
test('independent selected-provider startup rejects absent, malformed and unsupported private record entries', async t => {
  for (const partition of ['missing', 'world-readable', 'owner-readonly', 'owner-executable', 'directory', 'existing-symlink', 'dangling-symlink', 'future-record', 'truncated-record', 'oversize-record']) await t.test(partition, () => backingFixture(async ({ directory, path, ctx }) => {
    const target = join(directory, 'synthetic-target'); let original;
    if (partition === 'world-readable') writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o644 });
    if (partition === 'owner-readonly') writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o400 });
    if (partition === 'owner-executable') writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o700 });
    if (partition === 'directory') mkdirSync(path, { mode: 0o700 });
    if (partition === 'existing-symlink') { writeFileSync(target, JSON.stringify(nativeRecord()), { mode: 0o600 }); original = hash(readFileSync(target)); symlinkSync(target, path); }
    if (partition === 'dangling-symlink') symlinkSync(target, path);
    if (partition === 'future-record') { const value = nativeRecord(); value.payload.version = 2; writeFileSync(path, JSON.stringify(value), { mode: 0o600 }); }
    if (partition === 'truncated-record') writeFileSync(path, '{"kind":', { mode: 0o600 });
    if (partition === 'oversize-record') { const body = JSON.stringify(nativeRecord()); writeFileSync(path, body + ' '.repeat(1025 - Buffer.byteLength(body)), { mode: 0o600 }); }
    const before = existsSync(path) && lstatSync(path).isFile() ? hash(readFileSync(path)) : undefined;
    await ctx.plugin(createFixtureCredentialPlugin(path)); await backingDenied(() => verifyFixtureCredentialBacking(ctx, path));
    if (before) assert.equal(hash(readFileSync(path)), before);
    if (partition.endsWith('symlink')) assert.equal(lstatSync(path).isSymbolicLink(), true);
    if (original) assert.equal(hash(readFileSync(target)), original);
    if (partition === 'missing' || partition === 'dangling-symlink') assert.equal(existsSync(target), false);
    if (partition === 'missing') assert.equal(existsSync(path), false);
  }));
});
test('independent selected-provider callback fault is redacted without changing the record', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path));
  await ctx.plugin(createFixtureCredentialPlugin(path));
  ctx.credentials.describeRecord = async () => { throw new Error('SYNTHETIC_PRIVATE_BACKING_CALLBACK_CANARY'); };
  await backingDenied(() => verifyFixtureCredentialBacking(ctx, path)); assert.equal(hash(readFileSync(path)), before);
}));
test('independent provider replacement during metadata await rejects the captured selection', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path));
  const first = ctx.plugin(createFixtureCredentialPlugin(path)); await first;
  const entered = readyGate(), release = readyGate();
  ctx.credentials.describeRecord = async () => { entered.resolve(); await release.promise; return { configured: true, kind: 'grant', writable: true }; };
  const pending = verifyFixtureCredentialBacking(ctx, path), rejection = backingDenied(() => pending);
  await entered.promise; await first.dispose(); await ctx.plugin(createFixtureCredentialPlugin(path)); release.resolve(); await rejection;
  assert.equal(hash(readFileSync(path)), before); assert.equal(ctx.credentials instanceof FixtureCredentialProvider, true);
}));
test('independent disposed selected provider cannot produce a new startup verification', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 }); const before = hash(readFileSync(path));
  const fiber = ctx.plugin(createFixtureCredentialPlugin(path)); await fiber;
  await verifyFixtureCredentialBacking(ctx, path); await fiber.dispose();
  await backingDenied(() => verifyFixtureCredentialBacking(ctx, path)); assert.equal(hash(readFileSync(path)), before);
}));
test('independent selected provider cannot verify an unrelated private file as its native backing', async t => {
  for (const partition of ['unrelated-empty', 'unrelated-native-format']) await t.test(partition, () => backingFixture(async ({ directory, path, ctx }) => {
    const other = join(directory, 'unrelated-synthetic-private.json');
    writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 });
    writeFileSync(other, partition === 'unrelated-empty' ? '{}' : JSON.stringify(nativeRecord()), { mode: 0o600 });
    const before = hash(readFileSync(path)), otherBefore = hash(readFileSync(other));
    await ctx.plugin(createFixtureCredentialPlugin(path));
    await backingDenied(() => verifyFixtureCredentialBacking(ctx, other));
    assert.equal(hash(readFileSync(path)), before); assert.equal(hash(readFileSync(other)), otherBefore);
    await verifyFixtureCredentialBacking(ctx, path);
  }));
});
test('independent native record changed during metadata await must be revalidated before startup success', () => backingFixture(async ({ path, ctx }) => {
  writeFileSync(path, JSON.stringify(nativeRecord()), { mode: 0o600 });
  await ctx.plugin(createFixtureCredentialPlugin(path));
  const entered = readyGate(), release = readyGate();
  ctx.credentials.describeRecord = async () => { entered.resolve(); await release.promise; return { configured: true, kind: 'grant', writable: true }; };
  const pending = verifyFixtureCredentialBacking(ctx, path), rejection = backingDenied(() => pending);
  await entered.promise; const current = JSON.stringify({ kind: 'grant', payload: { version: 2, secret: randomBytes(32).toString('base64url') } });
  writeFileSync(path, current, { mode: 0o600 }); release.resolve(); await rejection;
  assert.equal(hash(readFileSync(path)), hash(current));
}));
