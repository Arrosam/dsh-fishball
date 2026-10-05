// Independent controls-only functional fixtures. No mounted/native auth claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeStore, RuntimeError } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { BootstrapError } from '../src/config.mjs';
import { runInstalledWorkerInvocation } from '../src/installed-invocation.mjs';
import { createInstalledMemoryContinuity } from '../src/installed-memory-continuity.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const r = value => sha(`independent-controls:${value}`);
const namespaceRef = r('fixed-namespace');
const scope = { ownerId: 'independent-controls-owner', workspaceId: 'independent-controls-workspace' };
const secret = 'SYNTHETIC_CCF_PRIVATE_SECRET_CANARY';
const operationNames = ['memoryCommandStatus', 'memoryCorrect', 'memoryDeleteConfirm', 'memoryDeletePreview', 'memoryForget', 'memoryImportConfirm', 'memoryImportPreview', 'memoryStatus'];
const candidate = (text = 'Preference for short synthetic explanations', extra = {}) => ({
  kind: 'preference', content: { text }, confidence: 0.75,
  sourceRefs: [r('source-a')], observedAt: 9000, ...extra,
});
const edit = extra => ({ commandRef: r('edit'), expectedRevision: 1, id: 1,
  expectedFactRevision: 1, candidate: candidate('A corrected preference: 简短 explanations'), accept: true, ...extra });
const confirm = (preview, command = 'confirmation') => ({
  previewRef: preview.previewRef, planDigest: preview.planDigest,
  commandRef: r(command), expectedRevision: preview.expectedRevision, accept: true,
});
const rawWorld = (id = 2, answer = 'Synthetic full answer') => ({
  id, question: 'Synthetic source question', answer, ttl: 'ONE_DAY', tier: 'LOW', recordedAt: 5000,
});
const rawTurn = (id, text, at) => ({ id, sessionId: 1, speaker: 'USER', text, at });
const importRequest = extra => ({ expectedRevision: 0,
  snapshotText: JSON.stringify({ world: [rawWorld()], idSeq: 2 }),
  sourceRefs: [r('import-source')], observedAt: 10000, confidence: 0.875, ...extra });

async function denied(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.code, code); assert.equal(error.message, code);
    assert.equal(String(error).includes(secret), false);
    return true;
  });
}
function durable(path) {
  // Counts/schema only. No protected row, ciphertext or raw receipt alteration.
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const counts = Object.fromEntries(['tasks', 'actions', 'runtime_commands', 'runtime_data', 'workspace_memory']
      .map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n]));
    return { sha256: sha(readFileSync(path)), schema: db.prepare('PRAGMA user_version').get().user_version, counts };
  } finally { db.close(); }
}
function fixture(t, { storeOptions = {}, onMutation = () => undefined } = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-ccf-'));
  const path = join(directory, 'runtime.sqlite'), key = randomBytes(32);
  const owner = Object.freeze({}), coordinator = Object.freeze({}), ctx = Object.freeze({});
  const options = { databasePath: path, encryptionKey: key,
    principals: [{ handle: owner, role: 'owner', scope }, { handle: coordinator, role: 'coordinator', scope }],
    hostPermission: () => false, ...storeOptions };
  const memory = { namespaceRef, tokenize: text => Math.ceil(Buffer.byteLength(text) / 4), byteLimit: 65536, tokenLimit: 8192 };
  const events = [], facades = [];
  let store, projection, assembler, facade, time = 10000, listener = onMutation;
  function mount() {
    store = new RuntimeStore(options);
    assembler = new ContextAssembler({ store, tokenize: memory.tokenize });
    projection = new MemoryAdapter({ store, handle: coordinator, ...memory, contextAssembler: assembler, knownSecrets: [secret] });
    facade = createInstalledMemoryContinuity(inputs()); facades.push(facade);
  }
  function inputs(extra = {}) {
    return { ctx, store, ownerHandle: owner, coordinatorProjection: projection, memory,
      contextAssembler: assembler, knownSecrets: [secret],
      onMutation: async value => { events.push(value); return listener(value); }, clock: () => time, ...extra };
  }
  function guard(state) {
    if (state?.denial) throw new BootstrapError(state.denial);
    return state?.current ?? true;
  }
  const run = (callback, state, carrierCtx = ctx) => runInstalledWorkerInvocation(carrierCtx, () => guard(state), callback);
  const call = (operation, input, state) => run(() => facade.operations[operation](input), state);
  const seed = () => projection.remember({ commandRef: r('seed'), expectedRevision: 0, candidate: candidate() });
  mount();
  t.after(() => { for (const value of facades) value.dispose(); store.close(); key.fill(0); rmSync(directory, { recursive: true, force: true }); });
  return { path, owner, coordinator, ctx, memory, events, run, call, seed, inputs,
    get store() { return store; }, get projection() { return projection; }, get facade() { return facade; },
    setTime: value => { time = value; }, setListener: value => { listener = value; },
    reopen: () => { facade.dispose(); store.close(); mount(); },
    extraFacade: extra => { const value = createInstalledMemoryContinuity(inputs(extra)); facades.push(value); return value; } };
}
function delegate(x) {
  return Object.fromEntries(['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt', 'snapshot', 'task', 'readData']
    .map(name => [name, x.store[name].bind(x.store)]));
}

test('CCF01 closed controls preserve original guard precedence and refuse wire authority without writes', async t => {
  const x = fixture(t); x.seed(); const before = durable(x.path);
  assert.deepEqual(Object.keys(x.facade).sort(), ['dispose', 'operations']);
  assert.deepEqual(Object.keys(x.facade.operations).sort(), operationNames);
  assert.ok(Object.isFrozen(x.facade) && Object.isFrozen(x.facade.operations));
  let hooks = 0;
  const getter = Object.defineProperty({ ...edit() }, 'candidate', { enumerable: true, get() { hooks++; throw Error(secret); } });
  await denied(x.facade.operations.memoryCorrect(getter), 'SERVICE_DISPOSED');
  await denied(x.run(() => x.facade.operations.memoryStatus({}), undefined, Object.freeze({})), 'SERVICE_DISPOSED');
  const proxy = new Proxy(edit(), { getPrototypeOf() { hooks++; throw Error(secret); }, ownKeys() { hooks++; throw Error(secret); } });
  const hidden = Object.defineProperty(edit(), 'ownerId', { value: scope.ownerId });
  const sparse = edit({ candidate: candidate('sparse vector', { embedding: [0.5, , 0.25] }) });
  for (const value of [getter, proxy, hidden, sparse,
    edit({ scope }), edit({ accept: 'true' }), edit({ id: 1.5 }),
    edit({ expectedFactRevision: Number.MAX_SAFE_INTEGER + 1 }),
    edit({ candidate: candidate('bad confidence', { confidence: NaN }) }),
    edit({ candidate: candidate('bad vector', { embedding: [Infinity] }) })]) {
    await denied(x.call('memoryCorrect', value), 'MEMORY_INVALID');
  }
  await denied(x.call('memoryStatus', { namespaceRef: r('foreign') }), 'MEMORY_INVALID');
  await denied(x.call('memoryStatus', {}, { current: Promise.resolve(true) }), 'SERVICE_DISPOSED');
  const status = await x.call('memoryStatus', Object.create(null));
  assert.deepEqual(Object.keys(status).sort(), ['digest', 'reasonCode', 'revision', 'state', 'updatedAt']);
  assert.equal(status.state, 'live'); assert.equal(status.revision, 1);
  assert.equal(hooks, 0); assert.deepEqual(durable(x.path), before); assert.equal(x.events.length, 0);
});

test('CCF02 sourced fractional edit and historical replay after forget invalidate conservatively', async t => {
  const x = fixture(t); x.seed(); let invalidations = 0;
  x.setListener(event => { assert.ok(Object.isFrozen(event.input)); invalidations++; });
  const input = edit({ candidate: candidate('独立 corrected synthetic preference', {
    confidence: 0.9375, embedding: [0.1, -0.3], sourceRefs: [r('source-b')], observedAt: 10001,
  }) });
  const retained = structuredClone(input), pending = x.call('memoryCorrect', input);
  input.candidate.content.text = 'mutated caller text'; input.candidate.sourceRefs[0] = r('caller-mutated');
  const ack = await pending, state = x.projection.state();
  assert.deepEqual(ack.result, { id: 1, factRevision: 2, authority: 'memory_only' });
  assert.equal(state.projection.facts[0].confidence, 0.9375);
  assert.deepEqual(state.projection.facts[0].sourceRefs, retained.candidate.sourceRefs);
  assert.equal(state.projection.core.preferences[0].text, retained.candidate.content.text);
  assert.deepEqual(state.projection.core.preferences[0].embedding, [Math.fround(0.1), Math.fround(-0.3)]);
  assert.equal(readFileSync(x.path).includes(Buffer.from(retained.candidate.content.text)), false);
  const afterEdit = durable(x.path);
  await denied(x.call('memoryCorrect', { ...retained, candidate: candidate('changed same command') }), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(durable(x.path), afterEdit);
  const forgotten = await x.call('memoryForget', { commandRef: r('forget'), expectedRevision: 2,
    id: 1, expectedFactRevision: 2, accept: true });
  assert.equal(forgotten.revision, 3); assert.deepEqual(forgotten.result, { id: 1, factRevision: 3, deleted: true });
  const afterForget = durable(x.path), replay = await x.call('memoryCorrect', retained);
  assert.equal(replay.revision, 2); assert.equal(replay.recordRef, ack.recordRef); assert.equal(replay.digest, ack.digest);
  assert.equal(replay.deduplicated, true); assert.equal(Object.hasOwn(replay, 'result'), false);
  assert.equal(x.projection.state().revision, 3); assert.equal(invalidations, 3);
  assert.deepEqual(x.events[2].receipt, replay); assert.equal(x.events[2].operation, 'memoryCorrect');
  assert.equal(typeof x.store.readMemoryCommand, 'undefined');
  await denied(x.call('memoryCommandStatus', { commandRef: retained.commandRef }), 'MEMORY_UNAVAILABLE');
  await denied(x.call('memoryCommandStatus', { commandRef: r('unknown') }), 'MEMORY_UNAVAILABLE');
  assert.deepEqual(durable(x.path), afterForget);
  assert.equal(afterForget.counts.tasks, 0); assert.equal(afterForget.counts.actions, 0);
});

test('CCF03 import consent retains complete detached union and cannot be reconstructed by another instance', async t => {
  const x = fixture(t), before = durable(x.path);
  const snapshotText = JSON.stringify({ world: [rawWorld()], turns: [rawTurn(4, 'snapshot older turn', 6000)],
    session: { id: 1, startedAt: 4000 }, idSeq: 4 });
  const turnLogText = [rawTurn(4, 'log earlier revision', 7000), rawTurn(7, 'distinct new turn', 8000),
    rawTurn(4, '最新完整 turn revision', 9000)].map(value => JSON.stringify(value)).join('\n') + '\n';
  const input = importRequest({ snapshotText, turnLogText, sourceRefs: [r('source-a'), r('source-b')] });
  const retained = structuredClone(input), pending = x.call('memoryImportPreview', input);
  input.snapshotText = JSON.stringify({}); input.turnLogText = ''; input.sourceRefs[0] = r('mutated-preview');
  const preview = await pending;
  assert.deepEqual(Object.keys(preview).sort(), ['description', 'expectedRevision', 'expiresAt', 'planDigest', 'previewRef']);
  assert.match(preview.previewRef, /^[a-f0-9]{64}$/); assert.match(preview.planDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(preview.description.documentDigests, { snapshotDigest: sha(snapshotText), turnLogDigest: sha(turnLogText) });
  assert.deepEqual(preview.description.sourceRefs, retained.sourceRefs); assert.equal(preview.description.confidence, 0.875);
  assert.equal(preview.description.recordCount, 3);
  const full = preview.description.normalizedProjection;
  assert.deepEqual(full.scope, { ownerRef: sha(scope.ownerId), workspaceRef: sha(scope.workspaceId) });
  assert.deepEqual(full.core.turns.map(value => [value.id, value.text]), [[4, '最新完整 turn revision'], [7, 'distinct new turn']]);
  assert.deepEqual(full.facts.map(value => [value.id, value.observedAt]), [[2, 5000], [4, 9000], [7, 8000]]);
  assert.deepEqual(durable(x.path), before);
  const other = x.extraFacade();
  await denied(x.run(() => other.operations.memoryImportConfirm(confirm(preview))), 'MEMORY_PREVIEW_STALE');
  await denied(x.call('memoryDeleteConfirm', confirm(preview)), 'MEMORY_PREVIEW_STALE');
  await denied(x.call('memoryImportConfirm', { ...confirm(preview), accept: false }), 'MEMORY_INVALID');
  assert.deepEqual(durable(x.path), before);
  const first = x.call('memoryImportConfirm', confirm(preview)), second = x.call('memoryImportConfirm', confirm(preview));
  await denied(second, 'MEMORY_PREVIEW_BUSY'); const receipt = await first;
  assert.equal(receipt.revision, 1); assert.deepEqual(receipt.result, { imported: 3, authority: 'memory_only' });
  assert.deepEqual(x.projection.state().projection, full); assert.equal(x.events.length, 1);
  assert.equal(x.events[0].input.accept, true); assert.equal(durable(x.path).counts.runtime_commands, 1);
  await denied(x.call('memoryImportConfirm', confirm(preview)), 'MEMORY_PREVIEW_STALE');
});

test('CCF04 import and delete previews share15/16/17 pending capacity and release only the denied slot', async t => {
  const x = fixture(t);
  const oldImport = await x.call('memoryImportPreview', importRequest()); x.seed();
  const before = durable(x.path), readyDeletes = [];
  for (let i = 0; i < 14; i++) readyDeletes.push(await x.call('memoryDeletePreview', { expectedRevision: 1 }));
  assert.equal(new Set([oldImport.previewRef, ...readyDeletes.map(value => value.previewRef)]).size, 15);
  const guard = { current: true }, pending = x.call('memoryDeletePreview', { expectedRevision: 1 }, guard);
  const seventeenth = x.call('memoryImportPreview', importRequest());
  guard.denial = 'REQUEST_ABORTED';
  await denied(seventeenth, 'MEMORY_PREVIEW_CAPACITY'); await denied(pending, 'REQUEST_ABORTED');
  const replacement = await x.call('memoryDeletePreview', { expectedRevision: 1 });
  assert.match(replacement.previewRef, /^[a-f0-9]{64}$/);
  await denied(x.call('memoryDeletePreview', { expectedRevision: 1 }), 'MEMORY_PREVIEW_CAPACITY');
  x.setTime(70000);
  const afterExpiry = await x.call('memoryDeletePreview', { expectedRevision: 1 });
  assert.notEqual(afterExpiry.previewRef, replacement.previewRef);
  await denied(x.call('memoryDeleteConfirm', confirm(replacement)), 'MEMORY_PREVIEW_STALE');
  assert.deepEqual(durable(x.path), before); assert.equal(x.events.length, 0);
});

test('CCF05 exact expiry and recovered rollback do not restore old consent', async t => {
  for (const [time, succeeds] of [[69999, true], [70000, false], [70001, false]]) {
    await t.test(`expiry relative millisecond ${time - 70000}`, async t => {
      const x = fixture(t); x.seed(); const preview = await x.call('memoryDeletePreview', { expectedRevision: 1 });
      assert.equal(preview.expiresAt, 70000); const before = durable(x.path); x.setTime(time);
      if (succeeds) { const receipt = await x.call('memoryDeleteConfirm', confirm(preview)); assert.equal(receipt.deleted, true); assert.equal(receipt.revision, 2); }
      else { await denied(x.call('memoryDeleteConfirm', confirm(preview)), 'MEMORY_PREVIEW_STALE'); assert.deepEqual(durable(x.path), before); }
      assert.equal(x.events.length, succeeds ? 1 : 0);
    });
  }
  await t.test('rollback then recovery', async t => {
    const x = fixture(t); x.seed(); const preview = await x.call('memoryDeletePreview', { expectedRevision: 1 }), before = durable(x.path);
    x.setTime(9999); await denied(x.call('memoryDeleteConfirm', confirm(preview)), 'MEMORY_PREVIEW_STALE');
    x.setTime(10000); await denied(x.call('memoryDeleteConfirm', confirm(preview)), 'MEMORY_PREVIEW_STALE');
    assert.deepEqual(durable(x.path), before); assert.equal(x.events.length, 0);
  });
});

test('CCF06 before-commit refusal and lost postcommit acknowledgement preserve distinct accountable facts', async t => {
  let cut = false;
  const failed = fixture(t, { storeOptions: { fixtureMode: true, fixtureFaults: point => {
    if (cut && point === 'before_commit') throw Error(secret);
  } } });
  const refused = await failed.call('memoryImportPreview', importRequest()), before = durable(failed.path); cut = true;
  await denied(failed.call('memoryImportConfirm', confirm(refused, 'precommit')), 'MEMORY_UNAVAILABLE');
  cut = false; assert.deepEqual(durable(failed.path), before); assert.equal(failed.events.length, 0);
  await denied(failed.call('memoryImportConfirm', confirm(refused, 'precommit')), 'MEMORY_PREVIEW_STALE');
  failed.reopen(); assert.equal((await failed.call('memoryStatus', {})).state, 'absent');
  assert.equal(durable(failed.path).counts.runtime_commands, 0);

  const committed = fixture(t, { onMutation: () => { throw new RuntimeError('IDEMPOTENCY_CONFLICT'); } });
  const accepted = await committed.call('memoryImportPreview', importRequest());
  await denied(committed.call('memoryImportConfirm', confirm(accepted, 'lost-ack')), 'MEMORY_UNCERTAIN');
  assert.equal(committed.events.length, 1); const durableAck = committed.events[0].receipt;
  const signed = committed.store.memoryCommandReceipt(committed.owner, {
    namespaceRef, commandRef: r('lost-ack'), requestDigest: durableAck.requestDigest,
  });
  assert.equal(signed.revision, 1); assert.equal(signed.recordRef, durableAck.recordRef); assert.equal(signed.digest, durableAck.digest);
  assert.equal(Object.hasOwn(signed, 'result'), false); assert.equal(durable(committed.path).counts.runtime_commands, 1);
  const current = durable(committed.path);
  await denied(committed.call('memoryImportConfirm', confirm(accepted, 'lost-ack')), 'MEMORY_PREVIEW_STALE');
  assert.deepEqual(durable(committed.path), current);
  committed.reopen(); committed.setListener(() => assert.fail('reopen must not replay invalidation'));
  assert.equal((await committed.call('memoryStatus', {})).state, 'live');
  assert.deepEqual(committed.projection.state().projection, accepted.description.normalizedProjection);
  await denied(committed.call('memoryImportPreview', importRequest()), 'MEMORY_CONFLICT');
  assert.equal(committed.events.length, 1); assert.deepEqual(durable(committed.path), current);
});

test('CCF07 independent invocation denial and own disposal preserve a committed permanent namespace tombstone', async t => {
  const x = fixture(t); x.seed(); let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  x.setListener(() => { entered(); return new Promise(resolve => { release = resolve; }); });
  const privateGuard = { current: true }, first = x.call('memoryCorrect', edit(), privateGuard);
  await enteredPromise;
  assert.equal((await x.call('memoryStatus', {})).revision, 2);
  privateGuard.denial = 'OPERATOR_REQUIRED'; release(); await denied(first, 'OPERATOR_REQUIRED');
  assert.equal(x.projection.state().revision, 2); assert.equal(x.events.length, 1);
  x.setListener(() => undefined);
  const preview = await x.call('memoryDeletePreview', { expectedRevision: 2 });
  assert.deepEqual(preview.description, { operation: 'memory_delete', destination: 'current private memory',
    revision: 2, digest: x.store.getMemory(x.owner, { namespaceRef }).digest,
    consequence: 'permanent_namespace_tombstone', scope: 'local_live_memory_only',
    exclusions: ['task_contexts', 'native_logs', 'exports', 'backups', 'third_party_copies'] });
  assert.throws(() => x.projection.deleteNamespace({ commandRef: r('coordinator-delete'), expectedRevision: 2 }), { code: 'UNAUTHORIZED' });
  const receipt = await x.call('memoryDeleteConfirm', confirm(preview, 'permanent-delete'));
  assert.equal(receipt.revision, 3); assert.equal(receipt.deleted, true); assert.equal(Object.hasOwn(receipt, 'result'), false);
  const borrowed = x.facade.operations; x.facade.dispose();
  await denied(x.run(() => borrowed.memoryStatus({})), 'SERVICE_DISPOSED');
  x.reopen();
  const status = await x.call('memoryStatus', {});
  assert.deepEqual(status, { state: 'deleted', revision: 3, digest: receipt.digest, updatedAt: receipt.updatedAt, reasonCode: 'MEMORY_DELETED' });
  const before = durable(x.path);
  await denied(x.call('memoryImportPreview', importRequest()), 'MEMORY_CONFLICT');
  await denied(x.call('memoryDeletePreview', { expectedRevision: 3 }), 'MEMORY_DELETED');
  await denied(x.call('memoryCorrect', edit({ commandRef: r('after-delete'), expectedRevision: 3 })), 'MEMORY_DELETED');
  assert.throws(() => x.projection.remember({ commandRef: r('reset-denied'), expectedRevision: 3, candidate: candidate() }), { code: 'MEMORY_DELETED' });
  await denied(x.run(() => borrowed.memoryStatus({})), 'SERVICE_DISPOSED');
  assert.deepEqual(durable(x.path), before); assert.equal(x.events.length, 2);
  assert.equal(before.counts.tasks, 0); assert.equal(before.counts.actions, 0); assert.equal(before.counts.runtime_data, 0);
});

test('CCF08 TYPED history seam validates old receipt facts but cannot establish schema5 durable history support', async t => {
  const x = fixture(t); x.seed(); const first = await x.call('memoryCorrect', edit());
  const historical = x.store.memoryCommandReceipt(x.owner, { namespaceRef, commandRef: r('edit'), requestDigest: first.requestDigest });
  await x.call('memoryForget', { commandRef: r('history-forget'), expectedRevision: 2, id: 1, expectedFactRevision: 2, accept: true });
  assert.equal(x.projection.state().revision, 3); assert.equal(historical.revision, 2);
  const fakeFutureStore = delegate(x); let response = historical, hooks = 0, calls = 0;
  // Typed seam only. The product schema5 store has NO readMemoryCommand method.
  fakeFutureStore.readMemoryCommand = (handle, input) => {
    calls++; assert.equal(handle, x.owner); assert.deepEqual(Object.keys(input).sort(), ['commandRef', 'namespaceRef']);
    assert.equal(input.namespaceRef, namespaceRef); return response;
  };
  const facade = x.extraFacade({ store: fakeFutureStore });
  const call = () => x.run(() => facade.operations.memoryCommandStatus({ commandRef: r('edit') }));
  const before = durable(x.path), observed = await call();
  assert.deepEqual(observed, { state: 'observed', receipt: historical });
  assert.equal(observed.receipt.revision, 2); assert.equal(Object.hasOwn(observed.receipt, 'result'), false);
  response = null; assert.deepEqual(await call(), { state: 'not_observed', receipt: null });
  response = { ...historical, ownerRef: r('foreign-owner') }; await denied(call(), 'MEMORY_SCOPE');
  response = Object.defineProperty({ ...historical }, 'revision', { enumerable: true, get() { hooks++; throw Error(secret); } });
  await denied(call(), 'STORAGE_INVALID');
  response = new Proxy(historical, { getPrototypeOf() { hooks++; throw Error(secret); } });
  await denied(call(), 'STORAGE_INVALID');
  fakeFutureStore.readMemoryCommand = () => { throw Object.defineProperty(Error(secret), 'code', { get() { hooks++; return 'IDEMPOTENCY_CONFLICT'; } }); };
  await denied(call(), 'MEMORY_UNAVAILABLE');
  assert.equal(hooks, 0); assert.equal(calls, 5); assert.deepEqual(durable(x.path), before);
  assert.equal(typeof x.store.readMemoryCommand, 'undefined');
  await denied(x.call('memoryCommandStatus', { commandRef: r('edit') }), 'MEMORY_UNAVAILABLE');
  assert.deepEqual(durable(x.path), before); assert.equal(x.events.length, 2);
});
