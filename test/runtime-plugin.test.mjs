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
const { HostConnectionService } = await import(pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href);

class CapturedResponse extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; }
  text() { return Buffer.concat(this.parts).toString('utf8'); }
}
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'bubbles-runtime-native-'));
  const ctx = new Context(), routes = new Map();
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  ctx.provide('webServer', { register(route) { assert.equal(routes.has(route.path), false); routes.set(route.path, route); return () => { routes.delete(route.path); }; } });
  await ctx.plugin(SessionStore);
  await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ name: 'synthetic-connection', apply(connectionCtx) {
    // The exported native Connection owns the actual peer/trust fence/RPC
    // framing. BrowserAuth is a private synthetic double, without credentials,
    // server listener, cookies, browser, provider or external model calls.
    new HostConnectionService(connectionCtx, [], { isAuthenticated: request => request.headers['x-synthetic-auth'] === 'approved' });
  } });
  const send = async (command, payload = {}, headers = {}) => {
    const method = `v1/${command}`, envelope = { type: 'client-request', rpcId: 'fixture-rpc', method, payload };
    const request = Readable.from([Buffer.from(JSON.stringify(envelope))]);
    Object.assign(request, { method: 'POST', url: `/bubbles-rpc/${method}`,
      headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', 'x-synthetic-auth': 'approved', ...headers } });
    const response = new CapturedResponse();
    const route = routes.get('/bubbles-rpc');
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
  assert.equal(f.ctx.bubbles.diagnostics().identityBridge, 'connection-operator');
  assert.deepEqual(Object.keys(f.ctx.bubbles), ['diagnostics']);
  assert.equal(f.ctx.bubbles.store, undefined); assert.equal(f.ctx.bubbles.owner, undefined);
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
  assert.equal(f.ctx.sessions.list().length, 0);
  const borrowed = f.ctx.bubbles;
  const disposing = fiber.dispose();
  assert.throws(() => borrowed.diagnostics(), { code: 'SERVICE_DISPOSED' });
  await disposing; assert.equal(f.routes.has('/bubbles-rpc'), false);
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
