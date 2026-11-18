/**
 * F-INTERCEPT black-box cases (v3-tasks.md row F-INTERCEPT, wave W2; docs/test-design/v3/
 * 04-events-interception.md): EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-EP-05, EVT-DT-02, EVT-DT-03,
 * EVT-DT-04, EVT-ST-02. Requirements R-INT-01…09, R-EVT-03, R-CON-05; design §6.4; K3 events.d.ts.
 *
 * Techniques, and only these: Use Case first (EVT-UC-02, EVT-UC-03: each test names its flow), then
 * Equivalence Partitioning (EVT-EP-03, EVT-EP-05: one test per row/partition), Decision Table
 * (EVT-DT-02…04: one test per rule) and State Transition (EVT-ST-02: one test per transition row).
 * Boundary values sit inside them where the cases name one (priority −1 / 0 / 5, EVT-DT-02).
 *
 * Level: unit and integration as the cases state, over one Fishball DSH of real SDK parts with a
 * fake link, fake model and scripted interceptor plugins (world.mjs); crash windows use real
 * SIGKILLed processes (crash.mjs). The tests fail until F-INTERCEPT's module exists. Rows that need
 * a later task are `todo` and name it.
 *
 * Oracles, all public: "Fishball woken" = durable `user/message` admissions carrying the event in
 * the Fishball session log (S2's observable); "acked" = an `inbox_ack` receipt at the link; "in a
 * context" = any trace of the event's marker in a session log or a model request; "logged" = the
 * logger exporter's records.
 *
 * The user's decisions of 2026-11-14 ("1.B,2.B,3.A,4.A"), cited as "decision 2026-11-14 n", add the
 * cases of `registerDecisionCases` below; none of them changes an existing case's expectation.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { ledgerStates, runCrash, SCENARIO } from './crash.mjs'
import { CORE, DSH, EVENT_TYPE, FIXTURE, K3, LATER, LINK_REFUSAL, PROCESS_EVENT, TOOL, WAIT } from './constants.mjs'
import { busyGate, contributedType, eventually, makeEvent, newRoot, openWorld, removeRoot, startBusy, worldFor } from './world.mjs'
import { registerRfixEventCases } from './rfix.mjs'
import { registerMultiEventCases } from './multi.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({
  uc02: 'EVT-UC-02', uc03: 'EVT-UC-03', ep03: 'EVT-EP-03', ep05: 'EVT-EP-05',
  dt02: 'EVT-DT-02', dt03: 'EVT-DT-03', dt04: 'EVT-DT-04', st02: 'EVT-ST-02',
})
const CONTRIBUTED = contributedType()

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}
let counter = 0
/** A fresh event of `type` with a marker unique in this process. */
const nextEvent = (type, options) => makeEvent(type, ++counter, options)

// ------------------------------------------------------------------------------------------------
// Shared observations (each states one requirement oracle once).

/** R-EVT-03 / R-INT-02: how many times Fishball was woken for `event` (durable admissions). */
const wakes = async (world, event) => (await world.admissions(event.marker)).length
/** R-INT-08: the event's receipt reached the connector. */
const acked = (world, event) => world.link.acked(event.eventId)
/** R-INT-09: no trace of the event in any agent's context: session logs and model requests. */
async function assertOutOfContext(world, event, sessionIds = [FIXTURE.fishballSession]) {
  for (const sessionId of sessionIds) assert.deepEqual(await world.traces(event.marker, sessionId), [], `the event reached session ${sessionId}'s context`)
  assert.deepEqual(world.modelRequestsWith(event.marker), [], 'the event reached a model request')
}
/** Fishball got the event exactly once and it was acked (the fallback / no-match outcome). */
async function assertFishballOnce(world, event) {
  await world.settle()
  assert.equal(await wakes(world, event), 1, 'Fishball wakes for the event')
  assert.ok(acked(world, event), 'the event was not acked')
}
/** The interceptor kept the event: no Fishball wake, acked once. */
async function assertInterceptorOnly(world, event) {
  await world.settle()
  assert.equal(await wakes(world, event), 0, 'Fishball was woken for an intercepted event')
  assert.ok(acked(world, event), 'the intercepted event was not acked')
  await assertOutOfContext(world, event)
}
/** R-INT-03: warnings that name both fixture plugins, among `logs`. */
const tieWarnings = (logs) => logs.filter((l) => l.type === DSH.warn && l.text.includes(FIXTURE.pluginX) && l.text.includes(FIXTURE.pluginY))
/** The user's Stop at the step that claims `event`, before its admission (S2 row 8, S2-Q3). */
function stopWhenClaimed(world, event) {
  world.ctx.on(DSH.preStep, (input, next) => {
    if (JSON.stringify(input.messages).includes(event.marker)) world.agent.cancel(DSH.userCancel)
    return next()
  })
}
/** How often a plugin's handler saw `event`. */
const seenBy = (plugin, event) => plugin.seen.filter((s) => s.event.eventId === event.eventId).length

// ------------------------------------------------------------------------------------------------
// Scripted interceptor handlers (each a behaviour a case names).

const HANDLER = Object.freeze({
  /** Accepts and settles: the interceptor handles the event alone. */
  accept: async (_e, ctl) => { await ctl.accept() },
  /** Throws before accept (EVT-UC-02 E1, DT-04 rule 1). */
  throwBefore: () => { throw new Error('fbtest: handler throws before accept') },
  /** Rejects before accept. */
  rejectBefore: async () => { throw new Error('fbtest: handler rejects before accept') },
  /** Throws after accept, no commit (E1a, DT-04 rule 3). */
  throwAfterAccept: async (_e, ctl) => { await ctl.accept(); throw new Error('fbtest: handler throws after accept') },
  /** Accepts, then releases to Fishball (A2, EP-03 row 5). */
  release: async (e, ctl) => { await ctl.accept(); await ctl.release(e, { toFishball: true }) },
  /** Commits an answer that reaches the connector, then throws (DT-04 rule 5). */
  commitThenThrow: async (e, ctl) => {
    await ctl.accept()
    await ctl.commit(() => answer(e))
    throw new Error('fbtest: handler throws after its answer was sent')
  },
})
/** The interceptor's answer through core's link (R-INT-06): a K1 approval answer naming the event. */
let answerLink
const answer = (e) => answerLink.callTool(TOOL.approvalAnswer, { sessionId: e.sourceSessionId, approvalId: e.eventId, offerId: e.correlationId ?? e.eventId, answer: { decision: FIXTURE.answer } })

/** A handler whose run is held at `point` until the test releases it. */
function heldHandler(point) {
  const at = Promise.withResolvers()
  const go = Promise.withResolvers()
  const result = { accept: undefined, commit: undefined, release: undefined }
  const handler = async (e, ctl) => {
    if (point === 'beforeAccept') { at.resolve(ctl); await go.promise }
    result.accept = await ctl.accept()
    if (point === 'afterAccept') { at.resolve(ctl); await go.promise }
  }
  return { handler, at: at.promise, go: () => go.resolve(), result }
}

/** Publishes `event` and waits for core to have taken it (a harness wait). */
async function publish(world, event) {
  world.link.publish(event)
  await eventually(() => world.link.calls.some((c) => c.name === TOOL.inboxPoll), 'core polled after the hint')
}

/** One interceptor plugin X for `types`, plus optional registration fields. */
const pluginX = (world, handler, registration = {}, types = [CONTRIBUTED]) =>
  world.plugin({ pluginId: FIXTURE.pluginX, registrations: [{ types, ...registration }], handler })

export function registerInterceptCases(sdk) {
  // R-FIX-CORE (F11, F14): rfix.mjs.
  registerRfixEventCases(sdk)
  registerMultiEventCases(sdk)
  // ===================================================================== EVT-UC-02 (Use Case)
  row(sdk, ID.uc02, 'main', 'a contributed:demo.ping is accepted by X, acked after accept, no Fishball turn, not in context, logged', async (t) => {
    const world = await worldFor(t, sdk)
    answerLink = world.link
    const order = []
    const x = await pluginX(world, async (_e, ctl) => {
      order.push('accept-called')
      const ok = await ctl.accept()
      order.push(world.link.calls.filter((c) => c.name === TOOL.inboxAck).length > 0 ? 'acked-before-accept-resolved' : 'accept-resolved')
      assert.equal(ok, true)
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    assert.equal(seenBy(x, event), 1, 'X saw the event')
    assert.deepEqual(order, ['accept-called', 'accept-resolved'], 'core acked before accept resolved (R-INT-08)')
    assert.ok(world.logs.some((l) => l.text.includes(event.eventId)), 'nothing about the event in the background log (R-INT-09)')
  })
  row(sdk, ID.uc02, 'A1', 'a message with no registration starts exactly one Fishball turn', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(world.modelRequestsWith(event.marker).length, 1, 'model requests carrying the event')
  })
  row(sdk, ID.uc02, 'A3', 'a message during a Fishball turn is held and becomes exactly one new turn after it', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'the event is acked while Fishball is busy (delivery list)')
    assert.equal(await wakes(world, event), 0, 'the event was admitted into the running turn')
    gate.release()
    await assertFishballOnce(world, event)
    const busyRequest = world.requests.find((r) => r.includes(FIXTURE.busyText) && !r.includes(event.marker))
    assert.ok(busyRequest, 'the running turn saw the event (it must be the next turn only)')
  })
  row(sdk, ID.uc02, 'A2', 'X releases with toFishball: Fishball is woken once', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.release)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  row(sdk, ID.uc02, 'E1', 'X throws before accept: Fishball once, X does not see it again', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.throwBefore)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(seenBy(x, event), 1, 'X saw the event again')
  })
  row(sdk, ID.uc02, 'E1a', 'X throws after accept with no commit: Fishball once', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.throwAfterAccept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  crashRow(sdk, ID.uc02, 'E1b', 'restart with X\'s record open and X up: offered to X again with the same eventId, no Fishball wake', 'interceptorOpenUp', (r) => {
    assert.equal(r.offeredAgain, 1, 'X was not offered the open record after the restart')
    assert.equal(r.interceptorEffects, 1, 'X\'s effect (deduped by eventId)')
    assert.equal(r.admissions, 0, 'Fishball wakes')
    assert.equal(r.acked, true)
  })
  crashRow(sdk, ID.uc02, 'E1b (plugin off)', 'restart with X\'s record open and X off: Fishball once', 'interceptorOpenOff', (r) => {
    assert.equal(r.admissions, 1, 'Fishball wakes')
    assert.equal(r.acked, true)
  })
  crashRow(sdk, ID.uc02, 'E2', 'crash after acceptance, before the ack: the replay is dropped, exactly one wake in total', 'fishballBeforeAck', (r) => {
    assert.equal(r.admissions, 1, 'Fishball wakes in total')
    assert.equal(r.acked, true, 'acked after the restart')
  })
  crashRow(sdk, ID.uc02, 'E2a', 'crash during the Fishball turn: no second turn, no notice turn; DSH\'s crash notice on the turn', 'fishballMidTurn', (r) => {
    assert.equal(r.admissions, 1, 'admissions (the interrupted turn is the one wake)')
    assert.equal(r.requestsAfterRestart, 0, 'a turn ran after the restart (re-wake or notice turn)')
    assert.equal(r.interruptedTurns, 1, 'DSH\'s crash notice (interrupted turn closer)')
  })
  row(sdk, ID.uc02, 'E3', 'event arrives while Fishball is busy, the user stops the turn cleanly: delivered as the next turn', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'the event is accepted while Fishball is busy')
    world.agent.cancel(DSH.userCancel)
    await assertFishballOnce(world, event)
  })
  row(sdk, ID.uc02, 'E4', 'the user stops the turn that claimed the event before admission: discarded (acked, no retry, no wake)', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    stopWhenClaimed(world, event)
    await publish(world, event)
    await world.settle()
    assert.equal(await wakes(world, event), 0, 'Fishball admitted a stopped event')
    assert.ok(acked(world, event), 'a discarded event is acked')
    assert.equal(world.link.answers().length, 0, 'the discard settled something at the connector (R-CON-05)')
  })
  row(sdk, ID.uc02, 'E4 (inbox removal)', 'the user removes the queued Fishball event from DSH\'s inbox: discarded', null, LATER.e2e)
  row(sdk, ID.uc02, 'post', 'each event is handled once by one side and acked once', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept)
    const intercepted = nextEvent(CONTRIBUTED)
    const toFishball = nextEvent(EVENT_TYPE.message)
    await publish(world, intercepted)
    world.link.publish(toFishball)
    await world.settle()
    assert.equal(seenBy(x, intercepted) + (await wakes(world, intercepted)), 1, 'intercepted event handled by one side once')
    assert.equal(seenBy(x, toFishball) + (await wakes(world, toFishball)), 1, 'message handled by one side once')
    const state = world.link.state()
    assert.deepEqual([state.acked[intercepted.eventId], state.acked[toFishball.eventId]], [1, 1], 'acked once each')
  })

  // ===================================================================== EVT-UC-03 (Use Case)
  row(sdk, ID.uc03, 'main', 'intercept returns dispose; ctl has exactly accept, commit, release; after dispose notices go to Fishball', async (t) => {
    const world = await worldFor(t, sdk)
    let keys
    const x = await pluginX(world, async (_e, ctl) => { keys = Object.keys(ctl).sort(); await ctl.accept() }, {}, [EVENT_TYPE.notice])
    const first = nextEvent(EVENT_TYPE.notice)
    await publish(world, first)
    await assertInterceptorOnly(world, first)
    assert.deepEqual(keys, [...K3.controller].sort(), 'ctl members')
    await x.off()
    const second = nextEvent(EVENT_TYPE.notice)
    world.link.publish(second)
    await assertFishballOnce(world, second)
    assert.equal(seenBy(x, second), 0, 'a disposed registration still received the event')
  })
  row(sdk, ID.uc03, 'main (dispose)', 'the returned dispose is a function; calling it stops matching', async (t) => {
    const world = await worldFor(t, sdk)
    const dispose = world.core.intercept({ pluginId: FIXTURE.pluginX, types: [EVENT_TYPE.notice] }, HANDLER.accept)
    assert.equal(typeof dispose, 'function', 'intercept returns ' + typeof dispose)
    dispose()
    const event = nextEvent(EVENT_TYPE.notice)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  row(sdk, ID.uc03, 'A1', 'a second plugin with the same types and priority 0: accepted, one warning naming both, the first still wins', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept, {}, [EVENT_TYPE.notice])
    const before = world.logs.length
    const y = await world.plugin({ pluginId: FIXTURE.pluginY, registrations: [{ types: [EVENT_TYPE.notice], priority: K3.defaultPriority }], handler: HANDLER.accept })
    assert.equal(tieWarnings(world.logs.slice(before)).length, 1, 'warnings naming both plugins')
    const event = nextEvent(EVENT_TYPE.notice)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    assert.deepEqual([seenBy(x, event), seenBy(y, event)], [1, 0], 'the first registration wins')
  })
  row(sdk, ID.uc03, 'E1', 'disposed while an event is in flight to it: the event goes to Fishball', async (t) => {
    const world = await worldFor(t, sdk)
    const held = heldHandler('beforeAccept')
    const x = await pluginX(world, held.handler, {}, [EVENT_TYPE.notice])
    const event = nextEvent(EVENT_TYPE.notice)
    await publish(world, event)
    await held.at
    await x.off()
    held.go()
    await assertFishballOnce(world, event)
    assert.equal(held.result.accept, false, 'accept after dispose was not fenced')
  })
  row(sdk, ID.uc03, 'post', 'priority defaults to 0: a later registration at priority 0 ties with one registered without priority', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept, {}, [EVENT_TYPE.notice])
    const y = await world.plugin({ pluginId: FIXTURE.pluginY, registrations: [{ types: [EVENT_TYPE.notice], priority: K3.defaultPriority }], handler: HANDLER.accept })
    const event = nextEvent(EVENT_TYPE.notice)
    await publish(world, event)
    await world.settle()
    assert.deepEqual([seenBy(x, event), seenBy(y, event)], [1, 0], 'a default-priority registration lost to an explicit default (it is not 0)')
  })

  // ===================================================================== EVT-EP-03 (EP)
  row(sdk, ID.ep03, 1, 'no registration for the type → Fishball, exactly one turn', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.accept)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  row(sdk, ID.ep03, 2, 'registration for the type, filter true → interceptor, no turn', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept, { filter: () => true })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    assert.equal(seenBy(x, event), 1)
  })
  row(sdk, ID.ep03, 3, 'registration for the type, filter false → Fishball', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept, { filter: () => false })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(seenBy(x, event), 0)
  })
  row(sdk, ID.ep03, 4, 'filter throws → no match → Fishball (and the next match when one exists)', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept, { filter: () => { throw new Error('fbtest: filter throws') } })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(seenBy(x, event), 0)
  })
  row(sdk, ID.ep03, 5, 'interceptor accepts then releases toFishball → Fishball, one turn', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.release)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  row(sdk, ID.ep03, '6 (disabled)', 'the interceptor\'s plugin is disabled → Fishball', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept)
    await x.off()
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(seenBy(x, event), 0)
  })
  row(sdk, ID.ep03, '6 (not ready)', 'the interceptor\'s plugin is not ready (still loading) → Fishball', null, LATER.wire)
  row(sdk, ID.ep03, 7, 'external agent: events unchanged, no interception', null, LATER.mailbox)

  // ===================================================================== EVT-EP-05 (EP)
  row(sdk, ID.ep05, 1, 'Fishball\'s next turn holds nothing about an event an interceptor handled alone', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    const later = nextEvent(EVENT_TYPE.message)
    world.link.publish(later)
    await assertFishballOnce(world, later)
    await assertOutOfContext(world, event)
  })
  row(sdk, ID.ep05, 2, 'no other agent session in the Fishball DSH holds anything about it', async (t) => {
    const world = await worldFor(t, sdk, { otherSession: true })
    await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    world.other.followup(world.userMessage(FIXTURE.otherText, FIXTURE.laterId))
    await world.settle()
    await assertOutOfContext(world, event, [FIXTURE.fishballSession, FIXTURE.otherSession])
  })
  row(sdk, ID.ep05, 3, 'core\'s acceptance and delivery records are internal: never in any context', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.accept)
    const intercepted = nextEvent(CONTRIBUTED)
    await publish(world, intercepted)
    const delivered = nextEvent(EVENT_TYPE.message)
    world.link.publish(delivered)
    await assertFishballOnce(world, delivered)
    // Delivering the other event to Fishball brings no record of the intercepted one with it.
    await assertOutOfContext(world, intercepted)
  })
  row(sdk, ID.ep05, 4, 'the background log has acceptance, commit and outcome entries; no token or payload secret', async (t) => {
    const world = await worldFor(t, sdk)
    answerLink = world.link
    const secret = FIXTURE.secret + counter
    await pluginX(world, async (e, ctl) => { await ctl.accept(); await ctl.commit(() => answer(e)) })
    const event = nextEvent(CONTRIBUTED, { secret })
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    const entries = world.logsWith(event.eventId)
    // One entry each for the acceptance, the commit and the outcome (R-INT-09): at least three, distinct.
    assert.ok(new Set(entries.map((e) => e.text)).size >= 3, 'log entries for the event: ' + JSON.stringify(entries))
    assert.deepEqual(world.logsWith(secret), [], 'a payload secret was logged (R-SEC-02)')
  })
  row(sdk, ID.ep05, 5, 'after release(toFishball) the event appears in Fishball\'s context once, as the released event', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.release)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(world.modelRequestsWith(event.marker).length, 1, 'model requests carrying the released event')
  })

  // ===================================================================== EVT-DT-02 (Decision Table)
  /** R1 registered first, R2 second, both for CONTRIBUTED; returns who received the event. */
  async function choose(t, r1, r2) {
    const world = await worldFor(t, sdk)
    const p1 = await world.plugin({ pluginId: FIXTURE.pluginX, registrations: [{ types: [CONTRIBUTED], ...r1.registration }], handler: r1.handler ?? HANDLER.accept })
    const p2 = r2 === undefined ? undefined : await world.plugin({ pluginId: FIXTURE.pluginY, registrations: [{ types: [CONTRIBUTED], ...r2.registration }], handler: r2.handler ?? HANDLER.accept })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    return { world, event, r1: seenBy(p1, event), r2: p2 === undefined ? 0 : seenBy(p2, event), fishball: await wakes(world, event) }
  }
  const P0 = { priority: K3.defaultPriority }
  // Fixture priorities around the default: above it, and below it (rule 7 asks whether negatives are allowed).
  const above = K3.defaultPriority + 5
  const below = K3.defaultPriority - 1
  const yes = { filter: () => true }
  const no = { filter: () => false }
  const boom = { filter: () => { throw new Error('fbtest: filter throws') } }
  const DT02 = [
    [1, 'equal priority, both filters true → R1 (earliest); one warning at R2\'s registration', { registration: { ...P0, ...yes } }, { registration: { ...P0, ...yes } }, { r1: 1, r2: 0, fishball: 0 }],
    [2, 'R2 has the higher priority → R2', { registration: { ...P0, ...yes } }, { registration: { priority: above, ...yes } }, { r1: 0, r2: 1, fishball: 0 }],
    [3, 'R1 has the higher priority → R1', { registration: { priority: above, ...yes } }, { registration: { ...P0, ...yes } }, { r1: 1, r2: 0, fishball: 0 }],
    [4, 'higher R1 filter false → R2', { registration: { priority: above, ...no } }, { registration: { ...P0, ...yes } }, { r1: 0, r2: 1, fishball: 0 }],
    [5, 'higher R1 filter throws → R2', { registration: { priority: above, ...boom } }, { registration: { ...P0, ...yes } }, { r1: 0, r2: 1, fishball: 0 }],
    [6, 'both filters false → Fishball', { registration: { ...P0, ...no } }, { registration: { ...P0, ...no } }, { r1: 0, r2: 0, fishball: 1 }],
    [7, 'one registration at a negative priority (K3: any finite number) → R1', { registration: { priority: below, ...yes } }, undefined, { r1: 1, r2: 0, fishball: 0 }],
    [8, 'the chosen R1 matches and its handler throws → Fishball, not R2 (R-INT-04)', { registration: { priority: above, ...yes }, handler: HANDLER.throwBefore }, { registration: { ...P0, ...yes } }, { r1: 1, r2: 0, fishball: 1 }],
  ]
  for (const [rule, title, r1, r2, expected] of DT02) {
    row(sdk, ID.dt02, rule, title, async (t) => {
      const got = await choose(t, r1, r2)
      assert.deepEqual({ r1: got.r1, r2: got.r2, fishball: got.fishball }, expected)
      if (rule === 1) {
        assert.equal(tieWarnings(got.world.logs).length, 1, 'warnings naming both plugins')
      }
    })
  }

  // ===================================================================== EVT-DT-03 (Decision Table)
  row(sdk, ID.dt03, 1, 'Fishball accepted, no crash: acked after acceptance, one turn', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  crashRow(sdk, ID.dt03, 2, 'Fishball accepted, crash before ack: acked after restart once, one turn in total', 'fishballBeforeAck', (r) => {
    assert.equal(r.admissions, 1)
    assert.equal(r.acked, true)
  })
  crashRow(sdk, ID.dt03, 3, 'crash before acceptance: acked after the restart\'s acceptance, one turn', 'fishballBeforeAcceptance', (r) => {
    assert.equal(r.admissions, 1)
    assert.equal(r.acked, true)
  })
  row(sdk, ID.dt03, 4, 'interceptor accepted, no crash: acked after acceptance, no Fishball turn', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
  })
  crashRow(sdk, ID.dt03, 5, 'interceptor accepted, crash before ack: acked after restart, no Fishball turn', 'interceptorBeforeAck', (r) => {
    assert.equal(r.admissions, 0)
    assert.equal(r.acked, true)
    assert.equal(r.interceptorEffects, 1, 'the interceptor\'s effect (deduped by eventId)')
  })
  row(sdk, ID.dt03, 6, 'Fishball busy: acked after acceptance; one turn as the next turn once idle; nothing in the running turn', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'acked while Fishball is busy')
    assert.equal(await wakes(world, event), 0, 'admitted into the running turn')
    gate.release()
    await assertFishballOnce(world, event)
    const log = await world.sessionLog()
    const runningTurnEnd = log.findIndex((e) => e.type === DSH.turnEnd)
    const admission = log.findIndex((e) => e.type === DSH.userMessage && JSON.stringify(e.data).includes(event.marker))
    assert.ok(admission > runningTurnEnd, 'the event was admitted before the running turn ended')
  })
  row(sdk, ID.dt03, 7, 'Fishball busy, the user stops the running turn cleanly: one turn as the next turn; not lost', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'acked while Fishball is busy')
    world.agent.cancel(DSH.userCancel)
    await assertFishballOnce(world, event)
  })
  crashRow(sdk, ID.dt03, 8, 'accept resolved, crash before the handler settles: re-offered to the same plugin (dedupe), no turn', 'interceptorOpenUp', (r) => {
    assert.equal(r.offeredAgain, 1)
    assert.equal(r.admissions, 0)
    assert.equal(r.interceptorEffects, 1)
  })
  crashRow(sdk, ID.dt03, '8 (plugin off)', 'accept resolved, crash, plugin off at restart: Fishball once', 'interceptorOpenOff', (r) => {
    assert.equal(r.admissions, 1)
  })
  crashRow(sdk, ID.dt03, 9, 'admitted by followup, turn started, crash: one turn; no new turn, re-delivery or notice turn after restart', 'fishballMidTurn', (r) => {
    assert.equal(r.admissions, 1)
    assert.equal(r.requestsAfterRestart, 0)
    assert.equal(r.interruptedTurns, 1, 'DSH\'s crash notice on that turn')
    assert.equal(r.acked, true)
  })

  // ===================================================================== EVT-DT-04 (Decision Table)
  /** Runs one rule: X with `handler`, then the outcome assertions in `check`. */
  const dt04 = (rule, title, setup) => row(sdk, ID.dt04, rule, title, async (t) => {
    const world = await worldFor(t, sdk)
    answerLink = world.link
    await setup(world)
  })
  /** Fishball once, and no interceptor answer at the connector ("at most Fishball's"). */
  async function fellBack(world, event) {
    await assertFishballOnce(world, event)
    assert.deepEqual(world.link.answers(), [], 'the interceptor\'s answer reached the connector after a fallback')
  }
  dt04(1, 'not accepted, handler throws → Fishball once', async (world) => {
    await pluginX(world, HANDLER.throwBefore)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await fellBack(world, event)
  })
  dt04('1 (rejects)', 'not accepted, handler rejects → Fishball once', async (world) => {
    await pluginX(world, HANDLER.rejectBefore)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await fellBack(world, event)
  })
  dt04(2, 'not accepted, plugin off / disposed while offered → Fishball once', async (world) => {
    const held = heldHandler('beforeAccept')
    const x = await pluginX(world, held.handler)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await held.at
    await x.off()
    held.go()
    await fellBack(world, event)
  })
  dt04(3, 'accepted, no commit, handler throws → Fishball once', async (world) => {
    await pluginX(world, HANDLER.throwAfterAccept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await fellBack(world, event)
  })
  dt04(4, 'accepted, no commit, plugin disabled mid-decision → Fishball once; a late commit is fenced', async (world) => {
    const held = heldHandler('afterAccept')
    const x = await pluginX(world, held.handler)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    const ctl = await held.at
    await x.off()
    await fellBack(world, event)
    const late = await ctl.commit(() => answer(event))
    assert.deepEqual(late, { ok: false, code: K3.fenced }, 'a commit after the fallback')
    held.go()
    assert.deepEqual(world.link.answers(), [], 'the fenced send ran')
  })
  dt04(5, 'commit reached the connector, handler throws after sending → stays with the interceptor; Fishball gets no turn', async (world) => {
    await pluginX(world, HANDLER.commitThenThrow)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    assert.equal(await wakes(world, event), 0, 'Fishball was woken after a committed answer')
    assert.equal(world.link.answers().length, 1, 'answers at the connector')
    assert.ok(acked(world, event))
  })
  dt04(6, 'commit never reached the connector (send rejects) → fenced: Fishball once, never both', async (world) => {
    let result
    await pluginX(world, async (_e, ctl) => {
      await ctl.accept()
      result = await ctl.commit(() => Promise.reject(new Error('fbtest: the send failed before the request left')))
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await fellBack(world, event)
    assert.deepEqual(result, { ok: false, code: K3.disconnected }, 'commit resolves a rejected send as disconnected, never rejects')
  })
  dt04('6 (disconnected)', 'send answers disconnected → Fishball once', async (world) => {
    await pluginX(world, async (_e, ctl) => {
      await ctl.accept()
      await ctl.commit(async () => ({ ok: false, code: K3.disconnected }))
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await fellBack(world, event)
  })
  crashRow(sdk, ID.dt04, 7, 'accepted, no commit, Fishball DSH restart, plugin up → the same plugin again (dedupe by eventId)', 'interceptorOpenUp', (r) => {
    assert.equal(r.offeredAgain, 1)
    assert.equal(r.admissions, 0)
    assert.equal(r.interceptorEffects, 1)
  })
  crashRow(sdk, ID.dt04, 8, 'accepted, no commit, Fishball DSH restart, plugin off → Fishball once', 'interceptorOpenOff', (r) => {
    assert.equal(r.admissions, 1)
  })
  dt04(9, 'acted before accept → treated as not accepted: on a throw, Fishball once', async (world) => {
    await pluginX(world, async (e) => {
      await answer(e)
      throw new Error('fbtest: acted before accept, then failed')
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })

  // ===================================================================== EVT-ST-02 (State Transition)
  const st = (n, title, fn, todo) => row(sdk, ID.st02, n, title, fn, todo)
  st(1, 'Polled → ledger record → Recorded: a polled event is recorded before any receiver sees it (no lost event on a later failure)', async (t) => {
    const world = await worldFor(t, sdk)
    let acksAtHandler
    await pluginX(world, async (_e, ctl) => { acksAtHandler = world.link.calls.filter((c) => c.name === TOOL.inboxAck).length; await ctl.accept() })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    assert.equal(acksAtHandler, 0, 'acked before the receiver ran')
  })
  st(2, 'Recorded → match found → OfferedTo(R)', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    assert.equal(seenBy(x, event), 1)
    assert.equal(x.seen[0].event.eventId, event.eventId, 'the offered event keeps its eventId')
  })
  st(3, 'Recorded → no match → ToFishball', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  st(4, 'OfferedTo(R) → accept resolves → Open(R) → ack; the record stays open until the handler settles', async (t) => {
    const world = await worldFor(t, sdk)
    const held = heldHandler('afterAccept')
    await pluginX(world, held.handler)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await held.at
    assert.equal(held.result.accept, true, 'accept resolved')
    await eventually(() => acked(world, event), 'acked once accept resolved, before the handler settled')
    held.go()
    await assertInterceptorOnly(world, event)
  })
  st(5, 'OfferedTo(R) → throw before accept → ToFishball once', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.throwBefore)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  st('5a', 'Open(R), no commit begun → throw → ToFishball once', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.throwAfterAccept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
  })
  st('5b', 'Open(R) → commit begins → Committing(R): release is fenced while the send runs', async (t) => {
    const world = await worldFor(t, sdk)
    answerLink = world.link
    let releaseDuringSend
    await pluginX(world, async (e, ctl) => {
      await ctl.accept()
      await ctl.commit(async () => { releaseDuringSend = await ctl.release(e, { toFishball: true }); return answer(e) })
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    assert.equal(releaseDuringSend, false, 'release during a commit')
  })
  st('5c', 'Committing(R) → the interceptor fails → committed or fenced, never both; not sent to Fishball', async (t) => {
    const world = await worldFor(t, sdk)
    answerLink = world.link
    const x = await pluginX(world, async (e, ctl) => {
      await ctl.accept()
      await ctl.commit(async () => { await x.off(); return answer(e) })
    })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await world.settle()
    assert.equal(world.link.answers().length + (await wakes(world, event)), 1, 'committed and woken Fishball, or neither')
    assert.equal(await wakes(world, event), 0, 'an answer that reached the connector fell back to Fishball')
  })
  st('5d', 'Open(R) or Committing(R) → handler settles → Closed(R): log only, nothing in any context', async (t) => {
    const world = await worldFor(t, sdk)
    await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    assert.ok(world.logsWith(event.eventId).length > 0, 'nothing logged about the closed record')
  })
  crashRow(sdk, ID.st02, '5e', 'Open(R) → restart, R up → OfferedTo(R) again, same eventId', 'interceptorOpenUp', (r) => {
    assert.equal(r.offeredAgain, 1)
    assert.equal(r.admissions, 0)
  })
  crashRow(sdk, ID.st02, '5f', 'Open(R) → restart, R off → ToFishball once', 'interceptorOpenOff', (r) => {
    assert.equal(r.admissions, 1)
  })
  st(6, 'Open(R) → release(toFishball) → ToFishball; release resolves true', async (t) => {
    const world = await worldFor(t, sdk)
    let released
    await pluginX(world, async (e, ctl) => { await ctl.accept(); released = await ctl.release(e, { toFishball: true }) })
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertFishballOnce(world, event)
    assert.equal(released, true)
  })
  st(7, 'ToFishball → durable acceptance → AcceptedBy(Fishball) → in the delivery list → ack', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    // Acked while only in the delivery list: no admission yet.
    await eventually(() => acked(world, event), 'acked from the delivery list')
    assert.equal(await wakes(world, event), 0)
    gate.release()
    await assertFishballOnce(world, event)
  })
  st(10, 'AcceptedBy(Fishball), agent fully idle → runMaintenance → Admitted → one turn', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertFishballOnce(world, event)
    const admission = (await world.admissions(event.marker))[0]
    assert.equal(world.requests.filter((r) => r.includes(event.marker)).length, 1, 'one turn')
    assert.ok(admission, 'admitted')
  })
  st(11, 'AcceptedBy(Fishball), agent busy → the turn ends, nothing queued → Admitted as the next turn', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'accepted while busy')
    gate.release()
    await assertFishballOnce(world, event)
  })
  st('11 (queued)', 'AcceptedBy(Fishball), agent busy with a user turn queued → admitted only once fully idle, after the queued turn', async (t) => {
    const gate = busyGate()
    const world = await worldFor(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await eventually(() => acked(world, event), 'accepted while busy')
    world.agent.followup(world.userMessage(FIXTURE.laterText, FIXTURE.laterId))
    gate.release()
    await assertFishballOnce(world, event)
    const log = await world.sessionLog()
    const at = (needle) => log.findIndex((e) => e.type === DSH.userMessage && JSON.stringify(e.data).includes(needle))
    assert.ok(at(event.marker) > at(FIXTURE.laterText), 'the event was admitted before the queued user turn (not fully idle)')
  })
  crashRow(sdk, ID.st02, '11a', 'Admitted, turn running → crash → Done (interrupted): no re-wake after restart', 'fishballMidTurn', (r) => {
    assert.equal(r.admissions, 1)
    assert.equal(r.requestsAfterRestart, 0)
  })
  st(12, 'AcceptedBy(Fishball), not admitted → the user stops the Fishball turn → Discarded: acked, no retry, no wake; offers stay live', async (t) => {
    const world = await worldFor(t, sdk)
    const event = nextEvent(EVENT_TYPE.permission)
    stopWhenClaimed(world, event)
    await publish(world, event)
    await world.settle()
    assert.equal(await wakes(world, event), 0, 'a stopped event was admitted')
    assert.ok(acked(world, event))
    assert.deepEqual(world.link.answers(), [], 'the discard answered the offer (it must stay live at the connector)')
    // No retry: a later idle edge does not bring it back.
    const later = nextEvent(EVENT_TYPE.message)
    world.link.publish(later)
    await assertFishballOnce(world, later)
    assert.equal(await wakes(world, event), 0, 'the discarded event was retried')
  })
  st(8, 'Recorded → replay with a known eventId → Recorded (dropped)', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept)
    const intercepted = nextEvent(CONTRIBUTED)
    const delivered = nextEvent(EVENT_TYPE.message)
    // The connector loses the acks, so both events are polled again (a replay, same identity).
    world.link.hooks.loseAck = true
    await publish(world, intercepted)
    world.link.publish(delivered)
    await world.settle()
    world.link.hint()
    await world.settle()
    assert.equal(seenBy(x, intercepted), 1, 'the replay was offered to the interceptor again')
    assert.equal(await wakes(world, delivered), 1, 'the replay woke Fishball again')
  })
  st(9, 'Closed(R) → R\'s plugin then fails → Closed(R): never re-dispatched', async (t) => {
    const world = await worldFor(t, sdk)
    const x = await pluginX(world, HANDLER.accept)
    const event = nextEvent(CONTRIBUTED)
    await publish(world, event)
    await assertInterceptorOnly(world, event)
    await x.off()
    await world.settle()
    assert.equal(await wakes(world, event), 0, 'a closed record was re-dispatched to Fishball')
  })

  registerDecisionCases(sdk)
  registerCloseCases(sdk)
}

// ------------------------------------------------------------------------------------------------
// close() while an offer is in flight (regression: the offer's tail touched the closed ledger).

/** How a held `send` settles once let go: K3's two "never reached the connector" outcomes. */
const SEND_OUTCOME = Object.freeze({
  disconnected: () => ({ ok: false, code: LINK_REFUSAL.disconnected }),
  rejects: () => { throw new Error(FIXTURE.fault) },
})
/**
 * A handler held in flight until the test lets it go: it accepts first when `accepts` (so the
 * record is open at close time, else still offered), then returns or, when `throws`, throws.
 * With `acceptsLate` it calls `accept` once let go (`result.lateAccept`). With `sends` it also
 * commits, and its `send` is what is held (the record is committing at close time); once let go,
 * `send` settles as `SEND_OUTCOME[sends]` and the handler returns.
 * `at` resolves with accept's result (undefined when it never accepts); `settled` once it ended;
 * `result.sendStarted` and `result.commit` (`{resolved}` or `{rejected}`) record the commit.
 */
function inFlightHandler({ accepts, throws, sends, acceptsLate }) {
  const at = Promise.withResolvers()
  const go = Promise.withResolvers()
  const settled = Promise.withResolvers()
  const result = { sendStarted: false, commit: undefined, lateAccept: undefined }
  const handler = async (_e, ctl) => {
    try {
      const accepted = accepts ? await ctl.accept() : undefined
      if (sends === undefined) {
        at.resolve(accepted)
        await go.promise
        if (acceptsLate) result.lateAccept = await ctl.accept()
      } else {
        const send = async () => { result.sendStarted = true; at.resolve(accepted); await go.promise; return SEND_OUTCOME[sends]() }
        // A commit fenced before its send still lets the test go on (the harness check then fails).
        const committed = ctl.commit(send).finally(() => at.resolve(accepted))
        result.commit = await committed.then((value) => ({ resolved: value }), (error) => ({ rejected: String(error) }))
      }
      if (throws) throw new Error(FIXTURE.fault)
    } finally { settled.resolve() }
  }
  return { handler, at: at.promise, go: () => go.resolve(), settled: settled.promise, result }
}
/** Lets a settled handler's tail run to its end: a few event-loop turns. */
async function drainTurns() {
  for (let turn = 0; turn < WAIT.immediateTurns; turn++) await new Promise((resolve) => setImmediate(resolve))
}
/** R-INT-08's observable: the `inbox_ack` calls at the link whose receipts name `event`. */
const ackCallsFor = (world, event) =>
  world.link.calls.filter((c) => c.name === TOOL.inboxAck && (c.args.receipts ?? []).some((r) => r.eventId === event.eventId)).length
/** An interceptor registered straight through `service.intercept`: its value is the disposer. */
const interceptDirectly = (world, handler) => world.core.intercept({ pluginId: FIXTURE.pluginX, types: [CONTRIBUTED] }, handler)

/**
 * A world whose ledger writes are split at core's close(): `writes.beforeClose` / `.afterClose`.
 * `close()` marks the split and closes core; `watch(act)` runs `act`, gives its tail a few turns
 * and returns the messages of every unhandledRejection raised meanwhile (listener scoped to it).
 */
async function closeProbe(t, sdk) {
  let closing = false
  const writes = { beforeClose: [], afterClose: [] }
  const seam = { ledgerWrite: ({ op }) => { (closing ? writes.afterClose : writes.beforeClose).push(op) } }
  const world = await worldFor(t, sdk, { seam })
  async function watch(act) {
    const unhandled = []
    const onUnhandled = (reason) => { unhandled.push(String(reason?.message ?? reason)) }
    process.on(PROCESS_EVENT.unhandledRejection, onUnhandled)
    try {
      await act()
      await drainTurns()
    } finally { process.off(PROCESS_EVENT.unhandledRejection, onUnhandled) }
    return unhandled
  }
  return { world, writes, watch, close: () => { closing = true; return world.core.close() } }
}
/**
 * A close probe whose interceptor holds one event in flight (`inFlightHandler(behaviour)`): the
 * record is offered or, with `behaviour.accepts`, open and acked. `register(world, handler)` makes
 * the interceptor (default plugin X); what it returns is `registered`.
 */
async function heldAtClose(t, sdk, behaviour, register = pluginX) {
  const probe = await closeProbe(t, sdk)
  const { world, writes } = probe
  const held = inFlightHandler(behaviour)
  const registered = await register(world, held.handler)
  const event = nextEvent(CONTRIBUTED)
  await publish(world, event)
  const accepted = await held.at
  await world.settle()
  // Harness: the record is in the rule's state and the write guard is wired.
  assert.equal(accepted, behaviour.accepts ? true : undefined, 'harness: accept before close()')
  assert.equal(acked(world, event), behaviour.accepts, 'harness: acked (open) or not (offered) before close()')
  assert.ok(writes.beforeClose.length > 0, 'harness: the ledger write guard saw no write')
  return { ...probe, held, event, registered }
}

/**
 * Decision table over the in-flight state at close(): record offered (never accepted) or open
 * (accepted, acked) × the handler then returns or throws. Every rule: once the handler settles
 * after close(), no ledger write happens (the record keeps the state it had at close) and no
 * unhandledRejection is raised. Without close() the same four rules are EVT-ST-02 rows 4, 5, 5a
 * and 5d above (the record moves to Fishball or closes). The committing rules hold the handler's
 * `send` across close(); it then settles as one of K3's "never reached the connector" outcomes
 * (which without close() is EVT-DT-04 rule 6 / 6 (disconnected)): `commit` still resolves (K3:
 * commit never rejects) and the record stays committing.
 *
 * Rows 5i–5k are the controller and registration paths that must also do nothing once close()
 * has run: a late `accept` (5i), the ack `accept` defers, on the boundary where close() comes
 * between accept resolving and that ack going out (5j; the other side is row 4), and a dispose of
 * an interceptor holding an offered or open record (5k; without close() EVT-UC-03 E1 / DT-04 rule 2).
 */
function registerCloseCases(sdk) {
  const IN_FLIGHT = [
    ['offered, returns', { accepts: false, throws: false }],
    ['offered, throws', { accepts: false, throws: true }],
    ['open, returns', { accepts: true, throws: false }],
    ['open, throws', { accepts: true, throws: true }],
    ['committing, send answers disconnected', { accepts: true, throws: false, sends: 'disconnected' }],
    ['committing, send rejects', { accepts: true, throws: false, sends: 'rejects' }],
  ]
  for (const [label, behaviour] of IN_FLIGHT) {
    const committing = behaviour.sends !== undefined
    const settles = committing ? label.replace(',', ' and its') + ', then the handler returns,' : label.replace(',', ' and the handler')
    row(sdk, ID.st02, `5h (close() in flight, ${label})`, `the record is ${settles} only after core's close(): no ledger write after close(), no unhandledRejection${committing ? ', commit resolves' : ''}`, async (t) => {
      const { world, writes, watch, close, held, event } = await heldAtClose(t, sdk, behaviour)
      if (committing) {
        assert.equal(held.result.sendStarted, true, 'harness: send was not in flight at close() (commit fenced: ' + JSON.stringify(held.result.commit) + ')')
        assert.deepEqual(ledgerStates(world, event), [CORE.committing], 'harness: the record\'s state at close()')
      }
      const unhandled = await watch(async () => { await close(); held.go(); await held.settled })
      assert.deepEqual(unhandled, [], 'unhandledRejection after the handler settled past close()')
      assert.deepEqual(writes.afterClose, [], 'ledger writes after close()')
      if (committing) assert.ok(held.result.commit !== undefined && 'resolved' in held.result.commit, 'commit did not resolve (K3: commit never rejects): ' + JSON.stringify(held.result.commit))
    })
  }

  row(sdk, ID.st02, '5i (accept after close(), offered)', 'a handler holding an offered event calls accept only after core\'s close(): no ack, no ledger write after close(), no unhandledRejection', async (t) => {
    const { world, writes, watch, close, held, event } = await heldAtClose(t, sdk, { accepts: false, throws: false, acceptsLate: true })
    const unhandled = await watch(async () => { await close(); held.go(); await held.settled })
    assert.deepEqual(unhandled, [], 'unhandledRejection after accept past close()')
    assert.equal(ackCallsFor(world, event), 0, 'inbox_ack calls for an event accepted after close()')
    assert.deepEqual(writes.afterClose, [], 'ledger writes after close()')
  })

  row(sdk, ID.st02, '5j (close() before accept\'s deferred ack)', 'close() runs in the handler\'s continuation of accept, before the ack accept scheduled goes out: no ack after close(), no ledger write after close(), no unhandledRejection', async (t) => {
    const { world, writes, watch, close } = await closeProbe(t, sdk)
    const event = nextEvent(CONTRIBUTED)
    const settled = Promise.withResolvers()
    const seenAtClose = { accept: undefined, acks: undefined }
    await pluginX(world, async (_e, ctl) => {
      try {
        seenAtClose.accept = await ctl.accept()
        seenAtClose.acks = ackCallsFor(world, event)
        await close()
      } finally { settled.resolve() }
    })
    const unhandled = await watch(async () => { await publish(world, event); await settled.promise })
    // Harness: accept won and its ack had not gone out when close() ran (else this is row 4).
    assert.deepEqual(seenAtClose, { accept: true, acks: 0 }, 'harness: accept and the inbox_ack calls when close() ran')
    assert.ok(writes.beforeClose.length > 0, 'harness: the ledger write guard saw no write')
    assert.deepEqual(unhandled, [], 'unhandledRejection after close() past accept')
    assert.equal(ackCallsFor(world, event), 0, 'inbox_ack calls for the event after close()')
    assert.deepEqual(writes.afterClose, [], 'ledger writes after close()')
  })

  const HOLDING = [['offered', { accepts: false, throws: false }], ['open', { accepts: true, throws: false }]]
  for (const [label, behaviour] of HOLDING) {
    row(sdk, ID.st02, `5k (dispose after close(), ${label})`, `an interceptor holding an ${label} event is disposed (service.intercept's disposer) only after core's close(): no fallback to Fishball, no ledger write, no unhandledRejection`, async (t) => {
      const { world, writes, watch, close, held, event, registered: dispose } = await heldAtClose(t, sdk, behaviour, interceptDirectly)
      // The handler is released only at cleanup, so nothing but the dispose runs after close().
      t.after(held.go)
      const unhandled = await watch(async () => { await close(); dispose() })
      assert.deepEqual(unhandled, [], 'unhandledRejection after dispose past close()')
      assert.deepEqual(writes.afterClose, [], 'ledger writes after close()')
      await world.settle()
      assert.equal(await wakes(world, event), 0, 'Fishball woken for an event disposed after close()')
    })
  }
}

// ------------------------------------------------------------------------------------------------
// The user's decisions 2026-11-14 ("1.B,2.B,3.A,4.A").

const D = Object.freeze({
  d1: 'decision 2026-11-14 1', d2: 'decision 2026-11-14 2', d3: 'decision 2026-11-14 3', d4: 'decision 2026-11-14 4',
})
/** How often the connector holds an ack receipt for `event` (decision 3: "acked once"). */
const ackCount = (world, event) => world.link.state().acked[event.eventId] ?? 0
/** The JSON-escaped form of `text`, as it appears inside a logged session event's data. */
const inJson = (text) => JSON.stringify(text).slice(1, -1)

/**
 * Decision 3's presenter faults: `present` fails the first `failures` calls for each event, and
 * `delay` records every requested wait. A held delay (`hold`) resolves only on `releaseAll()`, so a
 * case can keep one event inside its backoff.
 */
function presenterFaults(failures, { hold = false } = {}) {
  const calls = new Map()
  const waits = []
  const held = []
  let releasedAll = false
  return {
    seam: {
      present: (event, base) => {
        const n = (calls.get(event.eventId) ?? 0) + 1
        calls.set(event.eventId, n)
        if (n <= failures(event)) throw new Error(FIXTURE.fault)
        return base(event)
      },
      delay: (ms) => {
        waits.push(ms)
        if (!hold || releasedAll) return Promise.resolve()
        const gate = Promise.withResolvers()
        held.push(gate.resolve)
        return gate.promise
      },
    },
    calls: (event) => calls.get(event.eventId) ?? 0,
    waits,
    heldCount: () => held.length,
    releaseAll: () => { releasedAll = true; for (const resolve of held.splice(0)) resolve() },
  }
}
/** Decision 3: the waits after failed attempts 1…`failed` (`backoffMs × backoffFactor^(n−1)`). */
function backoffSeries(failed) {
  const { backoffMs, backoffFactor } = CORE.presentRetry
  return Array.from({ length: failed }, (_, i) => backoffMs * backoffFactor ** i)
}

/**
 * Decision 1: ends the turn that claims `event` (its pre-step), once, before the event is admitted.
 * Only the first claim is ended, so a retry would show as a wake.
 */
const cancelWith = (cause) => ({ end: (world) => { world.agent.cancel(cause) }, reason: { kind: DSH.ended.aborted, reason: cause } })
const CLAIM_END = Object.freeze({
  stop: cancelWith(DSH.userCancel),
  parent: cancelWith(DSH.parentCancel),
  hook: cancelWith(DSH.hookCancel),
  disposed: cancelWith(DSH.disposedCancel),
  error: { end: () => { throw new Error(FIXTURE.fault) }, reason: { kind: DSH.ended.error } },
  blocked: { end: () => DSH.rejectStep, reason: { kind: DSH.ended.blocked } },
})
/** Harness check: the Fishball log has a `turn/end` with `how`'s reason, so the row ran its path. */
async function assertClaimEnded(world, how) {
  const { reason } = CLAIM_END[how]
  const ends = (await world.sessionLog()).filter((e) => e.type === DSH.turnEnd).map((e) => e.data?.reason)
  const matches = (got) => got?.kind === reason.kind && (reason.reason === undefined || got?.reason?.kind === reason.reason.kind)
  assert.ok(ends.some(matches), `harness: no turn ended ${JSON.stringify(reason)}; turn ends ${JSON.stringify(ends)}`)
}
function endClaimingTurn(world, event, how) {
  let done = false
  world.ctx.on(DSH.preStep, (input, next) => {
    if (done || !JSON.stringify(input.messages).includes(event.marker)) return next()
    done = true
    return CLAIM_END[how].end(world) ?? next()
  })
}

/** A world over a root a case may close and reopen in this process; cleanup closes the last one. */
async function reopenableWorld(t, sdk) {
  const root = await newRoot()
  const box = { world: await openWorld(sdk, root) }
  t.after(async () => { await box.world?.close(); await removeRoot(root) })
  box.reopen = async () => {
    const old = box.world
    box.world = undefined
    await old.close()
    box.world = await openWorld(sdk, root)
    return box.world
  }
  return box
}

function registerDecisionCases(sdk) {
  const st = (n, title, fn) => row(sdk, ID.st02, n, title, fn)

  // ============================== decision 3: presenter retry and give-up (BVA on the failure count)
  /** N − 1, N, N + 1 are read when the case runs: PRESENT_RETRY is the product's (PROPOSED). */
  const FAILURES = [
    ['k=0', () => 0],
    ['k=1', () => 1],
    ['k=N-1', () => CORE.presentRetry.attempts - 1],
    ['k=N', () => CORE.presentRetry.attempts],
    ['k=N+1', () => CORE.presentRetry.attempts + 1],
  ]
  for (const [label, failuresOf] of FAILURES) {
    st(`10a (${D.d3}, ${label})`, `AcceptedBy(Fishball), the presenter fails ${label} times (N = PRESENT_RETRY.attempts): below N delivered after the backoff series; from N on given up with one notice`, async (t) => {
      const N = CORE.presentRetry.attempts
      const k = failuresOf()
      const faults = presenterFaults(() => k)
      const world = await worldFor(t, sdk, { seam: faults.seam })
      const secret = FIXTURE.secret + (counter + 1)
      const event = nextEvent(EVENT_TYPE.message, { secret })
      await publish(world, event)
      await world.settle()
      const admissions = await world.admissions(event.marker)
      const notice = inJson(CORE.presentGivenUp(event.eventId, event.type))
      const giveUps = world.logs.filter((l) => l.text.includes(CORE.presentGivenUpReason) && l.text.includes(event.eventId))
      assert.equal(admissions.length, 1, 'Fishball wakes for the event')
      assert.equal(ackCount(world, event), 1, 'ack receipts for the event')
      if (k < N) {
        assert.equal(faults.calls(event), k + 1, 'presenter attempts')
        assert.deepEqual(faults.waits, backoffSeries(k), 'requested backoff waits')
        assert.equal(JSON.stringify(admissions[0].data).includes(notice), false, 'a presented event was given up')
        assert.deepEqual(giveUps, [], 'a give-up was logged for a presented event')
      } else {
        assert.equal(faults.calls(event), N, 'presenter attempts (never more than N)')
        assert.deepEqual(faults.waits, backoffSeries(N - 1), 'requested backoff waits')
        assert.ok(JSON.stringify(admissions[0].data).includes(notice), 'the one wake is not the give-up notice naming the event: ' + JSON.stringify(admissions[0].data))
        assert.equal(giveUps.length, 1, 'give-up log lines with REASON.presentGivenUp')
        assert.deepEqual(world.logsWith(secret), [], 'the event\'s payload was logged (R-SEC-02)')
      }
    })
  }
  st(`10b (${D.d3})`, 'an event inside its presenter backoff does not hold up a later event: the later one is delivered first; the first is then given up with its one notice', async (t) => {
    let first
    const faults = presenterFaults((e) => (e.eventId === first.eventId ? Infinity : 0), { hold: true })
    const world = await worldFor(t, sdk, { seam: faults.seam })
    first = nextEvent(EVENT_TYPE.message)
    const second = nextEvent(EVENT_TYPE.message)
    await publish(world, first)
    await eventually(() => faults.heldCount() > 0, 'the first event is waiting in its backoff')
    world.link.publish(second)
    await eventually(async () => (await wakes(world, second)) === 1, 'the later event is delivered while the first one is in its backoff')
    faults.releaseAll()
    await world.settle()
    assert.equal(await wakes(world, second), 1, 'wakes for the later event')
    const admissions = await world.admissions(first.marker)
    assert.equal(admissions.length, 1, 'wakes for the given-up event')
    assert.ok(JSON.stringify(admissions[0].data).includes(inJson(CORE.presentGivenUp(first.eventId, first.type))), 'the given-up event\'s wake is not its notice')
    assert.equal(faults.calls(first), CORE.presentRetry.attempts, 'presenter attempts for the given-up event; requested waits ' + JSON.stringify(faults.waits))
    assert.deepEqual([ackCount(world, first), ackCount(world, second)], [1, 1], 'acked once each')
  })

  // ============================== decision 1: how the claiming turn ended before admission
  /** Discarded: no wake, acked once, nothing settled at the connector, and no retry later. */
  async function assertDiscarded(world, event) {
    await world.settle()
    assert.equal(await wakes(world, event), 0, 'Fishball admitted an event whose claiming turn ended')
    assert.equal(ackCount(world, event), 1, 'ack receipts for the discarded event')
    assert.deepEqual(world.link.answers(), [], 'the discard settled something at the connector (R-CON-05)')
    const later = nextEvent(EVENT_TYPE.message)
    world.link.publish(later)
    await assertFishballOnce(world, later)
    assert.equal(await wakes(world, event), 0, 'the discarded event was retried')
  }
  const DISCARDED = [
    ['stop', 'the user\'s Stop (S2-Q3 A, unchanged)'],
    ['error', 'the turn ends in an error'],
    ['blocked', 'the step is rejected (turn ends blocked)'],
    ['parent', 'stopped by its parent (aborted, cause parent)'],
    ['hook', 'stopped by a hook (aborted, cause hook)'],
  ]
  for (const [how, title] of DISCARDED) {
    st(`12a (${D.d1}, ${how})`, `AcceptedBy(Fishball), not admitted → ${title} → Discarded: acked once, no wake, never retried`, async (t) => {
      const world = await worldFor(t, sdk)
      const event = nextEvent(EVENT_TYPE.permission)
      endClaimingTurn(world, event, how)
      await publish(world, event)
      await world.settle()
      await assertClaimEnded(world, how)
      await assertDiscarded(world, event)
    })
  }
  crashRow(sdk, ID.st02, `12a (${D.d1}, interrupted)`, 'AcceptedBy(Fishball), claimed, not admitted → the Fishball DSH crashes → delivered again: one wake in total', 'fishballClaimCrash', (r) => {
    // Harness: the cut was in the claiming step, before any model request carried the event.
    assert.equal(r.interruptedTurns, 1, 'harness: the claiming turn was not left open by the crash')
    assert.equal(r.modelRequestsTotal, r.modelRequestsAfterRestart, 'harness: the event reached a model before the crash')
    assert.equal(r.admissions, 1, 'Fishball wakes in total')
    assert.equal(r.acked, true)
  })
  st(`12a (${D.d1}, disposed)`, 'AcceptedBy(Fishball), claimed, not admitted → owner teardown (aborted, cause disposed) → delivered again: one wake in total, also across the next start', async (t) => {
    const box = await reopenableWorld(t, sdk)
    const event = nextEvent(EVENT_TYPE.message)
    endClaimingTurn(box.world, event, 'disposed')
    await publish(box.world, event)
    await box.world.settle()
    await assertClaimEnded(box.world, 'disposed')
    // The teardown's owner goes away; whether the event comes back in this run or at the next
    // start, the total is one wake.
    const world = await box.reopen()
    await world.settle()
    assert.equal(await wakes(world, event), 1, 'Fishball wakes in total')
    assert.ok(acked(world, event), 'the event was not acked')
  })

  // ============================== decision 4: core's ledger alone decides delivery
  crashRow(sdk, ID.st02, `11b (${D.d4}, cleared)`, 'Admitted → the Fishball session log is cleared → restart: no second wake', 'admittedThenCleared', (r) => {
    assert.equal(r.admissions, 0, 'wakes in the cleared session')
    assert.equal(r.requestsAfterRestart, 0, 'a turn ran after the restart')
    assert.equal(r.acked, true)
  })
  crashRow(sdk, ID.st02, `11b (${D.d4}, replaced)`, 'Admitted → the Fishball agent moves to a new session → restart: no second wake', 'admittedThenReplaced', (r) => {
    assert.equal(r.admissionsInFirstSession, 1, 'the first session\'s admission (the one wake)')
    assert.equal(r.admissions, 0, 'wakes in the new session')
    assert.equal(r.requestsAfterRestart, 0, 'a turn ran after the restart')
  })
  crashRow(sdk, ID.st02, `11c (${D.d4})`, 'AcceptedBy(Fishball) and acked while busy, not admitted → crash → restart: exactly one wake in total', 'fishballQueuedBusy', (r) => {
    assert.equal(r.admissions, 1, 'Fishball wakes in total')
    assert.equal(r.modelRequestsTotal, 1, 'model requests carrying the event, both processes')
    assert.equal(r.acked, true)
  })
  crashRow(sdk, ID.dt03, `9a (${D.d4})`, 'admitted, crash right after (inside its turn) → restart: one wake in total, no re-delivery', 'fishballMidTurn', (r) => {
    assert.equal(r.admissions, 1, 'Fishball wakes in total')
    assert.equal(r.modelRequestsTotal, 1, 'model requests carrying the event, both processes')
    assert.equal(r.requestsAfterRestart, 0, 'a turn ran after the restart')
  })
  // Decision 2026-11-14 (crash window) A: documented R-EVT-03 exception. A crash between the durable
  // admission and core's `admitted` record re-delivers once; the first copy reached no model.
  crashRow(sdk, ID.dt03, `9b (${D.d4}, admission/ledger window)`, 'the session holds the admission, core\'s admitted record has not landed → crash → restart: two admissions, the first reached no model (decision 2026-11-14 (crash window) A: documented R-EVT-03 exception)', 'admissionLedgerWindow', (r) => {
    assert.equal(r.window?.durable, true, 'harness: the admission was not durable at the cut ' + JSON.stringify(r.window))
    assert.equal(r.admissions, 2, 'admissions in total (the documented exception)')
    assert.equal(r.modelRequestsTotal - r.modelRequestsAfterRestart, 0, 'model requests carrying the event before the crash')
    assert.equal(r.modelRequestsTotal, 1, 'model requests carrying the event, both processes')
  })
  /** Row 11e harness: the restart found the stale copy pending and the user's act ran on it. */
  const assertStaleCopy = (r) => assert.deepEqual([r.pendingAtRestart, r.acted], [true, true], 'harness: the stale copy was not pending at the restart, or the user\'s act missed it ' + JSON.stringify(r))
  crashRow(sdk, ID.st02, `11e (${D.d4}, a copy left pending by an earlier process)`, 'AcceptedBy(Fishball), its message left pending in Fishball\'s DSH inbox, crash; at restart the user\'s message wakes Fishball first and its turn admits the stale copy → one admission in total, no second hand-over later, ledger admitted, acked (R-EVT-03)', 'stalePendingUserWakes', (r) => {
    assertStaleCopy(r)
    assert.equal(r.admissions, 1, 'admissions in total, both processes')
    assert.equal(r.handOvers, 1, 'times core\'s message was queued in the Fishball inbox, both processes')
    assert.equal(r.laterAdmissions, 1, 'harness: the later event (more idle edges) was not delivered')
    assert.ok(r.ledgerStates.includes(CORE.admitted), 'core\'s ledger record of the event is not admitted: ' + JSON.stringify(r.ledgerStates))
    assert.equal(r.acked, true)
  })
  // Decision 2026-11-14 (11e stop) A: documented exception. The user removes the stale copy before
  // core's recovery subscribes to the agent, so core (whose ledger alone decides, 4.A) cannot see the
  // removal: recovery hands the event over once more and it is admitted once; nothing after that.
  crashRow(sdk, ID.st02, `11e (${D.d4}, stop)`, 'AcceptedBy(Fishball), its message left pending in Fishball\'s DSH inbox, crash; at restart the user removes the stale copy before core\'s recovery subscribes → one admission in total, no further re-delivery after later idle edges, ledger admitted, acked (decision 2026-11-14 (11e stop) A: documented exception)', 'stalePendingUserRemoves', (r) => {
    assertStaleCopy(r)
    assert.equal(r.admissions, 1, 'admissions in total, both processes (the documented exception)')
    // The first process's hand-over (the removed copy) and recovery's one, which is the admission.
    assert.equal(r.handOvers, 2, 'times core\'s message was queued in the Fishball inbox, both processes')
    assert.equal(r.laterAdmissions, 1, 'harness: the later event (more idle edges) was not delivered')
    assert.ok(r.ledgerStates.includes(CORE.admitted), 'core\'s ledger record of the event is not admitted: ' + JSON.stringify(r.ledgerStates))
    assert.equal(r.acked, true)
  })

  // ============================== decision 2: startup recovery fails; intake continues
  crashRow(sdk, ID.st02, `11d (${D.d2}, activation fails)`, 'AcceptedBy(Fishball), not admitted, crash; at restart the agent cannot be activated during recovery → a later event is still delivered; the missed one at the next start', 'recoverActivateFails', (r) => {
    assert.ok(r.faultsFired > 0, 'seam: startup recovery never activated the agent, so the fault did not fire')
    assert.deepEqual([r.laterAdmissions, r.laterAcked], [1, true], 'the later event after a failed recovery (wakes, acked)')
    assert.equal(r.admissions, 0, 'the missed record was retried in the same run: ' + JSON.stringify(r))
    assert.equal(r.restart.admissions, 1, 'the missed record at the next start (wakes in total)')
    assert.equal(r.restart.acked, true)
  })
  crashRow(sdk, ID.st02, `5g (${D.d2}, ledger write fails)`, 'Open(R), crash, R off; a ledger write rejects once during recovery → a later event is still delivered; the open record goes to Fishball at the next start', 'recoverLedgerFails', (r) => {
    assert.equal(r.faultsFired, 1, 'seam: startup recovery wrote nothing to the ledger, so the fault did not fire')
    assert.deepEqual([r.laterAdmissions, r.laterAcked], [1, true], 'the later event after a failed recovery (wakes, acked)')
    assert.equal(r.admissions, 0, 'the missed record was retried in the same run')
    assert.equal(r.restart.admissions, 1, 'the missed record at the next start (wakes in total)')
  })
}

/**
 * A crash-window row: two real processes over one root (crash.mjs). Each row runs its own scenario,
 * so a failure names its row; `check` gets the recover phase's report.
 */
function crashRow(sdk, id, part, title, scenario, check) {
  assert.ok(SCENARIO[scenario], 'unknown crash scenario ' + scenario)
  row(sdk, id, part, title + ' [crash]', async (t) => {
    const root = await newRoot()
    t.after(() => removeRoot(root))
    const report = runCrash(sdk, root, scenario)
    assert.equal(report.error, undefined, report.error)
    check(report)
  })
}
