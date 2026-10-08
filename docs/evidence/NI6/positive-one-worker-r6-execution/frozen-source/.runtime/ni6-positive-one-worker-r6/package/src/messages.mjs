import { createHash } from 'node:crypto';
import { types } from 'node:util';

export class DomainError extends Error {
  constructor(code) { super(code); this.name = 'DomainError'; this.code = code; }
}
export const reject = code => { throw new DomainError(code); };
export function fields(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !allowed.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) || required.some(key => !Object.hasOwn(descriptors, key))) reject('INVALID_INPUT');
  return value;
}
export function digestRef(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) reject('INVALID_INPUT');
  return value;
}
export function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) reject('INVALID_INPUT');
  return value;
}
export function choice(value, values) {
  if (!values.includes(value)) reject('INVALID_INPUT');
  return value;
}
export function boundedArray(value, max = 16) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) reject('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || (key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))))) reject('INVALID_INPUT');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(descriptors, String(i))) reject('INVALID_INPUT');
  return value;
}
export function endpoint(value) {
  fields(value, ['sessionRef', 'generationRef']);
  return Object.freeze({ sessionRef: digestRef(value.sessionRef), generationRef: digestRef(value.generationRef) });
}
export function immutable(value, depth = 0) {
  if (depth > 16 || (value && typeof value === 'object' && types.isProxy(value))) reject('INVALID_INPUT');
  if (Array.isArray(value)) { boundedArray(value, 128); return Object.freeze(value.map(item => immutable(item, depth + 1))); }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value); if (keys.length > 64) reject('INVALID_INPUT');
    fields(value, keys);
    return Object.freeze(Object.fromEntries(Object.keys(value).sort().map(key => [key, immutable(value[key], depth + 1)])));
  }
  if (typeof value === 'string' && Buffer.byteLength(value) > 65536) reject('INPUT_TOO_LARGE');
  if (typeof value === 'string' || typeof value === 'boolean' || value === null || (typeof value === 'number' && Number.isSafeInteger(value))) return value;
  reject('INVALID_INPUT');
}
export const contentDigest = value => createHash('sha256').update(JSON.stringify(immutable(value))).digest('hex');
export const bytesDigest = value => createHash('sha256').update(value).digest('hex');
export function binding(input) {
  digestRef(input.taskRef); digestRef(input.commandRef);
  integer(input.expectedTaskVersion, 1); integer(input.expectedAuthEpoch);
  return { taskRef: input.taskRef, commandRef: input.commandRef, expectedTaskVersion: input.expectedTaskVersion, expectedAuthEpoch: input.expectedAuthEpoch };
}
export function evidence(value) {
  fields(value, ['evidenceRef', 'digest', 'observedAt']);
  return immutable({ evidenceRef: digestRef(value.evidenceRef), digest: digestRef(value.digest), observedAt: integer(value.observedAt) });
}

const CATEGORIES = ['status', 'context', 'review_request', 'review_result', 'control_request'];
// Pure normalization confers no identity or authorization. The broker obtains
// sender/prior records from trusted bindings and the authoritative store.
export function normalizeMessage(sender, input, prior = null) {
  endpoint(sender);
  fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'messageRef', 'receiver', 'bodyRecordRef', 'bodyDigest', 'byteLength', 'sourceRef', 'eventRef', 'category', 'purposeRef', 'hopLimit', 'forwardOf', 'dedupMode'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'messageRef', 'receiver', 'bodyRecordRef', 'bodyDigest', 'byteLength', 'sourceRef', 'eventRef', 'category', 'purposeRef', 'hopLimit', 'dedupMode']);
  binding(input); const receiver = endpoint(input.receiver);
  for (const key of ['messageRef', 'bodyRecordRef', 'bodyDigest', 'sourceRef', 'eventRef', 'purposeRef']) digestRef(input[key]);
  integer(input.byteLength, 0, 65536); integer(input.hopLimit, 1, 8);
  choice(input.category, CATEGORIES); choice(input.dedupMode, ['unique_id', 'unavailable']);
  let route = { originalSender: sender, originalPurposeRef: input.purposeRef, hopCount: 0, hopLimit: input.hopLimit, visitedGenerationRefs: [sender.generationRef] };
  if (prior) {
    digestRef(input.forwardOf);
    if (prior.messageRef !== input.forwardOf || prior.taskRef !== input.taskRef || prior.receiver.sessionRef !== sender.sessionRef || prior.receiver.generationRef !== sender.generationRef || prior.state !== 'consumed') reject('FORWARD_NOT_CONSUMED');
    if (input.purposeRef !== prior.route.originalPurposeRef || input.hopLimit !== prior.route.hopLimit || input.sourceRef !== prior.sourceRef || input.eventRef !== prior.eventRef || input.dedupMode !== prior.dedupMode) reject('ORIGIN_CONFLICT');
    if (input.bodyDigest !== prior.bodyDigest || input.bodyRecordRef !== prior.bodyRecordRef || input.byteLength !== prior.byteLength) reject('CONTENT_CONFLICT');
    route = { ...prior.route, hopCount: prior.route.hopCount + 1, visitedGenerationRefs: [...prior.route.visitedGenerationRefs, sender.generationRef] };
  } else if (Object.hasOwn(input, 'forwardOf')) reject('FORWARD_NOT_FOUND');
  if (route.hopCount > route.hopLimit || route.visitedGenerationRefs.length !== route.hopCount + 1) reject('HOP_LIMIT');
  if (new Set(route.visitedGenerationRefs).size !== route.visitedGenerationRefs.length || route.visitedGenerationRefs.includes(receiver.generationRef)) reject('ROUTE_LOOP');
  return immutable({ taskRef: input.taskRef, messageRef: input.messageRef, sender, receiver, bodyRecordRef: input.bodyRecordRef, bodyDigest: input.bodyDigest, byteLength: input.byteLength, sourceRef: input.sourceRef, eventRef: input.eventRef, category: input.category, purposeRef: input.purposeRef, dedupMode: input.dedupMode, route });
}

export class MessageBroker {
  #store; #host; #transport;
  constructor(store, { hostHandle, transport } = {}) {
    if (!store || ['context', 'enqueueMessage', 'getMessage', 'claimAction', 'messageObservation', 'readData'].some(name => typeof store[name] !== 'function') || !hostHandle || !transport || typeof transport.send !== 'function' || typeof transport.query !== 'function') reject('INVALID_CONFIG');
    this.#store = store; this.#host = hostHandle; this.#transport = Object.freeze({ send: transport.send.bind(transport), query: transport.query.bind(transport) });
  }
  #context(handle, taskRef) {
    const context = { ...this.#store.context(handle, taskRef), ...this.#store.task(handle, taskRef) };
    const host = this.#store.context(this.#host, taskRef);
    if (context.ownerRef !== host.ownerRef || context.workspaceRef !== host.workspaceRef) reject('SCOPE_DENIED');
    endpoint({ sessionRef: context.sessionRef, generationRef: context.generationRef });
    return context;
  }
  #ref(context) {
    return contentDigest({ ownerRef: context.ownerRef, workspaceRef: context.workspaceRef, taskRef: context.taskRef, sessionRef: context.sessionRef, generationRef: context.generationRef });
  }
  #normalized(record, handle, taskRef, depth = 0) {
    if (depth > 8) reject('HOP_LIMIT');
    const meta = record.immutableMetadata;
    if (!meta) reject('MESSAGE_BINDING_MISSING');
    const input = { taskRef, commandRef: record.messageRef, expectedTaskVersion: 1, expectedAuthEpoch: 0, messageRef: record.messageRef, receiver: { sessionRef: meta.recipientSessionRef, generationRef: meta.recipientGenerationRef }, bodyRecordRef: record.bodyRecordRef, bodyDigest: record.bodyDigest, byteLength: record.byteLength, sourceRef: meta.sourceRef, eventRef: meta.eventRef, category: meta.category, purposeRef: meta.purposeRef, hopLimit: meta.hopLimit, dedupMode: meta.dedupMode ?? 'unique_id' };
    let prior = null;
    if (meta.originalMessageRef) {
      input.forwardOf = meta.originalMessageRef;
      prior = this.#normalized(this.#store.getMessage(this.#host, { taskRef, messageRef: meta.originalMessageRef }), handle, taskRef, depth + 1);
    }
    const normalized = normalizeMessage({ sessionRef: meta.senderSessionRef, generationRef: meta.senderGenerationRef }, input, prior);
    return { ...normalized, state: record.state };
  }
  accept(handle, input) {
    fields(input, ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'messageRef', 'recipientHandle', 'bodyRecordRef', 'bodyDigest', 'byteLength', 'sourceRef', 'eventRef', 'category', 'purposeRef', 'hopLimit', 'forwardOf', 'dedupMode'], ['taskRef', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch', 'messageRef', 'recipientHandle', 'bodyRecordRef', 'bodyDigest', 'byteLength', 'sourceRef', 'eventRef', 'category', 'purposeRef', 'hopLimit', 'dedupMode']);
    binding(input);
    const sender = this.#context(handle, input.taskRef), receiver = this.#context(input.recipientHandle, input.taskRef);
    if (sender.ownerRef !== receiver.ownerRef || sender.workspaceRef !== receiver.workspaceRef || sender.taskRef !== receiver.taskRef) reject('SCOPE_DENIED');
    if (sender.role === 'reviewer' && input.category !== 'review_result') reject('MESSAGE_CATEGORY_DENIED');
    const normalizedInput = { ...input, receiver: { sessionRef: receiver.sessionRef, generationRef: receiver.generationRef } }; delete normalizedInput.recipientHandle;
    const prior = input.forwardOf ? this.#normalized(this.#store.getMessage(handle, { taskRef: input.taskRef, messageRef: input.forwardOf }), handle, input.taskRef) : null;
    normalizeMessage({ sessionRef: sender.sessionRef, generationRef: sender.generationRef }, normalizedInput, prior);
    if (!prior) {
      const body = this.#store.readData(handle, { taskRef: input.taskRef, recordRef: input.bodyRecordRef });
      if ((body.kind !== 'message' && !(sender.role === 'reviewer' && input.category === 'review_result' && body.kind === 'verification')) || body.digest !== input.bodyDigest || body.byteLength !== input.byteLength || bytesDigest(body.content) !== input.bodyDigest) reject('BODY_BINDING_INVALID');
    }
    const metadata = { senderRef: this.#ref(sender), senderSessionRef: sender.sessionRef, senderGenerationRef: sender.generationRef, recipientRef: this.#ref(receiver), recipientSessionRef: receiver.sessionRef, recipientGenerationRef: receiver.generationRef, category: input.category, purposeRef: input.purposeRef, sourceRef: input.sourceRef, eventRef: input.eventRef, hopLimit: input.hopLimit, dedupMode: input.dedupMode };
    if (input.forwardOf) metadata.originalMessageRef = input.forwardOf;
    return immutable(this.#store.enqueueMessage(handle, { ...binding(input), messageRef: input.messageRef, recipientRef: metadata.recipientRef, bodyRecordRef: input.bodyRecordRef, bodyDigest: input.bodyDigest, immutableMetadata: metadata }));
  }
  read(handle, taskRef, messageRef) {
    digestRef(taskRef); digestRef(messageRef);
    const record = this.#store.getMessage(handle, { taskRef, messageRef });
    return immutable({ ...record, provenance: this.#normalized(record, handle, taskRef) });
  }
  async #observe(taskRef, record, receipt) {
    fields(receipt, ['messageRef', 'bodyDigest', 'recipientSessionRef', 'recipientGenerationRef', 'state', 'evidenceRef']);
    const meta = record.immutableMetadata;
    if (receipt.messageRef !== record.messageRef || receipt.bodyDigest !== record.bodyDigest || receipt.recipientSessionRef !== meta.recipientSessionRef || receipt.recipientGenerationRef !== meta.recipientGenerationRef) reject('RECEIPT_BINDING_INVALID');
    choice(receipt.state, ['sent', 'consumed', 'unknown', 'rejected']); digestRef(receipt.evidenceRef);
    return immutable(this.#store.messageObservation(this.#host, { taskRef, messageRef: record.messageRef, commandRef: contentDigest({ messageRef: record.messageRef, claimRef: record.claimRef, state: receipt.state, evidenceRef: receipt.evidenceRef }), state: receipt.state, evidenceRef: receipt.evidenceRef, claimRef: record.claimRef, generationRef: record.generationRef }));
  }
  async dispatch(handle, input) {
    fields(input, ['taskRef', 'messageRef', 'actionRef', 'actionDigest', 'commandRef', 'expectedTaskVersion', 'expectedAuthEpoch']); binding(input);
    for (const key of ['messageRef', 'actionRef', 'actionDigest']) digestRef(input[key]);
    input = immutable(input);
    // Authorize the caller's scoped read before accessing the trusted host path.
    const existing = this.#store.getMessage(handle, { taskRef: input.taskRef, messageRef: input.messageRef });
    const caller = this.#store.context(handle, input.taskRef);
    if (!['owner', 'coordinator', 'host'].includes(caller.role) && (caller.sessionRef !== existing.immutableMetadata.senderSessionRef || caller.generationRef !== existing.immutableMetadata.senderGenerationRef)) reject('DISPATCH_CALLER_DENIED');
    if (existing.state !== 'accepted') return immutable({ dispatched: false, reconciliationRequired: ['outbox_committed', 'sent', 'unknown'].includes(existing.state), message: existing });
    this.#store.claimAction(this.#host, { ...binding(input), actionRef: input.actionRef, actionDigest: input.actionDigest, outbox: { messageRef: input.messageRef } });
    const record = this.#store.getMessage(this.#host, { taskRef: input.taskRef, messageRef: input.messageRef });
    if (record.state !== 'outbox_committed' || !record.claimRef || !record.reservationRef) reject('OUTBOX_NOT_CLAIMED');
    let receipt;
    try {
      const content = this.#store.readData(this.#host, { taskRef: input.taskRef, recordRef: record.bodyRecordRef });
      receipt = await this.#transport.send(immutable(record), content);
      const message = await this.#observe(input.taskRef, record, receipt);
      return immutable({ dispatched: true, message });
    } catch {
      // Transport errors, invalid acknowledgements and lost persistence all
      // become uncertainty. No raw exception or callback prose enters evidence.
      const message = this.#store.messageObservation(this.#host, { taskRef: input.taskRef, messageRef: record.messageRef, commandRef: contentDigest({ messageRef: record.messageRef, claimRef: record.claimRef, state: 'unknown' }), state: 'unknown', evidenceRef: contentDigest({ code: 'MESSAGE_OUTCOME_UNKNOWN' }), claimRef: record.claimRef, generationRef: record.generationRef });
      return immutable({ dispatched: true, message });
    }
  }
  async reconcile(handle, { taskRef, messageRef }) {
    digestRef(taskRef); digestRef(messageRef);
    const record = this.#store.getMessage(handle, { taskRef, messageRef });
    if (!['outbox_committed', 'sent', 'unknown'].includes(record.state)) return immutable(record);
    let receipt;
    try { receipt = await this.#transport.query(immutable(record)); }
    catch { return immutable({ ...record, reconciliationRequired: true }); }
    return this.#observe(taskRef, record, receipt);
  }
}
