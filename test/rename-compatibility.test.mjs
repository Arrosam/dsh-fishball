import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixtureDatabasePath } from '../scripts/dsh-web.mjs';
import { FishballMemoryCore, MEMORY_VERSION, LEGACY_MEMORY_VERSION } from '../src/fishball-memory-core.mjs';
import { MemoryAdapter, MEMORY_PROJECTION_VERSION, LEGACY_MEMORY_PROJECTION_VERSION } from '../src/memory.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const scope = { ownerRef: hash('synthetic-owner'), workspaceRef: hash('synthetic-workspace') };

test('new fixture paths preserve a sole legacy store and reject ambiguous stores without writing', t => {
  const home = mkdtempSync(join(tmpdir(), 'df-rename-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.equal(fixtureDatabasePath(home), join(home, 'dsh-fishball.sqlite'));
  const legacy = join(home, 'bubbles.sqlite'), current = join(home, 'dsh-fishball.sqlite');
  writeFileSync(legacy, 'synthetic-existing-bytes');
  assert.equal(fixtureDatabasePath(home), legacy);
  assert.equal(readFileSync(legacy, 'utf8'), 'synthetic-existing-bytes');
  writeFileSync(current, 'different-existing-bytes');
  assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_AMBIGUOUS' });
  assert.equal(readFileSync(legacy, 'utf8'), 'synthetic-existing-bytes');
  assert.equal(readFileSync(current, 'utf8'), 'different-existing-bytes');
});

function priorSnapshot() {
  const core = new FishballMemoryCore({ scope });
  core.recordWorldFact({ id: 7, question: '合成记忆', answer: 'Synthetic answer', ttl: 'ONE_MONTH', tier: 'LOW', recordedAt: 1000, embedding: [] });
  const prior = core.snapshot(); prior.contractVersion = LEGACY_MEMORY_VERSION;
  return { prior, expected: core.snapshot() };
}

test('explicit legacy memory reads translate the label without persistence, identity loss or future-version acceptance', () => {
  const { prior, expected } = priorSnapshot(); let writes = 0;
  const bytes = JSON.stringify(prior);
  const core = new FishballMemoryCore({ scope, snapshotText: bytes, persist() { writes++; return true; } });
  assert.deepEqual(core.snapshot(), expected); assert.equal(core.snapshot().contractVersion, MEMORY_VERSION);
  assert.equal(writes, 0); assert.equal(JSON.stringify(prior), bytes);
  for (const contractVersion of ['bubbles.fishball-memory/future', 'df.fishball-memory/future']) {
    assert.throws(() => new FishballMemoryCore({ scope, snapshotText: JSON.stringify({ ...prior, contractVersion }) }), { code: 'MEMORY_SCOPE' });
  }
  assert.throws(() => new FishballMemoryCore({ scope: { ...scope, ownerRef: hash('foreign-owner') }, snapshotText: bytes }), { code: 'MEMORY_SCOPE' });
  assert.equal(writes, 0);
});

test('legacy projection keeps revisions and source facts on a read, without overwriting stored content', () => {
  const { prior } = priorSnapshot(), namespaceRef = hash('namespace'), handle = {}; let writes = 0;
  const projection = { contractVersion: LEGACY_MEMORY_PROJECTION_VERSION, scope, core: prior,
    facts: [{ id: 7, kind: 'world', revision: 1, sourceRefs: [hash('source')], observedAt: 1000, confidence: 1, deleted: false, conflictRefs: [] }] };
  const row = { ...scope, namespaceRef, revision: 3, recordRef: hash('record'), deleted: false, createdAt: 1000, updatedAt: 1000,
    content: JSON.stringify(projection) };
  row.digest = hash(row.content); const original = row.content;
  const store = {
    memoryBinding(caller) { assert.equal(caller, handle); return { ...scope, role: 'owner' }; },
    getMemory(caller) { assert.equal(caller, handle); return structuredClone(row); },
    listMemory() { return []; }, memoryCommandReceipt() { return null; },
    putMemory() { writes++; throw new Error('UNEXPECTED_WRITE'); }, deleteMemory() { writes++; throw new Error('UNEXPECTED_WRITE'); }
  };
  const adapter = new MemoryAdapter({ store, handle, namespaceRef });
  const current = adapter.state(); assert.equal(current.revision, 3);
  assert.equal(current.projection.contractVersion, MEMORY_PROJECTION_VERSION);
  assert.equal(current.projection.core.contractVersion, MEMORY_VERSION);
  assert.deepEqual(current.projection.facts, projection.facts);
  assert.equal(row.content, original); assert.equal(writes, 0);
  projection.contractVersion = 'df.memory-projection/future'; row.content = JSON.stringify(projection); row.digest = hash(row.content);
  assert.throws(() => adapter.state(), { code: 'MEMORY_CORRUPT' }); assert.equal(writes, 0);
});


test('orphan SQLite sidecars and mixed namespaces cannot select a blank renamed store', t => {
  for (const basename of ['bubbles.sqlite', 'dsh-fishball.sqlite']) for (const suffix of ['-wal', '-shm', '-journal']) {
    const home = mkdtempSync(join(tmpdir(), 'df-rename-sidecar-')); t.after(() => rmSync(home, { recursive: true, force: true }));
    const path = join(home, basename + suffix); writeFileSync(path, 'synthetic-orphan-bytes');
    assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_ORPHANED' });
    assert.equal(readFileSync(path, 'utf8'), 'synthetic-orphan-bytes');
    const other = join(home, basename === 'bubbles.sqlite' ? 'dsh-fishball.sqlite' : 'bubbles.sqlite');
    writeFileSync(other, 'other-synthetic-main');
    assert.throws(() => fixtureDatabasePath(home), { message: 'STORE_PATH_AMBIGUOUS' });
    assert.equal(readFileSync(path, 'utf8'), 'synthetic-orphan-bytes');
    assert.equal(readFileSync(other, 'utf8'), 'other-synthetic-main');
  }
});
