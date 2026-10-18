import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createInstalledResults, validateInstalledResults } from '../src/installed-results.mjs';

// Independent functional T carriers only. No DB/store/native service, genuine
// signature, provider, receiver, timer, filesystem artifact or review is made.
// A retained Map/publication flag below is never durable/native evidence.
const H = value => createHash('sha256').update(value, 'utf8').digest('hex');
const J = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
const C = value => H(J(value)), clone = value => structuredClone(value);
const problem = code => Object.assign(new Error(code), { code });
const rejectsCode = (run, code) => assert.throws(run, error => error?.code === code);
const asyncCode = (run, code) => assert.rejects(run, error => error?.code === code);
const TIME = 8640000000000000;
const ID = Object.freeze({ ownerId: 'ni5-independent-owner', workspaceId: 'ni5-independent-space' });
const PROFILE = Object.freeze({ dir: '/synthetic/ni5-independent', name: 'typed-synthetic' });
const TASK = H('ni5-independent-task'), ART = H('ni5-independent-artifact'), DEL = H('ni5-independent-delivery');
const policySpec = () => ({ enabled: true, timeZone: 'Etc/UTC', quietWindows: [], emergencyKinds: ['obstacle'],
  mergeKinds: ['milestone'], mergeWindowMs: 0, minIntervalMs: 0, frequency: { windowMs: 60000, maxClaims: 5 } });
const selection = (notifications = false) => ({ enabled: true, route: 'local_dsh',
  admission: { units: 1, runtimeMs: 1200, usageUnits: 1000000 },
  notifications: notifications ? { enabled: true, policy: policySpec() } : { enabled: false } });
const effects = new Set(['plan', 'writeArtifact', 'accept', 'publish', 'access', 'configure', 'writeProgress']);

function native(a, verdict = 'accepted') {
  const reviewerRef = H('T-separate-native-reviewer'), generationRef = H('T-separate-review-generation');
  a.verification = { verdict, evidenceRef: H('T-native-verification-evidence'), reviewerRef, generationRef };
  a.verificationBinding = { source: 'native', auditRef: H('T-artifact-audit'), auditRevision: 3, round: 1,
    reportRef: H('T-review-report'), bindingDigest: C({ artifactRef: a.artifactRef, version: a.version, digest: a.digest }),
    materialDigest: C([{ recordRef: a.recordRef, digest: a.digest }]), resultRef: H('T-captured-result'),
    recordRef: H('T-native-result-record'), digest: H('T-native-result-bytes'), claimRef: H('T-review-claim'), generationRef,
    sessionRef: H('T-review-session'), executionRef: H('T-review-execution'), inputDigest: H('T-exact-review-input'),
    reviewerRef, verdict, evidenceRef: a.verification.evidenceRef };
  return a;
}

function fixture(options = {}) {
  const selected = clone(options.selection ?? selection(options.notifications));
  const namespace = C(['df.installed-results/v1', ID.ownerId, ID.workspaceId, PROFILE.dir, PROFILE.name]);
  const route = { recipientRef: C([namespace, 'df.native-owner/v1']), channelRef: C([namespace, 'df.local-results/v1']),
    policyRef: C([namespace, 'notification-policy']), mergeKeyRef: C([namespace, 'progress-group']) };
  const calls = [], hooks = {}, faults = {}, current = new Map(), versions = new Map(), bodies = new Map(), deliveries = new Map(), projections = new Map();
  const peer = Object.freeze({ T: 'original-carrier-peer' }), ctx = { connection: { browserPeer: peer }, profileContext: clone(PROFILE) };
  const lifetime = { alive: true }, listeners = new Set();
  const state = { observedAt: Date.UTC(2026, 9, 4, 12), task: { taskRef: TASK, ownerRef: H(ID.ownerId), workspaceRef: H(ID.workspaceId),
    version: 2, authEpoch: 7, status: 'running' }, control: 'active', actions: [], artifacts: [], progress: [], notifications: [], notificationFacts: [],
    policy: { version: 4, limits: { maxActive: 32, maxRuntimeMs: 60000, maxUsageUnits: 100000000, maxAttempts: 2, maxTotalAttempts: 12 },
      modelPolicy: { version: 6, catalogEvidenceRef: H('T-catalog'), presetRefs: [H('T-preset')] } } };
  const facts = { resourcePolicyVersion: 4, modelPolicyVersion: 6,
    model: { presetRef: H('T-preset'), modelRef: H('T-model'), reasoningRef: H('T-reasoning'), catalogEvidenceRef: H('T-catalog') },
    executor: { environmentRef: H('T-environment'), bindingDigest: H('T-local-original-route'), toolsDigest: C([]), permissionPolicyDigest: H('T-permission') },
    labels: { providerLabel: 'Typed local route', modelLabel: 'Typed accepted model', reasoningLabel: 'Typed selected reasoning',
      presetLabel: 'Typed preset', environmentLabel: 'Typed owner list', cwd: PROFILE.dir, toolNames: [], evidenceRef: H('T-label-evidence') } };
  const policy = { policyRef: route.policyRef, revision: 2, spec: clone(selected.notifications?.policy ?? policySpec()), windows: [] };
  const log = (name, input) => calls.push({ name, input });
  const read = (name, input, body) => { log(name, clone(input)); if (faults[name]) throw faults[name];
    const value = body(); hooks[name]?.(input, value); return hooks[`${name}Return`] ? hooks[`${name}Return`](input, value) : clone(value); };
  function artifact(content = 'Independent actual fixture bytes. 文😀', artifactRef = ART, version = 1, verified = true) {
    const recordRef = C({ artifactRef, version }), digest = H(content);
    const a = { artifactRef, version, recordRef, digest, producerRef: H('T-output-producer'), producerClaimRef: H('T-producer-claim'),
      generationRef: H('T-producer-generation'), verification: null, verificationBinding: null };
    if (verified) native(a);
    versions.set(`${artifactRef}:${version}`, a); current.set(artifactRef, a);
    bodies.set(recordRef, { recordRef, kind: 'artifact', digest, byteLength: Buffer.byteLength(content, 'utf8'), content });
    state.artifacts = [...current.values()]; return a;
  }
  function delivery(a = current.get(ART), deliveryRef = DEL, notification) {
    const intent = { taskRef: TASK, commandRef: H(`T-accept-${deliveryRef}`), expectedTaskVersion: state.task.version,
      expectedAuthEpoch: state.task.authEpoch, deliveryRef, artifactRef: a.artifactRef, artifactVersion: a.version, digest: a.digest,
      recipientRef: route.recipientRef, channelRef: route.channelRef };
    if (notification) intent.notification = clone(notification);
    const d = { deliveryRef, artifactRef: a.artifactRef, artifactVersion: a.version, digest: a.digest, recipientRef: route.recipientRef,
      channelRef: route.channelRef, targetDigest: C({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, ...intent }),
      intent, previousDeliveryRef: null, state: 'accepted', claimRef: null, reservationRef: null, generationRef: null, observations: [],
      currentAccess: { permissionState: 'unknown', openability: 'unknown' } };
    if (notification) d.notification = clone(notification);
    deliveries.set(deliveryRef, d); return d;
  }
  artifact(); delivery();
  const api = {
    ctx, isAlive: () => lifetime.alive,
    snapshotOwner: input => read('snapshot', input, () => state),
    readLocalActionFacts: input => read('facts', input, () => facts),
    subscribeRuntimeReceipts: fn => { log('subscribe', null); listeners.add(fn); return () => { log('unsubscribe', null); listeners.delete(fn); }; },
    planOwnerAction: input => { log('plan', clone(input)); if (faults.plan) throw faults.plan;
      const actionDigest = C({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, taskRef: input.taskRef,
        taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, spec: input.spec });
      state.actions.push({ actionRef: input.spec.actionRef, actionDigest, spec: clone(input.spec), claimRef: null, state: 'requested' });
      const receipt = { actionRef: input.spec.actionRef, actionDigest, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch };
      hooks.plan?.(input, receipt); return clone(receipt); },
    artifact: input => read('latest', input, () => current.get(input.artifactRef) ?? null),
    readArtifact: input => read('material', input, () => { const a = versions.get(`${input.artifactRef}:${input.version}`);
      return { artifact: a ?? null, data: a ? bodies.get(a.recordRef) : null }; }),
    writeArtifact: input => { log('writeArtifact', clone(input)); if (faults.writeArtifact) throw faults.writeArtifact;
      const a = artifact(input.content, input.artifactRef, input.version, false); hooks.writeArtifact?.(input, a); return clone(a); },
    acceptDelivery: input => { log('accept', clone(input)); if (faults.accept) throw faults.accept;
      const a = versions.get(`${input.artifactRef}:${input.artifactVersion}`), d = delivery(a, input.deliveryRef, input.notification);
      d.intent = clone(input); d.targetDigest = C({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef, ...input }); return clone(d); },
    getDelivery: input => read('delivery', input, () => deliveries.get(input.deliveryRef) ?? null),
    listLocalDeliveries: input => read('publications', input, () => [...deliveries.values()].filter(d => d.observations.some(o => ['sent', 'delivered'].includes(o.state)))),
    publishLocalDelivery: async input => {
      log('publish', clone(input)); if (faults.publish) throw faults.publish;
      await hooks.beforeCommit?.(input);
      const d = deliveries.get(input.deliveryRef);
      const observation = { state: 'sent', evidenceRef: input.evidenceRef, permissionState: 'allowed', openability: 'unknown', observedAt: input.observedAt };
      const projected = { ...clone(d), state: 'sent', observations: [...clone(d.observations), observation], currentAccess: { permissionState: 'allowed', openability: 'unknown' } };
      if (!hooks.echoOnly) Object.assign(d, clone(projected));
      await hooks.afterCommit?.(input, d);
      if (hooks.lostAck) throw problem('T_ACK_UNKNOWN');
      return hooks.publishReturn ? hooks.publishReturn(projected) : clone(projected);
    },
    recordLocalDeliveryAccess: input => { log('access', clone(input)); if (faults.access) throw faults.access;
      const d = deliveries.get(input.deliveryRef); d.currentAccess = { permissionState: input.permissionState, openability: 'unknown',
        observedAt: input.observedAt, evidenceRef: input.evidenceRef }; hooks.access?.(input, d); return clone(d); },
    configureLocalNotificationPolicy: input => { log('configure', clone(input)); if (faults.configure) throw faults.configure;
      policy.revision = input.expectedRevision + 1; policy.spec = clone(input.spec); hooks.configure?.(); return clone(policy); },
    getNotificationPolicy: input => read('policy', input, () => policy),
    writeLocalProgress: input => { log('writeProgress', clone(input)); if (faults.writeProgress) throw faults.writeProgress;
      return { progressRef: input.progressRef, task: clone(state.task) }; },
    readLocalProgress: input => read('progress', input, () => projections.get(input.progressRef) ?? null),
  };
  const factory = createInstalledResults({ selection: selected, identity: clone(ID), profile: clone(PROFILE) });
  const service = factory.installedResultsInstaller(api);
  const count = name => calls.filter(x => x.name === name).length;
  const mutations = () => calls.filter(x => effects.has(x.name));
  const command = (name, extra = {}) => ({ taskRef: TASK, commandRef: H(name), expectedTaskVersion: state.task.version,
    expectedAuthEpoch: state.task.authEpoch, ...extra });
  const plan = (deliveryRef = DEL) => service.planLocalDelivery(command(`T-plan-${deliveryRef}`, { deliveryRef }));
  const grant = (action = state.actions.at(-1)) => {
    state.task.authEpoch++;
    const receipt = { actionRef: action.actionRef, actionDigest: action.actionDigest, task: clone(state.task),
      taskVersion: state.task.version, authEpoch: state.task.authEpoch, expiresAt: TIME };
    for (const fn of listeners) fn({ operation: 'grant', input: { taskRef: TASK, actionRef: action.actionRef }, receipt }); return action;
  };
  const claim = (deliveryRef = DEL, action = state.actions.at(-1)) => {
    const d = deliveries.get(deliveryRef); action.claimRef = H(`T-claim-${deliveryRef}`); action.state = 'dispatch_intent';
    d.claimRef = action.claimRef; d.reservationRef = H(`T-reservation-${deliveryRef}`); d.generationRef = action.spec.executor.generationRef;
    d.state = 'outbox_committed'; state.task.version++; return clone(d);
  };
  const admission = (action = state.actions.at(-1)) => ({ ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef,
    taskRef: TASK, actionRef: action.actionRef, actionDigest: action.actionDigest, taskVersion: state.task.version,
    authEpoch: state.task.authEpoch, spec: clone(action.spec) });
  const ready = () => { plan(); grant(); return claim(); };
  const send = (record = clone(deliveries.get(DEL))) => service.recipientAdapter.send(record, clone(bodies.get(current.get(record.artifactRef).recordRef)));
  const publishHistory = (deliveryRef = DEL, stateName = 'sent') => { const d = deliveries.get(deliveryRef); d.state = stateName;
    d.observations = [{ state: stateName, evidenceRef: H('T-historical-source-evidence'), permissionState: 'allowed',
      openability: stateName === 'delivered' ? 'openable' : 'unknown', observedAt: state.observedAt }]; return d; };
  function progress(name, aggregate = 'not_run', opts = {}) {
    const a = current.get(ART), progressRef = H(`T-progress-${name}`), recordRef = H(`T-progress-record-${name}`);
    const material = [{ recordRef: a.recordRef, digest: a.digest }], vb = clone(a.verificationBinding);
    const r = { originalGoalRef: H('T-original-goal'), completedScopeRef: H('T-completed-scope'), unfinishedRef: H('T-unfinished'),
      nextStepRef: H('T-next-step'), verificationState: aggregate, verificationEvidence: aggregate === 'passed'
        ? [{ evidenceRef: vb.evidenceRef, digest: vb.digest, observedAt: state.observedAt }] : [], blockerRefs: [], progressDigest: H(opts.fact ?? `T-facts-${name}`) };
    const p = { progressRef, recordRef, digest: H(J(r)), kind: opts.kind ?? 'milestone', at: opts.at ?? state.observedAt,
      localReportRef: C({ taskRef: TASK, progressRef }) };
    const auditState = { stale: 'passed', blocked: 'failed', budget_limited: 'budget_exhausted', unexamined: 'passed', unknown: 'unknown',
      failed: 'failed', not_run: 'pending', passed: 'passed' }[aggregate];
    const source = { auditRef: vb.auditRef, auditRevision: vb.auditRevision, round: vb.round, bindingDigest: vb.bindingDigest,
      materialDigest: C(material), semanticRevision: 2, material, policyRef: H('T-review-policy'), blockingSeverities: ['blocking', 'fatal'],
      maxRepairRounds: 3, state: auditState, currentness: aggregate === 'stale' ? 'stale' : 'current',
      report: aggregate === 'not_run' ? null : { reportRef: vb.reportRef, verdict: ['failed', 'blocked'].includes(aggregate) ? 'failed'
        : aggregate === 'unknown' ? 'unknown' : aggregate === 'budget_limited' ? 'budget_exhausted' : 'passed',
        reviewerRef: vb.reviewerRef, claimRef: vb.claimRef, generationRef: vb.generationRef, resultRef: vb.resultRef,
        coverageRefs: aggregate === 'unexamined' ? [] : [a.recordRef], unexaminedRefs: aggregate === 'unexamined' ? [a.recordRef] : [],
        findings: aggregate === 'blocked' ? [{ findingRef: H('T-fatal-finding'), severity: 'fatal', code: 'scope_violation', evidenceRef: H('T-fatal-evidence'), resolved: false }] : [], evidenceRef: vb.evidenceRef },
      repair: null };
    const localReport = { contractVersion: 'df.local-progress/v1', ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef,
      taskRef: TASK, progressRef, recordRef, digest: p.digest, kind: p.kind, originalGoal: { recordRef: r.originalGoalRef, digest: H('T-goal-bytes') },
      statements: { completedScope: { recordRef: r.completedScopeRef, digest: H('T-scope-bytes') }, unfinished: { recordRef: r.unfinishedRef, digest: H('T-unfinished-bytes') },
        nextStep: { recordRef: r.nextStepRef, digest: H('T-next-bytes') }, blockers: [] },
      artifact: { artifactRef: a.artifactRef, version: a.version, recordRef: a.recordRef, digest: a.digest, producerRef: a.producerRef,
        producerClaimRef: a.producerClaimRef, generationRef: a.generationRef }, semanticRevision: 2,
      observedSourceCAS: { taskVersion: 2, authEpoch: 7 }, createdAt: state.observedAt, verificationState: aggregate,
      progressDigest: r.progressDigest, verificationBinding: aggregate === 'passed' ? vb : null, sourceStates: [source] };
    const value = { progress: p, report: r, localReport, currentness: opts.currentness ?? 'current' };
    projections.set(progressRef, value); state.progress.push(p); return value;
  }
  const prepare = refs => service.prepareLocalNotification(command('T-prepare', { artifactRef: H('T-notification-manifest'), version: 1, progressRefs: refs }));
  const manifest = values => J({ version: 'df.local-notification/v1', taskRef: TASK, ownerRef: state.task.ownerRef, workspaceRef: state.task.workspaceRef,
    progress: [...values].sort((a, b) => a.progress.progressRef.localeCompare(b.progress.progressRef)).map(v => ({ progressRef: v.progress.progressRef,
      digest: v.progress.digest, kind: v.progress.kind, report: v.report, localReport: v.localReport })) });
  return { selected, namespace, route, calls, hooks, faults, current, versions, bodies, deliveries, projections, ctx, peer, lifetime,
    listeners, state, facts, policy, api, factory, service, count, mutations, artifact, delivery, command, plan, grant, claim, admission, ready, send,
    publishHistory, progress, prepare, manifest, emit: event => { for (const fn of listeners) fn(event); } };
}

test('T N5-01/N5R-01: disabled/enabled construction and observational reads have zero mutation', async () => {
  assert.deepEqual(validateInstalledResults(), { enabled: false });
  for (const selected of [{ enabled: false }, selection(false), selection(true)]) {
    const f = fixture({ selection: selected }); assert.equal(f.count('subscribe'), 1); assert.equal(f.calls.length, 1);
    if (!selected.enabled) { rejectsCode(() => f.service.localResultsStatus({ taskRef: TASK }), 'RESULTS_DISABLED'); }
    else { assert.equal(f.service.localResultsStatus({ taskRef: TASK }).opening, 'unknown');
      const a = f.current.get(ART); f.service.readLocalResult({ taskRef: TASK, artifactRef: ART, version: 1, digest: a.digest });
      assert.equal((await f.service.localDeliveryQuery({ taskRef: TASK, deliveryRef: DEL })).state, 'unknown'); }
    assert.equal(f.mutations().length, 0); f.service.dispose(); f.service.dispose(); assert.equal(f.count('unsubscribe'), 1);
  }
});

for (const [field, boundary, valid] of [
  ['units', 0, false], ['units', 1, true], ['units', 32, true], ['units', 33, false],
  ['runtimeMs', 0, false], ['runtimeMs', 1, true], ['runtimeMs', 60000, true], ['runtimeMs', 60001, false],
  ['usageUnits', 0, false], ['usageUnits', 1, true], ['usageUnits', 100000000, true], ['usageUnits', 100000001, false],
]) test(`T N5-01/20: selected ${field} boundary ${boundary}`, () => {
  const value = selection(); value.admission[field] = boundary;
  if (!valid) rejectsCode(() => validateInstalledResults(value), 'CONFIG_INVALID');
  else { const selected = validateInstalledResults(value); assert.equal(selected.admission[field], boundary); value.admission[field] = 99;
    assert.equal(selected.admission[field], boundary); assert.ok(Object.isFrozen(selected.admission)); }
});

test('T N5-01/02/19: closed hostile config and wire values invoke zero caller traps/effects', async () => {
  let traps = 0;
  const getter = Object.defineProperty({}, 'taskRef', { enumerable: true, get() { traps++; throw problem('T_SECRET'); } });
  const proxy = new Proxy({}, { ownKeys() { traps++; throw problem('T_SECRET'); }, get() { traps++; throw problem('T_SECRET'); } });
  const hidden = Object.defineProperty({}, 'taskRef', { value: TASK });
  for (const x of [getter, proxy, hidden, Object.create({ taskRef: TASK }), { [Symbol('T')]: TASK }]) {
    rejectsCode(() => validateInstalledResults(x), 'CONFIG_INVALID');
    const f = fixture({ notifications: true });
    for (const name of ['planLocalDelivery', 'writeLocalReport', 'configureLocalNotifications', 'pendingLocalNotifications', 'prepareLocalNotification', 'acceptLocalNotification', 'localResultsStatus', 'readLocalResult', 'localDeliveryAccess']) {
      rejectsCode(() => f.service[name](x), 'INVALID_INPUT');
    }
    await asyncCode(() => f.service.localDeliveryQuery(x), 'INVALID_INPUT'); assert.equal(f.mutations().length, 0);
  }
  for (const change of [{ route: 'http' }, { recipientRef: H('T-caller-route') }, { delivered: true }, { permission: () => true },
    { notifications: { enabled: true, policy: { ...policySpec(), quietWindows: [,] } } }]) {
    rejectsCode(() => validateInstalledResults({ ...selection(), ...change }), 'CONFIG_INVALID');
  }
  assert.equal(traps, 0);
});

test('T N5-01/02: installation exact fields, one-use, no generic fallback and detached recipe', () => {
  const f = fixture(); rejectsCode(() => f.factory.installedResultsInstaller(f.api), 'RESULT_ALREADY_INSTALLED');
  for (const alter of [api => { delete api.readArtifact; }, api => { api.owner = {}; }, api => { api.readLocalArtifact = () => true; }, api => { api.ctx = {}; }]) {
    const fresh = createInstalledResults({ selection: selection(), identity: clone(ID), profile: clone(PROFILE) });
    const api = { ...f.api }; alter(api); assert.throws(() => fresh.installedResultsInstaller(api));
  }
  f.selected.admission.usageUnits = 1; f.plan(); assert.equal(f.state.actions[0].spec.charges.usageUnits, 1000000);
});

test('T N5-02/08: recipient/channel/policy/group identities and action charge recipe use independent canonical expectations', () => {
  const f = fixture({ notifications: true }); assert.deepEqual(f.service.notifications, f.route); f.plan();
  const a = f.state.actions.at(-1), d = f.deliveries.get(DEL);
  const binding = C({ namespace: f.namespace, selection: f.selected, ownerRef: H(ID.ownerId), workspaceRef: H(ID.workspaceId), taskRef: TASK,
    deliveryRef: DEL, targetDigest: d.targetDigest, dataDigest: d.digest, notification: null, facts: f.facts });
  assert.equal(a.spec.actionRef, C([binding, 'action'])); assert.equal(a.spec.attemptGroupRef, C([binding, 'attempt']));
  assert.equal(a.spec.executor.generationRef, C([binding, 'generation'])); assert.equal(a.spec.executor.mode, 'none');
  assert.deepEqual(a.spec.charges, { runtimeMs: 1200, usageUnits: 1000000, costState: 'estimated', costEstimateMicros: 0,
    costProvenanceRef: C([binding, 'df-local-utf8-byte-units/v1', 'source-owned-local-none']) });
  assert.equal(a.actionDigest, C({ ownerRef: H(ID.ownerId), workspaceRef: H(ID.workspaceId), taskRef: TASK, taskVersion: 2, authEpoch: 7, spec: a.spec }));
  assert.equal(f.service.resolveLocalDelivery(a.spec, f.state.task).targetDigest, d.targetDigest); assert.equal(f.count('publish'), 0);
});

for (const [name, mutate] of [
  ['owner', f => { f.state.task.ownerRef = H('T-other-owner'); }], ['workspace', f => { f.state.task.workspaceRef = H('T-other-space'); }],
  ['task', f => { f.state.task.taskRef = H('T-other-task'); }],
]) test(`T N5-02/N5R-02: foreign ${name} read scope refuses before material`, () => {
  const f = fixture(); mutate(f); rejectsCode(() => f.service.localResultsStatus({ taskRef: TASK }), 'SCOPE_MISMATCH');
  assert.equal(f.count('material'), 0); assert.equal(f.mutations().length, 0);
});

for (const [name, mutate] of [
  ['peer', f => { f.ctx.connection.browserPeer = {}; }], ['connection', f => { f.ctx.connection = { browserPeer: f.peer }; }],
  ['profile dir', f => { f.ctx.profileContext.dir += '-other'; }], ['profile name', f => { f.ctx.profileContext.name += '-other'; }],
  ['alive false', f => { f.lifetime.alive = false; }], ['alive promise', f => { f.lifetime.alive = Promise.resolve(true); }],
  ['dispose', f => f.service.dispose()],
]) test(`T N5-02/18/N5R-10: captured ${name} lifetime seals old callbacks`, () => {
  const f = fixture(); mutate(f); rejectsCode(() => f.service.localResultsStatus({ taskRef: TASK }), 'SERVICE_DISPOSED');
  f.ctx.connection = { browserPeer: f.peer }; f.ctx.profileContext = clone(PROFILE); f.lifetime.alive = true;
  rejectsCode(() => f.service.localResultsStatus({ taskRef: TASK }), 'SERVICE_DISPOSED'); assert.equal(f.mutations().length, 0);
});

for (const [name, mutate, code] of [
  ['null artifact', v => { v.artifact = null; }, 'ARTIFACT_BINDING_INVALID'], ['null data', v => { v.data = null; }, 'ARTIFACT_BINDING_INVALID'],
  ['record', v => { v.data.recordRef = H('T-wrong-record'); }, 'ARTIFACT_BINDING_INVALID'], ['kind', v => { v.data.kind = 'context'; }, 'ARTIFACT_BINDING_INVALID'],
  ['digest', v => { v.data.digest = H('T-wrong-digest'); }, 'ARTIFACT_BINDING_INVALID'], ['content', v => { v.data.content += 'x'; }, 'ARTIFACT_BINDING_INVALID'],
  ['byteLength', v => { v.data.byteLength++; }, 'ARTIFACT_BINDING_INVALID'], ['version', v => { v.artifact.version++; }, 'ARTIFACT_BINDING_INVALID'],
  ['extra top', v => { v.allowed = true; }, 'INVALID_INPUT'],
]) test(`T N5-04/N5R-02: exact stored-source projection rejects ${name}`, () => {
  const f = fixture(), a = f.current.get(ART); f.hooks.materialReturn = (_input, original) => { const value = clone(original); mutate(value); return value; };
  rejectsCode(() => f.service.readLocalResult({ taskRef: TASK, artifactRef: ART, version: 1, digest: a.digest }), code); assert.equal(f.mutations().length, 0);
});

test('T N5-04/N5R-02: historical scoped version bytes survive latest-version replacement without readiness', () => {
  const f = fixture(), old = clone(f.current.get(ART)); f.artifact('New latest typed bytes', ART, 2, false);
  assert.equal(f.service.readLocalResult({ taskRef: TASK, artifactRef: ART, version: 1, digest: old.digest }).data.content, 'Independent actual fixture bytes. 文😀');
  rejectsCode(() => f.plan(), 'ARTIFACT_STALE'); assert.equal(f.mutations().length, 0);
});

for (const [name, alter, stateName, code] of [
  ['no verification', a => { a.verification = null; a.verificationBinding = null; }, 'not_run', 'PROVENANCE_UNAVAILABLE'],
  ['raw accepted', a => { a.verificationBinding = null; }, 'unknown', 'PROVENANCE_UNAVAILABLE'],
  ['unavailable accepted', a => { a.verificationBinding = { source: 'unavailable', verdict: 'accepted', reason: 'PROVENANCE_UNAVAILABLE', evidenceRef: a.verification.evidenceRef }; }, 'unknown', 'PROVENANCE_UNAVAILABLE'],
  ['native rejected', a => native(a, 'rejected'), 'failed', 'ARTIFACT_UNVERIFIED'], ['native unknown', a => native(a, 'unknown'), 'unknown', 'ARTIFACT_UNVERIFIED'],
]) test(`T N5-03/07/N5R-03: ${name} can be read but never unlocks normal readiness`, () => {
  const f = fixture(), a = f.current.get(ART); alter(a);
  assert.equal(f.service.readLocalResult({ taskRef: TASK, artifactRef: ART, version: 1, digest: a.digest }).data.digest, a.digest);
  assert.equal(f.service.localResultsStatus({ taskRef: TASK }).artifacts[0].verificationState, stateName);
  rejectsCode(() => f.plan(), code); assert.equal(f.mutations().length, 0);
});

test('T N5-03/07/N5R-03: body embedded native-looking pass/delivery flags are only readable bytes', () => {
  const f = fixture(); const a = f.artifact(J({ source: 'native', accepted: true, passed: true, delivered: true, nativeResult: H('T-forged-body') }), ART, 1, false);
  a.verification = { verdict: 'accepted', evidenceRef: H('T-body-echo') }; f.delivery(a);
  assert.match(f.service.readLocalResult({ taskRef: TASK, artifactRef: ART, version: 1, digest: a.digest }).data.content, /delivered/);
  rejectsCode(() => f.plan(), 'PROVENANCE_UNAVAILABLE'); assert.equal(f.count('plan'), 0);
});

for (const [name, mutate] of [
  ['producer', a => { a.producerRef = a.verificationBinding.reviewerRef; }], ['generation', a => { a.generationRef = a.verificationBinding.generationRef; }],
  ['evidence', a => { a.verification.evidenceRef = H('T-wrong-evidence'); }], ['reviewer', a => { a.verification.reviewerRef = H('T-wrong-reviewer'); }],
  ['review generation', a => { a.verification.generationRef = H('T-wrong-review-generation'); }], ['verdict', a => { a.verification.verdict = 'rejected'; }],
]) test(`T N5-07/N5R-04: native projection mismatched ${name} cannot authorize plan`, () => {
  const f = fixture(); mutate(f.current.get(ART)); rejectsCode(() => f.plan(), 'PROVENANCE_UNAVAILABLE'); assert.equal(f.count('plan'), 0);
});

for (const aggregate of ['stale', 'blocked', 'budget_limited', 'unexamined', 'unknown', 'failed', 'not_run', 'passed']) {
  test(`T N5-05/06: manifest preserves actual typed source report state ${aggregate}`, () => {
    const f = fixture({ notifications: true }), v = f.progress(aggregate, aggregate), expected = f.manifest([v]);
    const a = f.prepare([v.progress.progressRef]); const data = f.bodies.get(a.recordRef);
    assert.equal(data.content, expected); assert.equal(a.digest, H(expected)); assert.equal(data.byteLength, Buffer.byteLength(expected));
    const report = JSON.parse(data.content).progress[0]; assert.equal(report.report.verificationState, aggregate);
    assert.deepEqual(report.localReport.sourceStates, v.localReport.sourceStates); assert.equal(f.count('publish'), 0);
  });
}

test('T N5-05/06: actual passed report native source coverage/repair axes survive canonical sorted manifest', () => {
  const f = fixture({ notifications: true }), a = f.progress('a', 'passed'), b = f.progress('b', 'unexamined');
  b.localReport.sourceStates[0].repair = { claimRef: H('T-repair-claim'), generationRef: H('T-repair-generation'), round: 2,
    previousReportRef: H('T-before-repair-report'), evidenceRef: H('T-repair-evidence') };
  const one = f.prepare([b.progress.progressRef, a.progress.progressRef]); const content = f.bodies.get(one.recordRef).content;
  assert.equal(content, f.manifest([a, b])); const input = f.calls.find(c => c.name === 'writeArtifact').input;
  assert.equal(Object.hasOwn(input, 'progressRefs'), false); assert.equal(one.digest, H(content)); assert.equal(f.count('accept'), 0);
});

for (const [name, mutate, code] of [
  ['unverified raw', v => { v.currentness = 'unverified'; v.report = null; v.localReport = null; delete v.progress.localReportRef; }, 'NORMAL_PROGRESS_UNAVAILABLE'],
  ['stale', v => { v.currentness = 'stale'; }, 'NORMAL_PROGRESS_UNAVAILABLE'],
  ['raw pointer retained', v => { v.currentness = 'unverified'; v.report = null; v.localReport = null; }, 'STORAGE_INVALID'],
  ['normal pointer missing', v => { delete v.progress.localReportRef; }, 'PROGRESS_BINDING_INVALID'],
  ['foreign owner', v => { v.localReport.ownerRef = H('T-report-other-owner'); }, 'PROGRESS_BINDING_INVALID'],
  ['source statement', v => { v.localReport.statements.nextStep.recordRef = H('T-wrong-next'); }, 'PROGRESS_BINDING_INVALID'],
  ['coverage hole', v => { v.localReport.sourceStates[0].report.coverageRefs = []; }, 'STORAGE_INVALID'],
  ['fatal even resolved', v => { v.localReport.sourceStates[0].report.findings = [{ findingRef: H('T-fatal'), severity: 'fatal', code: 'other', evidenceRef: H('T-fatal-evidence'), resolved: true }]; }, 'PROVENANCE_UNAVAILABLE'],
  ['unknown source', v => { v.localReport.sourceStates[0].state = 'unknown'; }, 'PROVENANCE_UNAVAILABLE'],
  ['stale source', v => { v.localReport.sourceStates[0].currentness = 'stale'; }, 'PROVENANCE_UNAVAILABLE'],
  ['mixed native report', v => { v.localReport.sourceStates[0].report.resultRef = H('T-other-result'); }, 'PROVENANCE_UNAVAILABLE'],
  ['same reviewer producer', v => { v.localReport.artifact.producerRef = v.localReport.verificationBinding.reviewerRef; }, 'PROVENANCE_UNAVAILABLE'],
]) test(`T N5-05/06/07: normal report ${name} refuses before manifest write`, () => {
  const f = fixture({ notifications: true }), v = f.progress('selected', 'passed'); mutate(v);
  rejectsCode(() => f.prepare([v.progress.progressRef]), code); assert.equal(f.count('writeArtifact'), 0);
});

test('T N5-05/19: writeLocalReport selects exact refs/CAS and never accepts caller verdict/proof', () => {
  const f = fixture(), a = f.current.get(ART), input = f.command('T-report', { progressRef: H('T-report'), kind: 'final', artifactRef: ART,
    artifactVersion: 1, digest: a.digest, completedScopeRef: H('T-completed'), unfinishedRef: H('T-left'), nextStepRef: H('T-next'), blockerRefs: [] });
  const result = f.service.writeLocalReport(input); assert.equal(result.progressRef, input.progressRef);
  assert.deepEqual(f.calls.find(c => c.name === 'writeProgress').input, input);
  for (const extra of [{ verdict: 'passed' }, { evidenceRef: H('T-owner-proof') }, { observedAt: 1 }, { delivered: true }])
    rejectsCode(() => f.service.writeLocalReport({ ...input, ...extra }), 'INVALID_INPUT');
  assert.equal(f.count('writeProgress'), 1); assert.equal(f.count('publish'), 0);
});

test('T N5-06/07/08: manifest needs its own typed accepted native association before notification acceptance', () => {
  const f = fixture({ notifications: true }), v = f.progress('fact', 'passed'), a = f.prepare([v.progress.progressRef]);
  const input = f.command('T-notify-accept', { deliveryRef: H('T-notification-delivery'), artifactRef: a.artifactRef, artifactVersion: a.version,
    digest: a.digest, policyRevision: f.policy.revision, progressRefs: [v.progress.progressRef] });
  rejectsCode(() => f.service.acceptLocalNotification(input), 'PROVENANCE_UNAVAILABLE'); assert.equal(f.count('accept'), 0);
  native(f.current.get(a.artifactRef)); const d = f.service.acceptLocalNotification(input);
  const actual = f.calls.find(c => c.name === 'accept').input;
  assert.equal(Object.hasOwn(actual, 'policyRevision'), false); assert.equal(Object.hasOwn(actual, 'progressRefs'), false);
  assert.deepEqual(actual.notification, { policyRef: f.route.policyRef, policyRevision: 2, progressRefs: [v.progress.progressRef], mergeKeyRef: f.route.mergeKeyRef });
  assert.equal(d.recipientRef, f.route.recipientRef); assert.equal(d.channelRef, f.route.channelRef); assert.equal(f.count('publish'), 0);
});

for (const [name, alter, code] of [
  ['full spec body', input => { input.spec = {}; }, 'INVALID_INPUT'], ['wrong task CAS', input => { input.expectedTaskVersion++; }, 'STALE_VERSION'],
  ['wrong auth CAS', input => { input.expectedAuthEpoch++; }, 'STALE_VERSION'],
]) test(`T N5-08/19: plan rejects ${name} without mutation`, () => {
  const f = fixture(), input = f.command('T-plan-refuse', { deliveryRef: DEL }); alter(input);
  rejectsCode(() => f.service.planLocalDelivery(input), code); assert.equal(f.count('plan'), 0);
});

for (const [name, mutate, code] of [
  ['recipient', d => { d.recipientRef = H('T-other-recipient'); }, 'LOCAL_DELIVERY_MISMATCH'],
  ['channel', d => { d.channelRef = H('T-other-channel'); }, 'LOCAL_DELIVERY_MISMATCH'],
  ['target digest', d => { d.targetDigest = H('T-wrong-target'); }, 'LOCAL_DELIVERY_MISMATCH'],
  ['intent task', d => { d.intent.taskRef = H('T-other-intent-task'); }, 'LOCAL_DELIVERY_MISMATCH'],
  ['outbox', d => { d.state = 'outbox_committed'; }, 'DELIVERY_NOT_ACCEPTED'],
]) test(`T N5-08/N5R-05: exact retained delivery ${name} binding refuses`, () => {
  const f = fixture(); mutate(f.deliveries.get(DEL)); rejectsCode(() => f.plan(), code); assert.equal(f.count('plan'), 0);
});

test('T N5-08: localAdmission is exact receipt narrowing, synchronous and performs zero source reads', () => {
  const f = fixture(); f.plan(); const record = f.admission(); assert.equal(f.service.localAdmission(record), false);
  f.grant(); const positive = f.admission(), before = f.calls.length; assert.equal(f.service.localAdmission(positive), true); assert.equal(f.calls.length, before);
  for (const key of ['ownerRef', 'workspaceRef', 'actionDigest']) assert.equal(f.service.localAdmission({ ...positive, [key]: H(`T-wrong-${key}`) }), false);
  assert.equal(f.service.localAdmission({ ...positive, taskVersion: positive.taskVersion + 1 }), false);
  const wrong = clone(positive); wrong.spec.executor.mode = 'create'; assert.equal(f.service.localAdmission(wrong), false);
  f.emit({ operation: 'revoke', input: { taskRef: TASK }, receipt: {} }); assert.equal(f.service.localAdmission(positive), false);
  assert.equal(f.count('publish'), 0);
});

test('T N5-08/18: malformed private receipt seals contribution rather than manufacturing admission', () => {
  const f = fixture(); f.plan(); f.grant(); const record = f.admission(); assert.equal(f.service.localAdmission(record), true);
  rejectsCode(() => f.emit({ operation: 'grant', input: { taskRef: TASK, actionRef: record.actionRef }, receipt: { ...clone(record), task: { ...f.state.task, ownerRef: H('T-other-owner') }, expiresAt: TIME } }), 'LOCAL_RECEIPT_UNAVAILABLE');
  assert.equal(f.service.localAdmission(record), false); rejectsCode(() => f.service.localResultsStatus({ taskRef: TASK }), 'SERVICE_DISPOSED');
});

test('T N5-09/10/N5R-05: original getDelivery publication shape, exact source association and unknown opening', async () => {
  const f = fixture(), record = f.ready(), result = await f.send(record);
  assert.equal(Object.hasOwn(f.deliveries.get(DEL), 'taskRef'), false); assert.equal(result.state, 'sent'); assert.equal(result.permissionState, 'granted'); assert.equal(result.openability, 'unknown');
  const input = f.calls.find(c => c.name === 'publish').input, action = f.state.actions[0];
  const evidenceRef = C({ namespace: f.namespace, taskRef: TASK, deliveryRef: DEL, actionDigest: action.actionDigest, claimRef: record.claimRef,
    digest: record.digest, at: f.state.observedAt, kind: 'local-publication' });
  assert.deepEqual(input, { taskRef: TASK, commandRef: C({ evidenceRef, operation: 'publish-local-delivery' }), deliveryRef: DEL,
    claimRef: record.claimRef, generationRef: record.generationRef, actionDigest: action.actionDigest, observedAt: f.state.observedAt, evidenceRef });
  assert.deepEqual(f.deliveries.get(DEL).observations.at(-1), { state: 'sent', evidenceRef, permissionState: 'allowed', openability: 'unknown', observedAt: f.state.observedAt });
  assert.equal(f.count('publish'), 1); assert.equal(f.count('access'), 0);
});

test('T N5-10/N5R-05: callback sent echo without retained publication cannot establish sent', async () => {
  const f = fixture(), record = f.ready(); f.hooks.echoOnly = true;
  await asyncCode(() => f.send(record), 'PUBLICATION_NOT_CONFIRMED'); assert.equal(f.deliveries.get(DEL).state, 'outbox_committed');
  assert.equal(f.deliveries.get(DEL).observations.length, 0);
});

for (const [name, modify] of [
  ['delivered flag', d => { d.state = 'delivered'; }], ['opened flag', d => { d.currentAccess.openability = 'openable'; }],
  ['denied access', d => { d.currentAccess.permissionState = 'denied'; }], ['claim', d => { d.claimRef = H('T-wrong-claim'); }],
  ['artifact version', d => { d.artifactVersion++; }], ['extra authority', d => { d.delivered = true; }],
]) test(`T N5-10/N5R-05: publication callback malformed ${name} gives no success receipt`, async () => {
  const f = fixture(), record = f.ready(); f.hooks.publishReturn = d => { modify(d); return d; };
  await assert.rejects(() => f.send(record)); assert.equal(f.count('publish'), 1); assert.equal(f.deliveries.get(DEL).state, 'sent');
});

for (const [name, mutate] of [
  ['peer', f => { f.ctx.connection.browserPeer = {}; }], ['profile', f => { f.ctx.profileContext.name = 'T-replaced'; }],
  ['dispose', f => f.service.dispose()], ['lifetime', f => { f.lifetime.alive = false; }],
]) test(`T N5-09/18/N5R-06: committed await then ${name} loss keeps source fact and forbids stale success`, async () => {
  const f = fixture(), record = f.ready(); let release, committed;
  const barrier = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { committed = resolve; });
  f.hooks.afterCommit = async () => { committed(); await barrier; };
  const sending = f.send(record); await reached; mutate(f); release(); await asyncCode(() => sending, 'SERVICE_DISPOSED');
  assert.equal(f.deliveries.get(DEL).state, 'sent'); assert.equal(f.count('publish'), 1); assert.equal(f.count('access'), 0);
});

test('T N5-11/N5R-07: committed loss query and uncertain query never resend or restore a private permit', async () => {
  const f = fixture(), record = f.ready(); f.hooks.lostAck = true;
  await asyncCode(() => f.send(record), 'T_ACK_UNKNOWN'); const d = f.deliveries.get(DEL); d.state = 'unknown';
  d.observations.push({ state: 'unknown', permissionState: 'unknown', openability: 'unknown', evidenceRef: H('T-lost-source-observation'), observedAt: f.state.observedAt + 1 });
  f.state.observedAt += 2; const before = f.mutations().length;
  const queried = await f.service.localDeliveryQuery({ taskRef: TASK, deliveryRef: DEL }); assert.equal(queried.state, 'sent'); assert.equal(queried.openability, 'unknown');
  assert.equal(f.mutations().length, before); assert.equal(f.count('publish'), 1);
  const g = fixture(); g.deliveries.get(DEL).state = 'unknown'; g.deliveries.get(DEL).observations = [{ state: 'unknown', permissionState: 'unknown', openability: 'unknown', observedAt: g.state.observedAt, evidenceRef: H('T-only-unknown') }];
  assert.equal((await g.service.localDeliveryQuery({ taskRef: TASK, deliveryRef: DEL })).state, 'unknown'); assert.equal(g.mutations().length, 0);
});

for (const denied of ['UNAUTHORIZED', 'PERMISSION_DENIED']) test(`T N5-12/N5R-08: actual typed source ${denied} records denied access without altering sent history`, () => {
  const f = fixture(); f.publishHistory(); const old = clone(f.deliveries.get(DEL).observations); f.faults.material = problem(denied);
  const result = f.service.localDeliveryAccess({ taskRef: TASK, deliveryRef: DEL }); assert.equal(result.currentAccess.permissionState, 'denied');
  assert.equal(result.currentAccess.openability, 'unknown'); assert.equal(result.state, 'sent'); assert.deepEqual(result.observations, old);
  assert.equal(f.count('access'), 1); assert.equal(f.count('publish'), 0);
});

for (const code of ['STORAGE_INVALID', 'CRYPTO_FAILED', 'DIGEST_MISMATCH', 'RECORD_NOT_FOUND', 'ARTIFACT_BINDING_INVALID', 'SERVICE_DISPOSED', 'T_UNKNOWN']) {
  test(`T N5-12/N5R-08: source ${code} is never reclassified as denial`, () => {
    const f = fixture(); f.publishHistory(); f.faults.material = problem(code);
    rejectsCode(() => f.service.localDeliveryAccess({ taskRef: TASK, deliveryRef: DEL }), code); assert.equal(f.count('access'), 0); assert.equal(f.count('publish'), 0);
  });
}

test('T N5-12/20/N5R-08: hostile error Proxy cannot execute reflection or invent denied evidence', () => {
  const f = fixture(); f.publishHistory(); let traps = 0;
  const thrown = new Proxy({}, { getOwnPropertyDescriptor(_object, key) { traps++; return key === 'code'
    ? { value: 'UNAUTHORIZED', enumerable: true, configurable: true } : undefined; } });
  f.faults.material = thrown;
  assert.throws(() => f.service.localDeliveryAccess({ taskRef: TASK, deliveryRef: DEL }));
  assert.equal(traps, 0); assert.equal(f.count('access'), 0); assert.equal(f.deliveries.get(DEL).state, 'sent');
});

test('T N5-12/20/N5R-08: hostile error code getter never executes and remains uncertainty', () => {
  const f = fixture(); f.publishHistory(); let getters = 0; const thrown = Object.defineProperty({}, 'code', { get() { getters++; return 'UNAUTHORIZED'; } });
  f.faults.material = thrown; assert.throws(() => f.service.localDeliveryAccess({ taskRef: TASK, deliveryRef: DEL }));
  assert.equal(getters, 0); assert.equal(f.count('access'), 0);
});

test('T N5-10/12/13: per-item historical delivered/query stays distinct from current access and unknown sibling', async () => {
  const f = fixture(); f.publishHistory(DEL, 'delivered'); const unknown = H('T-unknown-sibling'); f.delivery(f.current.get(ART), unknown);
  const d = f.deliveries.get(unknown); d.state = 'unknown'; d.observations.push({ state: 'unknown', permissionState: 'unknown', openability: 'unknown', observedAt: f.state.observedAt, evidenceRef: H('T-sibling-unknown') });
  assert.equal((await f.service.localDeliveryQuery({ taskRef: TASK, deliveryRef: DEL })).openability, 'verified');
  f.faults.material = problem('PERMISSION_DENIED'); const result = f.service.localDeliveryAccess({ taskRef: TASK, deliveryRef: DEL });
  assert.equal(result.state, 'delivered'); assert.equal(result.currentAccess.permissionState, 'denied'); assert.equal(result.currentAccess.openability, 'unknown');
  assert.equal((await f.service.localDeliveryQuery({ taskRef: TASK, deliveryRef: unknown })).state, 'unknown'); assert.equal(f.count('publish'), 0);
});

test('T N5-14: factual dedup ignores new progress identity/date and unknown group holds across policy revision', () => {
  const f = fixture({ notifications: true }); const one = f.progress('one', 'not_run', { fact: 'same source facts' }), two = f.progress('two', 'not_run', { fact: 'same source facts', at: f.state.observedAt + 1 });
  const separate = f.progress('three', 'failed', { fact: 'changed source facts' }); let pending = f.service.pendingLocalNotifications({ taskRef: TASK });
  assert.deepEqual(pending.suppressed, [{ progressRef: two.progress.progressRef, reason: 'duplicate_fact' }]); assert.equal(pending.candidates.length, 2);
  f.state.notifications.push({ ...f.route, state: 'unknown', released: false, deliveryRef: DEL, policyRevision: 1 }); f.policy.revision = 7;
  pending = f.service.pendingLocalNotifications({ taskRef: TASK }); assert.equal(pending.heldDeliveryRef, DEL); assert.ok(pending.candidates.every(c => c.state === 'held')); assert.equal(pending.batches.length, 0);
  assert.equal(pending.candidates.find(c => c.progressRef === separate.progress.progressRef).digest, separate.report.progressDigest); assert.equal(f.mutations().length, 0);
});

test('T N5-14: delivered facts suppress, confirmed failed released requires explicit retry, unknown remains held', () => {
  const f = fixture({ notifications: true }); const values = ['delivered', 'failed', 'unknown'].map(s => f.progress(s, 'not_run'));
  f.state.notificationFacts = values.map((v, i) => ({ recipientRef: f.route.recipientRef, channelRef: f.route.channelRef,
    digest: v.report.progressDigest, state: ['delivered', 'failed', 'unknown'][i], released: i === 1, deliveryRef: H(`T-fact-${i}`) }));
  const pending = f.service.pendingLocalNotifications({ taskRef: TASK }); assert.equal(pending.suppressed[0].reason, 'delivered');
  assert.deepEqual(pending.retryRequired, [{ progressRef: values[1].progress.progressRef, previousDeliveryRef: H('T-fact-1') }]);
  assert.equal(pending.candidates[0].state, 'held'); assert.equal(f.count('publish'), 0);
});

test('T N5-14: merge16/17 chunks retain all exact facts and no automatic publication', () => {
  const f = fixture({ notifications: true }); for (let i = 0; i < 17; i++) f.progress(`batch-${i}`, 'not_run');
  const pending = f.service.pendingLocalNotifications({ taskRef: TASK }); assert.deepEqual(pending.batches.map(b => b.progressRefs.length), [16, 1]);
  assert.equal(new Set(pending.batches.flatMap(b => b.progressRefs)).size, 17); assert.equal(f.mutations().length, 0);
});

for (const [name, now, policyChange, window, kind, expected] of [
  ['quiet start-1', Date.UTC(2026, 9, 4, 8, 59), { quietWindows: [{ startMinute: 540, endMinute: 600 }] }, null, 'milestone', 'eligible'],
  ['quiet start', Date.UTC(2026, 9, 4, 9), { quietWindows: [{ startMinute: 540, endMinute: 600 }] }, null, 'milestone', 'quiet'],
  ['quiet end', Date.UTC(2026, 9, 4, 10), { quietWindows: [{ startMinute: 540, endMinute: 600 }] }, null, 'milestone', 'eligible'],
  ['wrapping midnight', Date.UTC(2026, 9, 4, 0), { quietWindows: [{ startMinute: 1380, endMinute: 60 }] }, null, 'milestone', 'quiet'],
  ['emergency quiet bypass', Date.UTC(2026, 9, 4, 9), { quietWindows: [{ startMinute: 0, endMinute: 1440 }] }, null, 'obstacle', 'eligible'],
  ['emergency frequency stays', Date.UTC(2026, 9, 4, 9), { quietWindows: [{ startMinute: 0, endMinute: 1440 }], frequency: { windowMs: 60000, maxClaims: 0 } }, null, 'obstacle', 'frequency'],
  ['merge wait-1', 999, { mergeWindowMs: 1000 }, null, 'milestone', 'coalesced'],
  ['merge equality', 1000, { mergeWindowMs: 1000 }, null, 'milestone', 'eligible'],
  ['interval wait-1', 999, { minIntervalMs: 1000 }, { windowStart: 0, lastClaimAt: 0, count: 0 }, 'obstacle', 'interval'],
  ['interval equality', 1000, { minIntervalMs: 1000 }, { windowStart: 0, lastClaimAt: 0, count: 0 }, 'obstacle', 'eligible'],
  ['frequency full', 59999, { frequency: { windowMs: 60000, maxClaims: 1 } }, { windowStart: 0, lastClaimAt: 0, count: 1 }, 'milestone', 'frequency'],
  ['frequency reset equality', 60000, { frequency: { windowMs: 60000, maxClaims: 1 } }, { windowStart: 0, lastClaimAt: 0, count: 1 }, 'milestone', 'eligible'],
  ['clock rollback', 9, {}, { windowStart: 10, lastClaimAt: 10, count: 0 }, 'obstacle', 'clock_unknown'],
  ['disabled policy', 10, { enabled: false }, null, 'obstacle', 'disabled'],
]) test(`T N5-15/16: advisory policy boundary ${name}`, () => {
  const f = fixture({ notifications: true }); f.state.observedAt = now; Object.assign(f.policy.spec, policyChange);
  f.progress(name, 'not_run', { kind, at: ['merge wait-1', 'merge equality'].includes(name) ? 0 : now });
  if (window) f.policy.windows = [{ recipientRef: f.route.recipientRef, channelRef: f.route.channelRef, ...window }];
  const pending = f.service.pendingLocalNotifications({ taskRef: TASK }); assert.equal(pending.candidates[0].state, expected); assert.equal(f.mutations().length, 0);
});

test('T N5-15: actual Intl repeated/missing DST minute classification remains an advisory typed hint', () => {
  const f = fixture({ notifications: true }); f.policy.spec.timeZone = 'America/New_York'; f.policy.spec.quietWindows = [{ startMinute: 60, endMinute: 120 }];
  for (const at of [Date.UTC(2026, 10, 1, 5, 30), Date.UTC(2026, 10, 1, 6, 30)]) {
    f.state.observedAt = at; f.state.progress = []; f.projections.clear(); f.progress(`fall-${at}`, 'not_run');
    assert.equal(f.service.pendingLocalNotifications({ taskRef: TASK }).candidates[0].state, 'quiet');
  }
  f.policy.spec.quietWindows = [{ startMinute: 120, endMinute: 180 }]; f.state.observedAt = Date.UTC(2026, 2, 8, 7);
  f.state.progress = []; f.projections.clear(); f.progress('spring-after-gap', 'not_run');
  assert.equal(f.service.pendingLocalNotifications({ taskRef: TASK }).candidates[0].state, 'eligible'); assert.equal(f.mutations().length, 0);
});

test('T N5-15/20: full-day quiet sentinel and saturating merge hint create no timer or write', () => {
  const f = fixture({ notifications: true }); f.policy.spec.quietWindows = [{ startMinute: 0, endMinute: 1440 }]; f.policy.spec.emergencyKinds = [];
  assert.equal(f.service.progressPolicy({ kind: 'milestone', observedAt: f.state.observedAt }).quietUntil, TIME);
  f.policy.spec.quietWindows = []; f.policy.spec.mergeWindowMs = 100;
  assert.equal(f.service.progressPolicy({ kind: 'milestone', observedAt: TIME - 1 }).coalesceUntil, TIME); assert.equal(f.mutations().length, 0);
});

for (const delta of [-1, 0, 1]) test(`T N5-08/16: full canonical escaped CJK/astral publication bytes N${delta >= 0 ? '+' : ''}${delta}`, () => {
  const preliminary = fixture(), text = '漢字😀"\\\n'.repeat(20); const a = preliminary.artifact(text); const d = preliminary.delivery(a);
  const bytes = Buffer.byteLength(J({ taskRef: TASK, deliveryRef: DEL, artifactRef: ART, artifactVersion: 1, digest: a.digest,
    recipientRef: d.recipientRef, channelRef: d.channelRef, content: text }), 'utf8');
  const selected = selection(); selected.admission.usageUnits = bytes + delta;
  const f = fixture({ selection: selected }); f.delivery(f.artifact(text));
  if (delta < 0) { rejectsCode(() => f.plan(), 'BUDGET_LIMIT'); assert.equal(f.count('plan'), 0); }
  else { f.plan(); assert.equal(f.state.actions[0].spec.charges.usageUnits, bytes + delta); }
  assert.equal(f.count('publish'), 0);
});

test('T N5-06/20: complete manifest overflow refuses before creating artifact, never truncates report states', () => {
  const f = fixture({ notifications: true }); const refs = [];
  for (let i = 0; i < 16; i++) refs.push(f.progress(`oversize-${i}`, 'passed').progress.progressRef);
  assert.ok(Buffer.byteLength(f.manifest([...f.projections.values()])) > 65536);
  assert.throws(() => f.prepare(refs)); assert.equal(f.count('writeArtifact'), 0); assert.equal(f.count('publish'), 0);
});

test('T N5-08/20: private plan128/129 refuses growth before another source mutation', () => {
  const f = fixture();
  for (let i = 0; i < 128; i++) { const id = H(`T-plan-capacity-${i}`); f.delivery(f.current.get(ART), id); f.plan(id); }
  const extra = H('T-plan-capacity-129'); f.delivery(f.current.get(ART), extra);
  rejectsCode(() => f.plan(extra), 'LOCAL_PLAN_CAPACITY'); assert.equal(f.count('plan'), 128); assert.equal(f.count('publish'), 0);
});
