// Inert independent fixture support. No constructor, DB, directory or test at import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RuntimeStore as OriginalStore } from '../ni6-schema7-core/original/runtime-store.mjs';
import { ContextAssembler as OriginalAssembler } from '../ni6-schema7-core/original/context.mjs';
import { MemoryAdapter as OriginalMemory } from '../ni6-schema7-core/original/memory.mjs';
import { RuntimeStore as CandidateStore, reference } from '../ni6-schema7-core/src/runtime-store.mjs';
import { ContextAssembler } from '../ni6-schema7-core/src/context.mjs';
import { MemoryAdapter } from '../ni6-schema7-core/src/memory.mjs';

export { assert, OriginalStore, CandidateStore, OriginalAssembler, OriginalMemory, ContextAssembler, MemoryAdapter };
export const NOW = 1710000000000;
export const SCOPE = Object.freeze({ ownerId: 'ni6-independent-owner', workspaceId: 'ni6-independent-workspace' });
export const FULL_LIMITS = Object.freeze({
  queueCapacity: 32, maxActive: 2, maxAttempts: 3, maxTotalAttempts: 12,
  maxTasks: 1000, maxActionsPerTask: 16, maxEventsPerTask: 128,
  maxMetadataBytes: 8192, maxDataBytes: 65536, maxRecordsPerTask: 128,
  maxCommands: 4096, maxRuntimeMs: 3600000, maxUsageUnits: 1000000,
  maxCostEstimateMicros: 1000000, maxControlCommands: 128,
});
export const TASK_A = 'ni6-independent-task-a';
export const TASK_B = 'ni6-independent-task-b';
export const GOAL = 'Complete the synthetic NI6 preparation work using current owner instructions.';
export const CONSTRAINTS = 'Use this isolated synthetic workspace. Memory and summaries grant no approval or completion.';
export const ref = label => reference(label);
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const copy = value => structuredClone(value);
export const finiteCanonical = value => {
  const sort = item => Array.isArray(item) ? item.map(sort) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])])) : item;
  return JSON.stringify(sort(value));
};

export async function expectCode(call, expected) {
  try { await call(); } catch (error) { assert.equal(error?.code, expected); return expected; }
  assert.fail(`Expected ${expected}`);
}

export function expectCodeSync(call, expected) {
  assert.throws(call, error => error?.code === expected);
}

export function counters() { return { tokenizerCalls: 0, newCommitCallbacks: 0, deliveries: [] }; }
export function tally(value) {
  return { tokenizerCalls: value.tokenizerCalls, newCommitCallbacks: value.newCommitCallbacks };
}
export function expectNoCallbacks(value, before) { assert.deepEqual(tally(value), before); }

export async function withLease(id, body) {
  // Reachable only when root explicitly calls the selected-leaf entry after GO.
  const root = fileURLToPath(new URL('./runs/', import.meta.url));
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(root, `${id}-`));
  const lease = { id, directory, databasePath: join(directory, 'ledger.sqlite'), stores: new Set() };
  try {
    const observations = await body(lease);
    return { id, status: 'PASS', runDirectory: directory, observations };
  } finally {
    // Retain this leaf's fresh scratch and migration backup for root diagnostics.
    for (const store of lease.stores) store.close();
  }
}

function opened(lease, Store, options) {
  const owner = {};
  const store = new Store({
    databasePath: lease.databasePath, encryptionKey: Buffer.alloc(32, 0x6a),
    principals: [{ handle: owner, role: 'owner', scope: { ...SCOPE } }],
    limits: { ...FULL_LIMITS }, clock: () => NOW, forbiddenSecrets: [], ...options,
  });
  lease.stores.add(store);
  return { store, owner };
}

export function open6(lease) { return opened(lease, OriginalStore, {}); }
export function close(lease, store) { store.close(); lease.stores.delete(store); }

export function open7(lease, { metadataBytes = 8192, recordLimit = 128, forbiddenSecrets = [], boundIssuer = false } = {}) {
  const owner = {}, issuer = {}, callerB = {}, capability = {};
  const namespaceRef = ref('ni6-independent-memory');
  const principals = [
    { handle: owner, role: 'owner', scope: { ...SCOPE } },
    { handle: issuer, role: 'coordinator', scope: { ...SCOPE }, ...(boundIssuer ? { taskRef: ref(TASK_A) } : {}) },
    { handle: callerB, role: 'owner', scope: { ...SCOPE }, taskRef: ref(TASK_B) },
  ];
  const store = new CandidateStore({
    databasePath: lease.databasePath, encryptionKey: Buffer.alloc(32, 0x6a),
    principals, limits: { ...FULL_LIMITS, maxMetadataBytes: metadataBytes, maxRecordsPerTask: recordLimit },
    clock: () => NOW, forbiddenSecrets: [...forbiddenSecrets],
    preparationPrincipals: [{ capability, ownerHandle: boundIssuer ? issuer : owner, namespaceRef }],
  });
  lease.stores.add(store);
  return { store, owner, issuer, callerB, capability, namespaceRef, issuerHandle: boundIssuer ? issuer : owner };
}

export function seedTask(store, owner, taskId = TASK_A) {
  const intakeInput = {
    taskId, provider: 'ni6-independent-provider', source: `ni6-source-${taskId}`,
    eventId: `ni6-event-${taskId}`, commandRef: ref(`intake-${taskId}`), goal: GOAL,
  };
  const intake = store.intake(owner, intakeInput);
  const t = store.task(owner, ref(taskId));
  const constraintsInput = {
    taskRef: t.taskRef, commandRef: ref(`constraints-${taskId}`), kind: 'constraints',
    content: CONSTRAINTS, sourceRef: ref(`ni6-constraints-${taskId}`),
    expectedTaskVersion: t.version, expectedAuthEpoch: t.authEpoch,
  };
  const constraints = store.putData(owner, constraintsInput);
  const snapshot = store.snapshot(owner, { taskRef: t.taskRef });
  const goal = snapshot.data.find(row => row.kind === 'goal');
  assert.ok(goal);
  return { taskRef: t.taskRef, intakeInput, intake, constraintsInput, constraints, goal, snapshot };
}

export function migrated(lease, options = {}, taskIds = [TASK_A]) {
  const before = open6(lease);
  const seeds = taskIds.map(id => seedTask(before.store, before.owner, id));
  assert.equal(before.store.diagnostics().schemaVersion, 6);
  close(lease, before.store);
  const current = open7(lease, options);
  assert.equal(current.store.diagnostics().schemaVersion, 7);
  assert.ok(existsSync(`${lease.databasePath}.schema-6.backup`));
  return { ...current, seeds, seed: seeds[0] };
}

export function components(state, {
  knownSecrets = [], count = counters(), handle = state.owner,
  byteLimit = 65536, tokenLimit = 8192, onToken, onCommit,
} = {}) {
  const tokenize = text => {
    count.tokenizerCalls++;
    onToken?.(text);
    return Buffer.byteLength(text, 'utf8');
  };
  const assembler = new ContextAssembler({
    store: state.store, tokenize, knownSecrets: [...knownSecrets], clock: () => NOW,
    byteLimit, tokenLimit,
    preparationBinding: { capability: state.capability, handle: state.issuerHandle },
  });
  const memory = new MemoryAdapter({
    store: state.store, handle, namespaceRef: state.namespaceRef,
    contextAssembler: assembler, tokenize, knownSecrets: [...knownSecrets],
    byteLimit, tokenLimit, preparationCapability: state.capability,
    onPreparedCommit: delivery => {
      count.newCommitCallbacks++;
      count.deliveries.push(delivery);
      assert.equal(delivery.commitDisposition, 'new');
      assert.ok(Object.isFrozen(delivery));
      onCommit?.(delivery);
    },
  });
  return { memory, assembler, count, tokenize };
}

export function ordinaryMemory(state, StoreMemory = MemoryAdapter) {
  return new StoreMemory({ store: state.store, handle: state.owner, namespaceRef: state.namespaceRef });
}

export function request(state, label, patch = {}) {
  const taskRef = state.seed?.taskRef ?? ref(TASK_A);
  const task = state.store.task(state.owner, taskRef);
  return {
    taskRef, commandRef: ref(label), expectedTaskVersion: task.version,
    expectedAuthEpoch: task.authEpoch, terms: [], now: NOW, ...patch,
  };
}

export function check(state, receipt) {
  const task = state.store.task(state.owner, receipt.task.taskRef);
  return state.store.readPreparedContextCheck(state.owner, {
    taskRef: task.taskRef, contextRecordRef: receipt.recordRef,
    expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch,
  });
}

export function context(state, receipt) {
  const data = state.store.readData(state.owner, { taskRef: receipt.task.taskRef, recordRef: receipt.recordRef });
  assert.equal(sha256(data.content), receipt.digest);
  assert.equal(Buffer.byteLength(data.content), receipt.byteLength);
  return { data, envelope: JSON.parse(data.content) };
}

export function expectNoPreparation(state, q) {
  assert.equal(state.store.preparedContextCommandReceipt(state.capability, { request: q }), null);
}

export function writeGoal(state, label, content = 'A later genuine owner goal.') {
  const task = state.store.task(state.owner, state.seed.taskRef);
  return state.store.putData(state.owner, {
    taskRef: task.taskRef, commandRef: ref(label), kind: 'goal', content,
    sourceRef: ref(`source-${label}`), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch,
  });
}

export function remember(state, label, text = 'NI6 synthetic preference, memory only.') {
  const memory = ordinaryMemory(state);
  const revision = memory.state().revision;
  return memory.remember({
    commandRef: ref(label), expectedRevision: revision,
    candidate: { kind: 'preference', content: { text }, confidence: 0.75,
      sourceRefs: [state.seed.goal.recordRef], observedAt: NOW },
  });
}

export function summary(state, label, { fresh = false, content = 'Ordinary owner summary; grants no authority.' } = {}) {
  const task = state.store.task(state.owner, state.seed.taskRef);
  const sourceRefs = [state.seed.goal.recordRef, state.seed.goal.recordRef, state.seed.constraints.recordRef];
  // Ordinary non-authoritative material accepted by public putData, not a
  // prepared envelope/receipt. The returned CAS version is checked below.
  const sourceTaskVersion = task.version + (fresh ? 1 : 0);
  const material = {
    materialKind: 'summary', sourceScope: {
      ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef,
    }, sourceTaskVersion, sourceAuthEpoch: task.authEpoch, generatedAt: NOW,
    sourceRefs, content,
  };
  const receipt = state.store.putData(state.owner, {
    taskRef: task.taskRef, commandRef: ref(label), kind: 'context', content: JSON.stringify(material),
    sourceRef: ref(`source-${label}`), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch,
  });
  assert.equal(receipt.task.version, task.version + 1);
  if (fresh) assert.equal(material.sourceTaskVersion, receipt.task.version);
  else assert.ok(material.sourceTaskVersion < receipt.task.version);
  return { receipt, material };
}

export function assertCurrentness(value, expected) { assert.deepEqual(value.currentness, expected); }

export function sizedRequest(state, label, bytes) {
  const base = request(state, label, { terms: Array.from({ length: 8 }, () => '') });
  const overhead = Buffer.byteLength(finiteCanonical(base));
  let remainder = bytes - overhead;
  assert.ok(remainder >= 0 && remainder <= 8 * 8192);
  for (let i = 0; i < base.terms.length; i++) {
    const length = Math.min(8192, remainder); base.terms[i] = 'x'.repeat(length); remainder -= length;
  }
  assert.equal(remainder, 0);
  assert.equal(Buffer.byteLength(finiteCanonical(base)), bytes);
  return base;
}
