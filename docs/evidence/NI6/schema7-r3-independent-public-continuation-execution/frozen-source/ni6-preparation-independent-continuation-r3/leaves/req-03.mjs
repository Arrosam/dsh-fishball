import { assert, withLease, migrated, components, sizedRequest, expectCode, expectNoCallbacks, tally, copy } from '../support.mjs';

export const run = () => withLease('REQ-03', async lease => {
  const state = migrated(lease), actual = components(state);
  for (const bytes of [65535, 65536]) {
    const q = sizedRequest(state, `req-03-wire-${bytes}`, bytes);
    const receipt = await actual.memory.prepareExecutionContext(q);
    assert.equal(receipt.kind, 'context');
    const beforeReplay = tally(actual.count);
    assert.deepEqual(await actual.memory.prepareExecutionContext(copy(q)), receipt);
    expectNoCallbacks(actual.count, beforeReplay);
  }
  const before = state.store.snapshot(state.owner, { taskRef: state.seed.taskRef }), stable = tally(actual.count);
  await expectCode(() => actual.memory.prepareExecutionContext(sizedRequest(state, 'req-03-wire-65537', 65537)), 'INPUT_TOO_LARGE');
  expectNoCallbacks(actual.count, stable);
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: state.seed.taskRef }), before);
  return { wholeFiniteRequestBytes: [65535,65536,65537], exactBoundaryAccepted: true,
    overflowRefusesBeforeTokenizer: true, ...tally(actual.count) };
});
