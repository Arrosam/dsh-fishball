/**
 * Revision 11 rev11b: direct calls in a managed session (no ask_fishball first), their wording, retries,
 * Fishball's question on a direct call, escalate and timeout, and your clicks' audit (DESIGN §7a.3 "ask on a
 * direct call", §7a.4, §7a.5, §9 decisions; requirements items 12-13; S35 Q1). Same harness as
 * rev11b-ask.test.mjs (FBTEST_APPROVER_AFTER=1: the scripted answerer is the session's stock prompt; the
 * asking fixture tool fbtest_ask returns 'outcome=<DSH outcome>'). One host; cases run in order. Expected
 * values come from the requirements (CASES.md "Revision 11 rev11b cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | DIR-01  | EP (direct call, Fishball allows) | the notice says a direct call and carries your last turn; the result is the tool's own output + "\n\nFishball approved this call once. …"; not an error; audit kind direct, answer allow |
 * | DIR-02  | EP (Fishball rejects with a reason) | an error result exactly "Fishball rejected this call: <reason>\nNext time, call ask_fishball …"; no "the user rejected"; audit answer reject |
 * | DIR-03  | ST (rejected –retry→) | the retried call reaches Fishball again as a new request; allowed this time, with the hint |
 * | DIR-04  | ST (Fishball asks on a direct call → agent replies with ask_fishball → allow) | an error result naming the request id and the question and telling the agent to use ask_fishball; the reply continues the same request (a second round with the thread); allowed; the call made again runs on the pass (its own output, no prompt, no further notice) |
 * | DIR-05  | EP (escalate) | the stock prompt shows in the session and answers the call; no further notice; your Allow once → decisions row allow-once, by user, target the request id |
 * | DIR-06  | BVA (approvalAnswerSeconds 1, no answer) | the stock prompt after about 1 s (not before); your Reject → decisions row reject; audit answer timeout |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ALLOWED_TEXT, ANSWER_TOOL, APPROVER_AFTER_ENV, ASK_CODE, ASK_OUTPUT, AUDIT_ANSWER, AUDIT_KIND, DECISION, DECISION_ACTION, DECISIONS_TABLE, DSH_REJECT_WORDS,
  LIMITS, OUTCOME, REJECTED_TEXT, REQUEST_PLACEHOLDER, STATUS, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import {
  HOOK, T, askStep, auditOf, callStep, jsonOf, managedSession, requestMessages, resultById, roundsOf, settledIdle, stockSeen, storedRows, turn, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'DIR' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const cid = (label) => 'call_' + tok(label)
const QUIET_MS = 1000
const REQUEST_ID = /apr_[0-9a-f]+/

describe('Revision 11 rev11b: direct calls', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  let x
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const plan = (needle, args) => host.call('planApproval', { sessionId: fb, needle, args })
  const run = (steps, text) => turn(host, x, [...steps, [{ text: 'done' }]], text)
  const decisionsFor = (requestId) => storedRows(home, DECISIONS_TABLE).filter((d) => d.target === requestId)
  async function withStock(outcome, fn) {
    await host.call('setApprover', { outcome })
    try { return await fn() } finally { await host.call('setApprover', { outcome: OUTCOME.reject }) }
  }

  before(async () => {
    home = newHome('rev11b-direct')
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    x = await managedSession(host, fb, 'dir-x')
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DIR-01 allowed: the notice carries your last turn; the result carries the hint', T, async () => {
    const text = tok('01')
    const turnText = 'please run the 01 check'
    await plan(text, { decision: DECISION.allow, risk: 'low', reason: 'fine ' + text })
    const id = cid('01')
    const r = await run([callStep({ text }, id)], turnText)
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'the direct call reached Fishball')
    assert.match(req.block.header, /direct/i, 'says it is a direct call: ' + req.block.header)
    assert.equal(req.block.fields.latest_user_message, turnText, 'your last turn')
    const result = resultById(r, id)
    assert.equal(result?.text, ALLOWED_TEXT(ASK_OUTPUT(OUTCOME.allow)))
    assert.equal(result.isError, false)
    assert.deepEqual(await stockSeen(host, text), [])
    await settledIdle(host, fb)
    const [row] = auditOf(home, req.id)
    assert.equal(row?.kind, AUDIT_KIND.direct, JSON.stringify(row))
    assert.equal(row.answer, AUDIT_ANSWER.allow)
  })

  it('DIR-02 rejected: the agent sees Fishball\'s reason and the hint, never "the user rejected"', T, async () => {
    await settledIdle(host, x)
    const text = tok('02')
    const reason = 'this deletes data outside the workspace ' + text
    await plan(text, { decision: DECISION.reject, risk: 'high', reason })
    const id = cid('02')
    const r = await run([callStep({ text }, id)])
    const result = resultById(r, id)
    assert.equal(result?.text, REJECTED_TEXT(reason))
    assert.equal(result.isError, true)
    assert.equal(result.text.includes(DSH_REJECT_WORDS), false)
    await settledIdle(host, fb)
    const req = await waitRequest(host, fb, text)
    assert.equal(auditOf(home, req.id)[0]?.answer, AUDIT_ANSWER.reject)
  })

  it('DIR-03 a rejected call retried reaches Fishball again', T, async () => {
    await settledIdle(host, x)
    const text = tok('03')
    const args = { text }
    // Each turn's text is unique and is the notice's latest_user_message, so each plan answers its own request.
    const [first, second] = ['first try ' + tok('03a'), 'second try ' + tok('03b')]
    await plan(first, { decision: DECISION.reject, risk: 'high', reason: 'not now' })
    await plan(second, { decision: DECISION.allow, risk: 'low', reason: 'now fine' })
    const id1 = cid('03a')
    assert.equal(resultById(await run([callStep(args, id1)], first), id1)?.isError, true)
    await settledIdle(host, fb)
    const id2 = cid('03b')
    const r = await run([callStep(args, id2)], second)
    assert.equal(resultById(r, id2)?.text, ALLOWED_TEXT(ASK_OUTPUT(OUTCOME.allow)))
    const notices = await requestMessages(host, fb, text)
    assert.equal(notices.length, 2, 'two requests reached Fishball')
    assert.notEqual(REQUEST_ID.exec(notices[0].text)[0], REQUEST_ID.exec(notices[1].text)[0], 'a new request')
  })

  it('DIR-04 Fishball asks on a direct call: a rejection carrying the question; the agent\'s ask_fishball continues the same request', T, async () => {
    await settledIdle(host, x)
    const text = tok('04')
    const args = { text }
    const question = 'which files does this touch? ' + text
    const reply = tok('04reply')
    await plan(text, { decision: DECISION.ask, risk: 'high', reason: 'unclear', question })
    await plan(reply, { decision: DECISION.allow, risk: 'low', reason: 'clear now' })
    const [callId, replyId, againId] = [cid('04call'), cid('04reply'), cid('04again')]
    const r = await run([callStep(args, callId), askStep({ request_id: REQUEST_PLACEHOLDER, reply }, replyId), callStep(args, againId)])
    const first = resultById(r, callId)
    const requestId = REQUEST_ID.exec((await requestMessages(host, fb, text))[0].text)[0]
    assert.equal(first?.isError, true, 'a rejection: ' + first?.text)
    assert.ok(first.text.includes(requestId), 'names the request id ' + requestId + ': ' + first.text)
    assert.ok(first.text.includes(question), 'carries the question')
    assert.match(first.text, /ask_fishball/, 'tells the agent to answer with ask_fishball')
    const continued = jsonOf(resultById(r, replyId))
    assert.equal(continued?.code, ASK_CODE.allowed, resultById(r, replyId)?.text)
    assert.equal(continued.request_id, requestId, 'the same request')
    const rounds = await roundsOf(host, fb, requestId)
    assert.equal(rounds.length, 2, 'the reply reached Fishball as a second round of the same request')
    assert.deepEqual((rounds[1].block.fields.thread ?? []).map((t) => t.text), [question, reply], 'with the thread')
    assert.equal(resultById(r, againId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the call made again ran on the pass')
    assert.deepEqual(await stockSeen(host, text), [])
    await sleep(QUIET_MS)
    assert.equal((await requestMessages(host, fb, text)).length, 2, 'no further notice')
  })

  it('DIR-05 escalate: the stock prompt answers the call, no second Fishball step; your Allow once is audited', T, async () => {
    await settledIdle(host, x)
    const text = tok('05')
    await plan(text, { decision: DECISION.escalate, risk: 'high', reason: 'for the user' })
    const id = cid('05')
    const r = await withStock(OUTCOME.allow, () => run([callStep({ text }, id)]))
    assert.equal(resultById(r, id)?.text?.startsWith(ASK_OUTPUT(OUTCOME.allow)), true, resultById(r, id)?.text)
    assert.equal((await stockSeen(host, text)).length, 1, 'the stock prompt showed')
    await sleep(QUIET_MS)
    const notices = await requestMessages(host, fb, text)
    assert.equal(notices.length, 1, 'the call did not come back to Fishball')
    const requestId = REQUEST_ID.exec(notices[0].text)[0]
    assert.ok(await until(() => decisionsFor(requestId).length > 0, 5000, 100), 'a decisions row')
    const [row] = decisionsFor(requestId)
    assert.equal(row.action, DECISION_ACTION.allowOnce)
    assert.equal(row.by, 'user')
    assert.equal(auditOf(home, requestId)[0]?.answer, AUDIT_ANSWER.escalate)
  })

  it('DIR-06 approvalAnswerSeconds 1 with no answer: the stock prompt after about 1 s; your Reject is audited', T, async () => {
    await setLimit({ approvalAnswerSeconds: 1 })
    try {
      await settledIdle(host, x)
      const text = tok('06')
      const id = cid('06')
      const t0 = Date.now()
      const r = await run([callStep({ text }, id)])
      assert.equal(resultById(r, id)?.text?.startsWith(ASK_OUTPUT(OUTCOME.reject)), true, resultById(r, id)?.text)
      const [seen] = await stockSeen(host, text)
      assert.ok(seen, 'the stock prompt showed')
      assert.ok(seen.at - t0 >= 1000, 'not before the answer time: ' + (seen.at - t0) + ' ms')
      assert.ok(seen.at - t0 < 10000)
      const requestId = REQUEST_ID.exec((await requestMessages(host, fb, text))[0].text)[0]
      assert.ok(await until(() => decisionsFor(requestId).length > 0, 5000, 100), 'a decisions row')
      assert.equal(decisionsFor(requestId)[0].action, DECISION_ACTION.reject)
      assert.equal(decisionsFor(requestId)[0].by, 'user')
      await settledIdle(host, fb)
      assert.equal(auditOf(home, requestId)[0]?.answer, AUDIT_ANSWER.timeout)
    } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })
})
