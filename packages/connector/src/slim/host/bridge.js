/**
 * The slim session bridge, main-host half (§5.1, §5.2, §15 T05).
 *
 * One envelope-v2 channel over the already-authenticated lifecycle transport
 * (src/native-runtime/wire.js): the child sends session requests, this host answers, and the
 * host pushes inbox items and state events the other way. The channel is not a generic RPC
 * tunnel — only the §5.2 allowlist is dispatched, every frame is validated with the frozen
 * contract, and the operation-specific refusals are the contract's own error codes.
 *
 * Responsibilities kept here, because they are the bridge's rules, not the DSH adapter's:
 * - Authorization (§5.1): a managed-session operation needs the session to be managed; a
 *   related-session operation needs it managed or watched. Nothing else reaches the service.
 * - Delivery dedupe (§5.2): one requestId has one terminal answer per connection. A repeat
 *   after the answer is the remembered answer, never a second delivery; a repeat while the
 *   first is in flight is refused with duplicate-request and the original reply is dropped.
 *   The child never retries, so a reconnect starts with no remembered work.
 * - Bounded reading (§5.2): the caller's maxMessages/maxBytes are honoured and the reply is
 *   cut to fit the contract's 1 MiB frame, reporting truncated instead of failing.
 * - Start never creates a folder (§5.2): the folder is resolved to an existing workspace or an
 *   existing absolute directory before the service is called; a missing folder is refused.
 * - Attachments never travel as paths or bytes in a session frame (§6.2, §6.4): attachment.put
 *   admits child bytes behind a single-use hostRef, and session.start/message/redirect replace
 *   those refs with main-side store blocks inside the port.
 * - The child never receives a path, a token or main credentials: only titles, ids and
 *   message text cross, and every response is validated by encodeEnvelope before it is sent.
 *
 * The main-DSH work itself is the injected session service. This file deliberately does not
 * reach into the legacy Fishball row: the managed registry, the watch registry and the
 * session controller stay owned by their row, and the wiring adapts them to SERVICE below.
 * That keeps the bridge testable against a stub, and keeps T14/T15 free to change how the
 * host stores its bookkeeping.
 *
 * The §5.2 operations register through one seam: T06's attachment.read/put come from the
 * session port's image port when it implements them, and T09's approval.*, question.answer,
 * prompt.* and grant.* are registered by src/slim/host/approvals.js. A registered operation
 * enters the handshake's capability list; an unavailable one answers unsupported-operation.
 *
 * @typedef {Object} SessionSummary
 * @property {string} sessionId
 * @property {string} title
 * @property {string|null} workspaceId
 * @property {boolean} running
 * @property {boolean} pendingInteraction
 *
 * @typedef {Object} SessionService  The main-DSH port the wiring adapts; the host never reaches past it.
 * @property {() => boolean} enabled            The Session messages switch.
 * @property {() => string[]} managedIds        Every managed session (the §5.2 "related" core).
 * @property {(id: string) => boolean} isManaged
 * @property {(id: string) => boolean} isFishball
 * @property {(id: string) => Promise<SessionSummary|undefined>} describe  undefined = unknown or archived.
 * @property {() => Array<{id: string, path: string}>} workspaces
 * @property {(path: string) => Promise<{id: string}|undefined>} resolveWorkspacePath
 * @property {(input: {target: {workspaceId: string}|{cwd: string}, title: string, model?: string, reasoningEffort?: string, message: string, attachments?: string[], notifyWhenFinished?: boolean}) => Promise<{sessionId: string, managed: boolean, titleError?: string, workspaceError?: string, watchId?: string, watchError?: string}>} start
 * @property {(input: {sessionId: string, message: string, attachments?: string[], notifyWhenFinished?: boolean}) => Promise<{status: string, watchId?: string, watchError?: string}>} message
 *   notifyWhenFinished: the service sets the watch up with the watermark read before delivery (7713 N5).
 * @property {(input: {sessionId: string, message: string, attachments?: string[]}) => Promise<{status: string}>} redirect
 * @property {(input: {sessionId: string, reason?: string}) => Promise<{stopped: boolean}>} stop
 * @property {(input: {sessionId: string, maxMessages: number, maxBytes: number}) => Promise<{messages: object[], truncated: boolean}>} read
 * @property {(input: {sessionId: string, mode: string}) => Promise<{watchId: string}|{watchError: string}>} watch
 * @property {() => Promise<Array<{watchId: string, sessionId: string, mode: string, status: string}>>} watches
 * @property {(input: {watchId: string}) => Promise<unknown>} unwatch
 * @property {(input: {sessionId: string, reason: string}) => Promise<unknown>} release
 * @property {{read: (input: {sessionId: string, attachmentId: string}) => Promise<object>, put: (payload: object) => Promise<object>, resolve: (hostRefs: string[]) => object[]}} [attachment]
 *   - the §6.2/§6.4 image port; when absent the attachment operations stay unregistered and a
 *   hostRef-carrying session request is refused feature-off rather than silently dropping images.
 */
import { createHash, randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import {
  DELIVERY, DIGEST, ENVELOPE, ERROR, EVENTS, IMAGE_TYPES, OPERATION, OPERATIONS, ROLE, SIDE, WATCH_ERROR,
  WATCH_MODE, WATCH_STATUS, TRANSPORT_METHODS, ContractError, checkHandshake, decodeEnvelope, encodeEnvelope, makeEnvelope, validateEvent,
  validateRequest,
} from '../contract.js'
import { LIMITS } from '../limits.js'

/**
 * Bridge resource ceilings. They are runtime configuration, not domain rules, so they are
 * separate from src/slim/limits.js (which is the frozen contract's own numeric set).
 * The four that mirror src/native-control/constants.js's v1 control limits keep those values
 * until the slim contract owns a bridge timeout: one bridge, one set of numbers.
 */
export const BRIDGE_HOST = Object.freeze({
  /** A request that outruns this is answered timeout and the connection is dropped: its state is unknown. */
  requestTimeoutMs: 30_000,
  handshakeTimeoutMs: 10_000,
  /** Requests being served at once; beyond it a request is refused with limit-exceeded. */
  maxInflight: 32,
  /** Remembered requestIds per connection (dedupe); at the bound a new id is refused, never evicted. */
  maxRequestIds: 4096,
  /** Inbox items waiting for an ack; a stopped child keeps the ledger's items, not these. */
  inboxPending: 256,
  /** Dedupe keys already acked by this host instance. */
  inboxAcked: 1024,
  /** Freed for the envelope's own keys so a bounded read never overflows the 1 MiB frame. */
  readReserveBytes: 4096,
})

/** The §5.2 operations this task implements; the handshake advertises exactly these. */
export const SESSION_OPERATIONS = Object.freeze([
  OPERATION.sessionList, OPERATION.sessionStart, OPERATION.sessionMessage, OPERATION.sessionRedirect,
  OPERATION.sessionStop, OPERATION.sessionRead, OPERATION.sessionWatch, OPERATION.sessionWatches,
  OPERATION.sessionUnwatch, OPERATION.sessionRelease,
])

/**
 * Every §5.2 operation now has an owner: the session handlers in this file, T06's attachment
 * handlers when the session port carries an image port, and T09's nine approval, question,
 * prompt and grant handlers registered by src/slim/host/approvals.js. The list stays as the
 * explicit statement of that coverage; an operation that is unavailable at runtime (a missing
 * image port) answers the contract's unsupported-operation from dispatch, not from this list.
 */
export const UNIMPLEMENTED_OPERATIONS = Object.freeze([])

/** Operations whose authorization needs a managed session (§5.2). */
const MANAGED_OPERATIONS = new Set([
  OPERATION.sessionMessage, OPERATION.sessionRedirect, OPERATION.sessionStop, OPERATION.sessionRelease,
])
/** Operations whose authorization needs a related session: managed, watched, messaged by or forwarded. */
const RELATED_OPERATIONS = new Set([OPERATION.sessionRead, OPERATION.sessionWatch, OPERATION.attachmentRead])
/** Message-carrying operations that consume attachment hostRefs (§6.4). */
const ATTACHMENT_OPERATIONS = new Set([OPERATION.sessionStart, OPERATION.sessionMessage, OPERATION.sessionRedirect])

const ERROR_CODES = new Set(Object.values(ERROR))
const SERVICE_METHODS = Object.freeze([
  'enabled', 'managedIds', 'isManaged', 'isFishball', 'describe', 'workspaces', 'resolveWorkspacePath',
  'start', 'message', 'redirect', 'stop', 'read', 'watch', 'watches', 'unwatch', 'release',
])
const ENCODING = Object.freeze({ hex: 'hex' })

/** A bounded comparison key for request dedupe: a digest, never the payload text itself. */
const fingerprintOf = (payload) => createHash(DIGEST.algorithm).update(JSON.stringify(payload)).digest(ENCODING.hex)

/** A refusal with a contract error code; dispatch turns it into an error frame. */
export class BridgeRefusal extends Error {
  constructor(code) {
    super(code)
    this.name = 'BridgeRefusal'
    this.code = code
  }
}

function refuse(code = ERROR.failed) { throw new BridgeRefusal(code) }

/** Only contract codes may travel in an error frame (the validator checks the same set). */
function errorCode(error) {
  const code = error instanceof BridgeRefusal || error instanceof ContractError ? error.code : undefined
  return ERROR_CODES.has(code) ? code : ERROR.failed
}

/**
 * Create the host half of the session bridge.
 *
 * @param {object} options
 * @param {string} options.hostId - the lifecycle host identity every frame must carry.
 * @param {SessionService} options.sessions - the main-DSH port (see the file header).
 * @param {string} [options.hostInstanceId] - the welcome identity; a fresh one per host object.
 * @param {object} [options.limits] - overrides of BRIDGE_HOST (whole numbers only).
 * @param {() => number} [options.now] - validation clock for answer payloads (T09).
 * @returns the host object; see the methods below for the exact contract.
 */
export function createBridgeHost(options) {
  const { hostId, sessions, hostInstanceId = randomUUID(), limits, now = Date.now } = options ?? {}
  if (typeof hostId !== 'string' || hostId.length === 0) throw new TypeError('fishball bridge: a host id is required')
  if (typeof now !== 'function') throw new TypeError('fishball bridge: now must be a function')
  for (const method of SERVICE_METHODS) {
    if (typeof sessions?.[method] !== 'function') throw new TypeError('fishball bridge: the session service must implement ' + method)
  }
  return new BridgeHost({ hostId, hostInstanceId, sessions, now, limits })
}

/**
 * The protocol host: one live child connection, request dispatch with dedupe, and the
 * main-to-child direction (inbox requests, state events). Handlers are registered before a
 * transport attaches, so the handshake advertises exactly what this side answers.
 */
class BridgeHost {
  constructor({ hostId, hostInstanceId, sessions, now, limits }) {
    this.hostId = hostId
    this.hostInstanceId = hostInstanceId
    this.sessions = sessions
    this.now = now
    this.limits = freezeLimits(limits)
    this.handlers = new Map()
    /** Lifecycle listeners for T09's re-offer: a reconnect is a clean slate for offers (§5.2). */
    this.connectionListeners = new Set()
    this.connection = undefined
    this.inboxPending = new Map()
    this.inboxOrder = []
    this.inboxAcked = new Set()
    this.closed = false
    for (const [operation, handler] of sessionHandlers(sessions)) this.handlers.set(operation, handler)
    // T06 registers the attachment operations through the same seam every later task uses, so
    // the hello advertises them only when the port can actually serve them.
    for (const [operation, handler] of imageHandlers(sessions)) this.register(operation, handler)
  }

  /** The operations this host answers now; the handshake's welcome is built from it. */
  get capabilities() { return Object.freeze([...this.handlers.keys()]) }

  /**
   * Add one §5.2 operation. T09 and T06 call this for their own operations before a transport
   * attaches (the welcome advertises only handlers registered by then). The bridge's shared
   * managed/related authorization covers the session set only; a registered operation's own
   * authorization (a live offer, a referenced image) belongs to its handler.
   * @param {string} operation - a contract request name.
   * @param {(request: {sessionId: string|null, payload: object, signal: AbortSignal}) => Promise<object>} handler
   */
  register(operation, handler) {
    if (this.closed) throw new ContractError(ERROR.disconnected)
    if (typeof operation !== 'string' || !Object.hasOwn(OPERATIONS, operation)) throw new ContractError(ERROR.operation)
    if (typeof handler !== 'function') throw new TypeError('fishball bridge: a handler must be a function')
    if (this.handlers.has(operation)) throw new ContractError(ERROR.conflict)
    this.handlers.set(operation, handler)
  }

  /**
   * Observe the channel becoming ready and going away. T09 uses the ready edge to re-offer the
   * live approval and question cards after a reconnect (the host never replays a request), and
   * the close edge to stop treating the child as the live answerer. A listener owns its failure.
   * @param {(connection: {ready: boolean, connectionId: string}) => void} listener
   * @returns {() => void} disposer
   */
  onConnection(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball bridge: a connection listener must be a function')
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  /**
   * Attach the authenticated transport. One connection is live at a time: a reattach closes the
   * previous one (its in-flight replies are dropped; the child never retries them).
   * The child owns the handshake, so attach never sends before the child's hello.
   * @param {{send: Function, onMessage: Function, onClose: Function, close: Function}} transport
   * @param {{hostId?: string, connectionId?: string}} [metadata]
   * @returns {{connectionId: string, close: () => void}}
   */
  attach(transport, metadata = {}) {
    if (this.closed) throw new ContractError(ERROR.disconnected)
    for (const method of TRANSPORT_METHODS) {
      if (typeof transport?.[method] !== 'function') throw new TypeError('fishball bridge: the transport must implement ' + method)
    }
    if (metadata.hostId !== undefined && metadata.hostId !== this.hostId) {
      try { transport.close() } catch { /* already gone */ }
      throw new ContractError(ERROR.host)
    }
    this.disconnect()
    const connection = {
      connectionId: typeof metadata.connectionId === 'string' ? metadata.connectionId : randomUUID(),
      transport, closed: false, ready: false, handshaking: false, announced: new Set(),
      seen: new Map(), pending: new Map(), inflight: 0, inboxSending: false,
      // Inbox keys the child refused on this connection: they stay queued for the next one, and
      // are never retried here (contract §3.3, §4.5).
      inboxRefused: new Set(),
      disposers: [], timer: undefined, abort: new AbortController(),
    }
    this.connection = connection
    connection.timer = setTimeout(() => this.disconnect(connection), this.limits.handshakeTimeoutMs)
    connection.timer.unref?.()
    try {
      connection.disposers.push(transport.onMessage((encoded) => this.receive(connection, encoded)))
      connection.disposers.push(transport.onClose(() => this.disconnect(connection)))
    } catch (error) { this.disconnect(connection); throw error }
    return Object.freeze({ connectionId: connection.connectionId, close: () => this.disconnect(connection) })
  }

  /** Close the live connection (if any) and refuse further work. */
  close() {
    if (this.closed) return
    this.closed = true
    this.disconnect()
    for (const [key, entry] of this.inboxPending) {
      this.inboxPending.delete(key)
      entry.reject(new ContractError(ERROR.disconnected))
    }
    this.inboxOrder.length = 0
  }

  /**
   * Send one main-to-child event (§5.2 events). Events are live state, not a queue: with no
   * ready connection the event is dropped (the child rebuilds state on reconnect).
   * @returns whether it was sent.
   */
  publish(operation, sessionId, payload) {
    if (this.closed) throw new ContractError(ERROR.disconnected)
    if (!EVENTS.includes(operation)) throw new ContractError(ERROR.operation)
    validateEvent(operation, payload)
    const connection = this.connection
    if (!connection?.ready) return false
    const envelope = makeEnvelope(this.hostId, sessionId, randomUUID(), ENVELOPE.type.event, operation, payload)
    try {
      connection.transport.send(encodeEnvelope(envelope, this.hostId))
    } catch {
      this.disconnect(connection)
      return false
    }
    return true
  }

  /**
   * Queue one §5.2 inbox item for the child and resolve when the child acks it. The intake
   * ledger remains the durable queue: an unacked item stays here for the next connection and
   * is re-sent unchanged with its dedupe key; an acked key is never sent again by this host
   * instance. Without a ready child the promise stays pending until a connection arrives.
   * @param {object} item - the contract's inbox.push payload.
   * @returns {Promise<{acked: true}>}
   */
  pushInbox(item) {
    if (this.closed) return Promise.reject(new ContractError(ERROR.disconnected))
    validateRequest(OPERATION.inboxPush, item)
    const key = item.dedupeKey
    if (this.inboxAcked.has(key)) return Promise.resolve({ acked: true })
    const existing = this.inboxPending.get(key)
    if (existing !== undefined) return existing.promise
    if (this.inboxPending.size >= this.limits.inboxPending) return Promise.reject(new ContractError(ERROR.limit))
    const entry = { item, timer: undefined, resolve: undefined, reject: undefined, promise: undefined }
    entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject })
    this.inboxPending.set(key, entry)
    this.inboxOrder.push(key)
    this.flushInbox()
    return entry.promise
  }

  disconnect(connection = this.connection) {
    if (connection === undefined || connection.closed) return
    connection.closed = true
    if (this.connection === connection) this.connection = undefined
    clearTimeout(connection.timer)
    connection.abort.abort()
    for (const dispose of connection.disposers.splice(0)) { try { dispose() } catch { /* already gone */ } }
    for (const pending of connection.pending.values()) clearTimeout(pending.timer)
    connection.pending.clear()
    connection.inboxSending = false
    try { connection.transport.close() } catch { /* already gone */ }
    // A closed ready channel means the child can no longer answer: the host-side cards stay live
    // for the next connection, which is told them again by its own ready edge. A channel that
    // never became ready closes the same way: the binding ends the attachment on either edge, so
    // a handshake timeout or a frame that failed validation must report it too (contract §1.3,
    // conn-OQ-48).
    this.emitConnection(connection, false)
  }

  /** Tell observers once per edge; a listener cannot break the channel. */
  emitConnection(connection, ready) {
    for (const listener of this.connectionListeners) {
      try { listener({ ready, connectionId: connection.connectionId }) } catch { /* its own failure */ }
    }
  }

  receive(connection, encoded) {
    if (connection.closed) return
    let envelope
    try {
      // A foreign frame (v1, or the other direction) is a protocol violation: close, never guess.
      envelope = decodeEnvelope(encoded, { receivingSide: SIDE.main, expectedHostId: this.hostId, now: this.now() })
    } catch { this.disconnect(connection); return }
    if (envelope.type === ENVELOPE.type.request) this.receiveRequest(connection, envelope)
    else this.receiveReply(connection, envelope)
  }

  receiveRequest(connection, envelope) {
    if (envelope.operation === ENVELOPE.handshake) { this.receiveHandshake(connection, envelope); return }
    if (!connection.ready) { this.reply(connection, envelope, { code: ERROR.handshakeRequired }, ENVELOPE.type.error); return }
    const known = connection.seen.get(envelope.requestId)
    if (known !== undefined) { this.receiveDuplicate(connection, envelope, known); return }
    if (connection.seen.size >= this.limits.maxRequestIds) {
      this.reply(connection, envelope, { code: ERROR.limit }, ENVELOPE.type.error)
      return
    }
    const entry = {
      operation: envelope.operation, sessionId: envelope.sessionId,
      fingerprint: fingerprintOf(envelope.payload), settled: false, suppressed: false, outcome: undefined,
    }
    connection.seen.set(envelope.requestId, entry)
    void this.dispatchRequest(connection, envelope, entry)
  }

  /**
   * One requestId, one terminal outcome. A settled repeat receives the remembered outcome, so a
   * repeated delivery request cannot deliver twice. A repeat while the first is still running is
   * refused with duplicate-request and the original reply is suppressed: one reply per id.
   */
  receiveDuplicate(connection, envelope, entry) {
    // An id names one operation on one target with one payload; anything else is a different
    // request wearing a used id, and must not inherit its outcome.
    if (entry.operation !== envelope.operation || entry.sessionId !== envelope.sessionId || entry.fingerprint !== fingerprintOf(envelope.payload)) {
      this.reply(connection, envelope, { code: ERROR.conflict }, ENVELOPE.type.error)
      return
    }
    if (entry.settled) { this.sendOutcome(connection, envelope, entry.outcome); return }
    entry.suppressed = true
    this.reply(connection, envelope, { code: ERROR.duplicate }, ENVELOPE.type.error)
  }

  receiveHandshake(connection, envelope) {
    if (connection.ready || connection.handshaking) { this.reply(connection, envelope, { code: ERROR.conflict }, ENVELOPE.type.error); return }
    const available = this.capabilities
    // The payload validator checks only the handshake's shape now; whether this host can meet
    // it is the contract's answer, an error frame that keeps the channel open (conn-OQ-43).
    try { checkHandshake(envelope.payload, available) } catch {
      this.reply(connection, envelope, { code: ERROR.capability }, ENVELOPE.type.error)
      return
    }
    connection.handshaking = true
    connection.announced = new Set(envelope.payload.capabilities)
    connection.ready = true
    clearTimeout(connection.timer)
    this.reply(connection, envelope, { capabilities: [...available], hostInstanceId: this.hostInstanceId }, ENVELOPE.type.response)
    this.emitConnection(connection, true)
    this.flushInbox()
  }

  /**
   * The bridge's authorization step (§5.1, §5.2), before any handler sees the id: a
   * managed-session operation needs a managed session; a related one needs managed or watched
   * (attachment.read's own referenced-image check belongs to the image port). A message that
   * carries hostRefs needs a service that can consume them, so an unwired port refuses instead
   * of dropping the images. A refusal is an ordinary error frame and never reaches the service.
   */
  async authorize(operation, sessionId, payload) {
    if (ATTACHMENT_OPERATIONS.has(operation) && payload.attachments.length > 0
      && typeof this.sessions.attachment?.resolve !== 'function') refuse(ERROR.featureOff)
    if (MANAGED_OPERATIONS.has(operation)) { await ensureManaged(this.sessions, sessionId); return }
    if (RELATED_OPERATIONS.has(operation)) await ensureRelated(this.sessions, sessionId)
  }

  async dispatchRequest(connection, envelope, entry) {
    const handler = this.handlers.get(envelope.operation)
    let outcome
    if (handler === undefined) outcome = { type: ENVELOPE.type.error, code: ERROR.operation }
    else if (connection.inflight >= this.limits.maxInflight) outcome = { type: ENVELOPE.type.error, code: ERROR.limit }
    else {
      connection.inflight++
      let timer
      const expired = new Promise((resolve) => { timer = setTimeout(() => resolve({ type: 'expired' }), this.limits.requestTimeoutMs); timer.unref?.() })
      try {
        // Queue the work on a microtask: a synchronous throw is an ordinary refusal. Authorization
        // is part of the same bounded work, so a slow membership check also counts against the timeout.
        const work = Promise.resolve()
          .then(() => this.authorize(envelope.operation, envelope.sessionId, envelope.payload))
          .then(() => handler({ sessionId: envelope.sessionId, payload: envelope.payload, signal: connection.abort.signal }))
          .then(
            (payload) => ({ type: ENVELOPE.type.response, payload }),
            (error) => ({ type: ENVELOPE.type.error, code: errorCode(error) }),
          )
        outcome = await Promise.race([work, expired])
      } finally { clearTimeout(timer); connection.inflight-- }
    }
    if (connection.closed) return
    if (outcome.type === 'expired') {
      // The work may still be running; its result is never sent. Dropping the connection is the
      // v1 rule: the peer must not treat a late success as a retryable failure.
      this.reply(connection, envelope, { code: ERROR.timeout }, ENVELOPE.type.error)
      this.disconnect(connection)
      return
    }
    entry.settled = true
    entry.outcome = outcome
    if (!entry.suppressed) this.sendOutcome(connection, envelope, outcome)
  }

  sendOutcome(connection, request, outcome) {
    if (outcome.type === ENVELOPE.type.response) this.reply(connection, request, outcome.payload, ENVELOPE.type.response)
    else this.reply(connection, request, { code: outcome.code }, ENVELOPE.type.error)
  }

  reply(connection, request, payload, type) {
    if (connection.closed) return
    const send = (frame) => { try { connection.transport.send(frame) } catch { this.disconnect(connection) } }
    const envelope = makeEnvelope(this.hostId, request.sessionId, request.requestId, type, request.operation, payload)
    let encoded
    try { encoded = encodeEnvelope(envelope, this.hostId) }
    catch (error) {
      // A response too large for its frame is answered as a typed refusal while the connection lives.
      if (type === ENVELOPE.type.response) this.reply(connection, request, { code: errorCode(error) }, ENVELOPE.type.error)
      else this.disconnect(connection)
      return
    }
    send(encoded)
  }

  receiveReply(connection, envelope) {
    if (!connection.ready) { this.disconnect(connection); return }
    const pending = connection.pending.get(envelope.requestId)
    if (pending === undefined || pending.operation !== envelope.operation) { this.disconnect(connection); return }
    connection.pending.delete(envelope.requestId)
    clearTimeout(pending.timer)
    const entry = this.inboxPending.get(pending.key)
    connection.inboxSending = false
    if (envelope.type !== ENVELOPE.type.response) {
      // The child did not take it (no consumer yet). The item stays queued for the next
      // connection; retrying on this one immediately would spin, and a later push on this same
      // connection must not resend it either: nothing is retried here (contract §3.3, §4.5).
      connection.inboxRefused.add(pending.key)
      // The items behind it still go out on this connection, in order.
      this.flushInbox()
      return
    }
    this.inboxPending.delete(pending.key)
    this.inboxOrder = this.inboxOrder.filter((key) => key !== pending.key)
    this.rememberAck(pending.key)
    entry?.resolve(envelope.payload)
    this.flushInbox()
  }

  rememberAck(key) {
    this.inboxAcked.add(key)
    // Bounded dedupe: the oldest acked key is forgotten, which can at worst resend one item.
    while (this.inboxAcked.size > this.limits.inboxAcked) this.inboxAcked.delete(this.inboxAcked.values().next().value)
  }

  flushInbox() {
    const connection = this.connection
    if (connection === undefined || !connection.ready || connection.inboxSending) return
    if (!connection.announced.has(OPERATION.inboxPush)) return
    // An item this connection already refused is skipped: it waits for the next connection, so a
    // later push on this same one cannot resend it (contract §3.3, §4.5).
    const key = this.inboxOrder.find((candidate) => this.inboxPending.has(candidate) && !connection.inboxRefused.has(candidate))
    if (key === undefined) return
    const entry = this.inboxPending.get(key)
    const requestId = randomUUID()
    const timer = setTimeout(() => this.disconnect(connection), this.limits.requestTimeoutMs)
    timer.unref?.()
    connection.pending.set(requestId, { operation: OPERATION.inboxPush, key, timer })
    connection.inboxSending = true
    const envelope = makeEnvelope(this.hostId, null, requestId, ENVELOPE.type.request, OPERATION.inboxPush, entry.item)
    try { connection.transport.send(encodeEnvelope(envelope, this.hostId)) }
    catch {
      connection.inboxSending = false
      this.disconnect(connection)
    }
  }
}

/** Validate overrides against BRIDGE_HOST's own names and values, so a bridge limit stays a bridge limit. */
function freezeLimits(overrides) {
  if (overrides === undefined) return BRIDGE_HOST
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('fishball bridge: limits must be an object')
  const limits = { ...BRIDGE_HOST }
  for (const key of Reflect.ownKeys(overrides)) {
    if (!Object.hasOwn(BRIDGE_HOST, key)) throw new TypeError('fishball bridge: unknown limit ' + String(key))
    const value = overrides[key]
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('fishball bridge: limit ' + String(key) + ' must be a positive whole number')
    limits[key] = value
  }
  return Object.freeze(limits)
}

/** The contract's summary shape, coerced from the service's own description. */
async function summaryOf(service, sessionId) {
  const info = await service.describe(sessionId)
  if (info === undefined) return undefined
  return {
    sessionId: typeof info.sessionId === 'string' && info.sessionId.length > 0 ? info.sessionId : sessionId,
    title: typeof info.title === 'string' ? info.title : '',
    workspaceId: typeof info.workspaceId === 'string' ? info.workspaceId : null,
    running: info.running === true,
    pendingInteraction: info.pendingInteraction === true,
  }
}

/** Related = managed, watched, messaged by or forwarded (§5.2); managed covers the last two. */
async function isRelated(service, sessionId) {
  if (service.isManaged(sessionId)) return true
  return (await service.watches()).some((watch) => watch.sessionId === sessionId)
}

async function ensureRelated(service, sessionId) {
  if (service.isFishball(sessionId)) refuse(ERROR.isFishball)
  if ((await summaryOf(service, sessionId)) === undefined) refuse(ERROR.unknownSession)
  if (!(await isRelated(service, sessionId))) refuse(ERROR.forbidden)
}

export async function ensureManaged(service, sessionId) {
  if (!service.enabled()) refuse(ERROR.featureOff)
  if (service.isFishball(sessionId)) refuse(ERROR.isFishball)
  if ((await summaryOf(service, sessionId)) === undefined) refuse(ERROR.unknownSession)
  if (!service.isManaged(sessionId)) refuse(ERROR.notManaged)
}

/**
 * The ten §5.2 session handlers over the injected main-DSH service. The protocol host has
 * already authorized the id (see BridgeHost.authorize); a handler only performs its operation,
 * so a new operation cannot accidentally skip the shared rules.
 * @param {SessionService} service
 * @returns {Array<[string, Function]>}
 */
function sessionHandlers(service) {
  const delivery = (result) => {
    if (result?.status !== DELIVERY.delivered && result?.status !== DELIVERY.unconfirmed) refuse(ERROR.failed)
    return { status: result.status }
  }

  const read = (result, request) => {
    if (!result || !Array.isArray(result.messages) || typeof result.truncated !== 'boolean') refuse(ERROR.failed)
    const messages = result.messages.map(readMessageOf)
    return boundRead(messages, result.truncated, request.maxMessages, request.maxBytes)
  }

  /** A watch outcome in the contract's shape, or undefined when the result carries none. */
  const watchOutcome = (result) => {
    if (result !== null && typeof result === 'object' && typeof result.watchId === 'string') return { watchId: result.watchId }
    if (result !== null && typeof result === 'object' && WATCH_ERROR_LIST.includes(result.watchError)) return { watchError: result.watchError }
    return undefined
  }

  const watch = (result) => watchOutcome(result) ?? refuse(ERROR.failed)

  /** notify_when_finished's request flag (only when asked) and the watch outcome it produced. */
  const notifyFlag = (payload) => (payload.notifyWhenFinished === undefined ? {} : { notifyWhenFinished: payload.notifyWhenFinished })
  const notified = (payload, result) => (payload.notifyWhenFinished === true ? watchOutcome(result) ?? {} : {})

  return [
    [OPERATION.sessionList, async ({ payload }) => {
      const ids = new Set(await service.managedIds())
      for (const record of await service.watches()) ids.add(record.sessionId)
      const sessions = []
      for (const id of ids) {
        if (sessions.length >= payload.limit) break
        const info = await summaryOf(service, id)
        if (info === undefined) continue
        if (payload.workspaceId !== undefined && info.workspaceId !== payload.workspaceId) continue
        sessions.push(info)
      }
      return { sessions }
    }],
    [OPERATION.sessionStart, async ({ payload }) => {
      const target = await placeOf(service, payload.folder)
      const result = await service.start({
        target,
        title: payload.title,
        ...(payload.model === undefined ? {} : { model: payload.model }),
        ...(payload.reasoningEffort === undefined ? {} : { reasoningEffort: payload.reasoningEffort }),
        message: payload.message,
        attachments: payload.attachments,
        ...notifyFlag(payload),
      })
      if (typeof result?.sessionId !== 'string' || result.sessionId.length === 0 || typeof result.managed !== 'boolean') refuse(ERROR.failed)
      return {
        sessionId: result.sessionId,
        managed: result.managed,
        ...(typeof result.titleError === 'string' ? { titleError: result.titleError } : {}),
        ...(typeof result.workspaceError === 'string' ? { workspaceError: result.workspaceError } : {}),
        ...notified(payload, result),
      }
    }],
    [OPERATION.sessionMessage, async ({ payload }) => {
      const result = await service.message({ sessionId: payload.sessionId, message: payload.message, attachments: payload.attachments, ...notifyFlag(payload) })
      return { ...delivery(result), ...notified(payload, result) }
    }],
    [OPERATION.sessionRedirect, async ({ payload }) => delivery(
      await service.redirect({ sessionId: payload.sessionId, message: payload.message, attachments: payload.attachments }),
    )],
    [OPERATION.sessionStop, async ({ payload }) => {
      await service.stop({ sessionId: payload.sessionId, ...(payload.reason === undefined ? {} : { reason: payload.reason }) })
      // The contract acknowledges the stop; whether a turn was running is DSH's own state.
      return { stopped: true }
    }],
    [OPERATION.sessionRead, async ({ payload }) => read(
      await service.read({ sessionId: payload.sessionId, maxMessages: payload.maxMessages, maxBytes: payload.maxBytes }),
      payload,
    )],
    [OPERATION.sessionWatch, async ({ payload }) => watch(
      await service.watch({ sessionId: payload.sessionId, mode: payload.mode }),
    )],
    [OPERATION.sessionWatches, async () => ({ watches: (await service.watches()).map(watchRecordOf) })],
    [OPERATION.sessionUnwatch, async ({ payload }) => {
      // Closing is idempotent: the response has no refusal shape, and an unknown id closes nothing.
      await service.unwatch({ watchId: payload.watchId })
      return { ok: true }
    }],
    [OPERATION.sessionRelease, async ({ payload }) => {
      await service.release({ sessionId: payload.sessionId, reason: payload.reason })
      return { sessionId: payload.sessionId, managed: false }
    }],
  ]
}

/**
 * The two §6.2/§6.4 attachment operations, when the injected service carries an image port.
 * attachment.read's managed/related check is the bridge's shared RELATED_OPERATIONS rule; the
 * port adds the referenced-image check that 0.2.2's own RPC no longer makes. attachment.put is
 * authorized by the authenticated child connection alone, so it has no session to check.
 * @param {SessionService} service
 * @returns {Array<[string, Function]>}
 */
function imageHandlers(service) {
  const images = service.attachment
  if (typeof images?.read !== 'function' || typeof images?.put !== 'function') return []
  return [
    [OPERATION.attachmentRead, async ({ sessionId, payload }) => images.read({ sessionId, attachmentId: payload.attachmentId })],
    [OPERATION.attachmentPut, async ({ payload }) => images.put(payload)],
  ]
}

const WATCH_ERROR_LIST = Object.freeze(Object.values(WATCH_ERROR))
const WATCH_MODE_LIST = Object.freeze(Object.values(WATCH_MODE))
const WATCH_STATUS_LIST = Object.freeze(Object.values(WATCH_STATUS))

const ROLE_LIST = Object.freeze(Object.values(ROLE))

/** One read message in the contract's shape; the service may already produce it. */
function readMessageOf(message) {
  if (!message || typeof message !== 'object') refuse(ERROR.failed)
  const { seq, role, author, text, images } = message
  if (!Number.isSafeInteger(seq) || seq < 0) refuse(ERROR.failed)
  if (!ROLE_LIST.includes(role) || typeof author !== 'string' || author.length === 0 || typeof text !== 'string') refuse(ERROR.failed)
  if (!Array.isArray(images) || images.length > LIMITS.imagesPerMessage) refuse(ERROR.failed)
  return { seq, role, author, text, images: images.map(imageOf) }
}

/** Image metadata only: no path, URL or bytes (§6.1, §6.5). */
function imageOf(image) {
  if (!image || typeof image !== 'object') refuse(ERROR.failed)
  const { attachmentId, mediaType, width, height, bytes } = image
  if (typeof attachmentId !== 'string' || attachmentId.length === 0 || !IMAGE_TYPES.includes(mediaType)) refuse(ERROR.failed)
  for (const value of [width, height, bytes]) if (!Number.isSafeInteger(value) || value < 1) refuse(ERROR.failed)
  if (width * height > LIMITS.imagePixels || bytes > LIMITS.imageBytes) refuse(ERROR.failed)
  return { attachmentId, mediaType, width, height, bytes }
}

function watchRecordOf(record) {
  if (!record || typeof record !== 'object') refuse(ERROR.failed)
  const { watchId, sessionId, mode, status } = record
  if (typeof watchId !== 'string' || watchId.length === 0 || typeof sessionId !== 'string' || sessionId.length === 0) refuse(ERROR.failed)
  if (!WATCH_MODE_LIST.includes(mode) || !WATCH_STATUS_LIST.includes(status)) refuse(ERROR.failed)
  return { watchId, sessionId, mode, status }
}

/**
 * Honour the caller's bounds and then the frame's: keep the newest messages that fit
 * maxMessages text bytes, report truncated when any were dropped, and shrink further only if
 * the encoded reply would overflow the contract's 1 MiB frame (never fail a bounded read).
 */
function boundRead(messages, alreadyTruncated, maxMessages, maxBytes) {
  const kept = []
  let bytes = 0
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (kept.length >= maxMessages) break
    const size = Buffer.byteLength(message.text, 'utf8')
    if (bytes + size > maxBytes) break
    bytes += size
    kept.unshift(message)
  }
  const budget = LIMITS.envelopeBytes - BRIDGE_HOST.readReserveBytes
  while (kept.length > 0 && Buffer.byteLength(JSON.stringify({ messages: kept, truncated: true }), 'utf8') > budget) kept.shift()
  return { messages: kept, truncated: alreadyTruncated || kept.length !== messages.length }
}

/**
 * Where a new session goes (§5.2): an existing workspace by id, or an existing absolute
 * directory; a registered workspace keeps its path after the folder is gone, so the folder
 * must exist too. Nothing is ever created here.
 */
async function placeOf(service, folder) {
  const workspaces = await service.workspaces()
  const workspace = workspaces.find((entry) => entry.id === folder)
  if (workspace !== undefined) {
    if (!(await isDirectory(workspace.path))) refuse(ERROR.forbidden)
    return { workspaceId: workspace.id }
  }
  if (typeof folder !== 'string' || !isAbsolute(folder) || !(await isDirectory(folder))) refuse(ERROR.forbidden)
  const registered = await service.resolveWorkspacePath(folder)
  return registered === undefined ? { cwd: folder } : { workspaceId: registered.id }
}

async function isDirectory(target) {
  try { return (await stat(target)).isDirectory() } catch { return false }
}
