/**
 * Questions and plan reviews of managed sessions (task C-WIRE-2; design §3.5; R-CON-05/07/09,
 * R-ROUTE-02; the V2 question router's rules as V3 keeps them, spike S36). One host-level
 * `user-questions/request` listener, prepended so it runs before DSH's browser forwarder.
 *
 * Routing (the user, 2026-11-17: "When a session is managed by an agent, its user-interaction
 * tools (`ask_user_question` and plan review, plus permission prompts) are forwarded to that
 * agent. An unmanaged session's tools go to the user as normal DSH"):
 * - no agent, or an unmanaged session (by its root) → `next()`: the session's own card, unchanged;
 * - a managed session → one `question` (or `plan-review`) offer to its manager, connected or not,
 *   and `next()` at once: the session's own card opens too, and the first answer wins (the user's
 *   answer q2, 2026-11-17: "Card opens too, first answer wins"). No timer settles it (R-CON-05).
 *
 * The race, decided in one place (`entry.settle`, a settled flag): the manager's `question_answer`
 * (its batch is the call's result, and the card closes in every browser through our own signal),
 * or `next()` resolving (the user answered in the card: `settlement {by: user, answers}`). `next()`
 * rejecting while the asker's call goes on (the user dismissed the card, plan mode's Discuss)
 * withdraws the offer: the user decided. `toUser` (routing `escalate`) points the user at the card
 * and changes nothing else: the question stays the manager's to answer too, and the first answer
 * wins (the user, 2026-11-21: "Fishball can always answer while the request is open").
 *
 * The asker's call ending first while its turn goes on (a `run_code` deadline cut the program that
 * asked: DSH ends a run after at most ten minutes, and the connector cannot hold that deadline) does
 * not end the question (the user, 2026-11-21: "Keep it open, send the answer later"). A cancelled
 * turn (the user's Stop, the manager's session_stop or session_redirect) still withdraws it, as
 * before: someone decided the turn should end (`isTurnCancel`). The call fails
 * as DSH ends it, the question stays live with its manager (listed, answerable), and the manager gets
 * a `notice {question-call-ended}` saying so. Its answer is then delivered into the session as a
 * message (`deps.deliver`), and settles the offer. No timer ends it; only an answer, the session
 * leaving management, or a restart (which ends every question; old ids are `expired`). A later
 * Stop of the session does not end it either: the answer still arrives as a message, which steers
 * the session (and so may start a turn there). A plan review is withdrawn instead: only its call can leave plan mode.
 *
 * A timed question's foreground wait is held for as long as its manager holds the question
 * (S36-attachWait): one `attachWait` claim, taken before `next()`, stops DSH's own timer, and the
 * card is passed on untimed, so the tool's timeout cannot end the wait, `toUser` included. The
 * claim ends with the question, and when the session leaves management (release, Take back,
 * revocation): DSH's timer then ends the wait at once if its deadline passed, as for any user's
 * question. A live child's question DSH refuses before the waterfall (S36 Q5).
 */
import { APPROVAL_KIND, EVENT_TYPE, NOTICE, OFFER_ID, PLAN_REVIEW, REFUSAL, SETTLED_BY, SETTLEMENT_OUTCOME, formatOfferId } from '../../mcp-schema/index.js'
import { RefusalError, diagnosticOf } from '../errors.js'
import { rootSessionOf } from '../session-info.js'
import { questionCallIdOf } from './call-log.js'
import { ANSWER_RULE, LOG, QUESTION, QUESTION_TEXT, REQUEST_ID, SUMMARY } from './constants.js'
import { joinSignal, mintId, refused, settleOrWithdraw, trimmed } from './support.js'

const ACCEPTED = Object.freeze({ ok: true })

/** Whether an abort reason is a cancelled turn's cause (QUESTION.turnCauseKind): the user or the manager ended it. */
const isTurnCancel = (reason) => typeof reason?.[QUESTION.turnCauseKind] === 'string'

/** A plan review is one question carrying the plan-review intent (S36 Q3). */
const isPlanReview = (questions) => questions.length === 1 && questions[0].intent?.kind === QUESTION.planIntent

/** DSH's error shape (userQuestions.ask restores it), for the rejection the gateway forwards to the card. */
const questionError = (message) => Object.assign(new Error(message), { name: QUESTION.errorName, code: QUESTION.aborted })

/** One question as the descriptor carries it (K1 `questionItem`): DSH's fields, the plan-review intent only. */
function offeredQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    ...(question.detail === undefined ? {} : { detail: question.detail }),
    ...(question.header === undefined ? {} : { header: question.header }),
    ...(question.options === undefined ? {} : { options: question.options.map((option) => ({ label: option.label, ...(option.description === undefined ? {} : { description: option.description }) })) }),
    ...(question.multiSelect === undefined ? {} : { multiSelect: question.multiSelect }),
    ...(question.intent?.kind === QUESTION.planIntent ? { intent: { kind: PLAN_REVIEW, approve: question.intent.approve, ...(question.intent.callId === undefined ? {} : { callId: question.intent.callId }) } } : {}),
  }
}

/**
 * The items checked against the questions, by the rules DSH's own card follows (S36: one item per
 * question id; selected labels are offered options; a single-select item has at most one label,
 * and none with custom text). @returns a broken rule (ANSWER_RULE), else undefined.
 */
function checkAnswer(questions, items) {
  if (items.length !== questions.length) return ANSWER_RULE.items
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length || !questions.every((question) => ids.has(question.id))) return ANSWER_RULE.ids
  for (const item of items) {
    const question = questions.find((entry) => entry.id === item.id)
    const labels = new Set((question.options ?? []).map((option) => option.label))
    if (!item.selected.every((label) => labels.has(label))) return ANSWER_RULE.labels
    if (item.custom !== undefined && trimmed(item.custom) === '') return ANSWER_RULE.custom
    if (question.multiSelect !== true && item.selected.length > (item.custom === undefined ? 1 : 0)) return ANSWER_RULE.single
  }
  return undefined
}

/** The batch DSH's browser sends: in the questions' order, custom trimmed (S36 composeAnswer). */
const composeAnswer = (questions, items) => ({
  answers: questions.map((question) => {
    const item = items.find((entry) => entry.id === question.id)
    const custom = trimmed(item.custom)
    return { id: question.id, selected: [...item.selected], ...(custom === '' ? {} : { custom }) }
  }),
})

/**
 * A plan review's batch (S36 Q3): approve is the intent's approve label; keep planning with
 * feedback is the card's typed text; keep planning without feedback picks the other option.
 */
function planDecision(question, approve, feedback) {
  if (approve === true) return { answers: [{ id: question.id, selected: [question.intent.approve] }] }
  const decline = (question.options ?? []).find((option) => option.label !== question.intent.approve)?.label
  const text = trimmed(feedback)
  return { answers: [{ id: question.id, selected: text === '' && decline !== undefined ? [decline] : [], ...(text === '' ? {} : { custom: text }) }] }
}

/** The batch for one answer, or `{rule}` when it is refused (the question stays open). */
function batchFor(entry, { answers, approve, feedback }) {
  if (entry.plan) {
    if (answers !== undefined) return { rule: ANSWER_RULE.planOnly }
    // A note alone decides nothing: it goes nowhere in V3 except beside toUser.
    if (approve === undefined && feedback === undefined) return { rule: ANSWER_RULE.nothing }
    if (approve === true && feedback !== undefined) return { rule: ANSWER_RULE.planBoth }
    if (feedback !== undefined && trimmed(feedback) === '') return { rule: ANSWER_RULE.feedback }
    return { batch: planDecision(entry.questions[0], approve, feedback) }
  }
  if (approve !== undefined || feedback !== undefined) return { rule: ANSWER_RULE.questionOnly }
  if (answers === undefined) return { rule: ANSWER_RULE.nothing }
  const rule = checkAnswer(entry.questions, answers)
  return rule === undefined ? { batch: composeAnswer(entry.questions, answers) } : { rule }
}

/**
 * @param ctx - the row's context (`on`, `get`, `sessions`)
 * @param deps.routing - `offer`, `settle`, `escalate`, `withdraw`, `holds`, `notice`
 * @param deps.managerOf - K1c `ManagedState.managerOf`
 * @param {(sessionId: string, text: string) => Promise<unknown>} deps.deliver - one message into the
 *   session from the connector (session-port `message`): an ended question's late answer
 * @param deps.titleOf - `(sessionId) => Promise<string>`
 * @param {() => number} deps.now - epoch ms
 * @param deps.logger - `{warn}`
 */
export function createQuestions(ctx, { routing, managerOf, deliver, titleOf, now, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  /** approvalId → the open question its manager holds (its call waiting, or ended). Memory only (module comment). */
  const live = new Map()

  const descriptorOf = (entry, title) => {
    const choices = []
    for (const question of entry.questions) for (const option of question.options ?? []) if (!choices.includes(option.label)) choices.push(option.label)
    return Object.freeze({
      approvalId: entry.id, offerId: entry.offerId, kind: APPROVAL_KIND.question, prompt: SUMMARY.question(entry.toolName),
      choices, title, at: entry.at, toolName: entry.toolName, callId: entry.callId ?? null, reason: '', quotes: [],
      questions: entry.questions.map(offeredQuestion),
    })
  }

  /**
   * Holds a timed question's foreground wait (S36-attachWait).
   * @returns whether it is held (the card is then passed on untimed)
   */
  async function hold(entry, agent) {
    const service = ctx.get(QUESTION.service)
    if (!entry.timed || entry.callId === undefined || service === undefined) return false
    const claim = new AbortController()
    try {
      const frames = service.attachWait(agent, entry.callId, claim.signal)[Symbol.asyncIterator]()
      if ((await frames.next()).done === true) return false
      if (entry.settled) { claim.abort(); return false }
      entry.releaseHold = () => claim.abort()
      // The second step settles when the claim ends; nothing waits on it.
      frames.next().catch(() => {})
      return true
    } catch (error) {
      claim.abort()
      warn(LOG.holdFailed)(error)
      return false
    }
  }

  async function route(req, next) {
    if (req.agent === undefined) return next()
    const sessionId = rootSessionOf(ctx, req.agent.id)
    if (managerOf(sessionId) === undefined) return next()
    const questions = req.questions ?? []
    const original = req.signal
    const { own, placed } = joinSignal(req)
    // DSH froze the request (not seen in rc.2 to rc.5, S36): the question stays in its session.
    if (!placed) {
      logger.warn(LOG.format, LOG.frozenRequest, QUESTION.waterfall)
      return next()
    }
    const plan = isPlanReview(questions)
    const id = mintId(REQUEST_ID.question)
    const first = Promise.withResolvers()
    const entry = {
      id, offerId: formatOfferId(id, OFFER_ID.firstRevision), sessionId, questions, plan, at: now(),
      toolName: plan ? QUESTION.planTool : QUESTION.askTool, timed: req.wait?.timed === true,
      callId: req.wait?.callId ?? questions[0]?.intent?.callId ?? questionCallIdOf(req.agent.session, questions),
      settled: false,
      // offered: its offer reached a manager; handedOff: the manager no longer holds it (handOff);
      // ended: its call ended and it waits for a late answer (keepOpen); closing: that answer is being delivered.
      offered: false, handedOff: false, ended: false, closing: false,
      settle(result) {
        if (entry.settled) return false
        entry.settled = true
        live.delete(id)
        entry.releaseHold?.()
        first.resolve(result)
        return true
      },
    }
    live.set(id, entry)
    if (await hold(entry, req.agent)) req.wait = { ...req.wait, timed: false }
    const downstream = Promise.resolve().then(next)
    downstream.then((value) => entry.settle({ user: value }), (error) => entry.settle({ error }))
    const onAbort = () => entry.settle({ error: original.reason ?? questionError(QUESTION_TEXT.aborted) })
    original?.addEventListener('abort', onAbort, { once: true })
    if (original?.aborted) onAbort()
    try {
      const offered = await routing.offer(sessionId, plan ? EVENT_TYPE.planReview : EVENT_TYPE.question, descriptorOf(entry, await titleOf(sessionId)))
      entry.offered = typeof offered.recipient === 'string'
      // Released between the check and the commit: the router named nobody (NoRecipient's
      // `recipient: null`), or the mailbox refused it; the card is all there is.
      if (!entry.offered) handOff(id)
    } catch (error) {
      warn(LOG.offerFailed)(error)
      handOff(id)
    }
    // The offer is made (or failed) before the outcome is read, so a question settled while it was
    // being made is settled or withdrawn below, after the offer exists.
    const result = await first.promise
    original?.removeEventListener('abort', onAbort)
    if (result.batch !== undefined) {
      // The agent won: the session's own card closes in every browser (S36 Q2).
      own.abort(questionError(QUESTION_TEXT.answeredElsewhere))
      return result.batch
    }
    if (result.error === undefined) {
      // The user's answer in the card; a question that left the agent (released) settles nothing.
      const settlement = { approvalId: id, outcome: SETTLEMENT_OUTCOME.answered, by: SETTLED_BY.user, answers: result.user.answers ?? [] }
      void settleOrWithdraw(routing, entry.offerId, settlement, warn(LOG.withdrawFailed)).catch(warn(LOG.settleFailed))
      return result.user
    }
    // The asker's call ended, but not its turn, while its manager still holds the question: it
    // stays open (module comment). A cancelled turn is someone's decision, so its question ends. A
    // plan review is not kept: only its call can leave plan mode, so a late answer would decide nothing.
    if (original?.aborted === true && !isTurnCancel(original.reason) && !entry.plan && entry.offered && !entry.handedOff) keepOpen(entry, original.reason)
    else void routing.withdraw(entry.offerId).catch(warn(LOG.withdrawFailed))
    throw result.error
  }

  /** The ended call's cause as text: a deadline aborts with a plain string, anything else with an Error. */
  const causeOf = (reason) => {
    const text = typeof reason === 'string' ? reason : reason?.message
    return typeof text === 'string' && text !== '' ? text : QUESTION_TEXT.unknownCause
  }

  /**
   * An ended call's question stays live with its manager, who is told so (module comment). Only
   * while that manager still holds its offer: a release that landed while the call was ending has
   * retired it already, and its handOff found nothing to mark.
   */
  function keepOpen(entry, reason) {
    if (!routing.holds(entry.offerId, managerOf(entry.sessionId))) return
    entry.ended = true
    live.set(entry.id, entry)
    const told = Promise.resolve().then(() => routing.notice(entry.sessionId, entry.offerId, NOTICE.codes.questionCallEnded, QUESTION_TEXT.callEnded(entry.toolName, causeOf(reason))))
    // `false`: nobody manages it any more, or the mailbox refused the notice (queue-full).
    void told.then((stored) => { if (!stored) logger.warn(LOG.format, LOG.noticeFailed, NOTICE.codes.questionCallEnded) }, warn(LOG.noticeFailed))
  }

  /**
   * The settlement of the manager's own answer. The call already has the answer, so it is accepted
   * whatever the settlement's storage does; a settlement that could not be stored is logged and the
   * offer withdrawn (`settleOrWithdraw`).
   */
  function settleAsPrincipal(entry, answers) {
    const settlement = { approvalId: entry.id, outcome: SETTLEMENT_OUTCOME.answered, by: SETTLED_BY.principal, answers }
    return settleOrWithdraw(routing, entry.offerId, settlement, warn(LOG.withdrawFailed)).catch(warn(LOG.settleFailed))
  }

  /**
   * The manager's answer to a question whose call ended: delivered into the session first, then the
   * offer is settled. An answer that cannot be delivered leaves the question open for another try,
   * with the delivery's own refusal (`limit-exceeded`: a shorter answer fits) or `operation-failed`;
   * a session that is gone (`unknown-session`) can never take it, so the question is withdrawn.
   */
  async function answerEnded(entry, batch) {
    if (entry.closing) return refused(REFUSAL.expired)
    entry.closing = true
    try {
      await deliver(entry.sessionId, QUESTION_TEXT.lateAnswer(entry.toolName, entry.callId, entry.questions.map(offeredQuestion), batch.answers))
    } catch (error) {
      entry.closing = false
      warn(LOG.lateAnswerFailed)(error)
      if (error?.code === REFUSAL.unknownSession) {
        live.delete(entry.id)
        void routing.withdraw(entry.offerId).catch(warn(LOG.withdrawFailed))
      }
      return refused(error instanceof RefusalError ? error.code : REFUSAL.operationFailed)
    }
    live.delete(entry.id)
    await settleAsPrincipal(entry, batch.answers)
    return ACCEPTED
  }

  /**
   * The session left management (release, Take back, revocation; routing retired the offer) or the
   * connector is closing: the manager no longer holds the question. A waiting call's card stays and
   * answers it as any user's question; an ended call's question has nothing left to answer.
   */
  function handOff(id) {
    const entry = live.get(id)
    if (entry === undefined) return false
    live.delete(id)
    entry.handedOff = true
    entry.releaseHold?.()
    entry.releaseHold = undefined
    return true
  }

  const dispose = ctx.on(QUESTION.waterfall, (req, next) => route(req, next), { prepend: true })

  return Object.freeze({
    /**
     * The domain half of `question_answer` (the core tools already checked the offer's holder and
     * id, and the payload rules). A refusal leaves the question open.
     */
    async answer({ questionId, answers, approve, feedback, toUser: leave, principalKey }) {
      const entry = live.get(questionId)
      if (entry === undefined) return refused(REFUSAL.expired)
      // The offer desk checked the holder before an await; a succession or Take back since then
      // moved it (review F02). Read synchronously, in the same step as the in-memory settle below.
      if (!routing.holds(entry.offerId, principalKey)) return refused(REFUSAL.expired)
      const answering = answers !== undefined || approve !== undefined || feedback !== undefined
      if (leave === true) {
        if (answering) return refused(REFUSAL.badAnswer)
        // Nothing else changes: the user answers on the session's card (an ended call has none, so
        // its manager asks the user itself), and the manager may still answer it (module comment).
        if (!(await routing.escalate(entry.offerId, { principalKey })) || !live.has(questionId)) return refused(REFUSAL.expired)
        return ACCEPTED
      }
      const built = batchFor(entry, { answers, approve, feedback })
      if (built.rule !== undefined) return refused(REFUSAL.badAnswer)
      if (entry.ended) return answerEnded(entry, built.batch)
      // The race with the user's card is decided in memory first (first answer wins), checked again
      // here because the offer desk read the offer live before awaiting: a release meanwhile took the
      // question from the agent (handOff), so its answer is refused, never the call's. The
      // settlement follows; a retirement that raced it makes it a no-op.
      if (!live.has(questionId) || !entry.settle({ batch: built.batch })) return refused(REFUSAL.expired)
      // The call already has this answer (first answer wins in memory): reporting a storage failure
      // would invite a retry that can only be `expired` (settleAsPrincipal).
      await settleAsPrincipal(entry, built.batch.answers)
      return ACCEPTED
    },

    /** Revocation's and release's hand-over (routing retired the offer): the question stays in its card. */
    toUser: handOff,

    /**
     * Stops answering DSH, and every open question goes to its card alone, its timed-wait hold
     * released (the MCP endpoint is closing; V2's router did the same on unload).
     */
    close() {
      dispose?.()
      for (const id of [...live.keys()]) handOff(id)
    },
  })
}
