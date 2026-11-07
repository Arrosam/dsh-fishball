/**
 * Revision 11 rev11g: a restart with questions open (requirements item 16 as qualified by S36 Q4; DESIGN §7a.10
 * "Restart", "Continued questions", §9 "Session cards", §11 "Revision 11 / Restart"; decisions Q-r11-continued-cards,
 * Q-r11-timed-release). Blocking questions and plan reviews end at a restart: DSH writes "outcome unknown" for the
 * interrupted call, and their cards end too. Timed questions survive in DSH as `continued`; at start the router
 * REBUILDS their pile cards from the userQuestions projection, for managed sessions only. A continued question is
 * answered with userQuestions.answer: the reply is steered into the session as a `user-question-reply` message
 * (it wakes the session; DSH's own behaviour for late replies). One host booted twice; the set-up leaves, before the
 * restart: a blocking question (A), a plan review (D), a timed question in the foreground deciding (B), a timed
 * question already in the pile (B2), another timed one (B3), and a timed question in a session that is yours (C).
 * "At start" is taken literally: no session is resumed by the test before the cards are looked for.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | RST-01  | ST (blocking question and plan review) | no pile card after the start; the old ids answer 409 expired; once resumed the interrupted call has a result saying it was interrupted; the sessions stay managed |
 * | RST-02  | ST (timed questions, managed) | each has a pile card again after the start: kind question, its session, its call id |
 * | RST-03  | EP (timed question in a session that is yours) | no card |
 * | RST-04  | ST (Fishball answers a rebuilt card) | refused `expired` (a rebuilt card is yours; Fishball is not asked again); you answer on the pile: the session gets one user-question-reply message with that call id; the card leaves |
 * | RST-05  | ST (you answer a rebuilt card on the pile) | the route answers 200; the session gets the reply; the card leaves |
 * | RST-06  | ST (you answer the continued question in the session first) | the card leaves without Fishball's help; Fishball's late answer is refused |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PLAN, PRESET, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { A, Q, boot, cardId, qHost, qTools, refused, sleep, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('RST')
const LONG = { timeout: 180000 }

describe('Revision 11 rev11g: a restart with questions open', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let q
  const S = {}
  const T_ = {}
  const ID = {}
  const QID = {}
  const replies = async (sid, callId) => (await q.allEvents(sid)).filter((e) => e.type === 'user/message' && e.source?.kind === 'user-question-reply' && (e.source.callId === callId || e.text.includes(callId)))
  const cardFor = (sid) => until(async () => (await q.pile()).find((c) => c.sessionId === sid && c.kind === 'question') ?? false, 25000, 200)

  before(async () => {
    ctx = await qHost('rev11g-restart')
    q = qTools(ctx, { tok, cid })
    S.a = await q.session('rst-a')
    S.d = await q.session('rst-d', PRESET.standard)
    S.b = await q.session('rst-b', PRESET.askTimed)
    S.b2 = await q.session('rst-b2', PRESET.askTimed)
    S.b3 = await q.session('rst-b3', PRESET.askTimed)
    S.c = await q.yours('rst-c', PRESET.askTimed)
    for (const k of ['a', 'd', 'b', 'b2', 'b3', 'c']) { T_[k] = tok(k); ID[k] = cid(k) }
    // B2 reaches the pile first (approvalAnswerSeconds 1), then the limit goes back to its default.
    await q.t.setLimit({ approvalAnswerSeconds: 1 })
    await q.ask(S.b2, T_.b2, ID.b2, { timeout: 1 })
    assert.ok(await q.pileCard(S.b2, 8000), 'B2 is in the pile before the restart')
    await q.t.setLimit({ approvalAnswerSeconds: 120 })
    await q.ask(S.a, T_.a, ID.a)
    await q.plan(S.d, T_.d, ID.d)
    await q.ask(S.b, T_.b, ID.b, { timeout: 1 })
    await q.ask(S.b3, T_.b3, ID.b3, { timeout: 1 })
    await q.ask(S.c, T_.c, ID.c, { timeout: 120 })
    for (const k of ['a', 'd', 'b', 'b3']) QID[k] = await q.questionId(T_[k])
    await sleep(2500)
    for (const sid of Object.values(S)) await ctx.host.call('flush', { sessionId: sid })
    await ctx.host.stop()
    await boot(ctx)
  }, { timeout: 240000 })
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('RST-01 blocking question and plan review: no card after the start; old ids expired; the interrupted call says so', LONG, async () => {
    await sleep(3000)
    const pile = await q.pile()
    for (const sid of [S.a, S.d]) assert.equal(pile.some((c) => c.sessionId === sid), false, 'no card for a blocking question or plan review')
    for (const k of ['a', 'd']) {
      const r = await q.route(k === 'd' ? { questionId: QID[k], approve: true } : { questionId: QID[k], answers: A.single })
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, 'expired')
    }
    for (const sid of [S.a, S.d]) {
      assert.ok((await ctx.host.state()).managed.some((m) => m.sessionId === sid), 'stays managed')
      await ctx.host.call('resume', { sessionId: sid })
    }
    for (const [k, sid] of [['a', S.a], ['d', S.d]]) {
      const result = (await q.allEvents(sid)).find((e) => e.type === 'tool/result' && e.result.callId === ID[k])
      assert.ok(result, 'the interrupted call has a result')
      assert.match(result.result.text, /interrupted|unknown/i)
    }
    await q.planOff(S.d).catch(() => {})
  })

  it('RST-02 timed questions of managed sessions have their pile cards again after the start', LONG, async () => {
    for (const k of ['b', 'b2', 'b3']) {
      const card = await cardFor(S[k])
      assert.ok(card, k + ' has a card: ' + JSON.stringify(await q.pile()))
      assert.equal(card.sessionId, S[k])
      assert.equal(card.callId, ID[k])
      assert.ok(cardId(card))
      assert.ok(JSON.stringify(card).includes('Which colour?'), 'the question form')
      QID[k] = cardId(card)
    }
  })

  it('RST-03 a timed question in a session that is yours has no card', T, async () => {
    assert.equal((await q.pile()).some((c) => c.sessionId === S.c), false)
  })

  it('RST-04 a rebuilt card is yours: Fishball\'s answer on it is expired (manager-confirmed reading), the card stays', LONG, async () => {
    const r = await q.fbAnswer({ question_id: QID.b, answers: A.single })
    assert.equal(refused(r), true, r.result.text)
    assert.equal(r.json?.code, 'expired')
    assert.ok(await q.pileCard(S.b, 1000), 'the card stays')
    assert.equal((await replies(S.b, ID.b)).length, 0)
    // Fishball may still add a note, and you answer it on the pile.
    const ans = await q.route({ questionId: QID.b, answers: A.single })
    assert.equal(ans.status, 200, ans.text)
    assert.ok(await until(async () => (await replies(S.b, ID.b)).length > 0, 20000, 200), 'the session got the reply')
    assert.equal((await replies(S.b, ID.b)).length, 1, 'once')
    assert.ok(await q.noPileCard(S.b))
  })

  it('RST-05 you answer a rebuilt card on the pile: the route answers 200; the session gets the reply; the card leaves', LONG, async () => {
    const r = await q.route({ questionId: QID.b2, answers: [{ id: 'color', selected: ['Red'] }] })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await replies(S.b2, ID.b2)).length > 0, 20000, 200), 'the session got the reply')
    assert.ok((await replies(S.b2, ID.b2))[0].text.includes('Red'))
    assert.ok(await q.noPileCard(S.b2))
  })

  it('RST-06 you answer the continued question in the session first: the card leaves; Fishball\'s late answer is refused', LONG, async () => {
    await ctx.host.call('resume', { sessionId: S.b3 })
    const out = await ctx.host.call('qContinued', { sessionId: S.b3, callId: ID.b3, answers: [{ id: 'color', selected: ['Red'] }] })
    assert.equal(out.ok, true, JSON.stringify(out))
    assert.equal(out.accepted, true)
    assert.ok(await q.noPileCard(S.b3), 'the card left')
    assert.equal(refused(await q.fbAnswer({ question_id: QID.b3, answers: A.single })), true)
    assert.equal(q.tagsOf(ID.b3).length, 0)
    await ctx.host.call('waitIdle', { sessionId: S.b3 }).catch(() => {})
  })
})
