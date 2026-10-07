import { assert, withLease, migrated, request, components, expectCode, expectNoCallbacks,
  tally, check, finiteCanonical, sha256, copy } from '../support.mjs';

export const run = () => withLease('REQ-01', async lease => {
  const state = migrated(lease), actual = components(state);
  const q = request(state, 'req-01-complete-identity');
  const receipt = await actual.memory.prepareExecutionContext(q);
  const stable = tally(actual.count);
  const changes = [
    { terms: ['changed'] }, { recordRefs: [] }, { vectors: [] }, { limit: 10 },
    { now: q.now + 1 }, { expectedTaskVersion: q.expectedTaskVersion + 1 },
    { expectedAuthEpoch: q.expectedAuthEpoch + 1 },
  ];
  for (const change of changes) {
    await expectCode(() => actual.memory.prepareExecutionContext({ ...copy(q), ...change }), 'IDEMPOTENCY_CONFLICT');
    expectNoCallbacks(actual.count, stable);
  }
  assert.deepEqual(await actual.memory.prepareExecutionContext(copy(q)), receipt);
  expectNoCallbacks(actual.count, stable);

  const finite = request(state, 'req-01-finite-float-order', {
    terms: ['ordinary'], vectors: [[0.5, -0.25]], limit: 0,
    recordRefs: [state.seed.constraints.recordRef, state.seed.goal.recordRef, state.seed.goal.recordRef],
  });
  const finiteReceipt = await actual.memory.prepareExecutionContext(finite);
  const proof = check(state, finiteReceipt).check;
  const task = finiteReceipt.task;
  const expectedDigest = sha256(finiteCanonical(['df.prepared-context.request/v1', task.ownerRef,
    task.workspaceRef, state.namespaceRef, proof.preparationPrincipalRef, 'putPreparedContext', finite]));
  assert.equal(proof.preparationRequestDigest, expectedDigest);
  const afterFinite = tally(actual.count);
  assert.deepEqual(await actual.memory.prepareExecutionContext(copy(finite)), finiteReceipt);
  await expectCode(() => actual.memory.prepareExecutionContext({ ...copy(finite), recordRefs: [...finite.recordRefs].reverse() }), 'IDEMPOTENCY_CONFLICT');
  await expectCode(() => actual.memory.prepareExecutionContext({ ...copy(finite), recordRefs: finite.recordRefs.slice(0, 2) }), 'IDEMPOTENCY_CONFLICT');
  await expectCode(() => actual.memory.prepareExecutionContext({ ...copy(finite), vectors: [[0.75, -0.25]] }), 'IDEMPOTENCY_CONFLICT');
  expectNoCallbacks(actual.count, afterFinite);
  return { optionalPresenceConflicts: changes.length, orderedDuplicateRefsAndFiniteFloatDigest: true,
    completeIdentityReplay: true, ...tally(actual.count) };
});
