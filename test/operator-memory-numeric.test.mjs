import test from 'node:test';
import assert from 'node:assert/strict';
import { installOperatorBridge } from '../src/operator-bridge.mjs';

// Transport-only private closures exercise capture, not memory admission. The
// actual public owner/encrypted memory/context oracle is installed-memory.test.
function fixture(names = ['memoryRemember', 'prepareContext', 'status']) {
  const peer = Object.freeze({}), calls = [], operations = {}; let handler;
  for (const name of names) operations[name] = input => { calls.push({ name, input }); return input; };
  const connection = { operator: peer, rpc: { handle(channel, callback) { assert.equal(channel, '/df-rpc'); handler = callback; return () => {}; } } };
  const bridge = installOperatorBridge({ connection, operations });
  return { peer, calls, bridge, call: (name, input = {}, caller = peer, signal) => handler(`v1/${name}`, input, signal, caller), endpoint: (name, input) => handler(name, input, undefined, peer) };
}

test('exact registered memory capture preserves finite fractions and safe integers through frozen recursive data', async () => {
  const f = fixture();
  for (const name of ['memoryRemember', 'prepareContext']) {
    for (const value of [0.9, 0.1, -0.125, 1.5, Number.MIN_VALUE, 0, -0, 1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      const result = await f.call(name, { value, nested: { vectors: [[value]] } }); assert.equal(result.ok, true); assert.ok(Object.is(result.value.value, value)); assert.ok(Object.is(result.value.nested.vectors[0][0], value));
      assert.ok(Object.isFrozen(result.value) && Object.isFrozen(result.value.nested) && Object.isFrozen(result.value.nested.vectors) && Object.isFrozen(result.value.nested.vectors[0]));
    }
    for (const value of [Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1), 1e20, NaN, Infinity, -Infinity]) {
      const before = f.calls.length; assert.equal((await f.call(name, { nested: [value] })).error.code, 'INVALID_INPUT'); assert.equal(f.calls.length, before);
    }
  }
  for (const value of ['0.9', true, null]) assert.deepEqual((await f.call('memoryRemember', { value })).value, { value });
  assert.equal((await f.call('memoryRemember', { value: new Number(0.9) })).error.code, 'INVALID_INPUT');
});

test('unrelated and registered near-name operations cannot select fractional mode from payload claims', async () => {
  const names = ['status', 'policy', 'grant', 'control', 'dispatch', 'execute', 'configureSource', 'configureNotifications', 'memoryRememberNear', 'prepareContextNear'];
  const f = fixture(names);
  for (const name of names) {
    const before = f.calls.length;
    const result = await f.call(name, { method: 'memoryRemember', operation: 'prepareContext', fractions: true, value: 0.9 }); assert.equal(result.error.code, 'INVALID_INPUT'); assert.equal(f.calls.length, before);
    assert.equal((await f.call(name, { value: 1 })).ok, true);
  }
});

test('unregistered endpoint variants deny before capture, never resolving a memory operation by resemblance', async () => {
  const f = fixture(['memoryRemember', 'prepareContext']);
  for (const endpoint of ['v1/MemoryRemember', 'v1/memoryRemember/', 'v1/memoryRemember?x=1', 'v1/%6demoryRemember', 'v1/memoryRemember ', '/v1/memoryRemember', 'v1/memoryRemember\u0000', 'v1/prepareContextExtra']) {
    assert.equal((await f.endpoint(endpoint, { value: new Proxy({}, {}) })).error.code, 'ENDPOINT_NOT_FOUND');
  }
  assert.equal(f.calls.length, 0);
});

test('operator/signal/own deactivation fences precede even hostile fractional payload inspection', async () => {
  const f = fixture(); let traps = 0;
  const hostile = new Proxy({}, { getPrototypeOf() { traps++; throw Error('SYNTHETIC_NUMERIC_PRIVATE_CANARY'); } });
  assert.equal((await f.call('memoryRemember', hostile, {})).error.code, 'OPERATOR_REQUIRED');
  const abort = new AbortController(); abort.abort(); assert.equal((await f.call('prepareContext', hostile, undefined, abort.signal)).error.code, 'REQUEST_ABORTED');
  f.bridge.deactivate(); assert.equal((await f.call('memoryRemember', hostile)).error.code, 'SERVICE_DISPOSED'); assert.equal(traps, 0); assert.equal(f.calls.length, 0); await f.bridge.dispose();
});

test('fractional mode preserves depth, key, array, string and total body boundaries', async () => {
  const f = fixture();
  for (const depth of [11, 12, 13]) {
    let input = 0.9; for (let index = 0; index < depth; index++) input = { value: input };
    const result = await f.call('memoryRemember', input); if (depth <= 12) assert.equal(result.ok, true); else assert.equal(result.error.code, 'INPUT_TOO_LARGE');
  }
  for (const length of [127, 128, 129]) {
    const result = await f.call('prepareContext', { vectors: Array.from({ length }, () => 0.9) }); if (length <= 128) assert.equal(result.ok, true); else assert.equal(result.error.code, 'INPUT_TOO_LARGE');
  }
  for (const count of [63, 64, 65]) {
    const result = await f.call('memoryRemember', Object.fromEntries(Array.from({ length: count }, (_, index) => [`k${index}`, 0.9]))); if (count <= 64) assert.equal(result.ok, true); else assert.equal(result.error.code, 'INPUT_TOO_LARGE');
  }
  const overhead = Buffer.byteLength(JSON.stringify({ value: 0.9, text: '' }));
  for (const bytes of [65535, 65536, 65537]) {
    const input = { value: 0.9, text: 'a'.repeat(bytes - overhead) }; assert.equal(Buffer.byteLength(JSON.stringify(input)), bytes);
    const result = await f.call('prepareContext', input); if (bytes <= 65536) assert.equal(result.ok, true); else assert.equal(result.error.code, 'INPUT_TOO_LARGE');
  }
  assert.equal((await f.call('memoryRemember', { text: 'a'.repeat(65537), value: 0.9 })).error.code, 'INPUT_TOO_LARGE');
});

test('fractional mode preserves accessor/Proxy/symbol/hidden/prototype/sparse/cycle/dangerous-key refusal', async () => {
  const f = fixture(); let hooks = 0;
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { hooks++; throw Error('SYNTHETIC_NUMERIC_PRIVATE_CANARY'); } });
  const proxy = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('SYNTHETIC_NUMERIC_PRIVATE_CANARY'); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const cycle = {}; cycle.self = cycle;
  const hostile = [getter, proxy, revoked.proxy, { value: 0.9, [Symbol('private')]: 1 }, Object.defineProperty({}, 'value', { value: 0.9 }), Object.assign(Object.create(null), { value: 0.9 }), Object.assign(Object.create({}), { value: 0.9 }), { values: new Array(1) }, JSON.parse('{"__proto__":{"value":0.9}}'), { constructor: 0.9 }, { prototype: 0.9 }];
  for (const input of hostile) assert.equal((await f.call('memoryRemember', input)).error.code, 'INVALID_INPUT');
  assert.equal((await f.call('prepareContext', cycle)).error.code, 'INPUT_TOO_LARGE'); assert.equal(hooks, 0); assert.equal(f.calls.length, 0);
});

test('captured fractions detach before async closure and arbitrary exception prose stays redacted', async () => {
  const peer = {}, source = { confidence: 0.9, vectors: [[-0.125, 0.5]] }; let handler, release, seen;
  const gate = new Promise(resolve => { release = resolve; });
  const bridge = installOperatorBridge({ connection: { operator: peer, rpc: { handle(channel, value) { handler = value; return () => {}; } } }, operations: {
    memoryRemember: async input => { seen = input; await gate; return input; },
    prepareContext: () => { throw Object.assign(Error('SYNTHETIC_NUMERIC_PRIVATE_CANARY'), { code: 'SYNTHETIC_NUMERIC_PRIVATE_CANARY' }); },
  } });
  const pending = handler('v1/memoryRemember', source, undefined, peer); source.confidence = 0.1; source.vectors[0][0] = 1.5; release();
  assert.deepEqual((await pending).value, { confidence: 0.9, vectors: [[-0.125, 0.5]] }); assert.ok(Object.isFrozen(seen.vectors[0]));
  const result = await handler('v1/prepareContext', { vectors: [[0.9]] }, undefined, peer);
  assert.deepEqual(result, { ok: false, error: { code: 'OPERATION_REJECTED', message: 'OPERATION_REJECTED', details: {} } }); await bridge.dispose();
});
