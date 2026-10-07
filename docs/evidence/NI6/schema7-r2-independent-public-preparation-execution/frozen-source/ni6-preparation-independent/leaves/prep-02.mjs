import { assert, withLease, migrated, request, components, check, writeGoal, remember,
  ordinaryMemory, close, open7, ref, tally, expectNoCallbacks, expectCode } from '../support.mjs';

export const run = () => withLease('PREP-02', async lease => {
  let state = migrated(lease), actual = components(state);
  const q = request(state, 'prep-02-original');
  const receipt = await actual.memory.prepareExecutionContext(q);
  const replay = async () => {
    const before = tally(actual.count), taskBefore = state.store.task(state.owner, q.taskRef);
    assert.deepEqual(await actual.memory.prepareExecutionContext(q), receipt);
    expectNoCallbacks(actual.count, before);
    assert.deepEqual(state.store.task(state.owner, q.taskRef), taskBefore);
  };
  await replay();
  writeGoal(state, 'prep-02-later-goal');
  let t = state.store.task(state.owner, q.taskRef);
  state.store.control(state.owner, { taskRef: q.taskRef, commandRef: ref('prep-02-pause'),
    expectedTaskVersion: t.version, expectedAuthEpoch: t.authEpoch, kind: 'pause' });
  await replay();
  t = state.store.task(state.owner, q.taskRef);
  state.store.control(state.owner, { taskRef: q.taskRef, commandRef: ref('prep-02-resume'),
    expectedTaskVersion: t.version, expectedAuthEpoch: t.authEpoch, kind: 'resume' });
  assert.ok(state.store.task(state.owner, q.taskRef).authEpoch > q.expectedAuthEpoch);
  await replay();
  remember(state, 'prep-02-live-memory');
  await replay();
  const memory = ordinaryMemory(state);
  const deletion = memory.deleteNamespace({ commandRef: ref('prep-02-delete-memory'), expectedRevision: memory.state().revision });
  assert.equal(deletion.deleted, true);
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }).deleted, true);
  await replay();
  const proof = check(state, receipt);
  assert.deepEqual(proof.currentness, { instructionsCurrent: false, memoryCurrent: false, taskSnapshotCurrent: false,
    reasonCodes: ['MEMORY_CHANGED','SEMANTIC_CHANGED','TASK_SNAPSHOT_CHANGED','WINNING_SOURCE_CHANGED'] });
  const beforeFresh = tally(actual.count), fresh = request(state, 'prep-02-fresh-after-delete');
  await expectCode(() => actual.memory.prepareExecutionContext(fresh), 'MEMORY_DELETED');
  expectNoCallbacks(actual.count, beforeFresh);
  close(lease, state.store);
  state = { ...open7(lease), seed: state.seed };
  actual = components(state);
  await replay();
  assert.deepEqual(tally(actual.count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }).deleted, true);
  return { absentLiveTombstoneReplay: true, oldCASAndAuthorityReplay: true, genuineReopenReplay: true,
    reopenedCounters: tally(actual.count), inaccessibleStoreReadCount: 'SOURCE_ONLY' };
});
