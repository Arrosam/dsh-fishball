/**
 * Revision 11 rev11c: answering a card that went to the user, on the H-STUB harness (DESIGN §7a.2, §7a.3, §7a.5
 * "Slow", §7a.6, §9 audit, §10e "Host API"; contract §4.2, §5 `approval.settled` / `approval.ran`;
 * slim-native-design §12). The pile UI is deleted (slim §12): a card that goes to the user is answered on its own
 * session's running ask_fishball row, whose Allow once / Reject call POST /api/fishball/requests/answer
 * {requestId, decision, note?}; the snapshot keeps `pile`. The attached instance escalates with `approval.answer`
 * where the in-process Fishball used answer_approval. One host; cases run in order.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | ANS-01  | EP (Allow once) | §7a.3 passes, §7a.6, §9, contract §5 | agent: allowed + request_id; the identical call then runs on a pass, no stock prompt, no new offer; card gone; decisions row allow-once by user; audit escalate (final allowed-once) then pass; approval.ran via pass |
 * | ANS-02  | EP (Reject with a note) | §7a.2 `rejected`, §9 | agent: rejected, reason = the note exactly; card gone; decisions row reject by user; audit escalate (final rejected) |
 * | ANS-03  | EP (Reject, no note) | §10e | agent: rejected; card gone |
 * | ANS-04  | EP (a note with markup and newlines) | §10e | the agent's reason is the note unchanged |
 * | ANS-05  | ST (a second click / unknown / settled id) | §10e | 409 expired; the first answer stands |
 * | ANS-06 ×10 | DT (bad bodies; foreign origin) | §10e "boundary checks", "same-origin fence" | 400 bad-body (foreign origin: not 200); the card stays; the agent still waits |
 * | ANS-07  | ST (the instance answers a request that is already a card) | §7a.3 "each request is answered in one place", contract §4.2 | approval.answer refused expired; the card stays; the agent still waits |
 * | ANS-08  | BVA (approvalAnswerSeconds 1, no answer) | §7a.5 "Slow" | no card before the answer time; then a card and the agent keeps waiting (no stock prompt); Allow once gives allowed; audit timeout (final allowed-once) |
 * | ANS-09  | ST (after your click) | §7a.14 "Fishball gets a short note without being woken", contract §5 | the instance gets approval.settled {decision, by:'user'} and no new offer |
 * | ANS-10  | EP (reply round then escalate then Allow once) | §7a.2 thread, §7a.6 | allowed with the same request_id |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DECISION, RAN_VIA, RISK, SETTLED_BY } from 'fishball-connector/contract'
import { APR_CODE, ASK_CODE, ASK_OUTPUT, AUDIT_ANSWER, AUDIT_KIND, CLICK, DECISION_ACTION, LIMITS, OUTCOME, P5_CODE, PILE_API, PILE_CODE, REQUEST_PLACEHOLDER } from './support/constants.mjs'
import { HOOK, T, cardOf, untilCard, untilNoCard } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, assertShape, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { sleep } from './support/util.mjs'

const { tok, cid } = tokens('ANS')
/** ANS-08: the answer time, and a check well inside it that no card exists yet. */
const ANSWER_SECONDS = 1
const BEFORE_ANSWER_MS = 400

describe('Revision 11 rev11c: answering a card', () => {
  let ctx
  let t
  let x
  let y
  before(async () => {
    ctx = await askHost('rev11c-answer')
    t = askTools(ctx, { tok, cid })
    x = await t.session('ans-x')
    y = await t.session('ans-y')
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  /** Your click on an escalated request, then the agent's answer; asserts the card left. */
  async function clickAndAnswer(sid, id, requestId, decision, note) {
    const r = await t.click(requestId, decision, note)
    assert.equal(r.status, 200, r.text)
    const got = await t.answered(sid, id)
    await t.waitIdle(sid)
    assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
    return got
  }

  /** A settled request id for the route cases. */
  let settledId

  it('ANS-01 Allow once: allowed; the identical call runs on a pass with no prompt and no new offer; audited', T, async () => {
    const text = tok('01')
    const [id, callId] = [cid('01'), cid('01call')]
    const { requestId } = await t.escalated(x, text, id, { after: [t.call(text, callId)] })
    const got = await clickAndAnswer(x, id, requestId, CLICK.allow)
    assertShape(got, ASK_CODE.allowed)
    assert.equal(got.request_id, requestId)
    assert.equal((await t.rawResult(x, callId))?.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran on the pass')
    assert.deepEqual(await t.stockSeen(text), [], 'no stock prompt')
    assert.equal((await t.offersFor(text)).length, 1, 'the instance got no further offer')
    const ran = await t.ran(requestId)
    assert.equal(ran.length, 1, 'one approval.ran for the call made on the pass: ' + JSON.stringify(ran))
    assert.equal(ran[0].via, RAN_VIA.pass)
    const row = await t.decisionOf(requestId)
    assert.equal(row.action, DECISION_ACTION.allowOnce)
    assert.equal(row.by, SETTLED_BY.user)
    const audit = t.auditOf(requestId)
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
    const got = await clickAndAnswer(x, id, requestId, CLICK.reject, note)
    assertShape(got, ASK_CODE.rejected)
    assert.equal(got.reason, note)
    assert.equal(got.request_id, requestId)
    const row = await t.decisionOf(requestId)
    assert.equal(row.action, DECISION_ACTION.reject)
    assert.equal(row.by, SETTLED_BY.user)
    const audit = t.auditOf(requestId)
    assert.equal(audit[0].answer, AUDIT_ANSWER.escalate)
    assert.equal(audit[0].finalOutcome, OUTCOME.reject)
    settledId = requestId
  })

  it('ANS-03 Reject with no note: rejected', T, async () => {
    const id = cid('03')
    const { requestId } = await t.escalated(x, tok('03'), id)
    const got = await clickAndAnswer(x, id, requestId, CLICK.reject)
    assertShape(got, ASK_CODE.rejected)
    assert.equal(got.request_id, requestId)
  })

  it('ANS-04 a note with markup and newlines reaches the agent unchanged', T, async () => {
    const text = tok('04')
    const id = cid('04')
    const { requestId } = await t.escalated(x, text, id)
    const note = 'line one\nline <b>two</b> & "three"\n\tindented ' + text
    assert.equal((await clickAndAnswer(x, id, requestId, CLICK.reject, note)).reason, note)
  })

  it('ANS-05 a second click, an unknown id and a settled id answer 409 expired; the first answer stands', T, async () => {
    for (const requestId of [settledId, ASK_STUB.unknownRequestId]) {
      const r = await t.click(requestId, CLICK.allow)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, PILE_CODE.expired)
    }
    const id = cid('05')
    const first = 'first ' + tok('05')
    const { requestId } = await t.escalated(x, tok('05'), id)
    assert.equal((await t.click(requestId, CLICK.reject, first)).status, 200)
    const second = await t.click(requestId, CLICK.allow)
    assert.equal(second.status, 409, second.text)
    assert.equal(second.json?.code, PILE_CODE.expired)
    const got = await t.answered(x, id)
    assertShape(got, ASK_CODE.rejected, 'the first answer stands: ')
    assert.equal(got.reason, first)
    await t.waitIdle(x)
  })

  describe('ANS-06 invalid bodies leave the card and the waiting agent alone', () => {
    let requestId
    let offer
    before(async () => {
      ({ requestId, offer } = await t.escalated(x, tok('06'), cid('06')))
    }, HOOK)
    after(async () => {
      await t.click(requestId, CLICK.reject)
      await t.waitIdle(x)
    }, HOOK)
    const stays = async () => {
      assert.ok(await cardOf(ctx.host, requestId), 'the card stays')
      assert.equal(await t.status(x), ASK_STUB.running, 'the agent still waits')
    }
    const rows = [
      ['invalid JSON', () => ['{"requestId":', { raw: true }]],
      ['an array', () => [[]]],
      ['an empty object', () => [{}]],
      ['decision missing', () => [{ requestId }]],
      ['requestId missing', () => [{ decision: CLICK.allow }]],
      ['decision "maybe"', () => [{ requestId, decision: 'maybe' }]],
      ['decision "allow-once" (the audit word, not the route word)', () => [{ requestId, decision: DECISION_ACTION.allowOnce }]],
      ['requestId a number', () => [{ requestId: 1, decision: CLICK.allow }]],
      ['requestId empty', () => [{ requestId: '', decision: CLICK.allow }]],
      ['note a number', () => [{ requestId, decision: CLICK.reject, note: 5 }]],
    ]
    for (const [label, args] of rows) {
      it(label + ' → 400 bad-body', T, async () => {
        const r = await ctx.host.post(PILE_API.answer, ...args())
        assert.equal(r.status, 400, r.text)
        assert.equal(r.json?.code, P5_CODE.badBody)
        await stays()
      })
    }
    it('a foreign origin is refused (same-origin fence)', T, async () => {
      const r = await ctx.host.post(PILE_API.answer, { requestId, decision: CLICK.allow }, { headers: { origin: ASK_STUB.foreignOrigin } })
      assert.notEqual(r.status, 200, r.text)
      await stays()
    })
    it('ANS-07 the instance answers a request that is already your card: expired (each request is answered in one place)', T, async () => {
      assert.equal(await t.refused(x, offer, { decision: DECISION.allow, risk: RISK.low, reason: 'fine' }), APR_CODE.expired)
      await stays()
    })
  })

  it('ANS-08 approvalAnswerSeconds 1 with no answer: a card after the answer time, the agent keeps waiting; Allow once then allows', T, async () => {
    await t.setLimit({ approvalAnswerSeconds: ANSWER_SECONDS })
    try {
      const text = tok('08')
      const [id, callId] = [cid('08'), cid('08call')]
      const offer = await t.waiting(y, text, id, [t.call(text, callId)])
      const t0 = Date.now()
      await sleep(BEFORE_ANSWER_MS)
      assert.equal(await cardOf(ctx.host, offer.approvalId), undefined, 'no card before the answer time')
      const card = await untilCard(ctx.host, offer.approvalId, ASK_STUB.offerWaitMs)
      assert.ok(card, 'a card after the answer time')
      assert.ok(Date.now() - t0 >= BEFORE_ANSWER_MS, 'not before the answer time')
      await t.quiet()
      assert.equal(await t.status(y), ASK_STUB.running, 'the agent keeps waiting')
      assert.deepEqual(await t.stockSeen(text), [], 'no stock prompt')
      const got = await clickAndAnswer(y, id, offer.approvalId, CLICK.allow)
      assertShape(got, ASK_CODE.allowed)
      assert.equal(got.request_id, offer.approvalId)
      const audit = t.auditOf(offer.approvalId)
      assert.equal(audit[0].answer, AUDIT_ANSWER.timeout)
      assert.equal(audit[0].finalOutcome, OUTCOME.allow)
    } finally { await t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('ANS-09 after your click the instance is told who decided, and gets no new offer', T, async () => {
    const text = tok('09')
    const id = cid('09')
    const { requestId } = await t.escalated(y, text, id)
    await clickAndAnswer(y, id, requestId, CLICK.allow)
    await t.quiet()
    const settled = await t.settled(requestId)
    assert.deepEqual(settled.at(-1), { approvalId: requestId, decision: DECISION.allow, by: SETTLED_BY.user }, 'approval.settled for your click: ' + JSON.stringify(settled))
    assert.equal((await t.offersFor(text)).length, 1, 'no new offer')
  })

  it('ANS-10 a question round, then escalate, then Allow once: allowed with the same request id', T, async () => {
    const text = tok('10')
    const reply = tok('10reply')
    const ids = [cid('10a'), cid('10b')]
    await t.start(y, [t.ask({ text }, ids[0], { why: 'why ' + text }), t.reply(REQUEST_PLACEHOLDER, reply, ids[1])])
    const first = await t.offerFor(text)
    assert.ok(first, 'offered')
    await t.accepted(y, first, { decision: DECISION.ask, question: 'which? ' + text })
    const second = await t.nextOffer(first.approvalId, [first.offerId])
    assert.ok(second, 'the reply was offered as the same request')
    await t.accepted(y, second, { decision: DECISION.escalate, reason: 'to you' })
    assert.ok(await untilCard(ctx.host, first.approvalId), 'a card after the reply round')
    const got = await clickAndAnswer(y, ids[1], first.approvalId, CLICK.allow)
    assertShape(got, ASK_CODE.allowed)
    assert.equal(got.request_id, first.approvalId)
  })
})
