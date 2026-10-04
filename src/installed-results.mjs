import { types } from 'node:util';
import { exact, canonical, canonicalDigest, hash, ref, integer, normalizedSpec } from './runtime-security.mjs';
import { contextText } from './context.mjs';
import { normalizeNotificationPolicy } from './notifications.mjs';

export class InstalledResultsError extends Error {
  constructor(code) { super(code); this.name = 'InstalledResultsError'; this.code = code; }
}
const fail = code => { throw new InstalledResultsError(code); };
const TIME = 8640000000000000;
const KINDS = ['milestone', 'obstacle', 'question', 'final'];
const STATES = ['passed', 'failed', 'not_run', 'stale', 'unknown', 'unexamined', 'budget_limited', 'blocked'];
const freeze = object => { if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); } return object; };
const capture = value => freeze(JSON.parse(canonical(value)));
const choose = (value, values) => { if (!values.includes(value)) fail('INVALID_INPUT'); return value; };
const refs = (value, max = 16, nonempty = false) => {
  canonical(value); if (!Array.isArray(value) || value.length > max || nonempty && !value.length) fail('INVALID_INPUT');
  value.forEach(ref); if (new Set(value).size !== value.length) fail('INVALID_INPUT'); return value;
};
const fields = (input, names, required = names) => { exact(input, names, required); return capture(input); };
const cas = value => { ref(value.taskRef); ref(value.commandRef); integer(value.expectedTaskVersion, 1); integer(value.expectedAuthEpoch); };
const pair = value => { exact(value, ['recordRef', 'digest']); ref(value.recordRef); ref(value.digest); };
const maybeRef = value => { if (value !== null) ref(value); };

export function validateInstalledResults(input) {
  try {
    if (input === undefined) return Object.freeze({ enabled: false });
    exact(input, ['enabled', 'route', 'admission', 'notifications'], ['enabled']);
    if (input.enabled === false) { exact(input, ['enabled']); return Object.freeze({ enabled: false }); }
    if (input.enabled !== true) fail('INVALID_INPUT');
    exact(input, ['enabled', 'route', 'admission', 'notifications'], ['enabled', 'route', 'admission']);
    const value = capture(input); if (value.route !== 'local_dsh') fail('INVALID_INPUT');
    exact(value.admission, ['units', 'runtimeMs', 'usageUnits']); integer(value.admission.units, 1, 32);
    integer(value.admission.runtimeMs, 1, 60000); integer(value.admission.usageUnits, 1, 100000000);
    const notifications = value.notifications ?? { enabled: false };
    exact(notifications, ['enabled', 'policy'], ['enabled']);
    if (notifications.enabled === false) exact(notifications, ['enabled']);
    else { if (notifications.enabled !== true) fail('INVALID_INPUT'); exact(notifications, ['enabled', 'policy']); normalizeNotificationPolicy(notifications.policy); }
    return capture({ ...value, notifications });
  } catch { fail('CONFIG_INVALID'); }
}

// This validates the typed normal projection, not its cryptographic origin.
// Only the same-ledger readLocalProgress closure may supply this projection.
function normalProjection(input, task, progressRef) {
  const value = fields(input, ['progress', 'report', 'localReport', 'currentness']);
  choose(value.currentness, ['current', 'stale', 'unverified']);
  const p = value.progress; if (!p || p.progressRef !== progressRef) fail('PROGRESS_BINDING_INVALID');
  for (const name of ['progressRef', 'recordRef', 'digest']) ref(p[name]); choose(p.kind, KINDS); integer(p.at, 0, TIME);
  if (value.currentness === 'unverified') {
    if (value.report !== null || value.localReport !== null || p.localReportRef !== undefined) fail('STORAGE_INVALID');
    return value;
  }
  const r = value.report, a = value.localReport;
  exact(r, ['originalGoalRef', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'verificationState', 'verificationEvidence', 'blockerRefs', 'progressDigest']);
  for (const name of ['originalGoalRef', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'progressDigest']) ref(r[name]);
  choose(r.verificationState, STATES); refs(r.blockerRefs);
  if (!Array.isArray(r.verificationEvidence) || r.verificationEvidence.length > 16) fail('INVALID_INPUT');
  for (const e of r.verificationEvidence) { exact(e, ['evidenceRef', 'digest', 'observedAt']); ref(e.evidenceRef); ref(e.digest); integer(e.observedAt, 0, TIME); }
  exact(a, ['contractVersion', 'ownerRef', 'workspaceRef', 'taskRef', 'progressRef', 'recordRef', 'digest', 'kind', 'originalGoal', 'statements', 'artifact', 'semanticRevision', 'observedSourceCAS', 'createdAt', 'verificationState', 'progressDigest', 'verificationBinding', 'sourceStates']);
  if (a.contractVersion !== 'df.local-progress/v1') fail('STORAGE_INVALID');
  for (const name of ['ownerRef', 'workspaceRef', 'taskRef', 'progressRef', 'recordRef', 'digest', 'progressDigest']) ref(a[name]);
  if (a.ownerRef !== task.ownerRef || a.workspaceRef !== task.workspaceRef || a.taskRef !== task.taskRef ||
      a.progressRef !== p.progressRef || a.recordRef !== p.recordRef || a.digest !== p.digest || a.kind !== p.kind ||
      p.localReportRef !== canonicalDigest({ taskRef: task.taskRef, progressRef }) || a.verificationState !== r.verificationState || a.progressDigest !== r.progressDigest) fail('PROGRESS_BINDING_INVALID');
  pair(a.originalGoal); exact(a.statements, ['completedScope', 'unfinished', 'nextStep', 'blockers']);
  for (const name of ['completedScope', 'unfinished', 'nextStep']) pair(a.statements[name]);
  if (!Array.isArray(a.statements.blockers) || a.statements.blockers.length > 16) fail('INVALID_INPUT'); a.statements.blockers.forEach(pair);
  refs(a.statements.blockers.map(b => b.recordRef));
  if (a.originalGoal.recordRef !== r.originalGoalRef || a.statements.completedScope.recordRef !== r.completedScopeRef ||
      a.statements.unfinished.recordRef !== r.unfinishedRef || a.statements.nextStep.recordRef !== r.nextStepRef ||
      canonical(a.statements.blockers.map(b => b.recordRef)) !== canonical(r.blockerRefs)) fail('PROGRESS_BINDING_INVALID');
  exact(a.artifact, ['artifactRef', 'version', 'recordRef', 'digest', 'producerRef', 'producerClaimRef', 'generationRef']);
  for (const name of ['artifactRef', 'recordRef', 'digest', 'producerRef']) ref(a.artifact[name]);
  maybeRef(a.artifact.producerClaimRef); maybeRef(a.artifact.generationRef); integer(a.artifact.version, 1); integer(a.semanticRevision, 1);
  exact(a.observedSourceCAS, ['taskVersion', 'authEpoch']); integer(a.observedSourceCAS.taskVersion, 1); integer(a.observedSourceCAS.authEpoch); integer(a.createdAt, 0, TIME);
  const vb = a.verificationBinding;
  if (vb !== null) {
    if (vb.source === 'unavailable') {
      exact(vb, ['source', 'verdict', 'reason', 'evidenceRef']); if (vb.reason !== 'PROVENANCE_UNAVAILABLE') fail('STORAGE_INVALID'); maybeRef(vb.evidenceRef);
    } else {
      exact(vb, ['source', 'auditRef', 'auditRevision', 'round', 'reportRef', 'bindingDigest', 'materialDigest', 'resultRef', 'recordRef', 'digest', 'claimRef', 'generationRef', 'sessionRef', 'executionRef', 'inputDigest', 'reviewerRef', 'verdict', 'evidenceRef']);
      if (vb.source !== 'native') fail('STORAGE_INVALID'); integer(vb.auditRevision, 1); integer(vb.round, 0, 8);
      for (const [name, item] of Object.entries(vb)) if (!['source', 'auditRevision', 'round', 'verdict'].includes(name)) ref(item);
    }
    choose(vb.verdict, ['accepted', 'rejected', 'unknown']);
  }
  if (!Array.isArray(a.sourceStates) || a.sourceStates.length > 16) fail('INVALID_INPUT');
  refs(a.sourceStates.map(s => s.auditRef));
  for (const s of a.sourceStates) {
    exact(s, ['auditRef', 'auditRevision', 'round', 'bindingDigest', 'materialDigest', 'semanticRevision', 'material', 'policyRef', 'blockingSeverities', 'maxRepairRounds', 'state', 'currentness', 'report', 'repair']);
    for (const name of ['auditRef', 'bindingDigest', 'materialDigest', 'policyRef']) ref(s[name]); integer(s.auditRevision, 1); integer(s.semanticRevision, 1); integer(s.round, 0, 8); integer(s.maxRepairRounds, 0, 8);
    choose(s.state, ['pending', 'passed', 'failed', 'unknown', 'budget_exhausted']); choose(s.currentness, ['current', 'stale']);
    if (!Array.isArray(s.material) || s.material.length > 16 || !Array.isArray(s.blockingSeverities) || s.blockingSeverities.length > 4) fail('INVALID_INPUT');
    s.material.forEach(pair); refs(s.material.map(m => m.recordRef));
    if (canonical(s.material) !== canonical([...s.material].sort((a, b) => a.recordRef.localeCompare(b.recordRef)))) fail('STORAGE_INVALID');
    s.blockingSeverities.forEach(v => choose(v, ['fatal', 'blocking', 'warning', 'info'])); if (new Set(s.blockingSeverities).size !== s.blockingSeverities.length) fail('INVALID_INPUT');
    if (s.report !== null) {
      const report = s.report; exact(report, ['reportRef', 'verdict', 'reviewerRef', 'claimRef', 'generationRef', 'resultRef', 'coverageRefs', 'unexaminedRefs', 'findings', 'evidenceRef']);
      for (const name of ['reportRef', 'reviewerRef', 'claimRef', 'generationRef', 'evidenceRef']) ref(report[name]); maybeRef(report.resultRef); choose(report.verdict, ['passed', 'failed', 'unknown', 'budget_exhausted']);
      refs(report.coverageRefs); refs(report.unexaminedRefs);
      const union = [...report.coverageRefs, ...report.unexaminedRefs]; refs(union, 16);
      if (canonical([...union].sort()) !== canonical(s.material.map(m => m.recordRef).sort())) fail('STORAGE_INVALID');
      if (!Array.isArray(report.findings) || report.findings.length > 16) fail('INVALID_INPUT'); refs(report.findings.map(f => f.findingRef));
      for (const f of report.findings) {
        exact(f, ['findingRef', 'severity', 'code', 'evidenceRef', 'resolved']); ref(f.findingRef); ref(f.evidenceRef); choose(f.severity, ['fatal', 'blocking', 'warning', 'info']);
        choose(f.code, ['scope_violation', 'permission_bypass', 'secret_exposure', 'artifact_mismatch', 'coverage_gap', 'review_failure', 'other']); if (typeof f.resolved !== 'boolean') fail('INVALID_INPUT');
      }
    }
    if (s.repair !== null) { exact(s.repair, ['claimRef', 'generationRef', 'round', 'previousReportRef', 'evidenceRef']); integer(s.repair.round, 1, 8); for (const [name, value] of Object.entries(s.repair)) if (name !== 'round') ref(value); }
  }
  if (r.verificationState === 'passed' && (!vb || vb.source !== 'native' || vb.verdict !== 'accepted' || !r.verificationEvidence.length ||
      a.sourceStates.some(s => s.currentness !== 'current' || s.state !== 'passed' || !s.report || s.report.verdict !== 'passed' || s.report.unexaminedRefs.length || s.report.findings.some(f => f.severity === 'fatal' || !f.resolved && s.blockingSeverities.includes(f.severity))))) fail('PROVENANCE_UNAVAILABLE');
  if (r.verificationState === 'passed') {
    const source = a.sourceStates.find(s => s.auditRef === vb.auditRef);
    if (!source || source.auditRevision !== vb.auditRevision || source.round !== vb.round || source.bindingDigest !== vb.bindingDigest ||
        source.materialDigest !== vb.materialDigest || source.semanticRevision !== a.semanticRevision || !source.report ||
        source.report.reportRef !== vb.reportRef || source.report.resultRef !== vb.resultRef || source.report.claimRef !== vb.claimRef ||
        source.report.generationRef !== vb.generationRef || source.report.reviewerRef !== vb.reviewerRef ||
        source.materialDigest !== canonicalDigest(source.material) || !source.material.some(m => m.recordRef === a.artifact.recordRef && m.digest === a.artifact.digest) ||
        vb.reviewerRef === a.artifact.producerRef || a.artifact.generationRef !== null && vb.generationRef === a.artifact.generationRef) fail('PROVENANCE_UNAVAILABLE');
  }
  return value;
}

// A normal projection is produced only by readLocalArtifact. A matching
// native-looking JSON body, old advanced verdict or evidence reference cannot
// enter this capability. Core authenticates/rederives the source chain again.
function normalVerification(a, ready = false) {
  const vb = a.verificationBinding;
  let state = a.verification ? 'unknown' : 'not_run';
  if (vb !== undefined && vb !== null) {
    if (vb.source === 'unavailable') {
      exact(vb, ['source', 'verdict', 'reason', 'evidenceRef']); choose(vb.verdict, ['accepted', 'rejected', 'unknown']); maybeRef(vb.evidenceRef);
      if (vb.reason !== 'PROVENANCE_UNAVAILABLE') fail('STORAGE_INVALID');
    } else {
      exact(vb, ['source', 'auditRef', 'auditRevision', 'round', 'reportRef', 'bindingDigest', 'materialDigest', 'resultRef', 'recordRef', 'digest', 'claimRef', 'generationRef', 'sessionRef', 'executionRef', 'inputDigest', 'reviewerRef', 'verdict', 'evidenceRef']);
      if (vb.source !== 'native') fail('STORAGE_INVALID'); integer(vb.auditRevision, 1); integer(vb.round, 0, 8); choose(vb.verdict, ['accepted', 'rejected', 'unknown']);
      for (const [name, value] of Object.entries(vb)) if (!['source', 'auditRevision', 'round', 'verdict'].includes(name)) ref(value);
      if (!a.verification || a.verification.verdict !== vb.verdict || a.verification.evidenceRef !== vb.evidenceRef ||
          a.verification.reviewerRef !== vb.reviewerRef || a.verification.generationRef !== vb.generationRef ||
          a.producerRef === vb.reviewerRef || a.generationRef !== null && a.generationRef !== undefined && a.generationRef === vb.generationRef) fail('PROVENANCE_UNAVAILABLE');
      state = { accepted: 'passed', rejected: 'failed', unknown: 'unknown' }[vb.verdict];
    }
  }
  if (ready && state !== 'passed') fail(vb?.source === 'native' ? 'ARTIFACT_UNVERIFIED' : 'PROVENANCE_UNAVAILABLE');
  return state;
}

function classification(spec, progress, at, window) {
  if (!spec.enabled) return 'disabled';
  const emergency = progress.some(p => spec.emergencyKinds.includes(p.kind));
  if (progress.length > 1 && progress.some(p => !spec.mergeKinds.includes(p.kind))) return 'merge_denied';
  if (!emergency && progress.every(p => spec.mergeKinds.includes(p.kind)) && at - Math.min(...progress.map(p => p.at)) < spec.mergeWindowMs) return 'coalesced';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: spec.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const minute = +parts.find(p => p.type === 'hour').value * 60 + +parts.find(p => p.type === 'minute').value;
  if (!emergency && spec.quietWindows.some(w => w.startMinute < w.endMinute ? minute >= w.startMinute && minute < w.endMinute : minute >= w.startMinute || minute < w.endMinute)) return 'quiet';
  if (window && (at < window.windowStart || at < window.lastClaimAt)) return 'clock_unknown';
  if (window && at - window.lastClaimAt < spec.minIntervalMs) return 'interval';
  return (window && at - window.windowStart < spec.frequency.windowMs ? window.count : 0) >= spec.frequency.maxClaims ? 'frequency' : 'eligible';
}

const METHODS = ['isAlive', 'snapshotOwner', 'readLocalActionFacts', 'subscribeRuntimeReceipts', 'planOwnerAction', 'artifact', 'readArtifact', 'writeArtifact', 'acceptDelivery', 'getDelivery', 'listLocalDeliveries', 'publishLocalDelivery', 'recordLocalDeliveryAccess', 'configureLocalNotificationPolicy', 'getNotificationPolicy', 'writeLocalProgress', 'readLocalProgress'];
export function createInstalledResults(input) {
  exact(input, ['selection', 'identity', 'profile']); const selection = validateInstalledResults(input.selection);
  const notificationsEnabled = selection.enabled && selection.notifications.enabled;
  exact(input.identity, ['ownerId', 'workspaceId']); exact(input.profile, ['dir', 'name']);
  for (const value of [...Object.values(input.identity), ...Object.values(input.profile)]) { contextText(value, [], 4096); if (!value.trim()) fail('INVALID_INPUT'); }
  const expectedScope = capture({ ownerRef: hash(input.identity.ownerId), workspaceRef: hash(input.identity.workspaceId) });
  const profile = capture(input.profile), namespace = canonicalDigest(['df.installed-results/v1', input.identity.ownerId, input.identity.workspaceId, profile.dir, profile.name]);
  const route = capture({ recipientRef: canonicalDigest([namespace, 'df.native-owner/v1']), channelRef: canonicalDigest([namespace, 'df.local-results/v1']), policyRef: canonicalDigest([namespace, 'notification-policy']), mergeKeyRef: canonicalDigest([namespace, 'progress-group']) });
  let installed = false;
  return Object.freeze({ installedResultsInstaller(installation) {
    exact(installation, ['ctx', ...METHODS]); if (!installation.ctx || METHODS.some(n => typeof installation[n] !== 'function')) fail('RESULT_CAPABILITY_UNAVAILABLE');
    if (installed) fail('RESULT_ALREADY_INSTALLED'); installed = true;
    const api = { ...installation }, ctx = api.ctx, connection = ctx.connection, peer = connection?.operator;
    if (!peer || !ctx.profileContext || ctx.profileContext.dir !== profile.dir || ctx.profileContext.name !== profile.name) fail('RESULT_CAPABILITY_UNAVAILABLE');
    let active = true, disposed = false; const plans = new Map(), permits = new Map();
    const live = () => {
      let admitted = false; try { admitted = active && api.isAlive() === true && ctx.connection === connection && connection.operator === peer && ctx.profileContext.dir === profile.dir && ctx.profileContext.name === profile.name; } catch {}
      if (!admitted) { active = false; permits.clear(); } return admitted;
    };
    const check = () => { if (!selection.enabled) fail('RESULTS_DISABLED'); if (!live()) fail('SERVICE_DISPOSED'); };
    const notificationCheck = () => { check(); if (!notificationsEnabled) fail('NOTIFICATIONS_DISABLED'); };
    const snapshot = taskRef => { check(); ref(taskRef); const s = capture(api.snapshotOwner({ taskRef }));
      if (!s || !s.task || s.task.taskRef !== taskRef) fail('SCOPE_MISMATCH'); ref(s.task.ownerRef); ref(s.task.workspaceRef); if (s.task.ownerRef !== expectedScope.ownerRef || s.task.workspaceRef !== expectedScope.workspaceRef) fail('SCOPE_MISMATCH'); integer(s.task.version, 1); integer(s.task.authEpoch); integer(s.observedAt, 0, TIME); check(); return s; };
    const freshCas = (s, input) => { if (s.task.version !== input.expectedTaskVersion || s.task.authEpoch !== input.expectedAuthEpoch) fail('STALE_VERSION'); };
    const currentDelivery = (taskRef, deliveryRef) => {
      const s = snapshot(taskRef), d = capture(api.getDelivery({ taskRef, deliveryRef }));
      if (!d || d.deliveryRef !== deliveryRef || d.recipientRef !== route.recipientRef || d.channelRef !== route.channelRef) fail('LOCAL_DELIVERY_MISMATCH');
      for (const n of ['artifactRef', 'digest', 'targetDigest']) ref(d[n]); integer(d.artifactVersion, 1);
      if (d.intent?.taskRef !== taskRef || d.targetDigest !== canonicalDigest({ ...expectedScope, ...d.intent })) fail('LOCAL_DELIVERY_MISMATCH');
      if (d.notification && (d.notification.policyRef !== route.policyRef || d.notification.mergeKeyRef !== route.mergeKeyRef)) fail('LOCAL_DELIVERY_MISMATCH');
      check(); return { s, d };
    };
    const material = (taskRef, artifactRef, version, digest) => {
      check(); const value = capture(api.readArtifact({ taskRef, artifactRef, version, digest })); exact(value, ['artifact', 'data']);
      const { artifact: a, data } = value;
      if (!a || !data) fail('ARTIFACT_BINDING_INVALID'); ref(a.recordRef); ref(data.recordRef);
      if (a.artifactRef !== artifactRef || a.version !== version || a.digest !== digest || data.recordRef !== a.recordRef || data.digest !== digest || data.kind !== 'artifact') fail('ARTIFACT_BINDING_INVALID');
      contextText(data.content, [], 65536); integer(data.byteLength, 0, 65536); if (data.byteLength !== Buffer.byteLength(data.content, 'utf8') || hash(data.content) !== digest) fail('ARTIFACT_BINDING_INVALID'); check(); return value;
    };
    const currentMaterial = (taskRef, artifactRef, version, digest) => {
      check(); const current = capture(api.artifact({ taskRef, artifactRef }));
      if (!current || current.artifactRef !== artifactRef || current.version !== version || current.digest !== digest) fail('ARTIFACT_STALE');
      return material(taskRef, artifactRef, version, digest);
    };
    const policy = () => { notificationCheck(); const p = capture(api.getNotificationPolicy({ policyRef: route.policyRef }));
      if (!p) fail('NOTIFICATION_POLICY_UNAVAILABLE');
      if (p.policyRef !== route.policyRef) fail('NOTIFICATION_BINDING_INVALID'); integer(p.revision, 1); normalizeNotificationPolicy(p.spec);
      if (!Array.isArray(p.windows)) fail('NOTIFICATION_BINDING_INVALID'); check(); return p; };
    const projections = (s, progressRefs) => refs(progressRefs, 16, true).map(progressRef => {
      const value = normalProjection(api.readLocalProgress({ taskRef: s.task.taskRef, progressRef }), s.task, progressRef);
      const item = s.progress.find(p => p.progressRef === progressRef);
      if (!item || item.digest !== value.progress.digest || item.recordRef !== value.progress.recordRef || item.kind !== value.progress.kind) fail('PROGRESS_BINDING_INVALID');
      check(); return value;
    });
    const manifest = (s, progressRefs) => {
      const progress = projections(s, progressRefs); if (progress.some(p => p.currentness !== 'current')) fail('NORMAL_PROGRESS_UNAVAILABLE');
      return canonical({ version: 'df.local-notification/v1', taskRef: s.task.taskRef, ownerRef: s.task.ownerRef, workspaceRef: s.task.workspaceRef,
        progress: progress.sort((a, b) => a.progress.progressRef.localeCompare(b.progress.progressRef)).map(p => ({ progressRef: p.progress.progressRef, digest: p.progress.digest, kind: p.progress.kind, report: p.report, localReport: p.localReport })) });
    };
    function facts(taskRef) {
      const f = fields(api.readLocalActionFacts({ taskRef }), ['resourcePolicyVersion', 'modelPolicyVersion', 'model', 'executor', 'labels']);
      integer(f.resourcePolicyVersion, 1); integer(f.modelPolicyVersion, 1); exact(f.model, ['presetRef', 'modelRef', 'reasoningRef', 'catalogEvidenceRef']); Object.values(f.model).forEach(ref);
      exact(f.executor, ['environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest']); Object.values(f.executor).forEach(ref);
      exact(f.labels, ['providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd', 'toolNames', 'evidenceRef']); ref(f.labels.evidenceRef);
      if (f.executor.toolsDigest !== canonicalDigest([]) || !Array.isArray(f.labels.toolNames) || f.labels.toolNames.length) fail('LOCAL_EXECUTOR_UNAVAILABLE');
      for (const n of ['providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd']) { contextText(f.labels[n], [], 4096); if (!f.labels[n].trim()) fail('LOCAL_EXECUTOR_UNAVAILABLE'); }
      check(); return f;
    }
    const publicationBytes = (taskRef, d, content) => Buffer.byteLength(canonical({ taskRef, deliveryRef: d.deliveryRef, artifactRef: d.artifactRef, artifactVersion: d.artifactVersion, digest: d.digest, recipientRef: d.recipientRef, channelRef: d.channelRef, content }), 'utf8');
    function derive(taskRef, d, s, f, content) {
      const p = s.policy;
      if (!p?.modelPolicy || p.version !== f.resourcePolicyVersion || p.modelPolicy.version !== f.modelPolicyVersion || p.modelPolicy.catalogEvidenceRef !== f.model.catalogEvidenceRef || !p.modelPolicy.presetRefs.includes(f.model.presetRef)) fail('MODEL_POLICY_UNAVAILABLE');
      if (s.control !== 'active' || ['cancel_requested', 'cancelled', 'completed', 'failed', 'deleted', 'recovery_required'].includes(s.task.status)) fail('TASK_BLOCKED');
      const a = selection.admission;
      if (!p.limits || a.units > p.limits.maxActive || a.runtimeMs > p.limits.maxRuntimeMs || a.usageUnits > p.limits.maxUsageUnits || p.limits.maxAttempts < 1 || p.limits.maxTotalAttempts < 1 || publicationBytes(taskRef, d, content) > a.usageUnits) fail('BUDGET_LIMIT');
      if (d.notification) {
        const current = policy(); if (current.revision !== d.notification.policyRevision || !current.spec.enabled || manifest(s, d.notification.progressRefs) !== content) fail('NOTIFICATION_BINDING_INVALID');
      }
      const binding = canonicalDigest({ namespace, selection, ownerRef: s.task.ownerRef, workspaceRef: s.task.workspaceRef, taskRef, deliveryRef: d.deliveryRef, targetDigest: d.targetDigest, dataDigest: d.digest, notification: d.notification ?? null, facts: f });
      return capture(normalizedSpec({ actionRef: canonicalDigest([binding, 'action']), kind: 'write', role: 'worker', targetDigest: d.targetDigest, dataDigest: d.digest, units: a.units,
        charges: { runtimeMs: a.runtimeMs, usageUnits: a.usageUnits, costState: 'estimated', costEstimateMicros: 0, costProvenanceRef: canonicalDigest([binding, 'df-local-utf8-byte-units/v1', 'source-owned-local-none']) },
        attemptGroupRef: canonicalDigest([binding, 'attempt']), attemptIndex: 1, resourcePolicyVersion: f.resourcePolicyVersion, modelPolicyVersion: f.modelPolicyVersion, model: f.model,
        executor: { mode: 'none', generationRef: canonicalDigest([binding, 'generation']), ...f.executor } }));
    }
    const planLocalDelivery = input => {
      input = fields(input, ['taskRef', 'deliveryRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']); cas(input); ref(input.deliveryRef);
      const { s, d } = currentDelivery(input.taskRef, input.deliveryRef); freshCas(s, input);
      if (d.state !== 'accepted') fail('DELIVERY_NOT_ACCEPTED'); const m = currentMaterial(input.taskRef, d.artifactRef, d.artifactVersion, d.digest);
      normalVerification(m.artifact, true);
      const f = facts(input.taskRef), spec = derive(input.taskRef, d, s, f, m.data.content);
      if (plans.size >= 128 && !plans.has(spec.actionRef)) fail('LOCAL_PLAN_CAPACITY'); check();
      const receipt = capture(api.planOwnerAction({ taskRef: input.taskRef, commandRef: input.commandRef, expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch, spec }));
      check(); if (receipt.actionRef !== spec.actionRef || receipt.taskVersion !== input.expectedTaskVersion || receipt.authEpoch !== input.expectedAuthEpoch || receipt.actionDigest !== canonicalDigest({ ...expectedScope, taskRef: input.taskRef, taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, spec })) fail('LOCAL_PLAN_MISMATCH'); ref(receipt.actionDigest); integer(receipt.taskVersion, 1); integer(receipt.authEpoch);
      plans.set(spec.actionRef, { taskRef: input.taskRef, deliveryRef: d.deliveryRef, spec, actionDigest: receipt.actionDigest, factsDigest: canonicalDigest(f) }); check(); return receipt;
    };
    const resolveLocalDelivery = (spec, task) => {
      spec = capture(normalizedSpec(spec)); task = capture(task); check();
      const plan = plans.get(spec.actionRef); if (!plan || plan.taskRef !== task.taskRef || canonical(plan.spec) !== canonical(spec)) fail('LOCAL_TARGET_UNAVAILABLE');
      const { s, d } = currentDelivery(task.taskRef, plan.deliveryRef), m = currentMaterial(task.taskRef, d.artifactRef, d.artifactVersion, d.digest), f = facts(task.taskRef);
      normalVerification(m.artifact, true);
      if (canonical(derive(task.taskRef, d, s, f, m.data.content)) !== canonical(spec) || canonicalDigest(f) !== plan.factsDigest) fail('LOCAL_TARGET_STALE');
      return capture({ targetDigest: spec.targetDigest, targetLabel: 'Publish exact artifact into the local owner result list; opening remains unknown', ...spec.model, ...f.executor, ...f.labels });
    };
    const localAdmission = record => {
      try {
        record = fields(record, ['ownerRef', 'workspaceRef', 'taskRef', 'actionRef', 'actionDigest', 'taskVersion', 'authEpoch', 'spec']);
        if (!selection.enabled || !live()) return false; const p = permits.get(record.actionRef);
        return !!p && canonical(p.record) === canonical(record) && Date.now() < p.expiresAt;
      } catch { return false; }
    };
    const invalidate = taskRef => { for (const [id, p] of permits) if (!taskRef || p.record.taskRef === taskRef) permits.delete(id); };
    const unsubscribe = api.subscribeRuntimeReceipts(event => {
      try {
        if (!selection.enabled || !live()) return;
        event = fields(event, ['operation', 'input', 'receipt']); const t = event.input.taskRef;
        if (['policy', 'revise', 'control', 'revoke', 'configureLocalNotificationPolicy'].includes(event.operation)) invalidate(t);
        if (event.operation === 'grant') {
          const p = plans.get(event.input.actionRef), r = event.receipt;
          if (p && p.taskRef === t && r.task?.taskRef === t && r.actionRef === event.input.actionRef && r.actionDigest === p.actionDigest) {
            ref(r.task.ownerRef); ref(r.task.workspaceRef); if (r.task.ownerRef !== expectedScope.ownerRef || r.task.workspaceRef !== expectedScope.workspaceRef) fail('SCOPE_MISMATCH'); integer(r.taskVersion, 1); integer(r.authEpoch); integer(r.expiresAt, 1, TIME);
            invalidate(t); permits.set(r.actionRef, { expiresAt: r.expiresAt, record: capture({ ownerRef: r.task.ownerRef, workspaceRef: r.task.workspaceRef, taskRef: t, actionRef: r.actionRef, actionDigest: r.actionDigest, taskVersion: r.taskVersion, authEpoch: r.authEpoch, spec: p.spec }) });
          }
        }
      } catch { active = false; permits.clear(); fail('LOCAL_RECEIPT_UNAVAILABLE'); }
    });
    if (typeof unsubscribe !== 'function') { active = false; fail('RESULT_CAPABILITY_UNAVAILABLE'); }
    const writeLocalReport = input => {
      input = fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'progressRef', 'kind', 'artifactRef', 'artifactVersion', 'digest', 'completedScopeRef', 'unfinishedRef', 'nextStepRef', 'blockerRefs']);
      cas(input); for (const n of ['progressRef', 'artifactRef', 'digest', 'completedScopeRef', 'unfinishedRef', 'nextStepRef']) ref(input[n]); integer(input.artifactVersion, 1); choose(input.kind, KINDS); refs(input.blockerRefs);
      const s = snapshot(input.taskRef); freshCas(s, input); currentMaterial(input.taskRef, input.artifactRef, input.artifactVersion, input.digest); check();
      const receipt = capture(api.writeLocalProgress(input)); check(); return receipt;
    };
    const configureLocalNotifications = input => {
      input = fields(input, ['commandRef', 'expectedRevision', 'spec']); ref(input.commandRef); integer(input.expectedRevision); notificationCheck();
      const spec = normalizeNotificationPolicy(input.spec); check(); const receipt = capture(api.configureLocalNotificationPolicy({ ...input, policyRef: route.policyRef, spec })); invalidate(); check(); return receipt;
    };
    const pendingLocalNotifications = input => {
      input = fields(input, ['taskRef']); ref(input.taskRef); notificationCheck(); const s = snapshot(input.taskRef), p = policy(), spec = normalizeNotificationPolicy(p.spec);
      const endpoint = f => f.recipientRef === route.recipientRef && f.channelRef === route.channelRef;
      const held = (s.notifications ?? []).find(g => endpoint(g) && g.mergeKeyRef === route.mergeKeyRef && (!['delivered', 'failed'].includes(g.state) || !g.released));
      const window = p.windows.find(endpoint), seen = new Set(), candidates = [], suppressed = [], retryRequired = [];
      for (const item of [...s.progress].sort((a, b) => a.at - b.at || a.progressRef.localeCompare(b.progressRef))) {
        const value = projections(s, [item.progressRef])[0];
        if (value.currentness !== 'current') { suppressed.push({ progressRef: item.progressRef, reason: value.currentness }); continue; }
        const digest = value.report.progressDigest;
        if (seen.has(digest)) { suppressed.push({ progressRef: item.progressRef, reason: 'duplicate_fact' }); continue; } seen.add(digest);
        const fact = (s.notificationFacts ?? []).find(f => endpoint(f) && f.digest === digest);
        if (fact?.state === 'delivered') { suppressed.push({ progressRef: item.progressRef, reason: 'delivered' }); continue; }
        if (fact?.state === 'failed' && fact.released) { retryRequired.push({ progressRef: item.progressRef, previousDeliveryRef: fact.deliveryRef }); continue; }
        candidates.push({ progressRef: item.progressRef, digest, kind: item.kind, at: item.at, state: held || fact ? 'held' : classification(spec, [item], s.observedAt, window) });
      }
      const mergeable = candidates.filter(c => c.state !== 'held' && spec.mergeKinds.includes(c.kind)), batches = [];
      for (let i = 0; i < mergeable.length; i += 16) { const batch = mergeable.slice(i, i + 16); batches.push({ progressRefs: batch.map(p => p.progressRef), state: classification(spec, batch, s.observedAt, window) }); }
      for (const c of candidates.filter(c => c.state !== 'held' && !spec.mergeKinds.includes(c.kind))) batches.push({ progressRefs: [c.progressRef], state: c.state });
      check(); return capture({ taskRef: input.taskRef, policyRef: route.policyRef, policyRevision: p.revision, timeZone: spec.timeZone, observedAt: s.observedAt, candidates, batches, suppressed, retryRequired, heldDeliveryRef: held?.deliveryRef ?? null, notificationDelivered: false });
    };
    const prepareLocalNotification = input => {
      input = fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'artifactRef', 'version', 'progressRefs']); cas(input); ref(input.artifactRef); integer(input.version, 1); refs(input.progressRefs, 16, true); notificationCheck();
      const s = snapshot(input.taskRef); freshCas(s, input); const content = manifest(s, input.progressRefs); contextText(content, [], 65536); check();
      const { progressRefs, ...write } = input; const receipt = capture(api.writeArtifact({ ...write, content })); check(); return receipt;
    };
    const acceptLocalNotification = input => {
      const names = ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'policyRevision', 'progressRefs', 'previousDeliveryRef'];
      input = fields(input, names, names.filter(n => n !== 'previousDeliveryRef')); cas(input); for (const n of ['deliveryRef', 'artifactRef', 'digest']) ref(input[n]);
      if (input.previousDeliveryRef !== undefined) ref(input.previousDeliveryRef); integer(input.artifactVersion, 1); integer(input.policyRevision, 1); refs(input.progressRefs, 16, true); notificationCheck();
      const s = snapshot(input.taskRef); freshCas(s, input); const p = policy(); if (p.revision !== input.policyRevision || !p.spec.enabled) fail('NOTIFICATION_POLICY_STALE');
      const content = manifest(s, input.progressRefs), m = currentMaterial(input.taskRef, input.artifactRef, input.artifactVersion, input.digest);
      if (m.data.content !== content) fail('NOTIFICATION_ARTIFACT_MISMATCH');
      normalVerification(m.artifact, true);
      const { policyRevision, progressRefs, ...rest } = input; check(); const receipt = capture(api.acceptDelivery({ ...rest, recipientRef: route.recipientRef, channelRef: route.channelRef, notification: { policyRef: route.policyRef, policyRevision, progressRefs, mergeKeyRef: route.mergeKeyRef } })); check(); return receipt;
    };
    function receipt(d, state, permissionState, observedAt, evidenceRef, historical = false) {
      return capture({ artifactRef: d.artifactRef, artifactVersion: d.artifactVersion, digest: d.digest, recipientRef: d.recipientRef, channelRef: d.channelRef,
        state, permissionState, openability: historical ? 'verified' : 'unknown', observedAt, evidenceRef });
    }
    function observed(record) {
      const observations = record.observations ?? []; const o = [...observations].reverse().find(o => o.state === record.state);
      if (!o) fail('PUBLICATION_NOT_CONFIRMED'); integer(o.observedAt, 0, TIME); ref(o.evidenceRef);
      if (record.state === 'delivered' && (o.permissionState !== 'allowed' || o.openability !== 'openable')) fail('PUBLICATION_NOT_CONFIRMED');
      return receipt(record, record.state, { allowed: 'granted', denied: 'revoked', unknown: 'unknown' }[o.permissionState] ?? 'unknown', o.observedAt, o.evidenceRef, record.state === 'delivered');
    }
    const recipientAdapter = Object.freeze({
      async send(record, data) {
        record = capture(record); data = capture(data); check(); ref(record.taskRef ?? record.intent?.taskRef);
        const taskRef = record.taskRef ?? record.intent.taskRef, { s, d } = currentDelivery(taskRef, record.deliveryRef);
        if (canonical(record) !== canonical(d) || d.state !== 'outbox_committed' || !d.claimRef || !d.reservationRef || !d.generationRef) fail('OUTBOX_NOT_CLAIMED');
        const m = currentMaterial(taskRef, d.artifactRef, d.artifactVersion, d.digest); if (canonical(m.data) !== canonical(data)) fail('ARTIFACT_BINDING_INVALID'); normalVerification(m.artifact, true);
        const action = s.actions.find(a => a.claimRef === d.claimRef), plan = action && plans.get(action.actionRef), permit = action && permits.get(action.actionRef);
        if (!plan || !permit || action.actionDigest !== plan.actionDigest || action.spec.executor.generationRef !== d.generationRef || s.task.authEpoch !== permit.record.authEpoch || canonical(action.spec) !== canonical(plan.spec) || Date.now() >= permit.expiresAt) fail('LOCAL_ADMISSION_DENIED');
        const f = facts(taskRef); if (canonical(derive(taskRef, d, s, f, m.data.content)) !== canonical(plan.spec)) fail('LOCAL_TARGET_STALE');
        permits.set(action.actionRef, { ...permit, record: capture({ ...permit.record, taskVersion: s.task.version }) }); check();
        const evidenceRef = canonicalDigest({ namespace, taskRef, deliveryRef: d.deliveryRef, actionDigest: action.actionDigest, claimRef: d.claimRef, digest: d.digest, at: s.observedAt, kind: 'local-publication' });
        const commandRef = canonicalDigest({ evidenceRef, operation: 'publish-local-delivery' });
        const committed = capture(await api.publishLocalDelivery({ taskRef, commandRef, deliveryRef: d.deliveryRef, claimRef: d.claimRef, generationRef: d.generationRef, actionDigest: action.actionDigest, observedAt: s.observedAt, evidenceRef,
          ...(d.notification ? { notification: { policyRef: d.notification.policyRef, policyRevision: d.notification.policyRevision } } : {}) }));
        check();
        exact(committed, ['deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'targetDigest', 'intent', 'previousDeliveryRef', 'state', 'claimRef', 'reservationRef', 'generationRef', 'observations', 'currentAccess', 'notification'],
          ['deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'targetDigest', 'intent', 'previousDeliveryRef', 'state', 'claimRef', 'reservationRef', 'generationRef', 'observations', 'currentAccess']);
        for (const name of ['deliveryRef', 'artifactRef', 'artifactVersion', 'digest', 'recipientRef', 'channelRef', 'targetDigest', 'claimRef', 'reservationRef', 'generationRef', 'previousDeliveryRef']) if (committed[name] !== d[name]) fail('PUBLICATION_NOT_CONFIRMED');
        exact(committed.currentAccess, ['permissionState', 'openability']);
        if (committed.state !== 'sent' || canonical(committed.intent) !== canonical(d.intent) || canonical(committed.notification ?? null) !== canonical(d.notification ?? null) || committed.currentAccess.permissionState !== 'allowed' || committed.currentAccess.openability !== 'unknown') fail('PUBLICATION_NOT_CONFIRMED');
        const current = currentDelivery(taskRef, d.deliveryRef).d;
        if (current.state !== 'sent') fail('PUBLICATION_NOT_CONFIRMED');
        const o = current.observations?.at(-1);
        if (!o) fail('PUBLICATION_NOT_CONFIRMED');
        exact(o, ['state', 'evidenceRef', 'permissionState', 'openability', 'observedAt']);
        material(taskRef, d.artifactRef, d.artifactVersion, d.digest);
        if (current.state !== 'sent' || o?.evidenceRef !== evidenceRef || o.observedAt !== s.observedAt || o.permissionState !== 'allowed' || o.openability !== 'unknown') fail('PUBLICATION_NOT_CONFIRMED'); return observed(current);
      },
      async query(record) {
        record = capture(record); const taskRef = record.taskRef ?? record.intent?.taskRef; ref(taskRef); const { s, d } = currentDelivery(taskRef, record.deliveryRef);
        if (d.artifactRef !== record.artifactRef || d.digest !== record.digest || d.artifactVersion !== record.artifactVersion || record.recipientRef !== d.recipientRef || record.channelRef !== d.channelRef) fail('LOCAL_DELIVERY_MISMATCH');
        if (d.state === 'unknown') {
          const published = [...(d.observations ?? [])].reverse().find(o => o.state === 'sent' && o.permissionState === 'allowed' && o.openability === 'unknown');
          if (published) {
            // A later lost acknowledgement cannot erase the committed source
            // publication. Reconciliation observes it at actual trusted time;
            // core still rejects clock rollback/equal-time contradictions.
            material(taskRef, d.artifactRef, d.artifactVersion, d.digest);
            return receipt(d, 'sent', 'granted', s.observedAt, canonicalDigest({ namespace, taskRef, deliveryRef: d.deliveryRef, publicationEvidenceRef: published.evidenceRef, kind: 'publication-query', at: s.observedAt }));
          }
        }
        if (['sent', 'delivered', 'failed', 'unknown'].includes(d.state)) return observed(d);
        return receipt(d, 'unknown', 'unknown', s.observedAt, canonicalDigest({ namespace, taskRef, deliveryRef: d.deliveryRef, kind: 'publication-unknown', at: s.observedAt }));
      },
      async open(record) {
        record = capture(record); const taskRef = record.taskRef ?? record.intent?.taskRef; ref(taskRef); const { s, d } = currentDelivery(taskRef, record.deliveryRef);
        if (d.artifactRef !== record.artifactRef || d.digest !== record.digest || d.artifactVersion !== record.artifactVersion || record.recipientRef !== d.recipientRef || record.channelRef !== d.channelRef) fail('LOCAL_DELIVERY_MISMATCH');
        if (!(d.observations ?? []).some(o => ['sent', 'delivered'].includes(o.state))) fail('PUBLICATION_NOT_CONFIRMED');
        material(taskRef, d.artifactRef, d.artifactVersion, d.digest);
        return receipt(d, ['sent', 'delivered', 'failed', 'unknown'].includes(d.state) ? d.state : 'unknown', 'granted', s.observedAt, canonicalDigest({ namespace, taskRef, deliveryRef: d.deliveryRef, kind: 'local-access', at: s.observedAt }));
      },
    });
    const localResultsStatus = input => { input = fields(input, ['taskRef']); const s = snapshot(input.taskRef); const publications = capture(api.listLocalDeliveries(input)); check();
      if (!Array.isArray(publications)) fail('STORAGE_INVALID');
      return capture({ taskRef: input.taskRef, enabled: true, route: 'local_dsh', available: true, opening: 'unknown', artifacts: (s.artifacts ?? []).map(a => ({ artifactRef: a.artifactRef, version: a.version, digest: a.digest, verificationState: normalVerification(material(input.taskRef, a.artifactRef, a.version, a.digest).artifact) })),
        publications: publications.map(d => { if (d.recipientRef !== route.recipientRef || d.channelRef !== route.channelRef || !['sent', 'delivered', 'unknown', 'failed'].includes(d.state)) fail('LOCAL_DELIVERY_MISMATCH'); return { deliveryRef: d.deliveryRef, artifactRef: d.artifactRef, artifactVersion: d.artifactVersion, digest: d.digest, state: d.state }; }) }); };
    const readLocalResult = input => { input = fields(input, ['taskRef', 'artifactRef', 'version', 'digest']); ref(input.taskRef); ref(input.artifactRef); ref(input.digest); integer(input.version, 1); snapshot(input.taskRef); return material(input.taskRef, input.artifactRef, input.version, input.digest); };
    const localDeliveryQuery = async input => { input = fields(input, ['taskRef', 'deliveryRef']); ref(input.taskRef); ref(input.deliveryRef); const { d } = currentDelivery(input.taskRef, input.deliveryRef); return recipientAdapter.query(d); };
    const localDeliveryAccess = input => {
      input = fields(input, ['taskRef', 'deliveryRef']); ref(input.taskRef); ref(input.deliveryRef); const { s, d } = currentDelivery(input.taskRef, input.deliveryRef);
      // Publication existence is a storage fact. Reading exact bytes proves
      // current access only; it cannot mint browser opening or consumption.
      if (!(d.observations ?? []).some(o => ['sent', 'delivered'].includes(o.state))) fail('PUBLICATION_NOT_CONFIRMED');
      let permissionState = 'allowed';
      try { material(input.taskRef, d.artifactRef, d.artifactVersion, d.digest); }
      catch (error) {
        // Only an actual scoped read authorization refusal is a denied fact.
        // Storage/ciphertext/binding failures remain errors, never revocation.
        // A Proxy's descriptor trap can forge a trusted-looking code. Reject
        // it before any reflection; inspect only inert own string data.
        if (types.isProxy(error)) fail('LOCAL_ACCESS_UNKNOWN');
        const descriptor = error !== null && ['object', 'function'].includes(typeof error) ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || !['UNAUTHORIZED', 'PERMISSION_DENIED'].includes(descriptor.value)) throw error;
        permissionState = 'denied';
      }
      check();
      const evidenceRef = canonicalDigest({ namespace, ...input, kind: 'local-access', permissionState, observedAt: s.observedAt, digest: d.digest });
      const result = capture(api.recordLocalDeliveryAccess({ ...input, commandRef: canonicalDigest([evidenceRef, 'access']), artifactRef: d.artifactRef, artifactVersion: d.artifactVersion, digest: d.digest, recipientRef: d.recipientRef, channelRef: d.channelRef, permissionState, observedAt: s.observedAt, evidenceRef })); check(); return result;
    };
    function quietUntil(spec, at) {
      // Search only clock minutes for a display hint; core claim repeats policy.
      // The finite bound covers DST/wrapping windows; permanent quiet retains
      // TIME, rather than inventing a product retry/cadence.
      const current = classification({ ...spec, mergeKinds: [], emergencyKinds: [], frequency: { windowMs: 1, maxClaims: 1 } }, [{ kind: 'milestone', at }], at, null);
      if (current !== 'quiet') return 0;
      const covered = minute => spec.quietWindows.some(w => w.startMinute < w.endMinute ? minute >= w.startMinute && minute < w.endMinute : minute >= w.startMinute || minute < w.endMinute);
      if (Array.from({ length: 1440 }, (_, minute) => minute).every(covered)) return TIME;
      for (let next = Math.floor(at / 60000) * 60000 + 60000, i = 0; i < 2880 && next <= TIME; i++, next += 60000) {
        if (classification({ ...spec, mergeKinds: [], emergencyKinds: [], frequency: { windowMs: 1, maxClaims: 1 } }, [{ kind: 'milestone', at: next }], next, null) !== 'quiet') return next;
      }
      return TIME;
    }
    const progressPolicy = notificationsEnabled ? value => {
      value = capture(value); choose(value.kind, KINDS); integer(value.observedAt, 0, TIME); const p = policy(), emergency = p.spec.emergencyKinds.includes(value.kind);
      const state = classification(p.spec, [{ kind: value.kind, at: value.observedAt }], value.observedAt, null);
      return capture({ quietUntil: state === 'quiet' ? quietUntil(p.spec, value.observedAt) : 0, coalesceUntil: !emergency && p.spec.mergeKinds.includes(value.kind) ? Math.min(TIME, value.observedAt + p.spec.mergeWindowMs) : 0, allowObstaclesDuringQuiet: p.spec.emergencyKinds.includes('obstacle') });
    } : null;
    return Object.freeze({ recipientAdapter, progressPolicy, notifications: notificationsEnabled ? route : null,
      resolveLocalDelivery, localAdmission, planLocalDelivery, writeLocalReport, configureLocalNotifications, pendingLocalNotifications, prepareLocalNotification, acceptLocalNotification,
      localResultsStatus, readLocalResult, localDeliveryQuery, localDeliveryAccess,
      dispose() { if (disposed) return; disposed = true; active = false; permits.clear(); plans.clear(); unsubscribe(); } });
  } });
}
