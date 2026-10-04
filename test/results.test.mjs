import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeReport, normalizeReceipt } from '../src/results.mjs';
import { DomainError } from '../src/messages.mjs';
const ref = s => createHash('sha256').update(s).digest('hex');
const report = more => ({ originalGoalRef: ref('goal'), completedScopeRef: ref('scope'), unfinishedRef: ref('unfinished'), nextStepRef: ref('next'), verificationState: 'not_run', verificationEvidence: [], blockerRefs: [], progressDigest: ref('progress'), ...more });
const receipt = more => ({ artifactRef: ref('artifact'), artifactVersion: 1, digest: ref('bytes'), recipientRef: ref('recipient'), channelRef: ref('channel'), permissionState: 'granted', openability: 'verified', observedAt: 1000, evidenceRef: ref('opened'), ...more });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof DomainError && error.code === code && error.message === code);
test('reports always preserve goal, scope, unrun checks, unfinished work and next step', () => {
 const r = normalizeReport(report()); assert.equal(r.verificationState, 'not_run'); assert.deepEqual(r.verificationEvidence, []); assert.ok(Object.isFrozen(r));
 rejects(() => normalizeReport(report({ verificationState: 'passed' })), 'VERIFICATION_REQUIRED');
 rejects(() => normalizeReport(report({ verificationState: 'failed' })), 'VERIFICATION_REQUIRED');
 const evidence = { evidenceRef: ref('evidence'), digest: ref('checked'), observedAt: 1000 };
 assert.equal(normalizeReport(report({ verificationState: 'passed', verificationEvidence: [evidence] })).verificationEvidence.length, 1);
 rejects(() => normalizeReport(report({ verificationEvidence: [evidence] })), 'VERIFICATION_CONFLICT');
 const incomplete = report(); delete incomplete.unfinishedRef; rejects(() => normalizeReport(incomplete), 'INVALID_INPUT');
});
test('reports are bounded references, never raw path/prose/approval or unbounded blockers', () => {
 rejects(() => normalizeReport(report({ rawSummary: 'synthetic_secret_canary' })), 'INVALID_INPUT');
 rejects(() => normalizeReport(report({ localPath: ref('unapproved') })), 'INVALID_INPUT');
 rejects(() => normalizeReport(report({ blockerRefs: new Array(17).fill(ref('blocker')) })), 'INVALID_INPUT');
 rejects(() => normalizeReport(report({ blockerRefs: [ref('blocker'), ref('blocker')] })), 'INVALID_INPUT');
});
test('opening receipts explicitly bind recipient, channel, version, bytes and observation time', () => {
 const r = normalizeReceipt(receipt()); assert.equal(r.artifactVersion, 1); assert.ok(Object.isFrozen(r));
 assert.equal(normalizeReceipt(receipt({ permissionState: 'revoked', openability: 'failed', observedAt: 2000 })).permissionState, 'revoked');
 rejects(() => normalizeReceipt(receipt({ artifactVersion: 0 })), 'INVALID_INPUT');
 rejects(() => normalizeReceipt(receipt({ observedAt: -1 })), 'INVALID_INPUT');
 rejects(() => normalizeReceipt(receipt({ delivered: true })), 'INVALID_INPUT');
 const unbound = receipt(); delete unbound.recipientRef; rejects(() => normalizeReceipt(unbound), 'INVALID_INPUT');
});

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';
import { ResultPipeline } from '../src/results.mjs';
function fixture(t, adapter, policy = () => ({ quietUntil: 0, coalesceUntil: 0, allowObstaclesDuringQuiet: false }), overrides = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'bubbles-results-')), databasePath = join(dir, 'ledger.db'), owner = {}, host = {}, other = {}, taskRef = reference('task'); let now = 1000;
 const principals = [{ handle: owner, role: 'owner', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'owner', workspaceId: 'workspace' } }, { handle: other, role: 'owner', scope: { ownerId: 'other', workspaceId: 'workspace' } }];
 const options = { databasePath, encryptionKey: Buffer.alloc(32, 9), principals, clock: () => now, hostPermission: () => true, forbiddenSecrets: ['sk_synthetic_canary'], ...overrides, limits: { maxActive: 8, ...overrides.limits } };
 let store = new RuntimeStore(options); t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
 store.intake(owner, { taskId: 'task', provider: 'mock', source: 'source', eventId: 'event', commandRef: ref('intake') });
 store.policy(owner, { commandRef: ref('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
 const task = () => store.task(owner, taskRef), bind = tag => ({ taskRef, commandRef: ref(tag), expectedTaskVersion: task().version, expectedAuthEpoch: task().authEpoch });
 const pipeline = () => new ResultPipeline(store, { hostHandle: host, recipientAdapter: adapter, progressPolicy: policy });
 function reviewer(artifact, tag = 'reviewer') { const handle = {}, generationRef = ref(`${tag}-review-generation`); store.bindExecution(host, handle, { taskRef, role: 'reviewer', generationRef, sessionRef: ref(`${tag}-session`), readRecordRefs: [artifact.recordRef] });
  const spec = { actionRef: ref(`${tag}-review-action`), kind: 'review', role: 'review', targetDigest: ref(`${tag}-review-material`), dataDigest: artifact.digest, units: 1, charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: ref(`${tag}-review-attempt`), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef, environmentRef: ref('review-environment'), bindingDigest: ref('binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
  const a = store.planAction(owner, { ...bind(`${tag}-review-plan`), spec }); store.grantAction(owner, { ...bind(`${tag}-review-grant`), actionRef: a.actionRef, actionDigest: a.actionDigest, expiresAt: 2000 }); store.claimAction(host, { ...bind(`${tag}-review-claim`), actionRef: a.actionRef, actionDigest: a.actionDigest }); return handle; }
 function artifact(tag = 'artifact', content = 'editable synthetic artifact') { const a = pipeline().writeArtifact(owner, { ...bind(`${tag}-write`), artifactRef: ref(tag), version: 1, content }); pipeline().verify(reviewer(a, tag), { taskRef, commandRef: ref(`${tag}-review`), artifactRef: a.artifactRef, version: a.version, digest: a.digest, verdict: 'passed', evidenceRef: ref(`${tag}-review-evidence`) }); const reviewClaim = store.snapshot(owner, { taskRef }).actions.find(item => item.actionRef === ref(`${tag}-review-action`)); store.settleAction(host, { taskRef, commandRef: ref(`${tag}-review-settle`), claimRef: reviewClaim.claimRef, generationRef: reviewClaim.generationRef, outcome: 'completed', evidenceRef: ref(`${tag}-review-evidence`) }); return store.artifact(owner, { taskRef, artifactRef: a.artifactRef }); }
 function delivery(a, tag = 'delivery') { return pipeline().acceptDelivery(owner, { ...bind(`${tag}-accept`), deliveryRef: ref(tag), artifactRef: a.artifactRef, artifactVersion: a.version, digest: a.digest, recipientRef: ref('recipient'), channelRef: ref('channel') }); }
 function approve(d, tag = 'action') { const spec = { actionRef: ref(tag), kind: 'write', role: 'worker', targetDigest: d.targetDigest, dataDigest: d.digest, units: 1, charges: { runtimeMs: 0, usageUnits: 0, costEstimateMicros: 0 }, attemptGroupRef: ref(tag), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef: ref(`${tag}-generation`), environmentRef: ref('environment'), bindingDigest: ref('binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } }; const a = store.planAction(owner, { ...bind(`${tag}-plan`), spec }); store.grantAction(owner, { ...bind(`${tag}-grant`), actionRef: a.actionRef, actionDigest: a.actionDigest, expiresAt: 2000 }); return { ...bind(`${tag}-dispatch`), deliveryRef: d.deliveryRef, actionRef: a.actionRef, actionDigest: a.actionDigest }; }
 return { get store() { return store; }, owner, host, other, taskRef, databasePath, pipeline, bind, task, artifact, reviewer, delivery, approve, setTime(v) { now = v; }, reopen() { store.close(); store = new RuntimeStore(options); } };
}
function opened(record, state = 'delivered', more = {}) { return { artifactRef: record.artifactRef, artifactVersion: record.artifactVersion, digest: record.digest, recipientRef: record.recipientRef, channelRef: record.channelRef, permissionState: 'granted', openability: 'verified', observedAt: 1000, evidenceRef: ref(`receipt-${state}`), state, ...more }; }

test('artifact writes are scoped immutable versions; review is independent and mutation invalidates latest verification', t => {
 const x = fixture(t, { async send(d) { return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d); } });
 const first = x.artifact(); assert.equal(first.verification.verdict, 'accepted');
 const second = x.pipeline().writeArtifact(x.owner, { ...x.bind('mutate'), artifactRef: first.artifactRef, version: 2, content: 'new artifact bytes' });
 assert.notEqual(second.digest, first.digest); assert.equal(second.verification, null);
 assert.equal(x.store.artifact(x.owner, { taskRef: x.taskRef, artifactRef: first.artifactRef, version: 1 }).digest, first.digest);
 assert.throws(() => x.pipeline().acceptDelivery(x.owner, { ...x.bind('stale-delivery'), deliveryRef: ref('stale'), artifactRef: first.artifactRef, artifactVersion: first.version, digest: first.digest, recipientRef: ref('recipient'), channelRef: ref('channel') }), e => e.code === 'ARTIFACT_STALE');
 assert.throws(() => x.pipeline().verify(x.owner, { taskRef: x.taskRef, commandRef: ref('self-review'), artifactRef: second.artifactRef, version: second.version, digest: second.digest, verdict: 'passed', evidenceRef: ref('evidence') }), e => e.code === 'UNAUTHORIZED');
 assert.throws(() => x.pipeline().artifact(x.other, x.taskRef, first.artifactRef), e => e.code === 'RECORD_NOT_FOUND');
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('path'), artifactRef: ref('unsafe'), version: 1, content: 'safe', path: ref('path') }), e => e.code === 'INVALID_INPUT');
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('secret'), artifactRef: ref('secret'), version: 1, content: 'sk_synthetic_canary' }), e => e.code === 'SECRET_REJECTED');
 assert.equal(readFileSync(x.databasePath).includes(Buffer.from('new artifact bytes')), false);
});
test('recipient confirmed delivery remains historical after access revocation, independently of task completion', async t => {
 let sends = 0;
 const x = fixture(t, { async send(d) { sends++; return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d, 'failed', { permissionState: 'revoked', openability: 'failed', observedAt: 2000, evidenceRef: ref('revoked-access') }); } });
 const d = x.delivery(x.artifact()), command = x.approve(d), delivered = await x.pipeline().dispatch(x.owner, command);
 assert.equal(delivered.delivery.state, 'delivered'); assert.equal(sends, 1); assert.equal(x.task().status, 'running');
 const access = await x.pipeline().currentAccess(x.owner, x.taskRef, d.deliveryRef); assert.equal(access.state, 'delivered'); assert.equal(access.currentAccess.permissionState, 'denied'); assert.equal(access.observations[0].state, 'delivered');
 assert.equal((await x.pipeline().dispatch(x.owner, command)).dispatched, false); assert.equal(sends, 1);
});
test('timeout after effect reopens unknown; query cannot become blind retry or batch resend', async t => {
 let effects = 0; const x = fixture(t, { async send() { effects++; throw new Error('sk_synthetic_canary'); }, async query(d) { return opened(d, 'unknown', { permissionState: 'unknown', openability: 'unknown', observedAt: 1500 }); }, async open(d) { return opened(d); } });
 const d = x.delivery(x.artifact()), command = x.approve(d);
 assert.equal((await x.pipeline().dispatch(x.owner, command)).delivery.state, 'unknown'); x.reopen();
 assert.equal(x.pipeline().delivery(x.owner, x.taskRef, d.deliveryRef).state, 'unknown');
 assert.equal((await x.pipeline().dispatchBatch(x.owner, [command]))[0].dispatched, false); assert.equal(effects, 1);
 assert.equal((await x.pipeline().reconcile(x.owner, x.taskRef, d.deliveryRef)).state, 'unknown');
 assert.ok(x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions[0].reservationRef);
});
test('progress facts deduplicate, quiet/coalescing decision persists separately from delivery success', t => {
 const x = fixture(t, { async send(d) { return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d); } }, () => ({ quietUntil: 2000, coalesceUntil: 3000, allowObstaclesDuringQuiet: false }));
 const a = x.pipeline().progress(x.owner, { ...x.bind('progress-one'), progressRef: ref('progress-one'), kind: 'milestone', report: report() });
 assert.equal(a.state, 'quiet'); assert.equal(a.notificationDelivered, false);
 const b = x.pipeline().progress(x.owner, { ...x.bind('progress-two'), progressRef: ref('progress-two'), kind: 'milestone', report: report() }); assert.equal(b.state, 'unchanged_suppressed');
 x.setTime(2500);
 const c = x.pipeline().progress(x.owner, { ...x.bind('progress-three'), progressRef: ref('progress-three'), kind: 'obstacle', report: report({ blockerRefs: [ref('blocker')] }) }); assert.equal(c.state, 'coalesced'); assert.equal(c.notificationDelivered, false);
 x.reopen(); assert.equal(x.store.snapshot(x.owner, { taskRef: x.taskRef }).progress.length, 2);
});

test('historical receipt and subsequent revoked access remain readable after exact release and reopen', async t => {
 const x = fixture(t, { async send(d) { return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d, 'failed', { permissionState: 'revoked', openability: 'failed', observedAt: 2000 }); } });
 const d = x.delivery(x.artifact()), command = x.approve(d), sent = await x.pipeline().dispatch(x.owner, command);
 const settled = x.store.settleAction(x.host, { taskRef: x.taskRef, commandRef: ref('release-delivery'), claimRef: sent.delivery.claimRef, generationRef: sent.delivery.generationRef, outcome: 'completed', evidenceRef: ref('delivered-closed') }); assert.equal(settled.reservationHeld, false);
 x.reopen(); const access = await x.pipeline().currentAccess(x.owner, x.taskRef, d.deliveryRef); assert.equal(access.state, 'delivered'); assert.equal(access.currentAccess.permissionState, 'denied'); assert.equal(access.observations[0].permissionState, 'allowed');
});
test('partial batch retries a released confirmed failed item with new lineage, preserving delivered and unknown siblings', async t => {
 const states = ['delivered', 'failed', 'unknown', 'delivered']; let sends = 0;
 const x = fixture(t, { async send(d) { return opened(d, states[sends++]); }, async query(d) { return opened(d, 'unknown'); }, async open(d) { return opened(d); } });
 const commands = [], deliveries = [];
 for (let i = 0; i < 3; i++) { const d = x.delivery(x.artifact(`artifact-${i}`), `delivery-${i}`), command = x.approve(d, `action-${i}`); commands.push(command); deliveries.push((await x.pipeline().dispatch(x.owner, command)).delivery); }
 assert.deepEqual(deliveries.map(d => d.state), ['delivered', 'failed', 'unknown']);
 assert.deepEqual((await x.pipeline().dispatchBatch(x.owner, commands)).map(r => r.dispatched), [false, false, false]); assert.equal(sends, 3);
 const failed = deliveries[1], retryInput = { ...x.bind('retry'), deliveryRef: ref('retry-item'), previousDeliveryRef: failed.deliveryRef, artifactRef: failed.artifactRef, artifactVersion: failed.artifactVersion, digest: failed.digest, recipientRef: failed.recipientRef, channelRef: failed.channelRef };
 assert.throws(() => x.pipeline().retryFailed(x.owner, retryInput), e => e.code === 'RETRY_UNCONFIRMED');
 x.store.settleAction(x.host, { taskRef: x.taskRef, commandRef: ref('failure-closed'), claimRef: failed.claimRef, generationRef: failed.generationRef, outcome: 'failed', evidenceRef: ref('confirmed-no-delivery') });
 const retry = x.pipeline().retryFailed(x.owner, { ...retryInput, ...x.bind('retry-ready') }); assert.equal(retry.previousDeliveryRef, failed.deliveryRef);
 const retryCommand = x.approve(retry, 'retry-action'); assert.equal((await x.pipeline().dispatchBatch(x.owner, [retryCommand]))[0].delivery.state, 'delivered'); assert.equal(sends, 4);
 assert.equal(x.pipeline().delivery(x.owner, x.taskRef, deliveries[0].deliveryRef).state, 'delivered'); assert.equal(x.pipeline().delivery(x.owner, x.taskRef, deliveries[2].deliveryRef).state, 'unknown');
 assert.throws(() => x.pipeline().retryFailed(x.owner, { ...retryInput, ...x.bind('unknown-retry'), previousDeliveryRef: deliveries[2].deliveryRef }), e => e.code === 'RETRY_UNCONFIRMED');
});
test('artifact byte limits count UTF-8 bytes and stale accepted delivery cannot dispatch changed content', async t => {
 let sends = 0; const x = fixture(t, { async send(d) { sends++; return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d); } });
 const a = x.artifact(), d = x.delivery(a), command = x.approve(d);
 x.pipeline().writeArtifact(x.owner, { ...x.bind('change-after-accept'), artifactRef: a.artifactRef, version: 2, content: 'changed after acceptance' });
 await assert.rejects(x.pipeline().dispatch(x.owner, { ...command, ...x.bind('stale-dispatch') }), e => e.code === 'ARTIFACT_STALE'); assert.equal(sends, 0); assert.equal(x.pipeline().delivery(x.owner, x.taskRef, d.deliveryRef).claimRef, null);
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('oversize-utf8'), artifactRef: ref('oversize'), version: 1, content: '中'.repeat(21846) }), e => e.code === 'INPUT_TOO_LARGE');
 assert.equal(x.pipeline().writeArtifact(x.owner, { ...x.bind('exact-utf8'), artifactRef: ref('exact'), version: 1, content: '中'.repeat(21845) + 'a' }).version, 1);
});

test('rejected composite artifact/progress leaves authoritative task/data/records/receipts unchanged', t => {
 const x = fixture(t, { async send(d) { return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d); } });
 const before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('bad-initial-version'), artifactRef: ref('never-artifact'), version: 2, content: 'bounded rejected bytes' }), e => e.code === 'STALE_ARTIFACT');
 assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('bad-producer'), artifactRef: ref('never-artifact'), version: 1, content: 'bounded rejected bytes', producerClaimRef: ref('unknown-claim'), generationRef: ref('unknown-generation') }), e => e.code === 'STALE_CLAIM');
 assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
 const progressInput = { ...x.bind('progress-atomic'), progressRef: ref('progress-atomic'), kind: 'milestone', content: 'safe first progress' };
 x.store.writeProgress(x.owner, progressInput); const committed = x.store.snapshot(x.owner, { taskRef: x.taskRef });
 assert.throws(() => x.store.writeProgress(x.owner, { ...x.bind('conflicting-progress'), progressRef: progressInput.progressRef, kind: 'milestone', content: 'different bytes under same progress' }), e => e.code === 'IDEMPOTENCY_CONFLICT');
 assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), committed);
 const valid = { ...x.bind('bad-initial-version'), artifactRef: ref('never-artifact'), version: 1, content: 'bounded rejected bytes' }; const result = x.pipeline().writeArtifact(x.owner, valid);
 assert.deepEqual(x.pipeline().writeArtifact(x.owner, valid), result);
});

test('association record capacity failure rolls back newly encrypted artifact bytes and task revision', t => {
 const adapter = { async send(d) { return opened(d); }, async query(d) { return opened(d); }, async open(d) { return opened(d); } }, x = fixture(t, adapter, undefined, { limits: { maxRecordsPerTask: 2 } });
 x.artifact(); const before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
 assert.throws(() => x.pipeline().writeArtifact(x.owner, { ...x.bind('capacity-failure'), artifactRef: ref('extra-artifact'), version: 1, content: 'uncommitted encrypted artifact' }), e => e.code === 'RECORD_LIMIT');
 assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
 x.reopen(); assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
});
