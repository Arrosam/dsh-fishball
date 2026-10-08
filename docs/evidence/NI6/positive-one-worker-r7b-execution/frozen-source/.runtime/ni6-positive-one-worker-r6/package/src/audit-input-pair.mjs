import { exact, ref, integer, canonical, canonicalDigest, hash, normalizedSpec } from './runtime-security.mjs';

// This validates an original host-owned projection; it cannot authenticate a
// caller-supplied pair or restore lost private planning/capture provenance.
export const AUDIT_EXECUTION_FIELDS = Object.freeze(['executionRef', 'taskRef', 'actionRef', 'actionDigest', 'claimRef', 'generationRef', 'sessionRef', 'inputRecordRef', 'inputDigest', 'dataDigest', 'auditRef', 'bindingDigest', 'materialDigest', 'purpose', 'semanticRevision']);
const ASSOCIATION = ['contractVersion', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'purpose', 'recordRef', 'digest', 'byteLength', 'bindingDigest', 'materialDigest', 'artifactRef', 'artifactVersion', 'artifactDigest', 'semanticRevision', 'sourceTaskVersion', 'sourceAuthEpoch', 'contextRecordRef', 'contextDigest', 'previousReportRef', 'material', 'inputByteLimit', 'resultByteLimit', 'createdAt'];
const DATA = ['recordRef', 'digest', 'kind', 'sourceRef', 'taskVersion', 'authEpoch', 'generationRef', 'createdAt', 'byteLength', 'cryptoVersion', 'sourceTaskVersion', 'sourceAuthEpoch', 'semanticRevision', 'memoryNamespaceRef', 'memoryRevision', 'auditInputRef', 'auditResultRef', 'content'];
const DATA_REQUIRED = DATA.filter(k => !['memoryNamespaceRef', 'memoryRevision', 'auditResultRef'].includes(k));
const fail = () => { throw new Error('AUDIT_INPUT_INVALID'); };
const same = (a, b) => canonical(a) === canonical(b);
export function validateAuditInputPair(value, spec, task) {
  // Canonical rejects proxies/accessors/thenables before nested property reads.
  canonical(value); canonical(task); exact(value, ['association', 'data']);
  spec = normalizedSpec(spec);
  const a = value.association, d = value.data, e = spec.executionInput;
  if (!e) fail();
  exact(a, ASSOCIATION); exact(d, DATA, DATA_REQUIRED);
  for (const k of ['ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'recordRef', 'digest', 'bindingDigest', 'materialDigest', 'artifactRef', 'artifactDigest', 'contextRecordRef', 'contextDigest']) ref(a[k]);
  for (const k of ['auditRevision', 'artifactVersion', 'semanticRevision', 'sourceTaskVersion']) integer(a[k], 1);
  integer(a.round, 0, 8); integer(a.sourceAuthEpoch); integer(a.createdAt);
  integer(a.inputByteLimit, 1, 65536); integer(a.resultByteLimit, 1, 65536); integer(a.byteLength, 1, a.inputByteLimit);
  if (!Array.isArray(a.material) || a.material.length < 2 || a.material.length > 16) fail();
  for (const m of a.material) { exact(m, ['recordRef', 'digest']); ref(m.recordRef); ref(m.digest); }
  const sorted = [...a.material].sort((x, y) => x.recordRef.localeCompare(y.recordRef));
  if (new Set(a.material.map(m => m.recordRef)).size !== a.material.length || !same(a.material, sorted) || canonicalDigest(a.material) !== a.materialDigest) fail();
  if (a.contractVersion !== 'df.audit-input-association/v1' || a.taskRef !== task.taskRef || a.ownerRef !== task.ownerRef || a.workspaceRef !== task.workspaceRef || a.sourceTaskVersion > task.version || a.sourceAuthEpoch > task.authEpoch) fail();
  if (a.recordRef !== e.recordRef || a.digest !== e.digest || a.purpose !== e.purpose || a.auditRef !== e.auditRef || a.bindingDigest !== e.bindingDigest || a.materialDigest !== e.materialDigest || a.artifactDigest !== spec.dataDigest || a.bindingDigest !== spec.targetDigest) fail();
  if (a.purpose === 'audit_repair' ? a.previousReportRef !== e.previousReportRef || !a.previousReportRef : a.previousReportRef !== null) fail();
  if (a.previousReportRef !== null) ref(a.previousReportRef);
  if (Object.hasOwn(d, 'auditResultRef') || d.recordRef !== a.recordRef || d.auditInputRef !== a.recordRef || d.kind !== 'context' || d.sourceRef !== a.auditRef || d.digest !== a.digest || d.cryptoVersion !== 2 || d.generationRef !== null || d.taskVersion !== a.sourceTaskVersion || d.authEpoch !== a.sourceAuthEpoch || d.sourceTaskVersion !== a.sourceTaskVersion || d.sourceAuthEpoch !== a.sourceAuthEpoch || d.semanticRevision !== a.semanticRevision || d.createdAt !== a.createdAt || d.byteLength !== a.byteLength || typeof d.content !== 'string' || !d.content.isWellFormed() || Buffer.byteLength(d.content) !== a.byteLength || hash(d.content) !== a.digest) fail();
  if (Object.hasOwn(d, 'memoryNamespaceRef')) ref(d.memoryNamespaceRef);
  if (Object.hasOwn(d, 'memoryRevision')) integer(d.memoryRevision);
  const b = JSON.parse(d.content); canonical(b);
  exact(b, ['contractVersion', 'purpose', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'semanticRevision', 'artifact', 'bindingDigest', 'materialDigest', 'policy', 'material', 'contextRecordRef', 'contextDigest', 'previousReport', 'responseContract']);
  exact(b.artifact, ['artifactRef', 'version', 'recordRef', 'digest']);
  exact(b.policy, ['policyRef', 'blockingSeverities', 'maxRepairRounds']); ref(b.policy.policyRef); integer(b.policy.maxRepairRounds, 0, 8);
  if (!Array.isArray(b.policy.blockingSeverities) || b.policy.blockingSeverities.length > 4 || new Set(b.policy.blockingSeverities).size !== b.policy.blockingSeverities.length || b.policy.blockingSeverities.some(s => !['fatal', 'blocking', 'warning', 'info'].includes(s))) fail();
  for (const k of ['purpose', 'ownerRef', 'workspaceRef', 'taskRef', 'auditRef', 'auditRevision', 'round', 'semanticRevision', 'bindingDigest', 'materialDigest', 'contextRecordRef', 'contextDigest']) if (b[k] !== a[k]) fail();
  if (b.contractVersion !== 'df.audit-input/v1' || b.responseContract !== 'df.audit-response/v1' || b.artifact.artifactRef !== a.artifactRef || b.artifact.version !== a.artifactVersion || b.artifact.digest !== a.artifactDigest || !a.material.some(m => m.recordRef === b.artifact.recordRef && m.digest === a.artifactDigest) || !a.material.some(m => m.recordRef === a.contextRecordRef && m.digest === a.contextDigest)) fail();
  if (!Array.isArray(b.material) || b.material.length !== a.material.length) fail();
  b.material.forEach((m, i) => {
    exact(m, ['recordRef', 'digest', 'kind', 'content']);
    if (m.recordRef !== a.material[i].recordRef || m.digest !== a.material[i].digest || typeof m.kind !== 'string' || !m.kind.length || typeof m.content !== 'string' || !m.content.isWellFormed() || hash(m.content) !== m.digest) fail();
  });
  if (a.previousReportRef === null ? b.previousReport !== null : b.previousReport?.reportRef !== a.previousReportRef) fail();
  const binding = { ownerRef: a.ownerRef, workspaceRef: a.workspaceRef, taskRef: a.taskRef, auditRef: a.auditRef, auditRevision: a.auditRevision, artifactRef: a.artifactRef, artifactVersion: a.artifactVersion, digest: a.artifactDigest, material: a.material, policyRef: b.policy.policyRef, blockingSeverities: b.policy.blockingSeverities, maxRepairRounds: b.policy.maxRepairRounds, round: a.purpose === 'audit_repair' ? a.round - 1 : a.round, semanticRevision: a.semanticRevision };
  if (canonicalDigest(binding) !== a.bindingDigest) fail();
  return JSON.parse(canonical(value));
}

export function approvedInputSource(execution) {
  canonical(execution);
  const audit = Object.hasOwn(execution, 'inputDigest');
  exact(execution, audit ? AUDIT_EXECUTION_FIELDS : ['executionRef', 'taskRef', 'claimRef', 'generationRef', 'contextRecordRef', 'actionDigest', 'dataDigest']);
  for (const [key, value] of Object.entries(execution)) {
    if (key === 'semanticRevision') integer(value, 1);
    else if (key === 'purpose') { if (!['audit_review', 'audit_repair'].includes(value)) fail(); }
    else ref(value);
  }
  return Object.freeze({ kind: audit ? 'df-audit-input' : 'df-context', form: 'local' });
}
