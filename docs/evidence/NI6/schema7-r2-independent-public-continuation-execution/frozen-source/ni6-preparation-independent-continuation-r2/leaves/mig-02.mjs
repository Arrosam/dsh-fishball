import { assert, withLease, open6, close, open7, OriginalMemory, MemoryAdapter, NOW, ref } from '../support.mjs';

export const run = () => withLease('MIG-02', async lease => {
  const original = open6(lease), namespaceRef = ref('ni6-independent-memory');
  const memory = new OriginalMemory({ store: original.store, handle: original.owner, namespaceRef });
  const rememberInput = { commandRef: ref('mig-02-memory-only'), expectedRevision: 0,
    candidate: { kind: 'preference', content: { text: 'Synthetic namespace-only memory; no task authority.' },
      sourceRefs: [ref('mig-02-synthetic-memory-source')], confidence: 0.5, observedAt: NOW } };
  const originalReceipt = memory.remember(rememberInput);
  const originalState = memory.state();
  assert.equal(originalReceipt.namespaceRef, namespaceRef);
  assert.equal(originalReceipt.revision, 1);
  assert.equal(originalReceipt.deleted, false);
  assert.equal(originalReceipt.result.authority, 'memory_only');
  assert.equal(originalReceipt.result.id, originalState.projection.facts[0].id);
  assert.equal(originalState.revision, originalReceipt.revision);
  assert.equal(originalState.projection.facts.length, 1);
  assert.deepEqual(originalState.projection.facts[0].sourceRefs, rememberInput.candidate.sourceRefs);

  // Exactly one genuine original6 duplicate captures the historical API value.
  // Do not construct, strip or normalize a receipt to make these phases equal.
  const originalWarmReplay = memory.remember(rememberInput);
  assert.equal(originalWarmReplay.deduplicated, true);
  assert.equal(Object.hasOwn(originalWarmReplay, 'result'), false);
  assert.equal(originalWarmReplay.recordRef, originalReceipt.recordRef);
  assert.equal(originalWarmReplay.digest, originalReceipt.digest);
  assert.equal(originalWarmReplay.requestDigest, originalReceipt.requestDigest);
  assert.equal(originalWarmReplay.revision, originalReceipt.revision);
  assert.equal(originalWarmReplay.namespaceRef, originalReceipt.namespaceRef);
  assert.equal(originalWarmReplay.ownerRef, originalReceipt.ownerRef);
  assert.equal(originalWarmReplay.workspaceRef, originalReceipt.workspaceRef);
  assert.deepEqual(originalWarmReplay.sourceRefs, originalReceipt.sourceRefs);
  assert.deepEqual(memory.state(), originalState);
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
  const migratedReplay = migratedMemory.remember(rememberInput);
  assert.deepEqual(migratedReplay, originalWarmReplay);
  assert.deepEqual(migratedMemory.state(), originalState);
  assert.deepEqual(state.store.getMemory(state.owner, { namespaceRef }), before);
  assert.deepEqual(state.store.listTasks(state.owner), []);
  return { namespaceOnlyPreserved: true, taskCount: 0, memoryRevision: originalState.revision,
    originalSixWarmReplayCaptured: true, exactHistoricalRepresentationPreserved: true,
    originalSixDuplicateCalls: 1, tokenizerCalls: 0, newCommitCallbacks: 0,
    privateRegistryCounts: 'SOURCE_ONLY' };
});
