/**
 * IX-UC-02 (USE-CASES.md): a managed session's permission requests, decided by its principal over MCP
 * on a real DSH. Gap-check (B) rows: APR-01, APR-04…08, APR-10…14, APR-17, APR-19, APR-20, PTA-01,
 * RTE-02/04 (no cap), DCD-04…07, DCD-10, STP-02b, REG-01, the all-approvals end-to-end row; and the
 * re-baselined wire rows "no cap on pending approvals". Techniques: UC, EP, BVA, DT, ST.
 */
import assert from 'node:assert/strict'
import {
  APPROVAL_DECISION, ARGUMENTS_STATUS, DECISION_KIND, DECISION_TEXT, EVENT_TYPE, FIXTURE, IX, OFFER_ID, PAYLOAD_LIMITS, REFUSAL, RELAYED,
  RETIREMENT_REASON, RISK, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL, WORLD, formatOfferId,
} from './constants.mjs'
import { row, withdrawn } from './rows.mjs'
import {
  A, answer, asked, bytes, call, cid, decided, eventually, free, handOver, isListed, listed, managed, ofType, okCall, pending, permissionsFor, principal,
  quiet, reconnect, refusedCall, resultOf, retirement, session, setEnabled, setLimit, settlement, settlementsOf, step, stockFor, takeBack, tok, turn,
  titleOf, untilStock, userClicks, world,
} from './subject.mjs'

const SET = RELAYED.setting
/** The descriptor's required keys and its optional ones (K1 shapes.js `descriptor`), for a permission request. */
const DESCRIPTOR_KEYS = ['approvalId', 'arguments', 'argumentsStatus', 'at', 'callId', 'choices', 'kind', 'offerId', 'prompt', 'quotes', 'reason', 'title', 'toolName']

/** A refused answer: the code, still listed, the call still waiting (no outcome). */
async function assertRefusedAnswer(w, p, r, a, code) {
  const reply = await answer(p, r, a)
  assert.deepEqual([reply.ok, reply.code], [false, code], JSON.stringify(reply))
  assert.ok(await isListed(p, r), 'a refused answer unlisted the request')
  assert.equal((await w.call('calls')).find((c) => c.text === r.text)?.outcome, null, 'a refused answer decided the call')
}
/** A valid allow after refusals: accepted, the call runs. */
async function assertLaterAllow(w, p, r) {
  assert.deepEqual(await answer(p, r, A.allow()), { ok: true, accepted: true })
  assert.equal((await decided(w, r.text)).outcome, IX.outcome.allowed)
}

export function registerApprovalCases(sdk) {
  const w0 = () => world(sdk)

  // ------------------------------------------------------------------------- the event and the descriptor
  row(sdk, 'APR-01', 'UC (first request, principal not connected)', 'one permission event; offer {<approvalId>.r1, 1, approval}; the K1 descriptor (apr_ + 32 hex, choices, title, callId, reason, quotes [], the call\'s JSON, complete, no expiresAt); the stock prompt is not shown', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid, { extra: { pad: tok('pad') } })
    const { event, d } = r
    assert.equal(event.type, EVENT_TYPE.permission)
    assert.equal(event.sourceSessionId, sid)
    assert.match(d.approvalId, RELAYED.approvalId)
    assert.deepEqual(event.offer, { offerId: formatOfferId(d.approvalId, OFFER_ID.firstRevision), revision: OFFER_ID.firstRevision, decisionKind: DECISION_KIND.approval })
    assert.deepEqual(Object.keys(d).sort(), DESCRIPTOR_KEYS)
    assert.equal(d.offerId, event.offer.offerId)
    assert.equal(d.kind, DECISION_KIND.approval)
    assert.deepEqual(d.choices, [...RELAYED.approvalChoices])
    assert.equal(typeof d.prompt, 'string')
    assert.equal(d.title, await titleOf(p, sid))
    assert.equal(typeof d.at, 'number')
    assert.equal(d.toolName, IX.fixture.askTool)
    assert.equal(d.callId, r.id)
    assert.equal(d.reason, IX.fixture.reason(r.text))
    assert.deepEqual(d.quotes, [])
    assert.deepEqual(JSON.parse(d.arguments), r.args)
    assert.equal(d.argumentsStatus, ARGUMENTS_STATUS.complete)
    await quiet()
    assert.equal((await permissionsFor(p, r.text)).length, 1, 'more than one permission event')
    assert.deepEqual(await stockFor(w, r.text), [], 'the stock prompt is shown while P holds it')
    await free(w, sid)
  })
  row(sdk, 'APR-02', 'EP (approvals_list: P / Q / unmanaged)', `P lists it with the same descriptor; another principal → ${REFUSAL.forbidden}; an unmanaged session → ${REFUSAL.notManaged}`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const q = await principal(t, w, FIXTURE.label.q)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    assert.deepEqual((await listed(p, sid)).find((x) => x.approvalId === r.d.approvalId), r.d)
    await refusedCall(q.client, TOOL.approvalsList, { sessionId: sid }, REFUSAL.forbidden)
    await refusedCall(p.client, TOOL.approvalsList, { sessionId: await session(w) }, REFUSAL.notManaged)
    await free(w, sid)
  })

  // ------------------------------------------------------------------------- answers (decision table)
  row(sdk, 'APR-04', 'DT (allow + low + reason + complete)', '{accepted: true}; the call runs allowed once; the stock prompt never shows; one settlement {allowed, by principal}', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    assert.deepEqual(await answer(p, r, A.allow()), { ok: true, accepted: true })
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.allowed)
    const s = await settlement(p.client, r.d.approvalId)
    assert.deepEqual(s.payload, { approvalId: r.d.approvalId, outcome: SETTLEMENT_OUTCOME.allowed, by: SETTLED_BY.principal })
    await quiet()
    assert.equal(settlementsOf(await pending(p.client), r.d.approvalId).length, 1)
    assert.deepEqual(await stockFor(w, r.text), [])
    assert.equal(await isListed(p, r), false, 'a settled request is still listed')
  })
  const reason501 = 'r'.repeat(PAYLOAD_LIMITS.reasonChars + 1)
  for (const [label, a, code] of [
    ['risk high', { ...A.allow(), risk: RISK.high }, REFUSAL.allowNeedsLowRisk],
    ['no risk', { decision: APPROVAL_DECISION.allow, reason: FIXTURE.reason }, REFUSAL.riskRequired],
    ['no reason', { decision: APPROVAL_DECISION.allow, risk: RISK.low }, REFUSAL.reasonRequired],
    ['reason \'\'', A.allow(''), REFUSAL.reasonRequired],
    ['reason whitespace', A.allow(' \n\t '), REFUSAL.reasonRequired],
    [`reason ${PAYLOAD_LIMITS.reasonChars + 1} characters`, A.allow(reason501), REFUSAL.limitExceeded],
    // Re-baselined by X-SEC X-02: K1's input schema no longer admits `ask` or `question` (q1 "Refuse it").
    ['decision ask (q1, X-02)', { decision: APPROVAL_DECISION.ask, risk: RISK.low, reason: FIXTURE.reason }, REFUSAL.invalidArguments],
    ['a question member (X-02)', { ...A.allow(), [RELAYED.questionMember]: FIXTURE.otherReason }, REFUSAL.invalidArguments],
    // Re-baselined by R-FIX-CONNECTOR (review F08): a reject needs a reason only, no risk (DESIGN.md
    // §7a.3; docs/connector-contract.md "reject needs a reason"), so `reject with no risk` is now an
    // accepted row below; a reject without a reason is still refused.
    ['reject with reason \'\'', { decision: APPROVAL_DECISION.reject, risk: RISK.high, reason: '' }, REFUSAL.reasonRequired],
    ['RX-F08 reject with no reason and no risk', { decision: APPROVAL_DECISION.reject }, REFUSAL.reasonRequired],
    ['RX-F08 reject with reason whitespace and no risk', { decision: APPROVAL_DECISION.reject, reason: ' \n\t ' }, REFUSAL.reasonRequired],
  ]) {
    row(sdk, 'APR-05', `DT (${label})`, `→ ${code}; still listed and waiting; a later valid allow is accepted${label.includes('q1') ? ` (${DECISION_TEXT.q1}; X-SEC X-02)` : ''}`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      await assertRefusedAnswer(w, p, r, a, code)
      await assertLaterAllow(w, p, r)
    })
  }
  row(sdk, 'APR-05', `BVA (reason ${PAYLOAD_LIMITS.reasonChars} characters, astral)`, 'accepted', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    assert.deepEqual(await answer(p, r, A.allow(FIXTURE.astral.repeat(PAYLOAD_LIMITS.reasonChars))), { ok: true, accepted: true })
  })
  row(sdk, 'APR-05', 'DT (allow on truncated arguments)', `argumentExcerptBytes small → argumentsStatus truncated; allow → ${REFUSAL.argumentsIncomplete}; still listed; reject then answers`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await setLimit(t, w, SET.argumentExcerptBytes, FIXTURE.shortExcerpt)
    const r = await asked(w, p, sid, { extra: { pad: FIXTURE.padUnit.repeat(FIXTURE.wideBytesPad) } })
    assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.truncated)
    await assertRefusedAnswer(w, p, r, A.allow(), REFUSAL.argumentsIncomplete)
    assert.deepEqual(await answer(p, r, A.reject()), { ok: true, accepted: true })
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.rejected)
  })
  // A reject with a reason is accepted whatever its risk, and with none (F08 re-baseline above).
  for (const [id, label, risked] of [['APR-05r / DIR-02', 'reject + risk + reason', true], ['APR-05r / RX-F08', 'reject + reason, no risk', false]]) {
    row(sdk, id, `DT (${label})`, 'accepted; the call is rejected; the agent\'s result is blocked with "The managing agent rejected this call: <reason>"; settlement {rejected, principal}', async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      const why = tok('why')
      const { risk, ...riskless } = A.reject(why)
      assert.deepEqual(await answer(p, r, risked ? { ...riskless, risk } : riskless), { ok: true, accepted: true })
      assert.equal((await decided(w, r.text)).outcome, IX.outcome.rejected)
      const result = await resultOf(w, sid, r.id)
      assert.equal(result.isError, true)
      assert.ok(result.text.includes(RELAYED.rejected(why)), result.text)
      assert.deepEqual((await settlement(p.client, r.d.approvalId)).payload, { approvalId: r.d.approvalId, outcome: SETTLEMENT_OUTCOME.rejected, by: SETTLED_BY.principal })
    })
  }
  row(sdk, 'DIR-01', 'EP (allow: the tool\'s own output)', 'an allowed call\'s result is the tool\'s own output, with nothing appended', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await answer(p, r, A.allow())
    const result = await resultOf(w, sid, r.id)
    assert.equal(result.isError, false)
    assert.equal(result.text, IX.fixture.outcomeText(IX.outcome.allowed))
  })
  for (const [label, ids, code] of [
    ['an unknown approvalId', { approvalId: FIXTURE.unknownApprovalId, offerId: formatOfferId(FIXTURE.unknownApprovalId, OFFER_ID.firstRevision) }, REFUSAL.expired],
    ['an unknown offerId', (r) => ({ offerId: formatOfferId(r.d.approvalId, OFFER_ID.firstRevision + 1) }), REFUSAL.expired],
  ]) {
    row(sdk, 'APR-06', `EP (${label})`, `→ ${code}; the request still waits`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      const reply = await answer(p, r, A.allow(), typeof ids === 'function' ? ids(r) : ids)
      assert.deepEqual([reply.ok, reply.code], [false, code])
      assert.ok(await isListed(p, r))
      await assertLaterAllow(w, p, r)
    })
  }
  row(sdk, 'APR-06 / DCD-10', 'ST (Settled → a second answer)', `→ ${REFUSAL.alreadySettled}; the call ran once`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await answer(p, r, A.allow())
    await decided(w, r.text)
    for (const a of [A.allow(), A.reject(), A.escalate()]) {
      const reply = await answer(p, r, a)
      assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.alreadySettled], JSON.stringify(reply))
    }
    assert.equal((await w.call('calls')).filter((c) => c.text === r.text).length, 1)
  })
  row(sdk, 'APR-06', 'EP (another principal answers)', `Q → ${REFUSAL.forbidden} (${DECISION_TEXT.own}); P's answer then works`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const q = await principal(t, w, FIXTURE.label.q)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    const reply = await answer(q, r, A.allow())
    assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.forbidden])
    await assertLaterAllow(w, p, r)
  })

  // ------------------------------------------------------------------------- escalate (state transitions)
  for (const [outcome, settled] of [[IX.outcome.allowed, SETTLEMENT_OUTCOME.allowed], [IX.outcome.rejected, SETTLEMENT_OUTCOME.rejected]]) {
    row(sdk, 'APR-07 / DCD-04 / DCD-05', `ST (Offered → escalate → stock prompt → user ${outcome})`, `{accepted: true} (risk and reason optional); the stock prompt shows; the offer leaves approvals_list; a later answer → ${REFUSAL.alreadySettled}; the user's click decides; settlement {${settled}, by user}`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      assert.deepEqual(await answer(p, r, A.escalate()), { ok: true, accepted: true })
      assert.equal((await untilStock(w, r.text)).length, 1)
      assert.equal(await isListed(p, r), false)
      const late = await answer(p, r, A.allow())
      assert.deepEqual([late.ok, late.code], [false, REFUSAL.alreadySettled])
      await userClicks(w, r.text, outcome)
      assert.equal((await decided(w, r.text)).outcome, outcome)
      assert.deepEqual((await settlement(p.client, r.d.approvalId)).payload, { approvalId: r.d.approvalId, outcome: settled, by: SETTLED_BY.user })
    })
  }
  row(sdk, 'REG-01', 'DT (escalate with risk and an empty reason)', 'escalate with risk high and reason \'\' → {accepted: true}', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    assert.deepEqual(await answer(p, r, { decision: APPROVAL_DECISION.escalate, risk: RISK.high, reason: '' }), { ok: true, accepted: true })
    await untilStock(w, r.text)
    await free(w, sid)
  })
  row(sdk, 'APR-20', 'EP (escalate; the stock prompt throws)', 'the call\'s outcome is unavailable', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await w.call('setStock', { mode: IX.stock.throws })
    t.after(() => w.call('setStock', { mode: IX.stock.hold }))
    const r = await asked(w, p, sid)
    await answer(p, r, A.escalate())
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.unavailable)
  })

  // ------------------------------------------------------------------------- no timer, no cap
  row(sdk, 'APR-08 / DCD-06', 'ST (silence)', 'no timer settles it: past a quiet period it is still listed, the call still waits and the stock prompt is not shown', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await quiet(); await quiet()
    assert.ok(await isListed(p, r))
    assert.equal((await w.call('calls')).find((c) => c.text === r.text).outcome, null)
    assert.deepEqual(await stockFor(w, r.text), [])
    assert.equal(Object.hasOwn(r.d, 'expiresAt'), false)
    await assertLaterAllow(w, p, r)
  })
  row(sdk, 'RTE-02 / DCD-08', `BVA (no cap: ${FIXTURE.noCapCount} pending requests)`, `all ${FIXTURE.noCapCount} are offered and listed; none reaches the stock prompt (${DECISION_TEXT.noCap})`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const reqs = []
    for (let i = 0; i < FIXTURE.noCapCount; i++) reqs.push(await asked(w, p, await managed(w, p)))
    for (const r of reqs) assert.ok(await isListed(p, r), 'not listed: ' + r.text)
    for (const r of reqs) assert.deepEqual(await stockFor(w, r.text), [], 'refused to the stock prompt: ' + r.text)
    for (const r of reqs) await free(w, r.sid)
  })
  row(sdk, 'RTE-04 / DCD-11', `EP (the mailbox at maxQueuedInputs)`, 'a permission request is still offered (offers always commit); the stock prompt is not shown', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await setLimit(t, w, SET.maxQueuedInputs, 1)
    // The handover event already fills the bound of one.
    assert.ok((await pending(p.client)).length >= 1)
    const r = await asked(w, p, sid)
    assert.ok(await isListed(p, r))
    assert.deepEqual(await stockFor(w, r.text), [])
    await free(w, sid)
  })

  // ------------------------------------------------------------------------- cancelled, released, revoked
  for (const [label, when] of [['before the principal read it', 'before'], ['after it was read', 'after'], ['while escalated', 'escalated'], ['by session_stop', 'stop']]) {
    row(sdk, 'APR-10 / APR-11 / APR-12 / STP-02b / DCD-07', `ST (cancelled ${label})`, 'one retirement {withdrawn}; no longer listed; a later answer is refused; the call ends cancelled', async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      if (when === 'escalated') { await answer(p, r, A.escalate()); await untilStock(w, r.text) }
      if (when === 'after') await listed(p, sid)
      if (when === 'stop') await okCall(p.client, TOOL.sessionStop, { sessionId: sid })
      else await w.call('cancel', { sessionId: sid })
      assert.equal((await decided(w, r.text)).outcome, IX.outcome.cancelled)
      const ret = await retirement(p.client, r.event)
      assert.equal(ret.payload.reason, RETIREMENT_REASON.withdrawn)
      await quiet()
      assert.equal(ofType(await pending(p.client), EVENT_TYPE.retirement).filter((e) => e.payload.retiredEventId === r.event.eventId).length, 1)
      assert.equal(await isListed(p, r), false)
      assert.equal((await answer(p, r, A.allow())).ok, false, 'a late answer was accepted')
    })
  }
  for (const [label, end, reason] of [
    ['session_release', (w, p, sid) => okCall(p.client, TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason }), RETIREMENT_REASON.released],
    ['Take back', (w, p, sid) => takeBack(w, sid), RETIREMENT_REASON.released],
    ['the principal\'s entry disabled', (w, p) => setEnabled(w, p, false), RETIREMENT_REASON.revoked],
  ]) {
    row(sdk, 'APR-15r / ASK-12 (offer part)', `ST (Offered → ${label})`, `one retirement {${reason}}; the stock prompt shows to the user, whose click decides the call`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid)
      await end(w, p, sid)
      await untilStock(w, r.text)
      await userClicks(w, r.text, IX.outcome.allowed)
      assert.equal((await decided(w, r.text)).outcome, IX.outcome.allowed)
      // A disabled entry's events are held; re-enabled, the same pair reads them with a new access token.
      // The re-enable releases the box asynchronously after the save resolves (revocation's entry chain),
      // so the reader waits until inbox_poll stops answering forbidden.
      if (reason === RETIREMENT_REASON.revoked) await setEnabled(w, p, true)
      const reader = reason === RETIREMENT_REASON.revoked ? await reconnect(t, w, p) : p
      if (reason === RETIREMENT_REASON.revoked) assert.ok(await eventually(async () => (await call(reader.client, TOOL.inboxPoll, {})).ok), 'the re-enabled box stayed held')
      assert.equal((await retirement(reader.client, r.event)).payload.reason, reason)
    })
  }

  // ------------------------------------------------------------------------- argument excerpts (BVA, live)
  for (const [label, delta] of [['= L', 0], ['L + 1', 1], ['L − 1', -1], ['L − 8 (inside a 2-byte character run)', -8]]) {
    row(sdk, 'APR-13', `BVA (argumentExcerptBytes ${label})`, delta >= 0 ? 'complete, the whole JSON' : 'truncated: a prefix of the JSON within the limit, no broken character', async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const text = tok('a13')
      const args = { text, pad: FIXTURE.twoByte.repeat(FIXTURE.padChars) }
      const full = JSON.stringify(args)
      await setLimit(t, w, SET.argumentExcerptBytes, bytes(full) + delta)
      const r = await asked(w, p, sid, { text, args })
      if (delta >= 0) {
        assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.complete)
        assert.equal(r.d.arguments, full)
      } else {
        assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.truncated)
        assert.ok(bytes(r.d.arguments) <= bytes(full) + delta, 'over the limit: ' + bytes(r.d.arguments))
        assert.ok(full.startsWith(r.d.arguments) || full.startsWith(r.d.arguments.replace(/\u2026$/, '')), 'not a prefix of the call JSON')
        assert.equal(r.d.arguments.includes('\uFFFD'), false, 'a broken character')
      }
      await free(w, sid)
    })
  }
  row(sdk, 'APR-13', `EP (the default ${RELAYED.kept.argumentExcerptBytes})`, 'Config\'s argumentExcerptBytes is 8192', async () => {
    const w = await w0()
    assert.equal((await w.settings()).value[SET.argumentExcerptBytes], RELAYED.kept.argumentExcerptBytes)
  })
  for (const [label, extra, nullId, otherTool] of [
    ['no call id', { nocall: true }, true, false],
    ['a call id not in the log', { fakecall: true }, false, false],
    ['a call to another tool', { as: IX.fixture.otherTool }, false, true],
  ]) {
    row(sdk, 'APR-14', `EP (${label})`, `argumentsStatus unavailable; callId ${nullId ? 'null' : 'kept'}; allow → ${REFUSAL.argumentsIncomplete}; still offered`, async (t) => {
      const w = await w0()
      const p = await principal(t, w)
      const sid = await managed(w, p)
      const r = await asked(w, p, sid, { extra })
      assert.equal(r.d.argumentsStatus, ARGUMENTS_STATUS.unavailable)
      assert.equal(r.d.callId === null, nullId, 'callId: ' + r.d.callId)
      assert.equal(String(r.d.arguments ?? '').includes(r.text), false, 'arguments shown')
      if (otherTool) assert.equal(r.d.toolName, IX.fixture.otherTool)
      await assertRefusedAnswer(w, p, r, A.allow(), REFUSAL.argumentsIncomplete)
      await free(w, sid)
    })
  }

  // ------------------------------------------------------------------------- whose request, which policy
  row(sdk, 'APR-17', 'EP (a subagent\'s request)', 'the event belongs to the root session (sourceSessionId is the root)', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p, IX.dsh.standardPreset)
    await w.call('askInNewAgents', { on: true })
    t.after(() => w.call('askInNewAgents', { on: false }))
    const marker = tok('sub')
    const text = tok('a17')
    await w.call('queueMarker', { marker, except: sid, script: [step(IX.fixture.askTool, { text }, cid('sub')), [{ text: 'sub done' }]] })
    await free(w, sid)
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn')), [{ text: 'done' }]] })
    let ev
    assert.ok(await eventually(async () => { ev = (await permissionsFor(p, text))[0]; return ev }), 'the subagent\'s request was not offered')
    assert.equal(ev.sourceSessionId, sid)
    await free(w, sid)
  })
  row(sdk, 'APR-19', 'EP (approval policy never)', 'the call is rejected by DSH; no event, no stock prompt', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await turn(w, sid, [[{ text: tok('warm') }]])
    assert.equal(await w.call('setPolicy', { sessionId: sid, policy: IX.policy.never }), IX.policy.never)
    const text = tok('a19')
    await turn(w, sid, [step(IX.fixture.askTool, { text }, cid('a19'))])
    assert.equal((await decided(w, text)).outcome, IX.outcome.rejected)
    await quiet()
    assert.deepEqual(await permissionsFor(p, text), [])
    assert.deepEqual(await stockFor(w, text), [])
  })
  row(sdk, 'IX-UNM / end-to-end', 'EP (unmanaged session)', 'a request in a session nobody manages shows the stock prompt only; no principal gets an event', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await session(w)
    const text = tok('unm')
    await free(w, sid)
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.fixture.askTool, { text }, cid('unm')), [{ text: 'done' }]] })
    await untilStock(w, text)
    await userClicks(w, text, IX.outcome.rejected)
    assert.equal((await decided(w, text)).outcome, IX.outcome.rejected)
    await quiet()
    assert.deepEqual(await permissionsFor(p, text), [])
  })
  row(sdk, 'PTA-01', 'EP (an inner call of run_code)', 'the descriptor\'s callId is the inner <outer>:ptc:<n> id with the inner call\'s arguments; allow → allowed inside the program', async (t) => {
    const w = await world(sdk, WORLD.scenario.ptc, IX.dsh.ptcEnv)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    await turn(w, sid, [[{ text: tok('warm') }]])
    const tools = (await w.call('requestTools', { sessionId: sid })).at(-1).map((x) => x.name)
    if (!tools.includes(IX.dsh.runCode)) return t.skip('run_code is not offered on this SDK (harness: DSH 0.2.2 ignores DSH_TOOLS_MODE)')
    await w.call('setSandbox', { sessionId: sid, mode: IX.dsh.fullAccess })
    const text = tok('pta')
    const inner = { text, pad: tok('inner') }
    const code = 'return await tools.' + IX.fixture.askTool + '(' + JSON.stringify(inner) + ')'
    await free(w, sid)
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.dsh.runCode, { code, description: tok('ptc') }, cid('outer')), [{ text: 'done' }]] })
    let ev
    assert.ok(await eventually(async () => { ev = (await permissionsFor(p, text))[0]; return ev }), 'the inner request was not offered')
    assert.match(ev.payload.callId, IX.dsh.ptcInner)
    assert.equal(ev.payload.argumentsStatus, ARGUMENTS_STATUS.complete)
    assert.deepEqual(JSON.parse(ev.payload.arguments), inner)
    assert.deepEqual(await call(p.client, TOOL.approvalAnswer, { sessionId: sid, approvalId: ev.payload.approvalId, offerId: ev.offer.offerId, answer: A.allow() }), { ok: true, accepted: true })
    const done = await decided(w, text)
    assert.equal(done.outcome, IX.outcome.allowed)
    assert.equal(done.callId, ev.payload.callId)
  })
  row(sdk, 'IX-REHAND', 'ST (Hand over → request → Take back → Hand over again)', 'the old offer is retired released; a new request in the session is offered afresh', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await takeBack(w, sid)
    await untilStock(w, r.text)
    await userClicks(w, r.text, IX.outcome.rejected)
    await w.call('idle', { sessionId: sid })
    await handOver(w, sid, p)
    const r2 = await asked(w, p, sid)
    assert.notEqual(r2.d.approvalId, r.d.approvalId)
    await free(w, sid)
  })

  // ------------------------------------------------------------------------- withdrawn (the user's decisions)
  withdrawn(sdk, 'RTE-03 / ASK-13', 'the cap', 'maxPendingApprovals: at the cap the request goes to the stock prompt at once', DECISION_TEXT.noCap)
  withdrawn(sdk, 'APR-21 / APR-23', 'audit', 'the approval audit keeps a digest, auditEntriesKept keeps the newest N', DECISION_TEXT.q6)
  withdrawn(sdk, 'ASK-01…13 / ASK-07', 'ask_agent', 'ask_agent requests, answers, refusals and the ask round', DECISION_TEXT.noAsk)
  withdrawn(sdk, 'DIR-03 / DIR-04 / DIR-05', 'ask_agent hint', 'a direct call\'s rejection points to ask_agent; an ask on a direct call continues through ask_agent', DECISION_TEXT.noAsk + '; ' + DECISION_TEXT.q1)
  withdrawn(sdk, 'QUO-01…06', 'quotes', 'ask_agent quotes of user messages and their bounds', DECISION_TEXT.noAsk + ' (quotes is always [])')
  withdrawn(sdk, 'PAS-01…06', 'passes', 'after an ask_agent allow, the exact call runs once on a pass', DECISION_TEXT.noAsk)
  withdrawn(sdk, 'PTC-01…03', 'ask hint in run_code', 'inside run_code the ask_agent hint follows the result; an ask is the inner call\'s error', DECISION_TEXT.noAsk)
  withdrawn(sdk, 'REG-02 / REG-03', 'ask decision', 'ask with only its question is accepted and the agent gets it', DECISION_TEXT.q1)
  withdrawn(sdk, 'STP-02', 'ask_agent stop', 'session_stop while an ask_agent waits', DECISION_TEXT.noAsk + ' (the direct-call half is STP-02b above)')
}
