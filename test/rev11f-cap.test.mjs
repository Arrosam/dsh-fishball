/**
 * Revision 11 rev11f: Fishball's own cards count toward the cap (DESIGN §7a.6 "Cap", §16 Q-r11-cap-own; requirements default
 * "Card cap"). Past `maxPendingApprovals` Fishball's call returns `too-many-waiting` at once, with the text gaining "or withdraw
 * one" (the manager's decision for the user, 2026-11-02), so it never freezes; no card, no stock prompt, no own_requests row.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | CAP-01 | BVA (cap 2: the 1st, 2nd, 3rd own request) | the 1st and 2nd are cards; the 3rd returns too-many-waiting at once with "or withdraw one"; no card, no row, no stock prompt |
 * | CAP-02 | ST (full –withdraw one→ a place) | the next request is a card again |
 * | CAP-03 | ST (full –Allow/Reject a card→) | answering a card frees a place the same way |
 * | CAP-04 | DT (cap 2: one session card + one own card) | both kinds count together: the next own request is refused |
 * | CAP-05 | BVA (default cap 8: the 8th and the 9th) | 8 cards are accepted, the 9th is refused |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE_C, CLICK, LIMITS, OWN_REQUEST, OWN_WITHDRAW_HINT, TOO_MANY_WAITING } from './support/constants.mjs'
import { HOOK, answerCard, pileNow } from './support/expect.mjs'
import { pileTools } from './support/rev11c.mjs'
import { ownCards, ownHost, ownRows, ownTools, tokens } from './support/rev11f.mjs'

const LONG = { timeout: 240000 }
const names = tokens('CAP')

describe('rev11f: Fishball\'s own cards and the cap', () => {
  let ctx
  let t
  const add = (label) => t.add(names.tok(label), ADDED_BUNDLE_C.dir)

  before(async () => {
    ctx = await ownHost('rev11f-cap')
    t = ownTools(ctx, names)
  }, HOOK)
  after(async () => { await ctx?.host?.stop() }, HOOK)

  async function assertRefused(r, label) {
    assert.ok(r.took < 10000, label + ': at once')
    // The refusal may be a JSON answer with the code or plain text carrying it (the builder's choice).
    assert.ok(r.json?.code === TOO_MANY_WAITING || r.result.text.includes(TOO_MANY_WAITING), r.result.text)
    assert.match(r.result.text, OWN_WITHDRAW_HINT)
    assert.equal(r.card, undefined, label + ': no card')
    assert.equal(await t.stockAsked(), 0, label + ': no stock prompt')
  }

  let cards = []
  it('CAP-01 cap 2: two own cards, the third is refused at once with "or withdraw one"', LONG, async () => {
    await t.setLimit({ maxPendingApprovals: 2 })
    for (const label of ['01a', '01b']) {
      const r = await add(label)
      assert.ok(t.isWaiting(r) && r.card, label + ': ' + r.result.text)
      cards.push(r.card)
    }
    const rows = ownRows(ctx.home).length
    await assertRefused(await add('01c'), 'third')
    assert.equal(ownRows(ctx.home).length, rows, 'no own_requests row for the refused call')
    assert.equal((await ownCards(ctx)).length, 2)
  })

  it('CAP-02 withdrawing one frees a place', LONG, async () => {
    await t.withdraw(cards.shift().requestId)
    const r = await add('02')
    assert.ok(t.isWaiting(r) && r.card, r.result.text)
    cards.push(r.card)
    await assertRefused(await add('02x'), 'full again')
  })

  it('CAP-03 answering a card frees a place', LONG, async () => {
    const gone = cards.shift()
    assert.equal((await answerCard(ctx.host, gone.requestId, CLICK.reject)).status, 200)
    const r = await add('03')
    assert.ok(t.isWaiting(r) && r.card, r.result.text)
    cards.push(r.card)
    await t.clearOwn()
    cards = []
  })

  it('CAP-04 one session card and one own card fill a cap of 2', LONG, async () => {
    const p = pileTools(ctx, names)
    const sid = await p.session('cap-s')
    const { requestId } = await p.escalated(sid, names.tok('04s'), names.cid('04s'))
    const r = await add('04a')
    assert.ok(t.isWaiting(r) && r.card, 'the own card fits beside the session card: ' + r.result.text)
    await assertRefused(await add('04b'), 'together they fill the cap')
    assert.equal((await pileNow(ctx.host)).length, 2)
    await t.withdraw(r.card.requestId)
    await answerCard(ctx.host, requestId, CLICK.reject)
    await ctx.host.call('waitIdle', { sessionId: sid })
    await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
  })

  it('CAP-05 the default cap of 8: eight cards, the ninth refused', LONG, async () => {
    for (let i = 1; i <= LIMITS.maxPendingApprovals.default; i++) {
      const r = await add('05-' + i)
      assert.ok(t.isWaiting(r) && r.card, 'card ' + i + ': ' + r.result.text)
    }
    await assertRefused(await add('05-9'), 'ninth')
    await t.clearOwn()
  })
})
