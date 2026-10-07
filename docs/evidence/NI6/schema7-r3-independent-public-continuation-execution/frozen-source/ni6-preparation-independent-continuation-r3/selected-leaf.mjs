// New root-owned 23-leaf continuation selection. No tests, DB or auto-run at import.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

const LEAVES = Object.freeze({
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
const SYSTEM_NODE = Object.freeze({
  path: '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node',
  bytes: 84640,
  sha256: '463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
});
const REQUIRED_POLICY = Object.freeze({
  'AGENTS.md': Object.freeze({ bytes: 8292, sha256: 'f7b4685d6c376159a9de2114c10acd3c08710ceed732b4ea7f07f7ed404e95ba' }),
  'docs/owner-amendment-2026-10-07-ollama.md': Object.freeze({ bytes: 2185, sha256: 'fb5a5178e165a1e40427bae17953baa6cac46f3446035d22a24e1510da3be4cb' }),
});
const REQUIRED_CORE = Object.freeze([
  ".runtime/ni6-schema7-core/original/context.mjs",
  ".runtime/ni6-schema7-core/original/fishball-memory-core.mjs",
  ".runtime/ni6-schema7-core/original/ledger.mjs",
  ".runtime/ni6-schema7-core/original/memory.mjs",
  ".runtime/ni6-schema7-core/original/runtime-security.mjs",
  ".runtime/ni6-schema7-core/original/runtime-store.mjs",
  ".runtime/ni6-schema7-core/src/context.mjs",
  ".runtime/ni6-schema7-core/src/fishball-memory-core.mjs",
  ".runtime/ni6-schema7-core/src/ledger.mjs",
  ".runtime/ni6-schema7-core/src/memory.mjs",
  ".runtime/ni6-schema7-core/src/normal-contracts.mjs",
  ".runtime/ni6-schema7-core/src/runtime-security.mjs",
  ".runtime/ni6-schema7-core/src/runtime-store.mjs"
]);
const REQUIRED_OWNED = Object.freeze([
  ".runtime/ni6-preparation-independent-continuation-r3/support.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/secret-case.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-01.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-02.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-03.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-04.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-05.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-06.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-07.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-08.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-09.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-10.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-11.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-12.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/prep-13.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/req-01.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/req-02.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/req-03.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/req-04.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-01.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-02.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-03.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-04.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-05.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/leaves/sec-06.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/selected-leaf.mjs",
  ".runtime/ni6-preparation-independent-continuation-r3/metadata-correction.md",
  ".runtime/ni6-preparation-independent-continuation-r3/metadata-correction.json",
  ".runtime/ni6-preparation-independent-continuation-r3/required-dispatcher.diff",
  ".runtime/ni6-preparation-independent-continuation-r3/metadata-r2-to-r3.literal.json",
  ".runtime/ni6-preparation-independent-continuation-r3/continuation-plan.md",
  ".runtime/ni6-preparation-independent-continuation-r3/continuation-plan.json",
  ".runtime/ni6-preparation-independent-continuation-r3/preservation-report.md",
  ".runtime/ni6-preparation-independent-continuation-r3/preservation-report.json",
  ".runtime/ni6-preparation-independent-continuation-r3/source-only-closure.json"
]);

export const leafIds = () => Object.keys(LEAVES);

export async function runSelectedLeaf(id, options) {
  assert.ok(Object.hasOwn(LEAVES, id), 'Root must select one of the 23 continuation leaves; MIG-01/MIG-02/MIG-03 are excluded');
  assert.deepEqual(Object.keys(options ?? {}), ['expectedManifestSha256']);
  assert.match(options.expectedManifestSha256, /^[a-f0-9]{64}$/);
  const bytes = readFileSync(new URL('./source-manifest.json', import.meta.url));
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(bytes), options.expectedManifestSha256, 'Continuation manifest drift: stop before candidate import');
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert.equal(manifest.contractVersion, 'NI6-public-preparation-continuation-r3-manifest-v1');
  assert.deepEqual(manifest.selectedIds, Object.keys(LEAVES));
  assert.ok(Array.isArray(manifest.inputs) && Array.isArray(manifest.ownedFiles));
  const repositoryRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const seen = new Map();
  let externalNodePins = 0;
  for (const pin of [...manifest.inputs, ...manifest.ownedFiles]) {
    assert.equal(typeof pin.path, 'string');
    assert.ok(!seen.has(pin.path), 'Duplicate continuation pin');
    assert.ok(Number.isSafeInteger(pin.bytes) && pin.bytes >= 0);
    assert.match(pin.sha256, /^[a-f0-9]{64}$/);
    let expectedAbsolutePath;
    if (pin.path === SYSTEM_NODE.path) {
      externalNodePins++;
      expectedAbsolutePath = SYSTEM_NODE.path;
      assert.equal(pin.bytes, SYSTEM_NODE.bytes);
      assert.equal(pin.sha256, SYSTEM_NODE.sha256);
    } else {
      assert.ok(!isAbsolute(pin.path), 'Only the exact pinned external Node path is admitted');
      assert.equal(normalize(pin.path), pin.path, 'Continuation path must be canonical');
      expectedAbsolutePath = resolve(repositoryRoot, pin.path);
      assert.ok(expectedAbsolutePath.startsWith(repositoryRoot + sep), 'Continuation path must remain inside this repository');
    }
    assert.equal(pin.absolutePath, expectedAbsolutePath, 'Continuation absolutePath must be exact');
    const actual = readFileSync(pin.absolutePath);
    assert.equal(actual.length, pin.bytes, `Continuation input size drift: ${pin.path}`);
    assert.equal(digest(actual), pin.sha256, `Continuation input digest drift: ${pin.path}`);
    seen.set(pin.path, pin);
  }
  assert.equal(externalNodePins, 1, 'Exactly one canonical pinned Node binary is required');
  for (const [path, expected] of Object.entries(REQUIRED_POLICY)) {
    assert.ok(seen.has(path), 'Current instruction pin is required');
    assert.equal(seen.get(path).bytes, expected.bytes);
    assert.equal(seen.get(path).sha256, expected.sha256);
  }
  for (const path of REQUIRED_CORE) assert.ok(seen.has(path), 'Every original/current core source pin is required');
  const ownedPaths = manifest.ownedFiles.map(pin => pin.path);
  assert.deepEqual([...ownedPaths].sort(), [...REQUIRED_OWNED].sort(), 'Exact executable/helper/literal metadata inventory is required');
  const physicalLeafNames = readdirSync(new URL('./leaves/', import.meta.url)).sort();
  assert.deepEqual(physicalLeafNames, Object.values(LEAVES).map(path => path.slice('./leaves/'.length)).sort(), 'Passed MIG leaves and unreviewed leaf files must be physically absent');
  // Historical manifests are immutable byte inputs; no nested dispatcher is invoked.
  // Current instruction pins confer no model/network/profile effects on this capsule.
  // Root's separate wrapper enforces finite sequential once-only order and first-failure stop.
  // Candidate import and invocation still require root's separate bounded GO.
  const selected = await import(LEAVES[id]);
  return await selected.run();
}
