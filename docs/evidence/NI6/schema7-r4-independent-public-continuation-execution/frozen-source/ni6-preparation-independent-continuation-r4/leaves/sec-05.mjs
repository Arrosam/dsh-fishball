import { assert, withLease, migrated, request, components, expectCode, expectNoCallbacks,
  tally, sizedRequest, finiteCanonical } from '../support.mjs';

export const run = () => withLease('SEC-05', async lease => {
  const state = migrated(lease), slash = String.fromCharCode(92);
  const raw = 'ni6-alpha' + slash + 'omega', encodedOnly = 'ni6-alpha' + slash + slash + 'omega';
  const q = request(state, 'sec-05-encoded-only-existing', { terms: [raw] });
  assert.equal(q.terms[0].includes(encodedOnly), false);
  assert.equal(finiteCanonical(q).includes(encodedOnly), true);
  await components(state).memory.prepareExecutionContext(q);
  const actual = components(state, { knownSecrets: [encodedOnly] });
  const stable = tally(actual.count);
  await expectCode(() => actual.memory.prepareExecutionContext(q), 'SECRET_REJECTED');
  await expectCode(() => actual.memory.prepareExecutionContext(request(state, 'sec-05-encoded-only-fresh', { terms: [raw] })), 'SECRET_REJECTED');
  expectNoCallbacks(actual.count, stable);

  const secret = 'ni6-plain-priority-secret', priority = components(state, { knownSecrets: [secret] });
  const before = tally(priority.count), taskBefore = state.store.snapshot(state.owner, { taskRef: state.seed.taskRef });
  await expectCode(() => priority.memory.prepareExecutionContext(request(state, 'sec-05-unknown-key', { terms: [secret], extra: true })), 'MEMORY_INVALID');
  await expectCode(() => priority.memory.prepareExecutionContext(request(state, 'sec-05-own-undefined', { terms: [secret], limit: undefined })), 'INVALID_INPUT');
  await expectCode(() => priority.memory.prepareExecutionContext(request(state, 'sec-05-term-too-wide', { terms: [secret + 'x'.repeat(8193)] })), 'INVALID_INPUT');
  const oversized = sizedRequest(state, 'sec-05-whole-too-wide', 65537);
  oversized.terms[0] = secret + oversized.terms[0].slice(secret.length);
  assert.equal(Buffer.byteLength(finiteCanonical(oversized)), 65537);
  await expectCode(() => priority.memory.prepareExecutionContext(oversized), 'INPUT_TOO_LARGE');
  expectNoCallbacks(priority.count, before);
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: state.seed.taskRef }), taskBefore);
  return { originalEncodedOnlyRejectionRetained: true, structureAndSizeErrorsPrecedeSecretError: true,
    ...tally(priority.count) };
});
