import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RuntimeAudit, normalizeAuditMaterial, normalizeAuditPolicy, normalizeAuditRequirement, normalizeAuditReport, normalizeAuditRepair, auditMaterialDigest } from '../src/audit.mjs';
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
