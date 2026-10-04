import { randomUUID } from 'node:crypto';
import { exact, ref, integer, canonical, canonicalDigest, hash } from './runtime-security.mjs';
import { contextText } from './context.mjs';

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
  #store; #owner; #resolve; #clock; #alive; #secrets; #ttl; #entries = new Map(); #active = true; #pending = 0; #lastNow = null;
  constructor({ store, ownerHandle, resolve, ttlMs, clock = Date.now, isAlive = () => true, knownSecrets = [] } = {}) {
    if (!store || ['snapshot', 'readData', 'grantAction'].some(name => typeof store[name] !== 'function') || !ownerHandle ||
        typeof resolve !== 'function' || typeof clock !== 'function' || typeof isAlive !== 'function') fail('PREVIEW_UNAVAILABLE');
    integer(ttlMs, 1, 60000); contextText('', knownSecrets);
    this.#store = store; this.#owner = ownerHandle; this.#resolve = resolve; this.#ttl = ttlMs;
    this.#clock = clock; this.#alive = isAlive; this.#secrets = [...knownSecrets];
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
      const data = this.#store.readData(this.#owner, { taskRef: input.taskRef, recordRef: input.recordRef });
      if (data.recordRef !== input.recordRef || data.digest !== spec.dataDigest || typeof data.content !== 'string' ||
          hash(data.content) !== spec.dataDigest) fail('PREVIEW_UNAVAILABLE');
      contextText(data.content, this.#secrets); const originalData = canonicalDigest(data);
      let resolved;
      try { resolved = await this.#resolve(spec, frozen(before.snapshot.task)); }
      catch { fail('PREVIEW_UNAVAILABLE'); }
      const labels = this.#labels(resolved, spec);
      const after = this.#current(input);
      if (canonicalDigest(after.action.spec) !== canonicalDigest(spec) || canonicalDigest(this.#store.readData(this.#owner, { taskRef: input.taskRef, recordRef: input.recordRef })) !== originalData) fail('PREVIEW_STALE');
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
          limits: { units: spec.units, attemptIndex: spec.attemptIndex, charges: spec.charges }, evidenceRef: labels.evidenceRef } });
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
      if (canonicalDigest(current.action.spec) !== canonicalDigest(entry.spec) || canonicalDigest(this.#store.readData(this.#owner, { taskRef: input.taskRef, recordRef: entry.input.recordRef })) !== entry.originalData) fail('PREVIEW_STALE');
      // Resolve current meaning again: a live catalog/environment/policy change
      // cannot silently keep the displayed consent valid.
      let resolved;
      try { resolved = await this.#resolve(entry.spec, frozen(current.snapshot.task)); }
      catch { fail('PREVIEW_UNAVAILABLE'); }
      const labels = this.#labels(resolved, entry.spec);
      if (canonicalDigest(labels) !== canonicalDigest(entry.labels) || entry.expiresAt <= this.#now()) fail('PREVIEW_STALE');
      this.#current(input);
      if (canonicalDigest(this.#store.readData(this.#owner, { taskRef: input.taskRef, recordRef: entry.input.recordRef })) !== entry.originalData) fail('PREVIEW_STALE');
      const { previewRef, ...grant } = input;
      const receipt = this.#store.grantAction(this.#owner, grant);
      this.#entries.delete(previewRef); return frozen(receipt);
    } finally { entry.grantPending = false; }
  }
  dispose() { this.#active = false; this.#entries.clear(); }
}
