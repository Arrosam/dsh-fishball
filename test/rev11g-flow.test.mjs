/**
 * Revision 11 rev11g on H-STUB: how a managed session's question travels (DESIGN §7a.10 "The question router",
 * "The race", "Time limit", §9 "Open questions"; contract 1.1 §4.2 question.answer, §4.5 inbox markers, §5
 * approval.request / approval.settled; connector.md C1-DT-06; slim §12). Blocking (legacy) ask_user_question in a
 * managed session; the session's own card is the worker's stand-in; Fishball is the stub instance. One host;
 * cases run in order.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | FLW-01  | EP (a session that is yours) | §7a.10 Routing | the question stays in its own card; the instance gets no offer and no notice; your answer is the result |
 * | FLW-02  | EP (managed: routing) | §7a.10 Routing; C1-DT-06 | the own card opens at once; the instance gets approval.request kind question with the questions and choices, and an approval notice carrying them and your latest message in that session |
 * | FLW-03  | EP (the instance answers) | §4.2; §9 decisions | {accepted:true}; the call's result is the batch; the own card closes; approval.settled by fishball; one decisions row answer-question by fishball |
 * | FLW-04  | EP (same batch from the instance and from the session's card) | §7a.10 "the browser's exact shape" | byte-identical tool results |
 * | FLW-05  | ST (you answer in the session first) | §7a.10 The race; §4.2 | your batch is the result; the instance's later answer is refused (expired / already-settled); it is told: approval.settled by user and a card record by user with your label |
 * | FLW-06  | ST (the instance answered, then you click the stale own card) | §7a.10 The race | the own card is already closed: your click finds nothing |
 * | FLW-07  | BVA (approvalAnswerSeconds 1 and 3) | §7a.10 Time limit | still the instance's before about the limit (its answer is accepted up to then); after it the question leaves the instance (approval.settled; its answer is refused expired); the agent keeps waiting; the own card stays open |
 * | FLW-08  | ST (after the limit, you answer in the own card) | §7a.10 Cards; slim §12 | the result is your batch |
 * | FLW-10  | EP (offer contents) | §5.1; §7a.10 "Legacy questions name no call" | kind question; the envelope names the session; callId recovered for the legacy call; every question, option and the question text; at and expiresAt = at + approvalAnswerSeconds |
 * | FLW-11  | ST (your Stop with the question open) | §7a.10 The race; slim T08/T09; instance.md I7-EP-06 | the own card closes; the instance's answer is refused; it gets a closure note (CARD_CLOSED or a card record with outcome closed) |
 * | FLW-12  | EP (toUser with a note) | §4.2 toUser/note | {accepted:true}; the question leaves the instance (settled escalate) and stays in its own card; a later answer by the instance is refused; you answer there: the result is your batch; the instance gets QUESTION_ANSWER and a record carrying your words |
 * | FLW-13  | EP (two questions open in two sessions) | §4.2; §4.2 approval.list | each session's approval.list holds its own question; answering one leaves the other answerable |
 *
 * Retired:
 * - FLW-09: the pile's question form and its route are deleted (slim §12): the user answers a session question only on DSH's question card in its own session.
 * - FLW-14: same reason: the `/api/fishball/questions/answer` route it exercised is gone (slim §12); refused answers are covered on question.answer (rev11g-validate).
 * - The "no tag" and "Fishball takes no step" parts: tag records were removed (slim T15) and Fishball's in-process session with its model requests no longer exists (slim §12).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_USER_QUESTION, LIMITS } from './support/constants.mjs'
import { HOOK, T, untrustedBlock } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, assertStillOpen, bootQ, codeOf, qTools, quiet, resultText, sleep, tokens, turnText } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('FLW')
const RED = [{ id: 'color', selected: ['Red'] }]

describe('Revision 11 rev11g on H-STUB: how a managed session\'s question travels', () => {
  const ctx = {}
  let q
  let x
  let y
  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-flow'))
    q = qTools(ctx)
    x = await q.session('flw-x')
    y = await q.session('flw-y')
  }, HOOK)
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  it('FLW-01 a session that is yours: the question stays in its own card; the instance hears nothing', T, async () => {
    const own = await q.yours('flw-yours')
    const text = tok('01')
    const id = cid('01')
    await q.ask(own, text, id, { questions: Q.single(text), offer: false })
    await quiet()
    assert.equal(await q.toldAbout(text), false, 'no offer and no notice for a session that is yours')
    assert.equal(await q.qAnswer(own, A.single), true)
    assert.equal((await q.result(own, id)).text, resultText(A.single))
    await q.waitIdle(own)
    assert.equal(await q.toldAbout(text), false, 'still nothing for the instance')
  })

  it('FLW-02 managed: the own card opens at once; the instance is offered the question and told your latest message', T, async () => {
    const text = tok('02')
    const id = cid('02')
    const t0 = Date.now()
    const { card, offer } = await q.ask(x, text, id, { questions: Q.single(text) })
    assert.ok(Date.now() - t0 < QSTUB.atOnceMs, 'the own card opened without waiting for the instance')
    assert.ok(offer, 'approval.request reached the instance')
    assert.equal(offer.kind, QSTUB.kind.question)
    assert.match(offer.approvalId, /^qst_/)
    assert.deepEqual(offer.questions.map((x2) => x2.id), ['color'])
    assert.deepEqual(offer.choices, ['Red', 'Blue'])
    const notice = await q.noticeOf(offer.approvalId)
    assert.ok(notice, 'an approval notice names the question id')
    assert.equal(notice.sourceSessionId, x)
    const block = untrustedBlock(notice.text)
    for (const word of ['Which colour?', 'Red', 'Blue']) assert.ok(block?.inner?.includes(word), 'the notice carries ' + word + ': ' + notice.text.slice(0, 1200))
    assert.ok(block.inner.includes(turnText(ASK_USER_QUESTION, text)), 'the notice carries your latest message in that session')
    assert.equal(await q.cardState(x, card.index), QSTUB.card.open)
    await q.userStop(x)
  })

  it('FLW-03 the instance answers: accepted; the result is the batch; the own card closes; settled by fishball; a decisions row', T, async () => {
    const text = tok('03')
    const id = cid('03')
    const { card, offer } = await q.ask(x, text, id, { questions: Q.mixed(text) })
    const r = await q.answer(x, offer.approvalId, { answers: A.mixed })
    assert.deepEqual(r.payload, { accepted: true }, JSON.stringify(r))
    assert.equal((await q.result(x, id)).text, resultText(A.mixed))
    await q.waitIdle(x)
    assert.notEqual(await q.cardState(x, card.index), QSTUB.card.open, 'the session\'s own card closed')
    assert.ok(await q.settled(offer.approvalId, { by: QSTUB.by.fishball }), 'approval.settled by fishball')
    const rows = q.decisions({ target: offer.approvalId })
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].action, QSTUB.action.answer)
    assert.equal(rows[0].by, QSTUB.by.fishball)
    assert.equal(rows[0].sessionId, x)
  })

  it('FLW-04 the same batch from the instance and from the session\'s card gives byte-identical results', T, async () => {
    const [ta, tb] = [tok('04a'), tok('04b')]
    const [ida, idb] = [cid('04a'), cid('04b')]
    const { offer } = await q.ask(x, ta, ida, { questions: Q.mixed(ta) })
    await q.answer(x, offer.approvalId, { answers: A.mixed })
    const a = await q.result(x, ida)
    await q.waitIdle(x)
    await q.ask(x, tb, idb, { questions: Q.mixed(tb) })
    assert.equal(await q.qAnswer(x, A.mixed), true)
    const b = await q.result(x, idb)
    assert.equal(a.text, b.text)
    assert.equal(a.isError, b.isError)
    assert.equal(a.text, resultText(A.mixed))
    await q.waitIdle(x)
  })

  it('FLW-05 you answer in the session first: your batch; the instance\'s late answer is refused; it is told with your words', T, async () => {
    const text = tok('05')
    const id = cid('05')
    const { offer } = await q.ask(y, text, id, { questions: Q.single(text) })
    assert.equal(await q.qAnswer(y, A.single), true)
    assert.equal((await q.result(y, id)).text, resultText(A.single))
    await q.waitIdle(y)
    assert.ok(await q.settled(offer.approvalId, { by: QSTUB.by.user }), 'approval.settled by user')
    const record = await q.record(offer.approvalId)
    assert.equal(record?.by, QSTUB.record.by.user, JSON.stringify(record))
    assert.equal(record.outcome, QSTUB.record.outcome.answered)
    assert.ok(JSON.stringify(record).includes('Blue'), 'the record carries your words (slim T09 revised)')
    const late = await q.answer(y, offer.approvalId, { answers: RED })
    assert.ok(QSTUB.lateCodes.includes(codeOf(late)), 'refused: ' + JSON.stringify(late))
  })

  it('FLW-06 the instance answered; your click in the stale own card finds nothing', T, async () => {
    const text = tok('06')
    const id = cid('06')
    const { offer } = await q.ask(y, text, id, { questions: Q.single(text) })
    await q.answer(y, offer.approvalId, { answers: A.single })
    await q.result(y, id)
    await q.waitIdle(y)
    assert.equal(await q.qAnswer(y, RED), false, 'no open card to click')
  })

  for (const seconds of [1, 3]) {
    it(`FLW-07 approvalAnswerSeconds ${seconds}: the question leaves the instance only after about ${seconds} s; the agent keeps waiting`, T, async () => {
      await q.setSeconds(seconds)
      try {
        const text = tok('07s' + seconds)
        const id = cid('07s' + seconds)
        const { card, offer } = await q.ask(x, text, id, { questions: Q.single(text) })
        const limitMs = seconds * QSTUB.secondMs
        assert.equal(offer.expiresAt - offer.at, limitMs, 'the offer expires at the limit')
        const left = await q.settled(offer.approvalId, { timeoutMs: limitMs + QSTUB.limitLateMs })
        assert.ok(left, 'the question left the instance after the limit')
        const settledAt = (await q.stub().events(QSTUB.event.approvalSettled)).find((f) => f.payload.approvalId === offer.approvalId).at
        assert.ok(settledAt - offer.at >= limitMs * QSTUB.limitEarlyShare - QSTUB.limitSlackMs, 'not long before the limit: ' + (settledAt - offer.at) + ' ms')
        assert.equal(codeOf(await q.answer(x, offer.approvalId, { answers: A.single })), QSTUB.code.expired, 'the instance\'s late answer is refused')
        await assertStillOpen(q, x, card, id, 'after the limit')
        assert.equal(await q.qAnswer(x, A.single), true)
        assert.equal((await q.result(x, id)).text, resultText(A.single))
        await q.waitIdle(x)
      } finally { await q.setSeconds(LIMITS.approvalAnswerSeconds.default) }
    })
  }

  it('FLW-08 after the limit, you answer in the session\'s own card: the result is your batch', T, async () => {
    await q.setSeconds(1)
    try {
      const text = tok('08')
      const id = cid('08')
      const { offer } = await q.ask(x, text, id, { questions: Q.single(text) })
      assert.ok(await q.settled(offer.approvalId, { timeoutMs: QSTUB.limitLateMs }), 'the question left the instance')
      assert.equal(await q.qAnswer(x, RED), true)
      assert.equal((await q.result(x, id)).text, resultText(RED))
      await q.waitIdle(x)
    } finally { await q.setSeconds(LIMITS.approvalAnswerSeconds.default) }
  })

  it('FLW-10 the offer shows the session, the recovered call id, every question and choice, and when', T, async () => {
    const text = tok('10')
    const id = cid('10')
    await q.ask(x, text, id, { questions: Q.mixed(text) })
    const frame = await q.stub().waitEvent(QSTUB.event.approvalRequest, (p) => p.callId === id)
    assert.equal(frame.sessionId, x, 'the envelope names the asking session')
    const offer = frame.payload
    assert.equal(offer.kind, QSTUB.kind.question)
    assert.equal(offer.callId, id, 'a legacy call names no call id; the offer carries the one recovered from the log')
    assert.equal(offer.toolName, ASK_USER_QUESTION)
    for (const word of ['Which colour?', 'Red', 'Blue', 'Docs', 'Tests', 'Code', 'Branch name?', text]) assert.ok(JSON.stringify(offer.questions).includes(word), 'the offer shows ' + word)
    assert.equal(offer.questions.find((x2) => x2.id === 'parts').multiSelect, true, 'multi_select travels as multiSelect')
    assert.ok(Number.isInteger(offer.at) && offer.at > 0, 'a time')
    assert.equal(offer.expiresAt - offer.at, LIMITS.approvalAnswerSeconds.default * QSTUB.secondMs)
    await q.userStop(x)
  })

  it('FLW-11 your Stop with the question open: the own card closes; the instance\'s answer is refused; it gets a closure note', T, async () => {
    const text = tok('11')
    const id = cid('11')
    const { card, offer } = await q.ask(y, text, id, { questions: Q.single(text) })
    await q.userStop(y)
    assert.equal(await q.cardState(y, card.index), QSTUB.card.closed)
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(y, offer.approvalId, { answers: A.single }))), 'refused')
    // The connector's own notice promises it ("if the user answers there first, or the session stops, you get a
    // note"), and a card closed without an answer reaches the instance as [card closed …] (slim T09, T08 records).
    const closed = (await q.waitMarker('closed', offer.approvalId)) || (await q.record(offer.approvalId, QSTUB.quietMs))
    assert.ok(closed, 'a CARD_CLOSED item or a closed card record for ' + offer.approvalId + ': ' + JSON.stringify((await q.stub().received()).slice(-4)))
  })

  it('FLW-12 toUser with a note: it leaves the instance and stays in its own card; you answer there; the instance gets your words', T, async () => {
    const text = tok('12')
    const id = cid('12')
    const note = 'only you can pick this ' + text
    const { card, offer } = await q.ask(x, text, id, { questions: Q.single(text) })
    assert.deepEqual((await q.answer(x, offer.approvalId, { toUser: true, note })).payload, { accepted: true })
    assert.ok(await q.settled(offer.approvalId, { decision: QSTUB.decision.escalate }), 'approval.settled escalate')
    await assertStillOpen(q, x, card, id, 'sent to you')
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(x, offer.approvalId, { answers: A.single }))), 'no longer the instance\'s to answer')
    assert.equal(await q.qAnswer(x, A.single), true)
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    await q.waitIdle(x)
    assert.ok(await q.waitMarker('answer', offer.approvalId), 'a QUESTION_ANSWER item for the question it sent you')
    const record = await q.record(offer.approvalId)
    assert.ok(JSON.stringify(record ?? {}).includes('Blue'), 'the record carries your words: ' + JSON.stringify(record))
  })

  it('FLW-13 two questions open in two sessions: each is listed for its session; answering one leaves the other', T, async () => {
    const [ta, tb] = [tok('13a'), tok('13b')]
    const [ia, ib] = [cid('13a'), cid('13b')]
    const a = await q.ask(x, ta, ia, { questions: Q.single(ta) })
    const b = await q.ask(y, tb, ib, { questions: Q.single(tb) })
    assert.notEqual(a.offer.approvalId, b.offer.approvalId)
    assert.deepEqual(await q.listed(x), [a.offer.approvalId], 'x lists its own question only')
    assert.deepEqual(await q.listed(y), [b.offer.approvalId], 'y lists its own question only')
    assert.deepEqual((await q.answer(x, a.offer.approvalId, { answers: A.single })).payload, { accepted: true })
    await sleep(QSTUB.quietMs)
    assert.deepEqual(await q.listed(y), [b.offer.approvalId], 'the other stays')
    assert.deepEqual((await q.answer(y, b.offer.approvalId, { answers: A.single })).payload, { accepted: true })
    assert.ok(await q.result(x, ia)); assert.ok(await q.result(y, ib))
    await q.waitIdle(x); await q.waitIdle(y)
  })
})
