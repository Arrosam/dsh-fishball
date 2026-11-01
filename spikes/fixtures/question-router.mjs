/**
 * Spike fixture (S36): the candidate QuestionRouter for revision 11 items 25-26.
 *
 * One host-level `user-questions/request` waterfall listener, prepended so it runs before
 * dsh-api-remotes' browser forwarder (the same position as the ApprovalBroker, spike S12).
 * For a managed session's question it keeps BOTH answer places open and lets the first win:
 * - it swaps the request's `signal` for one it can also abort, then calls `next()` at once, so
 *   the session's own question card is shown as today;
 * - Fishball (here: the spike script) may answer with `answer(id, batch)`.
 * Fishball first: the router aborts its signal, DSH's gateway sends `cancel` to every browser
 * (the card closes) and the router returns Fishball's batch as the waterfall result.
 * Session first: `next()` resolves with the browser's batch; the router records it and refuses
 * Fishball's later answer.
 *
 * Why the signal swap works: Cordis' waterfall passes the same argument array to every listener
 * and `next()` takes no arguments (cordis/lib/index.js `waterfall`), and the gateway reads
 * `request.signal` only when the forwarded event starts (dsh-api-gateway `startRemoteEvent`).
 * The request must stay plain JSON apart from `agent` and `signal`, or the gateway refuses it.
 *
 * Timed questions (`mode: timed`) that end pending become `continued`: they are answered through
 * `ctx.userQuestions.answer(agent, callId, batch)`, the same method the browser's RPC calls,
 * which steers a `user-question-reply` message. The user's own late reply is learnt from the
 * `user/message` session event that admits it.
 */
export const ROUTER = Object.freeze({
  event: 'user-questions/request',
  replySource: 'user-question-reply',
  userMessageEvent: 'user/message',
  planReview: 'plan-review',
  timedOut: 'ASK_TIMED_OUT',
  projection: 'userQuestions',
  continued: 'continued',
  idPrefix: 'qst_',
})

/**
 * How the router holds a timed question's foreground wait (spike S36-attachWait).
 * - claim: attach with `userQuestions.attachWait` only (DESIGN.md §7a.10 as written). The host's
 *   own timer stops while any claim stands, but the session's card claims too and runs its own
 *   countdown from the same `remainingMs`, rejecting ASK_TIMED_OUT at the tool's timeout.
 * - claimUntimed: the same claim, and the request is forwarded down the waterfall without
 *   `wait.timed`, so the card shows as a blocking card (no claim, no countdown) and stays
 *   answerable until Fishball or the user answers.
 */
export const HOLD = Object.freeze({ claim: 'claim', claimUntimed: 'claim-untimed' })

export const STATE = Object.freeze({ open: 'open', continued: 'continued', answered: 'answered', closed: 'closed' })
export const BY = Object.freeze({ fishball: 'fishball', user: 'user' })
export const REFUSAL = Object.freeze({ unknown: 'unknown-question', settled: 'already-settled', badAnswer: 'bad-answer', notLive: 'session-not-live' })

/** The rejection the gateway passes to the browser when Fishball answered first. */
const answeredElsewhere = () => Object.assign(new Error('answered by Fishball'), { name: 'UserQuestionError', code: 'ASK_ABORTED' })

/**
 * Check a batch against the questions it answers, by the rules DSH's own UI follows
 * (dsh-client-ui-user-questions `submitDrafts`, dsh-user-questions `answer`): one item per
 * question id; selected labels are offered options; a single-select item has at most one label,
 * and none when it carries custom text.
 * @returns undefined when valid, otherwise a reason.
 */
export function invalidAnswer(questions, batch) {
  const items = batch?.answers
  if (!Array.isArray(items) || items.length !== questions.length) return 'one item per question'
  const ids = new Set(items.map((item) => item.id))
  if (ids.size !== items.length || !questions.every((q) => ids.has(q.id))) return 'each question id exactly once'
  for (const item of items) {
    const question = questions.find((q) => q.id === item.id)
    const labels = new Set((question.options ?? []).map((o) => o.label))
    if (!Array.isArray(item.selected) || !item.selected.every((label) => labels.has(label))) return `${item.id}: selected must be offered labels`
    if (item.custom !== undefined && (typeof item.custom !== 'string' || item.custom.trim() === '')) return `${item.id}: custom must be non-empty text`
    if (question.multiSelect !== true && item.selected.length > (item.custom === undefined ? 1 : 0)) return `${item.id}: single-select takes one label, or custom text alone`
  }
  return undefined
}

/**
 * Build Fishball's batch from its choices, in the shape DSH's browser sends.
 * @param choices - { [questionId]: { selected?: string[], custom?: string } }; missing = skipped.
 */
export function composeAnswer(questions, choices) {
  return {
    answers: questions.map((question) => {
      const choice = choices[question.id] ?? {}
      const custom = (choice.custom ?? '').trim()
      // Single-select: custom text replaces the choice (README of dsh-user-questions).
      const selected = custom === '' || question.multiSelect === true ? [...(choice.selected ?? [])] : []
      return { id: question.id, selected, ...(custom === '' ? {} : { custom }) }
    }),
  }
}

/** Fishball's plan-review decision: approve, or keep planning with optional feedback. */
export function planDecision(question, { approve, feedback = '' }) {
  if (approve) return { answers: [{ id: question.id, selected: [question.intent.approve] }] }
  const decline = (question.options ?? []).find((o) => o.label !== question.intent.approve)?.label
  const text = feedback.trim()
  return { answers: [{ id: question.id, selected: text === '' && decline !== undefined ? [decline] : [], ...(text === '' ? {} : { custom: text }) }] }
}

export const isPlanReview = (questions) => questions.length === 1 && questions[0].intent?.kind === ROUTER.planReview

/**
 * The call id of a blocking question. Legacy `ask_user_question` (the shipped default) sends no
 * `wait`, so its request names no call. The asking call is the session's `ask_user_question`
 * `tool/call` that has no `tool/result` yet; with parallel calls more than one can be open, and
 * then the one whose arguments match the request's questions is taken.
 * @returns { callId, open } where open counts the unresolved candidates.
 */
export function callIdFromLog(session, questions) {
  const open = new Map()
  for (const event of session.snapshotEvents()) {
    if (event.type === 'tool/call' && event.data.name === 'ask_user_question') open.set(event.data.callId, event.data.arguments)
    else if (event.type === 'tool/result') open.delete(event.data.message?.toolCallId)
  }
  const ids = new Set(questions.map((q) => q.id).sort())
  const match = [...open].reverse().find(([, args]) => {
    try { return isSameIds(JSON.parse(args).questions.map((q) => q.id), ids) } catch { return false }
  })
  return { callId: match?.[0], open: open.size }
}
const isSameIds = (list, ids) => list.length === ids.size && list.every((id) => ids.has(id))

export class QuestionRouter {
  #ctx
  #isManaged
  #resolveAgent
  #onChange
  #holdTimed
  #seq = 0
  /** id -> entry */
  entries = new Map()
  /** Every request the listener saw: { sessionId, managed }. */
  seen = []

  /**
   * @param ctx - host-level row context (userQuestions, sessionProjections).
   * @param options.isManaged(sessionId) - whether Fishball manages that session.
   * @param options.resolveAgent(sessionId) - live root agent (resumes a closed session).
   * @param options.onChange(entry, what) - the pile's hook (here: evidence).
   * @param options.holdTimed(sessionId) - a HOLD mode for that session's timed questions, or undefined.
   */
  constructor(ctx, { isManaged, resolveAgent, onChange = () => {}, holdTimed = () => undefined }) {
    this.#ctx = ctx
    this.#isManaged = isManaged
    this.#resolveAgent = resolveAgent
    this.#onChange = onChange
    this.#holdTimed = holdTimed
    ctx.on(ROUTER.event, (request, next) => this.#route(request, next), { prepend: true })
    ctx.on('session/event', (session, event) => this.#onSessionEvent(session, event), { global: true })
  }

  #mint(agent, fields) {
    const entry = { id: ROUTER.idPrefix + String(++this.#seq), sessionId: agent.id, history: [], ...fields }
    this.entries.set(entry.id, entry)
    return entry
  }

  #set(entry, state, what, extra = {}) {
    Object.assign(entry, { state }, extra)
    entry.history.push(what)
    this.#onChange(entry, what)
  }

  async #route(request, next) {
    const agent = request.agent
    const managed = agent !== undefined && this.#isManaged(agent.id)
    this.seen.push({ sessionId: agent?.id, managed })
    if (!managed) return next()
    const named = request.wait?.callId ?? request.questions[0]?.intent?.callId
    const fromLog = named === undefined ? callIdFromLog(agent.session, request.questions) : undefined
    const foreground = Promise.withResolvers()
    const entry = this.#mint(agent, {
      callId: named ?? fromLog.callId,
      callIdFrom: named !== undefined ? 'request' : 'log',
      ...(fromLog === undefined ? {} : { openCallsInLog: fromLog.open }),
      timed: request.wait?.timed === true,
      kind: isPlanReview(request.questions) ? ROUTER.planReview : 'question',
      questions: request.questions,
      answerForeground: foreground.resolve,
      foreground: foreground.promise,
    })
    this.#set(entry, STATE.open, 'opened')
    const own = new AbortController()
    const original = request.signal
    request.signal = original === undefined ? own.signal : AbortSignal.any([original, own.signal])
    const hold = entry.timed ? this.#holdTimed(agent.id) : undefined
    if (hold !== undefined) await this.#claim(agent, entry, request, hold)
    try {
      return await this.#race(entry, request, next, own, original)
    } finally {
      entry.claim?.abort()
    }
  }

  /**
   * Hold the timed wait for Fishball. The claim is taken before `next()`, so the host timer is off
   * before any card sees the request; it is released when the waterfall settles or `releaseHold` runs.
   */
  async #claim(agent, entry, request, hold) {
    entry.claim = new AbortController()
    const frames = this.#ctx.userQuestions.attachWait(agent, entry.callId, entry.claim.signal)[Symbol.asyncIterator]()
    const opening = await frames.next()
    entry.hold = { mode: hold, claimed: opening.done !== true, remainingMsAtClaim: opening.value?.remainingMs }
    // The second `next()` settles when the claim ends (released, or the wait closed).
    entry.claimEnded = frames.next().then(() => Date.now(), () => Date.now())
    if (hold === HOLD.claimUntimed) request.wait = { ...request.wait, timed: false }
    this.#set(entry, entry.state, 'held:' + hold)
  }

  /** Give up Fishball's claim (Fishball turned off): the host timer runs again. */
  releaseHold(id) { this.entries.get(id)?.claim?.abort() }

  async #race(entry, request, next, own, original) {
    const session = Promise.resolve().then(next).then((value) => ({ value }), (error) => ({ error }))
    const first = await Promise.race([entry.foreground.then((value) => ({ fishball: value })), session])
    if (first.fishball !== undefined) {
      own.abort(answeredElsewhere())
      return first.fishball
    }
    if (first.error === undefined) {
      if (entry.state === STATE.open) this.#set(entry, STATE.answered, 'answered-in-session', { by: BY.user, answer: first.value })
      return first.value
    }
    // The browser's countdown, the host's unattended timer, a stopped turn or "Discuss".
    const code = first.error?.code ?? (original?.aborted ? original.reason?.code : undefined)
    if (entry.timed && code === ROUTER.timedOut) this.#set(entry, STATE.continued, 'continued')
    else if (entry.state === STATE.open) this.#set(entry, STATE.closed, 'closed:' + (code ?? 'error'), { error: String(first.error?.message ?? first.error) })
    throw first.error
  }

  /** Fishball's answer (the build's answer_question tool). First answer wins. */
  async answer(id, batch) {
    const entry = this.entries.get(id)
    if (entry === undefined) return { ok: false, code: REFUSAL.unknown }
    if (entry.state !== STATE.open && entry.state !== STATE.continued) return { ok: false, code: REFUSAL.settled, state: entry.state, by: entry.by }
    const reason = invalidAnswer(entry.questions, batch)
    if (reason !== undefined) return { ok: false, code: REFUSAL.badAnswer, reason }
    if (entry.state === STATE.open) {
      this.#set(entry, STATE.answered, 'answered-by-fishball', { by: BY.fishball, answer: batch })
      entry.answerForeground(batch)
      return { ok: true, path: 'waterfall' }
    }
    // Continued: the same call the browser's `answer` RPC makes.
    const agent = await this.#resolveAgent(entry.sessionId)
    if (agent === undefined) return { ok: false, code: REFUSAL.notLive }
    entry.sending = true
    try {
      const accepted = this.#ctx.userQuestions.answer(agent, entry.callId, batch)
      if (!accepted) return { ok: false, code: REFUSAL.settled, state: entry.state, by: entry.by }
      this.#set(entry, STATE.answered, 'answered-by-fishball', { by: BY.fishball, answer: batch })
      return { ok: true, path: 'reply' }
    } catch (error) {
      return { ok: false, code: error?.code === 'REPLY_QUEUED' ? REFUSAL.settled : String(error?.code ?? error), reason: String(error?.message ?? error) }
    } finally {
      entry.sending = false
    }
  }

  /** A late reply admitted into a session: the user's, unless Fishball is the one sending it. */
  #onSessionEvent(session, event) {
    if (event.type !== ROUTER.userMessageEvent || event.data?.source?.kind !== ROUTER.replySource) return
    const callId = event.data.source.callId
    for (const entry of this.entries.values()) {
      if (entry.callId !== callId || entry.state !== STATE.continued || entry.sending) continue
      let answer
      try { answer = { answers: JSON.parse(event.data.content[0].text).answers } } catch { answer = undefined }
      this.#set(entry, STATE.answered, 'answered-in-session', { by: BY.user, answer })
    }
  }

  /** After a restart: rebuild entries from the projection's continued questions. */
  recover(agent) {
    const state = this.#ctx.get('sessionProjections')?.stateOf(agent.session, ROUTER.projection)
    const found = []
    for (const row of state?.questions.active ?? []) {
      if (row.state !== ROUTER.continued) continue
      const entry = this.#mint(agent, { callId: row.callId, timed: true, kind: isPlanReview(row.questions) ? ROUTER.planReview : 'question', questions: row.questions })
      this.#set(entry, STATE.continued, 'recovered')
      found.push(entry)
    }
    return found
  }
}
