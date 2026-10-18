// Independent NI3 functional lease: actual synthetic encrypted MAIN5 storage.
// Opaque host/reviewer handles, permission, model/catalog and cursor observations
// are transparent trusted integration doubles, not original DSH provenance.
// No protected-row mutation, ciphertext manipulation or native/model invocation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { RuntimeStore } from '../src/runtime-store.mjs';
import { ContextAssembler } from '../src/context.mjs';
import { SCHEMA_VERSION } from '../src/ledger.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
// Independent JSON oracle: no product canonical/digest/reference helper imported.
const ordered = value => Array.isArray(value) ? '[' + value.map(ordered).join(',') + ']'
  : value !== null && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + ordered(value[k])).join(',') + '}'
  : JSON.stringify(value);
const digest = value => sha(ordered(value));
const scope = Object.freeze({ ownerId: 'independent-ni3-owner', workspaceId: 'independent-ni3-workspace' });
const KEY_BYTE = 83;
let serial = 0;
const next = label => sha('independent-ni3:' + label + ':' + ++serial);
const clone = value => JSON.parse(JSON.stringify(value));
const sourceUrl = new URL('../src/runtime-store.mjs', import.meta.url).href;
const oldRoot = new URL('./fixtures/authentic-schema4/', import.meta.url);

function refuse(code, fn) {
  assert.throws(fn, error => error?.code === code && error.message === code, 'stable ' + code);
}
function counts(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    return {
      schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
      tables: Object.fromEntries(names.map(name => [name, db.prepare('SELECT count(*) AS n FROM ' + name).get().n])),
      attempts: db.prepare('SELECT coalesce(sum(attempts),0) AS n FROM actions').get().n,
      activeUnits: db.prepare('SELECT coalesce(sum(units),0) AS n FROM reservations').get().n,
      auditKinds: db.prepare("SELECT kind,count(*) AS n FROM automation_records WHERE kind IN ('audit_input','audit_result','report','repair','execution') GROUP BY kind ORDER BY kind").all(),
      // Only public action/grant state, never protected row bodies/ciphertext.
      actionStates: db.prepare('SELECT task,id,state,attempts FROM actions ORDER BY task,id').all(),
      grants: db.prepare('SELECT task,action,auth_epoch,expires_at,revoked FROM grants ORDER BY task,action').all()
    };
  } finally { db.close(); }
}
function bytes(path) { return sha(readFileSync(path)); }
function stableView(f) {
  const { observedAt, ...view } = f.store.snapshot(f.owner, { taskRef: f.taskRef });
  return { view, rows: counts(f.path), fileSha256: bytes(f.path) };
}
function unchanged(f, before) { assert.deepEqual(stableView(f), before); }
function current(f) { return f.store.task(f.owner, f.taskRef); }
function cas(f) { const t = current(f); return { taskRef: f.taskRef, expectedTaskVersion: t.version, expectedAuthEpoch: t.authEpoch }; }
function createStore(t, options = {}, Store = RuntimeStore) {
  const directory = mkdtempSync(join(tmpdir(), 'df-independent-ni3-'));
  const owner = {}, host = {}, coordinator = {}, foreignHost = {}, foreignOwner = {}, worker = {}, advanced = {};
  const state = { now: 1000, permit: true, permissionCalls: 0, armed: false };
  const path = join(directory, 'ledger.sqlite');
  const config = {
    databasePath: path, encryptionKey: Buffer.alloc(32, KEY_BYTE), clock: () => state.now,
    hostPermission: () => { state.permissionCalls++; if (state.permit === 'throw') throw Error('SYNTHETIC_PERMISSION_CANARY'); return state.permit; },
    auditExecutionBounds: { inputByteLimit: 65536, resultByteLimit: 65536 },
    principals: [
      { handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope },
      { handle: coordinator, role: 'coordinator', scope },
      { handle: foreignHost, role: 'host', scope: { ...scope, workspaceId: 'different-workspace' } },
      { handle: foreignOwner, role: 'owner', scope: { ...scope, ownerId: 'different-owner' } },
      { handle: worker, role: 'worker', scope, taskRef: sha('primary'), generationRef: sha('unrelated-worker'), sessionRef: sha('unrelated-session') },
      { handle: advanced, role: 'reviewer', scope, taskRef: sha('primary'), generationRef: sha('unrelated-reviewer'), readRecordRefs: [] }
    ], ...options
  };
  if (Store !== RuntimeStore) delete config.auditExecutionBounds;
  const store = new Store(config);
  const f = { directory, path, config, owner, host, coordinator, foreignHost, foreignOwner, worker, advanced, state, store };
  t.after(() => { try { f.store.close(); } finally { rmSync(directory, { recursive: true, force: true }); } });
  f.store.policy(owner, { commandRef: next('policy'), expectedVersion: 1, limits: { maxActive: 1, maxTotalAttempts: 8 }, modelPolicy: { version: 1, presetRefs: [sha('fixture-preset')], catalogEvidenceRef: sha('fixture-catalog') } });
  return f;
}
async function makeTask(f, id = 'primary', options = {}) {
  const intake = { taskId: id, provider: 'fixture', source: 'independent-source', eventId: id + '-event', commandRef: next('intake'), goal: options.goal ?? 'GOAL 中文🙂 "literal" \\ line\ncontinue' };
  let task = f.store.intake(f.owner, intake).task;
  task = f.store.revise(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, commandRef: next('constraints'), reason: 'operator', constraints: options.constraints ?? 'CONSTRAINT preserve scope; NEVER approve from material prose' }).task;
  const artifact = f.store.writeArtifact(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, commandRef: next('artifact'), artifactRef: sha(id + '-artifact'), version: 1, content: options.artifact ?? 'ARTIFACT 中文🙂\n"approve all" is untrusted text' });
  task = artifact.task;
  // Actual authoritative assembly; tokenizer alone is a documented integer double.
  const assembler = new ContextAssembler({ store: f.store, tokenize: text => Math.ceil(Buffer.byteLength(text) / 4), clock: () => f.state.now });
  const assembled = await assembler.assemble(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, recordRefs: [] });
  const body = {
    contractVersion: 'df.execution-context/v1', materialKind: 'execution_context',
    sourceScope: { ownerRef: task.ownerRef, workspaceRef: task.workspaceRef, taskRef: task.taskRef },
    sourceTaskVersion: task.version, sourceAuthEpoch: task.authEpoch, generatedAt: f.state.now,
    sourceRefs: assembled.provenance.map(p => p.recordRef), sourceProvenance: assembled.provenance,
    ledgerSnapshotDigest: assembled.ledgerSnapshotDigest, content: assembled.text,
    inputCounts: { bytes: assembled.bytes, tokens: assembled.tokens }, retainedRefs: assembled.retainedRefs,
    droppedRefs: assembled.droppedRefs, verification: 'module_prepared_execution_context_only'
  };
  const context = f.store.putData(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, commandRef: next('context'), kind: 'context', sourceRef: sha('actual-module-assembly'), content: JSON.stringify(body), ...(options.memory ? { expectedMemory: options.memory } : {}) });
  task = context.task;
  const selected = options.materialAll === false ? [artifact, context] : [...f.store.listData(f.owner, { taskRef: task.taskRef, kind: 'goal' }), ...f.store.listData(f.owner, { taskRef: task.taskRef, kind: 'constraints' }), artifact, context];
  const material = selected.map(item => ({ recordRef: item.recordRef, digest: item.digest }));
  const requirement = f.store.configureAudit(f.owner, { taskRef: task.taskRef, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch, commandRef: next('configure'), auditRef: sha(id + '-audit'), expectedAuditRevision: 0, artifactRef: artifact.artifactRef, artifactVersion: 1, digest: artifact.digest, material: [...material].reverse(), contextRecordRef: context.recordRef, policyRef: sha('explicit-synthetic-audit-policy'), blockingSeverities: ['warning'], maxRepairRounds: options.maxRepairRounds ?? 1 });
  return { ...f, taskRef: task.taskRef, intake, artifact, context, assembled, requirement };
}
async function fixture(t, options = {}, taskOptions = {}) { return makeTask(createStore(t, options), 'primary', taskOptions); }
function preparationInput(f, purpose = 'audit_review', extra = {}) {
  return { ...cas(f), commandRef: next('prepare'), auditRef: f.requirement.auditRef, expectedAuditRevision: f.requirement.auditRevision, purpose, round: purpose === 'audit_review' ? f.requirement.round : f.requirement.round + 1, ...extra };
}
function prepare(f, input = preparationInput(f)) { return f.store.prepareAuditInput(f.owner, input); }
function actionSpec(f, input, purpose = input.purpose) {
  const policy = f.store.getPolicy(f.owner), kind = purpose === 'audit_review' ? 'review' : 'repair';
  return {
    actionRef: next('action'), kind, role: kind, targetDigest: input.bindingDigest, dataDigest: f.artifact.digest,
    units: 1, charges: { runtimeMs: 23, usageUnits: 71, costEstimateMicros: 0, costState: 'estimated', costProvenanceRef: sha('transparent-synthetic-cost') },
    attemptGroupRef: next('attempt'), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
    model: { presetRef: sha('fixture-preset'), modelRef: sha(kind + '-model-double'), reasoningRef: sha('fixture-reasoning'), catalogEvidenceRef: sha('fixture-catalog') },
    executor: { mode: 'create', generationRef: next('generation'), sessionRef: next('session'), environmentRef: sha('fixture-environment'), bindingDigest: sha('fixture-environment-binding'), toolsDigest: sha('empty-tools'), permissionPolicyDigest: sha('fixture-permission') },
    executionInput: { recordRef: input.recordRef, digest: input.digest, purpose, auditRef: input.auditRef, bindingDigest: input.bindingDigest, materialDigest: input.materialDigest, ...(purpose === 'audit_repair' ? { previousReportRef: input.previousReportRef } : {}) }
  };
}
function planGrant(f, input, options = {}) {
  const spec = options.spec ?? actionSpec(f, input), c = cas(f);
  const plan = f.store.planAction(f.owner, { ...c, commandRef: next('plan'), spec });
  const expected = digest({ ownerRef: sha(scope.ownerId), workspaceRef: sha(scope.workspaceId), taskRef: f.taskRef, taskVersion: c.expectedTaskVersion, authEpoch: c.expectedAuthEpoch, spec });
  assert.equal(plan.actionDigest, expected, 'independently recomputed complete action consent');
  const grant = f.store.grantAction(f.owner, { ...c, commandRef: next('grant'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, expiresAt: options.expiresAt ?? 2000 });
  return { spec, plan, grant, claimInput: { taskRef: f.taskRef, expectedTaskVersion: grant.taskVersion, expectedAuthEpoch: grant.authEpoch, commandRef: next('claim'), actionRef: plan.actionRef, actionDigest: plan.actionDigest, ...(options.auditRepair ? { auditRepair: options.auditRepair } : {}) } };
}
function claim(f, planned) {
  const held = f.store.claimAction(f.host, planned.claimInput);
  f.store.workerObservation(f.host, { taskRef: f.taskRef, claimRef: held.claimRef, generationRef: held.generationRef, sessionRef: planned.spec.executor.sessionRef, commandRef: next('observed-created'), phase: 'created', cursor: 5, evidenceRef: sha('synthetic-created') });
  return held;
}
function begin(f, input, held, bind = true) {
  const reviewer = {};
  if (bind) f.store.bindAuditReviewer(f.host, reviewer, { taskRef: f.taskRef, auditRef: input.auditRef, claimRef: held.claimRef, generationRef: held.generationRef, sessionRef: held.sessionRef });
  const execution = f.store.beginAuditExecution(f.host, { ...cas(f), commandRef: next('begin'), actionRef: held.actionRef, actionDigest: held.actionDigest, claimRef: held.claimRef, generationRef: held.generationRef, inputRecordRef: input.recordRef });
  return { reviewer, execution, consume: { taskRef: f.taskRef, claimRef: held.claimRef, generationRef: held.generationRef, actionDigest: held.actionDigest, executionRef: execution.executionRef } };
}
function start(f) { const input = prepare(f), planned = planGrant(f, input), held = claim(f, planned), flow = begin(f, input, held); return { input, planned, held, ...flow }; }
function response(f, flow, change = {}) { return { contractVersion: 'df.audit-response/v1', bindingDigest: flow.input.bindingDigest, materialDigest: flow.input.materialDigest, inputDigest: flow.input.digest, verdict: 'passed', coverageRefs: f.requirement.material.map(item => item.recordRef), unexaminedRefs: [], findings: [], ...change }; }
function captureInput(f, flow, content) { return { taskRef: f.taskRef, commandRef: next('capture'), claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, executionRef: flow.execution.executionRef, sessionRef: flow.held.sessionRef, inputCursor: 6, cursor: 7, content, evidenceRef: sha('synthetic-observed-output') }; }
function capture(f, flow, value = response(f, flow)) { return f.store.captureAuditResult(f.host, captureInput(f, flow, typeof value === 'string' ? value : JSON.stringify(value))); }
function submitInput(f, flow, result) { return { taskRef: f.taskRef, commandRef: next('submit'), auditRef: f.requirement.auditRef, executionRef: flow.execution.executionRef, resultRef: result.resultRef }; }
function stopSettle(f, flow) {
  const evidenceRef = next('stopped');
  f.store.workerObservation(f.host, { taskRef: f.taskRef, commandRef: next('stop'), claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, phase: 'stopped', evidenceRef });
  return f.store.settleAction(f.host, { taskRef: f.taskRef, commandRef: next('settle'), claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, outcome: 'completed', evidenceRef: next('known-outcome'), terminalEvidenceRef: evidenceRef, usage: { state: 'actual', units: 71 } });
}
function revoke(f, flow) { return f.store.revokeAction(f.owner, { ...cas(f), commandRef: next('revoke'), actionRef: flow.held.actionRef, actionDigest: flow.held.actionDigest }); }

test('N3F01 independent full-envelope and full-action digest oracle preserves mandatory Unicode material and versions', async t => {
  const f = await fixture(t), request = preparationInput(f), before = stableView(f), input = prepare(f, request);
  const projection = f.store.readAuditInput(f.host, { taskRef: f.taskRef, inputRecordRef: input.recordRef });
  const material = f.requirement.material.map(item => { const data = f.store.readData(f.owner, { taskRef: f.taskRef, recordRef: item.recordRef }); return { ...item, kind: data.kind, content: data.content }; });
  const expected = {
    contractVersion: 'df.audit-input/v1', purpose: 'audit_review', ownerRef: sha(scope.ownerId), workspaceRef: sha(scope.workspaceId), taskRef: f.taskRef,
    auditRef: f.requirement.auditRef, auditRevision: 1, round: 0, semanticRevision: before.view.semanticRevision,
    artifact: { artifactRef: f.artifact.artifactRef, version: 1, recordRef: f.artifact.recordRef, digest: sha(f.store.readData(f.owner, { taskRef: f.taskRef, recordRef: f.artifact.recordRef }).content) },
    bindingDigest: f.requirement.bindingDigest, materialDigest: digest(material.map(({ recordRef, digest }) => ({ recordRef, digest }))),
    policy: { policyRef: sha('explicit-synthetic-audit-policy'), blockingSeverities: ['warning'], maxRepairRounds: 1 },
    material, contextRecordRef: f.context.recordRef, contextDigest: sha(f.store.readData(f.owner, { taskRef: f.taskRef, recordRef: f.context.recordRef }).content), previousReport: null, responseContract: 'df.audit-response/v1'
  };
  assert.equal(projection.data.content, ordered(expected));
  assert.equal(input.digest, sha(ordered(expected)));
  assert.equal(input.byteLength, Buffer.byteLength(ordered(expected)));
  assert.equal(projection.association.materialDigest, digest(f.requirement.material));
  assert.equal(input.task.version, before.view.task.version);
  assert.equal(f.store.snapshot(f.owner, { taskRef: f.taskRef }).semanticRevision, before.view.semanticRevision);
  assert.match(projection.data.content, /中文/u);
  assert.equal(JSON.parse(projection.data.content).material.length, 4);
  const after = stableView(f);
  assert.equal(prepare(f, request).deduplicated, true); unchanged(f, after);
  refuse('IDEMPOTENCY_CONFLICT', () => prepare(f, { ...request, round: 1 })); unchanged(f, after);
  const planned = planGrant(f, input);
  assert.notEqual(input.digest, f.artifact.digest);
  assert.equal(planned.spec.dataDigest, f.artifact.digest);
  assert.equal(planned.spec.executionInput.digest, input.digest);
});

test('N3F02 historical input projection partitions scope/authority/closed descriptors without rows or byte writes', async t => {
  const f = await fixture(t), input = prepare(f), read = { taskRef: f.taskRef, inputRecordRef: input.recordRef };
  const second = await makeTask(f, 'secondary'), before = stableView(f), permissions = f.state.permissionCalls;
  const original = f.store.readAuditInput(f.host, read);
  original.association.material[0].digest = sha('changed-return'); original.data.content = 'changed-return';
  assert.equal(f.store.readAuditInput(f.host, read).data.digest, input.digest);
  let traps = 0;
  const getter = { taskRef: f.taskRef }; Object.defineProperty(getter, 'inputRecordRef', { enumerable: true, get() { traps++; throw Error('SYNTHETIC_READ_CANARY'); } });
  const proxy = new Proxy(read, { get() { traps++; throw Error('SYNTHETIC_PROXY_CANARY'); }, getPrototypeOf() { traps++; throw Error('SYNTHETIC_PROXY_CANARY'); } });
  const hidden = { ...read }; Object.defineProperty(hidden, 'inputRecordRef', { value: input.recordRef, enumerable: false });
  for (const [name, value] of [['getter', getter], ['proxy', proxy], ['hidden', hidden], ['extra-role', { ...read, role: 'host' }], ['upper-ref', { ...read, inputRecordRef: input.recordRef.toUpperCase() }], ['missing', { taskRef: f.taskRef }], ['null-prototype', Object.assign(Object.create(null), read)], ['symbol', { ...read, [Symbol('host')]: true }]]) await t.test(name, () => { refuse('INVALID_INPUT', () => f.store.readAuditInput(f.host, value)); unchanged(f, before); });
  for (const [name, handle] of [['owner', f.owner], ['coordinator', f.coordinator], ['worker', f.worker], ['advanced-reviewer', f.advanced], ['forged-host', {}]]) await t.test(name, () => { refuse('UNAUTHORIZED', () => f.store.readAuditInput(handle, read)); unchanged(f, before); });
  refuse('AUDIT_INPUT_REQUIRED', () => f.store.readAuditInput(f.foreignHost, read));
  refuse('AUDIT_INPUT_REQUIRED', () => f.store.readAuditInput(f.host, { ...read, inputRecordRef: f.context.recordRef }));
  refuse('AUDIT_BINDING_MISMATCH', () => f.store.readAuditInput(f.host, { ...read, taskRef: second.taskRef }));
  assert.equal(traps, 0); assert.equal(f.state.permissionCalls, permissions); unchanged(f, before);
});

test('N3F03 exact serialized input byte limit N-1/N/N+1 accounts escaping and refuses atomically', async t => {
  const reference = await fixture(t), complete = prepare(reference), N = complete.byteLength;
  assert(N > 2000 && N < 65536);
  for (const delta of [-1, 0, 1]) await t.test('selected limit ' + (N + delta), async t => {
    const f = await fixture(t, { auditExecutionBounds: { inputByteLimit: N + delta, resultByteLimit: 65536 } }), before = stableView(f);
    if (delta < 0) { refuse('INPUT_TOO_LARGE', () => prepare(f)); unchanged(f, before); }
    else { const input = prepare(f); assert.equal(input.byteLength, N); assert.equal(counts(f.path).auditKinds.find(k => k.kind === 'audit_input').n, 1); }
  });
});

test('N3F04 changing a single approved input/material dimension refuses before plan and keeps complete consent immutable', async t => {
  const f = await fixture(t), input = prepare(f), spec = actionSpec(f, input), before = stableView(f);
  for (const [name, modify, code] of [
    ['input-byte-digest', s => { s.executionInput.digest = sha('different-input'); }, 'AUDIT_BINDING_MISMATCH'],
    ['input-reference', s => { s.executionInput.recordRef = f.context.recordRef; }, 'AUDIT_INPUT_REQUIRED'],
    ['artifact-vs-input', s => { s.dataDigest = input.digest; }, 'AUDIT_BINDING_MISMATCH'],
    ['material-digest', s => { s.executionInput.materialDigest = sha('different-material'); }, 'AUDIT_BINDING_MISMATCH'],
    ['audit-reference', s => { s.executionInput.auditRef = sha('different-audit'); }, 'AUDIT_BINDING_MISMATCH'],
    ['purpose-only', s => { s.executionInput.purpose = 'audit_repair'; }, 'INVALID_INPUT'],
    ['unapproved-resume', s => { s.executor.mode = 'resume'; }, 'INVALID_INPUT'],
    ['review-lineage-extra', s => { s.executionInput.previousReportRef = sha('invented-report'); }, 'INVALID_INPUT']
  ]) await t.test(name, () => { const candidate = clone(spec); modify(candidate); refuse(code, () => f.store.planAction(f.owner, { ...cas(f), commandRef: next('invalid-plan'), spec: candidate })); unchanged(f, before); });
  const planned = planGrant(f, input, { spec });
  spec.executionInput.digest = sha('mutated-source'); spec.model.modelRef = sha('mutated-model');
  const action = f.store.snapshot(f.owner, { taskRef: f.taskRef }).actions[0];
  assert.equal(action.spec.executionInput.digest, input.digest);
  assert.notEqual(action.spec.model.modelRef, spec.model.modelRef);
  assert.equal(action.actionDigest, planned.plan.actionDigest);
});

test('N3F05 fresh private reviewer closure is exact task/generation/material and seals on factual stop', async t => {
  const f = await fixture(t), flow = start(f), materialRefs = new Set([...f.requirement.material.map(m => m.recordRef), flow.input.recordRef]);
  const permitted = f.store.listData(flow.reviewer, { taskRef: f.taskRef });
  assert.deepEqual(new Set(permitted.map(m => m.recordRef)), materialRefs);
  for (const recordRef of materialRefs) assert.equal(typeof f.store.readData(flow.reviewer, { taskRef: f.taskRef, recordRef }).content, 'string');
  refuse('UNAUTHORIZED', () => f.store.readAuditInput(flow.reviewer, { taskRef: f.taskRef, inputRecordRef: flow.input.recordRef }));
  const foreign = await makeTask(f, 'foreign-task');
  refuse('UNAUTHORIZED', () => f.store.readData(flow.reviewer, { taskRef: foreign.taskRef, recordRef: foreign.context.recordRef }));
  const before = stableView(f);
  refuse('INVALID_CONFIG', () => f.store.bindAuditReviewer(f.host, flow.reviewer, { taskRef: f.taskRef, auditRef: flow.input.auditRef, claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, sessionRef: flow.held.sessionRef }));
  refuse('STALE_GENERATION', () => f.store.bindAuditReviewer(f.host, {}, { taskRef: f.taskRef, auditRef: flow.input.auditRef, claimRef: flow.held.claimRef, generationRef: sha('different-generation'), sessionRef: flow.held.sessionRef }));
  refuse('UNAUTHORIZED', () => f.store.bindAuditReviewer(f.owner, {}, { taskRef: f.taskRef, auditRef: flow.input.auditRef, claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, sessionRef: flow.held.sessionRef }));
  unchanged(f, before);
  f.store.workerObservation(f.host, { taskRef: f.taskRef, commandRef: next('sealed-stop'), claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, phase: 'stopped', evidenceRef: sha('actual-typed-stop') });
  refuse('UNAUTHORIZED', () => f.store.context(flow.reviewer, f.taskRef));
  assert.equal(counts(f.path).tables.reservations, 1, 'stop without known effect cannot free a reservation');
});

test('N3F06 final locked consume decision table applies exact expiry and changed current facts without writes', async t => {
  const cases = [
    ['expiry-minus-one', f => { f.state.now = 1999; }, null], ['expiry-equal', f => { f.state.now = 2000; }, 'APPROVAL_INVALID'], ['expiry-plus-one', f => { f.state.now = 2001; }, 'APPROVAL_INVALID'],
    ['false-permission', f => { f.state.permit = false; }, 'HOST_DENIED'], ['truthy-permission', f => { f.state.permit = 1; }, 'HOST_DENIED'], ['promised-permission', f => { f.state.permit = Promise.resolve(true); }, 'HOST_DENIED'], ['throwing-permission', f => { f.state.permit = 'throw'; }, 'HOST_DENIED'],
    ['revoke', (f, flow) => revoke(f, flow), 'CLAIM_REVOKED'], ['pause', f => f.store.control(f.owner, { ...cas(f), commandRef: next('pause'), kind: 'pause' }), 'CLAIM_REVOKED'], ['cancel', f => f.store.control(f.owner, { ...cas(f), commandRef: next('cancel'), kind: 'cancel' }), 'CLAIM_REVOKED'],
    ['policy-downshift', f => { const p = f.store.getPolicy(f.owner); f.store.policy(f.owner, { commandRef: next('downshift'), expectedVersion: p.version, limits: { maxActive: 0 }, modelPolicy: p.modelPolicy }); }, 'STALE_POLICY'],
    ['semantic-constraint', f => f.store.revise(f.owner, { ...cas(f), commandRef: next('new-constraint'), reason: 'operator', constraints: 'new protected constraint' }), 'AUDIT_STALE'],
    ['memory-created', f => f.store.putMemory(f.owner, { namespaceRef: sha('bound-memory'), expectedRevision: 0, commandRef: next('memory'), content: 'current memory changed', sourceRefs: [sha('memory-source')] }), 'STALE_MEMORY']
  ];
  for (const [name, change, code] of cases) await t.test(name, async t => {
    const f = await fixture(t, {}, { memory: { namespaceRef: sha('bound-memory'), revision: 0 } }), flow = start(f);
    change(f, flow); const before = stableView(f);
    if (code) { refuse(code, () => f.store.assertExecutionCurrent(f.host, flow.consume)); unchanged(f, before); assert.equal(before.rows.tables.reservations, 1); }
    else { assert.equal(f.store.assertExecutionCurrent(f.host, flow.consume).admitted, true); const consumed = stableView(f); assert.equal(f.store.assertExecutionCurrent(f.host, flow.consume).admitted, false); unchanged(f, consumed); }
    assert.equal(f.store.readAuditInput(f.host, { taskRef: f.taskRef, inputRecordRef: flow.input.recordRef }).data.digest, flow.input.digest, 'historical input remains a read, not renewed admission');
  });
});

test('N3F07 procedural task CAS retains semantic audit; changed artifact or context cannot certify newer requirements', async t => {
  for (const mutation of ['procedural', 'artifact', 'context']) await t.test(mutation, async t => {
    const f = await fixture(t), flow = start(f); assert.equal(f.store.assertExecutionCurrent(f.host, flow.consume).admitted, true);
    if (mutation === 'procedural') f.store.revise(f.owner, { ...cas(f), commandRef: next('procedural'), reason: 'progress', status: 'waiting' });
    if (mutation === 'artifact') f.store.writeArtifact(f.owner, { ...cas(f), commandRef: next('artifact-v2'), artifactRef: f.artifact.artifactRef, version: 2, content: 'same task, newer authoritative artifact' });
    if (mutation === 'context') f.store.putData(f.owner, { ...cas(f), commandRef: next('replacement-context'), kind: 'context', content: 'new semantic context', sourceRef: sha('replacement-context-source') });
    const result = capture(f, flow), before = stableView(f);
    if (mutation === 'procedural') { const answer = f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, result)); assert.equal(answer.verification.verdict, 'accepted'); assert.equal(current(f).status, 'waiting'); }
    else { refuse('AUDIT_STALE', () => f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, result))); unchanged(f, before); assert.equal(f.store.audit(f.owner, { taskRef: f.taskRef, auditRef: f.requirement.auditRef }).state, 'stale'); }
    assert.equal(counts(f.path).tables.reservations, 1);
  });
});

test('N3F08 closed complete coverage, finding16 boundary and fatal truth table certify only intended facts', async t => {
  const variants = [
    ['passed-complete', () => ({}), 'passed', 'accepted', null],
    ['resolved-warning', () => ({ findings: [{ findingRef: sha('warning'), severity: 'warning', code: 'other', evidenceRef: sha('warning-evidence'), resolved: true }] }), 'failed', 'rejected', null],
    ['resolved-fatal', () => ({ findings: [{ findingRef: sha('fatal'), severity: 'fatal', code: 'permission_bypass', evidenceRef: sha('fatal-evidence'), resolved: true }] }), 'failed', 'rejected', null],
    ['nonblocking-info', () => ({ findings: [{ findingRef: sha('info'), severity: 'info', code: 'other', evidenceRef: sha('info-evidence'), resolved: false }] }), 'passed', 'accepted', null],
    ['unknown', () => ({ verdict: 'unknown' }), 'unknown', 'unknown', null],
    ['budget', () => ({ verdict: 'budget_exhausted' }), 'budget_exhausted', 'unknown', null],
    ['unexamined', f => ({ coverageRefs: f.requirement.material.slice(0, 3).map(m => m.recordRef), unexaminedRefs: [f.requirement.material[3].recordRef] }), 'failed', 'unknown', null],
    ['overlap', f => ({ unexaminedRefs: [f.requirement.material[0].recordRef] }), null, null, 'AUDIT_BINDING_MISMATCH'],
    ['omitted', f => ({ coverageRefs: f.requirement.material.slice(1).map(m => m.recordRef) }), null, null, 'AUDIT_BINDING_MISMATCH'],
    ['foreign', f => ({ coverageRefs: [...f.requirement.material.slice(1).map(m => m.recordRef), sha('foreign')] }), null, null, 'AUDIT_BINDING_MISMATCH'],
    ['authority-key', () => ({ grant: true }), null, null, 'AUDIT_RESPONSE_INVALID'],
    ['truthy-resolved', () => ({ findings: [{ findingRef: sha('truthy'), severity: 'info', code: 'other', evidenceRef: sha('truthy-evidence'), resolved: 1 }] }), null, null, 'AUDIT_RESPONSE_INVALID'],
    ...[15, 16, 17].map(n => ['findings-' + n, () => ({ findings: Array.from({ length: n }, (_, i) => ({ findingRef: sha('finding-' + i), severity: 'info', code: 'other', evidenceRef: sha('finding-evidence-' + i), resolved: false })) }), n <= 16 ? 'passed' : null, n <= 16 ? 'accepted' : null, n <= 16 ? null : 'AUDIT_RESPONSE_INVALID'])
  ];
  for (const [name, change, reportState, verification, code] of variants) await t.test(name, async t => {
    const f = await fixture(t), flow = start(f); assert.equal(f.store.assertExecutionCurrent(f.host, flow.consume).admitted, true);
    const result = capture(f, flow, response(f, flow, change(f))), before = stableView(f), call = () => f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, result));
    if (code) { refuse(code, call); unchanged(f, before); assert.equal(f.store.artifact(f.owner, { taskRef: f.taskRef, artifactRef: f.artifact.artifactRef }).verification, null); }
    else {
      const answer = call();
      assert.equal(answer.report.state, reportState); assert.equal(answer.verification.verdict, verification);
      assert.equal(answer.report.native.resultRef, result.resultRef);
      // Verification is the closed factual projection, not an artifact envelope.
      // Exact digest/version are bound by the distinct report + artifact/review.
      assert.equal(answer.report.digest, f.artifact.digest); assert.equal(answer.report.artifactVersion, 1);
      const artifact = f.store.artifact(f.owner, { taskRef: f.taskRef, artifactRef: f.artifact.artifactRef });
      assert.equal(artifact.digest, f.artifact.digest); assert.equal(artifact.version, 1);
      assert.deepEqual(artifact.verification, answer.verification);
      const review = f.store.snapshot(f.owner, { taskRef: f.taskRef }).reviews.find(r => r.reportRef === answer.report.reportRef);
      assert.equal(review.digest, f.artifact.digest); assert.equal(review.version, 1);
      assert.equal(review.resultRef, result.resultRef);
    }
    assert.equal(current(f).status, 'running', 'a report cannot complete the task');
  });
});

test('N3F09 exact complete result-byte ceiling and cursor/shape/secret no-write boundaries', async t => {
  const sample = await fixture(t), sampleFlow = start(sample), N = Buffer.byteLength(JSON.stringify(response(sample, sampleFlow)));
  for (const delta of [-1, 0, 1]) await t.test('result limit ' + (N + delta), async t => {
    const f = await fixture(t, { auditExecutionBounds: { inputByteLimit: 65536, resultByteLimit: N + delta } }), flow = start(f); f.store.assertExecutionCurrent(f.host, flow.consume); const before = stableView(f);
    if (delta < 0) { refuse('INPUT_TOO_LARGE', () => capture(f, flow)); unchanged(f, before); }
    else { const result = capture(f, flow); assert.equal(result.byteLength, N); assert.equal(f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, result)).verification.verdict, 'accepted'); }
  });
  const f = await fixture(t, { forbiddenSecrets: ['INDEPENDENT_PRIVATE_CANARY'] }), flow = start(f); f.store.assertExecutionCurrent(f.host, flow.consume);
  const base = captureInput(f, flow, JSON.stringify(response(f, flow))), before = stableView(f); let traps = 0;
  const getter = { ...base }; Object.defineProperty(getter, 'content', { enumerable: true, get() { traps++; throw Error('INDEPENDENT_PRIVATE_CANARY'); } });
  const proxy = new Proxy(base, { get() { traps++; throw Error('INDEPENDENT_PRIVATE_CANARY'); } });
  for (const [name, value, code] of [['same-cursor', { ...base, cursor: 6 }, 'INVALID_INPUT'], ['fraction-cursor', { ...base, cursor: 6.5 }, 'INVALID_INPUT'], ['unsafe-cursor', { ...base, cursor: Number.MAX_SAFE_INTEGER + 1 }, 'INVALID_INPUT'], ['getter', getter, 'INVALID_INPUT'], ['proxy', proxy, 'INVALID_INPUT'], ['unpaired', { ...base, content: '\ud800' }, 'INVALID_INPUT'], ['secret', { ...base, content: 'INDEPENDENT_PRIVATE_CANARY' }, 'SECRET_REJECTED'], ['wrong-session', { ...base, sessionRef: sha('different-session') }, 'SPEC_MISMATCH']]) await t.test(name, () => { refuse(code, () => f.store.captureAuditResult(f.host, value)); unchanged(f, before); });
  assert.equal(traps, 0);
  assert(!JSON.stringify(f.store.exportTask(f.owner, { taskRef: f.taskRef })).includes('INDEPENDENT_PRIVATE_CANARY'));
  assert(!readFileSync(f.path).includes(Buffer.from('INDEPENDENT_PRIVATE_CANARY')));
});

test('N3F10 captured result replay is immutable; direct report/verification and wrong role cannot bypass signed source association', async t => {
  const f = await fixture(t), flow = start(f); f.store.assertExecutionCurrent(f.host, flow.consume);
  const request = captureInput(f, flow, JSON.stringify(response(f, flow))), result = f.store.captureAuditResult(f.host, request), before = stableView(f);
  assert.equal(f.store.captureAuditResult(f.host, request).deduplicated, true); unchanged(f, before);
  assert.equal(f.store.captureAuditResult(f.host, { ...request, commandRef: next('new-identical-capture') }).deduplicated, true);
  const afterReceipt = stableView(f);
  for (const change of [{ content: request.content + ' ' }, { cursor: 8 }, { evidenceRef: sha('different-evidence') }]) { refuse('IDEMPOTENCY_CONFLICT', () => f.store.captureAuditResult(f.host, { ...request, commandRef: next('conflicting-capture'), ...change })); unchanged(f, afterReceipt); }
  refuse('AUDIT_RESULT_REQUIRED', () => f.store.reportAudit(flow.reviewer, { taskRef: f.taskRef, commandRef: next('direct-report'), auditRef: f.requirement.auditRef, artifactVersion: 1, digest: f.artifact.digest, materialDigest: flow.input.materialDigest, claimRef: flow.held.claimRef, generationRef: flow.held.generationRef, coverageRefs: f.requirement.material.map(m => m.recordRef), unexaminedRefs: [], verdict: 'passed', findings: [], evidenceRef: sha('no-native-source') }));
  refuse('AUDIT_RESULT_REQUIRED', () => f.store.verifyArtifact(flow.reviewer, { taskRef: f.taskRef, commandRef: next('direct-verify'), artifactRef: f.artifact.artifactRef, version: 1, digest: f.artifact.digest, verdict: 'accepted', evidenceRef: sha('no-native-source') }));
  for (const handle of [f.owner, f.host, f.advanced, {}]) refuse('UNAUTHORIZED', () => f.store.submitAuditResult(handle, submitInput(f, flow, result)));
  unchanged(f, afterReceipt);
});

test('N3F11 compound report/verification fault rolls back both; acknowledged historical replay remains exact after stop and reopen', async t => {
  let armed = false;
  const f = await fixture(t, { fixtureMode: true, fixtureFaults: point => { if (armed && point === 'before_commit') throw Error('INDEPENDENT_COMMIT_CUT'); } }), flow = start(f);
  f.store.assertExecutionCurrent(f.host, flow.consume); const result = capture(f, flow), request = submitInput(f, flow, result), before = stableView(f);
  armed = true; refuse('FIXTURE_CUT', () => f.store.submitAuditResult(flow.reviewer, request)); armed = false; unchanged(f, before);
  assert.equal(counts(f.path).auditKinds.some(r => r.kind === 'report'), false);
  const accepted = f.store.submitAuditResult(flow.reviewer, request), after = stableView(f);
  assert.deepEqual(f.store.submitAuditResult(flow.reviewer, request), accepted); unchanged(f, after);
  assert.equal(accepted.verification.reportRef, accepted.report.reportRef);
  assert.equal(stopSettle(f, flow).reservationHeld, false);
  refuse('UNAUTHORIZED', () => f.store.submitAuditResult(flow.reviewer, request));
  f.store.close(); f.store = new RuntimeStore(f.config);
  assert.equal(f.store.artifact(f.owner, { taskRef: f.taskRef, artifactRef: f.artifact.artifactRef }).verification.reportRef, accepted.report.reportRef);
  assert.equal(f.store.audit(f.owner, { taskRef: f.taskRef, auditRef: f.requirement.auditRef }).reports[0].native.inputDigest, flow.input.digest);
  const original = f.store.readAuditInput(f.host, { taskRef: f.taskRef, inputRecordRef: flow.input.recordRef });
  assert.equal(original.association.previousReportRef, null); assert.equal(counts(f.path).tables.reservations, 0);
});

test('N3F12 actual failed report repair requires complete lineage and shared attempts; no post-claim substitute or hidden budget', async t => {
  for (const totalLimit of [1, 2]) await t.test('accepted total ' + totalLimit, async t => {
    const f = await fixture(t); const p = f.store.getPolicy(f.owner);
    f.store.policy(f.owner, { commandRef: next('explicit-total-policy'), expectedVersion: p.version, limits: { maxActive: 1, maxTotalAttempts: totalLimit }, modelPolicy: p.modelPolicy });
    const flow = start(f); f.store.assertExecutionCurrent(f.host, flow.consume);
    const output = capture(f, flow, response(f, flow, { verdict: 'failed' })), report = f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, output)).report;
    const premature = { ...preparationInput(f, 'audit_repair', { previousReportRef: report.reportRef }) };
    const repairInput = { ...prepare(f, premature), previousReportRef: report.reportRef };
    const repairPlan = planGrant(f, repairInput, { auditRepair: { auditRef: f.requirement.auditRef, round: 1, previousReportRef: report.reportRef, evidenceRef: sha('explicit-repair-consent') } });
    const heldBefore = stableView(f);
    refuse('ACTIVE_FULL', () => f.store.claimAction(f.host, repairPlan.claimInput)); unchanged(f, heldBefore);
    assert.equal(stopSettle(f, flow).reservationHeld, false);
    // grant for another action increments auth epoch; renew consent only from a
    // freshly planned spec after the original stopped/released execution.
    const req = { ...repairPlan.claimInput, ...cas(f), commandRef: next('repair-claim-after-release') };
    for (const invalid of [undefined, { auditRef: f.requirement.auditRef, round: 1, previousReportRef: sha('wrong-report'), evidenceRef: sha('lineage') }, { auditRef: f.requirement.auditRef, round: 2, previousReportRef: report.reportRef, evidenceRef: sha('lineage') }]) {
      const before = stableView(f); const { auditRepair, ...base } = req;
      refuse(invalid === undefined ? 'AUDIT_BINDING_MISMATCH' : 'AUDIT_REPAIR_LIMIT', () => f.store.claimAction(f.host, { ...base, ...(invalid ? { auditRepair: invalid } : {}) })); unchanged(f, before);
    }
    const before = stableView(f);
    if (totalLimit === 1) { refuse('ATTEMPT_LIMIT', () => f.store.claimAction(f.host, req)); unchanged(f, before); }
    else { const repaired = f.store.claimAction(f.host, req); const audit = f.store.audit(f.owner, { taskRef: f.taskRef, auditRef: f.requirement.auditRef }); assert.equal(audit.pendingRepair.claimRef, repaired.claimRef); assert.equal(audit.pendingRepair.previousReportRef, report.reportRef); assert.equal(counts(f.path).attempts, 2); assert.equal(counts(f.path).tables.reservations, 1); }
  });
});

test('N3F13 protected capacity leaves a captured output and report together; ordinary writes cannot consume reconciliation room', async t => {
  const f = await fixture(t, { limits: { maxRecordsPerTask: 6 } }), flow = start(f); f.store.assertExecutionCurrent(f.host, flow.consume);
  assert.equal(counts(f.path).tables.runtime_data, 5);
  const before = stableView(f);
  refuse('RECORD_LIMIT', () => f.store.putData(f.owner, { ...cas(f), commandRef: next('ordinary-progress'), kind: 'progress', content: 'ordinary progress must not occupy reserved output', sourceRef: sha('progress-source') })); unchanged(f, before);
  const result = capture(f, flow), answer = f.store.submitAuditResult(flow.reviewer, submitInput(f, flow, result));
  assert.equal(counts(f.path).tables.runtime_data, 6);
  assert.equal(answer.verification.verdict, 'accepted'); assert.equal(stopSettle(f, flow).reservationHeld, false);
  assert.equal(counts(f.path).tables.reservations, 0);
});

// Each child opens its independent SQLite connection before a parent admits
// work. Constructor recovery is therefore never mistaken for race ordering.
async function childConnection(t, f) {
  const code = `import {RuntimeStore} from ${JSON.stringify(sourceUrl)};const owner={},host={};const store=new RuntimeStore({databasePath:process.argv[1],encryptionKey:Buffer.alloc(32,${KEY_BYTE}),clock:()=>1000,hostPermission:()=>true,auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:65536},principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}]});process.send({ready:true});process.on('message',m=>{if(m.op==='close'){store.close();process.disconnect();return;}try{const method={consume:'assertExecutionCurrent',late:'assertNativeRequestCurrent',claim:'claimAction',revoke:'revokeAction',read:'readAuditInput'}[m.op];const value=store[method](m.op==='revoke'?owner:host,m.input);process.send({id:m.id,ok:true,value});}catch(e){process.send({id:m.id,ok:false,code:e.code});}});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, f.path], { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '', counter = 0; const pending = new Map(); child.stderr.on('data', b => { stderr += b.toString(); });
  const ready = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('child ready timeout')), 8000); child.on('message', m => { if (m.ready) { clearTimeout(timer); resolve(); } else { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); p.resolve(m); } } }); child.once('error', e => { clearTimeout(timer); reject(e); }); child.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(Error('child exit ' + code + ' ' + stderr)); }); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  await ready;
  const request = (op, input) => new Promise((resolve, reject) => { const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(Error('child operation timeout')); }, 8000); pending.set(id, { resolve, timer }); child.send({ id, op, input }); });
  return { request, async close() { child.send({ op: 'close' }); assert.deepEqual(await exited, { code: 0, signal: null }); } };
}

test('N3F14 independent process simultaneous consume emits one durable admission and no second authorization', async t => {
  const f = await fixture(t), a = await childConnection(t, f), b = await childConnection(t, f), flow = start(f);
  const results = await Promise.all([a.request('consume', flow.consume), b.request('consume', flow.consume)]);
  assert(results.every(r => r.ok)); assert.deepEqual(results.map(r => r.value.admitted).sort(), [false, true]);
  assert.equal(counts(f.path).attempts, 1); assert.equal(counts(f.path).tables.reservations, 1);
  assert.equal((await a.request('late', flow.consume)).value.inputDigest, flow.input.digest);
  const before = stableView(f); assert.equal((await b.request('consume', flow.consume)).value.admitted, false); unchanged(f, before);
  await Promise.all([a.close(), b.close()]);
});

test('N3F15 both independently ordered consume/revoke races preserve held facts and historical input without replay', async t => {
  for (const order of ['revoke-first', 'consume-first']) await t.test(order, async t => {
    const f = await fixture(t), operator = await childConnection(t, f), executor = await childConnection(t, f), flow = start(f);
    const revocation = { ...cas(f), commandRef: next('child-revoke'), actionRef: flow.held.actionRef, actionDigest: flow.held.actionDigest };
    if (order === 'consume-first') { const consumed = await executor.request('consume', flow.consume); assert.equal(consumed.value.admitted, true); }
    assert.equal((await operator.request('revoke', revocation)).ok, true);
    const before = stableView(f), rejected = await executor.request(order === 'revoke-first' ? 'consume' : 'late', flow.consume);
    assert.deepEqual({ ok: rejected.ok, code: rejected.code }, { ok: false, code: 'CLAIM_REVOKED' }); unchanged(f, before);
    const historical = await executor.request('read', { taskRef: f.taskRef, inputRecordRef: flow.input.recordRef }); assert.equal(historical.value.data.digest, flow.input.digest); unchanged(f, before);
    assert.equal(before.rows.tables.reservations, 1); assert.equal(before.rows.attempts, 1);
    await Promise.all([operator.close(), executor.close()]);
  });
});

test('N3F16 two independent tasks contend for actual global final slot without cross-task claims or partial charges', async t => {
  const f = await fixture(t), second = await makeTask(f, 'second-contender');
  const one = planGrant(f, prepare(f)), two = planGrant(second, prepare(second));
  const a = await childConnection(t, f), b = await childConnection(t, f);
  const results = await Promise.all([a.request('claim', one.claimInput), b.request('claim', two.claimInput)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.find(r => !r.ok).code, 'ACTIVE_FULL');
  const winner = results[0].ok ? f : second, loser = results[0].ok ? second : f;
  assert.equal(results.find(r => r.ok).value.task.taskRef, winner.taskRef);
  assert.equal(f.store.snapshot(f.owner, { taskRef: loser.taskRef }).actions[0].attempts, 0);
  assert.equal(f.store.snapshot(f.owner, { taskRef: loser.taskRef }).actions[0].state, 'requested');
  assert.equal(counts(f.path).attempts, 1); assert.equal(counts(f.path).activeUnits, 1); assert.equal(counts(f.path).tables.reservations, 1);
  await Promise.all([a.close(), b.close()]);
});

async function genuine4(t) {
  const manifest = JSON.parse(readFileSync(new URL('source-hold.json', oldRoot), 'utf8'));
  assert.equal(manifest.schemaVersion, 4);
  for (const row of manifest.files) assert.equal(sha(readFileSync(new URL(row.origin, oldRoot))), row.sha256);
  const { RuntimeStore: Old } = await import(new URL('src/runtime-store.mjs', oldRoot));
  const f = createStore(t, {}, Old), intake = { taskId: 'source-four', provider: 'fixture', source: 'genuine-four', eventId: 'acknowledged-four', commandRef: next('source4-intake'), goal: 'SOURCE4 acknowledged encrypted goal 中文🙂' };
  const receipt = f.store.intake(f.owner, intake), taskRef = receipt.task.taskRef;
  const context = f.store.putData(f.owner, { taskRef, commandRef: next('source4-context'), expectedTaskVersion: receipt.task.version, expectedAuthEpoch: 0, kind: 'context', sourceRef: sha('source4-context-source'), content: 'SOURCE4 acknowledged context' });
  const memory = { namespaceRef: sha('source4-memory'), commandRef: next('source4-memory'), expectedRevision: 0, content: 'SOURCE4 original memory', sourceRefs: [sha('source4-memory-source')], requestDigest: sha('source4-memory-request') };
  const memoryReceipt = f.store.putMemory(f.owner, memory);
  f.store.deleteMemory(f.owner, { namespaceRef: memory.namespaceRef, commandRef: next('source4-memory-delete'), expectedRevision: 1, requestDigest: sha('source4-memory-delete-request') });
  f.store.close(); const sourceSha256 = bytes(f.path), sourceRows = counts(f.path);
  assert.equal(sourceRows.schemaVersion, 4);
  return { ...f, Old, taskRef, receipt, intake, context, memory, memoryReceipt, sourceSha256, sourceRows };
}

test('N3F17 genuine tracked4 migration keeps exact backup and historical acknowledgements without inventing normal input origin', async t => {
  const f = await genuine4(t); f.store = new RuntimeStore({ ...f.config, auditExecutionBounds: { inputByteLimit: 65536, resultByteLimit: 65536 } });
  assert.equal(counts(f.path).schemaVersion, SCHEMA_VERSION); assert.equal(bytes(f.path + '.schema-4.backup'), f.sourceSha256);
  // Schema6/7 migration appends exactly one empty sealed registry per scope (three kinds); all other row counts are unchanged.
  assert.deepEqual(counts(f.path).tables, { ...f.sourceRows.tables, automation_records: f.sourceRows.tables.automation_records + 3 });
  { const db = new DatabaseSync(f.path, { readOnly: true }); try { assert.deepEqual(db.prepare("SELECT kind,task FROM automation_records WHERE kind IN ('normal_provenance_registry','prepared_context_registry','normal_native_registry') ORDER BY rowid").all().map(row => [row.kind, row.task]), [['normal_provenance_registry', null], ['prepared_context_registry', null], ['normal_native_registry', null]]); } finally { db.close(); } }
  assert.deepEqual(f.store.intake(f.owner, f.intake), f.receipt);
  assert.deepEqual(f.store.memoryCommandReceipt(f.owner, { namespaceRef: f.memory.namespaceRef, commandRef: f.memory.commandRef, requestDigest: f.memory.requestDigest }), f.memoryReceipt);
  assert.equal(f.store.getMemory(f.owner, { namespaceRef: f.memory.namespaceRef }).deleted, true);
  assert.equal(f.store.readData(f.owner, { taskRef: f.taskRef, recordRef: f.context.recordRef }).content, 'SOURCE4 acknowledged context');
  const before = stableView(f); refuse('AUDIT_INPUT_REQUIRED', () => f.store.readAuditInput(f.host, { taskRef: f.taskRef, inputRecordRef: f.context.recordRef })); unchanged(f, before);
  f.store.close(); const entries = readdirSync(f.directory), hash = bytes(f.path);
  refuse('SCHEMA_FUTURE', () => new f.Old(f.config)); assert.equal(bytes(f.path), hash); assert.deepEqual(readdirSync(f.directory), entries);
});

test('N3F18 genuine4 refusal preserves original bytes for wrong key and existing exclusive recovery backup', async t => {
  for (const kind of ['wrong-key', 'backup-collision']) await t.test(kind, async t => {
    const f = await genuine4(t), backup = f.path + '.schema-4.backup';
    if (kind === 'backup-collision') writeFileSync(backup, 'INDEPENDENT_PREEXISTING_BACKUP', { flag: 'wx' });
    const entries = readdirSync(f.directory), copyHash = existsSync(backup) ? bytes(backup) : null;
    refuse(kind === 'wrong-key' ? 'KEY_MISMATCH' : 'STORAGE_UNAVAILABLE', () => new RuntimeStore({ ...f.config, ...(kind === 'wrong-key' ? { encryptionKey: Buffer.alloc(32, KEY_BYTE + 1) } : {}) }));
    assert.equal(bytes(f.path), f.sourceSha256); assert.deepEqual(counts(f.path), f.sourceRows); assert.deepEqual(readdirSync(f.directory), entries);
    if (copyHash) assert.equal(bytes(backup), copyHash); else assert.equal(existsSync(backup), false);
  });
});

test('N3F19 actual child exit after committed captured result keeps historical input/output and unknown hold with no automatic report', async t => {
  const f = await fixture(t), descriptorPath = join(f.directory, 'synthetic-descriptor.json');
  // Child opens before claim; entire typed claim/begin/capture chain is its own
  // connection. Only synthetic refs/bindings are serialized, not opaque handles.
  const input = prepare(f), planned = planGrant(f, input);
  writeFileSync(descriptorPath, JSON.stringify({ path: f.path, input, planned, taskRef: f.taskRef, response: response(f, { input }) }), { mode: 0o600, flag: 'wx' });
  const script = `import fs from 'node:fs';import{RuntimeStore}from${JSON.stringify(sourceUrl)};const v=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),owner={},host={};const s=new RuntimeStore({databasePath:v.path,encryptionKey:Buffer.alloc(32,${KEY_BYTE}),clock:()=>1000,hostPermission:()=>true,auditExecutionBounds:{inputByteLimit:65536,resultByteLimit:65536},principals:[{handle:owner,role:'owner',scope:${JSON.stringify(scope)}},{handle:host,role:'host',scope:${JSON.stringify(scope)}}]});const c=s.claimAction(host,v.planned.claimInput);s.workerObservation(host,{taskRef:v.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,sessionRef:c.sessionRef,commandRef:${JSON.stringify(next('child-observation'))},phase:'created',evidenceRef:${JSON.stringify(sha('child-created'))}});const e=s.beginAuditExecution(host,{taskRef:v.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,actionRef:c.actionRef,actionDigest:c.actionDigest,inputRecordRef:v.input.recordRef,commandRef:${JSON.stringify(next('child-begin'))},expectedTaskVersion:c.task.version,expectedAuthEpoch:c.task.authEpoch});s.assertExecutionCurrent(host,{taskRef:v.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,actionDigest:c.actionDigest,executionRef:e.executionRef});const result=s.captureAuditResult(host,{taskRef:v.taskRef,claimRef:c.claimRef,generationRef:c.generationRef,executionRef:e.executionRef,sessionRef:c.sessionRef,commandRef:${JSON.stringify(next('child-capture'))},inputCursor:6,cursor:7,content:JSON.stringify(v.response),evidenceRef:${JSON.stringify(sha('child-observed-output'))}});fs.writeFileSync(process.argv[2],JSON.stringify({resultRef:result.resultRef,recordRef:result.recordRef,digest:result.digest,claimRef:c.claimRef,generationRef:c.generationRef,executionRef:e.executionRef,actionDigest:c.actionDigest}));process.exit(79);`;
  const ackPath = join(f.directory, 'ack.json'), child = spawnSync(process.execPath, ['--input-type=module', '-e', script, descriptorPath, ackPath], { env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, timeout: 8000, encoding: 'utf8' });
  assert.equal(child.status, 79, child.stderr); assert.equal(child.signal, null);
  const ack = JSON.parse(readFileSync(ackPath, 'utf8'));
  assert.equal(counts(f.path).auditKinds.find(r => r.kind === 'audit_result').n, 1);
  assert.equal(counts(f.path).auditKinds.some(r => r.kind === 'report'), false);
  f.store.close(); f.store = new RuntimeStore(f.config);
  const snapshot = f.store.snapshot(f.owner, { taskRef: f.taskRef });
  assert.equal(snapshot.task.status, 'recovery_required'); assert.equal(snapshot.executions[0].state, 'unknown'); assert.equal(snapshot.executions[0].resultRef, ack.resultRef);
  assert.equal(snapshot.actions[0].claimRef, ack.claimRef); assert.equal(snapshot.actions[0].releaseEvidenceRef, null); assert.equal(counts(f.path).tables.reservations, 1);
  assert.equal(f.store.readData(f.owner, { taskRef: f.taskRef, recordRef: ack.recordRef }).digest, sha(JSON.stringify(response(f, { input }))));
  const before = stableView(f);
  assert.equal(f.store.readAuditInput(f.host, { taskRef: f.taskRef, inputRecordRef: input.recordRef }).data.digest, input.digest);
  assert.equal(f.store.assertExecutionCurrent(f.host, { taskRef: f.taskRef, claimRef: ack.claimRef, generationRef: ack.generationRef, actionDigest: ack.actionDigest, executionRef: ack.executionRef }).admitted, false); unchanged(f, before);
});
