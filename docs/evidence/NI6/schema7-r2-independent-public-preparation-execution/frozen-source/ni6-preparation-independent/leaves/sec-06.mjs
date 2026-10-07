import { assert, withLease, migrated, request, components, expectCode, tally } from '../support.mjs';

export const run = () => withLease('SEC-06', async lease => {
  const state = migrated(lease), actual = components(state, { knownSecrets: [] });
  const patterns = ['sk_live_abcdefgh', 'sk-proj-abcdefgh', 'Bearer abcdefgh',
    'Bearer' + String.fromCharCode(10) + 'abcdefgh', '-----BEGIN PRIVATE KEY-----'];
  const before = state.store.snapshot(state.owner, { taskRef: state.seed.taskRef });
  for (let index = 0; index < patterns.length; index++) {
    const q = request(state, `sec-06-fresh-pattern-${index}`, { terms: [patterns[index]] });
    // The finite parser lacks the automatic contextText pattern guard. This
    // accessible miss is not evidence of equivalent historical secret policy.
    assert.equal(state.store.preparedContextCommandReceipt(state.capability, { request: q }), null);
    await expectCode(() => actual.memory.prepareExecutionContext(q), 'SECRET_REJECTED');
  }
  assert.deepEqual(tally(actual.count), { tokenizerCalls: 0, newCommitCallbacks: 0 });
  assert.deepEqual(state.store.snapshot(state.owner, { taskRef: state.seed.taskRef }), before);
  return { genuineFreshAutomaticPatternsRefused: patterns.length,
    automaticPatternHistoricalEquivalence: 'NOT_AUTHORED_HOLD',
    missingPrerequisite: 'Supported historical matching request and explicit literal policy', ...tally(actual.count) };
});
