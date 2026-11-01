/**
 * Revision 11 rev11b regression, added with rev11d (the manager's decision of 2026-11-02, DESIGN §7a.3 table:
 * `escalate` has code rules "None: any request can go to you"). answer_approval with decision escalate and no
 * `risk` and no `reason` is accepted, and the request goes to the user (a card in the pile; the agent keeps
 * waiting; your Allow once lets it run).
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | REG-01  | DT (escalate without risk or reason) | ok true, decision escalate; a card; the agent keeps waiting; no stock prompt; audit escalate; your Allow once → allowed |
 * | REG-02  | DT (escalate with an empty reason and risk) | same (the older ASK-04 shape stays accepted) |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_CODE, AUDIT_ANSWER, CLICK, DECISION } from './support/constants.mjs'
import { HOOK, T, answerCard, askStep, auditOf, cardOf, settledIdle, stockSeen, untilCard } from './support/expect.mjs'
import { pileHost, pileTools, tokens } from './support/rev11c.mjs'

const { tok, cid } = tokens('REG')

describe('Revision 11 rev11b regression: escalate needs no risk or reason', () => {
  let ctx
  let t
  let x
  before(async () => {
    ctx = await pileHost('rev11d-regress')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('reg-x')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  for (const [id, label, args] of [
    ['REG-01', 'no risk and no reason', {}],
    ['REG-02', 'an empty reason', { risk: 'high', reason: '' }],
  ]) {
    it(id + ' escalate with ' + label + ' is accepted and the request goes to you', T, async () => {
      const text = tok(id)
      const callId = cid(id)
      const requestId = await t.waiting(x, text, callId)
      const j = await t.answer(requestId, { decision: DECISION.escalate, ...args })
      if (j.ok !== true) await t.stop(x)
      assert.equal(j.ok, true, JSON.stringify(j))
      assert.equal(j.decision, DECISION.escalate, JSON.stringify(j))
      const card = await untilCard(ctx.host, requestId)
      assert.ok(card, 'a card in the pile')
      assert.equal((await stockSeen(ctx.host, text)).length, 0, 'no stock prompt: the agent keeps waiting')
      assert.ok(auditOf(ctx.home, requestId).some((a) => a.answer === AUDIT_ANSWER.escalate))
      assert.equal((await answerCard(ctx.host, requestId, CLICK.allow)).status, 200)
      const got = await t.answered(x, callId)
      assert.equal(got.code, ASK_CODE.allowed)
      await ctx.host.call('waitIdle', { sessionId: x })
      await settledIdle(ctx.host, x)
      assert.equal(await cardOf(ctx.host, requestId), undefined)
    })
  }
})
