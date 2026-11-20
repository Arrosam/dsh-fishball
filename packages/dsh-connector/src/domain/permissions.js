/**
 * Permission requests of managed sessions (task C-WIRE-2; design §3.5, §5.3; R-CON-05/06/07/09,
 * R-ROUTE-02, R-TOK-05; the V2 broker's rules as V3 keeps them). One host-level `approval/request`
 * listener, prepended so it runs before DSH's browser forwarder (spike S12). Routing is
 * session → the agent that manages it → the user:
 * - no agent, or a session (by its root: a subagent asks for the session the user sees) that nobody
 *   manages → the user's stock prompt, unchanged DSH ("An unmanaged session's tools go to the user
 *   as normal DSH", the user, 2026-11-17);
 * - a standing grant covers the call → `allowed-once`, no offer (grants.js);
 * - a delegate claims the session (delegates/, `dshConnectorSessions`) and answers allow or reject
 *   → that one call is decided, no offer; the manager gets `settlement {by: delegate}`. A pass, or
 *   any failure of the delegate, goes on to the next step unchanged;
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
 * restart (V2 contract §5.1, design §10). Closing the connector (unload, remount) hands every
 * waiting call to the user's stock prompt, as V2's broker did on unload (`close`).
 */
import { ANSWER_DECISIONS, APPROVAL_DECISION, ARGUMENTS_STATUS, APPROVAL_KIND, EVENT_TYPE, OFFER_ID, REFUSAL, RISK, SETTLED_BY, SETTLEMENT_OUTCOME, formatOfferId } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { rootSessionOf } from '../session-info.js'
import { argumentsOf } from './call-log.js'
import { checkGrant } from './grants.js'
import { VERDICT } from '../delegates/index.js'
import { APPROVAL, LOG, REQUEST_ID, SUMMARY } from './constants.js'
import { mintId, refused, settleOrWithdraw, trimmed } from './support.js'

/** The settlement each final decision commits, and the call's DSH outcome. */
const FINAL = Object.freeze({
  [APPROVAL_DECISION.allow]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.allowed, call: APPROVAL.outcome.allowedOnce }),
  [APPROVAL_DECISION.grant]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.allowed, call: APPROVAL.outcome.allowedOnce }),
  [APPROVAL_DECISION.reject]: Object.freeze({ outcome: SETTLEMENT_OUTCOME.rejected, call: APPROVAL.outcome.rejected }),
})
/** The user's DSH outcome on the stock prompt as a settlement (only a real answer has one). */
const USER_OUTCOME = Object.freeze({ [APPROVAL.outcome.allowedOnce]: SETTLEMENT_OUTCOME.allowed, [APPROVAL.outcome.rejected]: SETTLEMENT_OUTCOME.rejected })

/**
 * The §7a.3 decision rules of a final answer, shared by `approval_answer` (allow, grant, reject)
 * and `prompt_answer` (allow, reject), so the two paths cannot drift (review F08):
 * - reject: a non-empty reason only; `risk` is not asked for;
 * - allow and grant: a risk (`risk-required`), low (`allow-needs-low-risk`), a non-empty reason,
 *   complete arguments.
 * @returns the broken rule's code, or undefined.
 */
export function decisionRuleBroken(decision, risk, reason, argumentsStatus) {
  if (decision !== APPROVAL_DECISION.reject && risk === undefined) return REFUSAL.riskRequired
  if (trimmed(reason).length === 0) return REFUSAL.reasonRequired
  if (decision === APPROVAL_DECISION.reject) return undefined
  if (risk !== RISK.low) return REFUSAL.allowNeedsLowRisk
  if (argumentsStatus !== ARGUMENTS_STATUS.complete) return REFUSAL.argumentsIncomplete
  return undefined
}

/**
 * @param ctx - the row's context (`on`, `sessions` through rootSessionOf)
 * @param deps.routing - `offer`, `settle`, `escalate`, `withdraw`
 * @param deps.managerOf - K1c `ManagedState.managerOf`
 * @param deps.grants - grants.js
 * @param deps.delegates - delegates/index.js (`decide`)
 * @param deps.gate - prompt-gate.js
 * @param deps.wording - wording.js
 * @param deps.titleOf - `(sessionId) => Promise<string>`: the descriptor's `title`
 * @param deps.readLimits - the connector's live limits (`argumentExcerptBytes`)
 * @param {() => number} deps.now - epoch ms
 * @param deps.logger - `{warn}`
 */
export function createPermissions(ctx, { routing, managerOf, grants, delegates, gate, wording, titleOf, readLimits, now, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  /** approvalId → the live request: its call and how to end it. Memory only (module comment). */
  const live = new Map()

  /** The descriptor one offer carries (K1 `descriptor`, timer-free). */
  const descriptorOf = (request, title) => Object.freeze({
    approvalId: request.id, offerId: request.offerId, kind: APPROVAL_KIND.approval, prompt: SUMMARY.permission(request.toolName),
    choices: [...ANSWER_DECISIONS], title, at: request.at, toolName: request.toolName, callId: request.callId ?? null,
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
   * The delegate step (module comment): a delegate's allow or reject decides the call, and its
   * manager is told with `settlement {by: delegate}`. The call is decided even if that report
   * fails (logged): the delegate's answer is the decision, the settlement only informs.
   * @returns the call's DSH outcome, or undefined to go on to the offer
   */
  async function delegate(request, signal) {
    // The title is read only when a delegate claims the session: the offer path reads its own.
    const describe = async () => descriptorOf(request, await titleOf(request.sessionId))
    const decided = await delegates.decide(request.sessionId, describe, signal)
    if (signal?.aborted) return APPROVAL.outcome.cancelled
    if (decided === undefined) return undefined
    const decision = decided.verdict === VERDICT.allow ? APPROVAL_DECISION.allow : APPROVAL_DECISION.reject
    const settlement = { approvalId: request.id, outcome: FINAL[decision].outcome, by: SETTLED_BY.delegate, delegate: { name: decided.name, toolName: request.toolName, reason: decided.reason } }
    void routing.report(request.sessionId, settlement).catch(warn(LOG.settleFailed))
    if (decision === APPROVAL_DECISION.reject) wording.reject(request.sessionId, request.callId, request.toolName, decided.reason)
    return FINAL[decision].call
  }

  /**
   * The waterfall listener: see the module comment.
   * @param target - the scope target the waterfall runs for (S33's re-dispatch fallback)
   */
  async function route(target, req, next) {
    if (gate.isPassing(req) || req.agent === undefined) return next()
    const via = { target, req, next }
    const sessionId = rootSessionOf(ctx, req.agent.id)
    const args = argumentsOf(req.agent.session, req.callId, req.toolName, readLimits().argumentExcerptBytes)
    const call = { sessionId, toolName: req.toolName, callId: req.callId, args }
    if (managerOf(sessionId) === undefined) return gate.show(via, { ...call, escalated: false })
    if (grants.cover(sessionId, req.toolName, args.value) !== undefined) return APPROVAL.outcome.allowedOnce
    const id = mintId(REQUEST_ID.permission)
    let resolve
    const answered = new Promise((settle) => { resolve = settle })
    const request = { ...call, id, offerId: formatOfferId(id, OFFER_ID.firstRevision), at: now(), reason: typeof req.reason === 'string' ? req.reason : '', resolve }
    const delegated = await delegate(request, req.signal)
    if (delegated !== undefined) return delegated
    live.set(id, request)
    const onAbort = () => {
      if (end(id, { cancelled: true })) void routing.withdraw(request.offerId).catch(warn(LOG.withdrawFailed))
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const offered = await routing.offer(sessionId, EVENT_TYPE.permission, descriptorOf(request, await titleOf(sessionId)))
      // Released between the check and the commit: the router named nobody (NoRecipient's
      // `recipient: null`), or the mailbox refused it; either way it is the user's.
      if (typeof offered.recipient !== 'string') end(id, { toUser: true })
      // Ended while the offer was being made (an abort during the title read or the commit, or a
      // close): its withdraw ran before the offer existed, so the committed offer is retired now.
      else if (!live.has(id)) void routing.withdraw(request.offerId).catch(warn(LOG.withdrawFailed))
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
        : settleOrWithdraw(routing, request.offerId, { approvalId: id, outcome: USER_OUTCOME[outcome], by: SETTLED_BY.user }, warn(LOG.withdrawFailed))
      void settled.catch(warn(LOG.settleFailed))
    }
    return outcome
  }

  /**
   * Commits the principal's settlement, then releases the call. Routing settles once, on the
   * managed chain, against a racing release or withdraw: `false` there means the offer left first
   * and the call is not answered here. A call that ends between the two (its turn stopped) keeps
   * the committed settlement; the call itself is cancelled. A reject's wording is marked only
   * once the settlement won (V2's order), so a call that lost to a release and then went to the
   * user's prompt is never reworded as the agent's rejection. Routing settles only for the
   * answering principal while it still holds the offer (review F02). A settlement whose commit
   * rejects leaves the offer live and the call waiting (routing, review F04), so the answer can be
   * retried; the rejection reaches the caller (`operation-failed`).
   * @returns whether the settlement was committed
   * @throws (rejects) the mailbox's storage error
   */
  async function settle(request, decision, reason, principalKey) {
    const outcome = { approvalId: request.id, outcome: FINAL[decision].outcome, by: SETTLED_BY.principal }
    const committed = await routing.settle(request.offerId, outcome, { principalKey })
    if (!committed) return false
    if (decision === APPROVAL_DECISION.reject) wording.reject(request.sessionId, request.callId, request.toolName, reason)
    end(request.id, { call: FINAL[decision].call })
    return true
  }

  const dispose = ctx.on(APPROVAL.waterfall, function (req, next) { return route(this, req, next) }, { prepend: true })

  return Object.freeze({
    /**
     * The domain half of `approval_answer` (the core tools already checked the offer's holder and
     * id, and the payload rules). `principalKey` is the answering holder, whose grant it becomes.
     * A refusal leaves the offer live.
     * @returns `{ok: true, grantId?, expiresAt?}` or `{ok: false, code}`
     */
    async answer({ approvalId, answer, principalKey }) {
      const request = live.get(approvalId)
      if (request === undefined) return refused(REFUSAL.expired)
      const { decision, risk, reason } = answer
      if (decision === APPROVAL_DECISION.ask) return refused(REFUSAL.invalidDecision)
      if (decision === APPROVAL_DECISION.escalate) {
        // Escalate settles nothing (K1); the user's answer on the stock prompt does.
        if (!(await routing.escalate(request.offerId, { principalKey }))) return refused(REFUSAL.expired)
        end(approvalId, { escalated: true })
        return Object.freeze({ ok: true })
      }
      const broken = decisionRuleBroken(decision, risk, reason, request.args.status)
      if (broken !== undefined) return refused(broken)
      let grant
      if (decision === APPROVAL_DECISION.grant) {
        const spec = checkGrant(answer.grant, { toolName: request.toolName, args: request.args.value })
        if (spec.error !== undefined) return refused(spec.error)
        // Written pending before the settlement, so an answer never names a grant a failed write
        // lost; it covers only once the settlement is stored (`activate`, review F04).
        const grantId = await grants.create({ sessionId: request.sessionId, principalKey, toolName: request.toolName, args: request.args.value, spec })
        if (grantId === undefined) return refused(REFUSAL.expired)
        grant = { grantId, expiresAt: spec.expiresAt }
      }
      // A grant whose answer did not settle never took effect: discarded on a refusal and on a
      // rejected settlement alike (review F04), so no grant outlives an unsuccessful answer.
      const discard = () => (grant === undefined ? undefined : grants.discard(grant.grantId))
      let committed
      try {
        committed = await settle(request, decision, trimmed(reason), principalKey)
      } catch (error) {
        await discard()
        throw error
      }
      if (!committed) {
        await discard()
        return refused(REFUSAL.expired)
      }
      if (grant !== undefined) await grants.activate(grant.grantId)
      return Object.freeze({ ok: true, ...(grant ?? {}) })
    },

    /**
     * Revocation's and release's hand-over (routing retired the offer): the waiting call goes to
     * the user's stock prompt in its session (R-ROUTE-06, R-TOK-05). @returns whether it was live
     */
    toUser: (approvalId) => end(approvalId, { toUser: true }),

    /**
     * Stops answering DSH and hands every waiting call to the user's stock prompt, as V2's broker
     * did on unload (releaseAll): the MCP endpoint is closing, so no agent can answer it any more.
     * Its offer stays in the mailbox and is not retired: the connector is going down, and the next
     * start begins with no live offers (offers.js: no offer survives a restart).
     */
    close() {
      dispose?.()
      for (const id of [...live.keys()]) end(id, { toUser: true })
    },
  })
}
