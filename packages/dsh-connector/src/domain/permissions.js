/**
 * Permission requests of managed sessions (task C-WIRE-2; design §3.5, §5.3; R-CON-05/06/07/09,
 * R-ROUTE-02, R-TOK-05; the V2 broker's rules as V3 keeps them). One host-level `approval/request`
 * listener, prepended so it runs before DSH's browser forwarder (spike S12). Routing is
 * session → the agent that manages it → the user:
 * - no agent, or a session (by its root: a subagent asks for the session the user sees) that nobody
 *   manages → the user's stock prompt, unchanged DSH ("An unmanaged session's tools go to the user
 *   as normal DSH", the user, 2026-11-17);
 * - a standing grant covers the call → `allowed-once`, no offer (grants.js);
 * - otherwise one `permission` offer to the manager's mailbox, connected or not, that waits with no
 *   timer and no cap (the user, 2026-11-17: "No cap on pending approvals. Requests from managed
 *   sessions wait in the queue indefinitely and are never refused for being too many"). The stock
 *   prompt is not shown meanwhile.
 *
 * The manager's answer (`approval_answer`, by the offer the core tools checked, offers.js):
 * - allow / grant (low risk, a reason, complete arguments; grant with a spec that fits the call)
 *   → the call runs; `settlement {allowed, principal}`;
 * - reject (a reason) → the call is rejected and the session's agent reads the reason (the one
 *   post-execute rewrite, wording.js); `settlement {rejected, principal}`;
 * - escalate → the offer settles nothing yet (K1 SETTLEMENT_OUTCOME: escalate settles nothing):
 *   routing marks it escalated (no longer listed or answerable by the agent) and the stock prompt
 *   shows; the user's answer there is the call's, with `settlement {by: user}` to the same pair;
 * - ask → `invalid-decision`: there is no `ask_agent` to carry the question back (the user's answer,
 *   2026-11-17: "Refuse it").
 * A refused answer leaves the offer live and answerable. The call's own abort (Stop, the turn
 * ended) withdraws the offer (`retirement {withdrawn}`). The session leaving management (release,
 * Take back, revocation) retires the offer with its own reason (routing) and hands the call to the
 * stock prompt (`toUser`).
 * Every request exists only inside a running turn of its session, so nothing is restored after a
 * restart (V2 contract §5.1, design §10).
 */
import { randomUUID } from 'node:crypto'
import { APPROVAL_DECISION, ARGUMENTS_STATUS, APPROVAL_KIND, EVENT_TYPE, OFFER_ID, REFUSAL, RISK, SETTLED_BY, SETTLEMENT_OUTCOME, formatOfferId } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { rootSessionOf } from '../session-info.js'
import { argumentsOf } from './call-log.js'
import { checkGrant } from './grants.js'
import { APPROVAL, LOG, OFFERED_DECISIONS, REQUEST_ID, SUMMARY } from './constants.js'

const refused = (code) => Object.freeze({ ok: false, code })
const trimmed = (text) => (typeof text === 'string' ? text.trim() : '')

/** The settlement each final decision commits, and the call's DSH outcome. */
const FINAL = Object.freeze({
  [APPROVAL_DECISION.allow]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.allowed, call: APPROVAL.outcome.allowedOnce }),
  [APPROVAL_DECISION.grant]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.allowed, call: APPROVAL.outcome.allowedOnce }),
  [APPROVAL_DECISION.reject]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.rejected, call: APPROVAL.outcome.rejected }),
})
/** The user's DSH outcome on the stock prompt as a settlement (only a real answer has one). */
const USER_OUTCOME = Object.freeze({ [APPROVAL.outcome.allowedOnce]: SETTLEMENT_OUTCOME.allowed, [APPROVAL.outcome.rejected]: SETTLEMENT_OUTCOME.rejected })

/**
 * allow's rules (§7a.3), shared by allow, grant and `prompt_answer`'s allow: low risk, a reason,
 * complete arguments. @returns the broken rule's code, or undefined.
 */
export function allowRuleBroken(risk, reason, argumentsStatus) {
  if (risk !== RISK.low) return REFUSAL.allowNeedsLowRisk
  if (trimmed(reason).length === 0) return REFUSAL.reasonRequired
  if (argumentsStatus !== ARGUMENTS_STATUS.complete) return REFUSAL.argumentsIncomplete
  return undefined
}

/**
 * @param ctx - the row's context (`on`, `waterfall`, `sessions`)
 * @param deps.routing - `offer`, `settle`, `escalate`, `withdraw`
 * @param deps.managerOf - K1c `ManagedState.managerOf`
 * @param deps.grants - grants.js
 * @param deps.gate - prompt-gate.js
 * @param deps.wording - wording.js
 * @param deps.titleOf - `(sessionId) => Promise<string>`: the descriptor's `title`
 * @param deps.readLimits - the connector's live limits (`argumentExcerptBytes`)
 * @param {() => number} deps.now - epoch ms
 * @param deps.logger - `{warn}`
 */
export function createPermissions(ctx, { routing, managerOf, grants, gate, wording, titleOf, readLimits, now, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  /** approvalId → the live request: its call and how to end it. Memory only (module comment). */
  const live = new Map()

  /** The descriptor one offer carries (K1 `descriptor`, timer-free). */
  const descriptorOf = (request, title) => Object.freeze({
    approvalId: request.id, offerId: request.offerId, kind: APPROVAL_KIND.approval, prompt: SUMMARY.permission(request.toolName),
    choices: [...OFFERED_DECISIONS], title, at: request.at, toolName: request.toolName, callId: request.callId ?? null,
    reason: request.reason, quotes: [], arguments: request.args.text, argumentsStatus: request.args.status,
  })

  /** Settles a live offer with `answer` once; @returns whether it was still live. */
  function end(id, result) {
    const request = live.get(id)
    if (request === undefined) return false
    live.delete(id)
    request.resolve(result)
    return true
  }

  /**
   * The waterfall listener: see the module comment.
   * @param target - the scope target the waterfall runs for (S33's re-dispatch fallback)
   */
  async function route(target, req, next) {
    if (gate.isPassing(req) || req.agent === undefined) return next()
    const via = { target, req, next }
    const sessionId = rootSessionOf(ctx, req.agent.id)
    const session = ctx.sessions.get(sessionId) ?? req.agent.session
    const args = argumentsOf(req.agent.session, req.callId, req.toolName, readLimits().argumentExcerptBytes)
    const call = { sessionId, toolName: req.toolName, callId: req.callId, args }
    if (managerOf(sessionId) === undefined) return gate.show(via, { ...call, escalated: false })
    if (grants.cover(sessionId, req.toolName, args.value) !== undefined) return APPROVAL.outcome.allowedOnce
    const id = REQUEST_ID.permission + randomUUID().replace(REQUEST_ID.uuidSeparator, '')
    let resolve
    const answered = new Promise((settle) => { resolve = settle })
    const request = { ...call, id, offerId: formatOfferId(id, OFFER_ID.firstRevision), at: now(), reason: typeof req.reason === 'string' ? req.reason : '', session, resolve }
    live.set(id, request)
    const onAbort = () => {
      if (end(id, { cancelled: true })) void routing.withdraw(request.offerId).catch(warn(LOG.withdrawFailed))
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const offered = await routing.offer(sessionId, EVENT_TYPE.permission, descriptorOf(request, await titleOf(sessionId)))
      // Released between the check and the commit: the router named nobody, so it is the user's.
      if (offered.recipient === undefined) end(id, { toUser: true })
    } catch (error) {
      warn(LOG.offerFailed)(error)
      end(id, { toUser: true })
    }
    if (req.signal?.aborted) onAbort()
    const result = await answered
    req.signal?.removeEventListener('abort', onAbort)
    if (result.cancelled) return APPROVAL.outcome.cancelled
    if (result.call !== undefined) return result.call
    // Escalated, released or revoked: the user's stock prompt answers the call.
    const outcome = await gate.show(via, { ...call, escalated: result.escalated === true })
    if (result.escalated) {
      // The user's click settles the escalated offer for its pair; a cancelled prompt withdraws it.
      const settled = USER_OUTCOME[outcome] === undefined
        ? routing.withdraw(request.offerId)
        : routing.settle(request.offerId, { approvalId: id, outcome: USER_OUTCOME[outcome], by: SETTLED_BY.user })
      void settled.catch(warn(LOG.settleFailed))
    }
    return outcome
  }

  /**
   * Commits the principal's settlement, then releases the call. Routing settles once, on the
   * managed chain, against a racing release or withdraw: `false` there means the offer left first
   * and the call is not answered here. A call that ends between the two (its turn stopped) keeps
   * the committed settlement; the call itself is cancelled.
   * @returns whether the settlement was committed
   */
  async function settle(request, decision) {
    const committed = await routing.settle(request.offerId, { approvalId: request.id, outcome: FINAL[decision].outcome, by: SETTLED_BY.principal })
    if (committed) end(request.id, { call: FINAL[decision].call })
    return committed
  }

  const dispose = ctx.on(APPROVAL.waterfall, function (req, next) { return route(this, req, next) }, { prepend: true })

  return Object.freeze({
    /**
     * The domain half of `approval_answer` (the core tools already checked the offer's holder and
     * id, and the payload rules). A refusal leaves the offer live.
     * @returns `{ok: true, grantId?, expiresAt?}` or `{ok: false, code}`
     */
    async answer({ approvalId, answer }) {
      const request = live.get(approvalId)
      if (request === undefined) return refused(REFUSAL.expired)
      const { decision, risk, reason } = answer
      if (decision === APPROVAL_DECISION.ask) return refused(REFUSAL.invalidDecision)
      if (decision === APPROVAL_DECISION.escalate) {
        // Escalate settles nothing (K1); the user's answer on the stock prompt does.
        if (!(await routing.escalate(request.offerId))) return refused(REFUSAL.expired)
        end(approvalId, { escalated: true })
        return Object.freeze({ ok: true })
      }
      if (risk === undefined) return refused(REFUSAL.riskRequired)
      if (reason === undefined || trimmed(reason).length === 0) return refused(REFUSAL.reasonRequired)
      if (decision !== APPROVAL_DECISION.reject) {
        const broken = allowRuleBroken(risk, reason, request.args.status)
        if (broken !== undefined) return refused(broken)
      }
      let grant
      if (decision === APPROVAL_DECISION.grant) {
        const spec = checkGrant(answer.grant, { toolName: request.toolName, args: request.args.value })
        if (spec.error !== undefined) return refused(spec.error)
        // Written before the settlement, so an answer never names a grant a failed write lost.
        const grantId = await grants.create({ sessionId: request.sessionId, toolName: request.toolName, args: request.args.value, spec })
        if (grantId === undefined) return refused(REFUSAL.expired)
        grant = { grantId, expiresAt: spec.expiresAt }
      }
      if (decision === APPROVAL_DECISION.reject) wording.reject(request.sessionId, request.callId, request.toolName, trimmed(reason))
      if (!(await settle(request, decision))) {
        if (grant !== undefined) await grants.discard(grant.grantId)
        return refused(REFUSAL.expired)
      }
      return Object.freeze({ ok: true, ...(grant ?? {}) })
    },

    /**
     * Revocation's and release's hand-over (routing retired the offer): the waiting call goes to
     * the user's stock prompt in its session (R-ROUTE-06, R-TOK-05). @returns whether it was live
     */
    toUser: (approvalId) => end(approvalId, { toUser: true }),

    /** Stops answering DSH; requests already waiting keep their offers until their calls end. */
    close: () => dispose?.(),
  })
}
