import test from 'node:test';
import assert from 'node:assert/strict';
import { installOperatorBridge } from '../src/operator-bridge.mjs';

// Typed private transport carrier only. Counters/receipts are deliberate doubles,
// not native OperatorPeer authentication, SQLite authority or provider effects.
const CANARY = 'PRIVATE_INVOCATION_CANARY';
const failure = code => ({ ok: false, error: { code, message: code, details: {} } });
const barrier = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const safeFailure = (value, code) => {
  assert.deepEqual(value, failure(code));
  assert.equal(JSON.stringify(value).includes(CANARY), false);
};
function fixture(operations, { isAlive = () => true, unregister = () => undefined, connection: sharedConnection } = {}) {
  const peer = sharedConnection?.operator ?? Object.freeze({ provenance: 'typed-private-peer' });
  let handler, registrationCount = 0, unregisterCount = 0;
  const connection = sharedConnection ?? { operator: peer };
  connection.rpc = { handle(channel, callback) {
    assert.equal(channel, '/df-rpc'); registrationCount++; handler = callback;
    return () => { unregisterCount++; return unregister(); };
  } };
  const bridge = installOperatorBridge({ connection, operations, isAlive });
  const call = (operation, payload = {}, { signal, admittedPeer = peer } = {}) => handler(`v1/${operation}`, payload, signal, admittedPeer);
  return { peer, connection, bridge, call, handler, get registrations() { return registrationCount; }, get unregisters() { return unregisterCount; } };
}

test('I01 exact private context is immutable, independently captured and detached from nested payload', async () => {
  const gate = barrier(), contexts = [], captured = [];
  const f = fixture({ guarded: async (input, context) => {
    contexts.push(context); captured.push(input);
    assert.deepEqual(Reflect.ownKeys(context), ['assertCurrent']); assert.equal(Object.getPrototypeOf(context), Object.prototype);
    assert.equal(typeof context.assertCurrent, 'function'); assert.equal(Object.isFrozen(context), true);
    assert.throws(() => { context.assertCurrent = () => true; }, TypeError);
    assert.equal(context.assertCurrent(), true);
    for (const value of [input, input.parts, input.parts[0], input.flags]) assert.equal(Object.isFrozen(value), true);
    await gate.promise; context.assertCurrent(); return { content: input.parts[0].content, enabled: input.flags.enabled };
  } });
  const payload = { parts: [{ content: 'original synthetic input' }], flags: { enabled: true } };
  const result = f.call('guarded', payload); payload.parts[0].content = 'caller mutation'; payload.parts.push({ content: 'foreign' }); payload.flags.enabled = false;
  gate.release(); assert.deepEqual(await result, { ok: true, value: { content: 'original synthetic input', enabled: true } });
  assert.notEqual(captured[0], payload); assert.notEqual(captured[0].parts, payload.parts); assert.equal(captured[0].parts.length, 1);
  assert.deepEqual(Object.keys(contexts[0]), ['assertCurrent']); assert.equal(JSON.stringify(contexts[0]), '{}');
  f.bridge.deactivate(); assert.throws(() => contexts[0].assertCurrent(), { code: 'SERVICE_DISPOSED' });
});

test('I02 callable payloads and opaque descriptor tricks cannot replace or execute a private guard', async t => {
  let operations = 0, traps = 0;
  const f = fixture({ guarded: () => { operations++; return true; } });
  const accessor = Object.defineProperty({}, 'assertCurrent', { enumerable: true, get() { traps++; throw Error(CANARY); } });
  const hidden = Object.defineProperty({}, 'assertCurrent', { value: true });
  const proxy = new Proxy({}, { get() { traps++; throw Error(CANARY); }, getPrototypeOf() { traps++; throw Error(CANARY); }, ownKeys() { traps++; throw Error(CANARY); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const cases = [
    ['callable', { assertCurrent() { traps++; throw Error(CANARY); } }], ['nested-callable', { proof: { assertCurrent() { traps++; } } }],
    ['accessor', accessor], ['hidden', hidden], ['proxy', proxy], ['revoked', revoked.proxy], ['symbol', { [Symbol('authority')]: true }],
    ['inherited', Object.create({ assertCurrent: true })], ['null-prototype', Object.assign(Object.create(null), { assertCurrent: true })], ['sparse', { parts: [, 1] }],
  ];
  for (const [name, payload] of cases) await t.test(name, async () => safeFailure(await f.call('guarded', payload), 'INVALID_INPUT'));
  assert.equal(operations, 0); assert.equal(traps, 0);
});

test('I03 initial authority decision table denies before payload evaluation with stable precedence', async t => {
  for (const alive of [false, true]) for (const matchingPeer of [false, true]) for (const aborted of [false, true]) {
    await t.test(`alive=${alive},peer=${matchingPeer},abort=${aborted}`, async () => {
      let entered = 0, payloadReads = 0;
      const f = fixture({ guarded: (input, context) => { entered++; context.assertCurrent(); return true; } }, { isAlive: () => alive });
      const controller = new AbortController(); if (aborted) controller.abort();
      const options = { signal: controller.signal, admittedPeer: matchingPeer ? f.peer : { provenance: 'typed-private-peer' } };
      if (alive && matchingPeer && !aborted) { assert.deepEqual(await f.call('guarded', {}, options), { ok: true, value: true }); assert.equal(entered, 1); }
      else {
        const payload = Object.defineProperty({}, 'field', { enumerable: true, get() { payloadReads++; throw Error(CANARY); } });
        safeFailure(await f.call('guarded', payload, options), !alive ? 'SERVICE_DISPOSED' : !matchingPeer ? 'OPERATOR_REQUIRED' : 'REQUEST_ABORTED'); assert.equal(entered, 0);
      }
      assert.equal(payloadReads, 0);
    });
  }
});

test('I04 literal lifetime predicate accepts no truthy/Promise/thenable/throwing authority', async t => {
  let thenCalls = 0;
  const cases = [['false', () => false], ['number', () => 1], ['string', () => 'true'], ['object', () => ({ active: true })], ['promise', () => Promise.resolve(true)], ['thenable', () => ({ then() { thenCalls++; } })], ['throw', () => { throw Error(CANARY); }]];
  for (const [name, isAlive] of cases) await t.test(name, async () => {
    let entered = 0; const f = fixture({ guarded: () => { entered++; return true; } }, { isAlive });
    safeFailure(await f.call('guarded'), 'SERVICE_DISPOSED'); assert.equal(entered, 0);
  });
  assert.equal(thenCalls, 0);
});

test('I05 post-await guard loss prevents typed final effect under each captured authority partition', async t => {
  for (const drift of ['abort', 'peer', 'deactivate', 'dispose-pending', 'alive-false', 'alive-promise', 'alive-throw']) await t.test(drift, async () => {
    const gate = barrier(), cleanup = barrier(), controller = new AbortController(); let alive = () => true, effects = 0, guard;
    const f = fixture({ guarded: async (input, context) => { guard = context.assertCurrent; guard(); await gate.promise; assert.equal(guard(), true); effects++; return 'typed-effect'; } }, { isAlive: () => alive(), unregister: () => cleanup.promise });
    const result = f.call('guarded', { value: 'synthetic' }, { signal: controller.signal });
    let disposal;
    if (drift === 'abort') controller.abort();
    if (drift === 'peer') f.connection.operator = Object.freeze({ provenance: 'typed-private-peer' });
    if (drift === 'deactivate') f.bridge.deactivate();
    if (drift === 'dispose-pending') { disposal = f.bridge.dispose(); assert.equal(f.unregisters, 1); safeFailure(await f.call('guarded'), 'SERVICE_DISPOSED'); }
    if (drift === 'alive-false') alive = () => false;
    if (drift === 'alive-promise') alive = () => Promise.resolve(true);
    if (drift === 'alive-throw') alive = () => { throw Error(CANARY); };
    gate.release(); safeFailure(await result, drift === 'abort' ? 'REQUEST_ABORTED' : drift === 'peer' ? 'OPERATOR_REQUIRED' : 'SERVICE_DISPOSED'); assert.equal(effects, 0);
    cleanup.release(); await disposal;
  });
});

test('I06 final after-await check is selected by trusted closure use, not endpoint or caller flags', async t => {
  for (const name of ['legacy', 'memoryRemember', 'prepareContext']) await t.test(`${name} ignored guard`, async () => {
    const gate = barrier(), controller = new AbortController(); let calls = 0, predicateCalls = 0;
    const f = fixture({ [name]: async input => { calls++; await gate.promise; return input.original; } }, { isAlive: () => { predicateCalls++; return true; } });
    const result = f.call(name, { original: 'detached legacy response', guarded: true, useGuard: true, assertCurrent: true }, { signal: controller.signal });
    controller.abort(); gate.release(); assert.deepEqual(await result, { ok: true, value: 'detached legacy response' }); assert.equal(calls, 1); assert.equal(predicateCalls, 1);
    safeFailure(await f.call(name, {}, { signal: controller.signal }), 'REQUEST_ABORTED'); assert.equal(calls, 1);
  });
  for (const drift of ['abort', 'peer', 'lifetime']) await t.test(`guarded final ${drift}`, async () => {
    const gate = barrier(), controller = new AbortController(); let alive = true, operationCalls = 0;
    const f = fixture({ guarded: async (input, context) => { operationCalls++; context.assertCurrent(); await gate.promise; return 'do not publish'; } }, { isAlive: () => alive });
    const result = f.call('guarded', { guarded: false, useGuard: false }, { signal: controller.signal });
    if (drift === 'abort') controller.abort(); if (drift === 'peer') f.connection.operator = {}; if (drift === 'lifetime') alive = false;
    gate.release(); safeFailure(await result, drift === 'abort' ? 'REQUEST_ABORTED' : drift === 'peer' ? 'OPERATOR_REQUIRED' : 'SERVICE_DISPOSED'); assert.equal(operationCalls, 1);
  });
});

test('I07 two simultaneous delayed invocations retain independent signals with reversed completion', async () => {
  const gates = { a: barrier(), b: barrier() }, controllers = { a: new AbortController(), b: new AbortController() }, guards = new Map(), effects = [];
  const f = fixture({ guarded: async (input, context) => { guards.set(input.id, context.assertCurrent); context.assertCurrent(); await gates[input.id].promise; context.assertCurrent(); effects.push(input.id); return input.id; } });
  const a = f.call('guarded', { id: 'a' }, { signal: controllers.a.signal }), b = f.call('guarded', { id: 'b' }, { signal: controllers.b.signal });
  assert.notEqual(guards.get('a'), guards.get('b')); controllers.a.abort(); gates.b.release();
  assert.deepEqual(await b, { ok: true, value: 'b' }); assert.equal(guards.get('b')(), true);
  assert.throws(() => guards.get('a')(), { code: 'REQUEST_ABORTED' }); gates.a.release(); safeFailure(await a, 'REQUEST_ABORTED'); assert.deepEqual(effects, ['b']);
  f.bridge.deactivate(); assert.throws(() => guards.get('b')(), { code: 'SERVICE_DISPOSED' });
});

test('I08 retired bridge closure cannot borrow a replacement lifetime on the same connection and peer', async () => {
  const gate = barrier(); let oldGuard, newGuard, oldEffects = 0, newEffects = 0;
  const old = fixture({ guarded: async (input, context) => { oldGuard = context.assertCurrent; oldGuard(); await gate.promise; oldGuard(); oldEffects++; return 'old'; } });
  const pending = old.call('guarded'); old.bridge.deactivate();
  const replacement = fixture({ guarded: (input, context) => { newGuard = context.assertCurrent; newGuard(); newEffects++; return 'replacement'; } }, { connection: old.connection });
  assert.deepEqual(await replacement.call('guarded'), { ok: true, value: 'replacement' }); assert.notEqual(oldGuard, newGuard);
  assert.throws(() => oldGuard(), { code: 'SERVICE_DISPOSED' }); gate.release(); safeFailure(await pending, 'SERVICE_DISPOSED'); assert.equal(oldEffects, 0); assert.equal(newEffects, 1);
  safeFailure(await old.call('guarded'), 'SERVICE_DISPOSED'); assert.equal(newGuard(), true);
});

test('I09 exact captured peer denies semantic clones/current replacement and malformed route without operation access', async () => {
  let operations = 0, traps = 0;
  const f = fixture({ guarded: (input, context) => { operations++; context.assertCurrent(); return true; } });
  const getter = Object.defineProperty({}, 'proof', { enumerable: true, get() { traps++; throw Error(CANARY); } });
  for (const admittedPeer of [undefined, { provenance: 'typed-private-peer' }, { operator: f.peer }, f.connection]) {
    safeFailure(await f.handler('v1/guarded', getter, undefined, admittedPeer), 'OPERATOR_REQUIRED');
  }
  for (const endpoint of ['guarded', 'v1/guarded/', 'v1/Guarded', 'v1/guarded?x=1', 'v1/notInstalled', undefined, 1]) safeFailure(await f.handler(endpoint, getter, undefined, f.peer), 'ENDPOINT_NOT_FOUND');
  f.connection.operator = {};
  safeFailure(await f.handler('v1/guarded', {}, undefined, f.peer), 'OPERATOR_REQUIRED'); safeFailure(await f.handler('v1/guarded', {}, undefined, f.connection.operator), 'OPERATOR_REQUIRED');
  assert.equal(operations, 0); assert.equal(traps, 0);
});

test('I10 commit-first response loss retains typed receipt and does not perform an automatic replay', async () => {
  const gate = barrier(), controller = new AbortController(), receipts = new Map(); let commits = 0, reads = 0;
  const f = fixture({
    commit: async (input, context) => { context.assertCurrent(); commits++; const receipt = Object.freeze({ command: input.command, revision: 1 }); receipts.set(input.command, receipt); await gate.promise; return receipt; },
    readReceipt: (input, context) => { context.assertCurrent(); reads++; return receipts.get(input.command); },
  });
  const result = f.call('commit', { command: 'synthetic-command' }, { signal: controller.signal }); assert.equal(commits, 1); assert.equal(receipts.size, 1);
  controller.abort(); gate.release(); safeFailure(await result, 'REQUEST_ABORTED'); assert.equal(commits, 1); assert.equal(reads, 0);
  safeFailure(await f.call('commit', { command: 'synthetic-command' }, { signal: controller.signal }), 'REQUEST_ABORTED'); assert.equal(commits, 1);
  assert.deepEqual(await f.call('readReceipt', { command: 'synthetic-command' }), { ok: true, value: { command: 'synthetic-command', revision: 1 } }); assert.equal(reads, 1); assert.equal(commits, 1); assert.equal(receipts.size, 1);
});

test('I11 guarded rejection projection never executes thrown error getters/Proxy/reflection/coercion', async t => {
  let traps = 0;
  const accessor = Object.defineProperty({}, 'code', { get() { traps++; throw Error(CANARY); } });
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { traps++; throw Error(CANARY); }, get() { traps++; throw Error(CANARY); }, ownKeys() { traps++; throw Error(CANARY); } });
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const coercion = { code: { [Symbol.toPrimitive]() { traps++; throw Error(CANARY); }, toString() { traps++; throw Error(CANARY); } } };
  const inherited = Object.create(new Proxy({}, { get() { traps++; throw Error(CANARY); } }));
  const structured = Object.defineProperties({}, { code: { value: 'STALE_AUTHORITY' }, message: { get() { traps++; throw Error(CANARY); } }, details: { get() { traps++; throw Error(CANARY); } } });
  const cases = [['getter', accessor, 'OPERATION_REJECTED'], ['proxy', proxy, 'OPERATION_REJECTED'], ['revoked', revoked.proxy, 'OPERATION_REJECTED'], ['coercion', coercion, 'OPERATION_REJECTED'], ['inherited', inherited, 'OPERATION_REJECTED'], ['string', CANARY, 'OPERATION_REJECTED'], ['symbol', Symbol(CANARY), 'OPERATION_REJECTED'], ['null', null, 'OPERATION_REJECTED'], ['unknown-code', { code: CANARY }, 'OPERATION_REJECTED'], ['closed-known-code', structured, 'STALE_AUTHORITY']];
  for (const [name, error, code] of cases) await t.test(name, async () => {
    const f = fixture({ guarded: (input, context) => { context.assertCurrent(); throw error; } }); safeFailure(await f.call('guarded'), code);
  });
  assert.equal(traps, 0);
});

test('I12 whole captured input serialized size stays inclusive at65536 with no rejected effect', async t => {
  let effects = 0;
  const f = fixture({ guarded: (input, context) => { context.assertCurrent(); effects++; return Buffer.byteLength(JSON.stringify(input)); } });
  const prefix = '汉😀\n"\\';
  const initial = Buffer.byteLength(JSON.stringify({ body: prefix }));
  for (const bytes of [65535, 65536, 65537]) await t.test(`serialized bytes ${bytes}`, async () => {
    const payload = { body: prefix + 'a'.repeat(bytes - initial) }; assert.equal(Buffer.byteLength(JSON.stringify(payload)), bytes); assert.ok(Buffer.byteLength(payload.body) <= 65536);
    const before = effects, result = await f.call('guarded', payload);
    if (bytes > 65536) { safeFailure(result, 'INPUT_TOO_LARGE'); assert.equal(effects, before); }
    else { assert.deepEqual(result, { ok: true, value: bytes }); assert.equal(effects, before + 1); }
  });
});

test('I13 unchanged object/array/depth bounds deny before any private operation', async t => {
  let effects = 0;
  const f = fixture({ guarded: (input, context) => { context.assertCurrent(); effects++; return true; } });
  const inputs = [];
  for (const count of [63, 64, 65]) inputs.push([`object fields ${count}`, Object.fromEntries(Array.from({ length: count }, (_, i) => [`key${i}`, i])), count <= 64]);
  for (const count of [127, 128, 129]) inputs.push([`array elements ${count}`, { parts: Array(count).fill(0) }, count <= 128]);
  for (const depth of [11, 12, 13]) { let payload = 'end'; for (let i = 0; i < depth; i++) payload = { part: payload }; inputs.push([`value depth ${depth}`, payload, depth <= 12]); }
  for (const [name, payload, valid] of inputs) await t.test(name, async () => {
    const before = effects, result = await f.call('guarded', payload);
    if (valid) { assert.deepEqual(result, { ok: true, value: true }); assert.equal(effects, before + 1); }
    else { safeFailure(result, 'INPUT_TOO_LARGE'); assert.equal(effects, before); }
  });
});

test('I14 fractional capture mode remains exact and separate from trusted guard opt-in', async t => {
  const f = fixture({ memoryRemember: (input, context) => { context.assertCurrent(); return input.number; }, prepareContext: (input, context) => { context.assertCurrent(); return input.number; }, memoryRememberNear: (input, context) => { context.assertCurrent(); return input.number; }, guarded: (input, context) => { context.assertCurrent(); return input.number; } });
  for (const operation of ['memoryRemember', 'prepareContext']) {
    assert.deepEqual(await f.call(operation, { number: 0.9 }), { ok: true, value: 0.9 });
    for (const number of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) safeFailure(await f.call(operation, { number }), 'INVALID_INPUT');
  }
  for (const operation of ['memoryRememberNear', 'guarded']) safeFailure(await f.call(operation, { number: 0.9, fractional: true }), 'INVALID_INPUT');
  assert.deepEqual(await f.call('guarded', { number: 1 }), { ok: true, value: 1 });
});

test('I15 closure installation/deactivation/disposal have no typed domain effects and borrowed guard closes immediately', async () => {
  const cleanup = barrier(); let guard, effects = 0;
  const f = fixture({ readStatus: (input, context) => { guard = context.assertCurrent; guard(); return { ready: true }; }, mutate: (input, context) => { context.assertCurrent(); effects++; return true; } }, { unregister: () => cleanup.promise });
  assert.equal(f.registrations, 1); assert.equal(effects, 0); assert.deepEqual(await f.call('readStatus'), { ok: true, value: { ready: true } }); assert.equal(effects, 0);
  const disposal = f.bridge.dispose(); assert.throws(() => guard(), { code: 'SERVICE_DISPOSED' }); safeFailure(await f.call('mutate'), 'SERVICE_DISPOSED'); assert.equal(effects, 0); assert.equal(f.unregisters, 1);
  cleanup.release(); await disposal; safeFailure(await f.call('readStatus'), 'SERVICE_DISPOSED'); assert.equal(effects, 0);
});
