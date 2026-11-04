/** The operation allowlist is deliberately unrelated to the host's tool registry. */
export const CONTROL = Object.freeze({
  version: 1,
  type: Object.freeze({ request: 'request', response: 'response', error: 'error', event: 'event' }),
  operation: Object.freeze({
    handshake: 'handshake', messageSend: 'message.send', messageStatus: 'message.status',
    sessionStatus: 'session.status', watchOpen: 'watch.open', watchClose: 'watch.close',
    approvalList: 'approval.list', approvalAnswer: 'approval.answer',
  }),
  event: Object.freeze({ watchStatus: 'watch.status', approvalRequest: 'approval.request', approvalClosed: 'approval.closed' }),
  error: Object.freeze({
    invalid: 'invalid-envelope', version: 'unsupported-version', host: 'wrong-host',
    operation: 'unsupported-operation', capability: 'unsupported-capability',
    handshake: 'handshake-required', forbidden: 'forbidden', limit: 'limit-exceeded',
    disconnected: 'disconnected', timeout: 'timeout', conflict: 'conflict',
    expired: 'expired', failed: 'operation-failed', duplicate: 'duplicate-request',
  }),
  delivery: Object.freeze({ pending: 'pending', delivered: 'delivered', unconfirmed: 'unconfirmed', unknown: 'unknown' }),
  state: Object.freeze({ idle: 'idle', running: 'running', waiting: 'waiting', closed: 'closed' }),
  approval: Object.freeze({ permission: 'approval', question: 'question', allow: 'allow', reject: 'reject' }),
})

export const CONTROL_CAPABILITIES = Object.freeze(Object.values(CONTROL.operation).filter((op) => op !== CONTROL.operation.handshake))

/** Resource ceilings, not authorization policy. Owners may lower or raise them explicitly. */
export const DEFAULT_CONTROL_LIMITS = Object.freeze({
  maxEnvelopeBytes: 65_536,
  maxInflight: 32,
  maxRequestIds: 8192,
  maxWatches: 64,
  maxConnections: 4,
  maxPendingApprovals: 128,
  maxDedupeEntries: 4096,
  requestTimeoutMs: 30_000,
  handshakeTimeoutMs: 10_000,
  maxApprovalTtlMs: 86_400_000,
})

export const WIRE = Object.freeze({
  utf8: 'utf8', minimum: 1, zero: 0, maxTimerMs: 2_147_483_647,
  envelopeKeys: Object.freeze(['version', 'hostId', 'sessionId', 'requestId', 'type', 'operation', 'payload']),
})

export class ControlError extends Error {
  constructor(code) {
    super(code)
    this.name = 'ControlError'
    this.code = code
  }
}

export function fail(code = CONTROL.error.invalid) { throw new ControlError(code) }

export function controlLimits(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(overrides))) fail()
  for (const key of Reflect.ownKeys(overrides)) {
    if (!Object.hasOwn(DEFAULT_CONTROL_LIMITS, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(overrides, key), 'value')) fail()
  }
  const limits = { ...DEFAULT_CONTROL_LIMITS, ...overrides }
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < WIRE.minimum) fail()
  for (const key of ['requestTimeoutMs', 'handshakeTimeoutMs', 'maxApprovalTtlMs']) if (limits[key] > WIRE.maxTimerMs) fail()
  return Object.freeze(limits)
}
