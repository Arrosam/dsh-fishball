/**
 * The S2 crash windows (EVT-DT-03, EVT-DT-04 rules 7–8, EVT-ST-02 rows 5e, 5f, 8, 11a, EVT-UC-02 E1b,
 * E2, E2a). A crash is a real SIGKILL of a fresh Node process that holds one Fishball DSH, then a
 * second process reopens the same root, as spike V3-S2 did: one process cannot reopen a DSH session
 * it still owns (the JSONL write lock), and a crash must leave only what was made durable.
 *
 * Run as a script: `node crash.mjs <sdk> <root> <scenario> <phase>`; phase `cut` publishes the event
 * and dies at the scenario's cut point; phase `recover` reopens, settles and prints one JSON report.
 * The user's decisions 2026-11-14 1, 2 and 4 add: a scenario may change the root between the two
 * phases (`between`), reopen in another Fishball session (`restartIn`), inject a fault into the
 * recover phase's startup recovery and publish a later event there (`recoverFault`), and run a
 * third, clean start (`restart`) whose report is the result's `restart` field. Row 11e (decision 4)
 * adds the `pending` cut (core's message left unclaimed in Fishball's DSH inbox) and an act of the
 * user's right after the restart's world opens, before core starts (`atRestart`).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { CORE, DSH, EVENT_TYPE, FIXTURE, TOOL, WAIT } from './constants.mjs'
import { until } from '../../support/util.mjs'
import { busyGate, contributedType, durablyAdmitted, forgetSession, makeEvent, openWorld, readLines, startBusy } from './world.mjs'

const PHASE = Object.freeze({ cut: 'cut', recover: 'recover', restart: 'restart' })

/** One event per scenario; its marker is fixed so every phase sees the same identity. */
const EVENT_NUMBER = 1
/** The event a faulty recover phase publishes after its failed recovery (decision 2026-11-14 2). */
const LATER_EVENT_NUMBER = 2
const interceptedType = contributedType()

/** Startup-recovery faults of the recover phase (decision 2026-11-14 2), by name. */
export const RECOVER_FAULT = Object.freeze({ activate: 'activate', ledgerWrite: 'ledgerWrite' })
/** Between-phase actions on the root, run by the parent process while no world is open. */
const BETWEEN = Object.freeze({ clearFishball: (root) => forgetSession(root, FIXTURE.fishballSession) })

/**
 * Scenarios by the case rows they serve. `type` picks the route (a contributed type has a
 * registration; a message has none). `cut` names where phase 1 dies. `pluginAtRestart` says whether
 * the interceptor's plugin is up when the Fishball DSH comes back.
 */
export const SCENARIO = Object.freeze({
  fishballBeforeAcceptance: { type: EVENT_TYPE.message, cut: 'poll' },
  fishballBeforeAck: { type: EVENT_TYPE.message, cut: 'ack' },
  fishballMidTurn: { type: EVENT_TYPE.message, cut: 'model' },
  interceptorBeforeAck: { type: interceptedType, cut: 'ack', pluginAtRestart: true },
  interceptorOpenUp: { type: interceptedType, cut: 'afterAccept', pluginAtRestart: true },
  interceptorOpenOff: { type: interceptedType, cut: 'afterAccept', pluginAtRestart: false },
  // Decision 2026-11-14 1: the claiming step dies before the event is admitted (`interrupted`).
  fishballClaimCrash: { type: EVENT_TYPE.message, cut: 'claim' },
  // Decision 4 (b): accepted for Fishball and acked while it is busy, not admitted, then the crash.
  fishballQueuedBusy: { type: EVENT_TYPE.message, cut: 'queued' },
  // Decision 4 (a): admitted and its turn done, then the Fishball session is cleared or replaced.
  admittedThenCleared: { type: EVENT_TYPE.message, cut: 'settled', between: 'clearFishball' },
  admittedThenReplaced: { type: EVENT_TYPE.message, cut: 'settled', restartIn: FIXTURE.replacementSession },
  // Decision 4 window: the session holds the admission, the ledger's `admitted` write has not landed.
  admissionLedgerWindow: { type: EVENT_TYPE.message, cut: 'admitting' },
  // Decision 2: startup recovery fails; a later event still goes through; the next start delivers.
  recoverActivateFails: { type: EVENT_TYPE.message, cut: 'queued', recoverFault: RECOVER_FAULT.activate, restart: true },
  recoverLedgerFails: { type: interceptedType, cut: 'afterAccept', pluginAtRestart: false, recoverFault: RECOVER_FAULT.ledgerWrite, restart: true },
  // Decision 4, row 11e: core's message is left pending (unclaimed) in Fishball's DSH inbox by the
  // first process; at restart the user's ordinary message wakes the agent before core delivers, or
  // the user removes the stale copy from the inbox. A later event then passes more idle edges.
  stalePendingUserWakes: { type: EVENT_TYPE.message, cut: 'pending', atRestart: 'userWakes', later: true },
  stalePendingUserRemoves: { type: EVENT_TYPE.message, cut: 'pending', atRestart: 'userRemoves', later: true },
})

/** Whether core's message for `event` waits in `agent`'s DSH inbox (either pending list). */
const pendingIn = (agent, event) => [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some((m) => m.id === CORE.messageId(event.eventId))
/**
 * The "pending" cut (row 11e): when the driver wakes for core's message (`agent/status` running is
 * emitted synchronously, before the turn opens and claims), a hook cancels that wake and keeps the
 * inbox, so the message stays pending and unclaimed and no turn opens. The cut phase then dies
 * (child()). Only the first such wake is cancelled.
 */
function holdPending(world, event) {
  let done = false
  world.ctx.on(DSH.agentStatus, (payload) => {
    if (done || payload.status !== DSH.running || !pendingIn(world.agent, event)) return
    done = true
    world.agent.cancel(DSH.hookCancel, { keepInbox: true })
  })
}
/**
 * The recover phase's first act (row 11e), from `onOpen`: right after the world opens and before
 * core starts, so before core's own delivery. Returns a harness fact for the report.
 */
const AT_RESTART = Object.freeze({
  // The user's ordinary message: its turn claims the stale copy too.
  userWakes: (world) => { world.agent.followup(world.userMessage(FIXTURE.userText, FIXTURE.userId)); return true },
  // The user removes the stale copy from DSH's inbox (a logged, canceled splice and a discard).
  userRemoves: (world, event) => world.agent.inbox.remove(CORE.messageId(event.eventId)),
})
/** The states (STATE values) of core's ledger records that name `event` (decision 4). */
export function ledgerStates(world, event) {
  const table = world.ctx.storageDomain.get(CORE.ledger.domain)?.table(CORE.ledger.table)
  if (table === undefined) return []
  return [...table.entries()]
    .filter(([key, record]) => key === event.eventId || JSON.stringify(record).includes(JSON.stringify(event.eventId)))
    .flatMap(([, record]) => Object.values(record).filter((v) => CORE.states.includes(v)))
}

/** SIGKILL now, with nothing more made durable. */
async function kill() {
  process.kill(process.pid, 'SIGKILL')
  await new Promise(() => {})
}
async function die(world) {
  await world.ctx.sessions.flush(world.agent.session)
  await kill()
}

/** The record a ledger write stores, or undefined for a delete (`update`'s transform is pure, K-domain). */
function written({ op, args, table }) {
  if (op === 'put') return args[1]
  if (op === 'update') return args[1](table.get(args[0]))
  return undefined
}
/** Whether a ledger write moves a record to core's admitted state (decision 2026-11-14 4). */
const admitsRecord = (write) => {
  const next = written(write)
  return next !== null && typeof next === 'object' && Object.values(next).includes(CORE.admitted)
}

/**
 * The window cut (decision 4): holds the ledger's `admitted` write, waits until the admission is in
 * the Fishball session's durable log, then dies without flushing (a flush could wait on the held
 * write). It records whether the admission was durable at the cut, so a report tells the two apart.
 */
async function dieInAdmissionWindow(world, event) {
  await until(() => durablyAdmitted(world.root, FIXTURE.fishballSession, event.marker), WAIT.settleMs, WAIT.pollMs)
  fs.writeFileSync(world.file('window'), JSON.stringify({ durable: durablyAdmitted(world.root, FIXTURE.fishballSession, event.marker) }))
  await kill()
}

/** The recover phase's fault (decision 2), counting how often it fired. */
function recoverSeam(fault, fired) {
  if (fault === RECOVER_FAULT.activate) {
    return { activate: async ({ agent, recovering }) => { if (recovering) { fired.count += 1; throw new Error(FIXTURE.fault) } return agent } }
  }
  if (fault === RECOVER_FAULT.ledgerWrite) {
    return { ledgerWrite: async ({ recovering }) => { if (recovering && fired.count === 0) { fired.count += 1; throw new Error(FIXTURE.fault) } } }
  }
  return undefined
}

/**
 * The scripted interceptor: accepts first, then makes its effect once per `eventId` (its own durable
 * witness file is its dedupe store), as R-INT-04 requires of an interceptor.
 */
function interceptor(world, scenario, phase) {
  return {
    pluginId: FIXTURE.pluginX,
    registrations: [{ types: [interceptedType] }],
    handler: async (event, ctl) => {
      if (!(await ctl.accept())) return
      if (phase === PHASE.cut && scenario.cut === 'afterAccept') await die(world())
      const witness = world().file('interceptor')
      if (readLines(witness).some((w) => w.eventId === event.eventId)) return
      fs.appendFileSync(witness, JSON.stringify({ pid: process.pid, eventId: event.eventId }) + '\n')
    },
  }
}

async function child(sdk, root, name, phase) {
  const scenario = SCENARIO[name]
  const event = makeEvent(scenario.type, EVENT_NUMBER)
  let world
  const cutAt = (point) => phase === PHASE.cut && scenario.cut === point
  const linkHooks = {
    // Dies inside the first poll that would return the event: core has not seen it yet.
    [TOOL.inboxPoll]: async (_args, link) => { if (cutAt('poll') && link.state().events.length > 0) await die(world) },
    [TOOL.inboxAck]: async () => { if (cutAt('ack')) await die(world) },
  }
  const gate = busyGate()
  const onRequest = async (texts, options) => {
    if (cutAt('model') && texts.includes(event.marker)) await die(world)
    return cutAt('queued') ? gate.onRequest(texts, options) : undefined
  }
  const plugUp = phase === PHASE.cut || scenario.pluginAtRestart === true
  const intercepted = scenario.type === interceptedType
  const plugins = intercepted && plugUp ? [interceptor(() => world, scenario, phase)] : []
  const fired = { count: 0 }
  const seam = phase === PHASE.recover ? recoverSeam(scenario.recoverFault, fired) : cutAt('admitting')
    ? { ledgerWrite: async (write) => { if (admitsRecord(write)) await dieInAdmissionWindow(world, event) } }
    : undefined
  const fishballSession = phase === PHASE.cut ? FIXTURE.fishballSession : scenario.restartIn ?? FIXTURE.fishballSession
  const recovering = phase === PHASE.recover
  // Row 11e harness facts: the stale copy was pending when the world reopened; the user's removal found it.
  const atOpen = {}
  world = await openWorld(sdk, root, {
    linkHooks, onRequest, plugins, seam, fishballSession,
    onOpen: (w) => {
      world = w
      if (cutAt('pending')) holdPending(w, event)
      if (!recovering || scenario.atRestart === undefined) return
      atOpen.pendingAtRestart = pendingIn(w.agent, event)
      atOpen.acted = AT_RESTART[scenario.atRestart](w, event)
    },
  })
  if (phase === PHASE.cut) {
    // The claiming step of the event dies before it is admitted (decision 2026-11-14 1, `interrupted`).
    world.ctx.on(DSH.preStep, async (input, next) => {
      if (cutAt('claim') && JSON.stringify(input.messages).includes(event.marker)) await die(world)
      return next()
    })
    if (cutAt('queued')) await startBusy(world, gate)
    world.link.publish(event)
    if (cutAt('queued')) {
      await until(() => world.link.acked(event.eventId), WAIT.settleMs, WAIT.pollMs)
      if (world.link.acked(event.eventId)) await die(world)
    } else if (cutAt('pending')) {
      // Dies once the event is acked and its message waits, unclaimed, in the inbox (flushed: durable).
      const left = () => world.link.acked(event.eventId) && pendingIn(world.agent, event)
      await until(left, WAIT.settleMs, WAIT.pollMs)
      if (left()) await die(world)
    } else {
      await world.settle()
      // The "settled" cut needs the one admission first, or a later "no second wake" proves nothing.
      if (cutAt('settled') && (await world.admissions(event.marker)).length === 1) await die(world)
    }
    // Reaching here means the cut point never came: report it so the case fails with a reason.
    process.stdout.write(JSON.stringify({ error: 'cut point not reached: ' + scenario.cut }) + '\n')
    process.exit(0)
  }
  await world.settle()
  const later = recovering && (scenario.recoverFault !== undefined || scenario.later === true) ? makeEvent(EVENT_TYPE.message, LATER_EVENT_NUMBER) : undefined
  if (later !== undefined) {
    world.link.publish(later)
    await world.settle()
  }
  const log = await world.sessionLog()
  const report = {
    admissions: (await world.admissions(event.marker)).length,
    // Admissions in the cut phase's session, when this phase runs in another one (decision 4).
    admissionsInFirstSession: (await world.admissions(event.marker, FIXTURE.fishballSession).catch(() => [])).length,
    faultsFired: fired.count,
    laterAdmissions: later === undefined ? undefined : (await world.admissions(later.marker)).length,
    laterAcked: later === undefined ? undefined : world.link.acked(later.eventId),
    window: fs.existsSync(world.file('window')) ? JSON.parse(fs.readFileSync(world.file('window'), 'utf8')) : undefined,
    acked: world.link.acked(event.eventId),
    interceptorEffects: readLines(world.file('interceptor')).filter((w) => w.eventId === event.eventId).length,
    offeredAgain: world.loaded[0]?.seen.filter((s) => s.event.eventId === event.eventId).length ?? 0,
    modelRequestsAfterRestart: world.modelRequestsWith(event.marker).length,
    // Any turn after the restart (a re-wake or a notice turn) would reach the model.
    requestsAfterRestart: world.requests.length,
    modelRequestsTotal: readLines(world.file('model')).filter((r) => r.texts.includes(event.marker)).length,
    interruptedTurns: log.filter((e) => e.type === 'turn/end' && e.data?.reason?.kind === 'interrupted').length,
    // Row 11e: harness facts of the restart's first act, and core's ledger record of the event.
    ...atOpen,
    ledgerStates: ledgerStates(world, event),
    // Every time core's message for the event was queued in this session's inbox (both processes).
    handOvers: log.filter((e) => e.type === DSH.inboxSpliced && (e.data?.inserted ?? []).some((m) => m.id === CORE.messageId(event.eventId))).length,
  }
  await world.close()
  process.stdout.write(JSON.stringify(report) + '\n')
  process.exit(0)
}

/**
 * Runs one scenario's phases; returns the recover phase's report, with the third start's report as
 * `restart` when the scenario has one.
 */
export function runCrash(sdk, root, name) {
  const scenario = SCENARIO[name]
  const run = (phase) => spawnSync(process.execPath, [import.meta.filename, sdk, root, name, phase], { encoding: 'utf8', timeout: WAIT.childMs })
  const lastLine = (r) => (r.stdout ?? '').trim().split('\n').filter(Boolean).at(-1)
  const cut = run(PHASE.cut)
  if (cut.signal !== 'SIGKILL') return { error: `cut phase did not crash (${cut.status ?? cut.signal}): ${lastLine(cut) ?? ''} ${cut.stderr ?? ''}`.trim() }
  if (scenario.between !== undefined) BETWEEN[scenario.between](root)
  const reportOf = (phase) => {
    const r = run(phase)
    if (r.status !== 0) return { error: `${phase} phase failed (${r.status ?? r.signal}): ${r.stderr ?? ''}`.trim() }
    return JSON.parse(lastLine(r))
  }
  const recover = reportOf(PHASE.recover)
  if (recover.error !== undefined || scenario.restart !== true) return recover
  return { ...recover, restart: reportOf(PHASE.restart) }
}

if (process.argv[1] === import.meta.filename) {
  const [sdk, root, name, phase] = process.argv.slice(2)
  await child(sdk, root, name, phase)
}
