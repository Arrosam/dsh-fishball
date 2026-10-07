import { assert, withLease, open6, close, open7, seedTask, OriginalStore,
  OriginalAssembler, OriginalMemory, FULL_LIMITS, SCOPE, NOW, ref, request,
  components, counters, tally, expectCodeSync } from '../support.mjs';

export const run = () => withLease('MIG-01', async lease => {
  const original = open6(lease);
  const seed = seedTask(original.store, original.owner);
  const tokenize = text => Buffer.byteLength(text);
  const namespaceRef = ref('ni6-independent-memory');
  const assembler = new OriginalAssembler({ store: original.store, tokenize, clock: () => NOW });
  const memory = new OriginalMemory({ store: original.store, handle: original.owner,
    namespaceRef, contextAssembler: assembler, tokenize });
  const oldState = { ...original, seed };
  const q = request(oldState, 'mig-01-original-six-context');
  const oldContext = await memory.prepareExecutionContext(q);
  const oldSnapshot = original.store.snapshot(original.owner, { taskRef: seed.taskRef });
  const oldData = original.store.readData(original.owner, { taskRef: seed.taskRef, recordRef: oldContext.recordRef });
  assert.equal(original.store.diagnostics().schemaVersion, 6);
  close(lease, original.store);

  const state = { ...open7(lease), seed };
  assert.equal(state.store.diagnostics().schemaVersion, 7);
  const migratedSnapshot = state.store.snapshot(state.owner, { taskRef: seed.taskRef });
  assert.deepEqual(migratedSnapshot.task, oldSnapshot.task);
  assert.deepEqual(migratedSnapshot.data, oldSnapshot.data);
  assert.deepEqual(migratedSnapshot.actions, oldSnapshot.actions);
  assert.deepEqual(migratedSnapshot.workers, oldSnapshot.workers);
  assert.deepEqual(state.store.readData(state.owner, { taskRef: seed.taskRef, recordRef: oldContext.recordRef }), oldData);
  assert.deepEqual(state.store.intake(state.owner, seed.intakeInput), seed.intake);
  assert.deepEqual(state.store.putData(state.owner, seed.constraintsInput), seed.constraints);
  const count = counters(), actual = components(state, { count });
  await assert.rejects(actual.memory.prepareExecutionContext(q), error => error?.code === 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(tally(count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  expectCodeSync(() => state.store.readPreparedContextCheck(state.owner, {
    taskRef: seed.taskRef, contextRecordRef: oldContext.recordRef,
    expectedTaskVersion: oldSnapshot.task.version, expectedAuthEpoch: oldSnapshot.task.authEpoch,
  }), 'PREPARED_CONTEXT_UNAVAILABLE');

  const backupOwner = {};
  const backup = new OriginalStore({ databasePath: `${lease.databasePath}.schema-6.backup`,
    encryptionKey: Buffer.alloc(32, 0x6a), principals: [{ handle: backupOwner, role: 'owner', scope: { ...SCOPE } }],
    limits: { ...FULL_LIMITS }, clock: () => NOW, forbiddenSecrets: [] });
  lease.stores.add(backup);
  assert.equal(backup.diagnostics().schemaVersion, 6);
  assert.deepEqual(backup.snapshot(backupOwner, { taskRef: seed.taskRef }), oldSnapshot);
  close(lease, backup);
  close(lease, state.store);
  expectCodeSync(() => new OriginalStore({ databasePath: lease.databasePath,
    encryptionKey: Buffer.alloc(32, 0x6a), principals: [{ handle: {}, role: 'owner', scope: { ...SCOPE } }],
    limits: { ...FULL_LIMITS }, clock: () => NOW, forbiddenSecrets: [] }), 'SCHEMA_FUTURE');
  return { publicFactsPreserved: true, recoverablePublicSixBackup: true,
    oldSixRefusesSeven: true, originalSixContextNotAdopted: true, ...tally(count) };
});
