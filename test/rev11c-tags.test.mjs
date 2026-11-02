/**
 * Revision 11 rev11c: the "Asked Fishball" tags (DESIGN §7a.3 "Tags", §9 "Tag records", §10e; decisions
 * Q-r11-tag-approvals, Q-r11-tag-store, Q-r11-tag-scope, Q-r11-tag-bound, Q-r11-tag-wording). The client draws
 * the tag text in the turn tail from tag records; the Host stores them in the `tags` table of the fishball domain
 * (durable) and publishes them in the snapshot. A record is {sessionId, callId, seq, answer, kind, at}, with kind
 * 'approval' for an answer_approval decision and 'sent-to-you' when Fishball escalates. The tag text and its
 * placement in the turn tail are checked by hand (CASES.md "Not automated"). One host; the restart and the bound last.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | TAG-01  | EP (allow, ask_fishball) | one approval tag for the ask_fishball call: the session, that call id, an integer seq, an answer naming allow, a time |
 * | TAG-02  | EP (reject) | an approval tag whose answer names reject |
 * | TAG-03  | EP (question, then allow in the reply call) | one approval tag per decision: ask for the first call, allow for the reply call |
 * | TAG-04  | EP (escalate) | a 'sent-to-you' tag for the call |
 * | TAG-05  | EP (direct call allowed / rejected) | an approval tag for the direct call's id, answer allow / reject |
 * | TAG-06  | EP (the snapshot) | the snapshot publishes the records of the stored tags |
 * | TAG-07  | BVA (two answers in one session) | seq of the later call is greater than the earlier's |
 * | TAG-08  | EP (no answer) | a request the stopped turn cancelled leaves no tag |
 * | TAG-09  | EP (your own click on a card) | no extra approval tag for it (a tag is Fishball's answer) |
 * | TAG-10  | ST (restart) | the stored tags are still there and the snapshot still publishes them |
 * | TAG-11  | BVA (auditEntriesKept 2, three answers) | at most 2 tag rows; the oldest dropped first; the newest two kept |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_CODE, CLICK, DECISION, LIMITS, TAG_KEYS, TAG_KIND } from './support/constants.mjs'
import { HOOK, T, answerCard, askStep, callStep, jsonOf, resultById, settledIdle, snapshotTags, storedRows, untilNoCard } from './support/expect.mjs'
import { boot, pileHost, pileTools, tokens, until } from './support/rev11c.mjs'

const { tok, cid } = tokens('TAG')

describe('Revision 11 rev11c: tag records', () => {
  let ctx
  let t
  let x
  let y
  const tags = () => storedRows(ctx.home, 'tags')
  const tagFor = (callId) => tags().filter((r) => r.callId === callId)
  const untilTag = (callId, timeoutMs = 8000) => until(() => tagFor(callId)[0] ?? false, timeoutMs, 100)
  /** A planned answer for a request whose notice carries text, given in a turn of the asking session. */
  async function asked(sid, text, id, plan, extra = []) {
    await t.plan(text, plan)
    await settledIdle(ctx.host, sid)
    const r = await t.run(sid, [askStep(t.askArgs({ text }, { why: 'why ' + text }), id), ...extra])
    await settledIdle(ctx.host, ctx.fb)
    return r
  }

  before(async () => {
    ctx = await pileHost('rev11c-tags')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('tag-x')
    y = await t.session('tag-y')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  let allowedCall
  it('TAG-01 allow on an ask_fishball request: an approval tag for that call', T, async () => {
    const text = tok('01')
    allowedCall = cid('01')
    const r = await asked(x, text, allowedCall, { decision: DECISION.allow, risk: 'low', reason: 'fine' })
    assert.equal(jsonOf(resultById(r, allowedCall))?.code, ASK_CODE.allowed)
    const tag = await untilTag(allowedCall)
    assert.ok(tag, 'a tag record: ' + JSON.stringify(tags()))
    for (const key of TAG_KEYS) assert.ok(key in tag, 'tag has ' + key + ': ' + JSON.stringify(tag))
    assert.equal(tag.sessionId, x)
    assert.equal(tag.kind, TAG_KIND.approval)
    assert.ok(Number.isInteger(tag.seq) && tag.seq >= 0, 'seq is a log position: ' + tag.seq)
    assert.match(JSON.stringify(tag.answer), /allow/i)
    assert.ok(Number.isFinite(typeof tag.at === 'number' ? tag.at : Date.parse(tag.at)), 'at is a time: ' + tag.at)
    assert.equal(tagFor(allowedCall).length, 1, 'one tag for one answer')
  })

  it('TAG-02 reject: an approval tag whose answer names reject', T, async () => {
    const id = cid('02')
    await asked(x, tok('02'), id, { decision: DECISION.reject, risk: 'high', reason: 'no ' + id })
    const tag = await untilTag(id)
    assert.equal(tag?.kind, TAG_KIND.approval)
    assert.match(JSON.stringify(tag.answer), /reject/i)
  })

  it('TAG-03 a question round, then allow: a tag for each decision, on its own call', T, async () => {
    const text = tok('03')
    const reply = tok('03reply')
    const [id0, id1] = [cid('03a'), cid('03b')]
    await t.plan(text, { decision: DECISION.ask, risk: 'high', reason: 'need more', question: 'which? ' + text })
    await t.plan(reply, { decision: DECISION.allow, risk: 'low', reason: 'clear now' })
    await settledIdle(ctx.host, x)
    await t.run(x, [askStep(t.askArgs({ text }, { why: 'why ' + text }), id0), askStep({ request_id: '$fbtest:last-request-id', reply }, id1)])
    const [first, second] = [await untilTag(id0), await untilTag(id1)]
    assert.match(JSON.stringify(first?.answer), /ask|question/i)
    assert.match(JSON.stringify(second?.answer), /allow/i)
    assert.ok(first.seq < second.seq, 'the reply call is later in the log')
  })

  it("TAG-04 escalate: a 'sent-to-you' tag for the call", T, async () => {
    const id = cid('04')
    const { requestId } = await t.escalated(y, tok('04'), id)
    const tag = await untilTag(id)
    assert.ok(tagFor(id).some((r) => r.kind === TAG_KIND.sentToYou), 'a sent-to-you tag: ' + JSON.stringify(tagFor(id)))
    assert.equal(tagFor(id)[0].sessionId, y)
    // TAG-09: your own click is not Fishball's answer.
    const before = tagFor(id).length
    assert.equal((await answerCard(ctx.host, requestId, CLICK.reject)).status, 200)
    await t.answered(y, id)
    await ctx.host.call('waitIdle', { sessionId: y })
    assert.equal(tagFor(id).length, before, 'your click adds no tag')
    assert.ok(tag)
  })

  it('TAG-05 a direct call Fishball answers: a tag for the direct call id', T, async () => {
    for (const [label, plan, word] of [['allow', { decision: DECISION.allow, risk: 'low', reason: 'fine' }, /allow/i], ['reject', { decision: DECISION.reject, risk: 'high', reason: 'no' }, /reject/i]]) {
      const text = tok('05' + label)
      const id = cid('05' + label)
      await t.plan(text, plan)
      await settledIdle(ctx.host, y)
      await t.run(y, [callStep({ text }, id)])
      await settledIdle(ctx.host, ctx.fb)
      const tag = await untilTag(id)
      assert.equal(tag?.kind, TAG_KIND.approval, label)
      assert.equal(tag.sessionId, y)
      assert.match(JSON.stringify(tag.answer), word)
    }
  })

  it('TAG-06 the snapshot publishes the stored tag records', T, async () => {
    const published = snapshotTags(await ctx.host.state())
    for (const row of tags()) {
      assert.ok(published.some((p) => p.callId === row.callId && p.sessionId === row.sessionId && p.seq === row.seq && p.kind === row.kind), 'published: ' + JSON.stringify(row))
    }
  })

  it('TAG-07 two answers in one session: the later call has the greater seq', T, async () => {
    const [a, b] = [cid('07a'), cid('07b')]
    await asked(x, tok('07a'), a, { decision: DECISION.reject, risk: 'high', reason: 'no' })
    await asked(x, tok('07b'), b, { decision: DECISION.reject, risk: 'high', reason: 'no' })
    const [ta, tb] = [await untilTag(a), await untilTag(b)]
    assert.ok(ta.seq < tb.seq, ta.seq + ' < ' + tb.seq)
  })

  it('TAG-08 a request cancelled by a stopped turn gets no tag', T, async () => {
    const id = cid('08')
    const requestId = await t.waiting(y, tok('08'), id)
    await t.stop(y)
    await settledIdle(ctx.host, ctx.fb)
    assert.equal(tagFor(id).length, 0, 'no answer, no tag (request ' + requestId + ')')
  })

  it('TAG-10 a restart: the stored tags remain and the snapshot still publishes them', { timeout: 120000 }, async () => {
    const before = tags()
    assert.ok(before.length >= 6, 'precondition: tags stored')
    for (const sid of [x, y]) await ctx.host.call('flush', { sessionId: sid })
    await ctx.host.stop()
    await boot(ctx)
    const after = tags()
    assert.deepEqual(after.map((r) => r.callId).sort(), before.map((r) => r.callId).sort())
    const published = snapshotTags(await ctx.host.state())
    for (const row of before) assert.ok(published.some((p) => p.callId === row.callId && p.seq === row.seq), 'still published: ' + row.callId)
  })

  it('TAG-11 auditEntriesKept 2 with three answers: two rows, the oldest dropped first', { timeout: 120000 }, async () => {
    await ctx.host.call('resume', { sessionId: x }) // the restart above ended the live agents
    await t.setLimit({ auditEntriesKept: 2 })
    try {
      const ids = [cid('11a'), cid('11b'), cid('11c')]
      for (const [i, id] of ids.entries()) {
        await asked(x, tok('11' + i), id, { decision: DECISION.reject, risk: 'high', reason: 'no' })
        assert.ok(await untilTag(id), 'tag ' + i)
      }
      assert.ok(await until(() => tags().length <= 2, 5000, 100), 'at most 2 rows: ' + tags().length)
      assert.deepEqual(tags().map((r) => r.callId).sort(), [ids[1], ids[2]].sort(), 'the newest two')
    } finally { await t.setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })
})
