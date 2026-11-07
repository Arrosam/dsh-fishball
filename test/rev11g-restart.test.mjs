/**
 * Revision 11 rev11g on H-STUB: a restart with questions open (requirements item 16 as qualified by S36 Q4; DESIGN
 * §7a.10 "Restart", "Continued questions", §11; slim T08 "Persistence and restart", §12; contract 1.1 §3.3 "after a
 * reconnect … a fresh handshake", §4.5 CARD_CLOSED / RECORD_ITEM, §5.1 "a reconnect is a clean slate for offers").
 * Blocking questions and plan reviews end at a restart, and their cards end too. A timed question becomes
 * `continued` in DSH once nobody holds its wait (here: the instance detached, §7a.10 "When Fishball stops holding");
 * it survives the restart and is answerable again in its session, but it is yours: the instance is not asked again.
 * One host booted twice; the set-up leaves, before the restart: a blocking question offered to the instance (A), a
 * plan review offered to it (D), a blocking question it sent to you with toUser (E), two continued timed questions
 * of managed sessions (B, B3), and a continued timed question in a session that is yours (C). "At start" is taken
 * literally: no session is resumed before the instance's view is read.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | RST-01  | ST (blocking question, plan review, one sent to you) | §7a.10 Restart; §5.1; slim T08 | none is offered after the new handshake; their old ids answer expired; the one that was yours is reported closed "DSH restarted…" (CARD_CLOSED); once resumed each interrupted call has an error result and no answer; the sessions stay managed |
 * | RST-02  | ST (continued timed questions, managed) | §7a.10 "rebuilt … at start"; slim T08 "answerable again" | not offered to the instance again; DSH still holds each as continued; the instance is not told they closed |
 * | RST-03  | EP (continued timed question in a session that is yours) | §7a.10 "for managed sessions" | the instance hears nothing about it, before or after the restart |
 * | RST-04  | ST (the instance answers a rebuilt question) | §7a.10 "Rebuilt cards are yours" | refused expired; you answer in the session: one user-question-reply message with that call id; the instance gets a card record by user, outcome answered, for that session |
 * | RST-06  | ST (you answer the continued question in the session) | §7a.10 Continued questions | accepted; the instance's late answer is refused |
 *
 * Retired:
 * - RST-05: it answered a rebuilt card on the pile route; the pile and its question route are deleted (slim §12). Answering a rebuilt question in its session is RST-04/06.
 * - RST-02's "pile card again … kind question, its call id": the pile is no longer a place the user answers session questions (slim §12); what remains observable is that the question is answerable again in its session and is not the instance's.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PRESET } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import { A, Q, QSTUB, bootQ, codeOf, qTools, quiet, restartQ, tokens, until } from './support/instance-stub-questions.mjs'

const { tok, cid } = tokens('RST')
const LONG = { timeout: 180000 }
const RED = [{ id: 'color', selected: ['Red'] }]
const CONTINUED = 'continued'

describe('Revision 11 rev11g on H-STUB: a restart with questions open', () => {
  const ctx = {}
  let q
  const S = {}
  const T_ = {}
  const ID = {}
  const QID = {}
  /** The rebuilt questions' state in DSH's own projection (the session must be live). */
  const continuedCalls = async (sid) => ((await q.host().call('qProjection', { sessionId: sid }))?.active ?? []).filter((c) => c.state === CONTINUED).map((c) => c.callId)

  before(async () => {
    Object.assign(ctx, await bootQ('rev11g-restart'))
    q = qTools(ctx)
    S.a = await q.session('rst-a')
    S.d = await q.session('rst-d', PRESET.standard)
    S.e = await q.session('rst-e')
    S.b = await q.session('rst-b', PRESET.askTimed)
    S.b3 = await q.session('rst-b3', PRESET.askTimed)
    S.c = await q.yours('rst-c', PRESET.askTimed)
    for (const k of Object.keys(S)) { T_[k] = tok(k); ID[k] = cid(k) }
    // B and B3 become continued: their wait is held for the instance until it detaches; then DSH's timer ends the
    // foreground wait (the tool's 1 s has passed) and the question is continued (§7a.10).
    for (const k of ['b', 'b3']) QID[k] = (await q.ask(S[k], T_[k], ID[k], { questions: Q.single(T_[k]), timeout: 1 })).offer.approvalId
    await q.stub().detach()
    for (const k of ['b', 'b3']) assert.ok(await until(async () => (await continuedCalls(S[k])).includes(ID[k]), QSTUB.resultWaitMs, QSTUB.pollMs), k + ' is continued before the restart')
    assert.ok((await q.stub().attach()).ok, 'attached again')
    await q.ask(S.c, T_.c, ID.c, { questions: Q.single(T_.c), timeout: 1, offer: false })
    assert.ok(await until(async () => (await continuedCalls(S.c)).includes(ID.c), QSTUB.resultWaitMs, QSTUB.pollMs), 'c is continued before the restart')
    QID.a = (await q.ask(S.a, T_.a, ID.a, { questions: Q.single(T_.a) })).offer.approvalId
    QID.d = (await q.plan(S.d, T_.d, ID.d)).offer.approvalId
    QID.e = (await q.ask(S.e, T_.e, ID.e, { questions: Q.single(T_.e) })).offer.approvalId
    assert.deepEqual((await q.answer(S.e, QID.e, { toUser: true, note: 'yours ' + T_.e })).payload, { accepted: true })
    for (const sid of Object.values(S)) await q.host().call('flush', { sessionId: sid })
    await restartQ(ctx)
    await quiet()
  }, { timeout: 240000 })
  after(async () => { await stopStub(ctx.booted) }, HOOK)

  it('RST-01 blocking question, plan review and one sent to you end at the restart; the interrupted calls say so', LONG, async () => {
    for (const k of ['a', 'd', 'e']) {
      assert.deepEqual(await q.listed(S[k]), [], k + ': not offered after the new handshake')
      const r = await q.answer(S[k], QID[k], k === 'd' ? { approve: true } : { answers: A.single })
      assert.equal(codeOf(r), QSTUB.code.expired, k + ': ' + JSON.stringify(r))
      assert.ok(await q.isManaged(S[k]), k + ' stays managed')
    }
    assert.ok(await q.waitMarker('closed', QID.e), 'the question that was yours is reported closed (slim T08: closed with the restart reason)')
    for (const k of ['a', 'd', 'e']) {
      await q.host().call('resume', { sessionId: S[k] })
      const result = await q.resultNow(S[k], ID[k])
      assert.ok(result, k + ': the interrupted call has a result')
      assert.equal(result.isError, true, k + ': an error, not an answer')
      // DESIGN §7a.10 quotes DSH's wording as "outcome unknown"; what matters here is that no answer is recorded.
      assert.match(result.text, /interrupted|unknown|abort/i, k + ': ' + result.text)
    }
    await q.planOff(S.d).catch(() => {})
  })

  it('RST-02 continued timed questions of managed sessions are answerable again in their sessions, not offered to the instance', LONG, async () => {
    for (const k of ['b', 'b3']) {
      assert.deepEqual(await q.listed(S[k]), [], k + ': not the instance\'s again')
      assert.deepEqual(await q.markers('closed', QID[k]), [], k + ': not reported closed: it survives')
      await q.host().call('resume', { sessionId: S[k] })
      assert.ok((await continuedCalls(S[k])).includes(ID[k]), k + ': DSH still holds it as continued')
    }
  })

  it('RST-03 a continued timed question in a session that is yours: the instance hears nothing about it', T, async () => {
    assert.equal(await q.toldAbout(T_.c), false)
  })

  it('RST-04 a rebuilt question is yours: the instance\'s answer is expired; you answer in the session; it is told', LONG, async () => {
    const r = await q.answer(S.b, QID.b, { answers: A.single })
    assert.equal(codeOf(r), QSTUB.code.expired, JSON.stringify(r))
    assert.equal((await q.replies(S.b, ID.b)).length, 0, 'nothing reached the session')
    const out = await q.host().call('qContinued', { sessionId: S.b, callId: ID.b, answers: RED })
    assert.deepEqual(out, { ok: true, accepted: true }, JSON.stringify(out))
    assert.ok(await until(async () => (await q.replies(S.b, ID.b)).length > 0, QSTUB.resultWaitMs, QSTUB.pollMs), 'the session got the reply')
    assert.equal((await q.replies(S.b, ID.b)).length, 1, 'once')
    assert.ok((await q.replies(S.b, ID.b))[0].text.includes('Red'))
    // A rebuilt question is re-filed under an id of its own (slim T08), and a late reply records no words (T08
    // "Limits"), so the record is found by its session.
    const record = await q.recordFrom(S.b)
    assert.equal(record?.by, QSTUB.record.by.user, 'a card record by user: ' + JSON.stringify(record))
    assert.equal(record.outcome, QSTUB.record.outcome.answered)
  })

  it('RST-06 you answer the continued question in the session: accepted; the instance\'s late answer is refused', LONG, async () => {
    const out = await q.host().call('qContinued', { sessionId: S.b3, callId: ID.b3, answers: RED })
    assert.deepEqual(out, { ok: true, accepted: true }, JSON.stringify(out))
    assert.ok(QSTUB.lateCodes.includes(codeOf(await q.answer(S.b3, QID.b3, { answers: A.single }))))
    await q.waitIdle(S.b3).catch(() => {})
  })
})
