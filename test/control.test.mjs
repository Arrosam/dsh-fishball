import test from 'node:test';
import assert from 'node:assert/strict';
import { applicableControls } from '../src/control.mjs';
test('terminal, recovery and dispatch pause controls are distinct from executor termination', () => {
 for (const status of ['completed', 'failed', 'cancelled', 'deleted']) assert.deepEqual(applicableControls({ status }), []);
 assert.deepEqual(applicableControls({ status: 'running' }), ['pause', 'cancel']);
 assert.deepEqual(applicableControls({ status: 'running' }, true), ['resume', 'cancel']);
 assert.deepEqual(applicableControls({ status: 'recovery_required' }, true), ['pause', 'cancel']);
 assert.deepEqual(applicableControls({ status: 'cancel_requested' }), []);
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { TaskControl } from '../src/control.mjs';
const ref = reference;
function fixture(t) {
 const dir = mkdtempSync(join(tmpdir(), 'bubbles-control-')), path = join(dir, 'ledger.db'), owner = {}, host = {}, worker = {}, other = {}, taskRef = ref('task'); let now = 1000;
 const options = { databasePath: path, encryptionKey: Buffer.alloc(32, 5), principals: [{ handle: owner, role: 'owner', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: worker, role: 'worker', scope: { ownerId: 'owner', workspaceId: 'workspace' }, taskRef, generationRef: ref('worker-generation'), sessionRef: ref('worker-session') }, { handle: other, role: 'owner', scope: { ownerId: 'other', workspaceId: 'workspace' } }], clock: () => now, hostPermission: () => true };
 let store = new RuntimeStore(options); t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
 store.intake(owner, { taskId: 'task', provider: 'mock', source: 'source', eventId: 'event', commandRef: ref('intake') });
 const bind = command => { const task = store.task(owner, taskRef); return { taskRef, commandRef: ref(command), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch }; };
 const control = () => new TaskControl(store);
 return { get store() { return store; }, owner, host, worker, other, taskRef, bind, control, setTime(value) { now = value; }, reopen() { store.close(); store = new RuntimeStore(options); } };
}
test('real control double-click and stale page preserve newest facts; refresh queries authoritative new snapshot', t => {
 const x = fixture(t), click = { ...x.bind('pause'), kind: 'pause' }, before = x.control().refresh(x.owner, x.taskRef);
 const first = x.control().apply(x.owner, click); assert.equal(first.outcome, 'applied'); assert.equal(first.dispatchState, 'blocked'); assert.equal(first.terminationState, 'not_requested');
 assert.deepEqual(x.control().apply(x.owner, click), first);
 assert.throws(() => x.control().apply(x.owner, { ...click, kind: 'cancel' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
 const stale = x.control().apply(x.owner, { ...click, commandRef: ref('old-page-resume'), kind: 'resume' }); assert.equal(stale.outcome, 'stale'); assert.equal(stale.reasonCode, 'STALE_VERSION');
 x.setTime(2000); const refreshed = x.control().refresh(x.owner, x.taskRef); assert.ok(refreshed.task.version > before.task.version); assert.equal(refreshed.observedAt, 2000); assert.deepEqual(refreshed.allowedControls, ['resume', 'cancel']);
 x.reopen(); assert.equal(x.control().refresh(x.owner, x.taskRef).control, 'paused');
 assert.equal(x.control().apply(x.owner, { ...x.bind('resume'), kind: 'resume' }).dispatchState, 'open');
});
test('worker/reviewer/self-role controls and other owner snapshots are denied; terminal controls are rejected', t => {
 const x = fixture(t), pause = { ...x.bind('worker-pause'), kind: 'pause' };
 assert.throws(() => x.control().apply(x.worker, pause), error => error.code === 'UNAUTHORIZED');
 assert.throws(() => x.control().apply({ role: 'owner' }, pause), error => error.code === 'UNAUTHORIZED');
 assert.throws(() => x.control().refresh(x.other, x.taskRef), error => error.code === 'TASK_NOT_FOUND');
 x.store.revise(x.owner, { ...x.bind('complete'), status: 'completed', reason: 'operator' });
 const snapshot = x.control().refresh(x.owner, x.taskRef); assert.deepEqual(snapshot.allowedControls, []);
 assert.equal(x.control().apply(x.owner, { ...x.bind('terminal-cancel'), kind: 'cancel' }).outcome, 'rejected');
});
test('cancel before or after a claim stops admission and reports requested termination, retaining in-flight reservation', t => {
 const x = fixture(t);
 x.store.policy(x.owner, { commandRef: ref('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
 const spec = { actionRef: ref('action'), kind: 'write', role: 'worker', targetDigest: ref('target'), dataDigest: ref('data'), units: 1, charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: ref('attempt'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'create', generationRef: ref('generation'), environmentRef: ref('environment'), bindingDigest: ref('binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
 const action = x.store.planAction(x.owner, { ...x.bind('plan'), spec }); x.store.grantAction(x.owner, { ...x.bind('grant'), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: 2000 });
 const claim = x.store.claimAction(x.host, { ...x.bind('claim'), actionRef: action.actionRef, actionDigest: action.actionDigest });
 const cancelled = x.control().apply(x.owner, { ...x.bind('cancel'), kind: 'cancel' }); assert.equal(cancelled.outcome, 'partial'); assert.equal(cancelled.dispatchState, 'blocked'); assert.equal(cancelled.terminationState, 'requested'); assert.equal(cancelled.reservationsHeld, 1);
 x.reopen(); const snapshot = x.control().refresh(x.owner, x.taskRef); assert.equal(snapshot.task.status, 'cancel_requested'); assert.equal(snapshot.actions[0].claimRef, claim.claimRef); assert.equal(snapshot.workers[0].phase, 'unknown');
 assert.equal(x.control().apply(x.owner, { ...x.bind('blind-resume'), kind: 'resume' }).outcome, 'rejected');
});

test('lost control reply remains unknown until real ledger refresh; explicit pagination never drops tasks silently', t => {
 const x = fixture(t), bridge = { control(handle, input) { x.store.control(handle, input); const error = new Error('synthetic transport exception'); error.code = 'CONTROL_TRANSPORT_UNKNOWN'; throw error; }, snapshot: (handle, input) => x.store.snapshot(handle, input) };
 const result = new TaskControl(bridge).apply(x.owner, { ...x.bind('lost-pause'), kind: 'pause' }); assert.equal(result.outcome, 'unknown'); assert.equal(result.reconciliation, 'read_current'); assert.equal(x.control().refresh(x.owner, x.taskRef).control, 'paused');
 x.store.intake(x.owner, { taskId: 'second-task', provider: 'mock', source: 'source', eventId: 'second-event', commandRef: ref('second-intake') });
 const first = x.control().list(x.owner, { offset: 0, limit: 1 }), second = x.control().list(x.owner, { offset: 1, limit: 1 }); assert.equal(first.total, 2); assert.equal(first.items.length, 1); assert.equal(first.hasMore, true); assert.equal(second.hasMore, false); assert.notEqual(first.items[0].taskRef, second.items[0].taskRef);
 assert.throws(() => x.control().list(x.owner, { offset: 0, limit: 129 }), error => error.code === 'INVALID_INPUT');
});
