/**
 * WD-ROUTE black-box cases (.runtime/reports/v3-w3-briefs.md "WD-ROUTE test brief"; v3-tasks.md row
 * WD-ROUTE, wave W3). Written from the requirements (R-WD-00…03, R-WD-07, R-WD-08, R-WD-11,
 * R-WD-12, R-WD-16, R-INT-04/07/09, R-FB-06/07), the cases (docs/test-design/v3/05-watchdog.md), the
 * frozen contracts (K1 mcp-schema; K3 core contracts events.d.ts and constants.js) and design §6.4,
 * §7.1–7.3. No file of packages/watchdog/src/ was read.
 *
 * Techniques, and only these five, Use Cases first: UC (WD-UC-02, WD-UC-04: one test per flow), EP
 * (WD-EP-01 rows 1–11, WD-EP-03, the failure kinds of R-WD-07 as one partition each, and the
 * `preset-watchdog` rows of WD-EP-04 row 5), BVA (the preset's tool set at its edges: both tools
 * offered, nothing beyond them), DT (WD-DT-02, one test per rule) and ST (WD-ST-01, one test per
 * transition row, invalid row 9 included).
 *
 * Level: Watchdog's routing module over F-INTERCEPT's world (a Fishball DSH of real SDK parts with
 * the **real** core events module, a fake connector link and a fake model; ../f-intercept/world.mjs),
 * with a fake `manager.notify` and a scripted WD-DECIDE judge (world.mjs). The `preset-watchdog`
 * runtime rows boot a standalone DSH worker (core + watchdog, no connector, no instance, so no child
 * launch) and run only with FBTEST_V3_INTEGRATION=1. Rows that need a later task are `todo` and name
 * it. The tests fail until WD-ROUTE's module exists.
 *
 * Oracles (the brief):
 * - "to Watchdog" = one of Watchdog's handlers was handed the event, and Fishball was not woken for
 *   it; "to Fishball" = Fishball woken exactly once (durable admission) and no Watchdog handler saw it;
 * - `await ctl.accept()` comes first: in the event's trace, accept resolved `true` before any judge,
 *   link, commit or release step;
 * - exactly two registrations (`permission`; `settlement` + `retirement`), priority 0;
 * - every failure kind makes Watchdog effectively off at once; accepted-undecided items go to
 *   Fishball once; a commit begun is committed or fenced, never both; one "watchdog is down" per
 *   episode, through `manager.notify` only; no watched session is stopped or restarted;
 * - no core present → one `fishball-core-missing` line, boot ok.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from '../shared/cases.mjs'
import { bootHost, newHome } from '../../support/host.mjs'
import { TEST_HOMES } from '../../support/constants.mjs'
import { createRequire } from 'node:module'
import { SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { runtimeOf } from '../core/constants.mjs'
import {
  CORE_MISSING, DOWN, EVENT_TYPE, FAILURE, FIXTURE, INTEGRATION, LATER, NOT_WATCHDOGS, PRESET, REGISTRATIONS, SESSION_CONTROL, SUBJECT,
  TOOL, V3, WAIT,
} from './constants.mjs'
import { ALLOW, ESCALATE, STEP, TO_FISHBALL, contributedType, deferred, waitFor, wdEvent, wdWorld } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ET = EVENT_TYPE
const { s1: S1, s2: S2, s3: S3 } = FIXTURE

// ------------------------------------------------------------------------------------------------
// Row registration

/** One test per case row, named as every V3 suite names them; `todo` names the owning task. */
function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}
/** A row on a fresh world with Watchdog ready (or not, `{ready: false}`). */
const worldRow = (sdk, id, part, title, fn, options) => row(sdk, id, part, title, async (t) => fn(await wdWorld(t, sdk, options), t))
const todoRow = (sdk, id, part, title, owner) => row(sdk, id, part, title, null, owner)
/** A row that boots a real DSH worker; skipped unless FBTEST_V3_INTEGRATION=1. */
function integrationRow(sdk, id, part, title, fn) {
  const name = caseName(sdk, id, part, title)
  if (process.env[INTEGRATION.env] === INTEGRATION.on) test(name, T, fn)
  else test(name, { skip: INTEGRATION.skip }, fn)
}

// ------------------------------------------------------------------------------------------------
// Oracles (each stated once)

/** "To Fishball": woken exactly once for `event`, and no Watchdog handler was handed it (R-WD-12, R-INT-02). */
async function assertToFishball(w, event, why = '') {
  assert.equal(w.handled(event), false, `Watchdog was handed the ${event.type} event ${why}`)
  assert.equal(await w.wakes(event), 1, `Fishball wakes for the ${event.type} event ${why}`)
}
/** "To Watchdog": one of its handlers got `event`, and Fishball was not woken for it (R-INT-07, R-WD-12). */
async function assertToWatchdog(w, event, why = '') {
  assert.equal(w.handled(event), true, `Watchdog was not handed the ${event.type} event ${why}`)
  assert.equal(await w.wakes(event), 0, `Fishball was woken for the ${event.type} event ${why}`)
}
/** R-INT-01 / design §7.1 step 3: `await ctl.accept()` resolved true before any other effect for `event`. */
function assertAcceptFirst(w, event) {
  const steps = w.trace.of(event.eventId).map((s) => s.step).filter((s) => s !== STEP.offered)
  assert.ok(steps.length > 0, 'Watchdog did nothing with the event')
  assert.equal(steps[0], STEP.acceptCalled, `the first step was ${steps[0]}, not ctl.accept()`)
  const accepted = w.trace.of(event.eventId).findIndex((s) => s.step === STEP.accepted && s.ok === true)
  const firstEffect = w.trace.of(event.eventId).findIndex((s) => [STEP.judge, STEP.link, STEP.commit, STEP.release].includes(s.step))
  assert.ok(accepted >= 0, 'ctl.accept() never resolved true')
  if (firstEffect >= 0) assert.ok(accepted < firstEffect, 'an effect came before ctl.accept() resolved')
}
/** R-INT-09: no trace of `event` in any agent's context (F-INTERCEPT's public oracle). */
async function assertOutOfContext(w, event) {
  assert.deepEqual(await w.world.traces(event.marker), [], 'the event reached Fishball\'s context')
  assert.deepEqual(w.world.modelRequestsWith(event.marker), [], 'the event reached a model request')
}
/** R-WD-07: no watched session was stopped or restarted (nothing of the kind left Watchdog's link). */
function assertNoSessionControl(w) {
  const control = w.link.calls.filter((c) => SESSION_CONTROL.includes(c.name))
  assert.deepEqual(control, [], 'Watchdog stopped, restarted or drove a watched session')
}
/** R-WD-07 / R-WD-08: the "watchdog is down" notices, each waking, through `manager.notify` only. */
function assertDownNotices(w, n) {
  const down = w.downNotices(DOWN.text)
  assert.equal(down.length, n, `"watchdog is down" notices: ${JSON.stringify(w.notices.map((x) => x?.text))}`)
  for (const notice of down) assert.equal(notice.wake, true, 'a "watchdog is down" notice that does not wake Fishball')
  const viaLink = w.link.calls.filter((c) => DOWN.text.test(JSON.stringify(c.args)))
  assert.deepEqual(viaLink, [], 'the notice went over the connector (MCP), not in-session (R-WD-08)')
}

// ------------------------------------------------------------------------------------------------
// Steps

/** Supervise each session (a live claim on a session Fishball manages). */
async function supervise(w, ...sessions) { for (const s of sessions) await w.routing.supervise(s) }
/** A supervised permission whose judgement is held open: resolves once Watchdog accepted it; `hold` decides it. */
async function heldPermission(w, session = S1) {
  const hold = deferred()
  w.verdicts.push(() => hold.promise)
  const event = wdEvent(ET.permission, { session })
  w.closeLater(async () => hold.resolve(ALLOW))
  w.world.link.publish(event)
  w.link.offers.set(event.offer.offerId, event.eventId)
  assert.ok(await waitFor(() => w.trace.of(event.eventId).some((s) => s.step === STEP.judge)), 'Watchdog never judged the held permission')
  return { event, hold }
}
/** Fails Watchdog by `kind`: the model kind through a failing judgement, every other kind through X14 `fail(cause)`. */
async function failBy(w, kind, held) {
  if (kind === FAILURE.model) held.hold.reject(new Error(FIXTURE.modelFault))
  else w.routing.fail({ kind, error: new Error(`fbtest: ${kind} failure`) })
  await w.settle()
}
/** A judged permission Watchdog answered with `verdict` (default allow): settles before returning. */
async function judged(w, verdict = ALLOW, session = S1) {
  w.verdicts.push(verdict)
  return w.publish(wdEvent(ET.permission, { session }))
}

/** Every type that is not a supervised permission, as WD-UC-02 main lists them (turn-finished twice). */
const OTHER_EVENTS = Object.freeze([
  ['turn-finished mid-work (running=true)', ET.turnFinished, { running: true, queued: false }],
  ['turn-finished mid-work (queued=true)', ET.turnFinished, { running: false, queued: true }],
  ['turn-finished idle (running=false, queued=false)', ET.turnFinished, { running: false, queued: false }],
  ['state', ET.state],
  ['question', ET.question],
  ['plan-review', ET.planReview],
  ['message', ET.message],
  ['ask', ET.ask],
  ['handover', ET.handover],
  ['takeback', ET.takeback],
  ['notice', ET.notice],
  ['contributed:x.y', null],
])
const otherEvent = ([, type, flags], session = S1) => wdEvent(type ?? contributedType(), { session, flags })

// ------------------------------------------------------------------------------------------------
// Use Cases

function useCases(sdk) {
  const UC02 = 'WD-UC-02'
  worldRow(sdk, UC02, 'main', 'every event of a supervised session other than permission reaches Fishball; Watchdog\'s handler is never called and no Watchdog step runs', async (w) => {
    await supervise(w, S1)
    for (const spec of OTHER_EVENTS) {
      const event = await w.publish(otherEvent(spec))
      await assertToFishball(w, event, `(${spec[0]})`)
    }
    assert.equal(w.trace.steps.filter((s) => s.step === STEP.judge).length, 0, 'a Watchdog model step (judgement) ran')
  })
  worldRow(sdk, UC02, 'A1', 'an unsupervised session S2\'s permission reaches Fishball', async (w) => {
    await supervise(w, S1)
    await assertToFishball(w, await w.publish(wdEvent(ET.permission, { session: S2 })))
  })
  worldRow(sdk, UC02, 'post', 'Watchdog received only supervised permission and its own offers\' settlement / retirement', async (w) => {
    await supervise(w, S1)
    const own = await judged(w, ESCALATE)
    for (const spec of OTHER_EVENTS) await w.publish(otherEvent(spec))
    await w.publish(wdEvent(ET.permission, { session: S2 }))
    const settled = await w.publish(wdEvent(ET.settlement, { of: own }))
    const seen = new Set(w.trace.registrations.flatMap((r) => r.seen))
    assert.deepEqual([...seen].sort(), [own.eventId, settled.eventId].sort(), 'Watchdog was handed other events')
  })

  const UC04 = 'WD-UC-04'
  worldRow(sdk, UC04, 'main', 'a failure: O1 (accepted, undecided) to Fishball once, its late answer fenced, one in-session "watchdog is down", S1\'s next permission to Fishball', async (w) => {
    await supervise(w, S1, S2)
    const held = await heldPermission(w)
    assertAcceptFirst(w, held.event)
    await failBy(w, FAILURE.viaFail[FAILURE.viaFail.length - 1], held)
    assert.ok(await waitFor(async () => (await w.wakes(held.event)) >= 1), 'O1 never reached Fishball')
    held.hold.resolve(ALLOW)
    await w.settle()
    assert.equal(await w.wakes(held.event), 1, 'Fishball wakes for O1')
    assert.deepEqual(w.answers(held.event), [], 'the late Watchdog answer for O1 was sent (not fenced)')
    assertDownNotices(w, 1)
    await assertToFishball(w, await w.publish(wdEvent(ET.permission, { session: S1 })), '(S1 after the failure)')
    assertNoSessionControl(w)
  })
  worldRow(sdk, UC04, 'main 5', 'an answer already in flight when Watchdog fails is committed or fenced, never both', async (w) => {
    await supervise(w, S1)
    const inFlight = deferred()
    w.link.gate = inFlight.promise
    w.verdicts.push(ALLOW)
    const event = wdEvent(ET.permission)
    w.link.offers.set(event.offer.offerId, event.eventId)
    w.world.link.publish(event)
    assert.ok(await waitFor(() => w.trace.of(event.eventId).some((s) => s.step === STEP.send)), 'Watchdog\'s commit never began')
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: failure during a commit') })
    inFlight.resolve()
    w.link.gate = null
    await w.settle()
    const committed = w.answers(event).length
    const wakes = await w.wakes(event)
    assert.ok((committed === 1 && wakes === 0) || (committed === 0 && wakes === 1), `committed ${committed} times and Fishball woken ${wakes} times`)
  })
  worldRow(sdk, UC04, 'A1', 'Watchdog supervises zero sessions when it fails: the notice is still sent', async (w) => {
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: failure with nothing supervised') })
    await w.settle()
    assertDownNotices(w, 1)
  })
  worldRow(sdk, UC04, 'A2', 'down, recovered, down again: two notices, one per episode', async (w) => {
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: first episode') })
    await w.restart()
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: second episode') })
    await w.settle()
    assertDownNotices(w, 2)
    const keys = w.downNotices(DOWN.text).map((n) => n.dedupeKey)
    assert.notEqual(keys[0], keys[1], 'both episodes used one dedupe key, so X10 would drop the second notice')
  })
  worldRow(sdk, UC04, 'E1', 'loss of core\'s link is not a Watchdog failure: no notice, and Watchdog stays on', async (w) => {
    await supervise(w, S1)
    w.link.down = true
    await judged(w)
    w.link.down = false
    assertDownNotices(w, 0)
    const after = await judged(w)
    await assertToWatchdog(w, after, '(after the link came back)')
  })
  worldRow(sdk, UC04, 'post', 'S1 and S2 are neither stopped nor restarted by the failure', async (w) => {
    await supervise(w, S1, S2)
    const held = await heldPermission(w)
    await failBy(w, FAILURE.model, held)
    assertNoSessionControl(w)
  })
}

// ------------------------------------------------------------------------------------------------
// Equivalence Partitioning

function partitions(sdk) {
  const EP01 = 'WD-EP-01'
  worldRow(sdk, EP01, 1, 'permission, supervised, healthy → Watchdog (accept first, no Fishball turn, out of context)', async (w) => {
    await supervise(w, S1)
    const event = await judged(w)
    await assertToWatchdog(w, event)
    assertAcceptFirst(w, event)
    await assertOutOfContext(w, event)
    assert.equal(w.answers(event).length, 1, 'Watchdog\'s answer was not committed once through core\'s link')
  })
  worldRow(sdk, EP01, 2, 'permission, managed but unclaimed, healthy → Fishball', async (w) => {
    await supervise(w, S1)
    await assertToFishball(w, await w.publish(wdEvent(ET.permission, { session: S3 })))
  })
  worldRow(sdk, EP01, 3, 'permission, supervised, Watchdog down → Fishball', async (w) => {
    await supervise(w, S1)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    await assertToFishball(w, await w.publish(wdEvent(ET.permission)))
  })
  const toFishball = (part, title, types) => worldRow(sdk, EP01, part, `${title}, supervised, healthy → Fishball`, async (w) => {
    await supervise(w, S1)
    for (const spec of types) await assertToFishball(w, await w.publish(otherEvent(spec)), `(${spec[0]})`)
  })
  const pick = (...names) => OTHER_EVENTS.filter(([label]) => names.some((n) => label.startsWith(n)))
  toFishball(4, 'question and plan-review', pick('question', 'plan-review'))
  toFishball(5, 'turn-finished with any flags', pick('turn-finished'))
  toFishball(6, 'state', pick('state'))
  toFishball(7, 'message, ask, handover and takeback', pick('message', 'ask', 'handover', 'takeback'))
  toFishball(8, 'notice and contributed:*', pick('notice', 'contributed'))
  worldRow(sdk, EP01, 9, 'settlement of an offer Watchdog escalated, and retirement of an offer it holds → Watchdog', async (w) => {
    await supervise(w, S1)
    const escalated = await judged(w, ESCALATE)
    await assertToWatchdog(w, await w.publish(wdEvent(ET.settlement, { of: escalated })), '(settlement of an escalated offer)')
    const held = await heldPermission(w)
    await assertToWatchdog(w, await w.publish(wdEvent(ET.retirement, { of: held.event })), '(retirement of a held offer)')
  })
  todoRow(sdk, EP01, '9 (note)', 'the user settles an escalated card: Fishball gets the outcome as a non-waking note at its next turn', LATER.decide)
  worldRow(sdk, EP01, 10, 'settlement and retirement of an offer Fishball held → Fishball', async (w) => {
    await supervise(w, S1)
    const fishballs = await w.publish(wdEvent(ET.permission, { session: S2 }))
    await assertToFishball(w, await w.publish(wdEvent(ET.settlement, { session: S2, of: fishballs })), '(settlement)')
    const other = await w.publish(wdEvent(ET.permission, { session: S2 }))
    await assertToFishball(w, await w.publish(wdEvent(ET.retirement, { session: S2, of: other })), '(retirement)')
  })
  worldRow(sdk, EP01, 11, 'settlement of a Watchdog-held offer while Watchdog is down → Fishball (filter false)', async (w) => {
    await supervise(w, S1)
    const escalated = await judged(w, ESCALATE)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    await assertToFishball(w, await w.publish(wdEvent(ET.settlement, { of: escalated })))
  })

  // R-WD-07: one partition per failure kind; each makes Watchdog effectively off at once.
  for (const kind of [FAILURE.model, ...FAILURE.viaFail]) {
    worldRow(sdk, 'WD-UC-04', `main (${kind})`, `a ${kind} failure makes Watchdog effective off at once: O1 to Fishball once, one notice, no session stopped`, async (w) => {
      await supervise(w, S1, S2)
      const held = await heldPermission(w)
      await failBy(w, kind, held)
      assert.ok(await waitFor(async () => (await w.wakes(held.event)) >= 1), 'O1 never reached Fishball')
      if (kind !== FAILURE.model) held.hold.resolve(ALLOW)
      await w.settle()
      assert.equal(await w.wakes(held.event), 1, 'Fishball wakes for O1')
      assert.deepEqual(w.answers(held.event), [], 'a Watchdog answer for O1 was sent after the failure')
      assertDownNotices(w, 1)
      await assertToFishball(w, await w.publish(wdEvent(ET.permission, { session: S2 })), '(the next supervised permission)')
      assertNoSessionControl(w)
    })
  }

  const EP03 = 'WD-EP-03'
  integrationRow(sdk, EP03, 1, 'fishball-watchdog installed in a DSH with no core: boot ok, one fishball-core-missing line', async (t) => {
    const host = await presetHost(t, sdk, { core: false })
    const bundle = (await host.call('allBundles')).find((b) => b.name === V3.watchdog.name)
    assert.equal(bundle?.enabled, true, `${V3.watchdog.name} is not an enabled bundle of the booted DSH`)
    assert.equal((await coreMissing(host)).length, 1, 'fishball-core-missing lines')
  })
  worldRow(sdk, EP03, 2, 'in a Fishball DSH with core: Watchdog registers with core\'s interception service', async (w) => {
    assert.equal(liveRegistrations(w).length, REGISTRATIONS.count, 'Watchdog\'s live registrations')
  })
  integrationRow(sdk, EP03, '2 (boot)', 'fishball-watchdog with core: boot ok, no fishball-core-missing line', async (t) => {
    const host = await presetHost(t, sdk)
    assert.deepEqual(await coreMissing(host), [], 'core is present, yet fishball-core-missing was logged')
  })
  worldRow(sdk, EP03, 3, 'Watchdog has no MCP traffic of its own: no listen, poll, ack or pairing; its answers go out on core\'s one link', async (w) => {
    await supervise(w, S1)
    await judged(w)
    await judged(w, ESCALATE)
    await judged(w, TO_FISHBALL)
    assert.equal(w.link.listeners, 0, 'Watchdog listens to fishball://events itself')
    assert.deepEqual(w.link.calls.filter((c) => NOT_WATCHDOGS.includes(c.name)), [], 'Watchdog polled, acked or paired on its own')
    assert.deepEqual([...new Set(w.link.calls.map((c) => c.name))], [TOOL.approvalAnswer], 'Watchdog called other tools than approval_answer')
  })
  todoRow(sdk, EP03, 4, 'Fishball\'s token entry revoked at C: Watchdog\'s next commit fails with Fishball\'s link', LATER.revoke)
  worldRow(sdk, EP03, 5, 'Watchdog → Fishball messages (escalation to Fishball, "watchdog is down") travel only through manager.notify', async (w) => {
    await supervise(w, S1)
    const event = await judged(w, TO_FISHBALL)
    assert.equal(await w.wakes(event), 1, 'the released request did not wake Fishball once')
    const reasoning = w.notices.filter((n) => String(n?.text ?? '').includes(FIXTURE.reasoning))
    assert.equal(reasoning.length, 1, 'the escalation to Fishball carried its reasoning in one manager.notify')
    assert.equal(reasoning[0].wake, true, 'the reasoning notice does not wake (design §7.2)')
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    await w.settle()
    assertDownNotices(w, 1)
    assert.deepEqual(w.link.calls.filter((c) => JSON.stringify(c.args).includes(FIXTURE.reasoning)), [], 'the reasoning went over MCP')
  })
}

/** Watchdog's registrations that are not disposed. */
const liveRegistrations = (w) => w.trace.registrations.filter((r) => !r.disposed)
/**
 * R-FB-06's lines in a booted DSH: the warnings and errors its logger exported after boot, or, when
 * none carry it, its process output (a line logged during boot precedes the worker's exporter).
 */
async function coreMissing(host) {
  const logged = (await host.call('loggedProblems')).filter((p) => p.name === CORE_MISSING || String(p.text).includes(CORE_MISSING))
  return logged.length > 0 ? logged : host.output.split('\n').filter((line) => line.includes(CORE_MISSING))
}

// ------------------------------------------------------------------------------------------------
// Decision Table

function decisionTable(sdk) {
  const DT02 = 'WD-DT-02'
  const rule = (n, title, setup, permissionTo) => worldRow(sdk, DT02, `rule ${n}`, title, async (w) => {
    await setup(w)
    const permission = await w.publish(wdEvent(ET.permission))
    if (permissionTo === 'watchdog') await assertToWatchdog(w, permission, '(permission)')
    else await assertToFishball(w, permission, '(permission)')
    await assertToFishball(w, await w.publish(wdEvent(ET.turnFinished)), '(another event)')
  })
  rule(1, 'managed, claimed, healthy: permission → Watchdog, other events → Fishball', (w) => supervise(w, S1), 'watchdog')
  rule(2, 'managed, claimed, not healthy: permission and other events → Fishball', async (w) => {
    await supervise(w, S1)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
  }, 'fishball')
  rule(3, 'managed, not claimed, healthy: permission and other events → Fishball', async () => {}, 'fishball')
  todoRow(sdk, DT02, 'rule 4', 'managed by another principal: nothing reaches this Fishball DSH', LATER.connector)
  todoRow(sdk, DT02, 'rule 5', 'unmanaged: the permission goes to the user in the session', LATER.connector)
}

// ------------------------------------------------------------------------------------------------
// State Transitions

function transitions(sdk) {
  const ST01 = 'WD-ST-01'
  worldRow(sdk, ST01, 1, 'NotLoaded → core ready(), registration ok → Healthy: exactly two registrations (permission; settlement + retirement), priority 0', async (w) => {
    const live = liveRegistrations(w)
    assert.equal(live.length, REGISTRATIONS.count, 'Watchdog\'s registrations')
    const types = live.map((r) => [...r.registration.types].sort())
    assert.deepEqual(types.sort(), [[...REGISTRATIONS.permission].sort(), [...REGISTRATIONS.outcome].sort()].sort(), 'the two registrations\' types')
    for (const r of live) assert.equal(r.registration.priority ?? REGISTRATIONS.priority, REGISTRATIONS.priority, 'a registration\'s priority')
    for (const r of live) assert.equal(typeof r.registration.filter, 'function', 'a registration without a supervision filter')
    assert.equal(new Set(live.map((r) => r.registration.pluginId)).size, 1, 'the two registrations name different plugins')
  })
  worldRow(sdk, ST01, '2 (loaded)', 'loaded, but its registration fails at ready → Down: one "watchdog is down"; permissions → Fishball', async (w) => {
    w.gate.refuse = true
    await w.routing.ready().catch(() => {})
    await w.settle()
    assertDownNotices(w, 1)
    await supervise(w, S1).catch(() => {})
    await assertToFishball(w, await w.publish(wdEvent(ET.permission)))
  }, { ready: false })
  todoRow(sdk, ST01, '2 (never loaded)', 'enabled, never loaded by app ready → Down: one "watchdog is down"', LATER.neverLoaded)
  worldRow(sdk, ST01, 3, 'Healthy → a failure → Down: filters false at once, pending item to Fishball, one notice', async (w) => {
    await supervise(w, S1)
    const held = await heldPermission(w)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    const right = await w.publish(wdEvent(ET.permission))
    await assertToFishball(w, right, '(right after the failure)')
    assert.equal(await w.wakes(held.event), 1, 'the pending item did not reach Fishball once')
    assertDownNotices(w, 1)
  })
  worldRow(sdk, ST01, 4, 'Down → another failure → Down: no second notice in the same episode', async (w) => {
    await supervise(w, S1)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: first') })
    w.routing.fail({ kind: FAILURE.viaFail[1], error: new Error('fbtest: second') })
    await w.settle()
    assertDownNotices(w, 1)
  })
  worldRow(sdk, ST01, 5, 'Down → recovery (restart of the plugin) → Healthy: re-registered, supervised permission → Watchdog', async (w) => {
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    await w.restart()
    assert.equal(liveRegistrations(w).length, REGISTRATIONS.count, 'live registrations after the restart')
    await supervise(w, S1)
    await assertToWatchdog(w, await judged(w))
  })
  worldRow(sdk, ST01, 6, 'Healthy → link to the connector lost → Healthy: no notice', async (w) => {
    await supervise(w, S1)
    w.link.down = true
    await judged(w)
    w.link.down = false
    assertDownNotices(w, 0)
    await assertToWatchdog(w, await judged(w), '(still healthy)')
  })
  worldRow(sdk, ST01, 7, 'Healthy → owner disables the plugin → Off: registrations gone, everything to Fishball', async (w) => {
    await supervise(w, S1)
    await w.routing.dispose()
    assert.deepEqual(liveRegistrations(w), [], 'a registration outlived the plugin')
    await assertToFishball(w, await w.publish(wdEvent(ET.permission)))
  })
  worldRow(sdk, ST01, 8, 'Down → a late model result for O1 → Down: fenced, not committed', async (w) => {
    await supervise(w, S1)
    const held = await heldPermission(w)
    w.routing.fail({ kind: FAILURE.viaFail[0], error: new Error('fbtest: down') })
    held.hold.resolve(ALLOW)
    await w.settle()
    assert.deepEqual(w.answers(held.event), [], 'the late result was committed')
  })
  worldRow(sdk, ST01, '9 (invalid)', 'a failure never stops or restarts a supervised session (every failure kind)', async (w) => {
    await supervise(w, S1, S2)
    for (const kind of FAILURE.viaFail) {
      w.routing.fail({ kind, error: new Error(`fbtest: ${kind}`) })
      await w.restart()
      await supervise(w, S1, S2)
    }
    await w.settle()
    assertNoSessionControl(w)
  })
}

// ------------------------------------------------------------------------------------------------
// The `preset-watchdog` agent preset (R-WD-16, WD-EP-04 row 5; user decision 2026-11-15: read, read_image)

/** The YAML reader DSH's own runtime ships (both SDKs). */
const YAML_PACKAGE = 'yaml'
/** Watchdog's patch rows (its cordis.patch.yml parsed with the SDK's own YAML reader). */
function patchRows(sdk) {
  const yaml = createRequire(path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.packageFile))(YAML_PACKAGE)
  const doc = yaml.parse(fs.readFileSync(SUBJECT.patch, 'utf8'))
  return (Array.isArray(doc) ? doc : [doc]).flatMap((op) => op?.insert ?? [])
}
/**
 * A standalone DSH home with Watchdog and core linked (each optionally off), core last; the
 * connector and the instance stay unselected, so nothing launches a child.
 */
async function presetHost(t, sdk, { watchdog = true, core = true } = {}) {
  assert.ok(path.basename(path.dirname(TEST_HOMES)) === '.runtime', 'unexpected test home root ' + TEST_HOMES)
  const home = fs.realpathSync(newHome(FIXTURE.homeLabel))
  const link = [
    { name: V3.watchdog.name, dir: V3.watchdog.dir, enabled: watchdog },
    ...(core ? [{ name: V3.core.name, dir: V3.core.dir, enabled: true }] : []),
  ]
  const host = await bootHost(home, { env: { FBTEST_DSH_RUNTIME: runtimeOf(sdk), FBTEST_PLUGIN: INTEGRATION.pluginOff, FBTEST_LINK: JSON.stringify(link) } })
  t.after(async () => {
    await host.stop()
    // Guard the one recursive delete: the home this helper made directly under the test-homes root.
    if (path.dirname(home) === fs.realpathSync(TEST_HOMES) && path.basename(home).startsWith(FIXTURE.homeLabel)) fs.rmSync(home, { recursive: true, force: true })
  })
  return host
}
/** The tools a session on the `watchdog` preset is offered in one model request. */
async function offeredTools(host) {
  const created = await host.call('ordinary', { preset: PRESET.id })
  assert.equal(created.error, null, `the watchdog session did not resolve: ${JSON.stringify(created.error)}`)
  assert.equal(created.agentPreset ?? PRESET.id, PRESET.id, 'the session does not run the watchdog preset')
  const turn = await host.call('drive', { sessionId: created.sessionId })
  assert.ok(turn.requests.length > 0, 'the watchdog session made no model request')
  return [...new Set(turn.requests.flatMap((r) => r.tools.map((tool) => tool.name)))].sort()
}

function presetRows(sdk) {
  const ID = 'WD-EP-04'
  row(sdk, ID, '5 (row)', 'the watchdog patch inserts preset-watchdog: a DSH agent preset with id watchdog', async () => {
    const preset = patchRows(sdk).find((r) => r?.id === PRESET.row)
    assert.ok(preset, `${path.relative(process.cwd(), SUBJECT.patch)} inserts no ${PRESET.row} row`)
    assert.equal(preset.name, PRESET.module, `${PRESET.row} is not a DSH agent preset row`)
    assert.equal(preset.config?.id, PRESET.id, `${PRESET.row}'s preset id`)
    assert.notEqual(preset.disabled, true, `${PRESET.row} is inserted switched off`)
  })
  integrationRow(sdk, ID, '5 (offered)', 'with core last, the watchdog preset is offered beside fishball (the default); core\'s guards never switch it off', async (t) => {
    const host = await presetHost(t, sdk)
    const ids = await host.call('presets')
    assert.ok(ids.includes(PRESET.id), `the roster lacks ${PRESET.id}: ${JSON.stringify(ids)}`)
    assert.ok(ids.includes(await host.call('defaultPreset')), 'the default preset is not offered')
    const watchdogBundle = (await host.call('allBundles')).find((b) => b.name === V3.watchdog.name)
    assert.ok(watchdogBundle?.rows.includes(PRESET.row), `${V3.watchdog.name} contributes no ${PRESET.row} row`)
  })
  integrationRow(sdk, ID, '5 (tools)', 'a session on the watchdog preset is offered read and read_image, and nothing beyond them but DSH\'s global working_directory (no session-creating tool)', async (t) => {
    const host = await presetHost(t, sdk)
    const tools = await offeredTools(host)
    for (const tool of PRESET.tools) assert.ok(tools.includes(tool), `the watchdog session lacks ${tool}: ${JSON.stringify(tools)}`)
    const allowed = new Set([...PRESET.tools, ...PRESET.global])
    assert.deepEqual(tools.filter((tool) => !allowed.has(tool)), [], 'the watchdog session is offered more than read and read_image')
  })
  integrationRow(sdk, ID, '5 (disabled)', 'with Watchdog disabled the watchdog preset is absent', async (t) => {
    const host = await presetHost(t, sdk, { watchdog: false })
    const ids = await host.call('presets')
    assert.ok(!ids.includes(PRESET.id), `the roster still offers ${PRESET.id}: ${JSON.stringify(ids)}`)
  })
}

/** Every WD-ROUTE case for `sdk`, Use Cases first. */
export function registerWdRouteCases(sdk) {
  useCases(sdk)
  partitions(sdk)
  decisionTable(sdk)
  transitions(sdk)
  presetRows(sdk)
}
