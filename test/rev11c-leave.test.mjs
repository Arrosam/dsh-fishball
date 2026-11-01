/**
 * Revision 11 rev11c: when a card leaves, and the cap (DESIGN §7a.5 "Going off while requests wait", §7a.6 "Leaving",
 * "Cap", §9 "Session cards", §11; requirements items 16 and the default "Card cap"; decisions Q-r11-release-pile,
 * Q-r11-cap-own). One host; cases run in order; the restart case is last.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | LVE-01  | ST (the session's turn is stopped: the Stop button's path) | the card leaves; a later click answers 409 expired; the other session's card stays |
 * | LVE-02  | ST (Take back while it is a card) | agent: no-longer-managed + request_id; the card leaves; audit released |
 * | LVE-03  | ST (Permission requests turned off while it is a card) | agent: unavailable; the card leaves; the identical call then goes to the stock prompt |
 * | LVE-04  | ST (Fishball stopped while it is a card) | as LVE-03; Fishball live again afterwards |
 * | LVE-05 ×3 | BVA (maxPendingApprovals 2: cards 1 / card + waiting 2 / third) | the third request: over-capacity at once and the identical call to the stock prompt; after one card is answered a new request is accepted |
 * | LVE-06  | BVA (maxPendingApprovals 1 with 1 card, Fishball's own request) | Fishball's tool call returns too-many-waiting at once; the stock prompt is not asked |
 * | LVE-07  | ST (restart with cards) | no card after the restart; the route answers 409 expired for the old ids; managed status stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, ASK_CODE, AUDIT_ANSWER, CLICK, FIXTURE_BUNDLE, LIMITS, OUTCOME, OWN_PLUGINS, STATUS, TOO_MANY_WAITING } from './support/constants.mjs'
import { HOOK, T, answerCard, askStep, auditOf, callStep, cardOf, fishballTool, jsonOf, managedEntry, pileNow, requestMessages, resultById, resultOfCall, setManaged, settledIdle, stockSeen, untilNoCard } from './support/expect.mjs'
import { AT_ONCE_MS, QUIET_MS, boot, pileHost, pileTools, tokens, until } from './support/rev11c.mjs'

const { tok, cid } = tokens('LVE')
const LONG = { timeout: 120000 }

describe('Revision 11 rev11c: cards leave, and the cap', () => {
  let ctx
  let t
  let x
  let y
  let z
  const toggleApprovals = async (on) => {
    const r = await ctx.host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await ctx.host.state()).features?.approvals === on, 10000, 100), 'features.approvals ' + on)
  }
  before(async () => {
    ctx = await pileHost('rev11c-leave')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('lve-x')
    y = await t.session('lve-y')
    z = await t.session('lve-z')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it("LVE-01 the session's turn is stopped: its card leaves, the other's stays, and a later click is expired", T, async () => {
    const a = await t.escalated(x, tok('01a'), cid('01a'))
    const b = await t.escalated(y, tok('01b'), cid('01b'))
    await t.stop(x)
    assert.ok(await untilNoCard(ctx.host, a.requestId), "the stopped session's card left")
    assert.ok(await cardOf(ctx.host, b.requestId), "the other session's card stays")
    const r = await answerCard(ctx.host, a.requestId, CLICK.allow)
    assert.equal(r.status, 409, r.text)
    assert.equal(r.json?.code, 'expired')
    await t.stop(y)
    assert.ok(await untilNoCard(ctx.host, b.requestId))
    assert.deepEqual(await pileNow(ctx.host), [])
  })

  it('LVE-02 Take back while it is a card: no-longer-managed with the request id; the card leaves', T, async () => {
    const w = await t.session('lve-02')
    const id = cid('02')
    const { requestId } = await t.escalated(w, tok('02'), id)
    assert.equal((await setManaged(ctx.host, w, false)).status, 200)
    const got = await t.answered(w, id)
    assert.equal(got.code, ASK_CODE.noLongerManaged)
    assert.equal(got.request_id, requestId)
    assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
    await ctx.host.call('waitIdle', { sessionId: w })
    await settledIdle(ctx.host, ctx.fb)
    assert.equal(auditOf(ctx.home, requestId).at(-1)?.answer, AUDIT_ANSWER.released)
  })

  it('LVE-03 Permission requests turned off while it is a card: unavailable, the card leaves, the agent\'s next call prompts in the session', T, async () => {
    const text = tok('03')
    const [id, stockId] = [cid('03'), cid('03stock')]
    // The agent makes the identical call in the same turn, as the unavailable answer tells it to (a to-you ticket ends with the turn).
    const { requestId } = await t.escalated(x, text, id, { after: [callStep({ text }, stockId)] })
    await toggleApprovals(false)
    try {
      const got = await t.answered(x, id)
      assert.equal(got.code, ASK_CODE.unavailable)
      assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
      await ctx.host.call('waitIdle', { sessionId: x })
      assert.equal((await resultOfCall(ctx.host, x, stockId, 15000))?.text, 'outcome=' + OUTCOME.reject, "the stock prompt's answer")
    } finally { await toggleApprovals(true) }
    assert.equal((await stockSeen(ctx.host, text)).length, 1, "the call showed the session's own stock prompt, once")
    assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 1, 'Fishball took no further step')
  })

  it('LVE-04 Fishball stopped while it is a card: unavailable, the card leaves, Fishball live again afterwards', LONG, async () => {
    const text = tok('04')
    const id = cid('04')
    const { requestId } = await t.escalated(y, text, id)
    const archived = await ctx.host.call('archive', { sessionId: ctx.fb, stopActivity: true })
    assert.equal(archived.ok, true, JSON.stringify(archived))
    try {
      const got = await t.answered(y, id)
      assert.equal(got.code, ASK_CODE.unavailable)
      assert.ok(await untilNoCard(ctx.host, requestId), 'the card left')
      await ctx.host.call('waitIdle', { sessionId: y })
    } finally {
      await ctx.host.call('unarchive', { sessionId: ctx.fb })
      const rec = await ctx.host.post(API.recovery, { action: 'retry' })
      assert.equal(rec.status, 200, rec.text)
      await ctx.host.waitStatus(STATUS.live)
      await settledIdle(ctx.host, ctx.fb)
    }
  })

  describe('LVE-05 maxPendingApprovals 2', () => {
    const live = []
    before(async () => { await t.setLimit({ maxPendingApprovals: 2 }) })
    after(async () => {
      for (const sid of live) await t.stop(sid).catch(() => {})
      await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    })
    let cardA
    it('a card counts toward the cap, and so does a request still waiting for Fishball', T, async () => {
      cardA = await t.escalated(x, tok('05a'), cid('05a'))
      live.push(x)
      await t.waiting(y, tok('05b'), cid('05b'))
      live.push(y)
      assert.equal((await pileNow(ctx.host)).length, 1)
    })
    it('the third request is over-capacity at once, and the identical call goes to the stock prompt', T, async () => {
      const text = tok('05c')
      const [id, stockId] = [cid('05c'), cid('05cstock')]
      const t0 = Date.now()
      const r = await t.withStock(OUTCOME.allow, () => t.run(z, [askStep(t.askArgs({ text }, { why: 'why ' + text }), id), callStep({ text }, stockId)]))
      assert.ok(Date.now() - t0 < AT_ONCE_MS + QUIET_MS, 'at once: ' + (Date.now() - t0) + ' ms')
      assert.equal(jsonOf(resultById(r, id))?.code, ASK_CODE.overCapacity)
      assert.equal(resultById(r, stockId)?.text, 'outcome=' + OUTCOME.allow)
      assert.equal((await stockSeen(ctx.host, text)).length, 1)
    })
    it('after one card is answered a new request is accepted', T, async () => {
      assert.equal((await answerCard(ctx.host, cardA.requestId, CLICK.reject)).status, 200)
      await ctx.host.call('waitIdle', { sessionId: x })
      live.splice(live.indexOf(x), 1)
      const text = tok('05d')
      const fresh = await t.escalated(z, text, cid('05d'))
      assert.ok(fresh.card, 'accepted: it reached Fishball and became a card')
      live.push(z)
    })
  })

  it("LVE-06 maxPendingApprovals 1 with one card: Fishball's own request returns too-many-waiting at once; the stock prompt is not asked", T, async () => {
    await t.setLimit({ maxPendingApprovals: 1 })
    try {
      const card = await t.escalated(x, tok('06'), cid('06'))
      const asked = (await ctx.host.call('approvals', {})).length
      const t0 = Date.now()
      const r = await fishballTool(ctx.host, ctx.fb, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }, OUTCOME.allow)
      assert.ok(Date.now() - t0 < 10000, 'at once')
      assert.ok(r.json?.code === TOO_MANY_WAITING || r.result.text.includes(TOO_MANY_WAITING), 'too-many-waiting: ' + r.result.text.slice(0, 400))
      assert.match(r.result.text, /or withdraw one/i, 'rev11f: the text gains "or withdraw one" (manager decision 2026-11-02)')
      assert.equal((await ctx.host.call('approvals', {})).length, asked, 'DSH was not asked')
      await answerCard(ctx.host, card.requestId, CLICK.reject)
      await ctx.host.call('waitIdle', { sessionId: x })
    } finally { await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default }) }
  })

  it('LVE-07 a restart ends the turns: no card, an old id is expired, managed status stays', LONG, async () => {
    const a = await t.escalated(x, tok('07a'), cid('07a'))
    const b = await t.escalated(y, tok('07b'), cid('07b'))
    for (const sid of [x, y, z]) await ctx.host.call('flush', { sessionId: sid })
    await ctx.host.stop()
    await boot(ctx)
    assert.deepEqual(await pileNow(ctx.host), [], 'no session card survives a restart')
    for (const requestId of [a.requestId, b.requestId]) {
      const r = await answerCard(ctx.host, requestId, CLICK.allow)
      assert.equal(r.status, 409, r.text)
      assert.equal(r.json?.code, 'expired')
    }
    for (const sid of [x, y]) assert.ok(await managedEntry(ctx.host, sid), sid + ' stays managed')
  })
})
