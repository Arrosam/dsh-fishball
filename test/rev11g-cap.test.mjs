/**
 * Revision 11 rev11g (manager's decision, 2026-11-02): Fishball's own request past the card cap returns the same JSON
 * form as its waiting answer: {ok: false, code: 'too-many-waiting', …}, the text keeping "or withdraw one"
 * (DESIGN §7a.6 "Cap", §7a.11; Q-r11-cap-own). Older LVE-06 accepts the code anywhere in the text; this case needs the JSON form.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | CAP-01  | BVA (maxPendingApprovals 1, one card, Fishball's own request) | parsed JSON: ok false, code too-many-waiting; text contains "or withdraw one"; at once; DSH's stock prompt not asked |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { FIXTURE_BUNDLE, LIMITS, OUTCOME, TOO_MANY_WAITING } from './support/constants.mjs'
import { HOOK, T, answerCard, fishballTool } from './support/expect.mjs'
import { pileHost, pileTools, tokens } from './support/rev11c.mjs'

const { tok, cid } = tokens('CAP')

describe('Revision 11 rev11g: too-many-waiting is JSON', () => {
  let ctx
  let t
  before(async () => { ctx = await pileHost('rev11g-cap'); t = pileTools(ctx, { tok, cid }) }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('CAP-01 past the cap Fishball\'s own request answers {ok:false, code:too-many-waiting} with "or withdraw one"', T, async () => {
    const x = await t.session('cap-x')
    await t.setLimit({ maxPendingApprovals: 1 })
    try {
      const card = await t.escalated(x, tok('01'), cid('01'))
      const asked = (await ctx.host.call('approvals', {})).length
      const t0 = Date.now()
      const r = await fishballTool(ctx.host, ctx.fb, 'set_plugin_enabled', { plugin: FIXTURE_BUNDLE.name, on: true }, OUTCOME.allow)
      assert.ok(Date.now() - t0 < 10000, 'at once')
      assert.equal(r.json?.ok, false, r.result.text.slice(0, 400))
      assert.equal(r.json?.code, TOO_MANY_WAITING)
      assert.match(r.result.text, /or withdraw one/i)
      assert.equal((await ctx.host.call('approvals', {})).length, asked, 'DSH was not asked')
      await answerCard(ctx.host, card.requestId, 'reject')
      await ctx.host.call('waitIdle', { sessionId: x })
    } finally { await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default }) }
  })
})
