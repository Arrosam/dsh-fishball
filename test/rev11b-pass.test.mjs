/**
 * Revision 11 rev11b: one-time passes (DESIGN §7a.3 "One-time passes", §9 "Passes and to-you tickets";
 * requirements item 8, defaults "Pass lifetime"; S35 Q3). A pass covers exactly one call: the same
 * session, tool and canonical-JSON arguments (key order ignored), until it is used or the session's turn
 * ends. Same harness as rev11b-ask.test.mjs (FBTEST_APPROVER_AFTER=1, fbtest_ask asks in its body). One
 * host; cases run in order. Expected values come from the requirements (CASES.md "Revision 11 rev11b
 * cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PAS-01  | EP (the exact call after allow) | runs with no prompt and no second Fishball step: its output exactly, no stock prompt, no further notice |
 * | PAS-02  | ST (pass used –same call again→) | the second identical call goes to Fishball (a new notice) |
 * | PAS-03  | EP (one argument changed) | goes to Fishball; the unused pass still covers the original call afterwards in the same turn |
 * | PAS-04  | EP (same arguments, other key order) | covered: runs with no prompt and no further notice |
 * | PAS-05  | ST (pass unused –turn ends→) | the identical call in the next turn goes to Fishball |
 * | PAS-06  | EP (the identical call from another managed session while the pass is live) | goes to Fishball; the owner's call then still runs on its pass |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ANSWER_TOOL, APPROVER_AFTER_ENV, ASK_CODE, ASK_OUTPUT, ASK_TOOL, DECISION, OUTCOME, STATUS, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, askStep, blockArguments, callStep, fishballCall, jsonOf, managedSession, requestMessages, resultById, resultOfCall, settledIdle, stockSeen, turn, untrustedBlock } from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'PAS' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const cid = (label) => 'call_' + tok(label)
const QUIET_MS = 1000
const REQUEST_ID = /^\[permission request (apr_[0-9a-f]+)\]/

describe('Revision 11 rev11b: one-time passes', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let fb
  let x
  let y
  const plan = (needle, args) => host.call('planApproval', { sessionId: fb, needle, args })
  const allowPlan = (text) => plan(text, { decision: DECISION.allow, risk: 'low', reason: 'fine ' + text })
  const askArgs = (args) => ({ tool: ASK_TOOL, arguments: args, quote: [], why: 'fbtest why' })
  const notices = (needle) => requestMessages(host, fb, needle)
  /** Wait until Fishball has n notices containing needle; returns the newest one's request id. */
  async function nthNotice(needle, n) {
    assert.ok(await until(async () => (await notices(needle)).length >= n, 10000, 50), n + ' notices for ' + needle)
    return REQUEST_ID.exec((await notices(needle)).at(-1).text)?.[1]
  }
  const answer = async (requestId, args) => { await settledIdle(host, fb); return (await fishballCall(host, fb, ANSWER_TOOL, { request_id: requestId, ...args })).json }
  async function stop(sid) { await host.call('cancel', { sessionId: sid }); await host.call('waitIdle', { sessionId: sid }); await settledIdle(host, sid) }

  before(async () => {
    host = await bootHost(newHome('rev11b-pass'), { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    x = await managedSession(host, fb, 'pas-x')
    y = await managedSession(host, fb, 'pas-y')
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PAS-01 allow: the exact call then runs with no prompt and no second Fishball step', T, async () => {
    const text = tok('01')
    const args = { text, pad: 'p' }
    await allowPlan(text)
    const [askId, callId] = [cid('01a'), cid('01b')]
    const r = await turn(host, x, [askStep(askArgs(args), askId), callStep(args, callId), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed, resultById(r, askId)?.text)
    assert.equal(resultById(r, callId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran with its own output')
    assert.equal(resultById(r, callId)?.isError, false)
    assert.deepEqual(await stockSeen(host, text), [], 'no stock prompt')
    await sleep(QUIET_MS)
    assert.equal((await notices(text)).length, 1, 'only the ask_fishball notice: no second Fishball step')
  })

  it('PAS-02 a used pass is gone: the same call again in the same turn goes to Fishball', T, async () => {
    await settledIdle(host, x)
    const text = tok('02')
    const args = { text }
    await allowPlan(text)
    const [askId, first, second] = [cid('02a'), cid('02b'), cid('02c')]
    await host.call('driveStart', { sessionId: x, script: [askStep(askArgs(args), askId), callStep(args, first), callStep(args, second), [{ text: 'done' }]] })
    const id2 = await nthNotice(text, 2)
    assert.equal((await resultOfCall(host, x, first))?.text, ASK_OUTPUT(OUTCOME.allow), 'the first call ran on the pass')
    const firstId = REQUEST_ID.exec((await notices(text))[0].text)?.[1]
    assert.notEqual(id2, firstId, 'a new request for the second call')
    assert.deepEqual(await stockSeen(host, text), [], 'it waits for Fishball, not at the stock prompt')
    await stop(x)
  })

  it('PAS-03 one argument changed goes to Fishball; the original call is still covered afterwards', T, async () => {
    await settledIdle(host, x)
    const text = tok('03')
    const args = { text, pad: 'original' }
    const changed = { text, pad: 'changed' + text }
    await allowPlan(text)
    const [askId, changedId, originalId] = [cid('03a'), cid('03b'), cid('03c')]
    await host.call('driveStart', { sessionId: x, script: [askStep(askArgs(args), askId), callStep(changed, changedId), callStep(args, originalId), [{ text: 'done' }]] })
    const changedRequest = await nthNotice(changed.pad, 1)
    const block = untrustedBlock((await notices(changed.pad)).at(-1).text)
    assert.deepEqual(blockArguments(block), changed, 'Fishball is asked about the changed call')
    assert.deepEqual(await answer(changedRequest, { decision: DECISION.reject, risk: 'high', reason: 'not that one' }), { ok: true, requestId: changedRequest, decision: DECISION.reject })
    assert.equal((await resultOfCall(host, x, originalId))?.text, ASK_OUTPUT(OUTCOME.allow), 'the original call ran on the unused pass')
    await host.call('waitIdle', { sessionId: x })
    assert.equal((await notices(text)).length, 2, 'the ask and the changed call only')
    assert.deepEqual(await stockSeen(host, text), [])
  })

  it('PAS-04 the same arguments in another key order are covered', T, async () => {
    await settledIdle(host, x)
    const text = tok('04')
    await allowPlan(text)
    const [askId, callId] = [cid('04a'), cid('04b')]
    const r = await turn(host, x, [askStep(askArgs({ text, pad: 'k' }), askId), callStep({ pad: 'k', text }, callId), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed)
    assert.equal(resultById(r, callId)?.text, ASK_OUTPUT(OUTCOME.allow))
    await sleep(QUIET_MS)
    assert.equal((await notices(text)).length, 1, 'no further notice')
    assert.deepEqual(await stockSeen(host, text), [])
  })

  it('PAS-05 a pass not used before the turn ends is gone: the call in the next turn goes to Fishball', T, async () => {
    await settledIdle(host, x)
    const text = tok('05')
    const args = { text }
    await allowPlan(text)
    const askId = cid('05a')
    const r = await turn(host, x, [askStep(askArgs(args), askId), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, askId))?.code, ASK_CODE.allowed)
    await settledIdle(host, fb)
    await host.call('driveStart', { sessionId: x, text: 'next turn', script: [callStep(args, cid('05b')), [{ text: 'done' }]] })
    await nthNotice(text, 2)
    assert.deepEqual(await stockSeen(host, text), [])
    await stop(x)
  })

  it('PAS-06 another managed session\'s identical call is not covered; the owner\'s call still runs on its pass', T, async () => {
    await settledIdle(host, x)
    await settledIdle(host, y)
    const text = tok('06')
    const args = { text }
    const [askId, callId] = [cid('06a'), cid('06b')]
    await host.call('driveStart', { sessionId: x, script: [askStep(askArgs(args), askId), callStep(args, callId), [{ text: 'done' }]] })
    const requestId = await nthNotice(text, 1)
    await settledIdle(host, fb)
    // x waits inside ask_fishball; hold its next model request so its turn (and so its pass) stays open.
    await host.call('holdNext', { sessionId: x })
    assert.deepEqual(await answer(requestId, { decision: DECISION.allow, risk: 'low', reason: 'fine' }), { ok: true, requestId, decision: DECISION.allow })
    assert.ok(await until(() => host.call('isHeld', { sessionId: x }), 5000, 50), 'x is held with its pass unused')
    await host.call('driveStart', { sessionId: y, script: [callStep(args, cid('06y')), [{ text: 'done' }]] })
    const yRequest = await nthNotice(text, 2)
    assert.notEqual(yRequest, requestId)
    await stop(y)
    await host.call('releaseHold', { sessionId: x })
    assert.equal((await resultOfCall(host, x, callId))?.text, ASK_OUTPUT(OUTCOME.allow), 'x\'s call ran on its pass')
    await host.call('waitIdle', { sessionId: x })
  })
})
