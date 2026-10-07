import { assert, withLease, open7, request, seedTask } from '../support.mjs';

export const run = () => withLease('MIG-03', async lease => {
  const state = open7(lease);
  assert.equal(state.store.diagnostics().schemaVersion, 7);
  assert.deepEqual(state.store.listTasks(state.owner), []);
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }), null);
  assert.equal(state.store.preparedContextStatus(state.capability, {}).ready, true);
  assert.equal(state.store.preparedContextStatus(state.capability, {}).ready, true);
  assert.deepEqual(state.store.listTasks(state.owner), []);
  assert.equal(state.store.getMemory(state.owner, { namespaceRef: state.namespaceRef }), null);
  state.seed = seedTask(state.store, state.owner);
  const q = request(state, 'mig-03-first-public-scope');
  assert.equal(state.store.preparedContextCommandReceipt(state.capability, { request: q }), null);
  return { freshSeven: true, statusDoesNotAllocatePublicTaskOrMemory: true,
    tokenizerCalls: 0, newCommitCallbacks: 0, privateRegistryCounts: 'SOURCE_ONLY' };
});
