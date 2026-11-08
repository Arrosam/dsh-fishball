/**
 * Revision 11 rev11c: the cards that go to the user, in the snapshot, on the H-STUB harness (DESIGN §7a.6, §9
 * "Session cards", §10e; slim-native-design §12). The pile UI above Fishball's composer is deleted (slim §12: a
 * card that goes to the user is answered in its own session's ask_fishball row, a direct call on DSH's stock
 * prompt), but the snapshot and the event stream keep `pile`, which is what the row's buttons read (§10e: buttons
 * "while the snapshot holds a card for that callId"). The attached instance escalates with `approval.answer`.
 * One host; cases run in order. Expected values come from the requirements and DESIGN.
 *
 * Retired:
 * PIL-09: pileMaxHeightVh went with the pile UI (slim-native-design §12, conn-OQ-20: removed from the connector form)
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | PIL-01  | EP (nothing waiting) | §10e snapshot | state.pile is an empty array; the SSE stream's first frame carries it too |
 * | PIL-02  | EP (three managed sessions escalate) | §9, §10e "Order and count" | three cards, newest first, one per session, each with CARD_KEYS, kind asked, the running call's callId; the three agents still wait |
 * | PIL-03  | EP (answering one) | §7a.6 "Leaving" | only that card leaves; the others stay and their agents still wait |
 * | PIL-04  | EP (quote + thread + the instance's note) | §7a.6, §9 | the card shows the quoted message's text and id, the thread so far, the escalate reason as its note; callId is the call waiting now |
 * | PIL-05  | BVA (argumentExcerptBytes 16 / default) | §16, §9 "arguments (excerpt)" | cut arguments on the card are at most 16 bytes + an ellipsis and a prefix of the real ones; the default shows them whole |
 * | PIL-06  | EP (markup in text) | §10e "plain text" | arguments, reason and note are in the snapshot verbatim |
 * | PIL-07  | EP (a direct call sent to you) | §7a.6 "Both places" (rev11e); slim §8.1, §5.2 `approval.settled` | a card of kind direct and the stock prompt both show; your click in the session clears the card, and the instance is told your decision (approval.settled {decision:'allow', by:'user'}) |
 * | PIL-08  | ST (SSE) | §10e "fed by the state stream" | a frame holds the card when it appears and a later frame no longer holds it after the answer |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DECISION, SETTLED_BY } from 'fishball-connector/contract'
import { APPROVER_HOLDS, ASK_CODE, ASK_TOOL, CARD_KEYS, CARD_KIND, CLICK, ELLIPSIS, LIMITS, OUTCOME, REQUEST_PLACEHOLDER } from './support/constants.mjs'
import { HOOK, T, bytes, cardArguments, cardOf, pileNow, untilCard, untilNoCard } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, assertShape, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { until } from './support/util.mjs'

const { tok, cid } = tokens('PIL')
/** PIL-05: a small excerpt bound and a long argument that exceeds it. */
const EXCERPT_BYTES = 16
const LONG_PAD = 200
/** PIL-06: markup that must reach the snapshot as the same text. */
const MARKUP = '<img src=x onerror=alert(1)>&amp;<b>bold</b>'
/** The SSE waits (the stream sends a frame on each change). */
const SSE_WAIT_MS = 5000
const SSE_POLL_MS = 50

describe('Revision 11 rev11c: the cards that go to you', () => {
  let ctx
  let t
  let x
  let y
  let z
  const cards = {}
  before(async () => {
    ctx = await askHost('rev11c-pile')
    t = askTools(ctx, { tok, cid })
    x = await t.session('pile-x')
    y = await t.session('pile-y')
    z = await t.session('pile-z')
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  /** Reject a card on its row and wait until its session is idle again. */
  async function rejectAndFree(sid, requestId, id) {
    assert.equal((await t.click(requestId, CLICK.reject)).status, 200)
    if (id) await t.answered(sid, id)
    await t.waitIdle(sid)
  }

  it('PIL-01 nothing waiting: state.pile is an empty array', T, async () => {
    const s = await ctx.host.state()
    assert.ok(Array.isArray(s.pile), 'pile is an array: ' + JSON.stringify(s.pile))
    assert.deepEqual(s.pile, [])
    const sse = await ctx.host.sse()
    try {
      assert.ok(await until(() => sse.frames.length > 0, SSE_WAIT_MS, SSE_POLL_MS), 'a first frame')
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
    for (const [name, { sid, text, callId, requestId }] of Object.entries(cards)) {
      const c = await cardOf(ctx.host, requestId)
      for (const key of CARD_KEYS) assert.ok(key in c, name + ' card has ' + key + ': ' + JSON.stringify(c))
      assert.equal(c.kind, CARD_KIND.asked)
      assert.equal(c.sessionId, sid)
      assert.equal(c.callId, callId, 'the ask_fishball call the running row matches on (S37)')
      assert.equal(c.toolName, ASK_TOOL, 'the tool the agent asks about')
      assert.deepEqual(cardArguments(c), { text }, 'the exact arguments')
      assert.equal(c.why, 'why ' + text, "the agent's reason")
      assert.ok(Number.isFinite(typeof c.since === 'number' ? c.since : Date.parse(c.since)), 'since is a time: ' + c.since)
      assert.equal(await t.status(sid), ASK_STUB.running, name + ' still waits')
    }
  })

  it('PIL-03 answering one card: only that card leaves; the others stay and their agents still wait', T, async () => {
    const r = await t.click(cards.y.requestId, CLICK.reject, 'no thanks')
    assert.equal(r.status, 200, r.text)
    assert.ok(await untilNoCard(ctx.host, cards.y.requestId), 'the answered card left')
    assert.deepEqual((await pileNow(ctx.host)).map((c) => c.requestId), [cards.z.requestId, cards.x.requestId])
    assertShape(await t.answered(y, cards.y.callId), ASK_CODE.rejected)
    await t.waitIdle(y)
    for (const sid of [x, z]) assert.equal(await t.status(sid), ASK_STUB.running)
    // Free the other two for the following cases.
    for (const name of ['x', 'z']) await rejectAndFree(cards[name].sid, cards[name].requestId, cards[name].callId)
    assert.deepEqual(await pileNow(ctx.host), [])
  })

  it("PIL-04 a card shows the quoted message, the thread and the instance's note", T, async () => {
    const quoted = (await ctx.host.call('userMessageLog', { sessionId: x })).find((m) => m.kind === 'user' && m.text === 'first words')
    assert.ok(quoted?.id, 'precondition: a message to quote')
    const text = tok('04')
    const question = 'question ' + text
    const reply = tok('04reply')
    const [id0, id1] = [cid('04a'), cid('04b')]
    const note = 'fbtest note for ' + text
    await t.start(x, [t.ask({ text }, id0, { quote: [quoted.id], why: 'why ' + text }), t.reply(REQUEST_PLACEHOLDER, reply, id1)])
    const first = await t.offerFor(text)
    assert.ok(first, 'offered')
    await t.accepted(x, first, { decision: DECISION.ask, question })
    const second = await t.nextOffer(first.approvalId, [first.offerId])
    assert.ok(second, 'the reply was offered')
    await t.accepted(x, second, { decision: DECISION.escalate, reason: note })
    const card = await untilCard(ctx.host, first.approvalId, ASK_STUB.offerWaitMs)
    assert.ok(card, 'a card after the second round')
    assert.equal(card.callId, id1, 'the card belongs to the call that is waiting now (the running row with the buttons)')
    assert.ok(JSON.stringify(card.quotes ?? null).includes('first words'), 'the quoted text: ' + JSON.stringify(card.quotes))
    assert.ok(JSON.stringify(card.quotes).includes(quoted.id), 'the quoted id')
    assert.deepEqual((card.thread ?? []).map((m) => m.text), [question, reply], 'the thread so far, in order: ' + JSON.stringify(card.thread))
    assert.ok(String(card.note ?? '').includes(note), "the instance's note: " + JSON.stringify(card.note))
    assert.equal((await t.click(first.approvalId, CLICK.allow)).status, 200)
    assertShape(await t.answered(x, id1), ASK_CODE.allowed)
    await t.waitIdle(x)
  })

  it('PIL-05 argumentExcerptBytes: a cut card shows at most the limit plus an ellipsis; the default shows the arguments whole', T, async () => {
    const args = { text: tok('05') + 'k'.repeat(LONG_PAD) }
    await t.setLimit({ argumentExcerptBytes: EXCERPT_BYTES })
    try {
      const { card, requestId } = await t.escalated(x, args.text, cid('05a'))
      assert.equal(typeof card.arguments, 'string', 'a cut excerpt is text: ' + JSON.stringify(card.arguments))
      assert.ok(bytes(card.arguments) <= EXCERPT_BYTES + bytes(ELLIPSIS), 'at most ' + EXCERPT_BYTES + ' bytes and an ellipsis: ' + bytes(card.arguments))
      assert.ok(JSON.stringify(args).startsWith(card.arguments.replace(ELLIPSIS, '')), 'a prefix of the real arguments')
      await rejectAndFree(x, requestId)
    } finally { await t.setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
    const text = tok('05b') + 'k'.repeat(LONG_PAD)
    const { card, requestId } = await t.escalated(x, text, cid('05b'))
    assert.deepEqual(cardArguments(card), { text }, 'whole under the default')
    await rejectAndFree(x, requestId)
  })

  it("PIL-06 markup in the arguments, the reason and the instance's note reaches the snapshot as the same text", T, async () => {
    const text = tok('06') + MARKUP
    const why = '<script>why()</script>' + MARKUP
    const note = '<i>note</i>' + MARKUP
    const { card, requestId } = await t.escalated(x, text, cid('06'), { why, note })
    assert.deepEqual(cardArguments(card), { text })
    assert.equal(card.why, why)
    assert.ok(String(card.note).includes(note))
    await rejectAndFree(x, requestId)
  })

  it('PIL-07 a direct call sent to you shows a card AND the stock prompt; your click in the session clears the card', T, async () => {
    // rev11e (DESIGN §7a.6 "Both places"): the stock prompt is held so the card and the prompt can be seen together.
    const text = tok('07')
    let offer
    await ctx.host.call('setApprover', { outcome: APPROVER_HOLDS })
    try {
      await t.start(x, [t.call(text, cid('07'))])
      offer = await t.offerFor(text)
      assert.ok(offer, 'the direct call was offered')
      await t.accepted(x, offer, { decision: DECISION.escalate, reason: 'to you' })
      const card = await untilCard(ctx.host, offer.approvalId)
      assert.ok(card, 'a card for the direct call')
      assert.equal(card.kind, CARD_KIND.direct)
      assert.ok(await until(async () => (await t.stockSeen(text)).length === 1, ASK_STUB.offerWaitMs, SSE_POLL_MS), 'and the stock prompt')
    } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
    assert.equal(await ctx.host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
    await t.waitIdle(x)
    assert.ok(await until(async () => (await pileNow(ctx.host)).length === 0, ASK_STUB.offerWaitMs, SSE_POLL_MS), 'your click in the session cleared the card')
    // slim §8.1: "for escalations — the user's final decision delivered by approval.settled".
    const want = { approvalId: offer.approvalId, decision: DECISION.allow, by: SETTLED_BY.user }
    const settled = await until(async () => (await t.settled(offer.approvalId)).find((p) => p.by === SETTLED_BY.user) ?? false, ASK_STUB.offerWaitMs, SSE_POLL_MS)
    assert.deepEqual(settled || undefined, want, 'the instance is told your decision: ' + JSON.stringify(await t.settled(offer.approvalId)))
  })

  it('PIL-08 the event stream: a frame holds the card while it waits, and a later frame no longer holds it', T, async () => {
    const sse = await ctx.host.sse()
    try {
      const { requestId } = await t.escalated(y, tok('08'), cid('08'))
      assert.ok(await until(() => sse.frames.some((f) => f.pile?.some((c) => c.requestId === requestId)), SSE_WAIT_MS, SSE_POLL_MS), 'a frame with the card')
      const framesBefore = sse.frames.length
      await t.click(requestId, CLICK.reject)
      assert.ok(await until(() => sse.frames.slice(framesBefore).some((f) => Array.isArray(f.pile) && !f.pile.some((c) => c.requestId === requestId)), SSE_WAIT_MS, SSE_POLL_MS), 'a frame without it')
      await t.waitIdle(y)
    } finally { sse.close() }
  })
})
