import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { DSH_WEB_RUNTIME_ROOT } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { reference } from '../src/runtime-store.mjs';

const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const { Context } = await import(pathToFileURL(`${packages}/cordis/lib/index.js`).href);
const { default: SessionStore } = await import(pathToFileURL(`${packages}/dsh-session/lib/index.js`).href);
const { default: ApprovalService } = await import(pathToFileURL(`${packages}/dsh-user-approval/lib/index.js`).href);
const { WebServer } = await import(pathToFileURL(`${packages}/dsh-host-webserver/lib/index.js`).href);
const { HostConnectionService } = await import(pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href);

class CapturedResponse extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }
  text() { return Buffer.concat(this.parts).toString('utf8'); }
}
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-native-'));
  const ctx = new Context();
  let server;
  await ctx.plugin({ apply(webCtx) { server = new WebServer(webCtx, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  const routes = server.prefixes;
  assert.equal(server.server, undefined);
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  await ctx.plugin(SessionStore);
  await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ name: 'synthetic-connection', inject: ['webServer'], apply(connectionCtx) {
    // The exported native Connection owns the actual peer/trust fence/RPC
    // framing. BrowserAuth is a private synthetic double, without credentials,
    // server listener, cookies, browser, provider or external model calls.
    new HostConnectionService(connectionCtx, [], {isAuthenticated:request => request.headers['x-synthetic-auth'] === 'approved',authenticateApi:()=>undefined});
  } });
  const send = async (command, payload = {}, headers = {}) => {
    const method = `v1/${command}`, envelope = { type: 'client-request', rpcId: 'fixture-rpc', method, payload };
    const request = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(request, { method: 'POST', url: `/df-rpc/${method}`,
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved', ...headers } });
    const response = new CapturedResponse();
    const route = routes.get('/df-rpc');
    assert.ok(route, 'public native route was registered');
    await route.handler(request, response);
    const text = response.text();
    return { status: response.statusCode, text, ...(response.statusCode === 200 ? { result: JSON.parse(text).result } : {}) };
  };
  return { ctx, routes, directory, send };
}

test('actual public Cordis/Connection bridge routes owner intake, blocks carrier rejection and payload authority', async t => {
  const f = await fixture(t), key = Buffer.alloc(32, 12), identity = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
  const fiber = f.ctx.plugin(createRuntimePlugin({ identity: () => identity, encryptionKey: () => key,
    forbiddenSecrets: ['synthetic-canary'], runtimeLimits: { maxMetadataBytes: 8192 } }), { databasePath: join(f.directory, 'ledger.sqlite') });
  await fiber;
  assert.equal(f.ctx.df.diagnostics().identityBridge, 'connection-operator');
  assert.deepEqual(Object.keys(f.ctx.df), ['diagnostics']);
  assert.equal(f.ctx.df.store, undefined); assert.equal(f.ctx.df.owner, undefined);
  identity.workspaceId = 'changed-after-load';
  const input = { taskId: 'native-task', provider: 'fixture', source: 'native-inbox', eventId: 'first', commandRef: reference('intake'), goal: 'synthetic scoped goal' };
  assert.equal((await f.send('intake', input, { 'x-synthetic-auth': 'denied' })).status, 401);
  assert.equal((await f.send('intake', input, { host: 'untrusted.example', origin: 'http://untrusted.example' })).status, 403);
  assert.equal((await f.send('list')).result.value.length, 0);
  const result = (await f.send('intake', input)).result;
  assert.equal(result.ok, true); assert.equal(result.value.task.workspaceRef, reference('synthetic-workspace'));
  const duplicate = (await f.send('intake', { ...input, commandRef: reference('duplicate-command') })).result;
  assert.equal(duplicate.value.deduplicated, true);
  const forged = await f.send('intake', { ...input, eventId: 'second', commandRef: reference('forgery'), role: 'owner', scope: { ownerId: 'other' } });
  assert.equal(forged.result.ok, false);
  assert.equal((await f.send('list')).result.value.length, 1);
  const secret = await f.send('intake', { ...input, eventId: 'canary', commandRef: reference('canary-command'), goal: 'synthetic-canary' });
  assert.equal(secret.result.ok, false); assert.equal(secret.text.includes('synthetic-canary'), false);
  const exported = await f.send('export', { taskRef: result.value.task.taskRef });
  assert.equal(exported.text.includes('synthetic scoped goal'), false);
  const task = exported.result.value.task, recordRef = exported.result.value.data[0].recordRef;
  const detailed = await f.send('detail', { taskRef: task.taskRef, recordRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
  assert.equal(detailed.result.value.data.content, 'synthetic scoped goal');
  assert.equal((await f.send('detail', { taskRef: task.taskRef, recordRef, expectedTaskVersion: task.version + 1, expectedAuthEpoch: task.authEpoch })).result.error.code, 'STALE_VERSION');
  assert.equal((await f.send('detail', { taskRef: reference('other-task'), recordRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch })).result.ok, false);
  assert.equal(f.ctx.sessions.list().length, 0);
  const borrowed = f.ctx.df;
  const disposing = fiber.dispose();
  assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' });
  await disposing; assert.equal(f.routes.has('/df-rpc'), false);
});

test('native runtime reload preserves encrypted intake and missing key/identity fails before storage', async t => {
  const f = await fixture(t), databasePath = join(f.directory, 'reload.sqlite'), key = Buffer.alloc(32, 24);
  const plugin = createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => key });
  let fiber = f.ctx.plugin(plugin, { databasePath }); await fiber;
  assert.equal((await f.send('intake', { taskId: 'reload-task', provider: 'fixture', source: 'local', eventId: 'first', commandRef: reference('reload-command') })).result.ok, true);
  await fiber.dispose();
  fiber = f.ctx.plugin(plugin, { databasePath }); await fiber;
  assert.equal((await f.send('list')).result.value.length, 1); await fiber.dispose();
  const absent = join(f.directory, 'must-not-exist.sqlite');
  const disabled = f.ctx.plugin(createRuntimePlugin(), { databasePath: absent });
  await assert.rejects(Promise.resolve(disabled), /RUNTIME_ADAPTER_UNAVAILABLE/);
  await disabled.dispose(); assert.equal(existsSync(absent), false);
});

test('unconfigured native product capabilities remain explicitly unavailable and cannot admit workers or raw grants', async t => {
  const f = await fixture(t), fiber = f.ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => Buffer.alloc(32, 19) }), { databasePath: join(f.directory, 'unconfigured.sqlite') }); await fiber;
  assert.deepEqual(f.ctx.df.diagnostics().capabilities, { memory: false, preview: false, worker: false, delivery: false, reviewer: false, automation: false, notifications: false });
  for (const operation of ['prepareContext', 'memoryRead', 'preview', 'grant', 'dispatch', 'execute', 'query', 'handoff', 'captureResult', 'acceptDelivery', 'dispatchDelivery', 'configureSource', 'configureSubscription', 'source', 'subscription', 'listSources', 'listSubscriptions', 'eventReceipt', 'listEventReceipts', 'approveSchedule', 'configureNotifications', 'notificationPolicy', 'pendingNotifications', 'prepareNotification', 'acceptNotification', 'dispatchNotification', 'reconcileNotification']) {
    const result = (await f.send(operation, {})).result;
    assert.equal(result.ok, false); assert.equal(result.error.code, 'CAPABILITY_UNAVAILABLE');
  }
  for (const operation of ['verify', 'report', 'workerObservation', 'settleAction', 'bindReviewer', 'mintOwner']) assert.equal((await f.send(operation, { role: 'reviewer', verified: true })).result.error.code, 'ENDPOINT_NOT_FOUND');
  assert.equal(f.ctx.sessions.list().length, 0); await fiber.dispose();
});

test('partial settings and throwing private reviewer installer reject with stable errors rather than callback prose', async t => {
  const f = await fixture(t);
  for (const options of [{ previewTtlMs: 30000 }, { previewResolver: () => ({}) }, { previewResolver: () => ({}), previewTtlMs: 60001 }, { memory: { namespaceRef: reference('memory'), tokenize: () => 1 } }, { worker: { environments: {} } }]) assert.throws(() => createRuntimePlugin(options), { code: 'RUNTIME_ADAPTER_INVALID' });
  const messages = []; f.ctx.logger.exporters?.add?.(entry => { messages.push(JSON.stringify(entry)); });
  const fiber = f.ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => Buffer.alloc(32, 23), reviewerInstaller: () => { throw new Error('SYNTHETIC_REVIEW_INSTALLER_CANARY'); } }), { databasePath: join(f.directory, 'review-installer.sqlite') });
  await assert.rejects(Promise.resolve(fiber), { code: 'RUNTIME_ADAPTER_INVALID' }); await fiber.dispose();
  assert.equal(JSON.stringify(messages).includes('SYNTHETIC_REVIEW_INSTALLER_CANARY'), false); assert.equal(f.routes.has('/df-rpc'), false);
});


test('trusted automation installer is closed synchronous composition; invalid returns and callback failures expose no authority or error prose', async t => {
  const f = await fixture(t);
  assert.throws(() => createRuntimePlugin({ automationInstaller: {} }), { code: 'RUNTIME_ADAPTER_INVALID' });
  assert.throws(() => createRuntimePlugin({ notifications: { policyRef: reference('policy'), recipientRef: reference('recipient'), channelRef: reference('channel'), mergeKeyRef: reference('merge') } }), { code: 'RUNTIME_ADAPTER_INVALID' });
  for (const [label, installer] of [['invalid-return', () => ({ dispose() {} })], ['throwing', () => { throw new Error('SYNTHETIC_AUTOMATION_INSTALLER_CANARY'); }]]) {
    const messages = []; const exporter = entry => { messages.push(JSON.stringify(entry)); }; f.ctx.logger.exporters?.add?.(exporter);
    const fiber = f.ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' }), encryptionKey: () => Buffer.alloc(32, 13), automationInstaller: installer }), { databasePath: join(f.directory, `${label}.sqlite`) });
    await assert.rejects(Promise.resolve(fiber), { code: 'RUNTIME_ADAPTER_INVALID' }); await fiber.dispose();
    assert.equal(f.routes.has('/df-rpc'), false); assert.equal(JSON.stringify(messages).includes('SYNTHETIC_AUTOMATION_INSTALLER_CANARY'), false); f.ctx.logger.exporters?.delete?.(exporter);
  }
});


test('scoped Web runtime requires real public WebServer registration and seals old scopes on service loss', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'df-runtime-scoped-web-')), ctx = new Context();
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
  const connection = ctx.plugin({ inject: ['webServer'], apply(connectionCtx) { new HostConnectionService(connectionCtx, [], {isAuthenticated:() => true,authenticateApi:()=>undefined}); } });
  const databasePath = join(directory, 'ledger.sqlite'); let runtime;
  const parent = ctx.plugin({ inject: ['connection', 'sessions', 'approval', 'webServer'], async apply(scopedCtx) {
    runtime = scopedCtx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'scoped-owner', workspaceId: 'scoped-workspace' }), encryptionKey: () => Buffer.alloc(32, 17) }), { databasePath });
    await runtime;
  } });
  assert.equal(parent.state, 0); assert.equal(ctx.get('df'), undefined); assert.equal(existsSync(databasePath), false);
  async function mount() {
    let server;
    const fiber = ctx.plugin({ apply(webCtx) { server = new WebServer(webCtx, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
    await fiber; await connection; await parent; await runtime;
    // Constructing the real class registers its service, but this wrapper
    // never invokes [Service.init]/listen or ctx.plugin(WebServer).
    assert.equal(server.server, undefined); assert.equal(server.prefixes.size, 1);
    return { fiber, server, route: server.prefixes.get('/df-rpc') };
  }
  async function request(route) {
    const req = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'scoped-rpc', method: 'v1/list', payload: {} }))]);
    Object.assign(req, { method: 'POST', url: '/df-rpc/v1/list', headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' } });
    const response = new CapturedResponse(); await route.handler(req, response); return JSON.parse(response.text()).result;
  }
  const first = await mount(); assert.equal((await request(first.route)).ok, true); const borrowed = ctx.df;
  const removal = first.fiber.dispose();
  assert.equal((await request(first.route)).error.code, 'SERVICE_DISPOSED'); assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' });
  await removal; assert.equal(first.server.prefixes.size, 0); assert.equal(ctx.get('df'), undefined);
  const second = await mount(); assert.equal((await request(second.route)).ok, true);
  assert.equal((await request(first.route)).error.code, 'SERVICE_DISPOSED', 'old scope cannot regain authority after remount');
  const shutdown = parent.dispose(); assert.equal((await request(second.route)).error.code, 'SERVICE_DISPOSED');
  await shutdown; assert.equal(second.server.prefixes.size, 0); await second.fiber.dispose();
});
