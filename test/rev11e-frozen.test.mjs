/**
 * Revision 11 rev11e on H-STUB: prompts already showing (DESIGN §7a.1 "Yours", §7a.9, §9 "Prompts already
 * showing", §13d S33; requirements item 20 and done-when for rev11e; contract §4.3 `prompt.list` / `prompt.answer`).
 * The scripted stock prompt is HELD, standing in for a prompt showing in a browser. The broker remembers each
 * prompt it passed on; the instance is told nothing; `prompt.list` lists them.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | FRZ-01  | EP (nothing showing) | §4.3 | `{prompts:[]}` |
 * | FRZ-02  | EP (a prompt in a session that is yours) | §7a.9, §4.3 | one entry of exactly the §4.3 keys: a prompt id, the session, the tool, argumentsStatus complete, since, managed false; no approval.request, no inbox.push, no audit row, no card; the session is still yours |
 * | FRZ-04  | EP (two sessions) | §7a.9 | two entries with different prompt ids, each with its own session |
 * | FRZ-05  | ST (your own click: Allow once) | §7a.9 "an entry leaves on any settle" | the call runs; the entry leaves; nothing reaches the instance; still yours; prompt.answer on the old id `expired` |
 * | FRZ-06  | ST (your own click: Reject) | §7a.9 | the entry leaves; the call got the rejection; as FRZ-05 |
 * | FRZ-07  | ST (the turn is stopped) | §7a.9 | the entry leaves; prompt.answer on its id `expired`; no decisions row |
 *
 * Retired:
 * - FRZ-02 "exact arguments" and FRZ-03 (quotes, markup, unicode listed exactly): prompt.list carries no arguments (contract §4.3: promptId, sessionId, title, toolName, argumentsStatus, since, managed).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ARGUMENTS_STATUS, ENVELOPE, EVENT, OPERATION } from 'fishball-connector/contract'
import { ASK_TOOL, OUTCOME, PROMPT_DECISION } from './support/constants.mjs'
import { HOOK, T, approvalAudit, pileNow } from './support/expect.mjs'
import { stopStub } from './support/instance-stub.mjs'
import {
  GRANT_C, answerPrompt, assertRefused, click, decisions, grantStub, listedPrompts, managedOf, promptsOf, resultOf, show, sleep, stopTurn,
  tokens, yours,
} from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('FRZ')

describe('Revision 11 rev11e on H-STUB: prompt.list', () => {
  let ctx
  let x
  let y
  /** Show a prompt in sid and return {text, callId, entry} for its single listed entry. */
  async function showing(sid, label) {
    const text = tok(label)
    const callId = cid(label)
    await show(ctx, sid, text, callId)
    const mine = await promptsOf(ctx, sid)
    assert.equal(mine.length, 1, 'one entry for the session: ' + JSON.stringify(mine))
    return { text, callId, entry: mine[0] }
  }
  /** Nothing about sid's prompt reached the instance: no approval.request and no inbox item from sid. */
  async function untold(sid) {
    assert.deepEqual((await ctx.stub.events(EVENT.approvalRequest)).filter((f) => f.payload.callId?.includes('FRZ')), [], 'no approval.request')
    assert.deepEqual((await ctx.stub.pushes()).filter((f) => f.payload.sourceSessionId === sid), [], 'no inbox.push about the session')
  }
  /** A late prompt.answer on an entry that left: expired, nothing changes. */
  async function lateRefused(sid, promptId, text) {
    await assertRefused(ctx, await answerPrompt(ctx, sid, promptId, { decision: PROMPT_DECISION.reject, reason: 'late ' + text }), 'expired')
    assert.equal(await managedOf(ctx, sid), undefined, 'a refused answer does not make the session managed')
    assert.deepEqual(decisions(ctx, promptId), [], 'nothing audited for a refused answer')
  }

  before(async () => {
    ctx = await grantStub('rev11e-frozen')
    x = await yours(ctx, 'frz-x')
    y = await yours(ctx, 'frz-y')
  }, HOOK)
  after(() => stopStub(ctx), HOOK)

  it('FRZ-01 nothing showing: an empty list', T, async () => {
    const r = await ctx.stub.op(OPERATION.promptList, {})
    assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { prompts: [] } })
  })

  it('FRZ-02 a prompt in a session that is yours is listed; the instance is told nothing', T, async () => {
    const auditBefore = approvalAudit(ctx.home).length
    const before = Date.now()
    const { entry } = await showing(x, '02')
    await sleep(GRANT_C.quietMs)
    assert.deepEqual(Object.keys(entry).sort(), [...GRANT_C.promptKeys].sort(), 'exactly the contract keys')
    assert.ok(typeof entry.promptId === 'string' && entry.promptId.length > 0, 'a prompt id')
    assert.deepEqual({ sessionId: entry.sessionId, toolName: entry.toolName, argumentsStatus: entry.argumentsStatus, managed: entry.managed }, { sessionId: x, toolName: ASK_TOOL, argumentsStatus: ARGUMENTS_STATUS.complete, managed: false })
    assert.ok(Number.isInteger(entry.since) && entry.since >= before - GRANT_C.endToleranceMs && entry.since <= Date.now(), 'since in epoch ms: ' + entry.since)
    assert.equal(typeof entry.title, 'string')
    await untold(x)
    assert.equal(approvalAudit(ctx.home).length, auditBefore, 'no audit row')
    assert.deepEqual(await pileNow(ctx.host), [], 'a prompt in your own session is not a card')
    assert.equal(await managedOf(ctx, x), undefined, 'still yours')
    await click(ctx, OUTCOME.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('FRZ-04 two sessions with a prompt each: two entries with different ids, each with its own session', T, async () => {
    const a = await showing(x, '04a')
    const b = await showing(y, '04b')
    assert.notEqual(a.entry.promptId, b.entry.promptId)
    assert.equal((await listedPrompts(ctx)).length, 2)
    // Your click answers the oldest prompt (x's): only that entry leaves.
    await click(ctx, OUTCOME.allow)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.deepEqual(await promptsOf(ctx, x), [], 'the clicked prompt left')
    assert.deepEqual((await promptsOf(ctx, y)).map((e) => e.promptId), [b.entry.promptId], 'the other still showing')
    await click(ctx, OUTCOME.reject)
    await ctx.host.call('waitIdle', { sessionId: y })
  })

  for (const [id, label, outcome] of [['FRZ-05', 'Allow once', OUTCOME.allow], ['FRZ-06', 'Reject', OUTCOME.reject]]) {
    it(id + ' your own click (' + label + '): the call gets it, the entry leaves, the instance is told nothing, the session stays yours', T, async () => {
      const s = await showing(x, id)
      await click(ctx, outcome)
      assert.equal((await resultOf(ctx, x, s.callId)).text, 'outcome=' + outcome)
      assert.deepEqual(await promptsOf(ctx, x), [], 'the entry left the list')
      await lateRefused(x, s.entry.promptId, s.text)
      await untold(x)
    })
  }

  it('FRZ-07 the turn is stopped while the prompt shows: the entry leaves and prompt.answer on its id is expired', T, async () => {
    const s = await showing(x, '07')
    await stopTurn(ctx, x)
    assert.deepEqual(await promptsOf(ctx, x), [], 'the entry left')
    await lateRefused(x, s.entry.promptId, s.text)
  })
})
