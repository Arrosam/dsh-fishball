/**
 * P7 ApprovalBroker (DESIGN §7a "As built (P7)", R4 "Approvals, code paths"), with the review update.
 * Host boots with FBTEST_APPROVER_AFTER=1: the scripted answerer stands in for the browser prompt
 * AFTER the broker (fbtest-tools, mounted before dsh-fishball, prepends it), and the root registers
 * the asking tool fbtest_ask for ordinary sessions. Fishball's model answers a request through a
 * plan (answer_approval with the id read from the request text). Expected values come from the
 * requirements, never from the implementation.
 *
 * | id      | technique | req | expected |
 * |---------|-----------|-----|----------|
 * | APR-01  | EP (first request, no allowance) | P1 | one fishball-notice, summary 'Permission request: "fbtest_ask"'; text starts [permission request apr_<hex>]; answer time; 'Arguments: complete'; started by / turn by 'the user'; the 'expired is normal' line; block with the 9 fields once each; session_id, folder, tool, reason, arguments (the call's JSON), latest_user_message; Fishball woke |
 * | APR-02  | EP (permission mode) | P1 | permission_mode is the session's sandbox mode (read-only after a switch); approval_policy "ask" |
 * | APR-03  | EP | P2 | answer_approval only in Fishball's requests; not global; an ordinary call is an error |
 * | APR-04  | DT allow/low/reason → ok | P2, P3 | {ok:true, requestId, decision:'allow'}; outcome allowed-once; one approval/decided allowed-once in X; the next answerer never asked |
 * | APR-05 ×4 | DT (allow+high / ''  / whitespace / allow on truncated) | P2 | the code; still pending; a later valid answer works |
 * | APR-06 ×4 | DT (unknown id / answered / timed out / withdrawn) | P2 | expired |
 * | APR-07  | DT escalate | P4 | the next answerer is asked; its outcome (allowed-once) is X's; non-waking note naming the outcome, visible in the next turn |
 * | APR-08 ×2 | BVA (approvalAnswerSeconds 2 and 1) | P5 | no answer → the next answerer asked after about n s (not before); note 'got no answer in time…'; audit answer timeout |
 * | APR-09  | ST (Fishball busy when the request arrives) | P5 update | the answer time starts at arrival: the next answerer is asked after about 2 s while Fishball is still in its turn |
 * | APR-10  | ST (cancel after the notice) | P6 | cancelled; the next answerer not asked; note 'was withdrawn'; audit withdrawn/cancelled; later answer expired |
 * | APR-11  | ST (cancel before Fishball read the notice) | P6 update | the same |
 * | APR-12  | ST (cancel while the escalated request waits at the next answerer) | P6 update | cancelled (diagnostic: audit answer) |
 * | APR-13 ×3 | BVA (argumentExcerptBytes = L, L−1 with a 2-byte cut, L+1) | P1 | complete and whole at L and L+1; truncated below: prefix of the JSON, ≤ limit bytes before '…', no broken character, 'alone makes it high risk' |
 * | APR-14 ×3 | EP (no call id / call id not in the log / call to another tool) | P1, update | unavailable (high risk line); call_was_to_tool names the real tool only in the third; allow → arguments-incomplete |
 * | APR-15 ×3 | BVA (latest user message 2048 / 2049 / 3000 bytes of 2-byte chars) | P1 | whole at 2048; above it at most 2048 bytes |
 * | APR-16 ×5 | DT (provenance) | P1 update | user/user; relay from Fishball → turn 'Fishball (message_session)'; relay from another agent → 'another agent or a notice' and latest_user_message is the user's; start_session → 'Fishball (start_session)'; first message a relay from Fishball → 'Fishball (start_session)'; first message from another agent → other/unknown |
 * | APR-17  | EP (subagent of X) | P1 update | session_id X, asked_by_subagent_session child, X's latest user message |
 * | APR-18  | EP (wake cap reached) | P1 | the request still wakes Fishball and is answered |
 * | APR-19  | EP (policy never) | P7 | rejected; no message; no answerer; not recorded |
 * | APR-20  | EP (next answerer throws) | P13 | unavailable; in the audit with finalOutcome unavailable |
 * | APR-21  | EP | P8 | approvals keys; pending entry while waiting; recent entry keys and enums, newest first; never the arguments (state and audit files) |
 * | APR-22  | BVA (21 requests) | P8 | 20 listed, newest first |
 * | APR-23  | BVA (auditEntriesKept 2) | P8 | at most 2 audit records, the newest kept |
 * | APR-24  | EP | P9 | the rubric phrases in Fishball's system prompt |
 * | APR-25  | EP | P10 | the client bundle has 'Permission requests' |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import {
  ANSWER_TOOL, APPROVALS_KEYS, AUTHOR_KIND, APPROVAL_FIELDS, APPROVAL_ID, APPROVAL_PREFIX, APPROVAL_SUMMARY, APPROVER_AFTER_ENV, APPROVER_THROWS, APR_CODE, APR_NOTE,
  ASK_REASON, ASK_TOOL, ELLIPSIS, FINAL_OUTCOMES, INBOUND_TOOL, LATEST_USER_MAX_BYTES, LIMITS, NOTICE, OUTCOME, PENDING_KEYS, PRESET, RECENT_ANSWERS,
  RECENT_KEYS, RECENT_MAX, RUBRIC, STARTED_BY, STARTED_BY_OTHER, TURN_BY,
} from './support/constants.mjs'
import {
  HOOK, T, approvalsNow, askSettled, bytes, callScript, callTool, fishballCall, fishballClientBundle, fishballMessages, intakeNow, jsonOf, messageFishball,
  requestMessages, resultOfCall, sessionAuthor, settledIdle, startAsk, toolNames, turn, waitRequest,
} from './support/expect.mjs'
import { bootHost, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'APR' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const provenance = (text) => /Session started by: (.*?); its current turn started by: (.*?)\.?$/m.exec(text)?.slice(1) ?? [null, null]
const secondsLine = (n) => new RegExp('\\b' + n + ' ?s(econds?)?\\b')

describe('P7 ApprovalBroker', () => {
  let host
  let home
  let fb
  let x
  let xCwd
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const plan = (needle, args, callId) => host.call('planApproval', { sessionId: fb, needle, args, callId })
  const seenFor = async (text) => (await host.call('approvals', {})).filter((a) => a.reason === ASK_REASON(text))
  const fresh = async (folder) => {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    return sid
  }
  /** One Fishball turn answering a request directly; returns the parsed answer. */
  const answer = async (requestId, args) => { await settledIdle(host, fb); return (await fishballCall(host, fb, ANSWER_TOOL, { request_id: requestId, ...args })).json }
  const pendingIds = async () => (await approvalsNow(host)).pending.map((p) => p.id)
  /**
   * A non-waking note (inject) reaches Fishball's log and request only with its next turn: assert that
   * no Fishball request starts on its own for a while, then that the next turn's request carries it.
   */
  async function noteInNextTurn(needle) {
    await settledIdle(host, fb)
    const count = (await host.call('requests', { sessionId: fb })).length
    await sleep(1500)
    assert.equal((await host.call('requests', { sessionId: fb })).length, count, 'the note did not wake Fishball')
    const req = (await turn(host, fb, [[{ text: 'ok' }]])).requests.at(-1)
    assert.ok(req.texts.includes(needle), "the note is in Fishball's next turn: " + needle)
    return req
  }
  /** Fishball calls one hand-off tool in a turn that may also answer a planned request; returns the tool's JSON. */
  async function fishballHandOff(tool, args) {
    await settledIdle(host, fb)
    const r = await turn(host, fb, callScript(tool, args))
    return jsonOf(r.results[0])
  }
  /** Start an ask in sid and wait for its request message (Fishball answers per plan, or only 'ok'). */
  async function asked(sid, text, extra = {}, turnText) {
    await settledIdle(host, sid)
    await startAsk(host, sid, ASK_TOOL, { text, ...extra }, turnText)
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'a permission request reached Fishball for ' + text)
    return req
  }
  /** Stop a still-waiting ask so its session is free again. */
  async function release(sid, text) {
    const a = (await host.call('asks', {})).find((r) => r.text === text)
    if (a && a.outcome === null) await host.call('cancel', { sessionId: sid })
    await askSettled(host, text)
    await settledIdle(host, sid)
  }

  before(async () => {
    home = newHome('approvals')
    host = await bootHost(home, { env: APPROVER_AFTER_ENV })
    fb = (await host.waitStatus('live'))?.sessionId
    await settledIdle(host, fb)
    x = await fresh('apr-x')
    xCwd = (await host.call('header', { sessionId: x })).cwd
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('APR-01 the first request reaches Fishball with the documented message, before any allowance', T, async () => {
    const text = tok('01')
    const fbBefore = (await host.call('requests', { sessionId: fb })).length
    await plan(text, { decision: 'escalate', risk: 'high', reason: 'no allowance' })
    const args = { text, pad: 'pad-01' }
    const req = await asked(x, text, { pad: 'pad-01' }, 'please do the 01 thing')
    // P11 R4: the asking session is the author.
    assert.deepEqual(req.source, { ...NOTICE, summary: APPROVAL_SUMMARY(ASK_TOOL), author: await sessionAuthor(host, AUTHOR_KIND.approval, x) })
    assert.match(req.text, APPROVAL_PREFIX)
    assert.match(req.id, APPROVAL_ID)
    const header = req.block.header
    assert.match(header, secondsLine(LIMITS.approvalAnswerSeconds.default), 'answer time in seconds')
    assert.ok(header.includes('Arguments: complete'), header)
    assert.deepEqual(provenance(header), [STARTED_BY.user, TURN_BY.user])
    assert.match(header, /expired/i, 'says a later expired answer is normal')
    for (const f of APPROVAL_FIELDS) assert.equal(req.block.counts?.[f], 1, 'one ' + f + ' line: ' + req.text)
    const f = req.block.fields
    assert.equal(f.session_id, x)
    assert.equal(typeof f.session_title, 'string')
    assert.equal(f.session_folder, xCwd)
    assert.equal(f.tool, ASK_TOOL)
    assert.equal(f.reason_given, ASK_REASON(text))
    assert.deepEqual(JSON.parse(f.arguments), args, 'the model-requested arguments of that call')
    assert.equal(f.latest_user_message, 'please do the 01 thing')
    assert.equal(f.asked_by_subagent_session, undefined)
    assert.equal(f.call_was_to_tool, undefined)
    assert.equal(req.block.closes, 1)
    await askSettled(host, text)
    assert.ok((await host.call('requests', { sessionId: fb })).length > fbBefore, 'Fishball woke')
  })

  it('APR-02 permission_mode is the session sandbox mode; approval_policy the session policy', T, async () => {
    const sid = await fresh('apr-02')
    const mode = await host.call('setSandboxMode', { sessionId: sid, mode: 'read-only' })
    assert.equal(mode, 'read-only')
    const text = tok('02')
    await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
    const req = await asked(sid, text)
    assert.equal(req.block.fields.permission_mode, 'read-only')
    assert.equal(req.block.fields.approval_policy, 'ask')
    await release(sid, text)
  })

  it('APR-03 answer_approval belongs to Fishball only', T, async () => {
    for (const r of await host.call('requests', { sessionId: fb })) assert.ok(toolNames(r).includes(ANSWER_TOOL))
    const ord = (await turn(host, x, [[{ text: 'list' }]])).requests.at(-1)
    assert.equal(toolNames(ord).includes(ANSWER_TOOL), false)
    assert.equal((await host.call('globalToolNames')).includes(ANSWER_TOOL), false)
    const { result } = await callTool(host, x, ANSWER_TOOL, { request_id: 'apr_00', decision: 'allow', risk: 'low', reason: 'x' })
    assert.equal(result.isError, true)
  })

  it('APR-04 allow with low risk and a reason: one allowed-once, nobody else asked', T, async () => {
    const text = tok('04')
    await plan(text, { decision: 'allow', risk: 'low', reason: 'tests in its own folder' }, 'call_apr04')
    const req = await asked(x, text)
    const done = await askSettled(host, text)
    assert.equal(done.outcome, OUTCOME.allow)
    assert.deepEqual((await resultOfCall(host, fb, 'call_apr04')).json, { ok: true, requestId: req.id, decision: 'allow' })
    await settledIdle(host, x)
    const ev = await host.call('approvalEvents', { sessionId: x })
    const askedEv = ev.filter((e) => e.type === 'approval/asked' && e.callId === done.callId)
    assert.equal(askedEv.length, 1)
    assert.deepEqual(ev.filter((e) => e.type === 'approval/decided' && e.id === askedEv[0].id).map((e) => e.outcome), [OUTCOME.allow])
    assert.deepEqual(await seenFor(text), [], 'the next answerer was never asked')
  })

  describe('APR-05 refused answers leave the request pending', () => {
    const rows = [
      ['allow with risk high', { decision: 'allow', risk: 'high', reason: 'x' }, APR_CODE.lowRisk, {}],
      ['allow with an empty reason', { decision: 'allow', risk: 'low', reason: '' }, APR_CODE.reason, {}],
      ['allow with a whitespace reason', { decision: 'allow', risk: 'low', reason: ' \n\t ' }, APR_CODE.reason, {}],
      ['allow when the arguments are truncated', { decision: 'allow', risk: 'low', reason: 'x' }, APR_CODE.incomplete, { pad: 'p'.repeat(200) }],
    ]
    for (const [label, args, code, extra] of rows) {
      it(label + ' → ' + code, T, async () => {
        if (extra.pad) await setLimit({ argumentExcerptBytes: 40 })
        try {
          const text = tok('05')
          const callId = 'call_apr05_' + seq
          await plan(text, args, callId)
          const req = await asked(x, text, extra)
          assert.deepEqual((await resultOfCall(host, fb, callId)).json, { ok: false, code })
          await settledIdle(host, fb)
          assert.ok((await pendingIds()).includes(req.id), 'still pending')
          assert.equal((await host.call('asks', {})).find((a) => a.text === text).outcome, null, 'X still waits')
          // A later valid answer still works.
          const later = extra.pad ? { decision: 'escalate', risk: 'high', reason: 'cut arguments' } : { decision: 'allow', risk: 'low', reason: 'fine' }
          assert.deepEqual(await answer(req.id, later), { ok: true, requestId: req.id, decision: later.decision })
          assert.equal((await askSettled(host, text)).outcome, extra.pad ? OUTCOME.reject : OUTCOME.allow)
          await settledIdle(host, x)
        } finally { if (extra.pad) await setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
      })
    }
  })

  describe('APR-06 expired ids', () => {
    it('an unknown id', T, async () => {
      assert.deepEqual(await answer('apr_0123456789abcdef', { decision: 'escalate', risk: 'high', reason: 'x' }), { ok: false, code: APR_CODE.expired })
    })
    it('an id already answered', T, async () => {
      const text = tok('06a')
      await plan(text, { decision: 'allow', risk: 'low', reason: 'fine' })
      const req = await asked(x, text)
      await askSettled(host, text)
      await settledIdle(host, x)
      assert.deepEqual(await answer(req.id, { decision: 'allow', risk: 'low', reason: 'again' }), { ok: false, code: APR_CODE.expired })
      assert.deepEqual(await answer(req.id, { decision: 'escalate', risk: 'high', reason: 'again' }), { ok: false, code: APR_CODE.expired })
    })
    // Timed out and withdrawn ids are covered in APR-08 and APR-10.
  })

  it('APR-07 escalate: the next answerer decides; Fishball gets a non-waking note with its outcome', T, async () => {
    const text = tok('07')
    // The stand-in holds the question, so its answer comes after Fishball's turn has ended.
    await host.call('setApprover', { outcome: 'hold' })
    try {
      await plan(text, { decision: 'escalate', risk: 'high', reason: 'leaves the machine' }, 'call_apr07')
      const req = await asked(x, text)
      assert.deepEqual((await resultOfCall(host, fb, 'call_apr07')).json, { ok: true, requestId: req.id, decision: 'escalate' })
      assert.ok(await until(async () => (await seenFor(text)).length === 1, 5000, 50), 'the next answerer is asked')
      await settledIdle(host, fb)
      const fbRequests = (await host.call('requests', { sessionId: fb })).length
      assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.allow, "the next answerer's outcome is the result")
      await settledIdle(host, x)
      const note = APR_NOTE.escalated(req.id, OUTCOME.allow)
      assert.equal((await host.call('requests', { sessionId: fb })).length, fbRequests, 'no Fishball request since the escalation')
      await noteInNextTurn(note)
      assert.equal((await fishballMessages(host, fb, note)).length, 1, 'one note')
      const rec = (await approvalsNow(host)).recent.find((r) => r.key.includes(req.id.replace('apr_', '')))
      if (rec) { assert.equal(rec.answer, 'escalate'); assert.equal(rec.risk, 'high'); assert.equal(rec.finalOutcome, OUTCOME.allow) }
    } finally { await host.call('setApprover', { outcome: OUTCOME.reject }); await settledIdle(host, x) }
  })

  for (const n of [2, 1]) {
    it('APR-08 approvalAnswerSeconds ' + n + ': silence goes to the next answerer after about ' + n + ' s', T, async () => {
      await setLimit({ approvalAnswerSeconds: n })
      try {
        const text = tok('08')
        const req = await asked(x, text)
        assert.match(req.block.header, secondsLine(n))
        const done = await askSettled(host, text, 10000)
        assert.equal(done.outcome, OUTCOME.reject, "the next answerer's outcome (never silence-approved)")
        const seen = await seenFor(text)
        assert.equal(seen.length, 1)
        const waited = seen[0].at - done.askedAt
        assert.ok(waited >= n * 1000 - 150, 'not before the answer time: ' + waited)
        assert.ok(waited <= n * 1000 + 2500, 'soon after the answer time: ' + waited)
        await settledIdle(host, x)
        const next = await noteInNextTurn(APR_NOTE.timeout)
        assert.ok(next.texts.includes(req.id), 'the note names the request')
        assert.deepEqual(await answer(req.id, { decision: 'escalate', risk: 'high', reason: 'late' }), { ok: false, code: APR_CODE.expired })
        const rec = (await approvalsNow(host)).recent.find((r) => r.sessionId === x && r.answer === 'timeout')
        assert.ok(rec, 'audit answer timeout')
        assert.equal(rec.finalOutcome, OUTCOME.reject)
      } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
    })
  }

  it('APR-09 the answer time starts when the request arrives, even while Fishball is busy', T, async () => {
    await setLimit({ approvalAnswerSeconds: 2 })
    await settledIdle(host, fb)
    await host.call('holdNext', { sessionId: fb })
    await host.call('driveStart', { sessionId: fb, text: 'busy turn' })
    try {
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50))
      const text = tok('09')
      await startAsk(host, x, ASK_TOOL, { text })
      const done = await askSettled(host, text, 8000)
      assert.ok(done.outcome !== null, 'settled while Fishball is still held')
      assert.equal(await host.call('isHeld', { sessionId: fb }), true, 'Fishball was busy the whole time')
      const waited = (await seenFor(text))[0].at - done.askedAt
      assert.ok(waited >= 1850 && waited <= 4500, 'went to the next answerer about 2 s after arrival: ' + waited)
    } finally {
      await host.call('releaseHold', { sessionId: fb })
      await settledIdle(host, fb)
      await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default })
      await settledIdle(host, x)
    }
  })

  it('APR-10 a cancelled call is withdrawn: cancelled, nobody else asked, note, then expired', T, async () => {
    const text = tok('10')
    const req = await asked(x, text)
    await settledIdle(host, fb)
    await host.call('cancel', { sessionId: x })
    assert.equal((await askSettled(host, text)).outcome, OUTCOME.cancelled)
    await settledIdle(host, x)
    assert.deepEqual(await seenFor(text), [], 'the next answerer is not asked')
    const next = await noteInNextTurn(APR_NOTE.withdrawn)
    assert.ok(next.texts.includes(req.id), 'the note names the request')
    assert.deepEqual(await answer(req.id, { decision: 'allow', risk: 'low', reason: 'late' }), { ok: false, code: APR_CODE.expired })
    const rec = (await approvalsNow(host)).recent[0]
    assert.equal(rec.sessionId, x)
    assert.equal(rec.answer, 'withdrawn')
    assert.equal(rec.finalOutcome, OUTCOME.cancelled)
  })

  it('APR-11 cancelled before Fishball read the notice: still withdrawn', T, async () => {
    await settledIdle(host, fb)
    await host.call('holdNext', { sessionId: fb })
    await host.call('driveStart', { sessionId: fb, text: 'busy turn' })
    const text = tok('11')
    try {
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50))
      await startAsk(host, x, ASK_TOOL, { text })
      assert.ok(await until(async () => (await host.call('asks', {})).some((a) => a.text === text), 5000, 20))
      await sleep(200)
      await host.call('cancel', { sessionId: x })
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.cancelled)
    } finally { await host.call('releaseHold', { sessionId: fb }); await settledIdle(host, fb) }
    await settledIdle(host, x)
    assert.deepEqual(await seenFor(text), [], 'the next answerer is not asked')
    const rec = (await approvalsNow(host)).recent[0]
    assert.equal(rec.answer, 'withdrawn')
    assert.equal(rec.finalOutcome, OUTCOME.cancelled)
  })

  it('APR-12 cancelled while the escalated request waits at the next answerer: cancelled', T, async (t) => {
    const text = tok('12')
    await host.call('setApprover', { outcome: 'hold' })
    try {
      await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
      await asked(x, text)
      assert.ok(await until(async () => (await seenFor(text)).length === 1, 5000, 50))
      await host.call('cancel', { sessionId: x })
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.cancelled)
      await host.call('releaseApproval', { outcome: OUTCOME.allow })
      await settledIdle(host, x)
      await sleep(300)
      const rec = (await approvalsNow(host)).recent[0]
      t.diagnostic('audit after cancel at the next answerer: ' + JSON.stringify({ answer: rec?.answer, finalOutcome: rec?.finalOutcome }))
      assert.equal(rec.finalOutcome, OUTCOME.cancelled)
    } finally { await host.call('setApprover', { outcome: OUTCOME.reject }) }
  })

  describe('APR-13 argument excerpt boundaries', () => {
    // pad of 2-byte characters, so a cut one byte below the length can fall inside a character.
    const pad = 'é'.repeat(30)
    const argsOf = (text) => ({ text, pad })
    const lengthOf = (text) => bytes(JSON.stringify(argsOf(text)))
    for (const [label, delta] of [['at the length L', 0], ['one above (L+1)', 1], ['one below (L−1)', -1], ['inside the pad (L−8)', -8]]) {
      it(label, T, async (t) => {
        const text = tok('13')
        const L = lengthOf(text)
        await setLimit({ argumentExcerptBytes: L + delta })
        try {
          await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
          const req = await asked(x, text, { pad })
          const shown = req.block.fields.arguments
          const full = JSON.stringify(argsOf(text))
          if (delta >= 0) {
            assert.ok(req.block.header.includes('Arguments: complete'))
            assert.equal(shown, full)
          } else {
            assert.ok(req.block.header.includes('Arguments: truncated'), req.block.header)
            assert.match(req.block.header, /alone makes it high risk/)
            assert.ok(shown.endsWith(ELLIPSIS), 'ends with …')
            const prefix = shown.slice(0, -ELLIPSIS.length)
            assert.ok(full.startsWith(prefix), 'a prefix of the call JSON')
            assert.ok(bytes(prefix) <= L + delta, 'the cut part is within the limit: ' + bytes(prefix))
            assert.equal(shown.includes('\uFFFD'), false, 'no broken character')
            t.diagnostic('limit ' + (L + delta) + ': prefix ' + bytes(prefix) + ' bytes, shown ' + bytes(shown) + ' bytes')
          }
          await askSettled(host, text)
          await settledIdle(host, x)
          const rec = (await approvalsNow(host)).recent[0]
          assert.equal(rec.argumentsStatus, delta >= 0 ? 'complete' : 'truncated')
        } finally { await setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
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
        const callId = 'call_apr14_' + seq
        await plan(text, { decision: 'allow', risk: 'low', reason: 'x' }, callId)
        const req = await asked(x, text, extra)
        assert.ok(req.block.header.includes('Arguments: unavailable'), req.block.header)
        assert.match(req.block.header, /alone makes it high risk/)
        assert.equal(String(req.block.fields.arguments ?? '').includes(text), false, 'no arguments shown')
        if (otherTool) {
          assert.equal(req.block.fields.tool, extra.as)
          assert.equal(req.block.fields.call_was_to_tool, ASK_TOOL)
          assert.deepEqual(req.source, { ...NOTICE, summary: APPROVAL_SUMMARY(extra.as), author: await sessionAuthor(host, AUTHOR_KIND.approval, x) })
        } else assert.equal(req.block.fields.call_was_to_tool, undefined)
        assert.deepEqual((await resultOfCall(host, fb, callId)).json, { ok: false, code: APR_CODE.incomplete })
        await settledIdle(host, fb)
        assert.ok((await pendingIds()).includes(req.id))
        await answer(req.id, { decision: 'escalate', risk: 'high', reason: 'no arguments' })
        await askSettled(host, text)
        await settledIdle(host, x)
        assert.equal((await approvalsNow(host)).recent[0].argumentsStatus, 'unavailable')
      })
    }
  })

  describe('APR-15 latest_user_message bound', () => {
    for (const n of [2048, 2049, 3000]) {
      it(n + ' bytes', T, async (t) => {
        const text = tok('15')
        const message = n % 2 === 0 ? 'é'.repeat(n / 2) : 'a' + 'é'.repeat((n - 1) / 2)
        await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
        const req = await asked(x, text, {}, message)
        const shown = req.block.fields.latest_user_message
        if (n <= LATEST_USER_MAX_BYTES) assert.equal(shown, message)
        else {
          t.diagnostic('shown ' + bytes(shown) + ' bytes, ends with …: ' + shown.endsWith(ELLIPSIS))
          assert.ok(bytes(shown) <= LATEST_USER_MAX_BYTES, 'at most 2048 bytes: ' + bytes(shown))
          assert.ok(message.startsWith(shown.endsWith(ELLIPSIS) ? shown.slice(0, -1) : shown), 'a prefix')
        }
        await askSettled(host, text)
        await settledIdle(host, x)
      })
    }
  })

  describe('APR-16 provenance', () => {
    const escalateFor = (text) => plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
    it('turn started by a relay from Fishball (message_session)', T, async () => {
      const text = tok('16a')
      await escalateFor(text)
      await host.call('queueMarker', { marker: text, except: fb, script: callScript(ASK_TOOL, { text }) })
      assert.equal((await fishballHandOff('message_session', { session_id: x, message: text }))?.ok, true)
      const req = await waitRequest(host, fb, text)
      assert.deepEqual(provenance(req.block.header), [STARTED_BY.user, TURN_BY.fishball])
      await askSettled(host, text)
      await settledIdle(host, x)
    })
    it('turn started by another agent: label and the user\'s latest message', T, async () => {
      const sid = await fresh('apr-16b')
      const other = await fresh('apr-16b-other')
      await turn(host, sid, [[{ text: 'ok' }]], 'the user said this')
      const text = tok('16b')
      await escalateFor(text)
      await startAsk(host, sid, ASK_TOOL, { text }, 'relayed words ' + text, { kind: 'agent-message', form: 'relay', senderSessionId: other })
      const req = await waitRequest(host, fb, text)
      assert.deepEqual(provenance(req.block.header), [STARTED_BY.user, TURN_BY.other])
      assert.equal(req.block.fields.latest_user_message, 'the user said this', 'your latest message, not the relay')
      await askSettled(host, text)
    })
    it('session started by start_session', T, async () => {
      const folder = path.join(home, 'work', 'apr-16c')
      fs.mkdirSync(folder, { recursive: true })
      const text = tok('16c')
      await escalateFor(text)
      await host.call('queueMarker', { marker: text, except: fb, script: callScript(ASK_TOOL, { text }) })
      assert.equal((await fishballHandOff('start_session', { folder, message: text }))?.ok, true)
      const req = await waitRequest(host, fb, text)
      assert.deepEqual(provenance(req.block.header), [STARTED_BY.fishball, TURN_BY.fishball])
      await askSettled(host, text)
    })
    it('first user message a relay from Fishball (message_session to a blank session)', T, async () => {
      const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'apr-16d' })).sessionId
      const text = tok('16d')
      await escalateFor(text)
      await host.call('queueMarker', { marker: text, except: fb, script: callScript(ASK_TOOL, { text }) })
      assert.equal((await fishballHandOff('message_session', { session_id: sid, message: text }))?.ok, true)
      const req = await waitRequest(host, fb, text)
      assert.deepEqual(provenance(req.block.header), [STARTED_BY.fishball, TURN_BY.fishball])
      await askSettled(host, text)
    })
    it('first user message from another agent: never "the user"', T, async () => {
      const sid = (await host.call('ordinary', { preset: PRESET.bare, folder: 'apr-16e' })).sessionId
      const text = tok('16e')
      await escalateFor(text)
      await startAsk(host, sid, ASK_TOOL, { text }, 'agent words ' + text, { kind: 'agent-message', form: 'relay', senderSessionId: x })
      const req = await waitRequest(host, fb, text)
      const [started, turnBy] = provenance(req.block.header)
      assert.ok(STARTED_BY_OTHER.includes(started), 'started by: ' + started)
      assert.equal(turnBy, TURN_BY.other)
      await askSettled(host, text)
    })
  })

  it('APR-17 a subagent\'s request is attributed to its parent session', T, async () => {
    // DSH pins a subagent's approval policy to 'never'; switch new agents back to 'ask' so it asks.
    await host.call('askInNewAgents', { on: true })
    try {
      const std = (await host.call('ordinary', { preset: PRESET.standard, folder: 'apr-17' })).sessionId
      const marker = tok('17sub')
      const text = tok('17')
      await host.call('queueMarker', { marker, except: std, script: [...callScript(ASK_TOOL, { text })] })
      await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
      await turn(host, std, [[{ tool: 'subagent', args: { description: 'fbtest sub', prompt: marker + ' please' } }], [{ text: 'parent done' }]], 'parent typed 17')
      const req = await waitRequest(host, fb, text)
      assert.ok(req, 'request reached Fishball')
      const child = (await host.call('markerState', { marker })).sessions[0]
      assert.notEqual(child, std)
      assert.equal(req.block.fields.session_id, std)
      assert.equal(req.block.fields.asked_by_subagent_session, child)
      assert.equal(req.block.fields.latest_user_message, 'parent typed 17')
      assert.deepEqual(provenance(req.block.header), [STARTED_BY.user, TURN_BY.user])
      await askSettled(host, text)
      assert.equal((await approvalsNow(host)).recent[0].sessionId, std)
    } finally { await host.call('askInNewAgents', { on: false }) }
  })

  it('APR-18 a request wakes Fishball even when the wake-up cap is reached', T, async () => {
    await settledIdle(host, fb)
    if ((await intakeNow(host)).wakeupsThisHour === 0) { await messageFishball(host, x, { message: tok('18wake') }); await settledIdle(host, fb) }
    await setLimit({ wakeupsPerHour: (await intakeNow(host)).wakeupsThisHour })
    try {
      // Control: an ordinary message is parked at the cap.
      const before = (await host.call('requests', { sessionId: fb })).length
      await messageFishball(host, x, { message: tok('18parked') })
      await sleep(1500)
      assert.equal((await host.call('requests', { sessionId: fb })).length, before, 'precondition: the cap parks a message')
      const text = tok('18')
      await plan(text, { decision: 'allow', risk: 'low', reason: 'fine' })
      await startAsk(host, x, ASK_TOOL, { text })
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.allow, 'Fishball woke and answered')
    } finally { await setLimit({ wakeupsPerHour: LIMITS.wakeupsPerHour.default }); await settledIdle(host, x); await settledIdle(host, fb) }
  })

  it('APR-19 a session with approval policy never: rejected, never reaches the broker', T, async () => {
    const sid = await fresh('apr-19')
    assert.equal(await host.call('setApprovalPolicy', { sessionId: sid, policy: 'never' }), 'never')
    const keyBefore = (await approvalsNow(host)).recent[0]?.key
    const text = tok('19')
    await startAsk(host, sid, ASK_TOOL, { text })
    assert.equal((await askSettled(host, text)).outcome, OUTCOME.reject)
    await settledIdle(host, sid)
    await sleep(500)
    assert.deepEqual(await requestMessages(host, fb, text), [])
    assert.deepEqual(await seenFor(text), [])
    assert.equal((await approvalsNow(host)).recent[0]?.key, keyBefore, 'not recorded')
  })

  it('APR-20 a throwing next answerer gives unavailable, and the request is audited', T, async () => {
    const text = tok('20')
    await host.call('setApprover', { outcome: APPROVER_THROWS })
    try {
      await plan(text, { decision: 'escalate', risk: 'high', reason: 'x' })
      const req = await asked(x, text)
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.unavailable)
      await settledIdle(host, x)
      await sleep(300)
      const rec = (await approvalsNow(host)).recent.find((r) => r.key.includes(req.id.slice(4)))
      assert.ok(rec, 'in the audit: ' + JSON.stringify((await approvalsNow(host)).recent[0]))
      assert.equal(rec.finalOutcome, OUTCOME.unavailable)
    } finally { await host.call('setApprover', { outcome: OUTCOME.reject }) }
  })

  it('APR-21 state.approvals: pending while waiting, recent after, never the arguments', T, async () => {
    const secret = 'SECRETARG' + Math.random().toString(36).slice(2)
    const text = tok('21')
    const req = await asked(x, text, { pad: secret })
    await settledIdle(host, fb)
    const a = await approvalsNow(host)
    assert.deepEqual(Object.keys(a).sort(), APPROVALS_KEYS)
    const p = a.pending.find((e) => e.id === req.id)
    assert.ok(p, 'listed as pending')
    assert.deepEqual(Object.keys(p).sort(), PENDING_KEYS)
    assert.equal(p.sessionId, x)
    assert.equal(p.toolName, ASK_TOOL)
    assert.ok(!Number.isNaN(Date.parse(p.at)) || Number.isFinite(p.at), 'at is a time')
    await answer(req.id, { decision: 'allow', risk: 'low', reason: 'fine ' + text })
    await askSettled(host, text)
    await settledIdle(host, x)
    const b = await approvalsNow(host)
    assert.equal(b.pending.some((e) => e.id === req.id), false)
    for (const r of b.recent) {
      assert.deepEqual(Object.keys(r).sort(), RECENT_KEYS)
      assert.ok(RECENT_ANSWERS.includes(r.answer), r.answer)
      assert.ok(FINAL_OUTCOMES.includes(r.finalOutcome), r.finalOutcome)
      assert.ok(r.risk === null || ['low', 'high'].includes(r.risk))
      assert.ok(['complete', 'truncated', 'unavailable'].includes(r.argumentsStatus))
    }
    const top = b.recent[0]
    assert.equal(top.answer, 'allow')
    assert.equal(top.risk, 'low')
    assert.equal(top.rationale, 'fine ' + text)
    assert.equal(top.finalOutcome, OUTCOME.allow)
    const times = b.recent.map((r) => Date.parse(r.at))
    assert.deepEqual(times, [...times].sort((m, n) => n - m), 'newest first')
    assert.equal(JSON.stringify(b).includes(secret), false, 'state never holds the arguments')
    const dir = path.join(home, 'storages', 'fishball_intake', 'approvals')
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    assert.ok(files.length > 0, 'audit records stored')
    for (const f of files) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8').includes(secret), false, 'audit never holds the arguments: ' + f)
  })

  it('APR-22 the state lists 20 recent entries, newest first, after 21 requests', { timeout: 120000 }, async () => {
    let last
    for (let i = 0; i < RECENT_MAX + 1; i++) {
      const text = tok('22')
      await plan(text, { decision: 'allow', risk: 'low', reason: 'r' + i })
      await startAsk(host, x, ASK_TOOL, { text })
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.allow)
      await settledIdle(host, x)
      last = 'r' + i
    }
    await settledIdle(host, fb)
    const a = await approvalsNow(host)
    assert.equal(a.recent.length, RECENT_MAX)
    assert.equal(a.recent[0].rationale, last)
    assert.equal(a.recent[RECENT_MAX - 1].rationale, 'r1')
  })

  it('APR-23 auditEntriesKept 2 keeps at most 2 audit records, the newest among them', T, async (t) => {
    await setLimit({ auditEntriesKept: 2 })
    try {
      for (let i = 0; i < 3; i++) {
        const text = tok('23')
        await plan(text, { decision: 'allow', risk: 'low', reason: 'k' + i })
        await startAsk(host, x, ASK_TOOL, { text })
        await askSettled(host, text)
        await settledIdle(host, x)
      }
      await settledIdle(host, fb)
      const dir = path.join(home, 'storages', 'fishball_intake', 'approvals')
      const files = fs.readdirSync(dir)
      assert.ok(files.length <= 2, 'at most 2 stored: ' + files.length)
      assert.ok(files.some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('k2')), 'the newest kept')
      const recent = (await approvalsNow(host)).recent
      t.diagnostic('state recent after pruning: ' + recent.length)
      assert.equal(recent[0].rationale, 'k2')
    } finally { await setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })

  it('APR-24 Fishball\'s system prompt carries the permission rubric', T, async () => {
    const system = (await host.call('requests', { sessionId: fb })).at(-1).system
    for (const phrase of RUBRIC) assert.ok(system.includes(phrase), 'missing: ' + phrase)
  })

  it('APR-25 the client bundle has a Permission requests section', T, async () => {
    const bundle = await fishballClientBundle(host)
    assert.ok(bundle.found)
    assert.ok(bundle.text.includes('Permission requests'))
  })
})
