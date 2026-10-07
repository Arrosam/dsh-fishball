import { assert, withLease, migrated, request, components, copy, tally, expectNoCallbacks } from '../support.mjs';

export const run = () => withLease('REQ-04', async lease => {
  const state = migrated(lease);
  const q = request(state, 'req-04-detached-before-tokenizer', { terms: ['original'], vectors: [[0.5]], recordRefs: [state.seed.goal.recordRef] });
  const submitted = copy(q);
  let changed = false;
  const actual = components(state, { onToken: () => {
    if (!changed) { changed = true; q.terms.push('caller-mutation'); q.vectors[0][0] = 0.75; q.recordRefs.length = 0; }
  } });
  const receipt = await actual.memory.prepareExecutionContext(q);
  assert.equal(changed, true);
  assert.notDeepEqual(q, submitted);
  assert.deepEqual(actual.count.deliveries[0].input, submitted);
  assert.ok(Object.isFrozen(actual.count.deliveries[0].input.terms));
  const before = tally(actual.count);
  assert.deepEqual(await actual.memory.prepareExecutionContext(submitted), receipt);
  expectNoCallbacks(actual.count, before);
  return { originalCallerMutationIsDetached: true, observerGetsSubmittedRequest: true, ...tally(actual.count) };
});
