/**
 * Revision 11 rev11b: verified quotes and the size of one request message, on the H-STUB harness (DESIGN §7a.2
 * "Quotes are verified by code", "Size", §9 audit `quotes`; §16 `maxMessageBytes`; contract §5.1 "Each of
 * `quotes` is at most 2,048 bytes", §8 "a value at the limit is accepted"; slim-native-design §12). The request
 * message that used to reach the in-process Fishball is now the `approval`-kind `inbox.push` text the attached
 * instance receives; the offer (`approval.request`) carries the quotes as bounded text. A relay from Fishball is
 * the instance's `session.message`. One host; cases run in order. Expected values come from the requirements.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | QUO-01  | EP (valid quotes: a 1500-character message and a short one) | §7a.2, §9 | the notice's quoted_user_messages holds each quoted id with its FULL text from the log, in the quoted order, inside the untrusted block; the offer's quotes are those texts in order; the audit row's quotes are the ids and the audit never holds the text |
 * | QUO-02 ×6 | EP (the instance's relay / Fishball notice / runtime context / another session's message / unknown id / one valid + one relay) | §7a.2 | {ok:false, code:'not-user-message'} at once, no request_id; nothing sent to the instance; no audit row added |
 * | QUO-03  | BVA (maxMessageBytes: the request message exactly at the limit) | §7a.2 "Size", §16 | it reaches the instance; the notice is exactly maxMessageBytes bytes |
 * | QUO-04  | BVA (one byte over) | §7a.2 "Size" | {ok:false, code:'too-large'} at once, no request_id; no offer and no notice |
 * | QUO-05  | BVA (a reply round over maxMessageBytes) | §7a.2 "question" | the reply is refused too-large and nothing is sent; the request still waits, and a reply that fits continues it as round 2 |
 * | QUO-06 ×2 | BVA (one quoted message of 2048 / 2049 bytes) | contract §5.1, §8; §7a.2 | 2048 → the offer's quote is the whole text; 2049 → the offer's quote is at most 2048 bytes; the notice holds the full text either way |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DECISION, LIMITS as CONTRACT_LIMITS, RISK } from 'fishball-connector/contract'
import { ASK_CODE, LIMITS, NOTICE, REQUEST_PLACEHOLDER } from './support/constants.mjs'
import { HOOK, T, approvalAudit, bytes, jsonOf, resultById, settledIdle, turn } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, assertShape, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { OPERATION } from './support/instance-stub.mjs'
import { until } from './support/util.mjs'

const { tok, cid } = tokens('QUO')
/** maxMessageBytes for the size cases: well above a small request's own size, small enough to fill quickly. */
const SIZE_LIMIT = 6000
/** The same turn text for every size request, so only the reason's length changes the message. */
const SIZE_TURN = 'fbtest size turn'
/** The two reason lengths that calibrate the message size (the size grows one byte per reason byte). */
const CALIBRATION = Object.freeze({ small: 100, large: 600 })
/** The long quoted message's padding: ASCII, so its characters and bytes are one each. */
const LONG_PAD = 1500
/** A run of the padding that can only come from the long message. */
const PAD_PROBE = 100

describe('Revision 11 rev11b: quotes and request size', () => {
  let ctx
  let t
  let q
  let other
  const ids = {}
  let longText
  const log = (sid) => ctx.host.call('userMessageLog', { sessionId: sid })
  const idOfText = async (sid, text) => (await log(sid)).find((m) => m.kind === 'user' && m.text === text)?.id

  before(async () => {
    ctx = await askHost('rev11b-quotes')
    t = askTools(ctx, { tok, cid })
    q = await t.session('quo-q')
    other = await t.session('quo-other')
    longText = 'fix the failing tests ' + 'q'.repeat(LONG_PAD)
    await turn(ctx.host, q, [[{ text: 'ok' }]], longText)
    const relayText = tok('relay')
    const sent = await ctx.stub.op(OPERATION.sessionMessage, { sessionId: q, message: relayText, attachments: [] }, q)
    assert.ok(sent.payload?.status, 'precondition: relay ' + JSON.stringify(sent))
    await until(async () => (await log(q)).some((m) => m.text.includes(relayText)), ASK_STUB.offerWaitMs, 100)
    await settledIdle(ctx.host, q)
    const noticeText = tok('notice')
    await ctx.host.call('driveStart', { sessionId: q, text: noticeText, source: { ...NOTICE, summary: 'fbtest notice' } })
    await t.waitIdle(q)
    await settledIdle(ctx.host, q)
    const entries = await log(q)
    ids.first = entries.find((m) => m.kind === 'user' && m.text === 'first words')?.id
    ids.long = entries.find((m) => m.kind === 'user' && m.text === longText)?.id
    ids.relay = entries.find((m) => m.text.includes(relayText))?.id
    ids.notice = entries.find((m) => m.text === noticeText)?.id
    ids.runtime = entries.find((m) => m.kind !== 'user' && m.id !== ids.relay && m.id !== ids.notice)?.id
    ids.other = (await log(other)).find((m) => m.kind === 'user')?.id
    ids.unknown = 'fbtest-no-such-message'
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  /** An ask_fishball that waits with these quotes; the instance rejects it. Returns the offer and its notice. */
  async function quotedRequest(text, quote) {
    const id = cid('q')
    const offer = await t.waiting(q, text, id, [], { quote })
    const [notice] = await t.rounds(offer.approvalId)
    await t.accepted(q, offer, { decision: DECISION.reject, risk: RISK.high, reason: 'fbtest' })
    assertShape(await t.answered(q, id), ASK_CODE.rejected)
    await t.waitIdle(q)
    return { offer, notice }
  }

  it('QUO-01 valid quotes reach the instance as the full text, in the quoted order; the audit keeps only the ids', T, async () => {
    assert.ok(ids.long && ids.first, 'precondition: message ids ' + JSON.stringify(ids))
    const { offer, notice } = await quotedRequest(tok('01'), [ids.long, ids.first])
    const quoted = notice.block.fields.quoted_user_messages
    assert.deepEqual(quoted.map((m) => m.id), [ids.long, ids.first])
    assert.deepEqual(quoted.map((m) => m.text), [longText, 'first words'], 'the full text from the log, not an excerpt')
    assert.ok(notice.block.inner.includes(longText), 'inside the untrusted block')
    assert.deepEqual(offer.quotes, [longText, 'first words'], "the offer's quotes, in order (each within 2048 bytes)")
    const [row] = t.auditOf(offer.approvalId)
    assert.deepEqual(row?.quotes, [ids.long, ids.first], 'audit quotes are the ids')
    assert.equal(JSON.stringify(approvalAudit(ctx.home)).includes('q'.repeat(PAD_PROBE)), false, 'the audit never holds quoted text')
  })

  for (const [label, pick] of [
    ["the instance's relay", () => [ids.relay]],
    ['a Fishball notice', () => [ids.notice]],
    ['a runtime-context message', () => [ids.runtime]],
    ["another session's message", () => [ids.other]],
    ['an unknown id', () => [ids.unknown]],
    ['one valid id and a relay', () => [ids.first, ids.relay]],
  ]) {
    it('QUO-02 quoting ' + label + ' is refused not-user-message and nothing is sent', T, async () => {
      const quote = pick()
      assert.ok(quote.every(Boolean), 'precondition: ids ' + JSON.stringify(ids))
      await settledIdle(ctx.host, q)
      const text = tok('02')
      const auditBefore = approvalAudit(ctx.home).length
      const id = cid('02')
      const t0 = Date.now()
      const r = await t.run(q, [t.ask({ text }, id, { quote })])
      assert.ok(Date.now() - t0 < ASK_STUB.atOnceMs, 'at once')
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.notUserMessage)
      await t.nothingSent(text)
      assert.equal(approvalAudit(ctx.home).length, auditBefore, 'no audit row')
    })
  }

  describe('size: the whole request message must fit maxMessageBytes', () => {
    /**
     * One size request with a reason of n bytes. When it is offered the instance rejects it; returns the
     * result, the notice and its size in bytes (null when nothing arrived).
     */
    async function sized(n) {
      await settledIdle(ctx.host, q)
      const text = tok('size')
      const id = cid('size')
      const t0 = Date.now()
      await t.start(q, [t.ask({ text }, id, { why: 'w'.repeat(n) })], SIZE_TURN)
      // Whichever comes first: the offer (it fits), or the call's own answer (refused before anything is sent).
      let offer
      let refusedAt = null
      await until(async () => {
        offer = (await t.offersFor(text))[0]
        if (offer) return true
        const r = (await ctx.host.call('inspect', { sessionId: q, events: true })).events.find((e) => e.type === 'tool/result' && e.result.callId === id)
        if (r) refusedAt = Date.now()
        return Boolean(r)
      }, ASK_STUB.offerWaitMs, 50)
      if (offer) await t.accepted(q, offer, { decision: DECISION.reject, risk: RISK.high, reason: 'fbtest size' })
      const json = await t.answered(q, id)
      await t.waitIdle(q)
      const notice = (await t.notices(text)).at(-1)
      return { json, text, offer, notice, size: notice ? bytes(notice.text) : null, answerMs: refusedAt === null ? null : refusedAt - t0 }
    }
    let atLimit
    before(async () => {
      await t.setLimit({ maxMessageBytes: SIZE_LIMIT })
      // Two calibration requests: the message grows with the reason; find the reason length that fills it exactly.
      const a = await sized(CALIBRATION.small)
      const b = await sized(CALIBRATION.large)
      assert.ok(a.size && b.size, 'precondition: calibration requests reached the instance')
      const slope = (b.size - a.size) / (CALIBRATION.large - CALIBRATION.small)
      assert.equal(slope, 1, 'precondition: each reason byte adds one message byte (' + slope + ')')
      atLimit = CALIBRATION.small + (SIZE_LIMIT - a.size)
      assert.ok(atLimit > 0, 'precondition: the base message fits ' + SIZE_LIMIT)
    }, HOOK)
    after(() => t.setLimit({ maxMessageBytes: LIMITS.maxMessageBytes.default }), HOOK)

    it('QUO-03 a request message exactly at maxMessageBytes reaches the instance', T, async () => {
      const r = await sized(atLimit)
      assert.ok(r.notice, 'reached the instance: ' + JSON.stringify(r.json))
      assert.equal(r.size, SIZE_LIMIT, 'the notice is exactly the limit')
      assertShape(r.json, ASK_CODE.rejected)
    })

    it('QUO-04 one byte over is refused too-large at once, and nothing reaches the instance', T, async () => {
      const r = await sized(atLimit + 1)
      assert.ok(r.answerMs !== null && r.answerMs < ASK_STUB.atOnceMs, 'at once: ' + r.answerMs + ' ms')
      assertShape(r.json, ASK_CODE.tooLarge)
      assert.equal(r.offer, undefined, 'no offer')
      assert.equal(r.notice, undefined, 'no notice')
    })

    it('QUO-05 a reply round over the limit is refused too-large; the request waits and a reply that fits continues it', T, async () => {
      const text = tok('05')
      const small = tok('05small')
      const [askId, bigId, smallId] = [cid('05a'), cid('05b'), cid('05c')]
      await t.start(q, [t.ask({ text }, askId), t.reply(REQUEST_PLACEHOLDER, 'r'.repeat(SIZE_LIMIT), bigId), t.reply(REQUEST_PLACEHOLDER, small, smallId)])
      const first = await t.offerFor(text)
      assert.ok(first, 'round 1 offered')
      await t.accepted(q, first, { decision: DECISION.ask, question: 'why? ' + text })
      const second = await t.nextOffer(first.approvalId, [first.offerId])
      assert.ok(second, 'the small reply was offered as the same request')
      await t.accepted(q, second, { decision: DECISION.reject, risk: RISK.high, reason: 'still no' })
      await t.waitIdle(q)
      assertShape(await t.answered(q, askId), ASK_CODE.question)
      assertShape(await t.answered(q, bigId), ASK_CODE.tooLarge)
      const rounds = await t.rounds(first.approvalId)
      assert.equal(rounds.length, 2, 'the big reply sent nothing; the small one is round 2')
      assert.equal(rounds.some((m) => m.text.includes('r'.repeat(PAD_PROBE * 2))), false)
      assert.ok(rounds[1].text.includes(small))
      const last = await t.answered(q, smallId)
      assertShape(last, ASK_CODE.rejected)
      assert.equal(last.request_id, first.approvalId)
    })
  })

  describe("QUO-06 a quote in the offer is at most 2048 bytes; the notice keeps the full text", () => {
    const bound = CONTRACT_LIMITS.quoteBytes
    for (const n of [bound, bound + 1]) {
      it('a quoted message of ' + n + ' bytes', T, async () => {
        const text = 'Q'.repeat(n)
        await turn(ctx.host, q, [[{ text: 'ok' }]], text)
        const id = await idOfText(q, text)
        assert.ok(id, 'precondition: the message is in the log')
        const { offer, notice } = await quotedRequest(tok('06'), [id])
        assert.equal(offer.quotes.length, 1)
        assert.ok(bytes(offer.quotes[0]) <= bound, 'at most ' + bound + ' bytes: ' + bytes(offer.quotes[0]))
        if (n <= bound) assert.equal(offer.quotes[0], text, 'at the limit: whole (contract §8)')
        assert.deepEqual(notice.block.fields.quoted_user_messages.map((m) => m.text), [text], 'the notice holds the full text (§7a.2)')
      })
    }
  })
})
