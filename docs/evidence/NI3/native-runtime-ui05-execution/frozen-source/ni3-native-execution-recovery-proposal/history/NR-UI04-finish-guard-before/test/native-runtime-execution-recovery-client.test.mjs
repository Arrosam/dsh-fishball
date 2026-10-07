import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// The approved actual client factory is the subject. All React/RPC/task-model
// replies below are explicit finite wire doubles; no private model state writes,
// native services, profiles, DB, DOM, filesystem fixtures, or provider calls.
const require = createRequire(import.meta.url);
const React = {
  Fragment: 'fragment',
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(v => v !== false && v != null) }),
  useSyncExternalStore: (_, get) => get(), useState: () => ['', () => {}], useEffect() {},
};
const client = require('../proposed/client-entry.cjs')(name => { assert.equal(name, 'react'); return React; });
const R = label => createHash('sha256').update(label).digest('hex');
const ok = value => ({ ok: true, value });
const clone = value => structuredClone(value);
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
const required = ['kind', 'executionRef', 'taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef', 'inputRecordRef', 'inputDigest', 'dataDigest', 'auditRef', 'bindingDigest', 'materialDigest', 'purpose', 'semanticRevision', 'commandRef', 'state', 'createdAt'];
const referenceKeys = ['executionRef', 'taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef', 'inputRecordRef', 'inputDigest', 'dataDigest', 'auditRef', 'bindingDigest', 'materialDigest', 'commandRef'];
const workerKeys = ['actionRef', 'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef'];
const nodes = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [];
const text = node => node && typeof node === 'object' ? node.children.map(text).join(' ') : String(node);

async function fixture(t, { execute, executeInitially = true, inputChange = {}, purpose = 'audit_review' } = {}) {
  const calls = [], listeners = new Set(); let serial = 0, stored = null;
  const task = { taskRef: R('task'), status: 'running', version: 1, authEpoch: 0, updatedAt: 1000 };
  const contextRecordRef = R('context');
  const input = { recordRef: R('input'), digest: R('input content'), byteLength: 100, auditRef: R('audit'), auditRevision: 1, round: purpose === 'audit_repair' ? 1 : 0, bindingDigest: R('binding'), materialDigest: R('material'), purpose, task: clone(task), deduplicated: false, ...inputChange };
  const worker = { taskRef: task.taskRef, actionRef: R('action'), actionDigest: R('action digest'), claimRef: R('claim'), reservationRef: R('reservation'), generationRef: R('generation'), sessionRef: R('session'), phase: 'ready' };
  const action = { actionRef: worker.actionRef, actionDigest: worker.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, state: 'dispatch_intent', spec: { role: 'reviewer', dataDigest: input.digest, executor: { generationRef: worker.generationRef, sessionRef: worker.sessionRef } } };
  const { taskRef, ...scopedWorker } = worker;
  let snapshot = { stale: false, tasks: [task], selected: task.taskRef, busy: false, phase: 'ready', error: null, records: [], previews: {}, detail: { task, actions: [], workers: [], executions: [], audits: [], data: [{ recordRef: contextRecordRef, digest: R('context content') }], semanticRevision: 3 } };
  const publishWire = (detail, top = {}) => { snapshot = { ...snapshot, ...top, detail: { ...snapshot.detail, ...detail } }; for (const f of [...listeners]) f(); };
  const taskModel = {
    getSnapshot: () => snapshot,
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    async refresh() { calls.push({ name: 'task-refresh' }); return true; },
  };
  const rpc = { async call(channel, name, payload, signal) {
    calls.push({ channel, name, payload: clone(payload), signal });
    if (name === 'v1/auditStatus') return ok({ enabled: true, ready: true, reason: null, bounds: { inputByteLimit: 65536, resultByteLimit: 2048, maxPrivateReviewers: 1, maxRepairRounds: 1 } });
    if (name === 'v1/configureAudit') {
      const value = { auditRef: input.auditRef, auditRevision: 1, round: 0, artifactVersion: 1, digest: R('artifact content'), materialDigest: input.materialDigest, state: 'pending' };
      publishWire({ audits: [value] }); return ok(value);
    }
    if (name === 'v1/prepareAuditInput') {
      if (purpose === 'audit_repair') { assert.equal(payload.previousReportRef, R('previous report')); assert.equal(payload.round, 1); }
      return ok(input);
    }
    if (name === 'v1/planAuditAction') return ok({ actionRef: action.actionRef, actionDigest: action.actionDigest });
    if (name === 'v1/auditPreview') return ok({ previewRef: R('preview'), taskVersion: snapshot.detail.task.version, authEpoch: snapshot.detail.task.authEpoch, expiresAt: 31000, actionDigest: action.actionDigest, description: { targetLabel: 'Synthetic exact review input', data: { digest: input.digest, content: 'Exact synthetic approved review input' } } });
    if (name === 'v1/auditGrant') return ok({});
    if (name === 'v1/dispatchAudit') { publishWire({ actions: [clone(action)], workers: [clone(scopedWorker)] }); return ok(worker); }
    if (name === 'v1/executeAudit') {
      // Public beginAuditExecution snapshot contract. These are explicit wire
      // values, not product-generated receipts or native execution facts.
      stored = { kind: 'audit_input', executionRef: R('wire stored execution'), taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, claimRef: worker.claimRef, generationRef: worker.generationRef, sessionRef: worker.sessionRef, inputRecordRef: input.recordRef, inputDigest: input.digest, dataDigest: R('artifact content'), auditRef: input.auditRef, bindingDigest: input.bindingDigest, materialDigest: input.materialDigest, purpose: input.purpose, semanticRevision: 3, commandRef: payload.commandRef, state: 'unknown', createdAt: 1000 };
      publishWire({ actions: [{ ...clone(action), executionRef: stored.executionRef }], executions: [clone(stored)] });
      if (execute) return execute({ payload, signal, record: clone(stored) });
      throw Error('synthetic execute response lost');
    }
    if (name === 'v1/auditQuery') return ok(worker);
    if (name === 'v1/collectAuditResult') return ok({ state: 'unknown', executionRef: payload.executionRef, reason: 'wire result still unconfirmed' });
    throw Error('unexpected wire endpoint: ' + name);
  } };
  const options = { clock: () => 1000, uuid: () => 'command-' + (++serial), digest: async value => R(value) };
  const workerModel = client.createWorkerModel(rpc, taskModel, options);
  const producerWire = { getSnapshot: () => ({ contextRecordRef, capture: { artifactRef: R('artifact'), version: 1, digest: R('artifact content'), recordRef: R('artifact record') } }) };
  const audit = client.createAuditModel(rpc, taskModel, producerWire, options);
  t.after(() => { workerModel.dispose(); audit.dispose(); });
  publishWire({}); // Establish selected identity through the public subscription.
  assert.equal(await audit.refresh(), true);
  assert.equal(await audit.configure(), true);
  if (purpose === 'audit_repair') publishWire({ audits: [{ ...snapshot.detail.audits[0], reportRef: R('previous report'), state: 'unknown' }] });
  assert.equal(await audit.prepare(input.purpose), true);
  assert.equal(await audit.plan(), true);
  assert.equal(await audit.preview(), true); audit.setAccepted(true);
  assert.equal(await audit.grant(30000), true);
  assert.equal(await audit.create(), true);
  const f = { audit, workerModel, taskModel, calls, input, worker, publishWire,
    record: () => clone(stored), detail: () => clone(snapshot.detail),
    setRecord(value) { publishWire({ executions: [clone(value)] }); },
    externalTask(change) { const next = { ...snapshot.detail.task, ...change }; publishWire({ task: next }, { selected: next.taskRef, tasks: [next] }); },
    panel: () => client.Panel({ model: taskModel, workerModel, auditModel: audit }),
  };
  if (executeInitially) { assert.equal(await audit.execute(), false); assert.equal(audit.getSnapshot().uncertain, 'executeAudit'); }
  return f;
}

function unchangedRecovery(f, expected = false) {
  const before = f.audit.getSnapshot(), calls = f.calls.length;
  assert.equal(f.audit.canRecoverExecution(), expected);
  assert.equal(f.audit.recoverExecution(), expected);
  assert.equal(f.calls.length, calls, 'recovery adds zero RPC calls or task refreshes');
  const after = f.audit.getSnapshot();
  assert.equal(after.stale, before.stale); assert.equal(after.uncertain, before.uncertain);
  assert.deepEqual(after.worker, before.worker); assert.deepEqual(after.collection, before.collection);
  assert.equal(after.preview, null); assert.equal(after.accepted, false);
  if (!expected) assert.deepEqual(after, before, 'refusal leaves model state unchanged');
}
const sent = (f, name) => f.calls.filter(c => c.name === name);
const button = (f, label) => { const found = nodes(f.panel()).find(n => n.type === 'button' && text(n) === label); assert.ok(found, label); return found; };

test('ER01 lost execute response recovers only the exact original public execution reference without sends or authority', async t => {
  const f = await fixture(t), record = f.record();
  assert.equal(f.audit.getSnapshot().execution, null); assert.equal(f.audit.getSnapshot().stale, true);
  unchangedRecovery(f, true);
  assert.deepEqual(f.audit.getSnapshot().execution, record);
  assert.equal(f.audit.getSnapshot().execution.commandRef, sent(f, 'v1/executeAudit')[0].payload.commandRef);
  assert.equal(f.audit.getSnapshot().collection, null);
  assert.equal(sent(f, 'v1/executeAudit').length, 1);
  assert.equal(sent(f, 'v1/collectAuditResult').length, 0); assert.equal(sent(f, 'v1/auditFinish').length, 0);
});

test('ER02 disconnect during execute keeps uncertainty and ignores late response before exact recovery', async t => {
  const gate = deferred(), f = await fixture(t, { executeInitially: false, execute: () => gate.promise });
  const pending = f.audit.execute(); await turn();
  assert.equal(f.audit.getSnapshot().busy, 'executeAudit');
  const request = sent(f, 'v1/executeAudit')[0]; f.audit.disconnected();
  assert.equal(request.signal.aborted, true); assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
  gate.resolve(ok({ ...f.record(), executionRef: R('late foreign execution'), state: 'completed' }));
  assert.equal(await pending, false); assert.equal(f.audit.getSnapshot().execution, null);
  unchangedRecovery(f, true);
  assert.equal(f.audit.getSnapshot().execution.executionRef, f.record().executionRef);
  assert.equal(await f.audit.execute(), false); assert.equal(sent(f, 'v1/executeAudit').length, 1);
});

test('ER03 post-loss disconnect and explicit status refresh preserve execute uncertainty and prohibit replay', async t => {
  const f = await fixture(t); f.audit.disconnected();
  assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
  assert.equal(await f.audit.refresh(), true); assert.equal(f.audit.getSnapshot().stale, false);
  unchangedRecovery(f, true);
  assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(sent(f, 'v1/dispatchAudit').length, 1); assert.equal(sent(f, 'v1/executeAudit').length, 1);
});

test('ER04 missing duplicate or oversized public candidate arrays refuse reference recovery', async t => {
  for (const key of ['actions', 'workers', 'executions']) {
    for (const mode of ['absent', 'empty', 'duplicate', 'oversized']) {
      const f = await fixture(t), row = f.detail()[key][0];
      const rows = mode === 'absent' ? undefined : mode === 'empty' ? [] : mode === 'duplicate' ? [row, clone(row)] : Array.from({ length: 129 }, () => clone(row));
      f.publishWire({ [key]: rows }); unchangedRecovery(f);
    }
  }
});

test('ER05 every exact execution and current worker or action identity binding discriminates foreign records', async t => {
  const keys = ['taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef', 'inputRecordRef', 'inputDigest', 'auditRef', 'bindingDigest', 'materialDigest', 'purpose', 'executionRef'];
  for (const key of keys) { const f = await fixture(t); f.setRecord({ ...f.record(), [key]: key === 'purpose' ? 'audit_repair' : R('foreign-' + key) }); unchangedRecovery(f); }
  for (const key of [...workerKeys, 'taskRef']) {
    const f = await fixture(t), detail = f.detail(); f.publishWire({ workers: [{ ...detail.workers[0], [key]: R('foreign-worker-' + key) }] }); unchangedRecovery(f);
  }
  for (const key of ['claimRef', 'generationRef', 'executionRef']) {
    const f = await fixture(t), detail = f.detail(); f.publishWire({ actions: [{ ...detail.actions[0], [key]: R('foreign-action-' + key) }] }); unchangedRecovery(f);
  }
});

test('ER06 execution snapshots require all nineteen keys and reject extra return flags and invalid field domains', async t => {
  for (const key of required) { const f = await fixture(t), row = f.record(); delete row[key]; f.setRecord(row); unchangedRecovery(f); }
  for (const key of ['extra', 'admitted', 'deduplicated']) { const f = await fixture(t); f.setRecord({ ...f.record(), [key]: true }); unchangedRecovery(f); }
  for (const key of referenceKeys) { const f = await fixture(t); f.setRecord({ ...f.record(), [key]: 'NOT_A_REF' }); unchangedRecovery(f); }
  for (const key of ['semanticRevision', 'createdAt']) {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1000']) { const f = await fixture(t); f.setRecord({ ...f.record(), [key]: value }); unchangedRecovery(f); }
  }
  for (const change of [{ kind: 'context' }, { purpose: 'unknown' }, { state: 'captured' }]) { const f = await fixture(t); f.setRecord({ ...f.record(), ...change }); unchangedRecovery(f); }
});

test('ER07 the five actual optional fields admit documented forms and reject inconsistent or malformed forms', async t => {
  const repair = await fixture(t, { purpose: 'audit_repair' }); unchangedRecovery(repair, true);
  assert.equal(repair.audit.getSnapshot().execution.purpose, 'audit_repair');
  for (const state of ['intent_committed', 'dispatch_intent', 'unknown', 'completed', 'failed', 'terminated']) {
    const terminal = ['completed', 'failed', 'terminated'].includes(state);
    const f = await fixture(t), record = { ...f.record(), state,
      ...(state !== 'intent_committed' ? { admittedAt: 1000 } : {}),
      ...(terminal ? { outcomeEvidenceRef: R('settled outcome'), terminalEvidenceRef: R('original worker terminal') } : state === 'unknown' ? { outcomeEvidenceRef: R('unconfirmed outcome'), terminalEvidenceRef: null } : {}),
    };
    f.setRecord(record); unchangedRecovery(f, true); assert.deepEqual(f.audit.getSnapshot().execution, record);
  }
  for (const terminalEvidenceRef of [null, R('terminal evidence')]) {
    const f = await fixture(t), row = { ...f.record(), admittedAt: 1001, resultRef: f.record().executionRef, reportRef: R('report'), outcomeEvidenceRef: R('outcome'), terminalEvidenceRef };
    f.setRecord(row); unchangedRecovery(f, true); assert.deepEqual(f.audit.getSnapshot().execution, row);
  }
  const changes = [{ admittedAt: 999 }, { admittedAt: 1.5 }, { admittedAt: '1000' }, { state: 'dispatch_intent' }, { resultRef: 'invalid' }, { resultRef: R('other result') }, { reportRef: R('report') }, { outcomeEvidenceRef: null }, { terminalEvidenceRef: 'invalid' }];
  for (const change of changes) { const f = await fixture(t); f.setRecord({ ...f.record(), ...change }); unchangedRecovery(f); }
  for (const key of ['reportRef', 'outcomeEvidenceRef']) { const f = await fixture(t); f.setRecord({ ...f.record(), resultRef: f.record().executionRef, [key]: 'invalid' }); unchangedRecovery(f); }
  for (const state of ['completed', 'failed', 'terminated']) {
    for (const evidence of [{}, { outcomeEvidenceRef: R('outcome'), terminalEvidenceRef: null }, { terminalEvidenceRef: R('terminal') }]) {
      const f = await fixture(t); f.setRecord({ ...f.record(), state, admittedAt: 1000, ...evidence }); unchangedRecovery(f);
    }
  }
  const cancelled = await fixture(t);
  cancelled.setRecord({ ...cancelled.record(), state: 'cancelled', admittedAt: 1000, outcomeEvidenceRef: R('outcome'), terminalEvidenceRef: R('terminal') });
  unchangedRecovery(cancelled);
});

test('ER08 stale selected task malformed retained wire inputs busy or disposed clients refuse recovery', async t => {
  const stale = await fixture(t); stale.publishWire({}, { stale: true }); unchangedRecovery(stale);
  const foreign = await fixture(t); foreign.externalTask({ taskRef: R('foreign-task') }); unchangedRecovery(foreign);
  const disposed = await fixture(t); disposed.audit.dispose(); unchangedRecovery(disposed);
  const noLoss = await fixture(t, { executeInitially: false }); unchangedRecovery(noLoss);
  for (const inputChange of [{ bindingDigest: undefined }, { materialDigest: 'invalid' }]) {
    const f = await fixture(t, { inputChange }); unchangedRecovery(f);
  }
  // The wire model can change between the client's task read and row read.
  // Both exact version and auth comparisons must reject these mixed snapshots.
  for (const key of ['version', 'authEpoch']) {
    const f = await fixture(t), current = f.taskModel.getSnapshot(); let reads = 0;
    const changed = { ...current, detail: { ...current.detail, task: { ...current.detail.task, [key]: current.detail.task[key] + 1 } } };
    f.taskModel.getSnapshot = () => reads++ % 2 ? changed : current;
    unchangedRecovery(f);
  }
  const busyGate = deferred(), busy = await fixture(t, { executeInitially: false, execute: () => busyGate.promise });
  const pending = busy.audit.execute(); await turn(); unchangedRecovery(busy);
  busyGate.resolve({ ok: false, error: { code: 'AUDIT_UNKNOWN' } }); assert.equal(await pending, false);
  // Version/auth drift remain audibly stale; exact fresh owner detail may still
  // recover the historical execution but cannot clear either stale or unknown.
  for (const change of [{ version: 2 }, { authEpoch: 1 }]) { const f = await fixture(t); f.externalTask(change); unchangedRecovery(f, true); }
});

test('ER09 task switching drops retained bindings and old delayed execution cannot paint the new task', async t => {
  const gate = deferred(), f = await fixture(t, { executeInitially: false, execute: () => gate.promise });
  const pending = f.audit.execute(); await turn(); const old = f.record();
  f.externalTask({ taskRef: R('new-selection'), version: 1, authEpoch: 0 });
  assert.equal(f.audit.getSnapshot().worker, null); assert.equal(f.audit.getSnapshot().input, null);
  gate.resolve(ok(old)); assert.equal(await pending, false); unchangedRecovery(f);
  assert.equal(f.audit.getSnapshot().execution, null); assert.equal(sent(f, 'v1/executeAudit').length, 1);
});

test('ER10 actual Panel recovery control stays separate from stale mutation gates and original collection authority', async t => {
  const f = await fixture(t), row = { ...f.record(), state: 'completed', resultRef: f.record().executionRef, reportRef: R('report'), outcomeEvidenceRef: R('outcome'), terminalEvidenceRef: R('terminal') };
  f.setRecord(row);
  assert.equal(button(f, 'Recover execution reference').props.disabled, false);
  assert.equal(button(f, 'Query role facts').props.disabled, false);
  assert.equal(button(f, 'Collect original result').props.disabled, true);
  assert.equal(button(f, 'Finish owned role session').props.disabled, true);
  const before = f.calls.length; assert.equal(button(f, 'Recover execution reference').props.onClick(), true); assert.equal(f.calls.length, before);
  assert.equal(f.audit.getSnapshot().collection, null); assert.equal(button(f, 'Collect original result').props.disabled, true);
  assert.equal(button(f, 'Finish owned role session').props.disabled, true);
  assert.equal(await f.audit.refresh(), true); assert.equal(f.audit.getSnapshot().uncertain, 'executeAudit');
  assert.equal(button(f, 'Collect original result').props.disabled, false);
  assert.equal(button(f, 'Finish owned role session').props.disabled, true);
  assert.equal(await button(f, 'Collect original result').props.onClick(), true);
  const request = sent(f, 'v1/collectAuditResult')[0], task = f.taskModel.getSnapshot().detail.task;
  assert.equal(request.payload.executionRef, row.executionRef); assert.equal(request.payload.claimRef, row.claimRef);
  assert.equal(request.payload.generationRef, row.generationRef); assert.equal(request.payload.taskRef, task.taskRef);
  assert.equal(request.payload.expectedTaskVersion, task.version); assert.equal(request.payload.expectedAuthEpoch, task.authEpoch);
  assert.equal(f.audit.getSnapshot().collection.state, 'unknown'); assert.equal(f.audit.getSnapshot().uncertain, 'collectAuditResult');
  assert.equal(sent(f, 'v1/auditFinish').length, 0, 'wire observation is never an original finish fact');
});

test('ER11 recovery does not retry create or execute and cannot replace a retained execution on later conflicting facts', async t => {
  const f = await fixture(t); unchangedRecovery(f, true); const original = f.audit.getSnapshot().execution;
  unchangedRecovery(f); f.setRecord({ ...f.record(), executionRef: R('later foreign execution') }); unchangedRecovery(f);
  assert.deepEqual(f.audit.getSnapshot().execution, original);
  assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  await f.audit.refresh(); assert.equal(await f.audit.create(), false); assert.equal(await f.audit.execute(), false);
  assert.equal(sent(f, 'v1/dispatchAudit').length, 1); assert.equal(sent(f, 'v1/executeAudit').length, 1);
});

test('ER12 historical artifact digest semantic revision and stored command remain literal without guessed current comparisons', async t => {
  const f = await fixture(t), row = { ...f.record(), semanticRevision: 0, dataDigest: R('historical artifact digest') };
  f.publishWire({ semanticRevision: 9 }); f.setRecord(row);
  assert.notEqual(row.dataDigest, f.input.digest); assert.notEqual(row.semanticRevision, f.detail().semanticRevision);
  unchangedRecovery(f, true);
  assert.equal(f.audit.getSnapshot().execution.dataDigest, row.dataDigest);
  assert.equal(f.audit.getSnapshot().execution.semanticRevision, 0);
  assert.equal(f.audit.getSnapshot().execution.commandRef, sent(f, 'v1/executeAudit')[0].payload.commandRef);
});
