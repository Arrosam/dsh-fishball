import { CONTROL, ControlError, createControlHost } from './native-control/index.js'

/** The peer is one local runtime, never a remotely selected user or tool identity. */
export const NATIVE_HOST = Object.freeze({
  principalId: 'attached-fishball',
  sourceKind: 'fishball-native',
  sourceForm: 'relay',
  textPart: 'text',
})

const deny = (code = CONTROL.error.forbidden) => { throw new ControlError(code) }
const emptyAllowlist = () => []

/**
 * Adapt only verified host-local services; no legacy Fishball composition or grants.
 * options: {hostId, managedSessionIds: () => string[], limits?}.
 * dependencies.createUserMessage is the real dsh-llm factory in production.
 * The native pending-request owner must dispose registerApproval's result on settlement;
 * this adapter does not intercept approval/request or own a human-fallback timer.
 */
export function createNativeHostAdapter(ctx, { hostId, managedSessionIds = emptyAllowlist, limits } = {}, { createUserMessage } = {}) {
  if (typeof managedSessionIds !== 'function' || typeof createUserMessage !== 'function') deny(CONTROL.error.invalid)
  let closed = false

  const isManagedLocal = (sessionId) => {
    if (closed || typeof sessionId !== 'string') return false
    try {
      const allowed = managedSessionIds()
      if (!Array.isArray(allowed) || !allowed.includes(sessionId)) return false
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) return false
      // Live objects are host-owned; unloaded entries must be in the registry's
      // header-validated local index. A wire ID alone never causes session loading.
      const live = ctx.sessions.get(sessionId)
      return live?.id === sessionId || ctx.workspaceRegistry.list().some(workspace => workspace.sessionIds.includes(sessionId))
    } catch { return false }
  }
  const authorized = (request) => request.hostId === hostId && request.principalId === NATIVE_HOST.principalId &&
    !request.signal?.aborted && isManagedLocal(request.sessionId)
  const requireAuthorized = (request) => { if (!authorized(request)) deny() }

  const host = createControlHost({
    hostId, limits,
    authorizeTarget: authorized,
    async deliverMessage(request) {
      requireAuthorized(request)
      const { agent } = await ctx.sessionController.resolveAgent(request.sessionId)
      // Resuming an agent is asynchronous. Membership, disconnect and disposal may
      // have changed meanwhile; there is no await between this check and steer.
      requireAuthorized(request)
      if (agent?.id !== request.sessionId || agent.session?.id !== request.sessionId) deny()
      const message = createUserMessage({
        content: [{ type: NATIVE_HOST.textPart, text: request.text }],
        source: { kind: NATIVE_HOST.sourceKind, form: NATIVE_HOST.sourceForm,
          hostId, principalId: NATIVE_HOST.principalId, messageId: request.messageId },
      })
      requireAuthorized(request)
      agent.steer(message)
      // Once handed over, cancellation is not permission to retry. Flush exactly
      // this session; false/exception is uncertain delivery, never a second steer.
      let durable = false
      try { durable = await ctx.sessions.flush(agent.session) === true } catch { /* Unconfirmed, not failed delivery. */ }
      return { status: durable ? CONTROL.delivery.delivered : CONTROL.delivery.unconfirmed }
    },
    // No invented state projection or watch service: do not advertise either.
  })

  return Object.freeze({
    attach(transport, { connectionId, principalId } = {}) {
      if (closed) deny(CONTROL.error.disconnected)
      if (principalId !== NATIVE_HOST.principalId) deny()
      return host.attach(transport, { connectionId, principalId })
    },
    registerApproval(input) {
      if (closed) deny(CONTROL.error.disconnected)
      if (!input || typeof input.isLive !== 'function' || typeof input.answer !== 'function') deny(CONTROL.error.invalid)
      if (!isManagedLocal(input.sessionId)) deny()
      const { sessionId, isLive, answer } = input
      const live = () => isManagedLocal(sessionId) && isLive() === true
      return host.registerApproval({
        ...input,
        isLive: live,
        answer(value) {
          if (!live()) deny(CONTROL.error.expired)
          // This is the current pending continuation, consumed by ControlHost
          // before invocation. No standing execution grant is created here.
          return answer(value)
        },
      })
    },
    close() { closed = true; host.close() },
  })
}
