/** Connector-owned MCP contract for the manager's automatic permission card. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { scenario } from '../wire/world.mjs'
import { BUDGET, EVENT_TYPE, FIXTURE, IX, REFUSAL, RELAYED, WORLD } from './constants.mjs'
import {
  A, answer, asked, assertCovered, batchOf, cardOf, exactGrant, eventually, free, isListed,
  managed, pending, planned, principal, qAnswer, questioned, quiet, resultOf, retirement,
  stockFor, untilStock, userClicks, world,
} from './subject.mjs'

// Assert the published wire names, independent of any production constants for the new feature.
const HANDOFF = Object.freeze({
  setting: 'autoEscalatePermissions',
  notice: 'permission-escalated',
  disabledWorld: 'ix-manual-permission-handoff',
  noticeWaitMs: 6000,
})
const ACCEPTED = { ok: true, accepted: true }
const LATE = [REFUSAL.alreadySettled, REFUSAL.expired]
const sdks = ['0.2.1-rc.5', '0.2.2-rc.1']
const handoffs = (events) => events.filter((e) => e.type === EVENT_TYPE.notice && e.payload.code === HANDOFF.notice)

function manualWorld(sdk) {
  return scenario(sdk, HANDOFF.disabledWorld, {
    env: { [WORLD.envKey]: WORLD.extension },
    rowConfig: () => ({ approval: { port: 0 }, requests: { [HANDOFF.setting]: false } }),
  })
}

async function start(t, w) {
  const p = await principal(t, w)
  const r = await asked(w, p, await managed(w, p))
  t.after(() => free(w, r.sid))
  return { p, r }
}

async function assertLateEscalationRefused(p, r) {
  const late = await answer(p, r, A.escalate())
  assert.equal(late.ok, false, 'an already settled offer accepted escalation')
  assert.ok(LATE.includes(late.code), JSON.stringify(late))
}

for (const sdk of sdks) {
  const row = (label, run) => test('Permission handoff [' + sdk + ']: ' + label, { timeout: BUDGET.testMs }, run)

  row('by default an uncovered live offer authorizes fallback, without escalating it yet', async (t) => {
    const w = await world(sdk)
    const { p, r } = await start(t, w)
    assert.equal(r.d[HANDOFF.setting], true, 'permission payload did not authorize auto-escalation by default')
    assert.equal(await isListed(p, r), true, 'fallback authorization already retired the offer')
    assert.deepEqual(await stockFor(w, r.text), [], 'fallback authorization already opened the stock prompt')
    assert.deepEqual(handoffs(await pending(p.client)), [], 'fallback authorization already announced an explicit handoff')
  })

  row('explicit escalation announces the current offer once, and the original reject still decides it', async (t) => {
    const w = await world(sdk)
    const { p, r } = await start(t, w)
    assert.deepEqual(await answer(p, r, A.escalate()), ACCEPTED)
    await untilStock(w, r.text)
    assert.equal(await isListed(p, r), true, 'escalation settled or unlisted the permission')
    assert.ok(await eventually(async () => handoffs(await pending(p.client)).length > 0, HANDOFF.noticeWaitMs), 'accepted escalation did not publish a permission-escalated notice')
    assert.equal((await answer(p, r, A.escalate())).ok, false, 'the same handoff was accepted twice')

    assert.deepEqual(await answer(p, r, A.reject()), ACCEPTED)
    const result = await resultOf(w, r.sid, r.id)
    assert.equal(result.isError, true)
    assert.ok(result.text.includes(RELAYED.rejected(FIXTURE.otherReason)), result.text)
    await assertLateEscalationRefused(p, r)
    await quiet()
    assert.deepEqual(handoffs(await pending(p.client)).map((e) => [e.sourceSessionId, e.correlationId]), [[r.sid, r.offer.offerId]])
    assert.ok(await eventually(async () => (await stockFor(w, r.text)).every((prompt) => prompt.closed)), 'the losing stock prompt remained open')
  })

  row('opt-out omits both signals but retains the manual stock approval path', async (t) => {
    const w = await manualWorld(sdk)
    const { p, r } = await start(t, w)
    assert.equal(Object.hasOwn(r.d, HANDOFF.setting), false, 'the opt-out still advertised auto-escalation')
    assert.deepEqual(await stockFor(w, r.text), [])
    assert.deepEqual(await answer(p, r, A.escalate()), ACCEPTED)
    await untilStock(w, r.text)
    await userClicks(w, r.text, IX.outcome.allowed)
    assert.equal((await resultOf(w, r.sid, r.id)).text, IX.fixture.outcomeText(IX.outcome.allowed))
    await assertLateEscalationRefused(p, r)
    await quiet()
    assert.deepEqual(handoffs(await pending(p.client)), [])
  })

  row('approved, rejected, withdrawn and standing-grant-covered permissions produce no handoff', async (t) => {
    const w = await world(sdk)
    const { p, r: allowed } = await start(t, w)
    assert.equal((await answer(p, allowed, A.grant(exactGrant()))).accepted, true)
    assert.equal((await resultOf(w, allowed.sid, allowed.id)).text, IX.fixture.outcomeText(IX.outcome.allowed))
    await assertLateEscalationRefused(p, allowed)
    await assertCovered(w, p, allowed.sid, allowed.tool, allowed.text, allowed.args)

    const rejected = await asked(w, p, allowed.sid)
    assert.deepEqual(await answer(p, rejected, A.reject()), ACCEPTED)
    assert.equal((await resultOf(w, rejected.sid, rejected.id)).isError, true)
    await assertLateEscalationRefused(p, rejected)

    const withdrawn = await asked(w, p, allowed.sid)
    await free(w, withdrawn.sid)
    await retirement(p.client, withdrawn.event)
    await assertLateEscalationRefused(p, withdrawn)
    await quiet()
    assert.deepEqual(handoffs(await pending(p.client)), [])
  })

  row('question and plan handoffs retain their original cards and emit neither permission signal', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const q = await questioned(w, p, await managed(w, p, IX.preset.ask))
    const plan = await planned(w, p, await managed(w, p, IX.dsh.standardPreset))
    for (const r of [q, plan]) {
      assert.equal(Object.hasOwn(r.d, HANDOFF.setting), false)
      assert.deepEqual(await qAnswer(p, r, { toUser: true }), ACCEPTED)
      assert.equal((await cardOf(w, r)).state, IX.card.open)
    }
    assert.deepEqual(await qAnswer(p, q, { answers: FIXTURE.answer.red }), ACCEPTED)
    assert.deepEqual(batchOf(await resultOf(w, q.sid, q.id)), FIXTURE.answer.red)
    assert.deepEqual(await qAnswer(p, plan, { approve: true }), ACCEPTED)
    assert.match((await resultOf(w, plan.sid, plan.id)).text, IX.dsh.planApproved)
    await quiet()
    assert.deepEqual(handoffs(await pending(p.client)), [])
  })
}
