/**
 * WAKE-BATCH black-box rows: core's wake batching (the user-approved design relayed 2026-11-21,
 * items 1–6). Written from the requirements and the relayed seam only (createEvents `batching`,
 * `timers`; contracts `WAKE`, `TEXT.batchLimit(n)`), never from the implementation.
 *
 * Level: integration, over F-INTERCEPT's world (world.mjs: a real Fishball DSH of the installed SDK's
 * parts, the fake model, the fake link). Core's timers are a fake clock (world.mjs fakeClock), so a
 * window is passed or not passed exactly; one row keeps the real clock with a short window.
 *
 * Oracles, all public: a "turn" is a durable `turn/start` of the Fishball session; a "delivery" is a
 * durable `user/message` core put there (source kind `fishball-event`); an event is "in" a delivery when its
 * marker (its eventId, which a silent summary line also names) is in that message; "same model step"
 * is one model request carrying both texts; the ledger and acks as F-INTERCEPT reads them.
 *
 * Techniques: EP (each default class; other contributed types), BVA (window − 1 ms / window; 19 / 20 /
 * 21 events; window 0; max batch 1), Decision Table (buffer content × user message; wake / silent ×
 * timer), State Transition (empty → buffering → timer restarted → flushed; buffered → user message →
 * delivered; delivered → Stop → discarded; buffered → restart → recovered).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { ledgerStates } from './crash.mjs'
import { CORE, DSH, EVENT_TYPE, FIXTURE, WAIT, WAKE_CONTRACT, WAKE_REQUIRED as R } from './constants.mjs'
import { busyGate, contributedType, eventually, fakeClock, makeEvent, newRoot, openWorld, removeRoot, startBusy, worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({
  defaults: 'WAKE-EVT-EP-00', wakeTypes: 'WAKE-EVT-EP-01', silentTypes: 'WAKE-EVT-EP-02', live: 'WAKE-EVT-DT-01',
  window: 'WAKE-EVT-ST-01', windowBva: 'WAKE-EVT-BVA-01', maxBatch: 'WAKE-EVT-BVA-02', user: 'WAKE-EVT-DT-02',
  ledger: 'WAKE-EVT-ST-02', guarantees: 'WAKE-EVT-UC-01',
})
const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)
const ms = (seconds) => seconds * R.msPerSecond
const WINDOW_MS = ms(R.quietWindowSeconds)
let counter = 7000
const nextEvent = (type) => makeEvent(type, ++counter)

/** A mutable live config (`batching()` is read at each event): the required defaults unless changed. */
function liveConfig(overrides = {}) {
  const classes = Object.fromEntries([...R.wake.map((t) => [t, WAKE_CONTRACT.value.class.wake]), [R.drift, WAKE_CONTRACT.value.class.wake], ...R.silent.map((t) => [t, WAKE_CONTRACT.value.class.silent])])
  return { quietWindowSeconds: R.quietWindowSeconds, maxBatch: R.maxBatch, classes, ...overrides }
}

/** A world whose core reads `config` live and runs on a fake clock. */
async function batchWorld(t, sdk, { config = liveConfig(), clock = fakeClock(), batching = () => config, ...options } = {}) {
  const world = await worldFor(t, sdk, { ...options, seam: { batching, timers: clock.timers } })
  return { world, clock, config }
}

// ---------------------------------------------------------------------------------------------- oracles
const json = (v) => JSON.stringify(v)
/** Core's deliveries: durable user messages of the Fishball session whose source is core's event kind. */
const deliveries = async (world) => (await world.sessionLog()).filter((e) => e.type === DSH.userMessage && e.data?.source?.kind === DSH.eventSource)
const turns = async (world) => (await world.sessionLog()).filter((e) => e.type === DSH.turnStart).length
const holds = (delivery, event) => json(delivery.data).includes(event.marker)
const ackCount = (world, event) => world.link.state().acked[event.eventId] ?? 0
/** Core has taken the event (recorded and acked; delivery.add runs before the ack). */
const taken = (world, events) => eventually(() => events.every((e) => world.link.acked(e.eventId)), 'core took every published event')
async function publish(world, ...events) {
  world.link.publishAll(events)
  await taken(world, events)
}
/** Nothing new has been delivered since `before` deliveries (after the world settles). */
async function assertNoDelivery(world, before, why) {
  await world.settle()
  const got = await deliveries(world)
  assert.equal(got.length, before, why + ': ' + json(got.slice(before).map((d) => d.data?.id)))
}
/** Exactly one new delivery since `before`; it holds every event of `events` and none of `absent`. */
async function assertOneDelivery(world, before, events, absent = []) {
  await world.settle()
  const fresh = (await deliveries(world)).slice(before)
  assert.equal(fresh.length, 1, 'deliveries: ' + json(fresh.map((d) => d.data?.content)))
  for (const e of events) assert.ok(holds(fresh[0], e), e.type + ' ' + e.eventId + ' is not in the delivery')
  for (const e of absent) assert.equal(holds(fresh[0], e), false, e.type + ' ' + e.eventId + ' is in the delivery')
  return fresh[0]
}
const warns = (delivery, n) => json(delivery.data).includes(json(WAKE_CONTRACT.batchLimit(n)).slice(1, -1))

export function registerBatchEventCases(sdk) {
  // ====================================================================== defaults (item 1, item 2, item 3)
  row(sdk, ID.defaults, 'contract', 'WAKE.defaults equal the requirements: window 10 s, max batch 20, the listed WAKE and SILENT types; class words wake / silent', () => {
    const wake = WAKE_CONTRACT.value
    assert.deepEqual(wake.class, { wake: 'wake', silent: 'silent' })
    assert.equal(wake.defaults.quietWindowSeconds, R.quietWindowSeconds)
    assert.equal(wake.defaults.maxBatch, R.maxBatch)
    for (const type of [...R.wake, R.drift]) assert.equal(wake.defaults.classes[type], wake.class.wake, type)
    for (const type of R.silent) assert.equal(wake.defaults.classes[type], wake.class.silent, type)
  })
  row(sdk, ID.defaults, 'no batching option', 'createEvents without batching uses the defaults: one message is not delivered at 10 s − 1 ms, and is at 10 s', async (t) => {
    const { world, clock } = await batchWorld(t, sdk, { batching: null })
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    clock.advance(WINDOW_MS - 1)
    await assertNoDelivery(world, 0, 'delivered before the default window passed')
    clock.advance(1)
    await assertOneDelivery(world, 0, [event])
  })

  // ====================================================================== EP: each default WAKE type wakes alone
  for (const type of [...R.wake, R.drift, contributedType()]) {
    row(sdk, ID.wakeTypes, type, `a ${type} event alone wakes Fishball once the window passed (not before)`, async (t) => {
      const { world, clock } = await batchWorld(t, sdk)
      const event = nextEvent(type)
      await publish(world, event)
      clock.advance(WINDOW_MS - 1)
      await assertNoDelivery(world, 0, 'woken before the window passed')
      clock.advance(1)
      await assertOneDelivery(world, 0, [event])
      assert.equal(await turns(world), 1, 'turns')
    })
  }

  // ====================================================================== EP: each default SILENT type
  for (const type of R.silent) {
    row(sdk, ID.silentTypes, type, `a ${type} event alone never wakes Fishball (recorded, acked); the next wake delivery carries it as a summary in the same one message`, async (t) => {
      const { world, clock } = await batchWorld(t, sdk)
      const silent = nextEvent(type)
      await publish(world, silent)
      clock.advance(WINDOW_MS * 3)
      await assertNoDelivery(world, 0, 'a silent event woke Fishball')
      assert.equal(await turns(world), 0, 'turns')
      assert.equal(ackCount(world, silent), 1, 'the silent event was not acked once')
      assert.ok(ledgerStates(world, silent).length > 0, 'the silent event has no ledger record')
      const wake = nextEvent(EVENT_TYPE.message)
      await publish(world, wake)
      clock.advance(WINDOW_MS)
      await assertOneDelivery(world, 0, [wake, silent])
      assert.equal(await turns(world), 1, 'turns')
    })
  }
  row(sdk, ID.silentTypes, 'timer', 'a silent event never starts or restarts the timer: wake at 0 s, silent at 6 s → delivered at 10 s with both', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const wake = nextEvent(EVENT_TYPE.message)
    const silent = nextEvent(EVENT_TYPE.state)
    await publish(world, wake)
    clock.advance(ms(6))
    await publish(world, silent)
    clock.advance(ms(4))
    await assertOneDelivery(world, 0, [wake, silent])
  })

  // ====================================================================== DT: settings applied live (item 4)
  row(sdk, ID.live, 'wake → silent', 'message reclassified silent while running: a message alone no longer wakes; the next wake event (notice) delivers both', async (t) => {
    const { world, clock, config } = await batchWorld(t, sdk)
    config.classes = { ...config.classes, [EVENT_TYPE.message]: WAKE_CONTRACT.value.class.silent }
    const message = nextEvent(EVENT_TYPE.message)
    await publish(world, message)
    clock.advance(WINDOW_MS * 3)
    await assertNoDelivery(world, 0, 'a message reclassified silent woke Fishball')
    const notice = nextEvent(EVENT_TYPE.notice)
    await publish(world, notice)
    clock.advance(WINDOW_MS)
    await assertOneDelivery(world, 0, [notice, message])
  })
  row(sdk, ID.live, 'silent → wake', 'state reclassified wake while running: a state event alone wakes Fishball after the window', async (t) => {
    const { world, clock, config } = await batchWorld(t, sdk)
    config.classes = { ...config.classes, [EVENT_TYPE.state]: WAKE_CONTRACT.value.class.wake }
    const state = nextEvent(EVENT_TYPE.state)
    await publish(world, state)
    clock.advance(WINDOW_MS)
    await assertOneDelivery(world, 0, [state])
  })
  row(sdk, ID.live, 'window', 'the quiet window changed 10 s → 3 s while running applies to the next event: delivered at 3 s', async (t) => {
    const { world, clock, config } = await batchWorld(t, sdk)
    config.quietWindowSeconds = 3
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    clock.advance(ms(3) - 1)
    await assertNoDelivery(world, 0, 'delivered before the new window passed')
    clock.advance(1)
    await assertOneDelivery(world, 0, [event])
  })
  row(sdk, ID.live, 'max batch', 'the max batch changed 20 → 2 while running: the 2nd wake event flushes at once with the warning naming 2', async (t) => {
    const { world, config } = await batchWorld(t, sdk)
    config.maxBatch = 2
    const events = [nextEvent(EVENT_TYPE.message), nextEvent(EVENT_TYPE.notice)]
    await publish(world, ...events)
    const delivery = await assertOneDelivery(world, 0, events)
    assert.ok(warns(delivery, 2), 'no batch-limit warning naming 2')
  })

  // ====================================================================== ST: the quiet window restarts
  row(sdk, ID.window, 'main', 'events at 0 s, 6 s, 12 s (window 10 s) → no turn at 21.999 s; ONE turn at 22 s holding all three', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const events = [EVENT_TYPE.message, EVENT_TYPE.permission, EVENT_TYPE.notice].map(nextEvent)
    await publish(world, events[0])
    clock.advance(ms(6))
    await publish(world, events[1])
    clock.advance(ms(6))
    await publish(world, events[2])
    clock.advance(WINDOW_MS - 1)
    await assertNoDelivery(world, 0, 'delivered before 10 s passed with no new event')
    clock.advance(1)
    await assertOneDelivery(world, 0, events)
    assert.equal(await turns(world), 1, 'turns')
    for (const e of events) assert.equal(await world.admissions(e.marker).then((a) => a.length), 1, 'admissions of ' + e.eventId)
  })
  row(sdk, ID.windowBva, 'restart at window − 1 ms', 'a second event 9.999 s after the first restarts the window: nothing at the first event\'s 10 s, both at 9.999 s + 10 s', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const first = nextEvent(EVENT_TYPE.message)
    const second = nextEvent(EVENT_TYPE.message)
    await publish(world, first)
    clock.advance(WINDOW_MS - 1)
    await publish(world, second)
    clock.advance(1)
    await assertNoDelivery(world, 0, 'the second event did not restart the window')
    clock.advance(WINDOW_MS - 2)
    await assertNoDelivery(world, 0, 'delivered before the restarted window passed')
    clock.advance(1)
    await assertOneDelivery(world, 0, [first, second])
  })
  row(sdk, ID.windowBva, 'window 0', 'window 0: delivered at the next idle without the clock moving', async (t) => {
    const { world } = await batchWorld(t, sdk, { config: liveConfig({ quietWindowSeconds: 0 }) })
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    await assertOneDelivery(world, 0, [event])
  })
  row(sdk, ID.windowBva, 'real clock', 'real timers (no timers option), window 1 s: the delivery is admitted no earlier than 1 s after core took the event', async (t) => {
    const config = liveConfig({ quietWindowSeconds: 1 })
    const world = await worldFor(t, sdk, { seam: { batching: () => config } })
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    const ackAt = world.link.calls.find((c) => c.name === 'inbox_ack' && json(c.args).includes(event.eventId)).at
    await eventually(async () => (await deliveries(world)).length > 0, 'the delivery after the real window')
    const [delivery] = await deliveries(world)
    const admittedAt = delivery.time
    assert.ok(holds(delivery, event), 'the delivery does not hold the event')
    assert.ok(admittedAt - ackAt >= ms(1) - WAIT.pollMs, `admitted ${admittedAt - ackAt} ms after the ack (window 1 s)`)
  })

  // ====================================================================== BVA: max batch (item 3)
  row(sdk, ID.maxBatch, '19', '19 wake events in one poll: no flush before the window; then one delivery with all 19 and no warning', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const events = Array.from({ length: R.maxBatch - 1 }, () => nextEvent(EVENT_TYPE.message))
    await publish(world, ...events)
    await assertNoDelivery(world, 0, '19 events flushed before the window')
    clock.advance(WINDOW_MS)
    const delivery = await assertOneDelivery(world, 0, events)
    assert.equal(warns(delivery, R.maxBatch), false, 'a batch-limit warning below the limit')
  })
  row(sdk, ID.maxBatch, '20', '20 wake events: flushed at once (the clock never moves) in one delivery holding all 20 and the warning naming 20', async (t) => {
    const { world } = await batchWorld(t, sdk)
    const events = Array.from({ length: R.maxBatch }, () => nextEvent(EVENT_TYPE.message))
    await publish(world, ...events)
    const delivery = await assertOneDelivery(world, 0, events)
    assert.ok(warns(delivery, R.maxBatch), 'no batch-limit warning naming 20')
    assert.ok(json(WAKE_CONTRACT.batchLimit(R.maxBatch)).includes(String(R.maxBatch)), 'TEXT.batchLimit(20) does not name 20')
  })
  row(sdk, ID.maxBatch, '21', '21 wake events: the first 20 flushed at once with the warning; the 21st starts a new buffer, delivered alone after the window, with no warning', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const events = Array.from({ length: R.maxBatch + 1 }, () => nextEvent(EVENT_TYPE.message))
    const last = events.at(-1)
    await publish(world, ...events)
    const first = await assertOneDelivery(world, 0, events.slice(0, -1), [last])
    assert.ok(warns(first, R.maxBatch), 'no batch-limit warning on the full batch')
    clock.advance(WINDOW_MS)
    const second = await assertOneDelivery(world, 1, [last], events.slice(0, -1))
    assert.equal(warns(second, R.maxBatch), false, 'the 21st carries the warning')
  })
  row(sdk, ID.maxBatch, 'silent not counted', '19 wake + 3 silent events: silent ones do not count toward the limit (no flush); one delivery after the window with all 22, no warning', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const wake = Array.from({ length: R.maxBatch - 1 }, () => nextEvent(EVENT_TYPE.message))
    const silent = R.silent.map(nextEvent)
    await publish(world, ...wake, ...silent)
    await assertNoDelivery(world, 0, 'flushed although only 19 wake events were buffered')
    clock.advance(WINDOW_MS)
    const delivery = await assertOneDelivery(world, 0, [...wake, ...silent])
    assert.equal(warns(delivery, R.maxBatch), false)
  })
  row(sdk, ID.maxBatch, 'max batch 1', 'max batch 1 (its lower bound): each wake event is flushed at once in its own delivery, each with the warning naming 1', async (t) => {
    const { world } = await batchWorld(t, sdk, { config: liveConfig({ maxBatch: R.minMaxBatch }) })
    const a = nextEvent(EVENT_TYPE.message)
    await publish(world, a)
    const first = await assertOneDelivery(world, 0, [a])
    const b = nextEvent(EVENT_TYPE.notice)
    await publish(world, b)
    const second = await assertOneDelivery(world, 1, [b], [a])
    for (const d of [first, second]) assert.ok(warns(d, R.minMaxBatch), 'no batch-limit warning naming 1')
  })

  // ====================================================================== DT: the user's message (item 5)
  /** The user writes to Fishball; one turn and one model step must hold the user text and `events`. */
  async function userWhileBuffered(world, clock, events) {
    const turnsBefore = await turns(world)
    world.agent.followup(world.userMessage(FIXTURE.userText, FIXTURE.userId))
    await world.settle()
    assert.equal(await turns(world) - turnsBefore, 1, 'turns started by the user message')
    const step = world.requests.find((r) => r.includes(FIXTURE.userText))
    assert.ok(step, 'the user message reached no model request')
    for (const e of events) assert.ok(step.includes(e.marker), e.type + ' ' + e.eventId + ' is not in the user message\'s model step')
    assert.equal(clock.pending(), 0, 'the quiet-window timer was not cleared')
    clock.advance(WINDOW_MS * 3)
    await world.settle()
    assert.equal(await turns(world) - turnsBefore, 1, 'an extra turn after the user\'s')
    for (const e of events) assert.equal((await world.admissions(e.marker)).length, 1, 'admissions of ' + e.eventId)
  }
  for (const [part, types] of [
    ['wake buffered', [EVENT_TYPE.message, EVENT_TYPE.permission]],
    ['silent only', [EVENT_TYPE.state]],
    ['wake + silent', [EVENT_TYPE.notice, EVENT_TYPE.settlement]],
  ]) {
    row(sdk, ID.user, part, `the user writes while ${part} events wait: the timer is cleared, ONE turn and one model step hold the user's message and every buffered event; no turn later`, async (t) => {
      const { world, clock } = await batchWorld(t, sdk)
      const events = types.map(nextEvent)
      await publish(world, ...events)
      await assertNoDelivery(world, 0, 'delivered before the user wrote')
      await userWhileBuffered(world, clock, events)
    })
  }
  row(sdk, ID.user, 'busy, user queued', 'an event arrives while Fishball is busy and the user queues a message: when the running turn ends, ONE next turn holds both the user message and the event (replaces EVT-ST-02 row 11 queued)', async (t) => {
    const gate = busyGate()
    const { world, clock } = await batchWorld(t, sdk, { onRequest: gate.onRequest })
    await startBusy(world, gate)
    const event = nextEvent(EVENT_TYPE.message)
    await publish(world, event)
    world.agent.followup(world.userMessage(FIXTURE.laterText, FIXTURE.laterId))
    const before = await turns(world)
    gate.release()
    await world.settle()
    clock.advance(WINDOW_MS * 3)
    await world.settle()
    assert.equal(await turns(world) - before, 1, 'turns after the busy one')
    const step = world.requests.find((r) => r.includes(FIXTURE.laterText))
    assert.ok(step?.includes(event.marker), 'the event is not in the user message\'s model step')
    assert.equal((await world.admissions(event.marker)).length, 1, 'admissions of the event')
  })
  row(sdk, ID.user, 'nothing buffered (control)', 'the user writes with nothing buffered: one turn, no core delivery, nothing later', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    await userWhileBuffered(world, clock, [])
    assert.equal((await deliveries(world)).length, 0, 'core delivered something with nothing buffered')
  })

  // ====================================================================== ST: ledger exactly-once (item 6)
  row(sdk, ID.ledger, 'admitted', 'a batch of three: every record admitted once (ledger admitted, never discarded), each acked once, each admitted into the session once', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const events = [EVENT_TYPE.message, EVENT_TYPE.question, EVENT_TYPE.handover].map(nextEvent)
    await publish(world, ...events)
    clock.advance(WINDOW_MS)
    await assertOneDelivery(world, 0, events)
    for (const e of events) {
      const states = ledgerStates(world, e)
      assert.ok(states.includes(CORE.admitted), e.eventId + ' ledger ' + json(states))
      assert.equal(states.includes(CORE.discarded), false, e.eventId + ' ledger ' + json(states))
      assert.equal(ackCount(world, e), 1, 'acks of ' + e.eventId)
      assert.equal((await world.admissions(e.marker)).length, 1, 'admissions of ' + e.eventId)
    }
  })
  row(sdk, ID.ledger, 'Stop', 'the user stops the batch turn before admission: every record of the batch is discarded, acked once, never retried', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const events = [EVENT_TYPE.message, EVENT_TYPE.notice, EVENT_TYPE.state].map(nextEvent)
    let stopped = false
    world.ctx.on(DSH.preStep, (input, next) => {
      if (!stopped && json(input.messages).includes(events[0].marker)) { stopped = true; world.agent.cancel(DSH.userCancel) }
      return next()
    })
    await publish(world, ...events)
    clock.advance(WINDOW_MS)
    await world.settle()
    assert.ok(stopped, 'harness: the batch turn never reached its step')
    for (const e of events) {
      const states = ledgerStates(world, e)
      assert.ok(states.includes(CORE.discarded), e.eventId + ' ledger ' + json(states))
      assert.equal(states.includes(CORE.admitted), false, e.eventId + ' ledger ' + json(states))
      assert.equal(ackCount(world, e), 1, 'acks of ' + e.eventId)
    }
    const later = nextEvent(EVENT_TYPE.message)
    await publish(world, later)
    clock.advance(WINDOW_MS * 2)
    await world.settle()
    assert.equal((await world.admissions(later.marker)).length, 1, 'a later event is not delivered')
    for (const e of events) assert.equal((await world.admissions(e.marker)).length, 0, e.eventId + ' was retried')
  })
  row(sdk, ID.ledger, 'restart while buffered', 'core closes with three events buffered (window not passed): the next start delivers each exactly once in total', async (t) => {
    const root = await newRoot()
    let world
    t.after(async () => { await world?.close(); await removeRoot(root) })
    const config = liveConfig()
    const open = (clock) => openWorld(sdk, root, { seam: { batching: () => config, timers: clock.timers } })
    world = await open(fakeClock())
    const events = [EVENT_TYPE.message, EVENT_TYPE.permission, EVENT_TYPE.state].map(nextEvent)
    await publish(world, ...events)
    await assertNoDelivery(world, 0, 'delivered before the restart')
    const old = world
    world = undefined
    await old.close()
    const clock = fakeClock()
    world = await open(clock)
    clock.advance(WINDOW_MS)
    await world.settle()
    clock.advance(WINDOW_MS)
    await world.settle()
    for (const e of events) {
      assert.equal((await world.admissions(e.marker)).length, 1, 'admissions of ' + e.eventId + ' after the restart')
      assert.ok(ledgerStates(world, e).includes(CORE.admitted), e.eventId + ' ledger ' + json(ledgerStates(world, e)))
    }
  })

  // ====================================================================== UC: interceptors first (item 6)
  row(sdk, ID.guarantees, 'interceptor first', 'an interceptor still gets its event first: X keeps contributed:demo.ping; only the message is batched to Fishball', async (t) => {
    const { world, clock } = await batchWorld(t, sdk)
    const seen = []
    await world.plugin({ pluginId: FIXTURE.pluginX, registrations: [{ types: [contributedType()] }], handler: async (e, ctl) => { seen.push(e.eventId); await ctl.accept() } })
    const intercepted = nextEvent(contributedType())
    const message = nextEvent(EVENT_TYPE.message)
    await publish(world, intercepted, message)
    clock.advance(WINDOW_MS)
    await assertOneDelivery(world, 0, [message], [intercepted])
    assert.deepEqual(seen, [intercepted.eventId], 'what the interceptor saw')
    assert.deepEqual(world.modelRequestsWith(intercepted.marker), [], 'the intercepted event reached a model')
  })
}
