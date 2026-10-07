import { assert, withLease, migrated, request, components, expectCode, expectNoPreparation,
  tally, close, open7 } from '../support.mjs';

export const run = () => withLease('PREP-09', async lease => {
  let state = migrated(lease, { metadataBytes: 1024 });
  let actual = components(state);
  const status = state.store.preparedContextStatus(state.capability, {});
  assert.equal(status.ready, false);
  assert.equal(status.phase, 'limited');
  assert.equal(status.reasonCode, 'CONTEXT_PREPARATION_LIMIT');
  assert.equal(status.bounds.metadataByteLimit, 1024);
  assert.ok(status.bounds.minBindingBytes > 1024);
  assert.equal(state.store.diagnostics().limits.maxMetadataBytes, 1024);
  const q = request(state, 'prep-09-too-small');
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'CONTEXT_PREPARATION_LIMIT');
  assert.deepEqual(tally(actual.count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: q.taskRef }), before);
  expectNoPreparation(state, q);
  close(lease, state.store);
  // An explicit fresh trusted constructor selects 4096; product never expands 1024.
  state = { ...open7(lease, { metadataBytes: 4096 }), seed: state.seed };
  actual = components(state);
  assert.equal(state.store.preparedContextStatus(state.capability, {}).ready, true);
  const receipt = await actual.memory.prepareExecutionContext(request(state, 'prep-09-explicit-4096'));
  assert.equal(receipt.kind, 'context');
  assert.equal(actual.count.newCommitCallbacks, 1);
  assert.equal(state.store.diagnostics().limits.maxMetadataBytes, 4096);
  return { selected1024RefusedBeforeTokenizer: true, selected4096Accepted: true,
    automaticLimitGrowth: false, wrapperExactThreshold: 'NOT_AUTHORED_HOLD' };
});
