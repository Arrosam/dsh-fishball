/**
 * Group D on H-STUB: the question router (questions and plan reviews of managed sessions, the question
 * mode) and stop / redirect of managed sessions. The in-process Fishball session is gone (slim §12), so
 * Fishball's side of every case is the stub instance speaking contract 1.1: a question reaches it as the
 * `approval.request` event (kind `question`, contract §5.1) plus an `approval` inbox item, it answers with
 * `question.answer` (§4.2), it stops and redirects with `session.stop` / `session.redirect` (§4.1), and it
 * hears of answers and closures as `approval.settled` events and `QUESTION_ANSWER` / `CARD_CLOSED` /
 * `RECORD_ITEM` system inbox items (§4.5). The session's own question card is the worker's stand-in
 * (FBTEST_QUESTIONS=1), which stays open until a case answers it (`qAnswer`), discusses it (`qDiscuss`)
 * or its signal aborts. Expected values come from the docs, never from the connector's source.
 */
import assert from 'node:assert/strict'
import { APPROVAL_KIND, CARD_CLOSED, CARD_RECORD, DECISION, ERROR, EVENT, INBOX_KIND, LIMITS, QUESTION_ANSWER, RECORD_ITEM, SETTLED_BY } from 'fishball-connector/contract'
import { ASK_USER_QUESTION, PLAN, PRESET, ROW_ID } from './constants.mjs'
import { resultOfCall, settledIdle, step, storedRows } from './expect.mjs'
import { ENVELOPE, OPERATION, bootStub, managedSession, restartStub, userSession } from './instance-stub.mjs'
import { STUB } from './instance-stub-data.mjs'
import { planText } from './rev11g.mjs'
import { sleep, until } from './util.mjs'

export { A, Q, planText, resultText, tokens } from './rev11g.mjs'

/** The group's vocabulary and timings. */
export const QSTUB = Object.freeze({
  /** Worker env: the question-card stand-in; with `approver` also the scripted stock prompt after the broker and fbtest_ask. */
  env: Object.freeze({ FBTEST_QUESTIONS: '1' }),
  approverEnv: Object.freeze({ FBTEST_QUESTIONS: '1', FBTEST_APPROVER_AFTER: '1' }),
  /** The fishball-connector row fields this group sets through DSH's settings service (settingsSchema lists both). */
  field: Object.freeze({ mode: 'questionMode', seconds: 'approvalAnswerSeconds' }),
  /** The stand-in card's states (support/fixtures/fbtest-tools). */
  card: Object.freeze({ open: 'open', closed: 'closed', answered: 'answered' }),
  /** The worker's turn/end reason kinds. */
  turnEnd: Object.freeze({ aborted: 'aborted', completed: 'completed' }),
  /** DSH's agent status words. */
  agent: Object.freeze({ idle: 'idle', running: 'running' }),
  /** DSH's late-reply message source (a continued timed question answered in the session). */
  replySource: 'user-question-reply',
  /** A timed question's pending result (dsh-tool-ask-user). */
  pending: /"pending"\s*:\s*true/,
  /** An aborted question call's result (DSH's ASK_ABORTED wording). */
  aborted: /ASK_ABORTED|abort/i,
  /** The result DSH writes for a call a restart interrupted. */
  interrupted: /interrupted|unknown/i,
  /** A plan review kept planning with no feedback (DSH's plan-mode wording). */
  keepPlanning: /chose to keep planning/,
  feedbackWords: 'their feedback',
  /** planCommand's answer while plan mode is on / already off (DSH's plan-mode wording). */
  planOff: /Plan mode off\./,
  planInactive: /already inactive/i,
  /** Timings (ms). */
  quietMs: 1500,
  pollMs: STUB.pollMs,
  atOnceMs: 4000,
  offerWaitMs: 10000,
  cardWaitMs: 10000,
  resultWaitMs: 15000,
  markerWaitMs: 8000,
  restartCardWaitMs: 25000,
  /** Something that "is not before the limit": the earliest share of the limit at which the move may show. */
  limitEarlyShare: 0.8,
  limitSlackMs: 300,
  limitLateMs: 6000,
  secondMs: 1000,
  /** Contract codes (§7) and markers (§4.5), from the public contract module. */
  code: ERROR,
  decision: DECISION,
  by: SETTLED_BY,
  kind: APPROVAL_KIND,
  inbox: INBOX_KIND,
  event: EVENT,
  op: OPERATION,
  limits: LIMITS,
  marker: Object.freeze({ closed: CARD_CLOSED, answer: QUESTION_ANSWER, record: RECORD_ITEM }),
  record: CARD_RECORD,
  /** The text a held turn's model would answer: it must never be read once the turn is stopped. */
  neverText: 'never ',
  /** The question id at the head of a question notice (the connector's approval inbox item). */
  noticeId: /^\[question (qst_[^\]\s]+)\]/,
  /** The codes a batch or bound refusal of question.answer may carry (contract §4.2 bad-answer; §8 limit-exceeded). */
  fitCodes: Object.freeze([ERROR.badAnswer, ERROR.limit]),
  /** A question id no router ever minted. */
  unknownQuestionId: 'qst_0123456789abcdef',
  unknownSessionId: 'ses_fbtest_nothing',
  /** Codes a late answer to a question that already ended may carry (contract §4.2: `expired` or `already-settled`). */
  lateCodes: Object.freeze([ERROR.expired, ERROR.alreadySettled]),
  /** Decision rows (DESIGN §9 "Fishball's other decisions"). */
  decisionsTable: 'decisions',
  action: Object.freeze({ answer: 'answer-question', stop: 'stop', redirect: 'redirect' }),
  outcome: Object.freeze({ ok: 'ok', idle: 'idle' }),
})

/** Boot an H-STUB host for this group (stub attached); `approver` adds the scripted stock prompt and fbtest_ask. */
export async function bootQ(label, { approver = false } = {}) {
  return { booted: await bootStub(label, { env: approver ? QSTUB.approverEnv : QSTUB.env }), approver }
}

/** Restart DSH on the same home and attach the stub again; the helpers follow ctx.booted. */
export async function restartQ(ctx) {
  ctx.booted = await restartStub(ctx.booted, { env: ctx.approver ? QSTUB.approverEnv : QSTUB.env })
  return ctx
}

/** The user message that starts a raised turn: it is "your latest message in that session" the notice quotes. */
export const turnText = (tool, text) => tool + ' ' + text

/** True when a reply was not an acceptance: an error frame, or a frame that failed validation and closed the channel. */
export const refusedFrame = (r) => r?.type !== ENVELOPE.type.response
/** True when the connector closed the channel instead of answering (contract §3.1). */
export const closedChannel = (r) => r?.type === 'none' && r.code === STUB.noReply.closed
/** The error code of a refusal, or the channel-closed marker. */
export const codeOf = (r) => (r?.type === ENVELOPE.type.error ? r.payload?.code : r?.code)

/** The helpers bound to one ctx ({booted}); host and stub are read at call time, so a restart is followed. */
export function qTools(ctx) {
  const host = () => ctx.booted.host
  const stub = () => ctx.booted.stub
  const q = {
    host, stub,
    home: () => ctx.booted.home,
    /** A managed session (handed over) after one plain turn. */
    session: (folder, preset = PRESET.ask) => managedSession(host(), folder, preset),
    /** A session that is yours (never handed over). */
    yours: (folder, preset = PRESET.ask) => userSession(host(), folder, preset),
    fishballId: async () => (await host().state()).sessionId,
    /** Change connector settings through DSH's settings service (DSH's form of the fishball-connector row). */
    async settings(patch) { const r = await host().call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)); return r },
    setSeconds: (seconds) => q.settings({ [QSTUB.field.seconds]: seconds }),
    setMode: (mode) => q.settings({ [QSTUB.field.mode]: mode }),
    /** The session's own question cards (stand-in), oldest first. */
    cards: (sid) => host().call('qCards', { sessionId: sid }),
    cardCount: async () => (await host().call('qCards', {})).length,
    async cardState(sid, index) { return (await q.cards(sid)).find((c) => c.index === index)?.state },
    /** Make the session idle before a case starts a turn: a case that failed halfway must not hold the next one up. */
    async free(sid) {
      if ((await host().call('agentStatus', { sessionId: sid })) !== QSTUB.agent.idle) { await host().call('cancel', { sessionId: sid }); await host().call('waitIdle', { sessionId: sid }).catch(() => {}) }
      await settledIdle(host(), sid)
    },
    /** The newest stand-in card of the session opened after `after` cards existed. */
    ownCard: (sid, after) => until(async () => (await q.cards(sid)).filter((c) => c.index >= after).at(-1) ?? false, QSTUB.cardWaitMs, STUB.pollMs),
    /** The approval.request event (kind question) for the call id, or undefined. */
    async offer(callId, timeoutMs = QSTUB.offerWaitMs) { return (await stub().waitEvent(EVENT.approvalRequest, (p) => p.callId === callId, { timeoutMs }))?.payload },
    /**
     * Start a turn in sid whose model calls `tool` once (then `after` steps and a closing text); wait for the
     * session's own card and (when the session is managed) the instance's offer. Returns {card, offer}.
     */
    async raise(sid, text, id, tool, args, { after = [], offer = true } = {}) {
      await q.free(sid)
      const first = await q.cardCount()
      await host().call('driveStart', { sessionId: sid, text: turnText(tool, text), script: [step(tool, args, id), ...after, [{ text: 'done' }]] })
      const card = await q.ownCard(sid, first)
      assert.ok(card, 'the session\'s own card opened for ' + text)
      return { card, offer: offer ? await q.offer(id) : undefined }
    },
    /** ask_user_question with these questions (default Q.single-style one question). */
    ask: (sid, text, id, { questions, timeout, after, offer } = {}) => q.raise(sid, text, id, ASK_USER_QUESTION, { questions, ...(timeout === undefined ? {} : { timeout }) }, { after, offer }),
    /** Plan mode on (/plan), then exit_plan_mode presenting a plan. */
    async plan(sid, text, id, { offer } = {}) {
      await q.free(sid)
      const on = await host().call('planCommand', { sessionId: sid })
      assert.equal(on.kind, 'success', 'plan mode on: ' + JSON.stringify(on))
      const r = await q.raise(sid, text, id, PLAN.exit, { plan: planText(text) }, { offer })
      assert.ok(r.card.planReview, 'a plan-review card: ' + JSON.stringify(r.card))
      return r
    },
    /** The question ids approval.list holds for a session (contract §4.2). */
    listed: async (sid) => (await stub().op(OPERATION.approvalList, { sessionId: sid }, sid)).payload?.approvals?.map((d) => d.approvalId) ?? [],
    planOff: async (sid) => (await host().call('planCommand', { sessionId: sid, off: true })).text,
    /** The instance's question.answer for the session's question (scoped, contract §4.2). */
    answer: (sid, questionId, rest) => stub().op(OPERATION.questionAnswer, { sessionId: sid, questionId, ...rest }, sid),
    /** Attach again when the connector closed the channel (a frame that failed validation). */
    async reattachIfClosed() {
      if (!(await stub().transportCalls()).closedByConnector) return false
      const a = await stub().attach()
      assert.ok(a.ok && a.handshake?.type === ENVELOPE.type.response, 'reattach: ' + JSON.stringify(a))
      return true
    },
    /** The approval.settled event of one question (optionally with this decision / by), or undefined. */
    async settled(approvalId, { decision, by, timeoutMs = QSTUB.markerWaitMs } = {}) {
      return (await stub().waitEvent(EVENT.approvalSettled, (p) => p.approvalId === approvalId && (!decision || p.decision === decision) && (!by || p.by === by), { timeoutMs }))?.payload
    },
    /** Settled events of a question so far. */
    async settledNow(approvalId) { return (await stub().events(EVENT.approvalSettled)).map((f) => f.payload).filter((p) => p.approvalId === approvalId) },
    /** System inbox items of one marker kind for this card id (contract §4.5). */
    async markers(kind, cardId) {
      const pattern = QSTUB.marker[kind].pattern
      return (await stub().pushes()).map((f) => f.payload).filter((p) => {
        const m = pattern.exec(p.text)
        if (!m) return false
        if (kind !== 'record') return m[1] === cardId
        try { return JSON.parse(m[1]).cardId === cardId } catch { return false }
      })
    },
    waitMarker: (kind, cardId, timeoutMs = QSTUB.markerWaitMs) => until(async () => (await q.markers(kind, cardId))[0] ?? false, timeoutMs, STUB.pollMs),
    /** Every parsed card record (RECORD_ITEM) received so far. */
    async records() {
      return (await stub().pushes()).map((f) => QSTUB.marker.record.pattern.exec(f.payload.text)?.[1]).filter(Boolean).map((json) => { try { return JSON.parse(json) } catch { return null } }).filter(Boolean)
    },
    /** The newest card record about a session (its `from.sessionId`), waiting for it; or undefined. */
    recordFrom: (sid, timeoutMs = QSTUB.markerWaitMs) => until(async () => (await q.records()).filter((r) => r.from?.sessionId === sid).at(-1) ?? false, timeoutMs, STUB.pollMs).then((r) => r || undefined),
    /** The parsed card record (RECORD_ITEM) for this card id, or undefined. */
    async record(cardId, timeoutMs) { const p = await q.waitMarker('record', cardId, timeoutMs); return p ? JSON.parse(QSTUB.marker.record.pattern.exec(p.text)[1]) : undefined },
    /** The approval inbox items (notices) whose text contains needle. */
    notices: async (needle) => (await stub().pushes()).map((f) => f.payload).filter((p) => p.kind === INBOX_KIND.approval && p.text.includes(needle)),
    /**
     * The first notice containing needle, waiting for it; or undefined. The notice is its own inbox.push, sent apart
     * from the approval.request offer, so it can arrive after the offer (a one-shot read raced it on 0.2.2-rc.1).
     */
    noticeOf: (needle, timeoutMs = QSTUB.markerWaitMs) => until(async () => (await q.notices(needle))[0] ?? false, timeoutMs, STUB.pollMs).then((n) => n || undefined),
    /**
     * The question id the instance learned for a call: from its offer, else from its approval notice (in User mode
     * the question is never the instance's to answer, so no offer may come, but the notice names it for a note).
     */
    async learnedId(text, callId) {
      const offered = (await q.offer(callId, QSTUB.quietMs))?.approvalId
      if (offered) return offered
      const notice = await q.noticeOf(text)
      return QSTUB.noticeId.exec(notice?.text ?? '')?.[1]
    },
    /** Everything the instance received about sessions so far: offers and approval notices (for "Fishball was not told"). */
    async toldAbout(needle) { return JSON.stringify((await stub().received()).filter((f) => f.operation === EVENT.approvalRequest || f.operation === OPERATION.inboxPush)).includes(needle) },
    events: async (sid) => (await host().call('inspect', { sessionId: sid, events: true })).events ?? [],
    /** The call's result event now, or undefined while the call waits. */
    async resultNow(sid, id) { return (await q.events(sid)).find((e) => e.type === 'tool/result' && e.result.callId === id)?.result },
    async waiting(sid, id) { return (await q.resultNow(sid, id)) === undefined },
    result: (sid, id, timeoutMs = QSTUB.resultWaitMs) => resultOfCall(host(), sid, id, timeoutMs),
    replies: async (sid, callId) => (await q.events(sid)).filter((e) => e.type === 'user/message' && e.source?.kind === QSTUB.replySource && (!callId || e.source.callId === callId)),
    turnEnds: (sid) => host().call('turnEnds', { sessionId: sid }),
    status: (sid) => host().call('agentStatus', { sessionId: sid }),
    idle: (sid) => until(async () => (await q.status(sid)) === QSTUB.agent.idle, QSTUB.resultWaitMs, STUB.pollMs),
    waitIdle: (sid) => host().call('waitIdle', { sessionId: sid }),
    /** Your Stop button in the session. */
    async userStop(sid) { await host().call('cancel', { sessionId: sid }); await host().call('waitIdle', { sessionId: sid }).catch(() => {}); await settledIdle(host(), sid) },
    /** Your answer in the session's own card (the newest open one). */
    qAnswer: (sid, answers) => host().call('qAnswer', { sessionId: sid, answers }),
    qDiscuss: (sid) => host().call('qDiscuss', { sessionId: sid }),
    /** The stored decision rows, optionally for one target or session and action. */
    decisions: ({ target, sessionId, action } = {}) => storedRows(q.home(), QSTUB.decisionsTable).filter((d) => (!target || d.target === target) && (!sessionId || d.sessionId === sessionId) && (!action || d.action === action)),
    rowConfig: () => host().call('settingsOf', { ns: ROW_ID }),
    /** The instance's session operations (contract §4.1), scoped to the session. */
    stop: (sid, extra = {}) => stub().op(OPERATION.sessionStop, { sessionId: sid, ...extra }, sid),
    redirect: (sid, message) => stub().op(OPERATION.sessionRedirect, { sessionId: sid, message, attachments: [] }, sid),
    message: (sid, message) => stub().op(OPERATION.sessionMessage, { sessionId: sid, message, attachments: [] }, sid),
    /** How many of the session's model requests carry needle (did the model read it?). */
    modelSaw: async (sid, needle) => (await host().call('requestsContaining', { needle })).filter((r) => r.sessionId === sid).length,
    /** A session's turn running and held at its first model request (released with release). */
    async running(sid, label) {
      await q.free(sid)
      await host().call('holdNext', { sessionId: sid })
      await host().call('driveStart', { sessionId: sid, text: 'work ' + label, script: [[{ text: QSTUB.neverText + label }]] })
      assert.ok(await until(() => host().call('isHeld', { sessionId: sid }), QSTUB.cardWaitMs, STUB.pollMs), 'the turn is running, held at the model')
      return sid
    },
    release: (sid) => host().call('releaseHold', { sessionId: sid }).catch(() => false),
    userLog: async (sid) => (await host().call('userMessages', { sessionId: sid })) ?? [],
    isManaged: async (sid) => ((await host().state())?.managed ?? []).some((m) => m.sessionId === sid),
  }
  return q
}

/** Assert a question offer is still the instance's to answer: the own card is open and the agent waits. */
export async function assertStillOpen(q, sid, card, callId, label) {
  assert.equal(await q.cardState(sid, card.index), QSTUB.card.open, label + ': the session\'s own card stays open')
  assert.equal(await q.waiting(sid, callId), true, label + ': the agent still waits')
}

/**
 * A payload the instance must not get accepted. Two kinds (contract §3.1, §4.2, §8):
 * - `fit` (default): a rule of §4.2's answers or a §8 bound, for which the contract names the refusal
 *   (`bad-answer`, "a batch that does not fit", slim §5.2; `limit-exceeded` or the named code, §8). It comes back
 *   as an ordinary error frame with the channel open, so the instance can correct itself and the question stays its own.
 * - `shape`: a break of the frame's own types or key rules. A `question.answer` whose payload breaks any rule is
 *   answered the same way — an `error` frame (`limit-exceeded` or `invalid-envelope`) and the channel stays open
 *   (contract §3.1) — so the instance can correct it; the old close-the-channel reading is gone.
 * Either way the question stays open in its session and the agent waits. The stub is re-attached when the connector
 * closed the channel, before any assertion, so one failure does not break the cases after it. Returns the reply.
 */
export async function refuseShape(q, sid, { card, offer }, callId, label, rest, kind = REFUSAL.fit) {
  const r = await q.answer(sid, offer.approvalId, rest)
  const reattached = await q.reattachIfClosed()
  assert.equal(refusedFrame(r), true, label + ': ' + JSON.stringify(r))
  if (kind === REFUSAL.fit) {
    assert.equal(reattached, false, label + ': the connector closed the channel instead of refusing with an error frame')
    assert.ok(QSTUB.fitCodes.includes(codeOf(r)), label + ': an error frame with ' + QSTUB.fitCodes.join(' or ') + ': ' + JSON.stringify(r))
  } else {
    assert.equal(reattached, false, label + ': the connector closed the channel instead of refusing with an error frame')
    assert.ok([...QSTUB.fitCodes, ERROR.invalid].includes(codeOf(r)), label + ': an error frame with ' + [...QSTUB.fitCodes, ERROR.invalid].join(' or ') + ': ' + JSON.stringify(r))
  }
  await assertStillOpen(q, sid, card, callId, label)
  return r
}
/** The two refusal kinds of refuseShape. */
export const REFUSAL = Object.freeze({ fit: 'fit', shape: 'shape' })

/** Wait a quiet period (something must NOT happen in it). */
export const quiet = (ms = QSTUB.quietMs) => sleep(ms)
export { sleep, until }
