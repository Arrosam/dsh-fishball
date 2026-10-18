import test from 'node:test';
import assert from 'node:assert/strict';
import { installOperatorBridge } from '../src/operator-bridge.mjs';

function fixture(operations, options = {}) {
  const operator = Object.freeze({}), seen = {};
  const connection = { browserPeer: operator, rpc: { handle(channel, handler) {
    Object.assign(seen, { channel, handler });
    return async () => { seen.disposed = true; };
  } } };
  const bridge = installOperatorBridge({ connection, operations, ...options });
  const call = (endpoint, payload = {}, peer = operator, signal) => seen.handler(`v1/${endpoint}`, payload, signal, peer);
  return { seen, connection, bridge, call };
}

test('only the DSH admitted operator can reach trusted closures', async () => {
  let calls = 0;
  const f = fixture({ status: input => { calls++; return { taskRef: input.taskRef }; } });
  assert.equal(f.seen.channel, '/df-rpc');
  assert.equal((await f.call('status', { taskRef: 'a' })).ok, true);
  for (const peer of [undefined, {}, { role: 'owner' }, f.connection]) {
    const result = await f.seen.handler('v1/status', { role: 'owner', peer: {} }, undefined, peer);
    assert.equal(result.error.code, 'OPERATOR_REQUIRED');
  }
  assert.equal(calls, 1);
  assert.equal((await f.call('mintOwner')).error.code, 'ENDPOINT_NOT_FOUND');
  assert.equal((await f.seen.handler('status', {}, undefined, f.connection.browserPeer)).error.code, 'ENDPOINT_NOT_FOUND');
});

test('payload accessors, proxies, sparse arrays and authority prototypes never run', async () => {
  let calls = 0, getter = 0;
  const f = fixture({ status: () => { calls++; } });
  const inputs = [Object.create({ role: 'owner' }), new Proxy({}, {}), { list: [ , ] },
    { get taskRef() { getter++; return 'a'; } }, JSON.parse('{"__proto__":{"role":"owner"}}'), { list: Object.assign([], { x: 1 }) }];
  for (const input of inputs) assert.equal((await f.call('status', input)).error.code, 'INVALID_INPUT');
  assert.equal(calls, 0); assert.equal(getter, 0);
  assert.equal((await f.call('status', { body: 'a'.repeat(65537) })).error.code, 'INPUT_TOO_LARGE');
});

test('capture disconnects mutable input and abort fences only new admission', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ status: async input => { await gate; return input.list[0]; } });
  const input = { list: ['original'] }, controller = new AbortController();
  const result = f.call('status', input, undefined, controller.signal);
  input.list[0] = 'changed'; controller.abort(); release();
  assert.deepEqual(await result, { ok: true, value: 'original' });
  assert.equal((await f.call('status', {}, undefined, controller.signal)).error.code, 'REQUEST_ABORTED');
});

test('disposal closes captured handlers immediately and secret errors stay redacted', async () => {
  const f = fixture({ status: () => { const e = new Error('synthetic-secret'); e.code = 'synthetic-secret'; throw e; } });
  assert.deepEqual(await f.call('status'), { ok: false, error: { code: 'OPERATION_REJECTED', message: 'OPERATION_REJECTED', details: {} } });
  const disposed = f.bridge.dispose();
  assert.equal((await f.call('status')).error.code, 'SERVICE_DISPOSED');
  await disposed; assert.equal(f.seen.disposed, true);
  const host = fixture({ status: () => true }, { isAlive: () => false });
  assert.equal((await host.call('status')).error.code, 'SERVICE_DISPOSED');
  for (const isAlive of [() => Promise.resolve(false), () => ({}), () => 'true', () => { throw new Error('synthetic-secret'); }]) {
    let admitted = 0;
    const uncertain = fixture({ status: () => { admitted++; } }, { isAlive });
    assert.equal((await uncertain.call('status')).error.code, 'SERVICE_DISPOSED');
    assert.equal(admitted, 0);
  }
});

test('rc.2 owner authority is only browserPeer; stale alpha operator shape and API-like peers fail closed', async () => {
  const peer = Object.freeze({}), rpc = { handle() { return async () => {}; } };
  // An alpha.1-shaped carrier exposing only `operator` must not configure a bridge.
  assert.throws(() => installOperatorBridge({ connection: { operator: peer, rpc }, operations: { status: () => true } }), { code: 'BRIDGE_CONFIG_INVALID' });
  let calls = 0;
  const f = fixture({ status: () => { calls++; return true; } });
  // A different live Peer object (e.g. a launch-token API Peer) is not the owner browser Peer.
  for (const other of [Object.freeze({ principal: { kind: 'owner' } }), { id: 'api-peer' }]) {
    assert.equal((await f.call('status', {}, other)).error.code, 'OPERATOR_REQUIRED');
  }
  // Replacing the carrier's browser Peer after installation revokes the captured authority.
  f.connection.browserPeer = Object.freeze({});
  assert.equal((await f.call('status')).error.code, 'OPERATOR_REQUIRED');
  assert.equal(calls, 0);
});
