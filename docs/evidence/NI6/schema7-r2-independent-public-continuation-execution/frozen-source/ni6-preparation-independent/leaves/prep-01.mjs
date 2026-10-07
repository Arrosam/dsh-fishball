import { assert, withLease, migrated, request, components, check, context, tally, assertCurrentness } from '../support.mjs';

export const run = () => withLease('PREP-01', async lease => {
  const state = migrated(lease), actual = components(state);
  const q = request(state, 'prep-01-new');
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }), null);
  const receipt = await actual.memory.prepareExecutionContext(q);
  const after = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  assert.equal(after.task.version, before.task.version + 1);
  assert.equal(after.task.authEpoch, before.task.authEpoch);
  assert.equal(after.semanticRevision, before.semanticRevision + 1);
  assert.equal(after.data.length, before.data.length + 2);
  assert.equal(actual.count.newCommitCallbacks, 1);
  assert.ok(actual.count.tokenizerCalls > 0);
  assert.deepEqual(actual.count.deliveries[0].input, q);
  assert.deepEqual(actual.count.deliveries[0].receipt, receipt);
  const proof = check(state, receipt), { envelope } = context(state, receipt);
  assertCurrentness(proof, { instructionsCurrent: true, memoryCurrent: true, taskSnapshotCurrent: true, reasonCodes: [] });
  assert.deepEqual(Object.keys(envelope).sort(), ['contractVersion','materialKind','sourceScope',
    'sourceTaskVersion','sourceAuthEpoch','generatedAt','sourceRefs','sourceProvenance','memory',
    'ledgerSnapshotDigest','content','inputCounts','retainedRefs','droppedRefs','verification'].sort());
  assert.equal(envelope.sourceTaskVersion, q.expectedTaskVersion);
  assert.equal(envelope.sourceAuthEpoch, q.expectedAuthEpoch);
  assert.deepEqual(envelope.memory, { namespaceRef: state.namespaceRef, revision: 0, provenance: [] });
  assert.deepEqual(envelope.inputCounts, receipt.inputCounts);
  assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content));
  assert.equal(envelope.inputCounts.tokens, envelope.inputCounts.bytes);
  assert.deepEqual(proof.check.winningSources.map(row => row.recordRef),
    [state.seed.goal.recordRef, state.seed.constraints.recordRef].sort());
  assert.deepEqual(proof.check.summaryChecks, []);
  assert.equal(proof.check.selectionMode, 'all_eligible');
  assert.match(actual.count.deliveries[0].checkRef, /^[a-f0-9]{64}$/);
  assert.equal(actual.count.deliveries[0].checkRef, proof.check.checkRef);
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }), null);
  return { committedRecords: after.data.length - before.data.length, taskIncrement: 1, semanticIncrement: 1,
    persistedEnvelopeFields: 15, ...tally(actual.count), memoryState: 'absent' };
});
