// New root-owned continuation selection. No tests, DB or auto-run at import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const LEAVES = Object.freeze({
  'MIG-02': './leaves/mig-02.mjs',
  'MIG-03': './leaves/mig-03.mjs',
  'PREP-01': './leaves/prep-01.mjs',
  'PREP-02': './leaves/prep-02.mjs',
  'PREP-03': './leaves/prep-03.mjs',
  'PREP-04': './leaves/prep-04.mjs',
  'PREP-05': './leaves/prep-05.mjs',
  'PREP-06': './leaves/prep-06.mjs',
  'PREP-07': './leaves/prep-07.mjs',
  'PREP-08': './leaves/prep-08.mjs',
  'PREP-09': './leaves/prep-09.mjs',
  'PREP-10': './leaves/prep-10.mjs',
  'PREP-11': './leaves/prep-11.mjs',
  'PREP-12': './leaves/prep-12.mjs',
  'PREP-13': './leaves/prep-13.mjs',
  'REQ-01': './leaves/req-01.mjs',
  'REQ-02': './leaves/req-02.mjs',
  'REQ-03': './leaves/req-03.mjs',
  'REQ-04': './leaves/req-04.mjs',
  'SEC-01': './leaves/sec-01.mjs',
  'SEC-02': './leaves/sec-02.mjs',
  'SEC-03': './leaves/sec-03.mjs',
  'SEC-04': './leaves/sec-04.mjs',
  'SEC-05': './leaves/sec-05.mjs',
  'SEC-06': './leaves/sec-06.mjs',
});

export const leafIds = () => Object.keys(LEAVES);

export async function runSelectedLeaf(id, options) {
  assert.ok(Object.hasOwn(LEAVES, id), 'Root must select one of the 25 continuation leaves; MIG-01 is excluded');
  assert.deepEqual(Object.keys(options ?? {}), ['expectedManifestSha256']);
  assert.match(options.expectedManifestSha256, /^[a-f0-9]{64}$/);
  const bytes = readFileSync(new URL('./source-manifest.json', import.meta.url));
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(bytes), options.expectedManifestSha256, 'Continuation manifest drift: stop before candidate import');
  const manifest = JSON.parse(bytes.toString('utf8'));
  for (const pin of [...manifest.inputs, ...manifest.ownedFiles]) {
    const actual = readFileSync(pin.absolutePath);
    assert.equal(actual.length, pin.bytes, `Continuation input size drift: ${pin.path}`);
    assert.equal(digest(actual), pin.sha256, `Continuation input digest drift: ${pin.path}`);
  }
  // Exact new instruction pins are checked as bytes, never as effect authority.
  // Candidate/leaf import and invocation still require root's separate bounded GO.
  const selected = await import(LEAVES[id]);
  return await selected.run();
}
