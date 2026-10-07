import { assert, withLease, migrated, TASK_A, TASK_B, ref, request, components,
  expectCode, expectCodeSync, counters, tally, MemoryAdapter } from '../support.mjs';

export const run = () => withLease('PREP-08', async lease => {
  const state = migrated(lease, { boundIssuer: true }, [TASK_A, TASK_B]);
  const count = counters();
  const callerB = components(state, { handle: state.callerB, count });
  const qA = request(state, 'prep-08-task-a');
  const taskB = state.store.task(state.owner, ref(TASK_B));
  const qB = { ...qA, taskRef: taskB.taskRef, commandRef: ref('prep-08-task-b'),
    expectedTaskVersion: taskB.version, expectedAuthEpoch: taskB.authEpoch };
  await expectCode(() => callerB.memory.prepareExecutionContext(qA), 'UNAUTHORIZED');
  await expectCode(() => callerB.memory.prepareExecutionContext(qB), 'UNAUTHORIZED');
  expectCodeSync(() => state.store.preparedContextCommandReceipt(state.capability, { request: qB }), 'UNAUTHORIZED');
  assert.deepEqual(tally(count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  const admitted = components(state, { handle: state.issuer });
  expectCodeSync(() => new MemoryAdapter({ store: state.store, handle: state.issuer,
    namespaceRef: ref('prep-08-other-namespace'), preparationCapability: state.capability,
    contextAssembler: admitted.assembler, tokenize: admitted.tokenize, onPreparedCommit: () => {} }), 'UNAUTHORIZED');
  const receipt = await admitted.memory.prepareExecutionContext(qA);
  expectCodeSync(() => state.store.readPreparedContextCheck(state.callerB, {
    taskRef: receipt.task.taskRef, contextRecordRef: receipt.recordRef,
    expectedTaskVersion: receipt.task.version, expectedAuthEpoch: receipt.task.authEpoch,
  }), 'UNAUTHORIZED');
  assert.equal(admitted.count.newCommitCallbacks, 1);
  return { genuineIssuerCallerTaskDenials: 3, genuineNamespaceDenial: true,
    admittedTaskACommit: true, deniedCounters: tally(count), fabricatedCapabilities: 0 };
});
