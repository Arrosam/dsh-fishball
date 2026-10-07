// Inert root wrapper proposal: nine selected leaves; fourteen r3 passes and all migration test leaves are excluded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSelectedLeaf } from './selected-leaf.mjs';

const manifest = '767cb05aab89fde616f649b12199d76c672b72339166bc139f33b39a45e93e42';
const selected = Object.freeze([
  'REQ-02', 'REQ-03', 'REQ-04',
  'SEC-01', 'SEC-02', 'SEC-03', 'SEC-04', 'SEC-05', 'SEC-06',
]);
let failed = false;
for (const id of selected) {
  await test(`NI6 independent public continuation ${id}`, { concurrency: false }, async t => {
    if (failed) { t.skip('STOPPED_AFTER_FIRST_FAILURE'); return; }
    try {
      const result = await runSelectedLeaf(id, { expectedManifestSha256: manifest });
      assert.equal(result.id, id);
      assert.equal(result.status, 'PASS');
      t.diagnostic(JSON.stringify(result));
    } catch (error) {
      failed = true;
      throw error;
    }
  });
}
