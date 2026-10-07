import { assert, withLease, migrated, request, components, check, remember, writeGoal,
  ordinaryMemory, ref, tally, expectNoCallbacks } from '../support.mjs';

export const run = () => withLease('PREP-13', async lease => {
  const state = migrated(lease), actual = components(state);
  const q = request(state, 'prep-13-currentness-axes');
  const receipt = await actual.memory.prepareExecutionContext(q);
  const t = state.store.task(state.owner, q.taskRef);
  state.store.putData(state.owner, { taskRef: q.taskRef, commandRef: ref('prep-13-progress-only'),
    kind: 'progress', content: 'Ordinary progress; does not replace owner instructions.', sourceRef: ref('prep-13-progress-source'),
    expectedTaskVersion: t.version, expectedAuthEpoch: t.authEpoch });
  assert.deepEqual(check(state, receipt).currentness, { instructionsCurrent: true, memoryCurrent: true,
    taskSnapshotCurrent: false, reasonCodes: ['TASK_SNAPSHOT_CHANGED'] });
  remember(state, 'prep-13-memory-only');
  assert.deepEqual(check(state, receipt).currentness, { instructionsCurrent: true, memoryCurrent: false,
    taskSnapshotCurrent: false, reasonCodes: ['MEMORY_CHANGED','TASK_SNAPSHOT_CHANGED'] });
  writeGoal(state, 'prep-13-winning-source');
  assert.deepEqual(check(state, receipt).currentness, { instructionsCurrent: false, memoryCurrent: false,
    taskSnapshotCurrent: false, reasonCodes: ['MEMORY_CHANGED','SEMANTIC_CHANGED','TASK_SNAPSHOT_CHANGED','WINNING_SOURCE_CHANGED'] });
  const currentQ = request(state, 'prep-13-new-current'), currentReceipt = await actual.memory.prepareExecutionContext(currentQ);
  assert.deepEqual(check(state, currentReceipt).currentness, { instructionsCurrent: true, memoryCurrent: true,
    taskSnapshotCurrent: true, reasonCodes: [] });
  const memory = ordinaryMemory(state);
  memory.deleteNamespace({ commandRef: ref('prep-13-memory-tombstone'), expectedRevision: memory.state().revision });
  assert.deepEqual(check(state, currentReceipt).currentness, { instructionsCurrent: true, memoryCurrent: false,
    taskSnapshotCurrent: true, reasonCodes: ['MEMORY_CHANGED'] });
  const stable = tally(actual.count);
  assert.deepEqual(await actual.memory.prepareExecutionContext(currentQ), currentReceipt);
  expectNoCallbacks(actual.count, stable);
  return { independentPublicCurrentnessAxes: true, tombstoneDoesNotBecomeAbsent: true,
    missingAssociatedEdgeAndSourceRemoval: 'NOT_AUTHORED_HOLD', ...tally(actual.count) };
});
