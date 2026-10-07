import { assert, withLease, migrated, request, components, expectCode, expectNoPreparation,
  close, open7, tally, expectNoCallbacks, check, context } from '../support.mjs';

export const run = () => withLease('PREP-12', async lease => {
  let state = migrated(lease, { recordLimit: 3 }), actual = components(state);
  const q = request(state, 'prep-12-two-record-capacity');
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  assert.equal(before.data.length, 2);
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'RECORD_LIMIT');
  assert.equal(actual.count.newCommitCallbacks, 0);
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: q.taskRef }), before);
  expectNoPreparation(state, q);
  close(lease, state.store);
  state = { ...open7(lease, { recordLimit: 4 }), seed: state.seed }; actual = components(state);
  const receipt = await actual.memory.prepareExecutionContext(q);
  assert.equal(state.store.snapshot(state.owner, { taskRef: q.taskRef }).data.length, 3);
  const full = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  const proof = check(state, receipt).check, { data } = context(state, receipt);
  const { content, ...metadata } = data;
  assert.deepEqual(full.data.filter(row => !before.data.some(prior => prior.recordRef === row.recordRef)), [metadata]);
  assert.equal(proof.contextRecordRef, receipt.recordRef);
  assert.equal(proof.contextDigest, receipt.digest);
  assert.equal(proof.committedTaskVersion, full.task.version);
  assert.equal(proof.semanticRevision, full.semanticRevision);
  const fresh = request(state, 'prep-12-capacity-exhausted');
  await expectCode(() => actual.memory.prepareExecutionContext(fresh), 'RECORD_LIMIT');
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: q.taskRef }), full);
  expectNoPreparation(state, fresh);
  const countersBeforeReplay = tally(actual.count);
  assert.deepEqual(await actual.memory.prepareExecutionContext(q), receipt);
  expectNoCallbacks(actual.count, countersBeforeReplay);
  assert.equal(actual.count.newCommitCallbacks, 1);
  return { recordLimit3WholePreparationRollback: true, recordLimit4ExactFit: true,
    fullQuotaHistoricalReplay: true, ...tally(actual.count), nativeAggregateCharges: 'NOT_AUTHORED_HOLD' };
});
