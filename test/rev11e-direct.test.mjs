/**
 * Revision 11 rev11e: a direct call sent to you shows a card AND the stock prompt, and either one answering clears
 * both (DESIGN §7a.1 pass-through, §7a.5, §7a.6 "Both places", "Leaving", "Cap", §9 "Session cards", §10e; S33;
 * requirements items 11, 15, 16 and the default "Card cap"). "Sent to you" is Fishball's escalate or the 120 s
 * timeout. The scripted stock prompt is HELD (it "shows" until someone clicks or the plugin closes it). One host;
 * cases run in order; every case ends with a free session.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | DCD-01  | EP (escalate) | a card of kind direct (the documented keys, the call's id, the exact arguments) and the stock prompt, both showing; the agent waits; Fishball took no further step |
 * | DCD-02  | ST (Allow once on the card) | 200; the stock prompt closes; the card leaves; the call runs (allowed-once); decisions row allow-once by user; audit escalate |
 * | DCD-03  | ST (Reject on the card, with a note) | 200; the prompt closes; the card leaves; the agent's result carries the rejection and the note |
 * | DCD-04  | ST (your click in the session: Allow once) | the card leaves; the call runs (allowed-once); the card's route answers 409 expired afterwards; decisions row allow-once by user; Fishball got no further notice |
 * | DCD-05  | ST (your click in the session: Reject) | the card leaves; the call is rejected; decisions row reject by user |
 * | DCD-06  | BVA (approvalAnswerSeconds 1, no answer) | card and stock prompt appear after about 1 s, not before; the card's Reject closes both; audit timeout |
 * | DCD-07  | ST (turn stopped while both show) | card leaves, prompt closes; a later click on the card is 409 expired |
 * | DCD-08  | BVA (maxPendingApprovals 2: one ask_fishball card + one direct card, then a third direct call) | the third shows the stock prompt only: no card, no notice to Fishball; pile unchanged |
 * | DCD-09  | ST (Permission requests turned off while both show) | the stock prompt keeps showing and your click in the session answers the call |
 * | DCD-10  | EP (one answer only) | after the card clears both, a second answer on either side changes nothing: one decisions row, the call ran once |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, AUDIT_ANSWER, CARD_KEYS, CARD_KIND, CLICK, DECISION, DECISION_ACTION, LIMITS, OWN_PLUGINS, OUTCOME, PILE_CODE, ASK_TOOL } from './support/constants.mjs'
import { HOOK, T, answerCard, auditOf, cardArguments, cardOf, pileNow, requestMessages, settledIdle, storedRows, untilCard, untilNoCard, waitRequest } from './support/expect.mjs'
import { QUIET_MS, pileHost, promptTools, sleep, tokens, until } from './support/rev11e.mjs'

const { tok, cid } = tokens('DCD')

describe('Revision 11 rev11e: a direct call sent to you shows a card and the stock prompt', () => {
  let ctx
  let p
  let t
  let x
  let y
  let z
  const decisionsFor = (requestId) => storedRows(ctx.home, 'decisions').filter((d) => d.target === requestId)
  /** A direct call in sid that Fishball escalates: returns once the card and the stock prompt are both showing. */
  async function sentToYou(sid, text, callId, extra) {
    await t.plan(text, { decision: DECISION.escalate, risk: 'high', reason: 'for you ' + text })
    await p.show(sid, text, callId, extra)
    const req = await waitRequest(ctx.host, ctx.fb, text)
    assert.ok(req, 'the call reached Fishball')
    const card = await untilCard(ctx.host, req.id)
    assert.ok(card, 'a card: ' + JSON.stringify(await pileNow(ctx.host)))
    await settledIdle(ctx.host, ctx.fb)
    return { requestId: req.id, card, text, callId, sid }
  }
  const prompt = async (text) => (await p.prompts(text))[0]
  const toggleApprovals = async (on) => {
    const r = await ctx.host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await ctx.host.state()).features?.approvals === on, 10000, 100), 'features.approvals ' + on)
  }

  before(async () => {
    ctx = await pileHost('rev11e-direct')
    p = promptTools(ctx, { tok, cid })
    t = p.t
    x = await t.session('dcd-x')
    y = await t.session('dcd-y')
    z = await t.session('dcd-z')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('DCD-01 escalate: a card of kind direct and the stock prompt both show; the agent waits; Fishball takes no further step', T, async () => {
    const text = tok('01')
    const extra = { justification: 'why ' + text }
    const c = await sentToYou(x, text, cid('01'), extra)
    const card = await cardOf(ctx.host, c.requestId)
    for (const key of CARD_KEYS) assert.ok(key in card, 'card has ' + key + ': ' + JSON.stringify(card))
    assert.equal(card.kind, CARD_KIND.direct)
    assert.equal(card.sessionId, x)
    assert.equal(card.toolName, ASK_TOOL)
    assert.equal(card.callId, c.callId)
    assert.deepEqual(cardArguments(card), { text, ...extra }, 'the exact arguments')
    assert.equal((await prompt(text)).closed, false, 'the stock prompt is showing')
    assert.equal(await ctx.host.call('agentStatus', { sessionId: x }), 'running')
    const steps = (await ctx.host.call('requests', { sessionId: ctx.fb })).length
    await sleep(QUIET_MS)
    assert.equal((await ctx.host.call('requests', { sessionId: ctx.fb })).length, steps, 'no further Fishball step')
    assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 1)
    assert.equal((await pileNow(ctx.host)).length, 1)
    await answerCard(ctx.host, c.requestId, CLICK.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('DCD-02 Allow once on the card: the prompt closes, the card leaves, the call runs; audited', T, async () => {
    const c = await sentToYou(x, tok('02'), cid('02'))
    const r = await answerCard(ctx.host, c.requestId, CLICK.allow)
    assert.equal(r.status, 200, r.text)
    assert.equal((await prompt(c.text)).closed, true, 'the stock prompt closed')
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
    assert.ok((await p.result(x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow), 'the call ran')
    assert.equal(await p.held(), 0)
    const rows = decisionsFor(c.requestId)
    assert.equal(rows.length, 1, JSON.stringify(rows))
    assert.equal(rows[0].action, DECISION_ACTION.allowOnce)
    assert.equal(rows[0].by, 'user')
    assert.equal(auditOf(ctx.home, c.requestId)[0]?.answer, AUDIT_ANSWER.escalate)
  })

  it('DCD-03 Reject on the card with a note: the prompt closes, the card leaves, the agent sees the rejection and the note', T, async () => {
    const c = await sentToYou(x, tok('03'), cid('03'))
    const note = 'not on my machine ' + c.text
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.reject, note)).status, 200)
    assert.equal((await prompt(c.text)).closed, true)
    assert.ok(await untilNoCard(ctx.host, c.requestId))
    const got = await p.result(x, c.callId)
    assert.ok(got.text.includes(note), 'the note reaches the agent: ' + got.text)
    assert.doesNotMatch(got.text, /allowed-once/)
    assert.equal(decisionsFor(c.requestId)[0]?.action, DECISION_ACTION.reject)
    assert.equal(decisionsFor(c.requestId)[0]?.by, 'user')
  })

  it('DCD-04 your click in the session (Allow once) clears the card; a later click on the card is expired', T, async () => {
    const c = await sentToYou(x, tok('04'), cid('04'))
    await p.click(OUTCOME.allow)
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
    assert.ok((await p.result(x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow))
    const late = await answerCard(ctx.host, c.requestId, CLICK.reject)
    assert.equal(late.status, 409, late.text)
    assert.equal(JSON.parse(late.text).code, PILE_CODE.expired)
    await ctx.host.call('waitIdle', { sessionId: x })
    assert.ok(await until(() => decisionsFor(c.requestId).length > 0, 5000, 100), 'a decisions row')
    assert.equal(decisionsFor(c.requestId).length, 1)
    assert.equal(decisionsFor(c.requestId)[0].action, DECISION_ACTION.allowOnce)
    assert.equal(decisionsFor(c.requestId)[0].by, 'user')
    assert.equal((await requestMessages(ctx.host, ctx.fb, c.text)).length, 1, 'no further notice')
  })

  it('DCD-05 your click in the session (Reject) clears the card', T, async () => {
    const c = await sentToYou(x, tok('05'), cid('05'))
    await p.click(OUTCOME.reject)
    assert.ok(await untilNoCard(ctx.host, c.requestId))
    assert.ok((await p.result(x, c.callId)).text.startsWith('outcome=' + OUTCOME.reject))
    assert.ok(await until(() => decisionsFor(c.requestId).length > 0, 5000, 100))
    assert.equal(decisionsFor(c.requestId)[0].action, DECISION_ACTION.reject)
    assert.equal(decisionsFor(c.requestId)[0].by, 'user')
  })

  it('DCD-06 approvalAnswerSeconds 1, no answer: card and stock prompt after about 1 s; one click clears both; audit timeout', T, async () => {
    await t.setLimit({ approvalAnswerSeconds: 1 })
    try {
      const text = tok('06')
      const callId = cid('06')
      await settledIdle(ctx.host, x)
      const t0 = Date.now()
      await p.show(x, text, callId)
      const seen = await prompt(text)
      assert.ok(seen.at - t0 >= 1000, 'not before the answer time: ' + (seen.at - t0) + ' ms')
      const req = await waitRequest(ctx.host, ctx.fb, text)
      const card = await untilCard(ctx.host, req.id)
      assert.ok(card, 'a card with the prompt')
      assert.equal(card.kind, CARD_KIND.direct)
      assert.equal((await answerCard(ctx.host, req.id, CLICK.reject)).status, 200)
      assert.equal((await prompt(text)).closed, true)
      assert.ok(await untilNoCard(ctx.host, req.id))
      assert.ok((await p.result(x, callId)).text.startsWith('outcome=' + OUTCOME.reject))
      await settledIdle(ctx.host, ctx.fb)
      assert.equal(auditOf(ctx.home, req.id)[0]?.answer, AUDIT_ANSWER.timeout)
    } finally { await t.setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('DCD-07 the turn is stopped while both show: the card leaves, the prompt closes, a later click is expired', T, async () => {
    const c = await sentToYou(x, tok('07'), cid('07'))
    await p.stop(x)
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'the card left')
    assert.equal((await prompt(c.text)).closed, true, 'the stock prompt closed')
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.allow)).status, 409)
  })

  it('DCD-08 maxPendingApprovals 2 with an ask_fishball card and a direct card: a third direct call shows the stock prompt only', T, async () => {
    await t.setLimit({ maxPendingApprovals: 2 })
    const live = []
    try {
      const ask = await t.escalated(x, tok('08a'), cid('08a'))
      live.push(() => answerCard(ctx.host, ask.requestId, CLICK.reject))
      const second = await sentToYou(y, tok('08b'), cid('08b'))
      assert.equal((await pileNow(ctx.host)).length, 2)
      const text = tok('08c')
      await p.show(z, text, cid('08c'))
      await sleep(QUIET_MS)
      assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 0, 'it never reached Fishball')
      assert.equal((await pileNow(ctx.host)).length, 2, 'no third card')
      assert.equal((await prompt(text)).closed, false, 'its own stock prompt shows')
      // Your click in the session answers it as any prompt.
      assert.equal((await answerCard(ctx.host, second.requestId, CLICK.reject)).status, 200)
      await p.click(OUTCOME.allow)
      assert.ok((await p.result(z, cid('08c'))).text !== undefined)
    } finally {
      for (const f of live) await f().catch(() => {})
      for (const sid of [x, y, z]) await t.stop(sid).catch(() => {})
      await t.setLimit({ maxPendingApprovals: LIMITS.maxPendingApprovals.default })
    }
  })

  it('DCD-09 Permission requests turned off while both show: the stock prompt keeps showing and your click answers the call', T, async () => {
    const c = await sentToYou(x, tok('09'), cid('09'))
    await toggleApprovals(false)
    try {
      await sleep(QUIET_MS)
      assert.equal((await prompt(c.text)).closed, false, 'the prompt stays')
      await p.click(OUTCOME.allow)
      assert.ok((await p.result(x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow))
    } finally { await toggleApprovals(true) }
    assert.ok(await untilNoCard(ctx.host, c.requestId), 'no card remains for a settled call')
  })

  it('DCD-10 after the card cleared both, a second answer on either side changes nothing', T, async () => {
    const c = await sentToYou(x, tok('10'), cid('10'))
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.allow)).status, 200)
    assert.equal((await answerCard(ctx.host, c.requestId, CLICK.reject)).status, 409)
    assert.equal(await ctx.host.call('releaseApproval', { outcome: OUTCOME.reject }), false, 'nothing left to click')
    assert.ok((await p.result(x, c.callId)).text.startsWith('outcome=' + OUTCOME.allow))
    await sleep(QUIET_MS)
    assert.equal(decisionsFor(c.requestId).length, 1)
    assert.equal(storedRows(ctx.home, 'decisions').filter((d) => d.target === c.requestId && d.action === DECISION_ACTION.reject).length, 0)
  })
})
