import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const factory = require('../../ni3-native-runtime/src/client-entry.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
export const CLIENT_TIME = 1800000000000;
const clone = value => structuredClone(value);

// C cases only. This explicit UI wire records a static element tree, maps
// external-store reads to the supplied typed task/worker wires, and does not
// execute event handlers or effects. It is not React, DOM or browser evidence.
const uiWire = Object.freeze({
  Fragment: Symbol('NRI-C-fragment-wire'),
  createElement(type, props, ...children) { return { type, props: props ?? {}, children }; },
  useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; },
  useEffect() {},
});
const client = factory(name => {
  assert.equal(name, 'react');
  return uiWire;
});

export function elements(tree) {
  const out = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'type')) out.push(node);
    if (node.children) visit(node.children);
  };
  visit(tree);
  return out;
}
export function textOf(tree) {
  if (Array.isArray(tree)) return tree.map(textOf).join('');
  if (tree === null || tree === undefined || tree === false) return '';
  if (typeof tree !== 'object') return String(tree);
  return textOf(tree.children ?? []);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function createClientFixture(id, {
  enabled = true, candidateCount = 1, dispatch = 'success', execute = 'lost',
  query = 'success', queryForeignGeneration = false, captured = true,
} = {}) {
  const ref = label => sha(`${id}\u0000${label}`);
  const ids = Object.freeze(Object.fromEntries([
    'taskRef', 'contextRecordRef', 'contextDigest', 'artifactRef', 'artifactRecordRef',
    'artifactDigest', 'auditRef', 'inputRecordRef', 'inputDigest', 'actionRef',
    'actionDigest', 'claimRef', 'reservationRef', 'generationRef', 'sessionRef',
    'previewRef', 'executionRef', 'foreignGenerationRef',
  ].map(key => [key, ref(key)])));
  const task = { taskRef: ids.taskRef, status: 'running', version: 1, authEpoch: 0, updatedAt: CLIENT_TIME };
  const requirement = { auditRef: ids.auditRef, auditRevision: 1, round: 0, state: 'required',
    artifactRef: ids.artifactRef, artifactVersion: 1, digest: ids.artifactDigest,
    blockingSeverities: ['blocking', 'fatal'], maxRepairRounds: 1, material: [] };
  const input = { recordRef: ids.inputRecordRef, digest: ids.inputDigest, auditRef: ids.auditRef, purpose: 'audit_review' };
  const action = { actionRef: ids.actionRef, actionDigest: ids.actionDigest };
  const worker = { taskRef: ids.taskRef, actionRef: ids.actionRef, actionDigest: ids.actionDigest,
    claimRef: ids.claimRef, reservationRef: ids.reservationRef, generationRef: ids.generationRef,
    sessionRef: ids.sessionRef, phase: 'ready' };
  const capture = { artifactRef: ids.artifactRef, version: 1, recordRef: ids.artifactRecordRef, digest: ids.artifactDigest };
  let taskState = { phase: 'ready', stale: false, busy: false, error: null, updatedAt: CLIENT_TIME,
    tasks: [task], selected: ids.taskRef, records: [], previews: {}, receipts: [],
    automation: null, automationStale: true, automationBusy: false,
    detail: { task, control: 'active', data: [{ recordRef: ids.contextRecordRef, digest: ids.contextDigest, kind: 'context' }],
      workers: [], actions: [], audits: [], artifacts: [], deliveries: [] } };
  const listeners = new Set(), calls = [], pending = new Map();
  let refreshes = 0, commands = 0;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const taskModel = Object.freeze({
    getSnapshot: () => taskState,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async refresh() { refreshes++; assert.ok(refreshes <= 8); emit(); },
    questions: () => [],
    now: () => CLIENT_TIME,
  });
  const workerState = { phase: 'ready', busy: null, stale: false, error: null,
    status: { enabled: true, phase: 'ready', reasonCode: null, actionsEnabled: true,
      policyVersion: 2, selection: { provider: 'df-testing-local', model: 'df-testing-worker-v1',
        agentPreset: 'nri-empty', reasoningEffort: 'deterministic', maxOutputTokens: 4096 },
      persistence: { directory: '/synthetic/nri/df-sessions', compression: 'none' },
      bounds: { requestBytes: 32768, resultBytes: 4096 }, pricing: 'source_zero',
      accounting: 'df-testing-utf8-byte-units/v1' },
    capture: captured ? capture : null, contextRecordRef: captured ? ids.contextRecordRef : null,
    action: null, worker: null, execution: null, result: null, catalog: null,
    policyPreview: null, actionPreview: null, confirmedPolicy: null, uncertain: null };
  const workerModel = Object.freeze({ getSnapshot: () => workerState, subscribe: () => () => {}, now: () => CLIENT_TIME,
    canConfirmPolicy: () => false, canGrant: () => false, canCreate: () => false });
  const reply = value => ({ ok: true, value: clone(value) });
  const candidateRows = () => Array.from({ length: candidateCount }, (_, index) => ({
    ...worker, phase: 'submitted',
    ...(index === 0 ? {} : Object.fromEntries(['claimRef', 'reservationRef', 'generationRef', 'sessionRef'].map(key => [key, ref(`candidate-${index}-${key}`)]))),
  }));
  function wait(name, signal, value) {
    assert.equal(pending.has(name), false);
    const item = deferred(); pending.set(name, { ...item, signal, value });
    return item.promise;
  }
  const rpc = Object.freeze({
    async call(channel, endpoint, payload, signal) {
      assert.ok(signal instanceof AbortSignal);
      assert.match(endpoint, /^v1\/[a-zA-Z]+$/);
      const name = endpoint.slice(3);
      calls.push({ channel, name, payload: clone(payload), signal });
      assert.ok(calls.length <= 9);
      assert.equal(channel, name === 'auditStatus' ? '/df-setup' : '/df-rpc');
      switch (name) {
        case 'auditStatus': assert.deepEqual(payload, {}); return reply({ enabled, ready: enabled, reason: null,
          bounds: enabled ? { inputByteLimit: 16384, resultByteLimit: 4096, maxPrivateReviewers: 1, maxRepairRounds: 1 } : null });
        case 'configureAudit': taskState.detail.audits = [requirement]; return reply(requirement);
        case 'prepareAuditInput': assert.equal(payload.purpose, 'audit_review'); return reply(input);
        case 'planAuditAction': return reply(action);
        case 'auditPreview': return reply({ previewRef: ids.previewRef, taskVersion: task.version,
          authEpoch: task.authEpoch, expiresAt: CLIENT_TIME + 30000, actionDigest: ids.actionDigest,
          description: { data: { digest: ids.inputDigest, content: 'Typed client wire audit input.' } } });
        case 'auditGrant': assert.equal(payload.accept, true); return reply({});
        case 'dispatchAudit':
          taskState.detail.workers = candidateRows();
          if (dispatch === 'pending') return wait(name, signal, reply({ worker }));
          if (dispatch === 'lost') throw Error('RESULT_UNCONFIRMED');
          return reply({ worker });
        case 'executeAudit':
          if (execute === 'pending') return wait(name, signal, reply({ executionRef: ids.executionRef, state: 'committed' }));
          if (execute === 'lost') throw Error('RESULT_UNCONFIRMED');
          return reply({ executionRef: ids.executionRef, state: 'committed' });
        case 'auditQuery': {
          assert.deepEqual(Object.keys(payload).sort(), ['actionRef', 'claimRef', 'generationRef', 'taskRef']);
          assert.deepEqual(payload, { taskRef: ids.taskRef, actionRef: ids.actionRef, claimRef: ids.claimRef, generationRef: ids.generationRef });
          const value = reply({ worker: { ...worker, phase: 'unknown', ...(queryForeignGeneration ? { generationRef: ids.foreignGenerationRef } : {}) } });
          return query === 'pending' ? wait(name, signal, value) : value;
        }
        default: assert.fail(`Unexpected C wire operation ${name}`);
      }
    },
  });
  const audit = client.createAuditModel(rpc, taskModel, workerModel, {
    clock: () => CLIENT_TIME, uuid: () => `${id}-command-${++commands}`, digest: async value => sha(value),
  });
  async function planned() {
    assert.equal(await audit.refresh(), true);
    assert.equal(await audit.configure(), true);
    assert.equal(await audit.prepare('audit_review'), true);
    assert.equal(await audit.plan(), true);
    assert.equal(await audit.preview(), true);
    audit.setAccepted(true);
    assert.equal(audit.getSnapshot().accepted, true);
    assert.equal(await audit.grant(CLIENT_TIME + 20000), true);
  }
  return Object.freeze({ ids, audit, taskModel, workerModel, calls, planned,
    get refreshes() { return refreshes; },
    pending(name) { const item = pending.get(name); assert.ok(item); return item; },
    async whenPending(name) { for (let turn = 0; turn < 8; turn++) { if (pending.has(name)) return pending.get(name); await Promise.resolve(); } assert.fail(`C wire did not reach ${name}`); },
    settle(name, rejection = false) { const item = pending.get(name); assert.ok(item); pending.delete(name);
      if (rejection) item.reject(Error('RESULT_UNCONFIRMED')); else item.resolve(item.value); },
    replaceTask() {
      const other = { ...task, taskRef: ref('new-task') };
      taskState = { ...taskState, tasks: [other], selected: other.taskRef,
        detail: { ...taskState.detail, task: other, workers: [], audits: [] } }; emit(); return other;
    },
    panel() { return client.Panel({ model: taskModel, workerModel, auditModel: audit }); },
    dispose() { audit.dispose(); assert.equal(listeners.size, 0); },
  });
}
