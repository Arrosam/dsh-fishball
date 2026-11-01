/**
 * Revision 11 rev11g: how a managed session's question travels (DESIGN §7a.10 "The question router", "The race",
 * "Cards", "Time limit", §9 "Session cards"/"Open questions", §10e "Host API"; requirements items 25-26 and "Done when"
 * 8; S36). Blocking (legacy) ask_user_question in a managed session; the session's own card is the browser stand-in.
 * One host; cases run in order.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | FLW-01  | EP (a session that is yours) | the question stays in its own card; Fishball takes no step and gets no intake item; no pile card; your answer is the result |
 * | FLW-02  | EP (managed: routing) | the session's own card opens at once; Fishball is notified with the question, its choices and your latest message in that session; nothing is a pile card yet |
 * | FLW-03  | EP (Fishball answers) | the call's result is the answer batch; the session's own card closes; no pile card; one decisions row answer-question by fishball |
 * | FLW-04  | EP (same batch from Fishball and from the browser) | the tool result texts are identical, byte for byte |
 * | FLW-05  | ST (you answer in the session first) | the result is your batch; Fishball's later answer is refused; no pile card; no tag; Fishball is told without a new step |
 * | FLW-06  | ST (Fishball answered, then you click in the stale own card) | the stand-in card is already closed, so your click finds nothing |
 * | FLW-07  | BVA (approvalAnswerSeconds 1 and 3) | no pile card before about the limit, a pile card after it; the agent keeps waiting; the own card stays open |
 * | FLW-08  | ST (card shown, you answer in the own card) | the pile card leaves; the result is your batch |
 * | FLW-09  | ST (card shown, you answer on the pile card) | the own card closes; the result is the batch; the route answered 200 |
 * | FLW-10  | EP (pile card contents) | kind question, session, the call id (recovered for a legacy call), the question text and choices, a time |
 * | FLW-11  | ST (the turn is stopped with the question open) | the own card closes; the pile card (if any) leaves; Fishball's answer is refused; no tag |
 * | FLW-12  | EP (to_user) | Fishball sends it to you with a note: a pile card at once carrying the note; the own card stays open |
 * | FLW-13  | EP (two questions open in two sessions) | two pile cards; answering one leaves the other |
 * | FLW-14  | DT (route bodies) | bad bodies 400 bad-body, an unknown or settled question id 409 expired; the card stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ANSWER_QUESTION, LIMITS, PRESET } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { A, Q, QUIET_MS, AT_ONCE_MS, cardId, cardMentions, qHost, qTools, refused, resultText, sleep, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('FLW')

describe('Revision 11 rev11g: how a managed session\'s question travels', () => {
  let ctx
  let q
  let x
  let y
  before(async () => {
    ctx = await qHost('rev11g-flow')
    q = qTools(ctx, { tok, cid })
    x = await q.session('flw-x')
    y = await q.session('flw-y')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('FLW-01 a session that is yours: the question stays in its own card; Fishball takes no step', T, async () => {
    const own = await q.yours('flw-yours')
    const text = tok('01')
    const id = cid('01')
    await settledIdle(ctx.host, ctx.fb)
    const before = await q.fbWork()
    await q.ask(own, text, id)
    await sleep(QUIET_MS * 2)
    assert.deepEqual(await q.fbWork(), before, 'no Fishball step, no intake item')
    assert.equal((await q.notices(text)).length, 0)
    assert.equal((await q.pile()).length, 0, 'no pile card')
    assert.equal(await ctx.host.call('qAnswer', { sessionId: own, answers: A.single }), true)
    assert.equal((await q.result(own, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: own })
    assert.deepEqual(await q.fbWork(), before, 'still nothing for Fishball')
  })

  it('FLW-02 managed: the own card opens at once while Fishball is told the question, its choices and your latest message', T, async () => {
    const text = tok('02')
    const id = cid('02')
    const t0 = Date.now()
    const own = await q.ask(x, text, id)
    assert.ok(Date.now() - t0 < AT_ONCE_MS + 3000, 'the own card opened without waiting for Fishball')
    assert.equal(own.timed, false)
    const qid = await q.questionId(text)
    assert.match(qid, /^qst_/)
    const [notice] = await q.notices(text)
    for (const word of ['Which colour?', 'Red', 'Blue', 'ask ' + text]) assert.ok(notice.text.includes(word), 'the notice carries ' + word + ': ' + notice.text.slice(0, 1200))
    assert.equal((await q.pile()).length, 0, 'not a pile card while Fishball decides')
    await q.stop(x)
  })

  it('FLW-03 Fishball answers: the call\'s result is the batch; the own card closes; no pile card; a decisions row', T, async () => {
    const text = tok('03')
    const id = cid('03')
    await q.planAnswer(text, { answers: A.mixed })
    const own = await q.ask(x, text, id, { questions: Q.mixed(text) })
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.mixed))
    await ctx.host.call('waitIdle', { sessionId: x })
    await settledIdle(ctx.host, ctx.fb)
    assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'closed', 'the session\'s own card closed')
    assert.equal((await q.pile()).length, 0)
    const qid = await q.questionId(text)
    const rows = q.decisionsFor(qid)
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].action, 'answer-question')
    assert.equal(rows[0].by, 'fishball')
    assert.equal(rows[0].sessionId, x)
  })

  it('FLW-04 the same batch from Fishball and from the browser gives byte-identical tool results', T, async () => {
    const [viaFishball, viaBrowser] = [tok('04a'), tok('04b')]
    await q.planAnswer(viaFishball, { answers: A.mixed })
    await q.ask(x, viaFishball, cid('04a'), { questions: Q.mixed(viaFishball), waitCard: false })
    const a = await q.result(x, cid('04a'))
    await ctx.host.call('waitIdle', { sessionId: x })
    await q.ask(x, viaBrowser, cid('04b'), { questions: Q.mixed(viaBrowser) })
    assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.mixed }), true)
    const b = await q.result(x, cid('04b'))
    assert.equal(a.text, b.text)
    assert.equal(a.isError, b.isError)
    assert.equal(a.text, resultText(A.mixed))
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('FLW-05 you answer in the session first: your batch is the result; Fishball\'s later answer is refused; no tag; no new Fishball step', T, async () => {
    const text = tok('05')
    const id = cid('05')
    await q.ask(y, text, id)
    const qid = await q.questionId(text)
    await settledIdle(ctx.host, ctx.fb)
    const stepsBefore = (await q.fbWork()).steps
    assert.equal(await ctx.host.call('qAnswer', { sessionId: y, answers: A.single }), true)
    assert.equal((await q.result(y, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: y })
    await sleep(QUIET_MS * 2)
    assert.equal((await q.fbWork()).steps, stepsBefore, 'Fishball is told that you answered without being woken')
    const late = await q.fbAnswer({ question_id: qid, answers: [{ id: 'color', selected: ['Red'] }] })
    assert.equal(refused(late), true, 'already settled: ' + late.result.text)
    assert.equal((await q.pile()).length, 0)
    assert.equal(q.tagsOf(id).length, 0, 'your answer is not Fishball\'s: no tag')
  })

  it('FLW-06 Fishball answered; your click in the stale own card finds nothing', T, async () => {
    const text = tok('06')
    const id = cid('06')
    await q.planAnswer(text, { answers: A.single })
    await q.ask(y, text, id, { waitCard: false })
    await q.result(y, id)
    await ctx.host.call('waitIdle', { sessionId: y })
    assert.equal(await ctx.host.call('qAnswer', { sessionId: y, answers: [{ id: 'color', selected: ['Red'] }] }), false, 'no open card to click')
  })

  for (const seconds of [1, 3]) {
    it(`FLW-07 approvalAnswerSeconds ${seconds}: your pile card only after about ${seconds} s; the agent keeps waiting`, T, async () => {
      await q.t.setLimit({ approvalAnswerSeconds: seconds })
      try {
        const text = tok('07s' + seconds)
        const id = cid('07s' + seconds)
        const t0 = Date.now()
        const own = await q.ask(x, text, id)
        const opened = Date.now()
        await sleep(Math.max(0, seconds * 1000 * 0.6 - (opened - t0)))
        assert.equal((await q.pile()).length, 0, 'no card at 60% of the limit')
        const card = await q.pileCard(x, seconds * 1000 + 6000)
        assert.ok(card, 'a card after the limit')
        assert.ok(Date.now() - opened >= seconds * 1000 * 0.8 - 300, 'not long before the limit: ' + (Date.now() - opened) + ' ms')
        assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open', 'the own card stays open')
        assert.equal((await q.allEvents(x)).some((e) => e.type === 'tool/result' && e.result.callId === id), false, 'the agent keeps waiting')
        assert.equal((await q.route({ questionId: cardId(card), answers: A.single })).status, 200)
        await q.result(x, id)
        await ctx.host.call('waitIdle', { sessionId: x })
      } finally { await q.t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
    })
  }

  describe('a question that is a card in your pile', () => {
    before(async () => { await q.t.setLimit({ approvalAnswerSeconds: 1 }) })
    after(async () => { await q.t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) })

    it('FLW-08 you answer in the session\'s own card: the pile card leaves; the result is your batch', T, async () => {
      const text = tok('08')
      const id = cid('08')
      await q.ask(x, text, id)
      assert.ok(await q.pileCard(x, 6000))
      assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
      assert.ok(await q.noPileCard(x), 'the pile card left')
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
    })

    it('FLW-09 you answer on the pile card: the own card closes; the result is the batch', T, async () => {
      const text = tok('09')
      const id = cid('09')
      const own = await q.ask(x, text, id)
      const card = await q.pileCard(x, 6000)
      const r = await q.route({ questionId: cardId(card), answers: A.single })
      assert.equal(r.status, 200, r.text)
      assert.equal((await q.result(x, id)).text, resultText(A.single))
      await ctx.host.call('waitIdle', { sessionId: x })
      assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'closed')
      assert.ok(await q.noPileCard(x))
    })

    it('FLW-10 the pile card shows the session, the call, the question and its choices, and when', T, async () => {
      const text = tok('10')
      const id = cid('10')
      await q.ask(x, text, id, { questions: Q.mixed(text) })
      const card = await q.pileCard(x, 6000)
      assert.equal(card.kind, 'question')
      assert.equal(card.sessionId, x)
      assert.equal(card.callId, id, 'a legacy call names no call id; the card carries the one recovered from the log')
      for (const word of ['Which colour?', 'Red', 'Blue', 'Docs', 'Tests', 'Code', 'Branch name?', text]) assert.ok(cardMentions(card, word), 'the card shows ' + word + ': ' + JSON.stringify(card).slice(0, 800))
      assert.ok(card.since, 'a time')
      assert.ok(cardId(card), 'an id to answer by')
      await q.stop(x)
    })

    it('FLW-11 the turn is stopped with the question open: the own card closes, the pile card leaves, Fishball\'s answer is refused, no tag', T, async () => {
      const text = tok('11')
      const id = cid('11')
      const own = await q.ask(y, text, id)
      const qid = await q.questionId(text)
      const card = await q.pileCard(y, 6000)
      await q.stop(y)
      assert.ok(await q.noPileCard(y), 'the card left')
      assert.equal((await q.cards(y)).find((c) => c.index === own.index).state, 'closed')
      assert.equal(refused(await q.fbAnswer({ question_id: qid, answers: A.single })), true)
      assert.equal((await q.route({ questionId: cardId(card), answers: A.single })).status, 409)
      assert.equal(q.tagsOf(id).length, 0)
    })
  })

  it('FLW-12 to_user with a note: a pile card at once carrying the note; the own card stays open; you answer on it', T, async () => {
    const text = tok('12')
    const id = cid('12')
    const note = 'only you can pick this ' + text
    await q.planAnswer(text, { to_user: true, note })
    const own = await q.ask(x, text, id)
    const card = await q.pileCard(x, 8000)
    assert.ok(card, 'a card at once, not after 120 s')
    assert.ok(cardMentions(card, note), 'Fishball\'s note on the card: ' + JSON.stringify(card).slice(0, 600))
    assert.equal((await q.cards(x)).find((c) => c.index === own.index).state, 'open')
    assert.equal((await q.route({ questionId: cardId(card), answers: A.single })).status, 200)
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('FLW-13 two questions open in two sessions: two pile cards; answering one leaves the other', T, async () => {
    const [ta, tb] = [tok('13a'), tok('13b')]
    await q.planAnswer(ta, { to_user: true, note: 'a ' + ta })
    await q.planAnswer(tb, { to_user: true, note: 'b ' + tb })
    await q.ask(x, ta, cid('13a'))
    await q.ask(y, tb, cid('13b'))
    const [ca, cb] = [await q.pileCard(x, 8000), await q.pileCard(y, 8000)]
    assert.ok(ca && cb && cardId(ca) !== cardId(cb))
    assert.equal((await q.pile()).filter((c) => c.kind === 'question').length >= 2, true)
    assert.equal((await q.route({ questionId: cardId(ca), answers: A.single })).status, 200)
    assert.ok(await q.noPileCard(x))
    assert.ok(await q.pileCard(y, 1000), 'the other stays')
    assert.equal((await q.route({ questionId: cardId(cb), answers: A.single })).status, 200)
    await q.result(x, cid('13a')); await q.result(y, cid('13b'))
    await ctx.host.call('waitIdle', { sessionId: x }); await ctx.host.call('waitIdle', { sessionId: y })
  })

  it('FLW-14 route bodies: bad bodies 400 bad-body; an unknown or settled question id 409 expired; the card stays', T, async () => {
    const text = tok('14')
    const id = cid('14')
    await q.planAnswer(text, { to_user: true, note: 'n ' + text })
    await q.ask(x, text, id)
    const card = await q.pileCard(x, 8000)
    const qid = cardId(card)
    for (const body of [{}, { questionId: qid }, { questionId: 7, answers: A.single }, { questionId: qid, answers: 'no' }, { answers: A.single }]) {
      const r = await q.route(body)
      assert.equal(r.status, 400, JSON.stringify(body) + ' -> ' + r.text)
      // A body of the wrong shape is bad-body; a well-shaped body whose answers are no valid batch is bad-answer (the route validates "as answer_question is", DESIGN §10e).
      assert.ok(['bad-body', 'bad-answer'].includes(r.json?.code), JSON.stringify(body) + ' -> ' + r.text)
      if (typeof body.questionId !== 'string' || body.answers === undefined) assert.equal(r.json?.code, 'bad-body', JSON.stringify(body))
    }
    const foreign = await q.route({ questionId: qid, answers: A.single }, { headers: { origin: 'http://evil.example' } })
    assert.notEqual(foreign.status, 200, 'a foreign origin is refused')
    const unknown = await q.route({ questionId: 'qst_0123456789abcdef', answers: A.single })
    assert.equal(unknown.status, 409, unknown.text)
    assert.equal(unknown.json?.code, 'expired')
    assert.ok(await q.pileCard(x, 500), 'the card stayed through all of it')
    assert.equal((await q.route({ questionId: qid, answers: A.single })).status, 200)
    await q.result(x, id)
    const again = await q.route({ questionId: qid, answers: A.single })
    assert.equal(again.status, 409)
    assert.equal(again.json?.code, 'expired')
    await ctx.host.call('waitIdle', { sessionId: x })
  })
})
