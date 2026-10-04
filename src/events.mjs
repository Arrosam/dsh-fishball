import { exact, canonical, canonicalDigest, integer, ref, reference } from './runtime-security.mjs';
import { contextText } from './context.mjs';

export class EventError extends Error {
  constructor(code) { super(code); this.name = 'EventError'; this.code = code; }
}
const fail = code => { throw new EventError(code); };
const MAX_TIME = 8640000000000000;
export function eventCapture(value, secrets = []) {
  const text = canonical(value); contextText(text, secrets, 65536);
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
  return freeze(JSON.parse(text));
}
export function routeBinding(value) {
  exact(value, ['pairingRef', 'pairingRevision', 'principalRef', 'conversationRef', 'threadRef', 'conversationKind'],
    ['pairingRef', 'pairingRevision', 'principalRef', 'conversationRef', 'conversationKind']);
  for (const key of ['pairingRef', 'principalRef', 'conversationRef']) ref(value[key]);
  if (value.threadRef !== undefined) ref(value.threadRef);
  integer(value.pairingRevision, 1);
  if (!['private', 'group'].includes(value.conversationKind)) fail('EVENT_PROOF_INVALID');
  return eventCapture(value);
}

// Only a trusted native installation can register these verifier closures.
// A copied/serialized token, payload identity or signature flag is powerless.
export class EventRouter {
  #store; #host; #clock; #alive; #secrets; #entries = new Map(); #active = true; #pending = 0;
  constructor({ store, hostHandle, clock = Date.now, isAlive = () => true, knownSecrets = [] } = {}) {
    if (!store || ['source', 'subscription', 'ingestEvent', 'task'].some(name => typeof store[name] !== 'function') ||
        !hostHandle || typeof clock !== 'function' || typeof isAlive !== 'function') fail('EVENT_CAPABILITY_UNAVAILABLE');
    contextText('', knownSecrets); this.#store = store; this.#host = hostHandle; this.#clock = clock; this.#alive = isAlive; this.#secrets = [...knownSecrets];
  }
  #check(entry) {
    let alive = false; try { alive = this.#active && this.#alive() === true && (!entry || entry.active); } catch {}
    if (!alive) fail('SERVICE_DISPOSED');
  }
  #now() { try { return integer(this.#clock(), 0, MAX_TIME); } catch { fail('EVENT_CLOCK_INVALID'); } }
  register(value) {
    this.#check();
    exact(value, ['sourceRef', 'subscriptionRef', 'adapterRef', 'providerRef', 'sourceIdentityRef', 'verify', 'authorize', 'isCurrent', 'normalize']);
    for (const key of ['sourceRef', 'subscriptionRef', 'adapterRef', 'providerRef', 'sourceIdentityRef']) ref(value[key]);
    for (const key of ['verify', 'authorize', 'isCurrent', 'normalize']) if (typeof value[key] !== 'function') fail('EVENT_ADAPTER_INVALID');
    if (this.#entries.size >= 128) fail('EVENT_ADAPTER_CAPACITY');
    const token = Object.freeze({}); this.#entries.set(token, { ...value, active: true }); return token;
  }
  #entry(token) { const entry = this.#entries.get(token); this.#check(entry); if (!entry) fail('EVENT_ADAPTER_INVALID'); return entry; }
  binding(token) {
    const entry = this.#entry(token), source = eventCapture(this.#store.source(this.#host, { sourceRef: entry.sourceRef })),
      subscription = eventCapture(this.#store.subscription(this.#host, { subscriptionRef: entry.subscriptionRef }));
    if (source.sourceRef !== entry.sourceRef || source.spec.adapterRef !== entry.adapterRef ||
        subscription.subscriptionRef !== entry.subscriptionRef || subscription.sourceRef !== entry.sourceRef) fail('ROUTE_MISMATCH');
    integer(source.revision, 1); integer(subscription.revision, 1);
    if (!source.spec.enabled) fail('SOURCE_DISABLED'); if (!subscription.spec.enabled) fail('SUBSCRIPTION_DISABLED');
    return eventCapture({ source, subscription });
  }
  async #authenticate(token, payload) {
    const entry = this.#entry(token), captured = eventCapture(payload, this.#secrets), binding = this.binding(token), receivedAt = this.#now();
    let proof;
    try { proof = eventCapture(await entry.verify(captured), this.#secrets); }
    catch { fail('EVENT_AUTHENTICATION_FAILED'); }
    exact(proof, ['providerRef', 'sourceIdentityRef', 'eventIdRef', 'observedAt', 'routeBinding', 'eventKind', 'requestDigest'], ['providerRef', 'sourceIdentityRef', 'observedAt']);
    ref(proof.providerRef); ref(proof.sourceIdentityRef); integer(proof.observedAt, 0, MAX_TIME);
    if (proof.providerRef !== entry.providerRef || proof.sourceIdentityRef !== entry.sourceIdentityRef) fail('EVENT_PROOF_INVALID');
    if (binding.source.spec.identityMode === 'unique_id') ref(proof.eventIdRef);
    else if (binding.source.spec.identityMode !== 'unavailable' || proof.eventIdRef !== undefined) fail('EVENT_PROOF_INVALID');
    if (binding.source.spec.kind === 'chat') {
      routeBinding(proof.routeBinding);
      if (canonicalDigest(proof.routeBinding) !== canonicalDigest(binding.source.spec.routeBinding)) fail('ROUTE_MISMATCH');
      if (!['message', 'edit', 'delete', 'status', 'control', 'attachment'].includes(proof.eventKind)) fail('EVENT_PROOF_INVALID');
      if (proof.requestDigest !== undefined) ref(proof.requestDigest);
    } else if (proof.routeBinding !== undefined || proof.eventKind !== undefined || proof.requestDigest !== undefined) fail('EVENT_PROOF_INVALID');
    let allowed;
    try { allowed = await entry.authorize(eventCapture({ ...binding, proof })); } catch { fail('EVENT_PERMISSION_DENIED'); }
    this.#check(entry); if (allowed !== true) fail('EVENT_PERMISSION_DENIED');
    this.assertAuthenticated(token, proof);
    return eventCapture({ ...binding, proof, payload: captured, receivedAt });
  }
  async authenticate(token, payload) {
    this.#entry(token); if (this.#pending >= 32) fail('EVENT_ADAPTER_BUSY'); this.#pending++;
    try { return await this.#authenticate(token, payload); } finally { this.#pending--; }
  }
  assertAuthenticated(token, proof) {
    const entry = this.#entry(token); let current;
    try { current = entry.isCurrent(proof); } catch { fail('EVENT_AUTHENTICATION_FAILED'); }
    if (current !== true) fail('EVENT_AUTHENTICATION_FAILED');
    return true;
  }
  async ingest(token, input) {
    this.#entry(token); if (this.#pending >= 32) fail('EVENT_ADAPTER_BUSY'); this.#pending++;
    try {
      exact(input, ['commandRef', 'taskId', 'payload', 'clockRef', 'expectedCursor', 'scheduledAt', 'verificationPlanDigest'], ['commandRef', 'taskId', 'payload']);
      ref(input.commandRef); reference(input.taskId); input = eventCapture(input, this.#secrets);
      const authenticated = await this.#authenticate(token, input.payload), entry = this.#entry(token);
      if (authenticated.source.spec.kind === 'chat' && authenticated.proof.eventKind !== 'message') fail('EVENT_MUTATION_DENIED');
      let normalized;
      try { normalized = eventCapture(await entry.normalize(authenticated.payload, authenticated.proof), this.#secrets); }
      catch { fail('EVENT_NORMALIZATION_FAILED'); }
      exact(normalized, ['goal']); contextText(normalized.goal, this.#secrets, 65536);
      if (!normalized.goal.trim()) fail('EVENT_NORMALIZATION_FAILED');
      const { source, subscription, proof, receivedAt } = authenticated;
      // Subscription/configuration revisions are admission predicates, not
      // provider event identity. Moving a subscription cannot replay its event.
      const identity = { providerRef: proof.providerRef, sourceIdentityRef: proof.sourceIdentityRef,
        ...(proof.routeBinding ? { origin: { principalRef: proof.routeBinding.principalRef,
          conversationRef: proof.routeBinding.conversationRef, conversationKind: proof.routeBinding.conversationKind,
          ...(proof.routeBinding.threadRef ? { threadRef: proof.routeBinding.threadRef } : {}) } } : {}) };
      const eventRef = canonicalDigest({ ...identity, identityMode: source.spec.identityMode,
        identityRef: proof.eventIdRef ?? input.commandRef });
      const eventDigest = canonicalDigest({ identity, proof, payload: authenticated.payload, normalized });
      const request = { commandRef: input.commandRef, sourceRef: source.sourceRef, subscriptionRef: subscription.subscriptionRef,
        expectedSourceRevision: source.revision, expectedSubscriptionRevision: subscription.revision,
        eventRef, eventDigest, observedAt: proof.observedAt, receivedAt, taskId: input.taskId,
        providerRef: proof.providerRef, sourceIdentityRef: proof.sourceIdentityRef, goal: normalized.goal,
        ...(proof.routeBinding ? { routeBinding: proof.routeBinding } : {}) };
      if (subscription.spec.route === 'supplement') {
        const task = this.#store.task(this.#host, subscription.spec.targetTaskRef);
        request.targetTaskRef = task.taskRef; request.expectedTaskVersion = task.version; request.expectedAuthEpoch = task.authEpoch;
      } else if (subscription.spec.route !== 'new_task') fail('ROUTE_MISMATCH');
      if (input.clockRef !== undefined) {
        ref(input.clockRef); integer(input.scheduledAt, 0, MAX_TIME);
        if (input.expectedCursor !== null) integer(input.expectedCursor, 0, MAX_TIME);
        Object.assign(request, { clockRef: input.clockRef, expectedCursor: input.expectedCursor, scheduledAt: input.scheduledAt });
        if (input.verificationPlanDigest !== undefined) request.verificationPlanDigest = ref(input.verificationPlanDigest);
      } else if (input.expectedCursor !== undefined || input.scheduledAt !== undefined || input.verificationPlanDigest !== undefined) fail('EVENT_CLOCK_INVALID');
      // No await follows this privately supplied currentness guard. Core checks
      // source/subscription revocation and task CAS under the ingress lock.
      this.assertAuthenticated(token, proof);
      const receipt = this.#store.ingestEvent(this.#host, request);
      return eventCapture({ ...receipt, eventRef, eventDigest,
        identityMode: source.spec.identityMode, identityLimit: source.spec.identityMode === 'unavailable' ? 'same_command_only' : 'complete_event_identity' });
    } finally { this.#pending--; }
  }
  unregister(token) { const entry = this.#entries.get(token); if (entry) { entry.active = false; this.#entries.delete(token); } }
  dispose() { this.#active = false; for (const entry of this.#entries.values()) entry.active = false; this.#entries.clear(); }
}
