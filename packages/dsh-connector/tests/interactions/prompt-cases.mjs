/**
 * IX-UC-05 (USE-CASES.md): prompts already showing in sessions the caller manages (`prompts_list`,
 * `prompt_answer`) on a real DSH. A prompt "already showing" is the user's stock prompt of a call
 * made while the session was the user's, which is then handed over. Gap-check (B) rows: FRZ-01, FRZ-02,
 * FRZ-04…07, rev11e-answer APR-01…07 (here APRP-*). The user: q7 "an escalated prompt is the user's";
 * "Agent不能回答不归自己管的会话，只能操作自己管的会话". Techniques: UC, EP, BVA, DT, ST.
 */
import assert from 'node:assert/strict'
import { APPROVAL_DECISION, ARGUMENTS_STATUS, DECISION_TEXT, FIXTURE, IX, PAYLOAD_LIMITS, REFUSAL, RELAYED, RISK, TOOL } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row, withdrawn } from 'dsh-connector-test-helpers/connector-world/rows'
import {
  A, answer, asked, call, cid, decided, free, handOver, managed, managedOf, okCall, permissionsFor, principal, quiet, refusedCall, resultOf, session,
  setLimit, step, titleOf, tok, untilStock, userClicks, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'

const SET = RELAYED.setting
/** A call in the user's session `sid` whose stock prompt is showing; `{text, id}`. */
async function showing(w, sid, extra = {}) {
  const text = tok('frz')
  const id = cid('frz')
  await free(w, sid)
  await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.fixture.askTool, { text, ...extra }, id), [{ text: 'done' }]] })
  await untilStock(w, text)
  return { text, id, sid }
}
/** P's prompts_list entries for `sid`. */
const promptsOf = async (p, sid) => (await okCall(p.client, TOOL.promptsList, {})).prompts.filter((x) => !sid || x.sessionId === sid)
/** A session with a prompt showing, then handed over to P; returns `{w, p, sid, s, entry}`. */
async function heldPrompt(t, sdk, extra) {
  const w = await world(sdk)
  const p = await principal(t, w)
  const sid = await session(w)
  const s = await showing(w, sid, extra)
  await handOver(w, sid, p)
  const [entry] = await promptsOf(p, sid)
  assert.ok(entry, 'the showing prompt is not listed')
  return { w, p, sid, s, entry }
}
const promptAnswer = (p, entry, rest) => call(p.client, TOOL.promptAnswer, { sessionId: entry.sessionId, promptId: entry.promptId, ...rest })
const allow = (reason = FIXTURE.reason) => ({ decision: APPROVAL_DECISION.allow, risk: RISK.low, reason })
const reject = (reason = FIXTURE.otherReason) => ({ decision: APPROVAL_DECISION.reject, reason })

export function registerPromptCases(sdk) {
  row(sdk, 'FRZ-01', 'EP (nothing showing)', 'prompts_list → [] for a principal with a managed session and no prompt', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    await managed(w, p)
    assert.deepEqual(await promptsOf(p), [])
  })
  row(sdk, 'FRZ-02 / FRZ-04', 'UC (a prompt showing when the session was handed over)', `one entry of exactly {${RELAYED.promptKeys.join(', ')}}; no offer and no event for it; Q does not list it`, async (t) => {
    const { w, p, sid, s, entry } = await heldPrompt(t, sdk)
    const q = await principal(t, w, FIXTURE.label.q)
    assert.deepEqual(Object.keys(entry).sort(), [...RELAYED.promptKeys])
    assert.equal(entry.sessionId, sid)
    assert.equal(entry.toolName, IX.fixture.askTool)
    assert.equal(entry.argumentsStatus, ARGUMENTS_STATUS.complete)
    assert.equal(typeof entry.since, 'number')
    assert.equal(entry.title, await titleOf(p, sid))
    assert.equal(typeof entry.managed, 'boolean')
    await quiet()
    assert.deepEqual(await permissionsFor(p, s.text), [], 'a prompt already showing became an offer')
    assert.deepEqual(await promptsOf(q, sid), [], 'another principal lists it')
    await free(w, sid)
  })
  row(sdk, 'FRZ-q7', 'EP (a prompt the caller escalated)', `not listed (${DECISION_TEXT.q7})`, async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await answer(p, r, A.escalate())
    await untilStock(w, r.text)
    assert.deepEqual(await promptsOf(p, sid), [])
    await free(w, sid)
  })
  row(sdk, 'FRZ-unmanaged', 'EP (a prompt in a session nobody manages)', `not listed; prompt_answer on it → ${REFUSAL.notManaged}; management unchanged (${DECISION_TEXT.own})`, async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const sid = await session(w)
    const s = await showing(w, sid)
    assert.deepEqual(await promptsOf(p), [])
    const before = await managedOf(w)
    await refusedCall(p.client, TOOL.promptAnswer, { sessionId: sid, promptId: FIXTURE.unknownPrompt, ...allow() }, REFUSAL.notManaged)
    assert.deepEqual(await managedOf(w), before)
    await userClicks(w, s.text, IX.outcome.rejected)
  })

  // ------------------------------------------------------------------------- answers
  row(sdk, 'APRP-01', 'DT (allow + low + reason + complete)', '{promptId, decision: allow, managed: true}; the prompt closes; the call runs allowed once; the session stays managed by P', async (t) => {
    const { w, p, sid, s, entry } = await heldPrompt(t, sdk)
    assert.deepEqual(await promptAnswer(p, entry, allow()), { ok: true, promptId: entry.promptId, decision: APPROVAL_DECISION.allow, managed: true })
    assert.equal((await decided(w, s.text)).outcome, IX.outcome.allowed)
    assert.deepEqual(await promptsOf(p, sid), [])
    assert.ok((await managedOf(w)).some((m) => m.sessionId === sid && m.principal.key === p.principalKey))
  })
  row(sdk, 'APRP-02', 'DT (reject + reason)', '{promptId, decision: reject, managed: true}; the call is rejected and the agent sees the reason, not "the user rejected"', async (t) => {
    const { w, p, s, entry } = await heldPrompt(t, sdk)
    const why = tok('why')
    assert.deepEqual(await promptAnswer(p, entry, reject(why)), { ok: true, promptId: entry.promptId, decision: APPROVAL_DECISION.reject, managed: true })
    assert.equal((await decided(w, s.text)).outcome, IX.outcome.rejected)
    const result = await resultOf(w, s.sid, s.id)
    assert.ok(result.text.includes(why), result.text)
  })
  for (const [label, rest, code] of [
    ['no reason (schema)', { decision: APPROVAL_DECISION.allow, risk: RISK.low }, REFUSAL.invalidArguments],
    ['reason \'\'', allow(''), REFUSAL.reasonRequired],
    ['reason whitespace', allow('   '), REFUSAL.reasonRequired],
    ['reject with reason \'\'', reject(''), REFUSAL.reasonRequired],
    ['allow with no risk', { decision: APPROVAL_DECISION.allow, reason: FIXTURE.reason }, REFUSAL.riskRequired],
    ['allow with risk high', { ...allow(), risk: RISK.high }, REFUSAL.allowNeedsLowRisk],
    [`reason ${PAYLOAD_LIMITS.reasonChars + 1}`, allow('r'.repeat(PAYLOAD_LIMITS.reasonChars + 1)), REFUSAL.limitExceeded],
    ['decision escalate (schema: allow or reject only)', { decision: APPROVAL_DECISION.escalate, reason: FIXTURE.reason }, REFUSAL.invalidArguments],
  ]) {
    row(sdk, 'APRP-05', `DT (${label})`, `→ ${code}; the prompt still shows and is listed`, async (t) => {
      const { w, p, sid, s, entry } = await heldPrompt(t, sdk)
      const reply = await promptAnswer(p, entry, rest)
      assert.deepEqual([reply.ok, reply.code], [false, code], JSON.stringify(reply))
      assert.equal((await promptsOf(p, sid)).length, 1)
      assert.equal((await w.call('calls')).find((c) => c.text === s.text).outcome, null)
      await free(w, sid)
    })
  }
  row(sdk, 'APRP-05', `BVA (reason ${PAYLOAD_LIMITS.reasonChars})`, 'accepted', async (t) => {
    const { p, entry } = await heldPrompt(t, sdk)
    assert.equal((await promptAnswer(p, entry, allow('r'.repeat(PAYLOAD_LIMITS.reasonChars)))).ok, true)
  })
  row(sdk, 'APRP-05', 'DT (allow on truncated arguments)', `the entry says truncated; allow → ${REFUSAL.argumentsIncomplete}; reject then answers`, async (t) => {
    const w = await world(sdk)
    await setLimit(t, w, SET.argumentExcerptBytes, FIXTURE.shortExcerpt)
    const p = await principal(t, w)
    const sid = await session(w)
    const s = await showing(w, sid, { pad: FIXTURE.padUnit.repeat(FIXTURE.wideBytesPad) })
    await handOver(w, sid, p)
    const [entry] = await promptsOf(p, sid)
    assert.equal(entry.argumentsStatus, ARGUMENTS_STATUS.truncated)
    const reply = await promptAnswer(p, entry, allow())
    assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.argumentsIncomplete])
    assert.equal((await promptAnswer(p, entry, reject())).ok, true)
    assert.equal((await decided(w, s.text)).outcome, IX.outcome.rejected)
  })
  row(sdk, 'APRP-05', 'EP (another principal answers)', `Q → ${REFUSAL.forbidden} (${DECISION_TEXT.own}); management unchanged`, async (t) => {
    const { w, p, sid, entry } = await heldPrompt(t, sdk)
    const q = await principal(t, w, FIXTURE.label.q)
    const reply = await promptAnswer(q, entry, allow())
    assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.forbidden])
    assert.ok((await managedOf(w)).some((m) => m.sessionId === sid && m.principal.key === p.principalKey))
    await free(w, sid)
  })
  row(sdk, 'APRP-06', 'ST (Answered → a second answer)', `→ ${REFUSAL.expired}`, async (t) => {
    const { p, entry } = await heldPrompt(t, sdk)
    assert.equal((await promptAnswer(p, entry, allow())).ok, true)
    const again = await promptAnswer(p, entry, reject())
    assert.deepEqual([again.ok, again.code], [false, REFUSAL.expired])
  })
  row(sdk, 'APRP-07 / FRZ-05 / FRZ-06', 'ST (the user clicks first)', `the user's own Allow once / Reject closes it: it leaves prompts_list; prompt_answer → ${REFUSAL.expired}`, async (t) => {
    const { w, p, sid, s, entry } = await heldPrompt(t, sdk)
    await userClicks(w, s.text, IX.outcome.allowed)
    assert.equal((await decided(w, s.text)).outcome, IX.outcome.allowed)
    assert.deepEqual(await promptsOf(p, sid), [])
    const late = await promptAnswer(p, entry, allow())
    assert.deepEqual([late.ok, late.code], [false, REFUSAL.expired])
  })
  row(sdk, 'FRZ-07', 'ST (the turn is stopped)', `the prompt closes; it leaves prompts_list; prompt_answer → ${REFUSAL.expired}`, async (t) => {
    const { w, p, sid, entry } = await heldPrompt(t, sdk)
    await w.call('cancel', { sessionId: sid })
    await w.call('idle', { sessionId: sid })
    assert.deepEqual(await promptsOf(p, sid), [])
    const late = await promptAnswer(p, entry, allow())
    assert.deepEqual([late.ok, late.code], [false, REFUSAL.expired])
  })

  withdrawn(sdk, 'APRP-10 / APRP-11', 'audit', 'a prompt answer is audited (decisions row answer-prompt)', DECISION_TEXT.q6)
  withdrawn(sdk, 'APRP-03 / APRP-04', 'prompt makes managed', 'answering a prompt of the user\'s session makes it managed', 'answering never changes management, and an unmanaged session is not-managed (' + DECISION_TEXT.own + ')')
}
