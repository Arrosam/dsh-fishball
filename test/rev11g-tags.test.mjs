/**
 * Revision 11 rev11g: tags for questions and plan reviews (requirements item 27; DESIGN §7a.10 "Tags", §9 "Tag
 * records", §10e "Every tag"; decisions Q-r11-tag-approvals, Q-r11-question-tag, Q-r11-tag-store, Q-r11-tag-bound). A tag
 * record {sessionId, callId, seq, answer, kind, at} is stored per answer Fishball gives and published in the snapshot;
 * kind is `question` or `plan-review`; `seq` is the position of the `tool/call` event in the session log, which is how
 * the client places the tag in the turn tail (never on the question row). A legacy question names no call, so the
 * call id must be recovered from the log. The tag text and its place in the turn tail are checked by hand
 * (CASES.md "Not automated"). One host; the bound case is last.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | QTG-01  | EP (legacy question, Fishball answers) | one question tag: the session, the call id the model used, an integer seq pointing at that tool/call, the answer naming the choice, a time |
 * | QTG-02  | EP (plan review approved / kept with feedback) | plan-review tags: answer names approve / the feedback |
 * | QTG-03  | ST (two turns, one question each) | each tag's seq lies inside its own turn (between the turn's start and end) and points at its own tool/call |
 * | QTG-04  | EP (two parallel legacy calls with different question ids) | each answer's tag carries its own call id |
 * | QTG-05  | EP (timed question, Fishball answers) | a tag with the call id in the request |
 * | QTG-06  | EP (no Fishball answer) | you answer in the session, you answer on the card, the turn is stopped, Fishball's answer refused: none leaves a tag |
 * | QTG-07  | EP (tag stays off the question) | the call's result is exactly the answer batch; no log entry of the session mentions the tag; the snapshot publishes the record |
 * | QTG-08  | BVA (auditEntriesKept 2, three answers) | at most 2 rows, the newest kept |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { LIMITS, PRESET, QUESTION_TAG_KIND, TAG_KEYS } from './support/constants.mjs'
import { HOOK, T, settledIdle, snapshotTags, step, storedRows } from './support/expect.mjs'
import { A, Q, cardId, qHost, qTools, refused, resultText, sleep, tokens, until } from './support/rev11g.mjs'

const { tok, cid } = tokens('QTG')

describe('Revision 11 rev11g: question and plan-review tags', () => {
  let ctx
  let q
  let x
  let y
  before(async () => {
    ctx = await qHost('rev11g-tags')
    q = qTools(ctx, { tok, cid })
    x = await q.session('qtg-x', PRESET.standard)
    y = await q.session('qtg-y', PRESET.askTimed)
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  /** Position of the first event of this call in the session log, and the turn's first and last position around it. */
  async function placeOf(sid, callId) {
    const events = await q.allEvents(sid)
    const pos = (e, i) => e.seq ?? i
    const call = events.findIndex((e) => e.type === 'tool/call' && e.callId === callId)
    const starts = events.map((e, i) => [e, i]).filter(([e]) => e.type === 'user/message' && e.source?.kind !== 'user-question-reply')
    const start = starts.filter(([, i]) => i < call).at(-1)
    const end = events.map((e, i) => [e, i]).find(([e, i]) => e.type === 'turn/end' && i > call)
    return { call: pos(events[call], call), callIndex: call, start: start ? pos(start[0], start[1]) : undefined, end: end ? pos(end[0], end[1]) : undefined, events }
  }

  it('QTG-01 a legacy question Fishball answered: a question tag on the call the model used', T, async () => {
    const text = tok('01')
    const id = cid('01')
    await q.planAnswer(text, { answers: A.single })
    await q.ask(x, text, id, { waitCard: false })
    assert.equal((await q.result(x, id)).text, resultText(A.single))
    const tag = await q.untilTag(id)
    assert.ok(tag, 'a tag record: ' + JSON.stringify(storedRows(ctx.home, 'tags')))
    for (const key of TAG_KEYS) assert.ok(key in tag, 'has ' + key)
    assert.equal(tag.kind, QUESTION_TAG_KIND.question)
    assert.equal(tag.sessionId, x)
    assert.ok(Number.isInteger(tag.seq))
    // The stored record holds no answer text (DESIGN §9 "never stored", the user's confirmed reading); the page reads Fishball's answer from the log.
    assert.equal(tag.answer, 'answer')
    assert.ok(Number.isFinite(typeof tag.at === 'number' ? tag.at : Date.parse(tag.at)))
    assert.equal(q.tagsOf(id).length, 1)
    const place = await placeOf(x, id)
    assert.equal(tag.seq, place.call, 'seq is the position of that tool/call event')
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('QTG-02 plan reviews: approve and keep planning with feedback', T, async () => {
    const [ta, tb] = [tok('02a'), tok('02b')]
    const [ia, ib] = [cid('02a'), cid('02b')]
    await q.planAnswer(ta, { approve: true })
    await q.plan(x, ta, ia)
    await q.result(x, ia)
    await ctx.host.call('waitIdle', { sessionId: x })
    const feedback = 'smaller steps ' + tb
    await q.planAnswer(tb, { feedback })
    await q.plan(x, tb, ib)
    await q.result(x, ib)
    await ctx.host.call('waitIdle', { sessionId: x })
    const [a, b] = [await q.untilTag(ia), await q.untilTag(ib)]
    assert.equal(a?.kind, QUESTION_TAG_KIND.planReview)
    assert.match(JSON.stringify(a.answer), /approve/i)
    assert.equal(b?.kind, QUESTION_TAG_KIND.planReview)
    assert.match(JSON.stringify(b.answer), /keep/i, 'keep planning (the record holds no feedback text): ' + JSON.stringify(b.answer))
    await q.planOff(x)
  })

  it('QTG-03 two turns with one question each: each tag lies in its own turn and points at its own tool/call', T, async () => {
    const ids = []
    for (const label of ['03a', '03b']) {
      const text = tok(label)
      ids.push(cid(label))
      await q.planAnswer(text, { answers: A.single })
      await q.ask(y, text, ids.at(-1), { waitCard: false })
      await q.result(y, ids.at(-1))
      await ctx.host.call('waitIdle', { sessionId: y })
    }
    const [ta, tb] = [await q.untilTag(ids[0]), await q.untilTag(ids[1])]
    assert.ok(ta && tb)
    const [pa, pb] = [await placeOf(y, ids[0]), await placeOf(y, ids[1])]
    assert.ok(pa.start <= ta.seq && ta.seq < pa.end, `turn A [${pa.start}, ${pa.end}) holds ${ta.seq}`)
    assert.ok(pb.start <= tb.seq && tb.seq < pb.end, `turn B [${pb.start}, ${pb.end}) holds ${tb.seq}`)
    assert.ok(pa.end <= pb.start, 'the turns are apart')
    assert.equal(ta.seq, pa.call)
    assert.equal(tb.seq, pb.call)
  })

  it('QTG-04 two parallel legacy calls with different question ids: each tag carries its own call id', T, async () => {
    const [ta, tb] = [tok('04a'), tok('04b')]
    const [ia, ib] = [cid('04a'), cid('04b')]
    const qa = [{ id: 'colorA', question: 'Which colour? ' + ta, options: [{ label: 'Red' }, { label: 'Blue' }] }]
    const qb = [{ id: 'sizeB', question: 'Which size? ' + tb, options: [{ label: 'S' }, { label: 'M' }] }]
    await settledIdle(ctx.host, x)
    await q.planAnswer(ta, { answers: [{ id: 'colorA', selected: ['Red'] }] })
    await q.planAnswer(tb, { answers: [{ id: 'sizeB', selected: ['M'] }] })
    await ctx.host.call('driveStart', { sessionId: x, text: 'two at once', script: [[{ tool: 'ask_user_question', args: { questions: qa }, id: ia }, { tool: 'ask_user_question', args: { questions: qb }, id: ib }], [{ text: 'done' }]] })
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.equal((await q.result(x, ia))?.text, resultText([{ id: 'colorA', selected: ['Red'] }]))
    assert.equal((await q.result(x, ib))?.text, resultText([{ id: 'sizeB', selected: ['M'] }]))
    const [a, b] = [await q.untilTag(ia), await q.untilTag(ib)]
    assert.ok(a && b, 'a tag for each call: ' + JSON.stringify(storedRows(ctx.home, 'tags').slice(-3)))
    const published = snapshotTags(await ctx.host.state())
    assert.match(JSON.stringify(published.find((p) => p.callId === ia)), /Red/, 'the published tag carries Fishball\'s words, read from the log')
    assert.match(JSON.stringify(published.find((p) => p.callId === ib)), /\bM\b/)
    assert.equal(a.answer, 'answer')
    assert.notEqual(a.seq, b.seq)
  })

  it('QTG-05 a timed question Fishball answered: a tag on the call in the request', T, async () => {
    const text = tok('05')
    const id = cid('05')
    await q.planAnswer(text, { answers: A.single })
    await q.ask(y, text, id, { waitCard: false })
    await q.result(y, id)
    assert.equal((await q.untilTag(id))?.kind, QUESTION_TAG_KIND.question)
    await ctx.host.call('waitIdle', { sessionId: y })
  })

  it('QTG-06 answers that are not Fishball\'s leave no tag', T, async () => {
    const calls = []
    // you in the session
    let text = tok('06a'); calls.push(cid('06a'))
    await q.ask(x, text, calls.at(-1))
    await ctx.host.call('qAnswer', { sessionId: x, answers: A.single })
    await q.result(x, calls.at(-1)); await ctx.host.call('waitIdle', { sessionId: x })
    // you on the pile card
    await q.t.setLimit({ approvalAnswerSeconds: 1 })
    try {
      text = tok('06b'); calls.push(cid('06b'))
      await q.ask(x, text, calls.at(-1))
      const card = await q.pileCard(x, 8000)
      await q.route({ questionId: cardId(card), answers: A.single })
      await q.result(x, calls.at(-1)); await ctx.host.call('waitIdle', { sessionId: x })
      // stopped turn, then Fishball's late answer
      text = tok('06c'); calls.push(cid('06c'))
      await q.ask(x, text, calls.at(-1))
      const qid = await q.questionId(text)
      await q.stop(x)
      assert.equal(refused(await q.fbAnswer({ question_id: qid, answers: A.single })), true)
    } finally { await q.t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
    await sleep(500)
    for (const id of calls) assert.equal(q.tagsOf(id).length, 0, id)
  })

  it('QTG-07 the tag is not on the question: the result is exactly the batch; no log entry mentions it; the snapshot publishes the record', T, async () => {
    const text = tok('07')
    const id = cid('07')
    await q.planAnswer(text, { answers: A.mixed })
    await q.ask(x, text, id, { questions: Q.mixed(text), waitCard: false })
    const got = await q.result(x, id)
    assert.equal(got.text, resultText(A.mixed))
    await ctx.host.call('waitIdle', { sessionId: x })
    const tag = await q.untilTag(id)
    assert.ok(tag)
    const logged = (await q.allEvents(x)).filter((e) => JSON.stringify(e).includes('Asked Fishball'))
    assert.deepEqual(logged, [], 'the session\'s own log carries no tag text')
    const published = snapshotTags(await ctx.host.state())
    assert.ok(published.some((p) => p.callId === id && p.seq === tag.seq && p.kind === tag.kind && p.sessionId === x), 'published')
  })

  it('QTG-08 auditEntriesKept 2 with three answers: two rows, the newest kept', { timeout: 120000 }, async () => {
    await q.t.setLimit({ auditEntriesKept: 2 })
    try {
      const ids = [cid('08a'), cid('08b'), cid('08c')]
      for (const [i, id] of ids.entries()) {
        const text = tok('08' + i)
        await q.planAnswer(text, { answers: A.single })
        await q.ask(x, text, id, { waitCard: false })
        await q.result(x, id)
        await ctx.host.call('waitIdle', { sessionId: x })
        assert.ok(await q.untilTag(id), 'tag ' + i)
      }
      assert.ok(await until(() => storedRows(ctx.home, 'tags').length <= 2, 5000, 100), 'at most 2 rows: ' + storedRows(ctx.home, 'tags').length)
      assert.deepEqual(storedRows(ctx.home, 'tags').map((r) => r.callId).sort(), [ids[1], ids[2]].sort())
    } finally { await q.t.setLimit({ auditEntriesKept: LIMITS.auditEntriesKept.default }) }
  })
})
