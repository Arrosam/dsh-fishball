import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { RuntimeStore } from '../core6/runtime-store.mjs';

// One original-core public planning discriminator. Producer setup is an
// advanced synthetic owner/host fixture with explicit mock permission; it is
// neither normal native grant evidence nor an actual DSH capture. Its held
// reservation remains held. Other installed-source projections below are
// typed doubles, never native source/preset/provider/cost/capture proof.
const hash = value => createHash('sha256').update(value).digest('hex');
const ref = label => hash(`pd01-synthetic:${label}`);
const ordered = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(ordered).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${ordered(value[key])}`).join(',')}}`;
const digest = value => hash(ordered(value));

test('PD01 actual core scoped plan digest reaches normal audit plan', async t => {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'df-pd01-core-plan-'));
  const owner = {}, host = {}, scope = { ownerId: 'pd01-owner', workspaceId: 'pd01-workspace' };
  let sequence = 0, alive = true, installed, producerTaskRef = null;
  const command = () => ref(`command-${++sequence}`);
  const counts = { setupPlan: 0, setupGrant: 0, setupClaim: 0, setupArtifact: 0, setupConfigureAudit: 0, setupPrepareInput: 0,
    auditPlan: 0, auditGrant: 0, auditClaim: 0, compose: 0, preview: 0, request: 0, provider: 0, tool: 0, subscribe: 0, unsubscribe: 0, setupPermission: 0 };
  const store = new RuntimeStore({ databasePath: join(dir, 'ledger.db'), encryptionKey: Buffer.alloc(32, 71), clock: () => 1000,
    auditExecutionBounds: { inputByteLimit: 16384, resultByteLimit: 8192 },
    hostPermission: record => { counts.setupPermission++; return record.ownerRef === hash(scope.ownerId) && record.workspaceRef === hash(scope.workspaceId) && record.taskRef === producerTaskRef && record.actionRef === ref('advanced-producer-action') && record.spec.executor.generationRef === ref('advanced-producer-generation') && record.spec.executor.mode === 'none' && record.spec.role === 'worker'; },
    principals: [{ handle: owner, role: 'owner', scope }, { handle: host, role: 'host', scope }] });
  t.after(() => { alive = false; installed?.dispose(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.policy(owner, { commandRef: command(), expectedVersion: 1,
    limits: { maxActive: 1, maxAttempts: 1, maxTotalAttempts: 4, maxRuntimeMs: 1000, maxUsageUnits: 100000, maxCostEstimateMicros: 0 },
    modelPolicy: { version: 1, presetRefs: [ref('preset')], catalogEvidenceRef: ref('catalog') } });
  const intake = store.intake(owner, { taskId: 'pd01-task', provider: 'synthetic', source: 'synthetic', eventId: 'pd01-event', goal: 'Synthetic public core planning goal', commandRef: command() });
  const taskRef = intake.task.taskRef;
  producerTaskRef = taskRef;
  const cas = () => { const task = store.task(owner, taskRef); return { taskRef, commandRef: command(), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch }; };
  const policy = store.getPolicy(owner), goal = store.listData(owner, { taskRef, kind: 'goal' })[0];
  const producerGeneration = ref('advanced-producer-generation');
  const producerSpec = { actionRef: ref('advanced-producer-action'), kind: 'write', role: 'worker', targetDigest: ref('advanced-producer-target'), dataDigest: goal.digest, units: 1,
    charges: { runtimeMs: 100, usageUnits: 20000, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: ref('advanced-synthetic-cost') },
    attemptGroupRef: ref('advanced-producer-attempt'), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
    model: { presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog') },
    executor: { mode: 'none', generationRef: producerGeneration, environmentRef: ref('environment'), bindingDigest: ref('environment-binding'), toolsDigest: ref('empty-tools'), permissionPolicyDigest: ref('permission') } };
  counts.setupPlan++;
  const producerPlan = store.planAction(owner, { ...cas(), spec: producerSpec });
  counts.setupGrant++;
  store.grantAction(owner, { ...cas(), actionRef: producerPlan.actionRef, actionDigest: producerPlan.actionDigest, expiresAt: 2000 });
  counts.setupClaim++;
  const producerClaim = store.claimAction(host, { ...cas(), actionRef: producerPlan.actionRef, actionDigest: producerPlan.actionDigest });
  counts.setupArtifact++;
  const artifact = store.writeArtifact(owner, { ...cas(), artifactRef: ref('artifact'), version: 1, content: 'Synthetic advanced producer artifact', producerClaimRef: producerClaim.claimRef, generationRef: producerGeneration });
  assert.equal(artifact.producerClaimRef, producerClaim.claimRef);
  const contextTask = store.task(owner, taskRef), goalText = store.readData(owner, { taskRef, recordRef: goal.recordRef }).content;
  const memory = { namespaceRef: ref('empty-memory'), revision: 0, provenance: [] };
  const contextBody = { contractVersion: 'df.execution-context/v1', materialKind: 'execution_context',
    sourceScope: { ownerRef: contextTask.ownerRef, workspaceRef: contextTask.workspaceRef, taskRef }, sourceTaskVersion: contextTask.version, sourceAuthEpoch: contextTask.authEpoch, generatedAt: 1000,
    sourceRefs: [goal.recordRef], sourceProvenance: [{ recordRef: goal.recordRef, digest: goal.digest, taskVersion: goal.taskVersion, authEpoch: goal.authEpoch, createdAt: goal.createdAt }], memory,
    ledgerSnapshotDigest: ref('typed-snapshot'), content: goalText, inputCounts: { bytes: Buffer.byteLength(goalText), tokens: 8 }, retainedRefs: [goal.recordRef], droppedRefs: [], verification: 'module_prepared_execution_context_only' };
  const context = store.putData(owner, { ...cas(), kind: 'context', content: JSON.stringify(contextBody), sourceRef: ref('context-source') });
  counts.setupConfigureAudit++;
  const requirement = store.configureAudit(owner, { ...cas(), auditRef: ref('audit'), expectedAuditRevision: 0, artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest,
    material: [artifact, context].map(({ recordRef, digest }) => ({ recordRef, digest })), contextRecordRef: context.recordRef, policyRef: ref('explicit-synthetic-audit-policy'), blockingSeverities: ['blocking'], maxRepairRounds: 0 });
  counts.setupPrepareInput++;
  const prepared = store.prepareAuditInput(owner, { ...cas(), auditRef: requirement.auditRef, expectedAuditRevision: requirement.auditRevision, purpose: 'audit_review', round: 0 });
  const selection = { provider: 'typed-simulated-model', model: 'typed-simulated-model', agentPreset: 'typed-empty', reasoningEffort: null, maxOutputTokens: 128 };
  const role = { selection, charges: { runtimeMs: 100, usageUnits: 20000 } };
  const audit = { enabled: true, inputByteLimit: 16384, resultByteLimit: 8192, maxPrivateReviewers: 1, blockingSeverities: ['blocking'], maxRepairRounds: 0, maxTotalAttempts: 4, review: role };
  const worker = { enabled: true, selection, charges: role.charges, environment: { root: dir, cwd: dir },
    persistence: { directory: join(dir, 'df-sessions'), compression: 'none', retention: 'owner-managed' }, bounds: { requestBytes: 16384, resultBytes: 8192 },
    policy: { maxRuntimeMs: 1000, maxUsageUnits: 100000, maxCostEstimateMicros: 0 }, previewTtlMs: 60000, grantTtlMs: 60000 };
  const configurationRef = ref('typed-configuration'), nativeSourceRef = ref('typed-native-source');
  const unavailable = name => () => { counts[name]++; throw Error(`Unexpected ${name} effect`); };
  let originalAuditPlan, originalAuditSpec;
  const api = { ctx: {}, isAlive: () => alive,
    // Both callbacks return the literal original public API result, with no
    // result shape wrapping or substituted producer/action/digest metadata.
    snapshotOwner: input => store.snapshot(owner, input),
    planOwnerAction(input) { counts.auditPlan++; originalAuditSpec = input.spec; originalAuditPlan = store.planAction(owner, input); return originalAuditPlan; },
    currentPolicy: () => store.getPolicy(owner), readOwnerData: input => store.readData(owner, input),
    readAuditInput: input => store.readAuditInput(host, input),
    readProtectedContextFacts({ taskRef, contextRecordRef }) {
      const data = store.readData(owner, { taskRef, recordRef: contextRecordRef }), snapshot = store.snapshot(owner, { taskRef });
      return { recordRef: data.recordRef, digest: data.digest, kind: data.kind, byteLength: Buffer.byteLength(data.content), cryptoVersion: data.cryptoVersion, originSourceRef: data.sourceRef,
        sourceTaskVersion: data.sourceTaskVersion, sourceAuthEpoch: data.sourceAuthEpoch, memory: { namespaceRef: memory.namespaceRef, revision: memory.revision },
        taskRef, taskVersion: snapshot.task.version, authEpoch: snapshot.task.authEpoch, semanticRevision: snapshot.semanticRevision, configurationRef, nativeSourceRef };
    },
    readCapturedProducerFacts({ taskRef, artifactRef, artifactVersion }) {
      const current = store.artifact(owner, { taskRef, artifactRef, version: artifactVersion });
      return { taskRef, artifactRef, artifactVersion, recordRef: current.recordRef, digest: current.digest, producerClaimRef: current.producerClaimRef, generationRef: current.generationRef,
        sessionRef: ref('typed-producer-session'), executionRef: ref('typed-producer-execution'), inputDigest: context.digest, cursor: 2, resultDigest: current.digest, configurationRef, nativeSourceRef };
    },
    readAuditActionFacts() { const current = store.getPolicy(owner); return { configurationRef, nativeSourceRef,
      resourcePolicyVersion: current.version, modelPolicyVersion: current.modelPolicy.version, presetRef: ref('preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog'),
      environmentRef: ref('environment'), bindingDigest: ref('environment-binding'), toolsDigest: ref('empty-tools'), permissionPolicyDigest: ref('permission'), effectiveReasoningEffort: null,
      accounting: 'typed-synthetic-only', pricing: 'source_zero', costProvenanceRef: ref('typed-synthetic-cost') }; },
    prepareOwnerPreview: unavailable('preview'), grantOwnerPreview: unavailable('auditGrant'), configureOwnerAudit: unavailable('setupConfigureAudit'), prepareOwnerAuditInput: unavailable('setupPrepareInput'),
    assertNativeRequestCurrent: unavailable('request'), composeNativeAudit: unavailable('compose'),
    subscribeRuntimeReceipts() { counts.subscribe++; return () => counts.unsubscribe++; } };
  installed = createInstalledAudit({ selection: audit, worker, identity: scope, profile: { dir, name: 'pd01-synthetic' } }).installedAuditInstaller(api);
  const before = store.snapshot(owner, { taskRef });
  assert.equal(before.actions.length, 1); assert.equal(before.workers.length, 1);
  const result = await installed.operations.planAuditAction({ ...cas(), auditRef: requirement.auditRef, inputRecordRef: prepared.recordRef, purpose: 'audit_review' }, { assertCurrent: () => true });
  assert.deepEqual(Object.keys(originalAuditPlan).sort(), ['actionRef','actionDigest','taskVersion','authEpoch'].sort());
  assert.deepEqual(result, originalAuditPlan);
  const after = store.snapshot(owner, { taskRef }), planned = after.actions.find(action => action.actionRef === result.actionRef);
  assert.equal(after.actions.length, before.actions.length + 1);
  assert.equal(planned.actionDigest, result.actionDigest);
  assert.deepEqual(planned.spec, originalAuditSpec);
  assert.equal(planned.spec.executionInput.recordRef, prepared.recordRef);
  assert.equal(planned.spec.executionInput.digest, prepared.digest);
  assert.equal(result.actionDigest, digest({ ownerRef: after.task.ownerRef, workspaceRef: after.task.workspaceRef, taskRef,
    taskVersion: planned.plannedTaskVersion, authEpoch: planned.plannedAuthEpoch, spec: planned.spec }));
  assert.notEqual(result.actionDigest, digest(planned.spec));
  assert.equal(planned.spec.role, 'review'); assert.equal(planned.spec.kind, 'review');
  assert.equal(after.workers.length, before.workers.length);
  assert.equal(after.workers[0].claimRef, producerClaim.claimRef);
  assert.deepEqual(after.workers[0], before.workers[0]);
  assert.equal(after.actions.find(action => action.actionRef === producerPlan.actionRef).releaseEvidenceRef, null);
  assert.deepEqual({ setupPlan: counts.setupPlan, setupGrant: counts.setupGrant, setupClaim: counts.setupClaim, setupArtifact: counts.setupArtifact }, { setupPlan: 1, setupGrant: 1, setupClaim: 1, setupArtifact: 1 });
  assert.deepEqual({ auditPlan: counts.auditPlan, auditGrant: counts.auditGrant, auditClaim: counts.auditClaim, compose: counts.compose, preview: counts.preview, request: counts.request, provider: counts.provider, tool: counts.tool },
    { auditPlan: 1, auditGrant: 0, auditClaim: 0, compose: 0, preview: 0, request: 0, provider: 0, tool: 0 });
  assert.equal(counts.setupConfigureAudit, 1); assert.equal(counts.setupPrepareInput, 1);
  assert.ok(counts.setupPermission > 0);
  assert.equal(installed.status().ready, false);
  installed.dispose(); assert.equal(counts.subscribe, 1); assert.equal(counts.unsubscribe, 1);
});
