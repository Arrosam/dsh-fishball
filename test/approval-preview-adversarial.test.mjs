import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalPreview, PreviewError } from '../src/approval-preview.mjs';
import { hash } from '../src/runtime-security.mjs';

// Independent preview-boundary tests. These typed store/resolver doubles do not
// establish encrypted storage, native identity/carrier, UI or model acceptance.
const canary = 'DF-PREVIEW-INDEPENDENT-SYNTHETIC-SECRET';
const privatePath = '/private/synthetic-preview-error-path';
const clone = value => structuredClone(value);
function deferred() {
  let release, reject;
  const promise = new Promise((resolve, no) => { release = resolve; reject = no; });
  return { promise, release, reject };
}
function fixture(options = {}) {
  const owner = Object.freeze({}), taskRef = hash('independent-preview-task'), recordRef = hash('independent-preview-record');
  const actionRef = hash('independent-preview-action'), actionDigest = hash('immutable-independent-preview-action');
  const text = 'FRONT: preserve owner boundary\n中间: current constraints\nEND: no arbitrary replay 🔒';
  const spec = { actionRef, kind: 'write', role: 'worker', targetDigest: hash('exact-target'), dataDigest: hash(text),
    units: 1, charges: { runtimeMs: 100, usageUnits: 2, costState: 'unknown' }, attemptGroupRef: hash('attempt-group'), attemptIndex: 1,
    resourcePolicyVersion: 2, modelPolicyVersion: 3,
    model: { presetRef: hash('preset'), modelRef: hash('model'), reasoningRef: hash('reasoning'), catalogEvidenceRef: hash('catalog') },
    executor: { mode: 'create', generationRef: hash('generation'), environmentRef: hash('environment'), bindingDigest: hash('binding'), toolsDigest: hash('tools'), permissionPolicyDigest: hash('permission') } };
  const labels = { targetDigest: spec.targetDigest, ...spec.model,
    environmentRef: spec.executor.environmentRef, bindingDigest: spec.executor.bindingDigest,
    toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest, evidenceRef: hash('concrete-evidence'),
    targetLabel: 'Exact synthetic scratch target', providerLabel: 'Local synthetic provider', modelLabel: 'Deterministic fixture',
    reasoningLabel: 'Explicit high', presetLabel: 'Bounded synthetic worker', environmentLabel: 'Synthetic environment',
    cwd: '/tmp/df-independent-preview', toolNames: ['read_synthetic_file'] };
  const snapshot = { task: { taskRef, version: 4, authEpoch: 2, status: 'queued' }, control: 'active',
    policy: { version: 2, modelPolicy: { version: 3, catalogEvidenceRef: spec.model.catalogEvidenceRef, presetRefs: [spec.model.presetRef] } },
    actions: [{ actionRef, actionDigest, state: 'requested', spec }] };
  const data = { recordRef, digest: spec.dataDigest, kind: 'context', content: text, taskVersion: 4, authEpoch: 2 };
  const state = { now: 1000, alive: true, reads: 0, snapshots: 0, resolves: 0, grants: [] };
  const store = {
    snapshot(handle, input) { assert.equal(handle, owner); assert.deepEqual(input, { taskRef }); state.snapshots++; return clone(snapshot); },
    readData(handle, input) { assert.equal(handle, owner); assert.deepEqual(input, { taskRef, recordRef }); state.reads++; return clone(data); },
    grantAction(handle, input) {
      assert.equal(handle, owner); assert.equal(input.taskRef, taskRef); assert.equal(input.actionRef, actionRef); assert.equal(input.actionDigest, actionDigest);
      assert.equal(input.expectedTaskVersion, snapshot.task.version); assert.equal(input.expectedAuthEpoch, snapshot.task.authEpoch);
      assert.equal(snapshot.actions[0].state, 'requested'); state.grants.push(clone(input)); snapshot.task.authEpoch++; snapshot.actions[0].state = 'granted';
      return { task: clone(snapshot.task), actionRef, actionDigest, commandRef: input.commandRef };
    },
  };
  const input = { taskRef, recordRef, actionRef, actionDigest, expectedTaskVersion: 4, expectedAuthEpoch: 2 };
  const f = { owner, store, state, spec, labels, snapshot, data, input };
  f.resolve = async (...args) => { state.resolves++; return options.resolve ? options.resolve(f, ...args) : clone(labels); };
  f.boundary = new ApprovalPreview({ store, ownerHandle: owner, resolve: f.resolve, ttlMs: options.ttlMs ?? 5000,
    clock: () => state.now, isAlive: () => state.alive, knownSecrets: [canary] });
  f.grantInput = (preview, suffix = 'one') => ({ taskRef, actionRef, actionDigest, commandRef: hash(`grant-${suffix}`),
    expectedTaskVersion: 4, expectedAuthEpoch: 2, expiresAt: 10000, previewRef: preview.previewRef });
  return f;
}
async function refused(promise, code) {
  await assert.rejects(promise, error => {
    if (code) assert.equal(error.code, code);
    assert.equal(error.message, error.code);
    assert.ok(!String(error.stack).includes(canary)); assert.ok(!String(error.stack).includes(privatePath));
    return true;
  });
}

test('independent preview: exact displayed material and unknown cost are frozen without granting work', async () => {
  const f = fixture(), before = clone(f.spec), preview = await f.boundary.prepare(f.input);
  assert.deepEqual(f.spec, before); assert.equal(f.state.grants.length, 0);
  assert.equal(preview.description.data.content, f.data.content); assert.equal(hash(preview.description.data.content), preview.description.data.digest);
  assert.equal(preview.description.data.recordRef, f.input.recordRef); assert.equal(preview.description.targetLabel, f.labels.targetLabel);
  assert.deepEqual(preview.description.limits.charges, { runtimeMs: 100, usageUnits: 2, costState: 'unknown' });
  assert.equal(Object.hasOwn(preview.description.limits.charges, 'costEstimateMicros'), false);
  assert.throws(() => { preview.description.data.content = canary; }, TypeError);
  assert.throws(() => preview.description.toolNames.push('unapproved'), TypeError);
  const receipt = await f.boundary.grant(f.grantInput(preview));
  assert.equal(receipt.task.authEpoch, 3); assert.equal(f.state.grants.length, 1);
  assert.throws(() => { receipt.task.authEpoch = 9; }, TypeError);
});

test('independent preview: trusted TTL accepts1 and60000 and rejects malformed/outside bounds', () => {
  for (const ttlMs of [1, 60000]) { const f = fixture({ ttlMs }); f.boundary.dispose(); }
  for (const ttlMs of [0, 60001, -1, 1.5, NaN, Infinity, '5000', null]) {
    const f = fixture(); assert.throws(() => new ApprovalPreview({ store: f.store, ownerHandle: f.owner, resolve: f.resolve, ttlMs }), { code: 'INVALID_INPUT' });
  }
});

test('independent preview: expiry N-1/N/N+1 has an exclusive live boundary', async () => {
  for (const delta of [-1, 0, 1]) {
    const f = fixture(), preview = await f.boundary.prepare(f.input); f.state.now = preview.expiresAt + delta;
    if (delta === -1) { await f.boundary.grant(f.grantInput(preview)); assert.equal(f.state.grants.length, 1); }
    else { await refused(f.boundary.grant(f.grantInput(preview)), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 0); }
  }
});

test('independent preview: completed-cache63/64/65 refuses without eviction and expiry frees capacity', async () => {
  const f = fixture(), previews = [];
  for (let i = 0; i < 63; i++) previews.push(await f.boundary.prepare(f.input));
  previews.push(await f.boundary.prepare(f.input)); assert.equal(new Set(previews.map(value => value.previewRef)).size, 64);
  const reads = f.state.reads, resolves = f.state.resolves;
  await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY'); assert.equal(f.state.reads, reads); assert.equal(f.state.resolves, resolves);
  f.state.now = previews[0].expiresAt - 1; await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY');
  f.state.now = previews[0].expiresAt; const fresh = await f.boundary.prepare(f.input); assert.equal(fresh.expiresAt, f.state.now + 5000);
  await refused(f.boundary.grant(f.grantInput(previews[0])), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 0);
});

test('independent preview:64 unresolved prepares reserve capacity before resolver await', async () => {
  const gate = deferred(), f = fixture({ resolve: async value => { await gate.promise; return clone(value.labels); } });
  const pending = Array.from({ length: 64 }, () => f.boundary.prepare(f.input));
  assert.equal(f.state.resolves, 64);
  await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY'); assert.equal(f.state.resolves, 64);
  gate.release(); const previews = await Promise.all(pending);
  assert.equal(new Set(previews.map(value => value.previewRef)).size, 64); assert.equal(f.state.grants.length, 0);
  await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY');
});

test('independent preview: combined completed+pending cap and failed pending work release one slot', async () => {
  const gate = deferred(); let failing = false;
  const f = fixture({ resolve: async value => { if (failing) { await gate.promise; throw new PreviewError(`${canary} ${privatePath}`); } return clone(value.labels); } });
  for (let i = 0; i < 63; i++) await f.boundary.prepare(f.input);
  failing = true; const pending = f.boundary.prepare(f.input); const expectedFailure = refused(pending, 'PREVIEW_UNAVAILABLE');
  await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY'); gate.release(); await expectedFailure;
  failing = false; await f.boundary.prepare(f.input); await refused(f.boundary.prepare(f.input), 'PREVIEW_CAPACITY');
  assert.equal(f.state.grants.length, 0);
});

test('independent preview: concurrent duplicate grants reserve one resolver and commit once', async () => {
  const gate = deferred();
  const f = fixture({ resolve: async value => { if (value.state.resolves > 1) await gate.promise; return clone(value.labels); } });
  const preview = await f.boundary.prepare(f.input), first = f.boundary.grant(f.grantInput(preview, 'a'));
  await refused(f.boundary.grant(f.grantInput(preview, 'b')), 'PREVIEW_BUSY'); assert.equal(f.state.resolves, 2);
  gate.release(); const receipt = await first;
  assert.equal(receipt.commandRef, hash('grant-a')); assert.equal(f.state.grants.length, 1);
  await refused(f.boundary.grant(f.grantInput(preview)), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 1);
});

test('independent preview: captured caller input cannot be swapped during prepare or grant awaits', async () => {
  const gates = [deferred(), deferred()];
  const f = fixture({ resolve: async value => { await gates[value.state.resolves - 1].promise; return clone(value.labels); } });
  const input = clone(f.input), pending = f.boundary.prepare(input); input.taskRef = hash('other'); input.recordRef = hash('other-data'); input.expectedAuthEpoch = 90;
  gates[0].release(); const preview = await pending; assert.equal(preview.taskRef, f.input.taskRef);
  const grant = f.grantInput(preview), expected = clone(grant), issued = f.boundary.grant(grant);
  grant.commandRef = hash('swapped'); grant.expiresAt = 1; grant.taskRef = hash('other'); grant.expectedAuthEpoch = 99;
  gates[1].release(); await issued; const { previewRef, ...bound } = expected; assert.deepEqual(f.state.grants, [bound]);
});

test('independent preview: every captured task/action/version/epoch token binding and cross-instance token refuses', async () => {
  for (const field of ['taskRef', 'actionRef', 'actionDigest', 'expectedTaskVersion', 'expectedAuthEpoch', 'previewRef']) {
    const f = fixture(), preview = await f.boundary.prepare(f.input), input = f.grantInput(preview);
    input[field] = typeof input[field] === 'number' ? input[field] + 1 : hash(`forged-${field}`);
    await refused(f.boundary.grant(input), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 0);
  }
  const first = fixture(), second = fixture(), preview = await first.boundary.prepare(first.input);
  await refused(second.boundary.grant(second.grantInput(preview)), 'PREVIEW_STALE'); assert.equal(second.state.grants.length, 0);
});

test('independent preview: hostile descriptors, unknown authority and reflected arrays reject before callbacks', async () => {
  const f = fixture(); let traps = 0;
  const getter = clone(f.input); Object.defineProperty(getter, 'taskRef', { enumerable: true, get() { traps++; throw Error(canary); } });
  const hidden = clone(f.input); Object.defineProperty(hidden, 'taskRef', { value: f.input.taskRef, enumerable: false });
  const symbol = { ...f.input, [Symbol('scope')]: canary };
  const proxy = new Proxy(f.input, { get() { traps++; throw Error(canary); }, getPrototypeOf() { traps++; throw Error(canary); }, ownKeys() { traps++; throw Error(canary); } });
  const fake = Object.assign(Object.create(null), f.input);
  for (const input of [getter, hidden, symbol, proxy, fake, [], { ...f.input, ownerHandle: f.owner }, { ...f.input, scope: { verified: true } }, { ...f.input, targetLabel: canary }]) await refused(f.boundary.prepare(input), 'INVALID_INPUT');
  assert.equal(traps, 0); assert.equal(f.state.snapshots, 0); assert.equal(f.state.resolves, 0); assert.equal(f.state.grants.length, 0);
  const preview = await f.boundary.prepare(f.input), grant = f.grantInput(preview);
  await refused(f.boundary.grant(new Proxy(grant, { get() { traps++; throw Error(canary); } })), 'INVALID_INPUT');
  await refused(f.boundary.grant({ ...grant, verified: true }), 'INVALID_INPUT'); assert.equal(traps, 0); assert.equal(f.state.grants.length, 0);
});

test('independent preview: all concrete resolver reference bindings reject a changed target or authority meaning', async () => {
  for (const field of ['targetDigest', 'modelRef', 'reasoningRef', 'presetRef', 'catalogEvidenceRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest']) {
    const f = fixture(); f.labels[field] = hash(`different-${field}`);
    await refused(f.boundary.prepare(f.input), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: missing/unknown resolver fields and accessor/proxy labels reject without reflection traps', async () => {
  let traps = 0;
  for (const variant of ['missing', 'extra', 'getter', 'proxy']) {
    const f = fixture({ resolve: value => {
      const labels = clone(value.labels);
      if (variant === 'missing') delete labels.evidenceRef;
      if (variant === 'extra') labels.verified = true;
      if (variant === 'getter') Object.defineProperty(labels, 'targetLabel', { enumerable: true, get() { traps++; throw Error(canary); } });
      if (variant === 'proxy') return new Proxy(labels, { getPrototypeOf() { traps++; throw Error(canary); }, ownKeys() { traps++; throw Error(canary); } });
      return labels;
    } });
    await refused(f.boundary.prepare(f.input), 'INVALID_INPUT'); assert.equal(f.state.grants.length, 0);
  }
  assert.equal(traps, 0);
});

test('independent preview: tool names63/64/65 plus duplicate/sparse/accessor/proxy arrays are bounded', async () => {
  for (const size of [63, 64, 65]) {
    const f = fixture(); f.labels.toolNames = Array.from({ length: size }, (_, index) => `tool_${index}`);
    if (size <= 64) assert.equal((await f.boundary.prepare(f.input)).description.toolNames.length, size);
    else await refused(f.boundary.prepare(f.input), 'PREVIEW_UNAVAILABLE');
  }
  let traps = 0;
  for (const variant of ['duplicate', 'sparse', 'getter', 'proxy', 'extra']) {
    const f = fixture({ resolve: value => {
      const labels = clone(value.labels), names = variant === 'sparse' ? Array(1) : ['tool'];
      if (variant === 'duplicate') names.push('tool');
      if (variant === 'getter') Object.defineProperty(names, '0', { enumerable: true, get() { traps++; throw Error(canary); } });
      if (variant === 'extra') names.authority = true;
      labels.toolNames = variant === 'proxy' ? new Proxy(names, { get() { traps++; throw Error(canary); } }) : names;
      return labels;
    } });
    await refused(f.boundary.prepare(f.input)); assert.equal(f.state.grants.length, 0);
  }
  assert.equal(traps, 0);
});

test('independent preview: concrete UTF-8 labels4095/4096/4097 and tool bytes255/256/257 have exact boundaries', async () => {
  for (const bytes of [4095, 4096, 4097]) {
    const f = fixture(); f.labels.targetLabel = '界'.repeat(1365) + 'a'.repeat(bytes - 4095);
    if (bytes <= 4096) assert.equal(Buffer.byteLength((await f.boundary.prepare(f.input)).description.targetLabel), bytes);
    else await refused(f.boundary.prepare(f.input));
  }
  for (const bytes of [255, 256, 257]) {
    const f = fixture(); f.labels.toolNames = ['界'.repeat(85) + 'a'.repeat(bytes - 255)];
    if (bytes <= 256) assert.equal(Buffer.byteLength((await f.boundary.prepare(f.input)).description.toolNames[0]), bytes);
    else await refused(f.boundary.prepare(f.input));
  }
  for (const value of ['', ' \t\n', '\uD800']) { const f = fixture(); f.labels.targetLabel = value; await refused(f.boundary.prepare(f.input)); }
});

test('independent preview: exact record identity/body/digest and immutable metadata are required', async () => {
  for (const variant of ['record', 'digest', 'body', 'nonstring', 'surrogate']) {
    const f = fixture();
    if (variant === 'record') f.data.recordRef = hash('foreign-record');
    if (variant === 'digest') f.data.digest = hash('wrong-digest');
    if (variant === 'body') f.data.content = 'Changed content retaining a digest';
    if (variant === 'nonstring') f.data.content = {};
    if (variant === 'surrogate') { f.data.content = '\uD800'; f.data.digest = f.spec.dataDigest = hash(f.data.content); }
    await refused(f.boundary.prepare(f.input)); assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: task/control/action/resource/model-policy decision table fails closed', async () => {
  const changes = [f => { f.snapshot.task.version++; }, f => { f.snapshot.task.authEpoch++; },
    ...['paused', 'cancel_requested', 'cancelled'].map(value => f => { f.snapshot.control = value; }),
    ...['completed', 'failed', 'cancel_requested', 'cancelled', 'recovery_required', 'deleted'].map(value => f => { f.snapshot.task.status = value; }),
    f => { f.snapshot.actions = []; }, f => { f.snapshot.actions[0].actionDigest = hash('other'); }, f => { f.snapshot.actions[0].claimRef = hash('claim'); },
    ...['granted', 'dispatch_intent', 'unknown', 'completed'].map(value => f => { f.snapshot.actions[0].state = value; }),
    f => { f.snapshot.policy = null; }, f => { f.snapshot.policy.version++; }, f => { f.snapshot.policy.modelPolicy.version++; },
    f => { f.snapshot.policy.modelPolicy.catalogEvidenceRef = hash('other-catalog'); }, f => { f.snapshot.policy.modelPolicy.presetRefs = []; }];
  for (const change of changes) { const f = fixture(); change(f); await refused(f.boundary.prepare(f.input)); assert.equal(f.state.resolves, 0); assert.equal(f.state.grants.length, 0); }
});

test('independent preview: prepare post-await version/auth/control/spec/data/metadata/policy/disposal races reject', async () => {
  const changes = [f => { f.snapshot.task.version++; }, f => { f.snapshot.task.authEpoch++; }, f => { f.snapshot.control = 'paused'; },
    f => { f.spec.units++; }, f => { f.data.content = 'Changed data after resolver'; }, f => { f.data.taskVersion++; },
    f => { f.snapshot.policy.modelPolicy.catalogEvidenceRef = hash('other-catalog'); }, f => { f.state.alive = false; }, f => f.boundary.dispose()];
  for (const change of changes) {
    const gate = deferred(), f = fixture({ resolve: async value => { await gate.promise; return clone(value.labels); } });
    const pending = f.boundary.prepare(f.input), rejected = refused(pending); change(f); gate.release(); await rejected; assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: grant post-await data/metadata/task/auth/policy/claim/disposal changes never write', async () => {
  const changes = [f => { f.data.content = 'Changed after visible preview'; }, f => { f.data.kind = 'artifact'; }, f => { f.data.authEpoch++; },
    f => { f.snapshot.task.version++; }, f => { f.snapshot.task.authEpoch++; }, f => { f.snapshot.control = 'cancel_requested'; },
    f => { f.snapshot.policy.version++; }, f => { f.snapshot.policy.modelPolicy.presetRefs = []; }, f => { f.snapshot.actions[0].claimRef = hash('claim'); },
    f => { f.state.alive = false; }, f => f.boundary.dispose()];
  for (const change of changes) {
    const gate = deferred(), f = fixture({ resolve: async value => { if (value.state.resolves === 2) await gate.promise; return clone(value.labels); } });
    const preview = await f.boundary.prepare(f.input), pending = f.boundary.grant(f.grantInput(preview)), rejected = refused(pending);
    change(f); gate.release(); await rejected; assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: every displayed label/tool/evidence change requires a fresh explicit preview', async () => {
  for (const field of ['targetLabel', 'providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd', 'toolNames', 'evidenceRef']) {
    const f = fixture(), preview = await f.boundary.prepare(f.input);
    f.labels[field] = field === 'toolNames' ? ['different_tool'] : field === 'evidenceRef' ? hash('changed-evidence') : 'Changed concrete meaning';
    await refused(f.boundary.grant(f.grantInput(preview)), 'PREVIEW_STALE'); assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: clock regression, invalid instants and expiry during awaited grant never write', async () => {
  for (const now of [999, -1, NaN, Infinity, 1.5, 8640000000000001]) {
    const f = fixture(), preview = await f.boundary.prepare(f.input); f.state.now = now;
    await refused(f.boundary.grant(f.grantInput(preview)), 'PREVIEW_UNAVAILABLE'); assert.equal(f.state.grants.length, 0);
  }
  const gate = deferred(), f = fixture({ resolve: async value => { if (value.state.resolves === 2) await gate.promise; return clone(value.labels); } });
  const preview = await f.boundary.prepare(f.input), pending = f.boundary.grant(f.grantInput(preview)), rejected = refused(pending, 'PREVIEW_STALE');
  f.state.now = preview.expiresAt; gate.release(); await rejected; assert.equal(f.state.grants.length, 0);
  const overflow = fixture(); overflow.state.now = 8640000000000000; await refused(overflow.boundary.prepare(overflow.input), 'INVALID_INPUT');
});

test('independent preview: exported error class cannot smuggle resolver secrets in prepare or grant', async () => {
  for (const stage of ['prepare', 'grant']) for (const makeError of [() => new Error(`${canary} ${privatePath}`), () => new PreviewError(`${canary} ${privatePath}`), () => ({ code: `${canary} ${privatePath}` })]) {
    const f = fixture({ resolve: value => { if (stage === 'prepare' || value.state.resolves === 2) throw makeError(); return clone(value.labels); } });
    if (stage === 'prepare') await refused(f.boundary.prepare(f.input), 'PREVIEW_UNAVAILABLE');
    else { const preview = await f.boundary.prepare(f.input); await refused(f.boundary.grant(f.grantInput(preview)), 'PREVIEW_UNAVAILABLE'); }
    assert.equal(f.state.grants.length, 0);
  }
});

test('independent preview: secrets in exact data or any concrete label/tool name reject before output', async () => {
  for (const field of ['targetLabel', 'providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd', 'toolNames', 'content']) {
    const f = fixture();
    if (field === 'content') { f.data.content = canary; f.data.digest = f.spec.dataDigest = hash(canary); }
    else f.labels[field] = field === 'toolNames' ? [canary] : canary;
    await refused(f.boundary.prepare(f.input), 'SECRET_REJECTED'); assert.equal(f.state.grants.length, 0);
  }
  for (const content of ['Bearer syntheticPreviewToken12345', 'sk-proj-syntheticPreviewToken12345', '-----BEGIN PRIVATE KEY-----']) {
    const f = fixture(); f.data.content = content; f.data.digest = f.spec.dataDigest = hash(content);
    await refused(f.boundary.prepare(f.input), 'SECRET_REJECTED');
  }
});

test('independent preview: immediate disposal fences completed and unresolved tokens and no automatic retry occurs', async () => {
  const gate = deferred(), f = fixture({ resolve: async value => { if (value.state.resolves === 2) await gate.promise; return clone(value.labels); } });
  const preview = await f.boundary.prepare(f.input), pending = f.boundary.grant(f.grantInput(preview)), rejected = refused(pending, 'SERVICE_DISPOSED');
  f.boundary.dispose(); await refused(f.boundary.prepare(f.input), 'SERVICE_DISPOSED'); await refused(f.boundary.grant(f.grantInput(preview)), 'SERVICE_DISPOSED');
  gate.release(); await rejected; assert.equal(f.state.grants.length, 0); assert.equal(f.state.resolves, 2);
});
