/**
 * Revision 11 rev11g, FIRST: the held wait of a timed question (DESIGN §7a.10 "Time limit", §14 row rev11g "First,
 * before the rest of the phase", §16 Q-r11-timed-wait, Q-r11-timed-release, Q-r11-continued-cards; S36 choice 3). The
 * router attaches (`userQuestions.attachWait`) and holds a timed question's foreground wait through
 * `approvalAnswerSeconds` although the tool's own `timeout` is shorter, and keeps holding once the question is a card in
 * your pile, so the session waits in the SAME turn until you answer. Black-box: the tool result of the call never
 * becomes the `pending` result, no `user-question-reply` message starts a new turn, and the answer arrives as the call's
 * result. approvalAnswerSeconds and the call's `timeout` are in whole seconds, so the timings below are seconds.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | HLD-01  | BVA (timeout 1 s < approvalAnswerSeconds 6 s; Fishball answers at about 3 s) | no pending result at 1 s+; the session's own card still open; Fishball's answer is the call's result in the same turn |
 * | HLD-02  | BVA (timeout 1 s, approvalAnswerSeconds 2 s; nobody answers) | the pile card exists after 2 s; the call has no result 3 s later (timeout passed twice); you answer on the card: the call's result, same turn, own card closed |
 * | HLD-03  | BVA (timeout 2 s > approvalAnswerSeconds 1 s) | card after 1 s; still no result after the tool's own 2 s; the answer is the same turn's result |
 * | HLD-04  | EP (timeout -1: the foreground wait has no limit) | Fishball's answer within approvalAnswerSeconds is the call's result |
 * | HLD-05  | EP (default timeout 120 s, Fishball answers at once) | the answer is the call's result in the same turn (no pending) |
 * | HLD-06  | ST (you answer in the session's own card while held) | the call's result; the pile card (if any) leaves; Fishball's late answer is refused |
 * | HLD-07  | ST (the turn is stopped while held) | the card leaves, the own card closes, a late answer is refused; no pending result is recorded as an answer |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_USER_QUESTION, LIMITS, PRESET, QUESTION_API } from './support/constants.mjs'
import { HOOK, T, settledIdle } from './support/expect.mjs'
import { A, Q, cardId, qHost, qTools, refused, resultText, sleep, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('HLD')

describe('Revision 11 rev11g: the held wait of a timed question', () => {
  let ctx
  let q
  let x
  before(async () => {
    ctx = await qHost('rev11g-hold')
    q = qTools(ctx, { tok, cid })
    x = await q.session('hld-x', PRESET.askTimed)
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  const setSeconds = (n) => q.t.setLimit({ approvalAnswerSeconds: n })
  /** The call's result event, or undefined while the call is still waiting. */
  const resultNow = async (sid, id) => (await q.allEvents(sid)).find((e) => e.type === 'tool/result' && e.result.callId === id)
  const replies = async (sid) => (await q.allEvents(sid)).filter((e) => e.type === 'user/message' && e.source?.kind === 'user-question-reply')
  const turnEnds = async (sid) => (await q.allEvents(sid)).filter((e) => e.type === 'turn/end').length
  const isPending = (r) => /"pending"\s*:\s*true/.test(r?.text ?? '')
  after(async () => { await setSeconds(LIMITS.approvalAnswerSeconds.default).catch(() => {}) })

  it('HLD-01 timeout 1 s, approvalAnswerSeconds 6 s: the wait outlives the tool timeout; Fishball answers in the same turn', T, async () => {
    await setSeconds(6)
    const text = tok('01')
    const id = cid('01')
    const endsBefore = await turnEnds(x)
    const t0 = Date.now()
    const own = await q.ask(x, text, id, { timeout: 1 })
    assert.equal(own.timed, false, 'the session\'s own card is passed on untimed, so it shows no countdown (S36-attachWait amendment, manager 2026-11-02)')
    await sleep(Math.max(0, 2200 - (Date.now() - t0)))
    assert.equal(await resultNow(x, id), undefined, 'no result after the tool\'s own 1 s timeout')
    assert.equal((await q.cards(x)).at(-1).state, 'open', 'the session\'s own card is still open')
    assert.equal((await q.pile()).length, 0, 'not yet your card: Fishball still has until 6 s')
    const r = await q.fbAnswer({ question_id: await q.questionId(text), answers: A.single })
    assert.equal(r.json?.ok, true, JSON.stringify(r.json))
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single), 'the answer, not the pending result')
    assert.equal(isPending(got), false)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await replies(x)).length, 0, 'no late-reply message: the answer was the call\'s own result')
    assert.equal(await turnEnds(x), endsBefore + 1, 'one turn')
  })

  it('HLD-02 timeout 1 s, approvalAnswerSeconds 2 s: the question is your card after 2 s and the wait is still held after it', T, async () => {
    await setSeconds(2)
    const text = tok('02')
    const id = cid('02')
    const t0 = Date.now()
    const own = await q.ask(x, text, id, { timeout: 1 })
    const card = await q.pileCard(x, 6000)
    assert.ok(card, 'the question moved to your pile: ' + JSON.stringify(await q.pile()))
    assert.ok(Date.now() - t0 >= 1700, 'not before about approvalAnswerSeconds: ' + (Date.now() - t0) + ' ms')
    await sleep(3000)
    assert.equal(await resultNow(x, id), undefined, 'still no result 3 s after the move (the tool timeout passed twice)')
    assert.equal((await q.cards(x)).at(-1).state, 'open', 'the session\'s own card is still open')
    assert.deepEqual((await ctx.host.call('qProjection', { sessionId: x }))?.active?.filter?.((c) => c.state === 'continued') ?? [], [], 'DSH never marked it continued')
    const r = await q.route({ questionId: cardId(card), answers: A.single })
    assert.equal(r.status, 200, r.text)
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await replies(x)).length, 0, 'same turn, no reply message')
    assert.ok(await q.noPileCard(x), 'the card left')
    assert.equal((await q.cards(x)).at(-1).state, 'closed', 'your answer closed the session\'s own card')
    assert.ok(own)
  })

  it('HLD-03 timeout 2 s, approvalAnswerSeconds 1 s: card after 1 s; still held after the tool\'s own 2 s', T, async () => {
    await setSeconds(1)
    const text = tok('03')
    const id = cid('03')
    await q.ask(x, text, id, { timeout: 2 })
    const card = await q.pileCard(x, 5000)
    assert.ok(card, 'your card')
    await sleep(2800)
    assert.equal(await resultNow(x, id), undefined, 'no result after the tool timeout')
    assert.equal((await q.route({ questionId: cardId(card), answers: A.single })).status, 200)
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await replies(x)).length, 0)
  })

  it('HLD-04 timeout -1 (no foreground limit): a blocking-style wait; Fishball answers within approvalAnswerSeconds', T, async () => {
    await setSeconds(8)
    const text = tok('04')
    const id = cid('04')
    await q.ask(x, text, id, { timeout: -1 })
    const r = await q.fbAnswer({ question_id: await q.questionId(text), answers: A.single })
    assert.equal(r.json?.ok, true, JSON.stringify(r.json))
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('HLD-05 default timeout 120 s, Fishball answers at once: the answer is the same turn\'s result', T, async () => {
    await setSeconds(LIMITS.approvalAnswerSeconds.default)
    const text = tok('05')
    const id = cid('05')
    await q.planAnswer(text, { answers: A.single })
    const t0 = Date.now()
    await q.ask(x, text, id, { waitCard: false })
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.single))
    assert.ok(Date.now() - t0 < 15000)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await replies(x)).filter((m) => m.text.includes(id)).length, 0)
  })

  it('HLD-06 you answer in the session\'s own card while the wait is held: the call\'s result; Fishball\'s late answer is refused', T, async () => {
    await setSeconds(6)
    const text = tok('06')
    const id = cid('06')
    await q.ask(x, text, id, { timeout: 1 })
    const qid = await q.questionId(text)
    await sleep(1500)
    assert.equal(await ctx.host.call('qAnswer', { sessionId: x, answers: A.single }), true)
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    assert.equal(refused(await q.fbAnswer({ question_id: qid, answers: A.single })), true, 'already settled')
    assert.equal((await q.pile()).filter((c) => c.sessionId === x).length, 0)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('HLD-07 the turn is stopped while the wait is held: the card leaves, the own card closes, a late answer is refused', T, async () => {
    await setSeconds(2)
    const text = tok('07')
    const id = cid('07')
    await q.ask(x, text, id, { timeout: 1 })
    const qid = await q.questionId(text)
    const card = await q.pileCard(x, 6000)
    assert.ok(card)
    await q.stop(x)
    assert.ok(await q.noPileCard(x), 'the card left')
    assert.equal((await q.cards(x)).at(-1).state, 'closed')
    assert.equal(refused(await q.fbAnswer({ question_id: qid, answers: A.single })), true)
    const r = await q.route({ questionId: cardId(card), answers: A.single })
    assert.equal(r.status, 409, r.text)
    assert.equal(r.json?.code, 'expired')
    const result = await resultNow(x, id)
    assert.ok(!result || !result.result.text.includes('"answers"'), 'no answer was recorded for the stopped call')
  })
})
