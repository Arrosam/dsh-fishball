import { types } from 'node:util';
import { exact, integer, ref, hash, canonicalDigest } from './runtime-security.mjs';
import { contextText } from './context.mjs';
import { eventCapture, routeBinding } from './events.mjs';

export class ChatError extends Error {
  constructor(code) { super(code); this.name = 'ChatError'; this.code = code; }
}
const fail = code => { throw new ChatError(code); };
const MAX_TIME = 8640000000000000;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const arraySlot = key => Object.getOwnPropertyDescriptor(typedArray, key).get;
const byteLength = arraySlot('byteLength'), byteOffset = arraySlot('byteOffset'), arrayBuffer = arraySlot('buffer');

// Call only after the request's closed descriptors have been validated.
// Payload quota excludes independently bounded task/control metadata.
function captureRequest(input, secrets) {
  const { payload, ...metadata } = input;
  return Object.freeze({ ...eventCapture(metadata, secrets), payload: eventCapture(payload, secrets) });
}

export function chatChannel({ providerRef, sourceIdentityRef, route }) {
  ref(providerRef); ref(sourceIdentityRef); routeBinding(route);
  return canonicalDigest({ providerRef, sourceIdentityRef, principalRef: route.principalRef,
    conversationRef: route.conversationRef, conversationKind: route.conversationKind,
    ...(route.threadRef ? { threadRef: route.threadRef } : {}) });
}

function attachment(value, { sourceRef, routeDigest, maxBytes, secrets }) {
  exact(value, ['attachmentRef', 'sourceRef', 'routeDigest', 'digest', 'byteLength', 'name', 'mediaType',
    'permissionState', 'observedAt', 'expiresAt', 'evidenceRef']);
  for (const key of ['attachmentRef', 'sourceRef', 'routeDigest', 'digest', 'evidenceRef']) ref(value[key]);
  if (value.sourceRef !== sourceRef || value.routeDigest !== routeDigest) fail('CHAT_ATTACHMENT_BINDING');
  integer(value.byteLength, 0, maxBytes); integer(value.observedAt, 0, MAX_TIME); integer(value.expiresAt, 0, MAX_TIME);
  if (value.expiresAt <= value.observedAt || value.permissionState !== 'granted') fail('CHAT_ATTACHMENT_UNAVAILABLE');
  contextText(value.name, secrets, 1024); contextText(value.mediaType, secrets, 128);
  if (!value.name.trim() || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value.mediaType)) fail('CHAT_ATTACHMENT_INVALID');
  return eventCapture(value, secrets);
}

// This is an installation-only adapter contract, not a selected chat service.
// Paired facts come from private verifier callbacks. RPC/body flags are data.
export class ChatAdapter {
  #store; #host; #router; #token; #sourceRef; #subscriptionRef; #providerRef; #sourceIdentityRef;
  #secrets; #limits; #clock; #alive; #attachmentReader; #outbound; #active = true;
  constructor({ store, hostHandle, router, sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef,
    verify, authorize, isCurrent, normalize, attachmentReader, outbound, maxAttachments, maxAttachmentBytes,
    knownSecrets = [], clock = Date.now, isAlive = () => true } = {}) {
    if (!store || ['chatTask', 'chatControl', 'readData', 'listEventReceipts'].some(name => typeof store[name] !== 'function') ||
        !hostHandle || !router || ['register', 'authenticate', 'ingest', 'binding', 'assertAuthenticated', 'unregister'].some(name => typeof router[name] !== 'function')) fail('CHAT_CAPABILITY_UNAVAILABLE');
    for (const value of [sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef]) ref(value);
    for (const value of [verify, authorize, isCurrent, normalize, clock, isAlive]) if (typeof value !== 'function') fail('CHAT_CONFIG_INVALID');
    integer(maxAttachments, 0, 16); integer(maxAttachmentBytes, 1, 8388608);
    if (attachmentReader !== undefined && typeof attachmentReader !== 'function') fail('CHAT_CONFIG_INVALID');
    if (outbound !== undefined) {
      exact(outbound, ['authorize', 'isCurrent', 'send', 'query', 'open']);
      for (const value of Object.values(outbound)) if (typeof value !== 'function') fail('CHAT_CONFIG_INVALID');
      outbound = Object.freeze({ ...outbound });
    }
    contextText('', knownSecrets); this.#store = store; this.#host = hostHandle; this.#router = router;
    this.#sourceRef = sourceRef; this.#subscriptionRef = subscriptionRef; this.#providerRef = providerRef; this.#sourceIdentityRef = sourceIdentityRef;
    this.#limits = { maxAttachments, maxAttachmentBytes }; this.#secrets = [...knownSecrets]; this.#clock = clock;
    this.#alive = isAlive; this.#attachmentReader = attachmentReader; this.#outbound = outbound;
    this.#token = router.register({ sourceRef, subscriptionRef, adapterRef, providerRef, sourceIdentityRef,
      verify, authorize, isCurrent: proof => this.#active && isCurrent(proof) === true,
      normalize: async (payload, proof) => {
        this.#check();
        if (proof.eventKind !== 'message') fail('CHAT_MUTATION_REQUIRES_INSTRUCTION');
        let input; try { input = eventCapture(await normalize(payload, proof), this.#secrets); } catch { fail('CHAT_INPUT_UNAVAILABLE'); }
        exact(input, ['content', 'attachments']); contextText(input.content, this.#secrets, 65536);
        if (!input.content.trim() || !Array.isArray(input.attachments) || input.attachments.length > maxAttachments) fail('CHAT_INPUT_INVALID');
        const routeDigest = canonicalDigest(proof.routeBinding), seen = new Set();
        const attachments = input.attachments.map(item => {
          const descriptor = attachment(item, { sourceRef, routeDigest, maxBytes: maxAttachmentBytes, secrets: this.#secrets });
          if (seen.has(descriptor.attachmentRef)) fail('CHAT_ATTACHMENT_INVALID'); seen.add(descriptor.attachmentRef);
          if (descriptor.expiresAt <= this.#now() || descriptor.observedAt > proof.observedAt) fail('CHAT_ATTACHMENT_UNAVAILABLE');
          return descriptor;
        });
        const goal = JSON.stringify({ contractVersion: 'df.chat-input/v1', sourceRef, subscriptionRef,
          originalEventIdRef: proof.eventIdRef ?? null, routeDigest, content: input.content, attachments });
        contextText(goal, this.#secrets, 65536); return { goal };
      } });
    try { this.#binding(); } catch (error) { router.unregister(this.#token); throw error; }
  }
  #check() { let live = false; try { live = this.#active && this.#alive() === true; } catch {} if (!live) fail('SERVICE_DISPOSED'); }
  #now() { try { return integer(this.#clock(), 0, MAX_TIME); } catch { fail('CHAT_CLOCK_INVALID'); } }
  #binding() {
    this.#check(); const binding = this.#router.binding(this.#token);
    if (binding.source.spec.kind !== 'chat' || binding.source.spec.routeBinding.conversationKind !== 'private') fail('CHAT_PRIVATE_PAIR_REQUIRED');
    return binding;
  }
  #request(binding, taskRef) {
    ref(taskRef); return { sourceRef: this.#sourceRef, subscriptionRef: this.#subscriptionRef,
      expectedSourceRevision: binding.source.revision, expectedSubscriptionRevision: binding.subscription.revision, taskRef };
  }
  async #authenticate(payload, kind, intent) {
    const authenticated = await this.#router.authenticate(this.#token, payload); this.#check();
    if (authenticated.proof.eventKind !== kind || authenticated.proof.routeBinding.conversationKind !== 'private') fail('CHAT_REQUEST_KIND_INVALID');
    if (authenticated.proof.requestDigest !== canonicalDigest(intent)) fail('CHAT_REQUEST_BINDING');
    // No await follows the final privately authenticated currentness guard.
    this.#router.assertAuthenticated(this.#token, authenticated.proof); return authenticated;
  }
  ingest(input) {
    this.#check(); exact(input, ['commandRef', 'taskId', 'payload']); return this.#router.ingest(this.#token, input);
  }
  async status(input) {
    this.#check(); exact(input, ['taskRef', 'payload']); input = captureRequest(input, this.#secrets);
    const admitted = await this.#authenticate(input.payload, 'status', { kind: 'status', taskRef: input.taskRef });
    return eventCapture(this.#store.chatTask(this.#host, this.#request(admitted, input.taskRef)), this.#secrets);
  }
  async control(input) {
    this.#check(); exact(input, ['taskRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'kind', 'payload']);
    if (!['pause', 'resume', 'cancel'].includes(input.kind)) fail('CHAT_CONTROL_INVALID'); input = captureRequest(input, this.#secrets);
    const intent = { kind: 'control', taskRef: input.taskRef, expectedTaskVersion: input.expectedTaskVersion,
      expectedAuthEpoch: input.expectedAuthEpoch, control: input.kind };
    const admitted = await this.#authenticate(input.payload, 'control', intent);
    ref(admitted.proof.eventIdRef);
    const commandRef = canonicalDigest({ kind: 'chat_control', providerRef: this.#providerRef,
      sourceIdentityRef: this.#sourceIdentityRef, eventIdRef: admitted.proof.eventIdRef,
      channelRef: chatChannel({ providerRef: this.#providerRef, sourceIdentityRef: this.#sourceIdentityRef, route: admitted.proof.routeBinding }) });
    const { payload: ignored, ...control } = input;
    return eventCapture(this.#store.chatControl(this.#host, { ...this.#request(admitted, input.taskRef), ...control, commandRef }), this.#secrets);
  }
  async readAttachment(input) {
    this.#check(); exact(input, ['taskRef', 'attachmentRef', 'payload']); input = captureRequest(input, this.#secrets);
    ref(input.attachmentRef); if (!this.#attachmentReader) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    const admitted = await this.#authenticate(input.payload, 'attachment', { kind: 'attachment', taskRef: input.taskRef, attachmentRef: input.attachmentRef });
    const snapshot = this.#store.chatTask(this.#host, this.#request(admitted, input.taskRef));
    const admittedRecords = this.#store.listEventReceipts(this.#host, { sourceRef: this.#sourceRef, subscriptionRef: this.#subscriptionRef })
      .filter(item => item.taskRef === input.taskRef && item.routeBindingDigest === canonicalDigest(admitted.proof.routeBinding))
      .flatMap(item => [{ recordRef: item.goalRecordRef, digest: item.goalDigest },
        { recordRef: item.supplementRecordRef, digest: item.supplementDigest }]).filter(item => item.recordRef && item.digest);
    let descriptor;
    for (const metadata of snapshot.data.filter(item => ['goal', 'context'].includes(item.kind) &&
      admittedRecords.some(record => record.recordRef === item.recordRef && record.digest === item.digest))) {
      const data = this.#store.readData(this.#host, { taskRef: input.taskRef, recordRef: metadata.recordRef });
      let envelope; try { envelope = JSON.parse(data.content); } catch { continue; }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) continue;
      if (envelope.contractVersion === 'df.supplement/v1') { try { envelope = JSON.parse(envelope.content); } catch { continue; } }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) continue;
      if (envelope.contractVersion !== 'df.chat-input/v1' || envelope.sourceRef !== this.#sourceRef || envelope.subscriptionRef !== this.#subscriptionRef ||
          envelope.routeDigest !== canonicalDigest(admitted.proof.routeBinding) || !Array.isArray(envelope.attachments)) continue;
      const candidate = envelope.attachments.find(item => item.attachmentRef === input.attachmentRef);
      if (candidate && descriptor && canonicalDigest(candidate) !== canonicalDigest(descriptor)) fail('CHAT_ATTACHMENT_CONFLICT');
      descriptor = candidate ?? descriptor;
    }
    if (!descriptor) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    descriptor = attachment(descriptor, { sourceRef: this.#sourceRef, routeDigest: canonicalDigest(admitted.proof.routeBinding),
      maxBytes: this.#limits.maxAttachmentBytes, secrets: this.#secrets });
    if (descriptor.expiresAt <= this.#now()) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    let received; try { received = await this.#attachmentReader(descriptor, eventCapture(admitted.proof)); } catch { fail('CHAT_ATTACHMENT_UNAVAILABLE'); }
    this.#check(); this.#router.assertAuthenticated(this.#token, admitted.proof);
    this.#store.chatTask(this.#host, this.#request(admitted, input.taskRef));
    if (descriptor.expiresAt <= this.#now()) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    exact(received, ['bytes', 'permissionState', 'observedAt', 'evidenceRef']);
    integer(received.observedAt, descriptor.observedAt, this.#now()); ref(received.evidenceRef);
    if (received.permissionState !== 'granted' || types.isProxy(received.bytes) || !types.isUint8Array(received.bytes)) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    let bytes;
    try {
      const size = byteLength.call(received.bytes);
      if (size !== descriptor.byteLength || size > this.#limits.maxAttachmentBytes) fail('CHAT_ATTACHMENT_UNAVAILABLE');
      bytes = Buffer.from(new Uint8Array(arrayBuffer.call(received.bytes), byteOffset.call(received.bytes), size));
    } catch { fail('CHAT_ATTACHMENT_UNAVAILABLE'); }
    if (hash(bytes) !== descriptor.digest || this.#secrets.some(secret => bytes.includes(Buffer.from(secret)))) fail('CHAT_ATTACHMENT_UNAVAILABLE');
    return Object.freeze({ attachmentRef: descriptor.attachmentRef, digest: descriptor.digest,
      byteLength: bytes.length, bytes, evidenceRef: received.evidenceRef, observedAt: received.observedAt });
  }
  recipientAdapter() {
    this.#check(); if (!this.#outbound) fail('CHAT_DELIVERY_UNAVAILABLE');
    const operation = async (kind, record, data) => {
      this.#check(); record = eventCapture(record, this.#secrets);
      const binding = this.#binding(), route = binding.source.spec.routeBinding;
      const channelRef = chatChannel({ providerRef: this.#providerRef, sourceIdentityRef: this.#sourceIdentityRef, route });
      if (record.recipientRef !== route.principalRef || record.channelRef !== channelRef) fail('CHAT_DELIVERY_ROUTE');
      this.#store.chatTask(this.#host, this.#request(binding, record.taskRef ?? record.intent?.taskRef));
      const request = eventCapture({ purpose: kind, route, record, ...(data ? { data } : {}) }, this.#secrets);
      let allowed; try { allowed = await this.#outbound.authorize(request); } catch { fail('CHAT_DELIVERY_DENIED'); }
      this.#check(); if (allowed !== true) fail('CHAT_DELIVERY_DENIED');
      const current = this.#binding();
      if (current.source.revision !== binding.source.revision || current.subscription.revision !== binding.subscription.revision ||
          canonicalDigest(current.source.spec.routeBinding) !== canonicalDigest(route)) fail('CHAT_DELIVERY_ROUTE');
      this.#store.chatTask(this.#host, this.#request(current, record.taskRef ?? record.intent?.taskRef));
      let connected; try { connected = this.#outbound.isCurrent(request); } catch { fail('CHAT_DELIVERY_DENIED'); }
      if (connected !== true) fail('CHAT_DELIVERY_DENIED');
      let receipt; try { receipt = await this.#outbound[kind](request); } catch { fail('CHAT_DELIVERY_OUTCOME_UNKNOWN'); }
      return eventCapture(receipt, this.#secrets);
    };
    return Object.freeze({ send: (record, data) => operation('send', record, data),
      query: record => operation('query', record), open: record => operation('open', record) });
  }
  dispose() { this.#active = false; this.#router.unregister(this.#token); }
}
