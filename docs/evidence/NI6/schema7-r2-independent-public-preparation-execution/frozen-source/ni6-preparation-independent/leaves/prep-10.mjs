import { assert, withLease, migrated, request, components, summary, check, context, tally } from '../support.mjs';

export const run = () => withLease('PREP-10', async lease => {
  const state = migrated(lease);
  const stale = summary(state, 'prep-10-stale-small');
  const fresh = summary(state, 'prep-10-current-large', { fresh: true, content: 'Synthetic background. '.repeat(800) });
  const actual = components(state, { byteLimit: 4096, tokenLimit: 4096 });
  const receipt = await actual.memory.prepareExecutionContext(request(state, 'prep-10-budget'));
  const proof = check(state, receipt), { envelope } = context(state, receipt);
  assert.deepEqual(proof.check.summaryChecks.map(row => row.recordRef),
    [stale.receipt.recordRef,fresh.receipt.recordRef].sort());
  assert.equal(proof.check.summaryChecks.find(row => row.recordRef === stale.receipt.recordRef).disposition, 'excluded_stale_summary');
  assert.equal(proof.check.summaryChecks.find(row => row.recordRef === fresh.receipt.recordRef).disposition, 'dropped_for_budget');
  assert.ok(envelope.droppedRefs.includes(fresh.receipt.recordRef));
  assert.equal(envelope.sourceProvenance.some(row => row.recordRef === fresh.receipt.recordRef), false);
  assert.ok(envelope.inputCounts.bytes <= 4096);
  assert.ok(envelope.inputCounts.tokens <= 4096);
  assert.equal(envelope.inputCounts.bytes, Buffer.byteLength(envelope.content));
  assert.deepEqual(proof.check.summaryChecks.find(row => row.recordRef === fresh.receipt.recordRef).sourceRefs, fresh.material.sourceRefs);
  return { staleAndBudgetRowsBothPersisted: true, examinedRefs: 2, droppedFreshSummary: true, ...tally(actual.count) };
});
