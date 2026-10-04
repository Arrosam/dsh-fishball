import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RuntimeStore, reference as r } from '../src/runtime-store.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ni2-current-'));
  const owner = {}, host = {}, other = {}, worker = {}, namespaceRef = r('synthetic-current-memory');
  let clock = 1000, allowed = true, count = 0;
  const command = () => r(`current-command-${++count}`), scope = { ownerId: 'synthetic-ni2-owner', workspaceId: 'synthetic-ni2-workspace' };
  const config = { databasePath: join(directory, 'runtime.sqlite'), encryptionKey: Buffer.alloc(32, 101), principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope }, { handle: other, role: 'host', scope: { ...scope, ownerId: 'different-owner' } }, { handle: worker, role: 'worker', scope, taskRef: r('unused'), generationRef: r('unused-generation') }], clock: () => clock, hostPermission: () => allowed };
  const store = new RuntimeStore(config); let currentStore = store;
  t.after(() => { currentStore.close(); rmSync(directory, { recursive: true, force: true }); });
  const task = store.intake(owner, { taskId: 'current-task', provider: 'fixture', source: 'synthetic', eventId: 'one', commandRef: command(), goal: 'Approved synthetic current input' }).task;
  const data = store.putData(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, kind: 'context', sourceRef: r('actual-source'), content: 'Approved whole synthetic context', expectedMemory: { namespaceRef, revision: 0 } });
  const policy = store.policy(owner, { commandRef: command(), expectedVersion: 1, limits: { maxActive: 1 }, modelPolicy: { version: 1, presetRefs: [r('preset')], catalogEvidenceRef: r('catalog') } });
  const spec = { actionRef: command(), kind: 'write', role: 'worker', targetDigest: r('target'), dataDigest: data.digest, units: 1, charges: { runtimeMs: 1, usageUnits: 1, costEstimateMicros: 0 }, attemptGroupRef: command(), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: 1, model: { presetRef: r('preset'), modelRef: r('model'), reasoningRef: r('reasoning'), catalogEvidenceRef: r('catalog') }, executor: { mode: 'create', generationRef: command(), environmentRef: r('environment'), bindingDigest: r('binding'), toolsDigest: r('tools'), permissionPolicyDigest: r('permission') } };
  const plan = store.planAction(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: data.task.version, expectedAuthEpoch: data.task.authEpoch, spec });
  const grant = store.grantAction(owner, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: data.task.version, expectedAuthEpoch: data.task.authEpoch, actionRef: plan.actionRef, actionDigest: plan.actionDigest, expiresAt: 2000 });
  const claim = store.claimAction(host, { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: grant.task.version, expectedAuthEpoch: grant.authEpoch, actionRef: plan.actionRef, actionDigest: plan.actionDigest });
  store.workerObservation(host, { taskRef: task.taskRef, commandRef: command(), claimRef: claim.claimRef, generationRef: claim.generationRef, phase: 'ready', sessionRef: r('observed-owned-session'), evidenceRef: r('ready') });
  const now = store.task(owner, task.taskRef), input = { taskRef: task.taskRef, commandRef: command(), expectedTaskVersion: now.version, expectedAuthEpoch: now.authEpoch, actionRef: claim.actionRef, actionDigest: claim.actionDigest, claimRef: claim.claimRef, generationRef: claim.generationRef, contextRecordRef: data.recordRef };
  const intent = store.beginContextExecution(host, input), binding = { taskRef: task.taskRef, claimRef: claim.claimRef, generationRef: claim.generationRef, actionDigest: claim.actionDigest, executionRef: intent.executionRef };
  return { store, owner, host, other, worker, command, config, namespaceRef, binding, spec, intent, taskRef: task.taskRef, plan, snapshot: () => currentStore.snapshot(owner, { taskRef: task.taskRef }), consume: () => store.assertExecutionCurrent(host, binding), tick: value => { clock = value; }, deny: () => { allowed = false; }, reopen: () => { store.close(); currentStore = new RuntimeStore(config); return currentStore; } };
}
test('late current assertion is host-only, requires consumed intent, and never consumes or mutates it', t => {
  const f = fixture(t), before = f.snapshot();
  assert.throws(() => f.store.assertNativeRequestCurrent(f.host, f.binding), { code: 'SPEC_MISMATCH' });
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.consume().admitted, true);
  const consumed = f.snapshot();
  for (let n = 0; n < 3; n++) {
    const current = f.store.assertNativeRequestCurrent(f.host, f.binding);
    assert.equal(current.state, 'dispatch_intent'); assert.equal(current.executionRef, f.intent.executionRef);
    current.dataDigest = r('caller-mutation');
    assert.deepEqual(f.snapshot(), consumed);
  }
  assert.equal(f.consume().admitted, false);
  for (const handle of [f.owner, f.other, f.worker, {}]) assert.throws(() => f.store.assertNativeRequestCurrent(handle, f.binding));
  assert.deepEqual(f.snapshot(), consumed);
});
test('late fence validates every immutable binding and refuses authority/descriptor spoof without hooks', t => {
  const f = fixture(t); f.consume(); const before = f.snapshot(); let calls = 0;
  for (const field of Object.keys(f.binding)) assert.throws(() => f.store.assertNativeRequestCurrent(f.host, { ...f.binding, [field]: r(`different-${field}`) }));
  for (const input of [{ ...f.binding, current: true }, { ...f.binding, verified: true }, { ...f.binding, contextRecordRef: r('extra') }, Object.assign(Object.create(null),f.binding), new Proxy(f.binding,{ getPrototypeOf(){calls++;throw Error('PRIVATE_CANARY');} }), Object.defineProperty({...f.binding},'executionRef',{enumerable:true,get(){calls++;throw Error('PRIVATE_CANARY');}})]) assert.throws(() => f.store.assertNativeRequestCurrent(f.host, input), { code: 'INVALID_INPUT', message: 'INVALID_INPUT' });
  assert.equal(calls, 0); assert.deepEqual(f.snapshot(), before);
});
test('expiry after durable consume denies late request without releasing reservation or renewing intent', t => {
  const f = fixture(t); f.consume(); f.tick(2000); const before = f.snapshot();
  assert.throws(() => f.store.assertNativeRequestCurrent(f.host, f.binding), { code: 'APPROVAL_INVALID' });
  assert.deepEqual(f.snapshot(), before); assert.equal(before.actions[0].releaseEvidenceRef, null);
});
test('revocation after durable consume fences request and retains exact signed execution', t => {
  const f = fixture(t); f.consume(); const current = f.snapshot().task;
  f.store.revokeAction(f.owner, { taskRef: f.taskRef, commandRef: f.command(), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, actionRef: f.plan.actionRef, actionDigest: f.plan.actionDigest });
  const before = f.snapshot(); assert.throws(() => f.store.assertNativeRequestCurrent(f.host, f.binding)); assert.deepEqual(f.snapshot(), before);
});
test('control pause and policy drift after consume each refuse a late provider request', async t => {
  for (const kind of ['pause','cancel','policy']) await t.test(kind, t => {
    const f = fixture(t); f.consume(); const current = f.snapshot().task;
    if (kind === 'policy') f.store.policy(f.owner, { commandRef: f.command(), expectedVersion: 2, limits: {}, modelPolicy: { version: 2, presetRefs: [r('preset')], catalogEvidenceRef: r('catalog') } });
    else f.store.control(f.owner, { taskRef: f.taskRef, commandRef: f.command(), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, kind });
    const before = f.snapshot(); assert.throws(() => f.store.assertNativeRequestCurrent(f.host, f.binding)); assert.deepEqual(f.snapshot(), before);
  });
});
test('current native permission and memory revision are rechecked after consumed intent', async t => {
  for (const kind of ['permission','memory']) await t.test(kind,t => {
    const f = fixture(t); f.consume();
    if (kind === 'permission') f.deny();
    else f.store.putMemory(f.owner, { namespaceRef: f.namespaceRef, commandRef: f.command(), expectedRevision: 0, content: 'Changed synthetic memory', sourceRefs: [r('source')] });
    const before = f.snapshot(); assert.throws(() => f.store.assertNativeRequestCurrent(f.host,f.binding),{code:kind==='permission'?'HOST_DENIED':'STALE_MEMORY'}); assert.deepEqual(f.snapshot(),before);
  });
});
test('restart cannot turn an uncertain consumed execution into current native authority', t => {
  const f = fixture(t); f.consume(); const reopened = f.reopen(), before = f.snapshot();
  assert.equal(before.executions[0].state,'unknown');
  assert.throws(() => reopened.assertNativeRequestCurrent(f.host,f.binding),{code:'SPEC_MISMATCH'}); assert.deepEqual(f.snapshot(),before);
});
