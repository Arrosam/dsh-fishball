/**
 * Revision 11 rev11g on H-STUB: plan reviews in managed sessions (requirements item 26; DESIGN §7a.10 "Plan
 * reviews", "The mode"; contract 1.1 §4.2 approve/feedback, `intent` plan-review; slim §12). exit_plan_mode
 * presents a plan; the instance approves it or keeps planning (with feedback); the session's own panel offers
 * only Approve and Discuss, and Discuss ends the turn. Plan mode is entered with /plan as a user does. One host;
 * cases run in order.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | PLN-01  | EP (routing) | §7a.10; §4.2 questions[].intent | the own review opens at once; the offer is kind question with one plan-review question carrying the plan, Approve / Keep planning and intent {kind plan-review, approve 'Approve', callId}; the notice carries the plan |
 * | PLN-02  | EP (the instance approves) | §4.2 approve | "Plan approved"; plan mode is off afterwards; the own review closes; a decisions row answer-question by fishball |
 * | PLN-03  | EP (the instance keeps planning with feedback) | §4.2 feedback | the agent sees the feedback in the call's error; plan mode stays on; the own review closes |
 * | PLN-04  | BVA (keep planning, no feedback: approve false) | §7a.10 Plan reviews | the agent is told to revise and present again; plan mode stays on |
 * | PLN-12  | BVA (feedbackChars 500 accepted; 501 refused) | contract §8 feedbackChars | 500: accepted and reaches the agent; 501: not accepted, nothing reaches the agent, the review stays open |
 * | PLN-07  | ST (you Approve in the session first) | §7a.10 The race | approved; the instance's late answer is refused |
 * | PLN-08  | ST (you Discuss in the session) | §7a.10 Plan reviews | the review is dismissed and the turn ends; plan mode stays on; the instance's answer is refused; it is told the card closed |
 * | PLN-09  | DT (bad plan answers) | §4.2 "at least one of the five", "answers cannot be combined with approve or feedback", bad-answer; §7a.10 | an answers batch, an unoffered label, an unknown question id: refused (bad-answer / expired), the review stays open and a good approve then works; answers + approve and an empty payload: refused (error frame or closed channel), the review stays open in its own panel |
 * | PLN-10  | DT (modes) | §7a.10 "A plan review follows the same mode" | user: the instance's approve is refused mode-user and you approve in the session; fishball: accepted |
 * | PLN-11  | EP (a session that is yours) | §7a.10 Routing | its plan review stays in its own panel; the instance hears nothing |
 *
 * Retired:
 * - PLN-05, PLN-06 (Approve / Keep planning with feedback on the pile card) and the pile parts of PLN-07/08: the pile's question form and route are deleted (slim §12). The feedback that only the pile card offered is now the instance's, so its bounds are the new PLN-12.
 * - The plan-review tag parts of PLN-02/03: tag records were removed (slim T15).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PLAN, PLAN_REVIEW_ID, PRESET, QUESTION_MODE } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { QSTUB, REFUSAL, assertStillOpen, bootQ, codeOf, qTools, quiet, refuseShape, tokens } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('PLN')
const APPROVE = [{ id: PLAN_REVIEW_ID, selected: [PLAN.approve] }]
const PLAN_BODY = 'Step one. Step two.'

describe('Revision 11 rev11g on H-STUB: plan reviews', () => {
  const ctx = {}
  let q
  let x
  let y
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-plan'))
    q = qTools(ctx)
    x = await q.session('pln-x', PRESET.standard)
    y = await q.session('pln-y', PRESET.standard)
  }, HOOK)
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  /** The instance answers the plan review; returns the call's result once the turn is idle. */
  async function decide(sid, label, payload) {
    const id = cid(label)
    const { card, offer } = await q.plan(sid, tok(label), id)
    assert.deepEqual((await q.answer(sid, offer.approvalId, payload)).payload, { accepted: true })
    const got = await q.result(sid, id)
    await q.waitIdle(sid)
    return { got, card, offer, id }
  }

  it('PLN-01 routing: the own review opens at once; the offer carries the plan review and its intent', T, async () => {
    const text = tok('01')
    const id = cid('01')
    const { card, offer } = await q.plan(x, text, id)
    assert.equal(card.questions[0].id, PLAN_REVIEW_ID)
    assert.equal(offer.kind, QSTUB.kind.question)
    assert.equal(offer.questions.length, 1)
    const [review] = offer.questions
    assert.equal(review.id, PLAN_REVIEW_ID)
    assert.ok(JSON.stringify(review).includes(PLAN_BODY), 'the offer carries the plan')
    assert.deepEqual(review.options.map((o) => o.label), [PLAN.approve, PLAN.keep])
    assert.deepEqual(review.intent, { kind: PLAN_REVIEW_ID, approve: PLAN.approve, callId: id })
    const notice = await q.noticeOf(offer.approvalId)
    assert.ok(notice?.text.includes(PLAN_BODY), 'the notice carries the plan: ' + notice?.text.slice(0, 800))
    await q.userStop(x)
    await q.planOff(x)
  })

  it('PLN-02 the instance approves: plan approved; plan mode off; the own review closes; a decisions row', T, async () => {
    const { got, card, offer } = await decide(x, '02', { approve: true })
    assert.match(got.text, PLAN.approved)
    assert.equal(got.isError, false)
    assert.notEqual(await q.cardState(x, card.index), QSTUB.card.open)
    assert.match(await q.planOff(x), QSTUB.planInactive, 'approving left plan mode')
    const rows = q.decisions({ target: offer.approvalId })
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].action, QSTUB.action.answer)
    assert.equal(rows[0].by, QSTUB.by.fishball)
  })

  it('PLN-03 the instance keeps planning with feedback: the agent sees it; plan mode stays on', T, async () => {
    const feedback = 'Add a restart test first. ' + tok('03f')
    const { got, card } = await decide(x, '03', { feedback })
    assert.equal(got.isError, true)
    assert.ok(got.text.includes(PLAN.feedbackPrefix + feedback), got.text)
    assert.notEqual(await q.cardState(x, card.index), QSTUB.card.open)
    assert.match(await q.planOff(x), QSTUB.planOff, 'plan mode was still on')
  })

  it('PLN-04 keep planning with no feedback: the agent is told to revise and present again; plan mode stays on', T, async () => {
    const { got } = await decide(x, '04', { approve: false })
    assert.equal(got.isError, true)
    assert.match(got.text, QSTUB.keepPlanning)
    assert.equal(got.text.includes(QSTUB.feedbackWords), false, 'no feedback was given')
    assert.match(await q.planOff(x), QSTUB.planOff)
  })

  it('PLN-12 feedbackChars: 501 characters is refused, the review stays in its own panel; 500 is accepted and reaches the agent', T, async () => {
    const over = cid('05o')
    const first = await q.plan(x, tok('05o'), over)
    await refuseShape(q, x, first, over, 'feedback of 501', { feedback: 'f'.repeat(QSTUB.limits.feedbackChars + 1) }, REFUSAL.shape)
    assert.equal(await q.modelSaw(x, 'f'.repeat(QSTUB.limits.feedbackChars + 1)), 0, 'nothing reached the agent')
    await q.userStop(x)
    await q.planOff(x)
    const feedback = 'f'.repeat(QSTUB.limits.feedbackChars)
    const { got } = await decide(x, '05', { feedback })
    assert.ok(got.text.includes(PLAN.feedbackPrefix + feedback), got.text.slice(0, 200))
    await q.planOff(x)
  })

  it('PLN-07 you Approve in the session\'s own panel first: approved; the instance\'s late answer is refused', T, async () => {
    const id = cid('07')
    const { offer } = await q.plan(y, tok('07'), id)
    assert.equal(await q.qAnswer(y, APPROVE), true)
    assert.match((await q.result(y, id)).text, PLAN.approved)
    await q.waitIdle(y)
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(y, offer.approvalId, { approve: true }))), 'refused')
    await q.planOff(y)
  })

  it('PLN-08 you Discuss in the session: dismissed and the turn ends; plan mode stays on; the instance\'s answer is refused; it is told', T, async () => {
    const id = cid('08')
    const { offer } = await q.plan(y, tok('08'), id)
    assert.equal(await q.qDiscuss(y), true)
    await q.waitIdle(y)
    assert.match((await q.resultNow(y, id))?.text ?? '', PLAN.dismissed)
    assert.notEqual(await q.host().call('lastTurnEnd', { sessionId: y }), null, 'the turn ended')
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(y, offer.approvalId, { approve: true }))), 'refused')
    const closed = (await q.waitMarker('closed', offer.approvalId)) || (await q.record(offer.approvalId, QSTUB.quietMs))
    assert.ok(closed, 'a CARD_CLOSED item or a closed card record (the notice promises a note when the session dismisses it)')
    assert.match(await q.planOff(y), QSTUB.planOff, 'plan mode stayed on')
  })

  it('PLN-09 bad plan answers are refused and the review stays open; a good answer then works', T, async () => {
    const id = cid('09')
    const { card, offer } = await q.plan(x, tok('09'), id)
    // Well-formed payloads whose answer does not fit: an answer refusal (contract §4.2), the channel stays open.
    const misfits = [
      ['an answers batch on a plan review', offer.approvalId, { answers: APPROVE }],
      ['a label that is not offered', offer.approvalId, { answers: [{ id: PLAN_REVIEW_ID, selected: ['Ship it'] }] }],
      ['an unknown question', QSTUB.unknownQuestionId, { approve: true }],
    ]
    for (const [label, questionId, rest] of misfits) {
      const r = await q.answer(x, questionId, rest)
      assert.ok([QSTUB.code.badAnswer, QSTUB.code.expired].includes(codeOf(r)), label + ': ' + JSON.stringify(r))
      await assertStillOpen(q, x, card, id, label)
    }
    assert.deepEqual((await q.answer(x, offer.approvalId, { approve: true })).payload, { accepted: true }, 'a good answer still works')
    assert.match((await q.result(x, id)).text, PLAN.approved)
    await q.waitIdle(x)
    await q.planOff(x)
    // Payload rules (answers cannot be combined with approve; at least one of the five keys): each on its own review.
    for (const [label, rest] of [['answers combined with approve', { answers: APPROVE, approve: true }], ['no decision at all', {}]]) {
      const shapeId = cid('09s')
      const raised = await q.plan(x, tok('09s'), shapeId)
      await refuseShape(q, x, raised, shapeId, label, rest, REFUSAL.shape)
      assert.equal(await q.qAnswer(x, APPROVE), true, label + ': you still answer it in the session')
      assert.match((await q.result(x, shapeId)).text, PLAN.approved)
      await q.waitIdle(x)
      await q.planOff(x)
    }
  })

  it('PLN-10 modes: user refuses the instance\'s approve (mode-user); fishball accepts it', T, async () => {
    await q.setMode(QUESTION_MODE.user)
    try {
      const text = tok('10u')
      const id = cid('10u')
      const { card } = await q.plan(x, text, id, { offer: false })
      const qid = await q.learnedId(text, id)
      assert.ok(qid, 'the instance learned the review (to add a note)')
      assert.equal(codeOf(await q.answer(x, qid, { approve: true })), QSTUB.code.modeUser)
      await assertStillOpen(q, x, card, id, 'user mode')
      assert.equal(await q.qAnswer(x, APPROVE), true)
      assert.match((await q.result(x, id)).text, PLAN.approved)
      await q.waitIdle(x)
      await q.planOff(x)
    } finally { await q.setMode(QUESTION_MODE.fishball) }
    try {
      const { got } = await decide(x, '10f', { approve: true })
      assert.match(got.text, PLAN.approved)
      await q.planOff(x)
    } finally { await q.setMode(QUESTION_MODE.auto) }
  })

  it('PLN-11 a session that is yours: its plan review stays in its own panel; the instance hears nothing', T, async () => {
    const own = await q.yours('pln-yours', PRESET.standard)
    const text = tok('11')
    const id = cid('11')
    await q.plan(own, text, id, { offer: false })
    await quiet()
    assert.equal(await q.toldAbout(text), false)
    assert.equal(await q.qAnswer(own, APPROVE), true)
    assert.match((await q.result(own, id)).text, PLAN.approved)
    await q.waitIdle(own)
  })
})
