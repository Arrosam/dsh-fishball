// SOURCE HOLD: PDI-01..11 from the sealed independent design. NOT RUN.
// The public advanced producer setup is synthetic. Its claim stays held.
// Typed source/role labels below establish no normal/native provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { reference, canonicalDigest } from '../src/runtime-security.mjs';
import { RuntimeStore } from '../core6/runtime-store.mjs';

const FIXTURE_ROOT = resolve(process.cwd(), '.runtime/ni3-native-plan-digest-amendment/test/independent-fixtures');
const NOW = 1800000000000;
const clone = value => structuredClone(value);
const sortedJSON = value => {
  if (Array.isArray(value)) return '[' + value.map(sortedJSON).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + sortedJSON(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
};
// Independent expected-digest encoding and primitive; no product canonical or
// digest helper is used in an expected-digest assertion. Only PDI-01 calls this,
// after the measured operation and final genuine snapshot have completed.
async function expectedDigest(value) {
  const bytes = new TextEncoder().encode(sortedJSON(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

const CASES = [
  { id: 'PDI-01', title: 'literal genuine scoped result and full current spec', plans: 1, reads: 1, code: null },
  { id: 'PDI-02', title: 'missing exact action with same-content foreign-ref decoy', plans: 1, reads: 1, code: 'AUDIT_RECEIPT_INVALID' },
  { id: 'PDI-03', title: 'current exact action has another valid digest', plans: 1, reads: 1, code: 'AUDIT_RECEIPT_INVALID' },
  { id: 'PDI-04', title: 'current exact action has another valid full spec', plans: 1, reads: 1, code: 'AUDIT_RECEIPT_INVALID' },
  { id: 'PDI-05', title: 'plan return projection has another valid action ref', plans: 1, reads: 1, code: 'AUDIT_RECEIPT_INVALID' },
  { id: 'PDI-06', title: 'plan return projection omits action digest', plans: 1, reads: 0, code: 'INVALID_INPUT' },
  { id: 'PDI-07', title: 'new snapshot projection has a foreign owner', plans: 1, reads: 1, code: 'SCOPE_DENIED' },
  { id: 'PDI-08', title: 'new snapshot projection has a foreign task', plans: 1, reads: 1, code: 'SCOPE_DENIED' },
  { id: 'PDI-09', title: 'currentness denial after measured facts before plan', plans: 0, reads: 0, code: 'REQUEST_ABORTED' },
  { id: 'PDI-10', title: 'currentness denial after actual commit before new read', plans: 1, reads: 0, code: 'REQUEST_ABORTED' },
  { id: 'PDI-11', title: 'currentness denial inside genuine new snapshot callback', plans: 1, reads: 1, code: 'REQUEST_ABORTED' }
];

function makeFixture(t, leaf) {
  mkdirSync(FIXTURE_ROOT, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(FIXTURE_ROOT, leaf.id.toLowerCase() + '-'));
  const raw = name => 'pdi.' + leaf.id.toLowerCase() + '.' + name;
  const r = name => reference(raw(name));
  const ownerId = raw('owner'), workspaceId = raw('workspace'), taskId = raw('task');
  const scope = { ownerRef: reference(ownerId), workspaceRef: reference(workspaceId), taskRef: reference(taskId) };
  const producerActionRef = r('producer-action'), generationRef = r('producer-generation');
  const owner = Object.freeze({}), host = Object.freeze({}), worker = Object.freeze({});
  const setupCounts = { policy: 0, intake: 0, producerPlans: 0, producerGrants: 0, producerClaims: 0, artifacts: 0, contexts: 0, auditConfigurations: 0, auditPreparations: 0 };
  const counts = {
    measuredOperations: 0, measuredPlans: 0, snapshotCallbacks: 0, addedSnapshotCallbacks: 0,
    directSnapshots: 0, permissions: 0, subscriptions: 0, unsubscriptions: 0,
    preview: 0, auditGrant: 0, nativeRequest: 0, compose: 0,
    provider: 0, model: 0, tool: 0, auditClaim: 0,
    settlement: 0, release: 0, control: 0, revoke: 0, recovery: 0, child: 0, network: 0
  };
  const permissionRecords = [];
  const store = new RuntimeStore({
    databasePath: join(directory, 'synthetic.sqlite'),
    encryptionKey: Buffer.alloc(32, 37),
    principals: [
      { handle: owner, role: 'owner', scope: { ownerId, workspaceId } },
      { handle: host, role: 'host', scope: { ownerId, workspaceId } },
      { handle: worker, role: 'worker', scope: { ownerId, workspaceId }, taskRef: scope.taskRef, generationRef }
    ],
    clock: () => NOW,
    auditExecutionBounds: { inputByteLimit: 16384, resultByteLimit: 1024 },
    hostPermission(record) {
      counts.permissions += 1;
      permissionRecords.push(clone(record));
      // Advanced fixture permission is exact and deny by default. No omitted
      // or foreign scope/action/generation/role/executor can match this set.
      return record !== null && typeof record === 'object'
        && record.ownerRef === scope.ownerRef && record.workspaceRef === scope.workspaceRef
        && record.taskRef === scope.taskRef && record.actionRef === producerActionRef
        && record.spec?.actionRef === producerActionRef && record.spec?.role === 'worker'
        && record.spec?.executor?.generationRef === generationRef && record.spec?.executor?.mode === 'none';
    }
  });
  let installed = null;
  t.after(() => {
    try { if (installed) installed.dispose(); }
    finally { try { store.close(); } finally { rmSync(directory, { recursive: true, force: true }); } }
  });
  const directSnapshot = () => {
    counts.directSnapshots += 1;
    return store.snapshot(owner, { taskRef: scope.taskRef });
  };
  const cas = () => {
    const current = store.task(owner, scope.taskRef);
    return { taskRef: scope.taskRef, expectedTaskVersion: current.version, expectedAuthEpoch: current.authEpoch };
  };
  const command = name => r('command-' + name);
  const model = { presetRef: r('typed-preset'), modelRef: r('typed-model'), reasoningRef: r('typed-reasoning'), catalogEvidenceRef: r('typed-catalog') };
  const environment = { environmentRef: r('typed-environment'), bindingDigest: r('typed-binding'), toolsDigest: r('typed-tools'), permissionPolicyDigest: r('typed-permission-policy') };
  const initialPolicy = store.getPolicy(owner);
  setupCounts.policy += 1;
  const policy = store.policy(owner, {
    commandRef: command('policy'), expectedVersion: initialPolicy.version,
    limits: { queueCapacity: 2, maxActive: 1, maxAttempts: 1, maxTotalAttempts: 2, maxRuntimeMs: 60000, maxUsageUnits: 1000000, maxCostEstimateMicros: 1000 },
    modelPolicy: { version: 1, presetRefs: [model.presetRef], catalogEvidenceRef: model.catalogEvidenceRef }
  });
  setupCounts.intake += 1;
  const intake = store.intake(owner, { taskId, provider: raw('synthetic-provider'), source: raw('synthetic-source'), eventId: raw('synthetic-event'), commandRef: command('intake') });
  const producerSpec = {
    actionRef: producerActionRef, kind: 'write', role: 'worker', targetDigest: r('producer-target'), dataDigest: r('producer-data'), units: 1,
    charges: { runtimeMs: 100, usageUnits: 2048, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: r('typed-cost') },
    attemptGroupRef: r('producer-attempt'), attemptIndex: 1, resourcePolicyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
    model, executor: { mode: 'none', generationRef, ...environment }
  };
  setupCounts.producerPlans += 1;
  const producerPlan = store.planAction(owner, { ...cas(), commandRef: command('producer-plan'), spec: producerSpec });
  setupCounts.producerGrants += 1;
  const producerGrant = store.grantAction(owner, { ...cas(), commandRef: command('producer-grant'), actionRef: producerActionRef, actionDigest: producerPlan.actionDigest, expiresAt: NOW + 60000 });
  setupCounts.producerClaims += 1;
  const producerClaim = store.claimAction(owner, { ...cas(), commandRef: command('producer-advanced-claim'), actionRef: producerActionRef, actionDigest: producerPlan.actionDigest });
  setupCounts.artifacts += 1;
  const artifact = store.writeArtifact(worker, {
    ...cas(), commandRef: command('producer-artifact'), artifactRef: r('artifact'), version: 1,
    content: 'Synthetic advanced producer artifact for ' + leaf.id + '.',
    producerClaimRef: producerClaim.claimRef, generationRef: producerClaim.generationRef
  });
  const artifactData = store.readData(owner, { taskRef: scope.taskRef, recordRef: artifact.recordRef });
  const contextSource = directSnapshot();
  const contextText = 'Independent synthetic public context for ' + leaf.id + '.';
  const contextBody = {
    contractVersion: 'df.execution-context/v1', materialKind: 'execution_context', sourceScope: scope,
    sourceTaskVersion: contextSource.task.version, sourceAuthEpoch: contextSource.task.authEpoch, generatedAt: NOW,
    sourceRefs: [artifact.recordRef],
    sourceProvenance: [{ recordRef: artifactData.recordRef, digest: artifactData.digest, taskVersion: artifactData.taskVersion, authEpoch: artifactData.authEpoch, createdAt: artifactData.createdAt }],
    memory: { namespaceRef: r('typed-empty-memory'), revision: 0, provenance: [] },
    // Product canonicalDigest is used only to construct ordinary setup data.
    ledgerSnapshotDigest: canonicalDigest(contextSource), content: contextText,
    inputCounts: { bytes: Buffer.byteLength(contextText), tokens: 0 }, retainedRefs: [artifact.recordRef], droppedRefs: [],
    verification: 'module_prepared_execution_context_only'
  };
  setupCounts.contexts += 1;
  const context = store.putData(owner, {
    taskRef: scope.taskRef, expectedTaskVersion: contextSource.task.version, expectedAuthEpoch: contextSource.task.authEpoch,
    commandRef: command('context'), kind: 'context', content: JSON.stringify(contextBody), sourceRef: r('typed-context-origin')
  });
  const contextData = store.readData(owner, { taskRef: scope.taskRef, recordRef: context.recordRef });
  const auditRef = r('audit');
  setupCounts.auditConfigurations += 1;
  const audit = store.configureAudit(owner, {
    ...cas(), commandRef: command('configure-audit'), auditRef, expectedAuditRevision: 0,
    artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest,
    contextRecordRef: context.recordRef,
    material: [{ recordRef: artifact.recordRef, digest: artifact.digest }, { recordRef: context.recordRef, digest: context.digest }],
    policyRef: r('typed-audit-policy'), blockingSeverities: ['blocking', 'fatal'], maxRepairRounds: 0
  });
  setupCounts.auditPreparations += 1;
  const prepared = store.prepareAuditInput(owner, {
    ...cas(), commandRef: command('prepare-audit-input'), auditRef, expectedAuditRevision: audit.auditRevision, purpose: 'audit_review', round: audit.round
  });
  const before = directSnapshot();
  const selected = { provider: 'synthetic', model: 'synthetic-model', agentPreset: 'synthetic-review', reasoningEffort: null, maxOutputTokens: 128 };
  const workerChoice = {
    enabled: true, selection: selected, environment: { root: directory, cwd: directory },
    persistence: { directory: join(directory, 'df-sessions'), compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 512, resultBytes: 1024 },
    policy: { maxRuntimeMs: 60000, maxUsageUnits: 1000000, maxCostEstimateMicros: 1000 },
    charges: { runtimeMs: 100, usageUnits: 2048 }, previewTtlMs: 1000, grantTtlMs: 1000
  };
  const contribution = createInstalledAudit({
    selection: {
      enabled: true, inputByteLimit: 16384, resultByteLimit: 1024, maxPrivateReviewers: 1,
      blockingSeverities: ['blocking', 'fatal'], maxRepairRounds: 0, maxTotalAttempts: 2,
      review: { selection: selected, charges: { runtimeMs: 100, usageUnits: 2048 } }
    },
    identity: { ownerId, workspaceId }, profile: { dir: directory, name: 'synthetic-pdi-profile' }, worker: workerChoice
  });
  const ctx = Object.freeze({});
  let measuring = false, committed = false, current = true;
  let capturedInput = null, prePlanTask = null, originalResult = null, returnedProjection = null, seenProjection = null;
  let subscribed = null;
  const never = name => () => { counts[name] += 1; assert.fail('Unexpected callback: ' + name); };
  const api = {
    ctx,
    snapshotOwner(input) {
      counts.snapshotCallbacks += 1;
      const genuine = store.snapshot(owner, input);
      if (!committed) return genuine;
      counts.addedSnapshotCallbacks += 1;
      if (leaf.id === 'PDI-11') current = false;
      let projected = genuine;
      if (['PDI-02', 'PDI-03', 'PDI-04', 'PDI-07', 'PDI-08'].includes(leaf.id)) {
        projected = clone(genuine);
        const actual = projected.actions.find(action => action.actionRef === originalResult.actionRef);
        assert.ok(actual);
        if (leaf.id === 'PDI-02') actual.actionRef = r('typed-decoy-action');
        if (leaf.id === 'PDI-03') actual.actionDigest = r('typed-different-digest');
        if (leaf.id === 'PDI-04') actual.spec.charges.runtimeMs += 1;
        if (leaf.id === 'PDI-07') projected.task.ownerRef = r('typed-foreign-owner');
        if (leaf.id === 'PDI-08') projected.task.taskRef = r('typed-foreign-task');
      }
      seenProjection = projected;
      return projected;
    },
    readOwnerData: input => store.readData(owner, input),
    currentPolicy: () => store.getPolicy(owner),
    planOwnerAction(input) {
      assert.equal(measuring, true);
      counts.measuredPlans += 1;
      capturedInput = clone(input);
      prePlanTask = store.task(owner, scope.taskRef);
      originalResult = store.planAction(owner, input);
      // Every deliberate projection fault is armed only after original commit.
      committed = true;
      if (leaf.id === 'PDI-10') current = false;
      returnedProjection = originalResult;
      if (leaf.id === 'PDI-05') returnedProjection = { ...originalResult, actionRef: r('typed-different-return-action') };
      if (leaf.id === 'PDI-06') { returnedProjection = { ...originalResult }; delete returnedProjection.actionDigest; }
      return returnedProjection;
    },
    prepareOwnerPreview: never('preview'),
    grantOwnerPreview: never('auditGrant'),
    readProtectedContextFacts(input) {
      assert.deepEqual(input, { taskRef: scope.taskRef, contextRecordRef: context.recordRef });
      const task = store.task(owner, scope.taskRef);
      // This typed projection uses literal original public context metadata.
      return {
        recordRef: contextData.recordRef, digest: contextData.digest, kind: contextData.kind, byteLength: contextData.byteLength,
        cryptoVersion: contextData.cryptoVersion, originSourceRef: contextData.sourceRef,
        sourceTaskVersion: contextData.sourceTaskVersion, sourceAuthEpoch: contextData.sourceAuthEpoch,
        memory: { namespaceRef: contextBody.memory.namespaceRef, revision: contextBody.memory.revision },
        taskRef: scope.taskRef, taskVersion: task.version, authEpoch: task.authEpoch, semanticRevision: contextData.semanticRevision,
        configurationRef: r('typed-context-config'), nativeSourceRef: r('typed-context-source')
      };
    },
    readCapturedProducerFacts(input) {
      assert.deepEqual(input, { taskRef: scope.taskRef, artifactRef: artifact.artifactRef, artifactVersion: artifact.version, digest: artifact.digest });
      // Association fields come from the genuine artifact/claim; host labels
      // and cursor below are explicit typed doubles, not native capture.
      return {
        taskRef: scope.taskRef, artifactRef: artifact.artifactRef, artifactVersion: artifact.version,
        recordRef: artifact.recordRef, digest: artifact.digest, producerClaimRef: artifact.producerClaimRef, generationRef: artifact.generationRef,
        sessionRef: r('typed-producer-session'), executionRef: r('typed-producer-execution'), inputDigest: r('typed-producer-input'),
        cursor: 1, resultDigest: artifact.digest, configurationRef: r('typed-producer-config'), nativeSourceRef: r('typed-producer-source')
      };
    },
    readAuditActionFacts(input) {
      assert.deepEqual(input, { taskRef: scope.taskRef, purpose: 'review' });
      if (measuring && leaf.id === 'PDI-09') current = false;
      return {
        configurationRef: r('typed-audit-config'), nativeSourceRef: r('typed-audit-source'),
        resourcePolicyVersion: policy.version, modelPolicyVersion: policy.modelPolicy.version,
        ...model, ...environment, effectiveReasoningEffort: null,
        accounting: 'synthetic advanced fixture', pricing: 'source_zero', costProvenanceRef: r('typed-cost')
      };
    },
    readAuditInput: input => store.readAuditInput(host, input),
    configureOwnerAudit: input => store.configureAudit(owner, input),
    prepareOwnerAuditInput: input => store.prepareAuditInput(owner, input),
    assertNativeRequestCurrent: never('nativeRequest'),
    composeNativeAudit: never('compose'),
    subscribeRuntimeReceipts(callback) {
      assert.equal(typeof callback, 'function');
      assert.equal(subscribed, null);
      counts.subscriptions += 1;
      subscribed = callback;
      return () => { assert.equal(subscribed, callback); subscribed = null; counts.unsubscriptions += 1; };
    },
    isAlive: () => true
    // Optional nativeToolGuard is omitted. No false/denied gate is replaced.
  };
  installed = contribution.installedAuditInstaller(api);
  const guard = {
    assertCurrent() {
      if (!current) {
        const error = new Error('Synthetic operation currentness denied');
        Object.defineProperty(error, 'code', { value: 'REQUEST_ABORTED', enumerable: true });
        throw error;
      }
      return true;
    }
  };
  const measuredInput = {
    taskRef: scope.taskRef, commandRef: command('measured-audit-plan'), expectedTaskVersion: before.task.version,
    expectedAuthEpoch: before.task.authEpoch, auditRef, inputRecordRef: prepared.recordRef, purpose: 'audit_review'
  };
  return {
    scope, r, store, owner, setupCounts, counts, permissionRecords, intake, policy, producerPlan, producerGrant, producerClaim,
    artifact, context, audit, prepared, before,
    async measure() {
      assert.equal(measuring, false);
      measuring = true;
      counts.measuredOperations += 1;
      let result = null, error = null;
      try { result = await installed.operations.planAuditAction(measuredInput, guard); }
      catch (caught) { error = caught; }
      const after = directSnapshot();
      return { result, error, after, capturedInput, prePlanTask, originalResult, returnedProjection, seenProjection, current };
    },
    dispose() { installed.dispose(); assert.equal(subscribed, null); }
  };
}

for (const leaf of CASES) {
  test(leaf.id + ' ' + leaf.title, { concurrency: false }, async t => {
    const f = makeFixture(t, leaf);
    const observation = await f.measure();
    assert.deepEqual(f.setupCounts, { policy: 1, intake: 1, producerPlans: 1, producerGrants: 1, producerClaims: 1, artifacts: 1, contexts: 1, auditConfigurations: 1, auditPreparations: 1 });
    assert.equal(f.counts.measuredOperations, 1);
    assert.equal(f.counts.measuredPlans, leaf.plans);
    assert.equal(f.counts.addedSnapshotCallbacks, leaf.reads);
    assert.equal(f.counts.snapshotCallbacks, 1 + leaf.reads);
    assert.equal(f.counts.directSnapshots, 3);
    assert.ok(f.counts.permissions >= 1);
    assert.equal(f.permissionRecords.length, f.counts.permissions);
    for (const permission of f.permissionRecords) {
      assert.equal(permission.ownerRef, f.scope.ownerRef);
      assert.equal(permission.workspaceRef, f.scope.workspaceRef);
      assert.equal(permission.taskRef, f.scope.taskRef);
      assert.equal(permission.actionRef, f.producerPlan.actionRef);
      assert.equal(permission.spec.actionRef, f.producerPlan.actionRef);
      assert.equal(permission.spec.role, 'worker');
      assert.equal(permission.spec.executor.generationRef, f.producerClaim.generationRef);
      assert.equal(permission.spec.executor.mode, 'none');
    }
    for (const name of ['preview', 'auditGrant', 'nativeRequest', 'compose', 'provider', 'model', 'tool', 'auditClaim', 'settlement', 'release', 'control', 'revoke', 'recovery', 'child', 'network']) assert.equal(f.counts[name], 0, name);

    const previousProducer = f.before.actions.find(action => action.actionRef === f.producerPlan.actionRef);
    const finalProducer = observation.after.actions.find(action => action.actionRef === f.producerPlan.actionRef);
    assert.ok(previousProducer);
    assert.deepEqual(finalProducer, previousProducer);
    assert.equal(finalProducer.actionDigest, f.producerPlan.actionDigest);
    assert.equal(finalProducer.releaseEvidenceRef, null);
    assert.deepEqual(observation.after.workers, f.before.workers);
    assert.deepEqual(observation.after.artifacts, f.before.artifacts);
    assert.deepEqual(observation.after.audits, f.before.audits);
    assert.equal(f.artifact.producerClaimRef, f.producerClaim.claimRef);
    assert.equal(f.artifact.generationRef, f.producerClaim.generationRef);
    assert.equal(f.producerClaim.generationRef, finalProducer.spec.executor.generationRef);
    // PDI-B01: no permitted snapshot numeric reservation projection exists.
    // Claim association, unchanged action/attempts and no release are asserted;
    // they are not a direct numeric held-reservation observation.

    if (leaf.code === null) {
      assert.equal(observation.error, null);
      assert.deepEqual(observation.result, observation.originalResult);
      assert.equal(observation.returnedProjection, observation.originalResult);
    } else {
      assert.ok(observation.error);
      assert.equal(observation.error.code, leaf.code);
      assert.equal(observation.result, null);
    }
    if (leaf.plans === 0) {
      assert.equal(observation.originalResult, null);
      assert.equal(observation.capturedInput, null);
      assert.deepEqual(observation.after.actions, f.before.actions);
    } else {
      const original = observation.originalResult;
      assert.deepEqual(Object.keys(original).sort(), ['actionDigest', 'actionRef', 'authEpoch', 'taskVersion']);
      const genuineActions = observation.after.actions.filter(action => action.actionRef === original.actionRef);
      assert.equal(genuineActions.length, 1);
      assert.equal(observation.after.actions.length, f.before.actions.length + 1);
      const genuineAction = genuineActions[0];
      assert.equal(genuineAction.actionDigest, original.actionDigest);
      assert.deepEqual(genuineAction.spec, observation.capturedInput.spec);
      assert.equal(genuineAction.plannedTaskVersion, observation.prePlanTask.version);
      assert.equal(genuineAction.plannedAuthEpoch, observation.prePlanTask.authEpoch);
      assert.equal(original.taskVersion, observation.prePlanTask.version);
      assert.equal(original.authEpoch, observation.prePlanTask.authEpoch);
      assert.equal(genuineAction.state, 'requested');
      assert.equal(genuineAction.attempts, 0);
      assert.equal(genuineAction.releaseEvidenceRef, null);
      assert.equal(observation.prePlanTask.version, f.before.task.version);
      assert.equal(observation.prePlanTask.authEpoch, f.before.task.authEpoch);
      if (leaf.id === 'PDI-01') {
        const envelope = { ...f.scope, taskVersion: observation.prePlanTask.version, authEpoch: observation.prePlanTask.authEpoch, spec: observation.capturedInput.spec };
        assert.equal(await expectedDigest(envelope), original.actionDigest);
        assert.notEqual(await expectedDigest(observation.capturedInput.spec), original.actionDigest);
        for (const field of ['ownerRef', 'workspaceRef', 'taskRef']) {
          assert.notEqual(await expectedDigest({ ...envelope, [field]: f.r('counterfactual-' + field) }), original.actionDigest, field);
        }
        assert.ok(observation.seenProjection.actions.some(action => action.actionRef === original.actionRef));
      }
      if (leaf.id === 'PDI-02') {
        assert.equal(observation.seenProjection.actions.some(action => action.actionRef === original.actionRef), false);
        const decoy = observation.seenProjection.actions.find(action => action.actionRef === f.r('typed-decoy-action'));
        assert.equal(decoy.actionDigest, original.actionDigest);
        assert.deepEqual(decoy.spec, genuineAction.spec);
      }
      if (leaf.id === 'PDI-03') {
        const projected = observation.seenProjection.actions.find(action => action.actionRef === original.actionRef);
        assert.match(projected.actionDigest, /^[a-f0-9]{64}$/);
        assert.notEqual(projected.actionDigest, original.actionDigest);
        assert.deepEqual(projected.spec, genuineAction.spec);
      }
      if (leaf.id === 'PDI-04') {
        const projected = observation.seenProjection.actions.find(action => action.actionRef === original.actionRef);
        const oneChange = clone(genuineAction.spec);
        oneChange.charges.runtimeMs += 1;
        assert.deepEqual(projected.spec, oneChange);
        assert.equal(projected.actionDigest, original.actionDigest);
      }
      if (leaf.id === 'PDI-05') {
        assert.deepEqual(observation.returnedProjection, { ...original, actionRef: f.r('typed-different-return-action') });
        assert.match(observation.returnedProjection.actionRef, /^[a-f0-9]{64}$/);
      }
      if (leaf.id === 'PDI-06') {
        assert.equal(Object.hasOwn(observation.returnedProjection, 'actionDigest'), false);
        const omitted = { ...original }; delete omitted.actionDigest;
        assert.deepEqual(observation.returnedProjection, omitted);
        assert.equal(observation.seenProjection, null);
      }
      if (leaf.id === 'PDI-07') assert.equal(observation.seenProjection.task.ownerRef, f.r('typed-foreign-owner'));
      if (leaf.id === 'PDI-08') assert.equal(observation.seenProjection.task.taskRef, f.r('typed-foreign-task'));
    }
    if (['PDI-09', 'PDI-10', 'PDI-11'].includes(leaf.id)) assert.equal(observation.current, false);
    f.dispose();
    assert.equal(f.counts.subscriptions, 1);
    assert.equal(f.counts.unsubscriptions, 1);
  });
}
