// Inert root-owned selection seam. Only the affected MIG-02 can be invoked.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export async function runSelectedLeaf(id, options) {
  assert.equal(id, 'MIG-02', 'This sibling does not repeat unaffected MIG-01');
  assert.deepEqual(Object.keys(options ?? {}), ['expectedManifestSha256']);
  assert.match(options.expectedManifestSha256, /^[a-f0-9]{64}$/);
  const digest = value => createHash('sha256').update(value).digest('hex');
  const bytes = readFileSync(new URL('./source-manifest.json', import.meta.url));
  assert.equal(digest(bytes), options.expectedManifestSha256, 'Stop on sibling manifest drift');
  const manifest = JSON.parse(bytes.toString('utf8'));
  for (const pin of [...manifest.inputs, ...manifest.ownedFiles]) {
    const actual = readFileSync(pin.absolutePath);
    assert.equal(actual.length, pin.bytes, `Pinned size drift: ${pin.path}`);
    assert.equal(digest(actual), pin.sha256, `Pinned digest drift: ${pin.path}`);
  }
  // Candidate/fixture import and invocation are conditional on a separate root GO.
  const selected = await import('./leaves/mig-02.mjs');
  return await selected.run();
}
