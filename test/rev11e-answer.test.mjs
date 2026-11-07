/**
 * Revision 11 rev11e: answer_prompt, the fifth way in (DESIGN §7a.3 "Tags", §7a.9, §9 managed / tag / audit /
 * decisions, §10e managed list; requirements items 2 and 20; S33; decisions Q-r11-tag-scope,
 * Q-r11-managed-tag-prompt). Prompts are HELD scripted stock prompts in sessions that are the user's. Fishball
 * lists them (list_frozen_sessions) and answers one (answer_prompt {prompt_id, decision, risk, reason}).
 * One host; cases run in order; the restart case is last.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | APR-01  | EP (allow) | ok; the prompt closes (its signal aborts); the call ran with allowed-once; the turn finishes; the entry left the list |
 * | APR-02  | EP (reject with a reason) | ok; prompt closed; the agent sees the reason and not "the user rejected"; entry gone |
 * | APR-03  | ST (allow → managed) | snapshot managed entry {by: prompt-answer}; the session's last model request lists the three tools (also the step after the answer, same turn); Fishball's result says it is managed; no hand-over note |
 * | APR-04  | ST (reject → managed) | same managed entry and tools after a reject |
 * | APR-05 ×6 | DT (refused answers leave the prompt showing) | reject without a reason / with a blank reason; allow with no reason; allow with risk high; an unknown prompt id; a decision outside allow/reject: each refused; the prompt stays listed and not closed; the session stays yours; no tag, decisions or audit row |
 * | APR-06  | ST (a second answer) | answering the same prompt again is refused ("already answered"); the first outcome stands |
 * | APR-07  | ST (your click first, then Fishball) | refused; the session is not made managed; no tag |
 * | APR-08  | EP (tags) | one tag record per answer: the session, the frozen call's id, kind prompt, an integer seq, a time, an answer naming allow / reject; published in the snapshot; the later answer in the session has the greater seq |
 * | APR-09  | EP (your click) | a prompt you answer yourself leaves no tag |
 * | APR-10  | EP (audit) | one decisions row action answer-prompt by fishball (session, target the prompt id, outcome naming the decision), and approvals audit rows of kind prompt (allow, reject) |
 * | APR-11  | ST (restart) | managed by prompt-answer, the tag and the decisions row survive; no prompt is listed (a restart ends turns) |
 * | APR-12  | EP (the client's tag text) | the client bundle carries "Prompt answered by Fishball" |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ASK_TOOL, DSH_REJECT_WORDS, MANAGED_ENTRY_KEYS, MANAGED_TOOLS, OUTCOME, PROMPT_AUDIT_KIND, PROMPT_DECISION, PROMPT_DECISION_ACTION, PROMPT_MANAGED_BY, PROMPT_MANAGED_LABEL, PROMPT_TAG_KIND, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, approvalAudit, fishballClientBundle, managedItems, setManaged, settledIdle, snapshotTags, storedRows, toolNames } from './support/expect.mjs'
import { boot, entryFor, idOf, pileHost, promptTools, refused, sleep, tokens, yoursSession, QUIET_MS } from './support/rev11e.mjs'

const { tok, cid } = tokens('APR')
const LOW = 'low'

describe('Revision 11 rev11e: answer_prompt', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let p
  const s = {}
  const tags = (sid) => storedRows(ctx.home, 'tags').filter((r) => r.sessionId === sid)
  const promptAudit = () => approvalAudit(ctx.home).filter((r) => r.record.kind === PROMPT_AUDIT_KIND)
  const decisionsFor = (target) => storedRows(ctx.home, 'decisions').filter((d) => d.target === target)
    /** Show a prompt in sid and return its listed prompt id. */
  async function showing(sid, label) {
    const text = tok(label)
    const callId = cid(label)
    await p.show(sid, text, callId)
    const e = entryFor((await p.frozen()).entries, text)
    assert.ok(e, 'listed')
    return { text, callId, promptId: idOf(e) }
  }
  const lastTools = async (sid) => toolNames((await ctx.host.call('requests', { sessionId: sid })).at(-1))

  before(async () => {
    ctx = await pileHost('rev11e-answer')
    p = promptTools(ctx, { tok, cid })
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) s[n] = await yoursSession(ctx, 'apr-' + n)
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  let allowed
  it('APR-01 allow: the prompt closes, the call runs, the turn finishes, the entry leaves the list', T, async () => {
    allowed = await showing(s.a, '01')
    const [seen] = await p.prompts(allowed.text)
    assert.equal(seen.closed, false, 'showing')
    const r = await p.answerPrompt({ prompt_id: allowed.promptId, decision: PROMPT_DECISION.allow, risk: LOW, reason: 'the user asked for it ' + allowed.text })
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.equal((await p.prompts(allowed.text))[0].closed, true, 'the prompt closed')
    assert.equal((await p.result(s.a, allowed.callId)).text, 'outcome=' + OUTCOME.allow, 'the call ran')
    assert.equal(await p.held(), 0)
    assert.equal(entryFor((await p.frozen()).entries, allowed.text), undefined)
    allowed.json = r.json
  })

  let rejected
  it('APR-02 reject: the prompt closes and the agent sees the reason, not "the user rejected"', T, async () => {
    rejected = await showing(s.b, '02')
    const reason = 'this writes outside the workspace ' + rejected.text
    const r = await p.answerPrompt({ prompt_id: rejected.promptId, decision: PROMPT_DECISION.reject, reason })
    assert.equal(r.json?.ok, true, r.result?.text)
    assert.equal((await p.prompts(rejected.text))[0].closed, true)
    const got = await p.result(s.b, rejected.callId)
    assert.ok(got.text.includes(reason), 'the agent sees the reason: ' + got.text)
    assert.equal(got.text.includes(DSH_REJECT_WORDS), false, got.text)
    assert.equal(entryFor((await p.frozen()).entries, rejected.text), undefined)
    rejected.json = r.json
  })

  // Done-when: "its next model request has the three tools". The request that follows the answered call in the same
  // turn is the next one (as a hand-over mid-turn gives the tools from the next step, MGD-15).
  // These run before APR-03 and APR-04, which drive further turns, so the session's last request is still the same turn's.
  for (const [id, name] of [['APR-03b', 'a'], ['APR-04b', 'b']]) {
    it(id + ' the model request after the answered call, in the same turn, already has the three tools', T, async () => {
      for (const tool of MANAGED_TOOLS) assert.ok((await lastTools(s[name])).includes(tool), 'the turn\'s last request has ' + tool)
    })
  }

  it('APR-03 an allow makes the session managed: entry by prompt-answer, the three tools, Fishball told, no hand-over note', T, async () => {
    const e = await p.managed(s.a)
    assert.ok(e, 'managed: ' + JSON.stringify(await ctx.host.state().then((st) => st.managed)))
    assert.deepEqual(Object.keys(e).sort(), MANAGED_ENTRY_KEYS)
    assert.equal(e.by, PROMPT_MANAGED_BY)
    assert.ok(Number.isFinite(typeof e.since === 'number' ? e.since : Date.parse(e.since)))
    assert.match(JSON.stringify(allowed.json), /managed/i, "Fishball's result says the session is managed: " + JSON.stringify(allowed.json))
    assert.deepEqual(await managedItems(ctx.host, s.a), [], 'no note beyond the tool result (Fishball\'s own actions send none)')
    // The next turn also has them.
    const r = await ctx.host.call('drive', { sessionId: s.a, script: [[{ text: 'next' }]], text: 'again' })
    for (const tool of MANAGED_TOOLS) assert.ok(toolNames(r.requests.at(-1)).includes(tool), tool)
  })

  it('APR-04 a reject also makes the session managed, with the three tools at its next turn', T, async () => {
    const e = await p.managed(s.b)
    assert.equal(e?.by, PROMPT_MANAGED_BY)
    assert.match(JSON.stringify(rejected.json), /managed/i)
    const r = await ctx.host.call('drive', { sessionId: s.b, script: [[{ text: 'next' }]], text: 'again' })
    for (const tool of MANAGED_TOOLS) assert.ok(toolNames(r.requests.at(-1)).includes(tool), tool)
  })

  describe('APR-05 refused answers leave the prompt showing and the session yours', () => {
    let c
    const cases = [
      ['a reject with no reason', (id) => ({ prompt_id: id, decision: PROMPT_DECISION.reject })],
      ['a reject with a blank reason', (id) => ({ prompt_id: id, decision: PROMPT_DECISION.reject, reason: '   ' })],
      ['an allow with no reason', (id) => ({ prompt_id: id, decision: PROMPT_DECISION.allow, risk: LOW })],
      ['an allow with risk high', (id) => ({ prompt_id: id, decision: PROMPT_DECISION.allow, risk: 'high', reason: 'because' })],
      ['a decision outside allow and reject', (id) => ({ prompt_id: id, decision: 'escalate', risk: LOW, reason: 'because' })],
    ]
    before(async () => { c = await showing(s.c, '05') })
    for (const [label, args] of cases) {
      it(label, T, async () => {
        const r = await p.answerPrompt(args(c.promptId))
        assert.ok(refused(r), 'refused: ' + r.result?.text)
        assert.equal((await p.prompts(c.text))[0].closed, false, 'the prompt still shows')
        assert.ok(entryFor((await p.frozen()).entries, c.text), 'still listed')
        assert.equal(await p.managed(s.c), undefined, 'still yours')
        assert.deepEqual(decisionsFor(c.promptId), [])
        assert.deepEqual(tags(s.c), [])
      })
    }
    it('an unknown prompt id is refused and nothing changes', T, async () => {
      const r = await p.answerPrompt({ prompt_id: 'prm_nosuchprompt', decision: PROMPT_DECISION.reject, reason: 'x' })
      assert.ok(refused(r), r.result?.text)
      assert.equal((await p.prompts(c.text))[0].closed, false)
    })
    after(async () => { await p.click(OUTCOME.reject); await ctx.host.call('waitIdle', { sessionId: s.c }) })
  })

  it('APR-06 a second answer to the same prompt is refused and the first outcome stands', T, async () => {
    const d = await showing(s.d, '06')
    const first = await p.answerPrompt({ prompt_id: d.promptId, decision: PROMPT_DECISION.allow, risk: LOW, reason: 'fine ' + d.text })
    assert.equal(first.json?.ok, true, first.result?.text)
    const second = await p.answerPrompt({ prompt_id: d.promptId, decision: PROMPT_DECISION.reject, reason: 'changed my mind ' + d.text })
    assert.ok(refused(second), 'refused: ' + second.result?.text)
    assert.match(second.result?.text ?? '', /already|expired/i)
    assert.equal((await p.result(s.d, d.callId)).text, 'outcome=' + OUTCOME.allow, 'the first outcome stands')
    assert.equal(tags(s.d).filter((t) => t.callId === d.callId).length, 1, 'one tag')
    assert.equal(decisionsFor(d.promptId).length, 1, 'one decisions row')
    d.done = true
  })

  it('APR-07 you click first, then Fishball answers: refused, the session is not made managed, no tag', T, async () => {
    const e = await showing(s.e, '07')
    await p.click(OUTCOME.allow)
    assert.equal((await p.result(s.e, e.callId)).text, 'outcome=' + OUTCOME.allow)
    const r = await p.answerPrompt({ prompt_id: e.promptId, decision: PROMPT_DECISION.reject, reason: 'late ' + e.text })
    assert.ok(refused(r), r.result?.text)
    assert.equal(await p.managed(s.e), undefined)
    assert.deepEqual(tags(s.e), [], 'a prompt you answered yourself leaves no tag (APR-09)')
    assert.deepEqual(decisionsFor(e.promptId), [])
  })

  it('APR-08 each answer leaves a tag: session, call id, kind prompt, seq, time, an answer naming the decision; published; later is greater', T, async () => {
    const aTag = tags(s.a).find((t) => t.callId === allowed.callId)
    const bTag = tags(s.b).find((t) => t.callId === rejected.callId)
    for (const [tag, sid, word] of [[aTag, s.a, /allow/i], [bTag, s.b, /reject/i]]) {
      assert.ok(tag, 'a tag record for the frozen call')
      assert.equal(tag.kind, PROMPT_TAG_KIND)
      assert.equal(tag.sessionId, sid)
      assert.ok(Number.isInteger(tag.seq))
      assert.ok(Number.isFinite(typeof tag.at === 'number' ? tag.at : Date.parse(tag.at)))
      assert.match(JSON.stringify(tag.answer), word)
    }
    const published = snapshotTags(await ctx.host.state())
    assert.ok(published.some((t) => t.callId === allowed.callId && t.kind === PROMPT_TAG_KIND), 'published in the snapshot')
    // Two answers in one session: the later call has the greater seq (f gets two prompts one after the other).
    const one = await showing(s.f, '08a')
    assert.equal((await p.answerPrompt({ prompt_id: one.promptId, decision: PROMPT_DECISION.allow, risk: LOW, reason: 'ok ' + one.text })).json?.ok, true)
    await p.result(s.f, one.callId)
    // The session is managed now; give it back so its next prompt is a prompt that is already showing again.
    assert.equal((await setManaged(ctx.host, s.f, false)).status, 200)
    await settledIdle(ctx.host, ctx.fb)
    const two = await showing(s.f, '08b')
    assert.equal((await p.answerPrompt({ prompt_id: two.promptId, decision: PROMPT_DECISION.reject, reason: 'no ' + two.text })).json?.ok, true)
    await p.result(s.f, two.callId)
    const [t1, t2] = [tags(s.f).find((t) => t.callId === one.callId), tags(s.f).find((t) => t.callId === two.callId)]
    assert.ok(t1 && t2, 'both tagged')
    assert.ok(t2.seq > t1.seq, 'seq grows: ' + t1.seq + ' < ' + t2.seq)
  })

  it('APR-10 audit: a decisions row answer-prompt by fishball with the prompt id as target, and an approvals row of kind prompt', T, async () => {
    for (const [c, sid, word] of [[allowed, s.a, /allow/i], [rejected, s.b, /reject/i]]) {
      const rows = decisionsFor(c.promptId)
      assert.equal(rows.length, 1, JSON.stringify(rows))
      assert.equal(rows[0].action, PROMPT_DECISION_ACTION)
      assert.equal(rows[0].by, 'fishball')
      assert.equal(rows[0].sessionId, sid)
      assert.match(JSON.stringify(rows[0].outcome), word)
      assert.ok(Number.isFinite(typeof rows[0].at === 'number' ? rows[0].at : Date.parse(rows[0].at)))
    }
    // DESIGN §9 (manager's decision, 2026-11-02): an answer also writes an approvals audit row of kind 'prompt'.
    const kinds = promptAudit()
    assert.ok(kinds.length >= 2, 'approvals rows of kind prompt: ' + kinds.length)
    assert.ok(kinds.some((r) => /allow/i.test(JSON.stringify(r.record.answer))), 'an allow row')
    assert.ok(kinds.some((r) => /reject/i.test(JSON.stringify(r.record.answer))), 'a reject row')
  })

  it('APR-12 the client bundle carries the approved tag "Prompt answered by Fishball"', T, async () => {
    const bundle = await fishballClientBundle(ctx.host)
    assert.ok(bundle.found, 'client bundle served')
    assert.ok(bundle.text.includes(PROMPT_MANAGED_LABEL))
  })

  it('APR-11 a restart: managed by prompt-answer, the tag and the decisions row survive; no prompt is listed', { timeout: 120000 }, async () => {
    const keep = { tag: tags(s.a).find((t) => t.callId === allowed.callId), dec: decisionsFor(allowed.promptId) }
    for (const sid of Object.values(s)) await ctx.host.call('flush', { sessionId: sid })
    await ctx.host.stop()
    await boot(ctx)
    assert.equal((await p.managed(s.a))?.by, PROMPT_MANAGED_BY)
    assert.equal((await p.managed(s.b))?.by, PROMPT_MANAGED_BY)
    assert.deepEqual(tags(s.a).find((t) => t.callId === allowed.callId), keep.tag)
    assert.deepEqual(decisionsFor(allowed.promptId), keep.dec)
    await sleep(QUIET_MS)
    assert.deepEqual((await p.frozen()).entries, [], 'a restart ends turns: nothing is showing')
  })
})
