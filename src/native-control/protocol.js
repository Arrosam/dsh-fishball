import { CONTROL, CONTROL_CAPABILITIES, WIRE, controlLimits, fail } from './constants.js'

const KEYS = Object.freeze({
  empty: [], handshake: ['capabilities', 'requiredCapabilities'],
  welcome: ['capabilities', 'hostInstanceId'], message: ['messageId', 'text'],
  messageId: ['messageId'], delivery: ['messageId', 'status'], watch: ['watchId'],
  status: ['state', 'lastSequence'], watchStatus: ['watchId', 'status'],
  approval: ['approvalId', 'offerId', 'kind', 'prompt', 'choices', 'expiresAt'],
  approvalAnswer: ['approvalId', 'offerId', 'answer'], accepted: ['approvalId', 'accepted'],
  approvals: ['approvals'], closed: ['approvalId', 'offerId'], error: ['code'],
  decision: ['decision'], text: ['text'],
})

export function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail()
  const actual = Reflect.ownKeys(value)
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail()
  for (const key of actual) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail()
}

export function text(value) { if (typeof value !== 'string' || value.length < WIRE.minimum) fail() }
export function natural(value) { if (!Number.isSafeInteger(value) || value < WIRE.zero) fail() }
function member(value, values, code) { if (!values.includes(value)) fail(code) }
function array(values) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) fail()
  const keys = Reflect.ownKeys(values)
  if (keys.length !== values.length + WIRE.minimum) fail()
  for (let index = WIRE.zero; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail()
  }
}
function strings(values) {
  array(values)
  if (new Set(values).size !== values.length) fail()
  for (const value of values) text(value)
}
export function capabilities(values) {
  strings(values)
  for (const value of values) member(value, CONTROL_CAPABILITIES, CONTROL.error.capability)
}
export function status(value) {
  exact(value, KEYS.status)
  member(value.state, Object.values(CONTROL.state))
  natural(value.lastSequence)
}
export function approval(value) {
  exact(value, KEYS.approval)
  text(value.approvalId); text(value.offerId); text(value.prompt)
  member(value.kind, Object.values({ permission: CONTROL.approval.permission, question: CONTROL.approval.question }))
  strings(value.choices)
  natural(value.expiresAt)
}
export function answer(value, kind) {
  if (kind === CONTROL.approval.permission || Object.hasOwn(value ?? {}, 'decision')) {
    exact(value, KEYS.decision)
    member(value.decision, [CONTROL.approval.allow, CONTROL.approval.reject])
    if (kind === CONTROL.approval.question) fail()
  } else {
    exact(value, KEYS.text); text(value.text)
    if (kind === CONTROL.approval.permission) fail()
  }
}
function requestPayload(op, p) {
  const O = CONTROL.operation
  switch (op) {
    case O.handshake:
      exact(p, KEYS.handshake); capabilities(p.capabilities); capabilities(p.requiredCapabilities)
      if (p.requiredCapabilities.some((cap) => !p.capabilities.includes(cap))) fail(CONTROL.error.capability)
      return
    case O.messageSend: exact(p, KEYS.message); text(p.messageId); text(p.text); return
    case O.messageStatus: exact(p, KEYS.messageId); text(p.messageId); return
    case O.sessionStatus: case O.approvalList: exact(p, KEYS.empty); return
    case O.watchOpen: case O.watchClose: exact(p, KEYS.watch); text(p.watchId); return
    case O.approvalAnswer:
      exact(p, KEYS.approvalAnswer); text(p.approvalId); text(p.offerId); answer(p.answer); return
    default: fail(CONTROL.error.operation)
  }
}
function responsePayload(op, p) {
  const O = CONTROL.operation
  switch (op) {
    case O.handshake: exact(p, KEYS.welcome); capabilities(p.capabilities); text(p.hostInstanceId); return
    case O.messageSend: case O.messageStatus:
      exact(p, KEYS.delivery); text(p.messageId)
      member(p.status, Object.values(CONTROL.delivery))
      if (op === O.messageSend && p.status === CONTROL.delivery.unknown) fail()
      return
    case O.sessionStatus: status(p); return
    case O.watchOpen: case O.watchClose: exact(p, KEYS.watch); text(p.watchId); return
    case O.approvalList:
      exact(p, KEYS.approvals)
      array(p.approvals)
      for (const item of p.approvals) approval(item)
      return
    case O.approvalAnswer: exact(p, KEYS.accepted); text(p.approvalId); if (p.accepted !== true) fail(); return
    default: fail(CONTROL.error.operation)
  }
}
function eventPayload(op, p) {
  switch (op) {
    case CONTROL.event.watchStatus: exact(p, KEYS.watchStatus); text(p.watchId); status(p.status); return
    case CONTROL.event.approvalRequest: approval(p); return
    case CONTROL.event.approvalClosed: exact(p, KEYS.closed); text(p.approvalId); text(p.offerId); return
    default: fail(CONTROL.error.operation)
  }
}

/** Strict allowlist: not a generic RPC tunnel. All variants reject extra fields. */
export function validateEnvelope(envelope, expectedHostId) {
  exact(envelope, WIRE.envelopeKeys)
  if (envelope.version !== CONTROL.version) fail(CONTROL.error.version)
  text(envelope.hostId); text(envelope.requestId)
  if (expectedHostId !== undefined && envelope.hostId !== expectedHostId) fail(CONTROL.error.host)
  member(envelope.type, Object.values(CONTROL.type))
  const handshake = envelope.operation === CONTROL.operation.handshake
  if (handshake) { if (envelope.sessionId !== null) fail() }
  else text(envelope.sessionId)
  if (envelope.type === CONTROL.type.event) eventPayload(envelope.operation, envelope.payload)
  else {
    member(envelope.operation, Object.values(CONTROL.operation), CONTROL.error.operation)
    if (envelope.type === CONTROL.type.error) {
      exact(envelope.payload, KEYS.error)
      member(envelope.payload.code, Object.values(CONTROL.error))
    } else if (envelope.type === CONTROL.type.request) requestPayload(envelope.operation, envelope.payload)
    else responsePayload(envelope.operation, envelope.payload)
  }
  return envelope
}

export function encodeEnvelope(envelope, limits = controlLimits(), expectedHostId) {
  limits = controlLimits(limits)
  validateEnvelope(envelope, expectedHostId)
  let encoded
  try { encoded = JSON.stringify(envelope) } catch { fail() }
  if (Buffer.byteLength(encoded, WIRE.utf8) > limits.maxEnvelopeBytes) fail(CONTROL.error.limit)
  // Non-enumerable properties and custom JSON behavior must not alter the validated schema.
  decodeEnvelope(encoded, limits, expectedHostId)
  return encoded
}

export function decodeEnvelope(encoded, limits = controlLimits(), expectedHostId) {
  limits = controlLimits(limits)
  if (typeof encoded !== 'string') fail()
  if (Buffer.byteLength(encoded, WIRE.utf8) > limits.maxEnvelopeBytes) fail(CONTROL.error.limit)
  let envelope
  try { envelope = JSON.parse(encoded) } catch { fail() }
  return validateEnvelope(envelope, expectedHostId)
}

export function makeEnvelope(hostId, sessionId, requestId, type, operation, payload) {
  return { version: CONTROL.version, hostId, sessionId, requestId, type, operation, payload }
}
