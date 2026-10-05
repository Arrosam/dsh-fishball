import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { RuntimeStore, RuntimeError, reference } from '../src/runtime-store.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { BootstrapError } from '../src/config.mjs';
import { runInstalledWorkerInvocation } from '../src/installed-invocation.mjs';
import { createInstalledMemoryContinuity } from '../src/installed-memory-continuity.mjs';

const scope = { ownerId: 'synthetic-continuity-owner', workspaceId: 'synthetic-continuity-workspace' };
const namespaceRef = reference('synthetic-continuity-namespace');
const hash = value => createHash('sha256').update(value).digest('hex');
const r = n => reference(`continuity-${n}`);
const candidate = (text = 'language preference English', more = {}) => ({ kind: 'preference', content: { text }, confidence: 0.9, sourceRefs: [r('source')], observedAt: 1000, ...more });
const remember = (command = 'seed') => ({ commandRef: r(command), expectedRevision: 0, candidate: candidate() });
const corrected = more => ({ commandRef: r('correct'), expectedRevision: 1, id: 1, expectedFactRevision: 1, candidate: candidate('language preference French'), accept: true, ...more });
const forgotten = more => ({ commandRef: r('forget'), expectedRevision: 1, id: 1, expectedFactRevision: 1, accept: true, ...more });
const rawWorld = (id = 1, answer = 'synthetic answer') => ({ id, question: 'synthetic question', answer, ttl: 'ONE_DAY', tier: 'LOW', recordedAt: 800 });
const rawTurn = (id = 2, text = 'synthetic turn') => ({ id, sessionId: 1, at: 900, speaker: 'USER', text });
const importing = more => ({ expectedRevision: 0, snapshotText: JSON.stringify({ world: [rawWorld()], idSeq: 1 }), sourceRefs: [r('source')], observedAt: 1000, confidence: 0.9, ...more });
const confirming = (preview, more = {}) => ({ previewRef: preview.previewRef, planDigest: preview.planDigest, expectedRevision: preview.expectedRevision, commandRef: r('confirm'), accept: true, ...more });
const rejects = async (promise, expected) => assert.rejects(promise, error => error.code === expected && error.message === expected && !error.message.includes('SYNTHETIC_PRIVATE_CANARY'));

function fixture(t, overrides = {}, storageOverrides = {}) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'df-continuity-'));
  const owner = Object.freeze({}), coordinator = Object.freeze({}), ctx = Object.freeze({});
  const key = randomBytes(32), databasePath = join(directory, 'runtime.sqlite');
  const principals = [{ handle: owner, role: 'owner', scope }, { handle: coordinator, role: 'coordinator', scope }];
  const storeOptions = { databasePath, encryptionKey: key, principals, hostPermission: () => false, ...storageOverrides };
  let store = new RuntimeStore(storeOptions), time = 1000, denial = null, fanout = [], listener = () => undefined;
  const tokenize = text => Math.ceil(text.length / 4) + 4;
  const assembler = new ContextAssembler({ store, tokenize });
  const projection = new MemoryAdapter({ store, handle: coordinator, namespaceRef, contextAssembler: assembler, tokenize, knownSecrets: ['SYNTHETIC_PRIVATE_CANARY'] });
  const input = { ctx, store, ownerHandle: owner, coordinatorProjection: projection, contextAssembler: assembler, memory: { namespaceRef, tokenize, byteLimit: 65536, tokenLimit: 8192 }, knownSecrets: ['SYNTHETIC_PRIVATE_CANARY'], onMutation: async event => { fanout.push(event); return listener(event); }, clock: () => time, ...overrides };
  const facade = createInstalledMemoryContinuity(input);
  const run = callback => runInstalledWorkerInvocation(ctx, () => { if (denial) throw new BootstrapError(denial); return true; }, callback);
  const call = (operation, input) => run(() => facade.operations[operation](input));
  t.after(() => { facade.dispose(); store.close(); key.fill(0); rmSync(directory, { recursive: true, force: true }); });
  return { directory, databasePath, store, projection, owner, coordinator, ctx, facade, input, call, run, fanout, seed: () => projection.remember(remember()), setTime: value => { time = value; }, deny: value => { denial = value; }, listener: value => { listener = value; }, reopen: () => { store.close(); store = new RuntimeStore(storeOptions); return store; } };
}

test('exact factory and eight closures expose no store, key, adapter or consent authority', async t => {
  const x = fixture(t);
  assert.deepEqual(Object.keys(x.facade).sort(), ['dispose', 'operations']);
  assert.deepEqual(Object.keys(x.facade.operations).sort(), ['memoryCommandStatus', 'memoryCorrect', 'memoryDeleteConfirm', 'memoryDeletePreview', 'memoryForget', 'memoryImportConfirm', 'memoryImportPreview', 'memoryStatus']);
  assert.ok(Object.isFrozen(x.facade) && Object.isFrozen(x.facade.operations));
  for (const field of Object.keys(x.input)) { const invalid = { ...x.input }; delete invalid[field]; assert.throws(() => createInstalledMemoryContinuity(invalid), { code: 'MEMORY_INVALID' }); }
  assert.throws(() => createInstalledMemoryContinuity({ ...x.input, proof: true }), { code: 'MEMORY_INVALID' });
  assert.throws(() => createInstalledMemoryContinuity({ ...x.input, ownerHandle: x.coordinator }), { code: 'MEMORY_SCOPE' });
  assert.throws(() => createInstalledMemoryContinuity({ ...x.input, memory: { ...x.input.memory, namespace: 'other' } }), { code: 'MEMORY_INVALID' });
  let accessed = 0;
  assert.throws(() => createInstalledMemoryContinuity({ ...x.input, store: Object.defineProperty({}, 'memoryBinding', { get() { accessed++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }) }), { code: 'MEMORY_INVALID' }); assert.equal(accessed, 0);
  for (const field of ['coordinatorProjection', 'contextAssembler']) assert.throws(() => createInstalledMemoryContinuity({ ...x.input, [field]: new Proxy(x.input[field], { getPrototypeOf() { accessed++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }) }), { code: 'MEMORY_INVALID' }); assert.equal(accessed, 0);
  const nullOptions = Object.assign(Object.create(null), x.input), copy = createInstalledMemoryContinuity(nullOptions); copy.dispose();
  await rejects(x.facade.operations.memoryStatus({}), 'SERVICE_DISPOSED');
  assert.deepEqual(await x.call('memoryStatus', {}), { state: 'absent', revision: 0, digest: null, updatedAt: null, reasonCode: null });
});

test('actual encrypted correction retains confidence/vector provenance and exact acknowledgement', async t => {
  const x = fixture(t); x.seed(); const input = corrected({ candidate: candidate('language preference French', { embedding: [0.1, 0.2], sourceRefs: [r('new-source')], observedAt: 1200 }) });
  const ack = await x.call('memoryCorrect', input);
  assert.deepEqual(ack.result, { id: 1, factRevision: 2, authority: 'memory_only' });
  assert.equal(ack.revision, 2); assert.equal(ack.namespaceRef, namespaceRef); assert.equal(ack.cryptoVersion, 2);
  assert.ok(Object.isFrozen(ack) && Object.isFrozen(ack.result) && Object.isFrozen(x.fanout[0].input.candidate));
  const state = x.projection.state(); assert.equal(state.projection.facts[0].confidence, 0.9); assert.deepEqual(state.projection.facts[0].sourceRefs, [r('new-source')]);
  assert.equal(state.projection.core.preferences[0].embedding[0], Math.fround(0.1));
  assert.equal(JSON.stringify(state).includes('English'), false);
  assert.equal(readFileSync(x.databasePath).includes(Buffer.from('language preference French')), false);
  const status = await x.call('memoryStatus', {}); assert.equal(status.state, 'live'); assert.equal(status.revision, 2); assert.equal(Object.hasOwn(status, 'content'), false);
  assert.equal(x.fanout.length, 1); assert.equal(x.fanout[0].operation, 'memoryCorrect');
});

test('historical correction replay preserves original variant and clears volatile preparation again', async t => {
  const x = fixture(t); x.seed(); const input = corrected(); const first = await x.call('memoryCorrect', input), second = await x.call('memoryCorrect', input);
  assert.equal(second.deduplicated, true); assert.equal(Object.hasOwn(second, 'result'), false); assert.equal(second.recordRef, first.recordRef); assert.equal(second.revision, 2);
  assert.equal(x.fanout.length, 2); assert.equal(x.fanout[1].receipt.deduplicated, true); assert.equal(x.projection.state().revision, 2);
  await rejects(x.call('memoryCorrect', corrected({ candidate: candidate('different content') })), 'IDEMPOTENCY_CONFLICT'); assert.equal(x.fanout.length, 2);
});

test('namespace and fact CAS, same-kind and domain refusals never change actual store', async t => {
  const x = fixture(t); x.seed();
  let index = 0;
  for (const [change, code] of [[{ expectedRevision: 0 }, 'STALE_MEMORY'], [{ expectedFactRevision: 2 }, 'MEMORY_CONFLICT'], [{ candidate: { ...candidate(), kind: 'world', content: { question: 'question', answer: 'answer' } } }, 'MEMORY_CONFLICT'], [{ candidate: candidate('value', { confidence: 1.1 }) }, 'MEMORY_INVALID'], [{ id: 1.5 }, 'MEMORY_INVALID'], [{ expectedRevision: 1.5 }, 'MEMORY_INVALID'], [{ accept: false }, 'MEMORY_INVALID']]) {
    await rejects(x.call('memoryCorrect', corrected({ commandRef: r(`domain-${index++}`), ...change })), code);
  }
  assert.equal(x.projection.state().revision, 1); assert.equal(x.fanout.length, 0);
});

test('forget creates fact tombstone, removes old retrievable text, and survives reopen', async t => {
  const x = fixture(t); x.seed(); const ack = await x.call('memoryForget', forgotten());
  assert.deepEqual(ack.result, { id: 1, factRevision: 2, deleted: true });
  assert.equal(x.projection.state().projection.facts[0].deleted, true); assert.equal(JSON.stringify(x.projection.state()).includes('English'), false);
  const reopened = x.reopen(); const view = new MemoryAdapter({ store: reopened, handle: x.coordinator, namespaceRef }); assert.equal(view.state().projection.facts[0].deleted, true);
  assert.equal(view.remember({ ...remember('next-id'), expectedRevision: 2 }).result.id, 2);
});

test('owner-only deletion is explicit permanent namespace tombstone and authenticated status', async t => {
  const x = fixture(t); x.seed();
  assert.throws(() => x.projection.deleteNamespace({ commandRef: r('not-owner'), expectedRevision: 1 }), { code: 'UNAUTHORIZED' });
  const preview = await x.call('memoryDeletePreview', { expectedRevision: 1 });
  assert.equal(preview.description.consequence, 'permanent_namespace_tombstone'); assert.deepEqual(preview.description.exclusions, ['task_contexts', 'native_logs', 'exports', 'backups', 'third_party_copies']);
  const ack = await x.call('memoryDeleteConfirm', confirming(preview)); assert.equal(ack.deleted, true); assert.equal(ack.revision, 2); assert.equal(Object.hasOwn(ack, 'result'), false);
  const status = await x.call('memoryStatus', {}); assert.equal(status.state, 'deleted'); assert.equal(status.reasonCode, 'MEMORY_DELETED'); assert.equal(status.digest, ack.digest);
  await rejects(x.call('memoryImportPreview', importing()), 'MEMORY_CONFLICT');
  await rejects(x.call('memoryDeletePreview', { expectedRevision: 2 }), 'MEMORY_DELETED');
  assert.throws(() => x.projection.remember({ ...remember('no-reset'), expectedRevision: 2 }), { code: 'MEMORY_DELETED' });
  const reopened = x.reopen(); assert.equal(reopened.getMemory(x.owner, { namespaceRef }).deleted, true);
});

test('full pinned snapshot/log union preview is readonly and matches actual confirmed projection', async t => {
  const x = fixture(t);
  const snapshotText = JSON.stringify({ world: [rawWorld()], turns: [rawTurn(2, 'old turn')], idSeq: 2, session: { id: 1, startedAt: 700 } });
  const turnLogText = [rawTurn(2, 'new turn'), rawTurn(3, 'later turn')].map(JSON.stringify).join('\n') + '\n';
  const preview = await x.call('memoryImportPreview', importing({ snapshotText, turnLogText }));
  assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null); assert.equal(preview.description.recordCount, 3);
  assert.equal(preview.description.normalizedProjection.core.turns[0].text, 'new turn'); assert.equal(preview.description.normalizedProjection.facts[0].observedAt, 800);
  assert.equal(preview.description.documentDigests.snapshotDigest, hash(snapshotText)); assert.equal(preview.description.documentDigests.turnLogDigest, hash(turnLogText));
  const ack = await x.call('memoryImportConfirm', confirming(preview)); assert.deepEqual(ack.result, { imported: 3, authority: 'memory_only' });
  assert.deepEqual(x.projection.state().projection, preview.description.normalizedProjection); assert.equal(x.fanout.length, 1);
  await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_STALE');
});

test('parser errors, empty/native/future documents, cross-kind IDs and secret failures have bounded codes', async t => {
  const x = fixture(t);
  for (const [input, expected] of [[importing({ snapshotText: '{}' }), 'MEMORY_IMPORT_EMPTY'], [importing({ snapshotText: '{' }), 'MEMORY_IMPORT_FORMAT'], [importing({ snapshotText: JSON.stringify({ contractVersion: 'df.memory-projection/v1', core: {} }) }), 'MEMORY_IMPORT_FORMAT'], [importing({ snapshotText: JSON.stringify({ future: true }) }), 'MEMORY_IMPORT_FORMAT'], [importing({ snapshotText: undefined }), 'MEMORY_INVALID'], [importing({ snapshotText: '', turnLogText: '' }), 'MEMORY_IMPORT_EMPTY'], [importing({ turnLogText: JSON.stringify(rawTurn(1)) }), 'MEMORY_IMPORT_FORMAT'], [importing({ turnLogText: JSON.stringify(rawTurn()) + '\n{' }), 'MEMORY_IMPORT_FORMAT'], [importing({ snapshotText: JSON.stringify({ world: [rawWorld(1, 'SYNTHETIC_PRIVATE_CANARY')], idSeq: 1 }) }), 'SECRET_REJECTED']]) await rejects(x.call('memoryImportPreview', input), expected);
  assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null); assert.equal(x.fanout.length, 0);
});

test('readonly import rejects empty live projection as distinct from true absence', async t => {
  const x = fixture(t); x.seed(); await x.call('memoryForget', forgotten());
  await rejects(x.call('memoryImportPreview', importing()), 'MEMORY_CONFLICT'); assert.equal(x.projection.state().revision, 2);
});

test('raw document 49151/49152/49153 byte boundary with complete escaping-aware response', async t => {
  const x = fixture(t); const prefix = JSON.stringify({ world: [rawWorld(1, '')], idSeq: 1 });
  for (const bytes of [49151, 49152]) { const text = JSON.stringify({ world: [rawWorld(1, 'a'.repeat(bytes - Buffer.byteLength(prefix)))], idSeq: 1 }); assert.equal(Buffer.byteLength(text), bytes); const preview = await x.call('memoryImportPreview', importing({ snapshotText: text })); assert.equal(preview.description.normalizedProjection.core.world[0].answer.length, bytes - Buffer.byteLength(prefix)); }
  await rejects(x.call('memoryImportPreview', importing({ snapshotText: JSON.stringify({ world: [rawWorld(1, 'a'.repeat(49153 - Buffer.byteLength(prefix)))], idSeq: 1 }) })), 'MEMORY_LIMIT');
  const large = importing({ snapshotText: JSON.stringify({ world: Array.from({ length: 60 }, (_, index) => rawWorld(index + 1)), idSeq: 60 }), sourceRefs: Array.from({ length: 16 }, (_, index) => r(`source-${index}`)) });
  await rejects(x.call('memoryImportPreview', large), 'MEMORY_LIMIT'); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
  const escaping = importing({ snapshotText: JSON.stringify({ world: [rawWorld(1, '\\'.repeat(20000))], idSeq: 1 }) });
  assert.ok(Buffer.byteLength(escaping.snapshotText) < 49152); assert.ok(Buffer.byteLength(JSON.stringify(escaping)) > 65536);
  await rejects(x.call('memoryImportPreview', escaping), 'MEMORY_LIMIT');
});

test('complete serialized successful preview 65535/65536/65537 boundary includes outer envelope', async t => {
  const x = fixture(t), world = Array.from({ length: 16 }, (_, index) => rawWorld(index + 1)), sourceRefs = Array.from({ length: 16 }, (_, index) => r(`display-source-${index}`));
  const first = await x.call('memoryImportPreview', importing({ snapshotText: JSON.stringify({ world, idSeq: world.length }), sourceRefs }));
  const baseline = Buffer.byteLength(JSON.stringify({ ok: true, value: first }));
  for (const bytes of [65535, 65536, 65537]) {
    const current = structuredClone(world); current[0].answer = 'a'.repeat(bytes - baseline + world[0].answer.length);
    const input = importing({ snapshotText: JSON.stringify({ world: current, idSeq: world.length }), sourceRefs }); assert.ok(Buffer.byteLength(input.snapshotText) <= 49152);
    if (bytes > 65536) await rejects(x.call('memoryImportPreview', input), 'MEMORY_LIMIT');
    else { const preview = await x.call('memoryImportPreview', input); assert.equal(Buffer.byteLength(JSON.stringify({ ok: true, value: preview })), bytes); }
  }
  assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
});

test('pending/ready shared preview capacity reserves before awaits and expires without granting permission', async t => {
  const x = fixture(t); const pending = Array.from({ length: 16 }, () => x.call('memoryImportPreview', importing()));
  await rejects(x.call('memoryImportPreview', importing()), 'MEMORY_PREVIEW_CAPACITY');
  const ready = await Promise.all(pending); await rejects(x.call('memoryDeletePreview', { expectedRevision: 1 }), 'MEMORY_PREVIEW_CAPACITY');
  x.setTime(61000); await rejects(x.call('memoryImportConfirm', confirming(ready[0])), 'MEMORY_PREVIEW_STALE');
  const fresh = await x.call('memoryImportPreview', importing()); assert.equal(fresh.expiresAt, 121000); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
});

test('confirmation is exclusive and exact TTL accepts one millisecond before expiry only', async t => {
  const x = fixture(t); const preview = await x.call('memoryImportPreview', importing()); x.setTime(60999);
  const first = x.call('memoryImportConfirm', confirming(preview)); await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_BUSY');
  assert.equal((await first).revision, 1); assert.equal(x.fanout.length, 1);
});

test('preview mismatch, rollback, changed namespace and invalid acceptance never write', async t => {
  const x = fixture(t); let preview = await x.call('memoryImportPreview', importing());
  for (const change of [{ planDigest: r('wrong') }, { previewRef: r('wrong') }, { expectedRevision: 1 }]) await rejects(x.call('memoryImportConfirm', confirming(preview, change)), 'MEMORY_PREVIEW_STALE');
  await rejects(x.call('memoryImportConfirm', confirming(preview, { accept: false })), 'MEMORY_INVALID');
  x.setTime(999); await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_STALE');
  x.setTime(1000); preview = await x.call('memoryImportPreview', importing()); x.seed(); await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_STALE'); assert.equal(x.projection.state().revision, 1);
});

test('closed detached requests reject selectors, hostile descriptors and unsafe numeric authority', async t => {
  const x = fixture(t); x.seed(); let hooks = 0;
  const inputs = [corrected({ namespaceRef }), corrected({ proof: true }), Object.defineProperty(corrected(), 'id', { enumerable: true, get() { hooks++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }), Object.defineProperty(corrected(), 'id', { value: 1, enumerable: false }), new Proxy(corrected(), { getPrototypeOf() { hooks++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }), corrected({ [Symbol('hidden')]: true }), Object.assign(Object.create({}), corrected()), corrected({ id: Number.MAX_SAFE_INTEGER + 1 }), corrected({ candidate: candidate('x', { embedding: [Infinity] }) })];
  for (const input of inputs) await rejects(x.call('memoryCorrect', input), 'MEMORY_INVALID');
  const revoked = Proxy.revocable(corrected(), {}); revoked.revoke(); await rejects(x.call('memoryCorrect', revoked.proxy), 'MEMORY_INVALID'); assert.equal(hooks, 0);
  const input = Object.assign(Object.create(null), corrected()); await x.call('memoryCorrect', input); input.candidate.content.text = 'changed after return'; assert.equal(x.fanout[0].input.candidate.content.text, 'language preference French');
});

test('source-private exact ctx/guard and disposal seal pending previews and borrowed closures', async t => {
  const x = fixture(t); const pending = x.call('memoryImportPreview', importing()); x.deny('REQUEST_ABORTED'); await rejects(pending, 'REQUEST_ABORTED');
  x.deny(null); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
  await rejects(runInstalledWorkerInvocation({}, () => true, () => x.facade.operations.memoryStatus({})), 'SERVICE_DISPOSED');
  x.deny('OPERATOR_REQUIRED'); await rejects(x.call('memoryStatus', {}), 'OPERATOR_REQUIRED'); x.deny(null);
  const preview = await x.call('memoryImportPreview', importing()); const confirmation = x.call('memoryImportConfirm', confirming(preview)); x.facade.dispose(); await rejects(confirmation, 'SERVICE_DISPOSED');
  await rejects(x.call('memoryStatus', {}), 'SERVICE_DISPOSED'); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
});

test('postcommit listener fault reports uncertainty, retains exact durable receipt, and never reconfirms', async t => {
  const x = fixture(t); const preview = await x.call('memoryImportPreview', importing()); x.listener(() => { throw new RuntimeError('STORAGE_INVALID'); });
  await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_UNCERTAIN'); assert.equal(x.projection.state().revision, 1);
  assert.equal((await x.call('memoryStatus', {})).state, 'live'); await rejects(x.call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_STALE'); assert.equal(x.fanout.length, 1);
});

test('post-ack asynchronous revocation wins redaction and does not imply rollback', async t => {
  const x = fixture(t); x.seed(); let release; x.listener(() => new Promise(resolve => { release = resolve; }));
  const pending = x.call('memoryForget', forgotten()); assert.equal(x.projection.state().revision, 2); x.deny('REQUEST_ABORTED'); release(); await rejects(pending, 'REQUEST_ABORTED');
  x.deny(null); assert.equal((await x.call('memoryStatus', {})).revision, 2);
});

test('actual schema5 historical command status is explicitly unavailable, never reconstructed', async t => {
  const x = fixture(t); x.seed(); await x.call('memoryCorrect', corrected());
  assert.equal(typeof x.store.readMemoryCommand, 'undefined'); await rejects(x.call('memoryCommandStatus', { commandRef: r('correct') }), 'MEMORY_UNAVAILABLE'); assert.equal(x.projection.state().revision, 2);
});

test('clock callbacks cannot publish familiar error codes as source facts', async t => {
  for (const clock of [() => { throw new RuntimeError('STORAGE_INVALID'); }, () => NaN, () => 1.5, () => Number.MAX_SAFE_INTEGER]) {
    const x = fixture(t, { clock }); await rejects(x.call('memoryImportPreview', importing()), 'MEMORY_UNAVAILABLE'); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
  }
});

test('expiry and abort at confirmation namespace read are checked before actual mutation', async t => {
  const x = fixture(t); let reads = 0, expire = false;
  const boundStore = Object.fromEntries(['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt', 'snapshot', 'task', 'readData'].map(name => [name, x.store[name].bind(x.store)]));
  boundStore.getMemory = (...args) => { reads++; if (expire) x.setTime(61000); return x.store.getMemory(...args); };
  const facade = createInstalledMemoryContinuity({ ...x.input, store: boundStore }); t.after(() => facade.dispose());
  const call = (operation, input) => x.run(() => facade.operations[operation](input));
  const preview = await call('memoryImportPreview', importing()); const previous = reads; expire = true;
  await rejects(call('memoryImportConfirm', confirming(preview)), 'MEMORY_PREVIEW_STALE'); assert.equal(reads, previous + 1); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
  expire = false; x.setTime(61000); const next = await call('memoryImportPreview', importing());
  boundStore.getMemory = (...args) => { x.deny('REQUEST_ABORTED'); return x.store.getMemory(...args); };
  await rejects(call('memoryImportConfirm', confirming(next)), 'REQUEST_ABORTED'); assert.equal(x.store.getMemory(x.owner, { namespaceRef }), null);
});

test('actual original quota projection remains MEMORY_UNAVAILABLE without false absence or COMMAND_CAPACITY', async t => {
  const x = fixture(t, {}, { limits: { maxCommands: 129 } }); x.seed();
  await rejects(x.call('memoryCorrect', corrected()), 'MEMORY_UNAVAILABLE'); assert.equal(x.projection.state().revision, 1);
  assert.equal((await x.call('memoryStatus', {})).state, 'live'); assert.equal(x.fanout.length, 0);
});

test('actual original transaction fault rolls back and remains a guarded unavailable failure', async t => {
  let cut = false;
  const x = fixture(t, {}, { fixtureMode: true, fixtureFaults: point => { if (cut && point === 'before_commit') throw Error('SYNTHETIC_PRIVATE_CANARY'); } }); x.seed(); cut = true;
  await rejects(x.call('memoryCorrect', corrected()), 'MEMORY_UNAVAILABLE'); assert.equal(x.projection.state().revision, 1); assert.equal(x.fanout.length, 0);
});

test('current owner scope drift, typed storage fault and arbitrary read error never become absence', async t => {
  const x = fixture(t); const boundStore = Object.fromEntries(['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt', 'snapshot', 'task', 'readData'].map(name => [name, x.store[name].bind(x.store)]));
  const facade = createInstalledMemoryContinuity({ ...x.input, store: boundStore }); t.after(() => facade.dispose());
  const call = () => x.run(() => facade.operations.memoryStatus({}));
  boundStore.getMemory = () => { throw new RuntimeError('STORAGE_INVALID'); }; await rejects(call(), 'STORAGE_INVALID');
  boundStore.getMemory = () => { throw Object.defineProperty(Error('SYNTHETIC_PRIVATE_CANARY'), 'code', { get() { assert.fail('error getter invoked'); } }); }; await rejects(call(), 'MEMORY_UNAVAILABLE');
  let traps = 0; boundStore.getMemory = () => { throw new Proxy({}, { getPrototypeOf() { traps++; throw Error('SYNTHETIC_PRIVATE_CANARY'); } }); }; await rejects(call(), 'MEMORY_UNAVAILABLE'); assert.equal(traps, 0);
  let reads = 0; boundStore.getMemory = () => { reads++; return null; }; const binding = x.store.memoryBinding(x.owner); boundStore.memoryBinding = () => ({ ...binding, ownerRef: r('foreign') });
  await rejects(call(), 'MEMORY_SCOPE'); assert.equal(reads, 0);
});

test('actual final store replay after early miss preserves its unmarked original ack and clearing-only fanout', async t => {
  const x = fixture(t); x.seed(); const accepted = corrected(), { accept, ...original } = accepted; let competed = false;
  const boundStore = Object.fromEntries(['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt', 'snapshot', 'task', 'readData'].map(name => [name, x.store[name].bind(x.store)]));
  boundStore.putMemory = (...args) => { if (!competed) { competed = true; x.projection.correct(original); } return x.store.putMemory(...args); };
  const projection = new MemoryAdapter({ store: boundStore, handle: x.coordinator, namespaceRef, knownSecrets: x.input.knownSecrets, tokenize: x.input.memory.tokenize, contextAssembler: x.input.contextAssembler });
  const facade = createInstalledMemoryContinuity({ ...x.input, store: boundStore, coordinatorProjection: projection }); t.after(() => facade.dispose());
  const first = await x.run(() => facade.operations.memoryCorrect(accepted));
  assert.equal(competed, true); assert.equal(first.revision, 2); assert.equal(Object.hasOwn(first, 'deduplicated'), false); assert.deepEqual(first.result, { id: 1, factRevision: 2, authority: 'memory_only' });
  const second = await x.run(() => facade.operations.memoryCorrect(accepted)); assert.equal(second.deduplicated, true); assert.equal(Object.hasOwn(second, 'result'), false);
  assert.equal(x.fanout.length, 2); assert.equal(x.projection.state().revision, 2);
});

test('mutation acknowledgements remain historical after later edits and task authority is untouched', async t => {
  const x = fixture(t); x.seed(); const first = await x.call('memoryCorrect', corrected());
  await x.call('memoryForget', forgotten({ commandRef: r('forget-new'), expectedRevision: 2, expectedFactRevision: 2 }));
  const historic = await x.call('memoryCorrect', corrected()); assert.equal(historic.revision, first.revision); assert.equal(historic.deduplicated, true); assert.equal((await x.call('memoryStatus', {})).revision, 3);
  assert.equal(x.store.listTasks(x.owner).length, 0); assert.equal(x.fanout.length, 3);
});

test('metadata status and delete preview work for existing bodies above the request limit without exposing them', async t => {
  const x = fixture(t);
  const first = x.projection.remember({ ...remember(), candidate: candidate('a'.repeat(50000)) });
  x.projection.remember({ commandRef: r('large-second'), expectedRevision: first.revision, candidate: candidate('b'.repeat(50000)) });
  const actual = x.store.getMemory(x.owner, { namespaceRef }); assert.ok(actual.byteLength > 65536);
  assert.equal((await x.call('memoryStatus', {})).revision, 2); const preview = await x.call('memoryDeletePreview', { expectedRevision: 2 });
  assert.equal(JSON.stringify(preview).includes('a'.repeat(1000)), false); assert.equal(preview.description.digest, actual.digest);
});

test('actual public Cordis child uses the exact invocation carrier and own disposal closes facade', async t => {
  const { Context } = await import('@deepseek-ai/cordis'); const root = new Context(); const x = fixture(t); let child, facade;
  const fiber = root.plugin(ctx => { child = ctx; facade = createInstalledMemoryContinuity({ ...x.input, ctx }); ctx.on('dispose', () => facade.dispose()); });
  await new Promise(resolve => setImmediate(resolve));
  const call = () => runInstalledWorkerInvocation(child, () => { if (fiber.state !== 2 || fiber.uid === null) throw new BootstrapError('SERVICE_DISPOSED'); return true; }, () => facade.operations.memoryStatus({}));
  assert.equal((await call()).state, 'absent'); const closing = fiber.dispose(); await rejects(call(), 'SERVICE_DISPOSED'); await closing;
  await rejects(call(), 'SERVICE_DISPOSED');
});

test('typed-double historical read contract preserves observed/not-observed shapes without claiming durable support', async t => {
  const x = fixture(t); x.seed(); const receipt = await x.call('memoryCorrect', corrected());
  const handleStore = Object.fromEntries(['memoryBinding', 'getMemory', 'putMemory', 'deleteMemory', 'listMemory', 'memoryCommandReceipt', 'snapshot', 'task', 'readData'].map(name => [name, x.store[name].bind(x.store)]));
  handleStore.readMemoryCommand = (_handle, input) => input.commandRef === r('correct') ? Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'result')) : null;
  const facade = createInstalledMemoryContinuity({ ...x.input, store: handleStore }); t.after(() => facade.dispose());
  const call = input => x.run(() => facade.operations.memoryCommandStatus(input));
  assert.deepEqual(await call({ commandRef: r('missing') }), { state: 'not_observed', receipt: null });
  const observed = await call({ commandRef: r('correct') }); assert.equal(observed.state, 'observed'); assert.equal(Object.hasOwn(observed.receipt, 'result'), false); assert.equal(observed.receipt.revision, 2);
  handleStore.readMemoryCommand = () => { throw new RuntimeError('IDEMPOTENCY_CONFLICT'); }; await rejects(call({ commandRef: r('correct') }), 'IDEMPOTENCY_CONFLICT');
});

test('actual independent processes race same namespace/fact CAS with one winner', async t => {
  const x = fixture(t); x.seed(); x.store.close();
  // Both child processes use only this synthetic database and a copied key;
  // key bytes travel in stdin, never command arguments, logs or evidence.
  const childSource = `import {RuntimeStore} from './src/runtime-store.mjs';import {MemoryAdapter} from './src/memory.mjs';let text='';for await(const part of process.stdin)text+=part;const p=JSON.parse(text),handle={};let store;try{store=new RuntimeStore({databasePath:p.path,encryptionKey:Buffer.from(p.key,'base64'),principals:[{handle,role:'coordinator',scope:p.scope}]});const adapter=new MemoryAdapter({store,handle,namespaceRef:p.namespaceRef});const receipt=adapter.correct(p.input);process.stdout.write(JSON.stringify({revision:receipt.revision}));}catch(error){process.stdout.write(JSON.stringify({code:typeof error.code==='string'?error.code:'UNAVAILABLE'}));}finally{store?.close();}`;
  // Separate owned fixture keeps a reproducible synthetic key for this process oracle.
  const racePath = join(x.directory, 'race.sqlite'), raceKey = randomBytes(32), owner = {};
  t.after(() => raceKey.fill(0));
  const raceStore = new RuntimeStore({ databasePath: racePath, encryptionKey: raceKey, principals: [{ handle: owner, role: 'coordinator', scope }] });
  new MemoryAdapter({ store: raceStore, handle: owner, namespaceRef }).remember(remember()); raceStore.close();
  const execute = index => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childSource], { cwd: new URL('../', import.meta.url), env: { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = ''; const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(Error('BOUNDED_PROCESS_TIMEOUT')); }, 5000);
    child.stdout.on('data', part => { stdout += part; }); child.stderr.resume(); child.on('error', reject); child.on('close', code => { clearTimeout(timeout); if (code !== 0) reject(Error('BOUNDED_PROCESS_FAILED')); else resolve(JSON.parse(stdout)); });
    child.stdin.end(JSON.stringify({ path: racePath, key: raceKey.toString('base64'), scope, namespaceRef, input: { commandRef: r(`process-${index}`), expectedRevision: 1, id: 1, expectedFactRevision: 1, candidate: candidate(`process synthetic ${index}`) } }));
  });
  const results = await Promise.all([execute(1), execute(2)]); assert.equal(results.filter(value => value.revision === 2).length, 1); assert.equal(results.filter(value => value.code === 'STALE_MEMORY').length, 1); raceKey.fill(0);
});
