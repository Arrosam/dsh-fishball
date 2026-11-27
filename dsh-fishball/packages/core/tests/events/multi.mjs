/**
 * MULTI-1 events rows (PLAN-MULTI §5; contracts README "MULTI-0 amendment": Provenance, Local keys;
 * events.d.ts `InterceptedEvent.source`; requirement 8 of the MULTI-1 test brief). Integration level:
 * the real ledger, the real DSH agent and session log, two fake target mailboxes (world.mjs
 * `secondTarget`), core's events module bound to the relayed per-source seam (subject.mjs).
 *
 * Techniques:
 * - EP over the event's origin: target A only / target B only / both with the same eventId;
 * - Decision table MULTI-EVT-DT-01 (who acks): source A × source B × interceptor handles or not;
 * - State transition MULTI-EVT-ST-01: offered → open for one source while the other source's equal
 *   eventId stays untouched; restart re-offers each open record with its own source.
 * Oracles are the freeze's: two ledger records keyed by the tuple, two manager messages whose ids are
 * `fbe_` + base64url of each tuple, each receipt acked only through its own mailbox, `source` exactly
 * `{targetId, endpointEpoch, serverName, name}` as handed to intake, one registration for both.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'fishball-test-helpers/cases'
import { CORE, DSH, EVENT_TYPE, FIXTURE, SOURCE, WAIT, keyOf } from './constants.mjs'
import { contributedType, eventually, makeEvent, newRoot, openWorld, removeRoot, worldFor } from './world.mjs'
import { TARGETS } from '../support/targets-oracle.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ ep: 'MULTI-EVT-EP-01', dt: 'MULTI-EVT-DT-01', st: 'MULTI-EVT-ST-01' })
const CONTRIBUTED = contributedType()
const SOURCE_FIELDS = Object.freeze(['targetId', 'endpointEpoch', 'serverName', 'name'])

function row(id, part, title, fn) { test(caseName(id, part, title), T, fn) }

/** The ledger's records whose key is `event`'s tuple for `source` (TARGETS.key, kind event). */
function ledgerRecord(world, source, event) {
  const table = world.ctx.storageDomain.get(CORE.ledger.domain)?.table(CORE.ledger.table)
  return table?.get(keyOf(TARGETS.key.kind.event, source, event.eventId))
}
/** Every DSH inbox message id core queued for the Fishball agent (durable splices of its session log). */
async function queuedIds(world) {
  return (await world.sessionLog()).filter((e) => e.type === DSH.inboxSpliced).flatMap((e) => (e.data?.inserted ?? []).map((m) => m.id))
}
/** The same event (id, payload, digest) as each target's mailbox holds it. */
const twin = (type, n) => makeEvent(type, n)
let counter = 9000
const next = (type) => twin(type, ++counter)

/** Publishes `event` on `mailbox` and waits until core polled it. */
async function publishOn(world, mailbox, event) {
  mailbox.publish(event)
  await eventually(() => mailbox.calls.some((c) => c.name === 'inbox_poll'), 'core polled the mailbox after its hint')
}

export function registerMultiEventCases() {
  // ------------------------------------------------------------------ EP: where the event came from
  row(ID.ep, '1 same eventId on A and B', 'A and B both send eventId X → two ledger records (one per tuple), two manager messages fbe_<handle A> / fbe_<handle B>, each acked only on its own mailbox', async (t) => {
    const world = await worldFor(t, { secondTarget: true })
    const event = next(EVENT_TYPE.message)
    await publishOn(world, world.link, event)
    await publishOn(world, world.second, event)
    await world.settle()
    assert.ok(ledgerRecord(world, SOURCE.a, event), 'no ledger record keyed by A\'s tuple')
    assert.ok(ledgerRecord(world, SOURCE.b, event), 'no ledger record keyed by B\'s tuple')
    const ids = await queuedIds(world)
    assert.equal(ids.filter((id) => id === CORE.messageId(event.eventId, SOURCE.a)).length, 1, 'A\'s manager message: ' + JSON.stringify(ids))
    assert.equal(ids.filter((id) => id === CORE.messageId(event.eventId, SOURCE.b)).length, 1, 'B\'s manager message: ' + JSON.stringify(ids))
    assert.equal((await world.admissions(event.marker)).length, 2, 'Fishball is not woken once per target')
    assert.ok(world.link.acked(event.eventId), 'A\'s receipt was not acked on A')
    assert.ok(world.second.acked(event.eventId), 'B\'s receipt was not acked on B')
    assert.deepEqual(world.core.misrouted, [], 'an ack went to a link of another source')
  })
  row(ID.ep, '2 only B', 'an event only B sends → its record is B\'s tuple, acked on B; A\'s mailbox gets no ack', async (t) => {
    const world = await worldFor(t, { secondTarget: true })
    const event = next(EVENT_TYPE.message)
    await publishOn(world, world.second, event)
    await world.settle()
    assert.ok(ledgerRecord(world, SOURCE.b, event), 'no record keyed by B\'s tuple')
    assert.equal(ledgerRecord(world, SOURCE.a, event), undefined, 'a record keyed by A\'s tuple for B\'s event')
    assert.ok(world.second.acked(event.eventId), 'not acked on B')
    assert.equal(world.link.calls.some((c) => c.name === 'inbox_ack'), false, 'an ack reached A for B\'s event')
  })
  row(ID.ep, '3 source shape', 'an interceptor sees event.source = exactly {targetId, endpointEpoch, serverName, name} of the target the event came from, and the mailbox fields unchanged', async (t) => {
    const seen = []
    const world = await worldFor(t, {
      secondTarget: true,
      plugins: [{ pluginId: FIXTURE.pluginX, registrations: [{ types: [CONTRIBUTED] }], handler: async (e, ctl) => { seen.push(e); await ctl.accept() } }],
    })
    const event = next(CONTRIBUTED)
    await publishOn(world, world.second, event)
    await world.settle()
    assert.equal(seen.length, 1, 'the interceptor did not see the event once')
    assert.deepEqual(Object.keys(seen[0].source).sort(), [...SOURCE_FIELDS].sort())
    for (const field of SOURCE_FIELDS) assert.equal(seen[0].source[field], SOURCE.b[field], 'source.' + field)
    const { marker, ...wire } = event
    for (const [field, value] of Object.entries(wire)) assert.deepEqual(seen[0][field], value, 'mailbox field ' + field + ' changed')
  })

  // ------------------------------------------------------------------ DT: one registration for every target; who acks
  for (const [rule, intercepts] of [['1 both intercepted', true], ['2 both to Fishball', false]]) {
    row(ID.dt, rule, `one registration, the same eventId from A and B, ${intercepts ? 'the handler accepts' : 'no registration matches'} → ${intercepts ? 'two offers (A then B source), no wake' : 'two wakes'}; each acked on its own mailbox only`, async (t) => {
      const seen = []
      const plugins = intercepts ? [{ pluginId: FIXTURE.pluginX, registrations: [{ types: [CONTRIBUTED] }], handler: async (e, ctl) => { seen.push(e.source.targetId); await ctl.accept() } }] : []
      const world = await worldFor(t, { secondTarget: true, plugins })
      const event = next(CONTRIBUTED)
      await publishOn(world, world.link, event)
      await publishOn(world, world.second, event)
      await world.settle()
      if (intercepts) assert.deepEqual(seen.sort(), [SOURCE.a.targetId, SOURCE.b.targetId].sort(), 'the one registration did not cover both targets')
      assert.equal((await world.admissions(event.marker)).length, intercepts ? 0 : 2)
      assert.ok(world.link.acked(event.eventId), 'not acked on A')
      assert.ok(world.second.acked(event.eventId), 'not acked on B')
      assert.deepEqual(world.core.misrouted, [])
    })
  }
  row(ID.dt, '3 filter by source', 'a filter reading source.targetId === B takes only B\'s copy; A\'s equal eventId goes to Fishball once', async (t) => {
    const seen = []
    const world = await worldFor(t, {
      secondTarget: true,
      plugins: [{ pluginId: FIXTURE.pluginX, registrations: [{ types: [CONTRIBUTED], filter: (e) => e.source.targetId === SOURCE.b.targetId }], handler: async (e, ctl) => { seen.push(e.source.targetId); await ctl.accept() } }],
    })
    const event = next(CONTRIBUTED)
    await publishOn(world, world.link, event)
    await publishOn(world, world.second, event)
    await world.settle()
    assert.deepEqual(seen, [SOURCE.b.targetId])
    assert.equal((await world.admissions(event.marker)).length, 1, 'A\'s copy did not wake Fishball once')
  })

  // ------------------------------------------------------------------ ST: durable-before-ack per source, restart
  row(ID.st, '1 durable before ack, then restart', 'each ack reaches its mailbox only after the record of that source\'s tuple is in the ledger; after a restart B\'s equal eventId is not deduped against A\'s finished record: its own record, one wake, acked on B', async (t) => {
    const root = await newRoot()
    t.after(() => removeRoot(root))
    const event = next(EVENT_TYPE.message)
    const missing = []
    let world
    const linkHooks = { inbox_ack: (args, mailbox) => {
      const source = mailbox === world?.second ? SOURCE.b : SOURCE.a
      for (const r of args.receipts ?? []) if (ledgerRecord(world, source, { eventId: r.eventId }) === undefined) missing.push(source.targetId)
    } }
    world = await openWorld(root, { secondTarget: true, linkHooks })
    await publishOn(world, world.link, event)
    await world.settle()
    assert.ok(world.link.acked(event.eventId), 'A\'s event was not acked')
    await world.close()
    world = await openWorld(root, { secondTarget: true, linkHooks })
    t.after(() => world.close())
    await publishOn(world, world.second, event)
    await world.settle()
    assert.ok(ledgerRecord(world, SOURCE.b, event), 'B\'s copy has no record of its own')
    assert.equal((await world.admissions(event.marker)).length, 2, 'B\'s copy did not wake Fishball once more (deduped against A?)')
    assert.ok(world.second.acked(event.eventId), 'B\'s copy not acked on B')
    assert.deepEqual(missing, [], 'an ack was sent before its tuple\'s record was durable')
    assert.deepEqual(world.core.misrouted, [])
  })
}
