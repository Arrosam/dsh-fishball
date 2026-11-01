/**
 * Revision 11 rev11b: verified quotes and the size of one request message (DESIGN §7a.2 "Quotes are verified
 * by code", "Size", §9 audit `quotes`; §16 Q-r11-quote-bound, `maxMessageBytes`; requirements items 7, 9).
 * Same harness as rev11b-ask.test.mjs. One host; cases run in order. Expected values come from the
 * requirements (CASES.md "Revision 11 rev11b cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | QUO-01  | EP (valid quotes: a 1500-character message and a short one) | the notice's quoted_user_messages holds each quoted id with its FULL text from the log (not an excerpt), in the quoted order; the audit row's quotes are the ids and the audit never holds the text |
 * | QUO-02 ×6 | EP (relay / Fishball notice / runtime context / another session's message / unknown id / one valid + one relay) | {ok:false, code:'not-user-message'} at once, no request_id; nothing sent to Fishball; no audit row added |
 * | QUO-03  | BVA (maxMessageBytes: the request message exactly at the limit) | it reaches Fishball; the notice is exactly maxMessageBytes bytes |
 * | QUO-04  | BVA (one byte over) | {ok:false, code:'too-large'} at once, no request_id; no notice and no Fishball step |
 * | QUO-05  | BVA (a reply round over maxMessageBytes) | the reply is refused too-large and nothing is sent; the request still waits, and a reply that fits continues it |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_CODE, ASK_TOOL, DECISION, LIMITS, NOTICE, OUTCOME, REQUEST_PLACEHOLDER, STATUS } from './support/constants.mjs'
import {
  HOOK, T, approvalAudit, askStep, auditOf, bytes, fishballCall, jsonOf, managedSession, requestMessages, resultById, resultOfCall, roundsOf, settledIdle, turn, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'QUO' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const cid = (label) => 'call_' + tok(label)
const AT_ONCE_MS = 3000
const QUIET_MS = 1000
/** maxMessageBytes for the size cases: well above a small request's own size, small enough to fill quickly. */
const SIZE_LIMIT = 6000
/** The same turn text for every size request, so only the reason's length changes the message. */
const SIZE_TURN = 'fbtest size turn'

describe('Revision 11 rev11b: quotes and request size', () => {
  let host
  let home
  let fb
  let q
  let other
  const ids = {}
  let longText
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const plan = (needle, args) => host.call('planApproval', { sessionId: fb, needle, args })
  const run = (sid, steps, text) => turn(host, sid, [...steps, [{ text: 'done' }]], text)
  const askArgs = (text, quote, why = 'fbtest why') => ({ tool: ASK_TOOL, arguments: { text }, quote, why })
  const log = (sid) => host.call('userMessageLog', { sessionId: sid })

  before(async () => {
    home = newHome('rev11b-quotes')
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    q = await managedSession(host, fb, 'quo-q')
    other = await managedSession(host, fb, 'quo-other')
    longText = 'fix the failing tests ' + 'q'.repeat(1500)
    await turn(host, q, [[{ text: 'ok' }]], longText)
    const relayText = tok('relay')
    const sent = await fishballCall(host, fb, 'message_session', { session_id: q, message: relayText })
    assert.equal(sent.json?.ok, true, 'precondition: relay ' + JSON.stringify(sent.json))
    await until(async () => (await log(q)).some((m) => m.text.includes(relayText)), 8000, 100)
    await settledIdle(host, q)
    const noticeText = tok('notice')
    await host.call('driveStart', { sessionId: q, text: noticeText, source: { ...NOTICE, summary: 'fbtest notice' } })
    await host.call('waitIdle', { sessionId: q })
    await settledIdle(host, q)
    const entries = await log(q)
    ids.first = entries.find((m) => m.kind === 'user' && m.text === 'first words')?.id
    ids.long = entries.find((m) => m.kind === 'user' && m.text === longText)?.id
    ids.relay = entries.find((m) => m.text.includes(relayText))?.id
    ids.notice = entries.find((m) => m.text === noticeText)?.id
    ids.runtime = entries.find((m) => m.kind !== 'user' && m.id !== ids.relay && m.id !== ids.notice)?.id
    ids.other = (await log(other)).find((m) => m.kind === 'user')?.id
    ids.unknown = 'fbtest-no-such-message'
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('QUO-01 valid quotes reach Fishball as the full text, in the quoted order; the audit keeps only the ids', T, async () => {
    assert.ok(ids.long && ids.first, 'precondition: message ids ' + JSON.stringify(ids))
    const text = tok('01')
    await plan(text, { decision: DECISION.reject, risk: 'high', reason: 'fbtest' })
    const id = cid('01')
    const r = await run(q, [askStep(askArgs(text, [ids.long, ids.first]), id)])
    assert.equal(jsonOf(resultById(r, id))?.code, ASK_CODE.rejected, resultById(r, id)?.text)
    const req = await waitRequest(host, fb, text)
    const quoted = req.block.fields.quoted_user_messages
    assert.deepEqual(quoted.map((m) => m.id), [ids.long, ids.first])
    assert.deepEqual(quoted.map((m) => m.text), [longText, 'first words'], 'the full text from the log, not an excerpt')
    assert.ok(req.block.inner.includes(longText), 'inside the untrusted block')
    await settledIdle(host, fb)
    const [row] = auditOf(home, req.id)
    assert.deepEqual(row?.quotes, [ids.long, ids.first], 'audit quotes are the ids')
    assert.equal(JSON.stringify(approvalAudit(home)).includes('q'.repeat(100)), false, 'the audit never holds quoted text')
  })

  for (const [label, pick] of [
    ['a relay from Fishball', () => [ids.relay]],
    ['a Fishball notice', () => [ids.notice]],
    ['a runtime-context message', () => [ids.runtime]],
    ['another session\'s message', () => [ids.other]],
    ['an unknown id', () => [ids.unknown]],
    ['one valid id and a relay', () => [ids.first, ids.relay]],
  ]) {
    it('QUO-02 quoting ' + label + ' is refused not-user-message and nothing is sent', T, async () => {
      const quote = pick()
      assert.ok(quote.every(Boolean), 'precondition: ids ' + JSON.stringify(ids))
      await settledIdle(host, q)
      const text = tok('02')
      const auditBefore = approvalAudit(home).length
      const id = cid('02')
      const t0 = Date.now()
      const r = await run(q, [askStep(askArgs(text, quote), id)])
      assert.ok(Date.now() - t0 < AT_ONCE_MS, 'at once')
      const json = jsonOf(resultById(r, id))
      assert.equal(json?.code, ASK_CODE.notUserMessage, resultById(r, id)?.text)
      assert.equal(json.ok, false)
      assert.equal(json.request_id, undefined)
      await sleep(QUIET_MS)
      assert.deepEqual(await requestMessages(host, fb, text), [], 'nothing sent to Fishball')
      assert.equal(approvalAudit(home).length, auditBefore, 'no audit row')
    })
  }

  describe('size: the whole request message must fit maxMessageBytes', () => {
    /** One size request with a reason of n bytes, answered reject by plan; returns the notice's bytes and id. */
    async function sized(n) {
      await settledIdle(host, q)
      const text = tok('size')
      await plan(text, { decision: DECISION.reject, risk: 'high', reason: 'fbtest size' })
      const id = cid('size')
      const r = await run(q, [askStep(askArgs(text, [], 'w'.repeat(n)), id)], SIZE_TURN)
      const json = jsonOf(resultById(r, id))
      const notices = await requestMessages(host, fb, text)
      await settledIdle(host, fb)
      return { json, text, notice: notices.at(-1), size: notices.length ? bytes(notices.at(-1).text) : null }
    }
    let atLimit
    before(async () => {
      await setLimit({ maxMessageBytes: SIZE_LIMIT })
      // Two calibration requests: the message grows with the reason; find the reason length that fills it exactly.
      const a = await sized(100)
      const b = await sized(600)
      assert.ok(a.size && b.size, 'precondition: calibration requests reached Fishball')
      const slope = (b.size - a.size) / 500
      assert.equal(slope, 1, 'precondition: each reason byte adds one message byte (' + slope + ')')
      atLimit = 100 + (SIZE_LIMIT - a.size)
      assert.ok(atLimit > 0, 'precondition: the base message fits ' + SIZE_LIMIT)
    }, HOOK)
    after(async () => { await setLimit({ maxMessageBytes: LIMITS.maxMessageBytes.default }) }, HOOK)

    it('QUO-03 a request message exactly at maxMessageBytes reaches Fishball', T, async () => {
      const r = await sized(atLimit)
      assert.ok(r.notice, 'reached Fishball: ' + JSON.stringify(r.json))
      assert.equal(r.size, SIZE_LIMIT, 'the notice is exactly the limit')
      assert.equal(r.json?.code, ASK_CODE.rejected)
    })

    it('QUO-04 one byte over is refused too-large at once, and Fishball takes no step', T, async () => {
      const before = (await host.call('requests', { sessionId: fb })).length
      const t0 = Date.now()
      const r = await sized(atLimit + 1)
      assert.ok(Date.now() - t0 < AT_ONCE_MS, 'at once')
      assert.equal(r.json?.code, ASK_CODE.tooLarge, JSON.stringify(r.json))
      assert.equal(r.json.ok, false)
      assert.equal(r.json.request_id, undefined)
      assert.equal(r.notice, undefined, 'no notice')
      await sleep(QUIET_MS)
      assert.equal((await host.call('requests', { sessionId: fb })).length, before, 'no Fishball step')
    })

    it('QUO-05 a reply round over the limit is refused too-large; the request waits and a reply that fits continues it', T, async () => {
      await settledIdle(host, q)
      const text = tok('05')
      const small = tok('05small')
      await plan(text, { decision: DECISION.ask, risk: 'high', reason: 'need more', question: 'why? ' + text })
      await plan(small, { decision: DECISION.reject, risk: 'high', reason: 'still no' })
      const [askId, bigId, smallId] = [cid('05a'), cid('05b'), cid('05c')]
      const r = await run(q, [
        askStep(askArgs(text, []), askId),
        askStep({ request_id: REQUEST_PLACEHOLDER, reply: 'r'.repeat(SIZE_LIMIT) }, bigId),
        askStep({ request_id: REQUEST_PLACEHOLDER, reply: small }, smallId),
      ])
      const requestId = jsonOf(resultById(r, askId))?.request_id
      assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.question)
      const big = jsonOf(resultById(r, bigId))
      assert.equal(big?.code, ASK_CODE.tooLarge, resultById(r, bigId)?.text)
      const rounds = await roundsOf(host, fb, requestId)
      assert.equal(rounds.length, 2, 'the big reply sent nothing; the small one is round 2')
      assert.equal(rounds.some((m) => m.text.includes('r'.repeat(200))), false)
      const last = jsonOf(resultById(r, smallId)) ?? (await resultOfCall(host, q, smallId))?.json
      assert.equal(last?.code, ASK_CODE.rejected)
      assert.equal(last.request_id, requestId)
    })
  })
})
