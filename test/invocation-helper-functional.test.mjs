import test from 'node:test';
import assert from 'node:assert/strict';
import { BootstrapError } from '../src/config.mjs';
import {
  assertInstalledWorkerInvocation as current,
  captureInstalledWorkerInvocation as capture,
  withInstalledWorkerInvocation as enter,
  runInstalledWorkerInvocation as run,
} from '../src/installed-invocation.mjs';

// Typed callbacks, Context identities, counters and Map receipts are doubles.
// The helper's actual Node AsyncLocalStorage is exercised. There is no native
// authentication, facade, store, DB, provider, listener or product mutation.
const CANARY = 'SYNTHETIC_INVOCATION_HELPER_PRIVATE_CANARY';
const gate = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const stable = code => error => error instanceof BootstrapError && error.code === code && error.message === code && !String(error).includes(CANARY);
const stableCodes = ['SERVICE_DISPOSED', 'OPERATOR_REQUIRED', 'REQUEST_ABORTED'];

test('I01 absent and fabricated carriers deny without invoking the protected callback', async t => {
  const ctx = { synthetic: 'context' }; let effects = 0;
  for (const value of [undefined, null, {}, Object.freeze({}), { ctx, assertCurrent: () => true }, { approved: true, role: 'owner' }, { token: {}, current: true }]) await t.test('unbranded-' + String(value === null ? 'null' : typeof value), () => {
    assert.throws(() => enter(ctx, value, () => { effects++; }), stable('SERVICE_DISPOSED'));
  });
  assert.throws(() => current(ctx), stable('SERVICE_DISPOSED'));
  assert.throws(() => capture(ctx), stable('SERVICE_DISPOSED'));
  for (const value of [null, undefined, 1, 'context', () => true]) await t.test('invalid-context-' + typeof value, async () => {
    await assert.rejects(run(value, () => true, () => { effects++; }), stable('SERVICE_DISPOSED'));
  });
  for (const [guard, callback] of [[null, () => { effects++; }], [() => true, null], [{ assertCurrent: () => true }, () => { effects++; }]]) await t.test('noncallable-trusted-argument', async () => {
    await assert.rejects(run(ctx, guard, callback), stable('SERVICE_DISPOSED'));
  });
  assert.equal(effects, 0);
});

test('I02 initial guards admit literal synchronous true only and do not assimilate truthy values', async t => {
  let reads = 0, thenCalls = 0;
  const values = [false, undefined, null, 0, 1, -1, NaN, Infinity, 'true', {}, [], new Boolean(true), Promise.resolve(true),
    Object.defineProperty({}, 'then', { get() { reads++; throw new Error(CANARY); } }),
    { then() { thenCalls++; return true; } }];
  for (let index = 0; index < values.length; index++) await t.test('decision-' + index, async () => {
    const ctx = {}; let checks = 0, calls = 0;
    await assert.rejects(run(ctx, () => { checks++; return values[index]; }, () => { calls++; return 'not admitted'; }), stable('SERVICE_DISPOSED'));
    assert.equal(checks, 1); assert.equal(calls, 0);
  });
  const value = {};
  assert.equal(await run({}, () => true, () => value), value);
  assert.equal(reads, 0); assert.equal(thenCalls, 0);
});

test('I03 first bounded guard code is permanent and a later true or different denial cannot replace it', async t => {
  for (const first of stableCodes) for (const later of stableCodes) await t.test(first + '->' + later, async () => {
    const ctx = {}; let token, mode = 'allow', checks = 0, effects = 0;
    const guard = () => { checks++; if (mode !== 'allow') throw new BootstrapError(mode); return true; };
    await assert.rejects(run(ctx, guard, () => {
      token = capture(ctx); mode = first;
      assert.throws(() => current(ctx), stable(first));
      const sealedAt = checks; mode = 'allow';
      assert.throws(() => current(ctx), stable(first)); assert.equal(checks, sealedAt);
      mode = later; assert.throws(() => current(ctx), stable(first)); assert.equal(checks, sealedAt);
      return { misleadingSuccess: true };
    }), stable(first));
    const sealedAt = checks;
    assert.throws(() => enter(ctx, token, () => { effects++; }), stable(first));
    assert.equal(checks, sealedAt); assert.equal(effects, 0);
    await run(ctx, () => true, () => { effects++; });
    assert.equal(effects, 1);
  });
});

test('I04 error classification is own-data-only and all unbounded details remain outside the stable guard error', async t => {
  let ordinaryReads = 0, coercions = 0, reflection = 0;
  const getter = Object.defineProperty({}, 'code', { get() { ordinaryReads++; throw new Error(CANARY); } });
  const inherited = Object.create({ code: 'REQUEST_ABORTED' });
  const fakeCode = { toString() { coercions++; return 'REQUEST_ABORTED'; } };
  const failures = [new Error(CANARY), getter, inherited, { code: 'WORKER_RESULT_UNAVAILABLE', message: CANARY },
    { code: 'request_aborted' }, { code: fakeCode }, null, undefined, 'REQUEST_ABORTED', Symbol(CANARY),
    new Proxy({}, { getOwnPropertyDescriptor() { reflection++; throw new Error(CANARY); }, get() { ordinaryReads++; throw new Error(CANARY); } })];
  for (let index = 0; index < failures.length; index++) await t.test('guard-error-' + index, async () => {
    let calls = 0;
    await assert.rejects(run({}, () => { throw failures[index]; }, () => { calls++; }), stable('SERVICE_DISPOSED'));
    assert.equal(calls, 0);
  });
  for (const code of stableCodes) await t.test('known-own-data-' + code, async () => {
    const error = Object.defineProperty({ message: CANARY, details: { private: CANARY } }, 'code', { value: code, enumerable: false });
    await assert.rejects(run({}, () => { throw error; }, () => assert.fail('denied guard')), stable(code));
  });
  assert.equal(ordinaryReads, 0); assert.equal(coercions, 0);
  // Ordinary code getters are never read. Proxy descriptor reflection may run
  // once; the trusted callback seam does not promise universal trap-zero.
  assert.equal(reflection, 1);
});

test('I05 exact context identity seals the offending carrier and receiver metadata cannot redirect it', async t => {
  const ctx = Object.freeze({ owner: 'fixture', workspace: 'fixture' }), clone = { ...ctx }; let token, checks = 0;
  await assert.rejects(run.call({ ctx: clone, approved: true }, ctx, () => { checks++; return true; }, () => {
    token = capture.call(clone, ctx);
    assert.ok(Object.isFrozen(token)); assert.deepEqual(Reflect.ownKeys(token), []); assert.equal(JSON.stringify(token), '{}');
    assert.equal(current.call(clone, ctx), true);
    assert.throws(() => current(ctx === clone ? {} : clone), stable('SERVICE_DISPOSED'));
    const sealedAt = checks;
    assert.throws(() => current(ctx), stable('SERVICE_DISPOSED')); assert.equal(checks, sealedAt);
    return 'caught wrong-context refusal';
  }), stable('SERVICE_DISPOSED'));
  assert.throws(() => enter.call({ ctx, token }, ctx, token, () => true), stable('SERVICE_DISPOSED'));
  assert.equal(await run(ctx, () => true, () => current(ctx)), true);
});

test('I06 a caught first refusal wins over manager-style success or wrapped errors with no callback replay', async t => {
  for (const code of stableCodes) for (const outcome of ['caught-success', 'wrapped-error']) await t.test(code + '/' + outcome, async () => {
    const ctx = {}; let mode = 'allow', calls = 0, token;
    await assert.rejects(run(ctx, () => { if (mode !== 'allow') throw new BootstrapError(mode); return true; }, async () => {
      calls++; token = capture(ctx); await Promise.resolve(); mode = code;
      try { current(ctx); } catch { mode = 'allow'; }
      if (outcome === 'wrapped-error') throw new BootstrapError('WORKER_FINISH_UNAVAILABLE');
      return { state: 'completed' };
    }), stable(code));
    assert.equal(calls, 1);
    assert.throws(() => enter(ctx, token, () => assert.fail('sealed original carrier')), stable(code));
  });
});

test('I07 simultaneous requests in the same context retain separate guards and tokens in both completion orders', async t => {
  for (const order of ['b-first', 'a-first']) await t.test(order, async () => {
    const ctx = {}, aReady = gate(), bReady = gate(), aGate = gate(), bGate = gate();
    let aCurrent = true, tokenA, tokenB; const effects = [];
    const a = run(ctx, () => { if (!aCurrent) throw new BootstrapError('REQUEST_ABORTED'); return true; }, async () => {
      tokenA = capture(ctx); aReady.resolve(); await aGate.promise; current(ctx); effects.push('a');
    });
    const aDenied = assert.rejects(a, stable('REQUEST_ABORTED'));
    const b = run(ctx, () => true, async () => {
      tokenB = capture(ctx); bReady.resolve(); await bGate.promise; current(ctx); effects.push('b'); return tokenB;
    });
    await Promise.all([aReady.promise, bReady.promise]); assert.notEqual(tokenA, tokenB); aCurrent = false;
    if (order === 'b-first') { bGate.resolve(); await b; aGate.resolve(); await aDenied; }
    else { aGate.resolve(); await aDenied; bGate.resolve(); await b; }
    assert.deepEqual(effects, ['b']);
    assert.throws(() => enter(ctx, tokenA, () => true), stable('REQUEST_ABORTED'));
    assert.equal(enter(ctx, tokenB, () => current(ctx)), true);
  });
});

test('I08 explicit reentry into an old carrier leaves a simultaneous fresh carrier and other context independent', async t => {
  const a = {}, b = {}; let tokenA, expired = false, checksA = 0;
  await run(a, () => { checksA++; if (expired) throw new BootstrapError('OPERATOR_REQUIRED'); return true; }, () => { tokenA = capture(a); });
  expired = true;
  await run(b, () => true, async () => {
    const tokenB = capture(b);
    assert.throws(() => enter(a, tokenA, () => assert.fail('retired a')), stable('OPERATOR_REQUIRED'));
    assert.equal(current(b), true); await Promise.resolve(); assert.equal(capture(b), tokenB);
    await run(a, () => true, () => {
      assert.throws(() => enter(a, tokenA, () => true), stable('OPERATOR_REQUIRED'));
      assert.equal(current(a), true); assert.notEqual(capture(a), tokenA);
    });
    assert.equal(current(b), true);
  });
  const count = checksA;
  assert.throws(() => enter(a, tokenA, () => true), stable('OPERATOR_REQUIRED')); assert.equal(checksA, count);
});

test('I09 nested captured reentry restores the original outer context after normal return and thrown error', async t => {
  for (const outcome of ['return', 'throw']) await t.test(outcome, async () => {
    const a = {}, b = {}, sourceError = new BootstrapError('WORKER_RESULT_UNAVAILABLE'); let tokenA;
    await run(a, () => true, async () => {
      tokenA = capture(a);
      await run(b, () => true, async () => {
        const tokenB = capture(b);
        const inner = () => enter(a, tokenA, () => { assert.equal(current(a), true); if (outcome === 'throw') throw sourceError; return 'a'; });
        if (outcome === 'throw') assert.throws(inner, error => error === sourceError); else assert.equal(inner(), 'a');
        assert.equal(current(b), true); assert.equal(capture(b), tokenB); await Promise.resolve(); assert.equal(current(b), true);
      });
      assert.equal(current(a), true); assert.equal(capture(a), tokenA);
    });
    assert.throws(() => current(a), stable('SERVICE_DISPOSED')); assert.throws(() => current(b), stable('SERVICE_DISPOSED'));
  });
});

test('I10 exact captured token survives handler return but shaped copies and foreign-context use never create a carrier', async t => {
  const ctx = {}; let token, alive = true, calls = 0;
  await run(ctx, () => alive, () => { token = capture(ctx); });
  assert.throws(() => capture(ctx), stable('SERVICE_DISPOSED'));
  for (const copy of [{ ...token }, Object.create(token), JSON.parse(JSON.stringify(token))]) await t.test('copied-token', () => {
    assert.throws(() => enter(ctx, copy, () => { calls++; }), stable('SERVICE_DISPOSED'));
  });
  assert.equal(enter(ctx, token, () => { calls++; return current(ctx); }), true); assert.equal(calls, 1);
  alive = false;
  assert.throws(() => enter(ctx, token, () => { calls++; }), stable('SERVICE_DISPOSED'));
  alive = true; assert.throws(() => enter(ctx, token, () => { calls++; }), stable('SERVICE_DISPOSED'));
  assert.equal(calls, 1);
  let second;
  await run(ctx, () => true, () => { second = capture(ctx); });
  assert.throws(() => enter({ ...ctx }, second, () => { calls++; }), stable('SERVICE_DISPOSED'));
  assert.throws(() => enter(ctx, second, () => { calls++; }), stable('SERVICE_DISPOSED'));
  assert.equal(calls, 1);
});

test('I11 an asynchronous continuation must still assert its original carrier before a typed effect', async () => {
  const ctx = {}, continueGate = gate(); let token, ready = true, continuation, effects = 0;
  await run(ctx, () => { if (!ready) throw new BootstrapError('REQUEST_ABORTED'); return true; }, () => { token = capture(ctx); });
  continuation = enter(ctx, token, async () => { await continueGate.promise; current(ctx); effects++; });
  const denied = assert.rejects(continuation, stable('REQUEST_ABORTED'));
  ready = false; continueGate.resolve(); await denied;
  assert.equal(effects, 0); assert.throws(() => enter(ctx, token, () => true), stable('REQUEST_ABORTED'));
  assert.throws(() => current(ctx), stable('SERVICE_DISPOSED'));
  // enter() asserts immediately before the trusted callback. It is not an
  // unconditional final-await wrapper; synchronous provider gates and async
  // continuations must perform their own final currentness assertion.
});

test('I12 before-effect denial differs from committed typed receipt plus lost response; neither replays', async t => {
  for (const order of ['loss-first', 'commit-first-success', 'commit-first-error']) await t.test(order, async () => {
    const ctx = {}, wait = gate(), ready = gate(), receipts = new Map(); let connected = true, calls = 0, effects = 0;
    const pending = run(ctx, () => { if (!connected) throw new BootstrapError('REQUEST_ABORTED'); return true; }, async () => {
      calls++; ready.resolve(); await wait.promise;
      if (order === 'loss-first') current(ctx);
      else { current(ctx); effects++; receipts.set('fixed-command', Object.freeze({ effect: effects })); connected = false; }
      if (order === 'commit-first-error') throw new BootstrapError('WORKER_FINISH_UNAVAILABLE');
      return receipts.get('fixed-command');
    });
    const denied = assert.rejects(pending, stable('REQUEST_ABORTED'));
    await ready.promise; if (order === 'loss-first') connected = false; wait.resolve(); await denied;
    assert.equal(calls, 1); assert.equal(effects, order === 'loss-first' ? 0 : 1); assert.equal(receipts.size, effects);
    const observed = await run(ctx, () => true, () => receipts.get('fixed-command'));
    assert.equal(observed?.effect, effects ? 1 : undefined); assert.equal(effects, receipts.size);
  });
});

test('I13 a current carrier preserves ordinary callback values and source errors without claiming RPC redaction', async t => {
  for (const kind of ['object-result', 'promise-result', 'known-source-error', 'unbounded-source-error']) await t.test(kind, async () => {
    const ctx = {}, result = Object.freeze({ state: 'unknown', receipt: 'synthetic-receipt' }); let checks = 0, calls = 0;
    const sourceError = kind === 'known-source-error' ? new BootstrapError('WORKER_SOURCE_UNAVAILABLE') : new Error(CANARY);
    const pending = run(ctx, () => { checks++; return true; }, () => {
      calls++;
      if (kind.endsWith('error')) throw sourceError;
      return kind === 'promise-result' ? Promise.resolve(result) : result;
    });
    if (kind.endsWith('error')) await assert.rejects(pending, error => error === sourceError);
    else assert.equal(await pending, result);
    assert.equal(calls, 1); assert.equal(checks, 2);
  });
  // The helper redacts guard failures. Current domain errors deliberately pass
  // through this private seam; the separately tested RPC projection must bound
  // any raw domain error before exposing it to a user.
});

test('I14 zero-lifetime setup and final reassertion cause no extra callbacks or typed mutations', async t => {
  for (const completion of ['success', 'failure']) await t.test(completion, async () => {
    const ctx = {}; let alive = true, calls = 0, checks = 0;
    await assert.rejects(run(ctx, () => { checks++; if (!alive) throw new BootstrapError('SERVICE_DISPOSED'); return true; }, async () => {
      calls++; await Promise.resolve(); alive = false;
      if (completion === 'failure') throw new BootstrapError('WORKER_FINISH_UNAVAILABLE');
      return true;
    }), stable('SERVICE_DISPOSED'));
    assert.equal(calls, 1); assert.equal(checks, 2);
    // It is a new explicit request, not resurrection of the denied carrier.
    assert.equal(await run(ctx, () => true, () => current(ctx)), true);
  });
});

test('I15 context metadata and callable payload fields confer no authority or implicit background path', async () => {
  let reads = 0, payloadCalls = 0, token;
  const ctx = Object.defineProperties({}, { role: { get() { reads++; throw new Error(CANARY); } },
    assertCurrent: { get() { reads++; return () => { payloadCalls++; return true; }; } } });
  await run(ctx, () => true, () => { token = capture(ctx); assert.equal(current(ctx), true); });
  assert.equal(reads, 0); assert.equal(payloadCalls, 0);
  assert.throws(() => enter({}, token, () => { payloadCalls++; }), stable('SERVICE_DISPOSED'));
  assert.throws(() => enter(ctx, token, () => { payloadCalls++; }), stable('SERVICE_DISPOSED'));
  assert.equal(payloadCalls, 0);
  assert.throws(() => current(ctx), stable('SERVICE_DISPOSED'));
  // Actual background native receipt authority is not represented by this
  // owner carrier at all; the facade/owned receipt unit is still unexecuted.
});
