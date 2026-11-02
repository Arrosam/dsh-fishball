/**
 * Revision 11 rev11c: answering a card (DESIGN §7a.2, §7a.3, §7a.5 "Slow", §7a.6, §9 audit, §10e "Host API";
 * requirements items 8, 11, 14, 15 and the defaults "The user's Reject takes an optional note"). Allow once /
 * Reject is POST /api/fishball/requests/answer {requestId, decision, note?}: the Host route both the pile's
 * buttons and the buttons on the session's running ask_fishball row call (S37), so answering in either place is
 * this route. One host; cases run in order.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | ANS-01  | EP (Allow once) | agent: allowed + request_id; the identical call then runs on a pass, no stock prompt, no new notice; card gone; decisions row allow-once by user; audit escalate (final allowed-once) then pass |
 * | ANS-02  | EP (Reject with a note) | agent: rejected, reason = the note exactly; card gone; decisions row reject by user; audit escalate (final rejected) |
 * | ANS-03  | EP (Reject, no note) | agent: rejected (a reason string is allowed); card gone |
 * | ANS-04  | EP (a note with markup and newlines) | the agent's reason is the note unchanged |
 * | ANS-05  | ST (a second click / unknown / settled id) | 409 expired; the first answer stands |
 * | ANS-06 ×10 | DT (bad bodies; foreign origin) | 400 bad-body (foreign origin: not 200); the card stays; the agent still waits |
 * | ANS-07  | ST (Fishball answers a request that is already a card) | answer_approval answers expired; the card stays; the agent still waits |
 * | ANS-08  | BVA (approvalAnswerSeconds 1, no answer) | no card before about 1 s; then a card and the agent keeps waiting (no to-user, no stock prompt); Allow once gives allowed; audit timeout (final allowed-once) |
 * | ANS-09  | ST (after your click) | Fishball is told (a note naming the request) without a new Fishball step |
 * | ANS-10  | EP (reply round then escalate then Allow once) | allowed with the same request_id |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_CODE, ASK_OUTPUT, AUDIT_ANSWER, AUDIT_KIND, CLICK, DECISION, DECISION_ACTION, LIMITS, OUTCOME, PILE_API, PILE_CODE, P5_CODE } from './support/constants.mjs'
import { HOOK, T, answerCard, askStep, auditOf, callStep, cardOf, fishballMessages, requestMessages, settledIdle, turn, untilCard, waitRequest } from './support/expect.mjs'
import { QUIET_MS, pileHost, pileTools, sleep, tokens, until } from './support/rev11c.mjs'

const { tok, cid } = tokens('ANS')

describe('Revision 11 rev11c: answering a card', () => {
  let ctx
  let t
  let x
  let y
  before(async () => {
    ctx = await pileHost('rev11c-answer')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('ans-x')
    y = await t.session('ans-y')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  /** A settled request id for the route cases. */
  let settledId

  it('ANS-01 Allow once: allowed; the identical call runs on a pass with no prompt and no new notice; audited', T, async () => {
    const text = tok('01')
    const [id, callId] = [cid('01'), cid('01call')]
    const { requestId } = await t.escalated(x, text, id, { after: [callStep({ text }, callId)] })
    const r = await answerCard(ctx.host, requestId, CLICK.allow)
    assert.equal(r.status, 200, r.text)
    const got = await t.answered(x, id)
    assert.equal(got.code, ASK_CODE.allowed)
    assert.equal(got.ok, true)
    assert.equal(got.request_id, requestId)
    await ctx.host.call('waitIdle', { sessionId: x })
    const result = (await ctx.host.call('inspect', { sessionId: x, events: true })).events.find((e) => e.type === 'tool/result' && e.result.callId === callId)
    assert.equal(result?.result.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran on the pass')
    assert.deepEqual(await t.stockSeen(text), [], 'no stock prompt')
    assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 1, 'Fishball got no further notice')
    assert.equal(await cardOf(ctx.host, requestId), undefined, 'the card left')
    assert.ok(await until(() => t.decisionsFor(requestId).length > 0, 5000, 100), 'a decisions row for your click')
    const [row] = t.decisionsFor(requestId)
    assert.equal(row.action, DECISION_ACTION.allowOnce)
    assert.equal(row.by, 'user')
    await settledIdle(ctx.host, ctx.fb)
    const audit = auditOf(ctx.home, requestId)
    assert.equal(audit[0].answer, AUDIT_ANSWER.escalate)
    assert.equal(audit[0].kind, AUDIT_KIND.asked)
    assert.equal(audit[0].finalOutcome, OUTCOME.allow, 'your answer is its final outcome')
    assert.equal(audit.at(-1).answer, AUDIT_ANSWER.pass)
  })

  it('ANS-02 Reject with a note: rejected with exactly that note; audited', T, async () => {
    const text = tok('02')
    const id = cid('02')
    const { requestId } = await t.escalated(x, text, id)
    const note = 'please use the other script ' + text
    const r = await answerCard(ctx.host, requestId, CLICK.reject, note)
    assert.equal(r.status, 200, r.text)
    const got = await t.answered(x, id)
    assert.equal(got.code, ASK_CODE.rejected)
    assert.equal(got.ok, false)
    assert.equal(got.reason, note)
    assert.equal(got.request_id, requestId)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal(await cardOf(ctx.host, requestId), undefined)
    assert.ok(await until(() => t.decisionsFor(requestId).length > 0, 5000, 100))
    assert.equal(t.decisionsFor(requestId)[0].action, DECISION_ACTION.reject)
    assert.equal(t.decisionsFor(requestId)[0].by, 'user')
    await settledIdle(ctx.host, ctx.fb)
    const audit = auditOf(ctx.home, requestId)
    assert.equal(audit[0].answer, AUDIT_ANSWER.escalate)
    assert.equal(audit[0].finalOutcome, OUTCOME.reject)
    settledId = requestId
  })

  it('ANS-03 Reject with no note: rejected', T, async () => {
    const text = tok('03')
    const id = cid('03')
    const { requestId } = await t.escalated(x, text, id)
    assert.equal((await answerCard(ctx.host, requestId, CLICK.reject)).status, 200)
    const got = await t.answered(x, id)
    assert.equal(got.code, ASK_CODE.rejected)
    assert.equal(got.ok, false)
    assert.equal(got.request_id, requestId)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('ANS-04 a note with markup and newlines reaches the agent unchanged', T, async () => {
    const text = tok('04')
    const id = cid('04')
    const { requestId } = await t.escalated(x, text, id)
    const note = 'line one\nline <b>two</b> & "three"\n\tindented ' + text
    assert.equal((await answerCard(ctx.host, requestId, CLICK.reject, note)).status, 200)
    assert.equal((await t.answered(x, id)).reason, note)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('ANS-05 a second click, an unknown id and a settled id answer 409 expired; the first answer stands', T, async () => {
    for (const requestId of [settledId, 'apr_0123456789abcdef']) {
      const r = await answerCard(ctx.host, requestId, CLICK.allow)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, PILE_CODE.expired)
    }
    const text = tok('05')
    const id = cid('05')
    const { requestId } = await t.escalated(x, text, id)
    assert.equal((await answerCard(ctx.host, requestId, CLICK.reject, 'first')).status, 200)
    const second = await answerCard(ctx.host, requestId, CLICK.allow)
    assert.equal(second.status, 409, second.text)
    assert.equal(second.json?.code, PILE_CODE.expired)
    const got = await t.answered(x, id)
    assert.equal(got.code, ASK_CODE.rejected, 'the first answer stands')
    assert.equal(got.reason, 'first')
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  describe('ANS-06 invalid bodies leave the card and the waiting agent alone', () => {
    let requestId
    let id
    before(async () => {
      const text = tok('06')
      id = cid('06')
      requestId = (await t.escalated(x, text, id)).requestId
    }, HOOK)
    const rows = [
      ['invalid JSON', () => ['{"requestId":', { raw: true }]],
      ['an array', () => [[]]],
      ['an empty object', () => [{}]],
      ['decision missing', () => [{ requestId }]],
      ['requestId missing', () => [{ decision: CLICK.allow }]],
      ['decision "maybe"', () => [{ requestId, decision: 'maybe' }]],
      ['decision "allow-once" (the audit word, not the route word)', () => [{ requestId, decision: 'allow-once' }]],
      ['requestId a number', () => [{ requestId: 1, decision: CLICK.allow }]],
      ['requestId empty', () => [{ requestId: '', decision: CLICK.allow }]],
      ['note a number', () => [{ requestId, decision: CLICK.reject, note: 5 }]],
    ]
    for (const [label, args] of rows) {
      it(label + ' → 400 bad-body', T, async () => {
        const r = await ctx.host.post(PILE_API.answer, ...args())
        assert.equal(r.status, 400, r.text)
        assert.equal(r.json?.code, P5_CODE.badBody)
        assert.ok(await cardOf(ctx.host, requestId), 'the card stays')
        assert.equal(await ctx.host.call('agentStatus', { sessionId: x }), 'running')
      })
    }
    it('a foreign origin is refused (same-origin fence)', T, async () => {
      const r = await ctx.host.post(PILE_API.answer, { requestId, decision: CLICK.allow }, { headers: { origin: 'http://fbtest-foreign.example' } })
      assert.notEqual(r.status, 200, r.text)
      assert.ok(await cardOf(ctx.host, requestId), 'the card stays')
    })
    it('Fishball answers a request that is already your card: expired (each request is answered in one place)', T, async () => {
      const json = await t.answer(requestId, { decision: DECISION.allow, risk: 'low', reason: 'fine' })
      assert.equal(json?.ok, false, JSON.stringify(json))
      assert.equal(json.code, 'expired')
      assert.ok(await cardOf(ctx.host, requestId), 'the card stays')
      assert.equal(await ctx.host.call('agentStatus', { sessionId: x }), 'running')
    })
    after(async () => {
      await answerCard(ctx.host, requestId, CLICK.reject)
      await ctx.host.call('waitIdle', { sessionId: x })
    })
  })

  it('ANS-08 approvalAnswerSeconds 1 with no answer: a card after about 1 s, the agent keeps waiting; Allow once then allows', T, async () => {
    await t.setLimit({ approvalAnswerSeconds: 1 })
    try {
      await settledIdle(ctx.host, y)
      const text = tok('08')
      const [id, callId] = [cid('08'), cid('08call')]
      await ctx.host.call('driveStart', { sessionId: y, script: [askStep(t.askArgs({ text }, { why: 'why ' + text }), id), callStep({ text }, callId), [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, text)
      const t0 = Date.now()
      await sleep(500)
      assert.equal(await cardOf(ctx.host, req.id), undefined, 'no card before the answer time')
      const card = await untilCard(ctx.host, req.id, 8000)
      assert.ok(card, 'a card after the answer time')
      assert.ok(Date.now() - t0 >= 400, 'not before about 1 s from the notice')
      await sleep(QUIET_MS * 2)
      assert.equal(await ctx.host.call('agentStatus', { sessionId: y }), 'running', 'the agent keeps waiting')
      assert.deepEqual(await t.stockSeen(text), [], 'no stock prompt')
      assert.equal((await answerCard(ctx.host, req.id, CLICK.allow)).status, 200)
      const got = await t.answered(y, id)
      assert.equal(got.code, ASK_CODE.allowed)
      assert.equal(got.request_id, req.id)
      await ctx.host.call('waitIdle', { sessionId: y })
      await settledIdle(ctx.host, ctx.fb)
      const audit = auditOf(ctx.home, req.id)
      assert.equal(audit[0].answer, AUDIT_ANSWER.timeout)
      assert.equal(audit[0].finalOutcome, OUTCOME.allow)
    } finally { await t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('ANS-09 after your click Fishball is told, with no new Fishball step', T, async () => {
    const text = tok('09')
    const id = cid('09')
    const { requestId } = await t.escalated(y, text, id)
    await settledIdle(ctx.host, ctx.fb)
    const stepsBefore = (await ctx.host.call('requests', { sessionId: ctx.fb })).length
    assert.equal((await answerCard(ctx.host, requestId, CLICK.allow)).status, 200)
    await t.answered(y, id)
    await ctx.host.call('waitIdle', { sessionId: y })
    await sleep(QUIET_MS)
    assert.equal((await ctx.host.call('requests', { sessionId: ctx.fb })).length, stepsBefore, 'your click did not wake Fishball')
    // The note waits for Fishball's next turn; one plain turn reads it.
    await turn(ctx.host, ctx.fb, [[{ text: 'ok' }]])
    const notes = (await fishballMessages(ctx.host, ctx.fb, requestId)).filter((m) => !m.text.startsWith('[permission request'))
    assert.ok(notes.length >= 1, 'a note names the request: ' + JSON.stringify((await fishballMessages(ctx.host, ctx.fb, requestId)).map((m) => m.text.slice(0, 80))))
  })

  it('ANS-10 a question round, then escalate, then Allow once: allowed with the same request id', T, async () => {
    const text = tok('10')
    const reply = tok('10reply')
    const ids = [cid('10a'), cid('10b')]
    await t.plan(text, { decision: DECISION.ask, risk: 'high', reason: 'need more', question: 'which? ' + text })
    await t.plan(reply, { decision: DECISION.escalate, risk: 'high', reason: 'to you' })
    await settledIdle(ctx.host, y)
    await ctx.host.call('driveStart', { sessionId: y, script: [askStep(t.askArgs({ text }, { why: 'why ' + text }), ids[0]), askStep({ request_id: '$fbtest:last-request-id', reply }, ids[1]), [{ text: 'done' }]] })
    const req = await waitRequest(ctx.host, ctx.fb, text)
    assert.ok(await untilCard(ctx.host, req.id, 20000), 'a card after the reply round')
    assert.equal((await answerCard(ctx.host, req.id, CLICK.allow)).status, 200)
    const got = await t.answered(y, ids[1])
    assert.equal(got.code, ASK_CODE.allowed)
    assert.equal(got.request_id, req.id)
    await ctx.host.call('waitIdle', { sessionId: y })
  })
})
