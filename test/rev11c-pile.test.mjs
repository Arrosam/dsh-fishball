/**
 * Revision 11 rev11c: your pile (DESIGN §14 row rev11c, §7a.6, §9 "Session cards", §10e; requirements items 14, 16).
 * The snapshot's `pile` holds a card per ask_fishball request that is yours (Fishball escalated it, or it timed out);
 * Fishball's fake model escalates from a plan. One host; cases run in order. Expected values come from the
 * requirements and DESIGN (CASES.md "Revision 11 rev11c cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PIL-01  | EP (nothing waiting) | state.pile is an empty array; the SSE stream's frames carry it too |
 * | PIL-02  | EP (three managed sessions escalate) | three cards, newest first, one per session, each with CARD_KEYS; the three agents still wait |
 * | PIL-03  | EP (answering one) | only that card leaves; the others stay and their agents still wait |
 * | PIL-04  | EP (quote + thread + Fishball's note) | the card shows the quoted message's text, the thread so far, Fishball's reason as its note; callId is the running call's |
 * | PIL-05  | BVA (argumentExcerptBytes 16 / default) | cut arguments on the card to at most 16 bytes + an ellipsis; the default shows them whole |
 * | PIL-06  | EP (markup in text) | arguments, reason and note are in the snapshot verbatim (the client draws them as plain text) |
 * | PIL-07  | EP (a direct call sent to you) | rev11e (was: stock prompt only): a card of kind direct and the stock prompt both show; your click in the session clears the card |
 * | PIL-08  | ST (SSE) | a frame holds the card when it appears and a later frame no longer holds it after the answer |
 * | PIL-09 ×4 | BVA (pileMaxHeightVh) | default 45 in state.limits; 1 accepted live; 0, 1.5 refused and unchanged |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, APPROVER_HOLDS, ASK_CODE, ASK_FISHBALL, ASK_TOOL, CARD_KEYS, CARD_KIND, CLICK, DECISION, ELLIPSIS, LIMITS, LIMITS_R11C, OUTCOME, REQUEST_PLACEHOLDER } from './support/constants.mjs'
import { HOOK, T, answerCard, askStep, bytes, callStep, cardArguments, cardOf, jsonOf, pileNow, requestMessages, resultById, settledIdle, untilCard, untilNoCard, waitRequest } from './support/expect.mjs'
import { boot, pileHost, pileTools, tokens, until } from './support/rev11c.mjs'

const { tok, cid } = tokens('PIL')

describe('Revision 11 rev11c: your pile', () => {
  let ctx
  let t
  let x
  let y
  let z
  const cards = {}
  before(async () => {
    ctx = await pileHost('rev11c-pile')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('pile-x')
    y = await t.session('pile-y')
    z = await t.session('pile-z')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('PIL-01 nothing waiting: state.pile is an empty array', T, async () => {
    const s = await ctx.host.state()
    assert.ok(Array.isArray(s.pile), 'pile is an array: ' + JSON.stringify(s.pile))
    assert.deepEqual(s.pile, [])
    const sse = await ctx.host.sse()
    try {
      assert.ok(await until(() => sse.frames.length > 0, 5000, 50), 'a first frame')
      assert.deepEqual(sse.frames[0].pile, [], 'the stream carries the pile')
    } finally { sse.close() }
  })

  it('PIL-02 three managed sessions escalate: three cards, newest first, each with the documented keys; the agents still wait', T, async () => {
    for (const [name, sid] of [['x', x], ['y', y], ['z', z]]) {
      const text = tok('02' + name)
      const callId = cid('02' + name)
      cards[name] = { sid, text, callId, ...(await t.escalated(sid, text, callId)) }
    }
    const pile = await pileNow(ctx.host)
    assert.equal(pile.length, 3, 'three cards: ' + JSON.stringify(pile))
    assert.deepEqual(pile.map((c) => c.requestId), [cards.z.requestId, cards.y.requestId, cards.x.requestId], 'newest first (DESIGN §10e "Order and count")')
    for (const [name, { sid, text, card }] of Object.entries(cards)) {
      const c = await cardOf(ctx.host, card.requestId)
      for (const key of CARD_KEYS) assert.ok(key in c, name + ' card has ' + key + ': ' + JSON.stringify(c))
      assert.equal(c.kind, CARD_KIND.asked)
      assert.equal(c.sessionId, sid)
      assert.equal(c.callId, cards[name].callId, 'the ask_fishball call the running row matches on (S37)')
      assert.equal(c.toolName, ASK_TOOL, 'the tool the agent asks about')
      assert.deepEqual(cardArguments(c), { text }, 'the exact arguments')
      assert.equal(c.why, 'why ' + text, "the agent's reason")
      assert.ok(Number.isFinite(typeof c.since === 'number' ? c.since : Date.parse(c.since)), 'since is a time: ' + c.since)
      assert.equal(await ctx.host.call('agentStatus', { sessionId: sid }), 'running', name + ' still waits')
    }
  })

  it('PIL-03 answering one card: only that card leaves; the others stay and their agents still wait', T, async () => {
    const r = await answerCard(ctx.host, cards.y.requestId, CLICK.reject, 'no thanks')
    assert.equal(r.status, 200, r.text)
    assert.ok(await untilNoCard(ctx.host, cards.y.requestId), 'the answered card left')
    const pile = await pileNow(ctx.host)
    assert.deepEqual(pile.map((c) => c.requestId), [cards.z.requestId, cards.x.requestId])
    const got = await t.answered(y, cards.y.callId)
    assert.equal(got.code, ASK_CODE.rejected)
    await ctx.host.call('waitIdle', { sessionId: y })
    for (const sid of [x, z]) assert.equal(await ctx.host.call('agentStatus', { sessionId: sid }), 'running')
    // Free the other two for the following cases.
    for (const name of ['x', 'z']) {
      assert.equal((await answerCard(ctx.host, cards[name].requestId, CLICK.reject)).status, 200)
      await t.answered(cards[name].sid, cards[name].callId)
      await ctx.host.call('waitIdle', { sessionId: cards[name].sid })
    }
    assert.deepEqual(await pileNow(ctx.host), [])
  })

  it("PIL-04 a card shows the quoted message, the thread and Fishball's note", T, async () => {
    const log = await ctx.host.call('userMessageLog', { sessionId: x })
    const quoted = log.find((m) => m.kind === 'user' && m.text === 'first words')
    assert.ok(quoted?.id, 'precondition: a message to quote')
    const text = tok('04')
    const question = 'question ' + text
    const reply = tok('04reply')
    const [id0, id1] = [cid('04a'), cid('04b')]
    const note = 'fbtest note for ' + text
    await t.plan(text, { decision: DECISION.ask, risk: 'high', reason: 'need more', question })
    await t.plan(reply, { decision: DECISION.escalate, risk: 'high', reason: note })
    await settledIdle(ctx.host, x)
    await ctx.host.call('driveStart', {
      sessionId: x,
      script: [askStep(t.askArgs({ text }, { quote: [quoted.id], why: 'why ' + text }), id0), askStep({ request_id: REQUEST_PLACEHOLDER, reply }, id1), [{ text: 'done' }]],
    })
    const req = await waitRequest(ctx.host, ctx.fb, text)
    const card = await untilCard(ctx.host, req.id, 20000)
    assert.ok(card, 'a card after the second round')
    assert.equal(card.callId, id1, 'the card belongs to the call that is waiting now (the running row with the buttons)')
    assert.ok(JSON.stringify(card.quotes ?? null).includes('first words'), 'the quoted text: ' + JSON.stringify(card.quotes))
    assert.ok(JSON.stringify(card.quotes).includes(quoted.id), 'the quoted id')
    const texts = (card.thread ?? []).map((m) => m.text)
    assert.deepEqual(texts, [question, reply], 'the discussion thread so far, in order: ' + JSON.stringify(card.thread))
    assert.ok(String(card.note ?? '').includes(note), "Fishball's note: " + JSON.stringify(card.note))
    assert.equal((await answerCard(ctx.host, req.id, CLICK.allow)).status, 200)
    assert.equal((await t.answered(x, id1)).code, ASK_CODE.allowed)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('PIL-05 argumentExcerptBytes: a cut card shows at most the limit plus an ellipsis; the default shows the arguments whole', T, async () => {
    const args = { text: tok('05') + 'k'.repeat(200) }
    await t.setLimit({ argumentExcerptBytes: 16 })
    try {
      const { card, requestId } = await t.escalated(x, args.text, cid('05a'))
      assert.equal(typeof card.arguments, 'string', 'a cut excerpt is text: ' + JSON.stringify(card.arguments))
      assert.ok(bytes(card.arguments) <= 16 + bytes(ELLIPSIS), 'at most 16 bytes and an ellipsis: ' + bytes(card.arguments))
      assert.ok(JSON.stringify(args).startsWith(card.arguments.replace(ELLIPSIS, '')), 'a prefix of the real arguments')
      await answerCard(ctx.host, requestId, CLICK.reject)
      await ctx.host.call('waitIdle', { sessionId: x })
    } finally { await t.setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
    const text = tok('05b') + 'k'.repeat(200)
    const { card, requestId } = await t.escalated(x, text, cid('05b'))
    assert.deepEqual(cardArguments(card), { text }, 'whole under the default')
    await answerCard(ctx.host, requestId, CLICK.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it("PIL-06 markup in the arguments, the reason and Fishball's note reaches the snapshot as the same text", T, async () => {
    const mark = '<img src=x onerror=alert(1)>&amp;<b>bold</b>'
    const text = tok('06') + mark
    const { card, requestId } = await t.escalated(x, text, cid('06'), { why: '<script>why()</script>' + mark, note: '<i>note</i>' + mark })
    assert.deepEqual(cardArguments(card), { text })
    assert.equal(card.why, '<script>why()</script>' + mark)
    assert.ok(String(card.note).includes('<i>note</i>' + mark))
    await answerCard(ctx.host, requestId, CLICK.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('PIL-07 a direct call sent to you shows a card AND the stock prompt (changed in rev11e: it was the stock prompt only)', T, async () => {
    // rev11e (DESIGN §7a.6 "Built in rev11e"): the card for a direct call is built with the pass-through. The stock prompt
    // is held here so the card and the prompt can be seen together; rev11e-direct.test.mjs covers the rest.
    const text = tok('07')
    await t.plan(text, { decision: DECISION.escalate, risk: 'high', reason: 'to you' })
    await settledIdle(ctx.host, x)
    const id = cid('07')
    await ctx.host.call('setApprover', { outcome: APPROVER_HOLDS })
    try {
      await ctx.host.call('driveStart', { sessionId: x, script: [callStep({ text }, id), [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, text)
      const card = req && (await untilCard(ctx.host, req.id))
      assert.ok(card, 'a card for the direct call')
      assert.equal(card.kind, CARD_KIND.direct)
      assert.equal((await t.stockSeen(text)).length, 1, 'and the stock prompt')
    } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
    assert.equal(await ctx.host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.deepEqual(await pileNow(ctx.host), [], 'your click in the session cleared the card')
  })

  it('PIL-08 the event stream: a frame holds the card while it waits, and a later frame no longer holds it', T, async () => {
    const sse = await ctx.host.sse()
    try {
      const text = tok('08')
      const { requestId } = await t.escalated(y, text, cid('08'))
      assert.ok(await until(() => sse.frames.some((f) => f.pile?.some((c) => c.requestId === requestId)), 5000, 50), 'a frame with the card')
      const framesBefore = sse.frames.length
      await answerCard(ctx.host, requestId, CLICK.reject)
      assert.ok(await until(() => sse.frames.slice(framesBefore).some((f) => Array.isArray(f.pile) && !f.pile.some((c) => c.requestId === requestId)), 5000, 50), 'a frame without it')
      await ctx.host.call('waitIdle', { sessionId: y })
    } finally { sse.close() }
  })

  describe('PIL-09 pileMaxHeightVh (a limits-form field)', () => {
    const [field, spec] = Object.entries(LIMITS_R11C)[0]
    it('default ' + spec.default + ' in state.limits', T, async () => {
      assert.equal((await ctx.host.state()).limits?.[field], spec.default)
    })
    it('the minimum 1 is accepted and applies live', T, async () => {
      await t.setLimit({ [field]: spec.min })
      try { assert.ok(await until(async () => (await ctx.host.state()).limits?.[field] === spec.min, 5000, 50)) } finally { await t.setLimit({ [field]: spec.default }) }
    })
    for (const [label, bad] of [['0', 0], ['a fraction', 1.5]]) {
      it(label + ' is refused and the value stays', T, async () => {
        const r = await ctx.host.call('settingsUpdate', { patch: { [field]: bad } })
        assert.equal(r.ok, false, JSON.stringify(r))
        assert.equal((await ctx.host.state()).limits?.[field], spec.default)
      })
    }
  })
})
