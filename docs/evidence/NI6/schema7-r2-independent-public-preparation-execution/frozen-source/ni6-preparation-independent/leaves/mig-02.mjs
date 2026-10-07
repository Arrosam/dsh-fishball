import { assert, withLease, open6, close, open7, OriginalMemory, MemoryAdapter, NOW, ref } from '../support.mjs';

export const run = () => withLease('MIG-02', async lease => {
  const original = open6(lease), namespaceRef = ref('ni6-independent-memory');
  const memory = new OriginalMemory({ store: original.store, handle: original.owner, namespaceRef });
  const rememberInput = { commandRef: ref('mig-02-memory-only'), expectedRevision: 0,
    candidate: { kind: 'preference', content: { text: 'Synthetic namespace-only memory; no task authority.' },
      sourceRefs: [ref('mig-02-synthetic-memory-source')], confidence: 0.5, observedAt: NOW } };
  const originalReceipt = memory.remember(rememberInput);
  const originalState = memory.state();
  assert.deepEqual(original.store.listTasks(original.owner), []);
  close(lease, original.store);
  const state = open7(lease);
  const before = state.store.getMemory(state.owner, { namespaceRef });
  const status = state.store.preparedContextStatus(state.capability, {});
  assert.equal(status.ready, true);
  assert.deepEqual(state.store.listTasks(state.owner), []);
  assert.deepEqual(state.store.getMemory(state.owner, { namespaceRef }), before);
  const migratedMemory = new MemoryAdapter({
    store: state.store, handle: state.owner, namespaceRef });
  assert.deepEqual(migratedMemory.state(), originalState);
  assert.deepEqual(migratedMemory.remember(rememberInput), originalReceipt);
  return { namespaceOnlyPreserved: true, taskCount: 0, memoryRevision: originalState.revision,
    tokenizerCalls: 0, newCommitCallbacks: 0, privateRegistryCounts: 'SOURCE_ONLY' };
});
