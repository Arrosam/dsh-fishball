import test from 'node:test';
import assert from 'node:assert/strict';
import { BootstrapError } from '../src/config.mjs';
import { assertInstalledWorkerInvocation as current, captureInstalledWorkerInvocation as capture, withInstalledWorkerInvocation as enter, runInstalledWorkerInvocation as run } from '../src/installed-invocation.mjs';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const code = expected => error => error.code === expected && error.message === expected;

test('missing or wrong exact context denies without caller JSON authority', async () => {
  const ctx = {};
  assert.throws(() => current(ctx), code('SERVICE_DISPOSED'));
  assert.throws(() => enter(ctx, {ctx, assertCurrent:()=>true}, () => true), code('SERVICE_DISPOSED'));
  await assert.rejects(run(ctx, () => true, () => current({})), code('SERVICE_DISPOSED'));
  for (const value of [false, 1, 'true', undefined]) await assert.rejects(run(ctx, () => value, () => assert.fail('must not run')), code('SERVICE_DISPOSED'));
});
test('distinct awaited invocation carriers retain their own exact guard', async () => {
  const a = {}, b = {}, gate = deferred(); let allowA = true, mutations = 0;
  const first = run(a, () => { if (!allowA) throw new BootstrapError('REQUEST_ABORTED'); return true; }, async () => { await gate.promise; current(a); mutations++; });
  const firstCheck = assert.rejects(first, code('REQUEST_ABORTED'));
  await run(b, () => true, async () => { await Promise.resolve(); current(b); mutations++; });
  allowA = false; gate.resolve(); await firstCheck; assert.equal(mutations, 1);
});
test('first stable guard denial survives manager wrapping and subsequent callback recovery', async () => {
  const ctx = {}; let denied = false, token;
  await assert.rejects(run(ctx, () => { if (denied) throw new BootstrapError('OPERATOR_REQUIRED'); return true; }, async () => {
    token = capture(ctx); denied = true;
    try { current(ctx); } catch { denied = false; throw new BootstrapError('WORKER_FINISH_UNAVAILABLE'); }
  }), code('OPERATOR_REQUIRED'));
  assert.throws(() => enter(ctx, token, () => assert.fail('sealed token')), code('OPERATOR_REQUIRED'));
  await run(ctx, () => true, () => true);
});
test('outer recheck rejects success or failure after transport loss without replay', async () => {
  for (const methodFails of [false, true]) {
    const ctx = {}; let aborted = false, calls = 0;
    await assert.rejects(run(ctx, () => { if (aborted) throw new BootstrapError('REQUEST_ABORTED'); return true; }, async () => {
      calls++; await Promise.resolve(); aborted = true;
      if (methodFails) throw new BootstrapError('WORKER_FINISH_UNAVAILABLE');
      return { outcome: 'completed' };
    }), code('REQUEST_ABORTED'));
    assert.equal(calls, 1);
  }
});
test('captured execute gate reentry uses original carrier while later requests remain independent', async () => {
  const ctx = {}; let token, expired = false;
  await run(ctx, () => { if (expired) throw new BootstrapError('REQUEST_ABORTED'); return true; }, () => { token = capture(ctx); });
  expired = true;
  await run(ctx, () => true, () => {
    assert.throws(() => enter(ctx, token, () => true), code('REQUEST_ABORTED'));
    assert.equal(current(ctx), true);
  });
});
test('unbounded thrown details and accessor error code never enter stable projection', async () => {
  for (const failure of [new Error('SECRET_CANARY'), Object.defineProperty({}, 'code', {get(){assert.fail('getter');}})]) {
    await assert.rejects(run({}, () => {throw failure;}, () => true), code('SERVICE_DISPOSED'));
  }
  const sourceError = new BootstrapError('WORKER_RESULT_UNAVAILABLE');
  await assert.rejects(run({}, () => true, () => {throw sourceError;}), error => error === sourceError);
});
