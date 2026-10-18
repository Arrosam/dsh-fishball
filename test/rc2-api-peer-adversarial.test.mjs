// H1 rc.2 adversarial partition (ISTQB TC1/TC2, m6): a genuine rc.2 API Peer
// minted by the original HostConnectionService.publishPeer path (the same
// callback /connect hands to BrowserAuth.authorizeConnect) is admitted by the
// host (no 401/403) but is NOT df owner authority. Only the shared browserPeer
// is (src/operator-bridge.mjs ownerPeerOf; docs/owner-amendment-2026-10-18-rc2.md).
// BrowserAuth is a synthetic double; Connection, WebServer route table, Cordis,
// SessionStore and Approval are the original pinned rc.2 implementations. No
// listener, socket, model or credential is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { resolveHostSource } from '../src/host-probe.mjs';
import { createRuntimePlugin } from '../src/runtime-plugin.mjs';
import { reference } from '../src/runtime-store.mjs';
import * as Installed from '../src/installed-plugin.mjs';

const load = name => import(pathToFileURL(resolveHostSource(`@deepseek-ai/${name}`)).href);
const { Context } = await load('cordis');
const { default: SessionStore } = await load('dsh-session');
const { default: ApprovalService } = await load('dsh-user-approval');
const { WebServer } = await load('dsh-host-webserver');
const { HostConnectionService } = await load('dsh-client-connection');

const API_TOKEN = 'synthetic-rc2-api-launch-credential';
const BROWSER = Object.freeze({ 'x-synthetic-browser': 'approved' });
const API = Object.freeze({ 'x-api': API_TOKEN });
const digest = value => createHash('sha256').update(value).digest('hex');
const accepted = preview => ({ previewRef: preview.previewRef, planDigest: preview.planDigest, accept: true });
class Collector extends Writable {
  parts = [];
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers = {}) { this.status = status; this.headers = headers; }
}
function snapshot(directory) {
  const rows = [];
  const visit = (path, tail = '') => { for (const name of readdirSync(path).sort()) { const target = join(path, name), info = lstatSync(target), relative = join(tail, name); rows.push([relative, info.ino, info.size, info.isFile() ? digest(readFileSync(target)) : 'entry']); if (info.isDirectory()) visit(target, relative); } };
  visit(directory); return rows;
}

async function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-rc2-api-peer-')), ctx = new Context();
  ctx.logger.exporters?.clear?.();
  t.after(async () => { try { await ctx.fiber.dispose(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  let server, connection, apiPeerId;
  await ctx.plugin({ apply(c) { server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
  assert.equal(server.server, undefined, 'no listener');
  await ctx.plugin(SessionStore); await ctx.plugin(ApprovalService, { policy: 'never' });
  await ctx.plugin({ apply(c) { c.provide('profileContext', Object.freeze({ dir: directory, name: 'synthetic-rc2-api-peer' })); } });
  await ctx.plugin({ name: 'synthetic-rc2-auth', inject: ['webServer'], apply(c) {
    // Browser auth only for the explicit browser header; API auth resolves the
    // launch credential to the id the original publishPeer path minted.
    connection = new HostConnectionService(c, [], {
      isAuthenticated: request => request.headers['x-synthetic-browser'] === 'approved',
      authenticateApi: request => request.headers['x-api'] === API_TOKEN ? apiPeerId : undefined,
    });
  } });
  // publishPeer is the exact callback rc.2 authorizeConnect passes to
  // BrowserAuth after a launch-token exchange; it is a public method here.
  assert.equal(typeof connection.publishPeer, 'function');
  apiPeerId = connection.publishPeer(undefined);
  assert.equal(typeof apiPeerId, 'string');
  const send = async (channel, method, payload = {}, headers = BROWSER) => {
    const request = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'synthetic-api-peer', method: `v1/${method}`, payload }))]);
    Object.assign(request, { method: 'POST', url: `${channel}/v1/${method}`, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', ...headers } });
    const response = new Collector(), route = server.prefixes.get(channel); assert.ok(route, channel);
    await route.handler(request, response); const text = Buffer.concat(response.parts).toString();
    return { status: response.status, text, ...(response.status === 200 ? { result: JSON.parse(text).result } : {}) };
  };
  return { ctx, server, connection, directory, send, apiPeerId: () => apiPeerId };
}
const refused = (reply, code = 'OPERATOR_REQUIRED') => {
  assert.notEqual(reply.status, 401); assert.notEqual(reply.status, 403);
  assert.equal(reply.status, 200, 'host admits the API Peer to the df channel');
  assert.equal(reply.result.ok, false); assert.equal(reply.result.error.code, code);
};

test('TC1 genuine rc.2 API Peer is host-admitted but df /df-rpc refuses OPERATOR_REQUIRED with an unchanged ledger', async t => {
  const f = await fixture(t);
  // The minted API Peer is a real, distinct owner-principal Peer, not browserPeer.
  const admitted = f.connection.admit({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', ...API } });
  assert.ok(admitted.peer); assert.equal(admitted.peer.id, f.apiPeerId()); assert.notEqual(admitted.peer, f.connection.browserPeer);
  assert.equal(admitted.peer.principal.kind, 'owner');
  const fiber = f.ctx.plugin(createRuntimePlugin({ identity: () => ({ ownerId: 'synthetic-rc2-owner', workspaceId: 'synthetic-rc2-workspace' }), encryptionKey: () => Buffer.alloc(32, 52) }), { databasePath: join(f.directory, 'ledger.sqlite') });
  await fiber;
  const intake = { taskId: 'api-peer-task', provider: 'synthetic', source: 'rc2-api-peer', eventId: 'one', commandRef: reference('api-peer-intake'), goal: 'SYNTHETIC_API_PEER_GOAL' };
  // Invalid partition: unauthenticated stays a host 401 (control).
  assert.equal((await f.send('/df-rpc', 'list', {}, {})).status, 401);
  const before = (await f.send('/df-rpc', 'list')).result.value; assert.deepEqual(before, []);
  refused(await f.send('/df-rpc', 'list', {}, API));
  refused(await f.send('/df-rpc', 'intake', intake, API));
  // API credentials cannot be combined into owner authority by forged payload fields.
  refused(await f.send('/df-rpc', 'intake', { ...intake, commandRef: reference('api-peer-forged'), role: 'owner', peer: 'browser' }, API));
  assert.deepEqual((await f.send('/df-rpc', 'list')).result.value, before, 'ledger unchanged after API Peer attempts');
  // Valid partition: the same route with browser auth succeeds.
  const created = (await f.send('/df-rpc', 'intake', intake)).result;
  assert.equal(created.ok, true); assert.equal(created.value.task.workspaceRef, reference('synthetic-rc2-workspace'));
  assert.equal((await f.send('/df-rpc', 'list')).result.value.length, 1);
  refused(await f.send('/df-rpc', 'list', {}, API));
  assert.equal(f.ctx.sessions.list().length, 0); await fiber.dispose();
});

test('TC2 genuine rc.2 API Peer cannot read or drive installed /df-setup status/prepare/confirm; no files and no child runtime', async t => {
  const f = await fixture(t), databasePath = join(f.directory, 'df/runtime.sqlite');
  const fiber = f.ctx.plugin(Installed, { databasePath }); await fiber;
  const before = snapshot(f.directory);
  assert.equal(f.server.prefixes.has('/df-rpc'), false); assert.equal(f.ctx.get('df'), undefined);
  for (const method of ['status', 'prepare', 'features', 'workerStatus', 'auditStatus']) refused(await f.send('/df-setup', method, {}, API));
  // A genuine browser preview exists, yet the API Peer still cannot confirm it.
  const preview = (await f.send('/df-setup', 'prepare')).result.value; assert.ok(preview.previewRef);
  refused(await f.send('/df-setup', 'confirm', accepted(preview), API));
  assert.deepEqual(snapshot(f.directory), before, 'no persistent entry was created');
  assert.equal(f.server.prefixes.has('/df-rpc'), false, 'no child runtime mounted'); assert.equal(f.ctx.get('df'), undefined);
  assert.equal(f.ctx.dfSetup.diagnostics().phase, 'setup_required');
  // Valid partition: the browser Peer confirms the same preview.
  const ready = (await f.send('/df-setup', 'confirm', accepted(preview))).result;
  assert.equal(ready.ok, true); assert.equal(ready.value.phase, 'ready'); assert.equal(f.server.prefixes.has('/df-rpc'), true);
  // The child runtime created by browser consent still refuses the API Peer.
  refused(await f.send('/df-rpc', 'list', {}, API)); refused(await f.send('/df-setup', 'status', {}, API));
  assert.equal(f.ctx.sessions.list().length, 0); await fiber.dispose();
});
