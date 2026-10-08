import { types } from 'node:util';
import { BootstrapError } from './config.mjs';
import { exact, ref, integer, canonical, canonicalDigest, hash, reference, normalizedSpec } from './runtime-security.mjs';
import { validateInstalledWorker } from './installed-worker-config.mjs';
import { validateExecutionContext } from './context.mjs';
import { assertInstalledWorkerInvocation, captureInstalledWorkerInvocation, withInstalledWorkerInvocation, runInstalledWorkerInvocation } from './installed-invocation.mjs';

const fail = code => { throw new BootstrapError(code); };
const R = (tag, ...parts) => canonicalDigest([tag, ...parts]);
const SAME = (a, b) => canonical(a) === canonical(b);
const immutable = value => {
  const copy = JSON.parse(canonical(value));
  const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
  return freeze(copy);
};
const SEVERITIES = ['fatal', 'blocking', 'warning', 'info'];
const taskCAS = ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch'];
const actionCAS = [...taskCAS, 'actionRef', 'actionDigest'];
const executionCAS = [...taskCAS, 'actionRef', 'claimRef', 'generationRef', 'executionRef'];
const API = ['ctx', 'snapshotOwner', 'readOwnerData', 'currentPolicy', 'planOwnerAction', 'prepareOwnerPreview', 'grantOwnerPreview', 'readProtectedContextFacts', 'readCapturedProducerFacts', 'readAuditActionFacts', 'readAuditInput', 'configureOwnerAudit', 'prepareOwnerAuditInput', 'assertNativeRequestCurrent', 'composeNativeAudit', 'subscribeRuntimeReceipts', 'isAlive'];
const ASSOCIATION = ['contractVersion', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'purpose', 'recordRef', 'digest', 'byteLength', 'bindingDigest', 'materialDigest', 'artifactRef', 'artifactVersion', 'artifactDigest', 'semanticRevision', 'sourceTaskVersion', 'sourceAuthEpoch', 'contextRecordRef', 'contextDigest', 'previousReportRef', 'material', 'inputByteLimit', 'resultByteLimit', 'createdAt'];
const DATA = ['recordRef', 'digest', 'kind', 'sourceRef', 'taskVersion', 'authEpoch', 'generationRef', 'createdAt', 'byteLength', 'cryptoVersion', 'sourceTaskVersion', 'sourceAuthEpoch', 'semanticRevision', 'memoryNamespaceRef', 'memoryRevision', 'auditInputRef', 'auditResultRef', 'content'];
const TAG = Object.freeze({ captureAuditResult: 'df.installed-audit.capture/v1', submitAuditResult: 'df.installed-audit.submit/v1', writeArtifact: 'df.installed-audit.repair-artifact/v1' });
function text(value, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.length || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value) || Buffer.byteLength(value) > max) fail('INVALID_INPUT');
  return value;
}
function list(value, max = 16) { canonical(value); if (!Array.isArray(value) || value.length > max) fail('INVALID_INPUT'); return value; }
function material(value) {
  const out = list(value).map(v => { exact(v, ['recordRef', 'digest']); ref(v.recordRef); ref(v.digest); return { ...v }; });
  if (!out.length || new Set(out.map(v => v.recordRef)).size !== out.length) fail('INVALID_INPUT');
  return immutable(out.sort((a, b) => a.recordRef.localeCompare(b.recordRef)));
}
function input(value, keys, required = keys) {
  exact(value, keys, required);
  for (const [key, v] of Object.entries(value)) {
    if (key.endsWith('Ref') || key.endsWith('Digest') || key === 'digest') ref(v);
    else if (['expectedTaskVersion', 'artifactVersion'].includes(key)) integer(v, 1);
    else if (['expectedAuthEpoch', 'expectedAuditRevision', 'expiresAt'].includes(key)) integer(v);
  }
  return immutable(value);
}
function role(value) {
  exact(value, ['selection', 'charges']); exact(value.selection, ['provider', 'model', 'agentPreset', 'reasoningEffort', 'maxOutputTokens']); exact(value.charges, ['runtimeMs', 'usageUnits']);
  for (const [key, max] of [['provider', 128], ['model', 256], ['agentPreset', 128]]) text(value.selection[key], max);
  if (value.selection.reasoningEffort !== null) text(value.selection.reasoningEffort, 128);
  integer(value.selection.maxOutputTokens, 128, 4096); integer(value.charges.runtimeMs, 1, 60000); integer(value.charges.usageUnits, 1, 100000000);
}
export function validateInstalledAudit(value) {
  try {
    if (value === undefined) return Object.freeze({ enabled: false });
    exact(value, ['enabled', 'inputByteLimit', 'resultByteLimit', 'maxPrivateReviewers', 'blockingSeverities', 'maxRepairRounds', 'maxTotalAttempts', 'review', 'repair'], ['enabled']);
    if (value.enabled === false) { exact(value, ['enabled']); return Object.freeze({ enabled: false }); }
    if (value.enabled !== true) fail('INVALID_INPUT');
    const keys = ['enabled', 'inputByteLimit', 'resultByteLimit', 'maxPrivateReviewers', 'blockingSeverities', 'maxRepairRounds', 'maxTotalAttempts', 'review'];
    integer(value.maxRepairRounds, 0, 8); exact(value, value.maxRepairRounds ? [...keys, 'repair'] : keys);
    integer(value.inputByteLimit, 1, 65536); integer(value.resultByteLimit, 1, 65536); integer(value.maxPrivateReviewers, 1, 32); integer(value.maxTotalAttempts, 2, 32);
    list(value.blockingSeverities, 4); if (new Set(value.blockingSeverities).size !== value.blockingSeverities.length || value.blockingSeverities.some(s => !SEVERITIES.includes(s))) fail('INVALID_INPUT');
    role(value.review); if (value.repair) role(value.repair);
    return immutable({ ...value, blockingSeverities: [...value.blockingSeverities].sort() });
  } catch { fail('CONFIG_INVALID'); }
}

// Private module boundary only. Original host classes, role prompts, lazy
// request permits, encrypted transactions and native receipts belong to the
// separately composed original runtime, never to owner JSON or these refs.
export function createInstalledAudit(value) {
  exact(value, ['selection', 'identity', 'profile', 'worker']);
  const choice = validateInstalledAudit(value.selection), worker = validateInstalledWorker(value.worker);
  exact(value.identity, ['ownerId', 'workspaceId']); exact(value.profile, ['dir', 'name']);
  const ownerRef = reference(value.identity.ownerId), workspaceRef = reference(value.identity.workspaceId);
  const configurationRef = R('df.installed-audit.config/v1', choice, worker);
  if (choice.enabled) {
    if (!worker.enabled || choice.resultByteLimit > worker.bounds.resultBytes) fail('CONFIG_INVALID');
    for (const selected of [choice.review, choice.repair].filter(Boolean)) if (selected.charges.runtimeMs > worker.policy.maxRuntimeMs || selected.charges.usageUnits > worker.policy.maxUsageUnits || selected.charges.usageUnits < worker.bounds.requestBytes + selected.selection.maxOutputTokens) fail('CONFIG_INVALID');
  }
  function installedAuditInstaller(api) {
    exact(api, [...API, 'nativeToolGuard','normalNative'], API);
    if(api.normalNative){exact(api.normalNative,['markSpec','plan','refreshConfiguration','readConfiguration','readPrepared','readResumeInput','observeHistory','validateHistory','subscribePrepared','readFinishFirst']);if(Object.values(api.normalNative).some(f=>typeof f!=='function'||types.isProxy(f)))fail('RUNTIME_ADAPTER_INVALID');}
    for (const key of API.filter(k => k !== 'ctx')) if (typeof api[key] !== 'function') fail('AUDIT_UNAVAILABLE');
    const nativeToolGuard = Object.getOwnPropertyDescriptor(api, 'nativeToolGuard')?.value;
    if (Object.hasOwn(api, 'nativeToolGuard') && (typeof nativeToolGuard !== 'function' || types.isProxy(nativeToolGuard) || types.isAsyncFunction(nativeToolGuard) || types.isGeneratorFunction(nativeToolGuard))) fail('AUDIT_UNAVAILABLE');
    if (!api.ctx || typeof api.ctx !== 'object' || types.isProxy(api.ctx)) fail('AUDIT_UNAVAILABLE');
    const ctx = api.ctx;
    let active = true, disposed = false, native, composing = false, lastNow = null;
    const plans = new Map(), slots = new Map(), outers = new Map(), expected = new Map(), previews = new Map(), agents = new WeakMap();
    let cached = statusValue(choice.enabled ? 'setup_required' : null);
    function statusValue(reason) { return immutable({ enabled: choice.enabled, ready: choice.enabled && reason === null, reason, bounds: choice.enabled ? { inputByteLimit: choice.inputByteLimit, resultByteLimit: choice.resultByteLimit, maxPrivateReviewers: choice.maxPrivateReviewers, maxRepairRounds: choice.maxRepairRounds } : null }); }
    function check() { if (!active || api.isAlive() !== true) fail('SERVICE_DISPOSED'); return assertInstalledWorkerInvocation(ctx); }
    function enabled() { if (!choice.enabled) fail('AUDIT_DISABLED'); check(); }
    function now() { const at = integer(Date.now(), 0, 8640000000000000); if (lastNow !== null && at < lastNow) fail('AUDIT_UNAVAILABLE'); lastNow = at; return at; }
    function sync(callback, arg) { check(); const out = callback(arg); if (types.isProxy(out) || types.isPromise(out)) fail('AUDIT_UNAVAILABLE'); canonical(out); check(); return immutable(out); }
    function snapshot(taskRef) {
      const snap = sync(api.snapshotOwner, { taskRef });
      if (snap.task.ownerRef !== ownerRef || snap.task.workspaceRef !== workspaceRef || snap.task.taskRef !== taskRef) fail('SCOPE_DENIED');
      return snap;
    }
    function cas(v) { const snap = snapshot(v.taskRef); if (snap.task.version !== v.expectedTaskVersion || snap.task.authEpoch !== v.expectedAuthEpoch) fail('STALE_VERSION'); return snap; }
    function facts(taskRef, purpose) {
      const out = sync(api.readAuditActionFacts, { taskRef, purpose });
      exact(out, ['configurationRef', 'nativeSourceRef', 'resourcePolicyVersion', 'modelPolicyVersion', 'presetRef', 'modelRef', 'reasoningRef', 'catalogEvidenceRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest', 'effectiveReasoningEffort', 'accounting', 'pricing', 'costProvenanceRef']);
      for (const [key, v] of Object.entries(out)) if (key.endsWith('Ref') || key.endsWith('Digest')) { if (key === 'costProvenanceRef' && v === null) continue; ref(v); }
      integer(out.resourcePolicyVersion, 1); integer(out.modelPolicyVersion, 1);
      const selected = choice[purpose]; if (!selected) fail('AUDIT_REPAIR_LIMIT');
      if (out.effectiveReasoningEffort !== null) text(out.effectiveReasoningEffort, 128);
      if (selected.selection.reasoningEffort !== null && selected.selection.reasoningEffort !== out.effectiveReasoningEffort) fail('AUDIT_SOURCE_STALE');
      if (!['source_zero', 'unknown'].includes(out.pricing) || out.pricing === 'unknown' && out.costProvenanceRef !== null) fail('AUDIT_UNAVAILABLE');
      if (out.pricing !== 'source_zero') { cached = statusValue('selection_unavailable'); fail('COST_UNKNOWN'); }
      ref(out.costProvenanceRef); text(out.accounting, 128);
      const policy = sync(api.currentPolicy);
      if (policy.version !== out.resourcePolicyVersion || policy.modelPolicy?.version !== out.modelPolicyVersion || policy.modelPolicy.catalogEvidenceRef !== out.catalogEvidenceRef || !policy.modelPolicy.presetRefs.includes(out.presetRef) || policy.limits.maxTotalAttempts < choice.maxTotalAttempts || policy.limits.maxAttempts !== 1 || policy.limits.maxActive !== 1 || selected.charges.runtimeMs > policy.limits.maxRuntimeMs || selected.charges.usageUnits > policy.limits.maxUsageUnits) { cached = statusValue('policy_unavailable'); fail('AUDIT_POLICY_REQUIRED'); }
      return { value: out, policy };
    }
    function protectedFacts(taskRef, recordRef, snap) {
      const f = sync(api.readProtectedContextFacts, { taskRef, contextRecordRef: recordRef });
      exact(f, ['recordRef', 'digest', 'kind', 'byteLength', 'cryptoVersion', 'originSourceRef', 'sourceTaskVersion', 'sourceAuthEpoch', 'memory', 'taskRef', 'taskVersion', 'authEpoch', 'semanticRevision', 'configurationRef', 'nativeSourceRef']);
      for (const k of ['recordRef', 'digest', 'originSourceRef', 'taskRef', 'configurationRef', 'nativeSourceRef']) ref(f[k]);
      exact(f.memory, ['namespaceRef', 'revision']); ref(f.memory.namespaceRef); integer(f.memory.revision);
      integer(f.byteLength, 1, 65536); integer(f.sourceTaskVersion, 1); integer(f.sourceAuthEpoch); integer(f.taskVersion, 1); integer(f.authEpoch); integer(f.semanticRevision, 1);
      if (f.taskRef !== taskRef || f.recordRef !== recordRef || f.kind !== 'context' || f.cryptoVersion !== 2 || f.taskVersion !== snap.task.version || f.authEpoch !== snap.task.authEpoch || f.semanticRevision !== snap.semanticRevision) fail('AUDIT_CONTEXT_REQUIRED');
      const data = sync(api.readOwnerData, { taskRef, recordRef });
      if (data.auditInputRef !== undefined || data.recordRef !== recordRef || data.kind !== 'context' || data.cryptoVersion !== 2 || data.digest !== f.digest || hash(data.content) !== f.digest || Buffer.byteLength(data.content) !== f.byteLength || data.sourceRef !== f.originSourceRef || data.sourceTaskVersion !== f.sourceTaskVersion || data.sourceAuthEpoch !== f.sourceAuthEpoch || data.semanticRevision !== f.semanticRevision) fail('AUDIT_CONTEXT_REQUIRED');
      const body = JSON.parse(data.content); validateExecutionContext(body, { scope: { ownerRef, workspaceRef, taskRef } });
      if (body.sourceTaskVersion !== f.sourceTaskVersion || body.sourceAuthEpoch !== f.sourceAuthEpoch || !SAME(body.memory.namespaceRef, f.memory.namespaceRef) || body.memory.revision !== f.memory.revision) fail('AUDIT_CONTEXT_REQUIRED');
      return f;
    }
    function producer(taskRef, artifactRef, version, digest, snap) {
      const f = sync(api.readCapturedProducerFacts, { taskRef, artifactRef, artifactVersion: version, digest });
      exact(f, ['taskRef', 'artifactRef', 'artifactVersion', 'recordRef', 'digest', 'producerClaimRef', 'generationRef', 'sessionRef', 'executionRef', 'inputDigest', 'cursor', 'resultDigest', 'configurationRef', 'nativeSourceRef']);
      for (const [k, v] of Object.entries(f)) if (k.endsWith('Ref') || k.endsWith('Digest') || k === 'digest') ref(v);
      integer(f.artifactVersion, 1); integer(f.cursor);
      const a = snap.artifacts.find(a => a.artifactRef === artifactRef && a.version === version);
      if (!a || f.taskRef !== taskRef || f.artifactRef !== artifactRef || f.artifactVersion !== version || f.digest !== digest || a.digest !== digest || a.recordRef !== f.recordRef || a.producerClaimRef !== f.producerClaimRef || a.generationRef !== f.generationRef) fail('AUDIT_PRODUCER_REQUIRED');
      const data = sync(api.readOwnerData, { taskRef, recordRef: a.recordRef });
      if (data.kind !== 'artifact' || data.recordRef !== a.recordRef || data.digest !== digest || hash(data.content) !== digest) fail('AUDIT_PRODUCER_REQUIRED');
      return f;
    }
    function pair(taskRef, inputRecordRef) {
      const out = sync(api.readAuditInput, { taskRef, inputRecordRef }); exact(out, ['association', 'data']);
      const a = out.association, d = out.data; exact(a, ASSOCIATION); exact(d, DATA, ['recordRef', 'digest', 'kind', 'sourceRef', 'taskVersion', 'authEpoch', 'generationRef', 'createdAt', 'byteLength', 'cryptoVersion', 'sourceTaskVersion', 'sourceAuthEpoch', 'semanticRevision', 'auditInputRef', 'content']);
      for (const k of ['ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'recordRef', 'digest', 'bindingDigest', 'materialDigest', 'artifactRef', 'artifactDigest', 'contextRecordRef', 'contextDigest']) ref(a[k]);
      for (const k of ['auditRevision', 'artifactVersion', 'semanticRevision', 'sourceTaskVersion']) integer(a[k], 1);
      integer(a.round, 0, 8); integer(a.sourceAuthEpoch); integer(a.createdAt); integer(a.inputByteLimit, 1, 65536); integer(a.resultByteLimit, 1, 65536); integer(a.byteLength, 1, a.inputByteLimit);
      const m = material(a.material);
      if (m.length < 2 || !SAME(a.material, m) || canonicalDigest(m) !== a.materialDigest || a.contractVersion !== 'df.audit-input-association/v1' || a.ownerRef !== ownerRef || a.workspaceRef !== workspaceRef || a.taskRef !== taskRef || a.recordRef !== inputRecordRef || !['audit_review', 'audit_repair'].includes(a.purpose)) fail('AUDIT_INPUT_REQUIRED');
      if (a.purpose === 'audit_repair') ref(a.previousReportRef); else if (a.previousReportRef !== null) fail('AUDIT_INPUT_REQUIRED');
      if (d.auditResultRef !== undefined || d.auditInputRef !== inputRecordRef || d.kind !== 'context' || d.recordRef !== inputRecordRef || d.digest !== a.digest || d.sourceRef !== a.auditRef || d.cryptoVersion !== 2 || d.generationRef !== null || d.semanticRevision !== a.semanticRevision || d.sourceTaskVersion !== a.sourceTaskVersion || d.sourceAuthEpoch !== a.sourceAuthEpoch || d.taskVersion !== a.sourceTaskVersion || d.authEpoch !== a.sourceAuthEpoch || d.createdAt !== a.createdAt || typeof d.content !== 'string' || !d.content.isWellFormed() || hash(d.content) !== a.digest || Buffer.byteLength(d.content) !== a.byteLength || d.byteLength !== a.byteLength) fail('AUDIT_INPUT_REQUIRED');
      const b = JSON.parse(d.content);
      exact(b, ['contractVersion', 'purpose', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'semanticRevision', 'artifact', 'bindingDigest', 'materialDigest', 'policy', 'material', 'contextRecordRef', 'contextDigest', 'previousReport', 'responseContract']);
      exact(b.artifact, ['artifactRef', 'version', 'recordRef', 'digest']); exact(b.policy, ['policyRef', 'blockingSeverities', 'maxRepairRounds']);
      ref(b.policy.policyRef); integer(b.policy.maxRepairRounds, 0, 8); list(b.policy.blockingSeverities, 4);
      if (!SAME(b.policy.blockingSeverities, choice.blockingSeverities) || b.policy.maxRepairRounds !== choice.maxRepairRounds) fail('AUDIT_POLICY_REQUIRED');
      for (const k of ['purpose', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'semanticRevision', 'bindingDigest', 'materialDigest', 'contextRecordRef', 'contextDigest']) if (b[k] !== a[k]) fail('AUDIT_INPUT_REQUIRED');
      if (b.contractVersion !== 'df.audit-input/v1' || b.responseContract !== 'df.audit-response/v1' || b.artifact.artifactRef !== a.artifactRef || b.artifact.version !== a.artifactVersion || b.artifact.digest !== a.artifactDigest || !m.some(v => v.recordRef === b.artifact.recordRef && v.digest === a.artifactDigest) || !m.some(v => v.recordRef === a.contextRecordRef && v.digest === a.contextDigest)) fail('AUDIT_INPUT_REQUIRED');
      if (a.previousReportRef === null ? b.previousReport !== null : b.previousReport?.reportRef !== a.previousReportRef) fail('AUDIT_INPUT_REQUIRED');
      list(b.material); if (b.material.length !== m.length) fail('AUDIT_INPUT_REQUIRED');
      b.material.forEach((v, i) => { exact(v, ['recordRef', 'digest', 'kind', 'content']); if (v.recordRef !== m[i].recordRef || v.digest !== m[i].digest || typeof v.content !== 'string' || !v.content.isWellFormed() || hash(v.content) !== v.digest) fail('AUDIT_INPUT_REQUIRED'); });
      const historicalBinding = { ownerRef: a.ownerRef, workspaceRef: a.workspaceRef, taskRef: a.taskRef, auditRef: a.auditRef, auditRevision: a.auditRevision, artifactRef: a.artifactRef, artifactVersion: a.artifactVersion, digest: a.artifactDigest, material: m, policyRef: b.policy.policyRef, blockingSeverities: b.policy.blockingSeverities, maxRepairRounds: b.policy.maxRepairRounds, round: a.purpose === 'audit_repair' ? a.round - 1 : a.round, semanticRevision: a.semanticRevision };
      if (canonicalDigest(historicalBinding) !== a.bindingDigest) fail('AUDIT_INPUT_REQUIRED');
      return out;
    }
    function currentPair(taskRef, value, snap, receiptArtifact = null) {
      const a = value.association, req = snap.audits.find(r => r.auditRef === a.auditRef);
      // Fresh effects require the original artifact to remain latest. The
      // private receipt-only branch separately proves the exact committed
      // fixed target, then checks every original material/semantic/source fact
      // against its retained historical artifact; it admits no new effect.
      const artifact = receiptArtifact ? snap.artifacts.find(r => r.artifactRef === a.artifactRef && r.version === a.artifactVersion) : snap.artifacts.filter(r => r.artifactRef === a.artifactRef).sort((x, y) => y.version - x.version)[0];
      if (!req || !artifact || req.auditRevision !== a.auditRevision || req.bindingDigest !== a.bindingDigest || req.materialDigest !== a.materialDigest || req.semanticRevision !== a.semanticRevision || snap.semanticRevision !== a.semanticRevision || artifact.version !== a.artifactVersion || artifact.digest !== a.artifactDigest || (a.purpose === 'audit_repair' ? req.round + 1 : req.round) !== a.round || a.purpose === 'audit_repair' && req.reportRef !== a.previousReportRef || !SAME(req.material, a.material) || a.byteLength > choice.inputByteLimit || a.resultByteLimit > choice.resultByteLimit || snap.control !== 'active') fail('AUDIT_STALE');
      if (!SAME(req.blockingSeverities, choice.blockingSeverities) || req.maxRepairRounds !== choice.maxRepairRounds) fail('AUDIT_POLICY_REQUIRED');
      for (const m of a.material) if (!snap.data.some(d => d.recordRef === m.recordRef && d.digest === m.digest)) fail('AUDIT_STALE');
      protectedFacts(taskRef, a.contextRecordRef, snap); producer(taskRef, a.artifactRef, a.artifactVersion, a.artifactDigest, snap);
      return req;
    }
    function repairReceiptCurrent(row, slot, snap) {
      if (row.spec.role !== 'repair' || row.slot !== slot || !slot.capture || !slot.target || slot.artifact || slot.ended) return null;
      const latest = snap.artifacts.filter(r => r.artifactRef === slot.target.artifactRef).sort((a, b) => b.version - a.version)[0];
      if (!latest || latest.version !== slot.target.version) return null;
      const captureOuter = [...slot.outers.values()].some(o => o.receipts.captureAuditResult && SAME(o.receipts.captureAuditResult, slot.capture));
      if (!captureOuter || latest.digest !== slot.capture.digest || latest.producerClaimRef !== slot.claimRef || latest.generationRef !== slot.generationRef) fail('AUDIT_STALE');
      ref(latest.recordRef);
      const data = sync(api.readOwnerData, { taskRef: row.taskRef, recordRef: latest.recordRef });
      if (data.kind !== 'artifact' || data.recordRef !== latest.recordRef || data.digest !== latest.digest || typeof data.content !== 'string' || !data.content.isWellFormed() || hash(data.content) !== slot.capture.digest || Buffer.byteLength(data.content) !== slot.capture.byteLength) fail('AUDIT_STALE');
      const f = facts(row.taskRef, row.spec.role);
      if (!SAME(f.value, row.facts) || !SAME(f.policy, row.policy) || !SAME(pair(row.taskRef, row.input.association.recordRef), row.input)) fail('AUDIT_SOURCE_STALE');
      currentPair(row.taskRef, row.input, snap, latest);
      return immutable(latest);
    }
    function planCurrent(taskRef, actionRef, digest, historical = false) {
      const row = plans.get(`${taskRef}:${actionRef}`); if (!row || digest !== undefined && row.actionDigest !== digest) fail('AUDIT_COLLECTION_UNAVAILABLE');
      const snap = snapshot(taskRef), actual = snap.actions.find(a => a.actionRef === actionRef);
      if (!actual || actual.actionDigest !== row.actionDigest || !SAME(actual.spec, row.spec)) fail('AUDIT_BINDING_MISMATCH');
      if (!historical) { const f = facts(taskRef, row.spec.role); if (!SAME(f.value, row.facts) || !SAME(f.policy, row.policy) || !SAME(pair(taskRef, row.input.association.recordRef), row.input)) fail('AUDIT_SOURCE_STALE'); currentPair(taskRef, row.input, snap); }
      return { row, snap, actual };
    }
    function bindingFor(row, outer) {
      const a = row.input.association;
      return immutable({ ownerRef, workspaceRef, taskRef: outer.taskRef, auditRef: a.auditRef, auditRevision: a.auditRevision, round: a.round, semanticRevision: a.semanticRevision, bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, artifactRef: a.artifactRef, artifactVersion: a.artifactVersion, artifactDigest: a.artifactDigest, inputRecordRef: a.recordRef, inputDigest: a.digest, purpose: a.purpose, actionRef: row.spec.actionRef, actionDigest: row.actionDigest, claimRef: outer.claimRef, generationRef: outer.generationRef, sessionRef: row.spec.executor.sessionRef, executionRef: outer.executionRef, outerInput: outer });
    }
    function phaseRecord(operation, v, receipt, outer, slot) {
      const b = bindingFor(slot.row, outer.input); let phaseInput;
      if (operation === 'captureAuditResult') {
        exact(v, ['taskRef', 'commandRef', 'claimRef', 'generationRef', 'executionRef', 'sessionRef', 'inputCursor', 'cursor', 'content', 'evidenceRef']);
        const { commandRef, content, ...rest } = v;
        if (typeof content !== 'string' || !content.isWellFormed() || Buffer.byteLength(content) > choice.resultByteLimit) fail('AUDIT_RECEIPT_INVALID');
        integer(v.inputCursor); integer(v.cursor, v.inputCursor + 1); ref(v.evidenceRef);
        phaseInput = { ...rest, contentDigest: hash(content), contentByteLength: Buffer.byteLength(content) };
        if (receipt.resultRef !== b.executionRef || receipt.recordRef === undefined || receipt.digest !== hash(content) || receipt.inputDigest !== b.inputDigest || receipt.inputRecordRef !== b.inputRecordRef || receipt.purpose !== b.purpose || receipt.bindingDigest !== b.bindingDigest || receipt.materialDigest !== b.materialDigest || receipt.auditRef !== b.auditRef || receipt.cursor !== v.cursor || receipt.inputCursor !== v.inputCursor || receipt.evidenceRef !== v.evidenceRef || receipt.byteLength !== Buffer.byteLength(content) || receipt.state !== 'captured') fail('AUDIT_RECEIPT_INVALID');
        ref(receipt.recordRef); ref(receipt.digest);
        for (const k of ['ownerRef', 'workspaceRef', 'taskRef', 'claimRef', 'generationRef', 'sessionRef', 'executionRef', 'actionRef', 'actionDigest']) if (receipt[k] !== b[k]) fail('AUDIT_RECEIPT_INVALID');
      } else if (operation === 'submitAuditResult') {
        exact(v, ['taskRef', 'commandRef', 'auditRef', 'executionRef', 'resultRef']);
        if (b.purpose !== 'audit_review' || !slot.capture || v.resultRef !== slot.capture.resultRef || v.auditRef !== b.auditRef) fail('AUDIT_RECEIPT_INVALID');
        phaseInput = { ...v, resultRecordRef: slot.capture.recordRef, resultDigest: slot.capture.digest, reviewerBinding: { taskRef: b.taskRef, auditRef: b.auditRef, claimRef: b.claimRef, generationRef: b.generationRef, sessionRef: b.sessionRef } }; delete phaseInput.commandRef;
        if (receipt.report?.claimRef !== b.claimRef || receipt.report?.generationRef !== b.generationRef || receipt.report?.auditRef !== b.auditRef || receipt.report?.digest !== b.artifactDigest || receipt.report?.materialDigest !== b.materialDigest || receipt.report?.native?.resultRef !== slot.capture.resultRef || receipt.verification?.resultRef !== slot.capture.resultRef) fail('AUDIT_RECEIPT_INVALID');
      } else {
        exact(v, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'producerClaimRef', 'generationRef', 'content']);
        if (b.purpose !== 'audit_repair' || !slot.capture || !slot.target || v.artifactRef !== slot.target.artifactRef || v.version !== slot.target.version || v.producerClaimRef !== b.claimRef || v.generationRef !== b.generationRef || typeof v.content !== 'string' || hash(v.content) !== slot.capture.digest) fail('AUDIT_RECEIPT_INVALID');
        const { content, commandRef, ...rest } = v;
        phaseInput = { resultRef: slot.capture.resultRef, resultRecordRef: slot.capture.recordRef, resultDigest: slot.capture.digest, artifactWrite: { ...rest, contentDigest: hash(content), contentByteLength: Buffer.byteLength(content) } };
        if (receipt.artifactRef !== v.artifactRef || receipt.version !== v.version || receipt.digest !== hash(content) || receipt.producerClaimRef !== b.claimRef || receipt.generationRef !== b.generationRef) fail('AUDIT_RECEIPT_INVALID');
      }
      if (v.taskRef !== b.taskRef || operation === 'captureAuditResult' && ['claimRef', 'generationRef', 'executionRef', 'sessionRef'].some(k => v[k] !== b[k])) fail('AUDIT_RECEIPT_INVALID');
      const cmd = canonicalDigest([TAG[operation], outer.input.commandRef, { binding: b, phaseInput }]);
      if (v.commandRef !== cmd) fail('AUDIT_RECEIPT_INVALID');
      return immutable(receipt);
    }
    const unsubscribe = api.subscribeRuntimeReceipts(event => {
      if (!active || !choice.enabled) return;
      try {
        exact(event, ['operation', 'input', 'receipt']); const { operation, input: v, receipt } = immutable(event);
        if (['memoryRemember', 'memoryCorrect', 'memoryForget', 'memoryImportConfirm', 'memoryDeleteConfirm'].includes(operation)) { for (const row of plans.values()) row.grant = null; previews.clear(); cached = statusValue('setup_required'); return; }
        if (['revoke', 'control', 'revise', 'policy'].includes(operation)) {
          for (const row of plans.values()) if (operation === 'policy' || row.taskRef === v.taskRef) row.grant = null;
          previews.clear(); cached = statusValue(operation === 'policy' ? 'policy_unavailable' : 'setup_required'); return;
        }
        if (operation === 'grant') {
          const key = `${operation}:${v.commandRef}`, wanted = expected.get(key); expected.delete(key);
          const row = plans.get(`${v.taskRef}:${v.actionRef}`);
          if (row && wanted === canonical(v) && receipt.actionDigest === row.actionDigest && receipt.task.ownerRef === ownerRef && receipt.task.workspaceRef === workspaceRef) row.grant = immutable({ taskVersion: receipt.task.version, authEpoch: receipt.task.authEpoch, expiresAt: v.expiresAt });
          return;
        }
        if (operation === 'finishExecution') {
          const slot = slots.get(`${v.taskRef}:${v.actionRef}`);
          if (slot?.finishInput && SAME(slot.finishInput, v) && receipt.claimRef === slot.claimRef && typeof receipt.reservationHeld === 'boolean' && receipt.outcome === 'completed' && receipt.task.ownerRef === ownerRef && receipt.task.workspaceRef === workspaceRef && receipt.task.taskRef === v.taskRef) slot.finishReceipt = receipt;
          return;
        }
        if (!TAG[operation]) return;
        const candidates = [...outers.values()].filter(o => o.busy && o.input.taskRef === v.taskRef);
        // Only a phase emitted during this exact source-owned collect call is
        // eligible. A header/echo or an unsolicited emitter cannot complete it.
        for (const o of candidates) {
          const slot = o.slot;
          if (o.receiptArtifact && operation !== 'writeArtifact') fail('AUDIT_RECEIPT_INVALID');
          if ((v.executionRef ?? slot.executionRef) !== slot.executionRef || (v.claimRef ?? v.producerClaimRef ?? slot.claimRef) !== slot.claimRef) continue;
          // An explicit reconciliation may recover an original child receipt.
          // Its command/input must still match a retained original outer,
          // rather than being rederived from the newer reconciliation CAS.
          let actual;
          const originals = o.receiptArtifact ? [...slot.outers.values()].filter(x => x !== o && x.receipts.captureAuditResult && SAME(x.receipts.captureAuditResult, slot.capture)) : [o, ...slot.outers.values()].filter((x, i, all) => all.indexOf(x) === i);
          for (const original of originals) {
            try { actual = phaseRecord(operation, v, receipt, original, slot); break; } catch { /* test the next exact retained phase identity */ }
          }
          if (!actual) fail('AUDIT_RECEIPT_INVALID');
          if (o.receiptArtifact && ['artifactRef', 'version', 'recordRef', 'digest', 'producerClaimRef', 'generationRef'].some(k => actual[k] !== o.receiptArtifact[k])) fail('AUDIT_RECEIPT_INVALID');
          if (operation === 'captureAuditResult') { if (slot.capture && !SAME(slot.capture, actual)) fail('IDEMPOTENCY_CONFLICT'); slot.capture = actual; }
          else if (operation === 'submitAuditResult') { if (slot.submission && !SAME(slot.submission, actual)) fail('IDEMPOTENCY_CONFLICT'); slot.submission = actual; }
          else { if (slot.artifact && !SAME(slot.artifact, actual)) fail('IDEMPOTENCY_CONFLICT'); slot.artifact = actual; }
          o.receipts[operation] = actual; return;
        }
        fail('AUDIT_RECEIPT_INVALID');
      } catch { active = false; cached = statusValue('disposed'); fail('AUDIT_RECEIPT_INVALID'); }
    });
    if (typeof unsubscribe !== 'function') fail('AUDIT_UNAVAILABLE');
    function nativeComposition() {
      enabled(); if (native) return native; if (composing) fail('AUDIT_UNAVAILABLE'); composing = true;
      const environments = {
        bind(spec, task) { const row = plans.get(`${task.taskRef}:${spec.actionRef}`); if (!row || !SAME(spec, row.spec)) fail('AUDIT_BINDING_MISMATCH'); return Object.freeze({ row }); },
        inspect(token, callback) { check(); const row = token?.row; if (!row || plans.get(`${row.taskRef}:${row.spec.actionRef}`) !== row) fail('AUDIT_BINDING_MISMATCH'); const selection = choice[row.spec.role].selection; return callback({ provider: selection.provider, model: selection.model, ...(row.facts.effectiveReasoningEffort === null ? {} : { reasoningEffort: row.facts.effectiveReasoningEffort }), maxOutputTokens: selection.maxOutputTokens, cwd: worker.environment.cwd }); },
        assertCurrent(token) { check(); const { row } = planCurrent(token.row.taskRef, token.row.spec.actionRef, token.row.actionDigest); return row.facts.nativeSourceRef; },
      };
      // These hooks narrow bindings. Original host composition must separately
      // enforce its held role prompt/preset/tools, one-use provider permit and
      // actual scoped persistence/usage collector; refs do not prove them.
      const nativeHooks = {
        setupAgent(agentCtx, agent, binding) { check(); const { row } = planCurrent(binding.taskRef, binding.actionRef, binding.actionDigest); if (!row.slot || !row.grant || agents.has(agent)) fail('AUDIT_BINDING_MISMATCH'); if (!agent || types.isProxy(agent) || agent.id !== 'df-' + row.spec.executor.generationRef || binding.generationRef !== row.spec.executor.generationRef) fail('AUDIT_BINDING_MISMATCH'); agents.set(agent, { row, binding: immutable(binding), execution: null, guard: null }); },
        commitAgent(agentCtx, agent, binding) { check(); const a = agents.get(agent); if (!a || !SAME(a.binding, binding)) fail('AUDIT_BINDING_MISMATCH'); return true; },
        bindExecution(agent, execution, body) { check(); const a = agents.get(agent); if (!a || a.execution || execution.inputDigest !== a.row.spec.executionInput.digest || execution.dataDigest !== a.row.spec.dataDigest || body.digest !== execution.inputDigest || hash(body.content) !== execution.inputDigest) fail('AUDIT_BINDING_MISMATCH'); a.execution = immutable(execution); a.guard = captureInstalledWorkerInvocation(ctx); return true; },
        validateResult(agent, result, checkpoint) { const a = agents.get(agent);
          if(checkpoint?.phase==='before_stop'){
            exact(checkpoint,['phase']);check();const w=a?.finalWitness;
            if(!w||w.agent!==agent||w.session!==agent.session||w.binding!==a.binding||w.execution!==a.execution||!SAME(result,w.result)||!a.binding.spec.nativeOriginBinding)fail('AUDIT_COLLECTION_UNAVAILABLE');
            const snap=snapshot(a.binding.taskRef),b=a.binding,e=a.execution;
            const actions=snap.actions.filter(v=>v.actionRef===b.actionRef&&v.actionDigest===b.actionDigest&&v.claimRef===b.claimRef&&SAME(v.spec,b.spec));
            const workers=snap.workers.filter(v=>v.actionRef===b.actionRef&&v.actionDigest===b.actionDigest&&v.claimRef===b.claimRef&&v.generationRef===b.generationRef&&v.sessionRef===b.sessionRef&&['created','ready','running'].includes(v.phase));
            const executions=snap.executions.filter(v=>['taskRef','actionRef','actionDigest','claimRef','generationRef','sessionRef','executionRef','inputRecordRef','inputDigest','dataDigest','auditRef','bindingDigest','materialDigest','purpose'].every(k=>v[k]===e[k]));
            if(actions.length!==1||workers.length!==1||executions.length!==1||executions[0].resultRef!==result.executionRef)fail('AUDIT_COLLECTION_UNAVAILABLE');
            // Captured associations are readonly facts. Completed review/repair
            // must not borrow old dispatch admission after original role writes.
            if(executions[0].reportRef){const reports=snap.reviews.filter(v=>v.reportRef===executions[0].reportRef&&v.resultRef===executions[0].resultRef&&v.generationRef===b.generationRef);if(reports.length!==1)fail('AUDIT_COLLECTION_UNAVAILABLE');}
            check();return true;
          }
          if(checkpoint!==undefined){exact(checkpoint,['phase','terminalEvidenceRef']);ref(checkpoint.terminalEvidenceRef);if(checkpoint.phase!=='stopped'||!a?.finalWitness||a.finalWitness.session!==agent.session||!SAME(result,a.finalWitness.result))fail('AUDIT_COLLECTION_UNAVAILABLE');check();const workers=snapshot(a.binding.taskRef).workers.filter(v=>v.claimRef===a.binding.claimRef&&v.generationRef===a.binding.generationRef&&v.sessionRef===a.binding.sessionRef&&v.phase==='stopped'&&v.terminalEvidenceRef===checkpoint.terminalEvidenceRef);if(workers.length!==1)fail('AUDIT_COLLECTION_UNAVAILABLE');return true;}if(result.phase==='baseline'){if(!a||!a.binding.spec.nativeOriginBinding||a.execution||result.claimRef!==a.binding.claimRef||result.generationRef!==a.binding.generationRef||result.sessionRef!==a.binding.sessionRef)fail('AUDIT_COLLECTION_UNAVAILABLE');check();return true;} if (!a?.execution || !a.guard) fail('AUDIT_COLLECTION_UNAVAILABLE'); return withInstalledWorkerInvocation(ctx, a.guard, () => { check(); if (result.executionRef !== a.execution.executionRef || result.claimRef !== a.binding.claimRef || result.generationRef !== a.binding.generationRef || typeof result.content !== 'string' || hash(result.content) !== result.digest || Buffer.byteLength(result.content) > choice.resultByteLimit) fail('AUDIT_RECEIPT_INVALID'); api.assertNativeRequestCurrent({ taskRef: a.execution.taskRef, claimRef: a.execution.claimRef, generationRef: a.execution.generationRef, actionDigest: a.execution.actionDigest, executionRef: a.execution.executionRef }); if(a.binding.spec.nativeOriginBinding)a.finalWitness=Object.freeze({agent,session:agent.session,binding:a.binding,execution:a.execution,result});return true; }); },
      };
      try {
        native = api.composeNativeAudit({ worker: Object.freeze({ environments, permission: record => hostPermission(record), toolGuard: hostToolGuard, resolveSession: undefined }), nativeHooks: Object.freeze(nativeHooks) });
        exact(native, ['dispatch', 'executeApprovedInput', 'query', 'sessionLink', 'collectAuditResult', 'finishExecution', 'dispose']); for (const v of Object.values(native)) if (typeof v !== 'function') fail('AUDIT_UNAVAILABLE');
        cached = statusValue(null); return native;
      } catch (error) { composing = false; cached = statusValue('worker_unavailable'); throw error; }
    }
    let toolGuardRunning = false, toolGuardReentered = false;
    function toolCurrent(record) {
      enabled();
      exact(record, ['agent', 'taskRef', 'generationRef', 'claimRef', 'toolsDigest', 'permissionPolicyDigest', 'schemas'], ['agent', 'taskRef', 'generationRef', 'toolsDigest', 'permissionPolicyDigest', 'schemas']);
      for (const key of ['taskRef', 'generationRef', 'claimRef', 'toolsDigest', 'permissionPolicyDigest']) ref(record[key]);
      if (!Object.isFrozen(record) || !record.agent || typeof record.agent !== 'object' || types.isProxy(record.agent)) fail('AUDIT_BINDING_MISMATCH');
      canonical(record.schemas);
      if (!Array.isArray(record.schemas) || record.schemas.length !== 0 || !Object.isFrozen(record.schemas)) fail('AUDIT_BINDING_MISMATCH');
      const agent = agents.get(record.agent), row = agent?.row, slot = row?.slot, binding = agent?.binding;
      if (!row || !slot || slot.ended || slot.finishInput || slots.get(`${row.taskRef}:${row.spec.actionRef}`) !== slot || slot.row !== row || plans.get(`${row.taskRef}:${row.spec.actionRef}`) !== row) fail('AUDIT_BINDING_MISMATCH');
      if (!['review', 'repair'].includes(row.spec.role) || row.spec.kind !== row.spec.role || row.spec.executor.mode !== 'create' || row.spec.executionInput.purpose !== `audit_${row.spec.role}`) fail('AUDIT_BINDING_MISMATCH');
      if (record.taskRef !== row.taskRef || record.generationRef !== row.spec.executor.generationRef || slot.generationRef !== record.generationRef || record.toolsDigest !== row.spec.executor.toolsDigest || record.permissionPolicyDigest !== row.spec.executor.permissionPolicyDigest) fail('AUDIT_BINDING_MISMATCH');
      if (binding.taskRef !== row.taskRef || binding.actionRef !== row.spec.actionRef || binding.actionDigest !== row.actionDigest || binding.generationRef !== record.generationRef || binding.sessionRef !== row.spec.executor.sessionRef || !SAME(binding.spec, row.spec) || binding.claimRef !== record.claimRef || slot.claimRef !== null && slot.claimRef !== record.claimRef) fail('AUDIT_BINDING_MISMATCH');
      const current = planCurrent(row.taskRef, row.spec.actionRef, row.actionDigest);
      if (current.row !== row || !row.grant || row.grant.authEpoch !== current.snap.task.authEpoch || row.grant.expiresAt <= now()) fail('AUDIT_BINDING_MISMATCH');
      check(); return row;
    }
    function hostToolGuard(record) {
      if (toolGuardRunning) { toolGuardReentered = true; return false; }
      if (!nativeToolGuard) return false;
      toolGuardRunning = true; toolGuardReentered = false;
      try {
        const row = toolCurrent(record);
        if (nativeToolGuard(record) !== true || toolGuardReentered) return false;
        return toolCurrent(record) === row && !toolGuardReentered;
      } catch { return false; }
      finally { toolGuardRunning = false; }
    }
    function hostPermission(record) {
      try {
        if (!choice.enabled || !active || api.isAlive() !== true) return false;
        assertInstalledWorkerInvocation(ctx); canonical(record);
        const row = plans.get(`${record.taskRef}:${record.actionRef}`);
        return Boolean(row?.grant && record.ownerRef === ownerRef && record.workspaceRef === workspaceRef && record.actionDigest === row.actionDigest && SAME(record.spec, row.spec) && record.authEpoch === row.grant.authEpoch && row.grant.expiresAt > now());
      } catch { return false; }
    }
    const methods = {
      configureAudit(v) {
        v = input(v, [...taskCAS, 'auditRef', 'expectedAuditRevision', 'artifactRef', 'artifactVersion', 'digest', 'contextRecordRef', 'material']); enabled(); const snap = cas(v), context = protectedFacts(v.taskRef, v.contextRecordRef, snap), p = producer(v.taskRef, v.artifactRef, v.artifactVersion, v.digest, snap), f = facts(v.taskRef, 'review');
        const m = material(v.material); if (!m.some(x => x.recordRef === context.recordRef && x.digest === context.digest) || !m.some(x => x.recordRef === p.recordRef && x.digest === p.digest)) fail('AUDIT_BINDING_MISMATCH');
        const policyRef = R('df.installed-audit.policy/v1', configurationRef, f.value.configurationRef, f.value.nativeSourceRef, f.policy.version, f.policy.modelPolicy.version);
        cas(v); check(); return immutable(api.configureOwnerAudit({ ...v, material: m, policyRef, blockingSeverities: choice.blockingSeverities, maxRepairRounds: choice.maxRepairRounds }));
      },
      prepareAuditInput(v) {
        v = input(v, [...taskCAS, 'auditRef', 'expectedAuditRevision', 'purpose', 'round', 'previousReportRef'], [...taskCAS, 'auditRef', 'expectedAuditRevision', 'purpose', 'round']); enabled(); integer(v.round, 0, 8);
        if (!['audit_review', 'audit_repair'].includes(v.purpose) || (v.purpose === 'audit_repair' ? !v.previousReportRef : v.previousReportRef !== undefined)) fail('INVALID_INPUT');
        const snap = cas(v), req = snap.audits.find(r => r.auditRef === v.auditRef); if (!req || req.auditRevision !== v.expectedAuditRevision) fail('AUDIT_STALE');
        protectedFacts(v.taskRef, req.contextRecordRef, snap); producer(v.taskRef, req.artifactRef, req.artifactVersion, req.digest, snap); facts(v.taskRef, v.purpose === 'audit_review' ? 'review' : 'repair'); check(); return immutable(api.prepareOwnerAuditInput(v));
      },
      async planAuditAction(v) {
        v = input(v, [...taskCAS, 'auditRef', 'inputRecordRef', 'purpose']); enabled();if(api.normalNative){await api.normalNative.refreshConfiguration();enabled();} const snap = cas(v), p = pair(v.taskRef, v.inputRecordRef), a = p.association;
        if (v.auditRef !== a.auditRef || v.purpose !== a.purpose) fail('AUDIT_BINDING_MISMATCH'); currentPair(v.taskRef, p, snap); const kind = a.purpose === 'audit_review' ? 'review' : 'repair', f = facts(v.taskRef, kind);
        const seed = { ownerRef, workspaceRef, taskRef: v.taskRef, auditRef: a.auditRef, round: a.round, inputDigest: a.digest, configurationRef, commandRef: v.commandRef }, actionRef = R('df.installed-audit.action/v1', seed), generationRef = R('df.installed-audit.generation/v1', seed);
        let spec = normalizedSpec({ actionRef, kind, role: kind, targetDigest: a.bindingDigest, dataDigest: a.artifactDigest, units: 1, charges: { ...choice[kind].charges, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: f.value.costProvenanceRef }, attemptGroupRef: R('df.installed-audit.attempt/v1', seed), attemptIndex: 1, resourcePolicyVersion: f.value.resourcePolicyVersion, modelPolicyVersion: f.value.modelPolicyVersion, model: Object.fromEntries(['presetRef', 'modelRef', 'reasoningRef', 'catalogEvidenceRef'].map(k => [k, f.value[k]])), executor: { mode: 'create', generationRef, sessionRef: reference('df-' + generationRef), ...Object.fromEntries(['environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'].map(k => [k, f.value[k]])) }, executionInput: { recordRef: a.recordRef, digest: a.digest, purpose: a.purpose, auditRef: a.auditRef, bindingDigest: a.bindingDigest, materialDigest: a.materialDigest, ...(kind === 'repair' ? { previousReportRef: a.previousReportRef } : {}) } });
        if(api.normalNative)spec=api.normalNative.markSpec(spec);
        const existing = plans.get(`${v.taskRef}:${actionRef}`);
        if (!existing && plans.size >= choice.maxTotalAttempts) fail('AUDIT_COLLECT_CAPACITY');
        const { auditRef, inputRecordRef, purpose, ...core } = v;
        check(); const receipt = immutable(api.normalNative?api.normalNative.plan({ ...core, spec },a.contextRecordRef):api.planOwnerAction({ ...core, spec }));
        ref(receipt.actionDigest);
        const planned = snapshot(v.taskRef).actions.find(item => item.actionRef === actionRef);
        if (receipt.actionRef !== actionRef || !planned || planned.actionDigest !== receipt.actionDigest || !SAME(planned.spec, spec)) fail('AUDIT_RECEIPT_INVALID');
        if (existing) { if (!SAME(existing.spec, spec) || !SAME(existing.input, p)) fail('IDEMPOTENCY_CONFLICT'); }
        else plans.set(`${v.taskRef}:${actionRef}`, { taskRef: v.taskRef, spec: immutable(spec), actionDigest: receipt.actionDigest, input: p, facts: f.value, policy: f.policy, grant: null, slot: null }); return receipt;
      },
      async auditPreview(v) {
        v = input(v, ['taskRef', 'actionRef', 'actionDigest', 'recordRef', 'expectedTaskVersion', 'expectedAuthEpoch']); enabled(); cas(v); const { row } = planCurrent(v.taskRef, v.actionRef, v.actionDigest); if (v.recordRef !== row.input.association.recordRef) fail('AUDIT_INPUT_REQUIRED');
        const receipt = await api.prepareOwnerPreview(v); check(); planCurrent(v.taskRef, v.actionRef, v.actionDigest); cas(v); canonical(receipt);
        if (Buffer.byteLength(JSON.stringify({ ok: true, value: receipt })) > 65536) fail('PREVIEW_UNAVAILABLE'); ref(receipt.previewRef);
        if (previews.size >= 64) fail('PREVIEW_CAPACITY'); previews.set(receipt.previewRef, { row, input: v, receipt: immutable(receipt) }); return immutable(receipt);
      },
      async auditGrant(v) {
        v = input(v, [...actionCAS, 'expiresAt', 'previewRef', 'accept']); enabled(); if (v.accept !== true) fail('AUDIT_CONFIRMATION_REQUIRED');
        const preview = previews.get(v.previewRef); if (!preview || preview.row.spec.actionRef !== v.actionRef || v.expiresAt <= now() || v.expiresAt > now() + worker.grantTtlMs) fail('PREVIEW_STALE');
        if (preview.busy) fail('PREVIEW_STALE'); preview.busy = true;
        cas(v); planCurrent(v.taskRef, v.actionRef, v.actionDigest); const { accept, ...grant } = v, { previewRef, ...core } = grant;
        expected.set(`grant:${v.commandRef}`, canonical(core)); check(); const receipt = await api.grantOwnerPreview(grant); check(); previews.delete(v.previewRef);
        if (!preview.row.grant) fail('AUDIT_GRANT_UNAVAILABLE'); return immutable(receipt);
      },
      async dispatchAudit(v) {
        v = input(v, [...actionCAS, 'timeoutMs'], actionCAS); enabled(); if (v.timeoutMs !== undefined) integer(v.timeoutMs, 1, 60000); cas(v); const { row, snap } = planCurrent(v.taskRef, v.actionRef, v.actionDigest);
        if (row.slot || !row.grant) fail('AUDIT_ALREADY_SUBMITTED');
        if (slots.size >= choice.maxTotalAttempts) fail('AUDIT_COLLECT_CAPACITY');
        const reviewers = [...slots.values()].filter(s => s.row.spec.role === 'review' && !s.ended).length;
        if (row.spec.role === 'review' && (reviewers >= choice.maxPrivateReviewers || reviewers >= snap.policy.limits.maxActive)) fail('REVIEWER_LIMIT');
        const slot = { row, claimRef: null, generationRef: row.spec.executor.generationRef, executionRef: null, capture: null, submission: null, artifact: null, target: row.spec.role === 'repair' ? immutable({ artifactRef: row.input.association.artifactRef, version: integer(row.input.association.artifactVersion + 1, 1) }) : null, outers: new Map(), ended: false };
        slots.set(`${v.taskRef}:${v.actionRef}`, slot); row.slot = slot;
        const a = row.input.association, repair = row.spec.role === 'repair' ? { auditRepair: immutable({ auditRef: a.auditRef, round: a.round, previousReportRef: a.previousReportRef, evidenceRef: R('df.installed-audit.repair-lineage/v1', row.actionDigest, a.previousReportRef, a.digest) }) } : {};
        check(); const out = await nativeComposition().dispatch({ ...v, ...repair }); check();
        const w = out.worker ?? out; if (w.actionRef !== v.actionRef || w.actionDigest !== v.actionDigest || w.generationRef !== slot.generationRef || w.taskRef !== v.taskRef || w.sessionRef !== row.spec.executor.sessionRef) fail('AUDIT_BINDING_MISMATCH'); slot.claimRef = ref(w.claimRef); return immutable(out);
      },
      async executeAudit(v) {
        v = input(v, [...actionCAS, 'claimRef', 'generationRef', 'inputRecordRef', 'timeoutMs'], [...actionCAS, 'claimRef', 'generationRef', 'inputRecordRef']); enabled(); if (v.timeoutMs !== undefined) integer(v.timeoutMs, 1, 60000); cas(v); const { row } = planCurrent(v.taskRef, v.actionRef, v.actionDigest), s = row.slot;
        if (!s || s.ended || s.executionSubmitted || s.claimRef !== v.claimRef || s.generationRef !== v.generationRef || v.inputRecordRef !== row.input.association.recordRef) fail('AUDIT_BINDING_MISMATCH');
        s.executionSubmitted = immutable(v);
        check(); const out = await nativeComposition().executeApprovedInput(v); check(); s.executionRef = ref(out.executionRef ?? out.execution?.executionRef); return immutable(out);
      },
      async collectAuditResult(v) {
        v = input(v, executionCAS); enabled();
        const { row } = planCurrent(v.taskRef, v.actionRef, undefined, true), slot = row.slot;
        if (!slot || slot.claimRef !== v.claimRef || slot.generationRef !== v.generationRef || slot.executionRef !== v.executionRef) fail('AUDIT_COLLECTION_UNAVAILABLE');
        const key = canonical({ ownerRef, workspaceRef, taskRef: v.taskRef, operation: 'collectAuditResult', commandRef: v.commandRef }), digest = canonicalDigest(v);
        let outer = outers.get(key);
        if (outer) { if (outer.digest !== digest) fail('IDEMPOTENCY_CONFLICT'); if (outer.completed) return outer.completed; if (outer.busy) fail('AUDIT_COLLECT_BUSY'); }
        else {
          if (slot.outers.size >= choice.maxTotalAttempts) fail('AUDIT_COLLECT_CAPACITY');
          outer = { digest, input: v, slot, operationRef: R('df.installed-audit.collect-operation/v1', { ownerRef, workspaceRef, taskRef: v.taskRef }, v), busy: false, receipts: {}, completed: null };
          outers.set(key, outer); slot.outers.set(key, outer);
        }
        if (slot.artifact || slot.submission) { outer.completed = immutable(slot.artifact ? { capture: slot.capture, artifact: slot.artifact } : slot.submission); return outer.completed; }
        const current = cas(v);
        outer.receiptArtifact = repairReceiptCurrent(row, slot, current);
        if (!outer.receiptArtifact) planCurrent(v.taskRef, v.actionRef);
        if (slot.ended) fail('AUDIT_COLLECTION_UNAVAILABLE'); outer.busy = true;
        try {
          check(); await nativeComposition().collectAuditResult(v, immutable({ operationRef: outer.operationRef, artifactTarget: slot.target })); check();
          // Only original private receipt publication completes a phase.
          if (slot.artifact || slot.submission) { outer.completed = immutable(slot.artifact ? { capture: slot.capture, artifact: slot.artifact } : slot.submission); return outer.completed; }
          return immutable({ state: 'unknown', executionRef: v.executionRef, resultRef: slot.capture?.resultRef ?? null });
        } finally { outer.busy = false; }
      },
      async workerFinish(v) {
        v = input(v, executionCAS); if(api.normalNative){const ack=api.normalNative.readFinishFirst(v);if(ack!==null)return ack.receipt;} enabled(); cas(v); const { row } = planCurrent(v.taskRef, v.actionRef, undefined, true), s = row.slot;
        if (!s || s.claimRef !== v.claimRef || s.generationRef !== v.generationRef || s.executionRef !== v.executionRef || !s.capture) fail('AUDIT_COLLECTION_UNAVAILABLE');
        if (s.finishInput) {
          if (!SAME(s.finishInput, v)) fail('IDEMPOTENCY_CONFLICT');
          if (s.finishReceipt) return s.finishReceipt;
          fail('AUDIT_COLLECTION_UNAVAILABLE');
        }
        s.finishInput = v;
        check(); await nativeComposition().finishExecution(v); check();
        if (!s.finishReceipt) fail('AUDIT_COLLECTION_UNAVAILABLE');
        s.ended = s.finishReceipt.reservationHeld === false; row.grant = null; return s.finishReceipt;
      },
    };
    const operations = Object.freeze(Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, (v, guard) => {
      exact(guard, ['assertCurrent']); if (typeof guard.assertCurrent !== 'function') fail('SERVICE_DISPOSED');
      return runInstalledWorkerInvocation(ctx, guard.assertCurrent, () => { if (!choice.enabled) fail('AUDIT_DISABLED'); return method(v); });
    }])));
    async function previewResolver(spec, task) {
      enabled(); const { row } = planCurrent(task.taskRef, spec.actionRef); if (!SAME(row.spec, spec)) fail('AUDIT_BINDING_MISMATCH');
      const roleChoice = choice[spec.role].selection;
      return immutable({ targetDigest: spec.targetDigest, ...spec.model, ...Object.fromEntries(['environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest'].map(k => [k, spec.executor[k]])), evidenceRef: R('df.installed-audit.preview/v1', configurationRef, row.facts.nativeSourceRef, spec.executionInput), targetLabel: `Create a fresh ${spec.role} session and explicitly execute the full approved audit input once. Artifact and input digests remain separate. Native transcript is unencrypted with owner-managed retention.`, providerLabel: roleChoice.provider, modelLabel: roleChoice.model, reasoningLabel: row.facts.effectiveReasoningEffort ?? 'Native default', presetLabel: roleChoice.agentPreset, environmentLabel: 'Owned native workspace', cwd: worker.environment.cwd, toolNames: [] });
    }
    return Object.freeze({ hostPermission, previewResolver, previewTtlMs: choice.enabled ? worker.previewTtlMs : null, operations, status: () => cached, dispose() { if (disposed) return; disposed = true; active = false; cached = choice.enabled ? statusValue('disposed') : statusValue(null); previews.clear(); for (const row of plans.values()) row.grant = null; unsubscribe(); if (native) native.dispose(); } });
  }
  return Object.freeze({ installedAuditInstaller });
}
