// Minimal pinned public modules only: no listener, browser, host launch or
// installed/profile writes. Credential backing is fresh synthetic JSON0600.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { DSH_WEB_RUNTIME_ROOT } from '../../../src/host-probe.mjs';
import { FixtureCredentialProvider } from '../../../scripts/runtime-web-credentials.mjs';
const packages = `${DSH_WEB_RUNTIME_ROOT}/node_modules/@deepseek-ai`;
const pins = {
  'cordis/lib/index.js': '6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e',
  'cordis-plugin-loader/lib/index.js': '638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72',
  'dsh-client-connection/lib/index.js': '3950f524aed44e28240140a254cd928ea40eba8e2d04cc8fd04f92a687f5c91d',
  'dsh-client-connection/lib/types/rpc.d.ts': '3ca86c027408eb2dd6f1aa6efba0778b0f14802d638fc2f66bced8c5e698b0a4',
  'dsh-client-connection/lib/types/rpc-host.d.ts': '4655fdfdef83f155b6aa8d8240b8ae74972ddcc185e8873efde7b819fc0e7426',
  'cordis-plugin-loader/lib/types/config/entry.d.ts': '047a95a352588e566336593969e4a3a7164b3a6ef1bd0ca16a1eb6b766b1c6a5',
  'dsh-host-webserver/lib/index.js': '6efea1375eadeff62d5cfb6d1f515ff75a939d40405a62e5d138e8e7a6b18df5',
};
for (const [file, hash] of Object.entries(pins)) assert.equal(createHash('sha256').update(readFileSync(`${packages}/${file}`)).digest('hex'), hash);
assert.equal(process.version, 'v22.22.2');
const { Context } = await import(`${packages}/cordis/lib/index.js`);
const { Loader } = await import(`${packages}/cordis-plugin-loader/lib/index.js`);
const Connection = await import(`${packages}/dsh-client-connection/lib/index.js`);
const { WebServer } = await import(`${packages}/dsh-host-webserver/lib/index.js`);
class CapturedResponse extends Writable {
  constructor() { super(); this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  text() { return Buffer.concat(this.parts).toString('utf8'); }
}
async function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'df-native-connection-reproducer-')), ctx = new Context(); ctx.logger.exporters.clear();
  let server;
  try {
    await ctx.plugin({ apply(c) { new FixtureCredentialProvider(c, join(directory, 'auth.json')); server = new WebServer(c, { host: '127.0.0.1', port: 3080, compression: 'none' }); } });
    assert.equal(server.server, undefined);
    await run({ ctx, server });
    assert.equal(server.server, undefined);
  } finally { await ctx.fiber.dispose(); rmSync(directory, { recursive: true, force: true }); }
}
function cookie(ctx) {
  const url = new URL(ctx.connection.authenticatedUrl('http://127.0.0.1:3080')); let value;
  ctx.connection.authorizeIndex({ method: 'GET', url: url.pathname + url.search, headers: { host: url.host } }, { writeHead(status, headers) { assert.equal(status, 303); assert.equal(headers.location, './'); value = headers['set-cookie'].split(';')[0]; }, end() {} });
  return value;
}
async function request(route, path, headers, body, method = 'POST') {
  const input = body === undefined ? [] : [Buffer.from(JSON.stringify(body))], req = Readable.from(input);
  Object.assign(req, { method, url: path, headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json', ...headers } });
  const response = new CapturedResponse(); await route.handler(req, response); return response;
}
const envelope = endpoint => ({ type: 'client-request', rpcId: 'synthetic-reproducer', method: endpoint, payload: { synthetic: true } });

test('unchanged official default Connection reproduces missing provider WebServer dependency', () => fixture(async ({ ctx, server }) => {
  await ctx.plugin(Connection); let calls = 0;
  const consumer = ctx.plugin({ inject: ['connection', 'webServer'], apply(c) { c.connection.rpc.handle('/df-reproducer', async () => { calls++; return { ok: true, value: {} }; }); } });
  await assert.rejects(Promise.resolve(consumer), /cannot get property "webServer" without inject/);
  assert.equal(calls, 0); assert.equal(server.prefixes.has('/df-reproducer'), false); assert.equal(server.prefixes.has('/api'), true);
  await consumer.dispose();
}));

test('real public Loader entry inject fixes original Connection without wrapper or installed source change', () => fixture(async ({ ctx, server }) => {
  await ctx.plugin(Loader);
  const id = await ctx.loader.create({ name: pathToFileURL(`${packages}/dsh-client-connection/lib/index.js`).href, inject: ['webServer'], config: { trustedHosts: [] } });
  await ctx.loader.await(); const entry = ctx.loader.resolve(id); await entry.fiber;
  assert.equal(entry.moduleNamespace, Connection); assert.equal(entry.moduleNamespace.apply, Connection.apply); assert.equal(entry.moduleNamespace.Config, Connection.Config);
  assert.deepEqual(Object.keys(entry.fiber.inject).sort(), ['credentials', 'webServer']); assert.deepEqual(Connection.inject, ['credentials']);
  assert.equal(ctx.connection instanceof Connection.HostConnectionService, true);
  let calls = 0, admittedPeer, unregister;
  const consumer = ctx.plugin({ inject: ['connection', 'webServer'], apply(c) {
    const originalPeer = c.connection.operator;
    unregister = c.connection.rpc.handle('/df-reproducer', async (endpoint, payload, signal, peer) => { assert.equal(peer, originalPeer); assert.equal(endpoint, 'v1/read'); assert.deepEqual(payload, { synthetic: true }); admittedPeer = peer; calls++; return { ok: true, value: { synthetic: true } }; });
  } }); await consumer;
  assert.equal(typeof unregister, 'function'); const route = server.prefixes.get('/df-reproducer'), auth = cookie(ctx);
  assert.equal((await request(route, '/df-reproducer/v1/read', {}, envelope('v1/read'))).status, 401); assert.equal(calls, 0);
  assert.equal((await request(route, '/df-reproducer/v1/read', { cookie: auth, origin: 'http://synthetic.invalid' }, envelope('v1/read'))).status, 403); assert.equal(calls, 0);
  const accepted = await request(route, '/df-reproducer/v1/read', { cookie: auth }, envelope('v1/read'));
  assert.equal(accepted.status, 200); const frame = JSON.parse(accepted.text()); assert.equal(frame.type, 'server-response'); assert.equal(frame.rpcId, 'synthetic-reproducer'); assert.equal(frame.result.ok, true); assert.equal(calls, 1); assert.equal(admittedPeer, ctx.connection.operator);
  const malformed = await request(route, '/df-reproducer/v1/read', { cookie: auth }, envelope('wrong/endpoint')); assert.equal(JSON.parse(malformed.text()).result.ok, false); assert.equal(calls, 1);
  const duplicate = ctx.plugin({ inject: ['connection', 'webServer'], apply(c) { c.connection.rpc.handle('/df-reproducer', async () => ({ ok: true, value: {} })); } }); await assert.rejects(Promise.resolve(duplicate), /duplicate/); await duplicate.dispose();
  assert.equal(server.prefixes.get('/df-reproducer'), route); await consumer.dispose(); assert.equal(server.prefixes.has('/df-reproducer'), false);
  // Loader.remove returns void and removes the entry from getTasks before
  // deferred disposal settles; wait on its retained public Fiber explicitly.
  ctx.loader.remove(id); await entry.fiber.dispose(); await ctx.loader.await(); assert.equal(server.prefixes.has('/api'), false);
}));

test('native shared API preserves admission/framing but owns one interceptor; exact Fetch routes are separately bounded', () => fixture(async ({ ctx, server }) => {
  await ctx.plugin(Connection); const auth = cookie(ctx); let gatewayCalls = 0, fetchCalls = 0, peer;
  const gateway = ctx.plugin({ inject: ['connection'], apply(c) { const originalPeer = c.connection.operator; c.connection.rpc.intercept('/api', endpoint => endpoint === 'gateway/ping', async (endpoint, payload, signal, admitted) => { assert.equal(admitted, originalPeer); peer = admitted; gatewayCalls++; return { ok: true, value: { synthetic: true } }; }); } }); await gateway;
  const collision = ctx.plugin({ inject: ['connection'], apply(c) { c.connection.rpc.intercept('/api', endpoint => endpoint.startsWith('df/'), async () => ({ ok: true, value: {} })); } }); await assert.rejects(Promise.resolve(collision), /already has an interceptor/); await collision.dispose();
  const fetch = ctx.plugin({ inject: ['connection'], apply(c) { c.connection.fetch.register({ path: '/api/df-reproducer/read', methods: ['GET'], requestBody: 'buffered', fetch: async req => { assert.equal(new URL(req.url).pathname, '/api/df-reproducer/read'); fetchCalls++; return new Response('synthetic-only', { status: 200 }); } }); } }); await fetch;
  const samePath = ctx.plugin({ inject: ['connection'], apply(c) { c.connection.fetch.register({ path: '/api/df-reproducer/read', methods: ['POST'], requestBody: 'buffered', fetch: async () => new Response() }); } }); await assert.rejects(Promise.resolve(samePath), /already registered/); await samePath.dispose();
  const api = server.prefixes.get('/api'); assert.equal((await request(api, '/api/gateway/ping', {}, envelope('gateway/ping'))).status, 401); assert.equal(gatewayCalls, 0);
  const response = await request(api, '/api/gateway/ping', { cookie: auth }, envelope('gateway/ping')); assert.equal(JSON.parse(response.text()).result.ok, true); assert.equal(peer, ctx.connection.operator);
  assert.equal((await request(api, '/api/df-reproducer/read', {}, undefined, 'GET')).status, 401); assert.equal(fetchCalls, 0);
  assert.equal((await request(api, '/api/df-reproducer/read', { cookie: auth, origin: 'http://synthetic.invalid' }, undefined, 'GET')).status, 403); assert.equal(fetchCalls, 0);
  assert.equal((await request(api, '/api/df-reproducer/read', { cookie: auth }, undefined, 'GET')).text(), 'synthetic-only'); assert.equal(fetchCalls, 1);
  assert.equal((await request(api, '/api/df-reproducer/read', { cookie: auth }, envelope('df-reproducer/read'))).status, 404);
  await fetch.dispose(); assert.equal((await request(api, '/api/df-reproducer/read', { cookie: auth }, undefined, 'GET')).status, 404);
  const surviving = await request(api, '/api/gateway/ping', { cookie: auth }, envelope('gateway/ping')); assert.equal(JSON.parse(surviving.text()).result.ok, true); assert.equal(gatewayCalls, 2); await gateway.dispose();
}));
