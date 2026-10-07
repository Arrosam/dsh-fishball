import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// Exact candidate public client factory. No DB/native services/DOM/network,
// provider or source replacement. RPC replies below are explicit wire doubles.
const require = createRequire(import.meta.url);
const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) }), useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect() {} };
const client = require('../src/client-entry.cjs')(() => React);
const R = text => createHash('sha256').update(text).digest('hex');
const ok = value => ({ ok: true, value });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const systemPrompt = 'You are a dsh-fishball worker. Use only the approved task context supplied in this turn. Tools and external actions are unavailable.';
function fixture(t, handle = () => undefined) {
  let task = { taskRef: R('task'), status: 'running', version: 1, authEpoch: 0, updatedAt: 1000 }, serial = 0;
  const listeners = new Set(), calls = []; let currentRequirement = null, currentWorkers = [];
  const audits = () => currentRequirement ? [currentRequirement] : [];
  const contextRecordRef = R('context');
  const taskModel = {
    getSnapshot: () => ({ stale: false, tasks: [task], selected: task.taskRef, busy: null, phase: 'ready', error: null, records: [], previews: {}, detail: { task, actions: [], workers: currentWorkers, audits: audits(), data: [{ recordRef: contextRecordRef, digest: R('context-content') }] } }),
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    async refresh() { calls.push({ name: 'task-refresh' }); return true; },
  };
  const description = {
    selection: { provider: 'df-testing-local', model: 'df-testing-worker-v1', agentPreset: 'empty', reasoningEffort: 'deterministic', maxOutputTokens: 128 },
    effectiveReasoningEffort: 'deterministic', environment: { root: '/synthetic/profile', cwd: '/synthetic/profile' },
    persistence: { directory: '/synthetic/profile/df-sessions', compression: 'none', retention: 'owner-managed', encrypted: false },
    bounds: { requestBytes: 131072, resultBytes: 2048 },
    limits: { queueCapacity: 32, maxActive: 1, maxAttempts: 1, maxTotalAttempts: 1, maxRuntimeMs: 60000, maxUsageUnits: 600000, maxCostEstimateMicros: 0 },
    charges: { runtimeMs: 1000, usageUnits: 135168, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: R('source') },
    accounting: 'df-testing-utf8-byte-units/v1', pricing: 'source_zero', grantTtlMs: 60000, systemPrompt,
  };
  const status = { enabled: false, ready: false, reason: 'disabled', bounds: null };
  const rpc = { async call(channel, name, payload, signal) {
    calls.push({ channel, name, payload, signal });
    const handled = await handle({ channel, name, payload, signal });
    if (handled !== undefined) return handled;
    if (name === 'v1/auditStatus') return ok({ ...status });
    if (name === 'v1/workerPolicyPreview') return ok({ previewRef: R('policy-preview'), planDigest: R('policy-plan'), expiresAt: 31000, expectedPolicyVersion: 1, description: structuredClone(description) });
    throw Error('unexpected fixture endpoint: ' + name);
  } };
  const options = { clock: () => 1000, uuid: () => 'command-' + (++serial), digest: async text => R(text) };
  const worker = client.createWorkerModel(rpc, taskModel, options);
  const capturedWorker = { getSnapshot: () => ({ contextRecordRef, capture: { artifactRef: R('artifact'), version: 1, digest: R('artifact-content'), recordRef: R('artifact-record') } }) };
  const audit = client.createAuditModel(rpc, taskModel, capturedWorker, options);
  t.after(() => { worker.dispose(); audit.dispose(); });
  const external = changes => { task = { ...task, ...changes }; for (const f of [...listeners]) f(); };
  external({}); // Establish current selection before any deferred operation.
  return { worker, audit, taskModel, calls, description, status, external, task: () => task, setRequirement(value) { currentRequirement = value; }, setWorkers(rows) { currentWorkers = rows; } };
}

test('disabled audit producer policy accepts its exact old fields while missing fields extras and malformed auditRoles refuse', async t => {
  const f = fixture(t);
  assert.equal(Object.hasOwn(f.description, 'auditRoles'), false);
  assert.equal(await f.worker.previewPolicy(1), true);
  assert.equal(f.worker.getSnapshot().policyPreview.description.limits.maxTotalAttempts, 1);
  assert.equal(Object.hasOwn(f.worker.getSnapshot().policyPreview.description, 'auditRoles'), false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.worker.setPolicyAccepted(true), true);
  for (const key of Object.keys(f.description)) {
    const missing = fixture(t, ({ name }) => {
      if (name !== 'v1/workerPolicyPreview') return;
      const description = structuredClone(f.description); delete description[key];
      return ok({ previewRef: R('preview'), planDigest: R('plan'), expiresAt: 31000, expectedPolicyVersion: 1, description });
    });
    assert.equal(await missing.worker.previewPolicy(1), false, 'required old field: ' + key);
    assert.equal(missing.worker.getSnapshot().error, 'INVALID_RESPONSE');
    assert.equal(missing.worker.getSnapshot().policyPreview, null);
  }
  for (const change of [{ extraField: 'unexpected' }, { auditRoles: null }, { auditRoles: {} }, { auditRoles: { review: {} } }]) {
    const malformed = fixture(t, ({ name }) => name === 'v1/workerPolicyPreview' ? ok({ previewRef: R('preview'), planDigest: R('plan'), expiresAt: 31000, expectedPolicyVersion: 1, description: { ...structuredClone(f.description), ...change } }) : undefined);
    assert.equal(await malformed.worker.previewPolicy(1), false);
    assert.equal(malformed.worker.getSnapshot().error, 'INVALID_RESPONSE');
    assert.equal(malformed.worker.getSnapshot().policyPreview, null);
  }
  assert.equal(f.calls.some(c => /Confirm|Grant|Create|Execute/.test(c.name)), false);
});

test('audit delayed refresh suppresses an external revision response and releases busy for explicit fresh status', async t => {
  const gate = deferred(); let first = true;
  const f = fixture(t, ({ name }) => { if (name === 'v1/auditStatus' && first) { first = false; return gate.promise; } });
  const pending = f.audit.refresh(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus');
  f.external({ version: 2 }); assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(await f.audit.refresh(), false, 'no overlapping same-connection request while old operation holds busy');
  gate.resolve(ok({ enabled: true, ready: true, reason: 'stale-result', bounds: null })); await pending;
  assert.equal(f.audit.getSnapshot().status, null, 'stale status cannot publish');
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(await f.audit.refresh(), true);
  assert.equal(f.audit.getSnapshot().status.enabled, false);
  assert.equal(f.calls.filter(c => c.name === 'v1/auditStatus').length, 2);
});

test('audit delayed configure suppresses external auth drift and releases busy without replaying mutation', async t => {
  const gate = deferred(), f = fixture(t, ({ name }) => name === 'v1/configureAudit' ? gate.promise : undefined);
  assert.equal(await f.audit.refresh(), true);
  const pending = f.audit.configure(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'configureAudit');
  assert.equal(f.calls.filter(c => c.name === 'v1/configureAudit').length, 1);
  f.external({ authEpoch: 1 });
  assert.equal(await f.audit.configure(), false, 'busy prevents another same-connection mutation');
  gate.resolve(ok({ auditRef: R('stale-requirement'), auditRevision: 1 }));
  assert.equal(await pending, false);
  assert.equal(f.audit.getSnapshot().requirement, null);
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(await f.audit.refresh(), true);
  assert.equal(f.calls.filter(c => c.name === 'v1/configureAudit').length, 1);
  assert.equal(f.calls.some(c => c.name === 'task-refresh'), false, 'stale mutation is neither accepted nor replayed');
});

test('audit old connection cleanup cannot clear a new refresh busy or publish its stale result', async t => {
  const old = deferred(), current = deferred(); let calls = 0;
  const f = fixture(t, ({ name }) => name === 'v1/auditStatus' ? (++calls === 1 ? old.promise : current.promise) : undefined);
  const oldRequest = f.audit.refresh(); await turn();
  const oldSignal = f.calls[0].signal;
  f.audit.disconnected(); assert.equal(oldSignal.aborted, true);
  const newRequest = f.audit.refresh(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus');
  old.resolve(ok({ enabled: true, ready: true, reason: 'old-connection', bounds: null }));
  assert.equal(await oldRequest, false);
  assert.equal(f.audit.getSnapshot().status, null);
  assert.equal(f.audit.getSnapshot().busy, 'auditStatus', 'old finally leaves new connection request owned');
  current.resolve(ok({ ...f.status })); assert.equal(await newRequest, true);
  assert.equal(f.audit.getSnapshot().busy, null);
  assert.equal(f.audit.getSnapshot().status.enabled, false);
  assert.equal(f.calls.filter(c => c.name === 'v1/auditStatus').length, 2);
});

const nodes = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [];
const text = node => node && typeof node === 'object' ? node.children.map(text).join(' ') : String(node);
async function idleAudit(t, { uncertain = false, query, create, execute, createExpected = true } = {}) {
  let f;
  const worker = () => ({ taskRef: f.task().taskRef, actionRef: R('audit-action'), actionDigest: R('audit-digest'), claimRef: R('audit-claim'), reservationRef: R('audit-reservation'), generationRef: R('audit-generation'), sessionRef: R('audit-session'), phase: 'ready' });
  f = fixture(t, ({ name, payload, signal }) => {
    if (name === 'v1/auditStatus') return ok({ enabled: true, ready: true, reason: null, bounds: { inputByteLimit: 65536, resultByteLimit: 2048, maxPrivateReviewers: 1, maxRepairRounds: 1 } });
    if (name === 'v1/configureAudit') return ok({ auditRef: R('audit'), auditRevision: 1, round: 0 });
    if (name === 'v1/prepareAuditInput') return ok({ auditRef: R('audit'), recordRef: R('audit-input'), digest: R('audit-content'), purpose: 'audit_review' });
    if (name === 'v1/planAuditAction') return ok({ actionRef: R('audit-action'), actionDigest: R('audit-digest') });
    if (name === 'v1/auditPreview') return ok({ previewRef: R('audit-preview'), taskVersion: f.task().version, authEpoch: f.task().authEpoch, expiresAt: 31000, actionDigest: R('audit-digest'), description: { data: { digest: R('audit-content'), content: 'Exact synthetic approved audit input' } } });
    if (name === 'v1/auditGrant') return ok({});
    if (name === 'v1/dispatchAudit') { f.setWorkers([worker()]); return create ? create({ f, worker: worker(), signal, payload }) : ok(worker()); }
    if (name === 'v1/executeAudit') return execute ? execute({ f, worker: worker(), signal, payload }) : { ok: false, error: { code: 'AUDIT_UNKNOWN' } };
    if (name === 'v1/auditQuery') return query ? query({ payload, worker: worker() }) : ok(worker());
  });
  assert.equal(await f.audit.refresh(), true);
  assert.equal(await f.audit.configure(), true); f.setRequirement(f.audit.getSnapshot().requirement);
  assert.equal(await f.audit.prepare('audit_review'), true);
  assert.equal(await f.audit.plan(), true); assert.equal(await f.audit.preview(), true);
  f.audit.setAccepted(true); assert.equal(await f.audit.grant(30000), true);
  assert.equal(await f.audit.create(), createExpected);
  if (uncertain) { assert.equal(await f.audit.execute(), false); assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit'); }
  return f;
}

test('audit task drift disables every mutation and preview with zero sends while preserving a separate safe query control', async t => {
  const f = await idleAudit(t); f.external({ version: 2 });
  const before = f.calls.length;
  for (const action of [() => f.audit.configure(), () => f.audit.prepare('audit_review'), () => f.audit.plan(), () => f.audit.preview(), () => f.audit.grant(30000), () => f.audit.create(), () => f.audit.execute(), () => f.audit.collect(), () => f.audit.finish()]) assert.equal(await action(), false);
  assert.equal(f.calls.length, before);
  const tree = client.Panel({ model: f.taskModel, workerModel: f.worker, auditModel: f.audit });
  const buttons = nodes(tree).filter(n => n.type === 'button');
  for (const label of ['Configure captured artifact audit', 'Prepare review input', 'Prepare repair input', 'Plan fresh role action', 'Preview full audit input', 'Create idle role session', 'Execute approved audit input', 'Collect original result', 'Finish owned role session']) {
    const button = buttons.find(n => text(n) === label); assert.ok(button, label); assert.equal(button.props.disabled, true, label);
  }
  assert.equal(buttons.find(n => text(n) === 'Query role facts').props.disabled, false);
  assert.equal(buttons.find(n => text(n) === 'Refresh audit status').props.disabled, false);
});

test('audit safe same-task query preserves stale uncertainty and cleared consent until explicit refresh', async t => {
  const f = await idleAudit(t, { uncertain: true }), original = f.audit.getSnapshot().worker;
  f.external({ authEpoch: 1 }); const before = f.calls.length;
  assert.equal(await f.audit.query(), true);
  assert.deepEqual(f.calls.slice(before).map(c => c.name), ['v1/auditQuery']);
  assert.deepEqual(f.calls.at(-1).payload, { taskRef: original.taskRef, actionRef: original.actionRef, claimRef: original.claimRef, generationRef: original.generationRef });
  const state = f.audit.getSnapshot(); assert.equal(state.stale, true); assert.equal(state.uncertain, 'executeAudit'); assert.equal(state.preview, null); assert.equal(state.accepted, false);
  assert.equal(await f.audit.preview(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(await f.audit.refresh(), true); assert.equal(f.audit.getSnapshot().stale, false);
  assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit', 'status observation never resolves uncertain execution');
});

test('audit different selected task drops the retained worker and refuses query without a send', async t => {
  const f = await idleAudit(t, { uncertain: true }); f.external({ taskRef: R('different-task'), version: 1, authEpoch: 0 });
  const before = f.calls.length;
  assert.equal(f.audit.getSnapshot().worker, null); assert.equal(await f.audit.query(), false);
  assert.equal(f.calls.length, before); assert.equal(f.audit.getSnapshot().preview, null);
});

test('audit late same-task query response after auth drift cannot publish a worker phase or recover stale state', async t => {
  const gate = deferred(), f = await idleAudit(t, { uncertain: true, query: () => gate.promise });
  const original = f.audit.getSnapshot().worker, pending = f.audit.query(); await turn();
  f.external({ authEpoch: 2 }); gate.resolve(ok({ ...original, phase: 'stopped' }));
  assert.equal(await pending, false); assert.deepEqual(f.audit.getSnapshot().worker, original);
  assert.equal(f.audit.getSnapshot().busy, null); assert.equal(f.audit.getSnapshot().stale, true);
  assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit'); assert.equal(f.audit.getSnapshot().preview, null);
});

test('audit well-formed foreign same-task query identity cannot replace the retained uncertain mapping', async t => {
  for (const field of ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef']) {
    const f = await idleAudit(t, { uncertain: true, query: ({ worker }) => ok({ ...worker, [field]: R('foreign-' + field) }) });
    const original = f.audit.getSnapshot().worker; assert.equal(await f.audit.query(), false, field);
    assert.deepEqual(f.audit.getSnapshot().worker, original); assert.equal(f.audit.getSnapshot().error, 'INVALID_RESPONSE');
    assert.equal(f.audit.getSnapshot().stale, true); assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
    assert.equal(f.audit.getSnapshot().preview, null); assert.equal(f.audit.getSnapshot().accepted, false);
  }
});


async function lostAuditCreate(t, options = {}) {
  return idleAudit(t, { createExpected: false, create() { throw Error('synthetic dispatch acknowledgement lost'); }, ...options });
}
const forbiddenSends = f => f.calls.filter(c => ['v1/dispatchAudit', 'v1/executeAudit'].includes(c.name)).map(c => c.name);

test('audit lost create derives only one exact current task worker and query preserves unknown dispatch without replay', async t => {
  const f = await lostAuditCreate(t);
  assert.equal(f.audit.getSnapshot().worker, null); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  assert.equal(f.audit.canQuery(), true); const before = f.calls.length;
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(await f.audit.query(), true);
  assert.deepEqual(f.calls.slice(before).map(c => c.name), ['v1/auditQuery']);
  assert.deepEqual(f.calls.at(-1).payload, { taskRef: f.task().taskRef, actionRef: R('audit-action'), claimRef: R('audit-claim'), generationRef: R('audit-generation') });
  assert.equal(f.audit.getSnapshot().worker.claimRef, R('audit-claim'));
  assert.equal(f.audit.getSnapshot().stale, true); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  assert.equal(f.audit.getSnapshot().preview, null); assert.equal(f.audit.getSnapshot().accepted, false);
  await f.audit.refresh(); assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.deepEqual(forbiddenSends(f), ['v1/dispatchAudit']);
});

test('audit unknown create refuses missing ambiguous foreign or malformed current-task worker candidates without query send', async t => {
  const cases = [
    row => [], row => [row, { ...row }], row => [{ ...row, actionRef: R('foreign-action') }],
    row => [{ ...row, actionDigest: R('foreign-action-digest') }], row => [{ ...row, taskRef: R('foreign-task') }],
    row => [{ ...row, claimRef: 'invalid' }], row => [{ ...row, phase: 'fabricated' }],
    row => [{ ...row, sessionRef: undefined }],
  ];
  for (const candidates of cases) {
    const f = await lostAuditCreate(t), row = f.taskModel.getSnapshot().detail.workers[0]; f.setWorkers(candidates(row));
    const before = f.calls.length; assert.equal(f.audit.canQuery(), false); assert.equal(await f.audit.query(), false);
    assert.equal(f.calls.length, before); assert.equal(f.audit.getSnapshot().worker, null);
    assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit'); assert.deepEqual(forbiddenSends(f), ['v1/dispatchAudit']);
  }
  // Durable intent/submitted are observed as unknown; actual identity is retained.
  for (const phase of ['intent', 'submitted']) {
    const f = await lostAuditCreate(t), row = f.taskModel.getSnapshot().detail.workers[0];
    const { taskRef, ...scopedRow } = row; f.setWorkers([{ ...scopedRow, phase }]);
    assert.equal(f.audit.canQuery(), true); assert.equal(await f.audit.query(), true);
    assert.equal(f.audit.getSnapshot().worker.taskRef, taskRef); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  }
});

test('audit unknown-create query rejects a foreign returned identity and late selected-task responses without adoption', async t => {
  const foreign = await lostAuditCreate(t, { query: ({ worker }) => ok({ ...worker, generationRef: R('foreign-generation') }) });
  assert.equal(await foreign.audit.query(), false); assert.equal(foreign.audit.getSnapshot().worker, null);
  assert.equal(foreign.audit.getSnapshot().uncertain, 'dispatchAudit');
  const gate = deferred(), late = await lostAuditCreate(t, { query: () => gate.promise });
  const original = late.taskModel.getSnapshot().detail.workers[0], pending = late.audit.query(); await turn();
  late.external({ taskRef: R('new-selection'), version: 1, authEpoch: 0 }); gate.resolve(ok(original));
  assert.equal(await pending, false); assert.equal(late.audit.getSnapshot().worker, null);
  assert.equal(late.audit.getSnapshot().action, null); assert.equal(late.audit.getSnapshot().busy, null);
  assert.equal(late.audit.getSnapshot().stale, true); assert.equal(late.audit.canQuery(), false);
});

test('audit disconnect during pending create preserves unknown dispatch through exact readonly recovery without create or execute repeat', async t => {
  const started = deferred(), outcome = deferred();
  const setup = idleAudit(t, { createExpected: false, create({ f, worker, signal }) { started.resolve({ f, worker, signal }); return outcome.promise; } });
  const { f, worker, signal } = await started.promise; f.audit.disconnected();
  assert.equal(signal.aborted, true); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  outcome.resolve(ok(worker)); await setup;
  assert.equal(f.audit.getSnapshot().worker, null, 'old connection success cannot adopt worker');
  assert.equal(await f.audit.refresh(), true); assert.equal(f.audit.canQuery(), true);
  assert.equal(await f.audit.query(), true); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.deepEqual(forbiddenSends(f), ['v1/dispatchAudit']);
});

test('audit disconnect after create response loss retains dispatch uncertainty through refresh and query', async t => {
  const f = await lostAuditCreate(t); f.audit.disconnected();
  assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit'); await f.audit.refresh();
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(await f.audit.query(), true); assert.equal(f.audit.getSnapshot().uncertain, 'dispatchAudit');
  assert.equal(f.audit.getSnapshot().preview, null); assert.equal(f.audit.getSnapshot().accepted, false);
  assert.deepEqual(forbiddenSends(f), ['v1/dispatchAudit']);
});

test('audit disconnect during pending execute retains execution uncertainty and never repeats that send', async t => {
  const gate = deferred(), f = await idleAudit(t, { execute: () => gate.promise });
  const pending = f.audit.execute(); await turn(); const signal = f.calls.find(c => c.name === 'v1/executeAudit').signal;
  f.audit.disconnected(); assert.equal(signal.aborted, true); assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
  gate.resolve(ok({ executionRef: R('late-execution'), state: 'committed' })); assert.equal(await pending, false);
  assert.equal(f.audit.getSnapshot().execution, null); await f.audit.refresh(); await f.audit.query();
  assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit'); assert.equal(await f.audit.execute(), false);
  assert.deepEqual(forbiddenSends(f), ['v1/dispatchAudit', 'v1/executeAudit']);
});
