/**
 * Revision 11 rev11c: when a card that went to the user leaves, and the cap, on the H-STUB harness (DESIGN §7a.5
 * "Going off while requests wait", §7a.6 "Leaving", "Cap", "To-you ticket", §9 "Session cards", §11; contract
 * §5.1 (a detach sends a waiting request to its session), §9; slim-native-design §12). "Fishball stopped" and
 * "Permission requests turned off" become "the instance detaches" and "the transport closes": the Permission
 * requests switch is gone (slim §12) and the instance is the only answerer. The card is answered on the session's
 * ask_fishball row (POST /api/fishball/requests/answer, §10e). One host; cases run in order; the restart case is last.
 *
 * Retired:
 * LVE-06: Fishball's own requests (set_plugin_enabled and the other private-tree tools) are deleted with the in-process Fishball (slim-native-design §12); no instance operation files an own permission card
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | LVE-01  | ST (the session's turn is stopped: the Stop button's path) | §7a.6 "Leaving" | the card leaves; a later click answers 409 expired; the other session's card stays |
 * | LVE-02  | ST (Take back while it is a card) | §7a.2, §9 | agent: no-longer-managed + request_id; the card leaves; audit released |
 * | LVE-03  | ST (the instance detaches while it is a card) | §7a.5 "Going off", §7a.6 "To-you ticket" | agent: unavailable; the card leaves; the identical call then goes to the stock prompt, once, with no new offer |
 * | LVE-04  | ST (the transport closes while it is a card; then attached again) | §7a.5, contract §9 | as LVE-03; after a new attach a new request is offered again |
 * | LVE-05 ×3 | BVA (maxPendingApprovals 2: card 1 / card + waiting 2 / third) | §7a.6 "Cap" | the third request: over-capacity at once and the identical call to the stock prompt; after one card is answered a new request is accepted |
 * | LVE-07  | ST (restart with cards) | §7a.6 "Leaving", §9 | no card after the restart; the route answers 409 expired for the old ids; managed status stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DECISION, RISK } from 'fishball-connector/contract'
import { ASK_CODE, AUDIT_ANSWER, CLICK, LIMITS, OUTCOME, PILE_CODE } from './support/constants.mjs'
import { HOOK, T, cardOf, jsonOf, managedEntry, pileNow, resultById, untilNoCard } from './support/expect.mjs'
import { ASK_STUB, askHost, askTools, assertShape, restartAsk, stopAsk, tokens } from './support/instance-stub-ask.mjs'
import { takeBack } from './support/instance-stub.mjs'

const { tok, cid } = tokens('LVE')
/** LVE-05's cap: one card and one request waiting for the instance fill it. */
const CAP = 2

describe('Revision 11 rev11c: cards leave, and the cap', () => {
  let ctx
  let t
  let x
  let y
  let z
  before(async () => {
    ctx = await askHost('rev11c-leave')
    t = askTools(ctx, { tok, cid })
    x = await t.session('lve-x')
    y = await t.session('lve-y')
    z = await t.session('lve-z')
  }, HOOK)
  after(() => stopAsk(ctx), HOOK)

  /** A later click on a card that left answers 409 expired (§10e). */
  async function expiredClick(requestId) {
    const r = await t.click(requestId, CLICK.allow)
    assert.equal(r.status, 409, r.text)
    assert.equal(r.json?.code, PILE_CODE.expired)
  }

  /**
   * The instance goes away (detach or close) while an ask_fishball is a card: the agent gets unavailable, the
   * card leaves, and the identical call the agent then makes shows the session's stock prompt (§7a.5).
   */
  async function goneWhileCard(label, goAway) {
    const text = tok(label)
    const [id, stockId] = [cid(label), cid(label + 'stock')]
    const { requestId } = await t.escalated(x, text, id, { after: [t.call(text, stockId)] })
    await goAway()
    try {
      assertShape(await t.answered(x, id), ASK_CODE.unavailable)
      assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
      await t.waitIdle(x)
      assert.equal((await t.rawResult(x, stockId))?.text, 'outcome=' + OUTCOME.reject, "the stock prompt's answer")
      assert.equal((await t.stockSeen(text)).length, 1, "the call showed the session's own stock prompt, once")
    } finally { await t.reattach() }
    await t.quiet()
    assert.equal((await t.offersFor(text)).length, 0, 'the new attachment is offered nothing for it')
    await expiredClick(requestId)
  }

  it("LVE-01 the session's turn is stopped: its card leaves, the other's stays, and a later click is expired", T, async () => {
    const a = await t.escalated(x, tok('01a'), cid('01a'))
    const b = await t.escalated(y, tok('01b'), cid('01b'))
    await t.stop(x)
    assert.ok(await untilNoCard(ctx.host, a.requestId), "the stopped session's card left")
    assert.ok(await cardOf(ctx.host, b.requestId), "the other session's card stays")
    await expiredClick(a.requestId)
    await t.stop(y)
    assert.ok(await untilNoCard(ctx.host, b.requestId))
    assert.deepEqual(await pileNow(ctx.host), [])
  })

  it('LVE-02 Take back while it is a card: no-longer-managed with the request id; the card leaves', T, async () => {
    const w = await t.session('lve-02')
    const id = cid('02')
    const { requestId } = await t.escalated(w, tok('02'), id)
    assert.equal((await takeBack(ctx.host, w)).status, 200)
    const got = await t.answered(w, id)
    assertShape(got, ASK_CODE.noLongerManaged)
    assert.equal(got.request_id, requestId)
    assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
    await t.waitIdle(w)
    assert.equal(t.auditOf(requestId).at(-1)?.answer, AUDIT_ANSWER.released)
  })

  it("LVE-03 the instance detaches while it is a card: unavailable, the card leaves, the agent's next call prompts in the session", T, () => goneWhileCard('03', () => ctx.stub.detach()))

  it('LVE-04 the transport closes while it is a card: unavailable, the card leaves; attached again, a new request is offered', ASK_STUB.long, async () => {
    await goneWhileCard('04', () => ctx.stub.fireClose())
    const id = cid('04b')
    const offer = await t.waiting(y, tok('04b'), id)
    await t.accepted(y, offer, { decision: DECISION.reject, risk: RISK.high, reason: 'back again' })
    assertShape(await t.answered(y, id), ASK_CODE.rejected)
    await t.waitIdle(y)
  })

  describe('LVE-05 maxPendingApprovals 2', () => {
    const live = new Set()
    before(() => t.setLimit({ maxPendingApprovals: CAP }), HOOK)
    after(async () => {
      for (const sid of live) await t.stop(sid).catch(() => {})
      await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }, HOOK)
    let cardA
    it('a card counts toward the cap, and so does a request still waiting for the instance', T, async () => {
      cardA = await t.escalated(x, tok('05a'), cid('05a'))
      live.add(x)
      await t.waiting(y, tok('05b'), cid('05b'))
      live.add(y)
      assert.equal((await pileNow(ctx.host)).length, 1)
    })
    it('the third request is over-capacity at once, and the identical call goes to the stock prompt', T, async () => {
      const text = tok('05c')
      const [id, stockId] = [cid('05c'), cid('05cstock')]
      const t0 = Date.now()
      const r = await t.withStock(OUTCOME.allow, () => t.run(z, [t.ask({ text }, id, { why: 'why ' + text }), t.call(text, stockId)]))
      assert.ok(Date.now() - t0 < ASK_STUB.atOnceMs, 'at once: ' + (Date.now() - t0) + ' ms')
      assertShape(jsonOf(resultById(r, id)), ASK_CODE.overCapacity)
      await t.expectStock(z, text, stockId, OUTCOME.allow, 0)
    })
    it('after one card is answered a new request is accepted', T, async () => {
      assert.equal((await t.click(cardA.requestId, CLICK.reject)).status, 200)
      await t.waitIdle(x)
      live.delete(x)
      const fresh = await t.escalated(z, tok('05d'), cid('05d'))
      assert.ok(fresh.card, 'accepted: it was offered and became a card')
      live.add(z)
    })
  })

  it('LVE-07 a restart ends the turns: no card, an old id is expired, managed status stays', ASK_STUB.long, async () => {
    const a = await t.escalated(x, tok('07a'), cid('07a'))
    const b = await t.escalated(y, tok('07b'), cid('07b'))
    for (const sid of [x, y, z]) await ctx.host.call('flush', { sessionId: sid })
    await restartAsk(ctx)
    assert.deepEqual(await pileNow(ctx.host), [], 'no session card survives a restart')
    for (const requestId of [a.requestId, b.requestId]) await expiredClick(requestId)
    for (const sid of [x, y]) assert.ok(await managedEntry(ctx.host, sid), sid + ' stays managed')
  })
})
