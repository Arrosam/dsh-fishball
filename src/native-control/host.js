import { randomUUID } from 'node:crypto'
import { CONTROL, ControlError, controlLimits, fail } from './constants.js'
import { answer, approval, encodeEnvelope, exact, makeEnvelope, status, text } from './protocol.js'
import { ControlChannel } from './channel.js'

const O = CONTROL.operation
const APPROVAL_KEYS = Object.freeze(['sessionId', 'approvalId', 'kind', 'prompt', 'choices', 'expiresAt', 'isLive', 'answer'])

/** Host authority and callbacks never come from operation names or other wire selectors. */
export function createControlHost(options) { return new ControlHost(options) }

export class ControlHost {
  constructor({ hostId, limits, authorizeTarget, deliverMessage, getStatus, watchSession, now = Date.now }) {
    text(hostId)
    if (typeof authorizeTarget !== 'function' || typeof now !== 'function') fail()
    for (const callback of [deliverMessage, getStatus, watchSession]) if (callback !== undefined && typeof callback !== 'function') fail()
    this.hostId = hostId
    this.hostInstanceId = randomUUID()
    this.limits = controlLimits(limits)
    this.authorizeTarget = authorizeTarget
    this.deliverMessage = deliverMessage
    this.getStatus = getStatus
    this.watchSession = watchSession
    this.now = now
    this.connections = new Map()
    this.messages = new Map()
    this.approvals = new Map()
    this.inflight = 0
    this.authorizations = 0
    this.closed = false
    this.capabilities = Object.freeze([
      ...(deliverMessage ? [O.messageSend, O.messageStatus] : []),
      ...(getStatus ? [O.sessionStatus] : []),
      ...(watchSession ? [O.watchOpen, O.watchClose] : []),
      O.approvalList, O.approvalAnswer,
    ])
  }

  attach(transport, { connectionId, principalId }) {
    text(connectionId); text(principalId)
    if (this.closed) fail(CONTROL.error.disconnected)
    if (this.connections.has(connectionId)) fail(CONTROL.error.conflict)
    if (this.connections.size >= this.limits.maxConnections) fail(CONTROL.error.limit)
    const connection = {
      connectionId, principalId, closed: false, ready: false, handshaking: false, capabilities: new Set(),
      seen: new Set(), requests: new Map(), watches: new Map(), offers: new Map(), targets: new Map(),
      abort: new AbortController(), channel: null,
    }
    this.connections.set(connectionId, connection)
    connection.timer = setTimeout(() => this.disconnect(connection, new ControlError(CONTROL.error.timeout)), this.limits.handshakeTimeoutMs)
    connection.timer.unref?.()
    try {
      connection.channel = new ControlChannel({
        transport, hostId: this.hostId, limits: this.limits,
        onEnvelope: (envelope) => this.receive(connection, envelope),
        onClose: () => this.disconnect(connection),
      })
      if (connection.closed) connection.channel.close()
    } catch (error) { this.disconnect(connection); throw error }
    return Object.freeze({ close: () => this.disconnect(connection) })
  }

  disconnect(connection, error = new ControlError(CONTROL.error.disconnected)) {
    if (connection.closed) return
    connection.closed = true
    clearTimeout(connection.timer)
    connection.abort.abort()
    for (const timer of connection.requests.values()) clearTimeout(timer)
    connection.requests.clear()
    for (const watch of connection.watches.values()) this.disposeWatch(connection, watch)
    connection.offers.clear()
    connection.targets.clear()
    this.connections.delete(connection.connectionId)
    connection.channel?.close(error)
  }

  close() {
    this.closed = true
    for (const connection of this.connections.values()) this.disconnect(connection)
    for (const entry of this.approvals.values()) clearTimeout(entry.timer)
    // Host-native requests remain with their owner; bridge disposal never answers them.
    this.approvals.clear()
  }

  revokeSession(sessionId) {
    text(sessionId)
    for (const connection of this.connections.values()) {
      connection.targets.get(sessionId)?.abort()
      connection.targets.delete(sessionId)
      for (const watch of connection.watches.values()) if (watch.sessionId === sessionId) this.disposeWatch(connection, watch)
      for (const [id, offer] of connection.offers) if (offer.entry.sessionId === sessionId) connection.offers.delete(id)
    }
    for (const entry of this.approvals.values()) if (entry.sessionId === sessionId) this.cancelApproval(entry.approvalId)
  }

  context(connection, sessionId, operation) {
    if (!connection.targets.has(sessionId)) {
      if (connection.targets.size >= this.limits.maxRequestIds) fail(CONTROL.error.limit)
      connection.targets.set(sessionId, new AbortController())
    }
    return Object.freeze({ hostId: this.hostId, principalId: connection.principalId, connectionId: connection.connectionId,
      sessionId, operation, signal: AbortSignal.any([connection.abort.signal, connection.targets.get(sessionId).signal]) })
  }

  async authorize(connection, sessionId, operation) {
    if (connection.closed) fail(CONTROL.error.disconnected)
    if (this.authorizations >= this.limits.maxInflight) fail(CONTROL.error.limit)
    const context = this.context(connection, sessionId, operation)
    this.authorizations++
    try {
      if (await this.authorizeTarget(context) !== true || context.signal.aborted) fail(CONTROL.error.forbidden)
      if (connection.closed) fail(CONTROL.error.disconnected)
      return context
    } finally { this.authorizations-- }
  }

  send(connection, envelope) {
    if (connection.closed) return
    try { connection.channel.send(envelope) } catch (error) { this.disconnect(connection, error) }
  }

  reply(connection, request, payload, type = CONTROL.type.response) {
    if (connection.closed) return
    if (request.operation === O.handshake && type === CONTROL.type.response) {
      // Open the host's event gate only at the ordered welcome send, never in dispatch.
      // Setting it here also permits a synchronous carrier's immediate peer response.
      connection.ready = true
      clearTimeout(connection.timer)
    }
    this.send(connection, makeEnvelope(this.hostId, request.sessionId, request.requestId, type, request.operation, payload))
  }

  event(connection, sessionId, operation, payload) {
    if (!connection.ready) return
    this.send(connection, makeEnvelope(this.hostId, sessionId, randomUUID(), CONTROL.type.event, operation, payload))
  }

  receive(connection, request) {
    if (connection.closed) return
    if (request.type !== CONTROL.type.request) { this.disconnect(connection); return }
    if (connection.seen.has(request.requestId) || connection.seen.size >= this.limits.maxRequestIds) {
      this.disconnect(connection, new ControlError(CONTROL.error.duplicate)); return
    }
    connection.seen.add(request.requestId)
    if (this.inflight >= this.limits.maxInflight) {
      this.reply(connection, request, { code: CONTROL.error.limit }, CONTROL.type.error); return
    }
    this.inflight++
    const timer = setTimeout(() => this.disconnect(connection, new ControlError(CONTROL.error.timeout)), this.limits.requestTimeoutMs)
    timer.unref?.()
    connection.requests.set(request.requestId, timer)
    this.dispatch(connection, request).then(
      (payload) => this.reply(connection, request, payload),
      (error) => this.reply(connection, request, { code: error instanceof ControlError ? error.code : CONTROL.error.failed }, CONTROL.type.error),
    ).finally(() => {
      clearTimeout(timer)
      connection.requests.delete(request.requestId)
      this.inflight--
    })
  }

  async dispatch(connection, request) {
    const { operation, sessionId, payload } = request
    if (operation === O.handshake) {
      if (connection.ready || connection.handshaking) fail(CONTROL.error.conflict)
      if (payload.requiredCapabilities.some((capability) => !this.capabilities.includes(capability))) fail(CONTROL.error.capability)
      connection.capabilities = new Set(payload.capabilities.filter((capability) => this.capabilities.includes(capability)))
      connection.handshaking = true
      return { capabilities: [...connection.capabilities], hostInstanceId: this.hostInstanceId }
    }
    if (!connection.ready) fail(CONTROL.error.handshake)
    if (!connection.capabilities.has(operation)) fail(CONTROL.error.capability)
    const context = await this.authorize(connection, sessionId, operation)
    if (context.signal.aborted) fail(CONTROL.error.forbidden)
    switch (operation) {
      case O.messageSend: return this.deliver(connection, context, payload)
      case O.messageStatus: return this.messageStatus(connection, sessionId, payload.messageId)
      case O.sessionStatus: {
        const result = await this.getStatus(context)
        status(result)
        await this.authorize(connection, sessionId, operation)
        if (context.signal.aborted) fail(CONTROL.error.forbidden)
        return { ...result }
      }
      case O.watchOpen: return this.openWatch(connection, context, payload.watchId)
      case O.watchClose: {
        const watch = connection.watches.get(payload.watchId)
        if (watch && watch.sessionId !== sessionId) fail(CONTROL.error.conflict)
        if (watch) this.disposeWatch(connection, watch)
        return { watchId: payload.watchId }
      }
      case O.approvalList: {
        const result = { approvals: this.listApprovals(connection, sessionId) }
        // A peer may choose a much longer correlation ID than our own UUIDs. Reject that
        // particular response cleanly instead of closing an otherwise valid connection.
        encodeEnvelope(makeEnvelope(this.hostId, sessionId, request.requestId, CONTROL.type.response, O.approvalList, result), this.limits)
        return result
      }
      case O.approvalAnswer: return this.answerApproval(connection, sessionId, payload)
      default: fail(CONTROL.error.operation)
    }
  }

  messageKey(connection, messageId) { return JSON.stringify([connection.principalId, messageId]) }

  deliveryResult(messageId, entry) {
    if (entry?.error) fail(entry.error)
    return { messageId, status: entry?.status ?? CONTROL.delivery.unknown }
  }

  messageStatus(connection, sessionId, messageId) {
    const entry = this.messages.get(this.messageKey(connection, messageId))
    if (entry && entry.sessionId !== sessionId) fail(CONTROL.error.conflict)
    return this.deliveryResult(messageId, entry)
  }

  async deliver(connection, context, { messageId, text: content }) {
    const key = this.messageKey(connection, messageId)
    const previous = this.messages.get(key)
    if (previous) {
      if (previous.sessionId !== context.sessionId || previous.text !== content) fail(CONTROL.error.conflict)
      return this.deliveryResult(messageId, previous)
    }
    if (this.messages.size >= this.limits.maxDedupeEntries) fail(CONTROL.error.limit)
    // Reserve BEFORE invoking anything that can deliver. Never evict uncertain work and retry it.
    const entry = { sessionId: context.sessionId, text: content, status: CONTROL.delivery.pending }
    this.messages.set(key, entry)
    try {
      if (context.signal.aborted) fail(CONTROL.error.forbidden)
      const result = await this.deliverMessage({ ...context, messageId, text: content })
      exact(result, ['status'])
      if (![CONTROL.delivery.delivered, CONTROL.delivery.unconfirmed].includes(result.status)) fail()
      entry.status = result.status
    } catch (error) {
      // Trusted callbacks may report this specific refusal only BEFORE any delivery effect.
      // Keep the reservation terminal: neither a retry nor status can turn it into a new attempt.
      if (error instanceof ControlError && error.code === CONTROL.error.forbidden) {
        entry.error = error.code
        entry.status = null
      } else entry.status = CONTROL.delivery.unconfirmed
    }
    // Aborting after handoff is not evidence of non-delivery. Only the explicit refusal above
    // distinguishes safe authority rejection from an uncertain callback failure.
    return this.deliveryResult(messageId, entry)
  }

  disposeWatch(connection, watch) {
    if (connection.watches.get(watch.watchId) === watch) connection.watches.delete(watch.watchId)
    watch.closed = true
    watch.abort.abort()
    try { watch.dispose?.() } catch {}
    watch.dispose = null
  }

  async openWatch(connection, context, watchId) {
    if (connection.watches.has(watchId)) fail(CONTROL.error.conflict)
    if (connection.watches.size >= this.limits.maxWatches) fail(CONTROL.error.limit)
    const watch = { watchId, sessionId: context.sessionId, abort: new AbortController(), closed: false, dispose: null, emitting: false, latest: null }
    connection.watches.set(watchId, watch)
    try {
      const dispose = await this.watchSession({ ...context, signal: AbortSignal.any([context.signal, watch.abort.signal]) }, (value) => {
        if (watch.closed || connection.closed) return
        try { status(value) } catch { this.disposeWatch(connection, watch); return }
        // Coalesce synchronous bursts to one bounded pending snapshot while authorization waits.
        watch.latest = { ...value }
        void this.emitWatch(connection, watch)
      })
      if (typeof dispose !== 'function') fail()
      if (watch.closed || connection.closed) { try { dispose() } catch {} }
      else watch.dispose = dispose
      return { watchId }
    } catch (error) { this.disposeWatch(connection, watch); throw error }
  }

  async emitWatch(connection, watch) {
    if (watch.emitting) return
    watch.emitting = true
    try {
      while (watch.latest && !watch.closed && !connection.closed) {
        await this.authorize(connection, watch.sessionId, O.watchOpen)
        if (watch.closed) return
        const value = watch.latest
        watch.latest = null
        this.event(connection, watch.sessionId, CONTROL.event.watchStatus, { watchId: watch.watchId, status: value })
      }
    } catch { this.disposeWatch(connection, watch) }
    finally { watch.emitting = false }
  }

  registerApproval(input) {
    exact(input, APPROVAL_KEYS)
    text(input.sessionId)
    if (this.closed) fail(CONTROL.error.disconnected)
    if (typeof input.isLive !== 'function' || typeof input.answer !== 'function' || !Array.isArray(input.choices)) fail()
    const descriptor = { approvalId: input.approvalId, offerId: randomUUID(), kind: input.kind, prompt: input.prompt,
      choices: [...input.choices], expiresAt: input.expiresAt }
    approval(descriptor)
    if (input.expiresAt <= this.now() || input.expiresAt - this.now() > this.limits.maxApprovalTtlMs || input.isLive() !== true) fail(CONTROL.error.expired)
    if (this.approvals.has(input.approvalId)) fail(CONTROL.error.conflict)
    if (this.approvals.size >= this.limits.maxPendingApprovals) fail(CONTROL.error.limit)
    // Preflight the largest notification before taking ownership of the callback.
    encodeEnvelope(makeEnvelope(this.hostId, input.sessionId, randomUUID(), CONTROL.type.event, CONTROL.event.approvalRequest, descriptor), this.limits)
    // Reconnect discovery must fit in one complete list, not merely in separate events.
    // Refuse admission before retaining the callback rather than silently omit live authority.
    const descriptors = [descriptor]
    for (const pending of this.approvals.values()) {
      if (pending.sessionId === input.sessionId && this.live(pending)) descriptors.push(this.describeApproval(pending, randomUUID()))
    }
    encodeEnvelope(makeEnvelope(this.hostId, input.sessionId, randomUUID(), CONTROL.type.response, O.approvalList, { approvals: descriptors }), this.limits)
    const entry = { ...input, choices: descriptor.choices, timer: null }
    entry.timer = setTimeout(() => this.cancelApproval(entry.approvalId), input.expiresAt - this.now())
    entry.timer.unref?.()
    this.approvals.set(entry.approvalId, entry)
    for (const connection of this.connections.values()) void this.notifyApproval(connection, entry)
    return () => { if (this.approvals.get(entry.approvalId) === entry) this.cancelApproval(entry.approvalId) }
  }

  live(entry) {
    if (!entry || this.approvals.get(entry.approvalId) !== entry) return false
    try { if (entry.expiresAt > this.now() && entry.isLive() === true) return true } catch {}
    this.cancelApproval(entry.approvalId)
    return false
  }

  offer(connection, entry) {
    if (!this.live(entry) || connection.closed) return null
    let offered = connection.offers.get(entry.approvalId)
    if (!offered || offered.entry !== entry) {
      offered = { entry, offerId: randomUUID() }
      connection.offers.set(entry.approvalId, offered)
    }
    return this.describeApproval(entry, offered.offerId)
  }

  describeApproval(entry, offerId) {
    return { approvalId: entry.approvalId, offerId, kind: entry.kind,
      prompt: entry.prompt, choices: [...entry.choices], expiresAt: entry.expiresAt }
  }

  async notifyApproval(connection, entry) {
    if (!connection.ready || !connection.capabilities.has(O.approvalList)) return
    try {
      await this.authorize(connection, entry.sessionId, O.approvalList)
      const descriptor = this.offer(connection, entry)
      if (descriptor) this.event(connection, entry.sessionId, CONTROL.event.approvalRequest, descriptor)
    } catch { /* Unauthorized or disconnected peers are never told about this request. */ }
  }

  listApprovals(connection, sessionId) {
    const approvals = []
    for (const entry of this.approvals.values()) if (entry.sessionId === sessionId) {
      const descriptor = this.offer(connection, entry)
      if (descriptor) approvals.push(descriptor)
    }
    return approvals
  }

  cancelApproval(approvalId) {
    const entry = this.approvals.get(approvalId)
    if (!entry) return false
    this.approvals.delete(approvalId)
    clearTimeout(entry.timer)
    for (const connection of this.connections.values()) {
      const offered = connection.offers.get(approvalId)
      if (!offered) continue
      connection.offers.delete(approvalId)
      this.event(connection, entry.sessionId, CONTROL.event.approvalClosed, { approvalId, offerId: offered.offerId })
    }
    return true
  }

  async answerApproval(connection, sessionId, payload) {
    const entry = this.approvals.get(payload.approvalId)
    const offered = connection.offers.get(payload.approvalId)
    if (!this.live(entry)) fail(CONTROL.error.expired)
    if (entry.sessionId !== sessionId || offered?.entry !== entry || offered.offerId !== payload.offerId) fail(CONTROL.error.forbidden)
    answer(payload.answer, entry.kind)
    if (entry.kind === CONTROL.approval.question && entry.choices.length && !entry.choices.includes(payload.answer.text)) fail()
    // Consume synchronously before calling the live native continuation; no grant or retry token exists.
    this.cancelApproval(entry.approvalId)
    await entry.answer(payload.answer)
    return { approvalId: entry.approvalId, accepted: true }
  }
}
