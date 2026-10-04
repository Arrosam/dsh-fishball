import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeStore, reference as r, canonicalDigest } from '../src/runtime-store.mjs';
import { Foundation } from '../src/foundation.mjs';
import { SCHEMA_VERSION } from '../src/ledger.mjs';
import { MemoryAdapter } from '../src/memory.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { ResultPipeline } from '../src/results.mjs';
import { NotificationService } from '../src/notifications.mjs';

// Actual encrypted SQLite and production modules. All prose/keys/identities are
// synthetic; no profile/browser/server/provider/native-model effect is invoked.
const key = Buffer.alloc(32, 83), secret = 'DF-S3-INDEPENDENT-SYNTHETIC-SECRET';
const scope = { ownerId: 's3-independent-owner', workspaceId: 's3-independent-workspace' };
const moduleUrl = new URL('../src/runtime-store.mjs', import.meta.url).href;
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(t, extra = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'df-s3-independent-'));
  const owner = {}, coordinator = {}, host = {}, foreignOwner = {}, foreignWorkspace = {};
  const state = { now: 1000, sequence: 0 };
  const config = { databasePath: join(directory, 'ledger.sqlite'), encryptionKey: key,
    principals: [{ handle: owner, role: 'owner', scope }, { handle: coordinator, role: 'coordinator', scope }, { handle: host, role: 'host', scope },
      { handle: foreignOwner, role: 'owner', scope: { ...scope, ownerId: 's3-foreign-owner' } },
      { handle: foreignWorkspace, role: 'owner', scope: { ...scope, workspaceId: 's3-foreign-workspace' } }],
    clock: () => state.now, hostPermission: () => true, forbiddenSecrets: [secret], ...extra };
  let store = new RuntimeStore(config);
  t.after(() => { try { store.close(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  return { directory, config, state, owner, coordinator, host, foreignOwner, foreignWorkspace, get store() { return store; },
    command: () => r(`s3-independent-command-${++state.sequence}`), close() { store.close(); },
    reopen(overrides = {}) { store.close(); store = new RuntimeStore({ ...config, ...overrides }); return store; } };
}
function denied(fn, code) {
  assert.throws(fn, error => {
    if (code) assert.equal(error.code, code);
    assert.equal(error.message, error.code); assert.ok(!String(error.stack).includes(secret)); return true;
  });
}
function task(f, id = 'task', goal = 'Current bounded goal') {
  return f.store.intake(f.owner, { taskId: id, provider: 'fixture', source: 's3-inbox', eventId: `initial-${id}`, commandRef: f.command(), goal }).task;
}
function source(f, extra = {}, id = 'source') {
  return f.store.configureSource(f.owner, { sourceRef: r(id), commandRef: f.command(), expectedRevision: 0,
    spec: { kind: 'internal', enabled: true, identityMode: 'unique_id', adapterRef: r('synthetic-adapter'), permissionPolicyRef: r('source-permission'),
      maxEventAgeMs: 100, rate: { windowMs: 1000, maxEvents: 4 }, ...extra } });
}
function subscription(f, s, spec = {}, id = 'subscription') {
  return f.store.configureSubscription(f.owner, { sourceRef: s.sourceRef, subscriptionRef: r(id), commandRef: f.command(), expectedRevision: 0,
    expectedSourceRevision: s.revision, spec: { enabled: true, triggerRef: r('trigger'), route: 'new_task', ...spec } });
}
function event(f, s, u, extra = {}) {
  const sequence = ++f.state.sequence;
  return { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, expectedSourceRevision: s.revision, expectedSubscriptionRevision: u.revision,
    commandRef: f.command(), eventRef: r(`event-${sequence}`), eventDigest: r(`content-${sequence}`), observedAt: f.state.now, receivedAt: f.state.now,
    taskId: `event-task-${sequence}`, providerRef: r('synthetic-provider'), sourceIdentityRef: r('synthetic-source'), goal: 'Bounded event goal', ...extra };
}
function route(extra = {}) {
  return { pairingRef: r('pair'), pairingRevision: 1, principalRef: r('paired-principal'), conversationRef: r('private-conversation'),
    threadRef: r('original-thread'), conversationKind: 'private', ...extra };
}
function memoryInput(f, content = 'Synthetic memory fact', extra = {}) {
  return { namespaceRef: r('namespace'), commandRef: f.command(), expectedRevision: 0, content, sourceRefs: [r('fact-source')], ...extra };
}
function files(f) { return new Map(readdirSync(f.directory).sort().map(name => [name, readFileSync(join(f.directory, name))])); }
function sameFiles(f, before) {
  assert.deepEqual(readdirSync(f.directory).sort(), [...before.keys()]);
  for (const [name, bytes] of before) assert.deepEqual(readFileSync(join(f.directory, name)), bytes, `${name} preserved`);
}
function sql(path, fn) { const db = new DatabaseSync(path); try { return fn(db); } finally { db.close(); } }
function processFixture(t, f, operation) {
  const code = `import{RuntimeStore}from${JSON.stringify(moduleUrl)};const owner={},host={},coordinator={};
const store=new RuntimeStore({databasePath:${JSON.stringify(f.config.databasePath)},encryptionKey:Buffer.alloc(32,83),principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}},{handle:coordinator,role:'coordinator',scope:${JSON.stringify(scope)}}],clock:()=>1000,hostPermission:()=>true,limits:${JSON.stringify(f.config.limits ?? {})},forbiddenSecrets:[${JSON.stringify(secret)}]});
process.send({ready:true});process.once('message',message=>{let result;try{result={ok:true,value:(()=>{${operation}})()};}catch(error){result={ok:false,code:error.code,message:error.message};}store.close();process.send({result},()=>process.disconnect());});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let resolveReady, rejectReady, value, stderr = '';
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const timer = setTimeout(() => { child.kill(); rejectReady(Error('independent process missed ready barrier')); }, 5000);
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('message', message => { if (message.ready) { clearTimeout(timer); resolveReady(); } if (message.result) value = message.result; });
  const done = new Promise((resolve, reject) => {
    child.once('error', error => { clearTimeout(timer); rejectReady(error); reject(error); });
    child.once('exit', status => { clearTimeout(timer); if (status !== 0 || !value) reject(Error(`process exit ${status}: ${stderr}`)); else resolve(value); });
  });
  // Cleanup of a contestant after an earlier assertion failure must not leave
  // an unhandled rejection; request() still returns the original failing promise.
  done.catch(() => {});
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill(); });
  return { ready, request(input) { child.send({ input }); return done; } };
}
async function readProcess(t, f, operation) {
  const child = processFixture(t, f, operation); await child.ready; const result = await child.request({}); assert.equal(result.ok, true, result.code); return result.value;
}
function plannedContext(f) {
  const active = task(f, 'execution-task'), data = f.store.putData(f.coordinator, { taskRef: active.taskRef, commandRef: f.command(),
    expectedTaskVersion: active.version, expectedAuthEpoch: active.authEpoch, kind: 'context', content: 'Synthetic current context metadata fixture', sourceRef: r('context-source') });
  const policy = f.store.policy(f.owner, { commandRef: f.command(), expectedVersion: f.store.getPolicy(f.owner).version, limits: {},
    modelPolicy: { version: 1, presetRefs: [r('preset')], catalogEvidenceRef: r('catalog') } });
  const spec = { actionRef: f.command(), kind: 'write', role: 'worker', targetDigest: r('target'), dataDigest: data.digest, units: 1,
    charges: { runtimeMs: 1, usageUnits: 1, costEstimateMicros: 0 }, attemptGroupRef: r('attempt'), attemptIndex: 1,
    resourcePolicyVersion: policy.version, modelPolicyVersion: 1,
    model: { presetRef: r('preset'), modelRef: r('model'), reasoningRef: r('reasoning'), catalogEvidenceRef: r('catalog') },
    executor: { mode: 'create', generationRef: f.command(), environmentRef: r('environment'), bindingDigest: r('environment-binding'), toolsDigest: r('tools'), permissionPolicyDigest: r('permission') } };
  const binding = { taskRef: active.taskRef, expectedTaskVersion: data.task.version, expectedAuthEpoch: data.task.authEpoch };
  const action = f.store.planAction(f.owner, { ...binding, commandRef: f.command(), spec });
  const grant = f.store.grantAction(f.owner, { ...binding, commandRef: f.command(), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: 2000 });
  return { data, action, grant, binding };
}
function contextIntent(f, plan) {
  const claim = f.store.claimAction(f.host, { taskRef: plan.data.task.taskRef, expectedTaskVersion: plan.grant.task.version, expectedAuthEpoch: plan.grant.authEpoch,
    commandRef: f.command(), actionRef: plan.action.actionRef, actionDigest: plan.action.actionDigest });
  f.store.workerObservation(f.host, { taskRef: plan.data.task.taskRef, commandRef: f.command(), claimRef: claim.claimRef, generationRef: claim.generationRef,
    sessionRef: r(`observed-session-${claim.generationRef}`), phase: 'ready', evidenceRef: r('ready') });
  const current = f.store.task(f.owner, plan.data.task.taskRef), input = { taskRef: current.taskRef, actionRef: claim.actionRef, actionDigest: claim.actionDigest,
    claimRef: claim.claimRef, generationRef: claim.generationRef, contextRecordRef: plan.data.recordRef, commandRef: f.command(), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch };
  const intent = f.store.beginContextExecution(f.host, input);
  return { claim, intent, input, consume: { taskRef: current.taskRef, claimRef: claim.claimRef, generationRef: claim.generationRef, actionDigest: claim.actionDigest, executionRef: intent.executionRef } };
}
function auditFixture(f) {
  const active = task(f, 'audit-task'), policy = f.store.policy(f.owner, { commandRef: f.command(), expectedVersion: f.store.getPolicy(f.owner).version, limits: {},
    modelPolicy: { version: 1, presetRefs: [r('preset')], catalogEvidenceRef: r('catalog') } });
  const current = () => f.store.task(f.owner, active.taskRef);
  const bind = () => ({ taskRef: active.taskRef, expectedTaskVersion: current().version, expectedAuthEpoch: current().authEpoch });
  const artifact = f.store.writeArtifact(f.owner, { ...bind(), commandRef: f.command(), artifactRef: r('audited-artifact'), version: 1, content: 'Exact independently audited synthetic result' });
  const material = [{ recordRef: artifact.recordRef, digest: artifact.digest }];
  const configure = (id, more = {}) => f.store.configureAudit(f.owner, { ...bind(), commandRef: f.command(), auditRef: r(id), expectedAuditRevision: 0,
    artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest, material, policyRef: r('explicit-audit-policy'), blockingSeverities: [], maxRepairRounds: 1, ...more });
  const plan = (required, kind = 'review') => {
    const spec = { actionRef: f.command(), kind, role: kind === 'review' ? 'review' : 'repair', targetDigest: required.bindingDigest, dataDigest: artifact.digest,
      units: 1, charges: { runtimeMs: 1, usageUnits: 1, costEstimateMicros: 0 }, attemptGroupRef: f.command(), attemptIndex: 1,
      resourcePolicyVersion: policy.version, modelPolicyVersion: 1, model: { presetRef: r('preset'), modelRef: r('model'), reasoningRef: r('reasoning'), catalogEvidenceRef: r('catalog') },
      executor: { mode: 'none', generationRef: f.command(), environmentRef: r('environment'), bindingDigest: r('bound-executor'), toolsDigest: r('tools'), permissionPolicyDigest: r('permissions') } };
    const action = f.store.planAction(f.owner, { ...bind(), commandRef: f.command(), spec });
    f.store.grantAction(f.owner, { ...bind(), commandRef: f.command(), actionRef: action.actionRef, actionDigest: action.actionDigest, expiresAt: 2000 });
    return { ...bind(), commandRef: f.command(), actionRef: action.actionRef, actionDigest: action.actionDigest };
  };
  const claim = required => {
    const admitted = f.store.claimAction(f.host, plan(required)), reviewer = {};
    f.store.bindExecution(f.host, reviewer, { taskRef: active.taskRef, generationRef: admitted.generationRef, sessionRef: f.command(), role: 'reviewer', readRecordRefs: material.map(value => value.recordRef) });
    return { ...admitted, reviewer };
  };
  const report = (required, admitted, more = {}) => ({ taskRef: active.taskRef, commandRef: f.command(), auditRef: required.auditRef,
    artifactVersion: artifact.version, digest: artifact.digest, materialDigest: required.materialDigest, claimRef: admitted.claimRef, generationRef: admitted.generationRef,
    coverageRefs: material.map(value => value.recordRef), unexaminedRefs: [], verdict: 'passed', findings: [], evidenceRef: f.command(), ...more });
  const release = admitted => f.store.settleAction(f.host, { taskRef: active.taskRef, commandRef: f.command(), claimRef: admitted.claimRef, generationRef: admitted.generationRef,
    outcome: 'completed', evidenceRef: f.command() });
  const complete = () => f.store.revise(f.owner, { ...bind(), commandRef: f.command(), status: 'completed', reason: 'progress' });
  return { active, current, bind, artifact, material, configure, plan, claim, report, release, complete };
}

test('independent schema4 memory: exact private owner/workspace identity, raw/ref and generation roles remain isolated', t => {
  const f = fixture(t), input = memoryInput(f), written = f.store.putMemory(f.owner, input);
  assert.equal(written.namespaceRef, input.namespaceRef); assert.notEqual(written.namespaceRef, r(input.namespaceRef));
  for (const actor of [f.foreignOwner, f.foreignWorkspace]) {
    assert.equal(f.store.getMemory(actor, { namespaceRef: input.namespaceRef }), null); assert.deepEqual(f.store.listMemory(actor), []);
    const receipt = f.store.putMemory(actor, { ...input, commandRef: f.command(), content: 'Different scoped fact' });
    assert.notEqual(receipt.ownerRef + receipt.workspaceRef, written.ownerRef + written.workspaceRef);
  }
  assert.equal(f.store.getMemory(f.owner, { namespaceRef: input.namespaceRef }).content, input.content);
  for (const forged of [{}, { role: 'owner', scope }, structuredClone(f.owner)]) denied(() => f.store.getMemory(forged, { namespaceRef: input.namespaceRef }), 'UNAUTHORIZED');
  denied(() => f.store.putMemory(f.host, { ...input, commandRef: f.command() }), 'UNAUTHORIZED');
  const active = task(f), worker = {}, reviewer = {};
  f.store.bindExecution(f.host, worker, { taskRef: active.taskRef, generationRef: r('worker'), sessionRef: r('worker-session'), role: 'worker' });
  f.store.bindExecution(f.host, reviewer, { taskRef: active.taskRef, generationRef: r('reviewer'), sessionRef: r('review-session'), role: 'reviewer', readRecordRefs: [] });
  for (const actor of [worker, reviewer]) denied(() => f.store.memoryBinding(actor), 'UNAUTHORIZED');
  const listed = f.store.listMemory(f.owner); assert.equal(Object.hasOwn(listed[0], 'content'), false);
});

test('independent schema4 memory: old command receipts replay exactly after new revisions and tombstones without resurrection', t => {
  const f = fixture(t), input = memoryInput(f, 'Original sourced fact', { requestDigest: r('first-request') });
  const first = f.store.putMemory(f.owner, input);
  const updated = f.store.putMemory(f.owner, { ...input, commandRef: f.command(), expectedRevision: 1, content: 'Corrected sourced fact', requestDigest: r('second-request') });
  assert.equal(updated.revision, 2); assert.deepEqual(f.store.putMemory(f.owner, input), first);
  denied(() => f.store.putMemory(f.owner, { ...input, content: 'changed command bytes' }), 'IDEMPOTENCY_CONFLICT');
  denied(() => f.store.memoryCommandReceipt(f.owner, { namespaceRef: input.namespaceRef, commandRef: input.commandRef, requestDigest: r('wrong-request') }), 'IDEMPOTENCY_CONFLICT');
  const removal = { namespaceRef: input.namespaceRef, commandRef: f.command(), expectedRevision: 2, requestDigest: r('deletion-request') };
  const tombstone = f.store.deleteMemory(f.owner, removal); assert.equal(tombstone.revision, 3); assert.equal(tombstone.deleted, true);
  assert.deepEqual(f.store.putMemory(f.owner, input), first); assert.deepEqual(f.store.deleteMemory(f.owner, removal), tombstone);
  denied(() => f.store.putMemory(f.owner, { ...input, commandRef: f.command(), expectedRevision: 3 }), 'MEMORY_DELETED');
  f.reopen(); const current = f.store.getMemory(f.owner, { namespaceRef: input.namespaceRef });
  assert.equal(current.revision, 3); assert.equal(current.deleted, true); assert.equal(Object.hasOwn(current, 'content'), false);
  assert.deepEqual(f.store.memoryCommandReceipt(f.owner, { namespaceRef: input.namespaceRef, commandRef: input.commandRef, requestDigest: input.requestDigest }), first);
});

test('independent schema4 memory: complete4MiB UTF-8 N-1/N/N+1 writes and source-list limits are atomic', t => {
  const f = fixture(t), capacity = 4194304;
  for (const bytes of [capacity - 1, capacity]) {
    const content = '界'.repeat(Math.floor(bytes / 3)) + 'a'.repeat(bytes % 3), input = memoryInput(f, content, { namespaceRef: r(`bytes-${bytes}`) });
    const receipt = f.store.putMemory(f.owner, input); assert.equal(receipt.byteLength, bytes);
    const read = f.store.getMemory(f.owner, { namespaceRef: input.namespaceRef }); assert.equal(read.content, content); assert.equal(read.digest, sha(content));
  }
  const before = f.store.listMemory(f.owner);
  denied(() => f.store.putMemory(f.owner, memoryInput(f, 'x'.repeat(capacity + 1))), 'MEMORY_LIMIT');
  for (const sourceRefs of [Array.from({ length: 17 }, (_, i) => r(`source-${i}`)), [r('same'), r('same')], Array(1)]) denied(() => f.store.putMemory(f.owner, memoryInput(f, 'safe', { sourceRefs })), 'INVALID_INPUT');
  assert.deepEqual(f.store.listMemory(f.owner), before);
  const input = memoryInput(f, 'at16', { sourceRefs: Array.from({ length: 16 }, (_, i) => r(`source-${i}`)) });
  assert.equal(f.store.putMemory(f.owner, input).sourceRefs.length, 16);
});

test('independent schema4 memory: namespace15/16/17 cap retains tombstones and scopes capacity separately', t => {
  const f = fixture(t), inputs = [];
  for (let i = 0; i < 16; i++) { const input = memoryInput(f, `fact-${i}`, { namespaceRef: r(`namespace-${i}`) }); inputs.push(input); f.store.putMemory(f.owner, input); }
  assert.equal(f.store.listMemory(f.owner).length, 16);
  denied(() => f.store.putMemory(f.owner, memoryInput(f, 'over-cap', { namespaceRef: r('namespace-17') })), 'MEMORY_LIMIT');
  f.store.deleteMemory(f.owner, { namespaceRef: inputs[0].namespaceRef, commandRef: f.command(), expectedRevision: 1 });
  denied(() => f.store.putMemory(f.owner, memoryInput(f, 'cannot evict tombstone', { namespaceRef: r('namespace-17') })), 'MEMORY_LIMIT');
  f.store.putMemory(f.foreignWorkspace, memoryInput(f, 'different workspace has its own capacity', { namespaceRef: r('namespace-17') }));
  assert.equal(f.store.listMemory(f.owner).length, 16); assert.equal(f.store.listMemory(f.foreignWorkspace).length, 1);
});

test('independent schema4 memory: live metadata relabeling and reopen reject authenticated fact changes with exact bytes', t => {
  for (const field of ['revision', 'namespaceRef', 'recordRef', 'digest', 'deleted', 'sourceRefs', 'updatedAt', 'byteLength', 'cryptoVersion']) {
    const f = fixture(t), input = memoryInput(f), receipt = f.store.putMemory(f.owner, input);
    sql(f.config.databasePath, db => {
      const row = db.prepare('SELECT * FROM workspace_memory').get(), metadata = JSON.parse(row.metadata);
      metadata[field] = field === 'sourceRefs' ? [r('altered-source')] : field === 'deleted' ? true : typeof metadata[field] === 'number' ? metadata[field] + 1 : r(`altered-${field}`);
      db.prepare('UPDATE workspace_memory SET metadata=?').run(JSON.stringify(metadata));
    });
    denied(() => f.store.getMemory(f.owner, { namespaceRef: input.namespaceRef }), 'STORAGE_INVALID');
    denied(() => f.store.listMemory(f.owner), 'STORAGE_INVALID'); f.close(); const before = files(f);
    denied(() => new RuntimeStore(f.config), 'STORAGE_INVALID'); sameFiles(f, before); assert.equal(receipt.revision, 1);
  }
});

test('independent schema4 memory: secret, malformed UTF-8 and hostile source descriptors reject before write', t => {
  const f = fixture(t); let traps = 0;
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true, get() { traps++; throw Error(secret); } });
  for (const content of [secret, 'prefix\uD800suffix', '\uDC00']) denied(() => f.store.putMemory(f.owner, memoryInput(f, content)), content === secret ? 'SECRET_REJECTED' : 'INVALID_INPUT');
  for (const sourceRefs of [accessor, new Proxy([], { get() { traps++; throw Error(secret); } })]) denied(() => f.store.putMemory(f.owner, memoryInput(f, 'safe', { sourceRefs })), 'INVALID_INPUT');
  assert.equal(traps, 0); assert.deepEqual(f.store.listMemory(f.owner), []);
});

test('independent schema4 events: exact age and clock-order boundaries reject without rate/task/cursor mutation', t => {
  for (const delta of [-1, 0, 1]) {
    const f = fixture(t), s = source(f), u = subscription(f, s), input = event(f, s, u, { observedAt: 1000 - (100 + delta) });
    if (delta <= 0) assert.equal(f.store.ingestEvent(f.host, input).task.version, 1);
    else { denied(() => f.store.ingestEvent(f.host, input), 'EVENT_EXPIRED'); assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 0); assert.deepEqual(f.store.listTasks(f.owner), []); }
  }
  for (const values of [{ observedAt: 1001, receivedAt: 1000 }, { observedAt: 1000, receivedAt: 1001 }, { observedAt: -1, receivedAt: 1000 }]) {
    const f = fixture(t), s = source(f), u = subscription(f, s), input = event(f, s, u, values);
    denied(() => f.store.ingestEvent(f.host, input), values.observedAt < 0 ? 'INVALID_INPUT' : 'EVENT_CLOCK_INVALID');
    assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 0); assert.equal(f.store.listTasks(f.owner).length, 0);
  }
});

test('independent schema4 events: duplicate immutable association consumes no quota and cannot change digest or goal', t => {
  const f = fixture(t), s = source(f, { rate: { windowMs: 1000, maxEvents: 1 } }), u = subscription(f, s), input = event(f, s, u);
  const first = f.store.ingestEvent(f.host, input);
  const replay = f.store.ingestEvent(f.host, { ...input, commandRef: f.command(), taskId: 'silent-rebind', goal: 'Different duplicate goal' });
  assert.equal(replay.deduplicated, true); assert.equal(replay.taskRef, first.taskRef); assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 1);
  const [goal] = f.store.listData(f.owner, { taskRef: first.taskRef, kind: 'goal' }); assert.equal(f.store.readData(f.owner, { taskRef: first.taskRef, recordRef: goal.recordRef }).content, input.goal);
  denied(() => f.store.ingestEvent(f.host, { ...input, commandRef: f.command(), eventDigest: r('changed') }), 'IDEMPOTENCY_CONFLICT');
  denied(() => f.store.ingestEvent(f.host, event(f, s, u)), 'RATE_LIMIT');
  assert.equal(f.store.listTasks(f.owner).length, 1); assert.equal(f.store.listEventReceipts(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef }).length, 1);
  f.reopen(); assert.equal(f.store.eventReceipt(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, eventRef: input.eventRef }).state, 'registered');
});

test('independent schema4 events: rate-window N-1/N/N+1 resets exactly while rejected work remains unregistered', t => {
  for (const delta of [-1, 0, 1]) {
    const f = fixture(t), s = source(f, { rate: { windowMs: 1000, maxEvents: 1 } }), u = subscription(f, s);
    f.store.ingestEvent(f.host, event(f, s, u)); f.state.now = 2000 + delta;
    if (delta === -1) denied(() => f.store.ingestEvent(f.host, event(f, s, u)), 'RATE_LIMIT');
    else f.store.ingestEvent(f.host, event(f, s, u));
    assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 1);
    assert.equal(f.store.listTasks(f.owner).length, delta === -1 ? 1 : 2);
  }
});

test('independent schema4 events: source31/32/33 and subscription127/128/129 enforce hard workspace bounds', t => {
  const f = fixture(t); const sources = [];
  for (let i = 0; i < 32; i++) sources.push(source(f, {}, `source-${i}`));
  assert.equal(f.store.listSources(f.owner).length, 32); denied(() => source(f, {}, 'source-33'), 'EVENT_LIMIT');
  for (let i = 0; i < 128; i++) subscription(f, sources[0], {}, `subscription-${i}`);
  assert.equal(f.store.listSubscriptions(f.owner).length, 128); denied(() => subscription(f, sources[0], {}, 'subscription-129'), 'EVENT_LIMIT');
  assert.equal(f.store.listSources(f.foreignWorkspace).length, 0); assert.equal(f.store.listSubscriptions(f.foreignOwner).length, 0);
});

test('independent schema4 events: revoked/stale binding and foreign/fake actors refuse before encrypted ingress', t => {
  const f = fixture(t), s = source(f), u = subscription(f, s), original = event(f, s, u);
  for (const actor of [f.owner, f.coordinator, {}, { role: 'host', scope }]) denied(() => f.store.ingestEvent(actor, { ...original, commandRef: f.command() }), 'UNAUTHORIZED');
  const disabled = f.store.configureSource(f.owner, { sourceRef: s.sourceRef, commandRef: f.command(), expectedRevision: s.revision, spec: { ...s.spec, enabled: false } });
  denied(() => f.store.ingestEvent(f.host, { ...original, commandRef: f.command() }), 'STALE_SOURCE');
  denied(() => f.store.ingestEvent(f.host, { ...original, commandRef: f.command(), expectedSourceRevision: disabled.revision }), 'SOURCE_DISABLED');
  assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 0); assert.equal(f.store.listTasks(f.owner).length, 0);
});

test('independent schema4 chat: exact original private route permits control while each changed route component denies', t => {
  for (const field of ['pairingRef', 'pairingRevision', 'principalRef', 'conversationRef', 'threadRef', 'conversationKind']) {
    const f = fixture(t), originalRoute = route(), s = source(f, { kind: 'chat', routeBinding: originalRoute }), u = subscription(f, s);
    const admitted = f.store.ingestEvent(f.host, event(f, s, u, { routeBinding: originalRoute }));
    const binding = { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1, taskRef: admitted.taskRef };
    assert.equal(f.store.chatTask(f.host, binding).task.taskRef, admitted.taskRef);
    const pause = f.store.chatControl(f.host, { ...binding, commandRef: f.command(), expectedTaskVersion: 1, expectedAuthEpoch: 0, kind: 'pause' }); assert.equal(pause.control, 'paused');
    const changed = { ...originalRoute, [field]: field === 'pairingRevision' ? 2 : field === 'conversationKind' ? 'group' : r(`changed-${field}`) };
    const revised = f.store.configureSource(f.owner, { sourceRef: s.sourceRef, commandRef: f.command(), expectedRevision: 1, spec: { ...s.spec, routeBinding: changed } });
    denied(() => f.store.chatTask(f.host, { ...binding, expectedSourceRevision: revised.revision }), 'ROUTE_MISMATCH');
    const current = f.store.task(f.owner, admitted.taskRef);
    denied(() => f.store.chatControl(f.host, { ...binding, expectedSourceRevision: revised.revision, commandRef: f.command(), expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch, kind: 'cancel' }), 'ROUTE_MISMATCH');
    assert.equal(f.store.snapshot(f.owner, { taskRef: admitted.taskRef }).control, 'paused');
  }
});

test('independent schema4 chat: quota-only reconfiguration preserves route access and group cannot become private owner control', t => {
  const f = fixture(t), originalRoute = route(), s = source(f, { kind: 'chat', routeBinding: originalRoute }), u = subscription(f, s);
  const admitted = f.store.ingestEvent(f.host, event(f, s, u, { routeBinding: originalRoute }));
  const revised = f.store.configureSource(f.owner, { sourceRef: s.sourceRef, commandRef: f.command(), expectedRevision: 1, spec: { ...s.spec, rate: { windowMs: 1000, maxEvents: 1 } } });
  assert.equal(f.store.chatTask(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, expectedSourceRevision: revised.revision, expectedSubscriptionRevision: 1, taskRef: admitted.taskRef }).task.taskRef, admitted.taskRef);
  const g = fixture(t), group = route({ conversationKind: 'group' }), gs = source(g, { kind: 'chat', routeBinding: group }), gu = subscription(g, gs);
  const registered = g.store.ingestEvent(g.host, event(g, gs, gu, { routeBinding: group }));
  denied(() => g.store.chatTask(g.host, { sourceRef: gs.sourceRef, subscriptionRef: gu.subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1, taskRef: registered.taskRef }), 'ROUTE_MISMATCH');
});

test('independent schema4 clock: host cannot approve missed effects and verification cannot be silently skipped', t => {
  const f = fixture(t), s = source(f, { kind: 'schedule' }), u = subscription(f, s);
  const binding = { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, expectedSourceRevision: 1, expectedSubscriptionRevision: 1, clockRef: r('clock'), expectedCursor: null };
  const planDigest = r('exact-verification-plan'), pending = f.store.advanceEventClock(f.host, { ...binding, commandRef: f.command(), through: 1000, decision: 'verification_required', planDigest });
  assert.equal(pending.cursor, null); assert.equal(pending.pendingVerification.approved, false);
  denied(() => f.store.approveEventClock(f.host, { ...binding, commandRef: f.command(), planDigest }), 'UNAUTHORIZED');
  denied(() => f.store.approveEventClock(f.owner, { ...binding, commandRef: f.command(), planDigest: r('different') }), 'VERIFICATION_REQUIRED');
  denied(() => f.store.advanceEventClock(f.host, { ...binding, commandRef: f.command(), through: 1000, decision: 'skipped', planDigest }), 'VERIFICATION_REQUIRED');
  denied(() => f.store.ingestEvent(f.host, event(f, s, u, { clockRef: binding.clockRef, expectedCursor: null, scheduledAt: 1000, verificationPlanDigest: planDigest })), 'VERIFICATION_REQUIRED');
  assert.equal(f.store.listTasks(f.owner).length, 0); assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 0);
  f.store.approveEventClock(f.owner, { ...binding, commandRef: f.command(), planDigest });
  f.store.ingestEvent(f.host, event(f, s, u, { clockRef: binding.clockRef, expectedCursor: null, scheduledAt: 1000, verificationPlanDigest: planDigest }));
  assert.equal(f.store.eventClock(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, clockRef: binding.clockRef }).cursor, 1000);
});

test('independent actual processes: duplicate event identity commits one immutable task/goal/rate fact', { timeout: 15000 }, async t => {
  const f = fixture(t), s = source(f), u = subscription(f, s); f.close();
  const input = event(f, s, u), children = [processFixture(t, f, 'return store.ingestEvent(host,message.input);'), processFixture(t, f, 'return store.ingestEvent(host,message.input);')];
  await Promise.all(children.map(child => child.ready));
  const results = await Promise.all(children.map((child, index) => child.request({ ...input, commandRef: r(`process-event-${index}`), taskId: `race-task-${index}`, goal: `winner goal ${index}` })));
  assert.ok(results.every(result => result.ok), JSON.stringify(results)); assert.deepEqual(results.map(result => result.value.deduplicated).sort(), [false, true]);
  assert.equal(results[0].value.taskRef, results[1].value.taskRef); const winner = results.findIndex(result => !result.value.deduplicated);
  const read = await readProcess(t, f, `const tasks=store.listTasks(owner),source=store.source(owner,{sourceRef:${JSON.stringify(s.sourceRef)}});const data=store.listData(owner,{taskRef:tasks[0].taskRef,kind:'goal'});return{tasks,source,content:store.readData(owner,{taskRef:tasks[0].taskRef,recordRef:data[0].recordRef}).content};`);
  assert.equal(read.tasks.length, 1); assert.equal(read.source.rateCount, 1); assert.equal(read.content, `winner goal ${winner}`);
});

test('independent actual processes: memory CAS has one winner, no lost update and exact third-process ciphertext readback', { timeout: 15000 }, async t => {
  const f = fixture(t), input = memoryInput(f); f.store.putMemory(f.owner, input); f.close();
  const children = [processFixture(t, f, 'return store.putMemory(owner,message.input);'), processFixture(t, f, 'return store.putMemory(owner,message.input);')];
  await Promise.all(children.map(child => child.ready));
  const results = await Promise.all(children.map((child, index) => child.request({ ...input, expectedRevision: 1, commandRef: r(`memory-race-${index}`), content: `memory CAS winner ${index}` })));
  assert.equal(results.filter(result => result.ok).length, 1); assert.equal(results.find(result => !result.ok).code, 'STALE_MEMORY');
  const winner = results.findIndex(result => result.ok), read = await readProcess(t, f, `return store.getMemory(owner,{namespaceRef:${JSON.stringify(input.namespaceRef)}});`);
  assert.equal(read.revision, 2); assert.equal(read.content, `memory CAS winner ${winner}`); assert.equal(read.digest, sha(read.content));
});

test('independent actual process crash: event beforecommit/postack cuts preserve distinct registration, goal and rate facts', { timeout: 15000 }, t => {
  for (const cut of ['before_commit', 'after_ack']) {
    const f = fixture(t), s = source(f), u = subscription(f, s), input = event(f, s, u); f.close();
    const code = `import{RuntimeStore}from${JSON.stringify(moduleUrl)};const owner={},host={};const store=new RuntimeStore({databasePath:${JSON.stringify(f.config.databasePath)},encryptionKey:Buffer.alloc(32,83),principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}],clock:()=>1000,fixtureMode:true,fixtureFaults:point=>{if(${JSON.stringify(cut)}==='before_commit'&&point==='before_commit')process.exit(73);}});store.ingestEvent(host,${JSON.stringify(input)});process.exit(73);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 5000 }); assert.equal(child.status, 73, child.stderr);
    f.reopen(); const receipts = f.store.listEventReceipts(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef });
    assert.equal(receipts.length, cut === 'before_commit' ? 0 : 1); assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, cut === 'before_commit' ? 0 : 1);
    if (cut === 'before_commit') assert.equal(f.store.listTasks(f.owner).length, 0);
    else {
      assert.equal(receipts[0].state, 'registered'); const replay = f.store.ingestEvent(f.host, input); assert.equal(replay.taskRef, receipts[0].taskRef);
      const [goal] = f.store.listData(f.owner, { taskRef: receipts[0].taskRef, kind: 'goal' }); assert.equal(f.store.readData(f.owner, { taskRef: receipts[0].taskRef, recordRef: goal.recordRef }).content, input.goal);
    }
  }
});

test('independent schema4 migration: actual crypto2 schema3 requires runtime key, exactbackup and refuses unknown metadata', t => {
  for (const mode of ['valid', 'missing-key', 'wrong-key', 'metadata-edit', 'migration-cut', 'occupied-backup']) {
    const f = fixture(t), active = task(f), [data] = f.store.listData(f.owner, { taskRef: active.taskRef }); f.close();
    let originalRow;
    sql(f.config.databasePath, db => {
      db.exec('DROP TABLE automation_records;DROP TABLE workspace_memory;PRAGMA user_version=3');
      if (mode === 'metadata-edit') { const row = db.prepare('SELECT metadata FROM runtime_data').get(), metadata = JSON.parse(row.metadata); metadata.sourceRef = r('forged-source'); db.prepare('UPDATE runtime_data SET metadata=?').run(JSON.stringify(metadata)); }
      originalRow = db.prepare('SELECT * FROM runtime_data').get(); assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
    });
    const backup = `${f.config.databasePath}.schema-3.backup`; if (mode === 'occupied-backup') writeFileSync(backup, 'synthetic occupied backup');
    const before = files(f);
    if (mode === 'valid') {
      f.reopen(); assert.equal(f.store.diagnostics().schemaVersion, SCHEMA_VERSION); assert.deepEqual(readFileSync(backup), before.get('ledger.sqlite'));
      assert.equal(f.store.readData(f.owner, { taskRef: active.taskRef, recordRef: data.recordRef }).content, 'Current bounded goal');
      f.close(); sql(f.config.databasePath, db => assert.deepEqual(db.prepare('SELECT * FROM runtime_data').get(), originalRow));
    } else {
      const expected = { 'missing-key': 'RUNTIME_MIGRATION_REQUIRED', 'wrong-key': 'KEY_MISMATCH', 'metadata-edit': 'STORAGE_INVALID', 'migration-cut': 'STORAGE_UNAVAILABLE', 'occupied-backup': 'STORAGE_UNAVAILABLE' }[mode];
      denied(() => mode === 'missing-key' ? new Foundation({ databasePath: f.config.databasePath }) : new RuntimeStore({ ...f.config,
        ...(mode === 'wrong-key' ? { encryptionKey: Buffer.alloc(32, 84) } : {}),
        ...(mode === 'migration-cut' ? { fixtureMode: true, migrationFault: () => { throw Error(secret); } } : {}) }), expected);
      if (mode === 'migration-cut') { assert.deepEqual(readFileSync(f.config.databasePath), before.get('ledger.sqlite')); assert.deepEqual(readFileSync(backup), before.get('ledger.sqlite')); }
      else sameFiles(f, before);
    }
  }
});

test('independent current command receipts: historical result and complete row bindings reject live/reopen tampering', t => {
  for (const mode of ['result', 'stripped-envelope', 'digest', 'operation', 'task', 'id', 'owner', 'workspace', 'mac']) {
    const f = fixture(t), active = task(f), input = memoryInput(f, 'Authenticated historical fact', { requestDigest: r('original-memory-request') });
    f.store.putMemory(f.owner, input); f.store.putMemory(f.owner, { ...input, commandRef: f.command(), expectedRevision: 1, content: 'Later current fact' });
    let lookup = { namespaceRef: input.namespaceRef, commandRef: input.commandRef, requestDigest: input.requestDigest }, actor = f.owner;
    sql(f.config.databasePath, db => {
      const row = db.prepare('SELECT * FROM runtime_commands WHERE id=?').get(input.commandRef), envelope = JSON.parse(row.receipt);
      assert.equal(envelope.format, 'command-receipt/v1'); assert.equal(envelope.data.revision, 1);
      if (mode === 'result') { envelope.data.revision = 999; db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope), row.id); }
      if (mode === 'stripped-envelope') db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope.data), row.id);
      if (mode === 'mac') { envelope.mac = r('forged-mac'); db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope), row.id); }
      if (mode === 'digest') db.prepare('UPDATE runtime_commands SET digest=? WHERE id=?').run(r('altered-digest'), row.id);
      if (mode === 'operation') db.prepare('UPDATE runtime_commands SET operation=? WHERE id=?').run('deleteMemory', row.id);
      if (mode === 'task') db.prepare('UPDATE runtime_commands SET task=? WHERE id=?').run(active.taskRef, row.id);
      if (mode === 'id') { lookup.commandRef = r('changed-command-id'); db.prepare('UPDATE runtime_commands SET id=? WHERE id=?').run(lookup.commandRef, row.id); }
      if (mode === 'owner') { actor = f.foreignOwner; db.prepare('UPDATE runtime_commands SET owner=? WHERE id=?').run(r('s3-foreign-owner'), row.id); }
      if (mode === 'workspace') { actor = f.foreignWorkspace; db.prepare('UPDATE runtime_commands SET workspace=? WHERE id=?').run(r('s3-foreign-workspace'), row.id); }
    });
    denied(() => f.store.memoryCommandReceipt(actor, lookup), 'STORAGE_INVALID');
    assert.equal(f.store.getMemory(f.owner, { namespaceRef: input.namespaceRef }).revision, 2, 'current encrypted projection remains independently exact');
    f.close(); const before = files(f); denied(() => new RuntimeStore(f.config), 'STORAGE_INVALID'); sameFiles(f, before);
  }
});

test('independent genuine schema3 plain receipts: migration preserves unverified bytes and refuses replay; marker stripping fails closed', t => {
  for (const mutation of ['none', 'legacy-marker', 'receipt-policy', 'new-envelope']) {
    const f = fixture(t), active = task(f), write = { taskRef: active.taskRef, commandRef: f.command(), expectedTaskVersion: active.version, expectedAuthEpoch: active.authEpoch,
      kind: 'context', content: 'Acknowledged prior schema3 synthetic context', sourceRef: r('context-source') };
    const receipt = f.store.putData(f.owner, write); f.close(); let oldReceipts;
    sql(f.config.databasePath, db => {
      for (const row of db.prepare('SELECT id,receipt FROM runtime_commands').all()) { const envelope = JSON.parse(row.receipt); assert.equal(envelope.format, 'command-receipt/v1'); db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(envelope.data), row.id); }
      db.exec('DROP TABLE automation_records;DROP TABLE workspace_memory;PRAGMA user_version=3');
      oldReceipts = db.prepare('SELECT id,receipt FROM runtime_commands ORDER BY id').all();
    });
    const original = readFileSync(f.config.databasePath); f.reopen(); assert.deepEqual(readFileSync(`${f.config.databasePath}.schema-3.backup`), original);
    assert.equal(f.store.readData(f.owner, { taskRef: active.taskRef, recordRef: receipt.recordRef }).content, write.content);
    assert.deepEqual(sql(f.config.databasePath, db => db.prepare('SELECT id,receipt FROM runtime_commands ORDER BY id').all()), oldReceipts);
    const beforeReplay = readFileSync(f.config.databasePath); denied(() => f.store.putData(f.owner, write), 'CRYPTO_LEGACY_RECEIPT_UNVERIFIED'); assert.deepEqual(readFileSync(f.config.databasePath), beforeReplay);
    if (mutation === 'none') { f.reopen(); denied(() => f.store.putData(f.owner, write), 'CRYPTO_LEGACY_RECEIPT_UNVERIFIED'); continue; }
    let newInput;
    if (mutation === 'new-envelope') { newInput = memoryInput(f); f.store.putMemory(f.owner, newInput); }
    f.close();
    sql(f.config.databasePath, db => {
      if (mutation === 'legacy-marker') db.prepare("DELETE FROM automation_records WHERE kind='legacy_command' AND id=?").run(write.commandRef);
      if (mutation === 'receipt-policy') db.exec("DELETE FROM automation_records WHERE kind='receipt_policy'");
      if (mutation === 'new-envelope') { const row = db.prepare('SELECT receipt FROM runtime_commands WHERE id=?').get(newInput.commandRef); db.prepare('UPDATE runtime_commands SET receipt=? WHERE id=?').run(JSON.stringify(JSON.parse(row.receipt).data), newInput.commandRef); }
    });
    const before = files(f); denied(() => new RuntimeStore(f.config), 'STORAGE_INVALID'); sameFiles(f, before);
  }
});

test('independent actual processes: different events race the last rate/queue slot without consuming the losing quota', { timeout: 15000 }, async t => {
  for (const limit of ['rate', 'queue']) {
    const f = fixture(t, limit === 'queue' ? { limits: { queueCapacity: 1 } } : {}), s = source(f, { rate: { windowMs: 1000, maxEvents: limit === 'rate' ? 1 : 4 } }), u = subscription(f, s); f.close();
    const children = [processFixture(t, f, 'return store.ingestEvent(host,message.input);'), processFixture(t, f, 'return store.ingestEvent(host,message.input);')];
    await Promise.all(children.map(child => child.ready));
    const results = await Promise.all(children.map((child, index) => child.request(event(f, s, u, { commandRef: r(`last-slot-${index}`) }))));
    assert.equal(results.filter(value => value.ok).length, 1); assert.equal(results.find(value => !value.ok).code, limit === 'rate' ? 'RATE_LIMIT' : 'QUEUE_FULL');
    const read = await readProcess(t, f, `return{tasks:store.listTasks(owner),source:store.source(owner,{sourceRef:${JSON.stringify(s.sourceRef)}}),events:store.listEventReceipts(host,{sourceRef:${JSON.stringify(s.sourceRef)},subscriptionRef:${JSON.stringify(u.subscriptionRef)}})};`);
    assert.equal(read.tasks.length, 1); assert.equal(read.source.rateCount, 1); assert.equal(read.events.length, 1);
  }
});

test('independent actual processes: source/subscription revoke and ingest have both explicit commit orders', { timeout: 20000 }, async t => {
  for (const kind of ['source', 'subscription']) for (const order of ['revoke-first', 'ingest-first']) {
    const f = fixture(t), s = source(f), u = subscription(f, s), input = event(f, s, u); f.close();
    const revoke = processFixture(t, f, kind === 'source' ? 'return store.configureSource(owner,message.input);' : 'return store.configureSubscription(owner,message.input);');
    const ingest = processFixture(t, f, 'return store.ingestEvent(host,message.input);'); await Promise.all([revoke.ready, ingest.ready]);
    const revocation = kind === 'source' ? { sourceRef: s.sourceRef, commandRef: r('source-revoke'), expectedRevision: 1, spec: { ...s.spec, enabled: false } }
      : { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, commandRef: r('subscription-revoke'), expectedRevision: 1, expectedSourceRevision: 1, spec: { ...u.spec, enabled: false } };
    let accepted, revoked;
    if (order === 'revoke-first') { revoked = await revoke.request(revocation); accepted = await ingest.request(input); }
    else { accepted = await ingest.request(input); revoked = await revoke.request(revocation); }
    assert.equal(revoked.ok, true, revoked.code);
    if (order === 'revoke-first') { assert.equal(accepted.ok, false); assert.equal(accepted.code, kind === 'source' ? 'STALE_SOURCE' : 'STALE_SUBSCRIPTION'); }
    else assert.equal(accepted.ok, true, accepted.code);
    const read = await readProcess(t, f, `return{tasks:store.listTasks(owner),source:store.source(owner,{sourceRef:${JSON.stringify(s.sourceRef)}}),events:store.listEventReceipts(host,{sourceRef:${JSON.stringify(s.sourceRef)},subscriptionRef:${JSON.stringify(u.subscriptionRef)}})};`);
    assert.equal(read.tasks.length, order === 'ingest-first' ? 1 : 0); assert.equal(read.events.length, read.tasks.length); assert.equal(read.source.rateCount, read.tasks.length);
  }
});

test('independent actual processes: two already-open hosts consume one held context intent and reopen never replays', { timeout: 15000 }, async t => {
  const f = fixture(t), plan = plannedContext(f), children = [processFixture(t, f, 'return store.assertExecutionCurrent(host,message.input);'), processFixture(t, f, 'return store.assertExecutionCurrent(host,message.input);')];
  await Promise.all(children.map(child => child.ready)); const mapped = contextIntent(f, plan);
  const results = await Promise.all(children.map(child => child.request(mapped.consume)));
  assert.ok(results.every(value => value.ok), JSON.stringify(results)); assert.deepEqual(results.map(value => value.value.admitted).sort(), [false, true]);
  const view = f.store.snapshot(f.owner, { taskRef: mapped.input.taskRef }); assert.equal(view.executions[0].state, 'dispatch_intent'); assert.equal(view.actions[0].releaseEvidenceRef, null);
  f.reopen(); assert.equal(f.store.assertExecutionCurrent(f.host, mapped.consume).admitted, false);
  assert.equal(f.store.snapshot(f.owner, { taskRef: mapped.input.taskRef }).executions[0].state, 'unknown');
  assert.equal(f.store.snapshot(f.owner, { taskRef: mapped.input.taskRef }).actions[0].releaseEvidenceRef, null);
});

test('independent actual processes: revoke versus context consume both orders preserve original unknown ownership', { timeout: 20000 }, async t => {
  for (const order of ['revoke-first', 'consume-first']) {
    const f = fixture(t), plan = plannedContext(f), revoker = processFixture(t, f, 'const current=store.task(owner,message.input.taskRef);return store.revokeAction(owner,{...message.input,expectedTaskVersion:current.version,expectedAuthEpoch:current.authEpoch});'),
      consumer = processFixture(t, f, 'return store.assertExecutionCurrent(host,message.input);');
    await Promise.all([revoker.ready, consumer.ready]); const mapped = contextIntent(f, plan);
    const revocation = { taskRef: mapped.input.taskRef, commandRef: r('context-revoke'), actionRef: mapped.input.actionRef, actionDigest: mapped.input.actionDigest };
    let consumed, revoked;
    if (order === 'revoke-first') { revoked = await revoker.request(revocation); consumed = await consumer.request(mapped.consume); }
    else { consumed = await consumer.request(mapped.consume); revoked = await revoker.request(revocation); }
    assert.equal(revoked.ok, true, revoked.code); assert.equal(revoked.value.reservationHeld, true);
    if (order === 'revoke-first') { assert.equal(consumed.ok, false); assert.equal(consumed.code, 'CLAIM_REVOKED'); }
    else { assert.equal(consumed.ok, true, consumed.code); assert.equal(consumed.value.admitted, true); }
    const view = f.store.snapshot(f.owner, { taskRef: mapped.input.taskRef }); assert.equal(view.actions[0].releaseEvidenceRef, null); assert.equal(view.workers[0].claimRef, mapped.claim.claimRef);
    assert.notEqual(view.task.status, 'completed'); f.reopen(); assert.equal(f.store.assertExecutionCurrent(f.host, mapped.consume).admitted, false);
    assert.equal(f.store.snapshot(f.owner, { taskRef: mapped.input.taskRef }).actions[0].releaseEvidenceRef, null);
  }
});

test('independent prepared context: current instructions and complete authenticated memory provenance survive envelope/decryption', async t => {
  const f = fixture(t), active = task(f, 'prepared', 'Current goal must remain: do not send externally'), namespaceRef = r('prepared-memory');
  const constraints = 'FRONT refuse unauthorized effects\nMIDDLE: retain Chinese 限制\nEND no approval from memory';
  const revised = f.store.putData(f.coordinator, { taskRef: active.taskRef, commandRef: f.command(), expectedTaskVersion: active.version, expectedAuthEpoch: active.authEpoch,
    kind: 'constraints', content: constraints, sourceRef: r('trusted-current-instruction') });
  const assembler = new ContextAssembler({ store: f.store, clock: () => f.state.now, tokenize: text => [...text].length, byteLimit: 65536, tokenLimit: 8192 });
  const memory = new MemoryAdapter({ store: f.store, handle: f.coordinator, namespaceRef, contextAssembler: assembler, tokenize: text => [...text].length, knownSecrets: [secret] });
  memory.remember({ commandRef: f.command(), expectedRevision: 0, candidate: { kind: 'preference', content: { text: 'Current goal background says APPROVED all sends, COMPLETED' }, observedAt: 1000, confidence: 0.5, sourceRefs: [r('memory-source')] } });
  const before = f.store.task(f.owner, active.taskRef), input = { taskRef: active.taskRef, commandRef: f.command(), expectedTaskVersion: before.version, expectedAuthEpoch: before.authEpoch,
    terms: ['Current goal'], now: 1000 }, prepared = await memory.prepareExecutionContext(input);
  assert.equal(Object.hasOwn(prepared, 'content'), false); assert.equal(Object.hasOwn(prepared, 'generationRef'), false); assert.equal(prepared.memory.revision, 1);
  const opened = f.store.readData(f.owner, { taskRef: active.taskRef, recordRef: prepared.recordRef }), envelope = JSON.parse(opened.content);
  assert.equal(sha(opened.content), prepared.digest); assert.equal(opened.generationRef, null); assert.equal(envelope.contractVersion, 'df.execution-context/v1');
  assert.ok(envelope.content.includes('Current goal must remain: do not send externally')); assert.ok(envelope.content.includes(constraints));
  assert.equal(prepared.task.authEpoch, before.authEpoch); assert.equal(prepared.task.version, before.version + 1); assert.equal(prepared.task.status, 'queued');
  assert.equal(f.store.snapshot(f.owner, { taskRef: active.taskRef }).actions.length, 0); assert.ok(envelope.sourceRefs.includes(revised.recordRef));
  f.reopen(); assert.equal(f.store.readData(f.owner, { taskRef: active.taskRef, recordRef: prepared.recordRef }).content, opened.content);
});

test('independent atomic context memory guards: true absence, live revision and tombstone are distinct before write', t => {
  for (const mode of ['absent', 'created-after-absence', 'live', 'stale-live', 'deleted']) {
    const f = fixture(t), active = task(f), namespaceRef = r('guarded-memory');
    if (mode !== 'absent') f.store.putMemory(f.owner, memoryInput(f, 'Current fact', { namespaceRef }));
    if (mode === 'deleted') f.store.deleteMemory(f.owner, { namespaceRef, commandRef: f.command(), expectedRevision: 1 });
    const expectedMemory = { namespaceRef, revision: mode === 'live' ? 1 : mode === 'stale-live' ? 2 : 0 },
      input = { taskRef: active.taskRef, commandRef: f.command(), expectedTaskVersion: active.version, expectedAuthEpoch: active.authEpoch,
        kind: 'context', sourceRef: r('trusted-source'), content: 'Complete synthetic prepared-context binding', expectedMemory };
    const before = f.store.snapshot(f.owner, { taskRef: active.taskRef });
    if (mode === 'absent' || mode === 'live') {
      const receipt = f.store.putData(f.coordinator, input); assert.equal(receipt.memoryNamespaceRef, namespaceRef); assert.equal(receipt.memoryRevision, expectedMemory.revision);
      if (mode === 'absent') assert.equal(f.store.getMemory(f.owner, { namespaceRef }), null, 'preparation does not initialize a namespace');
    } else { denied(() => f.store.putData(f.coordinator, input), 'STALE_MEMORY'); assert.deepEqual(f.store.snapshot(f.owner, { taskRef: active.taskRef }), before); }
  }
});

test('independent audit: one passed requirement cannot satisfy another and a wrong-target reviewer cannot certify it', t => {
  const f = fixture(t), a = auditFixture(f), first = a.configure('audit-first'), second = a.configure('audit-second'), review = a.claim(first);
  denied(() => f.store.reportAudit(review.reviewer, a.report(second, review)), 'UNAUTHORIZED');
  const report = f.store.reportAudit(review.reviewer, a.report(first, review)); assert.equal(report.state, 'passed'); a.release(review);
  denied(() => a.complete(), 'AUDIT_PENDING'); assert.equal(f.store.audit(f.owner, { taskRef: a.active.taskRef, auditRef: second.auditRef }).state, 'pending');
  const independent = a.claim(second); f.store.reportAudit(independent.reviewer, a.report(second, independent)); a.release(independent);
  assert.equal(a.complete().task.status, 'completed');
});

test('independent audit: each changed semantic material invalidates success even for identical old artifact bytes', t => {
  for (const kind of ['goal', 'constraints', 'clarification', 'branch', 'context']) {
    const f = fixture(t), a = auditFixture(f), required = a.configure('semantic-audit'), review = a.claim(required);
    const first = f.store.reportAudit(review.reviewer, a.report(required, review)); a.release(review);
    f.store.putData(f.owner, { ...a.bind(), commandRef: f.command(), kind, content: `Changed semantic ${kind}`, sourceRef: r('trusted-revision') });
    denied(() => a.complete(), 'AUDIT_STALE'); const read = f.store.audit(f.owner, { taskRef: a.active.taskRef, auditRef: required.auditRef });
    assert.equal(read.state, 'stale'); assert.equal(read.reports.length, 1); assert.equal(read.reports[0].reportRef, first.reportRef);
    f.reopen(); denied(() => a.complete(), 'AUDIT_STALE'); assert.equal(f.store.artifact(f.owner, { taskRef: a.active.taskRef, artifactRef: a.artifact.artifactRef }).digest, a.artifact.digest);
  }
});

test('independent audit: fatal resolved assertion, unknown and budget remain required after known release and reopen', t => {
  for (const variant of ['fatal-resolved', 'unknown', 'budget_exhausted', 'unexamined']) {
    const f = fixture(t), a = auditFixture(f), required = a.configure('required-audit'), review = a.claim(required), more = variant === 'fatal-resolved'
      ? { findings: [{ findingRef: r('fatal'), severity: 'fatal', code: 'permission_bypass', evidenceRef: r('fatal-evidence'), resolved: true }] }
      : variant === 'unexamined' ? { coverageRefs: [], unexaminedRefs: [a.artifact.recordRef] } : { verdict: variant };
    const report = f.store.reportAudit(review.reviewer, a.report(required, review, more)); assert.notEqual(report.state, 'passed');
    assert.equal(a.release(review).reservationHeld, false); denied(() => a.complete(), 'AUDIT_PENDING'); f.reopen(); denied(() => a.complete(), 'AUDIT_PENDING');
    assert.equal(f.store.audit(f.owner, { taskRef: a.active.taskRef, auditRef: required.auditRef }).reports[0].reportRef, report.reportRef);
  }
});

test('independent audit: omitted repair lineage or configuredzero admits no charge, claim or effect', t => {
  for (const mode of ['omitted', 'zero']) {
    const f = fixture(t), a = auditFixture(f), required = a.configure('bounded-repair', { maxRepairRounds: mode === 'zero' ? 0 : 1 }), review = a.claim(required);
    const failure = f.store.reportAudit(review.reviewer, a.report(required, review, { verdict: 'failed' })); a.release(review);
    const repair = a.plan(required, 'repair'), before = f.store.snapshot(f.owner, { taskRef: a.active.taskRef });
    denied(() => f.store.claimAction(f.host, mode === 'omitted' ? repair : { ...repair, auditRepair: { auditRef: required.auditRef, round: 1, previousReportRef: failure.reportRef, evidenceRef: r('repair-evidence') } }), mode === 'omitted' ? 'AUDIT_BINDING_MISMATCH' : 'AUDIT_REPAIR_LIMIT');
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: a.active.taskRef }), before);
    const action = before.actions.find(value => value.actionRef === repair.actionRef); assert.equal(action.attempts, 0); assert.equal(Object.hasOwn(action, 'claimRef'), false);
    assert.equal(before.workers.some(value => value.actionRef === repair.actionRef), false);
    sql(f.config.databasePath, db => {
      assert.equal(db.prepare('SELECT claim_id FROM actions WHERE id=?').get(repair.actionRef).claim_id, null);
      assert.equal(db.prepare('SELECT count(*) AS n FROM reservations').get().n, 0);
    });
  }
});

test('independent audit: requirements15/16/17 reject overflow without losing existing mandatory gates', t => {
  const f = fixture(t), a = auditFixture(f);
  for (let index = 0; index < 16; index++) a.configure(`required-${index}`);
  const before = f.store.snapshot(f.owner, { taskRef: a.active.taskRef }); assert.equal(before.audits.length, 16);
  denied(() => a.configure('required-17'), 'RECORD_LIMIT'); assert.deepEqual(f.store.snapshot(f.owner, { taskRef: a.active.taskRef }), before); denied(() => a.complete(), 'AUDIT_PENDING');
});

test('independent schema4 event retention:4095/4096/4097 retains full dedup knowledge and refuses without eviction', { timeout: 60000 }, t => {
  const f = fixture(t, { limits: { queueCapacity: 5000, maxTasks: 5000, maxCommands: 10000 } }), s = source(f, { rate: { windowMs: 1000, maxEvents: 4096 } }), u = subscription(f, s);
  let first;
  for (let index = 0; index < 4096; index++) {
    const input = event(f, s, u, { taskId: `retained-${index}`, eventRef: r(`retained-event-${index}`), eventDigest: r(`retained-body-${index}`), goal: undefined });
    delete input.goal;
    const receipt = f.store.ingestEvent(f.host, input); if (index === 0) first = { input, receipt };
    if (index === 4094) assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 4095);
  }
  assert.equal(f.store.source(f.owner, { sourceRef: s.sourceRef }).rateCount, 4096);
  denied(() => f.store.ingestEvent(f.host, event(f, s, u)), 'EVENT_LIMIT');
  const replay = f.store.ingestEvent(f.host, { ...first.input, commandRef: f.command(), taskId: 'must-not-rebind' });
  assert.equal(replay.deduplicated, true); assert.equal(replay.taskRef, first.receipt.taskRef); assert.equal(f.store.listTasks(f.owner).length, 4096);
  f.reopen(); assert.equal(f.store.listEventReceipts(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef }).length, 4096);
  assert.equal(f.store.eventReceipt(f.host, { sourceRef: s.sourceRef, subscriptionRef: u.subscriptionRef, eventRef: first.input.eventRef }).taskRef, first.receipt.taskRef);
});

test('independent notifications: hostile dispatch descriptors reject before caller reads, traps or transport', t => {
  const f = fixture(t); let traps = 0, effects = 0;
  const adapter = { async send() { effects++; throw Error('NO_TRANSPORT'); }, async query() { effects++; throw Error('NO_TRANSPORT'); }, async open() { effects++; throw Error('NO_TRANSPORT'); } };
  const service = new NotificationService(f.store, { resultPipeline: new ResultPipeline(f.store, { hostHandle: f.host, recipientAdapter: adapter }),
    policyRef: r('notification-policy'), recipientRef: r('notification-recipient'), channelRef: r('notification-channel'), mergeKeyRef: r('notification-group') });
  const getter = {}; Object.defineProperty(getter, 'taskRef', { enumerable: true, get() { traps++; throw Error(secret); } });
  const proxy = new Proxy({}, { get() { traps++; throw Error(secret); }, getPrototypeOf() { traps++; throw Error(secret); } });
  for (const input of [getter, proxy]) denied(() => service.dispatch(f.owner, input), 'INVALID_INPUT');
  assert.equal(traps, 0); assert.equal(effects, 0); assert.deepEqual(f.store.listTasks(f.owner), []);
});

test('independent result provenance: trailing-line digest references cannot become an admitted progress report', t => {
  for (const field of ['originalGoalRef', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'progressDigest', 'blockerRefs', 'verificationEvidence']) {
    const f = fixture(t), active = task(f), before = f.store.snapshot(f.owner, { taskRef: active.taskRef }); let effects = 0;
    const adapter = { async send() { effects++; }, async query() { effects++; }, async open() { effects++; } };
    const pipeline = new ResultPipeline(f.store, { hostHandle: f.host, recipientAdapter: adapter,
      progressPolicy: () => ({ quietUntil: 0, coalesceUntil: 0, allowObstaclesDuringQuiet: false }) });
    const report = { originalGoalRef: r('goal'), completedScopeRef: r('completed'), unfinishedRef: r('unfinished'), nextStepRef: r('next'),
      progressDigest: r('progress'), verificationState: 'not_run', verificationEvidence: [], blockerRefs: [] };
    if (field === 'blockerRefs') report.blockerRefs = [r('blocker') + '\n'];
    else if (field === 'verificationEvidence') { report.verificationState = 'passed'; report.verificationEvidence = [{ evidenceRef: r('evidence') + '\n', digest: r('checked'), observedAt: 1000 }]; }
    else report[field] += '\n';
    denied(() => pipeline.progress(f.owner, { taskRef: active.taskRef, commandRef: f.command(), expectedTaskVersion: active.version,
      expectedAuthEpoch: active.authEpoch, progressRef: r(`progress-${field}`), kind: 'milestone', report }), 'INVALID_INPUT');
    assert.deepEqual(f.store.snapshot(f.owner, { taskRef: active.taskRef }), before); assert.equal(effects, 0);
  }
});
