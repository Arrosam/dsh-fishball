import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInstalledAudit, validateInstalledAudit } from '../src/installed-audit.mjs';
import { runInstalledWorkerInvocation } from '../src/installed-invocation.mjs';
import { BootstrapError } from '../src/config.mjs';

// Independent T-level fixture: ordinary in-memory private callback projections.
// No RuntimeStore/DatabaseSync, native class/profile/session/provider or listener
// is created. Native-looking hashes and receipt labels carry NO native provenance.
// C/H are independent byte/hash oracles; no product canonicalDigest is imported.
const H = s => createHash('sha256').update(s).digest('hex');
const C = v => Array.isArray(v) ? '[' + v.map(C).join(',') + ']' :
  v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + C(v[k])).join(',') + '}' : JSON.stringify(v);
const D = v => H(C(v));
const ref = n => H('independent-audit:' + n);
const copy = v => JSON.parse(JSON.stringify(v));
const directory = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const admitted = { assertCurrent: () => true };
const reject = (p, code) => assert.rejects(p, { code });
const pause = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, { purpose = 'audit_review', disabled = false } = {}) {
  const scope = { ownerRef: H('independent-owner'), workspaceRef: H('independent-workspace'), taskRef: ref('task') };
  const ids = Object.fromEntries(['audit', 'artifact', 'artifact-data', 'context', 'input', 'source', 'memory', 'policy', 'config', 'native', 'catalog', 'review-preset', 'repair-preset', 'review-model', 'repair-model', 'reasoning', 'environment', 'environment-binding', 'tools', 'permission', 'cost', 'producer-claim', 'producer-gen', 'producer-session', 'producer-exec', 'report'].map(n => [n, ref(n)]));
  const roleChoice = role => ({ selection: { provider: 'typed-' + role, model: 'typed-' + role + '-model', agentPreset: 'typed-empty', reasoningEffort: null, maxOutputTokens: 256 }, charges: { runtimeMs: 1000, usageUnits: 2048 } });
  const selection = disabled ? { enabled: false } : { enabled: true, inputByteLimit: 16384, resultByteLimit: 8192, maxPrivateReviewers: 1, blockingSeverities: ['blocking'], maxRepairRounds: 1, maxTotalAttempts: 2, review: roleChoice('review'), repair: roleChoice('repair') };
  const worker = disabled ? { enabled: false } : { enabled: true, selection: roleChoice('producer').selection, environment: { root: directory, cwd: directory }, persistence: { directory: join(directory, 'df-sessions-independent-audit'), compression: 'none', retention: 'owner-managed' }, bounds: { requestBytes: 512, resultBytes: 8192 }, policy: { maxRuntimeMs: 100000, maxUsageUnits: 100000, maxCostEstimateMicros: 0 }, charges: { runtimeMs: 1000, usageUnits: 2048 }, previewTtlMs: 60000, grantTtlMs: 60000 };
  const task = { ...scope, version: 50, authEpoch: 3 };
  const policy = { version: 4, limits: { maxActive: 1, maxAttempts: 1, maxTotalAttempts: 2, maxRuntimeMs: 100000, maxUsageUnits: 100000 }, modelPolicy: { version: 5, catalogEvidenceRef: ids.catalog, presetRefs: [ids['review-preset'], ids['repair-preset']] } };
  const contextText = 'Independent bounded context';
  const context = JSON.stringify({ contractVersion: 'df.execution-context/v1', materialKind: 'execution_context', sourceScope: scope, sourceTaskVersion: 49, sourceAuthEpoch: 3, generatedAt: 1000, sourceRefs: [ids.source], sourceProvenance: [{ recordRef: ids.source, digest: H(contextText), taskVersion: 49, authEpoch: 3, createdAt: 999 }], memory: { namespaceRef: ids.memory, revision: 4, provenance: [] }, ledgerSnapshotDigest: ref('ledger-snapshot'), content: contextText, inputCounts: { bytes: Buffer.byteLength(contextText), tokens: 8 }, retainedRefs: [], droppedRefs: [], verification: 'module_prepared_execution_context_only' });
  const contextData = { recordRef: ids.context, kind: 'context', digest: H(context), sourceRef: ids.source, taskVersion: 50, authEpoch: 3, sourceTaskVersion: 49, sourceAuthEpoch: 3, semanticRevision: 7, generationRef: null, createdAt: 1000, byteLength: Buffer.byteLength(context), cryptoVersion: 2, content: context };
  const artifactText = 'Independent typed producer output';
  const artifact = { artifactRef: ids.artifact, version: 3, recordRef: ids['artifact-data'], digest: H(artifactText), producerClaimRef: ids['producer-claim'], generationRef: ids['producer-gen'], verification: null };
  const data = new Map([[ids.context, contextData], [artifact.recordRef, { recordRef: artifact.recordRef, kind: 'artifact', digest: artifact.digest, content: artifactText }]]);
  const material = [...data.values()].map(x => ({ recordRef: x.recordRef, digest: x.digest })).sort((a, b) => a.recordRef.localeCompare(b.recordRef));
  const requirement = { ...scope, auditRef: ids.audit, auditRevision: 2, artifactRef: ids.artifact, artifactVersion: 3, digest: artifact.digest, material, materialDigest: D(material), policyRef: ids.policy, blockingSeverities: ['blocking'], maxRepairRounds: 1, round: 0, semanticRevision: 7, contextRecordRef: ids.context, contextDigest: contextData.digest, reportRef: purpose === 'audit_repair' ? ids.report : null };
  requirement.bindingDigest = D({ ...scope, auditRef: requirement.auditRef, auditRevision: requirement.auditRevision, artifactRef: requirement.artifactRef, artifactVersion: requirement.artifactVersion, digest: requirement.digest, material, policyRef: requirement.policyRef, blockingSeverities: requirement.blockingSeverities, maxRepairRounds: 1, round: 0, semanticRevision: 7 });
  const body = { contractVersion: 'df.audit-input/v1', purpose, ...scope, auditRef: ids.audit, auditRevision: 2, round: purpose === 'audit_repair' ? 1 : 0, semanticRevision: 7, artifact: { artifactRef: ids.artifact, version: 3, recordRef: artifact.recordRef, digest: artifact.digest }, bindingDigest: requirement.bindingDigest, materialDigest: requirement.materialDigest, policy: { policyRef: ids.policy, blockingSeverities: ['blocking'], maxRepairRounds: 1 }, material: material.map(x => ({ ...x, kind: data.get(x.recordRef).kind, content: data.get(x.recordRef).content })), contextRecordRef: ids.context, contextDigest: contextData.digest, previousReport: purpose === 'audit_repair' ? { reportRef: ids.report, state: 'failed' } : null, responseContract: 'df.audit-response/v1' };
  const content = JSON.stringify(body);
  const association = { contractVersion: 'df.audit-input-association/v1', ...scope, auditRef: ids.audit, auditRevision: 2, round: body.round, purpose, recordRef: ids.input, digest: H(content), byteLength: Buffer.byteLength(content), bindingDigest: requirement.bindingDigest, materialDigest: requirement.materialDigest, artifactRef: ids.artifact, artifactVersion: 3, artifactDigest: artifact.digest, semanticRevision: 7, sourceTaskVersion: 50, sourceAuthEpoch: 3, contextRecordRef: ids.context, contextDigest: contextData.digest, previousReportRef: requirement.reportRef, material, inputByteLimit: 16384, resultByteLimit: 8192, createdAt: 1001 };
  const inputData = { recordRef: ids.input, digest: association.digest, kind: 'context', sourceRef: ids.audit, taskVersion: 50, authEpoch: 3, generationRef: null, createdAt: 1001, byteLength: association.byteLength, cryptoVersion: 2, sourceTaskVersion: 50, sourceAuthEpoch: 3, semanticRevision: 7, auditInputRef: ids.input, content };
  data.set(ids.input, inputData);
  let pair = { association, data: inputData }, subscriber, alive = true, composition, collector, finisher;
  const state = { task, semanticRevision: 7, control: 'active', audits: [requirement], artifacts: [artifact], actions: [], workers: [], policy };
  const calls = Object.fromEntries(['snapshot', 'data', 'policy', 'facts', 'pair', 'plan', 'preview', 'grant', 'compose', 'dispatch', 'execute', 'collect', 'capture', 'submit', 'write', 'finish', 'subscribe', 'unsubscribe', 'dispose', 'nativeAssert'].map(n => [n, 0]));
  const increment = n => ++calls[n];
  const emit = event => subscriber(copy(event));
  const actionRow = actionRef => state.actions.find(x => x.actionRef === actionRef);
  const sourceFacts = role => ({ configurationRef: ids.config, nativeSourceRef: ids.native, resourcePolicyVersion: 4, modelPolicyVersion: 5, presetRef: ids[role + '-preset'], modelRef: ids[role + '-model'], reasoningRef: ids.reasoning, catalogEvidenceRef: ids.catalog, environmentRef: ids.environment, bindingDigest: ids['environment-binding'], toolsDigest: ids.tools, permissionPolicyDigest: ids.permission, effectiveReasoningEffort: null, accounting: 'typed-unit-accounting/v1', pricing: 'source_zero', costProvenanceRef: ids.cost });
  const api = {
    ctx: {}, isAlive: () => alive,
    snapshotOwner() { increment('snapshot'); return copy({ ...state, data: [...data.values()].map(({ content, ...meta }) => meta) }); },
    readOwnerData({ recordRef }) { increment('data'); return copy(data.get(recordRef)); },
    currentPolicy() { increment('policy'); return copy(policy); },
    readProtectedContextFacts() { increment('facts'); return { recordRef: ids.context, digest: contextData.digest, kind: 'context', byteLength: contextData.byteLength, cryptoVersion: 2, originSourceRef: ids.source, sourceTaskVersion: 49, sourceAuthEpoch: 3, memory: { namespaceRef: ids.memory, revision: 4 }, taskRef: task.taskRef, taskVersion: task.version, authEpoch: task.authEpoch, semanticRevision: state.semanticRevision, configurationRef: ids.config, nativeSourceRef: ids.native }; },
    readCapturedProducerFacts() { increment('facts'); return { taskRef: task.taskRef, artifactRef: ids.artifact, artifactVersion: 3, recordRef: artifact.recordRef, digest: artifact.digest, producerClaimRef: artifact.producerClaimRef, generationRef: artifact.generationRef, sessionRef: ids['producer-session'], executionRef: ids['producer-exec'], inputDigest: contextData.digest, cursor: 9, resultDigest: artifact.digest, configurationRef: ids.config, nativeSourceRef: ids.native }; },
    readAuditActionFacts({ purpose }) { increment('facts'); return sourceFacts(purpose); },
    readAuditInput() { increment('pair'); return copy(pair); },
    configureOwnerAudit() { throw new Error('Unexpected configure source mutation in focused fixture'); },
    prepareOwnerAuditInput() { throw new Error('Unexpected input source mutation in focused fixture'); },
    planOwnerAction(v) { increment('plan'); const row = { actionRef: v.spec.actionRef, actionDigest: D(v.spec), spec: copy(v.spec) }; state.actions.push(row); task.version++; return { actionRef: row.actionRef, actionDigest: row.actionDigest, task: copy(task) }; },
    async prepareOwnerPreview(v) { increment('preview'); return { previewRef: ref('preview-' + calls.preview), description: { data: { recordRef: v.recordRef, digest: association.digest, content: inputData.content } }, taskVersion: task.version, authEpoch: task.authEpoch }; },
    async grantOwnerPreview(v) { increment('grant'); const { previewRef, ...input } = v; task.version++; const receipt = { actionDigest: v.actionDigest, task: copy(task) }; emit({ operation: 'grant', input, receipt }); return receipt; },
    assertNativeRequestCurrent() { increment('nativeAssert'); return true; },
    composeNativeAudit(v) { increment('compose'); composition = v; return native; },
    subscribeRuntimeReceipts(fn) { increment('subscribe'); subscriber = fn; return () => { increment('unsubscribe'); }; }
  };
  function binding(outer) {
    const row = actionRow(outer.actionRef), a = association;
    return { ...scope, auditRef: a.auditRef, auditRevision: a.auditRevision, round: a.round, semanticRevision: a.semanticRevision, bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, artifactRef: a.artifactRef, artifactVersion: a.artifactVersion, artifactDigest: a.artifactDigest, inputRecordRef: a.recordRef, inputDigest: a.digest, purpose: a.purpose, actionRef: row.actionRef, actionDigest: row.actionDigest, claimRef: outer.claimRef, generationRef: outer.generationRef, sessionRef: row.spec.executor.sessionRef, executionRef: outer.executionRef, outerInput: copy(outer) };
  }
  function captureEvent(outer) {
    const b = binding(outer);
    const output = purpose === 'audit_repair' ? 'Independent fixed repair bytes' : JSON.stringify({ contractVersion: 'df.audit-response/v1', bindingDigest: b.bindingDigest, materialDigest: b.materialDigest, inputDigest: b.inputDigest, verdict: 'passed', coverageRefs: material.map(x => x.recordRef), unexaminedRefs: [], findings: [] });
    const phase = { taskRef: task.taskRef, claimRef: outer.claimRef, generationRef: outer.generationRef, executionRef: outer.executionRef, sessionRef: b.sessionRef, inputCursor: 11, cursor: 12, contentDigest: H(output), contentByteLength: Buffer.byteLength(output), evidenceRef: ref('output-evidence') };
    const { contentDigest, contentByteLength, ...args } = phase;
    const { outerInput, ...scoped } = b;
    return { operation: 'captureAuditResult', input: { ...args, commandRef: D(['df.installed-audit.capture/v1', outer.commandRef, { binding: b, phaseInput: phase }]), content: output }, receipt: { contractVersion: 'df.audit-result-association/v1', ...scoped, resultRef: outer.executionRef, recordRef: ref('capture-record'), digest: H(output), byteLength: Buffer.byteLength(output), cursor: 12, inputCursor: 11, evidenceRef: phase.evidenceRef, state: 'captured' } };
  }
  function submitEvent(outer, capture) {
    const b = binding(outer), input = { taskRef: task.taskRef, auditRef: ids.audit, executionRef: outer.executionRef, resultRef: capture.resultRef };
    const phase = { ...input, resultRecordRef: capture.recordRef, resultDigest: capture.digest, reviewerBinding: { taskRef: task.taskRef, auditRef: ids.audit, claimRef: outer.claimRef, generationRef: outer.generationRef, sessionRef: b.sessionRef } };
    return { operation: 'submitAuditResult', input: { ...input, commandRef: D(['df.installed-audit.submit/v1', outer.commandRef, { binding: b, phaseInput: phase }]) }, receipt: { report: { claimRef: outer.claimRef, generationRef: outer.generationRef, auditRef: ids.audit, digest: association.artifactDigest, materialDigest: association.materialDigest, native: { resultRef: capture.resultRef }, state: 'passed' }, verification: { resultRef: capture.resultRef, verdict: 'accepted' } } };
  }
  function writeEvent(outer, capture, target) {
    const b = binding(outer), content = 'Independent fixed repair bytes';
    const write = { taskRef: task.taskRef, expectedTaskVersion: outer.expectedTaskVersion, expectedAuthEpoch: outer.expectedAuthEpoch, artifactRef: target.artifactRef, version: target.version, producerClaimRef: outer.claimRef, generationRef: outer.generationRef, contentDigest: H(content), contentByteLength: Buffer.byteLength(content) };
    const phase = { resultRef: capture.resultRef, resultRecordRef: capture.recordRef, resultDigest: capture.digest, artifactWrite: write };
    const { contentDigest, contentByteLength, ...args } = write;
    return { operation: 'writeArtifact', input: { ...args, commandRef: D(['df.installed-audit.repair-artifact/v1', outer.commandRef, { binding: b, phaseInput: phase }]), content }, receipt: { artifactRef: target.artifactRef, version: target.version, recordRef: ref('repaired-record'), digest: H(content), producerClaimRef: outer.claimRef, generationRef: outer.generationRef, task: copy(task) } };
  }
  function publish(event) {
    const name = { captureAuditResult: 'capture', submitAuditResult: 'submit', writeArtifact: 'write' }[event.operation];
    // Count only accepted module observations, never a native/source effect.
    emit(event); if (name) increment(name);
  }
  const native = {
    async dispatch(v) { increment('dispatch'); task.version++; const row = actionRow(v.actionRef); return { worker: { taskRef: task.taskRef, actionRef: row.actionRef, actionDigest: row.actionDigest, claimRef: ref('claim-' + calls.dispatch), generationRef: row.spec.executor.generationRef, sessionRef: row.spec.executor.sessionRef } }; },
    async executeApprovedInput() { increment('execute'); return { executionRef: ref('execution-' + calls.execute) }; },
    async collectAuditResult(v, privateArgument) { increment('collect'); if (collector) return collector(v, privateArgument); const event = captureEvent(v); publish(event); if (purpose === 'audit_repair') publish(writeEvent(v, event.receipt, privateArgument.artifactTarget)); else publish(submitEvent(v, event.receipt)); return { echoed: true }; },
    async query() { return { state: 'unknown' }; },
    sessionLink() { return null; },
    async finishExecution(v) { increment('finish'); if (finisher) return finisher(v); const receipt = { task: copy(task), claimRef: v.claimRef, reservationHeld: false, outcome: 'completed', terminalEvidenceRef: ref('terminal'), releaseEvidenceRef: ref('release') }; emit({ operation: 'finishExecution', input: v, receipt }); return receipt; },
    dispose() { increment('dispose'); }
  };
  const factory = createInstalledAudit({ selection, identity: { ownerId: 'independent-owner', workspaceId: 'independent-workspace' }, profile: { dir: directory, name: 'typed-independent-profile' }, worker });
  const installed = factory.installedAuditInstaller(api);
  t.after(() => installed.dispose());
  let commandSequence = 0;
  const cas = (label = 'command') => ({ taskRef: task.taskRef, commandRef: ref(label + '-' + ++commandSequence), expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
  const call = (name, input, guard = admitted) => installed.operations[name](input, guard);
  async function plan(label = 'plan') { return call('planAuditAction', { ...cas(label), auditRef: ids.audit, inputRecordRef: ids.input, purpose }); }
  async function grant(action) {
    const preview = await call('auditPreview', { taskRef: task.taskRef, actionRef: action.actionRef, actionDigest: action.actionDigest, recordRef: ids.input, expectedTaskVersion: task.version, expectedAuthEpoch: task.authEpoch });
    return call('auditGrant', { ...cas('grant'), actionRef: action.actionRef, actionDigest: action.actionDigest, previewRef: preview.previewRef, expiresAt: Date.now() + 50000, accept: true });
  }
  async function dispatch(action) { return (await call('dispatchAudit', { ...cas('dispatch'), actionRef: action.actionRef, actionDigest: action.actionDigest })).worker; }
  async function started() {
    const action = await plan(); await grant(action); const w = await dispatch(action);
    const out = await call('executeAudit', { ...cas('execute'), actionRef: action.actionRef, actionDigest: action.actionDigest, claimRef: w.claimRef, generationRef: w.generationRef, inputRecordRef: ids.input });
    return { taskRef: task.taskRef, actionRef: action.actionRef, claimRef: w.claimRef, generationRef: w.generationRef, executionRef: out.executionRef };
  }
  return { ids, scope, task, state, policy, data, requirement, association, body, installed, api, native, calls, cas, call, plan, grant, dispatch, started, binding, captureEvent, submitEvent, writeEvent, publish, emit, composition: () => composition, setPair(p) { pair = p; }, getPair: () => copy(pair), setCollector(fn) { collector = fn; }, setFinisher(fn) { finisher = fn; }, setAlive(v) { alive = v; } };
}

test('IF01 disabled lifecycle and hostile descriptors have no source callbacks', async t => {
  const f = fixture(t, { disabled: true });
  assert.deepEqual(validateInstalledAudit(), { enabled: false });
  assert.deepEqual(f.installed.status(), { enabled: false, ready: false, reason: null, bounds: null });
  assert.equal(f.installed.previewTtlMs, null); assert.equal(f.installed.hostPermission({}), false);
  for (const name of Object.keys(f.installed.operations)) await reject(f.call(name, {}), 'AUDIT_DISABLED');
  let traps = 0;
  assert.throws(() => validateInstalledAudit({ get enabled() { traps++; return true; } }), { code: 'CONFIG_INVALID' });
  assert.throws(() => validateInstalledAudit(new Proxy({}, { ownKeys() { traps++; return []; } })), { code: 'CONFIG_INVALID' });
  assert.equal(traps, 0); assert.equal(f.calls.snapshot + f.calls.data + f.calls.policy + f.calls.compose, 0);
  f.installed.dispose(); f.installed.dispose(); assert.equal(f.calls.subscribe, 1); assert.equal(f.calls.unsubscribe, 1);
});

test('IF02 full input, historical binding and material mutations refuse before planning', async t => {
  for (const variant of ['body-policy', 'material-bytes', 'extra-field', 'association-scope', 'input-origin', 'artifact-version']) {
    const f = fixture(t), p = f.getPair(), b = JSON.parse(p.data.content);
    if (variant === 'body-policy') b.policy.policyRef = ref('changed-policy');
    if (variant === 'material-bytes') b.material[0].content += '!';
    if (variant === 'extra-field') b.ownerProof = true;
    if (variant === 'association-scope') p.association.workspaceRef = ref('foreign-workspace');
    if (variant === 'input-origin') delete p.data.auditInputRef;
    if (variant === 'artifact-version') b.artifact.version++;
    if (['body-policy', 'material-bytes', 'extra-field', 'artifact-version'].includes(variant)) {
      p.data.content = JSON.stringify(b); p.data.digest = p.association.digest = H(p.data.content);
      p.data.byteLength = p.association.byteLength = Buffer.byteLength(p.data.content);
    }
    f.setPair(p);
    await assert.rejects(f.plan(), { code: variant === 'extra-field' ? 'INVALID_INPUT' : 'AUDIT_INPUT_REQUIRED' });
    assert.equal(f.calls.plan, 0); assert.equal(f.calls.dispatch, 0);
  }
});

test('IF03 complete review action keeps separate digests and excludes unplanned roles/scopes', async t => {
  const f = fixture(t), a = await f.plan(), spec = f.state.actions[0].spec;
  assert.equal(a.actionDigest, D(spec)); assert.equal(spec.dataDigest, f.association.artifactDigest);
  assert.equal(spec.executionInput.digest, f.association.digest); assert.notEqual(spec.dataDigest, spec.executionInput.digest);
  assert.equal(spec.targetDigest, f.association.bindingDigest); assert.equal(spec.kind, 'review'); assert.equal(spec.role, 'review');
  assert.equal(spec.executor.mode, 'create'); assert.equal(spec.executor.sessionRef, H('df-' + spec.executor.generationRef));
  await f.grant(a); await f.dispatch(a);
  const record = { ...f.scope, actionRef: a.actionRef, actionDigest: a.actionDigest, spec, authEpoch: f.task.authEpoch };
  await runInstalledWorkerInvocation(f.api.ctx, admitted.assertCurrent, () => {
    const permission = f.composition().worker.permission;
    assert.equal(permission(record), true);
    for (const patch of [{ ownerRef: ref('other') }, { actionRef: ref('unplanned') }, { spec: { ...spec, kind: 'repair', role: 'repair' } }]) assert.equal(permission({ ...record, ...patch }), false);
    assert.equal(f.composition().worker.toolGuard({}), false);
  });
});

test('IF04 pending dispatch consumes the selected reviewer slot before its await', async t => {
  const f = fixture(t), a = await f.plan('one'), b = await f.plan('two'); await f.grant(a); await f.grant(b);
  const hold = pause(); f.native.dispatch = () => { f.calls.dispatch++; return hold.promise; };
  const first = f.dispatch(a); await tick();
  await reject(f.dispatch(b), 'REVIEWER_LIMIT');
  const spec = f.state.actions.find(x => x.actionRef === a.actionRef).spec;
  hold.resolve({ worker: { taskRef: f.task.taskRef, actionRef: a.actionRef, actionDigest: a.actionDigest, claimRef: ref('pending-claim'), generationRef: spec.executor.generationRef, sessionRef: spec.executor.sessionRef } });
  await first; assert.equal(f.calls.dispatch, 1);
});

test('IF05 unknown execution consumes one-use submission without automatic resend', async t => {
  const f = fixture(t), a = await f.plan(); await f.grant(a); const w = await f.dispatch(a);
  f.native.executeApprovedInput = async () => { f.calls.execute++; throw new BootstrapError('NATIVE_UNKNOWN'); };
  const v = { ...f.cas('execute'), actionRef: a.actionRef, actionDigest: a.actionDigest, claimRef: w.claimRef, generationRef: w.generationRef, inputRecordRef: f.ids.input };
  await reject(f.call('executeAudit', v), 'NATIVE_UNKNOWN');
  await reject(f.call('executeAudit', { ...v, commandRef: ref('replacement-execute') }), 'AUDIT_BINDING_MISMATCH');
  assert.equal(f.calls.execute, 1); assert.equal(f.calls.collect, 0);
});

test('IF06 whole consent wire boundary and caught guard denial precede local grant', async t => {
  for (const bytes of [65536, 65537]) {
    const f = fixture(t), a = await f.plan(), receipt = { previewRef: ref('wire-' + bytes), description: { content: '' } };
    receipt.description.content = 'a'.repeat(bytes - Buffer.byteLength(JSON.stringify({ ok: true, value: receipt })));
    f.api.prepareOwnerPreview = async () => receipt;
    const v = { taskRef: f.task.taskRef, actionRef: a.actionRef, actionDigest: a.actionDigest, recordRef: f.ids.input, expectedTaskVersion: f.task.version, expectedAuthEpoch: f.task.authEpoch };
    if (bytes === 65536) assert.deepEqual(await f.call('auditPreview', v), receipt);
    else { await reject(f.call('auditPreview', v), 'PREVIEW_UNAVAILABLE'); await reject(f.call('auditGrant', { ...f.cas('grant'), actionRef: a.actionRef, actionDigest: a.actionDigest, previewRef: receipt.previewRef, expiresAt: Date.now() + 50000, accept: true }), 'PREVIEW_STALE'); }
    assert.equal(f.calls.grant, 0);
  }
  const f = fixture(t), a = await f.plan(); let denied = false;
  f.api.prepareOwnerPreview = async () => { denied = true; throw new BootstrapError('PREVIEW_UNAVAILABLE'); };
  await reject(f.call('auditPreview', { taskRef: f.task.taskRef, actionRef: a.actionRef, actionDigest: a.actionDigest, recordRef: f.ids.input, expectedTaskVersion: f.task.version, expectedAuthEpoch: f.task.authEpoch }, { assertCurrent() { if (denied) throw new BootstrapError('OPERATOR_REQUIRED'); return true; } }), 'OPERATOR_REQUIRED');
  assert.equal(f.calls.grant, 0);
});

test('IF07 only exact private capture/submit phases complete review; headers remain unknown', async t => {
  const f = fixture(t), refs = await f.started();
  f.setCollector(async () => ({ report: { state: 'passed' }, verification: { verdict: 'accepted' } }));
  assert.deepEqual(await f.call('collectAuditResult', { ...refs, ...f.cas('echo') }), { state: 'unknown', executionRef: refs.executionRef, resultRef: null });
  f.setCollector(async outer => { const e = f.captureEvent(outer); f.publish(e); f.publish(f.submitEvent(outer, e.receipt)); });
  const result = await f.call('collectAuditResult', { ...refs, ...f.cas('exact') });
  assert.equal(result.report.state, 'passed'); assert.equal(f.calls.capture, 1); assert.equal(f.calls.submit, 1); assert.equal(f.calls.finish, 0);
});

test('IF08 immutable outer intent precedes fresh CAS and completed replay survives CAS advance', async t => {
  const f = fixture(t), refs = await f.started(), stale = { ...refs, ...f.cas('stale'), expectedTaskVersion: 1 };
  await reject(f.call('collectAuditResult', stale), 'STALE_VERSION');
  await reject(f.call('collectAuditResult', { ...stale, expectedTaskVersion: f.task.version }), 'IDEMPOTENCY_CONFLICT');
  assert.equal(f.calls.collect, 0);
  const v = { ...refs, ...f.cas('current') }, result = await f.call('collectAuditResult', v);
  f.task.version += 3; f.state.control = 'paused';
  assert.deepEqual(await f.call('collectAuditResult', v), result);
  await reject(f.call('collectAuditResult', { ...v, expectedTaskVersion: f.task.version }), 'IDEMPOTENCY_CONFLICT');
  assert.equal(f.calls.collect, 1);
});

test('IF09 busy duplicate and finite outer retention have no parallel collector or eviction', async t => {
  const f = fixture(t), refs = await f.started(), hold = pause(), one = { ...refs, ...f.cas('one') };
  f.setCollector(() => hold.promise);
  const pending = f.call('collectAuditResult', one); await tick();
  await reject(f.call('collectAuditResult', one), 'AUDIT_COLLECT_BUSY');
  hold.resolve({ echoed: true }); await pending;
  f.setCollector(async () => ({ echoed: true }));
  await f.call('collectAuditResult', { ...refs, ...f.cas('two') });
  await reject(f.call('collectAuditResult', { ...refs, ...f.cas('three') }), 'AUDIT_COLLECT_CAPACITY');
  assert.equal((await f.call('collectAuditResult', one)).state, 'unknown');
  assert.equal(f.calls.collect, 3);
});

test('IF10 capture-only repair uses one fixed v3-to-v4 target on explicit reconciliation', async t => {
  const f = fixture(t, { purpose: 'audit_repair' }), refs = await f.started();
  let captured, first;
  f.setCollector(async (outer, privateArgument) => { assert.deepEqual(privateArgument.artifactTarget, { artifactRef: f.ids.artifact, version: 4 }); first = copy(outer); captured = f.captureEvent(outer); f.publish(captured); });
  assert.equal((await f.call('collectAuditResult', { ...refs, ...f.cas('capture-only') })).state, 'unknown');
  f.task.version++;
  f.setCollector(async (outer, privateArgument) => { f.publish(f.writeEvent(outer, captured.receipt, privateArgument.artifactTarget)); });
  const result = await f.call('collectAuditResult', { ...refs, ...f.cas('reconcile') });
  assert.equal(result.artifact.version, 4); assert.equal(f.calls.capture, 1); assert.equal(f.calls.write, 1); assert.equal(f.calls.submit, 0);
  const replay = await f.call('collectAuditResult', { ...refs, ...f.cas('written') });
  assert.deepEqual(replay, result); assert.equal(f.calls.collect, 2);
  assert.notEqual(first.commandRef, refs.executionRef);
});

test('IF11 committed repair artifact with lost publication reconciles original receipt after actual latest-version advance', async t => {
  const f = fixture(t, { purpose: 'audit_repair' }), refs = await f.started();
  let retained;
  f.setCollector(async (outer, privateArgument) => {
    const capture = f.captureEvent(outer); f.publish(capture);
    retained = f.writeEvent(outer, capture.receipt, privateArgument.artifactTarget);
    // Known actual schema5 writeArtifact projection: one new artifact/data row,
    // task version advances; semantic stays unchanged. No DB or provenance claim.
    f.state.artifacts.push({ ...retained.receipt, verification: null });
    f.data.set(retained.receipt.recordRef, { recordRef: retained.receipt.recordRef, digest: retained.receipt.digest, kind: 'artifact', content: retained.input.content });
    f.task.version++; retained.receipt.task = copy(f.task);
    throw new BootstrapError('WRITE_UNKNOWN');
  });
  await reject(f.call('collectAuditResult', { ...refs, ...f.cas('write') }), 'WRITE_UNKNOWN');
  assert.equal(f.state.artifacts.at(-1).version, 4); assert.equal(f.state.semanticRevision, 7);
  assert.equal(f.calls.capture, 1); assert.equal(f.calls.write, 0);
  f.setCollector(async () => f.publish(retained));
  const result = await f.call('collectAuditResult', { ...refs, ...f.cas('recover-receipt') });
  assert.equal(result.artifact.version, 4); assert.equal(result.artifact.recordRef, retained.receipt.recordRef);
  assert.equal(f.calls.collect, 2); assert.equal(f.calls.capture, 1); assert.equal(f.calls.write, 1); assert.equal(f.state.artifacts.length, 2);
});

test('IF12 phase tags/content/cursors are complete; repair cannot submit and review cannot write', async t => {
  for (const purpose of ['audit_review', 'audit_repair']) {
    const f = fixture(t, { purpose }), refs = await f.started();
    f.setCollector(async (outer, privateArgument) => {
      const captured = f.captureEvent(outer); f.publish(captured);
      const wrong = purpose === 'audit_repair' ? f.submitEvent(outer, captured.receipt) : f.writeEvent(outer, captured.receipt, { artifactRef: f.ids.artifact, version: 4 });
      f.publish(wrong);
    });
    await reject(f.call('collectAuditResult', { ...refs, ...f.cas('wrong-role') }), 'AUDIT_RECEIPT_INVALID');
    assert.equal(f.calls.capture, 1); assert.equal(f.calls.submit + f.calls.write, 0);
    await reject(f.call('collectAuditResult', { ...refs, ...f.cas('sealed') }), 'SERVICE_DISPOSED');
  }
  const f = fixture(t), refs = await f.started();
  f.setCollector(async outer => { const e = f.captureEvent(outer); e.input.content += '!'; e.receipt.digest = H(e.input.content); e.receipt.byteLength++; f.publish(e); });
  await reject(f.call('collectAuditResult', { ...refs, ...f.cas('changed-bytes') }), 'AUDIT_RECEIPT_INVALID');
  assert.equal(f.calls.capture + f.calls.submit, 0);
});

test('IF13 post-capture transport denial preserves factual capture and denies submission/finish', async t => {
  const f = fixture(t), refs = await f.started(); let denied = false;
  f.setCollector(async outer => { f.publish(f.captureEvent(outer)); denied = true; throw new BootstrapError('SOURCE_CALLBACK_UNKNOWN'); });
  await reject(f.call('collectAuditResult', { ...refs, ...f.cas('denied') }, { assertCurrent() { if (denied) throw new BootstrapError('REQUEST_ABORTED'); return true; } }), 'REQUEST_ABORTED');
  assert.equal(f.calls.capture, 1); assert.equal(f.calls.submit + f.calls.finish, 0);
});

test('IF14 factual finish requires exact source receipt; held reservation does not free slot', async t => {
  const f = fixture(t), refs = await f.started(); await f.call('collectAuditResult', { ...refs, ...f.cas('collect') });
  f.setFinisher(async v => { const receipt = { task: copy(f.task), claimRef: v.claimRef, reservationHeld: true, outcome: 'completed' }; f.emit({ operation: 'finishExecution', input: v, receipt }); return receipt; });
  const v = { ...refs, ...f.cas('finish') }, receipt = await f.call('workerFinish', v);
  assert.equal(receipt.reservationHeld, true); assert.deepEqual(await f.call('workerFinish', v), receipt); assert.equal(f.calls.finish, 1);
  const another = await f.plan('other-review'); await f.grant(another); await reject(f.dispatch(another), 'REVIEWER_LIMIT');
  const g = fixture(t), grefs = await g.started(); await g.call('collectAuditResult', { ...grefs, ...g.cas('collect') });
  g.setFinisher(async () => ({ reservationHeld: false, outcome: 'completed' }));
  await reject(g.call('workerFinish', { ...grefs, ...g.cas('finish') }), 'AUDIT_COLLECTION_UNAVAILABLE');
  assert.equal(g.calls.finish, 1);
});

test('IF15 narrowing validateResult returns boolean and does not fabricate persisted usage facts', async t => {
  const f = fixture(t), a = await f.plan(); await f.grant(a); const w = await f.dispatch(a), row = f.state.actions[0], hooks = f.composition().nativeHooks;
  const binding = { taskRef: f.task.taskRef, actionRef: a.actionRef, actionDigest: a.actionDigest, claimRef: w.claimRef, generationRef: w.generationRef };
  const execution = { ...binding, executionRef: ref('hook-execution'), inputDigest: f.association.digest, dataDigest: f.association.artifactDigest };
  const agent = { id: 'df-' + row.spec.executor.generationRef };
  await runInstalledWorkerInvocation(f.api.ctx, admitted.assertCurrent, () => {
    hooks.setupAgent({}, agent, binding); assert.equal(hooks.commitAgent({}, agent, binding), true);
    assert.equal(hooks.bindExecution(agent, execution, { digest: f.association.digest, content: f.getPair().data.content }), true);
    const output = 'Typed bounded output', result = hooks.validateResult(agent, { executionRef: execution.executionRef, claimRef: w.claimRef, generationRef: w.generationRef, content: output, digest: H(output) });
    assert.equal(result, true); assert.notEqual(typeof result, 'object'); assert.equal(f.calls.nativeAssert, 1);
  });
});

test('IF16 disposal during collector wait seals future admission but keeps observed capture', async t => {
  const f = fixture(t), refs = await f.started(), hold = pause();
  f.setCollector(async outer => { f.publish(f.captureEvent(outer)); await hold.promise; return { echoed: true }; });
  const pending = f.call('collectAuditResult', { ...refs, ...f.cas('pending') }); await tick(); f.installed.dispose(); hold.resolve();
  await reject(pending, 'SERVICE_DISPOSED');
  await reject(f.call('collectAuditResult', { ...refs, ...f.cas('later') }), 'SERVICE_DISPOSED');
  assert.equal(f.calls.capture, 1); assert.equal(f.calls.submit + f.calls.finish, 0);
  assert.equal(f.calls.unsubscribe, 1); assert.equal(f.calls.dispose, 1); assert.equal(f.installed.status().reason, 'disposed');
});
