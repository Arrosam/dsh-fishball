import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstalledResults, createInstalledResults } from '../src/installed-results.mjs';
import { hash, canonical, canonicalDigest } from '../src/runtime-security.mjs';

// Typed trusted closure doubles only: no SQL, host class, RPC, rendering,
// genuine schema migration or independent native review proof is exercised.
const H = hash, T = H('synthetic-task'), A = H('synthetic-artifact'), D = H('synthetic-delivery');
const identity = { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' };
const profile = { dir: '/synthetic/profile', name: 'synthetic' };
const policySpec = () => ({ enabled: true, timeZone: 'Etc/UTC', quietWindows: [], emergencyKinds: ['obstacle'], mergeKinds: ['milestone'], mergeWindowMs: 0, minIntervalMs: 0, frequency: { windowMs: 60000, maxClaims: 4 } });
const selection = (notifications = false) => ({ enabled: true, route: 'local_dsh', admission: { units: 1, runtimeMs: 1000, usageUnits: 65536 }, notifications: notifications ? { enabled: true, policy: policySpec() } : { enabled: false } });
const config = value => ({ selection: value, identity, profile });
const command = (f, name, extra = {}) => ({ taskRef: T, commandRef: H(name), expectedTaskVersion: f.state.task.version, expectedAuthEpoch: f.state.task.authEpoch, ...extra });
function fixture(options = {}) {
  const calls = [], peer = {}, ctx = { connection: { operator: peer }, profileContext: { ...profile } };
  const N = canonicalDigest(['df.installed-results/v1', identity.ownerId, identity.workspaceId, profile.dir, profile.name]);
  const route = { recipientRef: canonicalDigest([N, 'df.native-owner/v1']), channelRef: canonicalDigest([N, 'df.local-results/v1']), policyRef: canonicalDigest([N, 'notification-policy']), mergeKeyRef: canonicalDigest([N, 'progress-group']) };
  const artifacts = new Map(), data = new Map(), deliveries = new Map(), progress = new Map(); let listener, alive = true, service, subscribeCalls = 0;
  const state = { observedAt: Date.now(), task: { taskRef: T, ownerRef: H(identity.ownerId), workspaceRef: H(identity.workspaceId), version: 1, authEpoch: 0, status: 'running' }, control: 'active', actions: [], progress: [], artifacts: [], notifications: [], notificationFacts: [],
    policy: { version: 1, limits: { maxActive: 2, maxRuntimeMs: 100000, maxUsageUnits: 1000000, maxAttempts: 3, maxTotalAttempts: 12 }, modelPolicy: { version: 1, catalogEvidenceRef: H('catalog'), presetRefs: [H('preset')] } } };
  const facts = { resourcePolicyVersion: 1, modelPolicyVersion: 1, model: { presetRef: H('preset'), modelRef: H('model'), reasoningRef: H('reasoning'), catalogEvidenceRef: H('catalog') },
    executor: { environmentRef: H('local-env'), bindingDigest: H('local-no-sink'), toolsDigest: canonicalDigest([]), permissionPolicyDigest: H('local-permission') },
    labels: { providerLabel: 'Local publication (no inference)', modelLabel: 'Existing accepted model', reasoningLabel: 'Existing accepted reasoning', presetLabel: 'Existing accepted preset', environmentLabel: 'Native local owner list', cwd: '/synthetic/profile', toolNames: [], evidenceRef: H('local-source') } };
  let policy = { policyRef: route.policyRef, revision: 1, spec: policySpec(), windows: [] };
  const copy = structuredClone;
  const read = (name, input, execute) => { calls.push([name, copy(input)]); options.onRead?.(name); return copy(execute()); };
  function artifact(content = 'Synthetic exact result. 文', artifactRef = A, version = 1) {
    const recordRef = canonicalDigest({ artifactRef, version }), digest = H(content), a = { artifactRef, version, recordRef, digest, producerRef: H('producer'), producerClaimRef: null, generationRef: null, verification: { verdict: 'accepted', evidenceRef: H('verification') } };
    const reviewerRef = H('artifact-independent-reviewer'), generationRef = H('artifact-review-generation');
    a.verification.reviewerRef = reviewerRef; a.verification.generationRef = generationRef;
    a.verificationBinding = { source: 'native', auditRef: H('artifact-audit'), auditRevision: 1, round: 0, reportRef: H('artifact-report'), bindingDigest: canonicalDigest({ artifactRef, version, digest }), materialDigest: canonicalDigest([{ recordRef, digest }]), resultRef: H('artifact-native-result'), recordRef: H('artifact-native-result-record'), digest: H('artifact-native-result-bytes'), claimRef: H('artifact-review-claim'), generationRef, sessionRef: H('artifact-review-session'), executionRef: H('artifact-review-execution'), inputDigest: canonicalDigest({ artifactRef, version, digest }), reviewerRef, verdict: 'accepted', evidenceRef: a.verification.evidenceRef };
    artifacts.set(artifactRef, a); data.set(recordRef, { recordRef, kind: 'artifact', digest, byteLength: Buffer.byteLength(content), content }); state.artifacts = [...artifacts.values()]; return a;
  }
  function delivery(a = artifacts.get(A), deliveryRef = D) {
    const intent = { taskRef: T, commandRef: H('accept'), expectedTaskVersion: state.task.version, expectedAuthEpoch: state.task.authEpoch, deliveryRef, artifactRef: a.artifactRef, artifactVersion: a.version, digest: a.digest, recipientRef: route.recipientRef, channelRef: route.channelRef };
    const d = { deliveryRef, artifactRef: a.artifactRef, artifactVersion: a.version, digest: a.digest, recipientRef: route.recipientRef, channelRef: route.channelRef, targetDigest: canonicalDigest({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, ...intent }), intent, previousDeliveryRef: null, state: 'accepted', claimRef: null, reservationRef: null, generationRef: null, observations: [] };
    deliveries.set(deliveryRef, d); return d;
  }
  artifact(); delivery();
  const api = { ctx, isAlive: () => alive,
    snapshotOwner: input => read('snapshot', input, () => ({ ...state, deliveries: [...deliveries.values()] })),
    readLocalActionFacts: input => read('facts', input, () => facts),
    subscribeRuntimeReceipts: fn => { subscribeCalls++; listener = fn; return () => { calls.push(['unsubscribe']); listener = undefined; }; },
    planOwnerAction: input => { calls.push(['plan', copy(input)]); const actionDigest = canonicalDigest({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, taskRef: input.taskRef, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, spec: input.spec }); state.actions.push({ actionRef: input.spec.actionRef, actionDigest, spec: copy(input.spec), state: 'requested', claimRef: null }); return { actionRef: input.spec.actionRef, actionDigest, taskVersion: state.task.version, authEpoch: state.task.authEpoch }; },
    artifact: input => read('artifact', input, () => artifacts.get(input.artifactRef)),
    readArtifact: input => read('readArtifact', input, () => { const a = artifacts.get(input.artifactRef); return { artifact: a, data: data.get(a.recordRef) }; }),
    writeArtifact: input => { calls.push(['writeArtifact', copy(input)]); return artifact(input.content, input.artifactRef, input.version); },
    acceptDelivery: input => { calls.push(['accept', copy(input)]); const a = artifacts.get(input.artifactRef), d = delivery(a, input.deliveryRef); d.notification = copy(input.notification); d.intent = copy(input); d.targetDigest = canonicalDigest({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, ...input }); return copy(d); },
    getDelivery: input => read('delivery', input, () => deliveries.get(input.deliveryRef)),
    listLocalDeliveries: input => read('publications', input, () => [...deliveries.values()].filter(d => d.observations.some(o => o.state === 'sent' || o.state === 'delivered'))),
    publishLocalDelivery: async input => {
      calls.push(['publish', copy(input)]); options.onPublish?.(input); if (options.waitPublication) await options.waitPublication();
      const d = deliveries.get(input.deliveryRef), action = state.actions.find(a => a.claimRef === d.claimRef);
      assert.equal(service.localAdmission({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, taskRef: T, actionRef: action.actionRef, actionDigest: action.actionDigest, taskVersion: state.task.version, authEpoch: state.task.authEpoch, spec: action.spec }), true);
      assert.equal(d.state, 'outbox_committed'); assert.equal(input.claimRef, d.claimRef); assert.equal(input.generationRef, d.generationRef); assert.equal(input.actionDigest, action.actionDigest);
      d.state = 'sent'; d.currentAccess = { permissionState: 'allowed', openability: 'unknown' }; d.observations.push({ state: 'sent', permissionState: 'allowed', openability: 'unknown', observedAt: input.observedAt, evidenceRef: input.evidenceRef });
      if (options.lostAck) throw Object.assign(new Error('synthetic lost ack'), { code: 'ACK_UNKNOWN' }); return copy(d);
    },
    recordLocalDeliveryAccess: input => { calls.push(['access', copy(input)]); const d = deliveries.get(input.deliveryRef); d.currentAccess = { permissionState: input.permissionState, openability: 'unknown', observedAt: input.observedAt, evidenceRef: input.evidenceRef }; return copy(d); },
    configureLocalNotificationPolicy: input => { calls.push(['configure', copy(input)]); policy = { policyRef: input.policyRef, revision: input.expectedRevision + 1, spec: copy(input.spec), windows: [] }; return copy(policy); },
    getNotificationPolicy: input => read('policy', input, () => policy),
    writeLocalProgress: input => { calls.push(['writeProgress', copy(input)]); return { progressRef: input.progressRef, task: copy(state.task) }; },
    readLocalProgress: input => read('progress', input, () => progress.get(input.progressRef)),
  };
  function install(value = options.selection ?? selection(options.notifications)) { service = createInstalledResults(config(value)).installedResultsInstaller(api); return service; }
  install();
  const f = { api, service, state, calls, ctx, route, artifacts, data, deliveries, progress, facts, artifact, delivery, install,
    subscriptions() { return subscribeCalls; }, setAlive(value) { alive = value; }, emit(operation, input, receipt) { listener?.({ operation, input, receipt }); }, policy() { return policy; } };
  f.plan = () => { const r = service.planLocalDelivery(command(f, 'plan', { deliveryRef: D })); return r; };
  f.grant = () => { const a = state.actions.at(-1); state.task.authEpoch++; const r = { actionRef: a.actionRef, actionDigest: a.actionDigest, task: copy(state.task), taskVersion: state.task.version, authEpoch: state.task.authEpoch, expiresAt: 8640000000000000 }; f.emit('grant', { taskRef: T, actionRef: a.actionRef }, r); return a; };
  f.claim = () => { const a = state.actions.at(-1), d = deliveries.get(D); a.claimRef = H('claim'); a.state = 'dispatch_intent'; d.state = 'outbox_committed'; d.claimRef = a.claimRef; d.reservationRef = H('reservation'); d.generationRef = a.spec.executor.generationRef; state.task.version++; return copy(d); };
  f.projection = (name, changes = {}) => {
    const progressRef = H(name), r = { originalGoalRef: H('goal'), completedScopeRef: H('scope'), unfinishedRef: H('unfinished'), nextStepRef: H('next'), verificationState: 'not_run', verificationEvidence: [], blockerRefs: [], progressDigest: H('same-facts') };
    const recordRef = H(`record-${name}`), digest = H(canonical(r)), p = { progressRef, recordRef, digest, kind: 'milestone', at: state.observedAt, localReportRef: canonicalDigest({ taskRef: T, progressRef }) }, a = artifacts.get(A);
    const localReport = { contractVersion: 'df.local-progress/v1', ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, taskRef: T, progressRef, recordRef, digest, kind: p.kind,
      originalGoal: { recordRef: r.originalGoalRef, digest: H('goal-content') }, statements: { completedScope: { recordRef: r.completedScopeRef, digest: H('scope-content') }, unfinished: { recordRef: r.unfinishedRef, digest: H('unfinished-content') }, nextStep: { recordRef: r.nextStepRef, digest: H('next-content') }, blockers: [] },
      artifact: { artifactRef: A, version: a.version, recordRef: a.recordRef, digest: a.digest, producerRef: a.producerRef, producerClaimRef: null, generationRef: null }, semanticRevision: 1, observedSourceCAS: { taskVersion: 1, authEpoch: 0 }, createdAt: state.observedAt, verificationState: r.verificationState, progressDigest: r.progressDigest, verificationBinding: null, sourceStates: [] };
    const v = { progress: p, report: r, localReport, currentness: 'current', ...changes }; progress.set(progressRef, v); state.progress.push(v.progress); return v;
  };
  return f;
}
const code = value => error => error.code === value;

test('disabled defaults and explicit detached admission selections', () => {
  assert.deepEqual(validateInstalledResults(), { enabled: false }); assert.deepEqual(validateInstalledResults({ enabled: false }), { enabled: false });
  const value = selection(), validated = validateInstalledResults(value); value.admission.units = 2; assert.equal(validated.admission.units, 1); assert.ok(Object.isFrozen(validated.admission));
  assert.equal(validateInstalledResults({ enabled: true, route: 'local_dsh', admission: selection().admission }).notifications.enabled, false);
});
test('closed config rejects callbacks, proof fields, bounds, holes and descriptor traps', () => {
  let traps = 0; const accessor = Object.defineProperty({}, 'enabled', { enumerable: true, get() { traps++; throw new Error('CANARY'); } });
  const proxy = new Proxy({}, { ownKeys() { traps++; throw new Error('CANARY'); } });
  for (const value of [accessor, proxy, { ...selection(), delivered: true }, { ...selection(), route: 'external' }, { ...selection(), admission: { units: 0, runtimeMs: 1, usageUnits: 1 } }, { ...selection(), admission: { units: 1, runtimeMs: 60001, usageUnits: 1 } }, { ...selection(), notifications: { enabled: true, policy: { ...policySpec(), timeZone: 'Invalid/Timezone' } } }]) assert.throws(() => validateInstalledResults(value), code('CONFIG_INVALID'));
  assert.equal(traps, 0);
});
test('composer/installation performs no ledger reads, writes, plans, grants or sends', () => {
  const f = fixture(); assert.deepEqual(f.calls, []); assert.equal(f.service.notifications, null); assert.equal(f.service.progressPolicy, null);
  assert.throws(() => f.service.pendingLocalNotifications({ taskRef: T }), code('NOTIFICATIONS_DISABLED')); assert.equal(f.calls.length, 0);
});
test('all public operations reject getters/proxies before any callback', () => {
  const f = fixture({ notifications: true }); let traps = 0;
  const getter = Object.defineProperty({}, 'taskRef', { enumerable: true, get() { traps++; throw new Error('RAW_CANARY'); } }), proxy = new Proxy({}, { get() { traps++; throw new Error('RAW_CANARY'); } });
  for (const op of ['planLocalDelivery', 'writeLocalReport', 'configureLocalNotifications', 'pendingLocalNotifications', 'prepareLocalNotification', 'acceptLocalNotification', 'localResultsStatus', 'readLocalResult', 'localDeliveryAccess']) for (const value of [getter, proxy]) assert.throws(() => f.service[op](value), code('INVALID_INPUT'));
  assert.equal(traps, 0); assert.equal(f.calls.length, 0);
});
test('scope, captured peer/profile and disposal are current fences', () => {
  const f = fixture(), a = f.artifacts.get(A); assert.equal(f.service.readLocalResult({ taskRef: T, artifactRef: A, version: 1, digest: a.digest }).data.content, 'Synthetic exact result. 文');
  f.ctx.connection.operator = {}; assert.throws(() => f.service.localResultsStatus({ taskRef: T }), code('SERVICE_DISPOSED')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 0);
  const g = fixture(); g.ctx.profileContext.name = 'replacement'; assert.throws(() => g.service.localResultsStatus({ taskRef: T }), code('SERVICE_DISPOSED'));
  const h = fixture(); h.service.dispose(); h.service.dispose(); assert.equal(h.calls.filter(c => c[0] === 'unsubscribe').length, 1); assert.throws(() => h.service.localResultsStatus({ taskRef: T }), code('SERVICE_DISPOSED'));
});
test('artifact hash/version/record integrity are checked; read never verifies or publishes', () => {
  const f = fixture(), a = f.artifacts.get(A); assert.throws(() => f.service.readLocalResult({ taskRef: T, artifactRef: A, version: 2, digest: a.digest }), code('ARTIFACT_BINDING_INVALID'));
  f.data.get(a.recordRef).content += 'tampered'; assert.throws(() => f.service.readLocalResult({ taskRef: T, artifactRef: A, version: 1, digest: a.digest }), code('ARTIFACT_BINDING_INVALID'));
  assert.ok(!f.calls.some(c => ['publish', 'writeArtifact', 'plan'].includes(c[0])));
});
test('planning derives complete exact spec, explicit bytes/resource bounds and no tool/inference', () => {
  const f = fixture(), r = f.plan(), input = f.calls.find(c => c[0] === 'plan')[1]; assert.equal(r.actionRef, input.spec.actionRef);
  assert.equal(input.spec.kind, 'write'); assert.equal(input.spec.role, 'worker'); assert.equal(input.spec.executor.mode, 'none'); assert.equal(input.spec.executor.toolsDigest, canonicalDigest([])); assert.ok(!Object.hasOwn(input.spec.executor, 'sessionRef'));
  assert.equal(input.spec.charges.usageUnits, 65536); assert.equal(input.spec.charges.costEstimateMicros, 0); assert.equal(input.spec.dataDigest, f.artifacts.get(A).digest); assert.equal(input.spec.targetDigest, f.deliveries.get(D).targetDigest);
  const preview = f.service.resolveLocalDelivery(input.spec, f.state.task); assert.equal(preview.targetDigest, input.spec.targetDigest); assert.deepEqual(preview.toolNames, []); assert.match(preview.targetLabel, /opening remains unknown/);
});
test('missing/shared insufficient policy and UTF8 envelope budget refuse without plan', () => {
  const f = fixture(); f.state.policy = null; assert.throws(f.plan, code('MODEL_POLICY_UNAVAILABLE')); assert.ok(!f.calls.some(c => c[0] === 'plan'));
  const d = f.deliveries.get(D), content = f.data.get(f.artifacts.get(A).recordRef).content;
  const bytes = Buffer.byteLength(canonical({ taskRef: T, deliveryRef: D, artifactRef: A, artifactVersion: 1, digest: d.digest, recipientRef: d.recipientRef, channelRef: d.channelRef, content }), 'utf8');
  const g = fixture({ selection: { ...selection(), admission: { units: 1, runtimeMs: 1, usageUnits: bytes - 1 } } }); assert.throws(g.plan, code('BUDGET_LIMIT'));
  const exact = fixture({ selection: { ...selection(), admission: { units: 1, runtimeMs: 1, usageUnits: bytes } } }); assert.equal(exact.plan().actionRef, exact.state.actions[0].actionRef);
  const h = fixture(); h.facts.executor.toolsDigest = H('worker-tools'); assert.throws(h.plan, code('LOCAL_EXECUTOR_UNAVAILABLE'));
});
test('original accepted route/CAS/version binding refuses changed recipient and passed guesses', () => {
  const f = fixture(); assert.throws(() => f.service.planLocalDelivery({ ...command(f, 'x', { deliveryRef: D }), expectedTaskVersion: 7 }), code('STALE_VERSION'));
  f.deliveries.get(D).recipientRef = H('other-owner'); assert.throws(f.plan, code('LOCAL_DELIVERY_MISMATCH'));
  const g = fixture(); g.artifacts.get(A).verification.verdict = 'unknown'; assert.throws(g.plan, code('PROVENANCE_UNAVAILABLE'));
});
test('claim admission needs private original grant receipt; unknown/worker action denied', () => {
  const f = fixture(); f.plan(); const a = f.state.actions[0], record = { ownerRef: f.state.task.ownerRef, workspaceRef: f.state.task.workspaceRef, taskRef: T, actionRef: a.actionRef, actionDigest: a.actionDigest, taskVersion: 1, authEpoch: 0, spec: a.spec };
  assert.equal(f.service.localAdmission(record), false); f.grant(); record.authEpoch = 1; assert.equal(f.service.localAdmission(record), true);
  assert.equal(f.service.localAdmission({ ...record, actionDigest: H('different') }), false); assert.equal(f.service.localAdmission({ ...record, spec: { ...a.spec, executor: { ...a.spec.executor, mode: 'create' } } }), false);
  f.emit('revoke', { taskRef: T }, {}); assert.equal(f.service.localAdmission(record), false);
});
test('atomic publication returns sent only after durable source association', async () => {
  const f = fixture(); f.plan(); f.grant(); const d = f.claim(), data = f.data.get(f.artifacts.get(A).recordRef);
  const r = await f.service.recipientAdapter.send(d, data); assert.equal(r.state, 'sent'); assert.equal(r.openability, 'unknown'); assert.equal(r.permissionState, 'granted'); assert.equal(f.deliveries.get(D).state, 'sent');
  const calls = f.calls.filter(c => c[0] === 'publish'); assert.equal(calls.length, 1); assert.ok(!Object.hasOwn(calls[0][1], 'permissionState'));
  const q = await f.service.localDeliveryQuery({ taskRef: T, deliveryRef: D }); assert.equal(q.state, 'sent'); assert.equal(q.openability, 'unknown');
  await assert.rejects(f.service.recipientAdapter.send(f.deliveries.get(D), data), code('OUTBOX_NOT_CLAIMED')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 1);
});
test('lost acknowledgement remains query-only and cannot blindly resend', async () => {
  const f = fixture({ lostAck: true }); f.plan(); f.grant(); const d = f.claim(); await assert.rejects(f.service.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef)), code('ACK_UNKNOWN'));
  assert.equal(f.deliveries.get(D).state, 'sent'); const q = await f.service.localDeliveryQuery({ taskRef: T, deliveryRef: D }); assert.equal(q.state, 'sent');
  await assert.rejects(f.service.recipientAdapter.send(f.deliveries.get(D), f.data.get(f.artifacts.get(A).recordRef)), code('OUTBOX_NOT_CLAIMED')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 1);
});
test('cancel/revoke/profile drift before publish denies, late async completion cannot represent new peer', async () => {
  const f = fixture(); f.plan(); f.grant(); const d = f.claim(); f.emit('control', { taskRef: T }, {}); await assert.rejects(f.service.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef)), code('LOCAL_ADMISSION_DENIED')); assert.ok(!f.calls.some(c => c[0] === 'publish'));
  let release; const wait = new Promise(resolve => { release = resolve; }), g = fixture({ waitPublication: () => wait }); g.plan(); g.grant(); const old = g.claim(); const sending = g.service.recipientAdapter.send(old, g.data.get(g.artifacts.get(A).recordRef)); g.ctx.connection.operator = {}; release(); await assert.rejects(sending); assert.equal(g.deliveries.get(D).state, 'outbox_committed');
});
test('access updates current access separately, never creates publication or opening', async () => {
  const f = fixture(); assert.throws(() => f.service.localDeliveryAccess({ taskRef: T, deliveryRef: D }), code('PUBLICATION_NOT_CONFIRMED')); f.plan(); f.grant(); const d = f.claim(); await f.service.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef));
  const r = f.service.localDeliveryAccess({ taskRef: T, deliveryRef: D }); assert.equal(r.state, 'sent'); assert.equal(r.currentAccess.openability, 'unknown'); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 1);
  const input = f.calls.find(c => c[0] === 'access')[1]; assert.equal(input.permissionState, 'allowed'); assert.ok(!Object.hasOwn(input, 'openability'));
});
test('writeLocalReport selects only statement refs, cannot supply trusted verification/time/original goal', () => {
  const f = fixture(); const input = command(f, 'report', { progressRef: H('p'), kind: 'final', artifactRef: A, artifactVersion: 1, digest: f.artifacts.get(A).digest, completedScopeRef: H('scope'), unfinishedRef: H('unfinished'), nextStepRef: H('next'), blockerRefs: [] });
  for (const extra of [{ verificationState: 'passed' }, { originalGoalRef: H('guess') }, { observedAt: 1 }, { emergency: true }]) assert.throws(() => f.service.writeLocalReport({ ...input, ...extra }), code('INVALID_INPUT'));
  f.service.writeLocalReport(input); assert.deepEqual(f.calls.find(c => c[0] === 'writeProgress')[1], input); assert.ok(!f.calls.some(c => ['publish', 'plan'].includes(c[0])));
});
test('raw progress labels and stale normal associations are suppressed; factual dedup ignores new refs', () => {
  const f = fixture({ notifications: true }); f.projection('one'); f.projection('two'); const raw = { progressRef: H('raw'), recordRef: H('raw-record'), digest: H('raw-body'), kind: 'obstacle', at: f.state.observedAt };
  f.state.progress.push(raw); f.progress.set(raw.progressRef, { progress: raw, report: null, localReport: null, currentness: 'unverified' }); f.projection('old', { currentness: 'stale' });
  const r = f.service.pendingLocalNotifications({ taskRef: T }); assert.equal(r.candidates.length, 1); assert.deepEqual(r.suppressed.map(p => p.reason).sort(), ['duplicate_fact', 'stale', 'unverified']); assert.equal(r.notificationDelivered, false);
});
test('stripped report/pointer, malformed passed source and source overflow fail rather than downgrade', () => {
  for (const mutate of [v => { v.progress.localReportRef = H('forged'); }, v => { v.localReport = null; }, v => { v.report.verificationState = 'passed'; v.localReport.verificationState = 'passed'; }, v => { v.localReport.sourceStates = new Array(17).fill({ auditRef: H('a') }); }]) {
    const f = fixture({ notifications: true }), v = f.projection('one'); mutate(v); assert.throws(() => f.service.pendingLocalNotifications({ taskRef: T })); assert.ok(!f.calls.some(c => c[0] === 'publish'));
  }
});
test('procedural task CAS does not stale actual current normal report', () => {
  const f = fixture({ notifications: true }); f.projection('one'); f.state.task.version = 9; f.state.task.authEpoch = 3;
  const r = f.service.pendingLocalNotifications({ taskRef: T }); assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].state, 'eligible');
});
test('quiet half-open/emergency/merge/frequency hints use configured actual kinds and trusted time', () => {
  const f = fixture({ notifications: true }); f.state.observedAt = Date.UTC(2026, 9, 4, 10); const v = f.projection('one'); f.policy().spec.quietWindows = [{ startMinute: 600, endMinute: 601 }];
  assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'quiet'); f.state.observedAt += 60000; assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'eligible');
  f.policy().spec.mergeWindowMs = 120000; assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'coalesced');
  v.progress.kind = v.localReport.kind = 'obstacle'; assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'eligible');
  f.policy().spec.frequency.maxClaims = 0; assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'frequency');
});
test('held unknown group survives changed policy; only known failed released item reports retry', () => {
  const f = fixture({ notifications: true }); const v = f.projection('one'); f.state.notifications.push({ ...f.route, state: 'unknown', released: false, deliveryRef: H('old-unknown') }); f.policy().revision++;
  assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'held'); f.state.notificationFacts.push({ ...f.route, digest: v.report.progressDigest, state: 'failed', released: true, deliveryRef: H('failed') });
  const r = f.service.pendingLocalNotifications({ taskRef: T }); assert.equal(r.retryRequired.length, 1); assert.equal(r.heldDeliveryRef, H('old-unknown')); assert.ok(!f.calls.some(c => c[0] === 'publish'));
});
test('normal preparation canonicalizes sorted complete provenance; raw and changed manifest cannot accept', () => {
  const f = fixture({ notifications: true }); const v = f.projection('one'); const a = f.service.prepareLocalNotification(command(f, 'prepare', { artifactRef: H('manifest'), version: 1, progressRefs: [v.progress.progressRef] }));
  const content = f.data.get(a.recordRef).content, parsed = JSON.parse(content); assert.equal(parsed.version, 'df.local-notification/v1'); assert.deepEqual(parsed.progress[0].localReport, v.localReport); assert.deepEqual(parsed.progress[0].report, v.report);
  const accept = command(f, 'accept-manifest', { deliveryRef: H('notice'), artifactRef: a.artifactRef, artifactVersion: 1, digest: a.digest, policyRevision: 1, progressRefs: [v.progress.progressRef] }); f.service.acceptLocalNotification(accept); assert.equal(f.calls.filter(c => c[0] === 'accept').length, 1);
  const changed = f.artifact(content.replace('not_run', 'passed'), a.artifactRef, 1); assert.throws(() => f.service.acceptLocalNotification({ ...accept, commandRef: H('different'), digest: changed.digest }), code('NOTIFICATION_ARTIFACT_MISMATCH')); assert.ok(!f.calls.some(c => c[0] === 'publish'));
});
test('configured normal policy writes only derived policy ref and explicit spec; no drain', () => {
  const f = fixture({ notifications: true }), spec = policySpec(); const r = f.service.configureLocalNotifications({ commandRef: H('config'), expectedRevision: 1, spec }); assert.equal(r.revision, 2);
  const write = f.calls.find(c => c[0] === 'configure')[1]; assert.equal(write.policyRef, f.route.policyRef); assert.deepEqual(write.spec, spec); assert.ok(!f.calls.some(c => ['plan', 'publish', 'writeArtifact'].includes(c[0])));
});

function nativeProjection(f) {
  const v = f.projection('native'), a = v.localReport, auditRef = H('audit'), reviewerRef = H('independent-reviewer'), claimRef = H('review-claim'), generationRef = H('review-generation'), resultRef = H('native-review-result'), reportRef = H('native-report');
  const material = [{ recordRef: a.artifact.recordRef, digest: a.artifact.digest }], materialDigest = canonicalDigest(material), bindingDigest = H('complete-native-audit-binding');
  const source = { auditRef, auditRevision: 1, round: 0, bindingDigest, materialDigest, semanticRevision: 1, material, policyRef: H('audit-policy'), blockingSeverities: ['blocking'], maxRepairRounds: 1, state: 'passed', currentness: 'current',
    report: { reportRef, verdict: 'passed', reviewerRef, claimRef, generationRef, resultRef, coverageRefs: material.map(m => m.recordRef), unexaminedRefs: [], findings: [], evidenceRef: H('native-review-evidence') }, repair: null };
  a.verificationBinding = { source: 'native', auditRef, auditRevision: 1, round: 0, reportRef, bindingDigest, materialDigest, resultRef, recordRef: H('native-review-bytes'), digest: H('native-review-content'), claimRef, generationRef, sessionRef: H('review-session'), executionRef: H('review-execution'), inputDigest: H('exact-review-input'), reviewerRef, verdict: 'accepted', evidenceRef: H('native-review-evidence') };
  v.report.verificationState = a.verificationState = 'passed'; v.report.verificationEvidence = [{ evidenceRef: source.report.evidenceRef, digest: a.verificationBinding.digest, observedAt: f.state.observedAt }]; a.sourceStates = [source]; return v;
}
test('complete typed native chain can display passed; self-review/mismatched material/coverage refuse', () => {
  const f = fixture({ notifications: true }); nativeProjection(f); assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates.length, 1);
  for (const mutate of [v => { v.localReport.verificationBinding.reviewerRef = v.localReport.artifact.producerRef; }, v => { v.localReport.sourceStates[0].report.resultRef = H('different-result'); }, v => { v.localReport.sourceStates[0].report.coverageRefs = []; }, v => { v.localReport.sourceStates[0].materialDigest = H('different-material'); }, v => { v.localReport.sourceStates = []; }, v => { v.localReport.sourceStates[0].report.findings = [{ findingRef: H('fatal'), severity: 'fatal', code: 'review_failure', evidenceRef: H('fatal-evidence'), resolved: true }]; }]) {
    const g = fixture({ notifications: true }), v = nativeProjection(g); mutate(v); assert.throws(() => g.service.pendingLocalNotifications({ taskRef: T })); assert.ok(!g.calls.some(c => c[0] === 'publish'));
  }
});
test('all eight normal states remain explicit while advanced/unavailable verification cannot become passed', () => {
  for (const state of ['passed', 'failed', 'not_run', 'stale', 'unknown', 'unexamined', 'budget_limited', 'blocked']) {
    const f = fixture({ notifications: true }), v = state === 'passed' ? nativeProjection(f) : f.projection(state);
    v.report.verificationState = v.localReport.verificationState = state;
    if (state === 'unknown') v.localReport.verificationBinding = { source: 'unavailable', verdict: 'accepted', reason: 'PROVENANCE_UNAVAILABLE', evidenceRef: H('guessed-advanced') };
    const a = f.service.prepareLocalNotification(command(f, state, { artifactRef: H(`manifest-${state}`), version: 1, progressRefs: [v.progress.progressRef] }));
    const parsed = JSON.parse(f.data.get(a.recordRef).content); assert.equal(parsed.progress[0].report.verificationState, state); assert.deepEqual(parsed.progress[0].localReport.sourceStates, v.localReport.sourceStates);
  }
});
test('artifact declared byte length is enforced against exact UTF8 bytes', () => {
  const f = fixture(), a = f.artifacts.get(A); f.data.get(a.recordRef).byteLength--;
  assert.throws(() => f.service.readLocalResult({ taskRef: T, artifactRef: A, version: 1, digest: a.digest }), code('ARTIFACT_BINDING_INVALID'));
});
test('historical actual delivery remains delivered after actual current read permission denial', async () => {
  const f = fixture(); f.plan(); f.grant(); const d = f.claim(); await f.service.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef));
  const current = f.deliveries.get(D); current.state = 'delivered'; current.observations.push({ state: 'delivered', permissionState: 'allowed', openability: 'openable', evidenceRef: H('future-trusted-recipient-proof'), observedAt: ++f.state.observedAt });
  const q = await f.service.localDeliveryQuery({ taskRef: T, deliveryRef: D }); assert.equal(q.state, 'delivered'); assert.equal(q.openability, 'verified');
  f.api.readArtifact = () => { throw Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED' }); };
  // Private closures are captured at installation. A new instance represents
  // a new lifetime using retained data, with no restoration of old permits.
  f.service.dispose(); const replacement = f.install(); f.state.observedAt++;
  const r = replacement.localDeliveryAccess({ taskRef: T, deliveryRef: D }); assert.equal(r.state, 'delivered'); assert.equal(r.currentAccess.permissionState, 'denied'); assert.equal(r.currentAccess.openability, 'unknown');
  assert.equal(r.observations.at(-1).evidenceRef, H('future-trusted-recipient-proof')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 1);
});
test('restart-like replacement reconstructs pending facts/unknown hold without restoring private grants', () => {
  const f = fixture({ notifications: true }); f.projection('one'); f.plan(); f.grant(); const a = f.state.actions[0]; f.state.notifications.push({ ...f.route, state: 'unknown', released: false, deliveryRef: H('held-before-reload') });
  f.service.dispose(); const replacement = f.install(); const pending = replacement.pendingLocalNotifications({ taskRef: T }); assert.equal(pending.candidates[0].state, 'held'); assert.equal(pending.heldDeliveryRef, H('held-before-reload'));
  assert.equal(replacement.localAdmission({ ownerRef: f.state.task.ownerRef, workspaceRef: f.state.task.workspaceRef, taskRef: T, actionRef: a.actionRef, actionDigest: a.actionDigest, taskVersion: f.state.task.version, authEpoch: f.state.task.authEpoch, spec: a.spec }), false); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 0);
});
test('policy changes invalidate a prior private permit; no store recursion from localAdmission', () => {
  const f = fixture(); f.plan(); f.grant(); const a = f.state.actions[0], input = { ownerRef: f.state.task.ownerRef, workspaceRef: f.state.task.workspaceRef, taskRef: T, actionRef: a.actionRef, actionDigest: a.actionDigest, taskVersion: f.state.task.version, authEpoch: f.state.task.authEpoch, spec: a.spec };
  const before = f.calls.length; assert.equal(f.service.localAdmission(input), true); assert.equal(f.calls.length, before);
  f.emit('policy', {}, {}); assert.equal(f.service.localAdmission(input), false); assert.equal(f.calls.length, before);
});
test('quiet end display hint is an exact boundary and emergency cannot bypass frequency', () => {
  const f = fixture({ notifications: true }); const at = Date.UTC(2026, 9, 4, 10, 0, 17); f.policy().spec.quietWindows = [{ startMinute: 600, endMinute: 601 }];
  assert.equal(f.service.progressPolicy({ kind: 'milestone', observedAt: at }).quietUntil, Date.UTC(2026, 9, 4, 10, 1));
  f.policy().spec.frequency.maxClaims = 0; f.state.observedAt = at; const v = f.projection('obstacle'); v.progress.kind = v.localReport.kind = 'obstacle';
  assert.equal(f.service.pendingLocalNotifications({ taskRef: T }).candidates[0].state, 'frequency');
});
test('later unknown acknowledgement preserves signed source publication for read-only reconciliation', async () => {
  const f = fixture({ lostAck: true }); f.plan(); f.grant(); const d = f.claim(); await assert.rejects(f.service.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef)), code('ACK_UNKNOWN'));
  const actual = f.deliveries.get(D); actual.state = 'unknown'; actual.observations.push({ state: 'unknown', permissionState: 'unknown', openability: 'unknown', observedAt: ++f.state.observedAt, evidenceRef: H('later-ack-unknown') }); f.state.observedAt++;
  const before = structuredClone(actual), q = await f.service.localDeliveryQuery({ taskRef: T, deliveryRef: D }); assert.equal(q.state, 'sent'); assert.equal(q.openability, 'unknown'); assert.equal(q.observedAt, f.state.observedAt); assert.deepEqual(actual, before); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 1);
});
test('current artifact mutation invalidates publication plan while historical authenticated bytes remain readable', () => {
  const f = fixture(), old = f.artifacts.get(A); const originalRead = f.api.readArtifact;
  f.plan(); f.artifact('Synthetic changed result.', A, 2);
  // A real immutable store keeps old bytes; this scoped closure double does too.
  f.api.readArtifact = input => input.version === 1 ? { artifact: old, data: f.data.get(old.recordRef) } : originalRead(input);
  f.service.dispose(); const replacement = f.install(); assert.equal(replacement.readLocalResult({ taskRef: T, artifactRef: A, version: 1, digest: old.digest }).artifact.version, 1);
  assert.throws(() => replacement.planLocalDelivery(command(f, 'new-plan', { deliveryRef: D })), code('ARTIFACT_STALE')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 0);
});
test('once observed peer/lifetime drift seals old callbacks even if original object is restored', () => {
  const f = fixture(), original = f.ctx.connection.operator; f.plan(); f.grant(); f.ctx.connection.operator = {};
  assert.throws(() => f.service.localResultsStatus({ taskRef: T }), code('SERVICE_DISPOSED')); f.ctx.connection.operator = original;
  assert.throws(() => f.service.localResultsStatus({ taskRef: T }), code('SERVICE_DISPOSED')); f.service.dispose(); assert.equal(f.calls.filter(c => c[0] === 'unsubscribe').length, 1);
});
test('private closure misrouting across owner/workspace and changed immutable intent fail closed', () => {
  for (const name of ['ownerRef', 'workspaceRef']) {
    const f = fixture(); f.state.task[name] = H(`other-${name}`); assert.throws(() => f.service.localResultsStatus({ taskRef: T }), code('SCOPE_MISMATCH')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 0);
  }
  const f = fixture(); f.deliveries.get(D).intent.commandRef = H('altered-intent'); assert.throws(f.plan, code('LOCAL_DELIVERY_MISMATCH')); assert.equal(f.calls.filter(c => c[0] === 'plan').length, 0);
});
test('normal native readiness rejects legacy accepted, unavailable and caller-looking proof bodies', () => {
  for (const binding of [undefined, null, { source: 'unavailable', verdict: 'accepted', reason: 'PROVENANCE_UNAVAILABLE', evidenceRef: H('guessed') }]) {
    const f = fixture(), a = f.artifacts.get(A); if (binding === undefined) delete a.verificationBinding; else a.verificationBinding = binding;
    assert.equal(f.service.localResultsStatus({ taskRef: T }).artifacts[0].verificationState, 'unknown'); assert.throws(f.plan, code('PROVENANCE_UNAVAILABLE')); assert.equal(f.calls.filter(c => c[0] === 'plan').length, 0);
    assert.equal(f.service.readLocalResult({ taskRef: T, artifactRef: A, version: 1, digest: a.digest }).artifact.verification.verdict, 'accepted');
  }
  const f = fixture(); const a = f.artifact(canonical({ source: 'native', passed: true, evidenceRef: H('guessed-proof'), reviewerRef: H('reviewer') })); f.delivery(a); delete a.verificationBinding;
  assert.throws(f.plan, code('PROVENANCE_UNAVAILABLE')); assert.equal(f.calls.filter(c => c[0] === 'publish').length, 0);
});
test('native projection binding must match original verification and independent producer generation', () => {
  for (const mutate of [a => { a.verificationBinding.evidenceRef = H('different-evidence'); }, a => { a.verificationBinding.reviewerRef = a.producerRef; }, a => { a.generationRef = a.verificationBinding.generationRef; }, a => { a.verificationBinding.round = 9; }, a => { a.verificationBinding.proof = true; }]) {
    const f = fixture(); mutate(f.artifacts.get(A)); assert.throws(f.plan); assert.equal(f.calls.filter(c => c[0] === 'plan').length, 0);
  }
  const f = fixture(), a = f.artifacts.get(A); a.verification.verdict = a.verificationBinding.verdict = 'unknown'; assert.throws(f.plan, code('ARTIFACT_UNVERIFIED'));
});
test('native verification currentness is rechecked at preview and immediately before atomic publication', async () => {
  const f = fixture(); f.plan(); const spec = f.state.actions[0].spec; f.artifacts.get(A).verificationBinding = null;
  assert.throws(() => f.service.resolveLocalDelivery(spec, f.state.task), code('PROVENANCE_UNAVAILABLE'));
  const g = fixture(); g.plan(); g.grant(); const d = g.claim(); g.artifacts.get(A).verificationBinding = { source: 'unavailable', verdict: 'accepted', reason: 'PROVENANCE_UNAVAILABLE', evidenceRef: H('old-native-now-stale') };
  await assert.rejects(g.service.recipientAdapter.send(d, g.data.get(g.artifacts.get(A).recordRef)), code('PROVENANCE_UNAVAILABLE')); assert.equal(g.calls.filter(c => c[0] === 'publish').length, 0); assert.equal(g.deliveries.get(D).state, 'outbox_committed');
});
test('normal notification acceptance requires its own native verification, not raw source labels', () => {
  const f = fixture({ notifications: true }), v = f.projection('one'); const a = f.service.prepareLocalNotification(command(f, 'prepare-no-native', { artifactRef: H('manifest-no-native'), version: 1, progressRefs: [v.progress.progressRef] })); delete f.artifacts.get(a.artifactRef).verificationBinding;
  assert.throws(() => f.service.acceptLocalNotification(command(f, 'accept-no-native', { deliveryRef: H('new-notice'), artifactRef: a.artifactRef, artifactVersion: 1, digest: a.digest, policyRevision: 1, progressRefs: [v.progress.progressRef] })), code('PROVENANCE_UNAVAILABLE')); assert.equal(f.calls.filter(c => c[0] === 'accept').length, 0);
});
test('actual access denial is distinct from corrupt/missing/digest/lifetime source failures', () => {
  for (const failure of ['STORAGE_INVALID', 'CRYPTO_ERROR', 'DIGEST_MISMATCH', 'ARTIFACT_NOT_FOUND', 'SERVICE_DISPOSED']) {
    const f = fixture(), d = f.deliveries.get(D); d.state = 'sent'; d.observations.push({ state: 'sent', permissionState: 'allowed', openability: 'unknown', observedAt: f.state.observedAt, evidenceRef: H('durable-source') });
    f.api.readArtifact = () => { throw Object.assign(new Error(failure), { code: failure }); }; f.service.dispose(); const replacement = f.install();
    assert.throws(() => replacement.localDeliveryAccess({ taskRef: T, deliveryRef: D }), code(failure)); assert.equal(f.calls.filter(c => c[0] === 'access').length, 0); assert.equal(d.state, 'sent');
  }
});
test('sent echo without actual durable publication cannot produce sent receipt', async () => {
  const f = fixture(); f.api.publishLocalDelivery = input => ({ ...f.deliveries.get(input.deliveryRef), state: 'sent', currentAccess: { permissionState: 'allowed', openability: 'unknown' }, observations: [{ state: 'sent', permissionState: 'allowed', openability: 'unknown', evidenceRef: input.evidenceRef, observedAt: input.observedAt }] });
  f.service.dispose(); const replacement = f.install(); replacement.planLocalDelivery(command(f, 'echo-plan', { deliveryRef: D })); f.grant(); const d = f.claim();
  await assert.rejects(replacement.recipientAdapter.send(d, f.data.get(f.artifacts.get(A).recordRef)), code('PUBLICATION_NOT_CONFIRMED')); assert.equal(f.deliveries.get(D).state, 'outbox_committed');
});
test('full-day configured quiet has bounded permanent hint and grants no emergency authority', () => {
  const f = fixture({ notifications: true }); f.policy().spec.quietWindows = [{ startMinute: 0, endMinute: 1440 }];
  const r = f.service.progressPolicy({ kind: 'milestone', observedAt: f.state.observedAt }); assert.equal(r.quietUntil, 8640000000000000); assert.ok(!f.calls.some(c => ['plan', 'publish'].includes(c[0])));
});

test('F1 exact detached disabled selection installs null optional contributions and rejects all operations without source work', async () => {
  const f = fixture({ selection: { enabled: false } }); assert.deepEqual(validateInstalledResults({ enabled: false }), { enabled: false });
  assert.equal(f.service.progressPolicy, null); assert.equal(f.service.notifications, null); assert.deepEqual(f.calls, []); assert.equal(f.subscriptions(), 1);
  const a = f.artifacts.get(A), names = {
    planLocalDelivery: command(f, 'disabled-plan', { deliveryRef: D }),
    writeLocalReport: command(f, 'disabled-report', { progressRef: H('disabled-progress'), kind: 'final', artifactRef: A, artifactVersion: 1, digest: a.digest, completedScopeRef: H('scope'), unfinishedRef: H('unfinished'), nextStepRef: H('next'), blockerRefs: [] }),
    configureLocalNotifications: { commandRef: H('disabled-policy'), expectedRevision: 0, spec: policySpec() },
    pendingLocalNotifications: { taskRef: T },
    prepareLocalNotification: command(f, 'disabled-prepare', { artifactRef: A, version: 1, progressRefs: [H('progress')] }),
    acceptLocalNotification: command(f, 'disabled-accept', { deliveryRef: D, artifactRef: A, artifactVersion: 1, digest: a.digest, policyRevision: 1, progressRefs: [H('progress')] }),
    localResultsStatus: { taskRef: T }, readLocalResult: { taskRef: T, artifactRef: A, version: 1, digest: a.digest }, localDeliveryAccess: { taskRef: T, deliveryRef: D },
  };
  for (const [name, input] of Object.entries(names)) assert.throws(() => f.service[name](input), code('RESULTS_DISABLED'));
  await assert.rejects(f.service.localDeliveryQuery({ taskRef: T, deliveryRef: D }), code('RESULTS_DISABLED'));
  assert.equal(f.service.localAdmission({ ownerRef: H(identity.ownerId), workspaceRef: H(identity.workspaceId), taskRef: T, actionRef: H('never-planned'), actionDigest: H('never-granted'), taskVersion: 1, authEpoch: 0, spec: {} }), false);
  assert.deepEqual(f.calls, []); assert.equal(f.state.actions.length, 0); assert.equal(f.deliveries.get(D).state, 'accepted');
  f.service.dispose(); f.service.dispose(); assert.equal(f.calls.filter(c => c[0] === 'unsubscribe').length, 1);
});
test('F2 thrown Proxy cannot reflect a forged authorization code or create denied access evidence', () => {
  const f = fixture(), d = f.deliveries.get(D); d.state = 'sent'; d.observations.push({ state: 'sent', permissionState: 'allowed', openability: 'unknown', observedAt: f.state.observedAt, evidenceRef: H('original-published') });
  let traps = 0; const thrown = new Proxy({}, { getOwnPropertyDescriptor() { traps++; return { value: 'UNAUTHORIZED', enumerable: true, configurable: true }; }, get() { traps++; throw new Error('CANARY'); } });
  f.api.readArtifact = () => { throw thrown; }; f.service.dispose(); const replacement = f.install();
  const before = structuredClone(d); assert.throws(() => replacement.localDeliveryAccess({ taskRef: T, deliveryRef: D }), code('LOCAL_ACCESS_UNKNOWN'));
  assert.equal(traps, 0); assert.equal(f.calls.filter(c => c[0] === 'access').length, 0); assert.deepEqual(d, before);
});
test('F2 accessor/inherited/coercible error codes confer no permission-denial fact', () => {
  let traps = 0; const getter = Object.defineProperty({}, 'code', { get() { traps++; return 'UNAUTHORIZED'; } });
  const coercible = { code: { toString() { traps++; return 'UNAUTHORIZED'; } } };
  for (const error of [getter, Object.create({ code: 'UNAUTHORIZED' }), coercible]) {
    const f = fixture(), d = f.deliveries.get(D); d.state = 'sent'; d.observations.push({ state: 'sent', permissionState: 'allowed', openability: 'unknown', observedAt: f.state.observedAt, evidenceRef: H('original-published') });
    f.api.readArtifact = () => { throw error; }; f.service.dispose(); const replacement = f.install();
    assert.throws(() => replacement.localDeliveryAccess({ taskRef: T, deliveryRef: D })); assert.equal(f.calls.filter(c => c[0] === 'access').length, 0); assert.equal(d.state, 'sent');
  }
  assert.equal(traps, 0);
});
