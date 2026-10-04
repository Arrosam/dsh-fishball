import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compactContext, contextText, ContextAssembler, ContextError } from '../src/context.mjs';
const ref = value => value.toString(16).padStart(64, '0');
const rejects = (fn, code) => assert.throws(fn, error => error instanceof ContextError && error.code === code && error.message === code);
const count = text => [...text].length;

test('context exact N-1/N/N+1 output-byte and injected-token boundaries never truncate protected text', () => {
  const protectedText = 'front拒绝\nmiddle constraints\nend latest';
  const bytes = Buffer.byteLength(protectedText), tokens = count(protectedText);
  for (const byteLimit of [bytes, bytes + 1]) assert.equal(compactContext({ protectedText, backgrounds: [], byteLimit, tokenLimit: tokens, tokenize: count }).text, protectedText);
  rejects(() => compactContext({ protectedText, backgrounds: [], byteLimit: bytes - 1, tokenLimit: tokens, tokenize: count }), 'CONTEXT_LIMIT');
  for (const tokenLimit of [tokens, tokens + 1]) assert.equal(compactContext({ protectedText, backgrounds: [], byteLimit: bytes, tokenLimit, tokenize: count }).tokens, tokens);
  rejects(() => compactContext({ protectedText, backgrounds: [], byteLimit: bytes, tokenLimit: tokens - 1, tokenize: count }), 'CONTEXT_LIMIT');
});

test('whole-record compaction recomputes assembled counts and preserves front/middle/end constraints', () => {
  const protectedText = 'FRONT:no network\nMIDDLE:no secrets\nEND:no approval';
  const backgrounds = [{ ref: ref(1), text: 'current material' }, { ref: ref(2), text: 'old summary'.repeat(10) }];
  const permitted = protectedText + '\n\n' + backgrounds[0].text;
  const result = compactContext({ protectedText, backgrounds, byteLimit: Buffer.byteLength(permitted), tokenLimit: count(permitted), tokenize: count });
  assert.equal(result.text, permitted); assert.deepEqual(result.droppedRefs, [ref(2)]); assert.equal(result.compressed, true);
  for (const constraint of ['FRONT:no network', 'MIDDLE:no secrets', 'END:no approval']) assert.ok(result.text.includes(constraint));
});

test('known secret, credential shape, hostile getters and tokenizer failures redact errors before output', () => {
  rejects(() => contextText('a CANARY-secret b', ['CANARY-secret']), 'SECRET_REJECTED');
  rejects(() => contextText('Bearer syntheticTokenCanary'), 'SECRET_REJECTED');
  rejects(() => compactContext({ protectedText: 'safe', backgrounds: [{ ref: ref(1), text: 'sk_live_syntheticTokenCanary' }], byteLimit: 100, tokenLimit: 100, tokenize: count }), 'SECRET_REJECTED');
  let touched = false;
  rejects(() => compactContext({ get protectedText() { touched = true; throw Error('secret'); }, backgrounds: [], byteLimit: 100, tokenLimit: 100, tokenize: count }), 'CONTEXT_INVALID');
  assert.equal(touched, false);
  for (const tokenize of [() => { throw Error('CANARY-secret'); }, () => NaN, () => Promise.resolve(1), () => -1]) rejects(() => compactContext({ protectedText: 'safe', backgrounds: [], byteLimit: 100, tokenLimit: 100, tokenize }), 'TOKENIZER_UNAVAILABLE');
});


test('stored reference fields reject trailing line terminators', () => {
  for (const ending of ['\n', '\r', '\u2028', '\u2029']) rejects(() => compactContext({ protectedText: 'safe', backgrounds: [{ ref: ref(1) + ending, text: 'safe background' }], byteLimit: 100, tokenLimit: 100, tokenize: count }), 'CONTEXT_INVALID');
});

test('optional context arrays reject non-index numeric own fields rather than discard them', () => {
  rejects(() => compactContext({ protectedText: 'safe', backgrounds: Object.assign([], { 4294967295: { ref: ref(1), text: 'extra' } }), byteLimit: 100, tokenLimit: 100, tokenize: count }), 'CONTEXT_INVALID');
});

function assembledFixture() {
  const task = { ownerRef: ref(1), workspaceRef: ref(2), taskRef: ref(3), version: 4, authEpoch: 0, status: 'queued' };
  const content = ['latest goal', 'FRONT deny\nMIDDLE protected\nEND latest', JSON.stringify({ materialKind: 'summary', sourceScope: { ownerRef: ref(1), workspaceRef: ref(2), taskRef: ref(3) }, sourceTaskVersion: 1, sourceAuthEpoch: 0, generatedAt: 1, sourceRefs: [ref(10)], content: 'OLD goal APPROVED completed repeat step' })];
  const records = content.map((text, i) => ({ recordRef: ref(10 + i), kind: ['goal', 'constraints', 'context'][i], content: text, digest: createHash('sha256').update(text).digest('hex'), taskVersion: i + 1, authEpoch: 0, generationRef: null, createdAt: i + 1 }));
  return { task, records, store: { snapshot() { return { task: { ...task }, data: records.map(({ content: _content, ...data }) => data), workers: [], actions: [] }; }, task() { return { ...task }; }, readData(_handle, { recordRef }) { return records.find(record => record.recordRef === recordRef); } } };
}

test('actual module assembly uses latest protected source/ledger facts and omits stale summary assertions', async () => {
  const x = assembledFixture();
  const assembled = await new ContextAssembler({ store: x.store, tokenize: count, clock: () => 100 }).assemble({}, { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0 });
  assert.ok(assembled.text.includes('latest goal'));
  for (const critical of ['FRONT deny', 'MIDDLE protected', 'END latest', '"status":"queued"']) assert.ok(assembled.text.includes(critical));
  assert.equal(assembled.text.includes('OLD goal'), false); assert.equal(assembled.text.includes('APPROVED'), false);
  assert.deepEqual(assembled.conflicts, [{ recordRef: ref(12), reason: 'stale_summary', winningTaskVersion: 4 }]);
});

test('assembly rejects wrong source owner/workspace/task, missing provenance, generation and changed CAS after tokenization', async () => {
  for (const field of ['ownerRef', 'workspaceRef', 'taskRef']) {
    const x = assembledFixture(), material = JSON.parse(x.records[2].content); material.sourceScope[field] = ref(99);
    x.records[2].content = JSON.stringify(material); x.records[2].digest = createHash('sha256').update(x.records[2].content).digest('hex');
    await assert.rejects(new ContextAssembler({ store: x.store, tokenize: count, clock: () => 100 }).assemble({}, { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0 }), error => error.code === 'CONTEXT_SCOPE');
  }
  for (const mutation of [task => { task.version++; }, task => { task.authEpoch++; }]) {
    const x = assembledFixture(); let changed = false;
    const tokenize = text => { if (!changed) { changed = true; mutation(x.task); } return count(text); };
    await assert.rejects(new ContextAssembler({ store: x.store, tokenize, clock: () => 100 }).assemble({}, { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0 }), error => ['STALE_VERSION', 'STALE_AUTHORITY'].includes(error.code));
  }
  const x = assembledFixture();
  await assert.rejects(new ContextAssembler({ store: x.store, tokenize: count, clock: () => 100 }).assemble({}, { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0, generationRef: ref(55) }), error => error.code === 'STALE_GENERATION');
});

test('async assembly captures request versions and nested references before host query awaits', async () => {
  const x = assembledFixture(), material = JSON.parse(x.records[2].content);
  Object.assign(material, { materialKind: 'host_snapshot', content: 'old host snapshot' });
  x.records[2].content = JSON.stringify(material); x.records[2].digest = createHash('sha256').update(x.records[2].content).digest('hex');
  let finish; const query = new Promise(resolve => { finish = resolve; });
  const input = { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0, recordRefs: [ref(12)] };
  const pending = new ContextAssembler({ store: x.store, tokenize: count, clock: () => 100, staleAfterMs: 0, queryHost: () => query }).assemble({}, input);
  x.task.version = 5; input.expectedTaskVersion = 5; input.recordRefs[0] = ref(99);
  finish({ content: 'queried host snapshot', observedAt: 100 });
  await assert.rejects(pending, error => error.code === 'STALE_VERSION');
});

test('final authoritative snapshot is checked even if version changes after final task read', async () => {
  const x = assembledFixture(), original = x.store.snapshot; let reads = 0;
  x.store.snapshot = () => { if (++reads === 2) x.task.version++; return original(); };
  await assert.rejects(new ContextAssembler({ store: x.store, tokenize: count, clock: () => 100 }).assemble({}, { taskRef: x.task.taskRef, expectedTaskVersion: 4, expectedAuthEpoch: 0 }), error => error.code === 'STALE_VERSION');
});
