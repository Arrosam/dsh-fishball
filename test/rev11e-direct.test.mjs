/**
 * Revision 11 rev11e on H-STUB: a direct call sent to you shows a card AND the stock prompt, and either one
 * answering clears both (DESIGN §7a.1 pass-through, §7a.4, §7a.5, §7a.6 "Both places", "Leaving", "Cap", §9
 * "Session cards", "Fishball's other decisions"; S33; requirements items 11, 15, 16 and the default "Card cap";
 * contract §4.2 `approval.answer` escalate, §5 `approval.settled`, §9 the queue bound). "Sent to you" is the
 * instance's escalate, the answer timeout, or a notice the queue cannot take. The scripted stock prompt is HELD
 * (it "shows" until someone clicks or the plugin closes it). A card is answered through the route behind the
 * session's buttons (`/api/fishball/requests/answer`). One host; cases run in order; every case ends with a free
 * session.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | DCD-01  | EP (escalate) | §7a.6, §9 cards | a card of kind direct (the documented keys, the call's id, the exact arguments) and the stock prompt, both showing; the agent waits; settled escalate by fishball; no second approval.request |
 * | DCD-02  | ST (Allow once on the card) | §7a.6 | 200; the stock prompt closes; the card leaves; the call runs (allowed-once); settled allow by user; decisions row allow-once by user; audit escalate |
 * | DCD-03  | ST (Reject on the card, with a note) | §7a.4 "Your Reject note" | 200; the prompt closes; the card leaves; the agent's result carries the note, not allowed-once; decisions row reject by user |
 * | DCD-04  | ST (your click in the session: Allow once) | §7a.1 race, §7a.6 | the card leaves; the call runs; the card's route answers 409 expired afterwards; decisions row allow-once by user; settled by user |
 * | DCD-05  | ST (your click in the session: Reject) | as DCD-04 | the card leaves; the call is rejected; decisions row reject by user |
 * | DCD-06  | BVA (approvalAnswerSeconds 1, no answer) | §7a.5 Slow | card and stock prompt appear about 1 s after the request, not before; the card's Reject closes both; audit timeout |
 * | DCD-07  | ST (turn stopped while both show) | §7a.6 Leaving | card leaves, prompt closes; a later click on the card is 409 expired |
 * | DCD-08  | BVA (maxPendingApprovals 2: an ask_fishball card + a direct card, then a third direct call) | §7a.6 Cap | the third shows the stock prompt only: no approval.request, no card; pile unchanged; your click answers it |
 * | DCD-09  | ST (instance detached while both show) | §7a.5 "keeps the prompt" | the stock prompt keeps showing and your click answers the call; no card remains |
 * | DCD-10  | EP (one answer only) | §7a.1 "the first answer wins" | after the card cleared both, a second answer on either side changes nothing: one decisions row, the call ran once |
 * | DCD-11  | BVA (maxQueuedInputs 1 full; maxPendingApprovals 1) | §7a.6, §11, contract §9 | the undeliverable direct call gets a card and the stock prompt and no approval inbox item; a second one past the cap gets the stock prompt only |
 *
 * Retired:
 * - DCD-09 as written ("Permission requests turned off"): the Permission requests switch is gone (slim §12); the same "going off while both show" is exercised by a detach.
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import { ENVELOPE, INBOX_KIND } from 'fishball-connector/contract'
import { ASK_FISHBALL, ASK_TOOL, CARD_KEYS, CARD_KIND, CLICK, DECISION, LIMITS, OUTCOME, PILE_CODE, APPROVER_HOLDS } from './support/constants.mjs'
import { HOOK, T, answerCard, cardArguments, cardOf, messageFishball, pileNow, untilCard, untilNoCard } from './support/expect.mjs'
import { STUB, managedSession, stopStub } from './support/instance-stub.mjs'
import {
  GRANT_C, answer, auditOf, click, decisions, direct, grantStub, promptOf, requestsFor, resultOf, settledFor, sleep, startCall,
  stopTurn, tokens, until,
} from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('DCD')

describe('Revision 11 rev11e on H-STUB: a direct call sent to you shows a card and the stock prompt', () => {
  let ctx
  let x
  let y
  let z
  const setLimit = async (patch) => { const r = await ctx.host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  /** Hold the stock prompt (a person who has not clicked yet) while fn runs, then back to reject. */
  async function holding(fn) {
    await ctx.host.call('setApprover', { outcome: APPROVER_HOLDS })
    try { return await fn() } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
  }
  const promptShows = (text) => until(async () => { const p = await promptOf(ctx, text); return p && !p.closed ? p : false }, STUB.waitMs, STUB.pollMs)
  /** A direct call in sid that the instance escalates: returns once the card and the stock prompt are both showing. */
  async function sentToYou(sid, label, extra = {}) {
    const text = tok(label)
    const callId = cid(label)
    return holding(async () => {
      const desc = await direct(ctx, sid, ASK_TOOL, { text, ...extra }, callId)
      const r = await answer(ctx, sid, desc, { decision: DECISION.escalate, risk: 'high', reason: 'for you ' + text })
      assert.equal(r.type, ENVELOPE.type.response, JSON.stringify(r))
      const card = await untilCard(ctx.host, desc.approvalId)
      assert.ok(card, 'a card: ' + JSON.stringify(await pileNow(ctx.host)))
      assert.ok(await promptShows(text), 'the stock prompt shows')
      return { requestId: desc.approvalId, desc, card, text, callId, sid }
    })
  }
  /**
   * The user's final decision on an escalated request reaches the instance as approval.settled {by: user}
   * (slim §8.1: "for escalations — the user's final decision delivered by approval.settled"; contract §5).
   */
  const settledByUser = async (requestId, decision) => {
    const found = await until(async () => (await settledFor(ctx, requestId)).find((p) => p.by === GRANT_C.by.user) ?? false, STUB.waitMs, STUB.pollMs)
    assert.deepEqual(found, { approvalId: requestId, decision, by: GRANT_C.by.user }, 'settled by user: ' + JSON.stringify(await settledFor(ctx, requestId)))
  }
  const userDecision = async (requestId) => {
    assert.ok(await until(() => decisions(ctx, requestId).length > 0, STUB.waitMs, STUB.pollMs), 'a decisions row')
    const rows = decisions(ctx, requestId)
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].by, GRANT_C.by.user)
    return rows[0].action
  }

  before(async () => {
    ctx = await grantStub('rev11e-direct')
    x = await managedSession(ctx.host, 'dcd-x')
    y = await managedSession(ctx.host, 'dcd-y')
    z = await managedSession(ctx.host, 'dcd-z')
  }, HOOK)
  // Every case ends with free sessions, even when it failed while a call waited.
  afterEach(async () => {
    for (const sid of [x, y, z]) if ((await ctx.host.call('agentStatus', { sessionId: sid })) === 'running') await stopTurn(ctx, sid)
  }, HOOK)
  after(() => stopStub(ctx), HOOK)

  it('DCD-01 escalate: a card of kind direct and the stock prompt both show; the agent waits', T, async () => {
    const extra = { justification: 'why ' + tok('01j') }
    const c = await sentToYou(x, '01', extra)
    const card = await cardOf(ctx.host, c.requestId)
    for (const key of CARD_KEYS) assert.ok(key in card, 'card has ' + key + ': ' + JSON.stringify(card))
    assert.deepEqual({ kind: card.kind, sessionId: card.sessionId, toolName: card.toolName, callId: card.callId }, { kind: CARD_KIND.direct, sessionId: x, toolName: ASK_TOOL, callId: c.callId })
    assert.deepEqual(cardArguments(card), { text: c.text, ...extra }, 'the exact arguments')
    assert.equal(await ctx.host.call('agentStatus', { sessionId: x }), 'running')
    // Contract §5 names the event, not how often it repeats; only its content is asserted here.
    const settled = await settledFor(ctx, c.requestId)
    assert.ok(settled.length > 0 && settled.every((p) => p.decision === DECISION.escalate && p.by === GRANT_C.by.fishball), 'settled escalate by fishball: ' + JSON.stringify(settled))
    await sleep(GRANT_C.quietMs)
    assert.equal((await requestsFor(ctx, c.callId)).length, 1, 'no second approval.request')
    assert.equal((await pileNow(ctx.host)).length, 1)
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.reject)).status, 200)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('DCD-02 Allow once on the card: the prompt closes, the card leaves, the call runs; audited', T, async () => {
    const c = await sentToYou(x, '02')
    const r = await answerCard(ctx.host, c.requestId, CLICK.allow)
    assert.equal(r.status, 200, r.text)
    assert.equal((await promptOf(ctx, c.text)).closed, true, 'the stock prompt closed')
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
    assert.ok((await resultOf(ctx, x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow), 'the call ran')
    assert.equal(await ctx.host.call('heldApprovals', {}), 0)
    assert.equal(await userDecision(c.requestId), GRANT_C.action.allowOnce)
    assert.equal(auditOf(ctx.home, c.requestId)[0]?.answer, GRANT_C.audit.escalate)
    await settledByUser(c.requestId, DECISION.allow)
  })

  it('DCD-03 Reject on the card with a note: the prompt closes, the card leaves, the agent sees the note', T, async () => {
    const c = await sentToYou(x, '03')
    const note = 'not on my machine ' + c.text
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.reject, note)).status, 200)
    assert.equal((await promptOf(ctx, c.text)).closed, true)
    assert.ok(await untilNoCard(ctx.host, c.requestId))
    const got = await resultOf(ctx, x, c.callId)
    assert.ok(got.text.includes(note), 'the note reaches the agent: ' + got.text)
    assert.doesNotMatch(got.text, /allowed-once/)
    assert.equal(await userDecision(c.requestId), GRANT_C.action.reject)
    await settledByUser(c.requestId, DECISION.reject)
  })

  for (const [id, outcome, action] of [['DCD-04', OUTCOME.allow, GRANT_C.action.allowOnce], ['DCD-05', OUTCOME.reject, GRANT_C.action.reject]]) {
    it(id + ' your click in the session (' + outcome + ') clears the card; a later click on the card is expired', T, async () => {
      const c = await sentToYou(x, id)
      await click(ctx, outcome)
      assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
      assert.ok((await resultOf(ctx, x, c.callId)).text.startsWith('outcome=' + outcome))
      const late = await answerCard(ctx.host, c.requestId, CLICK.reject)
      assert.equal(late.status, 409, late.text)
      assert.equal(JSON.parse(late.text).code, PILE_CODE.expired)
      assert.equal(await userDecision(c.requestId), action)
      await settledByUser(c.requestId, outcome === OUTCOME.allow ? DECISION.allow : DECISION.reject)
    })
  }

  it('DCD-06 approvalAnswerSeconds 1, no answer: card and stock prompt after about 1 s; one click clears both; audit timeout', T, async () => {
    await setLimit({ approvalAnswerSeconds: 1 })
    try {
      const text = tok('06')
      const callId = cid('06')
      const seen = await holding(async () => {
        const desc = await direct(ctx, x, ASK_TOOL, { text }, callId)
        const p = await promptShows(text)
        assert.ok(p, 'the stock prompt shows after the answer time')
        assert.ok(p.at - desc.at >= GRANT_C.answerSecondsMs, 'not before the answer time: ' + (p.at - desc.at) + ' ms')
        return desc
      })
      const card = await untilCard(ctx.host, seen.approvalId)
      assert.ok(card, 'a card with the prompt')
      assert.equal(card.kind, CARD_KIND.direct)
      assert.equal((await answerCard(ctx.host, seen.approvalId, CLICK.reject)).status, 200)
      assert.equal((await promptOf(ctx, text)).closed, true)
      assert.ok(await untilNoCard(ctx.host, seen.approvalId))
      assert.ok((await resultOf(ctx, x, callId)).text.startsWith('outcome=' + OUTCOME.reject))
      assert.equal(auditOf(ctx.home, seen.approvalId)[0]?.answer, GRANT_C.audit.timeout)
    } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('DCD-07 the turn is stopped while both show: the card leaves, the prompt closes, a later click is expired', T, async () => {
    const c = await sentToYou(x, '07')
    await stopTurn(ctx, x)
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
    assert.equal((await promptOf(ctx, c.text)).closed, true, 'the stock prompt closed')
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.allow)).status, 409)
  })

  it('DCD-08 maxPendingApprovals 2 with an ask_fishball card and a direct card: a third direct call shows the stock prompt only', T, async () => {
    await setLimit({ maxPendingApprovals: 2 })
    try {
      const askText = tok('08a')
      const ask = await direct(ctx, x, ASK_FISHBALL, { tool: ASK_TOOL, arguments: { text: askText }, quote: [], why: 'why ' + askText }, cid('08a'))
      assert.equal((await answer(ctx, x, ask, { decision: DECISION.escalate })).type, ENVELOPE.type.response)
      assert.ok(await untilCard(ctx.host, ask.approvalId), 'the ask_fishball card')
      const second = await sentToYou(y, '08b')
      assert.equal((await pileNow(ctx.host)).length, 2)
      const text = tok('08c')
      const thirdId = cid('08c')
      await holding(async () => {
        await startCall(ctx, z, ASK_TOOL, { text }, thirdId)
        assert.ok(await promptShows(text), 'its own stock prompt shows')
      })
      await sleep(GRANT_C.quietMs)
      assert.deepEqual(await requestsFor(ctx, thirdId), [], 'it never reached the instance')
      assert.equal((await pileNow(ctx.host)).length, 2, 'no third card')
      // Your click in the session answers it as any prompt (second's prompt is closed first by its card).
      assert.equal((await answerCard(ctx.host, second.requestId, CLICK.reject)).status, 200)
      await click(ctx, OUTCOME.allow)
      assert.ok((await resultOf(ctx, z, thirdId)).text.startsWith('outcome=' + OUTCOME.allow))
      assert.equal((await answerCard(ctx.host, ask.approvalId, CLICK.reject)).status, 200)
    } finally {
      for (const sid of [x, y, z]) await stopTurn(ctx, sid).catch(() => {})
      await setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }
  })

  it('DCD-09 the instance detaches while both show: the stock prompt keeps showing and your click answers the call', T, async () => {
    const c = await sentToYou(x, '09')
    assert.equal(await ctx.stub.detach(), true)
    try {
      await sleep(GRANT_C.quietMs)
      assert.equal((await promptOf(ctx, c.text)).closed, false, 'the prompt stays')
      await click(ctx, OUTCOME.allow)
      assert.ok((await resultOf(ctx, x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow))
    } finally {
      const a = await ctx.stub.attach()
      assert.ok(a.ok && a.handshake?.type === ENVELOPE.type.response, JSON.stringify(a))
    }
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'no card remains for a settled call')
  })

  it('DCD-10 after the card cleared both, a second answer on either side changes nothing', T, async () => {
    const c = await sentToYou(x, '10')
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.allow)).status, 200)
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.reject)).status, 409)
    assert.equal(await ctx.host.call('releaseApproval', { outcome: OUTCOME.reject }), false, 'nothing left to click')
    assert.ok((await resultOf(ctx, x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow))
    await sleep(GRANT_C.quietMs)
    assert.equal(await userDecision(c.requestId), GRANT_C.action.allowOnce)
    assert.equal(decisions(ctx, c.requestId).filter((d) => d.action === GRANT_C.action.reject).length, 0)
  })

  it("DCD-11 the instance's queue is full (notice undeliverable): a card and the stock prompt; past the cap the stock prompt only", T, async () => {
    await setLimit({ maxQueuedInputs: 1, maxPendingApprovals: 1 })
    // The bound counts pushed but unacknowledged items (contract §9): an instance that acks nothing fills it.
    await ctx.stub.ackPolicy(0)
    try {
      const filled = await messageFishball(ctx.host, y, { message: tok('11fill') })
      assert.equal(filled.json?.ok, true, 'precondition: one queued input')
      const full = await messageFishball(ctx.host, y, { message: tok('11full') })
      assert.equal(full.json?.code, 'queue-full', 'precondition: the queue is full')
      const text = tok('11')
      const callId = cid('11')
      const card = await holding(async () => {
        await startCall(ctx, x, ASK_TOOL, { text }, callId)
        const found = await until(async () => (await pileNow(ctx.host)).find((c) => c.sessionId === x && c.callId === callId) ?? false, STUB.waitMs, STUB.pollMs)
        assert.ok(found, 'a card for the undelivered call: ' + JSON.stringify(await pileNow(ctx.host)))
        assert.ok(await promptShows(text), 'and the stock prompt')
        return found
      })
      assert.equal(card.kind, CARD_KIND.direct)
      const approvalPushes = (await ctx.stub.pushes()).map((f) => f.payload).filter((p) => p.kind === INBOX_KIND.approval && p.text.includes(card.requestId))
      assert.deepEqual(approvalPushes, [], 'no approval notice was delivered')
      // Past the cap (1): the next undeliverable call shows the stock prompt only.
      const text2 = tok('11b')
      const secondId = cid('11b')
      await holding(async () => {
        await startCall(ctx, z, ASK_TOOL, { text: text2 }, secondId)
        assert.ok(await promptShows(text2), 'its stock prompt shows')
      })
      await sleep(GRANT_C.quietMs)
      assert.equal((await pileNow(ctx.host)).length, 1, 'no second card')
      assert.equal((await answerCard(ctx.host, card.requestId, CLICK.reject)).status, 200)
      await click(ctx, OUTCOME.reject)
      assert.ok((await resultOf(ctx, x, callId)).text.startsWith('outcome=' + OUTCOME.reject))
    } finally {
      await ctx.stub.ackPolicy(null)
      for (const sid of [x, y, z]) await stopTurn(ctx, sid).catch(() => {})
      await setLimit({ maxQueuedInputs: LIMITS.maxQueuedInputs.default, maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }
  })
})
