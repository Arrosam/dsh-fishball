import { assert, withLease, migrated, request, components, tally, expectCode, expectNoCallbacks, check } from '../support.mjs';

export const run = () => withLease('PREP-05', async lease => {
  const state = migrated(lease);
  const actual = components(state, { onCommit: () => { throw new Error('Synthetic public observer interruption'); } });
  const q = request(state, 'prep-05-observer-interrupted');
  const before = state.store.task(state.owner, q.taskRef);
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'CONTEXT_UNCERTAIN');
  assert.equal(actual.count.newCommitCallbacks, 1);
  assert.equal(state.store.task(state.owner, q.taskRef).version, before.version + 1);
  const durable = state.store.preparedContextCommandReceipt(state.capability, { request: q });
  assert.ok(durable);
  assert.deepEqual(durable.receipt, actual.count.deliveries[0].receipt);
  const after = tally(actual.count);
  assert.deepEqual(await actual.memory.prepareExecutionContext(q), durable.receipt);
  expectNoCallbacks(actual.count, after);
  assert.equal(check(state, durable.receipt).check.checkRef, durable.checkRef);
  return { durableCommitAfterObserverInterruption: true, replayCreatesNoNewObservation: true,
    ...tally(actual.count), nativeOriginPublication: 'NOT_AUTHORED_HOLD' };
});
