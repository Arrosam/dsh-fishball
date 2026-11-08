/**
 * P7 ApprovalBroker on the H-STUB harness (DESIGN §7a.1-§7a.5, §7a.13, §7a.14, §9 audit, §16 limits; contract
 * §4.2, §5, §5.1). The stub is the instance: it gets the `approval.request` descriptor and the `approval` inbox
 * item (the request notice, with the header and the untrusted block Fishball used to read), and answers with
 * `approval.answer`. The host boots with FBTEST_APPROVER_AFTER=1: the scripted stock prompt sits after the
 * connector's broker, and the root registers the asking tool fbtest_ask. Expected values come from the
 * requirements, never from the implementation.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | APR-01  | EP (first request) | §5.1, §7a.2, P1 | one descriptor of exactly the §5.1 keys: approvalId apr_<hex>, prompt 'Permission request: "fbtest_ask"', toolName, callId, reason, title, quotes [], arguments (the call's JSON) and argumentsStatus complete, expiresAt − at = 120 s; one `approval` item: '[permission request <id>]', 'within 120 s', 'Arguments: complete.', started by / turn by 'the user', the 'expired is normal' line, the 9 block fields once each, no subagent or call_was_to_tool field |
 * | APR-02  | EP (permission mode) | P1 | the item's permission_mode is the session's sandbox mode (read-only after a switch); approval_policy "ask" |
 * | APR-03  | EP | §7a.13, P2 | answering belongs to the instance: no answer_approval tool in a managed session or globally; a call of it is an error |
 * | APR-04  | DT allow/low/reason → ok | §4.2, P2, P3 | {accepted:true}; outcome allowed-once; one approval/asked and one approval/decided allowed-once in X; the stock prompt never asked; approval.settled {decision allow, by fishball} |
 * | APR-05 ×4 | DT (allow+high / whitespace reason / allow on truncated) | §4.2 | the error code; still listed and X still waits; a later valid answer is accepted |
 * | APR-05e | BVA (reason '' with allow) | §4.2 "a present reason must be non-empty (reason-required)", §7 answers | error reason-required; the channel stays open; still listed and X still waits; a later valid answer is accepted |
 * | APR-06 ×2 | DT (unknown id / answered id) | §4.2, §7a.3 | expired |
 * | APR-07  | DT escalate | §7a.3, slim §8.1 and T09 ("an escalation settles with the user's decision and emits approval.settled") | the stock prompt is asked; its outcome is X's; the instance gets approval.settled with the user's decision (by user) and a card record naming the request, by user, outcome allowed; audit escalate / allowed-once |
 * | APR-08 ×2 | BVA (approvalAnswerSeconds 2 and 1) | §7a.5, §16 | expiresAt − at = n s; 'within n s'; the stock prompt after about n s (not before); never silence-approved; the instance is told it ended; a late answer expired; audit timeout |
 * | APR-09  | ST (the instance has not taken the notice) | P5 update | the answer time starts at the request: the stock prompt after about 2 s although the item is unacknowledged |
 * | APR-10  | ST (cancel after the notice) | §7a.1 "Fishball told", contract §4.5 CARD_CLOSED, slim T09 "a card closed without an answer reaches the child as [card closed …]", instance.md I7-EP-06, P6 | cancelled; the stock prompt not asked; no longer listed; the instance is told it ended; a later answer expired; audit withdrawn / cancelled |
 * | APR-11  | ST (cancel before the instance took the notice) | P6 update | the same |
 * | APR-12  | ST (cancel while the escalated request waits at the stock prompt) | P6 update | cancelled; audit finalOutcome cancelled |
 * | APR-13 ×4 | BVA (argumentExcerptBytes = L, L+1, L−1, L−8 with 2-byte chars) | §16, §7a.14 | complete and whole at L and L+1; below: truncated, a prefix of the JSON within the limit, '…', no broken character, 'alone makes it high risk'; the descriptor's argumentsStatus and the audit agree |
 * | APR-14 ×3 | EP (no call id / call id not in the log / call to another tool) | §7a.14, §5.1 | unavailable everywhere (descriptor, item, audit); callId null only without a call id; call_was_to_tool names the real tool only in the third; allow → arguments-incomplete and the request stays |
 * | APR-15 ×3 | BVA (latest user message 2048 / 2049 / 3000 bytes) | §16 requestUserMessageBytes | whole at 2048; above it a prefix of at most 2048 bytes |
 * | APR-16 ×5 | DT (provenance) | §7a.14 | relay from Fishball (session.message) → turn 'Fishball (message_session)'; relay from another agent → 'another agent or a notice' and the user's latest message; session.start → 'Fishball (start_session)' both; a blank session's first message from Fishball → 'Fishball (start_session)'; a first message from another agent → other/unknown |
 * | APR-17  | EP (subagent of X) | §7a.1, §7a.14 | the request is X's (envelope and session_id), asked_by_subagent_session the child, X's latest user message |
 * | APR-19  | EP (policy never) | P7 | rejected; no offer, no item, no stock prompt; not audited |
 * | APR-20  | EP (the stock prompt throws) | §7a.14 | unavailable; audit finalOutcome unavailable |
 * | APR-21  | EP | §9 "never stored" | the audit record's §9 fields with a digest; neither the audit files nor /api/fishball/state hold the argument text |
 * | APR-23  | BVA (auditEntriesKept 2) | §9, §16 | at most 2 audit records, the newest kept |
 *
 * Retired:
 * - APR-18: the wake-up cap went with the in-process agent (slim §5.2 "Wake-up belongs to the child"; wakeupsPerHour removed).
 * - APR-22: state.approvals and its 20 recent entries are gone (slim §9 "no legacy sections", approvalsShown removed, H-STUB state keys).
 * - APR-24: the permission rubric is the instance's persona now, not the connector's (slim §0.5, §12).
 * - APR-25: the "Permission requests" settings section went with Fishball's in-process settings page (slim §9, §12); connector settings are DSH's Plugins form (contract §0).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import { ERROR, SETTLED_BY, DECISION, CARD_RECORD } from 'fishball-connector/contract'
import {
  ANSWER_TOOL, APPROVAL_FIELDS, APPROVAL_ID, APPROVAL_SUMMARY, APPROVER_HOLDS, APPROVER_THROWS, ARGS_STATUS, ASK_REASON, ASK_TOOL, ELLIPSIS, LIMITS, LIMITS_R11,
  OUTCOME, PRESET, STARTED_BY, STARTED_BY_OTHER, TITLE, TURN_BY, INTAKE_DIR,
} from './support/constants.mjs'
import { HOOK, T, bytes, callScript, callTool, toolNames, turn } from './support/expect.mjs'
import { handOver, managedSession, stopStub } from './support/instance-stub.mjs'
import {
  APPROVALS, ackAllAndReconnect, answerOffer, auditFor, auditOfSession, auditedFor, bootApprovals, clearSession, ensureAttached, escalateAndSettle, itemFor, listed, offerFor, outcomeOf,
  offersWhere, requestFor, setLimit, settledEvents, startCall, stockFor, tok, toldEnded, untilStock, cardRecordsFor,
} from './support/instance-stub-approvals.mjs'
import { sleep, until } from './support/util.mjs'

describe('P7 ApprovalBroker (H-STUB)', () => {
  let booted
  let host
  let stub
  let x
  let xCwd
  /** Ask from sid and wait for the offer and its notice. */
  const asked = (sid, text, opts) => requestFor(booted, sid, text, opts)
  const answer = (req, a, opts) => answerOffer(stub, req.sessionId, req.descriptor, a, opts)
  const done = async (sid) => clearSession(host, sid)

  before(async () => {
    booted = await bootApprovals('approvals')
    ;({ host, stub } = booted)
    x = await managedSession(host, 'apr-x')
    xCwd = (await host.call('header', { sessionId: x })).cwd
  }, HOOK)
  after(() => stopStub(booted), HOOK)
  // A failed case must not leave X waiting on a request: the next case's call would queue behind it.
  afterEach(() => clearSession(host, x), HOOK)

  it('APR-01 the first request reaches the instance with the documented descriptor and notice', T, async () => {
    const text = tok('01')
    const args = { text, pad: 'pad-01' }
    const req = await asked(x, text, { args: { pad: 'pad-01' }, turnText: 'please do the 01 thing' })
    const d = req.descriptor
    assert.equal(req.sessionId, x, 'the event is about the asking session')
    assert.deepEqual(Object.keys(d).sort(), [...APPROVALS.descriptorKeys].sort())
    assert.match(d.approvalId, APPROVAL_ID)
    assert.equal(d.prompt, APPROVAL_SUMMARY(ASK_TOOL))
    assert.equal(d.toolName, ASK_TOOL)
    assert.equal(typeof d.callId, 'string')
    assert.equal(d.reason, ASK_REASON(text))
    assert.equal(d.title, await host.call('sessionTitle', { sessionId: x }))
    assert.deepEqual(d.quotes, [])
    assert.deepEqual(JSON.parse(d.arguments), args, "the model-requested arguments of that call")
    assert.equal(d.argumentsStatus, ARGS_STATUS.complete)
    // `at` is when the request began and `expiresAt` is set when its round starts, a moment later (contract §5.1
    // names no exact difference), so the window is the answer time plus at most the timer slack (once 120001).
    const window = d.expiresAt - d.at
    const answerMs = LIMITS.approvalAnswerSeconds.default * 1000
    assert.ok(window >= answerMs && window <= answerMs + APPROVALS.ms.timerSlack, 'the answer time: ' + window)
    const { header, block, fields } = req.item
    assert.ok(req.item.payload.text.startsWith(APPROVALS.item.prefix(d.approvalId)))
    assert.match(header, APPROVALS.item.seconds(LIMITS.approvalAnswerSeconds.default))
    assert.ok(header.includes(APPROVALS.item.argumentsLine(ARGS_STATUS.complete)), header)
    assert.deepEqual([req.item.started, req.item.turnBy], [STARTED_BY.user, TURN_BY.user])
    assert.match(header, APPROVALS.item.expiredNormal, 'says a later expired answer is normal')
    for (const f of APPROVAL_FIELDS) assert.equal(block.counts?.[f], 1, 'one ' + f + ' line: ' + req.item.payload.text)
    assert.equal(fields.session_id, x)
    assert.equal(fields.session_folder, xCwd)
    assert.equal(fields.tool, ASK_TOOL)
    assert.equal(fields.reason_given, ASK_REASON(text))
    assert.deepEqual(JSON.parse(fields.arguments), args)
    assert.equal(fields.latest_user_message, 'please do the 01 thing')
    assert.equal(fields.asked_by_subagent_session, undefined)
    assert.equal(fields.call_was_to_tool, undefined)
    assert.equal(block.closes, 1)
    assert.equal(req.item.payload.sourceSessionId, x)
    await escalateAndSettle(booted, req, text)
    assert.equal((await stub.pushTexts(APPROVALS.item.prefix(d.approvalId))).length, 1, 'one notice')
    await done(x)
  })

  it('APR-02 permission_mode is the session sandbox mode; approval_policy the session policy', T, async () => {
    const sid = await managedSession(host, 'apr-02')
    assert.equal(await host.call('setSandboxMode', { sessionId: sid, mode: APPROVALS.mode.readOnly }), APPROVALS.mode.readOnly)
    const text = tok('02')
    const req = await asked(sid, text)
    assert.equal(req.item.fields.permission_mode, APPROVALS.mode.readOnly)
    assert.equal(req.item.fields.approval_policy, APPROVALS.policy.ask)
    await escalateAndSettle(booted, req, text)
    await done(sid)
  })

  it('APR-03 answering is the instance\'s operation: no answer_approval tool in main sessions', T, async () => {
    const ord = (await turn(host, x, [[{ text: 'list' }]])).requests.at(-1)
    assert.equal(toolNames(ord).includes(ANSWER_TOOL), false, 'not in a managed session')
    assert.equal((await host.call('globalToolNames')).includes(ANSWER_TOOL), false, 'not global')
    const { result } = await callTool(host, x, ANSWER_TOOL, { request_id: 'apr_00', decision: DECISION.allow, risk: 'low', reason: 'x' })
    assert.equal(result.isError, true)
  })

  it('APR-04 allow with low risk and a reason: one allowed-once, nobody else asked', T, async () => {
    const text = tok('04')
    const req = await asked(x, text)
    assert.deepEqual((await answer(req, APPROVALS.answer.allow('tests in its own folder'))).payload, { accepted: true })
    const call = await outcomeOf(host, text)
    assert.equal(call.outcome, OUTCOME.allow)
    await done(x)
    const ev = await host.call('approvalEvents', { sessionId: x })
    const askedEv = ev.filter((e) => e.type === 'approval/asked' && e.callId === call.callId)
    assert.equal(askedEv.length, 1)
    assert.deepEqual(ev.filter((e) => e.type === 'approval/decided' && e.id === askedEv[0].id).map((e) => e.outcome), [OUTCOME.allow])
    assert.deepEqual(await stockFor(host, text), [], 'the stock prompt was never asked')
    assert.ok(await until(async () => (await settledEvents(stub, req.descriptor.approvalId)).length > 0, APPROVALS.ms.settle, 50))
    assert.deepEqual((await settledEvents(stub, req.descriptor.approvalId))[0], { approvalId: req.descriptor.approvalId, decision: DECISION.allow, by: SETTLED_BY.fishball })
  })

  describe('APR-05 refused answers leave the request waiting', () => {
    const rows = [
      ['allow with risk high', { decision: DECISION.allow, risk: 'high', reason: 'x' }, ERROR.allowNeedsLowRisk, false],
      ['allow with a whitespace reason', { decision: DECISION.allow, risk: 'low', reason: ' \n\t ' }, ERROR.reasonRequired, false],
      ['allow when the arguments are truncated', APPROVALS.answer.allow('x'), ERROR.argumentsIncomplete, true],
    ]
    for (const [label, a, code, cut] of rows) {
      it(label + ' → ' + code, T, async () => {
        const text = tok('05')
        // A 40-byte excerpt cuts the 200-byte pad (§16 argumentExcerptBytes).
        if (cut) await setLimit(host, { argumentExcerptBytes: 40 })
        try {
          const req = await asked(x, text, { args: cut ? { pad: 'p'.repeat(200) } : {} })
          const r = await answer(req, a)
          assert.deepEqual({ type: r.type, payload: r.payload }, { type: 'error', payload: { code } })
          assert.ok((await listed(stub, x)).some((e) => e.approvalId === req.descriptor.approvalId), 'still listed')
          assert.equal((await host.call('asks', {})).find((e) => e.text === text).outcome, null, 'X still waits')
          const later = cut ? APPROVALS.answer.escalate : APPROVALS.answer.allow('fine')
          assert.deepEqual((await answer(req, later)).payload, { accepted: true }, 'a later valid answer works')
          assert.equal((await outcomeOf(host, text)).outcome, cut ? APPROVALS.stock.default : OUTCOME.allow)
        } finally {
          if (cut) await setLimit(host, { argumentExcerptBytes: LIMITS.argumentExcerptBytes.default })
          await done(x)
        }
      })
    }
    it('APR-05e allow with an empty reason → reason-required, and the request still waits', T, async () => {
      const text = tok('05e')
      const req = await asked(x, text)
      try {
        const r = await answer(req, { decision: DECISION.allow, risk: 'low', reason: '' })
        assert.deepEqual({ type: r.type, payload: r.payload }, { type: 'error', payload: { code: ERROR.reasonRequired } })
        assert.equal((await stub.transportCalls()).closedByConnector, false, 'a refusal is an error frame, the channel stays open (§3.1)')
        assert.ok((await listed(stub, x)).some((e) => e.approvalId === req.descriptor.approvalId), 'still listed')
        assert.deepEqual((await answer(req, APPROVALS.answer.allow('fine'))).payload, { accepted: true }, 'a later valid answer works')
        assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.allow)
      } finally { await ensureAttached(stub); await done(x) }
    })
  })

  describe('APR-06 expired ids', () => {
    it('an unknown id', T, async () => {
      const text = tok('06u')
      const req = await asked(x, text)
      const r = await answer(req, APPROVALS.answer.escalate, { approvalId: 'apr_0123456789abcdef' })
      assert.deepEqual(r.payload, { code: ERROR.expired })
      await escalateAndSettle(booted, req, text)
      await done(x)
    })
    it('an id already answered', T, async () => {
      const text = tok('06a')
      const req = await asked(x, text)
      await answer(req, APPROVALS.answer.allow())
      await outcomeOf(host, text)
      await done(x)
      assert.deepEqual((await answer(req, APPROVALS.answer.allow('again'))).payload, { code: ERROR.expired })
      assert.deepEqual((await answer(req, APPROVALS.answer.escalate)).payload, { code: ERROR.expired })
    })
    // Timed out and withdrawn ids are covered in APR-08 and APR-10.
  })

  it('APR-07 escalate: the stock prompt decides; the instance learns the user\'s decision', T, async () => {
    const text = tok('07')
    // The stand-in holds the prompt, so the user's answer comes after the escalation.
    await host.call('setApprover', { outcome: APPROVER_HOLDS })
    try {
      const req = await asked(x, text)
      const id = req.descriptor.approvalId
      assert.deepEqual((await answer(req, { decision: DECISION.escalate, risk: 'high', reason: 'leaves the machine' })).payload, { accepted: true })
      assert.equal((await untilStock(host, text)).length, 1, 'the stock prompt is asked')
      assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
      assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.allow, "the user's outcome is the result")
      assert.ok((await toldEnded(stub, id)).length > 0, 'the instance is told the request ended')
      const records = await cardRecordsFor(stub, id)
      assert.equal(records.length, 1, 'one card record names the request')
      assert.equal(records[0].by, CARD_RECORD.by.user)
      assert.equal(records[0].outcome, CARD_RECORD.outcome.allowed)
      const [audit] = await auditedFor(booted.home, id)
      assert.equal(audit.answer, DECISION.escalate)
      assert.equal(audit.finalOutcome, OUTCOME.allow)
      // slim §8.1 and T09: "for escalations — the user's final decision delivered by approval.settled"; "an escalation settles with the user's decision and emits approval.settled".
      // The card record has arrived, so the settled event is due by now.
      assert.ok(await until(async () => (await settledEvents(stub, id)).some((s) => s.by === SETTLED_BY.user), APPROVALS.ms.quiet, 100),
        "approval.settled with the user's decision: " + JSON.stringify(await settledEvents(stub, id)))
      assert.equal((await settledEvents(stub, id)).find((s) => s.by === SETTLED_BY.user).decision, DECISION.allow)
    } finally { await host.call('setApprover', { outcome: APPROVALS.stock.default }); await done(x) }
  })

  for (const n of [2, 1]) {
    it('APR-08 approvalAnswerSeconds ' + n + ': silence goes to the user after about ' + n + ' s', T, async () => {
      await setLimit(host, { approvalAnswerSeconds: n })
      try {
        const text = tok('08')
        const req = await asked(x, text)
        // `at` is when the request began and `expiresAt` is set when its round starts, a moment later
        // (contract §5.1 names no exact difference): the window is the answer time plus the timer slack.
        const window = req.descriptor.expiresAt - req.descriptor.at
        assert.ok(window >= n * 1000 && window <= n * 1000 + APPROVALS.ms.timerSlack, 'the answer time: ' + window)
        assert.match(req.item.header, APPROVALS.item.seconds(n))
        const call = await outcomeOf(host, text)
        assert.equal(call.outcome, APPROVALS.stock.default, "the user's outcome (never silence-approved)")
        const seen = await stockFor(host, text)
        assert.equal(seen.length, 1)
        const waited = seen[0].at - call.askedAt
        assert.ok(waited >= n * 1000 - APPROVALS.ms.timerSlack, 'not before the answer time: ' + waited)
        assert.ok(waited <= n * 1000 + APPROVALS.ms.timerLate, 'soon after the answer time: ' + waited)
        assert.ok((await toldEnded(stub, req.descriptor.approvalId)).length > 0, 'the instance is told the request ended')
        assert.deepEqual((await answer(req, APPROVALS.answer.escalate)).payload, { code: ERROR.expired })
        const [audit] = await auditedFor(booted.home, req.descriptor.approvalId)
        assert.equal(audit.answer, 'timeout')
        assert.equal(audit.finalOutcome, APPROVALS.stock.default)
      } finally { await setLimit(host, { approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }); await done(x) }
    })
  }

  it('APR-09 the answer time starts at the request, even while the instance has not taken the notice', T, async () => {
    await setLimit(host, { approvalAnswerSeconds: 2 })
    // The instance acks an item only after it queued the turn (contract §4.5): no ack = still busy.
    await stub.ackPolicy(0)
    try {
      const text = tok('09')
      await asked(x, text)
      const call = await outcomeOf(host, text, 8000)
      assert.ok(call.outcome !== null, 'settled although the notice is unacknowledged')
      const waited = (await stockFor(host, text))[0].at - call.askedAt
      assert.ok(waited >= 2000 - APPROVALS.ms.timerSlack && waited <= 2000 + APPROVALS.ms.timerLate, 'went to the user about 2 s after the request: ' + waited)
    } finally {
      // The unacknowledged item holds back every later push until a reconnect re-delivers it.
      await ackAllAndReconnect(stub)
      await setLimit(host, { approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default })
      await done(x)
    }
  })

  /** Cancel X's waiting call and check the withdrawn path (APR-10, APR-11); afterCancel runs before the instance-side checks. */
  async function expectWithdrawn(req, text, afterCancel = async () => {}) {
    await host.call('cancel', { sessionId: x })
    assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.cancelled)
    await afterCancel()
    await done(x)
    assert.deepEqual(await stockFor(host, text), [], 'the stock prompt is not asked')
    assert.equal((await listed(stub, x)).some((e) => e.approvalId === req.descriptor.approvalId), false, 'no longer offered')
    assert.ok((await toldEnded(stub, req.descriptor.approvalId)).length > 0, 'the instance is told the request was withdrawn (§7a.1 "Fishball told"; contract §4.5 CARD_CLOSED)')
    assert.deepEqual((await answer(req, APPROVALS.answer.allow('late'))).payload, { code: ERROR.expired })
    const [audit] = await auditedFor(booted.home, req.descriptor.approvalId)
    assert.equal(audit.answer, 'withdrawn')
    assert.equal(audit.finalOutcome, OUTCOME.cancelled)
  }

  it('APR-10 a cancelled call is withdrawn: cancelled, nobody else asked, the instance told, then expired', T, async () => {
    const text = tok('10')
    await expectWithdrawn(await asked(x, text), text)
  })

  it('APR-11 cancelled before the instance took the notice: still withdrawn', T, async () => {
    await stub.ackPolicy(0)
    let reconnected = false
    const reconnect = async () => { await ackAllAndReconnect(stub); reconnected = true }
    try {
      const text = tok('11')
      // The withdrawal reaches the instance only after the notice it never took is delivered again.
      await expectWithdrawn(await asked(x, text, { waitMs: APPROVALS.ms.noticeUnderLoad }), text, reconnect)
    } finally { if (!reconnected) await reconnect() }
  })

  it('APR-12 cancelled while the escalated request waits at the stock prompt: cancelled', T, async (t) => {
    const text = tok('12')
    await host.call('setApprover', { outcome: APPROVER_HOLDS })
    try {
      const req = await asked(x, text)
      await answer(req, APPROVALS.answer.escalate)
      await untilStock(host, text)
      await host.call('cancel', { sessionId: x })
      assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.cancelled)
      await host.call('releaseApproval', { outcome: OUTCOME.allow })
      const [audit] = await auditedFor(booted.home, req.descriptor.approvalId)
      t.diagnostic('audit after cancel at the stock prompt: ' + JSON.stringify({ answer: audit?.answer, finalOutcome: audit?.finalOutcome }))
      assert.equal(audit.finalOutcome, OUTCOME.cancelled)
    } finally { await host.call('setApprover', { outcome: APPROVALS.stock.default }); await done(x) }
  })

  describe('APR-13 argument excerpt boundaries', () => {
    // A pad of 2-byte characters, so a cut one byte below the length can fall inside a character.
    const pad = 'é'.repeat(30)
    const argsOf = (text) => ({ text, pad })
    for (const [label, delta] of [['at the length L', 0], ['one above (L+1)', 1], ['one below (L−1)', -1], ['inside the pad (L−8)', -8]]) {
      it(label, T, async (t) => {
        const text = tok('13')
        const full = JSON.stringify(argsOf(text))
        const L = bytes(full)
        await setLimit(host, { argumentExcerptBytes: L + delta })
        try {
          const req = await asked(x, text, { args: { pad } })
          const shown = req.item.fields.arguments
          const status = delta >= 0 ? ARGS_STATUS.complete : ARGS_STATUS.truncated
          assert.ok(req.item.header.includes(APPROVALS.item.argumentsLine(status)), req.item.header)
          if (delta >= 0) assert.equal(shown, full)
          else {
            assert.match(req.item.header, APPROVALS.item.highRisk)
            assert.ok(shown.endsWith(ELLIPSIS), 'ends with …')
            const prefix = shown.slice(0, -ELLIPSIS.length)
            assert.ok(full.startsWith(prefix), 'a prefix of the call JSON')
            assert.ok(bytes(prefix) <= L + delta, 'the cut part is within the limit: ' + bytes(prefix))
            assert.equal(shown.includes('\uFFFD'), false, 'no broken character')
            t.diagnostic('limit ' + (L + delta) + ': prefix ' + bytes(prefix) + ' bytes; descriptor ' + req.descriptor.argumentsStatus)
          }
          assert.equal(req.descriptor.argumentsStatus, status, "the descriptor's status matches what the instance is shown")
          await escalateAndSettle(booted, req, text)
          assert.equal((await auditedFor(booted.home, req.descriptor.approvalId))[0].argumentsStatus, status)
        } finally { await setLimit(host, { argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }); await done(x) }
      })
    }
  })

  describe('APR-14 unavailable arguments', () => {
    const rows = [
      ['the request has no call id', { nocall: true }, false],
      ['the call id is not in the log', { fakecall: true }, false],
      ['the call was to another tool', { as: 'fbtest_other_tool' }, true],
    ]
    for (const [label, extra, otherTool] of rows) {
      it(label, T, async () => {
        const text = tok('14')
        const req = await asked(x, text, { args: extra })
        const d = req.descriptor
        assert.equal(d.argumentsStatus, ARGS_STATUS.unavailable)
        assert.equal(String(d.arguments ?? '').includes(text), false, 'no arguments in the descriptor')
        assert.equal(d.callId === null, Boolean(extra.nocall), 'callId null only when the request names no call: ' + d.callId)
        assert.ok(req.item.header.includes(APPROVALS.item.argumentsLine(ARGS_STATUS.unavailable)), req.item.header)
        assert.match(req.item.header, APPROVALS.item.highRisk)
        assert.equal(String(req.item.fields.arguments ?? '').includes(text), false, 'no arguments shown')
        if (otherTool) {
          assert.equal(d.toolName, extra.as)
          assert.equal(d.prompt, APPROVAL_SUMMARY(extra.as))
          assert.equal(req.item.fields.tool, extra.as)
          assert.equal(req.item.fields.call_was_to_tool, ASK_TOOL)
        } else assert.equal(req.item.fields.call_was_to_tool, undefined)
        assert.deepEqual((await answer(req, APPROVALS.answer.allow('x'))).payload, { code: ERROR.argumentsIncomplete })
        assert.ok((await listed(stub, x)).some((e) => e.approvalId === d.approvalId), 'still offered')
        await escalateAndSettle(booted, req, text)
        assert.equal((await auditedFor(booted.home, d.approvalId))[0].argumentsStatus, ARGS_STATUS.unavailable)
        await done(x)
      })
    }
  })

  describe('APR-15 latest_user_message bound (requestUserMessageBytes)', () => {
    const max = LIMITS_R11.requestUserMessageBytes.default
    for (const n of [max, max + 1, 3000]) {
      it(n + ' bytes', T, async (t) => {
        const text = tok('15')
        const message = n % 2 === 0 ? 'é'.repeat(n / 2) : 'a' + 'é'.repeat((n - 1) / 2)
        const req = await asked(x, text, { turnText: message })
        const shown = req.item.fields.latest_user_message
        if (n <= max) assert.equal(shown, message)
        else {
          t.diagnostic('shown ' + bytes(shown) + ' bytes, ends with …: ' + shown.endsWith(ELLIPSIS))
          assert.ok(bytes(shown) <= max, 'at most ' + max + ' bytes: ' + bytes(shown))
          assert.ok(message.startsWith(shown.endsWith(ELLIPSIS) ? shown.slice(0, -ELLIPSIS.length) : shown), 'a prefix')
        }
        await escalateAndSettle(booted, req, text)
        await done(x)
      })
    }
  })

  describe('APR-16 provenance', () => {
    /** A marker queued so the session's model calls the asking tool when its turn carries the marker. */
    const queueAsk = (text, except = null) => host.call('queueMarker', { marker: text, except, script: callScript(ASK_TOOL, { text }) })
    async function provenanceOf(text) {
      const frame = await offerFor(stub, text)
      assert.ok(frame, 'the request reached the instance')
      const item = await itemFor(stub, frame.payload.approvalId)
      await escalateAndSettle(booted, { sessionId: frame.sessionId, descriptor: frame.payload }, text)
      await done(frame.sessionId)
      return item
    }
    it('turn started by a relay from Fishball (session.message)', T, async () => {
      // Its own session, like 16b/16c: x carries every earlier case's turns (APR-15's long ones); on
      // 0.2.1 assembling that context can push the offer past this case's wait, which proves no provenance.
      const sid = await managedSession(host, 'apr-16a')
      const text = tok('16a')
      await queueAsk(text)
      assert.equal((await stub.op('session.message', { sessionId: sid, message: text, attachments: [] }, sid)).type, 'response')
      const item = await provenanceOf(text)
      assert.deepEqual([item.started, item.turnBy], [STARTED_BY.user, TURN_BY.fishball])
    })
    it('turn started by another agent: label and the user\'s latest message', T, async () => {
      const sid = await managedSession(host, 'apr-16b')
      const other = await managedSession(host, 'apr-16b-other')
      await turn(host, sid, [[{ text: 'ok' }]], 'the user said this')
      const text = tok('16b')
      await startCall(host, sid, { text }, { text: 'relayed words ' + text, source: { kind: 'agent-message', form: 'relay', senderSessionId: other } })
      const item = await provenanceOf(text)
      assert.deepEqual([item.started, item.turnBy], [STARTED_BY.user, TURN_BY.other])
      assert.equal(item.fields.latest_user_message, 'the user said this', 'your latest message, not the relay')
    })
    it('session started by session.start', T, async () => {
      const folder = path.join(booted.home, 'work', 'apr-16c')
      fs.mkdirSync(folder, { recursive: true })
      const text = tok('16c')
      await queueAsk(text)
      assert.equal((await stub.op('session.start', { folder, title: TITLE.plain, message: text, attachments: [] })).type, 'response')
      const item = await provenanceOf(text)
      assert.deepEqual([item.started, item.turnBy], [STARTED_BY.fishball, TURN_BY.fishball])
    })
    it('first user message a relay from Fishball (session.message to a blank session)', T, async () => {
      const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'apr-16d' })).sessionId
      assert.equal((await handOver(host, sid)).status, 200)
      const text = tok('16d')
      await queueAsk(text)
      assert.equal((await stub.op('session.message', { sessionId: sid, message: text, attachments: [] }, sid)).type, 'response')
      const item = await provenanceOf(text)
      assert.deepEqual([item.started, item.turnBy], [STARTED_BY.fishball, TURN_BY.fishball])
    })
    it('first user message from another agent: never "the user"', T, async () => {
      const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'apr-16e' })).sessionId
      assert.equal((await handOver(host, sid)).status, 200)
      const text = tok('16e')
      await startCall(host, sid, { text }, { text: 'agent words ' + text, source: { kind: 'agent-message', form: 'relay', senderSessionId: x } })
      const item = await provenanceOf(text)
      assert.ok(STARTED_BY_OTHER.includes(item.started), 'started by: ' + item.started)
      assert.equal(item.turnBy, TURN_BY.other)
    })
  })

  it('APR-17 a subagent\'s request is attributed to its parent session', T, async () => {
    // DSH pins a subagent's approval policy to 'never'; switch new agents back to 'ask' so it asks.
    await host.call('askInNewAgents', { on: true })
    let std
    try {
      std = await managedSession(host, 'apr-17', PRESET.standard)
      const marker = tok('17sub')
      const text = tok('17')
      await host.call('queueMarker', { marker, except: std, script: callScript(ASK_TOOL, { text }) })
      await host.call('driveStart', { sessionId: std, text: 'parent typed 17', script: [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]] })
      const frame = await offerFor(stub, text)
      assert.ok(frame, 'the request reached the instance')
      const child = (await host.call('markerState', { marker })).sessions[0]
      assert.notEqual(child, std)
      assert.equal(frame.sessionId, std, "the event is about the root session")
      const item = await itemFor(stub, frame.payload.approvalId)
      assert.equal(item.fields.session_id, std)
      assert.equal(item.fields.asked_by_subagent_session, child)
      assert.equal(item.fields.latest_user_message, 'parent typed 17')
      assert.deepEqual([item.started, item.turnBy], [STARTED_BY.user, TURN_BY.user])
      await escalateAndSettle(booted, { sessionId: frame.sessionId, descriptor: frame.payload }, text)
      assert.equal((await auditedFor(booted.home, frame.payload.approvalId))[0].sessionId, std)
    } finally { await host.call('askInNewAgents', { on: false }); if (std) await done(std) }
  })

  it('APR-19 a session with approval policy never: rejected, never reaches the broker', T, async () => {
    const sid = await managedSession(host, 'apr-19')
    assert.equal(await host.call('setApprovalPolicy', { sessionId: sid, policy: APPROVALS.policy.never }), APPROVALS.policy.never)
    const text = tok('19')
    await startCall(host, sid, { text })
    assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.reject)
    await done(sid)
    await sleep(APPROVALS.ms.quiet)
    assert.deepEqual(await offersWhere(stub, (d) => d.reason === ASK_REASON(text)), [], 'no offer')
    assert.deepEqual((await stub.pushTexts(ASK_REASON(text))), [], 'no notice')
    assert.deepEqual(await stockFor(host, text), [])
    assert.deepEqual(auditOfSession(booted.home, sid), [], 'not recorded')
  })

  it('APR-20 a throwing stock prompt gives unavailable, and the request is audited', T, async () => {
    const text = tok('20')
    await host.call('setApprover', { outcome: APPROVER_THROWS })
    try {
      const req = await asked(x, text)
      await answer(req, APPROVALS.answer.escalate)
      assert.equal((await outcomeOf(host, text)).outcome, OUTCOME.unavailable)
      const records = await auditedFor(booted.home, req.descriptor.approvalId)
      assert.equal(records.length, 1, 'in the audit')
      assert.equal(records[0].finalOutcome, OUTCOME.unavailable)
    } finally { await host.call('setApprover', { outcome: APPROVALS.stock.default }); await done(x) }
  })

  it('APR-21 the audit and the state never hold the arguments', T, async () => {
    const secret = APPROVALS.secretPrefix + Math.random().toString(36).slice(2)
    const text = tok('21')
    const req = await asked(x, text, { args: { pad: secret } })
    assert.ok(req.descriptor.arguments.includes(secret), 'precondition: the instance is shown the arguments')
    assert.ok(!JSON.stringify(await host.state()).includes(secret), 'the state never holds them while the request waits')
    await answer(req, APPROVALS.answer.allow('fine ' + text))
    await outcomeOf(host, text)
    const [record] = await auditedFor(booted.home, req.descriptor.approvalId)
    for (const key of APPROVALS.auditKeys) assert.ok(Object.hasOwn(record, key), 'audit field ' + key + ': ' + JSON.stringify(record))
    assert.match(record.argumentsDigest, APPROVALS.digest)
    assert.ok(APPROVALS.auditAnswers.includes(record.answer), record.answer)
    assert.equal(record.answer, DECISION.allow)
    assert.equal(record.finalOutcome, OUTCOME.allow)
    assert.equal(record.sessionId, x)
    assert.equal(record.toolName, ASK_TOOL)
    assert.ok(!JSON.stringify(await host.state()).includes(secret), 'the state never holds them')
    const dir = path.join(INTAKE_DIR(booted.home), 'approvals')
    for (const f of fs.readdirSync(dir)) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8').includes(secret), false, 'audit never holds the arguments: ' + f)
    await done(x)
  })

  it('APR-23 auditEntriesKept 2 keeps at most 2 audit records, the newest among them', T, async () => {
    await setLimit(host, { auditEntriesKept: 2 })
    try {
      let newest
      for (let i = 0; i < 3; i++) {
        const text = tok('23')
        const req = await asked(x, text)
        await answer(req, APPROVALS.answer.allow('k' + i))
        await outcomeOf(host, text)
        await done(x)
        newest = req.descriptor.approvalId
      }
      await auditedFor(booted.home, newest)
      const files = fs.readdirSync(path.join(INTAKE_DIR(booted.home), 'approvals'))
      assert.ok(files.length <= 2, 'at most 2 stored: ' + files.length)
      assert.ok(auditFor(booted.home, newest).length === 1, 'the newest kept')
    } finally { await setLimit(host, { auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })
})
