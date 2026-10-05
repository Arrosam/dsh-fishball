import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerManager } from '../src/worker.mjs';
import { workerDigest as d } from '../src/environment.mjs';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Fault-order module fixture. Real SQLite integration is a separate test below
// once the core interface lands; these doubles do not prove host/model work.
function fixture({ deferred = false, deny = false } = {}) {
  const owner = {}, host = {};
  const task = { taskRef: d('task'), workspaceRef: d('workspace'), version: 1, authEpoch: 0, status: 'active' };
  const action = { actionRef: d('action'), actionDigest: d('action-digest'), spec: { executor: { mode: 'create', generationRef: d('gen'), sessionRef: d('session') }, model: {} } };
  const observations = [], effects = [];
  const store = {
    snapshot(handle) { if (handle !== owner && handle !== host) throw new Error('UNAUTHORIZED'); return { task: { ...task }, actions: [{ ...action }] }; },
    claimAction(handle, input) { if (handle !== owner || action.claimRef || task.status !== 'active' || input.expectedTaskVersion !== task.version) throw new Error('CLAIM_REJECTED'); action.claimRef = d('claim'); action.reservationRef = d('reservation'); effects.push('claim'); return { claimRef: action.claimRef, reservationRef: action.reservationRef, generationRef: d('gen'), task: { ...task } }; },
    workerObservation(handle, input) { assert.equal(handle, host); observations.push(input); effects.push(input.phase); return input; },
    assertClaimCurrent() { if(task.status !== "active") throw new Error("STALE"); return true; },
    control(handle) { assert.equal(handle, owner); task.status = 'cancel_requested'; task.authEpoch++; effects.push('control'); return { ...task }; },
  };
  const ticket = {}, listeners = new Set(); let pendingResolve, state = 'prepared', creates = 0, boundClaim;
  const receipt = phase => ({ actionRef:action.actionRef,actionDigest:boundClaim?.actionDigest??action.actionDigest,claimRef:boundClaim?.claimRef??d('claim'),reservationRef:boundClaim?.reservationRef??d('reservation'),taskRef: task.taskRef, generationRef: d('gen'), sessionRef: d('session'), phase, cursor: 0, evidenceRef: d('receipt', phase) });
  const adapter = {
    async prepare() { if (deny) throw new Error('SYNTHETIC_SECRET'); return ticket; },
    bindClaim(_,claim) { boundClaim=claim; },
    observe(_, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async create() { creates++; effects.push('native-create'); state = 'submitted'; if (deferred) await new Promise(resolve => { pendingResolve = resolve; }); state = 'created'; return receipt('created'); },
    async resume() { throw new Error('UNEXPECTED_RESUME'); },
    query() { return receipt(state === 'created' ? 'ready' : state === 'stopped' ? 'stopped' : 'unknown'); },
    async cancel() { effects.push('native-cancel'); return receipt(state === 'created' ? 'cancel_requested' : 'unknown'); },
    async dispose() { effects.push('native-dispose'); if (state !== 'created') return receipt('unknown'); state = 'stopped'; return receipt('stopped'); },
  };
  const manager = new WorkerManager({ store, hostHandle: host, adapter });
  const input = { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, commandRef: d('dispatch'), expectedTaskVersion: 1, expectedAuthEpoch: 0, timeoutMs: 2 };
  return { owner, host, store, adapter, manager, input, task, action, observations, effects, creates: () => creates, resolve: () => pendingResolve(), mapping: () => ({ taskRef: task.taskRef, actionRef: action.actionRef, claimRef: action.claimRef, generationRef: d('gen') }) };
}
test('durable submitted boundary precedes native create; creation does not prove running or complete task', async () => {
  const f = fixture(); const result = await f.manager.dispatch(f.owner, f.input);
  assert.deepEqual(f.effects.slice(0, 4), ['claim', 'submitted', 'native-create', 'created']);
  assert.equal(result.phase, 'ready'); assert.equal(f.task.status, 'active'); assert.equal(result.actionDigest, f.input.actionDigest);
  assert.equal(result.reservationRef, d('reservation'));
  await assert.rejects(f.manager.dispatch(f.owner, f.input), { code: 'WORKER_ALREADY_SUBMITTED' });
  assert.equal(f.creates(), 1);
});
test('create timeout holds original claim; late receipt reconciles same generation without recreation', async () => {
  const f = fixture({ deferred: true }); const first = await f.manager.dispatch(f.owner, f.input);
  assert.equal(first.phase, 'unknown'); assert.equal(first.claimRef, d('claim')); assert.equal(first.reservationRef, d('reservation'));
  assert.equal(f.manager.query(f.owner, f.mapping()).phase, 'unknown');
  await assert.rejects(f.manager.dispatch(f.owner, f.input), { code: 'WORKER_ALREADY_SUBMITTED' });
  f.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.manager.query(f.owner, f.mapping()).phase, 'ready'); assert.equal(f.creates(), 1);
});
test('restart cannot recover ownership by JSON or create again; wrong mapping cannot query', async () => {
  const f = fixture(); await f.manager.dispatch(f.owner, f.input);
  const restarted = new WorkerManager({ store: f.store, hostHandle: f.host, adapter: f.adapter });
  assert.equal(restarted.query(f.owner, f.mapping()).phase, 'unknown');
  assert.throws(() => restarted.query(f.owner, { ...f.mapping(), generationRef: d('wrong-gen') }), { code: 'WORKER_MAPPING_MISMATCH' });
  assert.throws(() => restarted.query({}, f.mapping()), /UNAUTHORIZED/);
  await assert.rejects(restarted.dispatch(f.owner, f.input), { code: 'WORKER_ALREADY_SUBMITTED' });
  assert.equal(f.creates(), 1);
});
test('cancel commits control first; native stop retains reservation and needs separate effect settlement', async () => {
  const f = fixture(); await f.manager.dispatch(f.owner, f.input);
  const result = await f.manager.cancel(f.owner, { taskRef: f.task.taskRef, commandRef: d('cancel'), expectedTaskVersion: 1, expectedAuthEpoch: 0 });
  assert.equal(result.workers[0].phase, 'stopped'); assert.equal(result.workers[0].reservationRef, d('reservation'));
  assert.ok(f.effects.indexOf('control') < f.effects.indexOf('native-cancel'));
  assert.equal(typeof f.store.settleAction, 'undefined');
});
test('cancel during unresolved create stops late publication without releasing held outcomes', async () => {
  const f = fixture({ deferred: true }); await f.manager.dispatch(f.owner, f.input);
  const cancelled = await f.manager.cancel(f.owner, { taskRef: f.task.taskRef, commandRef: d('cancel'), expectedTaskVersion: 1, expectedAuthEpoch: 0 });
  assert.equal(cancelled.workers[0].phase, 'unknown');
  f.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.manager.query(f.owner, f.mapping()).phase, 'stopped'); assert.equal(f.creates(), 1);
});
test('preparation denial and payload spoof reject before any durable claim or native effect', async () => {
  const f = fixture({ deny: true });
  await assert.rejects(f.manager.dispatch(f.owner, f.input), { code: 'WORKER_PREPARATION_UNAVAILABLE', message: 'WORKER_PREPARATION_UNAVAILABLE' });
  assert.deepEqual(f.effects, []);
  for (const input of [{ ...f.input, scope: {} }, { ...f.input, verified: true }, new Proxy(f.input, {})]) await assert.rejects(f.manager.dispatch(f.owner, input), { code: 'WORKER_INVALID' });
  assert.deepEqual(f.effects, []);
});

function runtimeFixture() {
  const f = fixture(), directory = mkdtempSync(join(tmpdir(), 'df-worker-ledger-')), otherOwner = {};
  const store = new RuntimeStore({ databasePath: join(directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 9), principals: [{ handle: f.owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: f.host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: otherOwner, role: 'owner', scope: { ownerId: 'other-owner', workspaceId: 'other-workspace' } }], hostPermission: () => true });
  const registered = store.intake(f.owner, { taskId: 'synthetic-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('intake') });
  f.task.taskRef = registered.task.taskRef;
  const policy = store.policy(f.owner, { commandRef: d('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
  const spec = { actionRef: f.action.actionRef, kind: 'write', role: 'worker', targetDigest: d('target'), dataDigest: d('data'), units: 1, charges: { runtimeMs: 10, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: d('group'), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: 1, model: { presetRef: d('preset'), modelRef: d('model'), reasoningRef: d('reasoning'), catalogEvidenceRef: d('catalog') }, executor: { ...f.action.spec.executor, environmentRef: d('environment'), bindingDigest: d('binding'), toolsDigest: d('tools'), permissionPolicyDigest: d('permission') } };
  const planned = store.planAction(f.owner, { taskRef: f.task.taskRef, commandRef: d('plan'), expectedTaskVersion: 1, expectedAuthEpoch: 0, spec });
  const granted = store.grantAction(f.owner, { taskRef: f.task.taskRef, actionRef: planned.actionRef, actionDigest: planned.actionDigest, commandRef: d('grant'), expectedTaskVersion: 1, expectedAuthEpoch: 0, expiresAt: Date.now() + 60000 });
  const manager = new WorkerManager({ store, hostHandle: f.host, adapter: f.adapter });
  const input = { ...f.input, taskRef: f.task.taskRef, actionDigest: planned.actionDigest, expectedTaskVersion: granted.taskVersion, expectedAuthEpoch: granted.authEpoch };
  return { ...f, store, manager, input, directory, otherOwner, spec, close: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
test('actual SQLite runtime preserves original complete intent, owned mapping and accountable stop until settlement', async () => {
  const f = runtimeFixture();
  try {
    const dispatched = await f.manager.dispatch(f.owner, f.input);
    assert.equal(dispatched.phase, 'ready');
    let snapshot = f.store.snapshot(f.owner, { taskRef: f.task.taskRef });
    assert.equal(snapshot.actions[0].actionDigest, f.input.actionDigest);
    assert.equal(snapshot.workers[0].generationRef, d('gen')); assert.equal(snapshot.workers[0].phase, 'ready');
    const cancelled = await f.manager.cancel(f.owner, { taskRef: f.task.taskRef, commandRef: d('actual-cancel'), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch });
    assert.equal(cancelled.workers[0].phase, 'stopped');
    snapshot = f.store.snapshot(f.owner, { taskRef: f.task.taskRef });
    assert.equal(snapshot.actions[0].releaseEvidenceRef, null, 'stopping alone cannot settle effects');
    assert.equal(snapshot.task.status, 'cancel_requested');
    assert.throws(() => f.store.control(f.owner, { taskRef: f.task.taskRef, commandRef: d('confirm'), expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch, kind: 'confirm_cancel' }), { code: 'RESERVATION_HELD' });
    const worker = snapshot.workers[0];
    const settled = f.store.settleAction(f.host, { taskRef: f.task.taskRef, claimRef: dispatched.claimRef, generationRef: d('gen'), commandRef: d('settle'), outcome: 'terminated', evidenceRef: d('known-no-effects'), terminalEvidenceRef: worker.terminalEvidenceRef });
    assert.equal(settled.reservationHeld, false);
    assert.equal(f.store.snapshot(f.owner, { taskRef: f.task.taskRef }).actions[0].actionDigest, f.input.actionDigest);
  } finally { f.close(); }
});
test('actual SQLite restart retains uncertain executor and rejects repeated dispatch', async () => {
  const f = runtimeFixture();
  try {
    const dispatched = await f.manager.dispatch(f.owner, f.input);
    f.store.close();
    const restarted = new RuntimeStore({ databasePath: join(f.directory, 'ledger.sqlite'), encryptionKey: Buffer.alloc(32, 9), principals: [{ handle: f.owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: f.host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }], hostPermission: () => true });
    try {
      const manager = new WorkerManager({ store: restarted, hostHandle: f.host, adapter: f.adapter });
      const observed = manager.query(f.owner, { taskRef: f.task.taskRef, actionRef: f.action.actionRef, claimRef: dispatched.claimRef, generationRef: d('gen') });
      assert.equal(observed.phase, 'unknown'); assert.equal(observed.reservationRef, dispatched.reservationRef);
      const snapshot = restarted.snapshot(f.owner, { taskRef: f.task.taskRef }); assert.equal(snapshot.task.status, 'recovery_required');
      await assert.rejects(manager.dispatch(f.owner, { ...f.input, expectedTaskVersion: snapshot.task.version, expectedAuthEpoch: snapshot.task.authEpoch }), { code: 'WORKER_ALREADY_SUBMITTED' });
      assert.equal(f.creates(), 1);
    } finally { restarted.close(); }
  } finally { f.close(); }
});
test('dispatch snapshots complete input before awaiting preparation and rejects forged cross-action receipt', async () => {
  const f = fixture(); let proceed, prepared;
  const original = { ...f.input }, prepare = f.adapter.prepare;
  f.adapter.prepare = async (spec, task, digest) => { prepared = { spec, task, digest }; await new Promise(resolve => { proceed = resolve; }); return prepare(); };
  const pending = f.manager.dispatch(f.owner, f.input);
  await new Promise(resolve => setImmediate(resolve));
  f.input.actionRef = d('other-action'); f.input.actionDigest = d('other-digest'); f.input.taskRef = d('other-task');
  proceed(); const result = await pending;
  assert.equal(result.actionRef, original.actionRef); assert.equal(result.actionDigest, original.actionDigest); assert.equal(result.taskRef, original.taskRef);
  assert.equal(prepared.digest, original.actionDigest); assert.equal(f.creates(), 1);
});
test('actual SQLite same task/action/generation refs in another owner scope cannot retrieve or control cached worker', async () => {
  const f = runtimeFixture();
  try {
    await f.manager.dispatch(f.owner, f.input);
    const other = f.store.intake(f.otherOwner, { taskId: 'synthetic-task', provider: 'fixture', source: 'source', eventId: 'event', commandRef: d('other-intake') }).task;
    f.store.policy(f.otherOwner, { commandRef: d('other-policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [d('preset')], catalogEvidenceRef: d('catalog') } });
    const plan = f.store.planAction(f.otherOwner, { taskRef: other.taskRef, commandRef: d('other-plan'), expectedTaskVersion: other.version, expectedAuthEpoch: other.authEpoch, spec: f.spec });
    const grant = f.store.grantAction(f.otherOwner, { taskRef: other.taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest, commandRef: d('other-grant'), expectedTaskVersion: other.version, expectedAuthEpoch: other.authEpoch, expiresAt: Date.now() + 60000 });
    const claim = f.store.claimAction(f.otherOwner, { taskRef: other.taskRef, actionRef: plan.actionRef, actionDigest: plan.actionDigest, commandRef: d('other-claim'), expectedTaskVersion: grant.taskVersion, expectedAuthEpoch: grant.authEpoch });
    assert.equal(other.taskRef, f.task.taskRef, 'raw IDs hash equally across scope');
    assert.throws(() => f.manager.query(f.otherOwner, { taskRef: other.taskRef, actionRef: plan.actionRef, claimRef: claim.claimRef, generationRef: claim.generationRef }), { code: 'WORKER_SCOPE_DENIED' });
    const current = f.store.task(f.otherOwner, other.taskRef);
    await assert.rejects(f.manager.cancel(f.otherOwner, { taskRef: other.taskRef, commandRef: d('other-cancel'), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch }), { code: 'WORKER_SCOPE_DENIED' });
    assert.deepEqual(f.store.task(f.otherOwner, other.taskRef), current);
    assert.equal(f.creates(), 1);
  } finally { f.close(); }
});

async function executionFixture({ deferred = false, deny = false, forged = false } = {}) {
  const f = fixture(); await f.manager.dispatch(f.owner, f.input);
  const body = { recordRef: d('context'), kind: 'context', content: 'Immutable synthetic context', digest: d('context-data'), byteLength: 27 };
  f.action.spec.dataDigest = body.digest;
  let intent, effects = 0, finish;
  f.store.readData = (caller, input) => { assert.equal(caller, f.owner); assert.equal(input.recordRef, body.recordRef); return { ...body }; };
  f.store.beginContextExecution = (handle, input) => {
    assert.equal(handle, f.host);
    if (intent) return { ...intent, deduplicated: true };
    intent = { executionRef: d('execution'), taskRef: input.taskRef, claimRef: input.claimRef, generationRef: input.generationRef, contextRecordRef: input.contextRecordRef, actionDigest: input.actionDigest, dataDigest: body.digest, state: 'intent_committed' };
    f.effects.push('execution-intent'); return { ...intent, deduplicated: false };
  };
  f.store.assertExecutionCurrent = (handle, input) => {
    assert.equal(handle, f.host); assert.equal(input.executionRef, intent.executionRef);
    if (deny) throw new Error('SYNTHETIC_EXECUTION_CANARY');
    const admitted = intent.state === 'intent_committed'; intent.state = 'dispatch_intent'; f.effects.push('execution-consume');
    return { ...intent, admitted };
  };
  f.adapter.executeContext = async (_ticket, binding, context, consume) => {
    assert.equal(binding.actionDigest, f.input.actionDigest); assert.equal(context.content, body.content);
    if (deferred) await new Promise(resolve => { finish = resolve; });
    const admitted = consume(); assert.equal(admitted.admitted, true); effects++; f.effects.push('native-send');
    return { executionRef: forged ? d('foreign-execution') : binding.executionRef, state: 'committed', worker: f.adapter.query() };
  };
  const input = { ...f.mapping(), actionDigest: f.input.actionDigest, contextRecordRef: body.recordRef, commandRef: d('execute-command'), expectedTaskVersion: 1, expectedAuthEpoch: 0, timeoutMs: deferred ? 2 : 1000 };
  return { ...f, body, executionInput: input, effectsCount: () => effects, finish: () => finish?.(), intent: () => ({ ...intent }) };
}
test('execution persists one intent and final consume before native send; duplicate command cannot wake again', async () => {
  const f = await executionFixture(), result = await f.manager.executeContext(f.owner, f.executionInput);
  assert.equal(result.state, 'committed'); assert.equal(f.effectsCount(), 1);
  assert.deepEqual(f.effects.slice(-3), ['execution-consume', 'native-send', 'ready']);
  assert.equal((await f.manager.executeContext(f.owner, f.executionInput)).admitted, false);
  assert.equal(f.effectsCount(), 1); assert.equal(f.task.status, 'active');
});
test('execution denial and foreign completion are redacted unknowns retaining exact reservation', async () => {
  for (const options of [{ deny: true }, { forged: true }]) {
    const f = await executionFixture(options), result = await f.manager.executeContext(f.owner, f.executionInput);
    assert.equal(result.state, 'unknown'); assert.equal(result.worker.claimRef, d('claim')); assert.equal(result.worker.reservationRef, d('reservation'));
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_EXECUTION_CANARY'), false);
    assert.equal((await f.manager.executeContext(f.owner, f.executionInput)).admitted, false);
    assert.equal(f.effectsCount(), options.deny ? 0 : 1);
  }
});
test('execution timeout holds ownership; late final consume denial prevents send and duplicate replay', async () => {
  const f = await executionFixture({ deferred: true });
  const result = await f.manager.executeContext(f.owner, f.executionInput);
  assert.equal(result.state, 'unknown'); assert.equal(result.worker.reservationRef, d('reservation'));
  f.store.assertExecutionCurrent = () => { throw new Error('REVOKED_OR_UNKNOWN'); };
  f.finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.effectsCount(), 0); assert.equal((await f.manager.executeContext(f.owner, f.executionInput)).admitted, false);
});
test('execution immutable context and scoped claim mismatch reject before durable intent', async () => {
  const f = await executionFixture();
  for (const input of [{ ...f.executionInput, generationRef: d('foreign') }, { ...f.executionInput, claimRef: d('foreign') }, { ...f.executionInput, principal: {} }]) await assert.rejects(f.manager.executeContext(f.owner, input));
  f.body.digest = d('changed'); await assert.rejects(f.manager.executeContext(f.owner, f.executionInput), { code: 'WORKER_CONTEXT_INVALID' });
  assert.equal(f.effects.includes('execution-intent'), false); assert.equal(f.effectsCount(), 0);
});
