/**
 * The managed-request lifecycle fix (requirements R1…R8, relayed by the lead 2026-11-21; the K1
 * contract half R9 is in contract/k1-mcp-schema/k1c-cases.mjs):
 * - R1 / R3 a question's or plan review's toUser hands it to the user without settling it: still the
 *   principal's under the same offer id, its card open; the principal's later answer or the user's
 *   card answer decides it; a second toUser is refused;
 * - R2 a permission request's escalate likewise: the stock prompt shows, the request stays listed;
 *   the principal's later allow / reject or the user's click decides it; a second escalate is refused;
 * - R4 an asking call ended by its own run_code program (the program's deadline, or the program
 *   finishing with the ask unawaited) keeps the question open: one notice question-call-ended, no
 *   retirement; the principal's later answer is delivered into the session as a message;
 * - R5 the user's own Stop or dismissal still withdraws the question (the lead, 2026-11-21: "the
 *   user's Stop, session_stop and session_redirect are deliberate turn ends and keep the OLD behaviour");
 * - R6 release, Take back and revocation retire a handed-off request like any live offer;
 * - R7 no timer settles a handed-off request; R8 a delegate's pass still reaches the manager.
 * Written from the requirements only; no connector module is read. Techniques: UC, EP, DT, ST.
 */
import assert from 'node:assert/strict'
import {
  EVENT_TYPE, FIXTURE, IX, LIFECYCLE as L, RELAYED, REFUSAL, RETIREMENT_REASON, RISK, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL, WORLD,
} from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import {
  A, answer, asked, batchOf, call, cardOf, decided, eventually, jsonOf, listed, managed, ofType, okCall, pending, planned, principal, qAnswer,
  questioned, quiet, reconnect, resultOf, resultsOf, retirement, retirementsOf, setEnabled, settlement, settlementsOf, step, stockFor, takeBack,
  tok, turn, untilStock, userClicks, waitEvents, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'

const ASK = IX.preset.ask
const accepted = { ok: true, accepted: true }
const ANSWER = FIXTURE.answer
const lateCodes = [REFUSAL.expired, REFUSAL.alreadySettled]

/** A refused reply, with one of `codes` when given. */
function assertRefused(reply, codes) {
  assert.equal(reply.ok, false, 'accepted: ' + JSON.stringify(reply))
  if (codes) assert.ok(codes.includes(reply.code), 'code ' + reply.code + ', wanted one of ' + codes)
}
/** Still the principal's: approvals_list lists it under the same offer id. */
async function assertStillOffered(p, r) {
  const entry = (await listed(p, r.sid)).find((x) => x.approvalId === r.d.approvalId)
  assert.ok(entry, 'no longer listed')
  assert.equal(entry.offerId, r.offer.offerId, 'the offer id changed')
}
const noticesFor = (events, r) => ofType(events, EVENT_TYPE.notice).filter((e) => e.correlationId === r.offer.offerId)
const withdrawalsOf = (events, r) => retirementsOf(events, r.event.eventId).filter((e) => e.payload.reason === RETIREMENT_REASON.withdrawn)
/** Every stock prompt shown for the call is closed (its signal aborted). */
const promptClosed = (w, text) => eventually(async () => (await stockFor(w, text)).every((s) => s.closed))

/** The retirement of `r` with `reason`; a revoked principal is re-enabled and reads it through a new client (as APR-15r). */
async function assertRetired(t, w, p, r, reason) {
  const revoked = reason === RETIREMENT_REASON.revoked
  if (revoked) await setEnabled(w, p, true)
  const reader = revoked ? await reconnect(t, w, p) : p
  if (revoked) assert.ok(await eventually(async () => (await call(reader.client, TOOL.inboxPoll, {})).ok), 'the re-enabled box stayed held')
  assert.equal((await retirement(reader.client, r.event)).payload.reason, reason)
}
/** The user's own end of a question (R5): one retirement {withdrawn}, no notice, a late answer refused. */
async function assertWithdrawnNoNotice(p, r, late) {
  assert.equal((await retirement(p.client, r.event)).payload.reason, RETIREMENT_REASON.withdrawn)
  await quiet()
  const events = await pending(p.client)
  assert.equal(withdrawalsOf(events, r).length, 1, 'not exactly one withdrawal')
  assert.deepEqual(noticesFor(events, r), [], 'a deliberate end produced a question-call-ended notice')
  assertRefused(await qAnswer(p, r, late))
}

/**
 * The two kinds of request a principal hands to the user, each with the same steps:
 * `open` (a managed session asks), `handOff` (toUser / escalate, returning the reply),
 * `byUser` (the user decides in the session's own card / stock prompt) and `byPrincipal`
 * (the principal's later answer decides the call).
 */
const KINDS = Object.freeze({
  question: Object.freeze({
    open: async (w, p) => questioned(w, p, await managed(w, p, ASK)),
    handOff: (w, p, r) => qAnswer(p, r, { toUser: true, note: tok('note') }),
    async byUser(w, r) {
      assert.equal(await w.call('cardAnswer', { sessionId: r.sid, answers: ANSWER.red }), true, 'the card was not open')
      assert.deepEqual(batchOf(await resultOf(w, r.sid, r.id)), ANSWER.red)
    },
    async byPrincipal(w, p, r) {
      assert.deepEqual(await qAnswer(p, r, { answers: ANSWER.blue }), accepted)
      assert.deepEqual(batchOf(await resultOf(w, r.sid, r.id)), ANSWER.blue)
    },
  }),
  permission: Object.freeze({
    open: async (w, p) => asked(w, p, await managed(w, p)),
    async handOff(w, p, r) {
      const reply = await answer(p, r, A.escalate())
      await untilStock(w, r.text)
      return reply
    },
    async byUser(w, r) {
      await userClicks(w, r.text, IX.outcome.allowed)
      assert.equal((await decided(w, r.text)).outcome, IX.outcome.allowed)
    },
    async byPrincipal(w, p, r) {
      assert.deepEqual(await answer(p, r, A.allow()), accepted)
      assert.equal((await decided(w, r.text)).outcome, IX.outcome.allowed)
    },
  }),
})
/** The ends of management (R6): label, the end, the retirement reason. */
const ENDS = Object.freeze([
  ['session_release', (w, p, sid) => okCall(p.client, TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason }), RETIREMENT_REASON.released],
  ['Take back', (w, p, sid) => takeBack(w, sid), RETIREMENT_REASON.released],
  ['the principal\'s entry disabled', (w, p) => setEnabled(w, p, false), RETIREMENT_REASON.revoked],
])

// ------------------------------------------------------------------------------------------------ run_code (R4)

/** A managed ask session in the PTC world with run_code offered, or null where the SDK offers none. */
async function ptcSession(t, sdk) {
  const w = await world(sdk, WORLD.scenario.ptc, IX.dsh.ptcEnv)
  const p = await principal(t, w)
  const sid = await managed(w, p, ASK)
  await turn(w, sid, [[{ text: tok('warm') }]])
  if (!(await w.call('requestTools', { sessionId: sid })).at(-1).map((x) => x.name).includes(IX.dsh.runCode)) return null
  await w.call('setSandbox', { sessionId: sid, mode: IX.dsh.fullAccess })
  return { w, p, sid }
}
const askCall = (args) => 'tools.' + IX.dsh.askTool + '(' + JSON.stringify(args) + ')'
/** A model step whose run_code program asks; `body(ask)` is the program around the ask expression. */
const inProgram = (body, controls = {}) => (args, id) => step(IX.dsh.runCode, { code: body(askCall(args)), description: tok('ptc'), ...controls }, id)
/** The ways a program ends its own ask call while its turn goes on (the lead, 2026-11-21). */
const PROGRAM_ENDS = Object.freeze([
  ['its timeoutMs deadline while awaiting the ask', inProgram((ask) => 'await ' + ask, { timeoutMs: L.deadlineMs })],
  ['it finishes with the ask unawaited', inProgram((ask) => ask + '.catch(() => {}); await new Promise((r) => setTimeout(r, ' + L.unawaitedMs + '))')],
])
/** The connector's message carrying the principal's answer to an ended question (R4). */
async function deliveredAnswer(w, sid) {
  let found
  const ok = await eventually(async () => {
    found = (await w.call('events', { sessionId: sid })).filter((e) => e.type === IX.dsh.userMessage).map(jsonOf).find((j) => j?.kind === L.endedAnswerKind)
    return found
  })
  assert.ok(ok, 'no ' + L.endedAnswerKind + ' message reached the session')
  return found
}

export function registerLifecycleCases(sdk) {
  const asking = async (t, kind) => { const w = await world(sdk); const p = await principal(t, w); return { w, p, r: await KINDS[kind].open(w, p) } }

  // ------------------------------------------------------------------------- R1 / R3: toUser
  row(sdk, L.id.toUser, 'ST (question: Open → toUser → toUser again → the principal answers → answers again)', `{accepted: true}; still listed under the same offerId; the card stays open; a second toUser → ${REFUSAL.expired}; the later answer is accepted and is the call's result; the card closes; a further answer → ${REFUSAL.alreadySettled}`, async (t) => {
    const { w, p, r } = await asking(t, 'question')
    assert.deepEqual(await KINDS.question.handOff(w, p, r), accepted)
    await assertStillOffered(p, r)
    assert.equal((await cardOf(w, r)).state, IX.card.open, 'toUser closed the card')
    assert.deepEqual(await resultsOf(w, r.sid, r.id), [], 'toUser ended the call')
    assertRefused(await KINDS.question.handOff(w, p, r), [REFUSAL.expired])
    await assertStillOffered(p, r)
    await KINDS.question.byPrincipal(w, p, r)
    assert.ok(await eventually(async () => (await cardOf(w, r)).state !== IX.card.open), 'the card stayed open')
    assertRefused(await qAnswer(p, r, { answers: ANSWER.red }), [REFUSAL.alreadySettled])
  })
  row(sdk, L.id.toUser, 'ST (plan review: Open → toUser → the principal approves)', '{accepted: true}; still listed under the same offerId; the card stays open; the later approve is accepted: plan approved, plan mode off', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const r = await planned(w, p, await managed(w, p, IX.dsh.standardPreset))
    assert.deepEqual(await qAnswer(p, r, { toUser: true, note: tok('note') }), accepted)
    await assertStillOffered(p, r)
    assert.equal((await cardOf(w, r)).state, IX.card.open, 'toUser closed the card')
    assert.deepEqual(await qAnswer(p, r, { approve: true }), accepted)
    assert.match((await resultOf(w, r.sid, r.id)).text, IX.dsh.planApproved)
    // Leaving plan mode applies from the next step (DSH's words), so the turn ends first.
    await w.call('idle', { sessionId: r.sid })
    assert.match(JSON.stringify(await w.call('planCommand', { sessionId: r.sid, off: true })), IX.dsh.planInactive, 'plan mode is still on')
  })
  row(sdk, L.id.userAfterToUser, 'ST (question: Open → toUser → the user answers in the card)', `settlement {${SETTLEMENT_OUTCOME.answered}, by ${SETTLED_BY.user}, answers}; the result is the user's batch; the principal's later answer → ${lateCodes.join(' or ')}`, async (t) => {
    const { w, p, r } = await asking(t, 'question')
    assert.deepEqual(await KINDS.question.handOff(w, p, r), accepted)
    await KINDS.question.byUser(w, r)
    const s = await settlement(p.client, r.d.approvalId)
    assert.deepEqual([s.payload.outcome, s.payload.by, s.payload.answers], [SETTLEMENT_OUTCOME.answered, SETTLED_BY.user, ANSWER.red])
    assertRefused(await qAnswer(p, r, { answers: ANSWER.blue }), lateCodes)
  })

  // ------------------------------------------------------------------------- R2: escalate
  row(sdk, L.id.escalate, 'ST (Offered → escalate → escalate again → allow with risk high → allow)', `{accepted: true}; the stock prompt shows; still listed under the same offerId; a second escalate is refused; ${REFUSAL.allowNeedsLowRisk} still applies; the valid allow is accepted, the call runs with the tool's own output and the prompt closes`, async (t) => {
    const { w, p, r } = await asking(t, 'permission')
    assert.deepEqual(await KINDS.permission.handOff(w, p, r), accepted)
    await assertStillOffered(p, r)
    assert.equal((await w.call('calls')).find((c) => c.text === r.text).outcome, null, 'escalate decided the call')
    assertRefused(await answer(p, r, A.escalate()))
    await assertStillOffered(p, r)
    assertRefused(await answer(p, r, { ...A.allow(), risk: RISK.high }), [REFUSAL.allowNeedsLowRisk])
    await KINDS.permission.byPrincipal(w, p, r)
    assert.equal((await resultOf(w, r.sid, r.id)).text, IX.fixture.outcomeText(IX.outcome.allowed))
    assert.ok(await promptClosed(w, r.text), 'the stock prompt stayed open after the principal decided')
  })
  row(sdk, L.id.escalate, 'ST (Offered → escalate → reject with a reason)', `accepted; the call is rejected; the agent reads "${RELAYED.rejected('<reason>')}"; the prompt closes`, async (t) => {
    const { w, p, r } = await asking(t, 'permission')
    assert.deepEqual(await KINDS.permission.handOff(w, p, r), accepted)
    const why = tok('why')
    assert.deepEqual(await answer(p, r, A.reject(why)), accepted)
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.rejected)
    const result = await resultOf(w, r.sid, r.id)
    assert.equal(result.isError, true)
    assert.ok(result.text.includes(RELAYED.rejected(why)), result.text)
    assert.ok(await promptClosed(w, r.text), 'the stock prompt stayed open after the principal decided')
  })
  for (const [outcome, settled] of [[IX.outcome.allowed, SETTLEMENT_OUTCOME.allowed], [IX.outcome.rejected, SETTLEMENT_OUTCOME.rejected]]) {
    row(sdk, L.id.escalate, `ST (Offered → escalate → the user clicks ${outcome} first)`, `the user's click decides; settlement {${settled}, by ${SETTLED_BY.user}}; the principal's later allow → ${lateCodes.join(' or ')}`, async (t) => {
      const { w, p, r } = await asking(t, 'permission')
      assert.deepEqual(await KINDS.permission.handOff(w, p, r), accepted)
      await userClicks(w, r.text, outcome)
      assert.equal((await decided(w, r.text)).outcome, outcome)
      const s = await settlement(p.client, r.d.approvalId)
      assert.deepEqual([s.payload.outcome, s.payload.by], [settled, SETTLED_BY.user])
      assertRefused(await answer(p, r, A.allow()), lateCodes)
    })
  }

  // ------------------------------------------------------------------------- R7: no timer; R6: ends of management
  for (const kind of Object.keys(KINDS)) {
    row(sdk, L.id.silence, `ST (${kind}: handed to the user → silence)`, 'past a quiet period it is still listed under the same offerId, undecided, and the principal\'s answer then decides it', async (t) => {
      const { w, p, r } = await asking(t, kind)
      assert.deepEqual(await KINDS[kind].handOff(w, p, r), accepted)
      await quiet(); await quiet()
      await assertStillOffered(p, r)
      await KINDS[kind].byPrincipal(w, p, r)
    })
    for (const [label, end, reason] of ENDS) {
      row(sdk, L.id.ended, `ST (${kind}: handed to the user → ${label})`, `one retirement {${reason}}; the user's own ${kind === 'question' ? 'card' : 'prompt'} decides the call`, async (t) => {
        const { w, p, r } = await asking(t, kind)
        assert.deepEqual(await KINDS[kind].handOff(w, p, r), accepted)
        await end(w, p, r.sid)
        // The retirement is read first: the end applies asynchronously (APR-15r), and a user answer
        // racing it would rightly settle the request instead.
        await assertRetired(t, w, p, r, reason)
        await KINDS[kind].byUser(w, r)
      })
    }
  }

  // ------------------------------------------------------------------------- R8: delegates
  row(sdk, L.id.delegate, 'DT (a delegate passes → the manager escalates → the manager allows)', 'a pass still reaches the manager as an offer; escalate keeps it listed; the manager\'s allow decides the call; no delegate settlement', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await w.call('delegateScript', { name: IX.delegate.name, sessionId: sid, verdict: { verdict: L.delegatePass } })
    t.after(() => w.call('delegateScript', { name: IX.delegate.name, sessionId: sid, verdict: null }))
    const r = await asked(w, p, sid)
    assert.deepEqual(await KINDS.permission.handOff(w, p, r), accepted)
    await assertStillOffered(p, r)
    await KINDS.permission.byPrincipal(w, p, r)
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.settlement).filter((s) => s.payload.by === SETTLED_BY.delegate && s.sourceSessionId === sid), [])
  })

  // ------------------------------------------------------------------------- R4: the asking call ends, its turn goes on
  for (const [label, asks] of PROGRAM_ENDS) {
    row(sdk, L.id.callEnded, `ST (a run_code program's ask: Open → ${label} → the principal answers → answers again)`, `no retirement {withdrawn}; one notice {${L.noticeCode}} correlated to the offerId saying it stays open; still listed; the answer is accepted and reaches the session as an ${L.endedAnswerKind} message; no settlement for it; a second answer → ${REFUSAL.alreadySettled}`, async (t) => {
      const s = await ptcSession(t, sdk)
      if (s === null) return t.skip(L.noRunCode)
      const { w, p, sid } = s
      const r = await questioned(w, p, sid, { asks })
      const notice = await waitEvents(p.client, (e) => noticesFor(e, r)[0], 'a ' + L.noticeCode + ' notice')
      assert.equal(notice.payload.code, L.noticeCode)
      assert.equal(notice.sourceSessionId, sid)
      assert.match(notice.payload.text, L.noticeOpen)
      await quiet()
      const events = await pending(p.client)
      assert.equal(noticesFor(events, r).length, 1, 'not exactly one notice')
      assert.deepEqual(withdrawalsOf(events, r), [], 'the ended call\'s question was withdrawn')
      await assertStillOffered(p, r)
      assert.deepEqual(await qAnswer(p, r, { answers: ANSWER.blue }), accepted)
      const m = await deliveredAnswer(w, sid)
      assert.equal(m.callId, r.d.callId)
      assert.deepEqual(m.answers, ANSWER.blue)
      assert.ok(Object.values(m).includes(IX.dsh.askTool), 'the message does not name the tool: ' + JSON.stringify(m))
      assert.deepEqual(m.questions.map((q) => q.id), r.questions.map((q) => q.id))
      await quiet()
      assert.deepEqual(settlementsOf(await pending(p.client), r.d.approvalId), [], 'the principal\'s own answer produced a settlement')
      assertRefused(await qAnswer(p, r, { answers: ANSWER.red }), [REFUSAL.alreadySettled])
    })
  }

  // ------------------------------------------------------------------------- R5: the user's own end still withdraws
  row(sdk, L.id.userEnds, 'ST (question: Open → the user stops the turn)', 'one retirement {withdrawn}; no notice; a late answer is refused', async (t) => {
    const { w, p, r } = await asking(t, 'question')
    await w.call('cancel', { sessionId: r.sid })
    await assertWithdrawnNoNotice(p, r, { answers: ANSWER.blue })
  })
  row(sdk, L.id.userEnds, 'ST (a run_code program\'s ask: Open → the user stops the turn)', 'one retirement {withdrawn}; no notice; a late answer is refused', async (t) => {
    const s = await ptcSession(t, sdk)
    if (s === null) return t.skip(L.noRunCode)
    const r = await questioned(s.w, s.p, s.sid, { asks: inProgram((ask) => 'await ' + ask) })
    await s.w.call('cancel', { sessionId: s.sid })
    await assertWithdrawnNoNotice(s.p, r, { answers: ANSWER.blue })
  })
  row(sdk, L.id.userEnds, 'ST (question: Open → the user dismisses the card)', 'the call goes on with the dismissal; one retirement {withdrawn}; no notice; a late answer is refused', async (t) => {
    const { w, p, r } = await asking(t, 'question')
    assert.equal(await w.call('cardDiscuss', { sessionId: r.sid }), true)
    await resultOf(w, r.sid, r.id)
    await assertWithdrawnNoNotice(p, r, { answers: ANSWER.blue })
  })
  row(sdk, L.id.userEnds, 'ST (plan review: Open → the user\'s Discuss)', 'one retirement {withdrawn}; no notice; a late approve is refused', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const r = await planned(w, p, await managed(w, p, IX.dsh.standardPreset))
    assert.equal(await w.call('cardDiscuss', { sessionId: r.sid }), true)
    await w.call('idle', { sessionId: r.sid })
    await assertWithdrawnNoNotice(p, r, { approve: true })
    await w.call('planCommand', { sessionId: r.sid, off: true })
  })

}
