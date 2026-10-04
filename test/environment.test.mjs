import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvironmentRegistry, workerDigest as d } from '../src/environment.mjs';

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'bubbles-env-')));
  let state = d('state'), now = 10;
  const entry = { environmentRef: d('env'), workspaceRef: d('workspace'), bindingDigest: d('binding'), toolsDigest: d('tools'), permissionPolicyDigest: d('permission'), cwd: root, root, provider: 'synthetic-provider', model: 'synthetic-model', reasoningEffort: 'fixture-effort', modelRef: d('model'), reasoningRef: d('reasoning'), presetRef: d('preset') };
  const environments = new EnvironmentRegistry({ entries: [entry], currentState: () => state, clock: () => now, knownSecrets: ['SYNTHETIC_SECRET'] });
  const spec = { executor: { generationRef:d('gen'),environmentRef:entry.environmentRef,bindingDigest:entry.bindingDigest,toolsDigest:entry.toolsDigest,permissionPolicyDigest:entry.permissionPolicyDigest }, model: {modelRef:entry.modelRef,reasoningRef:entry.reasoningRef,presetRef:entry.presetRef} };
  const task = { taskRef: d('task'), workspaceRef: d('workspace'), version: 1, authEpoch: 0 };
  return { root, environments, entry, spec, task, state: () => state, change: () => { state = d('new-state'); }, expire: () => { now = 21; } };
}
test('environment binds trusted scope/digests and rejects JSON capabilities, changed state and mismatched workspace', () => {
  const f = fixture();
  try {
    const token = f.environments.bind(f.spec, f.task);
    assert.deepEqual(token, {});
    assert.throws(() => f.environments.inspect({}, () => {}), { code: 'ENVIRONMENT_UNAVAILABLE' });
    assert.throws(() => f.environments.bind(f.spec, { ...f.task, workspaceRef: d('other') }), { code: 'ENVIRONMENT_MISMATCH' });
    assert.throws(() => f.environments.bind({ ...f.spec, executor: { ...f.spec.executor, toolsDigest: d('other') } }, f.task), { code: 'ENVIRONMENT_MISMATCH' });
    assert.equal(f.environments.assertCurrent(token), f.state());
    f.change(); assert.throws(() => f.environments.assertCurrent(token), { code: 'ENVIRONMENT_STALE' });
  } finally { rmSync(f.root, { recursive: true }); }
});
test('handoff is bounded context evidence, expires and cannot authorize changed task or unverified environment', () => {
  const f = fixture();
  try {
    const token = f.environments.bind(f.spec, f.task);
    const input = { targetEnvironmentRef: f.entry.environmentRef, reason: 'Need local operator step', steps: 'Inspect synthetic file', resumeCondition: 'Operator confirms current snapshot', expiresAt: 20, taskVersion: 1, authEpoch: 0, actionDigest: d('action'), claimRef: d('claim'), generationRef: d('gen') };
    const handoff = f.environments.handoff(token, input);
    assert.equal(handoff.state, 'pending'); assert.equal(handoff.cwd, undefined);
    assert.equal(f.environments.validateHandoff(token, handoff, f.task, f.state()).state, 'verified');
    assert.throws(() => f.environments.validateHandoff(token, { ...handoff }, f.task, f.state()), { code: 'HANDOFF_UNVERIFIED' });
    assert.throws(() => f.environments.validateHandoff(token, handoff, { ...f.task, version: 2 }, f.state()), { code: 'HANDOFF_STALE' });
    assert.throws(() => f.environments.validateHandoff(token, handoff, f.task, d('asserted-json-state')), { code: 'HANDOFF_STALE' });
    assert.throws(() => f.environments.handoff(token, { ...input, reason: 'SYNTHETIC_SECRET' }), { code: 'SECRET_REJECTED' });
    assert.throws(() => f.environments.handoff(token, { ...input, verified: true }), { code: 'WORKER_INVALID' });
    assert.throws(() => f.environments.handoff(token, new Proxy(input, {})), { code: 'WORKER_INVALID' });
    f.expire(); assert.throws(() => f.environments.validateHandoff(token, handoff, f.task, f.state()), { code: 'HANDOFF_STALE' });
  } finally { rmSync(f.root, { recursive: true }); }
});
