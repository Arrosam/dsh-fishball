import { randomUUID } from 'node:crypto';
import { exact, ref, integer, canonical, canonicalDigest, hash } from './runtime-security.mjs';
import { contextText } from './context.mjs';
import { validateAuditInputPair } from './audit-input-pair.mjs';
import { types } from 'node:util';
import { resumeHistory, resumeInput, configuration } from './normal-contracts.mjs';

export class PreviewError extends Error {
  constructor(code) { super(code); this.name = 'PreviewError'; this.code = code; }
}
const fail = code => { throw new PreviewError(code); };
function frozen(value) {
  const copy = JSON.parse(canonical(value));
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
  return freeze(copy);
}
const terminal = new Set(['completed', 'failed', 'cancel_requested', 'cancelled', 'recovery_required', 'deleted']);

// This cache only narrows an already admitted native owner's grant operation.
// The authoritative store still performs the grant CAS/expiry transaction.
// Resolver callbacks are trusted installation code, never RPC/model payloads.
export class ApprovalPreview {
  #store; #owner; #resolve; #readAuditInput; #readResumeInput; #describeResume; #clock; #alive; #secrets; #ttl; #entries = new Map(); #active = true; #pending = 0; #lastNow = null;
  constructor({ store, ownerHandle, resolve, readAuditInput, readResumeInput, describeResume, ttlMs, clock = Date.now, isAlive = () => true, knownSecrets = [] } = {}) {
    if (!store || ['snapshot', 'readData', 'grantAction'].some(name => typeof store[name] !== 'function') || !ownerHandle ||
        typeof resolve !== 'function' || readAuditInput !== undefined && (typeof readAuditInput !== 'function' || types.isProxy(readAuditInput) || types.isAsyncFunction(readAuditInput) || types.isGeneratorFunction(readAuditInput)) || typeof clock !== 'function' || typeof isAlive !== 'function') fail('PREVIEW_UNAVAILABLE');
    if ((readResumeInput===undefined)!==(describeResume===undefined) || [readResumeInput,describeResume].filter(x=>x!==undefined).some(x=>typeof x!=='function'||types.isProxy(x)||types.isAsyncFunction(x)||types.isGeneratorFunction(x))) fail('PREVIEW_UNAVAILABLE');
    this.#readResumeInput=readResumeInput;this.#describeResume=describeResume;
    integer(ttlMs, 1, 60000); contextText('', knownSecrets);
    this.#store = store; this.#owner = ownerHandle; this.#resolve = resolve; this.#ttl = ttlMs;
    this.#readAuditInput = readAuditInput; this.#clock = clock; this.#alive = isAlive; this.#secrets = [...knownSecrets];
  }
  #now() {
    let value; try { value = integer(this.#clock(), 0, 8640000000000000); } catch { fail('PREVIEW_UNAVAILABLE'); }
    if (this.#lastNow !== null && value < this.#lastNow) fail('PREVIEW_UNAVAILABLE');
    this.#lastNow = value; return value;
  }
  #checkAlive() { let alive = false; try { alive = this.#active && this.#alive() === true; } catch {} if (!alive) fail('SERVICE_DISPOSED'); }
  #current(input) {
    this.#checkAlive();
    const snapshot = this.#store.snapshot(this.#owner, { taskRef: input.taskRef });
    if (snapshot.task.version !== input.expectedTaskVersion || snapshot.task.authEpoch !== input.expectedAuthEpoch) fail('PREVIEW_STALE');
    if (snapshot.control !== 'active' || terminal.has(snapshot.task.status)) fail('PREVIEW_UNAVAILABLE');
    const action = snapshot.actions.find(value => value.actionRef === input.actionRef);
    if (!action || action.actionDigest !== input.actionDigest || action.claimRef || action.state !== 'requested') fail('PREVIEW_UNAVAILABLE');
    const policy = snapshot.policy;
    if (!policy?.modelPolicy || policy.version !== action.spec.resourcePolicyVersion ||
        policy.modelPolicy.version !== action.spec.modelPolicyVersion ||
        policy.modelPolicy.catalogEvidenceRef !== action.spec.model.catalogEvidenceRef ||
        !policy.modelPolicy.presetRefs.includes(action.spec.model.presetRef)) fail('PREVIEW_STALE');
    return { snapshot, action };
  }
  #material(input, current) {
    const spec = current.action.spec;
    const data = this.#store.readData(this.#owner, { taskRef: input.taskRef, recordRef: input.recordRef });
    if (spec.resumeBinding) {
      if (!this.#readResumeInput || spec.executionInput) fail('PREVIEW_UNAVAILABLE');
      const pair=this.#readResumeInput(Object.freeze({taskRef:input.taskRef,resumeRef:spec.resumeBinding.resumeRef}));
      exact(pair,['association','history','request','configuration']);
      const a=pair.association,h=JSON.parse(pair.history.content),r=JSON.parse(pair.request.content),c=JSON.parse(pair.configuration.content);
      resumeHistory(h);resumeInput(r);configuration(c);
      if(a.resumeRef!==spec.resumeBinding.resumeRef||a.taskRef!==input.taskRef||a.historyDigest!==spec.resumeBinding.historyDigest||a.inputDigest!==spec.resumeBinding.inputDigest||hash(pair.history.content)!==a.historyDigest||hash(pair.request.content)!==a.inputDigest||a.contextRecordRef!==input.recordRef||data.digest!==a.contextDigest||data.digest!==spec.dataDigest||r.contextContent!==data.content||canonical(h.messages)!==canonical(r.historyMessages))fail('PREVIEW_STALE');
      for(const content of [pair.history.content,pair.request.content,pair.configuration.content])contextText(content,this.#secrets);
      const description=this.#describeResume(pair,input);return {data,digest:canonicalDigest(pair),resume:description,audit:false};
    }
    if (!spec.executionInput) {
      if (data.recordRef !== input.recordRef || data.digest !== spec.dataDigest || typeof data.content !== 'string' || hash(data.content) !== spec.dataDigest) fail('PREVIEW_UNAVAILABLE');
      contextText(data.content, this.#secrets);
      return { data, digest: canonicalDigest(data), audit: false };
    }
    if (!this.#readAuditInput || input.recordRef !== spec.executionInput.recordRef) fail('PREVIEW_UNAVAILABLE');
    let pair;
    try {
      pair = validateAuditInputPair(this.#readAuditInput(Object.freeze({ taskRef: input.taskRef, inputRecordRef: input.recordRef })), spec, current.snapshot.task);
    } catch { fail('PREVIEW_UNAVAILABLE'); }
    if (canonicalDigest(data) !== canonicalDigest(pair.data)) fail('PREVIEW_STALE');
    const a = pair.association, snap = current.snapshot;
    const req = snap.audits?.find(row => row.auditRef === a.auditRef);
    const artifact = snap.artifacts?.filter(row => row.artifactRef === a.artifactRef).sort((x, y) => y.version - x.version)[0];
    const body = JSON.parse(pair.data.content);
    if (!req || !artifact || req.auditRevision !== a.auditRevision || req.bindingDigest !== a.bindingDigest || req.materialDigest !== a.materialDigest || req.semanticRevision !== a.semanticRevision || snap.semanticRevision !== a.semanticRevision || artifact.version !== a.artifactVersion || artifact.digest !== a.artifactDigest || artifact.recordRef !== body.artifact.recordRef || req.contextRecordRef !== a.contextRecordRef || req.contextDigest !== a.contextDigest || (a.purpose === 'audit_repair' ? req.round + 1 : req.round) !== a.round || a.purpose === 'audit_repair' && req.reportRef !== a.previousReportRef || canonical(req.material) !== canonical(a.material) || req.policyRef !== body.policy.policyRef || canonical(req.blockingSeverities) !== canonical(body.policy.blockingSeverities) || req.maxRepairRounds !== body.policy.maxRepairRounds || a.material.some(m => !snap.data?.some(d => d.recordRef === m.recordRef && d.digest === m.digest))) fail('PREVIEW_STALE');
    contextText(pair.data.content, this.#secrets);
    return { data: pair.data, digest: canonicalDigest(pair), audit: true };
  }
  #labels(value, spec) {
    const refs = ['targetDigest', 'modelRef', 'reasoningRef', 'presetRef', 'catalogEvidenceRef', 'environmentRef', 'bindingDigest', 'toolsDigest', 'permissionPolicyDigest', 'evidenceRef'];
    const labels = ['targetLabel', 'providerLabel', 'modelLabel', 'reasoningLabel', 'presetLabel', 'environmentLabel', 'cwd'];
    exact(value, [...refs, ...labels, 'toolNames']);
    for (const key of refs) ref(value[key]);
    for (const key of labels) { contextText(value[key], this.#secrets, 4096); if (!value[key].trim()) fail('PREVIEW_UNAVAILABLE'); }
    // canonical validates ordinary arrays/descriptors before any iteration.
    canonical(value.toolNames);
    if (!Array.isArray(value.toolNames) || value.toolNames.length > 64 || new Set(value.toolNames).size !== value.toolNames.length) fail('PREVIEW_UNAVAILABLE');
    for (const name of value.toolNames) { contextText(name, this.#secrets, 256); if (!name.trim()) fail('PREVIEW_UNAVAILABLE'); }
    const expected = { targetDigest: spec.targetDigest, ...spec.model,
      environmentRef: spec.executor.environmentRef, bindingDigest: spec.executor.bindingDigest,
      toolsDigest: spec.executor.toolsDigest, permissionPolicyDigest: spec.executor.permissionPolicyDigest };
    for (const [key, binding] of Object.entries(expected)) if (value[key] !== binding) fail('PREVIEW_STALE');
    return frozen(value);
  }
  async prepare(input) {
    exact(input, ['taskRef', 'actionRef', 'actionDigest', 'recordRef', 'expectedTaskVersion', 'expectedAuthEpoch']);
    for (const key of ['taskRef', 'actionRef', 'actionDigest', 'recordRef']) ref(input[key]);
    integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch); input = frozen(input);
    const now = this.#now(); this.#checkAlive();
    for (const [key, entry] of this.#entries) if (entry.expiresAt <= now) this.#entries.delete(key);
    if (this.#entries.size + this.#pending >= 64) fail('PREVIEW_CAPACITY');
    this.#pending++;
    try {
      const before = this.#current(input), spec = frozen(before.action.spec);
      const material = this.#material(input, before), data = material.data, originalData = material.digest;
      let resolved;
      try { resolved = await this.#resolve(spec, frozen(before.snapshot.task)); }
      catch { fail('PREVIEW_UNAVAILABLE'); }
      const labels = this.#labels(resolved, spec);
      const after = this.#current(input);
      if (canonicalDigest(after.action.spec) !== canonicalDigest(spec) || this.#material(input, after).digest !== originalData) fail('PREVIEW_STALE');
      const expiresAt = this.#now() + this.#ttl; integer(expiresAt, 0, 8640000000000000);
      // A token is process-private evidence of the exact displayed immutable
      // material. It does not survive restart or provide owner authentication.
      const previewRef = canonicalDigest({ nonce: randomUUID(), input, labels, expiresAt, dataDigest: data.digest });
      const value = frozen({ previewRef, taskRef: input.taskRef, actionRef: input.actionRef, actionDigest: input.actionDigest,
        taskVersion: input.expectedTaskVersion, authEpoch: input.expectedAuthEpoch, expiresAt,
        description: { kind: spec.kind, role: spec.role, targetLabel: labels.targetLabel,
          data: { recordRef: input.recordRef, digest: data.digest, kind: data.kind, content: data.content },
          model: { provider: labels.providerLabel, model: labels.modelLabel, reasoning: labels.reasoningLabel, preset: labels.presetLabel },
          toolNames: labels.toolNames, environment: { label: labels.environmentLabel, cwd: labels.cwd, environmentRef: labels.environmentRef },
          limits: { units: spec.units, attemptIndex: spec.attemptIndex, charges: spec.charges }, evidenceRef: labels.evidenceRef, ...(material.resume?{resume:material.resume}:{}) } });
      // Count the actual envelope, labels, refs, escaping and complete content
      // before publishing any usable cache token. 65536 is inclusive.
      if ((material.audit || material.resume) && Buffer.byteLength(JSON.stringify({ ok: true, value })) > 65536) fail('PREVIEW_UNAVAILABLE');
      this.#entries.set(previewRef, { input, spec, labels, originalData, expiresAt, value }); return value;
    } finally { this.#pending--; }
  }
  async grant(input) {
    exact(input, ['taskRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'expiresAt', 'previewRef']);
    for (const key of ['taskRef', 'actionRef', 'actionDigest', 'commandRef', 'previewRef']) ref(input[key]);
    integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch); integer(input.expiresAt, 1); input = frozen(input);
    this.#checkAlive(); const entry = this.#entries.get(input.previewRef);
    if (!entry || entry.expiresAt <= this.#now()) fail('PREVIEW_STALE');
    if (entry.grantPending) fail('PREVIEW_BUSY');
    entry.grantPending = true;
    try {
      for (const key of ['taskRef', 'actionRef', 'actionDigest', 'expectedTaskVersion', 'expectedAuthEpoch']) if (input[key] !== entry.input[key]) fail('PREVIEW_STALE');
      const current = this.#current(input);
      if (canonicalDigest(current.action.spec) !== canonicalDigest(entry.spec) || this.#material(entry.input, current).digest !== entry.originalData) fail('PREVIEW_STALE');
      // Resolve current meaning again: a live catalog/environment/policy change
      // cannot silently keep the displayed consent valid.
      let resolved;
      try { resolved = await this.#resolve(entry.spec, frozen(current.snapshot.task)); }
      catch { fail('PREVIEW_UNAVAILABLE'); }
      const labels = this.#labels(resolved, entry.spec);
      if (canonicalDigest(labels) !== canonicalDigest(entry.labels) || entry.expiresAt <= this.#now()) fail('PREVIEW_STALE');
      const final = this.#current(input);
      if (canonicalDigest(final.action.spec) !== canonicalDigest(entry.spec) || this.#material(entry.input, final).digest !== entry.originalData) fail('PREVIEW_STALE');
      const { previewRef, ...grant } = input;
      const receipt = this.#store.grantAction(this.#owner, grant);
      this.#entries.delete(previewRef); return frozen(receipt);
    } finally { entry.grantPending = false; }
  }
  dispose() { this.#active = false; this.#entries.clear(); }
}
