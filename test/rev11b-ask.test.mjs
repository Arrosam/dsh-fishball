/**
 * Revision 11 rev11b: ask_fishball and Fishball's answers (DESIGN §14 row rev11b, §7a.2, §7a.3, §7a.5,
 * §7a.6 "To-you ticket" and "Before rev11c", §9 audit; requirements items 7-11). Before rev11c "to the
 * user" is the stock prompt in the asking session. Host boots with FBTEST_APPROVER_AFTER=1: the scripted
 * answerer stands in for that stock prompt AFTER Fishball's broker, and the root registers the asking tool
 * fbtest_ask (its body asks DSH for approval). Fishball's fake model answers a request through a plan
 * (answer_approval with the request id read from the notice); with no plan it answers only 'ok', so the
 * request waits. One host; cases run in order. Expected values come from the requirements (CASES.md
 * "Revision 11 rev11b cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | ASK-01  | EP (allow) | {ok:true, code:'allowed', request_id}; one notice saying the session asked first (ask_fishball), its block with tool, arguments, why, latest_user_message; audit row kind asked, answer allow |
 * | ASK-02  | EP (reject with a reason) | {ok:false, code:'rejected', reason, request_id}; audit answer reject |
 * | ASK-03 ×7 | DT (answer_approval refusals on an asked request) | allow+high → allow-needs-low-risk; allow '' / '   ' reason → reason-required; reject '' reason → reason-required; ask with no / '' question → question-required; unknown id → expired; each leaves the request pending |
 * | ASK-04  | DT (escalate needs nothing) | rev11c: {ok:true, requestId, decision:'escalate'}; a card, the agent keeps waiting; your Allow once → allowed, the identical call runs on the pass, decisions row allow-once by user, audit escalate then pass |
 * | ASK-05  | DT (allow with truncated arguments) | arguments-incomplete; still pending |
 * | ASK-06  | BVA (approvalAnswerSeconds 1, no answer) | rev11c: a card after about 1 s, the agent keeps waiting; your Reject → rejected with your note, decisions row reject; audit answer timeout |
 * | ASK-07  | ST (thread: 3 question rounds, then allow) | each round: code question, the same request_id, Fishball's question; each reply reaches Fishball as a new round of the same request with the whole thread in order; the final allow covers the call (it runs with no prompt and no further notice); one audit row |
 * | ASK-08 ×3 | EP (request_id unknown / settled / another session's) | {ok:false, code:'expired'}, no request_id, no notice |
 * | ASK-09  | EP (Permission requests off) | unavailable at once, request_id, no notice; the call then to the stock prompt |
 * | ASK-10  | ST (Permission requests turned off while an ask_fishball and a direct call wait) | the ask_fishball answers unavailable; the direct call shows its stock prompt |
 * | ASK-11  | ST (Fishball archived while an ask_fishball waits; then asked while archived) | unavailable for both, at once for the second; Fishball live again afterwards |
 * | ASK-12  | ST (Take back while ask_fishball waits) | no-longer-managed with request_id; audit answer released |
 * | ASK-13  | BVA (maxPendingApprovals 1 with 1 pending) | over-capacity at once with request_id, no notice; the identical call goes to the stock prompt |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ANSWER_TOOL, API, APPROVAL_ID, APPROVER_AFTER_ENV, APR_CODE, ASK_CODE, ASK_OUTPUT, ASK_REFUSALS, ASK_TOOL, AUDIT_ANSWER, AUDIT_KIND, DECISION, DECISION_ACTION, DECISIONS_TABLE,
  LIMITS, OUTCOME, OWN_PLUGINS, QUESTION_REQUIRED, REQUEST_PLACEHOLDER, STATUS, UNKNOWN_TOOL_TEXT, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import {
  HOOK, T, answerCard, approvalsNow, askStep, auditOf, blockArguments, callStep, fishballCall, jsonOf, managedSession, requestMessages, resultById, resultOfCall, roundsOf, setManaged, settledIdle,
  stockSeen, storedRows, turn, untilCard, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'ASK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const cid = (label) => 'call_' + tok(label)
/** An answer that comes "at once" (no Fishball step) arrives well inside this; Fishball's answer time is 120 s. */
const AT_ONCE_MS = 3000
const QUIET_MS = 1000
const LONG = { timeout: 120000 }

describe('Revision 11 rev11b: ask_fishball', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let home
  let fb
  let x
  let y
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const plan = (needle, args) => host.call('planApproval', { sessionId: fb, needle, args })
  /** Fishball answers a request in a turn of its own; returns the parsed answer. */
  const answer = async (requestId, args) => {
    await settledIdle(host, fb)
    const { json, result } = await fishballCall(host, fb, ANSWER_TOOL, { request_id: requestId, ...args })
    assert.ok(json, 'answer_approval answered JSON: ' + result?.text)
    return json
  }
  const pendingIds = async () => (await approvalsNow(host)).pending.map((p) => p.id)
  const askArgs = (args, why = 'fbtest why') => ({ tool: ASK_TOOL, arguments: args, quote: [], why })
  /** A turn in sid: the given steps, then a closing text. */
  const run = (sid, steps, text) => turn(host, sid, [...steps, [{ text: 'done' }]], text)
  /**
   * Start a turn whose ask_fishball waits (no plan), then runs the steps in after; return the request id once
   * the notice arrived. The reason also carries the text, so the notice can be found when the arguments are cut.
   */
  async function waiting(sid, text, id, after = []) {
    await settledIdle(host, sid)
    await host.call('driveStart', { sessionId: sid, script: [askStep(askArgs({ text }, 'why ' + text), id), ...after, [{ text: 'done' }]] })
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'the request reached Fishball; newest notice: ' + (await requestMessages(host, fb)).at(-1)?.text?.slice(0, 1500))
    await settledIdle(host, fb)
    return req.id
  }
  /** The answer of a call that ended in a turn started with driveStart. */
  const answered = async (sid, id) => { const r = await resultOfCall(host, sid, id, 15000); assert.ok(r, 'a result for ' + id); return r.json }
  /** The code-level shape every ask_fishball answer has: a code, ok only for allowed, request_id except on refusals. */
  function assertShape(json, code, label = '') {
    assert.equal(json?.code, code, label + JSON.stringify(json))
    assert.equal(json.ok, code === ASK_CODE.allowed, 'ok is true only for allowed')
    if (ASK_REFUSALS.includes(code)) assert.equal(json.request_id, undefined, 'a refusal carries no request id')
    else assert.match(json.request_id ?? '', APPROVAL_ID, 'request_id')
  }
  /**
   * The identical call made after the answer, in the same turn (a to-you ticket lasts until used or the turn
   * ends), went straight to the stock prompt: its answer is the stock prompt's, the stock prompt was asked once,
   * and Fishball got no notice beyond the ones already counted.
   */
  async function expectStockResult(sid, text, callId, outcome, notices) {
    const r = await resultOfCall(host, sid, callId, 15000)
    assert.equal(r?.text?.startsWith(ASK_OUTPUT(outcome)), true, "the stock prompt's answer: " + r?.text)
    assert.equal((await stockSeen(host, text)).length, 1, 'the stock prompt was asked once')
    await sleep(QUIET_MS)
    assert.equal((await requestMessages(host, fb, text)).length, notices, 'the call did not come back to Fishball')
  }
  /** Run fn with the stock prompt answering outcome, then back to reject. */
  async function withStock(outcome, fn) {
    await host.call('setApprover', { outcome })
    try { return await fn() } finally { await host.call('setApprover', { outcome: OUTCOME.reject }) }
  }
  /** The audit answers recorded under one request id, in key (time) order. */
  const answersOf = (requestId) => auditOf(home, requestId).map((r) => r.answer)
  const decisionsFor = (requestId) => storedRows(home, DECISIONS_TABLE).filter((d) => d.target === requestId)
  const toggleApprovals = async (on) => {
    const r = await host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await host.state()).features?.approvals === on, 10000, 100), 'features.approvals ' + on)
  }

  before(async () => {
    home = newHome('rev11b-ask')
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    x = await managedSession(host, fb, 'ask-x')
    y = await managedSession(host, fb, 'ask-y')
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ASK-01 allow: allowed with a request id; one notice that says the session asked first, with the call and its reason', T, async () => {
    const text = tok('01')
    const args = { text, pad: 'pad-01' }
    const why = 'needs approval because ' + text
    await plan(text, { decision: DECISION.allow, risk: 'low', reason: 'fine ' + text })
    const id = cid('01')
    const turnText = 'please do the 01 thing'
    const r = await run(x, [askStep(askArgs(args, why), id)], turnText)
    const json = jsonOf(resultById(r, id))
    assertShape(json, ASK_CODE.allowed)
    const notices = await requestMessages(host, fb, text)
    assert.equal(notices.length, 1, 'one notice')
    const req = await waitRequest(host, fb, text)
    assert.equal(req.id, json.request_id, 'the notice names the same request')
    assert.match(req.block.header, /ask_fishball/, 'says the session asked first (ask_fishball): ' + req.block.header)
    const f = req.block.fields
    assert.equal(f.tool, ASK_TOOL)
    assert.deepEqual(blockArguments(req.block), args)
    assert.equal(f.why, why)
    assert.equal(f.latest_user_message, turnText)
    assert.ok(Array.isArray(f.quoted_user_messages), 'quoted_user_messages is a list: ' + JSON.stringify(f.quoted_user_messages))
    assert.equal(f.quoted_user_messages.length, 0)
    await settledIdle(host, fb)
    const rows = auditOf(home, json.request_id)
    assert.equal(rows.length, 1, 'one audit row per request')
    assert.equal(rows[0].kind, AUDIT_KIND.asked)
    assert.equal(rows[0].answer, AUDIT_ANSWER.allow)
    assert.deepEqual(rows[0].quotes ?? [], [], 'no quotes')
  })

  let settledId
  it('ASK-02 reject with a reason: rejected, and the agent sees the reason', T, async () => {
    const text = tok('02')
    const reason = 'too dangerous ' + text
    await plan(text, { decision: DECISION.reject, risk: 'high', reason })
    const id = cid('02')
    const r = await run(x, [askStep(askArgs({ text }), id)])
    const json = jsonOf(resultById(r, id))
    assertShape(json, ASK_CODE.rejected)
    assert.equal(json.reason, reason)
    settledId = json.request_id
    await settledIdle(host, fb)
    const rows = auditOf(home, json.request_id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].answer, AUDIT_ANSWER.reject)
    assert.equal(rows[0].kind, AUDIT_KIND.asked)
  })

  describe('ASK-03 refused answers leave the request pending', () => {
    let text
    let requestId
    let callId
    let stockId
    before(async () => {
      text = tok('03')
      callId = cid('03')
      stockId = cid('03stock')
      // After the answer the agent makes the identical call in the same turn (ASK-04).
      requestId = await waiting(x, text, callId, [callStep({ text }, stockId)])
    }, HOOK)
    for (const [label, args, code] of [
      ['allow with high risk', { decision: DECISION.allow, risk: 'high', reason: 'r' }, APR_CODE.lowRisk],
      ['allow with an empty reason', { decision: DECISION.allow, risk: 'low', reason: '' }, APR_CODE.reason],
      ['allow with a blank reason', { decision: DECISION.allow, risk: 'low', reason: '   ' }, APR_CODE.reason],
      ['reject with an empty reason', { decision: DECISION.reject, risk: 'high', reason: '' }, APR_CODE.reason],
      ['ask with no question', { decision: DECISION.ask, risk: 'high', reason: 'r' }, QUESTION_REQUIRED],
      ['ask with an empty question', { decision: DECISION.ask, risk: 'high', reason: 'r', question: '' }, QUESTION_REQUIRED],
    ]) {
      it(label + ' → ' + code, T, async () => {
        const json = await answer(requestId, args)
        assert.equal(json?.ok, false, JSON.stringify(json))
        assert.equal(json.code, code)
        assert.ok((await pendingIds()).includes(requestId), 'still pending')
        assert.equal(await host.call('agentStatus', { sessionId: x }), 'running', 'the agent still waits')
      })
    }
    it('an unknown request id → expired', T, async () => {
      const json = await answer('apr_0123456789abcdef', { decision: DECISION.escalate, risk: 'high', reason: 'r' })
      assert.equal(json?.code, APR_CODE.expired, JSON.stringify(json))
      assert.ok((await pendingIds()).includes(requestId))
    })

    it('ASK-04 escalate needs nothing extra: the request becomes a card and the agent keeps waiting; your Allow once then lets the identical call run (rev11c: replaces the to-user answer)', T, async () => {
      // risk and reason are answer_approval's schema fields for every decision (P7); escalate adds no code rule,
      // so even an empty reason is accepted (§7a.3 "None: any request can go to you").
      const json = await answer(requestId, { decision: DECISION.escalate, risk: 'high', reason: '' })
      assert.deepEqual(json, { ok: true, requestId, decision: DECISION.escalate })
      assert.ok(await untilCard(host, requestId), 'a card in the pile')
      await sleep(QUIET_MS)
      assert.equal(await host.call('agentStatus', { sessionId: x }), 'running', 'the agent keeps waiting (no to-user answer)')
      assert.deepEqual(await stockSeen(host, text), [], 'no stock prompt')
      assert.equal((await answerCard(host, requestId, 'allow')).status, 200)
      const got = await answered(x, callId)
      assertShape(got, ASK_CODE.allowed)
      assert.equal(got.request_id, requestId)
      await host.call('waitIdle', { sessionId: x })
      assert.equal((await resultOfCall(host, x, stockId, 15000))?.text, ASK_OUTPUT(OUTCOME.allow), 'the identical call ran on the pass')
      assert.deepEqual(await stockSeen(host, text), [], 'still no stock prompt')
      assert.ok(await until(() => decisionsFor(requestId).length > 0, 5000, 100), 'a decisions row for your click')
      const [row] = decisionsFor(requestId)
      assert.equal(row.action, DECISION_ACTION.allowOnce)
      assert.equal(row.by, 'user')
      await settledIdle(host, fb)
      assert.deepEqual(answersOf(requestId), [AUDIT_ANSWER.escalate, AUDIT_ANSWER.pass])
      assert.equal(auditOf(home, requestId)[0].finalOutcome, OUTCOME.allow, 'your answer is its outcome')
    })
  })

  it('ASK-05 allow on truncated arguments is refused arguments-incomplete and stays pending', T, async () => {
    await setLimit({ argumentExcerptBytes: 16 })
    try {
      const text = tok('05') + 'z'.repeat(64)
      const callId = cid('05')
      const requestId = await waiting(x, text, callId)
      const json = await answer(requestId, { decision: DECISION.allow, risk: 'low', reason: 'fine' })
      assert.equal(json?.code, APR_CODE.incomplete, JSON.stringify(json))
      assert.ok((await pendingIds()).includes(requestId))
      assert.deepEqual(await answer(requestId, { decision: DECISION.reject, risk: 'high', reason: 'cannot see it all' }), { ok: true, requestId, decision: DECISION.reject })
      assertShape(await answered(x, callId), ASK_CODE.rejected)
      await host.call('waitIdle', { sessionId: x })
    } finally { await setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
  })

  it('ASK-06 approvalAnswerSeconds 1 with no answer: a card after about 1 s and the agent keeps waiting; your Reject then answers rejected (rev11c: replaces to-user)', T, async () => {
    await setLimit({ approvalAnswerSeconds: 1 })
    try {
      await settledIdle(host, x)
      const text = tok('06')
      const id = cid('06')
      await host.call('driveStart', { sessionId: x, script: [askStep(askArgs({ text }), id), [{ text: 'done' }]] })
      const req = await waitRequest(host, fb, text)
      const t0 = Date.now()
      const card = await untilCard(host, req.id, 8000)
      assert.ok(card, 'a card in the pile')
      assert.ok(Date.now() - t0 < 10000, 'about the answer time')
      await sleep(QUIET_MS)
      assert.equal(await host.call('agentStatus', { sessionId: x }), 'running', 'the agent keeps waiting')
      assert.deepEqual(await stockSeen(host, text), [], 'no stock prompt')
      assert.equal((await answerCard(host, req.id, 'reject', 'timed out note')).status, 200)
      const json = await answered(x, id)
      assertShape(json, ASK_CODE.rejected)
      assert.equal(json.reason, 'timed out note')
      await host.call('waitIdle', { sessionId: x })
      await settledIdle(host, fb)
      assert.ok(await until(() => decisionsFor(json.request_id).length > 0, 5000, 100), 'a decisions row for your click')
      assert.equal(decisionsFor(json.request_id)[0].action, DECISION_ACTION.reject)
      assert.equal(decisionsFor(json.request_id)[0].by, 'user')
      assert.deepEqual(answersOf(json.request_id), [AUDIT_ANSWER.timeout])
    } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('ASK-07 a thread of three question rounds, then allow: one request, the whole thread each round, the call covered', LONG, async () => {
    await settledIdle(host, x)
    const text = tok('07')
    const args = { text }
    const qs = [1, 2, 3].map((i) => 'question ' + i + ' ' + text)
    const replies = [1, 2, 3].map((i) => tok('07reply' + i))
    await plan(text, { decision: DECISION.ask, risk: 'high', reason: 'need more', question: qs[0] })
    await plan(replies[0], { decision: DECISION.ask, risk: 'high', reason: 'need more', question: qs[1] })
    await plan(replies[1], { decision: DECISION.ask, risk: 'high', reason: 'need more', question: qs[2] })
    await plan(replies[2], { decision: DECISION.allow, risk: 'low', reason: 'clear now' })
    const ids = [0, 1, 2, 3].map((i) => cid('07ask' + i))
    const callId = cid('07call')
    const r = await turn(host, x, [
      askStep(askArgs(args), ids[0]),
      ...replies.map((reply, i) => askStep({ request_id: REQUEST_PLACEHOLDER, reply }, ids[i + 1])),
      callStep(args, callId),
      [{ text: 'done' }],
    ], undefined, 60000)
    const answers = ids.map((id) => jsonOf(resultById(r, id)))
    const requestId = answers[0]?.request_id
    for (const [i, a] of answers.slice(0, 3).entries()) {
      assertShape(a, ASK_CODE.question, 'round ' + (i + 1) + ': ')
      assert.equal(a.request_id, requestId, 'the same request id every round')
      assert.equal(a.question, qs[i])
    }
    assertShape(answers[3], ASK_CODE.allowed)
    assert.equal(answers[3].request_id, requestId)
    assert.equal(resultById(r, callId)?.text, ASK_OUTPUT(OUTCOME.allow), 'the call ran on the pass')
    assert.deepEqual(await stockSeen(host, text), [], 'no stock prompt')
    const rounds = await roundsOf(host, fb, requestId)
    assert.equal(rounds.length, 4, 'one notice per round, all for the same request')
    assert.equal((await requestMessages(host, fb, text)).length, 4, 'no further notice for the call itself')
    const want = [qs[0], replies[0], qs[1], replies[1], qs[2], replies[2]]
    const thread = rounds[3].block.fields.thread
    assert.ok(Array.isArray(thread), 'the last round carries the thread: ' + JSON.stringify(rounds[3].block.fields))
    assert.deepEqual(thread.map((t) => t.text), want, 'the whole thread, in order')
    assert.deepEqual(thread.map((t) => t.from), ['fishball', 'agent', 'fishball', 'agent', 'fishball', 'agent'])
    for (const [i, round] of rounds.slice(1).entries()) {
      const texts = (round.block.fields.thread ?? []).map((t) => t.text)
      assert.deepEqual(texts, want.slice(0, 2 * (i + 1)), 'round ' + (i + 2) + ' has the thread so far')
    }
    await settledIdle(host, fb)
    // One decision row for the whole thread (no row per question round), then the call made on the pass.
    assert.deepEqual(answersOf(requestId), [AUDIT_ANSWER.allow, AUDIT_ANSWER.pass])
  })

  describe('ASK-08 continuing a request that is not this session\'s pending one answers expired', () => {
    const expectExpired = async (requestId) => {
      await settledIdle(host, x)
      const id = cid('08')
      const reply = tok('08reply')
      const r = await run(x, [askStep({ request_id: requestId, reply }, id)])
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.expired)
      await sleep(QUIET_MS)
      assert.deepEqual(await requestMessages(host, fb, reply), [], 'nothing sent to Fishball')
    }
    it('an unknown request id', T, () => expectExpired('apr_00000000deadbeef'))
    it('a settled request id', T, () => expectExpired(settledId))
    it('another session\'s pending request id', T, async () => {
      const text = tok('08y')
      const callId = cid('08y')
      const other = await waiting(y, text, callId)
      try { await expectExpired(other) } finally {
        await host.call('cancel', { sessionId: y })
        await settledIdle(host, y)
      }
    })
  })

  it('ASK-09 Permission requests off: unavailable at once, and the call then goes to the stock prompt', T, async () => {
    await toggleApprovals(false)
    try {
      await settledIdle(host, x)
      const text = tok('09')
      const [id, stockId] = [cid('09'), cid('09stock')]
      const t0 = Date.now()
      const r = await withStock(OUTCOME.allow, () => run(x, [askStep(askArgs({ text }), id), callStep({ text }, stockId)]))
      assert.ok(Date.now() - t0 < AT_ONCE_MS, 'at once: ' + (Date.now() - t0) + ' ms')
      // Reading (A-r11b-3): the tools belong to Permission requests, so with it off a new step may no longer list
      // ask_fishball; DSH's UNKNOWN_TOOL is then the "at once" answer. Either way nothing reaches Fishball.
      const got = resultById(r, id)
      if (!UNKNOWN_TOOL_TEXT.test(got?.text ?? '')) assertShape(jsonOf(got), ASK_CODE.unavailable)
      await expectStockResult(x, text, stockId, OUTCOME.allow, 0)
    } finally { await toggleApprovals(true) }
  })

  it('ASK-10 Permission requests turned off while requests wait: ask_fishball answers unavailable, a direct call shows its stock prompt', T, async () => {
    const askText = tok('10ask')
    const askId = cid('10ask')
    await waiting(x, askText, askId)
    const directText = tok('10direct')
    await settledIdle(host, y)
    await host.call('driveStart', { sessionId: y, script: [callStep({ text: directText }, cid('10direct')), [{ text: 'done' }]] })
    assert.ok(await waitRequest(host, fb, directText), 'the direct call reached Fishball')
    await settledIdle(host, fb)
    await toggleApprovals(false)
    try {
      assertShape(await answered(x, askId), ASK_CODE.unavailable)
      assert.ok(await until(async () => (await stockSeen(host, directText)).length === 1, 8000, 100), 'the direct call shows its stock prompt')
      await host.call('waitIdle', { sessionId: x })
      await host.call('waitIdle', { sessionId: y })
    } finally { await toggleApprovals(true) }
  })

  it('ASK-11 Fishball stops while an ask_fishball waits: unavailable; asked while Fishball is stopped: unavailable at once', LONG, async () => {
    const text = tok('11')
    const id = cid('11')
    await waiting(x, text, id)
    const archived = await host.call('archive', { sessionId: fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    try {
      assertShape(await answered(x, id), ASK_CODE.unavailable)
      await host.call('waitIdle', { sessionId: x })
      await settledIdle(host, x)
      const text2 = tok('11b')
      const id2 = cid('11b')
      const t0 = Date.now()
      const r = await run(x, [askStep(askArgs({ text: text2 }), id2)])
      assert.ok(Date.now() - t0 < AT_ONCE_MS, 'at once: ' + (Date.now() - t0) + ' ms')
      assertShape(jsonOf(resultById(r, id2)), ASK_CODE.unavailable)
    } finally {
      await host.call('unarchive', { sessionId: fb })
      const rec = await host.post(API.recovery, { action: 'retry' })
      assert.equal(rec.status, 200, rec.text)
      await host.waitStatus(STATUS.live)
      await settledIdle(host, fb)
    }
  })

  it('ASK-12 Take back while ask_fishball waits: no-longer-managed; audit answer released', T, async () => {
    const z = await managedSession(host, fb, 'ask-12')
    const text = tok('12')
    const id = cid('12')
    const requestId = await waiting(z, text, id)
    const r = await setManaged(host, z, false)
    assert.equal(r.status, 200, r.text)
    const got = await answered(z, id)
    assertShape(got, ASK_CODE.noLongerManaged)
    assert.equal(got.request_id, requestId)
    await host.call('waitIdle', { sessionId: z })
    await settledIdle(host, fb)
    assert.equal(auditOf(home, requestId)[0]?.answer, AUDIT_ANSWER.released)
  })

  it('ASK-13 maxPendingApprovals 1 with one request pending: over-capacity at once; the call then goes to the stock prompt', T, async () => {
    await setLimit({ maxPendingApprovals: 1 })
    try {
      const busy = tok('13busy')
      await waiting(y, busy, cid('13busy'))
      await settledIdle(host, x)
      const text = tok('13')
      const [id, stockId] = [cid('13'), cid('13stock')]
      const t0 = Date.now()
      const r = await withStock(OUTCOME.allow, () => run(x, [askStep(askArgs({ text }), id), callStep({ text }, stockId)]))
      assert.ok(Date.now() - t0 < AT_ONCE_MS, 'at once: ' + (Date.now() - t0) + ' ms')
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.overCapacity)
      await expectStockResult(x, text, stockId, OUTCOME.allow, 0)
    } finally {
      await host.call('cancel', { sessionId: y })
      await settledIdle(host, y)
      await setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }
  })
})
