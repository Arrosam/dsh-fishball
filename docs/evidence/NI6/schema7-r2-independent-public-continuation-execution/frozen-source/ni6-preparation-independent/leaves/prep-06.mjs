import { assert, withLease, migrated, request, components, writeGoal, expectCode, expectNoPreparation, tally } from '../support.mjs';

export const run = () => withLease('PREP-06', async lease => {
  const state = migrated(lease);
  let changed = false;
  const actual = components(state, { onToken: () => {
    if (!changed) { changed = true; writeGoal(state, 'prep-06-tokenizer-owner-write'); }
  } });
  const q = request(state, 'prep-06-stale-during-tokenizer');
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'STALE_VERSION');
  assert.equal(changed, true);
  assert.ok(actual.count.tokenizerCalls > 0);
  assert.equal(actual.count.newCommitCallbacks, 0);
  const after = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  assert.equal(after.task.version, before.task.version + 1);
  assert.equal(after.data.length, before.data.length + 1);
  expectNoPreparation(state, q);
  return { onlyGenuineOwnerWriteCommitted: true, preparationRefusedAfterTokenizerRace: true, ...tally(actual.count) };
});
