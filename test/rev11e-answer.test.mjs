/**
 * Revision 11 rev11e on H-STUB: prompt.answer, the fifth way in (DESIGN §5e, §7a.9, §9 managed / audit /
 * decisions, §11 restart; requirements items 2 and 20; S33; contract §4.3 `prompt.answer` and its refusals, §8
 * `reasonChars`). Prompts are HELD scripted stock prompts in sessions that are the user's. The stub lists them
 * (`prompt.list`) and answers one (`prompt.answer {sessionId, promptId, decision, reason, risk?}`).
 * One host; cases run in order; the restart case is last.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | APR-01  | EP (allow) | §7a.9, §4.3 | `{promptId, decision:'allow', managed:true}`; the prompt closes; the call ran allowed-once; the entry left the list |
 * | APR-02  | EP (reject with a reason) | §7a.9 | `{…, decision:'reject', managed:true}`; prompt closed; the agent sees the reason and not "the user rejected"; entry gone |
 * | APR-03b | ST (allow → managed, same turn) | §7a.9, done-when | the model request after the answered call already has the three tools |
 * | APR-04b | ST (reject → managed, same turn) | as APR-03b | as APR-03b |
 * | APR-03  | ST (allow → managed) | §5e, §9 | managed entry {by: prompt-answer}; no notice about the session to the instance; the next turn has the three tools |
 * | APR-04  | ST (reject → managed) | as APR-03 | same after a reject |
 * | APR-05 ×9 | DT/BVA (refused answers leave the prompt showing) | §4.3 refusals, §8 | reject with a blank / empty reason `reason-required`; no reason not accepted; allow without risk `risk-required`; allow risk high `allow-needs-low-risk`; decision escalate `invalid-decision`; reason of 501 not accepted; unknown prompt id `expired`: the prompt stays listed and not closed; the session stays yours; no decisions row |
 * | APR-06  | ST (a second answer), BVA (reason 500) | §7a.9 "a late answer gets already answered" | the first (a 500-character reason) is accepted; the second `expired`; the first outcome stands; one decisions row |
 * | APR-07  | ST (your click first, then the instance) | §7a.9 | `expired`; the session is not made managed; no decisions row |
 * | APR-10  | EP (audit) | §9 decisions / Audit | one decisions row answer-prompt by fishball (session, target the prompt id, rationale, outcome naming the decision), and approvals audit rows of kind prompt (allow, reject) |
 * | APR-11  | ST (restart) | §9, §11 | managed by prompt-answer and the decisions row survive; no prompt is listed (a restart ends turns) |
 *
 * Retired:
 * - APR-08, APR-09: tag records and the turn-tail tags were removed (slim §8.1, T08/T15); the answer is recorded as a decisions row and an audit row (APR-10).
 * - APR-12: the main-side managed-sessions list with its "Prompt answered by Fishball" tag was removed (slim §12, T15); the registry `by` is asserted in APR-03.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ENVELOPE } from 'fishball-connector/contract'
import { DSH_REJECT_WORDS, MANAGED_ENTRY_KEYS, MANAGED_TOOLS, OUTCOME, PROMPT_DECISION } from './support/constants.mjs'
import { HOOK, T, approvalAudit, managedItems, settledIdle, toolNames } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import {
  GRANT_C, answerPrompt, assertNotAccepted, assertRefused, click, decisions, grantStub, listedPrompts, managedOf, noticesFrom, promptOf,
  promptsOf, reattachIfClosed, restartGrantStub, resultOf, show, sizedText, sleep, tokens, yours,
} from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('APR')
const LOW = 'low'

describe('Revision 11 rev11e on H-STUB: prompt.answer', () => {
  let ctx
  const s = {}
  const promptAudit = () => approvalAudit(ctx.home).filter((r) => r.record.kind === GRANT_C.audit.prompt)
  /** Show a prompt in sid and return its text, call id and listed prompt id. */
  async function showing(sid, label) {
    const text = tok(label)
    const callId = cid(label)
    await show(ctx, sid, text, callId)
    const mine = await promptsOf(ctx, sid)
    assert.equal(mine.length, 1, 'listed once: ' + JSON.stringify(mine))
    return { text, callId, promptId: mine[0].promptId }
  }
  const lastTools = async (sid) => toolNames((await ctx.host.call('requests', { sessionId: sid })).at(-1))
  const assertManagedBy = async (sid) => {
    const e = await managedOf(ctx, sid)
    assert.ok(e, 'managed: ' + JSON.stringify((await ctx.host.state()).managed))
    assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
    assert.equal(e.by, GRANT_C.promptManagedBy)
    assert.ok(Number.isFinite(Date.parse(e.since)), 'since: ' + e.since)
  }
  const nextTurnHasTools = async (sid) => {
    await settledIdle(ctx.host, sid)
    const r = await ctx.host.call('drive', { sessionId: sid, script: [[{ text: 'next' }]], text: 'again' })
    for (const tool of MANAGED_TOOLS) assert.ok(toolNames(r.requests.at(-1)).includes(tool), tool)
  }

  before(async () => {
    ctx = await grantStub('rev11e-answer')
    for (const n of ['a', 'b', 'c', 'd', 'e']) s[n] = await yours(ctx, 'apr-' + n)
  }, HOOK)
  after(() => stopStub(ctx), HOOK)

  let allowed
  it('APR-01 allow: the prompt closes, the call runs, the entry leaves the list', T, async () => {
    allowed = await showing(s.a, '01')
    assert.equal((await promptOf(ctx, allowed.text)).closed, false, 'showing')
    const r = await answerPrompt(ctx, s.a, allowed.promptId, { decision: PROMPT_DECISION.allow, risk: LOW, reason: 'the user asked for it ' + allowed.text })
    assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { promptId: allowed.promptId, decision: PROMPT_DECISION.allow, managed: true } })
    assert.equal((await promptOf(ctx, allowed.text)).closed, true, 'the prompt closed')
    assert.equal((await resultOf(ctx, s.a, allowed.callId)).text, 'outcome=' + OUTCOME.allow, 'the call ran; an allow adds no hint (§7a.9)')
    assert.equal(await ctx.host.call('heldApprovals', {}), 0)
    assert.deepEqual(await promptsOf(ctx, s.a), [])
  })

  let rejected
  it('APR-02 reject: the prompt closes and the agent sees the reason, not "the user rejected"', T, async () => {
    rejected = await showing(s.b, '02')
    rejected.reason = 'this writes outside the workspace ' + rejected.text
    const r = await answerPrompt(ctx, s.b, rejected.promptId, { decision: PROMPT_DECISION.reject, reason: rejected.reason })
    assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { promptId: rejected.promptId, decision: PROMPT_DECISION.reject, managed: true } })
    assert.equal((await promptOf(ctx, rejected.text)).closed, true)
    const got = await resultOf(ctx, s.b, rejected.callId)
    assert.ok(got.text.includes(rejected.reason), 'the agent sees the reason: ' + got.text)
    assert.equal(got.text.includes(DSH_REJECT_WORDS), false, got.text)
    assert.deepEqual(await promptsOf(ctx, s.b), [])
  })

  // Done-when: "its very next model request has the three tools, even within the same turn". These run before
  // APR-03 and APR-04, which drive further turns, so the session's last request is still the same turn's.
  for (const [id, name] of [['APR-03b', 'a'], ['APR-04b', 'b']]) {
    it(id + ' the model request after the answered call, in the same turn, already has the three tools', T, async () => {
      for (const tool of MANAGED_TOOLS) assert.ok((await lastTools(s[name])).includes(tool), 'the turn\'s last request has ' + tool)
    })
  }

  it('APR-03 an allow makes the session managed: entry by prompt-answer, no notice to the instance, the three tools', T, async () => {
    await assertManagedBy(s.a)
    assert.deepEqual(await managedItems(ctx.host, s.a), [], 'no hand-over note in the intake')
    assert.deepEqual(await noticesFrom(ctx, s.a), [], 'no notice about the session beyond the answer (§7a.9)')
    await nextTurnHasTools(s.a)
  })

  it('APR-04 a reject also makes the session managed, with the three tools at its next turn', T, async () => {
    await assertManagedBy(s.b)
    assert.deepEqual(await noticesFrom(ctx, s.b), [])
    await nextTurnHasTools(s.b)
  })

  describe('APR-05 refused answers leave the prompt showing and the session yours', () => {
    let c
    // Contract §4.3 names each refusal; a payload without the required `reason` key breaks the frame's shape (§3.1),
    // and a reason over reasonChars is over a limit (§8): either form refuses, never a response.
    const cases = [
      ['a reject with a blank reason', 'reason-required', () => ({ decision: PROMPT_DECISION.reject, reason: '   ' })],
      ['a reject with an empty reason', 'reason-required', () => ({ decision: PROMPT_DECISION.reject, reason: '' })],
      ['a reject with no reason', null, () => ({ decision: PROMPT_DECISION.reject })],
      ['an allow with no risk', 'risk-required', () => ({ decision: PROMPT_DECISION.allow, reason: 'because' })],
      ['an allow with risk high', 'allow-needs-low-risk', () => ({ decision: PROMPT_DECISION.allow, risk: 'high', reason: 'because' })],
      ['a decision outside allow and reject', 'invalid-decision', () => ({ decision: 'escalate', risk: LOW, reason: 'because' })],
      ['a reason of 501 characters', null, () => ({ decision: PROMPT_DECISION.reject, reason: sizedText(501, tok('r')) })],
    ]
    const unchanged = async () => {
      await reattachIfClosed(ctx)
      assert.equal((await promptOf(ctx, c.text)).closed, false, 'the prompt still shows')
      assert.deepEqual((await promptsOf(ctx, s.c)).map((e) => e.promptId), [c.promptId], 'still listed')
      assert.equal(await managedOf(ctx, s.c), undefined, 'still yours')
      assert.deepEqual(decisions(ctx, c.promptId), [])
    }
    before(async () => { c = await showing(s.c, '05') })
    for (const [label, code, fields] of cases) {
      it(label + (code ? ': ' + code : ': not accepted'), T, async () => {
        const r = await answerPrompt(ctx, s.c, c.promptId, fields())
        try {
          if (code) await assertRefused(ctx, r, code)
          else assertNotAccepted(r)
        } finally { await unchanged() }
      })
    }
    it('an unknown prompt id: expired, and nothing changes', T, async () => {
      const r = await answerPrompt(ctx, s.c, 'prm_nosuchprompt', { decision: PROMPT_DECISION.reject, reason: 'x' })
      try { await assertRefused(ctx, r, 'expired') } finally { await unchanged() }
    })
    after(async () => { await click(ctx, OUTCOME.reject); await ctx.host.call('waitIdle', { sessionId: s.c }) })
  })

  it('APR-06 a second answer to the same prompt is refused and the first outcome stands', T, async () => {
    const d = await showing(s.d, '06')
    const first = await answerPrompt(ctx, s.d, d.promptId, { decision: PROMPT_DECISION.allow, risk: LOW, reason: sizedText(500, d.text) })
    assert.equal(first.type, ENVELOPE.type.response, 'a 500-character reason is accepted: ' + JSON.stringify(first).slice(0, 300))
    await assertRefused(ctx, await answerPrompt(ctx, s.d, d.promptId, { decision: PROMPT_DECISION.reject, reason: 'changed my mind ' + d.text }), 'expired')
    assert.equal((await resultOf(ctx, s.d, d.callId)).text, 'outcome=' + OUTCOME.allow, 'the first outcome stands')
    assert.equal(decisions(ctx, d.promptId).length, 1, 'one decisions row')
  })

  it('APR-07 you click first, then the instance answers: expired, the session is not made managed', T, async () => {
    const e = await showing(s.e, '07')
    await click(ctx, OUTCOME.allow)
    assert.equal((await resultOf(ctx, s.e, e.callId)).text, 'outcome=' + OUTCOME.allow)
    await assertRefused(ctx, await answerPrompt(ctx, s.e, e.promptId, { decision: PROMPT_DECISION.reject, reason: 'late ' + e.text }), 'expired')
    assert.equal(await managedOf(ctx, s.e), undefined)
    assert.deepEqual(decisions(ctx, e.promptId), [])
  })

  it('APR-10 audit: a decisions row answer-prompt by fishball with the prompt id as target, and an approvals row of kind prompt', T, async () => {
    for (const [c, sid, word] of [[allowed, s.a, /allow/i], [rejected, s.b, /reject/i]]) {
      const rows = decisions(ctx, c.promptId)
      assert.equal(rows.length, 1, JSON.stringify(rows))
      assert.deepEqual({ action: rows[0].action, by: rows[0].by, sessionId: rows[0].sessionId }, { action: GRANT_C.action.answerPrompt, by: GRANT_C.by.fishball, sessionId: sid })
      assert.match(JSON.stringify(rows[0].outcome), word)
      assert.ok(Number.isFinite(Date.parse(rows[0].at)))
    }
    assert.equal(decisions(ctx, rejected.promptId)[0].rationale, rejected.reason, 'the reason is recorded')
    const kinds = promptAudit()
    assert.ok(kinds.some((r) => r.record.sessionId === s.a && /allow/i.test(JSON.stringify(r.record.answer))), 'an allow row of kind prompt')
    assert.ok(kinds.some((r) => r.record.sessionId === s.b && /reject/i.test(JSON.stringify(r.record.answer))), 'a reject row of kind prompt')
  })

  it('APR-11 a restart: managed by prompt-answer and the decisions row survive; no prompt is listed', { timeout: 180000 }, async () => {
    const keep = decisions(ctx, allowed.promptId)
    // A prompt showing at the restart: a restart ends turns, so it is not listed afterwards.
    await showing(s.c, '11')
    for (const sid of Object.values(s)) await ctx.host.call('flush', { sessionId: sid })
    await restartGrantStub(ctx)
    assert.equal((await managedOf(ctx, s.a))?.by, GRANT_C.promptManagedBy)
    assert.equal((await managedOf(ctx, s.b))?.by, GRANT_C.promptManagedBy)
    assert.deepEqual(decisions(ctx, allowed.promptId), keep)
    await sleep(GRANT_C.quietMs)
    assert.deepEqual(await listedPrompts(ctx), [], 'a restart ends turns: nothing is showing')
  })

})
