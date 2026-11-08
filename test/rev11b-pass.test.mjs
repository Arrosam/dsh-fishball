/**
 * Revision 11 rev11b on the H-STUB harness: one-time passes (DESIGN §7a.3 "One-time passes", §9 "Passes and to-you
 * tickets"; contract §5 `approval.ran`). A pass covers exactly one call: the same session, tool and canonical-JSON
 * arguments (key order ignored), until it is used or the session's turn ends. The stub is the instance: it answers
 * the ask_fishball request with `approval.answer` while the asking turn runs. FBTEST_APPROVER_AFTER=1 puts the
 * scripted stock prompt after the broker, and fbtest_ask asks in its body. One host; cases run in order. Expected
 * values come from the requirements, never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PAS-01  | EP (the exact call after allow) | runs with no prompt and no second offer: its output exactly, no stock prompt; approval.ran {via pass, by fishball} names the request |
 * | PAS-02  | ST (pass used –same call again→) | the second identical call goes to the instance (a new request id) |
 * | PAS-03  | EP (one argument changed) | goes to the instance, which is offered the changed arguments; the unused pass still covers the original call afterwards in the same turn |
 * | PAS-04  | EP (same arguments, other key order) | covered: runs with no prompt and no further offer |
 * | PAS-05  | ST (pass unused –turn ends→) | the identical call in the next turn goes to the instance |
 * | PAS-06  | EP (the identical call from another managed session while the pass is live) | goes to the instance; the owner's call then still runs on its pass |
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { RAN_VIA, SETTLED_BY } from 'fishball-connector/contract'
import { ASK_CODE, ASK_OUTPUT, ASK_TOOL, OUTCOME } from './support/constants.mjs'
import { HOOK, T, askStep, callStep, jsonOf, resultById, resultOfCall, turn } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import { APPROVALS, answerWhen, bootApprovals, clearSession, mentions, offersWhere, ranEvents, stockFor, tok } from './support/instance-stub-approvals.mjs'
import { sleep, until } from './support/util.mjs'

const cid = (label) => 'call_' + tok(label)
const askArgs = (args) => ({ tool: ASK_TOOL, arguments: args, quote: [], why: 'fbtest why' })

describe('Revision 11 rev11b: one-time passes (H-STUB)', () => {
  let booted
  let host
  let stub
  let x
  let y
  const offersOf = (marker) => offersWhere(stub, mentions(marker))
  const allowNth = (marker, nth = 1) => answerWhen(stub, mentions(marker), APPROVALS.answer.allow('fine ' + marker), { nth })
  const rejectNth = (marker, nth) => answerWhen(stub, mentions(marker), APPROVALS.answer.reject('not that one'), { nth })

  before(async () => {
    booted = await bootApprovals('rev11b-pass')
    ;({ host, stub } = booted)
    x = await managedSession(host, 'pas-x')
    y = await managedSession(host, 'pas-y')
  }, HOOK)
  after(() => stopStub(booted), HOOK)
  afterEach(async () => { await host.call('releaseHold', { sessionId: x }); await clearSession(host, x); await clearSession(host, y) }, HOOK)

  it('PAS-01 allow: the exact call then runs with no prompt and no second offer', T, async () => {
    const text = tok('01')
    const args = { text, pad: 'p' }
    const answered = allowNth(text)
    const [askId, callId] = [cid('01a'), cid('01b')]
    const r = await turn(host, x, [askStep(askArgs(args), askId), callStep(args, callId), [{ text: 'done' }]])
    const requestId = (await answered)?.frame.payload.approvalId
    assert.ok(requestId, 'the ask_fishball request reached the instance')
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed, resultById(r, askId)?.text)
    assert.equal(resultById(r, callId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran with its own output')
    assert.equal(resultById(r, callId)?.isError, false)
    assert.deepEqual(await stockFor(host, text), [], 'no stock prompt')
    await sleep(APPROVALS.ms.quiet)
    assert.equal((await offersOf(text)).length, 1, 'only the ask_fishball request: no second offer')
    const ran = await ranEvents(stub, requestId)
    assert.equal(ran.length, 1, 'approval.ran once')
    assert.equal(ran[0].via, RAN_VIA.pass)
    assert.equal(ran[0].by, SETTLED_BY.fishball)
    assert.equal(ran[0].toolName, ASK_TOOL)
  })

  it('PAS-02 a used pass is gone: the same call again in the same turn goes to the instance', T, async () => {
    const text = tok('02')
    const args = { text }
    const first = allowNth(text)
    const second = rejectNth(text, 2)
    const [askId, firstId, secondId] = [cid('02a'), cid('02b'), cid('02c')]
    const r = await turn(host, x, [askStep(askArgs(args), askId), callStep(args, firstId), callStep(args, secondId), [{ text: 'done' }]])
    assert.equal(resultById(r, firstId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the first call ran on the pass')
    const [a, b] = [await first, await second]
    assert.ok(b, 'the second identical call reached the instance')
    assert.notEqual(b.frame.payload.approvalId, a.frame.payload.approvalId, 'a new request for the second call')
    assert.deepEqual(await stockFor(host, text), [], 'it went to the instance, not to the stock prompt')
  })

  it('PAS-03 one argument changed goes to the instance; the original call is still covered afterwards', T, async () => {
    const text = tok('03')
    const args = { text, pad: 'original' }
    const changed = { text, pad: 'changed' + text }
    allowNth(text)
    const second = rejectNth(text, 2)
    const [askId, changedId, originalId] = [cid('03a'), cid('03b'), cid('03c')]
    const r = await turn(host, x, [askStep(askArgs(args), askId), callStep(changed, changedId), callStep(args, originalId), [{ text: 'done' }]])
    const offer = await second
    assert.ok(offer, 'the changed call reached the instance')
    assert.deepEqual(JSON.parse(offer.frame.payload.arguments), changed, 'the instance is asked about the changed call')
    assert.deepEqual(offer.reply.payload, { accepted: true })
    assert.equal(resultById(r, originalId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the original call ran on the unused pass')
    assert.equal((await offersOf(text)).length, 2, 'the ask and the changed call only')
    assert.deepEqual(await stockFor(host, text), [])
  })

  it('PAS-04 the same arguments in another key order are covered', T, async () => {
    const text = tok('04')
    allowNth(text)
    const [askId, callId] = [cid('04a'), cid('04b')]
    const r = await turn(host, x, [askStep(askArgs({ text, pad: 'k' }), askId), callStep({ pad: 'k', text }, callId), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed)
    assert.equal(resultById(r, callId)?.text, ASK_OUTPUT(OUTCOME.allow))
    await sleep(APPROVALS.ms.quiet)
    assert.equal((await offersOf(text)).length, 1, 'no further offer')
    assert.deepEqual(await stockFor(host, text), [])
  })

  it('PAS-05 a pass not used before the turn ends is gone: the call in the next turn goes to the instance', T, async () => {
    const text = tok('05')
    const args = { text }
    allowNth(text)
    const askId = cid('05a')
    const r = await turn(host, x, [askStep(askArgs(args), askId), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed)
    const second = rejectNth(text, 2)
    await turn(host, x, [callStep(args, cid('05b')), [{ text: 'done' }]], 'next turn')
    assert.ok(await second, 'the identical call in the next turn reached the instance')
    assert.deepEqual(await stockFor(host, text), [])
  })

  it('PAS-06 another managed session\'s identical call is not covered; the owner\'s call still runs on its pass', T, async () => {
    const text = tok('06')
    const args = { text }
    const [askId, callId] = [cid('06a'), cid('06b')]
    await host.call('driveStart', { sessionId: x, script: [askStep(askArgs(args), askId), callStep(args, callId), [{ text: 'done' }]] })
    const [first] = await until(async () => { const o = await offersOf(text); return o.length > 0 ? o : false }, APPROVALS.ms.settle, 50) || []
    assert.ok(first, 'the ask_fishball request reached the instance')
    // x waits inside ask_fishball; hold its next model request so its turn (and so its pass) stays open.
    await host.call('holdNext', { sessionId: x })
    const allowed = await answerWhen(stub, mentions(text), APPROVALS.answer.allow('fine'))
    assert.deepEqual(allowed.reply.payload, { accepted: true })
    assert.ok(await until(() => host.call('isHeld', { sessionId: x }), APPROVALS.ms.settle, 50), 'x is held with its pass unused')
    const yOffer = rejectNth(text, 2)
    await turn(host, y, [callStep(args, cid('06y')), [{ text: 'done' }]])
    const yReq = await yOffer
    assert.ok(yReq, "y's identical call reached the instance")
    assert.equal(yReq.frame.sessionId, y)
    assert.notEqual(yReq.frame.payload.approvalId, first.payload.approvalId)
    await host.call('releaseHold', { sessionId: x })
    assert.equal((await resultOfCall(host, x, callId))?.text, ASK_OUTPUT(OUTCOME.allow), "x's call ran on its pass")
    await host.call('waitIdle', { sessionId: x })
  })
})
