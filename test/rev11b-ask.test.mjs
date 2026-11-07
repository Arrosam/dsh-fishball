/**
 * Revision 11 rev11b: ask_fishball and the instance's answers, on the H-STUB harness (DESIGN §7a.2, §7a.3,
 * §7a.5, §7a.6 "To-you ticket", §9 audit; contract §4.2 approval.answer, §5 events, §5.1 descriptor, §9 "No
 * instance attached"; docs/test-design/connector.md C1-DT-02, C1-EP-02, C1-ST-08; slim-native-design §12).
 * The in-process Fishball and its answer_approval tool are gone: the fake instance (fbtest-stub-instance)
 * receives the request as an `approval.request` event plus an `approval`-kind `inbox.push`, and answers with
 * `approval.answer`. "Fishball off" is now "no instance attached" (detach, or the transport closed), since the
 * Permission requests switch is gone (slim §12: permission requests are always on). A card that goes to the
 * user is answered on its session's ask_fishball row, i.e. POST /api/fishball/requests/answer (§10e).
 * One host; cases run in order. Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | ASK-01  | EP (allow; C1-DT-02) | §7a.2, §7a.3, contract §5.1 | {ok:true, code:'allowed', request_id}; one approval notice whose header says the session asked first (ask_fishball), its block with tool, arguments, why, latest_user_message, quoted_user_messages []; the offer's descriptor names the same id, tool, call, reason, complete arguments; approval.settled allow by fishball; audit kind asked, answer allow |
 * | ASK-02  | EP (reject with a reason) | §7a.3 | {ok:false, code:'rejected', reason, request_id}; audit answer reject |
 * | ASK-03 ×9 | DT (approval.answer refusals) | contract §4.2 | allow+high → allow-needs-low-risk; allow without risk → risk-required; allow without / '' / '   ' reason → reason-required; reject '' reason → reason-required; ask with no / '' question → question-required; unknown id → expired; each leaves the request listed by approval.list and the agent waiting |
 * | ASK-04  | DT (escalate needs nothing) | §7a.3, §7a.6, §10e | accepted with no risk and no reason; a card, the agent keeps waiting, no stock prompt; your Allow once → allowed, the identical call runs on the pass; decisions row allow-once by user; audit escalate (final allowed-once) then pass |
 * | ASK-05  | DT (allow with truncated arguments) | §7a.3 | the offer says truncated; allow refused arguments-incomplete; still pending; a reject then answers rejected |
 * | ASK-06  | BVA (approvalAnswerSeconds 1, no answer) | §7a.5 "Slow" | a card after about 1 s, the agent keeps waiting; your Reject → rejected with your note; decisions row reject by user; audit timeout |
 * | ASK-07  | ST (thread: 3 question rounds, then allow) | §7a.2 "question", §7a.3 `ask`, contract §4.2 | each `ask` answer (with reason '', which ask allows) reaches the agent as {code:'question', request_id, question}; each reply is offered again as the same request with a new offerId and a notice holding the whole thread so far, in order; the final allow covers the call (it runs with no prompt and no further offer); audit allow then pass |
 * | ASK-08 ×3 | EP (request_id unknown / settled / another session's) | §7a.2, §7a.3 "Only pending ids" | {ok:false, code:'expired'}, no request_id, nothing sent to the instance |
 * | ASK-09  | EP (no instance attached; C1-EP-02) | contract §9, §7a.5 "Off" | unavailable at once with a request_id, nothing queued (no offer and no notice after a new attach); the identical call goes to the stock prompt |
 * | ASK-10  | ST (detach while an ask_fishball and a direct call wait; C1-ST-08) | contract §5.1, §7a.5 "Going off" | the ask_fishball answers unavailable and its identical call shows the stock prompt; the direct call shows its stock prompt |
 * | ASK-11  | ST (transport closed while an ask_fishball waits; then asked while closed; then attached again) | contract §9, §7a.5 | unavailable for both, at once for the second; after a new attach a new request is offered again |
 * | ASK-12  | ST (Take back while ask_fishball waits) | §7a.2 `no-longer-managed`, §9 audit | no-longer-managed with request_id; audit answer released |
 * | ASK-13  | BVA (maxPendingApprovals 1 with 1 pending) | §7a.6 "Cap" | over-capacity at once with request_id, nothing offered; the identical call goes to the stock prompt |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ARGUMENTS_STATUS, DECISION, ERROR, RISK, SETTLED_BY } from 'fishball-connector/contract'
import { APR_CODE, ASK_CODE, ASK_OUTPUT, ASK_TOOL, AUDIT_ANSWER, AUDIT_KIND, CLICK, DECISION_ACTION, LIMITS, OUTCOME, QUESTION_REQUIRED, REQUEST_PLACEHOLDER } from './support/constants.mjs'
import { HOOK, T, blockArguments, jsonOf, resultById, settledIdle, stockSeen, untilCard } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, assertShape, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { takeBack } from './support/instance-stub.mjs'
import { until } from './support/util.mjs'

const { tok, cid } = tokens('ASK')

describe('Revision 11 rev11b: ask_fishball answered by an attached instance', () => {
  let ctx
  let t
  let x
  let y
  before(async () => {
    ctx = await askHost('rev11b-ask')
    t = askTools(ctx, { tok, cid })
    x = await t.session('ask-x')
    y = await t.session('ask-y')
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  it('ASK-01 allow: allowed with a request id; one notice that says the session asked first, with the call and its reason', T, async () => {
    const text = tok('01')
    const args = { text, pad: 'pad-01' }
    const why = 'needs approval because ' + text
    const id = cid('01')
    const turnText = 'please do the 01 thing'
    await t.start(x, [t.ask(args, id, { why })], turnText)
    const offer = await t.offerFor(text)
    assert.ok(offer, 'offered to the instance')
    assert.equal(offer.toolName, ASK_TOOL)
    assert.equal(offer.callId, id, 'the ask_fishball call the row matches on')
    assert.equal(offer.reason, why)
    assert.deepEqual(offer.quotes, [])
    assert.deepEqual(JSON.parse(offer.arguments), args)
    assert.equal(offer.argumentsStatus, ARGUMENTS_STATUS.complete)
    await t.accepted(x, offer, { decision: DECISION.allow, risk: RISK.low, reason: 'fine ' + text })
    const json = await t.answered(x, id)
    assertShape(json, ASK_CODE.allowed)
    assert.equal(json.request_id, offer.approvalId, 'the offer names the same request')
    const notices = await t.notices(text)
    assert.equal(notices.length, 1, 'one notice')
    assert.equal(t.requestIdOf(notices[0]), json.request_id, 'the notice names the same request')
    const [round] = await t.rounds(json.request_id)
    assert.match(round.block.header, ASK_STUB.askedFirst, 'says the session asked first (ask_fishball): ' + round.block.header)
    const f = round.block.fields
    assert.equal(f.tool, ASK_TOOL)
    assert.deepEqual(blockArguments(round.block), args)
    assert.equal(f.why, why)
    assert.equal(f.latest_user_message, turnText)
    assert.deepEqual(f.quoted_user_messages, [], 'quoted_user_messages is an empty list')
    assert.deepEqual(await t.settled(json.request_id), [{ approvalId: json.request_id, decision: DECISION.allow, by: SETTLED_BY.fishball }])
    await t.waitIdle(x)
    const rows = t.auditOf(json.request_id)
    assert.equal(rows.length, 1, 'one audit row per request')
    assert.equal(rows[0].kind, AUDIT_KIND.asked)
    assert.equal(rows[0].answer, AUDIT_ANSWER.allow)
    assert.deepEqual(rows[0].quotes ?? [], [], 'no quotes')
  })

  let settledId
  it('ASK-02 reject with a reason: rejected, and the agent sees the reason', T, async () => {
    const text = tok('02')
    const reason = 'too dangerous ' + text
    const id = cid('02')
    const offer = await t.waiting(x, text, id)
    await t.accepted(x, offer, { decision: DECISION.reject, risk: RISK.high, reason })
    const json = await t.answered(x, id)
    assertShape(json, ASK_CODE.rejected)
    assert.equal(json.reason, reason)
    settledId = json.request_id
    await t.waitIdle(x)
    const rows = t.auditOf(json.request_id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].answer, AUDIT_ANSWER.reject)
    assert.equal(rows[0].kind, AUDIT_KIND.asked)
  })

  describe('ASK-03 refused answers leave the request pending', () => {
    /**
     * Each row asks with its own request, so a row whose answer is refused in another way (an answer that
     * fails frame validation closes the channel, contract §3.1, and the waiting request then goes to its
     * session) cannot change the next row's outcome.
     */
    async function refusalRow(answer, code, offerOf = (o) => o) {
      const offer = await t.waiting(x, tok('03'), cid('03'))
      try {
        assert.equal(await t.refused(x, offerOf(offer), answer), code)
        assert.ok((await t.pendingIds(x)).includes(offer.approvalId), 'still pending')
        assert.equal(await t.status(x), ASK_STUB.running, 'the agent still waits')
      } finally { await t.stop(x) }
    }
    for (const [label, answer, code] of [
      ['allow with high risk', { decision: DECISION.allow, risk: RISK.high, reason: 'r' }, APR_CODE.lowRisk],
      ['allow without a risk', { decision: DECISION.allow, reason: 'r' }, ERROR.riskRequired],
      ['allow without a reason', { decision: DECISION.allow, risk: RISK.low }, APR_CODE.reason],
      ['allow with an empty reason', { decision: DECISION.allow, risk: RISK.low, reason: '' }, APR_CODE.reason],
      ['allow with a blank reason', { decision: DECISION.allow, risk: RISK.low, reason: '   ' }, APR_CODE.reason],
      ['reject with an empty reason', { decision: DECISION.reject, risk: RISK.high, reason: '' }, APR_CODE.reason],
      ['ask with no question', { decision: DECISION.ask, risk: RISK.high, reason: 'r' }, QUESTION_REQUIRED],
      ['ask with an empty question', { decision: DECISION.ask, risk: RISK.high, reason: 'r', question: '' }, QUESTION_REQUIRED],
    ]) {
      it(label + ' → ' + code, T, () => refusalRow(answer, code))
    }
    it('an unknown request id → expired', T, () => refusalRow({ decision: DECISION.escalate }, APR_CODE.expired, (o) => ({ ...o, approvalId: ASK_STUB.unknownRequestId })))
  })

  it('ASK-04 escalate needs nothing extra: the request becomes a card and the agent keeps waiting; your Allow once then lets the identical call run', T, async () => {
    const text = tok('04')
    const [callId, stockId] = [cid('04'), cid('04stock')]
    // After the answer the agent makes the identical call in the same turn.
    const offer = await t.waiting(x, text, callId, [t.call(text, stockId)])
    // risk and reason "may be empty" with escalate (contract §4.2); none at all is the smallest such answer.
    await t.accepted(x, offer, { decision: DECISION.escalate })
    const requestId = offer.approvalId
    assert.ok(await untilCard(ctx.host, requestId), 'a card')
    await t.quiet()
    assert.equal(await t.status(x), ASK_STUB.running, 'the agent keeps waiting')
    assert.deepEqual(await stockSeen(ctx.host, text), [], 'no stock prompt')
    assert.equal((await t.click(requestId, CLICK.allow)).status, 200)
    const got = await t.answered(x, callId)
    assertShape(got, ASK_CODE.allowed)
    assert.equal(got.request_id, requestId)
    await t.waitIdle(x)
    assert.equal((await t.rawResult(x, stockId))?.text, ASK_OUTPUT(OUTCOME.allow), 'the identical call ran on the pass')
    assert.deepEqual(await stockSeen(ctx.host, text), [], 'still no stock prompt')
    const row = await t.decisionOf(requestId)
    assert.equal(row.action, DECISION_ACTION.allowOnce)
    assert.equal(row.by, SETTLED_BY.user)
    assert.deepEqual(t.answersOf(requestId), [AUDIT_ANSWER.escalate, AUDIT_ANSWER.pass])
    assert.equal(t.auditOf(requestId)[0].finalOutcome, OUTCOME.allow, 'your answer is its outcome')
  })

  it('ASK-05 allow on truncated arguments is refused arguments-incomplete and stays pending', T, async () => {
    const cut = 16
    await t.setLimit({ argumentExcerptBytes: cut })
    try {
      const text = tok('05') + 'z'.repeat(64)
      const callId = cid('05')
      const offer = await t.waiting(x, text, callId)
      assert.equal(offer.argumentsStatus, ARGUMENTS_STATUS.truncated, 'the offer says the arguments are cut')
      assert.equal(await t.refused(x, offer, { decision: DECISION.allow, risk: RISK.low, reason: 'fine' }), APR_CODE.incomplete)
      assert.ok((await t.pendingIds(x)).includes(offer.approvalId))
      await t.accepted(x, offer, { decision: DECISION.reject, risk: RISK.high, reason: 'cannot see it all' })
      assertShape(await t.answered(x, callId), ASK_CODE.rejected)
      await t.waitIdle(x)
    } finally { await t.setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
  })

  it('ASK-06 approvalAnswerSeconds 1 with no answer: a card after about 1 s and the agent keeps waiting; your Reject then answers rejected', T, async () => {
    const seconds = 1
    await t.setLimit({ approvalAnswerSeconds: seconds })
    try {
      const text = tok('06')
      const id = cid('06')
      const offer = await t.waiting(x, text, id)
      const card = await untilCard(ctx.host, offer.approvalId, ASK_STUB.offerWaitMs)
      assert.ok(card, 'a card')
      await t.quiet()
      assert.equal(await t.status(x), ASK_STUB.running, 'the agent keeps waiting')
      assert.deepEqual(await stockSeen(ctx.host, text), [], 'no stock prompt')
      const note = 'timed out note ' + text
      assert.equal((await t.click(offer.approvalId, CLICK.reject, note)).status, 200)
      const json = await t.answered(x, id)
      assertShape(json, ASK_CODE.rejected)
      assert.equal(json.reason, note)
      await t.waitIdle(x)
      const row = await t.decisionOf(json.request_id)
      assert.equal(row.action, DECISION_ACTION.reject)
      assert.equal(row.by, SETTLED_BY.user)
      assert.deepEqual(t.answersOf(json.request_id), [AUDIT_ANSWER.timeout])
    } finally { await t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it("ASK-07 a thread of three question rounds, then allow: the question travels back to the agent, one request, the whole thread each round, the call covered", ASK_STUB.long, async () => {
    const text = tok('07')
    const qs = [1, 2, 3].map((i) => 'question ' + i + ' ' + text)
    const replies = [1, 2, 3].map((i) => tok('07reply' + i))
    const ids = [0, 1, 2, 3].map((i) => cid('07ask' + i))
    const callId = cid('07call')
    await t.start(x, [
      t.ask({ text }, ids[0]),
      ...replies.map((reply, i) => t.reply(REQUEST_PLACEHOLDER, reply, ids[i + 1])),
      t.call(text, callId),
    ])
    const seen = []
    let offer = await t.offerFor(text)
    assert.ok(offer, 'the first round was offered')
    const requestId = offer.approvalId
    for (const q of qs) {
      seen.push(offer.offerId)
      // contract §4.2: with ask a present reason "may be empty"; the empty string is that boundary.
      await t.accepted(x, offer, { decision: DECISION.ask, question: q, reason: '' })
      offer = await t.nextOffer(requestId, seen)
      assert.ok(offer, 'the reply was offered again as the same request')
    }
    await t.accepted(x, offer, { decision: DECISION.allow, risk: RISK.low, reason: 'clear now' })
    await t.waitIdle(x)
    for (const [i, id] of ids.slice(0, 3).entries()) {
      const a = await t.answered(x, id)
      assertShape(a, ASK_CODE.question, 'round ' + (i + 1) + ': ')
      assert.equal(a.request_id, requestId, 'the same request id every round')
      assert.equal(a.question, qs[i], "the instance's question reaches the agent")
    }
    const last = await t.answered(x, ids[3])
    assertShape(last, ASK_CODE.allowed)
    assert.equal(last.request_id, requestId)
    assert.equal((await t.rawResult(x, callId))?.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran on the pass')
    assert.deepEqual(await stockSeen(ctx.host, text), [], 'no stock prompt')
    assert.equal(seen.length + 1, (await t.offersFor(text)).length, 'one offer per round, none for the call itself')
    const rounds = await t.rounds(requestId)
    assert.equal(rounds.length, 4, 'one notice per round, all for the same request')
    const want = [qs[0], replies[0], qs[1], replies[1], qs[2], replies[2]]
    const thread = rounds[3].block.fields.thread
    assert.ok(Array.isArray(thread), 'the last round carries the thread: ' + JSON.stringify(rounds[3].block.fields))
    assert.deepEqual(thread.map((m) => m.text), want, 'the whole thread, in order')
    const { fishball, agent } = ASK_STUB.threadFrom
    assert.deepEqual(thread.map((m) => m.from), [fishball, agent, fishball, agent, fishball, agent])
    for (const [i, round] of rounds.slice(1).entries()) {
      assert.deepEqual((round.block.fields.thread ?? []).map((m) => m.text), want.slice(0, 2 * (i + 1)), 'round ' + (i + 2) + ' has the thread so far')
    }
    // One audit row for the whole thread (no row per question round), then the call made on the pass.
    assert.deepEqual(t.answersOf(requestId), [AUDIT_ANSWER.allow, AUDIT_ANSWER.pass])
  })

  describe("ASK-08 continuing a request that is not this session's pending one answers expired", () => {
    const expectExpired = async (requestId) => {
      await settledIdle(ctx.host, x)
      const id = cid('08')
      const reply = tok('08reply')
      const before = (await t.offers()).length
      const r = await t.run(x, [t.reply(requestId, reply, id)])
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.expired)
      await t.quiet()
      assert.equal((await t.offers()).length, before, 'nothing offered to the instance')
      assert.deepEqual(await t.notices(reply), [], 'no notice with the reply')
    }
    it('an unknown request id', T, () => expectExpired(ASK_STUB.unknownRequestId))
    it('a settled request id', T, () => expectExpired(settledId))
    it("another session's pending request id", T, async () => {
      const other = await t.waiting(y, tok('08y'), cid('08y'))
      try { await expectExpired(other.approvalId) } finally { await t.stop(y) }
    })
  })

  it('ASK-09 no instance attached: unavailable at once, nothing queued, and the call then goes to the stock prompt (C1-EP-02)', T, async () => {
    await ctx.stub.detach()
    let r
    const text = tok('09')
    const [id, stockId] = [cid('09'), cid('09stock')]
    try {
      await settledIdle(ctx.host, x)
      const t0 = Date.now()
      r = await t.withStock(OUTCOME.allow, () => t.run(x, [t.ask({ text }, id), t.call(text, stockId)]))
      assert.ok(Date.now() - t0 < ASK_STUB.atOnceMs, 'at once: ' + (Date.now() - t0) + ' ms')
    } finally { await t.reattach() }
    assertShape(jsonOf(resultById(r, id)), ASK_CODE.unavailable)
    assert.equal(resultById(r, stockId)?.text, ASK_OUTPUT(OUTCOME.allow), "the stock prompt's answer")
    assert.equal((await t.stockSeen(text)).length, 1, 'the stock prompt was asked once')
    // contract §9: not queued, so the new attach gets neither an offer nor a notice for it.
    await t.nothingSent(text)
  })

  it('ASK-10 detach while requests wait: the ask_fishball answers unavailable and its call prompts; a direct call shows its stock prompt (C1-ST-08)', T, async () => {
    const askText = tok('10ask')
    const [askId, askStockId] = [cid('10ask'), cid('10askstock')]
    await t.waiting(x, askText, askId, [t.call(askText, askStockId)])
    const directText = tok('10direct')
    await t.start(y, [t.call(directText, cid('10direct'))])
    assert.ok(await t.offerFor(directText), 'the direct call was offered')
    await ctx.stub.detach()
    try {
      assertShape(await t.answered(x, askId), ASK_CODE.unavailable)
      assert.ok(await until(async () => (await t.stockSeen(directText)).length === 1, ASK_STUB.offerWaitMs, 100), 'the direct call shows its stock prompt')
      await t.waitIdle(x)
      await t.waitIdle(y)
      assert.equal((await t.stockSeen(askText)).length, 1, 'the ask_fishball call went to the stock prompt (a to-you ticket)')
    } finally { await t.reattach() }
  })

  it('ASK-11 transport closed while an ask_fishball waits: unavailable; asked while closed: unavailable at once; attached again: offered again', ASK_STUB.long, async () => {
    const text = tok('11')
    const id = cid('11')
    await t.waiting(x, text, id)
    await ctx.stub.fireClose()
    try {
      assertShape(await t.answered(x, id), ASK_CODE.unavailable)
      await t.waitIdle(x)
      await settledIdle(ctx.host, x)
      const text2 = tok('11b')
      const id2 = cid('11b')
      const t0 = Date.now()
      const r = await t.run(x, [t.ask({ text: text2 }, id2)])
      assert.ok(Date.now() - t0 < ASK_STUB.atOnceMs, 'at once: ' + (Date.now() - t0) + ' ms')
      assertShape(jsonOf(resultById(r, id2)), ASK_CODE.unavailable)
    } finally { await t.reattach() }
    const text3 = tok('11c')
    const id3 = cid('11c')
    const offer = await t.waiting(x, text3, id3)
    await t.accepted(x, offer, { decision: DECISION.reject, risk: RISK.high, reason: 'back again' })
    assertShape(await t.answered(x, id3), ASK_CODE.rejected)
    await t.waitIdle(x)
  })

  it('ASK-12 Take back while ask_fishball waits: no-longer-managed; audit answer released', T, async () => {
    const z = await t.session('ask-12')
    const id = cid('12')
    const offer = await t.waiting(z, tok('12'), id)
    const r = await takeBack(ctx.host, z)
    assert.equal(r.status, 200, r.text)
    const got = await t.answered(z, id)
    assertShape(got, ASK_CODE.noLongerManaged)
    assert.equal(got.request_id, offer.approvalId)
    await t.waitIdle(z)
    assert.equal(t.auditOf(offer.approvalId)[0]?.answer, AUDIT_ANSWER.released)
  })

  it('ASK-13 maxPendingApprovals 1 with one request pending: over-capacity at once; the call then goes to the stock prompt', T, async () => {
    const cap = 1
    await t.setLimit({ maxPendingApprovals: cap })
    try {
      await t.waiting(y, tok('13busy'), cid('13busy'))
      await settledIdle(ctx.host, x)
      const text = tok('13')
      const [id, stockId] = [cid('13'), cid('13stock')]
      const t0 = Date.now()
      const r = await t.withStock(OUTCOME.allow, () => t.run(x, [t.ask({ text }, id), t.call(text, stockId)]))
      assert.ok(Date.now() - t0 < ASK_STUB.atOnceMs, 'at once: ' + (Date.now() - t0) + ' ms')
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.overCapacity)
      await t.expectStock(x, text, stockId, OUTCOME.allow, 0)
    } finally {
      await t.stop(y)
      await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }
  })
})
