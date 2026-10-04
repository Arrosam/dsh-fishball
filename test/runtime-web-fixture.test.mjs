import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, chmodSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';
import { fixtureTokenCount } from '../scripts/runtime-web-fixture.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { runtimePaths, runtimeFiles, runtimeWebEnvironment, runtimeProfilePatch, verifyRuntimeFixtureHost } from '../scripts/runtime-web.mjs';
const root = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(`${root}/cordis/lib/index.js`);
const Connection = await import(`${root}/dsh-client-connection/lib/index.js`);
const digest = value => createHash('sha256').update(value).digest('hex');

test('separate actual-Web fixture manifest pins isolated env, explicit runtime factory and no secret YAML', () => {
  assert.equal(Object.keys(verifyRuntimeFixtureHost()).length, 4);
  const env = runtimeWebEnvironment();
  assert.deepEqual(Object.keys(env).sort(), ['DSH_AGENTS_HOME', 'DSH_HOME', 'DSH_PERMISSION_MODE', 'DSH_TELEMETRY_DISABLED', 'PATH']);
  assert.equal(Object.hasOwn(env, 'HOME'), false); assert.equal(env.DSH_HOME, runtimePaths.home); assert.equal(env.DSH_AGENTS_HOME, runtimePaths.agents);
  assert.equal(runtimePaths.base.includes('/.runtime/dsh-web-runtime-fixture/'), true); assert.equal(runtimeFiles.key.startsWith(runtimePaths.private + '/'), true);
  const patch = JSON.parse(runtimeProfilePatch());
  assert.equal(patch.find(row => row.id === 'web-runtime').config.openBrowser, false); assert.equal(patch.find(row => row.id === 'web-runtime').config.printUrl, false);
  assert.equal(patch.find(row => row.id === 'credentials').name.endsWith('/runtime-web-credentials.mjs'), true);
  assert.equal(patch.find(row => row.insert).insert[0].name.endsWith('/runtime-web-fixture.mjs'), true);
  for (const id of ['llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'deepseek-account', 'session-title-llm', 'tool-web', 'tool-bash', 'tool-fs']) assert.equal(patch.find(row => row.id === id).disabled, true);
  assert.equal(Object.values(patch).some(row => JSON.stringify(row).includes('secret')), false);
  const fixture = readFileSync(new URL('../scripts/runtime-web-fixture.mjs', import.meta.url), 'utf8');
  assert.ok(fixture.includes('createRuntimePlugin')); assert.equal(fixture.includes("../src/index.mjs"), false); assert.equal(fixture.includes('registerAdapter'), false);
});

test('genuine public BrowserAuth token exchange and OperatorPeer admission use only synthetic JSON0600 credential backing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-auth-')), ctx = new Context(), path = join(directory, 'auth.json'); ctx.logger.exporters?.clear?.();
  try {
    let provider;
    await ctx.plugin({ apply(ownerCtx) { provider = new FixtureCredentialProvider(ownerCtx, path); } });
    const fiber = ctx.plugin(Connection); await fiber;
    assert.equal(lstatSync(path).mode & 0o777, 0o600); const initialDigest = digest(readFileSync(path));
    assert.equal(await provider.resolve('SYNTHETIC_EXTERNAL_MODEL_KEY'), undefined);
    assert.equal(await provider.readRecord('llm-deepseek/model-key'), undefined); assert.deepEqual(await provider.describe('SYNTHETIC_EXTERNAL_MODEL_KEY'), { configured: false, writable: false });
    await assert.rejects(provider.set('SYNTHETIC_EXTERNAL_MODEL_KEY', 'synthetic'), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    await assert.rejects(provider.modifyRecord('foreign/record', async () => ({})), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080'));
    let status, headers;
    const response = { writeHead(code, value) { status = code; headers = value; }, end() {} };
    assert.equal(ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, response), false);
    assert.equal(status, 303); assert.equal(headers.location, './');
    let cookie = headers['set-cookie'].split(';')[0];
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: url.origin, cookie } }).peer === ctx.connection.operator, true);
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: url.origin } }).rejection, 401);
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: 'http://synthetic.invalid', cookie } }).rejection, 403);
    assert.equal(ctx.connection.admit({ headers: { host: url.host, cookie: 'synthetic=forged' } }).rejection, 401);
    await fiber.dispose(); await ctx.plugin(Connection);
    assert.equal(digest(readFileSync(path)), initialDigest, 'reload reuses native signing record without printing it');
    assert.equal(ctx.connection.admit({ headers: { host: url.host, origin: url.origin, cookie } }).peer === ctx.connection.operator, true);
    cookie = undefined;
    assert.deepEqual(await provider.listRecords(), [{ key: 'client-connection/browser-session', kind: 'grant' }]);
    await ctx.fiber.dispose(); await assert.rejects(provider.readRecord('client-connection/browser-session'), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

test('private auth persistence rejects unsafe mode, locks, unknown record formats and callback secrets without fallback', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-auth-fault-')), ctx = new Context(), path = join(directory, 'auth.json'); ctx.logger.exporters?.clear?.();
  try {
    const provider = new FixtureCredentialProvider(ctx, path), key = 'client-connection/browser-session';
    const valid = { kind: 'grant', payload: { version: 1, secret: randomBytes(32).toString('base64url') } };
    await provider.modifyRecord(key, async () => valid);
    chmodSync(path, 0o644); await assert.rejects(provider.readRecord(key), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' }); chmodSync(path, 0o600);
    writeFileSync(`${path}.lock`, '', { mode: 0o600 }); await assert.rejects(provider.modifyRecord(key, async () => undefined), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' }); rmSync(`${path}.lock`);
    await assert.rejects(provider.modifyRecord(key, async () => ({ kind: 'grant', payload: { version: 2 } })), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    await assert.rejects(provider.modifyRecord(key, async () => { throw new Error('SYNTHETIC_AUTH_CALLBACK_CANARY'); }), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    assert.equal(digest(JSON.stringify(await provider.readRecord(key))), digest(JSON.stringify(valid)));
    assert.equal(lstatSync(path).mode & 0o777, 0o600);
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});


test('synthetic integer tokenizer assembles an actual protected scoped execution context without a model', async () => {
  assert.equal(fixtureTokenCount(''), 0); assert.equal(fixtureTokenCount('two synthetic tokens'), 3);
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-tokenizer-')), owner = {}, digestRef = text => digest(text);
  const store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: randomBytes(32), principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'synthetic-fixture-owner', workspaceId: 'synthetic-fixture-workspace' } }], hostPermission: () => false });
  try {
    const registered = store.intake(owner, { taskId: 'synthetic-tokenizer-task', provider: 'fixture', source: 'fixture', eventId: 'synthetic-event', commandRef: digestRef('tokenizer-intake'), goal: 'Synthetic protected context. No inference or tools.' });
    const assembler = new ContextAssembler({ store, tokenize: fixtureTokenCount, byteLimit: 16384, tokenLimit: 8192 });
    const memory = new MemoryAdapter({ store, handle: owner, namespaceRef: digestRef('tokenizer-memory'), tokenize: fixtureTokenCount, byteLimit: 16384, tokenLimit: 8192, contextAssembler: assembler });
    const prepared = await memory.prepareExecutionContext({ taskRef: registered.task.taskRef, commandRef: digestRef('tokenizer-prepare'), expectedTaskVersion: registered.task.version, expectedAuthEpoch: registered.task.authEpoch, terms: [], now: Date.now() });
    const data = store.readData(owner, { taskRef: registered.task.taskRef, recordRef: prepared.recordRef });
    assert.equal(data.kind, 'context'); assert.equal(digest(data.content), prepared.digest); assert.equal(JSON.parse(data.content).materialKind, 'execution_context');
    assert.equal(JSON.parse(data.content).content.includes('Synthetic protected context'), true);
    const snapshot = store.snapshot(owner, { taskRef: registered.task.taskRef }); assert.equal(snapshot.actions.length, 0); assert.equal(snapshot.workers.length, 0); assert.equal(snapshot.executions.length, 0);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
