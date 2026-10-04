import test from 'node:test';
import assert from 'node:assert/strict';
import { installOperatorBridge } from '../src/operator-bridge.mjs';

function fixture(operation, isAlive = () => true) {
  const operator = Object.freeze({}); let handler;
  const connection = { operator, rpc: { handle(channel, value) { assert.equal(channel, '/df-rpc'); handler = value; return () => {}; } } };
  const bridge = installOperatorBridge({ connection, operations: { status: operation }, isAlive });
  return { connection, bridge, call: (signal, payload = {}) => handler('v1/status', payload, signal, operator) };
}
const barrier = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const denied = code => ({ ok: false, error: { code, message: code, details: {} } });

test('invocation context is exact immutable private authority, detached from payload', async () => {
  let seen;
  const f = fixture((input, context) => {
    seen = context;
    assert.deepEqual(Object.keys(context), ['assertCurrent']); assert.equal(Object.isFrozen(context), true);
    assert.equal(context.assertCurrent(), true); assert.equal(Object.isFrozen(input), true); return 'value';
  });
  assert.deepEqual(await f.call(), { ok: true, value: 'value' });
  assert.equal((await f.call(undefined, { assertCurrent() { throw new Error('secret'); } })).error.code, 'INVALID_INPUT');
  f.bridge.deactivate(); assert.throws(() => seen.assertCurrent(), { code: 'SERVICE_DISPOSED' });
});

for (const drift of ['abort', 'peer', 'dispose', 'alive']) test(`guarded ${drift} after await prevents mutation with bounded code`, async () => {
  const gate = barrier(), controller = new AbortController(); let alive = true, mutations = 0;
  const f = fixture(async (input, context) => { context.assertCurrent(); await gate.promise; context.assertCurrent(); mutations++; return true; }, () => alive);
  const result = f.call(controller.signal);
  if (drift === 'abort') controller.abort();
  if (drift === 'peer') f.connection.operator = {};
  if (drift === 'dispose') f.bridge.deactivate();
  if (drift === 'alive') alive = false;
  gate.release(); assert.deepEqual(await result, denied(drift === 'abort' ? 'REQUEST_ABORTED' : drift === 'peer' ? 'OPERATOR_REQUIRED' : 'SERVICE_DISPOSED'));
  assert.equal(mutations, 0);
});

test('opt-in final check preserves committed effects and denies lost response', async () => {
  const gate = barrier(), controller = new AbortController(); let committed = 0;
  const f = fixture(async (input, context) => { context.assertCurrent(); committed++; await gate.promise; return 'committed'; });
  const result = f.call(controller.signal); controller.abort(); gate.release();
  assert.deepEqual(await result, denied('REQUEST_ABORTED')); assert.equal(committed, 1);
  assert.deepEqual(await f.call(controller.signal), denied('REQUEST_ABORTED')); assert.equal(committed, 1);
});

test('parallel requests retain separate guards and legacy ignored context retains admitted response', async () => {
  const gate = barrier(), first = new AbortController(), second = new AbortController(); const guards = [];
  const f = fixture(async (input, context) => { guards.push(context.assertCurrent); context.assertCurrent(); await gate.promise; context.assertCurrent(); return input.id; });
  const a = f.call(first.signal, { id: 'a' }), b = f.call(second.signal, { id: 'b' });
  assert.notEqual(guards[0], guards[1]); first.abort(); gate.release();
  assert.deepEqual(await a, denied('REQUEST_ABORTED')); assert.deepEqual(await b, { ok: true, value: 'b' });
  const legacyGate = barrier(), legacyAbort = new AbortController();
  const legacy = fixture(async () => { await legacyGate.promise; return 'original'; });
  const result = legacy.call(legacyAbort.signal); legacyAbort.abort(); legacyGate.release();
  assert.deepEqual(await result, { ok: true, value: 'original' });
});

test('replacement peer is denied before any new operation even with original admitted peer', async () => {
  let calls = 0; const f = fixture(() => { calls++; return true; }); f.connection.operator = {};
  assert.deepEqual(await f.call(), denied('OPERATOR_REQUIRED')); assert.equal(calls, 0);
});
