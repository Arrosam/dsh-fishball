import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MemoryAdapter, MemoryAdapterError, MEMORY_PROJECTION_VERSION } from '../src/memory.mjs';
const ref = value => value.toString(16).padStart(64, '0');
const hash = text => createHash('sha256').update(text).digest('hex');
const rejects = (fn, code) => assert.throws(fn, error => error instanceof MemoryAdapterError && error.code === code && error.message === code);
function fixture() {
  const coordinator = {}, owner = {}, foreign = {}, worker = {}, host = {}, rows = new Map(), commands = new Map(); let writes = 0, failRead = false, failWrite = false;
  const principals = new Map([[coordinator, { ownerRef: ref(1), workspaceRef: ref(2), role: 'coordinator' }], [owner, { ownerRef: ref(1), workspaceRef: ref(2), role: 'owner' }], [foreign, { ownerRef: ref(3), workspaceRef: ref(2), role: 'coordinator' }], [worker, { ownerRef: ref(1), workspaceRef: ref(2), role: 'worker' }], [host, { ownerRef: ref(1), workspaceRef: ref(2), role: 'host' }]]);
  const error = code => { throw Object.assign(new Error(code), { code }); };
  const binding = handle => { const value = principals.get(handle); if (!value) error('UNAUTHORIZED'); return value; };
  const key = (handle, namespaceRef) => JSON.stringify({ ...binding(handle), role: undefined, namespaceRef });
  const store = {
    memoryBinding(handle) { const value = binding(handle); if (value.role === 'worker') error('UNAUTHORIZED'); return { ...value }; },
    getMemory(handle, { namespaceRef }) { if (failRead) error('STORAGE_INVALID'); return structuredClone(rows.get(key(handle, namespaceRef)) ?? null); },
    listMemory(handle) { const { ownerRef, workspaceRef } = binding(handle); return [...rows.values()].filter(row => row.ownerRef === ownerRef && row.workspaceRef === workspaceRef).map(({ content, ...meta }) => structuredClone(meta)); },
    memoryCommandReceipt(handle, input) {
      const command = commands.get(key(handle, input.namespaceRef) + input.commandRef);
      if (!command) return null; if (command.requestDigest !== input.requestDigest) error('IDEMPOTENCY_CONFLICT'); return structuredClone(command.receipt);
    },
    putMemory(handle, input) {
      if (!['owner', 'coordinator'].includes(binding(handle).role)) error('UNAUTHORIZED');
      if (failWrite) throw Error('CANARY-secret-store-failure');
      const k = key(handle, input.namespaceRef), old = rows.get(k), c = k + input.commandRef, fingerprint = hash(JSON.stringify(input));
      if (commands.has(c)) { if (commands.get(c).fingerprint !== fingerprint) error('IDEMPOTENCY_CONFLICT'); return structuredClone(commands.get(c).receipt); }
      if (old?.deleted) error('MEMORY_DELETED'); if ((old?.revision ?? 0) !== input.expectedRevision) error('STALE_MEMORY');
      const receipt = { ...binding(handle), namespaceRef: input.namespaceRef, revision: (old?.revision ?? 0) + 1, digest: hash(input.content), recordRef: ref(100 + ++writes), deleted: false, createdAt: old?.createdAt ?? 1000, updatedAt: 1000 };
      delete receipt.role; rows.set(k, { ...receipt, content: input.content }); commands.set(c, { fingerprint, receipt, requestDigest: input.requestDigest }); return structuredClone(receipt);
    },
    deleteMemory(handle, input) {
      if (binding(handle).role !== 'owner') error('UNAUTHORIZED'); const k = key(handle, input.namespaceRef), old = rows.get(k);
      if (!old || old.revision !== input.expectedRevision) error('STALE_MEMORY'); const { content, ...meta } = old;
      const next = { ...meta, deleted: true, revision: old.revision + 1 }; rows.set(k, next); commands.set(k + input.commandRef, { receipt: next, requestDigest: input.requestDigest }); return structuredClone(next);
    },
  };
  return { coordinator, owner, foreign, worker, host, store, rows, get writes() { return writes; }, readFault() { failRead = true; }, writeFault() { failWrite = true; } };
}
const candidate = (text, more = {}) => ({ kind: 'preference', content: { text }, confidence: 0.9, sourceRefs: [ref(9)], observedAt: 1000, ...more });
const remember = (expectedRevision, text, command = 10, more = {}) => ({ commandRef: ref(command), expectedRevision, candidate: candidate(text, more) });
const query = { terms: ['language preference'], now: 1000 };

test('trusted workspace namespace isolation, opaque handle binding and no automatic import', () => {
  const x = fixture(), own = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) }), other = new MemoryAdapter({ store: x.store, handle: x.foreign, namespaceRef: ref(8) });
  assert.equal(own.state().revision, 0); assert.equal(x.writes, 0);
  own.remember(remember(0, 'language preference English'));
  assert.equal(other.retrieve(query).candidates.length, 0); assert.equal(own.retrieve(query).candidates.length, 1);
  assert.equal(other.listNamespaces().length, 0); assert.equal(own.listNamespaces()[0].content, undefined);
  rejects(() => new MemoryAdapter({ store: x.store, handle: {}, namespaceRef: ref(8) }), 'UNAUTHORIZED');
  rejects(() => new MemoryAdapter({ store: x.store, handle: x.worker, namespaceRef: ref(8) }), 'UNAUTHORIZED');
  rejects(() => new MemoryAdapter({ store: x.store, handle: x.host, namespaceRef: ref(8) }).remember(remember(1, 'language preference')), 'UNAUTHORIZED');
});

test('correction/delete removes old cached/retrievable plaintext; provenance revision and internal IDs never rewind', () => {
  const x = fixture(), first = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) }), second = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) });
  assert.equal(first.remember(remember(0, 'language preference English')).result.id, 1);
  second.correct({ commandRef: ref(11), expectedRevision: 1, id: 1, expectedFactRevision: 1, candidate: candidate('language preference Chinese', { sourceRefs: [ref(12)], observedAt: 2000, confidence: 0.8 }) });
  const result = first.retrieve({ ...query, now: 2000 }); assert.equal(result.candidates[0].fact.text, 'language preference Chinese');
  assert.equal(result.candidates[0].provenance.previousRevision, 1); assert.equal(result.candidates[0].provenance.revision, 2); assert.equal(result.candidates[0].provenance.confidence, 0.8); assert.deepEqual(result.candidates[0].provenance.sourceRefs, [ref(12)]);
  assert.equal(JSON.stringify(first.state()).includes('English'), false);
  first.forget({ commandRef: ref(13), expectedRevision: 2, id: 1, expectedFactRevision: 2 }); assert.equal(second.retrieve(query).candidates.length, 0);
  assert.equal(second.state().projection.facts[0].deleted, true); assert.equal(JSON.stringify(second.state()).includes('Chinese'), false);
  assert.equal(second.remember(remember(3, 'language preference French', 14)).result.id, 2);
  rejects(() => first.correct({ commandRef: ref(15), expectedRevision: 4, id: 1, expectedFactRevision: 3, candidate: candidate('revive old ID') }), 'MEMORY_CONFLICT');
});

test('stale revisions, corrupt/future projection, read/write faults fail visibly and never claim save', () => {
  const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) });
  memory.remember(remember(0, 'language preference English'));
  rejects(() => memory.remember(remember(0, 'stale overwrite', 11)), 'STALE_MEMORY'); assert.equal(x.writes, 1);
  x.writeFault(); rejects(() => memory.remember(remember(1, 'faulted write', 12)), 'MEMORY_UNAVAILABLE'); assert.equal(memory.state().revision, 1);
  const row = [...x.rows.values()][0]; row.content = '{'; row.digest = hash(row.content); rejects(() => memory.state(), 'MEMORY_CORRUPT');
  row.content = JSON.stringify({ contractVersion: 'future' }); row.digest = hash(row.content); rejects(() => memory.state(), 'MEMORY_INVALID');
  x.readFault(); rejects(() => memory.retrieve(query), 'STORAGE_INVALID');
});

test('namespace owner deletion writes tombstone and cannot silently resurrect', () => {
  const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) }); memory.remember(remember(0, 'language preference'));
  rejects(() => memory.deleteNamespace({ commandRef: ref(11), expectedRevision: 1 }), 'UNAUTHORIZED');
  const owner = new MemoryAdapter({ store: x.store, handle: x.owner, namespaceRef: ref(8) }); assert.equal(owner.deleteNamespace({ commandRef: ref(12), expectedRevision: 1 }).deleted, true);
  rejects(() => memory.retrieve(query), 'MEMORY_DELETED'); rejects(() => memory.remember(remember(2, 'revive namespace', 13)), 'MEMORY_DELETED');
  assert.equal([...x.rows.values()][0].content, undefined);
});

test('known secrets and hostile/malformed candidate structures are rejected before extraction or persistence', async () => {
  const x = fixture(); let invoked = 0;
  const memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), knownSecrets: ['CANARY-secret'], extractFacts: () => { invoked++; return []; } });
  rejects(() => memory.remember(remember(0, 'CANARY-secret')), 'SECRET_REJECTED');
  await assert.rejects(memory.extract({ commandRef: ref(11), expectedRevision: 0, content: 'CANARY-secret', sourceRefs: [ref(9)], observedAt: 1000 }), error => error.code === 'SECRET_REJECTED');
  assert.equal(invoked, 0); assert.equal(x.writes, 0);
  let getter = false; const hostile = candidate('safe'); Object.defineProperty(hostile, 'confidence', { enumerable: true, get() { getter = true; throw Error('secret'); } });
  rejects(() => memory.remember({ commandRef: ref(12), expectedRevision: 0, candidate: hostile }), 'MEMORY_INVALID'); assert.equal(getter, false);
  rejects(() => memory.remember(remember(0, 'safe', 13, { sourceRefs: Object.assign([ref(9)], { 4294967295: ref(8) }) })), 'MEMORY_INVALID');
  rejects(() => memory.remember(remember(0, 'safe', 14, { confidence: 1.01 })), 'MEMORY_INVALID');
});

test('injected extraction validates full batch and captures source/CAS before await; one transaction or no save', async () => {
  const x = fixture(); let finish, observed;
  const memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), extractFacts: value => { observed = value; return new Promise(resolve => { finish = resolve; }); } });
  const input = { commandRef: ref(11), expectedRevision: 0, content: 'synthetic language preference', sourceRefs: [ref(9)], observedAt: 1000 };
  const pending = memory.extract(input); input.sourceRefs[0] = ref(99); input.expectedRevision = 1;
  memory.remember(remember(0, 'current language preference', 12));
  finish([{ kind: 'preference', content: { text: 'old language preference' }, confidence: 0.9 }]);
  await assert.rejects(pending, error => error.code === 'STALE_MEMORY'); assert.deepEqual(observed.sourceRefs, [ref(9)]); assert.equal(x.writes, 1);
  const second = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), extractFacts: () => [{ kind: 'world', content: { question: 'synthetic question', answer: 'synthetic answer' }, confidence: 0.4 }, { kind: 'preference', content: { text: 'next language preference' }, confidence: 0.8 }] });
  const receipt = await second.extract({ commandRef: ref(13), expectedRevision: 1, content: 'synthetic fact input', sourceRefs: [ref(9)], observedAt: 2000 }); assert.deepEqual(receipt.result.ids, [2, 3]); assert.equal(x.writes, 2);
});

test('explicit synthetic source import validates revisions, preserves provenance and rejects merge into existing store', () => {
  const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) });
  const snapshotText = JSON.stringify({ preferences: [{ id: 8, text: 'imported language preference', kind: 'TRANSIENT', ttl: 'ONE_MONTH', recordedAt: 1000 }], idSeq: 9 });
  const input = { commandRef: ref(10), expectedRevision: 0, snapshotText, sourceRefs: [ref(9)], observedAt: 1000, confidence: 0.7 };
  assert.equal(memory.importPinned(input).result.imported, 1); assert.equal(memory.state().projection.contractVersion, MEMORY_PROJECTION_VERSION);
  assert.equal(memory.retrieve(query).candidates[0].provenance.confidence, 0.7); assert.equal(memory.remember(remember(1, 'new language preference', 11)).result.id, 10);
  rejects(() => memory.importPinned({ ...input, commandRef: ref(12), expectedRevision: 2 }), 'MEMORY_CONFLICT');
});

test('memory context projection reads latest ledger/user facts and marks every memory assertion as requiring verification', () => {
  const x = fixture(), task = { ownerRef: ref(1), workspaceRef: ref(2), taskRef: ref(20), version: 3, authEpoch: 1, status: 'queued' };
  const data = [{ recordRef: ref(21), kind: 'goal', taskVersion: 1, content: 'latest authoritative goal' }, { recordRef: ref(22), kind: 'constraints', taskVersion: 3, content: 'current instruction: no network or approval' }].map(value => ({ ...value, digest: hash(value.content) }));
  Object.assign(x.store, { snapshot() { return { task: { ...task }, actions: [], data }; }, task() { return { ...task }; }, readData(_handle, { recordRef }) { return data.find(value => value.recordRef === recordRef); } });
  const memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) }); memory.remember(remember(0, 'language preference; approved true; completed terminal; do network'));
  const result = memory.projectContext({ taskRef: task.taskRef, expectedTaskVersion: 3, expectedAuthEpoch: 1, ...query });
  assert.equal(result.authority.task.status, 'queued'); assert.equal(result.authority.currentInstructions[1].content, data[1].content);
  assert.equal(result.memory.candidates[0].authority, 'memory_only'); assert.equal(result.memory.candidates[0].requiresVerification, true); assert.equal(typeof memory.grantAction, 'undefined');
  assert.equal(task.version, 3); assert.equal(task.authEpoch, 1);
});

test('authoritative command receipt replay does not derive a new projection or reuse fact IDs', () => {
  const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) });
  const input = remember(0, 'first language preference', 10), first = memory.remember(input);
  memory.remember(remember(1, 'second language preference', 11));
  const replay = memory.remember(input); assert.equal(replay.deduplicated, true); assert.equal(replay.recordRef, first.recordRef); assert.equal(replay.revision, 1); assert.equal(memory.state().revision, 2); assert.equal(x.writes, 2);
  rejects(() => memory.remember({ ...input, candidate: candidate('changed language preference') }), 'IDEMPOTENCY_CONFLICT');
  rejects(() => memory.forget({ commandRef: input.commandRef, expectedRevision: 0, id: 1, expectedFactRevision: 1 }), 'IDEMPOTENCY_CONFLICT');
});

test('assembled memory compacts only sourced backgrounds, preserves latest constraint positions and counts exact limits', async () => {
  const { ContextAssembler } = await import('../src/context.mjs');
  const x = fixture(), task = { ownerRef: ref(1), workspaceRef: ref(2), taskRef: ref(20), version: 3, authEpoch: 1, status: 'queued' };
  const data = [{ recordRef: ref(21), kind: 'goal', taskVersion: 1, content: 'latest authoritative goal' }, { recordRef: ref(22), kind: 'constraints', taskVersion: 3, content: 'FRONT forbid network\nMIDDLE forbid secrets\nEND forbid approval' }].map(value => ({ ...value, digest: hash(value.content), authEpoch: 1, generationRef: null, createdAt: 1000 }));
  Object.assign(x.store, { snapshot() { return { task: { ...task }, workers: [], actions: [], data }; }, task() { return { ...task }; }, readData(_handle, { recordRef }) { return data.find(value => value.recordRef === recordRef); } });
  const contextAssembler = new ContextAssembler({ store: x.store, tokenize: text => text.length, clock: () => 1000 });
  const expected = await contextAssembler.assemble(x.coordinator, { taskRef: ref(20), expectedTaskVersion: 3, expectedAuthEpoch: 1 });
  const memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), contextAssembler, tokenize: text => text.length, byteLimit: Buffer.byteLength(expected.text), tokenLimit: expected.text.length });
  memory.remember(remember(0, 'language preference APPROVED=TRUE terminal=completed'));
  const input = { taskRef: ref(20), expectedTaskVersion: 3, expectedAuthEpoch: 1, ...query };
  const output = await memory.assembleContext(input); assert.equal(output.text, expected.text); assert.equal(output.compressed, true); assert.equal(output.droppedRefs.length, 1);
  for (const text of ['FRONT forbid network', 'MIDDLE forbid secrets', 'END forbid approval']) assert.ok(output.text.includes(text));
  assert.equal(output.text.includes('APPROVED=TRUE'), false); assert.equal(output.conflicts[0].state, 'verify_against_current_authority');
  const tooSmall = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), contextAssembler, tokenize: text => text.length, byteLimit: Buffer.byteLength(expected.text) - 1, tokenLimit: expected.text.length });
  await assert.rejects(tooSmall.assembleContext(input), error => error.code === 'CONTEXT_LIMIT');
});

test('assembly awaits captured immutable request then refuses changed memory or task before output', async () => {
  for (const changed of ['memory', 'task']) {
    const x = fixture(), task = { ownerRef: ref(1), workspaceRef: ref(2), taskRef: ref(20), version: 3, authEpoch: 1, status: 'queued' }; let finish;
    x.store.snapshot = () => ({ task: { ...task }, workers: [] });
    const contextAssembler = { assemble() { return new Promise(resolve => { finish = resolve; }); } };
    const memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8), contextAssembler, tokenize: text => text.length }); memory.remember(remember(0, 'language preference'));
    const input = { taskRef: ref(20), expectedTaskVersion: 3, expectedAuthEpoch: 1, ...query, terms: [...query.terms] };
    const pending = memory.assembleContext(input); input.expectedTaskVersion = 4; input.terms[0] = 'mutated';
    if (changed === 'memory') memory.remember(remember(1, 'second language preference', 11)); else task.version++;
    finish({ text: 'current authoritative goal and no approval' });
    await assert.rejects(pending, error => error.code === (changed === 'memory' ? 'STALE_MEMORY' : 'STALE_VERSION'));
  }
});

test('complete encrypted projection exact byte N-1/N/N+1 and future contract refuse without writes', () => {
  const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) });
  const source = { turns: Array.from({ length: 64 }, (_, i) => ({ id: i + 1, sessionId: 999, at: 1000 + i, speaker: 'USER', text: 'x'.repeat(64500) })) };
  memory.importPinned({ commandRef: ref(10), expectedRevision: 0, snapshotText: JSON.stringify(source), sourceRefs: [ref(9)], observedAt: 1000, confidence: 0.5 });
  const row = [...x.rows.values()][0], base = JSON.parse(row.content), initialWrites = x.writes;
  for (const target of [4194303, 4194304, 4194305]) {
    const next = structuredClone(base), remaining = target - Buffer.byteLength(JSON.stringify(next));
    assert.ok(remaining > 0 && remaining < 65536); next.core.turns[0].reasoning = 'y'.repeat(remaining);
    row.content = JSON.stringify(next); row.digest = hash(row.content); assert.equal(Buffer.byteLength(row.content), target);
    if (target > 4194304) rejects(() => memory.state(), 'CONTEXT_INVALID'); else assert.equal(memory.state().projection.core.turns.length, 64);
  }
  const future = structuredClone(base); future.contractVersion = 'df.memory-projection/future'; row.content = JSON.stringify(future); row.digest = hash(row.content);
  rejects(() => memory.state(), 'MEMORY_CORRUPT'); assert.equal(x.writes, initialWrites);
});

// These automatically become executable once the core author's schema4 methods
// land. Until then their explicit skips are pending actual-store evidence.
const { RuntimeStore } = await import('../src/runtime-store.mjs');
const durablePending = typeof RuntimeStore.prototype.memoryBinding !== 'function' || typeof RuntimeStore.prototype.memoryCommandReceipt !== 'function';
async function runtimeFixture(t, extra = {}) {
  const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'df-memory-adapter-')), databasePath = join(directory, 'ledger.db'), handle = {}, owner = {}, foreign = {}, host = {};
  const principals = [{ handle, role: 'coordinator', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: owner, role: 'owner', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }, { handle: foreign, role: 'coordinator', scope: { ownerId: 'synthetic-foreign-owner', workspaceId: 'synthetic-workspace' } }, { handle: host, role: 'host', scope: { ownerId: 'synthetic-owner', workspaceId: 'synthetic-workspace' } }];
  const options = { databasePath, encryptionKey: Buffer.alloc(32, 5), principals, forbiddenSecrets: ['SYNTHETIC-canary-secret'], ...extra };
  let store = new RuntimeStore(options);
  t.after(() => { store.close(); rmSync(directory, { force: true, recursive: true }); });
  return { handle, owner, foreign, host, databasePath, directory, get store() { return store; }, reopen() { store.close(); store = new RuntimeStore({ ...options, ...extra, fixtureFaults: undefined }); } };
}

test('actual encrypted RuntimeStore memory isolation/reopen, correction/delete freshness, replay and tombstone', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const { readFileSync } = await import('node:fs');
  const x = await runtimeFixture(t); let memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8), knownSecrets: ['SYNTHETIC-canary-secret'] });
  memory.remember(remember(0, 'synthetic language preference English'));
  assert.equal(new MemoryAdapter({ store: x.store, handle: x.foreign, namespaceRef: ref(8) }).retrieve(query).candidates.length, 0);
  rejects(() => memory.remember(remember(1, 'SYNTHETIC-canary-secret', 11)), 'SECRET_REJECTED');
  x.reopen(); memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) });
  assert.equal(memory.state().revision, 1); assert.equal(memory.remember(remember(0, 'synthetic language preference English')).deduplicated, true);
  memory.correct({ commandRef: ref(12), expectedRevision: 1, id: 1, expectedFactRevision: 1, candidate: candidate('synthetic language preference Chinese', { observedAt: 2000, sourceRefs: [ref(13)] }) });
  assert.equal(memory.retrieve({ terms: ['synthetic language preference'], now: 2000 }).candidates[0].fact.text, 'synthetic language preference Chinese');
  x.reopen(); memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) });
  memory.forget({ commandRef: ref(14), expectedRevision: 2, id: 1, expectedFactRevision: 2 }); assert.equal(memory.retrieve(query).candidates.length, 0);
  assert.equal(memory.remember(remember(3, 'synthetic language preference French', 15)).result.id, 2);
  const meta = memory.listNamespaces(); assert.equal(meta[0].content, undefined); assert.equal(JSON.stringify(meta).includes('French'), false);
  const bytes = readFileSync(x.databasePath).toString('utf8'); for (const text of ['synthetic language preference', 'SYNTHETIC-canary-secret']) assert.equal(bytes.includes(text), false);
  const deleted = new MemoryAdapter({ store: x.store, handle: x.owner, namespaceRef: ref(8) }).deleteNamespace({ commandRef: ref(16), expectedRevision: 4 }); assert.equal(deleted.deleted, true);
  x.reopen(); memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) }); rejects(() => memory.retrieve(query), 'MEMORY_DELETED');
});

test('actual memory write fault rolls back namespace and receipt together, then healthy reopen reads only durable state', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  let armed = false;
  const x = await runtimeFixture(t, { fixtureMode: true, fixtureFaults(point) { if (armed && point === 'before_commit') throw Error('SYNTHETIC-canary-secret'); } });
  const memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) }); memory.remember(remember(0, 'language preference baseline')); armed = true;
  rejects(() => memory.remember(remember(1, 'language preference phantom', 11)), 'MEMORY_UNAVAILABLE');
  armed = false; assert.equal(memory.state().revision, 1); assert.equal(memory.state().projection.facts.length, 1);
  assert.equal(x.store.memoryCommandReceipt(x.handle, { namespaceRef: ref(8), commandRef: ref(11), requestDigest: ref(12) }), null);
  x.reopen(); const restored = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) }); assert.equal(restored.state().revision, 1); assert.equal(restored.retrieve(query).candidates.length, 1);
});

test('actual separate OS processes race memory CAS with one committed winner and no reused IDs', { skip: durablePending && 'core schema4 memory API pending', timeout: 10000 }, async t => {
  const { spawn } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
  const x = await runtimeFixture(t), memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) }); memory.remember(remember(0, 'language preference baseline'));
  const storePath = fileURLToPath(new URL('../src/runtime-store.mjs', import.meta.url)), adapterPath = fileURLToPath(new URL('../src/memory.mjs', import.meta.url));
  const run = index => {
    const script = `import {RuntimeStore} from ${JSON.stringify(storePath)};import {MemoryAdapter} from ${JSON.stringify(adapterPath)};const handle={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.databasePath)},encryptionKey:Buffer.alloc(32,5),principals:[{handle,role:'coordinator',scope:{ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'}}]});const memory=new MemoryAdapter({store,handle,namespaceRef:${JSON.stringify(ref(8))}});console.log('READY');process.stdin.once('data',()=>{try{const receipt=memory.remember(${JSON.stringify(remember(1, 'language preference winner-' + index, 100 + index))});console.log(JSON.stringify({state:'committed',revision:receipt.revision,id:receipt.result.id}));}catch(error){console.log(JSON.stringify({state:'rejected',code:error.code}));}store.close();});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] }); let text = '', error = '', ready, early;
    const barrier = new Promise((resolve, reject) => { ready = resolve; early = reject; }); child.stdout.on('data', bytes => { text += bytes; if (text.includes('READY\n')) ready(); }); child.stderr.on('data', bytes => { error += bytes; });
    child.on('error', early); child.on('exit', code => { if (!text.includes('READY\n')) early(new Error(`Process exited before barrier (${code}): ${error}`)); });
    const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve({ code, text, error })); }); t.after(() => child.kill()); return { child, barrier, done };
  };
  const contestants = [run(0), run(1)]; await Promise.all(contestants.map(value => value.barrier)); contestants.forEach(value => value.child.stdin.end('GO'));
  const outputs = await Promise.all(contestants.map(value => value.done)); const facts = outputs.map(value => { assert.equal(value.code, 0, value.error); return JSON.parse(value.text.trim().split('\n').at(-1)); });
  assert.equal(facts.filter(value => value.state === 'committed').length, 1); assert.equal(facts.filter(value => value.code === 'STALE_MEMORY').length, 1);
  assert.equal(memory.state().revision, 2); assert.deepEqual(memory.state().projection.facts.map(value => value.id), [1, 2]);
});

test('actual abrupt process exit before commit and after acknowledgement preserves durable memory and command causality', { skip: durablePending && 'core schema4 memory API pending', timeout: 10000 }, async t => {
  const { spawn } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
  const x = await runtimeFixture(t), baseline = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) });
  baseline.remember(remember(0, 'language preference baseline'));
  const storePath = fileURLToPath(new URL('../src/runtime-store.mjs', import.meta.url)), adapterPath = fileURLToPath(new URL('../src/memory.mjs', import.meta.url));
  for (const point of ['before_commit', 'after_acknowledgement']) {
    const script = `import {RuntimeStore} from ${JSON.stringify(storePath)};import {MemoryAdapter} from ${JSON.stringify(adapterPath)};const handle={};const store=new RuntimeStore({databasePath:${JSON.stringify(x.databasePath)},encryptionKey:Buffer.alloc(32,5),principals:[{handle,role:'coordinator',scope:{ownerId:'synthetic-owner',workspaceId:'synthetic-workspace'}}],fixtureMode:true,fixtureFaults(point){if(${JSON.stringify(point)}==='before_commit'&&point==='before_commit')process.exit(73);}});const memory=new MemoryAdapter({store,handle,namespaceRef:${JSON.stringify(ref(8))}});memory.remember(${JSON.stringify(remember(1, 'language preference acknowledged', 11))});process.exit(73);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }); let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; }); t.after(() => child.kill());
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 73, stderr);
    x.reopen(); const reopened = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8) });
    if (point === 'before_commit') {
      assert.equal(reopened.state().revision, 1); assert.deepEqual(reopened.state().projection.facts.map(fact => fact.id), [1]);
      assert.equal(x.store.memoryCommandReceipt(x.handle, { namespaceRef: ref(8), commandRef: ref(11), requestDigest: ref(12) }), null);
      assert.equal(reopened.retrieve({ terms: ['acknowledged'], now: 1000 }).candidates.length, 0);
    } else {
      assert.equal(reopened.state().revision, 2); assert.deepEqual(reopened.state().projection.facts.map(fact => fact.id), [1, 2]);
      const replay = reopened.remember(remember(1, 'language preference acknowledged', 11)); assert.equal(replay.deduplicated, true); assert.equal(replay.revision, 2);
      assert.equal(reopened.remember(remember(2, 'language preference subsequent', 12)).result.id, 3);
    }
  }
});

test('persisted core null/false/zero rejects without normalizing corrupt projection to empty memory', () => {
  for (const invalid of [null, false, 0]) {
    const x = fixture(), memory = new MemoryAdapter({ store: x.store, handle: x.coordinator, namespaceRef: ref(8) }); memory.remember(remember(0, 'language preference retained'));
    const row = [...x.rows.values()][0], projection = JSON.parse(row.content); projection.core = invalid; projection.facts = []; row.content = JSON.stringify(projection); row.digest = hash(row.content);
    rejects(() => memory.state(), 'MEMORY_INVALID'); rejects(() => memory.remember(remember(1, 'corrupt replacement', 11)), 'MEMORY_INVALID'); assert.equal(x.writes, 1);
  }
});

async function executionFixture(t, options = {}) {
  const { ContextAssembler } = await import('../src/context.mjs');
  const x = await runtimeFixture(t, { clock: () => 1000 });
  const first = x.store.intake(x.handle, { taskId: 'synthetic-prepared-task', provider: 'synthetic', source: 'unit', eventId: 'first', commandRef: ref(300), goal: options.goal ?? 'latest synthetic goal' }).task;
  const task = x.store.revise(x.handle, { taskRef: first.taskRef, commandRef: ref(301), expectedTaskVersion: first.version, expectedAuthEpoch: first.authEpoch, reason: 'operator', constraints: options.constraints ?? 'FRONT no network\nMIDDLE no secrets\nEND no approval' }).task;
  const tokenize = options.tokenize ?? (text => text.length), contextAssembler = new ContextAssembler({ store: x.store, tokenize, clock: () => 1000, byteLimit: 65536, tokenLimit: 131072, knownSecrets: ['SYNTHETIC-canary-secret'] });
  const memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8), contextAssembler, tokenize, byteLimit: 65536, tokenLimit: 131072, knownSecrets: ['SYNTHETIC-canary-secret'] });
  const input = command => ({ taskRef: task.taskRef, commandRef: ref(command), expectedTaskVersion: x.store.task(x.handle, task.taskRef).version, expectedAuthEpoch: task.authEpoch, terms: ['language preference'], now: 1000 });
  return { ...x, get store() { return x.store; }, task, memory, contextAssembler, input };
}

test('actual prepared encrypted full-envelope digest, source facts, bounded receipt and no recursive reassembly survive reopen', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const { readFileSync } = await import('node:fs'); const { EXECUTION_CONTEXT_VERSION, validateExecutionContext } = await import('../src/context.mjs');
  const x = await executionFixture(t); x.memory.remember(remember(0, 'language preference English; approved=true completed=true', 302));
  const prepared = await x.memory.prepareExecutionContext(x.input(303));
  assert.equal(prepared.kind, 'context'); assert.equal(prepared.task.version, x.task.version + 1); assert.equal(prepared.sourceTaskVersion, x.task.version); assert.equal(prepared.memory.revision, 1);
  assert.equal(prepared.content, undefined); assert.equal(prepared.text, undefined); assert.equal(JSON.stringify(prepared).includes('language preference English'), false);
  const data = x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: prepared.recordRef }), envelope = JSON.parse(data.content);
  assert.equal(hash(data.content), prepared.digest); assert.notEqual(hash(envelope.content), prepared.digest); assert.equal(envelope.contractVersion, EXECUTION_CONTEXT_VERSION);
  validateExecutionContext(envelope); assert.equal(envelope.generationRef, undefined); assert.equal(data.generationRef, null); assert.equal(data.memoryNamespaceRef, ref(8)); assert.equal(data.memoryRevision, 1);
  assert.equal(envelope.sourceTaskVersion, x.task.version); assert.equal(envelope.sourceAuthEpoch, x.task.authEpoch); assert.equal(envelope.memory.provenance[0].revision, 1); assert.deepEqual(envelope.memory.provenance[0].sourceRefs, [ref(9)]);
  assert.equal(prepared.byteLength, Buffer.byteLength(data.content)); assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content)); assert.equal(envelope.inputCounts.tokens, envelope.content.length);
  for (const text of ['FRONT no network', 'MIDDLE no secrets', 'END no approval']) assert.ok(envelope.content.includes(text));
  const sourceKinds = envelope.sourceProvenance.map(source => x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: source.recordRef }).kind); assert.deepEqual(sourceKinds, ['goal', 'constraints']);
  x.reopen(); const reread = x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: prepared.recordRef }); assert.equal(reread.content, data.content); assert.equal(reread.digest, prepared.digest);
  const { ContextAssembler } = await import('../src/context.mjs'); const assembler = new ContextAssembler({ store: x.store, tokenize: text => text.length, clock: () => 1000, tokenLimit: 131072 });
  const rebuilt = await assembler.assemble(x.handle, { taskRef: x.task.taskRef, expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch });
  assert.equal(rebuilt.text.includes('language preference English'), false); assert.equal(rebuilt.text.split('CURRENT GOAL').length - 1, 1); assert.equal(rebuilt.provenance.some(source => source.recordRef === prepared.recordRef), false);
  await assert.rejects(assembler.assemble(x.handle, { taskRef: x.task.taskRef, expectedTaskVersion: prepared.task.version, expectedAuthEpoch: prepared.task.authEpoch, recordRefs: [prepared.recordRef] }), error => error.code === 'CONTEXT_RECURSION');
  const bytes = readFileSync(x.databasePath).toString('utf8'); for (const text of ['latest synthetic goal', 'FRONT no network', 'language preference English', 'SYNTHETIC-canary-secret']) assert.equal(bytes.includes(text), false);
});

test('actual preparation atomic guard rejects newly created, corrected, deleted memory and concurrent task correction', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  for (const change of ['absent_created', 'live_corrected', 'live_deleted', 'task_corrected']) {
    await t.test(change, async child => {
      const x = await executionFixture(child);
      if (change !== 'absent_created') x.memory.remember(remember(0, 'language preference baseline', 310));
      const before = x.store.snapshot(x.handle, { taskRef: x.task.taskRef }), original = x.store.putData.bind(x.store);
      x.store.putData = (handle, request) => {
        x.store.putData = original;
        if (change === 'absent_created') x.memory.remember(remember(0, 'language preference created after read', 311));
        if (change === 'live_corrected') x.memory.correct({ commandRef: ref(312), expectedRevision: 1, id: 1, expectedFactRevision: 1, candidate: candidate('language preference corrected after read') });
        if (change === 'live_deleted') new MemoryAdapter({ store: x.store, handle: x.owner, namespaceRef: ref(8) }).deleteNamespace({ commandRef: ref(313), expectedRevision: 1 });
        if (change === 'task_corrected') x.store.revise(x.handle, { taskRef: x.task.taskRef, commandRef: ref(314), expectedTaskVersion: before.task.version, expectedAuthEpoch: before.task.authEpoch, goal: 'current corrected goal', reason: 'operator' });
        return original(handle, request);
      };
      await assert.rejects(x.memory.prepareExecutionContext(x.input(315)), error => error.code === (change === 'task_corrected' ? 'STALE_VERSION' : 'STALE_MEMORY'));
      assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 0);
      assert.equal(x.store.task(x.handle, x.task.taskRef).version, before.task.version + (change === 'task_corrected' ? 1 : 0));
    });
  }
});

test('actual complete serialized64KiB context boundary accounts JSON escaping and protects minimum rather than trimming', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const x = await executionFixture(t, { goal: '"'.repeat(20000), constraints: 'FRONT deny\nMIDDLE deny\nEND deny' });
  const prepared = await x.memory.prepareExecutionContext(x.input(320)); assert.ok(prepared.byteLength <= 65536);
  const record = x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: prepared.recordRef }); assert.equal(JSON.parse(record.content).content.includes('"'.repeat(20000)), true);
  await t.test('protected text fits raw input but escapes past encrypted record cap', async child => {
    const y = await executionFixture(child, { goal: '"'.repeat(32500) });
    const before = y.store.task(y.handle, y.task.taskRef).version;
    await assert.rejects(y.memory.prepareExecutionContext(y.input(321)), error => error.code === 'CONTEXT_LIMIT');
    assert.equal(y.store.task(y.handle, y.task.taskRef).version, before); assert.equal(y.store.listData(y.handle, { taskRef: y.task.taskRef, kind: 'context' }).length, 0);
  });
});

test('actual complete execution envelope exact serialized byte N-1/N/N+1 boundary with escaped source text', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const baseline = await executionFixture(t, { goal: '"'.repeat(20000) }), measured = await baseline.memory.prepareExecutionContext(baseline.input(330));
  for (const target of [65535, 65536, 65537]) {
    await t.test(String(target), async child => {
      const padding = target - measured.byteLength; assert.ok(padding > 0);
      const x = await executionFixture(child, { goal: '"'.repeat(20000) + 'x'.repeat(padding) }), request = x.input(330), version = request.expectedTaskVersion;
      if (target > 65536) {
        await assert.rejects(x.memory.prepareExecutionContext(request), error => error.code === 'CONTEXT_LIMIT');
        assert.equal(x.store.task(x.handle, x.task.taskRef).version, version); assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 0);
      } else {
        const receipt = await x.memory.prepareExecutionContext(request); assert.equal(receipt.byteLength, target);
        assert.equal(Buffer.byteLength(x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: receipt.recordRef }).content), target);
      }
    });
  }
});

test('actual encrypted extraction boundary rejects known secret before callback or persistence', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const x = await runtimeFixture(t); let calls = 0;
  const memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8), knownSecrets: ['SYNTHETIC-canary-secret'], extractFacts() { calls++; return []; } });
  await assert.rejects(memory.extract({ commandRef: ref(340), expectedRevision: 0, content: 'SYNTHETIC-canary-secret', sourceRefs: [ref(9)], observedAt: 1000 }), error => error.code === 'SECRET_REJECTED');
  assert.equal(calls, 0); assert.equal(x.store.getMemory(x.handle, { namespaceRef: ref(8) }), null); assert.equal(x.store.listMemory(x.handle).length, 0);
  x.reopen(); assert.equal(x.store.getMemory(x.handle, { namespaceRef: ref(8) }), null);
});

test('actual prepared-context write fault preserves task version, data rows and encrypted reopen state', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const { ContextAssembler } = await import('../src/context.mjs'); let armed = false;
  const x = await runtimeFixture(t, { clock: () => 1000, fixtureMode: true, fixtureFaults(point) { if (armed && point === 'before_commit') throw Error('SYNTHETIC-canary-secret'); } });
  const task = x.store.intake(x.handle, { taskId: 'synthetic-fault-task', provider: 'synthetic', source: 'unit', eventId: 'first', commandRef: ref(350), goal: 'current synthetic goal' }).task;
  const tokenize = text => text.length, assembler = new ContextAssembler({ store: x.store, tokenize, clock: () => 1000 });
  const memory = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8), contextAssembler: assembler, tokenize });
  const request = { taskRef: task.taskRef, commandRef: ref(351), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, terms: [], now: 1000 };
  armed = true; await assert.rejects(memory.prepareExecutionContext(request), error => error.code === 'MEMORY_UNAVAILABLE' && error.message === 'MEMORY_UNAVAILABLE'); armed = false;
  assert.equal(x.store.task(x.handle, task.taskRef).version, task.version); assert.equal(x.store.listData(x.handle, { taskRef: task.taskRef, kind: 'context' }).length, 0);
  x.reopen(); assert.equal(x.store.task(x.handle, task.taskRef).version, task.version); assert.equal(x.store.listData(x.handle, { taskRef: task.taskRef, kind: 'context' }).length, 0);
  const restoredAssembler = new ContextAssembler({ store: x.store, tokenize, clock: () => 1000 }), restored = new MemoryAdapter({ store: x.store, handle: x.handle, namespaceRef: ref(8), contextAssembler: restoredAssembler, tokenize });
  const receipt = await restored.prepareExecutionContext(request); assert.equal(receipt.task.version, task.version + 1); assert.equal(receipt.memory.revision, 0);
});

function configureSupplements(x) {
  const sourceRef = ref(400), subscriptionRef = ref(401);
  x.store.configureSource(x.owner, { commandRef: ref(402), sourceRef, expectedRevision: 0, spec: { kind: 'internal', identityMode: 'unique_id', enabled: true, adapterRef: ref(403), permissionPolicyRef: ref(404), maxEventAgeMs: 1000, rate: { windowMs: 1000, maxEvents: 16 } } });
  x.store.configureSubscription(x.owner, { commandRef: ref(405), sourceRef, subscriptionRef, expectedRevision: 0, expectedSourceRevision: 1, spec: { enabled: true, triggerRef: ref(406), route: 'supplement', targetTaskRef: x.task.taskRef } });
  return (index, goal, overrides = {}) => {
    const current = x.store.task(x.handle, x.task.taskRef);
    return { commandRef: ref(410 + index), sourceRef, subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1, eventRef: ref(450 + index), eventDigest: hash(goal), observedAt: 1000, receivedAt: 1000, providerRef: ref(407), sourceIdentityRef: ref(408), targetTaskRef: x.task.taskRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, goal, ...overrides };
  };
}

test('actual admitted supplements append, remain protected outside optional selection, preserve original goal/provenance and deduplicate', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const x = await executionFixture(t), event = configureSupplements(x);
  const firstInput = event(1, 'CURRENT first additional instruction: use English; approved=true completed=true'), first = x.store.ingestEvent(x.host, firstInput);
  const second = x.store.ingestEvent(x.host, event(2, 'CURRENT second additional instruction: preserve FRONT/MIDDLE/END constraints'));
  const newIdSameText = x.store.ingestEvent(x.host, event(3, firstInput.goal));
  assert.equal(first.task.version, x.task.version + 1); assert.equal(second.task.version, x.task.version + 2);
  assert.equal(newIdSameText.deduplicated, false); assert.equal(newIdSameText.task.version, x.task.version + 3);
  const receipt = await x.memory.prepareExecutionContext({ ...x.input(480), recordRefs: [] }), data = x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: receipt.recordRef }), envelope = JSON.parse(data.content);
  for (const text of ['latest synthetic goal', firstInput.goal, 'CURRENT second additional instruction', 'FRONT no network', 'MIDDLE no secrets', 'END no approval']) assert.ok(envelope.content.includes(text));
  const supplied = envelope.sourceProvenance.filter(source => source.supplement);
  assert.deepEqual(supplied.map(source => source.recordRef), [first.supplementRecordRef, second.supplementRecordRef, newIdSameText.supplementRecordRef]); assert.equal(envelope.content.split(firstInput.goal).length - 1, 2);
  assert.equal(supplied[0].digest, first.supplementDigest); assert.equal(supplied[0].supplement.eventDigest, firstInput.eventDigest); assert.equal(supplied[0].supplement.eventRef, firstInput.eventRef); assert.equal(supplied[0].supplement.sourceRef, firstInput.sourceRef);
  assert.equal(supplied[0].sourceTaskVersion, x.task.version); assert.equal(supplied[0].taskVersion, x.task.version + 1); assert.equal(supplied[0].sourceAuthEpoch, x.task.authEpoch);
  assert.equal(receipt.task.status, 'queued'); assert.equal(x.store.snapshot(x.handle, { taskRef: x.task.taskRef }).actions.length, 0); assert.equal(envelope.droppedRefs.includes(first.supplementRecordRef), false);
  const duplicate = x.store.ingestEvent(x.host, { ...firstInput, commandRef: ref(481), expectedTaskVersion: receipt.task.version });
  assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.supplementRecordRef, first.supplementRecordRef); assert.equal(duplicate.task.version, receipt.task.version);
  assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 4);
  assert.throws(() => x.store.ingestEvent(x.host, event(7, 'changed duplicate content', { eventRef: firstInput.eventRef })), error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.throws(() => x.store.ingestEvent(x.host, event(4, 'stale instruction', { expectedTaskVersion: x.task.version })), error => error.code === 'STALE_VERSION');
  assert.throws(() => x.store.readData(x.foreign, { taskRef: x.task.taskRef, recordRef: first.supplementRecordRef }), error => error.code === 'RECORD_NOT_FOUND');
  x.reopen(); const read = x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: receipt.recordRef }); assert.equal(read.content, data.content);
});

test('actual supplement secret admission and protected byte minimum refuse without dropped instructions or phantom preparation', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const x = await executionFixture(t, { goal: 'g'.repeat(30000) }), event = configureSupplements(x), before = x.store.task(x.handle, x.task.taskRef).version;
  assert.throws(() => x.store.ingestEvent(x.host, event(1, 'SYNTHETIC-canary-secret')), error => error.code === 'SECRET_REJECTED');
  assert.equal(x.store.task(x.handle, x.task.taskRef).version, before); assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 0);
  const admitted = x.store.ingestEvent(x.host, event(2, 's'.repeat(40000))), current = x.store.task(x.handle, x.task.taskRef).version;
  await assert.rejects(x.memory.prepareExecutionContext({ ...x.input(482), recordRefs: [] }), error => error.code === 'CONTEXT_LIMIT');
  assert.equal(x.store.task(x.handle, x.task.taskRef).version, current); assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 1);
  assert.equal(JSON.parse(x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: admitted.supplementRecordRef }).content).content.length, 40000);
});

test('actual supplement arriving at preparation commit invalidates CAS; later source disable preserves admitted current instruction', { skip: durablePending && 'core schema4 memory API pending' }, async t => {
  const x = await executionFixture(t), event = configureSupplements(x), original = x.store.putData.bind(x.store);
  x.store.putData = (handle, request) => { x.store.putData = original; x.store.ingestEvent(x.host, event(1, 'CURRENT additional instruction admitted during preparation')); return original(handle, request); };
  await assert.rejects(x.memory.prepareExecutionContext({ ...x.input(490), recordRefs: [] }), error => error.code === 'STALE_VERSION');
  assert.equal(x.store.task(x.handle, x.task.taskRef).version, x.task.version + 1); assert.equal(x.store.listData(x.handle, { taskRef: x.task.taskRef, kind: 'context' }).length, 1);
  const source = x.store.source(x.owner, { sourceRef: ref(400) });
  x.store.configureSource(x.owner, { commandRef: ref(491), sourceRef: source.sourceRef, expectedRevision: source.revision, spec: { ...source.spec, enabled: false } });
  const prepared = await x.memory.prepareExecutionContext({ ...x.input(492), recordRefs: [] }), envelope = JSON.parse(x.store.readData(x.handle, { taskRef: x.task.taskRef, recordRef: prepared.recordRef }).content);
  assert.ok(envelope.content.includes('CURRENT additional instruction admitted during preparation')); assert.equal(envelope.sourceProvenance.filter(source => source.supplement).length, 1);
});
