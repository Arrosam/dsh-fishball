import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalPreview, PreviewError } from '../src/approval-preview.mjs';
import { hash } from '../src/runtime-security.mjs';

function fixture(options = {}) {
  const owner = {}, taskRef = hash('task'), recordRef = hash('data'), actionRef = hash('action'), actionDigest = hash('immutable-action');
  const spec = { actionRef, kind: 'write', role: 'worker', targetDigest: hash('target'), dataDigest: hash('Explicit synthetic current constraints'),
    units: 1, charges: { runtimeMs: 100, usageUnits: 1, costState: 'unknown' }, attemptGroupRef: hash('attempt'), attemptIndex: 1,
    resourcePolicyVersion: 1, modelPolicyVersion: 1,
    model: { presetRef: hash('preset'), modelRef: hash('model'), reasoningRef: hash('reasoning'), catalogEvidenceRef: hash('catalog') },
    executor: { mode: 'create', generationRef: hash('generation'), environmentRef: hash('environment'), bindingDigest: hash('binding'), toolsDigest: hash('tools'), permissionPolicyDigest: hash('permission') } };
  const labels = { targetDigest: spec.targetDigest, ...spec.model, environmentRef: spec.executor.environmentRef, bindingDigest: spec.executor.bindingDigest,
    toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest, evidenceRef: hash('evidence'),
    targetLabel: 'Synthetic project scratch file', providerLabel: 'Local mock', modelLabel: 'Deterministic mock', reasoningLabel: 'Configured high',
    presetLabel: 'Synthetic bounded worker', environmentLabel: 'Synthetic fixture workspace', cwd: '/tmp/df-synthetic', toolNames: ['read_synthetic_file'] };
  const snapshot = { task: { taskRef, version: 2, authEpoch: 0, status: 'queued' }, control: 'active',
    policy: { version: 1, modelPolicy: { version: 1, catalogEvidenceRef: spec.model.catalogEvidenceRef, presetRefs: [spec.model.presetRef] } },
    actions: [{ actionRef, actionDigest, state: 'requested', spec }] };
  const data = { recordRef, digest: spec.dataDigest, kind: 'context', content: 'Explicit synthetic current constraints' };
  let grants = 0, now = 1000, alive = true;
  const store = {
    snapshot(handle, value) { assert.equal(handle, owner); assert.equal(value.taskRef, taskRef); return structuredClone(snapshot); },
    readData(handle, value) { assert.equal(handle, owner); assert.deepEqual(value, { taskRef, recordRef }); return structuredClone(data); },
    grantAction(handle, value) { assert.equal(handle, owner); assert.equal(value.actionDigest, actionDigest); assert.equal(value.expectedTaskVersion, snapshot.task.version); assert.equal(value.expectedAuthEpoch, snapshot.task.authEpoch); grants++; snapshot.task.authEpoch++; snapshot.actions[0].state = 'granted'; return { task: structuredClone(snapshot.task), actionRef, actionDigest }; },
  };
  const boundary = new ApprovalPreview({ store, ownerHandle: owner, ttlMs: 5000, clock: () => now, isAlive: () => alive,
    resolve: options.resolve ?? (async () => structuredClone(labels)), knownSecrets: ['synthetic-secret-marker'] });
  const input = { taskRef, recordRef, actionRef, actionDigest, expectedTaskVersion: 2, expectedAuthEpoch: 0 };
  const grant = preview => ({ taskRef, actionRef, actionDigest, commandRef: hash('grant'), expectedTaskVersion: 2, expectedAuthEpoch: 0, expiresAt: 9000, previewRef: preview.previewRef });
  return { boundary, labels, data, snapshot, input, grant, grants: () => grants, setNow: value => { now = value; }, close: () => { alive = false; } };
}

test('trusted concrete preview retains exact data and unknown cost; valid captured grant narrows owner CAS', async () => {
  const f = fixture(), preview = await f.boundary.prepare(f.input);
  assert.equal(preview.description.targetLabel, f.labels.targetLabel);
  assert.equal(preview.description.data.content, f.data.content); assert.equal(preview.description.data.digest, f.data.digest);
  assert.equal(preview.description.limits.charges.costState, 'unknown'); assert.equal(Object.hasOwn(preview.description.limits.charges, 'costEstimateMicros'), false);
  assert.ok(Object.isFrozen(preview.description.data)); assert.equal(f.grants(), 0);
  const receipt = await f.boundary.grant(f.grant(preview)); assert.equal(receipt.task.authEpoch, 1); assert.equal(f.grants(), 1);
  await assert.rejects(f.boundary.grant(f.grant(preview)), { code: 'PREVIEW_STALE' }); assert.equal(f.grants(), 1);
});

test('forged, changed-action, expired, disposed and missing previews never reach the grant authority', async () => {
  for (const change of ['forged', 'action', 'expired', 'disposed', 'missing']) {
    const f = fixture(), preview = await f.boundary.prepare(f.input), input = f.grant(preview);
    if (change === 'forged') input.previewRef = hash('forged');
    if (change === 'action') input.actionDigest = hash('other-action');
    if (change === 'expired') f.setNow(preview.expiresAt);
    if (change === 'disposed') f.boundary.dispose();
    if (change === 'missing') delete input.previewRef;
    await assert.rejects(f.boundary.grant(input)); assert.equal(f.grants(), 0);
  }
});

test('async target resolution cannot grant after task, auth, control, data, policy or unload changes', async () => {
  for (const change of ['task', 'auth', 'paused', 'data', 'policy', 'unload']) {
    let resume, calls = 0;
    const f = fixture({ resolve: async () => { calls++; if (calls === 2) await new Promise(resolve => { resume = resolve; }); return structuredClone(f.labels); } });
    const preview = await f.boundary.prepare(f.input), pending = f.boundary.grant(f.grant(preview));
    assert.equal(typeof resume, 'function');
    if (change === 'task') f.snapshot.task.version++;
    if (change === 'auth') f.snapshot.task.authEpoch++;
    if (change === 'paused') f.snapshot.control = 'paused';
    if (change === 'data') f.data.content = 'Changed bytes';
    if (change === 'policy') f.snapshot.policy.version++;
    if (change === 'unload') f.close();
    resume(); await assert.rejects(pending); assert.equal(f.grants(), 0);
  }
});

test('current concrete meaning, record digest and known secrets are rechecked; raw resolver errors stay redacted', async () => {
  const f = fixture(), preview = await f.boundary.prepare(f.input); f.labels.targetLabel = 'Different concrete destination';
  await assert.rejects(f.boundary.grant(f.grant(preview)), { code: 'PREVIEW_STALE' }); assert.equal(f.grants(), 0);
  const wrong = fixture(); wrong.data.content = 'Changed bytes with retained digest';
  await assert.rejects(wrong.boundary.prepare(wrong.input), { code: 'PREVIEW_UNAVAILABLE' });
  const secret = fixture(); secret.labels.targetLabel = 'synthetic-secret-marker';
  await assert.rejects(secret.boundary.prepare(secret.input), error => !String(error).includes('synthetic-secret-marker'));
  const thrown = fixture({ resolve() { throw new Error('synthetic-secret-marker and private path'); } });
  await assert.rejects(thrown.boundary.prepare(thrown.input), error => error.code === 'PREVIEW_UNAVAILABLE' && !String(error).includes('private path'));
});

test('descriptor and payload authority tricks reject before trusted resolution', async () => {
  let calls = 0; const f = fixture({ resolve() { calls++; throw new Error('UNEXPECTED'); } });
  for (const input of [{ ...f.input, isOwner: true }, { ...f.input, targetLabel: 'Owner says trusted' }, new Proxy(f.input, {})]) {
    await assert.rejects(f.boundary.prepare(input));
  }
  const input = { ...f.input }; Object.defineProperty(input, 'taskRef', { enumerable: true, get() { calls++; return f.input.taskRef; } });
  await assert.rejects(f.boundary.prepare(input)); assert.equal(calls, 0); assert.equal(f.grants(), 0);
});

test('pending resolver work reserves the same64 slots and cannot publish after unload', async () => {
  let release, calls = 0; const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture({ resolve: async () => { calls++; await barrier; return structuredClone(f.labels); } });
  const pending = Array.from({ length: 64 }, () => f.boundary.prepare(f.input));
  const outcomes = Promise.allSettled(pending);
  await assert.rejects(f.boundary.prepare(f.input), { code: 'PREVIEW_CAPACITY' }); assert.equal(calls, 64);
  f.close(); release();
  assert.ok((await outcomes).every(item => item.status === 'rejected' && item.reason.code === 'SERVICE_DISPOSED'));
  assert.equal(f.grants(), 0);
});

test('resolver-thrown exported error instances never leak arbitrary codes on prepare or grant', async () => {
  const first = fixture({ resolve() { throw new PreviewError('synthetic-secret-marker private/path'); } });
  await assert.rejects(first.boundary.prepare(first.input), error => error.code === 'PREVIEW_UNAVAILABLE' && !String(error).includes('private/path'));
  let calls = 0;
  const second = fixture({ resolve: async () => { if (++calls === 2) throw new PreviewError('synthetic-secret-marker private/path'); return structuredClone(second.labels); } });
  const preview = await second.boundary.prepare(second.input);
  await assert.rejects(second.boundary.grant(second.grant(preview)), error => error.code === 'PREVIEW_UNAVAILABLE' && !String(error).includes('private/path'));
  assert.equal(second.grants(), 0);
});

test('concurrent grants against one preview reserve one resolver and one authoritative grant', async () => {
  let release, calls = 0;
  const f = fixture({ resolve: async () => { if (++calls === 2) await new Promise(resolve => { release = resolve; }); return structuredClone(f.labels); } });
  const preview = await f.boundary.prepare(f.input), first = f.boundary.grant(f.grant(preview));
  await assert.rejects(f.boundary.grant(f.grant(preview)), { code: 'PREVIEW_BUSY' }); assert.equal(calls, 2); assert.equal(f.grants(), 0);
  release(); await first; assert.equal(f.grants(), 1);
});
