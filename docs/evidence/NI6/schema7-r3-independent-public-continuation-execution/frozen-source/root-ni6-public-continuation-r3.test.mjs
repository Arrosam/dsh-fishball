// Root-owned finite continuation. Previously passed migration leaves are excluded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSelectedLeaf } from './ni6-preparation-independent-continuation-r3/selected-leaf.mjs';

const manifest = 'ace22f94d71abe5c86462591ef99ba9ae54fa2a3d7712ffc9ce9221e00e07f07';
const selected = Object.freeze([
  'PREP-01', 'PREP-02', 'PREP-03', 'PREP-04', 'PREP-05', 'PREP-06', 'PREP-07',
  'PREP-08', 'PREP-09', 'PREP-10', 'PREP-11', 'PREP-12', 'PREP-13',
  'REQ-01', 'REQ-02', 'REQ-03', 'REQ-04',
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
