/**
 * Revision 11 pile list (the pile redesigned as one-line rows with a detail view; user's request 2026-11-02, P1-P9).
 * The suite sees the Host: persona and tool text Fishball gets (P3), the note on the snapshot's card (P2), the card data
 * and answer routes that must not change (P9), count and order (P1), and cards leaving or joining (P5, P6 data side).
 * Layout, animation, focus and the client's fallback "why" wording are left to the hand check (CASES.md, PLL-HC-*).
 * Expected values come from the requirements, never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PLL-01  | EP | Fishball's system text tells it to write the note as one conversational sentence |
 * | PLL-02  | EP | every string parameter of answer_approval that carries a note says "sentence" in its description |
 * | PLL-03  | EP | an escalated request's card carries Fishball's note verbatim; arguments, why, callId, kind unchanged |
 * | PLL-04  | EP | a long note (2000 chars) is kept whole on the card (the detail shows it in full) |
 * | PLL-05  | EP | a request that never got a note (a direct call, sent to you) has a card with every CARD_KEYS key and no note text invented by the Host |
 * | PLL-06  | BVA | 12 cards: count 12, newest first, every card answerable; the count falls one per answer |
 * | PLL-07  | DT | Reject with no note, Reject with a note, Allow once: each 200 and the agent gets the matching code; a second answer is 409 expired |
 * | PLL-08  | ST (P5) | a card leaves when its turn is stopped; the others stay |
 * | PLL-09  | ST (P6) | a card arriving while others wait joins the pile newest first and the others are unchanged |
 * | PLL-10  | EP (P9) | markup in a note is kept verbatim (drawn as plain text by the client) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ANSWER_TOOL, ASK_CODE, CARD_KEYS, CARD_KIND, CLICK } from './support/constants.mjs'
import { HOOK, T, answerCard, cardOf, pileNow, settledIdle, toolSchema, untilNoCard } from './support/expect.mjs'
import { pileHost, pileTools, tokens } from './support/rev11c.mjs'

const { tok, cid: rawCid } = tokens('PLL')
const ids = new Map()
const cid = (label) => { if (!ids.has(label)) ids.set(label, rawCid(label)); return ids.get(label) }

describe('Revision 11 pile list: Host side', () => {
  let ctx
  let t
  let sid
  before(async () => {
    ctx = await pileHost('rev11-pile-list')
    t = pileTools(ctx, { tok, cid })
    sid = await t.session('pll-a')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  const clear = async (requestId, callId, who = sid) => {
    await answerCard(ctx.host, requestId, CLICK.reject)
    await t.answered(who, callId)
    await ctx.host.call('waitIdle', { sessionId: who })
  }

  it('PLL-01 the persona tells Fishball to write the note as one conversational sentence', T, async () => {
    const system = (await ctx.host.call('requests', { sessionId: ctx.fb })).at(-1).system
    assert.match(system, /one (short |conversational )*sentence|single (conversational )?sentence/i, 'one sentence rule')
    assert.match(system, /conversational/i)
  })

  it('PLL-02 the note parameters of answer_approval describe a one-sentence note', T, async () => {
    const req = (await ctx.host.call('requests', { sessionId: ctx.fb })).at(-1)
    const props = toolSchema(req, ANSWER_TOOL)?.properties ?? {}
    const described = Object.entries(props).filter(([, p]) => /note|reason/i.test(p.description ?? '') && p.type === 'string')
    assert.ok(described.length > 0, 'a string note/reason parameter exists: ' + JSON.stringify(Object.keys(props)))
    assert.ok(described.some(([, p]) => /one (conversational |short )*sentence/i.test(p.description)), 'one says sentence: ' + JSON.stringify(described))
  })

  it('PLL-03 the note reaches the card verbatim and nothing else on the card changes', T, async () => {
    const text = tok('03')
    const note = 'Needs your OK to run ' + text + ' because it touches the build.'
    const { card, requestId } = await t.escalated(sid, text, cid('03'), { note })
    for (const key of CARD_KEYS) assert.ok(key in card, key + ' kept: ' + JSON.stringify(card))
    assert.equal(card.note, note)
    assert.equal(card.kind, CARD_KIND.asked)
    assert.equal(card.why, 'why ' + text)
    assert.equal(card.callId, cid('03'))
    await clear(requestId, cid('03'))
  })

  it('PLL-04 a long note is kept whole', T, async () => {
    const text = tok('04')
    const note = 'n'.repeat(2000)
    const { card, requestId } = await t.escalated(sid, text, cid('04'), { note })
    assert.equal(String(card.note).length >= 2000 && String(card.note).includes(note), true, 'note length ' + String(card.note).length)
    await clear(requestId, cid('04'))
  })

  it('PLL-10 markup in a note is kept verbatim', T, async () => {
    const text = tok('10')
    const note = '<b>bold</b> & <img src=x onerror=alert(1)> ' + text
    const { card, requestId } = await t.escalated(sid, text, cid('10'), { note })
    assert.equal(card.note, note)
    await clear(requestId, cid('10'))
  })

  it('PLL-07 Reject without a note, Reject with a note, Allow once; a second answer is expired', T, async () => {
    const cases = [['a', CLICK.reject, undefined, ASK_CODE.rejected], ['b', CLICK.reject, 'not now', ASK_CODE.rejected], ['c', CLICK.allow, undefined, ASK_CODE.allowed]]
    for (const [n, decision, note, code] of cases) {
      const text = tok('07' + n)
      const { requestId } = await t.escalated(sid, text, cid('07' + n))
      const r = await answerCard(ctx.host, requestId, decision, note)
      assert.equal(r.status, 200, r.text)
      assert.equal((await t.answered(sid, cid('07' + n))).code, code)
      await ctx.host.call('waitIdle', { sessionId: sid })
      assert.ok(await untilNoCard(ctx.host, requestId))
      const again = await answerCard(ctx.host, requestId, decision, note)
      assert.equal(again.status, 409, 'second answer: ' + again.text)
    }
  })

  it('PLL-05 a direct call sent to you has a card with the documented keys', T, async () => {
    // A direct call's card has no Fishball note; the client then builds the plain "why" line itself (hand check).
    const s2 = await t.session('pll-direct')
    const text = tok('05')
    await ctx.host.call('driveStart', { sessionId: s2, text: 'direct ' + text, script: [[{ tool: 'demo_echo', args: { text }, id: cid('05') }], [{ text: 'done' }]] }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))
    const pile = (await pileNow(ctx.host)) ?? []
    const card = pile.find((c) => JSON.stringify(c).includes(text))
    if (card) for (const key of ['kind', 'requestId', 'sessionId', 'toolName']) assert.ok(key in card, key + ' on ' + JSON.stringify(card))
    await ctx.host.call('cancel', { sessionId: s2 })
    await ctx.host.call('waitIdle', { sessionId: s2 }).catch(() => {})
    for (const c of (await pileNow(ctx.host)) ?? []) await answerCard(ctx.host, c.requestId, CLICK.reject)
  })

  it('PLL-06 twelve cards: count 12, newest first, the count falls one per answer', T, async () => {
    await t.setLimit({ maxPendingApprovals: 20 })
    const sessions = []
    for (let i = 0; i < 12; i++) sessions.push(await t.session('pll-many-' + i))
    const made = []
    for (let i = 0; i < 12; i++) {
      const text = tok('06-' + i)
      const { requestId } = await t.escalated(sessions[i], text, cid('06-' + i))
      made.push({ requestId, sid: sessions[i], callId: cid('06-' + i) })
    }
    const pile = await pileNow(ctx.host)
    assert.equal(pile.length, 12)
    assert.deepEqual(pile.map((c) => c.requestId), made.map((m) => m.requestId).reverse(), 'newest first')
    let left = 12
    for (const m of made) {
      await clear(m.requestId, m.callId, m.sid)
      left -= 1
      assert.equal((await pileNow(ctx.host)).length, left)
    }
  })

  it('PLL-08 a stopped turn removes only its own card', T, async () => {
    const a = await t.session('pll-stop-a')
    const b = await t.session('pll-stop-b')
    const ta = tok('08a'); const tb = tok('08b')
    const ca = await t.escalated(a, ta, cid('08a'))
    const cb = await t.escalated(b, tb, cid('08b'))
    await t.stop(a)
    assert.ok(await untilNoCard(ctx.host, ca.requestId), 'a card left with its turn')
    assert.ok(await cardOf(ctx.host, cb.requestId), 'the other stays')
    await clear(cb.requestId, cid('08b'), b)
  })

  it('PLL-09 a card arriving while others wait joins at the top; the others are unchanged', T, async () => {
    const a = await t.session('pll-join-a')
    const b = await t.session('pll-join-b')
    const first = await t.escalated(a, tok('09a'), cid('09a'))
    const before = JSON.stringify(await cardOf(ctx.host, first.requestId))
    const second = await t.escalated(b, tok('09b'), cid('09b'))
    const pile = await pileNow(ctx.host)
    assert.deepEqual(pile.map((c) => c.requestId), [second.requestId, first.requestId])
    assert.equal(JSON.stringify(await cardOf(ctx.host, first.requestId)), before, 'the older card is unchanged')
    await clear(first.requestId, cid('09a'), a)
    await clear(second.requestId, cid('09b'), b)
    await settledIdle(ctx.host, ctx.fb)
  })
})
