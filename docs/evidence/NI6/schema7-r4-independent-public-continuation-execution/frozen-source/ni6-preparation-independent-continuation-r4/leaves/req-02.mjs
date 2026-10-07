import { assert, withLease, migrated, request, components, expectCode, expectNoCallbacks, tally } from '../support.mjs';

export const run = () => withLease('REQ-02', async lease => {
  const state = migrated(lease), actual = components(state);
  const accepted = [
    { terms: [] }, { terms: Array.from({ length: 32 }, () => 'x') },
    { terms: ['x'.repeat(8191)] }, { terms: ['x'.repeat(8192)] },
    { limit: 0 }, { limit: 32 }, { vectors: Array.from({ length: 32 }, () => []) },
    { vectors: [Array.from({ length: 128 }, () => 0)] }, { vectors: [[0.5, -0.25]] },
    { recordRefs: Array.from({ length: 64 }, () => state.seed.goal.recordRef) },
  ];
  for (let index = 0; index < accepted.length; index++) {
    const receipt = await actual.memory.prepareExecutionContext(request(state, `req-02-accepted-${index}`, accepted[index]));
    assert.equal(receipt.kind, 'context');
  }
  const refused = [
    { terms: Array.from({ length: 33 }, () => 'x') }, { terms: ['x'.repeat(8193)] },
    { terms: ['a\0b'] }, { terms: ['\ud800'] }, { terms: new Array(1) },
    { vectors: Array.from({ length: 33 }, () => []) }, { vectors: [Array.from({ length: 129 }, () => 0)] },
    { vectors: [[NaN]] }, { vectors: [[Infinity]] }, { vectors: [[1e39]] },
    { vectors: [[Number.MAX_SAFE_INTEGER + 1]] }, { limit: -1 }, { limit: 33 },
    { limit: undefined }, { recordRefs: undefined }, { vectors: undefined },
    { recordRefs: Array.from({ length: 65 }, () => state.seed.goal.recordRef) },
    { generationRef: state.seed.goal.recordRef }, { extra: true },
  ];
  const refusedCodes = Object.freeze([
    'INVALID_INPUT', // 0: terms length 33
    'INVALID_INPUT', // 1: term bytes 8193
    'INVALID_INPUT', // 2: NUL term
    'INVALID_INPUT', // 3: unpaired surrogate term
    'INVALID_INPUT', // 4: sparse terms
    'INVALID_INPUT', // 5: vectors length 33
    'INVALID_INPUT', // 6: vector length 129
    'INVALID_INPUT', // 7: NaN component
    'INVALID_INPUT', // 8: Infinity component
    'INVALID_INPUT', // 9: non-finite Float32 component
    'INVALID_INPUT', // 10: unsafe integer component
    'INVALID_INPUT', // 11: limit -1
    'INVALID_INPUT', // 12: limit 33
    'INVALID_INPUT', // 13: supplied undefined limit
    'INVALID_INPUT', // 14: supplied undefined recordRefs
    'INVALID_INPUT', // 15: supplied undefined vectors
    'INVALID_INPUT', // 16: recordRefs length 65
    'MEMORY_INVALID', // 17: unsupported generationRef field
    'MEMORY_INVALID', // 18: unsupported extra field
  ]);
  assert.equal(refusedCodes.length, refused.length);
  const stable = tally(actual.count), before = state.store.snapshot(state.owner, { taskRef: state.seed.taskRef });
  for (let index = 0; index < refused.length; index++) {
    await expectCode(() => actual.memory.prepareExecutionContext(request(state, `req-02-refused-${index}`, refused[index])), refusedCodes[index]);
    expectNoCallbacks(actual.count, stable);
  }
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: state.seed.taskRef }), before);
  return { acceptedIndependentFaces: accepted.length, invalidClosedFaces: refused.length,
    noCartesianMaximumPromise: true, ...tally(actual.count) };
});
