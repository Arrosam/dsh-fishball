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
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../shared/cases.mjs'
import { runCrash, SCENARIO } from './crash.mjs'
import { DSH, EVENT_TYPE, FIXTURE, K3, LATER, TOOL, WAIT } from './constants.mjs'
import { busyGate, contributedType, eventually, makeEvent, newRoot, removeRoot, startBusy, worldFor } from './world.mjs'

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
  row(sdk, ID.ep05, 6, 'a Watchdog escalate later settled by the user: only the non-waking settlement note reaches Fishball', null, LATER.wdDecide)
  row(sdk, ID.ep05, 7, 'a Watchdog allow or justified reject: nothing in Fishball\'s context; logged only', null, LATER.wdDecide)

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
