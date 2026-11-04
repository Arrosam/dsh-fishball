import { randomUUID } from 'node:crypto'
import { CONTROL, ControlError, DEFAULT_CONTROL_LIMITS } from './native-control/index.js'

export const NATIVE_APPROVAL = Object.freeze({
  event: 'approval/request',
  abortEvent: 'abort',
  minimumTtlMs: 1,
  answerKey: 'decision',
  answerKeyCount: 1,
  allowedOnce: 'allowed-once',
  rejected: 'rejected',
  cancelled: 'cancelled',
  fallback: Symbol('native-approval-human-fallback'),
  promptPrefix: 'One pending native permission request. Decide only this invocation; no future grant. Request details: ',
})

/**
 * Attach the verified native approval waterfall, only when the host opts in.
 * registerApproval(input) synchronously returns an offer-cancellation function;
 * isManaged(sessionId) is a synchronous, live host-local policy check.
 * ttlMs is an explicit positive safe integer bounded by the control TTL ceiling.
 * Returns an idempotent disposer. Timeout/unavailability/disposal delegates to
 * next(); cancellation returns cancelled without creating a new human prompt.
 * No native question hook, remembered choice, or automatic approval is installed.
 */
export function attachNativeApprovals(ctx, { registerApproval, isManaged, ttlMs } = {}) {
  if (typeof registerApproval !== 'function' || typeof isManaged !== 'function' ||
      !Number.isSafeInteger(ttlMs) || ttlMs < NATIVE_APPROVAL.minimumTtlMs || ttlMs > DEFAULT_CONTROL_LIMITS.maxApprovalTtlMs) {
    throw new ControlError(CONTROL.error.invalid)
  }
  let closed = false
  const pending = new Set()
  const eligible = (agent) => {
    try {
      return !closed && typeof agent?.id === 'string' && agent.session?.id === agent.id &&
        ctx.sessions.get(agent.id) === agent.session && isManaged(agent.id) === true
    } catch { return false }
  }

  const unregister = ctx.on(NATIVE_APPROVAL.event, async (req, next) => {
    const { agent, signal } = req
    if (signal?.aborted) return NATIVE_APPROVAL.cancelled
    if (!eligible(agent) || typeof req.toolName !== 'string' || !req.toolName) return next()
    const expiresAt = Date.now() + ttlMs
    const result = await new Promise(resolve => {
      let settled = false
      let cancelOffer
      let timer
      const cancel = () => {
        const dispose = cancelOffer
        cancelOffer = undefined
        try { dispose?.() } catch { /* Liveness is already false; never hold native execution open. */ }
      }
      const finish = (outcome) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener(NATIVE_APPROVAL.abortEvent, aborted)
        pending.delete(release)
        cancel()
        resolve(outcome)
      }
      const aborted = () => finish(NATIVE_APPROVAL.cancelled)
      const release = () => finish(NATIVE_APPROVAL.fallback)
      const isLive = () => !settled && !signal?.aborted && Date.now() < expiresAt && eligible(agent)
      pending.add(release)
      signal?.addEventListener(NATIVE_APPROVAL.abortEvent, aborted, { once: true })
      timer = setTimeout(release, ttlMs)
      timer.unref?.()
      if (signal?.aborted) { aborted(); return }
      try {
        cancelOffer = registerApproval({
          sessionId: agent.id,
          approvalId: randomUUID(),
          kind: CONTROL.approval.permission,
          prompt: NATIVE_APPROVAL.promptPrefix + JSON.stringify({ toolName: req.toolName, callId: req.callId, reason: req.reason }),
          choices: [],
          expiresAt,
          isLive,
          answer(value) {
            if (!isLive()) throw new ControlError(CONTROL.error.expired)
            if (!value || Object.keys(value).length !== NATIVE_APPROVAL.answerKeyCount ||
                !Object.hasOwn(value, NATIVE_APPROVAL.answerKey) ||
                ![CONTROL.approval.allow, CONTROL.approval.reject].includes(value.decision)) {
              throw new ControlError(CONTROL.error.invalid)
            }
            finish(value.decision === CONTROL.approval.allow ? NATIVE_APPROVAL.allowedOnce : NATIVE_APPROVAL.rejected)
          },
        })
        if (typeof cancelOffer !== 'function') { cancelOffer = undefined; release() }
        // A local registrar may settle synchronously before returning its disposer.
        // Revoke that returned offer as well; never leave an already-settled handle.
        if (settled) cancel()
      } catch { release() }
    })
    if (signal?.aborted) return NATIVE_APPROVAL.cancelled
    if (result === NATIVE_APPROVAL.fallback || !eligible(agent)) return next()
    return result
  }, { prepend: true })

  return () => {
    if (closed) return
    closed = true
    try { unregister() } finally {
      for (const release of [...pending]) release()
    }
  }
}
