import { assert, withLease, migrated, request, components, summary, remember, ordinaryMemory,
  check, context, NOW, tally } from '../support.mjs';

export const run = () => withLease('PREP-11', async lease => {
  const state = migrated(lease);
  const retained = summary(state, 'prep-11-current-summary', { fresh: true, content: 'Small current background, no authority.' });
  remember(state, 'prep-11-escaped-memory', 'ni6memory ' + '"'.repeat(20000));
  const retrieved = ordinaryMemory(state).retrieve({ terms: ['ni6memory'], now: NOW, limit: 1 });
  assert.equal(retrieved.candidates.length, 1);
  const actual = components(state, { byteLimit: 65536, tokenLimit: 65536 });
  const receipt = await actual.memory.prepareExecutionContext(request(state, 'prep-11-final-envelope', { terms: ['ni6memory'], limit: 1 }));
  const proof = check(state, receipt), { data, envelope } = context(state, receipt);
  assert.equal(proof.check.summaryChecks.find(row => row.recordRef === retained.receipt.recordRef).disposition, 'retained_background');
  assert.ok(envelope.retainedRefs.includes(retained.receipt.recordRef));
  assert.equal(envelope.memory.revision, 1);
  assert.deepEqual(envelope.memory.provenance, []);
  assert.equal(envelope.droppedRefs.length, 1);
  assert.equal(envelope.droppedRefs.includes(retained.receipt.recordRef), false);
  assert.ok(Buffer.byteLength(data.content) <= 65536);
  assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content));
  assert.equal(envelope.inputCounts.tokens, envelope.inputCounts.bytes);
  assert.equal(envelope.content.includes('"'.repeat(20000)), false);
  return { actualMemoryCandidateDroppedByFinalEnvelope: true, originalSummaryRemainsProtectedInSecondAssembly: true,
    persistedMemoryProvenanceCount: 0, contextBytes: receipt.byteLength, ...tally(actual.count) };
});
