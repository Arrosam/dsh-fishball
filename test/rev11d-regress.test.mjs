/**
 * Revision 11 rev11b regression on H-STUB, added with rev11d (the manager's decision of 2026-11-02, DESIGN §7a.3
 * table: `escalate` has code rules "None: any request can go to you"; `ask` needs only its question; contract §4.2
 * `approval.answer`: with `ask` or `escalate` the reason may be empty). The stub answers a managed session's
 * `ask_fishball` request with `approval.answer`; the request then goes to the user, who answers it on the
 * ask_fishball row (`/api/fishball/requests/answer`, slim §12 "a card that goes to the user is answered in its own
 * session").
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | REG-01  | DT (escalate without risk or reason) | §7a.3, §4.2 | `{accepted:true}`; settled escalate by fishball; a card; the agent keeps waiting; no stock prompt; your Allow once → allowed; settled allow by user; audit escalate; the card leaves |
 * | REG-02  | DT (escalate with risk and an empty reason) | §4.2 | same (the older ASK-04 shape stays accepted) |
 * | REG-03  | DT (ask with only its question) | §7a.3, §4.2 | `{accepted:true}`; the agent's result is `question` carrying the question |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ENVELOPE } from 'fishball-connector/contract'
import { ASK_CODE, ASK_FISHBALL, ASK_TOOL, AUDIT_ANSWER, CLICK, DECISION } from './support/constants.mjs'
import { HOOK, T, answerCard, cardOf, jsonOf, stockSeen, untilCard, untilNoCard } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import { GRANT_C, answer, auditOf, direct, grantStub, resultOf, settledFor, sleep, tokens, until } from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('REG')

describe('Revision 11 rev11b regression on H-STUB: escalate and ask need no risk or reason', () => {
  let ctx
  let x
  /** An ask_fishball request from x waiting for the instance; returns {desc, text, callId}. */
  async function waiting(label) {
    const text = tok(label)
    const callId = cid(label)
    const desc = await direct(ctx, x, ASK_FISHBALL, { tool: ASK_TOOL, arguments: { text }, quote: [], why: 'why ' + text }, callId)
    return { desc, text, callId }
  }

  before(async () => {
    ctx = await grantStub('rev11d-regress')
    x = await managedSession(ctx.host, 'reg-x')
  }, HOOK)
  after(() => stopStub(ctx), HOOK)

  it('REG-03 ask with only its question (no risk, no reason) is accepted (the manager\'s decision of 2026-11-02)', T, async () => {
    const w = await waiting('03')
    const question = 'which one? ' + w.text
    const r = await answer(ctx, x, w.desc, { decision: DECISION.ask, question })
    assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { accepted: true } })
    const got = jsonOf(await resultOf(ctx, x, w.callId))
    assert.equal(got?.code, ASK_CODE.question, JSON.stringify(got))
    assert.equal(got.question, question)
  })

  for (const [id, label, fields] of [
    ['REG-01', 'no risk and no reason', {}],
    ['REG-02', 'risk and an empty reason', { risk: 'high', reason: '' }],
  ]) {
    it(id + ' escalate with ' + label + ' is accepted and the request goes to you', T, async () => {
      const w = await waiting(id)
      const r = await answer(ctx, x, w.desc, { decision: DECISION.escalate, ...fields })
      assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { accepted: true } })
      assert.ok(await untilCard(ctx.host, w.desc.approvalId), 'a card for the request')
      await sleep(GRANT_C.quietMs)
      assert.equal(await ctx.host.call('agentStatus', { sessionId: x }), 'running', 'the agent keeps waiting')
      assert.deepEqual(await stockSeen(ctx.host, w.text), [], 'no stock prompt')
      assert.equal((await answerCard(ctx.host, w.desc.approvalId, CLICK.allow)).status, 200)
      assert.equal(jsonOf(await resultOf(ctx, x, w.callId))?.code, ASK_CODE.allowed)
      assert.deepEqual(await settledFor(ctx, w.desc.approvalId), [
        { approvalId: w.desc.approvalId, decision: DECISION.escalate, by: GRANT_C.by.fishball },
        { approvalId: w.desc.approvalId, decision: 'allow', by: GRANT_C.by.user },
      ])
      assert.ok(await until(() => auditOf(ctx.home, w.desc.approvalId).some((a) => a.answer === AUDIT_ANSWER.escalate), 5000, 100), 'audit escalate: ' + JSON.stringify(auditOf(ctx.home, w.desc.approvalId)))
      assert.ok(await untilNoCard(ctx.host, w.desc.approvalId))
      assert.equal(await cardOf(ctx.host, w.desc.approvalId), undefined)
    })
  }
})
