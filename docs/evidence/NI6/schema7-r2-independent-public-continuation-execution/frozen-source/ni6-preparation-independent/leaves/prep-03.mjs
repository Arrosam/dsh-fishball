import { assert, withLease, migrated, request, components, summary, check } from '../support.mjs';

export const run = () => withLease('PREP-03', async lease => {
  const state = migrated(lease);
  const a = summary(state, 'prep-03-summary-a'), b = summary(state, 'prep-03-summary-b');
  const actual = components(state);
  const all = await actual.memory.prepareExecutionContext(request(state, 'prep-03-all'));
  const allCheck = check(state, all).check;
  assert.equal(allCheck.selectionMode, 'all_eligible');
  assert.deepEqual(allCheck.summaryChecks.map(row => row.recordRef), [a.receipt.recordRef,b.receipt.recordRef].sort());
  for (const row of allCheck.summaryChecks) {
    assert.equal(row.disposition, 'excluded_stale_summary');
    assert.deepEqual(row.sourceRefs, a.material.sourceRefs);
  }
  const explicit = await actual.memory.prepareExecutionContext(request(state, 'prep-03-explicit', { recordRefs: [a.receipt.recordRef] }));
  const proof = check(state, explicit);
  assert.equal(proof.check.selectionMode, 'explicit_records');
  assert.deepEqual(proof.check.summaryChecks.map(row => row.recordRef), [a.receipt.recordRef]);
  assert.deepEqual(proof.check.summaryChecks[0].sourceRefs, a.material.sourceRefs);
  summary(state, 'prep-03-unselected-c');
  const drift = check(state, explicit).currentness;
  assert.deepEqual(drift, { instructionsCurrent: false, memoryCurrent: true, taskSnapshotCurrent: false,
    reasonCodes: ['SEMANTIC_CHANGED','TASK_SNAPSHOT_CHANGED'] });
  assert.equal(check(state, all).currentness.reasonCodes.includes('CHECKED_SET_CHANGED'), true);
  return { selectionModes: ['all_eligible','explicit_records'], duplicateSourceOrderPreserved: true,
    explicitUnselectedGlobalSemanticDrift: true, newCommitCallbacks: actual.count.newCommitCallbacks };
});
