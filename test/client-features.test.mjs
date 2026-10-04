import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const factory = createRequire(import.meta.url)('../src/client-entry.cjs');
const d = text => createHash('sha256').update(text).digest('hex');
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect: () => {} };
const client = factory(() => React), ok = value => ({ ok: true, value });
const options = { clock: () => 1700, uuid: () => 'synthetic-ui-command', digest: async text => d(text) };
const task = { taskRef: d('task'), status: 'running', version: 4, authEpoch: 2, updatedAt: 1000 };
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sessionId = `df-${d('generation')}`;
const action = { actionRef: d('action'), actionDigest: d('action-spec'), claimRef: d('claim'), spec: { executor: { generationRef: d('generation') } } };
const worker = { actionRef: action.actionRef, claimRef: action.claimRef, generationRef: d('generation'), sessionRef: d(sessionId), phase: 'ready' };
const batch = { batchRef: d('questions'), state: 'awaiting', sourceAuthEpoch: 2, questions: [{ decisionRef: d('decision'), question: 'Which synthetic output is required?', branchRefs: [d('branch')] }] };
function fixture({ records = [], extra = {}, link = value => value, digest = options.digest, navigateSession } = {}) {
  const calls = [], writes = [];
  const snapshot = { task, control: 'paused', data: records.map((value, i) => ({ recordRef: d(`record-${i}`), kind: value.kind })), actions: [action], workers: [worker], artifacts: [], ...extra };
  const model = client.createModel({ async call(_channel, endpoint, input) {
    calls.push({ endpoint, input });
    if (endpoint === 'v1/list') return ok([task]);
    if (endpoint === 'v1/status') return ok(snapshot);
    if (endpoint === 'v1/detail') { const i = snapshot.data.findIndex(value => value.recordRef === input.recordRef); return ok({ task, data: { recordRef: input.recordRef, ...records[i] } }); }
    if (endpoint === 'v1/sessionLink') return ok(link({ ...input, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, sessionId }));
    if (['v1/revise', 'v1/answer'].includes(endpoint)) { writes.push({ endpoint, input }); return ok({}); }
    throw new Error('UNEXPECTED_ENDPOINT');
  } }, { ...options, digest, navigateSession });
  return { model, calls, writes, snapshot };
}
function all(node) { return node && typeof node === 'object' ? [node, ...node.children.flatMap(all)] : []; }
function text(node) { return node && typeof node === 'object' ? node.children.map(text).join(' ') : String(node); }

test('explicit goal and constraint revisions retain current CAS and never grant or execute', async () => {
  const f = fixture(); await f.model.refresh(); assert.equal(await f.model.reviseTask({ goal: 'New explicit goal', constraints: 'Keep all work synthetic' }), true);
  assert.deepEqual(f.writes[0], { endpoint: 'v1/revise', input: { goal: 'New explicit goal', constraints: 'Keep all work synthetic', reason: 'operator', taskRef: task.taskRef, commandRef: d('synthetic-ui-command'), expectedTaskVersion: 4, expectedAuthEpoch: 2 } });
  assert.equal(await f.model.reviseTask({ scope: 'forged-owner' }), false); assert.equal(await f.model.reviseTask({ goal: '' }), false);
  assert.equal(f.calls.some(value => /grant|dispatch|execute/.test(value.endpoint)), false); f.model.dispose();
});
test('question answers require the exact complete current batch; answering grants no authority', async () => {
  const f = fixture({ records: [{ kind: 'clarification', content: JSON.stringify(batch), digest: d('batch') }] }); await f.model.refresh();
  assert.equal(f.model.questions()[0].questions[0].question, batch.questions[0].question);
  assert.equal(await f.model.answerBatch(batch.batchRef, []), false); assert.equal(await f.model.answerBatch(batch.batchRef, [{ decisionRef: d('foreign'), answer: 'Forged' }]), false);
  assert.equal(await f.model.answerBatch(batch.batchRef, [{ decisionRef: d('decision'), answer: 'Choose synthetic text' }]), true);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].input.expectedAuthEpoch, 2); assert.equal(f.writes[0].input.batchRef, batch.batchRef);
  f.model.dispose();
  const g = fixture({ records: [{ kind: 'clarification', content: JSON.stringify({ ...batch, sourceAuthEpoch: 1 }) }] }); await g.model.refresh();
  assert.equal(await g.model.answerBatch(batch.batchRef, [{ decisionRef: d('decision'), answer: 'Old answer' }]), false); assert.equal(g.writes.length, 0); g.model.dispose();
});
test('revision and answer command awaits preserve input and reject disconnect with zero writes', async () => {
  for (const kind of ['revise', 'answer']) {
    const gate = pending(), f = fixture({ digest: () => gate.promise, records: [{ kind: 'clarification', content: JSON.stringify(batch) }] }); await f.model.refresh();
    const input = kind === 'revise' ? { goal: 'Original goal' } : [{ decisionRef: d('decision'), answer: 'Original answer' }];
    const operation = kind === 'revise' ? f.model.reviseTask(input) : f.model.answerBatch(batch.batchRef, input);
    if (kind === 'revise') input.goal = 'Changed'; else input[0].answer = 'Changed';
    f.model.disconnected(); gate.resolve(d('command')); assert.equal(await operation, false); assert.equal(f.writes.length, 0); assert.equal(f.model.getSnapshot().phase, 'offline'); assert.equal(f.model.getSnapshot().busy, false); f.model.dispose();
  }
});
test('paused owner navigation uses two exact live mapping reads plus native ID hash; no worker wake', async () => {
  const opened = [], f = fixture({ navigateSession: id => opened.push(id) }); await f.model.refresh();
  assert.equal(await f.model.openWorker(worker.claimRef), true); assert.deepEqual(opened, [sessionId]);
  const reads = f.calls.filter(value => value.endpoint === 'v1/sessionLink'); assert.equal(reads.length, 2);
  assert.deepEqual(reads[0].input, { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, sessionRef: worker.sessionRef, expectedTaskVersion: 4, expectedAuthEpoch: 2 });
  assert.equal(Object.hasOwn(reads[0].input, 'sessionId'), false); assert.equal(f.writes.length, 0); f.model.dispose();
});
test('foreign session bindings, native ID, terminal incarnation or lost epoch never navigate', async () => {
  for (const change of [value => ({ ...value, taskRef: d('foreign') }), value => ({ ...value, generationRef: d('foreign') }), value => ({ ...value, actionDigest: d('foreign') }), value => ({ ...value, authEpoch: 3 }), value => ({ ...value, sessionId: 'df-foreign' })]) {
    let opened = 0; const f = fixture({ link: change, navigateSession: () => opened++ }); await f.model.refresh(); assert.equal(await f.model.openWorker(worker.claimRef), false); assert.equal(opened, 0); f.model.dispose();
  }
  let opened = 0; const gate = pending(), f = fixture({ digest: () => gate.promise, navigateSession: () => opened++ }); await f.model.refresh();
  const opening = f.model.openWorker(worker.claimRef); await Promise.resolve(); f.model.disconnected(); gate.resolve(worker.sessionRef);
  assert.equal(await opening, false); assert.equal(opened, 0); assert.equal(f.calls.filter(value => value.endpoint === 'v1/sessionLink').length, 1); assert.equal(f.model.getSnapshot().phase, 'offline'); f.model.dispose();
  const g = fixture({ extra: { workers: [{ ...worker, phase: 'stopped' }] }, navigateSession: () => opened++ }); await g.model.refresh(); assert.equal(await g.model.openWorker(worker.claimRef), false); assert.equal(opened, 0); g.model.dispose();
});

function automationFixture({ digest = options.digest, mutate = value => value } = {}) {
  const sources = [{ sourceRef: d('source'), revision: 3, spec: { kind: 'schedule', identityMode: 'unique_id', enabled: true, adapterRef: d('adapter'), permissionPolicyRef: d('permission'), maxEventAgeMs: 10000, rate: { windowMs: 1000, maxEvents: 2 } } }];
  const subscriptions = [{ sourceRef: d('source'), subscriptionRef: d('subscription'), revision: 2, spec: { enabled: true, route: 'new_task', triggerRef: d('trigger') } }];
  const clock = { sourceRef: d('source'), subscriptionRef: d('subscription'), clockRef: d('clock'), sourceRevision: 3, subscriptionRevision: 2, cursor: null, timezone: 'UTC', polling: false, pendingVerification: { planDigest: d('missed-plan'), through: 1500, approved: false }, registration: { sourceRef: d('source'), subscriptionRef: d('subscription'), goal: 'Explicit scheduled synthetic goal', externalEffect: true, startAfter: 1000, spec: { timezone: 'UTC', cadence: 'daily', time: '08:00' } } };
  const writes = [], calls = []; let approved = false;
  const model = client.createModel({ async call(_, endpoint, input) {
    calls.push({ endpoint, input });
    if (endpoint === 'v1/list') return ok([]);
    if (endpoint === 'v1/listSources') return ok(sources);
    if (endpoint === 'v1/listSubscriptions') return ok(subscriptions);
    if (endpoint === 'v1/listSchedulePlans') return ok([mutate({ ...clock, pendingVerification: { ...clock.pendingVerification, approved } })]);
    if (endpoint === 'v1/approveSchedule') { writes.push(input); approved = true; return ok({}); }
    if (endpoint === 'v1/configureSource') { writes.push(input); sources[0] = { ...sources[0], spec: input.spec, revision: 4 }; return ok(sources[0]); }
    if (endpoint === 'v1/listEventReceipts') return ok([{ eventRef: d('event'), taskRef: task.taskRef, sourceRef: input.sourceRef, subscriptionRef: input.subscriptionRef, state: 'unknown', reservationsHeld: true }]);
    throw new Error('UNEXPECTED_ENDPOINT');
  } }, { ...options, digest }); return { model, writes, sources, subscriptions, calls, clock };
}
test('source and missed-plan approval use explicit loaded policies, exact source/sub/clock CAS and no effect grant', async () => {
  const f = automationFixture(); await f.model.refresh(); assert.equal(await f.model.approveSchedule(d('clock')), false);
  await f.model.loadAutomation(); assert.equal(await f.model.loadReceipts(d('subscription')), true);
  const rendered = text(client.Panel({ model: f.model })); assert.ok(rendered.includes('Explicit scheduled synthetic goal')); assert.ok(rendered.includes('awaiting explicit owner decision')); assert.ok(rendered.includes('unknown')); assert.ok(rendered.includes('Blocking severities') === false);
  assert.equal(await f.model.approveSchedule(d('clock')), true); assert.deepEqual(f.writes[0], { sourceRef: d('source'), subscriptionRef: d('subscription'), expectedSourceRevision: 3, expectedSubscriptionRevision: 2, clockRef: d('clock'), expectedCursor: null, planDigest: d('missed-plan'), commandRef: d('synthetic-ui-command') });
  assert.equal(await f.model.approveSchedule(d('clock')), false); assert.equal(await f.model.enableSource(d('source'), false), true);
  assert.deepEqual(f.writes[1].spec, { ...f.sources[0].spec, enabled: false }); assert.equal(f.writes[1].expectedRevision, 3);
  assert.equal(f.calls.some(value => /grant|dispatch|execute|tick|register/.test(value.endpoint)), false); f.model.dispose();
});
test('forged or revision-stale clock plan and disconnect during approval digest admit zero writes', async () => {
  for (const mutate of [value => ({ ...value, pendingVerification: { ...value.pendingVerification, planDigest: 'forged' } }), value => ({ ...value, sourceRevision: 2 })]) {
    const f = automationFixture({ mutate }); await f.model.loadAutomation(); assert.equal(await f.model.approveSchedule(d('clock')), false); assert.equal(f.writes.length, 0); f.model.dispose();
  }
  const gate = pending(), f = automationFixture({ digest: () => gate.promise }); await f.model.loadAutomation(); const pendingApproval = f.model.approveSchedule(d('clock')); f.model.disconnected(); gate.resolve(d('command'));
  assert.equal(await pendingApproval, false); assert.equal(f.writes.length, 0); assert.equal(f.model.getSnapshot().automationStale, true); assert.equal(f.model.getSnapshot().phase, 'offline'); f.model.dispose();
});
test('artifact version, verification, delivery access and independent coverage are separate displayed facts', async () => {
  const audit = { auditRef: d('audit'), taskRef: task.taskRef, bindingDigest: d('audit-binding'), state: 'failed', artifactVersion: 2, digest: d('artifact-bytes'), materialDigest: d('material'), material: [{ recordRef: d('artifact-record') }], round: 1, maxRepairRounds: 2, blockingSeverities: ['fatal', 'blocking'], reports: [{ reportRef: d('report'), verdict: 'failed', generationRef: d('independent-review'), coverageRefs: [d('artifact-record')], unexaminedRefs: [d('unexamined')], findings: [{ findingRef: d('finding'), severity: 'blocking', code: 'coverage_gap', evidenceRef: d('finding-evidence'), resolved: false }] }] };
  const f = fixture({ extra: { artifacts: [{ artifactRef: d('artifact'), version: 2, digest: d('artifact-bytes'), recordRef: d('artifact-record'), verification: { verdict: 'failed' } }], deliveries: [{ deliveryRef: d('delivery'), artifactVersion: 1, digest: d('prior-bytes'), state: 'sent', currentAccess: { permissionState: 'denied', openability: 'unknown', observedAt: 1000 } }], audits: [audit] } }); await f.model.refresh();
  const tree = client.Panel({ model: f.model }), rendered = text(tree); assert.ok(rendered.includes('version 2')); assert.ok(rendered.includes('Verification: failed')); assert.ok(rendered.includes('sent · artifact version 1')); assert.ok(rendered.includes('permission denied; openability unknown')); assert.ok(rendered.includes('Covered:')); assert.ok(rendered.includes(d('unexamined'))); assert.ok(rendered.includes('coverage_gap'));
  assert.equal(all(tree).some(value => value.props.dangerouslySetInnerHTML), false); assert.equal(all(tree).filter(value => value.type === 'button').some(value => /Pass audit|Complete task|Send result/.test(text(value))), false); f.model.dispose();
});

test('audit report inspection requires original material binding and fresh task CAS before publishing coverage', async () => {
  for (const corrupt of ['none', 'digest', 'version']) {
    const audit = { auditRef: d('audit'), taskRef: task.taskRef, artifactRef: d('artifact'), artifactVersion: 2, digest: d('artifact-bytes'), materialDigest: d('material'), bindingDigest: d('audit-binding'), state: 'pending', reports: [] };
    const report = { taskRef: task.taskRef, auditRef: audit.auditRef, artifactVersion: 2, digest: audit.digest, materialDigest: audit.materialDigest, bindingDigest: audit.bindingDigest, reportRef: d('report'), generationRef: d('review-gen'), verdict: 'unknown', coverageRefs: [], unexaminedRefs: [d('material-record')], findings: [] };
    let reads = 0; const model = client.createModel({ async call(_, endpoint) {
      if (endpoint === 'v1/list') return ok([task]);
      if (endpoint === 'v1/status') return ok({ task: { ...task, version: corrupt === 'version' && reads++ ? 5 : 4 }, control: 'active', data: [], actions: [], workers: [], audits: [audit] });
      if (endpoint === 'v1/audit') return ok({ ...audit, reports: [{ ...report, digest: corrupt === 'digest' ? d('foreign') : report.digest }] });
      throw new Error('UNEXPECTED_ENDPOINT');
    } }, options);
    await model.refresh(); assert.equal(await model.inspectAudit(audit.auditRef), corrupt === 'none'); assert.equal(model.getSnapshot().detail.audits[0].reports.length, corrupt === 'none' ? 1 : 0); model.dispose();
  }
});
test('throwing navigation or source command hooks cannot leak uppercase canaries or wedge busy', async () => {
  const f = fixture({ navigateSession: () => { throw new Error('SYNTHETIC_PRIVATE_CANARY'); } }); await f.model.refresh(); assert.equal(await f.model.openWorker(worker.claimRef), false); assert.equal(f.model.getSnapshot().error, 'RESULT_UNCONFIRMED'); assert.equal(f.model.getSnapshot().busy, false); assert.equal(JSON.stringify(f.model.getSnapshot()).includes('SYNTHETIC_PRIVATE_CANARY'), false); f.model.dispose();
  const g = automationFixture({ digest: async () => { throw new Error('SYNTHETIC_PRIVATE_CANARY'); } }); await g.model.loadAutomation(); assert.equal(await g.model.approveSchedule(d('clock')), false); assert.equal(g.writes.length, 0); assert.equal(g.model.getSnapshot().automationError, 'RESULT_UNCONFIRMED'); assert.equal(g.model.getSnapshot().busy, false); g.model.dispose();
});
