/**
 * Revision 11 rev11g: plan reviews in managed sessions (requirements item 26; DESIGN §7a.10 "Plan reviews", "Cards",
 * §10e; S36 Q3). exit_plan_mode presents a plan; Fishball (or you, on the pile card) approves it or keeps planning
 * with feedback; the session's own panel offers only Approve and Discuss, and Discuss ends the turn and closes the pile
 * card. Plan mode is entered with /plan as a user does. One host; cases run in order.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PLN-01  | EP (routing) | the session's own review opens at once; Fishball's notice carries the plan; no pile card yet |
 * | PLN-02  | EP (Fishball approves) | "Plan approved"; plan mode is off afterwards; the own review closes; a plan-review tag for the call |
 * | PLN-03  | EP (Fishball keeps planning with feedback) | the agent sees the feedback in the call's error; plan mode stays on; the own review closes; a plan-review tag |
 * | PLN-04  | BVA (keep planning, no feedback) | the agent is told to revise and present again; plan mode stays on |
 * | PLN-05  | EP (pile card: Approve) | to_user makes a card showing the plan; the route's approve answers; both places clear |
 * | PLN-06  | EP (pile card: Keep planning with feedback) | the route's feedback reaches the agent; plan mode stays on |
 * | PLN-07  | ST (you Approve in the session first) | approved; the pile card leaves; Fishball's late answer is refused; no tag |
 * | PLN-08  | ST (you Discuss in the session) | the review is dismissed (turn ends, plan mode stays on); the pile card leaves; Fishball's answer is refused; no tag |
 * | PLN-09  | DT (bad plan answers) | no decision; a label that is not offered; an answers batch for a non-offered label; an unknown question id: all refused, review stays open |
 * | PLN-10  | DT (modes) | user: Fishball's answer refused mode-user and the card is in the pile at once; fishball: accepted |
 * | PLN-11  | EP (a session that is yours) | its plan review stays in its own panel; Fishball takes no step |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { MODE_USER_CODE, PLAN, PLAN_REVIEW_ID, PRESET, QUESTION_MODE, QUESTION_TAG_KIND, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { AT_ONCE_MS, QUIET_MS, cardId, cardMentions, planText, qHost, qTools, refused, sleep, tokens } from './support/rev11g.mjs'

const { tok, cid } = tokens('PLN')

describe('Revision 11 rev11g: plan reviews', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let q
  let x
  let y
  const planOffText = async (sid) => (await q.planOff(sid)).text
  const resultEvent = async (sid, id) => (await q.allEvents(sid)).find((e) => e.type === 'tool/result' && e.result.callId === id)
  before(async () => {
    ctx = await qHost('rev11g-plan')
    q = qTools(ctx, { tok, cid })
    x = await q.session('pln-x', PRESET.standard)
    y = await q.session('pln-y', PRESET.standard)
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('PLN-01 routing: the own review opens at once; Fishball\'s notice carries the plan; no pile card yet', T, async () => {
    const text = tok('01')
    const own = await q.plan(x, text, cid('01'))
    assert.equal(own.questions[0].id, PLAN_REVIEW_ID)
    const qid = await q.questionId(text)
    assert.match(qid, /^qst_/)
    const [notice] = await q.notices(text)
    assert.ok(notice.text.includes('Step one. Step two.'), 'the notice carries the plan: ' + notice.text.slice(0, 800))
    assert.equal((await q.pile()).length, 0)
    await q.stop(x)
    await planOffText(x)
  })

  it('PLN-02 Fishball approves: plan approved; plan mode off; the own review closes; a plan-review tag', T, async () => {
    const text = tok('02')
    const id = cid('02')
    await q.planAnswer(text, { approve: true })
    const own = await q.plan(x, text, id)
    const got = await q.result(x, id)
    assert.match(got.text, PLAN.approved)
    assert.equal(got.isError, false)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'closed')
    assert.match(await planOffText(x), /already inactive/i, 'approving left plan mode')
    const tag = await q.untilTag(id)
    assert.equal(tag?.kind, QUESTION_TAG_KIND.planReview)
    assert.equal(tag.sessionId, x)
  })

  it('PLN-03 Fishball keeps planning with feedback: the agent sees the feedback; plan mode stays on; a plan-review tag', T, async () => {
    const text = tok('03')
    const id = cid('03')
    const feedback = 'Add a restart test first. ' + text
    await q.planAnswer(text, { feedback })
    const own = await q.plan(x, text, id)
    const got = await q.result(x, id)
    assert.equal(got.isError, true)
    assert.equal(got.text.includes(PLAN.feedbackPrefix + feedback), true, got.text)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'closed')
    assert.match(await planOffText(x), /Plan mode off\./, 'plan mode was still on')
    assert.equal((await q.untilTag(id))?.kind, QUESTION_TAG_KIND.planReview)
  })

  it('PLN-04 keep planning with no feedback: the agent is told to revise and present again; plan mode stays on', T, async () => {
    const text = tok('04')
    const id = cid('04')
    await q.planAnswer(text, { approve: false })
    await q.plan(x, text, id)
    const got = await q.result(x, id)
    assert.equal(got.isError, true)
    assert.match(got.text, /chose to keep planning/)
    assert.equal(got.text.includes('their feedback'), false, 'no feedback was given')
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.match(await planOffText(x), /Plan mode off\./)
  })

  describe('a plan review that is a card in your pile', () => {
    it('PLN-05 Approve on the card: both places clear; the plan is approved', T, async () => {
      const text = tok('05')
      const id = cid('05')
      await q.planAnswer(text, { to_user: true, note: 'your call ' + text })
      const own = await q.plan(x, text, id)
      const card = await q.pileCard(x, 8000)
      assert.ok(card, 'a card for the plan review')
      assert.ok(cardMentions(card, 'Step one. Step two.'), 'the card shows the plan')
      assert.equal((await q.route({ questionId: cardId(card), approve: true })).status, 200)
      assert.match((await q.result(x, id)).text, PLAN.approved)
      await ctx.host.call('waitIdle', { sessionId: x })
      assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'closed')
      assert.ok(await q.noPileCard(x))
      assert.match(await planOffText(x), /already inactive/i)
    })

    it('PLN-06 Keep planning with feedback on the card: the agent sees the feedback; plan mode stays on', T, async () => {
      const text = tok('06')
      const id = cid('06')
      const feedback = 'smaller steps please ' + text
      await q.planAnswer(text, { to_user: true, note: 'n ' + text })
      await q.plan(x, text, id)
      const card = await q.pileCard(x, 8000)
      assert.equal((await q.route({ questionId: cardId(card), feedback })).status, 200)
      const got = await q.result(x, id)
      assert.equal(got.isError, true)
      assert.equal(got.text.includes(PLAN.feedbackPrefix + feedback), true, got.text)
      await ctx.host.call('waitIdle', { sessionId: x })
      assert.match(await planOffText(x), /Plan mode off\./)
    })

    it('PLN-07 you Approve in the session\'s own panel first: approved; the pile card leaves; Fishball\'s late answer is refused; no tag', T, async () => {
      const text = tok('07')
      const id = cid('07')
      await q.planAnswer(text, { to_user: true, note: 'n ' + text })
      await q.plan(y, text, id)
      const qid = await q.questionId(text)
      assert.ok(await q.pileCard(y, 8000))
      assert.equal(await ctx.host.call('qAnswer', { sessionId: y, answers: [{ id: PLAN_REVIEW_ID, selected: [PLAN.approve] }] }), true)
      assert.match((await q.result(y, id)).text, PLAN.approved)
      assert.ok(await q.noPileCard(y))
      assert.equal(refused(await q.fbAnswer({ question_id: qid, approve: true })), true)
      assert.equal(q.tagsOf(id).length, 0)
      await ctx.host.call('waitIdle', { sessionId: y })
      await planOffText(y)
    })

    it('PLN-08 you Discuss in the session: the review is dismissed and the turn ends; plan mode stays on; the pile card leaves; Fishball\'s answer is refused; no tag', T, async () => {
      const text = tok('08')
      const id = cid('08')
      await q.planAnswer(text, { to_user: true, note: 'n ' + text })
      await q.plan(y, text, id)
      const qid = await q.questionId(text)
      const card = await q.pileCard(y, 8000)
      assert.ok(card)
      assert.equal(await ctx.host.call('qDiscuss', { sessionId: y }), true)
      assert.ok(await q.noPileCard(y), 'the pile card left')
      await ctx.host.call('waitIdle', { sessionId: y })
      const r = await resultEvent(y, id)
      assert.match(r?.result.text ?? '', PLAN.dismissed)
      assert.equal(await ctx.host.call('lastTurnEnd', { sessionId: y }) !== null, true, 'the turn ended')
      assert.equal(refused(await q.fbAnswer({ question_id: qid, approve: true })), true)
      assert.equal((await q.route({ questionId: cardId(card), approve: true })).status, 409)
      assert.equal(q.tagsOf(id).length, 0)
      assert.match(await planOffText(y), /Plan mode off\./, 'plan mode stayed on')
    })
  })

  it('PLN-09 bad plan answers are refused and the review stays open', T, async () => {
    const text = tok('09')
    const id = cid('09')
    const own = await q.plan(x, text, id)
    const qid = await q.questionId(text)
    const bad = [
      ['no decision at all', { question_id: qid }],
      ['a label that is not offered', { question_id: qid, answers: [{ id: PLAN_REVIEW_ID, selected: ['Ship it'] }] }],
      ['two labels', { question_id: qid, answers: [{ id: PLAN_REVIEW_ID, selected: [PLAN.approve, PLAN.keep] }] }],
      ['another question id inside', { question_id: qid, answers: [{ id: 'color', selected: ['Blue'] }] }],
      ['an unknown question', { question_id: 'qst_0123456789abcdef', approve: true }],
    ]
    for (const [label, args] of bad) assert.equal(refused(await q.fbAnswer(args)), true, label)
    assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open', 'still open')
    assert.equal(q.tagsOf(id).length, 0)
    assert.equal((await q.fbAnswer({ question_id: qid, approve: true })).json?.ok, true, 'a good answer still works')
    assert.match((await q.result(x, id)).text, PLAN.approved)
    await ctx.host.call('waitIdle', { sessionId: x })
    await planOffText(x)
  })

  it('PLN-10 modes: user refuses Fishball\'s answer and shows the card at once; fishball accepts it', T, async () => {
    await q.mode(QUESTION_MODE.user)
    try {
      const text = tok('10u')
      const id = cid('10u')
      await q.plan(x, text, id)
      const t0 = Date.now()
      const card = await q.pileCard(x, 8000)
      assert.ok(card, 'always the pile')
      assert.ok(Date.now() - t0 < AT_ONCE_MS + 3000)
      const r = await q.fbAnswer({ question_id: cardId(card), approve: true })
      assert.equal(refused(r), true)
      assert.equal(r.json?.code, MODE_USER_CODE, r.result.text)
      assert.equal((await q.route({ questionId: cardId(card), approve: true })).status, 200)
      assert.match((await q.result(x, id)).text, PLAN.approved)
      await ctx.host.call('waitIdle', { sessionId: x })
      await planOffText(x)
    } finally { await q.mode(QUESTION_MODE.fishball) }
    const text = tok('10f')
    const id = cid('10f')
    await q.planAnswer(text, { approve: true })
    await q.plan(x, text, id)
    assert.match((await q.result(x, id)).text, PLAN.approved)
    await ctx.host.call('waitIdle', { sessionId: x })
    await planOffText(x)
    await q.mode(QUESTION_MODE.auto)
  })

  it('PLN-11 a session that is yours: its plan review stays in its own panel; Fishball takes no step', T, async () => {
    const own = await q.yours('pln-yours', PRESET.standard)
    await settledIdle(ctx.host, ctx.fb)
    const before = await q.fbWork()
    const text = tok('11')
    const id = cid('11')
    await q.plan(own, text, id)
    await sleep(QUIET_MS * 2)
    assert.deepEqual(await q.fbWork(), before)
    assert.equal((await q.pile()).length, 0)
    assert.equal(await ctx.host.call('qAnswer', { sessionId: own, answers: [{ id: PLAN_REVIEW_ID, selected: [PLAN.approve] }] }), true)
    assert.match((await q.result(own, id)).text, PLAN.approved)
    await ctx.host.call('waitIdle', { sessionId: own })
  })
})
