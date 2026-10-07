import { assert, withLease, migrated, request, components, remember, expectCode, expectNoPreparation, tally } from '../support.mjs';

export const run = () => withLease('PREP-07', async lease => {
  const state = migrated(lease);
  let changed = false;
  const actual = components(state, { onToken: () => {
    if (!changed) { changed = true; remember(state, 'prep-07-tokenizer-memory-write'); }
  } });
  const q = request(state, 'prep-07-stale-memory'), before = state.store.task(state.owner, q.taskRef);
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'STALE_MEMORY');
  assert.equal(changed, true);
  assert.ok(actual.count.tokenizerCalls > 0);
  assert.equal(actual.count.newCommitCallbacks, 0);
  assert.deepEqual(state.store.task(state.owner, q.taskRef), before);
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }).revision, 1);
  expectNoPreparation(state, q);
  return { onlyGenuineMemoryWriteCommitted: true, preparationRefusedAfterMemoryRace: true, ...tally(actual.count) };
});
