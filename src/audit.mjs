import { fields, digestRef, integer, choice, boundedArray, immutable, binding, contentDigest, reject } from './messages.mjs';

const SEVERITIES = ['fatal', 'blocking', 'warning', 'info'];
function references(input, max = 16) {
  const refs = boundedArray(input, max).map(digestRef);
  if (new Set(refs).size !== refs.length) reject('INVALID_INPUT');
  return refs;
}

// These normalizers reject malformed metadata; identity and consent are
// exclusively enforced by the authoritative store's opaque capabilities.
export function normalizeAuditMaterial(input) {
  const material = boundedArray(input).map(item => {
    fields(item, ['recordRef', 'digest']);
    return { recordRef: digestRef(item.recordRef), digest: digestRef(item.digest) };
  });
  if (material.length === 0 || new Set(material.map(item => item.recordRef)).size !== material.length) reject('INVALID_INPUT');
  return immutable(material.sort((a, b) => a.recordRef.localeCompare(b.recordRef)));
}

export function normalizeAuditPolicy(input) {
  fields(input, ['policyRef', 'blockingSeverities', 'maxRepairRounds']);
  digestRef(input.policyRef); integer(input.maxRepairRounds, 0, 8);
  const blockingSeverities = boundedArray(input.blockingSeverities, SEVERITIES.length).map(value => choice(value, SEVERITIES));
  if (new Set(blockingSeverities).size !== blockingSeverities.length) reject('INVALID_INPUT');
  // Fatal findings always block. The explicit configured list determines
  // other thresholds; there is no selected product policy or round default.
  return immutable({ ...input, blockingSeverities: blockingSeverities.sort() });
}

export function normalizeAuditRequirement(input) {
  fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'expectedAuditRevision', 'auditRef', 'artifactRef', 'artifactVersion', 'digest', 'material', 'policyRef', 'blockingSeverities', 'maxRepairRounds']);
  binding(input); integer(input.expectedAuditRevision);
  for (const key of ['auditRef', 'artifactRef', 'digest']) digestRef(input[key]);
  integer(input.artifactVersion, 1);
  const material = normalizeAuditMaterial(input.material), policy = normalizeAuditPolicy({ policyRef: input.policyRef, blockingSeverities: input.blockingSeverities, maxRepairRounds: input.maxRepairRounds });
  return immutable({ ...input, material, ...policy });
}

export function normalizeAuditReport(input) {
  fields(input, ['taskRef', 'commandRef', 'auditRef', 'artifactVersion', 'digest', 'materialDigest', 'claimRef', 'generationRef', 'coverageRefs', 'unexaminedRefs', 'verdict', 'findings', 'evidenceRef']);
  for (const key of ['taskRef', 'commandRef', 'auditRef', 'digest', 'materialDigest', 'claimRef', 'generationRef', 'evidenceRef']) digestRef(input[key]);
  integer(input.artifactVersion, 1);
  choice(input.verdict, ['passed', 'failed', 'unknown', 'budget_exhausted']);
  const coverageRefs = references(input.coverageRefs), unexaminedRefs = references(input.unexaminedRefs);
  if (coverageRefs.some(ref => unexaminedRefs.includes(ref))) reject('COVERAGE_CONFLICT');
  const findings = boundedArray(input.findings).map(finding => {
    fields(finding, ['findingRef', 'severity', 'code', 'evidenceRef', 'resolved']);
    digestRef(finding.findingRef); digestRef(finding.evidenceRef); choice(finding.severity, SEVERITIES);
    choice(finding.code, ['scope_violation', 'permission_bypass', 'secret_exposure', 'artifact_mismatch', 'coverage_gap', 'review_failure', 'other']);
    if (typeof finding.resolved !== 'boolean') reject('INVALID_INPUT');
    return finding;
  });
  if (new Set(findings.map(finding => finding.findingRef)).size !== findings.length) reject('INVALID_INPUT');
  return immutable({ ...input, coverageRefs: coverageRefs.sort(), unexaminedRefs: unexaminedRefs.sort(), findings });
}

export function normalizeAuditRepair(input) {
  fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'auditRef', 'claimRef', 'generationRef', 'round', 'previousReportRef', 'evidenceRef']);
  binding(input);
  for (const key of ['taskRef', 'commandRef', 'auditRef', 'claimRef', 'generationRef', 'previousReportRef', 'evidenceRef']) digestRef(input[key]);
  integer(input.round, 1, 8);
  return immutable(input);
}

export class RuntimeAudit {
  #store;
  constructor(store) {
    if (!store || ['configureAudit', 'reportAudit', 'recordRepair', 'audit'].some(name => typeof store[name] !== 'function')) reject('CAPABILITY_UNAVAILABLE');
    this.#store = store;
  }
  configure(handle, input) {
    return immutable(this.#store.configureAudit(handle, normalizeAuditRequirement(input)));
  }
  report(handle, input) {
    const report = normalizeAuditReport(input);
    return immutable(this.#store.reportAudit(handle, report));
  }
  repair(handle, input) {
    return immutable(this.#store.recordRepair(handle, normalizeAuditRepair(input)));
  }
  read(handle, taskRef, auditRef) {
    digestRef(taskRef); digestRef(auditRef);
    return immutable(this.#store.audit(handle, { taskRef, auditRef }));
  }
}

// Used for exact normalized material comparison, never as a proof of review.
export const auditMaterialDigest = material => contentDigest(normalizeAuditMaterial(material));
