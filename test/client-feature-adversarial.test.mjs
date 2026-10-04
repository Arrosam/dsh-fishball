import test from 'node:test';
// Independent actual client module with synthetic RPC/React fixtures.
// No browser, native carrier, real credentials, account or model acceptance.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const factory = createRequire(import.meta.url)('../src/client-entry.cjs');
const h = text => createHash('sha256').update(text).digest('hex');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(value => value != null && value !== false) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect: () => {} };
const client = factory(() => React), task = { taskRef: h('ui-own-task'), status: 'running', version: 7, authEpoch: 3, updatedAt: 1000 };
const sessionId = 'df-' + h('ui-generation');
const worker = { actionRef: h('ui-action'), claimRef: h('ui-claim'), generationRef: h('ui-generation'), sessionRef: h(sessionId), phase: 'ready' };
const action = { actionRef: worker.actionRef, actionDigest: h('ui-complete-action'), claimRef: worker.claimRef, spec: { executor: { generationRef: worker.generationRef } } };
const batch = { batchRef: h('ui-batch'), state: 'awaiting', sourceAuthEpoch: 3, questions: [{ decisionRef: h('ui-decision'), question: 'Choose the synthetic output', branchRefs: [h('ui-branch')] }] };
const audit = { auditRef: h('ui-audit'), taskRef: task.taskRef, artifactRef: h('ui-artifact'), artifactVersion: 2, digest: h('ui-bytes'), materialDigest: h('ui-material'), bindingDigest: h('ui-audit-binding'), state: 'pending', reports: [] };
const report = { taskRef: task.taskRef, auditRef: audit.auditRef, artifactVersion: 2, digest: audit.digest, materialDigest: audit.materialDigest, bindingDigest: audit.bindingDigest, reportRef: h('ui-report'), generationRef: h('ui-independent-review'), verdict: 'unknown', coverageRefs: [], unexaminedRefs: [h('ui-material-record')], findings: [] };
function fixture({ digest = async text => h(text), link = value => value, latestTask = value => value, reportChange = value => value, navigate = () => {}, batchChange = value => value } = {}) {
  const calls = [], writes = [], records = [{ recordRef: h('ui-batch-record'), kind: 'clarification', digest: h('ui-batch-data'), content: JSON.stringify(batchChange(batch)) }];
  let statusCalls = 0;
  const snapshot = { task, control: 'paused', data: records.map(({ recordRef, kind }) => ({ recordRef, kind })), actions: [action], workers: [worker], artifacts: [], audits: [audit] };
  const model = client.createModel({ async call(_channel, endpoint, input) {
    calls.push({ endpoint, input });
    if (endpoint === 'v1/list') return { ok: true, value: [task] };
    if (endpoint === 'v1/status') return { ok: true, value: { ...snapshot, task: statusCalls++ ? latestTask(task) : task } };
    if (endpoint === 'v1/detail') return { ok: true, value: { task, data: records.find(record => record.recordRef === input.recordRef) } };
    if (endpoint === 'v1/sessionLink') return { ok: true, value: link({ ...input, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, sessionId }, calls.filter(call => call.endpoint === endpoint).length) };
    if (endpoint === 'v1/audit') return { ok: true, value: { ...audit, reports: [reportChange(report)] } };
    if (['v1/revise', 'v1/answer', 'v1/control'].includes(endpoint)) { writes.push({ endpoint, input }); return { ok: true, value: {} }; }
    throw Error('unexpected endpoint');
  } }, { clock: () => 1700, uuid: () => 'ui-private-command', digest, navigateSession: navigate });
  return { model, calls, writes, snapshot };
}
function automation({ digest = async text => h(text), mixedSubscription = false } = {}) {
  const sources = [{ sourceRef: h('ui-source'), revision: 2, spec: { kind: 'schedule', enabled: true, adapterRef: h('ui-adapter'), permissionPolicyRef: h('ui-permission'), identityMode: 'unique_id', maxEventAgeMs: 10000, rate: { windowMs: 1000, maxEvents: 4 } } }];
  const subscriptions = [{ sourceRef: mixedSubscription ? h('ui-other-source') : sources[0].sourceRef, subscriptionRef: h('ui-sub'), revision: 3, spec: { enabled: true, triggerRef: h('ui-trigger'), route: 'new_task' } }];
  const clock = { sourceRef: sources[0].sourceRef, subscriptionRef: subscriptions[0].subscriptionRef, clockRef: h('ui-clock'), sourceRevision: 2, subscriptionRevision: 3, cursor: null, timezone: 'Etc/UTC', polling: false,
    registration: { sourceRef: sources[0].sourceRef, subscriptionRef: subscriptions[0].subscriptionRef, goal: 'Exact synthetic missed goal', externalEffect: true, startAfter: 0, spec: { kind: 'interval', timezone: 'Etc/UTC', catchUp: 'verify', maxAgeMs: 10000, maxScanMinutes: 6000, anchorAt: 0, intervalMs: 60000 } },
    pendingVerification: { planDigest: h('ui-exact-plan'), through: 120000, approved: false } };
  const writes = [], calls = [];
  const model = client.createModel({ async call(_channel, endpoint, input) {
    calls.push({ endpoint, input });
    if (endpoint === 'v1/listSources') return { ok: true, value: sources };
    if (endpoint === 'v1/listSubscriptions') return { ok: true, value: subscriptions };
    if (endpoint === 'v1/listSchedulePlans') return { ok: true, value: [clock] };
    if (['v1/configureSource', 'v1/configureSubscription', 'v1/approveSchedule'].includes(endpoint)) { writes.push({ endpoint, input }); return { ok: true, value: {} }; }
    throw Error('unexpected endpoint');
  } }, { clock: () => 1700, uuid: () => 'ui-private-command', digest });
  return { model, writes, calls, sources, subscriptions, clock };
}
const check = async (name, fn) => { await test(name, fn); };
for (const kind of ['revise', 'answer']) await check(`captured-original-${kind}`, async () => {
  const deferred = gate(), f = fixture({ digest: () => deferred.promise }); await f.model.refresh();
  try { const input = kind === 'revise' ? { goal: 'Original current goal', constraints: 'Original constraints' } : [{ decisionRef: h('ui-decision'), answer: 'Original complete answer' }];
    const pending = kind === 'revise' ? f.model.reviseTask(input) : f.model.answerBatch(batch.batchRef, input);
    assert.equal(await (kind === 'revise' ? f.model.reviseTask({ goal: 'Concurrent other' }) : f.model.answerBatch(batch.batchRef, input)), false);
    if (kind === 'revise') input.goal = 'Changed caller goal'; else input[0].answer = 'Changed caller answer';
    deferred.resolve(h('ui-command')); assert.equal(await pending, true); assert.equal(f.writes.length, 1);
    if (kind === 'revise') { assert.equal(f.writes[0].input.goal, 'Original current goal'); assert.equal(f.writes[0].input.constraints, 'Original constraints'); }
    else assert.equal(f.writes[0].input.answers[0].answer, 'Original complete answer');
    assert.equal(f.writes[0].input.expectedTaskVersion, 7); assert.equal(f.writes[0].input.expectedAuthEpoch, 3);
    assert.equal(f.calls.some(call => /grant|dispatch|execute/.test(call.endpoint)), false); assert.equal(f.model.getSnapshot().busy, false);
  } finally { f.model.dispose(); }
});
for (const field of ['actionRef', 'claimRef', 'sessionRef', 'taskVersion', 'taskRef', 'generationRef', 'actionDigest', 'authEpoch', 'sessionId']) await check(`second-session-link-${field}`, async () => {
  let navigations = 0; const f = fixture({ link: (value, number) => number === 2 ? { ...value, [field]: typeof value[field] === 'number' ? value[field] + 1 : field === 'sessionId' ? 'df-wrong-native-id' : h(`ui-wrong-${field}`) } : value, navigate: () => navigations++ });
  try { await f.model.refresh(); assert.equal(await f.model.openWorker(worker.claimRef), false); assert.equal(navigations, 0); assert.equal(f.model.getSnapshot().busy, false); assert.equal(f.writes.length, 0); }
  finally { f.model.dispose(); }
});
for (const invalidated of ['disconnect', 'dispose', 'refresh']) await check(`session-hash-await-${invalidated}`, async () => {
  let navigations = 0; const deferred = gate(), f = fixture({ digest: () => deferred.promise, navigate: () => navigations++ });
  await f.model.refresh(); const pending = f.model.openWorker(worker.claimRef); await Promise.resolve();
  if (invalidated === 'disconnect') f.model.disconnected(); if (invalidated === 'dispose') f.model.dispose(); if (invalidated === 'refresh') await f.model.refresh();
  deferred.resolve(worker.sessionRef); assert.equal(await pending, false); assert.equal(navigations, 0); assert.equal(f.writes.length, 0); f.model.dispose();
});
for (const field of ['taskRef', 'auditRef', 'artifactVersion', 'digest', 'materialDigest', 'bindingDigest']) await check(`audit-report-bound-${field}`, async () => {
  const f = fixture({ reportChange: value => ({ ...value, [field]: typeof value[field] === 'number' ? value[field] + 1 : h(`ui-wrong-${field}`) }) });
  try { await f.model.refresh(); assert.equal(await f.model.inspectAudit(audit.auditRef), false); assert.equal(f.model.getSnapshot().detail.audits[0].reports.length, 0); assert.equal(f.writes.length, 0); }
  finally { f.model.dispose(); }
});
await check('audit-final-status-exact-task-not-only-equal-version', async () => {
  const f = fixture({ latestTask: value => ({ ...value, taskRef: h('ui-foreign-task') }) });
  try { await f.model.refresh(); assert.equal(await f.model.inspectAudit(audit.auditRef), false); assert.equal(f.model.getSnapshot().detail.audits[0].reports.length, 0); }
  finally { f.model.dispose(); }
});
for (const operation of ['approve', 'source', 'subscription']) for (const invalidated of ['disconnect', 'dispose', 'reload']) await check(`automation-command-await-${operation}-${invalidated}`, async () => {
  const deferred = gate(), f = automation({ digest: () => deferred.promise }); await f.model.loadAutomation();
  const pending = operation === 'approve' ? f.model.approveSchedule(f.clock.clockRef) : operation === 'source' ? f.model.enableSource(f.sources[0].sourceRef, false) : f.model.enableSubscription(f.subscriptions[0].subscriptionRef, false);
  if (invalidated === 'disconnect') f.model.disconnected(); if (invalidated === 'dispose') f.model.dispose(); if (invalidated === 'reload') await f.model.loadAutomation();
  deferred.resolve(h('ui-command')); assert.equal(await pending, false); assert.equal(f.writes.length, 0); f.model.dispose();
});
await check('missed-plan-source-subscription-association-must-match', async () => {
  const f = automation({ mixedSubscription: true });
  try { await f.model.loadAutomation(); assert.equal(await f.model.approveSchedule(f.clock.clockRef), false); assert.equal(f.writes.length, 0); }
  finally { f.model.dispose(); }
});
await check('source-disable-captures-complete-explicit-policy-before-await', async () => {
  const deferred = gate(), f = automation({ digest: () => deferred.promise }); await f.model.loadAutomation();
  const expected = structuredClone(f.sources[0].spec), pending = f.model.enableSource(f.sources[0].sourceRef, false);
  f.sources[0].spec.rate.maxEvents = 0; f.sources[0].spec.permissionPolicyRef = h('unapproved-replacement');
  deferred.resolve(h('ui-command')); assert.equal(await pending, true); assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].input.spec, { ...expected, enabled: false }); assert.equal(f.writes[0].input.expectedRevision, 2);
  assert.equal(f.calls.some(call => /grant|dispatch|execute|tick|register/.test(call.endpoint)), false); f.model.dispose();
});
for (const kind of ['approve', 'navigate']) await check(`redacted-private-callback-${kind}`, async () => {
  const sentinel = 'DF_UI_PRIVATE_UPPERCASE_SENTINEL';
  const f = kind === 'approve' ? automation({ digest: () => { throw Error(sentinel); } }) : fixture({ navigate: () => { throw Error(sentinel); } });
  try { if (kind === 'approve') { await f.model.loadAutomation(); assert.equal(await f.model.approveSchedule(f.clock.clockRef), false); }
    else { await f.model.refresh(); assert.equal(await f.model.openWorker(worker.claimRef), false); }
    const state = f.model.getSnapshot(); assert.equal(state.busy, false); assert.equal(JSON.stringify(state).includes(sentinel), false);
    assert.equal(kind === 'approve' ? state.automationError : state.error, 'RESULT_UNCONFIRMED');
  } finally { f.model.dispose(); }
});
