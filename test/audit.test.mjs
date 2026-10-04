import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RuntimeAudit, normalizeAuditMaterial, normalizeAuditPolicy, normalizeAuditRequirement, normalizeAuditReport, normalizeAuditRepair, normalizeAuditRepairClaim, auditMaterialDigest } from '../src/audit.mjs';
import { DomainError } from '../src/messages.mjs';

const ref = s => createHash('sha256').update(s).digest('hex');
const material = () => [{ recordRef: ref('artifact-data'), digest: ref('artifact-bytes') }, { recordRef: ref('requirements-data'), digest: ref('requirements-bytes') }];
const policy = more => ({ policyRef: ref('explicit-policy'), blockingSeverities: ['blocking'], maxRepairRounds: 2, ...more });
const requirement = more => ({ taskRef: ref('task'), commandRef: ref('configure'), expectedTaskVersion: 1, expectedAuthEpoch: 0, expectedAuditRevision: 0, auditRef: ref('audit'), artifactRef: ref('artifact'), artifactVersion: 1, digest: ref('artifact-bytes'), material: material(), ...policy(), ...more });
const finding = more => ({ findingRef: ref('finding'), severity: 'fatal', code: 'permission_bypass', evidenceRef: ref('finding-evidence'), resolved: false, ...more });
const report = more => ({ taskRef: ref('task'), commandRef: ref('report'), auditRef: ref('audit'), artifactVersion: 1, digest: ref('artifact-bytes'), materialDigest: auditMaterialDigest(material()), claimRef: ref('review-claim'), generationRef: ref('review-generation'), coverageRefs: material().map(m => m.recordRef), unexaminedRefs: [], verdict: 'passed', findings: [], evidenceRef: ref('report-evidence'), ...more });
const repair = more => ({ taskRef: ref('task'), commandRef: ref('repair'), expectedTaskVersion: 1, expectedAuthEpoch: 0, auditRef: ref('audit'), claimRef: ref('repair-claim'), generationRef: ref('repair-generation'), round: 1, previousReportRef: ref('prior-report'), evidenceRef: ref('repair-evidence'), ...more });
const rejects = (fn, code = 'INVALID_INPUT') => assert.throws(fn, error => error instanceof DomainError && error.code === code && error.message === code);

test('audit material is immutable, individually digest-bound and canonical regardless of caller ordering', () => {
  const input = material(), checked = normalizeAuditMaterial(input);
  assert.ok(Object.isFrozen(checked)); assert.ok(Object.isFrozen(checked[0]));
  assert.equal(auditMaterialDigest(input), auditMaterialDigest(input.toReversed()));
  input[0].digest = ref('changed'); assert.notEqual(auditMaterialDigest(input), auditMaterialDigest(checked));
  rejects(() => normalizeAuditMaterial([])); rejects(() => normalizeAuditMaterial([checked[0], checked[0]]));
  rejects(() => normalizeAuditMaterial([...Array(17)].map((_, i) => ({ recordRef: ref(`record-${i}`), digest: ref('bytes') }))));
});
test('audit policies require explicit bounded thresholds and rounds; no missing configuration gains defaults', () => {
  assert.deepEqual(normalizeAuditPolicy(policy({ maxRepairRounds: 0, blockingSeverities: [] })).blockingSeverities, []);
  assert.equal(normalizeAuditPolicy(policy({ maxRepairRounds: 8 })).maxRepairRounds, 8);
  rejects(() => normalizeAuditPolicy(policy({ maxRepairRounds: 9 })));
  rejects(() => normalizeAuditPolicy(policy({ blockingSeverities: ['blocking', 'blocking'] })));
  rejects(() => normalizeAuditPolicy(policy({ blockingSeverities: ['success'] })));
  const missing = policy(); delete missing.maxRepairRounds; rejects(() => normalizeAuditPolicy(missing));
  rejects(() => normalizeAuditPolicy(policy({ approved: true })));
});
test('requirements and reports reject prose, paths, authority flags and executable metadata without callbacks', () => {
  rejects(() => normalizeAuditRequirement(requirement({ ownerRole: 'owner' })));
  rejects(() => normalizeAuditRequirement(requirement({ localPath: '/tmp/synthetic' })));
  rejects(() => normalizeAuditReport(report({ summary: 'sk_synthetic_canary' })));
  rejects(() => normalizeAuditReport(report({ grantAction: true })));
  let callbacks = 0; const accessor = requirement(); Object.defineProperty(accessor, 'material', { enumerable: true, get() { callbacks++; return material(); } });
  rejects(() => normalizeAuditRequirement(accessor));
  rejects(() => normalizeAuditReport(new Proxy(report(), { get() { callbacks++; return true; } })));
  const hidden = report(); Object.defineProperty(hidden, 'approved', { value: true }); rejects(() => normalizeAuditReport(hidden));
  assert.equal(callbacks, 0);
});
test('coverage and uncertainty are explicit; findings are bounded metadata and never a success shortcut', () => {
  const unknown = normalizeAuditReport(report({ verdict: 'unknown', coverageRefs: [], unexaminedRefs: material().map(m => m.recordRef) }));
  assert.equal(unknown.verdict, 'unknown'); assert.equal(unknown.unexaminedRefs.length, 2);
  const fatal = normalizeAuditReport(report({ findings: [finding()] }));
  assert.equal(fatal.findings[0].severity, 'fatal'); assert.equal(fatal.findings[0].resolved, false);
  rejects(() => normalizeAuditReport(report({ unexaminedRefs: [material()[0].recordRef] })), 'COVERAGE_CONFLICT');
  rejects(() => normalizeAuditReport(report({ findings: [finding(), finding()] })));
  rejects(() => normalizeAuditReport(report({ findings: [finding({ resolved: 'yes' })] })));
  rejects(() => normalizeAuditReport(report({ verdict: 'completed' })));
  const missing = report(); delete missing.unexaminedRefs; rejects(() => normalizeAuditReport(missing));
});
test('repair lineage requires prior report, exact claim and bounded positive round without auto-triggering work', () => {
  const r = normalizeAuditRepair(repair()); assert.ok(Object.isFrozen(r));
  rejects(() => normalizeAuditRepair(repair({ round: 0 }))); rejects(() => normalizeAuditRepair(repair({ round: 9 })));
  rejects(() => normalizeAuditRepair(repair({ modelOverride: ref('model') })));
  const missing = repair(); delete missing.previousReportRef; rejects(() => normalizeAuditRepair(missing));
});
test('facade requires typed authoritative capability and forwards opaque identity; malformed output cannot invoke core', () => {
  rejects(() => new RuntimeAudit({}), 'CAPABILITY_UNAVAILABLE');
  const handle = {}, calls = [], core = {
    configureAudit(who, input) { assert.equal(who, handle); assert.ok(Object.isFrozen(input)); calls.push(['configure', input]); return { auditRef: input.auditRef, state: 'pending' }; },
    reportAudit(who, input) { assert.equal(who, handle); calls.push(['report', input]); return { auditRef: input.auditRef, state: 'blocked' }; },
    recordRepair(who, input) { assert.equal(who, handle); calls.push(['repair', input]); return { auditRef: input.auditRef, state: 'pending' }; },
    audit(who, input) { assert.equal(who, handle); calls.push(['read', input]); return { auditRef: input.auditRef, state: 'blocked' }; },
  }, audit = new RuntimeAudit(core);
  assert.equal(audit.configure(handle, requirement()).state, 'pending');
  assert.equal(audit.report(handle, report({ findings: [finding()] })).state, 'blocked');
  assert.equal(audit.repair(handle, repair()).state, 'pending');
  assert.equal(audit.read(handle, ref('task'), ref('audit')).state, 'blocked');
  assert.deepEqual(calls.map(([name]) => name), ['configure', 'report', 'repair', 'read']);
  rejects(() => audit.report(handle, report({ approved: true }))); assert.equal(calls.length, 4);
});

test('repair claim combines exact approved action and bounded lineage in one core call before any effect', () => {
  const handle = {}, calls = [], core = { configureAudit() {}, reportAudit() {}, recordRepair() {}, audit() {}, claimAction(who, input) { assert.equal(who, handle); calls.push(input); return { claimRef: ref('claim'), reservationRef: ref('reservation') }; } }, audit = new RuntimeAudit(core);
  const input = { taskRef: ref('task'), commandRef: ref('claim-repair'), expectedTaskVersion: 1, expectedAuthEpoch: 0, actionRef: ref('repair-action'), actionDigest: ref('complete-action-spec'), auditRef: ref('audit'), round: 1, previousReportRef: ref('prior-report'), evidenceRef: ref('lineage-evidence') };
  const checked = normalizeAuditRepairClaim(input); assert.ok(Object.isFrozen(checked));
  assert.equal(audit.claimRepair(handle, input).claimRef, ref('claim'));
  assert.deepEqual(calls[0], { taskRef: input.taskRef, commandRef: input.commandRef, expectedTaskVersion: 1, expectedAuthEpoch: 0, actionRef: input.actionRef, actionDigest: input.actionDigest, auditRepair: { auditRef: input.auditRef, round: 1, previousReportRef: input.previousReportRef, evidenceRef: input.evidenceRef } });
  rejects(() => audit.claimRepair(handle, { ...input, round: 9 }));
  rejects(() => audit.claimRepair(handle, { ...input, approved: true })); assert.equal(calls.length, 1);
});

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeStore, reference } from '../src/runtime-store.mjs';

function runtimeFixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'df-audit-')), databasePath = join(dir, 'ledger.db'), owner = {}, host = {}, other = {}, taskRef = reference('task');
  const options = { databasePath, encryptionKey: Buffer.alloc(32, 19), clock: () => 1000, hostPermission: () => true, forbiddenSecrets: ['sk_synthetic_audit_canary'], principals: [
    { handle: owner, role: 'owner', scope: { ownerId: 'owner', workspaceId: 'workspace' } },
    { handle: host, role: 'host', scope: { ownerId: 'owner', workspaceId: 'workspace' } },
    { handle: other, role: 'owner', scope: { ownerId: 'other', workspaceId: 'workspace' } },
  ], ...overrides, limits: { maxActive: 8, ...overrides.limits } };
  let store = new RuntimeStore(options); t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.intake(owner, { taskId: 'task', provider: 'mock', source: 'source', eventId: 'event', commandRef: ref('intake') });
  store.policy(owner, { commandRef: ref('policy'), expectedVersion: 1, limits: {}, modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
  const task = () => store.task(owner, taskRef), bind = tag => ({ taskRef, commandRef: ref(tag), expectedTaskVersion: task().version, expectedAuthEpoch: task().authEpoch });
  const service = () => new RuntimeAudit(store);
  let art = store.writeArtifact(owner, { ...bind('artifact-write'), artifactRef: ref('artifact'), version: 1, content: 'Synthetic immutable task result; no approval authority.' });
  const initialMaterial = [{ recordRef: art.recordRef, digest: art.digest }];
  function configure(tag = 'configure', more = {}) { return service().configure(owner, { ...bind(tag), auditRef: ref('audit'), expectedAuditRevision: 0, artifactRef: art.artifactRef, artifactVersion: art.version, digest: art.digest, material: initialMaterial, ...policy(), ...more }); }
  function admit(config, tag = 'review', kind = 'review', generationRef = ref(`${tag}-generation`), lineage = null, prepareOnly = false) {
    const spec = { actionRef: ref(`${tag}-action`), kind, role: kind === 'review' ? 'review' : 'repair', targetDigest: config.bindingDigest, dataDigest: art.digest, units: 1, charges: { runtimeMs: 1, usageUnits: 1, costEstimateMicros: 0 }, attemptGroupRef: ref(`${tag}-attempt`), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef, environmentRef: ref('environment'), bindingDigest: ref('executor-binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
    const planned = store.planAction(owner, { ...bind(`${tag}-plan`), spec }); store.grantAction(owner, { ...bind(`${tag}-grant`), actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: 2000 });
    const action = { ...bind(`${tag}-claim`), actionRef: planned.actionRef, actionDigest: planned.actionDigest };
    if (prepareOnly) return action;
    const claim = kind === 'repair' ? service().claimRepair(host, { ...action, auditRef: config.auditRef, ...lineage }) : store.claimAction(host, action);
    const reviewer = {}; if (kind === 'review') store.bindExecution(host, reviewer, { taskRef, role: 'reviewer', generationRef, sessionRef: ref(`${tag}-session`), readRecordRefs: initialMaterial.map(m => m.recordRef) });
    return { ...claim, reviewer, generationRef, config, tag };
  }
  function reportInput(claim, more = {}) { return { taskRef, commandRef: ref(`${claim.tag}-report`), auditRef: claim.config.auditRef, artifactVersion: art.version, digest: art.digest, materialDigest: claim.config.materialDigest, claimRef: claim.claimRef, generationRef: claim.generationRef, coverageRefs: initialMaterial.map(m => m.recordRef), unexaminedRefs: [], verdict: 'passed', findings: [], evidenceRef: ref(`${claim.tag}-evidence`), ...more }; }
  function release(claim, tag = `${claim.tag}-release`) { return store.settleAction(host, { taskRef, commandRef: ref(tag), claimRef: claim.claimRef, generationRef: claim.generationRef, outcome: 'completed', evidenceRef: ref(`${tag}-evidence`) }); }
  const complete = tag => store.revise(owner, { ...bind(tag), status: 'completed', reason: 'progress' });
  return { get store() { return store; }, owner, host, other, taskRef, databasePath, bind, task, service, configure, admit, reportInput, release, complete, get artifact() { return art; }, set artifact(value) { art = value; }, initialMaterial, reopen() { store.close(); store = new RuntimeStore(options); } };
}

const blockedCompletion = fn => assert.throws(fn, error => typeof error.code === 'string' && /^AUDIT_/.test(error.code));

test('actual required pending gate cannot be bypassed by direct core completion, flags or another owner', t => {
  const x = runtimeFixture(t), configured = x.configure();
  assert.equal(configured.auditRevision, 1); assert.equal(configured.round, 0);
  blockedCompletion(() => x.complete('complete-pending'));
  assert.throws(() => x.service().read(x.other, x.taskRef, configured.auditRef), error => error.code === 'RECORD_NOT_FOUND');
  assert.equal(x.task().status, 'queued');
});
test('exact independent admitted charged review passes only after explicit known executor release', t => {
  const x = runtimeFixture(t), configured = x.configure(), claim = x.admit(configured);
  const result = x.service().report(claim.reviewer, x.reportInput(claim));
  assert.ok(result); assert.equal(x.task().status, 'running');
  assert.throws(() => x.complete('complete-held'), error => error.code === 'RESERVATION_HELD');
  assert.equal(x.release(claim).reservationHeld, false);
  assert.equal(x.complete('complete-reviewed').task.status, 'completed');
  const actions = x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions;
  assert.equal(actions.length, 1); assert.equal(actions[0].attempts, 1); assert.equal(actions[0].spec.role, 'review');
});
test('reviewer unknown, failed, budget and explicit unexamined material remain required after release and reopen', async t => {
  for (const verdict of ['unknown', 'failed', 'budget_exhausted', 'unexamined']) await t.test(verdict, sub => {
    const x = runtimeFixture(sub), configured = x.configure(), claim = x.admit(configured), more = verdict === 'unexamined' ? { coverageRefs: [], unexaminedRefs: x.initialMaterial.map(m => m.recordRef) } : { verdict };
    x.service().report(claim.reviewer, x.reportInput(claim, more)); x.release(claim);
    blockedCompletion(() => x.complete('complete-unresolved')); x.reopen(); blockedCompletion(() => x.complete('complete-after-reopen'));
    assert.notEqual(x.task().status, 'completed');
  });
});
test('fatal resolved flag and owner-configured warning threshold cannot be report shortcuts to completion', async t => {
  for (const severity of ['fatal', 'warning']) await t.test(severity, sub => {
    const x = runtimeFixture(sub), configured = x.configure('configure', { blockingSeverities: severity === 'warning' ? ['warning'] : [] }), claim = x.admit(configured);
    x.service().report(claim.reviewer, x.reportInput(claim, { findings: [finding({ severity, resolved: severity === 'fatal' })] })); x.release(claim);
    blockedCompletion(() => x.complete('complete-findings'));
  });
});
test('same-round contradictory report conflicts retain original failed report and exact duplicate receipt', t => {
  const x = runtimeFixture(t), configured = x.configure(), claim = x.admit(configured), input = x.reportInput(claim, { verdict: 'failed' });
  const first = x.service().report(claim.reviewer, input);
  assert.deepEqual(x.service().report(claim.reviewer, input), first);
  const before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.throws(() => x.service().report(claim.reviewer, { ...input, verdict: 'passed' }), error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.throws(() => x.service().report(claim.reviewer, { ...input, commandRef: ref('contradictory-new-command'), verdict: 'passed' }), error => error.code === 'AUDIT_REPORT_CONFLICT');
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  x.release(claim); blockedCompletion(() => x.complete('complete-conflict'));
});
test('artifact or later semantic goal revision invalidates prior exact report without erasing its history', async t => {
  for (const kind of ['artifact', 'goal', 'constraints', 'clarification', 'branch', 'context']) await t.test(kind, sub => {
    const x = runtimeFixture(sub), configured = x.configure(), claim = x.admit(configured), reportRef = x.reportInput(claim).commandRef;
    x.service().report(claim.reviewer, x.reportInput(claim)); x.release(claim);
    if (kind === 'artifact') x.store.writeArtifact(x.owner, { ...x.bind('artifact-change'), artifactRef: x.artifact.artifactRef, version: 2, content: 'Changed after review' });
    else if (['goal', 'constraints'].includes(kind)) x.store.revise(x.owner, { ...x.bind(`${kind}-change`), [kind]: 'Changed requirements after review', reason: 'operator' });
    else x.store.putData(x.owner, { ...x.bind(`${kind}-change`), kind, sourceRef: ref('changed-source'), content: 'Changed contextual requirements after review' });
    blockedCompletion(() => x.complete('complete-stale'));
    assert.ok(JSON.stringify(x.service().read(x.owner, x.taskRef, configured.auditRef)).includes(reportRef));
    x.reopen(); blockedCompletion(() => x.complete('complete-stale-reopen'));
  });
});
test('wrong material, wrong claim/generation and malicious authority fields leave authoritative state unchanged', t => {
  const x = runtimeFixture(t), configured = x.configure(), claim = x.admit(configured), input = x.reportInput(claim), before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  for (const more of [{ digest: ref('wrong-bytes') }, { materialDigest: ref('wrong-material') }, { claimRef: ref('wrong-claim') }, { generationRef: ref('wrong-generation') }, { coverageRefs: [ref('unrelated')] }]) {
    assert.throws(() => x.service().report(claim.reviewer, { ...input, ...more }));
    assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  }
  rejects(() => x.service().report(claim.reviewer, { ...input, approved: true }));
  assert.throws(() => x.store.grantAction(claim.reviewer, { ...x.bind('reviewer-grant'), actionRef: ref('unrelated'), actionDigest: ref('unrelated'), expiresAt: 2000 }), error => error.code === 'UNAUTHORIZED');
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  assert.equal(readFileSync(x.databasePath).includes(Buffer.from('Synthetic immutable task result')), false);
});

test('bounded admitted repair retains failed history and requires a fresh exact review of changed bytes', t => {
  const x = runtimeFixture(t), configured = x.configure('configure', { maxRepairRounds: 1 }), first = x.admit(configured, 'first-review');
  const failed = x.reportInput(first, { verdict: 'failed', findings: [finding()] }); x.service().report(first.reviewer, failed); x.release(first);
  const repairClaim = x.admit(configured, 'repair-one', 'repair', ref('repair-one-generation'), { round: 1, previousReportRef: failed.commandRef, evidenceRef: ref('repair-lineage-evidence') });
  x.service().repair(x.owner, { ...x.bind('repair-lineage'), auditRef: configured.auditRef, claimRef: repairClaim.claimRef, generationRef: repairClaim.generationRef, round: 1, previousReportRef: failed.commandRef, evidenceRef: ref('repair-lineage-evidence') });
  const repaired = x.store.writeArtifact(x.owner, { ...x.bind('repaired-artifact'), artifactRef: x.artifact.artifactRef, version: 2, content: 'Repaired synthetic exact bytes', producerClaimRef: repairClaim.claimRef, generationRef: repairClaim.generationRef });
  x.artifact = repaired; x.initialMaterial.splice(0, x.initialMaterial.length, { recordRef: repaired.recordRef, digest: repaired.digest });
  const rebound = x.configure('rebind-after-repair', { expectedAuditRevision: 1, artifactVersion: repaired.version, digest: repaired.digest, material: x.initialMaterial, maxRepairRounds: 1 });
  assert.equal(rebound.auditRevision, 2); assert.equal(rebound.round, 1); assert.notEqual(rebound.bindingDigest, configured.bindingDigest);
  x.release(repairClaim);
  const fresh = x.admit(rebound, 'fresh-review'); x.service().report(fresh.reviewer, x.reportInput(fresh)); x.release(fresh);
  assert.ok(JSON.stringify(x.service().read(x.owner, x.taskRef, rebound.auditRef)).includes(failed.commandRef));
  assert.equal(x.complete('complete-repaired').task.status, 'completed');
  const actions = x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions; assert.deepEqual(actions.map(a => a.spec.role).sort(), ['repair', 'review', 'review']);
});
test('repair admission exhausts the same total attempts and leaves failed audit blocked without a free retry', t => {
  const x = runtimeFixture(t, { limits: { maxTotalAttempts: 1 } }), configured = x.configure(), first = x.admit(configured, 'only-review');
  x.service().report(first.reviewer, x.reportInput(first, { verdict: 'failed' })); x.release(first);
  assert.throws(() => x.admit(configured, 'budget-repair', 'repair', ref('budget-repair-generation'), { round: 1, previousReportRef: ref('only-review-report'), evidenceRef: ref('budget-repair-evidence') }), error => error.code === 'ATTEMPT_LIMIT');
  blockedCompletion(() => x.complete('complete-budget')); x.reopen(); blockedCompletion(() => x.complete('complete-budget-reopen'));
  assert.equal(x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions.reduce((sum, a) => sum + a.attempts, 0), 1);
});

test('producer generation reuse cannot self-review under a newly bound reviewer role', t => {
  const x = runtimeFixture(t), generationRef = ref('producer-generation'), producer = {};
  x.store.bindExecution(x.host, producer, { taskRef: x.taskRef, role: 'worker', generationRef, sessionRef: ref('producer-session') });
  const spec = { actionRef: ref('producer-action'), kind: 'write', role: 'worker', targetDigest: ref('produce-artifact-target'), dataDigest: x.artifact.digest, units: 1, charges: { runtimeMs: 1, usageUnits: 1, costEstimateMicros: 0 }, attemptGroupRef: ref('producer-attempt'), attemptIndex: 1, resourcePolicyVersion: 2, modelPolicyVersion: 1, model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') }, executor: { mode: 'none', generationRef, environmentRef: ref('producer-environment'), bindingDigest: ref('producer-binding'), toolsDigest: ref('tools'), permissionPolicyDigest: ref('permissions') } };
  const planned = x.store.planAction(x.owner, { ...x.bind('producer-plan'), spec }); x.store.grantAction(x.owner, { ...x.bind('producer-grant'), actionRef: planned.actionRef, actionDigest: planned.actionDigest, expiresAt: 2000 });
  const producedClaim = x.store.claimAction(x.host, { ...x.bind('producer-claim'), actionRef: planned.actionRef, actionDigest: planned.actionDigest });
  const produced = x.store.writeArtifact(producer, { ...x.bind('producer-write'), artifactRef: x.artifact.artifactRef, version: 2, content: 'Worker produced immutable synthetic bytes', producerClaimRef: producedClaim.claimRef, generationRef });
  x.artifact = produced; x.initialMaterial.splice(0, x.initialMaterial.length, { recordRef: produced.recordRef, digest: produced.digest }); x.release({ ...producedClaim, generationRef, tag: 'producer' });
  const configured = x.configure(), self = x.admit(configured, 'self-review', 'review', generationRef), before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.throws(() => x.service().report(self.reviewer, x.reportInput(self)), error => error.code === 'UNAUTHORIZED');
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
});
test('held review of another target and unbound material are not admitted evidence for the configured audit', t => {
  const x = runtimeFixture(t), configured = x.configure(), wrong = x.admit({ ...configured, bindingDigest: ref('wrong-review-target') }, 'wrong-target'), before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.throws(() => x.service().report(wrong.reviewer, x.reportInput(wrong))); assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  x.release(wrong);
  const correct = x.admit(configured, 'correct-target'), unbound = {};
  x.store.bindExecution(x.host, unbound, { taskRef: x.taskRef, role: 'reviewer', generationRef: correct.generationRef, sessionRef: ref('unbound-review-session'), readRecordRefs: [] });
  const unchanged = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.throws(() => x.store.readData(unbound, { taskRef: x.taskRef, recordRef: x.artifact.recordRef }), error => error.code === 'UNAUTHORIZED');
  assert.throws(() => x.service().report(unbound, x.reportInput(correct)), error => error.code === 'UNAUTHORIZED');
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), unchanged);
});
test('late review after cancellation never completes task or drops the existing accountable claim', t => {
  const x = runtimeFixture(t), configured = x.configure(), claim = x.admit(configured);
  x.store.control(x.owner, { ...x.bind('cancel-during-review'), kind: 'cancel' });
  assert.throws(() => x.service().report(claim.reviewer, x.reportInput(claim)), error => error.code === 'UNAUTHORIZED');
  assert.equal(x.task().status, 'cancel_requested');
  assert.throws(() => x.complete('complete-after-cancel'), error => error.code === 'TASK_BLOCKED');
  const action = x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions.find(a => a.claimRef === claim.claimRef); assert.equal(action.releaseEvidenceRef, null);
  x.reopen(); assert.equal(x.task().status, 'cancel_requested');
  assert.ok(x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions.find(a => a.claimRef === claim.claimRef).reservationRef);
});

test('configured zero repair bound rejects the atomic repair claim without dispatch or free attempt', t => {
  const x = runtimeFixture(t), configured = x.configure('configure', { maxRepairRounds: 0 }), first = x.admit(configured, 'no-repair-review');
  const failed = x.reportInput(first, { verdict: 'failed' }); x.service().report(first.reviewer, failed); x.release(first);
  assert.throws(() => x.admit(configured, 'forbidden-repair', 'repair', ref('forbidden-repair-generation'), { round: 1, previousReportRef: failed.commandRef, evidenceRef: ref('forbidden-repair-evidence') }), error => error.code === 'AUDIT_REPAIR_LIMIT');
  const action = x.store.snapshot(x.owner, { taskRef: x.taskRef }).actions.find(a => a.actionRef === ref('forbidden-repair-action'));
  assert.equal(action.attempts, 0); assert.equal(action.claimRef, undefined); blockedCompletion(() => x.complete('complete-no-repair'));
});

test('review material contains only individually allowed required bytes and coverage cannot omit an input', t => {
  const x = runtimeFixture(t), goal = x.store.putData(x.owner, { ...x.bind('audit-goal'), kind: 'goal', content: 'Required synthetic goal', sourceRef: ref('goal-source') });
  x.initialMaterial.push({ recordRef: goal.recordRef, digest: goal.digest });
  const unrelated = x.store.putData(x.owner, { ...x.bind('unrelated-private-material'), kind: 'message', content: 'Synthetic unrelated task message', sourceRef: ref('unrelated-source') });
  const configured = x.configure(), claim = x.admit(configured), before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.equal(x.store.readData(claim.reviewer, { taskRef: x.taskRef, recordRef: goal.recordRef }).content, 'Required synthetic goal');
  assert.throws(() => x.store.readData(claim.reviewer, { taskRef: x.taskRef, recordRef: unrelated.recordRef }), error => error.code === 'UNAUTHORIZED');
  assert.throws(() => x.service().report(claim.reviewer, x.reportInput(claim, { coverageRefs: [x.artifact.recordRef], unexaminedRefs: [] })));
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  x.service().report(claim.reviewer, x.reportInput(claim, { coverageRefs: [x.artifact.recordRef], unexaminedRefs: [goal.recordRef] })); x.release(claim);
  blockedCompletion(() => x.complete('complete-missing-goal-check'));
  assert.equal(readFileSync(x.databasePath).includes(Buffer.from('Synthetic unrelated task message')), false);
});

test('unknown review may recover through an approved bounded evidence repair without mutating artifact bytes', t => {
  const x = runtimeFixture(t), configured = x.configure(), first = x.admit(configured, 'unknown-review'), old = x.reportInput(first, { verdict: 'unknown' });
  x.service().report(first.reviewer, old); x.release(first);
  const repairClaim = x.admit(configured, 'evidence-repair', 'repair', ref('evidence-repair-generation'), { round: 1, previousReportRef: old.commandRef, evidenceRef: ref('evidence-repair-evidence') });
  const rebound = x.configure('rebind-same-bytes', { expectedAuditRevision: 1 });
  assert.equal(rebound.round, 1); assert.equal(rebound.auditRevision, 2); assert.notEqual(rebound.bindingDigest, configured.bindingDigest);
  x.release(repairClaim);
  const fresh = x.admit(rebound, 'rechecked-review'); x.service().report(fresh.reviewer, x.reportInput(fresh)); x.release(fresh);
  assert.equal(x.artifact.version, 1); assert.equal(x.complete('complete-rechecked').task.status, 'completed');
  assert.ok(JSON.stringify(x.service().read(x.owner, x.taskRef, rebound.auditRef)).includes(old.commandRef));
});
test('owner semantic rebind after prior pass keeps history and requires fresh full-target review of same artifact', t => {
  const x = runtimeFixture(t), configured = x.configure(), first = x.admit(configured, 'old-semantic-review'), old = x.reportInput(first);
  x.service().report(first.reviewer, old); x.release(first);
  const changed = x.store.putData(x.owner, { ...x.bind('new-context'), kind: 'context', content: 'New approved requirements for same artifact', sourceRef: ref('new-context-source') });
  x.initialMaterial.push({ recordRef: changed.recordRef, digest: changed.digest }); blockedCompletion(() => x.complete('complete-before-rebind'));
  const rebound = x.configure('rebind-semantic', { expectedAuditRevision: 1, material: x.initialMaterial });
  assert.equal(rebound.round, 0); assert.equal(rebound.auditRevision, 2); assert.notEqual(rebound.bindingDigest, configured.bindingDigest);
  blockedCompletion(() => x.complete('complete-rebind-without-review'));
  const fresh = x.admit(rebound, 'new-semantic-review'); x.service().report(fresh.reviewer, x.reportInput(fresh)); x.release(fresh);
  assert.equal(x.complete('complete-new-semantics').task.status, 'completed');
  assert.ok(JSON.stringify(x.service().read(x.owner, x.taskRef, rebound.auditRef)).includes(old.commandRef));
});

test('direct core repair claim cannot bypass atomic audit lineage even with an exact owner grant', t => {
  const x = runtimeFixture(t), configured = x.configure(), first = x.admit(configured, 'review-before-unlinked-repair');
  x.service().report(first.reviewer, x.reportInput(first, { verdict: 'failed' })); x.release(first);
  const action = x.admit(configured, 'unlinked-repair', 'repair', ref('unlinked-repair-generation'), null, true);
  const before = x.store.snapshot(x.owner, { taskRef: x.taskRef });
  assert.throws(() => x.store.claimAction(x.host, action), error => error.code === 'AUDIT_BINDING_MISMATCH');
  assert.deepEqual(x.store.snapshot(x.owner, { taskRef: x.taskRef }), before);
  const pending = before.actions.find(item => item.actionRef === action.actionRef); assert.equal(pending.attempts, 0); assert.equal(pending.claimRef, undefined);
});
