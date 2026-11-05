/**
 * The slim session bridge, isolated-child half (§5.1, §5.2, §15 T05).
 *
 * The child owns exactly one envelope-v2 channel over the authenticated lifecycle transport
 * (src/native-runtime/wire.js, reached through ctx.nativeRuntime.onControlTransport). This
 * module is the child's protocol client: it performs the handshake, sends the §5.2 session
 * requests, receives the main-to-child inbox requests and state events, and never retries.
 *
 * Rules kept here, because they protect the main DSH from the child:
 * - No retry queue. A request that times out, whose connection drops, or whose delivery is
 *   answered unconfirmed is terminal: the state is unknown, so resending could deliver twice.
 *   The connection is dropped on a timeout so a late success cannot be mistaken for a failure.
 * - Delivery dedupe on the way in. The host re-delivers unacked inbox items with the same
 *   dedupe key after a reconnect; the child dispatches each key once and only acks work it
 *   handed to a consumer.
 * - Typed requests only. Every outgoing frame is validated against the frozen contract before
 *   it is sent; the caller cannot invent an operation or a payload field.
 * - No credentials. The transport is already HMAC-authenticated by the lifecycle wire; this
 *   module adds no secret, no path and no token to any frame.
 *
 * The child tools (session-tools.js) and later tasks (T09 approvals, T06 images) share this
 * one client: they call require() for the operations they need before a transport attaches.
 * The hello announces those operations alongside the inbox receiver the child serves, because
 * the frozen contract requires requiredCapabilities to be a subset of capabilities
 * (contract.js:516-520); the host refuses a hello naming an operation it cannot serve.
 */
import { randomUUID } from 'node:crypto'
import {
  ENVELOPE, ERROR, OPERATION, OPERATIONS, SIDE, ContractError, decodeEnvelope, encodeEnvelope, makeEnvelope,
} from '../contract.js'

/**
 * Client resource ceilings. Like the host's, these are runtime configuration rather than
 * contract constants; the timeout mirrors src/native-control/constants.js's v1 control limit.
 */
export const BRIDGE_CLIENT = Object.freeze({
  /** A request with no answer by then is unknown: drop the connection instead of retrying. */
  requestTimeoutMs: 30_000,
  handshakeTimeoutMs: 10_000,
  /** Requests in flight at once; beyond it a request is refused locally. */
  maxInflight: 32,
  /** Inbox dedupe keys remembered by one child instance; a full set refuses new keys, never forgets one. */
  maxInboxKeys: 1024,
  /** Event and inbox subscribers one client carries. */
  maxListeners: 32,
})

const TRANSPORT_METHODS = Object.freeze(['send', 'onMessage', 'onClose', 'close'])
const INBOX_OPERATIONS = Object.freeze([OPERATION.inboxPush])

/**
 * Create the child's bridge client. Nothing is sent until attach(); the child can boot
 * detached, which is ordinary when the main host is not running.
 *
 * @param {object} options
 * @param {string} options.hostId - the lifecycle host identity every frame must carry.
 * @param {string[]} [options.requiredCapabilities] - operations this child needs from the main host.
 * @param {object} [options.limits] - overrides of BRIDGE_CLIENT.
 * @param {() => number} [options.now] - validation clock (T09 grant answers).
 */
export function createBridgeClient(options) {
  const { hostId, requiredCapabilities = [], limits, now = Date.now } = options ?? {}
  if (typeof hostId !== 'string' || hostId.length === 0) throw new TypeError('fishball bridge: a host id is required')
  if (typeof now !== 'function') throw new TypeError('fishball bridge: now must be a function')
  return new BridgeClient({ hostId, requiredCapabilities, limits, now })
}

class BridgeClient {
  constructor({ hostId, requiredCapabilities, limits, now }) {
    this.hostId = hostId
    this.now = now
    this.limits = freezeLimits(limits)
    this.required = new Set()
    this.events = new Set()
    this.inboxListeners = new Set()
    this.inboxKeys = new Set()
    this.connection = undefined
    this.state = Object.freeze({ ready: false, hostId, hostInstanceId: null, code: null })
    for (const operation of requiredCapabilities) this.require([operation])
    // The child serves the inbox receiver; the session operations it sends join the hello
    // through the capabilities getter below.
    this.ownCapabilities = Object.freeze([...INBOX_OPERATIONS])
    this.session = createSessionRequests(this)
  }

  /** Operations this child needs from the main host; extend before a transport attaches. */
  get requiredCapabilities() { return Object.freeze([...this.required]) }

  /**
   * The hello's capability list. The contract requires requiredCapabilities to be a subset of
   * capabilities (requestHandshake), so the operations this child requires from the host are
   * announced next to the one it serves. What proves the host implements them is the welcome;
   * a hello requiring an operation the host has not registered is still refused.
   */
  get capabilities() { return Object.freeze([...new Set([...this.ownCapabilities, ...this.required])]) }
  get status() { return this.state }

  /**
   * Declare one or more main-host operations this child needs. The handshake advertises them;
   * a host that cannot serve one refuses the channel with unsupported-capability.
   * @param {string[]} operations - contract request names.
   */
  require(operations) {
    if (!Array.isArray(operations)) throw new TypeError('fishball bridge: operations must be a list')
    for (const operation of operations) {
      if (typeof operation !== 'string' || !Object.hasOwn(OPERATIONS, operation)) throw new ContractError(ERROR.operation)
      this.required.add(operation)
    }
  }

  /**
   * Attach the authenticated transport and perform the handshake. A previous connection is
   * closed first, so a reconnect starts clean; nothing from the old channel is replayed.
   * @param {{send: Function, onMessage: Function, onClose: Function, close: Function}} transport
   * @param {{hostId?: string, connectionId?: string}} [metadata]
   * @returns {Promise<{capabilities: string[], hostInstanceId: string}>} the welcome.
   */
  async attach(transport, metadata = {}) {
    for (const method of TRANSPORT_METHODS) {
      if (typeof transport?.[method] !== 'function') throw new TypeError('fishball bridge: the transport must implement ' + method)
    }
    if (metadata.hostId !== undefined && metadata.hostId !== this.hostId) {
      try { transport.close() } catch { /* already gone */ }
      throw new ContractError(ERROR.host)
    }
    this.close()
    const connection = {
      transport, closed: false, ready: false, capabilities: new Set(), hostInstanceId: null,
      pending: new Map(), disposers: [], abort: new AbortController(),
    }
    this.connection = connection
    try {
      connection.disposers.push(transport.onMessage((encoded) => this.receive(connection, encoded)))
      connection.disposers.push(transport.onClose(() => this.disconnect(connection)))
      const welcome = await this.handshake(connection)
      if (connection.closed || this.connection !== connection) throw new ContractError(ERROR.disconnected)
      this.publishState(true, welcome.hostInstanceId, null)
      return welcome
    } catch (error) {
      this.disconnect(connection, error instanceof ContractError ? error.code : ERROR.failed)
      throw error
    }
  }

  /**
   * Send one validated §5.2 request and wait for its answer. Never retried.
   * @param {string} operation - a contract request name this child required.
   * @param {object} payload - the operation's contract payload.
   * @returns {Promise<object>} the validated response payload.
   */
  async request(operation, payload) {
    const connection = this.connection
    if (!Object.hasOwn(OPERATIONS, operation)) throw new ContractError(ERROR.operation)
    if (connection === undefined || connection.closed) throw new ContractError(ERROR.disconnected)
    if (!connection.ready) throw new ContractError(ERROR.handshakeRequired)
    if (!this.required.has(operation)) throw new ContractError(ERROR.capability)
    if (!connection.capabilities.has(operation)) throw new ContractError(ERROR.capability)
    if (connection.pending.size >= this.limits.maxInflight) throw new ContractError(ERROR.limit)
    const sessionId = OPERATIONS[operation].sessionScoped === true ? payload?.sessionId : null
    if (OPERATIONS[operation].sessionScoped === true && typeof sessionId !== 'string') throw new ContractError(ERROR.invalid)
    const requestId = randomUUID()
    const envelope = makeEnvelope(this.hostId, sessionId, requestId, ENVELOPE.type.request, operation, payload)
    // Validate before reserving: an invalid payload has no side effect on the connection.
    const encoded = encodeEnvelope(envelope, this.hostId)
    return new Promise((resolve, reject) => {
      const entry = { operation, resolve, reject, timer: undefined }
      entry.timer = setTimeout(() => {
        // Unknown state: drop the channel so the work cannot be mistaken for a failed attempt.
        this.disconnect(connection, ERROR.timeout)
        reject(new ContractError(ERROR.timeout))
      }, this.limits.requestTimeoutMs)
      entry.timer.unref?.()
      connection.pending.set(requestId, entry)
      try { connection.transport.send(encoded) }
      catch {
        connection.pending.delete(requestId)
        clearTimeout(entry.timer)
        this.disconnect(connection, ERROR.disconnected)
        reject(new ContractError(ERROR.disconnected))
      }
    })
  }

  /**
   * Observe main-to-child events (approval.request, approval.settled, watch.status,
   * session.state). A listener cannot break the transport: its failure is its own.
   * @param {(envelope: {operation: string, sessionId: string, payload: object}) => void} listener
   * @returns {() => void} disposer
   */
  onEvent(listener) { return subscribe(this.events, listener, this.limits.maxListeners) }

  /**
   * Receive inbox items (message_fishball, hand-over notes, and T09's question-answer notice)
   * from the main host. At least one listener must accept the item; with none the client refuses
   * the item so the host keeps it queued. A listener that throws, or returns false, refuses the
   * item in the same way, so a notice another module owns can never be acked by this one.
   * @param {(item: object) => (void|boolean)} listener
   * @returns {() => void} disposer
   */
  onInbox(listener) { return subscribe(this.inboxListeners, listener, this.limits.maxListeners) }

  /** Close the channel and reject everything pending with disconnected. */
  close() { this.disconnect(this.connection, ERROR.disconnected) }

  disconnect(connection, code = ERROR.disconnected) {
    if (connection === undefined || connection.closed) return
    connection.closed = true
    if (this.connection === connection) this.connection = undefined
    connection.abort.abort()
    for (const dispose of connection.disposers.splice(0)) { try { dispose() } catch { /* already gone */ } }
    for (const entry of connection.pending.values()) { clearTimeout(entry.timer); entry.reject(new ContractError(code)) }
    connection.pending.clear()
    try { connection.transport.close() } catch { /* already gone */ }
    this.publishState(false, null, code)
  }

  publishState(ready, hostInstanceId, code) {
    this.state = Object.freeze({ ready, hostId: this.hostId, hostInstanceId, code })
  }

  handshake(connection) {
    const requestId = randomUUID()
    const envelope = makeEnvelope(this.hostId, null, requestId, ENVELOPE.type.request, ENVELOPE.handshake, {
      capabilities: this.capabilities,
      requiredCapabilities: this.requiredCapabilities,
    })
    const encoded = encodeEnvelope(envelope, this.hostId)
    return new Promise((resolve, reject) => {
      const entry = {
        operation: ENVELOPE.handshake,
        // The welcome is the ordering point: mark the channel ready before the transport can
        // deliver the event or inbox frame the host may send immediately after it.
        resolve: (welcome) => {
          if (!this.requiredCapabilities.every((operation) => welcome.capabilities.includes(operation))) {
            reject(new ContractError(ERROR.capability))
            return
          }
          connection.ready = true
          connection.capabilities = new Set(welcome.capabilities)
          connection.hostInstanceId = welcome.hostInstanceId
          resolve(welcome)
        },
        reject,
        timer: setTimeout(() => {
          connection.pending.delete(requestId)
          reject(new ContractError(ERROR.timeout))
        }, this.limits.handshakeTimeoutMs),
      }
      entry.timer.unref?.()
      connection.pending.set(requestId, entry)
      try { connection.transport.send(encoded) }
      catch {
        connection.pending.delete(requestId)
        clearTimeout(entry.timer)
        reject(new ContractError(ERROR.disconnected))
      }
    })
  }

  receive(connection, encoded) {
    if (connection.closed) return
    let envelope
    try {
      envelope = decodeEnvelope(encoded, { receivingSide: SIDE.child, expectedHostId: this.hostId, now: this.now() })
    } catch (error) {
      this.disconnect(connection, error instanceof ContractError ? error.code : ERROR.invalid)
      return
    }
    if (envelope.type === ENVELOPE.type.event) { this.receiveEvent(connection, envelope); return }
    if (envelope.type === ENVELOPE.type.request) { this.receiveRequest(connection, envelope); return }
    const entry = connection.pending.get(envelope.requestId)
    if (entry === undefined || entry.operation !== envelope.operation) {
      // An answer to nothing: the protocol is broken, not merely out of date.
      this.disconnect(connection, ERROR.invalid)
      return
    }
    connection.pending.delete(envelope.requestId)
    clearTimeout(entry.timer)
    if (envelope.type === ENVELOPE.type.error) entry.reject(new ContractError(envelope.payload.code))
    else entry.resolve(envelope.payload)
  }

  receiveEvent(connection, envelope) {
    if (!connection.ready) { this.disconnect(connection, ERROR.handshakeRequired); return }
    for (const listener of this.events) { try { listener(envelope) } catch { /* a listener owns its failure */ } }
  }

  receiveRequest(connection, envelope) {
    if (!connection.ready) { this.replyError(connection, envelope, ERROR.handshakeRequired); return }
    if (envelope.operation !== OPERATION.inboxPush) { this.replyError(connection, envelope, ERROR.operation); return }
    const key = envelope.payload.dedupeKey
    if (this.inboxKeys.has(key)) { this.replyAck(connection, envelope); return }
    if (this.inboxKeys.size >= this.limits.maxInboxKeys) {
      // Never forget a delivered key: refusing the new one keeps dedupe honest and the host keeps the item.
      this.replyError(connection, envelope, ERROR.limit)
      return
    }
    // Hand the item to every consumer; it is accepted when at least one took it without failing.
    let accepted = false
    for (const listener of this.inboxListeners) {
      // A listener that returns false declines the item (T09 answers only its own question-answer
      // notices); any other return, including undefined, accepts it as before.
      try { if (listener(envelope.payload) !== false) accepted = true } catch { /* another consumer may still take it */ }
    }
    if (!accepted) { this.replyError(connection, envelope, ERROR.failed); return }
    this.inboxKeys.add(key)
    this.replyAck(connection, envelope)
  }

  replyError(connection, envelope, code) {
    this.sendFrame(connection, makeEnvelope(this.hostId, envelope.sessionId, envelope.requestId, ENVELOPE.type.error, envelope.operation, { code }))
  }

  replyAck(connection, envelope) {
    this.sendFrame(connection, makeEnvelope(this.hostId, envelope.sessionId, envelope.requestId, ENVELOPE.type.response, envelope.operation, { acked: true }))
  }

  sendFrame(connection, envelope) {
    if (connection.closed) return
    try { connection.transport.send(encodeEnvelope(envelope, this.hostId)) }
    catch { this.disconnect(connection, ERROR.disconnected) }
  }
}

/**
 * The child's typed session API: one method per §5.2 session operation, so the tool layer
 * never builds a wire payload by hand. attachments stays empty until T06 owns image routing.
 */
function createSessionRequests(client) {
  const send = (operation, payload) => client.request(operation, payload)
  return Object.freeze({
    list: ({ workspaceId, limit } = {}) => send(OPERATION.sessionList, workspaceId === undefined ? { limit } : { workspaceId, limit }),
    start: ({ folder, title, message, model, reasoningEffort }) => send(OPERATION.sessionStart, {
      folder, title, message, attachments: [],
      ...(model === undefined ? {} : { model }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    }),
    message: ({ sessionId, message }) => send(OPERATION.sessionMessage, { sessionId, message, attachments: [] }),
    redirect: ({ sessionId, message }) => send(OPERATION.sessionRedirect, { sessionId, message, attachments: [] }),
    stop: ({ sessionId, reason }) => send(OPERATION.sessionStop, reason === undefined ? { sessionId } : { sessionId, reason }),
    read: ({ sessionId, maxMessages, maxBytes }) => send(OPERATION.sessionRead, { sessionId, maxMessages, maxBytes }),
    watch: ({ sessionId, mode }) => send(OPERATION.sessionWatch, { sessionId, mode }),
    watches: () => send(OPERATION.sessionWatches, {}),
    unwatch: ({ watchId }) => send(OPERATION.sessionUnwatch, { watchId }),
    release: ({ sessionId, reason }) => send(OPERATION.sessionRelease, { sessionId, reason }),
  })
}

function subscribe(listeners, listener, max) {
  if (typeof listener !== 'function') throw new TypeError('fishball bridge: a listener must be a function')
  if (listeners.has(listener)) return () => listeners.delete(listener)
  if (listeners.size >= max) throw new ContractError(ERROR.limit)
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function freezeLimits(overrides) {
  if (overrides === undefined) return BRIDGE_CLIENT
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('fishball bridge: limits must be an object')
  const limits = { ...BRIDGE_CLIENT }
  for (const key of Reflect.ownKeys(overrides)) {
    if (!Object.hasOwn(BRIDGE_CLIENT, key)) throw new TypeError('fishball bridge: unknown limit ' + String(key))
    const value = overrides[key]
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('fishball bridge: limit ' + String(key) + ' must be a positive whole number')
    limits[key] = value
  }
  return Object.freeze(limits)
}
