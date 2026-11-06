import { randomUUID } from 'node:crypto'
import { CONTROL, CONTROL_CAPABILITIES, ControlError, controlLimits, fail } from './constants.js'
import { answer, capabilities, decodeEnvelope, encodeEnvelope, makeEnvelope, text } from './protocol.js'
import { ControlChannel } from './channel.js'

const O = CONTROL.operation

export function createControlClient(options) { return new ControlClient(options) }

/** No retry queue: reconnect is explicit and always starts with a fresh handshake. */
export class ControlClient {
  constructor({ hostId, limits, capabilities: supported = CONTROL_CAPABILITIES, requiredCapabilities = [] }) {
    text(hostId); capabilities(supported); capabilities(requiredCapabilities)
    if (requiredCapabilities.some((item) => !supported.includes(item))) fail(CONTROL.error.capability)
    this.hostId = hostId
    this.limits = controlLimits(limits)
    this.capabilities = [...supported]
    this.requiredCapabilities = [...requiredCapabilities]
    this.connection = null
    this.listeners = new Set()
    // Remember attempted IDs across attachments; another host epoch cannot establish their outcome.
    this.messages = new Map()
  }

  async attach(transport) {
    this.close()
    const connection = { closed: false, ready: false, pending: new Map(), watches: new Map(), offers: new Map(),
      capabilities: new Set(), hostInstanceId: null, channel: null }
    this.connection = connection
    try {
      connection.channel = new ControlChannel({
        transport, hostId: this.hostId, limits: this.limits,
        onEnvelope: (envelope) => this.receive(connection, envelope),
        onClose: (error) => this.disconnect(connection, error),
      })
      if (connection.closed) connection.channel.close()
      const welcome = await this.sendRequest(connection, O.handshake, null, {
        capabilities: this.capabilities, requiredCapabilities: this.requiredCapabilities,
      })
      if (connection.closed || this.connection !== connection) fail(CONTROL.error.disconnected)
      return welcome
    } catch (error) { this.disconnect(connection, error); throw error }
  }

  disconnect(connection, error = new ControlError(CONTROL.error.disconnected)) {
    if (connection.closed) return
    connection.closed = true
    connection.ready = false
    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    connection.pending.clear()
    connection.watches.clear()
    connection.offers.clear()
    connection.channel?.close(error)
  }

  close() { if (this.connection) this.disconnect(this.connection) }

  onEvent(listener) {
    if (typeof listener !== 'function') fail()
    if (this.listeners.size >= this.limits.maxWatches) fail(CONTROL.error.limit)
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async request(operation, sessionId, payload) {
    const connection = this.connection
    if (!connection?.ready || connection.closed) fail(CONTROL.error.disconnected)
    if (!connection.capabilities.has(operation)) fail(CONTROL.error.capability)
    if (connection.pending.size >= this.limits.maxInflight) fail(CONTROL.error.limit)
    // Validate before reserving local resources. The host validates again independently.
    payload = decodeEnvelope(encodeEnvelope(makeEnvelope(this.hostId, sessionId, randomUUID(), CONTROL.type.request, operation, payload), this.limits), this.limits).payload
    if (operation === O.messageSend) {
      const previous = this.messages.get(payload.messageId)
      if (previous && (previous.sessionId !== sessionId || previous.text !== payload.text || previous.hostInstanceId !== connection.hostInstanceId)) fail(CONTROL.error.conflict)
      if (!previous) {
        if (this.messages.size >= this.limits.maxDedupeEntries) fail(CONTROL.error.limit)
        this.messages.set(payload.messageId, { sessionId, text: payload.text, hostInstanceId: connection.hostInstanceId })
      }
    }
    if (operation === O.watchOpen) {
      if (connection.watches.has(payload.watchId)) fail(CONTROL.error.conflict)
      if (connection.watches.size >= this.limits.maxWatches) fail(CONTROL.error.limit)
      connection.watches.set(payload.watchId, sessionId)
    }
    if (operation === O.watchClose && connection.watches.has(payload.watchId) && connection.watches.get(payload.watchId) !== sessionId) fail(CONTROL.error.conflict)
    if (operation === O.approvalAnswer) {
      const offer = connection.offers.get(payload.approvalId)
      if (!offer || offer.sessionId !== sessionId || offer.offerId !== payload.offerId) fail(CONTROL.error.expired)
      // Locally provable shape/choice mistakes have no side effect and must not consume an offer.
      answer(payload.answer, offer.kind)
      if (offer.kind === CONTROL.approval.question && offer.choices.length && !offer.choices.includes(payload.answer.text)) fail()
      // An unconfirmed answer is not safe to resend, even if the carrier remained open.
      connection.offers.delete(payload.approvalId)
    }
    try {
      const result = await this.sendRequest(connection, operation, sessionId, payload)
      if (operation === O.watchClose) connection.watches.delete(payload.watchId)
      if (operation === O.approvalList) {
        for (const descriptor of result.approvals) this.rememberOffer(connection, sessionId, descriptor)
      }
      return result
    } catch (error) {
      if (operation === O.watchOpen) connection.watches.delete(payload.watchId)
      throw error
    }
  }

  sendRequest(connection, operation, sessionId, payload) {
    if (connection.closed) return Promise.reject(new ControlError(CONTROL.error.disconnected))
    if (connection.pending.size >= this.limits.maxInflight) return Promise.reject(new ControlError(CONTROL.error.limit))
    const requestId = randomUUID()
    const envelope = makeEnvelope(this.hostId, sessionId, requestId, CONTROL.type.request, operation, payload)
    return new Promise((resolve, reject) => {
      const pending = { operation, sessionId, payload, resolve, reject, timer: null }
      pending.timer = setTimeout(() => this.disconnect(connection, new ControlError(CONTROL.error.timeout)),
        operation === O.handshake ? this.limits.handshakeTimeoutMs : this.limits.requestTimeoutMs)
      pending.timer.unref?.()
      connection.pending.set(requestId, pending)
      try { connection.channel.send(envelope) }
      catch (error) {
        clearTimeout(pending.timer)
        connection.pending.delete(requestId)
        reject(error)
      }
    })
  }

  receive(connection, envelope) {
    if (this.connection !== connection || connection.closed) return
    if (envelope.type === CONTROL.type.event) { this.receiveEvent(connection, envelope); return }
    if (![CONTROL.type.response, CONTROL.type.error].includes(envelope.type)) fail()
    const pending = connection.pending.get(envelope.requestId)
    if (!pending || pending.operation !== envelope.operation || pending.sessionId !== envelope.sessionId) fail()
    if (envelope.type === CONTROL.type.response) {
      for (const key of ['messageId', 'watchId', 'approvalId']) {
        if (Object.hasOwn(pending.payload, key) && envelope.payload[key] !== pending.payload[key]) fail()
      }
      if (pending.operation === O.handshake) {
        const welcome = envelope.payload
        if (welcome.capabilities.some((item) => !this.capabilities.includes(item)) ||
          this.requiredCapabilities.some((item) => !welcome.capabilities.includes(item))) fail(CONTROL.error.capability)
        // A carrier can synchronously deliver the next event before attach's promise resumes.
        connection.capabilities = new Set(welcome.capabilities)
        connection.hostInstanceId = welcome.hostInstanceId
        connection.ready = true
      }
    }
    connection.pending.delete(envelope.requestId)
    clearTimeout(pending.timer)
    if (envelope.type === CONTROL.type.error) pending.reject(new ControlError(envelope.payload.code))
    else pending.resolve(envelope.payload)
  }

  rememberOffer(connection, sessionId, descriptor) {
    if (!connection.offers.has(descriptor.approvalId) && connection.offers.size >= this.limits.maxPendingApprovals) {
      this.disconnect(connection, new ControlError(CONTROL.error.limit)); fail(CONTROL.error.limit)
    }
    connection.offers.set(descriptor.approvalId, { sessionId, offerId: descriptor.offerId, kind: descriptor.kind, choices: [...descriptor.choices] })
  }

  receiveEvent(connection, envelope) {
    if (!connection.ready) fail(CONTROL.error.handshake)
    const { operation, sessionId, payload } = envelope
    switch (operation) {
      case CONTROL.event.watchStatus:
        if (!connection.capabilities.has(O.watchOpen)) fail(CONTROL.error.capability)
        // A close response and an already queued status may cross; never revive a removed watch.
        if (!connection.watches.has(payload.watchId)) return
        if (connection.watches.get(payload.watchId) !== sessionId) fail(CONTROL.error.forbidden)
        break
      case CONTROL.event.approvalRequest:
        if (!connection.capabilities.has(O.approvalList)) fail(CONTROL.error.capability)
        this.rememberOffer(connection, sessionId, payload)
        break
      case CONTROL.event.approvalClosed: {
        const offer = connection.offers.get(payload.approvalId)
        if (!offer) return
        if (offer.sessionId !== sessionId || offer.offerId !== payload.offerId) fail(CONTROL.error.forbidden)
        connection.offers.delete(payload.approvalId)
        break
      }
      default: fail(CONTROL.error.operation)
    }
    // Observers are local consumers, not authority callbacks; one cannot break transport cleanup.
    for (const listener of this.listeners) { try { listener(envelope) } catch {} }
  }
}
