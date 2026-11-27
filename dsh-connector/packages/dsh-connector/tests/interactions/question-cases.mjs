/**
 * IX-UC-03 (USE-CASES.md): questions and plan reviews of a managed session, answered by its
 * principal over MCP on a real DSH, with the session's own card open too (q2: the first answer wins).
 * Gap-check (B) rows: FLW-01…13, HLD-01…07, PLN-01…04, PLN-07…09, PLN-11, PLN-12, VAL-02…04,
 * VAL-06…08, CHD-01, STP-03, RDR-02. Techniques: UC, EP, BVA, DT, ST.
 */
import assert from 'node:assert/strict'
import {
  DECISION_KIND, DECISION_TEXT, EVENT_TYPE, FIXTURE, IX, OFFER_ID, PAYLOAD_LIMITS, PLAN_REVIEW, REFUSAL, RELAYED, RETIREMENT_REASON, SETTLED_BY,
  SETTLEMENT_OUTCOME, TOOL, formatOfferId,
} from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row, withdrawn } from 'dsh-connector-test-helpers/connector-world/rows'
import {
  batchOf, cardOf, cid, eventually, free, listed, managed, ofType, okCall, pending, planned, principal, qAnswer, questioned, quiet, resultOf, retirement,
  session, settlement, settlementsOf, step, tok, turn, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'

const ASK = IX.preset.ask
const L = PAYLOAD_LIMITS
const accepted = { ok: true, accepted: true }
/** The question's offer still answerable: listed, its card open, the call waiting. */
async function assertOpen(w, p, r) {
  assert.ok((await listed(p, r.sid)).some((x) => x.approvalId === r.d.approvalId), 'no longer listed')
  assert.equal((await cardOf(w, r)).state, IX.card.open, 'the card closed')
  assert.deepEqual((await w.call('results', { sessionId: r.sid })).filter((x) => x.callId === r.id), [], 'the call already has a result')
}
/** A refused question_answer: the code, still open; then a good batch is accepted exactly. */
async function assertRefusedThenGood(w, p, r, rest, code, good) {
  const reply = await qAnswer(p, r, rest)
  assert.deepEqual([reply.ok, reply.code], [false, code], JSON.stringify(reply))
  await assertOpen(w, p, r)
  if (good === undefined) return free(w, r.sid)
  assert.deepEqual(await qAnswer(p, r, { answers: good }), accepted)
  assert.deepEqual(batchOf(await resultOf(w, r.sid, r.id)), good)
}
const isAccepted = (reply) => reply.ok === true && reply.accepted === true

export function registerQuestionCases(sdk) {
  const w0 = () => world(sdk)
  const asking = async (t) => { const w = await w0(); const p = await principal(t, w); const sid = await managed(w, p, ASK); return { w, p, sid } }

  // ------------------------------------------------------------------------- routing
  row(sdk, 'FLW-01', 'EP (a session that is the user\'s)', 'the question stays in its own card; no principal gets an event', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await session(w, ASK)
    const text = tok('f01')
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.askTool, { questions: FIXTURE.single(text) }, cid('f01')), [{ text: 'done' }]] })
    assert.ok(await eventually(async () => (await w.call('cards', { sessionId: sid })).some((c) => c.state === IX.card.open)), 'no card')
    await quiet()
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.question), [])
    await free(w, sid)
  })
  row(sdk, 'FLW-02 / FLW-10', 'UC (a managed question)', `one question event: offer {.r1, 1, ${DECISION_KIND.question}}, kind question, the questions as DSH asked them, callId, no expiresAt; the session's own card is open too (${DECISION_TEXT.q2})`, async (t) => {
    const { w, p, sid } = await asking(t)
    const text = tok('f02')
    const r = await questioned(w, p, sid, { text, questions: FIXTURE.mixed(text) })
    assert.deepEqual(r.offer, { offerId: formatOfferId(r.d.approvalId, OFFER_ID.firstRevision), revision: OFFER_ID.firstRevision, decisionKind: DECISION_KIND.question })
    assert.equal(r.d.kind, DECISION_KIND.question)
    assert.match(r.d.approvalId, RELAYED.questionId)
    assert.equal(r.event.sourceSessionId, sid)
    assert.deepEqual(r.d.questions.map((q) => q.id), r.questions.map((q) => q.id))
    assert.deepEqual(r.d.questions.map((q) => q.question), r.questions.map((q) => q.question))
    assert.deepEqual(r.d.questions[1].options.map((o) => o.label), r.questions[1].options.map((o) => o.label))
    assert.equal(r.d.questions[1].multiSelect, true)
    assert.equal(r.d.callId, r.id)
    assert.equal(Object.hasOwn(r.d, 'expiresAt'), false)
    assert.equal(r.card.state, IX.card.open)
    await free(w, sid)
  })
  // Re-baselined by CONN-REPORT A3 (user-approved 2026-11-21): the principal's own answer produces no settlement; {accepted: true} is the outcome.
  row(sdk, 'FLW-03 / FLW-04 / FLW-06', 'UC (the principal answers first)', '{accepted: true}; the call\'s result is exactly the batch; the card closes; no settlement event (A3); the stale card can no longer be answered', async (t) => {
    const { w, p, sid } = await asking(t)
    const text = tok('f03')
    const r = await questioned(w, p, sid, { text, questions: FIXTURE.mixed(text) })
    const answers = [{ id: 'color', selected: ['Blue'] }, { id: 'parts', selected: ['Docs', 'Code'], custom: 'and CI' }, { id: 'name', selected: [], custom: 'fix/x' }]
    assert.deepEqual(await qAnswer(p, r, { answers }), accepted)
    assert.deepEqual(batchOf(await resultOf(w, sid, r.id)), answers)
    assert.notEqual((await cardOf(w, r)).state, IX.card.open)
    await quiet()
    assert.deepEqual(settlementsOf(await pending(p.client), r.d.approvalId), [], 'the principal\'s own answer produced a settlement')
    assert.equal(await w.call('cardAnswer', { sessionId: sid, answers: FIXTURE.answer.red }), false, 'the closed card took an answer')
  })
  row(sdk, 'FLW-05', 'ST (the user answers in the card first)', `the principal's answer → ${REFUSAL.expired} or ${REFUSAL.alreadySettled}; settlement {answered, by user, answers}; the result is the user's batch`, async (t) => {
    const { w, p, sid } = await asking(t)
    const r = await questioned(w, p, sid)
    assert.equal(await w.call('cardAnswer', { sessionId: sid, answers: FIXTURE.answer.red }), true)
    assert.deepEqual(batchOf(await resultOf(w, sid, r.id)), FIXTURE.answer.red)
    const late = await qAnswer(p, r, { answers: FIXTURE.answer.blue })
    assert.equal(late.ok, false)
    assert.ok([REFUSAL.expired, REFUSAL.alreadySettled].includes(late.code), late.code)
    const s = await settlement(p.client, r.d.approvalId)
    assert.deepEqual([s.payload.by, s.payload.outcome, s.payload.answers], [SETTLED_BY.user, SETTLEMENT_OUTCOME.answered, FIXTURE.answer.red])
  })
  row(sdk, 'FLW-07', 'ST (silence)', 'no timer: past a quiet period it is still listed and its card still open', async (t) => {
    const { w, p, sid } = await asking(t)
    const r = await questioned(w, p, sid)
    await quiet(); await quiet()
    await assertOpen(w, p, r)
    await free(w, sid)
  })
  for (const [label, end] of [
    ['the user stops the turn', (w, p, sid) => w.call('cancel', { sessionId: sid })],
    ['session_stop', (w, p, sid) => okCall(p.client, TOOL.sessionStop, { sessionId: sid })],
    ['session_redirect', (w, p, sid) => okCall(p.client, TOOL.sessionRedirect, { sessionId: sid, message: tok('redirect'), attachments: [] })],
  ]) {
    row(sdk, 'FLW-11 / STP-03 / RDR-02', `ST (Open → ${label})`, 'the card closes; one retirement {withdrawn}; a late answer is refused', async (t) => {
      const { w, p, sid } = await asking(t)
      const r = await questioned(w, p, sid)
      await end(w, p, sid)
      assert.ok(await eventually(async () => (await cardOf(w, r)).state !== IX.card.open), 'the card stayed open')
      assert.equal((await retirement(p.client, r.event)).payload.reason, RETIREMENT_REASON.withdrawn)
      assert.equal((await qAnswer(p, r, { answers: FIXTURE.answer.blue })).ok, false)
      await free(w, sid)
    })
  }
  // Re-baselined by the managed-request lifecycle fix (R1, relayed by the lead 2026-11-21): toUser does not
  // settle the question, so it stays listed (was: unlisted) and the user's answer still settles it. The
  // principal's own later answer being accepted is lifecycle-cases.mjs LIF-R1; here the user answers first.
  row(sdk, 'FLW-12', 'ST (toUser with a note)', '{accepted: true}; the question stays listed with the same offerId (R1) and stays in its card; the user\'s answer → settlement {by user, answers}; a later answer is refused', async (t) => {
    const { w, p, sid } = await asking(t)
    const r = await questioned(w, p, sid)
    assert.deepEqual(await qAnswer(p, r, { toUser: true, note: tok('note') }), accepted)
    assert.equal((await listed(p, sid)).find((x) => x.approvalId === r.d.approvalId)?.offerId, r.offer.offerId, 'toUser unlisted the question or changed its offer')
    assert.equal((await cardOf(w, r)).state, IX.card.open)
    assert.equal(await w.call('cardAnswer', { sessionId: sid, answers: FIXTURE.answer.red }), true)
    const s = await settlement(p.client, r.d.approvalId)
    assert.deepEqual([s.payload.by, s.payload.answers], [SETTLED_BY.user, FIXTURE.answer.red])
    assert.equal((await qAnswer(p, r, { answers: FIXTURE.answer.blue })).ok, false, 'a late answer after the user\'s was accepted')
  })
  row(sdk, 'FLW-12', `DT (toUser with answers)`, `→ ${REFUSAL.badAnswer}; still open`, async (t) => {
    const { w, p, sid } = await asking(t)
    const r = await questioned(w, p, sid)
    await assertRefusedThenGood(w, p, r, { toUser: true, answers: FIXTURE.answer.blue }, REFUSAL.badAnswer, FIXTURE.answer.blue)
  })
  row(sdk, 'FLW-13', 'EP (two questions in two sessions)', 'approvals_list is per session; answering one leaves the other answerable', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const r1 = await questioned(w, p, await managed(w, p, ASK))
    const r2 = await questioned(w, p, await managed(w, p, ASK))
    assert.deepEqual((await listed(p, r1.sid)).map((x) => x.approvalId), [r1.d.approvalId])
    assert.deepEqual((await listed(p, r2.sid)).map((x) => x.approvalId), [r2.d.approvalId])
    assert.deepEqual(await qAnswer(p, r1, { answers: FIXTURE.answer.blue }), accepted)
    await assertOpen(w, p, r2)
    assert.deepEqual(await qAnswer(p, r2, { answers: FIXTURE.answer.red }), accepted)
  })
  for (const who of ['the principal', 'the user']) {
    row(sdk, 'HLD-01…07', `ST (a timed question past its own timeout; ${who} answers)`, `a timed question's own timeout does not end the wait while P holds it; ${who}'s answer is the result in the same turn`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p, IX.preset.askTimed)
      const r = await questioned(w, p, sid, { extra: { timeout: FIXTURE.timedSeconds } })
      await new Promise((resolve) => setTimeout(resolve, FIXTURE.timedSeconds * FIXTURE.secondMs * 2))
      await quiet()
      await assertOpen(w, p, r)
      if (who === 'the principal') assert.deepEqual(await qAnswer(p, r, { answers: FIXTURE.answer.blue }), accepted)
      else assert.equal(await w.call('cardAnswer', { sessionId: sid, answers: FIXTURE.answer.blue }), true)
      assert.deepEqual(batchOf(await resultOf(w, sid, r.id)), FIXTURE.answer.blue)
    })
  }
  row(sdk, 'CHD-01', 'EP (a subagent\'s question)', 'DSH refuses it (the call fails); no event, no card for it', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p, IX.dsh.standardPreset)
    const marker = tok('chd')
    const text = tok('chdq')
    const id = cid('chdq')
    await w.call('queueMarker', { marker, except: sid, script: [step(IX.dsh.askTool, { questions: FIXTURE.single(text) }, id), [{ text: 'sub done' }]] })
    const before = (await w.call('cards', {})).length
    await turn(w, sid, [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn'))])
    await quiet()
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.question).filter((e) => JSON.stringify(e.payload.questions).includes(text)), [])
    assert.deepEqual((await w.call('cards', {})).slice(before).filter((c) => JSON.stringify(c.questions).includes(text)), [])
  })

  // ------------------------------------------------------------------------- plan reviews
  const planWorld = async (t) => { const w = await w0(); const p = await principal(t, w); const sid = await managed(w, p, IX.dsh.standardPreset); return { w, p, sid } }
  row(sdk, 'PLN-01', 'UC (exit_plan_mode in a managed session)', `one plan-review event: one question carrying the plan, intent {kind ${PLAN_REVIEW}, approve, callId}; the session's own card opens`, async (t) => {
    const { w, p, sid } = await planWorld(t)
    const r = await planned(w, p, sid)
    assert.equal(r.event.type, EVENT_TYPE.planReview)
    assert.match(r.d.approvalId, RELAYED.questionId)
    assert.equal(r.d.questions.length, 1)
    const q = r.d.questions[0]
    assert.ok(JSON.stringify(q).includes(r.text), 'the plan is not in the question')
    assert.equal(q.intent?.kind, PLAN_REVIEW)
    assert.ok(q.options.some((o) => o.label === q.intent.approve), 'approve names no option')
    assert.equal(r.offer.decisionKind, DECISION_KIND.question)
    assert.ok(r.card.planReview)
    await free(w, sid)
    await w.call('planCommand', { sessionId: sid, off: true })
  })
  for (const [label, rest, check] of [
    ['approve: true', { approve: true }, async (w, sid, res) => { assert.match(res.text, IX.dsh.planApproved); assert.match(JSON.stringify(await w.call('planCommand', { sessionId: sid, off: true })), IX.dsh.planInactive, 'plan mode is still on') }],
    ['feedback', { feedback: 'add a restart test first' }, async (w, sid, res) => { assert.equal(res.isError, true); assert.ok(res.text.includes('add a restart test first'), res.text); assert.match(JSON.stringify(await w.call('planCommand', { sessionId: sid, off: true })), IX.dsh.planModeOff) }],
    ['approve: false, no feedback', { approve: false }, async (w, sid, res) => { assert.equal(res.isError, true); assert.match(res.text, IX.dsh.keepPlanning); assert.match(JSON.stringify(await w.call('planCommand', { sessionId: sid, off: true })), IX.dsh.planModeOff) }],
  ]) {
    // Re-baselined by CONN-REPORT A3 (user-approved 2026-11-21): no settlement by principal.
    row(sdk, 'PLN-02 / PLN-03 / PLN-04', `DT (${label})`, `{accepted: true}; ${label === 'approve: true' ? 'plan approved, plan mode off' : 'keep planning, plan mode stays on'}; the card closes; no settlement event (A3)`, async (t) => {
      const { w, p, sid } = await planWorld(t)
      const r = await planned(w, p, sid)
      assert.deepEqual(await qAnswer(p, r, rest), accepted)
      const res = await resultOf(w, sid, r.id)
      assert.notEqual((await cardOf(w, r)).state, IX.card.open)
      // The A3 oracle is checked before the plan-mode words, so a change in DSH's own wording cannot hide it.
      await quiet()
      assert.deepEqual(settlementsOf(await pending(p.client), r.d.approvalId), [], 'the principal\'s own answer produced a settlement')
      await check(w, sid, res)
    })
  }
  for (const [label, n, ok] of [['= feedbackChars', L.feedbackChars, true], ['feedbackChars + 1', L.feedbackChars + 1, false]]) {
    row(sdk, 'PLN-12', `BVA (${label}: ${n})`, ok ? 'accepted; it reaches the agent' : `→ ${REFUSAL.limitExceeded}; the review stays open`, async (t) => {
      const { w, p, sid } = await planWorld(t)
      const r = await planned(w, p, sid)
      const feedback = 'f'.repeat(n)
      const reply = await qAnswer(p, r, { feedback })
      if (ok) {
        assert.deepEqual(reply, accepted)
        assert.ok((await resultOf(w, sid, r.id)).text.includes(feedback))
      } else {
        assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.limitExceeded])
        await assertOpen(w, p, r)
        await free(w, sid)
      }
      await w.call('planCommand', { sessionId: sid, off: true })
    })
  }
  row(sdk, 'PLN-07', 'ST (the user approves in the card first)', 'approved; the principal\'s late answer is refused; settlement by user', async (t) => {
    const { w, p, sid } = await planWorld(t)
    const r = await planned(w, p, sid)
    const approve = r.d.questions[0].intent.approve
    assert.equal(await w.call('cardAnswer', { sessionId: sid, answers: [{ id: r.d.questions[0].id, selected: [approve] }] }), true)
    assert.match((await resultOf(w, sid, r.id)).text, IX.dsh.planApproved)
    assert.equal((await qAnswer(p, r, { approve: true })).ok, false)
    assert.equal((await settlement(p.client, r.d.approvalId)).payload.by, SETTLED_BY.user)
  })
  row(sdk, 'PLN-08', 'ST (the user\'s Discuss)', 'the card closes; plan mode stays on; the principal\'s answer is refused; a retirement follows', async (t) => {
    const { w, p, sid } = await planWorld(t)
    const r = await planned(w, p, sid)
    assert.equal(await w.call('cardDiscuss', { sessionId: sid }), true)
    await w.call('idle', { sessionId: sid })
    assert.equal((await qAnswer(p, r, { approve: true })).ok, false)
    const events = await pending(p.client)
    assert.ok(events.some((e) => (e.type === EVENT_TYPE.retirement && e.payload.retiredEventId === r.event.eventId) || (e.type === EVENT_TYPE.settlement && e.payload.approvalId === r.d.approvalId)), 'the principal was not told the review ended')
    assert.match(JSON.stringify(await w.call('planCommand', { sessionId: sid, off: true })), IX.dsh.planModeOff)
  })
  for (const [label, rest, code] of [
    ['an answers batch on a plan review', (r) => ({ answers: [{ id: r.d.questions[0].id, selected: [r.d.questions[0].intent.approve] }] }), REFUSAL.badAnswer],
    ['approve and feedback', () => ({ approve: true, feedback: 'x' }), REFUSAL.badAnswer],
    ['a note alone', () => ({ note: 'n' }), REFUSAL.badAnswer],
    // C-TOOLS payload rule before the domain (contract 1.2 §8, V2 requestQuestionAnswer): no part → invalid-arguments.
    ['an empty payload', () => ({}), REFUSAL.invalidArguments],
    ['an unknown question id', () => ({ approve: true }), REFUSAL.expired],
  ]) {
    row(sdk, 'PLN-09', `DT (${label})`, `→ ${code}; the review stays open; a good approve then works`, async (t) => {
      const { w, p, sid } = await planWorld(t)
      const r = await planned(w, p, sid)
      const unknown = code === REFUSAL.expired ? { questionId: FIXTURE.unknownApprovalId, offerId: formatOfferId(FIXTURE.unknownApprovalId, OFFER_ID.firstRevision) } : {}
      const reply = await qAnswer(p, r, rest(r), unknown)
      assert.deepEqual([reply.ok, reply.code], [false, code], JSON.stringify(reply))
      await assertOpen(w, p, r)
      assert.deepEqual(await qAnswer(p, r, { approve: true }), accepted)
    })
  }
  row(sdk, 'PLN-09', 'DT (approve on a question)', `→ ${REFUSAL.badAnswer}; still open`, async (t) => {
    const { w, p, sid } = await asking(t)
    const r = await questioned(w, p, sid)
    await assertRefusedThenGood(w, p, r, { approve: true }, REFUSAL.badAnswer, FIXTURE.answer.blue)
  })
  row(sdk, 'PLN-11', 'EP (a plan review in a session that is the user\'s)', 'its own card only; no event', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await session(w, IX.dsh.standardPreset)
    await turn(w, sid, [[{ text: tok('warm') }]])
    await w.call('planCommand', { sessionId: sid })
    const text = tok('p11')
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.planTool, { plan: FIXTURE.planText(text) }, cid('p11')), [{ text: 'done' }]] })
    assert.ok(await eventually(async () => (await w.call('cards', { sessionId: sid })).some((c) => c.planReview && c.state === IX.card.open)))
    await quiet()
    assert.deepEqual(ofType(await pending(p.client), EVENT_TYPE.planReview), [])
    await free(w, sid)
    await w.call('planCommand', { sessionId: sid, off: true })
  })

  // ------------------------------------------------------------------------- batch validation (decision table, boundaries)
  // bad-answer is the domain's (a label not offered, single-select overflow, an unknown id in a non-empty
  // batch); the C-TOOLS payload rules come first (dispatch step 4; contract 1.2 §8, unchanged from V2's
  // requestQuestionAnswer, relayed 2026-11-17): an empty batch → limit-exceeded, a repeated id or label
  // → invalid-arguments.
  for (const [label, answers, code] of [
    ['an unoffered label', [{ id: 'color', selected: ['Green'] }], REFUSAL.badAnswer],
    ['two labels on a single-select', [{ id: 'color', selected: ['Red', 'Blue'] }], REFUSAL.badAnswer],
    ['an unknown question id', [{ id: 'nope', selected: ['Red'] }], REFUSAL.badAnswer],
    ['an empty batch', [], REFUSAL.limitExceeded],
    ['the same id twice', [{ id: 'color', selected: ['Red'] }, { id: 'color', selected: ['Blue'] }], REFUSAL.invalidArguments],
    ['label and custom on a single-select', [{ id: 'color', selected: ['Blue'], custom: 'teal' }], REFUSAL.badAnswer],
    ['the same label twice on a multi-select', null, REFUSAL.invalidArguments],
  ]) {
    row(sdk, 'VAL-02 / VAL-03 / VAL-04', `DT (${label})`, `→ ${code}; the question stays open; a good batch is then accepted exactly`, async (t) => {
      const { w, p, sid } = await asking(t)
      const multi = answers === null
      const text = tok('v')
      const r = await questioned(w, p, sid, { text, questions: multi ? FIXTURE.mixed(text).slice(1, 2) : FIXTURE.single(text) })
      const bad = multi ? [{ id: 'parts', selected: ['Docs', 'Docs'] }] : answers
      await assertRefusedThenGood(w, p, r, { answers: bad }, code, multi ? [{ id: 'parts', selected: ['Docs'] }] : FIXTURE.answer.blue)
    })
  }
  for (const [label, multi, answers] of [
    ['single: one label', false, [{ id: 'color', selected: ['Blue'] }]],
    ['single: custom alone', false, [{ id: 'color', selected: [], custom: 'teal' }]],
    ['single: skipped (no label, no custom)', false, [{ id: 'color', selected: [] }]],
    ['multi: none', true, [{ id: 'parts', selected: [] }]],
    ['multi: one', true, [{ id: 'parts', selected: ['Tests'] }]],
    ['multi: all three', true, [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'] }]],
    ['multi: all three and custom', true, [{ id: 'parts', selected: ['Docs', 'Tests', 'Code'], custom: 'and CI' }]],
  ]) {
    row(sdk, 'VAL-03 / VAL-04', `BVA (${label})`, 'accepted; the result is exactly the batch', async (t) => {
      const { w, p, sid } = await asking(t)
      const text = tok('v')
      const r = await questioned(w, p, sid, { text, questions: multi ? FIXTURE.mixed(text).slice(1, 2) : FIXTURE.single(text) })
      assert.deepEqual(await qAnswer(p, r, { answers }), accepted)
      assert.deepEqual(batchOf(await resultOf(w, sid, r.id)), answers)
    })
  }
  const text = (n) => 'c'.repeat(n)
  for (const [name, build, payload, limit] of [
    ['customChars', FIXTURE.free, (n) => ({ answers: [{ id: 'free', selected: [], custom: text(n) }] }), L.customChars],
    ['labelChars (a selected label)', (t) => FIXTURE.longLabel(t, L.labelChars), (n) => ({ answers: [{ id: 'long', selected: [text(n)] }] }), L.labelChars],
    ['noteChars (with toUser)', FIXTURE.single, (n) => ({ toUser: true, note: text(n) }), L.noteChars],
  ]) {
    for (const [at, n] of [['=', limit], ['+ 1', limit + 1]]) {
      row(sdk, 'VAL-06', `BVA (${name} ${at} limit: ${n})`, n === limit ? 'accepted' : `→ ${REFUSAL.limitExceeded}; the question stays open`, async (t) => {
        const { w, p, sid } = await asking(t)
        const tx = tok('v6')
        const r = await questioned(w, p, sid, { text: tx, questions: build(tx) })
        const reply = await qAnswer(p, r, payload(n))
        if (n === limit) assert.ok(isAccepted(reply), JSON.stringify(reply))
        else { assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.limitExceeded]); await assertOpen(w, p, r) }
        await free(w, sid)
      })
    }
  }
  const answersFor = (n) => Array.from({ length: n }, (_, i) => ({ id: 'q' + (i + 1), selected: [], custom: 'a' }))
  const labels = (n) => Array.from({ length: n }, (_, i) => 'L' + (i + 1))
  for (const [name, build, payload, limit] of [
    ['questionsPerRequest', (t) => FIXTURE.manyQuestions(t, L.questionsPerRequest), (n) => ({ answers: answersFor(n) }), L.questionsPerRequest],
    ['selectedLabelsPerAnswer', (t) => FIXTURE.manyOptions(t, L.selectedLabelsPerAnswer + 1), (n) => ({ answers: [{ id: 'many', selected: labels(n) }] }), L.selectedLabelsPerAnswer],
  ]) {
    for (const n of [limit, limit + 1]) {
      row(sdk, 'VAL-07', `BVA (${name} ${n})`, n === limit ? 'accepted' : `→ ${REFUSAL.limitExceeded}; the question stays open`, async (t) => {
        const { w, p, sid } = await asking(t)
        const tx = tok('v7')
        const r = await questioned(w, p, sid, { text: tx, questions: build(tx) })
        const reply = await qAnswer(p, r, payload(n))
        if (n === limit) assert.ok(isAccepted(reply), JSON.stringify(reply))
        else { assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.limitExceeded]); await assertOpen(w, p, r) }
        await free(w, sid)
      })
    }
  }
  row(sdk, 'VAL-08', 'EP (another session\'s question; another principal)', `answered as another of P's sessions → refused; by Q → ${REFUSAL.forbidden}; still open`, async (t) => {
    const { w, p, sid } = await asking(t)
    const q = await principal(t, w, FIXTURE.label.q)
    const r = await questioned(w, p, sid)
    const other = await managed(w, p, ASK)
    assert.equal((await qAnswer(p, r, { answers: FIXTURE.answer.blue }, { sessionId: other })).ok, false)
    const byQ = await qAnswer(q, r, { answers: FIXTURE.answer.blue })
    assert.deepEqual([byQ.ok, byQ.code], [false, REFUSAL.forbidden])
    await assertOpen(w, p, r)
    await free(w, sid)
  })

  // ------------------------------------------------------------------------- withdrawn
  withdrawn(sdk, 'MOD-04…08 / PLN-10', 'question modes', 'stored question modes route questions', 'the questionMode setting is removed (decision list item 9); ' + DECISION_TEXT.v1)
  withdrawn(sdk, 'OFF-01…03', 'no instance', 'with no instance attached the question stays in its card and is not offered', 'R-CON-09 (managed questions always become offers that wait); attach is V2 (R-ARCH-07)')
}
