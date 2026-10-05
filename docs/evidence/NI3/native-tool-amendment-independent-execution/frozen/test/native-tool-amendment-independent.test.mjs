// Independent NTA design 29c97459; typed module evidence only.
// Source-only authored: no Node/import/syntax/test execution authorized yet.
// No database, original host classes, provider, listener or native route.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstalledAudit } from '../src/installed-audit.mjs';
import { runInstalledWorkerInvocation } from '../src/installed-invocation.mjs';

const ISOLATED_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE_TIME = 1700000000000;
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const digest = value => sha(canonical(value));
const copy = value => structuredClone(value);
let fixtureSequence = 0;

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function proxyTraps(counter) {
  return Object.fromEntries(['get', 'getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor', 'apply'].map(key => [key, () => {
    counter.calls++;
    throw new Error('Proxy trap must remain untouched: ' + key);
  }]));
}

// These backing rows are typed callback data, not module private state or a DB.
function fixture(clock, options = {}) {
  const label = 'independent-fixture-' + ++fixtureSequence;
  const ref = part => sha(label + ':' + part);
  const ownerId = label + '-owner', workspaceId = label + '-workspace';
  const scope = { ownerRef: sha(ownerId), workspaceRef: sha(workspaceId), taskRef: ref('task') };
  const purpose = options.purpose ?? 'audit_review';
  const selected = { provider: 'typed-provider', model: 'typed-model', agentPreset: 'typed-audit', reasoningEffort: null, maxOutputTokens: 128 };
  const charges = { runtimeMs: 1000, usageUnits: 8192 };
  const selection = options.disabled ? { enabled: false } : {
    enabled: true, inputByteLimit: 16384, resultByteLimit: 4096,
    maxPrivateReviewers: 1, blockingSeverities: ['blocking'], maxRepairRounds: 1, maxTotalAttempts: 4,
    review: { selection: copy(selected), charges: copy(charges) },
    repair: { selection: copy(selected), charges: copy(charges) },
  };
  const worker = {
    enabled: true, selection: copy(selected), environment: { root: ISOLATED_ROOT, cwd: ISOLATED_ROOT },
    persistence: { directory: join(ISOLATED_ROOT, 'df-sessions-independent-typed'), compression: 'none', retention: 'owner-managed' },
    bounds: { requestBytes: 4096, resultBytes: 4096 },
    policy: { maxRuntimeMs: 2000, maxUsageUnits: 40000, maxCostEstimateMicros: 0 },
    charges: copy(charges), previewTtlMs: 5000, grantTtlMs: 5000,
  };
  const config = { selection, identity: { ownerId, workspaceId }, profile: { dir: ISOLATED_ROOT, name: 'independent-typed' }, worker };
  const factory = createInstalledAudit(config);
  const policy = {
    version: 1,
    modelPolicy: { version: 1, catalogEvidenceRef: ref('catalog'), presetRefs: [ref('review-preset'), ref('repair-preset')] },
    limits: { maxTotalAttempts: 4, maxAttempts: 1, maxActive: 1, maxRuntimeMs: 2000, maxUsageUnits: 40000 },
  };
  const effects = { subscription: 0, composition: 0, configure: 0, prepareInput: 0, plan: 0, preview: 0, grant: 0, sourceCallback: 0, nativeDispatch: 0, execute: 0, collect: 0, capturePhase: 0, finish: 0, nativeDispose: 0, unsubscribe: 0, requestCurrent: 0 };
  const state = {
    ctx: {}, alive: true, carrierCurrent: true, decide: options.decide ?? (() => true), effects,
    scope, purpose, policy, rows: new Map(), decisions: [],
    claimRef: ref('claimed-before-setup'), returnedClaimRef: options.returnedClaimRef ?? ref('claimed-before-setup'),
    dispatchStarted: deferred(), dispatchRelease: deferred(), finishStarted: deferred(), finishRelease: deferred(),
    snap: { task: { ...scope, version: 1, authEpoch: 0 }, semanticRevision: 1, control: 'active', actions: [], artifacts: [], audits: [], data: [], policy },
  };
  const contextRecordRef = ref('prepared-context'), contextOrigin = ref('context-origin');
  const contextBody = {
    contractVersion: 'df.execution-context/v1', materialKind: 'execution_context', sourceScope: scope,
    sourceTaskVersion: 1, sourceAuthEpoch: 0, generatedAt: clock.value,
    sourceRefs: [contextOrigin], sourceProvenance: [{ recordRef: contextOrigin, digest: ref('context-source-digest'), taskVersion: 1, authEpoch: 0, createdAt: clock.value }],
    memory: { namespaceRef: ref('memory'), revision: 0, provenance: [] }, ledgerSnapshotDigest: ref('snapshot'),
    content: 'Unknown; all quality and audit findings remain unexamined in this typed fixture.',
    retainedRefs: [contextOrigin], droppedRefs: [], verification: 'module_prepared_execution_context_only',
  };
  contextBody.inputCounts = { bytes: Buffer.byteLength(contextBody.content), tokens: 16 };
  const contextContent = canonical(contextBody);
  const contextData = {
    recordRef: contextRecordRef, digest: sha(contextContent), kind: 'context', sourceRef: contextOrigin,
    taskVersion: 1, authEpoch: 0, generationRef: null, createdAt: clock.value, byteLength: Buffer.byteLength(contextContent),
    cryptoVersion: 2, sourceTaskVersion: 1, sourceAuthEpoch: 0, semanticRevision: 1, content: contextContent,
  };
  const artifactContent = 'Typed original factual artifact; quality remains unexamined.';
  const artifactData = { recordRef: ref('original-artifact-data'), digest: sha(artifactContent), kind: 'artifact', content: artifactContent };
  state.rows.set(contextRecordRef, contextData); state.rows.set(artifactData.recordRef, artifactData);
  state.snap.data.push({ recordRef: contextRecordRef, digest: contextData.digest }, { recordRef: artifactData.recordRef, digest: artifactData.digest });
  const artifact = { artifactRef: ref('artifact'), version: 1, digest: artifactData.digest, recordRef: artifactData.recordRef, producerClaimRef: ref('producer-claim'), generationRef: ref('producer-generation') };
  state.snap.artifacts.push(artifact);
  const sourceFacts = kind => ({
    configurationRef: ref(kind + '-config'), nativeSourceRef: ref('native-source'), resourcePolicyVersion: 1, modelPolicyVersion: 1,
    presetRef: ref(kind + '-preset'), modelRef: ref('model'), reasoningRef: ref('reasoning'), catalogEvidenceRef: ref('catalog'),
    environmentRef: ref(kind + '-environment'), bindingDigest: ref(kind + '-environment-binding'), toolsDigest: ref(kind + '-tools'), permissionPolicyDigest: ref(kind + '-permission'),
    effectiveReasoningEffort: null, accounting: 'typed-accounting-only', pricing: 'source_zero', costProvenanceRef: ref('typed-price-source'),
  });
  state.facts = { review: sourceFacts('review'), repair: sourceFacts('repair') };
  const protectedFacts = () => ({
    recordRef: contextRecordRef, digest: contextData.digest, kind: 'context', byteLength: contextData.byteLength, cryptoVersion: 2,
    originSourceRef: contextOrigin, sourceTaskVersion: 1, sourceAuthEpoch: 0, memory: { namespaceRef: ref('memory'), revision: 0 },
    taskRef: scope.taskRef, taskVersion: state.snap.task.version, authEpoch: state.snap.task.authEpoch,
    semanticRevision: state.snap.semanticRevision, configurationRef: ref('context-config'), nativeSourceRef: ref('native-source'),
  });
  const producerFacts = () => ({
    taskRef: scope.taskRef, artifactRef: artifact.artifactRef, artifactVersion: artifact.version,
    recordRef: artifact.recordRef, digest: artifact.digest, producerClaimRef: artifact.producerClaimRef, generationRef: artifact.generationRef,
    sessionRef: ref('producer-session'), executionRef: ref('producer-execution'), inputDigest: contextData.digest, cursor: 1,
    resultDigest: artifact.digest, configurationRef: ref('producer-config'), nativeSourceRef: ref('native-source'),
  });
  function makeInput(v) {
    const req = state.snap.audits[0];
    const previousReportRef = v.purpose === 'audit_repair' ? req.reportRef : null;
    const materialRows = req.material.map(m => ({ ...m, kind: state.rows.get(m.recordRef).kind, content: state.rows.get(m.recordRef).content }));
    const body = {
      contractVersion: 'df.audit-input/v1', purpose: v.purpose, ...scope, auditRef: req.auditRef, auditRevision: req.auditRevision,
      round: v.round, semanticRevision: req.semanticRevision,
      artifact: { artifactRef: artifact.artifactRef, version: 1, recordRef: artifact.recordRef, digest: artifact.digest },
      bindingDigest: req.bindingDigest, materialDigest: req.materialDigest,
      policy: { policyRef: req.policyRef, blockingSeverities: req.blockingSeverities, maxRepairRounds: req.maxRepairRounds },
      material: materialRows, contextRecordRef, contextDigest: contextData.digest,
      previousReport: previousReportRef === null ? null : { reportRef: previousReportRef, verdict: 'unknown', allUnexamined: true },
      responseContract: 'df.audit-response/v1',
    };
    const content = canonical(body), inputRecordRef = ref('audit-input-' + v.purpose);
    const association = {
      contractVersion: 'df.audit-input-association/v1', ...scope, auditRef: req.auditRef, auditRevision: req.auditRevision,
      round: v.round, purpose: v.purpose, recordRef: inputRecordRef, digest: sha(content), byteLength: Buffer.byteLength(content),
      bindingDigest: req.bindingDigest, materialDigest: req.materialDigest,
      artifactRef: artifact.artifactRef, artifactVersion: 1, artifactDigest: artifact.digest, semanticRevision: req.semanticRevision,
      sourceTaskVersion: state.snap.task.version, sourceAuthEpoch: state.snap.task.authEpoch,
      contextRecordRef, contextDigest: contextData.digest, previousReportRef, material: copy(req.material),
      inputByteLimit: selection.inputByteLimit, resultByteLimit: selection.resultByteLimit, createdAt: clock.value,
    };
    const data = {
      recordRef: inputRecordRef, digest: association.digest, kind: 'context', sourceRef: req.auditRef,
      taskVersion: association.sourceTaskVersion, authEpoch: association.sourceAuthEpoch, generationRef: null, createdAt: clock.value,
      byteLength: association.byteLength, cryptoVersion: 2, sourceTaskVersion: association.sourceTaskVersion,
      sourceAuthEpoch: association.sourceAuthEpoch, semanticRevision: association.semanticRevision, auditInputRef: inputRecordRef, content,
    };
    state.pair = { association, data }; state.rows.set(inputRecordRef, data);
    state.snap.data.push({ recordRef: inputRecordRef, digest: data.digest });
    return { recordRef: inputRecordRef, digest: data.digest };
  }
  function captureBinding(outer) {
    const a = state.pair.association;
    return {
      ...scope, auditRef: a.auditRef, auditRevision: a.auditRevision, round: a.round, semanticRevision: a.semanticRevision,
      bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, artifactRef: a.artifactRef,
      artifactVersion: a.artifactVersion, artifactDigest: a.artifactDigest, inputRecordRef: a.recordRef, inputDigest: a.digest, purpose: a.purpose,
      actionRef: state.spec.actionRef, actionDigest: digest(state.spec), claimRef: outer.claimRef, generationRef: outer.generationRef,
      sessionRef: state.spec.executor.sessionRef, executionRef: outer.executionRef, outerInput: copy(outer),
    };
  }
  // Literal held capture tag and complete binding/phase input; no new test hook.
  function publishCapture(outer) {
    const b = captureBinding(outer), content = 'Unknown; all findings remain unexamined. Typed capture only.';
    const child = {
      taskRef: outer.taskRef, claimRef: outer.claimRef, generationRef: outer.generationRef, executionRef: outer.executionRef,
      sessionRef: b.sessionRef, inputCursor: 0, cursor: 1, content, evidenceRef: ref('typed-capture-evidence'),
    };
    const { content: omitted, ...rest } = child;
    const phaseInput = { ...rest, contentDigest: sha(content), contentByteLength: Buffer.byteLength(content) };
    child.commandRef = digest(['df.installed-audit.capture/v1', outer.commandRef, { binding: b, phaseInput }]);
    const receipt = {
      ...scope, actionRef: b.actionRef, actionDigest: b.actionDigest, claimRef: b.claimRef, generationRef: b.generationRef,
      sessionRef: b.sessionRef, executionRef: b.executionRef, resultRef: b.executionRef, recordRef: ref('typed-captured-data'),
      digest: sha(content), inputDigest: b.inputDigest, inputRecordRef: b.inputRecordRef, purpose: b.purpose,
      bindingDigest: b.bindingDigest, materialDigest: b.materialDigest, auditRef: b.auditRef,
      cursor: child.cursor, inputCursor: child.inputCursor, evidenceRef: child.evidenceRef, byteLength: Buffer.byteLength(content), state: 'captured',
    };
    assert.strictEqual(state.hooks.validateResult(state.agent, { executionRef: b.executionRef, claimRef: b.claimRef, generationRef: b.generationRef, content, digest: receipt.digest }), true);
    state.captureEvent = { operation: 'captureAuditResult', input: child, receipt };
    state.captureBinding = b; state.capturePhaseInput = phaseInput;
    state.emit(state.captureEvent); effects.capturePhase++;
  }
  const api = {
    ctx: state.ctx,
    snapshotOwner(v) { assert.strictEqual(v.taskRef, scope.taskRef); return copy(state.snap); },
    readOwnerData(v) { assert.strictEqual(v.taskRef, scope.taskRef); assert.ok(state.rows.has(v.recordRef)); return copy(state.rows.get(v.recordRef)); },
    currentPolicy() { return copy(state.policy); },
    planOwnerAction(v) {
      effects.plan++; state.spec = copy(v.spec);
      const actionDigest = digest(v.spec);
      state.snap.actions.push({ actionRef: v.spec.actionRef, actionDigest, spec: state.spec });
      return { actionRef: v.spec.actionRef, actionDigest };
    },
    prepareOwnerPreview(v) { effects.preview++; return { previewRef: ref('preview'), actionDigest: v.actionDigest }; },
    grantOwnerPreview(v) {
      effects.grant++; state.grantExpiresAt = v.expiresAt;
      const { previewRef, ...input } = v, receipt = { actionDigest: v.actionDigest, task: copy(state.snap.task) };
      state.emit({ operation: 'grant', input, receipt }); return receipt;
    },
    readProtectedContextFacts(v) { assert.strictEqual(v.contextRecordRef, contextRecordRef); return protectedFacts(); },
    readCapturedProducerFacts(v) { assert.strictEqual(v.artifactRef, artifact.artifactRef); return producerFacts(); },
    readAuditActionFacts(v) { assert.ok(['review', 'repair'].includes(v.purpose)); return copy(state.facts[v.purpose]); },
    readAuditInput(v) { assert.strictEqual(v.inputRecordRef, state.pair.association.recordRef); return copy(state.pair); },
    configureOwnerAudit(v) {
      effects.configure++; assert.strictEqual(v.expectedAuditRevision, 0);
      const req = {
        auditRef: v.auditRef, auditRevision: 1, artifactRef: v.artifactRef, artifactVersion: v.artifactVersion,
        digest: v.digest, contextRecordRef: v.contextRecordRef, material: copy(v.material), materialDigest: digest(v.material),
        policyRef: v.policyRef, blockingSeverities: copy(v.blockingSeverities), maxRepairRounds: v.maxRepairRounds,
        round: 0, semanticRevision: state.snap.semanticRevision, reportRef: purpose === 'audit_repair' ? ref('prior-unknown-report') : null,
      };
      req.bindingDigest = digest({ ...scope, auditRef: req.auditRef, auditRevision: req.auditRevision, artifactRef: req.artifactRef,
        artifactVersion: req.artifactVersion, digest: req.digest, material: req.material, policyRef: req.policyRef,
        blockingSeverities: req.blockingSeverities, maxRepairRounds: req.maxRepairRounds, round: req.round, semanticRevision: req.semanticRevision });
      state.snap.audits.push(req); return copy(req);
    },
    prepareOwnerAuditInput(v) { effects.prepareInput++; return makeInput(v); },
    assertNativeRequestCurrent(v) {
      effects.requestCurrent++;
      assert.deepEqual(v, { taskRef: scope.taskRef, claimRef: state.execution.claimRef, generationRef: state.execution.generationRef,
        actionDigest: state.execution.actionDigest, executionRef: state.execution.executionRef });
      return true;
    },
    composeNativeAudit({ worker: privateWorker, nativeHooks }) {
      effects.composition++; state.worker = privateWorker; state.hooks = nativeHooks;
      assert.deepEqual(Object.keys(privateWorker).sort(), ['environments', 'permission', 'resolveSession', 'toolGuard']);
      assert.deepEqual(Object.keys(nativeHooks).sort(), ['bindExecution', 'commitAgent', 'setupAgent', 'validateResult']);
      // This typed dispatcher exposes the module edge; it is not a native route
      // and its synthetic returned view does not attest actual guard acceptance.
      return {
        async dispatch(v) {
          effects.nativeDispatch++;
          state.agent = { id: 'df-' + state.spec.executor.generationRef };
          state.binding = { taskRef: scope.taskRef, actionRef: state.spec.actionRef, actionDigest: digest(state.spec), claimRef: state.claimRef,
            generationRef: state.spec.executor.generationRef, sessionRef: state.spec.executor.sessionRef, options: {}, spec: copy(state.spec) };
          nativeHooks.setupAgent({}, state.agent, state.binding);
          state.dispatchStarted.resolve(); await state.dispatchRelease.promise;
          state.dispatchResolved = true;
          return { worker: { taskRef: v.taskRef, actionRef: v.actionRef, actionDigest: v.actionDigest,
            generationRef: state.binding.generationRef, sessionRef: state.binding.sessionRef, claimRef: state.returnedClaimRef, phase: 'typed-unknown' } };
        },
        executeApprovedInput(v) {
          effects.execute++;
          state.execution = { taskRef: scope.taskRef, actionDigest: digest(state.spec), claimRef: v.claimRef, generationRef: v.generationRef,
            executionRef: ref('execution'), dataDigest: state.spec.dataDigest, inputDigest: state.spec.executionInput.digest };
          assert.strictEqual(nativeHooks.bindExecution(state.agent, state.execution, { digest: state.pair.data.digest, content: state.pair.data.content }), true);
          return { executionRef: state.execution.executionRef };
        },
        query() { return { state: 'unknown' }; },
        sessionLink() { return { state: 'unknown' }; },
        collectAuditResult(v, source) {
          effects.collect++;
          assert.strictEqual(source.operationRef, digest(['df.installed-audit.collect-operation/v1', scope, v]));
          assert.deepEqual(source.artifactTarget, purpose === 'audit_repair' ? { artifactRef: artifact.artifactRef, version: 2 } : null);
          publishCapture(v); return { state: 'unknown' };
        },
        async finishExecution(v) { effects.finish++; state.finishInput = copy(v); state.finishStarted.resolve(); await state.finishRelease.promise; },
        dispose() { effects.nativeDispose++; },
      };
    },
    subscribeRuntimeReceipts(callback) { effects.subscription++; state.emit = callback; return () => { effects.unsubscribe++; }; },
    isAlive() { return state.alive; },
  };
  if (!options.omitGuard) api.nativeToolGuard = record => { effects.sourceCallback++; return state.decide(record); };
  const f = {
    state, api, factory, config, ref, scope, clock,
    install() { f.installed = factory.installedAuditInstaller(f.api); return f.installed; },
    cas(command) { return { taskRef: scope.taskRef, commandRef: ref(command), expectedTaskVersion: state.snap.task.version, expectedAuthEpoch: state.snap.task.authEpoch }; },
    actionInput(command) { return { ...f.cas(command), actionRef: state.spec.actionRef, actionDigest: digest(state.spec) }; },
    executionInput(command) { return { ...f.cas(command), actionRef: state.spec.actionRef, claimRef: state.claimRef, generationRef: state.spec.executor.generationRef, executionRef: state.execution.executionRef }; },
    op(name, input) { return f.installed.operations[name](input, { assertCurrent: () => state.carrierCurrent }); },
    toolRecord(patch = {}) { return Object.freeze({ agent: state.agent, taskRef: scope.taskRef, generationRef: state.binding.generationRef, claimRef: state.binding.claimRef,
      toolsDigest: state.spec.executor.toolsDigest, permissionPolicyDigest: state.spec.executor.permissionPolicyDigest, schemas: Object.freeze([]), ...patch }); },
    rawGuard(record) { return state.worker.toolGuard(record); },
    guard(record = f.toolRecord()) { return runInstalledWorkerInvocation(state.ctx, () => state.carrierCurrent, () => {
      const decision = f.rawGuard(record); state.decisions.push(decision); return decision;
    }); },
    emitControl(operation = 'revoke') { state.emit({ operation, input: { taskRef: scope.taskRef, commandRef: ref('typed-' + operation) }, receipt: { task: copy(state.snap.task) } }); },
    async begin() {
      const materials = [contextData, artifactData].map(d => ({ recordRef: d.recordRef, digest: d.digest })).sort((a, b) => a.recordRef.localeCompare(b.recordRef));
      await f.op('configureAudit', { ...f.cas('configure'), auditRef: ref('audit'), expectedAuditRevision: 0,
        artifactRef: artifact.artifactRef, artifactVersion: 1, digest: artifact.digest, contextRecordRef, material: materials });
      await f.op('prepareAuditInput', { ...f.cas('prepare'), auditRef: ref('audit'), expectedAuditRevision: 1, purpose,
        round: purpose === 'audit_repair' ? 1 : 0, ...(purpose === 'audit_repair' ? { previousReportRef: ref('prior-unknown-report') } : {}) });
      await f.op('planAuditAction', { ...f.cas('plan'), auditRef: ref('audit'), inputRecordRef: state.pair.association.recordRef, purpose });
      const preview = await f.op('auditPreview', { taskRef: scope.taskRef, actionRef: state.spec.actionRef, actionDigest: digest(state.spec),
        recordRef: state.pair.association.recordRef, expectedTaskVersion: state.snap.task.version, expectedAuthEpoch: state.snap.task.authEpoch });
      await f.op('auditGrant', { ...f.actionInput('grant'), previewRef: preview.previewRef, accept: true, expiresAt: clock.value + 1000 });
      state.dispatchTask = f.op('dispatchAudit', f.actionInput('dispatch'));
      await Promise.race([state.dispatchStarted.promise, state.dispatchTask.then(() => { throw new Error('Dispatch returned before its controlled release'); })]);
      return f;
    },
    async recordClaim() { state.dispatchRelease.resolve(); const view = await state.dispatchTask; state.dispatchCompleted = true; return view; },
    async ready() { await f.begin(); await f.recordClaim(); return f; },
    async capture() {
      await f.op('executeAudit', { ...f.actionInput('execute'), claimRef: state.claimRef, generationRef: state.spec.executor.generationRef, inputRecordRef: state.pair.association.recordRef });
      const result = await f.op('collectAuditResult', f.executionInput('collect'));
      assert.deepEqual(result, { state: 'unknown', executionRef: state.execution.executionRef, resultRef: state.execution.executionRef });
      assert.strictEqual(effects.capturePhase, 1); return result;
    },
    async endFinish() {
      state.emit({ operation: 'finishExecution', input: copy(state.finishInput), receipt: {
        task: copy(state.snap.task), claimRef: state.claimRef, reservationHeld: false, outcome: 'completed',
      } });
      state.finishRelease.resolve(); const receipt = await state.finishTask; state.finishCompleted = true; return receipt;
    },
    driftLatestArtifact() {
      state.snap.artifacts.push({ ...copy(artifact), version: 2, digest: ref('newer-artifact-digest'), recordRef: ref('newer-artifact-data') });
      state.snap.task.version++; state.snap.semanticRevision++;
    },
    async cleanup() {
      const errors = [];
      for (const [task, done, release] of [[state.dispatchTask, state.dispatchCompleted, state.dispatchRelease], [state.finishTask, state.finishCompleted, state.finishRelease]]) {
        if (task && !done) { release.resolve(); try { await task; } catch (error) { errors.push(error); } }
      }
      f.installed?.dispose(); return errors;
    },
  };
  if (!options.deferInstall) f.install();
  return f;
}

// One test worker, serial top-level groups, scoped monotonic clock and restore.
// Cleanup cannot hide the first assertion/runtime failure; latent task errors
// become failures if the body otherwise succeeded. No real timers are started.
async function withClock(body) {
  const original = Date.now, made = [], clock = { value: BASE_TIME };
  Date.now = () => clock.value;
  let primary;
  const make = options => { clock.value = BASE_TIME; const f = fixture(clock, options); made.push(f); return f; };
  try { return await body({ clock, make }); }
  catch (error) { primary = error; throw error; }
  finally {
    const errors = [];
    try { for (const f of made) errors.push(...await f.cleanup()); }
    finally { Date.now = original; }
    if (!primary && errors.length) throw new AggregateError(errors, 'Unconsumed controlled task failure');
  }
}

async function denied(f, record, message) {
  const before = f.state.effects.sourceCallback;
  assert.strictEqual(await f.guard(record), false, message);
  assert.strictEqual(f.state.effects.sourceCallback, before, message + ': callback must not run');
}

test('NTA-01 omission, captured false and unchanged disabled/carrier denial', { concurrency: false }, async () => withClock(async ({ make }) => {
  const omitted = make({ omitGuard: true }); await omitted.ready();
  assert.strictEqual(Object.keys(omitted.api).length, 17);
  assert.deepEqual(Object.keys(omitted.installed).sort(), ['dispose', 'hostPermission', 'operations', 'previewResolver', 'previewTtlMs', 'status']);
  await denied(omitted, omitted.toolRecord(), 'omission');
  const supplied = make({ decide: () => false }); await supplied.ready();
  let replacementCalls = 0;
  supplied.api.nativeToolGuard = () => { replacementCalls++; return true; };
  assert.strictEqual(await supplied.guard(), false);
  assert.strictEqual(supplied.state.effects.sourceCallback, 1); assert.strictEqual(replacementCalls, 0);
  assert.throws(() => createInstalledAudit({ ...supplied.config, selection: { ...supplied.config.selection, nativeToolGuard: () => true } }), { code: 'CONFIG_INVALID' });
  await assert.rejects(supplied.op('dispatchAudit', { ...supplied.actionInput('owner-extra'), nativeToolGuard: () => true }), { code: 'INVALID_INPUT' });
  const disabled = make({ disabled: true });
  await assert.rejects(disabled.op('planAuditAction', {}), { code: 'AUDIT_DISABLED' });
  assert.strictEqual(disabled.state.effects.composition, 0); assert.strictEqual(disabled.state.effects.sourceCallback, 0);
  const stale = make(); await stale.ready(); stale.state.carrierCurrent = false;
  await assert.rejects(stale.guard(), { code: 'SERVICE_DISPOSED' });
  assert.strictEqual(stale.state.effects.sourceCallback, 0);
  assert.strictEqual(stale.rawGuard(stale.toolRecord()), false);
}));

test('NTA-02 descriptor, presence, closed API and known function classes', { concurrency: false }, async () => withClock(async ({ make }) => {
  const mutations = [
    ['present undefined', f => { f.api.nativeToolGuard = undefined; }, 'AUDIT_UNAVAILABLE'],
    ['present false value', f => { f.api.nativeToolGuard = false; }, 'AUDIT_UNAVAILABLE'],
    ['missing old required', f => { delete f.api.isAlive; }, 'INVALID_INPUT'],
    ['unknown field', f => { f.api.callerProof = true; }, 'INVALID_INPUT'],
    ['accessor', (f, c) => { Object.defineProperty(f.api, 'nativeToolGuard', { enumerable: true, get() { c.calls++; throw new Error('accessor'); } }); }, 'INVALID_INPUT'],
    ['nonenumerable', f => { Object.defineProperty(f.api, 'nativeToolGuard', { enumerable: false, value: () => true }); }, 'INVALID_INPUT'],
    ['proxy API', (f, c) => { f.api = new Proxy(f.api, proxyTraps(c)); }, 'INVALID_INPUT'],
    ['proxy callback', (f, c) => { f.api.nativeToolGuard = new Proxy(() => true, proxyTraps(c)); }, 'AUDIT_UNAVAILABLE'],
    ['async', (f, c) => { f.api.nativeToolGuard = async () => { c.calls++; return true; }; }, 'AUDIT_UNAVAILABLE'],
    ['generator', (f, c) => { f.api.nativeToolGuard = function* () { c.calls++; yield true; }; }, 'AUDIT_UNAVAILABLE'],
    ['async generator', (f, c) => { f.api.nativeToolGuard = async function* () { c.calls++; yield true; }; }, 'AUDIT_UNAVAILABLE'],
  ];
  for (const [name, mutate, code] of mutations) {
    const f = make({ deferInstall: true }), counter = { calls: 0 };
    mutate(f, counter);
    assert.throws(() => f.install(), { code }, name);
    assert.strictEqual(counter.calls, 0, name);
    assert.strictEqual(f.state.effects.subscription, 0, name);
    assert.strictEqual(f.state.effects.composition, 0, name);
    assert.strictEqual(f.state.effects.sourceCallback, 0, name);
  }
  const valid = make(); assert.strictEqual(valid.state.effects.subscription, 1);
}));

test('NTA-03 opaque exact agent and original input/array identities', { concurrency: false }, async () => withClock(async ({ make }) => {
  const f = make(); await f.ready();
  let agentReads = 0, seen;
  Object.defineProperty(f.state.agent, 'id', { configurable: true, enumerable: true, get() { agentReads++; throw new Error('new gate inspected agent'); } });
  f.state.agent.cycle = f.state.agent; f.state.agent[Symbol('opaque')] = () => {};
  f.state.decide = record => { seen = record; return true; };
  const record = f.toolRecord();
  assert.ok(Object.isFrozen(record)); assert.ok(Object.isFrozen(record.schemas));
  assert.strictEqual(await f.guard(record), true);
  assert.strictEqual(seen, record); assert.strictEqual(seen.agent, f.state.agent); assert.strictEqual(seen.schemas, record.schemas);
  assert.strictEqual(agentReads, 0); assert.strictEqual(Object.isFrozen(f.state.agent), false);
  await denied(f, f.toolRecord({ agent: { id: 'df-' + f.state.binding.generationRef } }), 'agent lookalike');
  const traps = { calls: 0 };
  await denied(f, f.toolRecord({ agent: new Proxy(f.state.agent, proxyTraps(traps)) }), 'proxy agent');
  assert.strictEqual(traps.calls, 0); assert.strictEqual(agentReads, 0);
}));

test('NTA-04 frozen ordinary record and truly empty schemas membrane', { concurrency: false }, async () => withClock(async ({ make }) => {
  const f = make(); await f.ready(); const good = f.toolRecord(); let getters = 0;
  const accessor = { ...good }; Object.defineProperty(accessor, 'taskRef', { enumerable: true, get() { getters++; throw new Error('record accessor'); } });
  const hidden = []; Object.defineProperty(hidden, 'hidden', { get() { getters++; throw new Error('schema accessor'); } }); Object.freeze(hidden);
  const custom = []; Object.setPrototypeOf(custom, {}); Object.freeze(custom);
  const recordTraps = { calls: 0 }, schemaTraps = { calls: 0 };
  const bad = [
    ['mutable record', { ...good }], ['mutable schemas', f.toolRecord({ schemas: [] })],
    ['nonempty schemas', f.toolRecord({ schemas: Object.freeze([{}]) })],
    ['record accessor', Object.freeze(accessor)], ['unknown record key', f.toolRecord({ callerProof: true })],
    ['symbol record key', Object.freeze({ ...good, [Symbol('extra')]: true })],
    ['proxy record', new Proxy(good, proxyTraps(recordTraps))],
    ['custom array prototype', f.toolRecord({ schemas: custom })], ['hidden array accessor', f.toolRecord({ schemas: hidden })],
    ['proxy schemas', f.toolRecord({ schemas: new Proxy(Object.freeze([]), proxyTraps(schemaTraps)) })],
  ];
  for (const [name, record] of bad) await denied(f, record, name);
  assert.strictEqual(getters, 0); assert.strictEqual(recordTraps.calls, 0); assert.strictEqual(schemaTraps.calls, 0);
  assert.strictEqual(await f.guard(good), true); assert.strictEqual(f.state.effects.sourceCallback, 1);
}));

test('NTA-05 exact claim in pending and recorded review/repair stages', { concurrency: false }, async () => withClock(async ({ make }) => {
  for (const purpose of ['audit_review', 'audit_repair']) {
    const f = make({ purpose }); await f.begin(); const record = f.toolRecord();
    assert.strictEqual(f.state.spec.dataDigest, f.state.snap.artifacts[0].digest);
    assert.strictEqual(f.state.spec.executionInput.digest, f.state.pair.data.digest);
    assert.notStrictEqual(f.state.spec.dataDigest, f.state.spec.executionInput.digest);
    assert.notStrictEqual(f.state.dispatchResolved, true); assert.strictEqual(record.claimRef, f.state.binding.claimRef);
    assert.strictEqual(await f.guard(record), true, purpose + ': claim-bound pending');
    const absent = { ...record }; delete absent.claimRef;
    await denied(f, Object.freeze(absent), purpose + ': missing claim');
    await denied(f, f.toolRecord({ claimRef: undefined }), purpose + ': undefined claim');
    await denied(f, f.toolRecord({ claimRef: f.ref('foreign-claim') }), purpose + ': foreign claim');
    await f.recordClaim(); assert.strictEqual(f.state.dispatchResolved, true);
    assert.strictEqual(await f.guard(record), true, purpose + ': recorded');
    for (const key of ['taskRef', 'generationRef', 'toolsDigest', 'permissionPolicyDigest']) {
      await denied(f, f.toolRecord({ [key]: f.ref('wrong-' + key) }), purpose + ': wrong ' + key);
    }
  }
  const conflict = make({ returnedClaimRef: sha('independent-different-recorded-claim') }); await conflict.ready();
  await denied(conflict, conflict.toolRecord(), 'recorded claim differs from setup claim');
  await denied(conflict, conflict.toolRecord({ claimRef: conflict.state.returnedClaimRef }), 'matching recorded claim still differs from setup');
}));

test('NTA-06 only literal synchronous true, with zero result inspection', { concurrency: false }, async () => withClock(async ({ make }) => {
  const f = make(); await f.ready(); let resultReads = 0; const resultTraps = { calls: 0 };
  const hostile = { get then() { resultReads++; throw new Error('then inspection'); }, get valueOf() { resultReads++; throw new Error('coercion'); } };
  const behaviors = [
    ['true', () => true, true], ['false', () => false, false], ['truthy hostile', () => hostile, false],
    ['proxy result', () => new Proxy({}, proxyTraps(resultTraps)), false],
    ['ordinary function returns Promise', () => Promise.resolve(true), false],
    ['throw', () => { throw new Error('typed callback error'); }, false],
    ['true after denied results', () => true, true],
  ];
  for (const [name, behavior, expected] of behaviors) {
    f.state.decide = behavior; const before = f.state.effects.sourceCallback;
    assert.strictEqual(await f.guard(), expected, name);
    assert.strictEqual(f.state.effects.sourceCallback, before + 1, name + ': exactly one callback');
    assert.strictEqual(f.state.effects.grant, 1); assert.strictEqual(f.state.effects.nativeDispatch, 1);
    assert.strictEqual(f.state.effects.execute, 0); assert.strictEqual(f.state.effects.collect, 0); assert.strictEqual(f.state.effects.finish, 0);
  }
  assert.strictEqual(resultReads, 0); assert.strictEqual(resultTraps.calls, 0);
}));

test('NTA-07 reentry poisons outer attempt and later valid attempt recovers', { concurrency: false }, async () => withClock(async ({ make }) => {
  const f = make(); await f.ready();
  for (const differentRecord of [false, true]) {
    let nested;
    f.state.decide = record => { nested = f.rawGuard(differentRecord ? f.toolRecord() : record); return true; };
    const before = f.state.effects.sourceCallback;
    assert.strictEqual(await f.guard(), false); assert.strictEqual(nested, false);
    assert.strictEqual(f.state.effects.sourceCallback, before + 1, 'nested attempt does not invoke captured callback');
    f.state.decide = () => true;
    assert.strictEqual(await f.guard(), true); assert.strictEqual(f.state.effects.sourceCallback, before + 2);
  }
}));

test('NTA-08 pre/post currentness, exact expiry, pending/ended and historical finish', { concurrency: false }, async () => withClock(async ({ make, clock }) => {
  for (const mode of ['expiresAt', 'dead', 'revoke', 'control', 'policy']) {
    const f = make(); await f.ready();
    if (mode === 'expiresAt') clock.value = f.state.grantExpiresAt;
    else if (mode === 'dead') f.state.alive = false;
    else f.emitControl(mode);
    await denied(f, f.toolRecord(), 'already invalid: ' + mode);
  }
  const mutations = [
    ['revoke', f => f.emitControl()],
    ['policy', f => { f.state.policy.version++; }],
    ['native source', f => { f.state.facts.review.nativeSourceRef = f.ref('changed-source'); }],
    ['pair metadata with same digest', f => { f.state.pair.association.createdAt++; f.state.pair.data.createdAt++; }],
    ['entire input body', f => { f.state.pair.data.content += '\n'; }],
    ['auth epoch', f => { f.state.snap.task.authEpoch++; }],
    ['control state', f => { f.state.snap.control = 'paused'; }],
    ['expiry equality', f => { clock.value = f.state.grantExpiresAt; }],
    ['dispose', f => f.installed.dispose()],
  ];
  for (const [name, mutate] of mutations) {
    const f = make(); await f.ready();
    f.state.decide = () => { mutate(f); return true; };
    assert.strictEqual(await f.guard(), false, 'changed after callback: ' + name);
    assert.strictEqual(f.state.effects.sourceCallback, 1, name);
    assert.strictEqual(f.state.effects.grant, 1); assert.strictEqual(f.state.effects.execute, 0); assert.strictEqual(f.state.effects.collect, 0);
  }
  const carrier = make(); await carrier.ready();
  carrier.state.decide = () => { carrier.state.carrierCurrent = false; return true; };
  await assert.rejects(carrier.guard(), { code: 'SERVICE_DISPOSED' });
  assert.strictEqual(carrier.state.decisions.at(-1), false); assert.strictEqual(carrier.state.effects.sourceCallback, 1);

  const finishing = make({ purpose: 'audit_repair' }); await finishing.ready(); await finishing.capture();
  assert.strictEqual(await finishing.guard(), true, 'fresh captured row before finish');
  const before = finishing.state.effects.sourceCallback;
  // Do not await the deliberately pending finish Task. Wait only for the typed
  // native finish entry, then inspect denial.
  finishing.state.finishTask = finishing.op('workerFinish', finishing.executionInput('finish'));
  await Promise.race([finishing.state.finishStarted.promise, finishing.state.finishTask.then(() => { throw new Error('Premature finish return'); })]);
  assert.strictEqual(finishing.state.effects.finish, 1);
  await denied(finishing, finishing.toolRecord(), 'finish intent while native finish unknown');
  const ended = await finishing.endFinish(); assert.strictEqual(ended.reservationHeld, false);
  await denied(finishing, finishing.toolRecord(), 'ended row'); assert.strictEqual(finishing.state.effects.sourceCallback, before);

  const historical = make(); await historical.ready(); await historical.capture();
  const originalClaim = historical.state.captureBinding.claimRef, originalExecution = historical.state.captureBinding.executionRef;
  historical.driftLatestArtifact(); await denied(historical, historical.toolRecord(), 'fresh tools after newer artifact');
  historical.state.finishTask = historical.op('workerFinish', historical.executionInput('finish'));
  await Promise.race([historical.state.finishStarted.promise, historical.state.finishTask.then(() => { throw new Error('Premature historical finish return'); })]);
  assert.strictEqual(historical.state.finishInput.expectedTaskVersion, 2);
  assert.strictEqual(historical.state.finishInput.claimRef, originalClaim); assert.strictEqual(historical.state.finishInput.executionRef, originalExecution);
  assert.strictEqual(historical.state.captureBinding.artifactVersion, 1); assert.strictEqual(historical.state.captureBinding.semanticRevision, 1);
  await historical.endFinish(); await denied(historical, historical.toolRecord(), 'historically finished original row');
}));
