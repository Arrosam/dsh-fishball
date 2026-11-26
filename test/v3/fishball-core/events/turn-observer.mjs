/** Taskboard auto-update host contract: the observer is read-only and not an event receiver. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { EVENT_TYPE, FIXTURE, WAIT } from './constants.mjs'
import { eventually, makeEvent, worldFor } from './world.mjs'

const turn = EVENT_TYPE.turnFinished
const id = 'TURN-OBSERVER'
const options = { timeout: WAIT.testMs }
let sequence = 0
const nextEvent = (type = turn) => makeEvent(type, ++sequence)
const snapshotsOf = (calls) => calls.map(([event]) => event)
const receiptCount = (world, event) => world.link.state().acked[event.eventId] ?? 0

export function registerTurnObserverCases(sdk) {
  const row = (part, title, run) => test(caseName(sdk, id, part, title), options, run)

  row('trusted snapshots', 'all observers get only turn-finished snapshots with local provenance and no controller', async (t) => {
    const world = await worldFor(t, sdk, { secondTarget: true })
    const [sourceA, sourceB] = world.core.sources
    const completed = nextEvent()
    const notice = nextEvent(EVENT_TYPE.notice)
    const left = [], right = [], attemptedWrites = []
    world.core.observeTurnFinished((...args) => {
      left.push(args)
      const [event] = args
      attemptedWrites.push([
        Reflect.set(event, 'type', EVENT_TYPE.notice),
        Reflect.set(event.source, 'targetId', FIXTURE.secret),
        Reflect.set(event.payload.finalMessage, 'text', FIXTURE.secret),
      ])
    })
    world.core.observeTurnFinished((...args) => right.push(args))
    // Identical remote ids are allowed across targets. The mailbox's forged source must not win.
    world.link.publishAll([{ ...completed, source: sourceB }, notice])
    world.second.publish({ ...completed, source: sourceA })
    await eventually(() => [world.link, world.second].every((link) => link.acked(completed.eventId)) && world.link.acked(notice.eventId), 'normal link acks')
    await eventually(() => left.length >= 2 && right.length >= 2, 'both observers see both target turns')
    await world.settle()
    const { marker, ...mailboxEvent } = completed
    for (const calls of [left, right]) {
      assert.deepEqual(calls.map((args) => args.length), [1, 1], 'no ack or interceptor control argument')
      const byTarget = new Map(snapshotsOf(calls).map((event) => [event.source.targetId, event]))
      for (const source of [sourceA, sourceB]) assert.deepEqual(byTarget.get(source.targetId), { ...mailboxEvent, source })
    }
    assert.deepEqual(attemptedWrites, [[false, false, false], [false, false, false]], 'all snapshot levels reject mutation')
  })

  row('interception', 'pending observer cannot delay interception or ack before the interceptor accepts', async (t) => {
    const world = await worldFor(t, sdk)
    const completed = nextEvent()
    let observed
    const observer = Promise.withResolvers()
    const permitAccept = Promise.withResolvers()
    t.after(() => { observer.resolve(); permitAccept.resolve() })
    world.core.observeTurnFinished((event) => {
      observed = event.eventId
      return observer.promise
    })
    const interceptor = await world.plugin({ pluginId: FIXTURE.pluginX, registrations: [{ types: [turn] }], handler: async (_event, ctl) => {
      await permitAccept.promise
      assert.equal(await ctl.accept(), true)
    } })
    world.link.publish(completed)
    await eventually(() => interceptor.seen.length === 1, 'interceptor receives while observer is pending')
    await eventually(() => observed === completed.eventId, 'observer sees the intercepted turn')
    assert.equal(receiptCount(world, completed), 0, 'observer cannot independently ack')
    assert.equal((await world.admissions(completed.marker)).length, 0)
    permitAccept.resolve()
    await eventually(() => world.link.acked(completed.eventId), 'interceptor accepts while observer is pending')
    await world.settle()
    assert.equal(receiptCount(world, completed), 1)
    assert.equal((await world.admissions(completed.marker)).length, 0, 'observer does not trigger fallback')
  })

  row('delivery', 'pending, failed, and returning observers cannot alter normal delivery or starve peers', async (t) => {
    const world = await worldFor(t, sdk)
    const completed = nextEvent()
    const later = nextEvent()
    const gate = Promise.withResolvers()
    t.after(() => gate.resolve())
    const waiting = [], threw = [], rejected = [], returned = [], received = []
    world.core.observeTurnFinished((event) => {
      waiting.push(event.eventId)
      return gate.promise
    })
    world.core.observeTurnFinished((event) => {
      threw.push(event.eventId)
      throw new Error(FIXTURE.fault)
    })
    world.core.observeTurnFinished(async (event) => {
      rejected.push(event.eventId)
      throw new Error(FIXTURE.fault)
    })
    world.core.observeTurnFinished((event) => {
      returned.push(event.eventId)
      return false
    })
    world.core.observeTurnFinished((event) => { received.push(event.eventId) })
    world.link.publishAll([completed, later])
    await eventually(() => [completed, later].every((event) => world.link.acked(event.eventId)), 'ordinary delivery owns ack')
    await eventually(() => received.length >= 2, 'healthy peer receives both turns')
    // Node's test runner also fails the test if an observer rejection escapes as unhandled.
    await world.settle()
    const expected = [completed.eventId, later.eventId].sort()
    for (const events of [waiting, threw, rejected, returned, received]) assert.deepEqual(events.sort(), expected)
    for (const event of [completed, later]) {
      assert.equal(receiptCount(world, event), 1)
      assert.equal((await world.admissions(event.marker)).length, 1)
    }
  })

  row('unregister', 'unregister cancels pending and later delivery without removing other observers', async (t) => {
    const world = await worldFor(t, sdk)
    const pending = nextEvent()
    const later = nextEvent()
    const removed = [], active = []
    const off = world.core.observeTurnFinished((event) => { removed.push(event.eventId) })
    assert.equal(typeof off, 'function')
    world.core.observeTurnFinished((event) => { active.push(event.eventId) })
    // Act in the same stack as ingress, before a detached callback can enter.
    const intake = world.core.intake(pending)
    off()
    await intake
    // Whichever peer enters first cancels the other, without assuming any observer order.
    const ran = []
    const peer = (unregisterOther) => (event) => {
      if (event.eventId !== later.eventId) return
      ran.push(event.eventId)
      unregisterOther()
    }
    const offLeft = world.core.observeTurnFinished(peer(() => offRight()))
    const offRight = world.core.observeTurnFinished(peer(offLeft))
    world.link.publish(later)
    await eventually(() => active.includes(pending.eventId) && active.includes(later.eventId), 'live peer still receives pending and later turns')
    await world.settle()
    assert.deepEqual(removed, [])
    assert.deepEqual(ran, [later.eventId], 'unregister also cancels a peer awaiting invocation for this turn')
  })
}
