import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { FixtureCredentialProvider } from '../scripts/runtime-web-credentials.mjs';
import * as RuntimeWebConnection from '../scripts/runtime-web-connection.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { Readable, Writable } from 'node:stream';
import { fixtureTokenCount } from '../scripts/runtime-web-fixture.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { prepareRuntimeDirectories, runtimePaths, runtimeFiles, runtimeWebEnvironment, runtimeProfilePatch, verifyRuntimeFixtureHost } from '../scripts/runtime-web.mjs';
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


test('dangling native auth entries fail before read/mutation and cleanup faults stay redacted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-auth-boundary-')), ctx = new Context(), path = join(directory, 'auth.json'); ctx.logger.exporters?.clear?.();
  try {
    const provider = new FixtureCredentialProvider(ctx, path), key = 'client-connection/browser-session';
    const absent = join(directory, 'missing.json'); symlinkSync(absent, path); let calls = 0;
    await assert.rejects(provider.readRecord(key), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    await assert.rejects(provider.modifyRecord(key, async () => { calls++; return undefined; }), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    assert.equal(calls, 0); assert.equal(readlinkSync(path), absent); assert.equal(existsSync(absent), false); unlinkSync(path);
    const original = { kind: 'grant', payload: { version: 1, secret: randomBytes(32).toString('base64url') } };
    await provider.modifyRecord(key, async () => original); const before = digest(readFileSync(path));
    await assert.rejects(provider.modifyRecord(key, async () => { unlinkSync(`${path}.lock`); throw new Error('SYNTHETIC_CALLBACK_CANARY'); }), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    assert.equal(digest(readFileSync(path)), before);
    // A replaced lock belongs to neither this operation nor its cleanup.
    await assert.rejects(provider.modifyRecord(key, async () => { unlinkSync(`${path}.lock`); writeFileSync(`${path}.lock`, 'synthetic-other-lock', { mode: 0o600 }); throw new Error('SYNTHETIC_CALLBACK_CANARY'); }), { message: 'FIXTURE_CREDENTIAL_UNAVAILABLE' });
    assert.equal(readFileSync(`${path}.lock`, 'utf8'), 'synthetic-other-lock'); assert.equal(digest(readFileSync(path)), before);
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});

test('nested synthetic profile directory boundaries preflight existing and dangling symlinks before writes', () => {
  for (const boundary of ['home', 'home/profiles', 'home/profiles/web']) for (const dangling of [false, true]) {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-runtime-path-boundary-'));
    try {
      const base = join(directory, 'fixture'), outside = join(directory, 'outside');
      mkdirSync(base); if (!dangling) mkdirSync(outside);
      const path = join(base, boundary); mkdirSync(join(path, '..'), { recursive: true }); symlinkSync(outside, path);
      const paths = { base, home: join(base, 'home'), agents: join(base, 'agents'), workspace: join(base, 'workspace'), private: join(base, 'private'), evidence: join(base, 'evidence') };
      assert.throws(() => prepareRuntimeDirectories(paths), { message: 'FIXTURE_PATH_INVALID' });
      assert.equal(readlinkSync(path), outside); assert.equal(existsSync(join(base, 'agents')), false);
      assert.equal(existsSync(join(outside, 'web')), false); assert.equal(existsSync(join(outside, 'package.json')), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-runtime-path-positive-'));
  try {
    const base = join(directory, 'fixture'), paths = { base, home: join(base, 'home'), agents: join(base, 'agents'), workspace: join(base, 'workspace'), private: join(base, 'private'), evidence: join(base, 'evidence') };
    prepareRuntimeDirectories(paths); prepareRuntimeDirectories(paths);
    for (const path of [...Object.values(paths), join(paths.home, 'profiles'), join(paths.home, 'profiles/web')]) assert.equal(lstatSync(path).mode & 0o777, 0o700);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('public native Connection Web composition preserves original exports/auth and binds the exact injected provider scope', async () => {
  assert.equal(RuntimeWebConnection.Config, Connection.Config); assert.equal(RuntimeWebConnection.apply, Connection.apply);
  assert.deepEqual(RuntimeWebConnection.inject, ['credentials', 'webServer']); assert.deepEqual(Connection.inject, ['credentials']);
  const { WebServer } = await import(`${root}/dsh-host-webserver/lib/index.js`);
  const { default: SessionStore } = await import(`${root}/dsh-session/lib/index.js`);
  const { default: ApprovalService } = await import(`${root}/dsh-user-approval/lib/index.js`);
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-original-web-')), ctx = new Context(); ctx.logger.exporters.clear();
  try {
    const authPath = join(directory, 'auth.json');
    await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, authPath); } });
    await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
    const mount = async () => { let server; const fiber = ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } }); await fiber; assert.equal(server.server, undefined); return { server, fiber }; };
    const first = await mount(); const unwrapped = ctx.plugin(Connection); await unwrapped;
    // Preserve the actual pinned upstream incompatibility as a negative gate.
    const failingConsumer = ctx.plugin({ inject: ['connection', 'webServer'], apply(c) { c.connection.rpc.handle('/synthetic-unwrapped', () => ({})); } });
    await assert.rejects(Promise.resolve(failingConsumer), /cannot get property "webServer" without inject/); await failingConsumer.dispose();
    assert.equal(first.server.prefixes.has('/synthetic-unwrapped'), false); const authBefore = digest(readFileSync(authPath)); await unwrapped.dispose();
    const connection = ctx.plugin(RuntimeWebConnection); await connection;
    let runtime; const parent = ctx.plugin({ inject: ['connection', 'sessions', 'approval', 'webServer'], async apply(c) {
      runtime = c.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'original-native-owner', workspaceId: 'original-native-workspace' }), encryptionKey: () => Buffer.alloc(32, 11) }), { databasePath: join(directory, 'ledger.sqlite') }); await runtime;
    } }); await parent;
    assert.equal(first.server.prefixes.has('/api'), true); assert.equal(first.server.prefixes.has('/df-rpc'), true);
    const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let cookie;
    ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); assert.equal(headers.location, './'); cookie = headers['set-cookie'].split(';')[0]; }, end() {} });
    class Response extends Writable { constructor() { super(); this.parts = []; } _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); } writeHead(status) { this.status = status; } }
    const request = async (route, overrides = {}) => {
      const req = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-web-rpc', method: 'v1/list', payload: {} }))]);
      Object.assign(req, { method: 'POST', url: '/df-rpc/v1/list', headers: { host: url.host, origin: url.origin, cookie, 'content-type': 'application/json', ...overrides } });
      const res = new Response(); await route.handler(req, res); return { status: res.status, ...(res.status === 200 ? { result: JSON.parse(Buffer.concat(res.parts).toString('utf8')).result } : {}) };
    };
    const oldRoute = first.server.prefixes.get('/df-rpc'); assert.equal((await request(oldRoute)).result.ok, true);
    assert.equal((await request(oldRoute, { cookie: undefined })).status, 401); assert.equal((await request(oldRoute, { origin: 'http://synthetic.invalid' })).status, 403);
    const borrowed = ctx.df, removing = first.fiber.dispose(); assert.equal((await request(oldRoute)).result.error.code, 'SERVICE_DISPOSED'); await removing;
    assert.equal(first.server.prefixes.size, 0); assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' });
    const second = await mount(); await connection; await parent; await runtime;
    assert.equal((await request(second.server.prefixes.get('/df-rpc'))).result.ok, true); assert.equal((await request(oldRoute)).result.error.code, 'SERVICE_DISPOSED');
    assert.equal(digest(readFileSync(authPath)), authBefore); assert.equal(ctx.sessions.list().length, 0);
    const shutdown = parent.dispose(); assert.equal((await request(second.server.prefixes.get('/df-rpc'))).result.error.code, 'SERVICE_DISPOSED'); await shutdown;
    assert.equal(second.server.prefixes.has('/df-rpc'), false); assert.equal(second.server.server, undefined); cookie = undefined;
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
});
