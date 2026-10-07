// Inert public-path helper. Synthetic secret bytes stay in leaf memory, not reports.
import { assert, withLease, migrated, request, components, copy, close, open7,
  expectCode, expectCodeSync, expectNoCallbacks, tally } from './support.mjs';

export const runSecretCase = (id, secret) => withLease(id, async lease => {
  let state = migrated(lease);
  const admitted = components(state);
  const q = request(state, `${id.toLowerCase()}-genuine-original`, { terms: [secret] });
  const receipt = await admitted.memory.prepareExecutionContext(q);
  assert.equal(admitted.count.newCommitCallbacks, 1);
  const guarded = components(state, { knownSecrets: [secret] });
  const before = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  await expectCode(() => guarded.memory.prepareExecutionContext(copy(q)), 'SECRET_REJECTED');
  await expectCode(() => guarded.memory.prepareExecutionContext(request(state, `${id.toLowerCase()}-fresh-secret`, { terms: [secret] })), 'SECRET_REJECTED');
  assert.deepEqual(tally(guarded.count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: q.taskRef }), before);
  // Nonmatching values preserve admitted quotes/backslashes/LF exactly. The LF
  // leaf also distinguishes actual U+000A from literal backslash+n spelling.
  const benignTerms = id === 'SEC-01' ? ['ordinary nonmatching "quote" search']
    : id === 'SEC-02' ? ['ordinary nonmatching ' + String.fromCharCode(92) + 'slash search']
    : id === 'SEC-03' ? ['ordinary nonmatching ' + String.fromCharCode(10) + 'line search',
        secret.replaceAll(String.fromCharCode(10), String.fromCharCode(92) + 'n')]
    : ['ordinary nonmatching search'];
  for (let index = 0; index < benignTerms.length; index++) {
    const benign = request(state, `${id.toLowerCase()}-benign-${index}`, { terms: [benignTerms[index]] });
    assert.equal(benign.terms[0].includes(secret), false);
    const benignReceipt = await guarded.memory.prepareExecutionContext(benign);
    assert.deepEqual(guarded.count.deliveries[index].input, benign);
    const stable = tally(guarded.count);
    assert.deepEqual(await guarded.memory.prepareExecutionContext(copy(benign)), benignReceipt);
    expectNoCallbacks(guarded.count, stable);
  }
  assert.equal(guarded.count.newCommitCallbacks, benignTerms.length);
  assert.deepEqual(await admitted.memory.prepareExecutionContext(copy(q)), receipt);

  close(lease, state.store);
  state = { ...open7(lease, { forbiddenSecrets: [secret] }), seed: state.seed };
  const storeGuarded = components(state, { knownSecrets: [] });
  const reopenedBefore = state.store.snapshot(state.owner, { taskRef: q.taskRef });
  expectCodeSync(() => state.store.preparedContextCommandReceipt(state.capability, { request: copy(q) }), 'SECRET_REJECTED');
  await expectCode(() => storeGuarded.memory.prepareExecutionContext(copy(q)), 'SECRET_REJECTED');
  expectCodeSync(() => state.store.preparedContextCommandReceipt(state.capability, {
    request: request(state, `${id.toLowerCase()}-store-fresh`, { terms: [secret] }),
  }), 'SECRET_REJECTED');
  assert.deepEqual(tally(storeGuarded.count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: q.taskRef }), reopenedBefore);
  return { configuredRawSecretHistoricalAndFreshRefusal: true,
    authenticAdapterAndOriginalStoreCallers: true, benignControlCommitted: true,
    rejectedAdapterCounters: { tokenizerCalls: 0, newCommitCallbacks: 0 },
    reopenedStoreCounters: tally(storeGuarded.count), inaccessibleStoreReadCount: 'SOURCE_ONLY' };
});
