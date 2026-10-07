import { assert, withLease, migrated, request, components, counters, check, tally } from '../support.mjs';

export const run = () => withLease('PREP-04', async lease => {
  const state = migrated(lease), count = counters();
  const first = components(state, { count }), second = components(state, { count });
  const q = request(state, 'prep-04-same-command');
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  // Both genuine methods enter before either promise settles. No store override,
  // forged delivery, lock shim or artificial protected-row barrier is involved.
  const pendingA = first.memory.prepareExecutionContext(q);
  const pendingB = second.memory.prepareExecutionContext(q);
  const results = await Promise.allSettled([pendingA, pendingB]);
  assert.deepEqual(results.map(row => row.status), ['fulfilled','fulfilled']);
  assert.deepEqual(results[0].value, results[1].value);
  const after = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  assert.equal(after.task.version, before.task.version + 1);
  assert.equal(after.semanticRevision, before.semanticRevision + 1);
  assert.equal(after.data.length, before.data.length + 2);
  assert.equal(count.newCommitCallbacks, 1);
  assert.equal(check(state, results[0].value).check.checkRef, count.deliveries[0].checkRef);
  return { concurrentInvocations: 2, successfulReplies: 2, committedRecords: 2,
    taskIncrement: 1, semanticIncrement: 1, ...tally(count), crossProcessRace: 'NOT_AUTHORED_HOLD' };
});
