/**
 * Revision 11 rev11b on the H-STUB harness: direct calls in a managed session (no ask_fishball first), their
 * wording, retries, the instance's question on a direct call, escalate and timeout, and your clicks' audit
 * (DESIGN §7a.3 "ask on a direct call", §7a.4, §7a.5, §9 decisions; contract §4.2, §5). The stub is the instance and
 * answers with `approval.answer` while the session's turn runs; FBTEST_APPROVER_AFTER=1 puts the scripted stock
 * prompt after the broker, and the asking fixture tool fbtest_ask returns 'outcome=<DSH outcome>'. One host; cases
 * run in order. Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | DIR-01  | EP (direct call, the instance allows) | the notice says a direct call and carries your last turn; the result is the tool's own output + "\n\nFishball approved this call once. …"; not an error; no stock prompt; audit kind direct, answer allow |
 * | DIR-02  | EP (the instance rejects with a reason) | an error result exactly "Fishball rejected this call: <reason>\nNext time, call ask_fishball …"; no "the user rejected"; audit answer reject |
 * | DIR-03  | ST (rejected –retry→) | the retried call reaches the instance again as a new request; allowed this time, with the hint |
 * | DIR-04  | ST (the instance asks on a direct call → agent replies with ask_fishball → allow) | an error result naming the request id and the question and telling the agent to use ask_fishball; the reply continues the same request (offered again with the same id; its notice has the thread); allowed; the call made again runs on the pass (its own output, no stock prompt, no further offer; approval.ran via pass) |
 * | DIR-05  | EP (escalate) | the stock prompt shows in the session and answers the call; no further offer; your Allow once → decisions row allow-once, by user, target the request id; audit escalate |
 * | DIR-06  | BVA (approvalAnswerSeconds 1, no answer) | the stock prompt after about 1 s (not before); your Reject → decisions row reject; audit answer timeout |
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { RAN_VIA } from 'fishball-connector/contract'
import {
  ALLOWED_TEXT, ASK_CODE, ASK_OUTPUT, AUDIT_ANSWER, AUDIT_KIND, DECISION_ACTION, DECISIONS_TABLE, DSH_REJECT_WORDS, LIMITS, OUTCOME, REJECTED_TEXT, REQUEST_PLACEHOLDER,
} from './support/constants.mjs'
import { HOOK, T, askStep, callStep, jsonOf, resultById, storedRows, turn } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import {
  APPROVALS, answerWhen, auditedFor, bootApprovals, clearSession, itemFor, itemsFor, mentions, offersWhere, ranEvents, setLimit, stockFor, tok,
} from './support/instance-stub-approvals.mjs'
import { sleep, until } from './support/util.mjs'

const cid = (label) => 'call_' + tok(label)

describe('Revision 11 rev11b: direct calls (H-STUB)', () => {
  let booted
  let host
  let stub
  let x
  const run = (steps, text) => turn(host, x, [...steps, [{ text: 'done' }]], text)
  const decisionsFor = (requestId) => storedRows(booted.home, DECISIONS_TABLE).filter((d) => d.target === requestId)
  const offersOf = (text) => offersWhere(stub, mentions(text))
  async function withStock(outcome, fn) {
    await host.call('setApprover', { outcome })
    try { return await fn() } finally { await host.call('setApprover', { outcome: APPROVALS.stock.default }) }
  }

  before(async () => {
    booted = await bootApprovals('rev11b-direct')
    ;({ host, stub } = booted)
    x = await managedSession(host, 'dir-x')
  }, HOOK)
  after(() => stopStub(booted), HOOK)
  afterEach(() => clearSession(host, x), HOOK)

  it('DIR-01 allowed: the notice carries your last turn; the result carries the hint', T, async () => {
    const text = tok('01')
    const turnText = 'please run the 01 check'
    const answered = answerWhen(stub, mentions(text), APPROVALS.answer.allow('fine ' + text))
    const id = cid('01')
    const r = await run([callStep({ text }, id)], turnText)
    const offer = await answered
    assert.ok(offer, 'the direct call reached the instance')
    const item = await itemFor(stub, offer.frame.payload.approvalId)
    assert.match(item.header, APPROVALS.item.direct, 'says it is a direct call: ' + item.header)
    assert.equal(item.fields.latest_user_message, turnText, 'your last turn')
    const result = resultById(r, id)
    assert.equal(result?.text, ALLOWED_TEXT(ASK_OUTPUT(OUTCOME.allow)))
    assert.equal(result.isError, false)
    assert.deepEqual(await stockFor(host, text), [])
    const [row] = await auditedFor(booted.home, offer.frame.payload.approvalId)
    assert.equal(row?.kind, AUDIT_KIND.direct, JSON.stringify(row))
    assert.equal(row.answer, AUDIT_ANSWER.allow)
  })

  it('DIR-02 rejected: the agent sees the instance\'s reason and the hint, never "the user rejected"', T, async () => {
    const text = tok('02')
    const reason = 'this deletes data outside the workspace ' + text
    const answered = answerWhen(stub, mentions(text), APPROVALS.answer.reject(reason))
    const id = cid('02')
    const r = await run([callStep({ text }, id)])
    const offer = await answered
    const result = resultById(r, id)
    assert.equal(result?.text, REJECTED_TEXT(reason))
    assert.equal(result.isError, true)
    assert.equal(result.text.includes(DSH_REJECT_WORDS), false)
    assert.equal((await auditedFor(booted.home, offer.frame.payload.approvalId))[0]?.answer, AUDIT_ANSWER.reject)
  })

  it('DIR-03 a rejected call retried reaches the instance again', T, async () => {
    const text = tok('03')
    const args = { text }
    const first = answerWhen(stub, mentions(text), APPROVALS.answer.reject('not now'))
    const id1 = cid('03a')
    assert.equal(resultById(await run([callStep(args, id1)]), id1)?.isError, true)
    assert.ok(await first)
    const second = answerWhen(stub, mentions(text), APPROVALS.answer.allow('now fine'), { nth: 2 })
    const id2 = cid('03b')
    const r = await run([callStep(args, id2)])
    assert.ok(await second, 'the retry was offered')
    assert.equal(resultById(r, id2)?.text, ALLOWED_TEXT(ASK_OUTPUT(OUTCOME.allow)))
    const offers = await offersOf(text)
    assert.equal(offers.length, 2, 'two requests reached the instance')
    assert.notEqual(offers[0].payload.approvalId, offers[1].payload.approvalId, 'a new request')
  })

  it('DIR-04 the instance asks on a direct call: a rejection carrying the question; the agent\'s ask_fishball continues the same request', T, async () => {
    const text = tok('04')
    const args = { text }
    const question = 'which files does this touch? ' + text
    const reply = tok('04reply')
    const asked = answerWhen(stub, mentions(text), APPROVALS.answer.ask(question))
    // The reply is offered again under the same id (its second round); answer that round.
    const allowed = answerWhen(stub, mentions(text), APPROVALS.answer.allow('clear now'), { nth: 2 })
    const [callId, replyId, againId] = [cid('04call'), cid('04reply'), cid('04again')]
    const r = await run([callStep(args, callId), askStep({ request_id: REQUEST_PLACEHOLDER, reply }, replyId), callStep(args, againId)])
    const requestId = (await asked).frame.payload.approvalId
    const firstResult = resultById(r, callId)
    assert.equal(firstResult?.isError, true, 'a rejection: ' + firstResult?.text)
    assert.ok(firstResult.text.includes(requestId), 'names the request id ' + requestId + ': ' + firstResult.text)
    assert.ok(firstResult.text.includes(question), 'carries the question')
    assert.match(firstResult.text, APPROVALS.askFishballWord, 'tells the agent to answer with ask_fishball')
    const continued = jsonOf(resultById(r, replyId))
    assert.equal(continued?.code, ASK_CODE.allowed, resultById(r, replyId)?.text)
    assert.equal(continued.request_id, requestId, 'the same request')
    assert.equal((await allowed)?.frame.payload.approvalId, requestId, 'the reply was offered under the same id')
    const rounds = await itemsFor(stub, requestId)
    assert.equal(rounds.length, 2, 'the reply reached the instance as a second round of the same request')
    const thread = (await itemFor(stub, requestId, { last: true })).fields.thread ?? []
    assert.deepEqual(thread.map((t) => t.text), [question, reply], 'with the thread')
    assert.equal(resultById(r, againId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the call made again ran on the pass')
    assert.deepEqual(await stockFor(host, text), [])
    await sleep(APPROVALS.ms.quiet)
    assert.equal((await offersOf(text)).length, 2, 'no further offer')
    assert.deepEqual((await ranEvents(stub, requestId)).map((e) => e.via), [RAN_VIA.pass], 'approval.ran tells the instance the call ran on the pass')
  })

  it('DIR-05 escalate: the stock prompt answers the call, no further offer; your Allow once is audited', T, async () => {
    const text = tok('05')
    const answered = answerWhen(stub, mentions(text), { decision: 'escalate', risk: 'high', reason: 'for the user' })
    const id = cid('05')
    const r = await withStock(OUTCOME.allow, () => run([callStep({ text }, id)]))
    assert.equal(resultById(r, id)?.text?.startsWith(ASK_OUTPUT(OUTCOME.allow)), true, resultById(r, id)?.text)
    assert.equal((await stockFor(host, text)).length, 1, 'the stock prompt showed')
    const requestId = (await answered).frame.payload.approvalId
    await sleep(APPROVALS.ms.quiet)
    assert.equal((await offersOf(text)).length, 1, 'the call did not come back to the instance')
    assert.ok(await until(() => decisionsFor(requestId).length > 0, APPROVALS.ms.settle, 100), 'a decisions row')
    const [row] = decisionsFor(requestId)
    assert.equal(row.action, DECISION_ACTION.allowOnce)
    assert.equal(row.by, 'user')
    assert.equal((await auditedFor(booted.home, requestId))[0]?.answer, AUDIT_ANSWER.escalate)
  })

  it('DIR-06 approvalAnswerSeconds 1 with no answer: the stock prompt after about 1 s; your Reject is audited', T, async () => {
    await setLimit(host, { approvalAnswerSeconds: 1 })
    try {
      const text = tok('06')
      const id = cid('06')
      const t0 = Date.now()
      const r = await run([callStep({ text }, id)])
      assert.equal(resultById(r, id)?.text?.startsWith(ASK_OUTPUT(OUTCOME.reject)), true, resultById(r, id)?.text)
      const [seen] = await stockFor(host, text)
      assert.ok(seen, 'the stock prompt showed')
      assert.ok(seen.at - t0 >= 1000, 'not before the answer time: ' + (seen.at - t0) + ' ms')
      assert.ok(seen.at - t0 < 10000)
      const [offer] = await offersOf(text)
      assert.ok(offer, 'the request was offered first')
      const requestId = offer.payload.approvalId
      assert.ok(await until(() => decisionsFor(requestId).length > 0, APPROVALS.ms.settle, 100), 'a decisions row')
      assert.equal(decisionsFor(requestId)[0].action, DECISION_ACTION.reject)
      assert.equal(decisionsFor(requestId)[0].by, 'user')
      assert.equal((await auditedFor(booted.home, requestId))[0]?.answer, AUDIT_ANSWER.timeout)
    } finally { await setLimit(host, { approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })
})
