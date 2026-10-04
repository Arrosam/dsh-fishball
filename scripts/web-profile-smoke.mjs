import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { paths, patchPath, profilePatch } from './dsh-web.mjs';

const statePath = `${paths.evidence}/state.json`;
const initial = JSON.parse(readFileSync(statePath, 'utf8'));
assert.equal(initial.phase, 'active');
assert.equal(initial.hostSupported, true);
assert.equal(initial.loopback, true);
assert.equal(initial.inferenceAttempts, 0);
const snapshots = [];
for (let offset = 1; offset <= 10; offset++) {
  const generation = initial.generation + offset;
  writeFileSync(patchPath, profilePatch(generation));
  let state;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await setTimeout(100);
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (state.generation === generation && state.phase === 'active') break;
    } catch { /* atomic observer file is being replaced */ }
  }
  assert.equal(state?.generation, generation, 'PROFILE_RELOAD_TIMEOUT');
  assert.equal(state.phase, 'active');
  assert.equal(state.loads, initial.loads + offset);
  assert.equal(state.unloads, initial.unloads + offset);
  assert.equal(state.pid, initial.pid);
  assert.equal(state.staleReference, 'disposed');
  assert.equal(state.deduplicated, true);
  assert.equal(state.entries, 1);
  assert.equal(state.sessions, 0);
  assert.equal(state.inferenceAttempts, 0);
  snapshots.push(state);
}
const report = { result: 'passed', target: initial.target, profileReloads: 10, entries: 1, inferenceAttempts: 0, snapshots };
writeFileSync(`${paths.evidence}/profile-smoke.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
