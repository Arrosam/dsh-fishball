/**
 * fishball-heartbeat: what the heartbeat's own compaction causes is no activity. Black-box cases
 * written from the user's requirements of 2026-11-22 as the lead relayed them (and the lead's answer
 * of the same day), DESIGN §30 and the installed SDK's log shapes (dsh-compaction-basic,
 * dsh-agent-loop's inbox); nothing under packages/ was read.
 *
 * Requirements: R1 a compaction the heartbeat starts is no user or agent activity; R2 it does not
 * reset the idle timer (the anchor stays the last real or heartbeat turn end); R3 it neither resets
 * nor extends the consecutive count; R4 a real user message or event wake still resets everything.
 * Scope "compaction only": a message is CAUSED when it is in the FIRST agent/inbox/spliced (target
 * next-step) that directly follows the compaction/end of an idle compaction (turn null) with no
 * sourceCommandId, that end carrying the same compactionId as the start (every message of that one
 * splice is caused; a second splice is not). Caused ids are forgotten at the end of the next turn
 * that entered a step (the lead's refinement after code review, 2026-11-22). The turn that admits a
 * caused message is judged as if it were absent, and DESIGN §30's rules decide the rest: a stepped
 * turn with no heartbeat notice is real (HB-DT-01 parts 4/6), heartbeat notice and no work message
 * is a heartbeat turn. Never caused: a
 * user-sourced message, a next-turn splice, a second splice, a splice after any other event, an end
 * whose compactionId matches no idle start, a compaction with a sourceCommandId (/compact) or
 * inside a turn. The caused status survives a restart.
 *
 * Techniques: HB-CAU-DT decision table (how the message became pending × what else the turn
 * admits), HB-CAU-BVA the "directly after" edge (zero / one intervening event; the first splice /
 * the second; one / two messages in the first splice; the end's compactionId), HB-CAU-ST state
 * transitions (mid-gap compaction, restart before / after the admitting turn, a compaction inside
 * a turn, forgetting after a stepped turn), HB-CAU-INT the incident flows with the heartbeat's own compactNow.
 * Equivalence partitions are the DT's condition values (caused vs each not-caused class; work,
 * heartbeat, context-only and no-work-kind sources).
 *
 * Observation (as HB-DT-01): maxConsecutive 1, a real turn ends at T, the turn under test X ends at
 * T + interval/2. Real X → the next heartbeat comes one interval after X; heartbeat X → count 1 =
 * max, nothing. Only a turn with the heartbeat notice tells "caused" from "not caused": without it
 * the turn is real either way.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { assertFiresAfter, loaded, restarted } from './cases.mjs'
import { COMPACT, DSH, FIXTURE, HEARTBEAT, SOURCE, TIME, TURN, WAIT } from './constants.mjs'
import { labFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ dt: 'HB-CAU-DT', bva: 'HB-CAU-BVA', st: 'HB-CAU-ST', int: 'HB-CAU-INT' })
const CFG = HEARTBEAT.config
const INTERVAL_MS = TIME.intervalSeconds * TIME.secondMs
const HALF_MS = INTERVAL_MS / 2
/**
 * Silence is watched in steps no longer than the late tolerance: one long tick would fire a due
 * timer with Date already past (due + tolerance), and the row would drop that heartbeat as late,
 * so a heartbeat the oracle must see could vanish (seen on the pre-fix row, 2026-11-22).
 */
const QUIET_STEP_MS = HEARTBEAT.lateToleranceMs
const QUIET_MS = INTERVAL_MS * 3
const EDGE_MS = 1
const ONE = 1
/** The incident's maxConsecutive (3 heartbeats, then cooling). */
const INCIDENT_MAX = 3
/** Test values: a threshold the incident's context is over. */
const THRESHOLD = 1000
const OVER = THRESHOLD + EDGE_MS
const show = (value) => JSON.stringify(value)
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)
const config = (max, threshold) => ({ [CFG.interval]: TIME.intervalSeconds, [CFG.max]: max, ...(threshold === undefined ? {} : { [COMPACT.config]: threshold }) })

/** What the turn under test admits besides the pending message(s) it claims. */
const ADMITS = Object.freeze({
  heartbeat: TURN.heartbeat,
  heartbeatAndContexts: TURN.heartbeatAndContexts,
  heartbeatAndUser: TURN.mixed,
  heartbeatAndEvent: TURN.heartbeatAndEvent,
  nothingElse: TURN.stepOnly,
  contextsOnly: Object.freeze([SOURCE.runtimeContext, SOURCE.timeContext]),
  meowDream: Object.freeze([SOURCE.meowDream]),
})

/** How the message became pending: each writes to the manager log of world `w`. */
const PENDING = Object.freeze({
  /** Caused: an idle compaction with no command, then the taskboard's next-step splice. */
  caused: async (w) => { await w.compactionRecord(); await w.inject([SOURCE.taskboard]) },
  /** Caused: two messages in the one splice directly after the compaction/end. */
  causedPair: async (w) => { await w.compactionRecord(); await w.inject([SOURCE.taskboard, SOURCE.otherPlugin]) },
  /** The first splice caused, a second consecutive splice not. */
  secondSplice: async (w) => { await w.compactionRecord(); await w.inject([SOURCE.taskboard]); await w.inject([SOURCE.otherPlugin]) },
  /** Not caused: the compaction/end carries another compactionId than the idle start. */
  endMismatch: async (w) => { await w.compactionRecord({ endCompactionId: COMPACT.idPrefix + FIXTURE.otherCompactionId }); await w.inject([SOURCE.taskboard]) },
  /** Not caused: the user's message, injected right after the compaction/end. */
  userSourced: async (w) => { await w.compactionRecord(); await w.inject([SOURCE.user]) },
  /** Not caused: another event (a plugin record) between the compaction/end and the splice. */
  afterEvent: async (w) => { await w.compactionRecord(); await w.pendingRecord(FIXTURE.pendingRecord); await w.inject([SOURCE.taskboard]) },
  /** Not caused: spliced into next-turn (a followup or wake), not next-step. */
  nextTurn: async (w) => { await w.compactionRecord(); await w.inject([SOURCE.taskboard], DSH.inbox.nextTurn) },
  /** Not caused: the user's /compact (its compaction carries a sourceCommandId). */
  command: async (w) => { await w.compactionRecord({ sourceCommandId: FIXTURE.commandId }); await w.inject([SOURCE.taskboard]) },
  /** Not caused: an injected notice with no compaction at all. */
  noCompaction: async (w) => { await w.inject([SOURCE.taskboard]) },
  /** No pending message: the control turn. */
  none: async () => {},
})

const OUTCOME = Object.freeze({ real: 'real', heartbeat: 'heartbeat' })

/** Asserts no heartbeat over `ms` of fake time, ticked in QUIET_STEP_MS steps. */
async function assertSilent(lab, w, label, ms = QUIET_MS) {
  const before = w.notices.length
  for (let passed = 0; passed < ms; passed += QUIET_STEP_MS) await lab.tick(QUIET_STEP_MS)
  assert.equal(w.notices.length, before, `${label}: no heartbeat: ${show(w.notices.slice(before))}`)
}

/**
 * Asserts silence at the limit, then that the row still works (a real turn arms one heartbeat an
 * interval later), so a row that stopped hearing the log cannot pass as "a heartbeat turn".
 */
async function assertCoolingAlive(lab, w, label) {
  await assertSilent(lab, w, label)
  await w.turn(TURN.real)
  await assertFiresAfter(lab, w, INTERVAL_MS, label + ': the row still works, a real turn re-arms')
}

/** Asserts X's outcome from X's end (maxConsecutive 1; X ended half an interval after the real turn). */
async function assertOutcome(lab, w, outcome, label) {
  if (outcome === OUTCOME.real) await assertFiresAfter(lab, w, INTERVAL_MS, label + ': a real turn resets count and anchor')
  else await assertCoolingAlive(lab, w, label + ': a heartbeat turn counts, limit 1 reached')
}

/** Asserts the turn just ended admitted every message in `messages` (same ids, same sources). */
function assertAdmitted(w, messages, label) {
  const events = w.session.snapshotEvents()
  const opened = events.findLastIndex((e) => e.type === DSH.event.turnStart)
  const admitted = events.slice(opened).filter((e) => e.type === DSH.event.userMessage).map((e) => e.data)
  for (const message of messages) {
    assert.ok(admitted.some((m) => m.id === message.id && show(m.source) === show(message.source)), `${label}: the turn admitted ${message.id}: ${show(admitted.map((m) => m.source))}`)
  }
}

/** The pending next-step messages whose source is `source`. */
const pendingFrom = (w, source) => w.pending()[DSH.inbox.nextStep].filter((m) => show(m.source) === show(source))

/** The incident's world: maxConsecutive 3, a context over the threshold, the taskboard reacting to every compaction/end. */
async function incidentWorld(t) {
  const lab = await labFor(t)
  const w = await lab.open(incidentOptions())
  await w.load(config(INCIDENT_MAX, THRESHOLD))
  w.afterCompaction([SOURCE.taskboard])
  return { lab, w }
}
const incidentOptions = () => ({ autoTurn: true, meter: { tokens: OVER } })

/** Waits until `n` compactNow calls were made, then asserts exactly n. */
async function assertCompactions(lab, w, n, label) {
  if (n > 0) await lab.until(() => w.compactions.length >= n)
  else await lab.settle()
  assert.equal(w.compactions.length, n, `${label}: ${n} compaction(s), got ${w.compactions.length}`)
}

/** Runs the incident up to the injected reminder: real turn, 3 heartbeats, cooling compaction, reminder pending. */
async function incidentUpToReminder(lab, w) {
  await w.turn(TURN.real)
  for (let n = 1; n <= INCIDENT_MAX; n++) await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat ' + n)
  await assertCompactions(lab, w, ONE, 'the cooling compaction')
  await lab.until(() => pendingFrom(w, SOURCE.taskboard).length === ONE)
  const events = w.session.snapshotEvents()
  const end = events.findLastIndex((e) => e.type === COMPACT.event.end)
  const next = events[end + 1]
  assert.equal(next?.type, DSH.event.inboxSpliced, 'the splice follows the compaction/end directly: ' + show(events.slice(end).map((e) => e.type)))
  assert.equal(next.data.target, DSH.inbox.nextStep, 'into next-step')
  assert.equal(events[end].data.turn, null, 'an idle compaction')
  assert.equal(events[end].data.sourceCommandId, undefined, 'with no command')
  return pendingFrom(w, SOURCE.taskboard)
}

/** After a real turn reset, with autoTurn: exactly `max` heartbeats one interval apart, then cooling. */
async function assertFullRun(lab, w, max, label) {
  for (let n = 1; n <= max; n++) await assertFiresAfter(lab, w, INTERVAL_MS, `${label}: heartbeat ${n} of ${max}`)
  await assertSilent(lab, w, label + ': the limit again')
}

export function registerHeartbeatCausedCases() {
  // ============================================================================================
  // HB-CAU-DT: how the message became pending × what else the admitting turn admits.

  const decisions = [
    { part: 1, label: 'caused reminder + the heartbeat notice', pending: 'caused', admits: 'heartbeat', outcome: OUTCOME.heartbeat },
    { part: 2, label: 'caused reminder + the heartbeat notice between runtime- and time-context', pending: 'caused', admits: 'heartbeatAndContexts', outcome: OUTCOME.heartbeat },
    { part: 3, label: 'caused reminder alone (a step with no other message)', pending: 'caused', admits: 'nothingElse', outcome: OUTCOME.real },
    { part: 4, label: 'caused reminder + runtime- and time-context only', pending: 'caused', admits: 'contextsOnly', outcome: OUTCOME.real },
    { part: 5, label: 'caused reminder + a meow-memory dream message (the incident turn)', pending: 'caused', admits: 'meowDream', outcome: OUTCOME.real },
    { part: 6, label: 'R4: caused reminder + the heartbeat notice + the user\'s message', pending: 'caused', admits: 'heartbeatAndUser', outcome: OUTCOME.real },
    { part: 7, label: 'R4: caused reminder + the heartbeat notice + a fishball-event batch', pending: 'caused', admits: 'heartbeatAndEvent', outcome: OUTCOME.real },
    { part: 8, label: 'a user-sourced message injected right after an idle compaction + the heartbeat notice', pending: 'userSourced', admits: 'heartbeat', outcome: OUTCOME.real },
    { part: 9, label: 'a reminder injected after an intervening event + the heartbeat notice', pending: 'afterEvent', admits: 'heartbeat', outcome: OUTCOME.real },
    { part: 10, label: 'a reminder spliced into next-turn after an idle compaction + the heartbeat notice', pending: 'nextTurn', admits: 'heartbeat', outcome: OUTCOME.real },
    { part: 11, label: 'a reminder injected after /compact (sourceCommandId) + the heartbeat notice', pending: 'command', admits: 'heartbeat', outcome: OUTCOME.real },
    { part: 12, label: 'a reminder injected with no compaction + the heartbeat notice', pending: 'noCompaction', admits: 'heartbeat', outcome: OUTCOME.real },
    { part: 13, label: 'control: a meow-memory dream message alone, nothing pending', pending: 'none', admits: 'meowDream', outcome: OUTCOME.real },
    { part: 14, label: 'control: the heartbeat notice alone after an idle compaction with nothing injected', pending: 'compactionOnly', admits: 'heartbeat', outcome: OUTCOME.heartbeat },
  ]
  for (const d of decisions) {
    row(ID.dt, d.part, `${d.label} → ${d.outcome} turn`, async (t) => {
      const { lab, w } = await loaded(t, config(ONE))
      await w.turn(TURN.real)
      await lab.tick(HALF_MS)
      if (d.pending === 'compactionOnly') await w.compactionRecord()
      else await PENDING[d.pending](w)
      const pending = [...w.pending()[DSH.inbox.nextStep], ...w.pending()[DSH.inbox.nextTurn]]
      await w.turn(ADMITS[d.admits])
      assertAdmitted(w, pending, d.label)
      await assertOutcome(lab, w, d.outcome, d.label)
    })
  }

  // ============================================================================================
  // HB-CAU-BVA: "directly after" the compaction/end, and consecutive splices.

  for (const p of [
    { part: 1, label: 'only the first splice is caused: a second consecutive next-step splice is work', pending: 'secondSplice', outcome: OUTCOME.real },
    { part: 4, label: 'every message of the first splice is caused (two messages in it)', pending: 'causedPair', outcome: OUTCOME.heartbeat },
    { part: 5, label: 'a compaction/end whose compactionId is not the idle start\'s causes nothing', pending: 'endMismatch', outcome: OUTCOME.real },
  ]) {
    row(ID.bva, p.part, `${p.label}: + the heartbeat notice → ${p.outcome} turn`, async (t) => {
      const { lab, w } = await loaded(t, config(ONE))
      await w.turn(TURN.real)
      await lab.tick(HALF_MS)
      await PENDING[p.pending](w)
      const pending = w.pending()[DSH.inbox.nextStep]
      await w.turn(TURN.heartbeat)
      assertAdmitted(w, pending, p.label)
      await assertOutcome(lab, w, p.outcome, p.label)
    })
  }
  row(ID.bva, 2, 'a caused splice, then an intervening event, then another splice: the second is work → real turn', async (t) => {
    const { lab, w } = await loaded(t, config(ONE))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(w)
    await w.pendingRecord(FIXTURE.pendingRecord)
    await w.inject([SOURCE.otherPlugin])
    await w.turn(TURN.heartbeat)
    await assertOutcome(lab, w, OUTCOME.real, 'the later splice is not caused')
  })
  row(ID.bva, 3, 'one intervening event (zero → one) is enough to make the splice not caused → real turn', async (t) => {
    const { lab, w } = await loaded(t, config(ONE))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.afterEvent(w)
    await w.turn(TURN.heartbeat)
    await assertOutcome(lab, w, OUTCOME.real, 'one intervening event')
  })

  // ============================================================================================
  // HB-CAU-ST: R2/R3 between compaction and turn, restarts, a compaction inside a turn.

  row(ID.st, 1, 'R2: an idle compaction and its caused reminder mid-gap do not move the anchor (fires at T + interval)', async (t) => {
    const { lab, w } = await loaded(t, config(ONE))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(w)
    await assertFiresAfter(lab, w, HALF_MS, 'anchor still the real turn')
  })
  row(ID.st, 2, 'R3: max 2, hb 1, a caused reminder, hb 2\'s own turn admits it → still a heartbeat turn: count 2 = max, then cool', async (t) => {
    const max = 2
    const { lab, w } = await loaded(t, config(max), { autoTurn: true })
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'hb 1')
    await lab.tick(HALF_MS)
    await PENDING.caused(w)
    const reminders = pendingFrom(w, SOURCE.taskboard)
    await assertFiresAfter(lab, w, HALF_MS, 'hb 2, anchored at hb 1\'s turn end')
    assertAdmitted(w, reminders, 'hb 2\'s turn')
    await assertCoolingAlive(lab, w, 'count 2 = max: cool')
  })
  row(ID.st, 3, 'restart between the caused splice and the admitting turn: still caused (+ heartbeat notice → heartbeat turn)', async (t) => {
    const lab = await labFor(t)
    const earlier = await lab.open()
    await earlier.load(config(ONE))
    await earlier.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(earlier)
    const w = await restarted(lab, earlier, 0, config(ONE))
    const reminders = pendingFrom(w, SOURCE.taskboard)
    assert.equal(reminders.length, ONE, 'the reminder is still pending after the restart')
    await w.turn(TURN.heartbeat)
    assertAdmitted(w, reminders, 'after the restart')
    await assertOutcome(lab, w, OUTCOME.heartbeat, 'rebuilt as caused')
  })
  row(ID.st, 4, 'restart after the admitting turn: the rebuilt count treats [caused + heartbeat notice] as a heartbeat turn (at the limit, nothing)', async (t) => {
    const lab = await labFor(t)
    const earlier = await lab.open()
    await earlier.load(config(ONE))
    await earlier.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(earlier)
    await earlier.turn(TURN.heartbeat)
    const w = await restarted(lab, earlier, HALF_MS, config(ONE))
    // Real would anchor at that turn's end: a heartbeat half an interval after the restart.
    await assertCoolingAlive(lab, w, 'rebuilt count 1 = max')
  })
  for (const p of [
    { part: 5, label: '/compact (sourceCommandId)', pending: 'command' },
    { part: 6, label: 'an intervening event', pending: 'afterEvent' },
  ]) {
    row(ID.st, p.part, `restart before the admitting turn, reminder after ${p.label}: still work → real turn`, async (t) => {
      const lab = await labFor(t)
      const earlier = await lab.open()
      await earlier.load(config(ONE))
      await earlier.turn(TURN.real)
      await lab.tick(HALF_MS)
      await PENDING[p.pending](earlier)
      const w = await restarted(lab, earlier, 0, config(ONE))
      await w.turn(TURN.heartbeat)
      await assertOutcome(lab, w, OUTCOME.real, p.label + ' after the restart')
    })
  }
  row(ID.st, 7, 'a compaction inside a turn (turn non-null) neutralises nothing: the reminder it is followed by is work in the next turn', async (t) => {
    const max = 2
    const { lab, w } = await loaded(t, config(max))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    const open = await w.beginTurn(TURN.heartbeat)
    await w.compactionRecord({ inTurn: true })
    await w.inject([SOURCE.taskboard])
    await open.end()
    // That turn was a heartbeat turn (count 1). A heartbeat turn now would reach the limit (2): silent.
    await w.turn(TURN.heartbeat)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'the reminder made it a real turn')
  })

  row(ID.st, 8, 'caused ids are forgotten after the stepped turn that admitted them: the same message spliced again later is work → real', async (t) => {
    const max = 2
    const { lab, w } = await loaded(t, config(max))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(w)
    const reminders = pendingFrom(w, SOURCE.taskboard)
    await w.turn(TURN.heartbeat)
    assertAdmitted(w, reminders, 'the first admission')
    // Count 1 of 2. The same id again in a later splice: forgotten, so work.
    await lab.tick(HALF_MS)
    await w.reinject(reminders)
    await w.turn(TURN.heartbeat)
    assertAdmitted(w, reminders, 'the second admission')
    await assertFiresAfter(lab, w, INTERVAL_MS, 'a real turn: count reset, anchored at its end')
  })
  row(ID.st, 9, 'a turn that entered no step forgets nothing: after an empty turn the caused reminder still makes [it + heartbeat notice] a heartbeat turn', async (t) => {
    const { lab, w } = await loaded(t, config(ONE))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await PENDING.caused(w)
    await w.turn(TURN.empty)
    assert.equal(pendingFrom(w, SOURCE.taskboard).length, ONE, 'the empty turn claimed nothing')
    await w.turn(TURN.heartbeat)
    await assertOutcome(lab, w, OUTCOME.heartbeat, 'still caused')
  })

  // ============================================================================================
  // HB-CAU-INT: the incident, with the heartbeat's own compactNow and the taskboard's reaction.

  row(ID.int, 1, 'incident: 3 heartbeats, cooling compaction, taskboard reminder injected; no activity until a meow-memory dream admits it → real turn, 3 more heartbeats', async (t) => {
    const { lab, w } = await incidentWorld(t)
    const reminders = await incidentUpToReminder(lab, w)
    await assertSilent(lab, w, 'R1-R3: the compaction and its reminder start nothing')
    await w.turn(ADMITS.meowDream)
    assertAdmitted(w, reminders, 'the dream turn')
    await assertFullRun(lab, w, INCIDENT_MAX, 'the dream turn is real')
  })
  row(ID.int, 2, 'incident with a restart before the dream turn: the rebuilt count is at the limit, the reminder pending; the dream turn is real → 3 more heartbeats', async (t) => {
    const { lab, w: earlier } = await incidentWorld(t)
    await incidentUpToReminder(lab, earlier)
    const w = await restarted(lab, earlier, HALF_MS, config(INCIDENT_MAX, THRESHOLD), incidentOptions())
    const reminders = pendingFrom(w, SOURCE.taskboard)
    assert.equal(reminders.length, ONE, 'the reminder is still pending')
    await assertSilent(lab, w, 'still cooling after the restart')
    await assertCompactions(lab, w, 0, 'no second compaction for the same cooling')
    await w.turn(ADMITS.meowDream)
    assertAdmitted(w, reminders, 'the dream turn')
    await assertFullRun(lab, w, INCIDENT_MAX, 'the dream turn is real')
  })
  for (const p of [
    { part: 3, label: 'the user\'s message', admits: ADMITS.heartbeatAndUser },
    { part: 4, label: 'a fishball-event batch', admits: ADMITS.heartbeatAndEvent },
  ]) {
    row(ID.int, p.part, `R4 incident: the reminder admitted with ${p.label} → full reset, 3 more heartbeats`, async (t) => {
      const { lab, w } = await incidentWorld(t)
      const reminders = await incidentUpToReminder(lab, w)
      await w.turn(p.admits)
      assertAdmitted(w, reminders, p.label)
      await assertFullRun(lab, w, INCIDENT_MAX, p.label)
    })
  }
  row(ID.int, 5, 'max 1: after the limit\'s compaction, [caused reminder + heartbeat notice] is a heartbeat turn: still cooling, no second compaction', async (t) => {
    const lab = await labFor(t)
    const w = await lab.open(incidentOptions())
    await w.load(config(ONE, THRESHOLD))
    w.afterCompaction([SOURCE.taskboard])
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat 1 of 1')
    await assertCompactions(lab, w, ONE, 'the cooling compaction')
    await lab.until(() => pendingFrom(w, SOURCE.taskboard).length === ONE)
    await w.turn(TURN.heartbeat)
    await assertSilent(lab, w, 'the caused reminder made nothing real')
    await assertCompactions(lab, w, ONE, 'the same cooling')
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'the row still works, a real turn re-arms')
  })
  row(ID.int, 6, 'max 1: a late timer dropped (count 0) cools and compacts; [caused reminder + heartbeat notice] then counts 1 = max → nothing', async (t) => {
    const lab = await labFor(t)
    const w = await lab.open(incidentOptions())
    await w.load(config(ONE, THRESHOLD))
    w.afterCompaction([SOURCE.taskboard])
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS - EDGE_MS)
    await lab.jump(HEARTBEAT.lateToleranceMs + 2 * EDGE_MS)
    assert.deepEqual(w.notices, [], 'the late heartbeat was dropped')
    await assertCompactions(lab, w, ONE, 'the cooling compaction')
    await lab.until(() => pendingFrom(w, SOURCE.taskboard).length === ONE)
    await w.turn(TURN.heartbeat)
    await assertCoolingAlive(lab, w, 'a heartbeat turn: limit 1 reached')
  })
  row(ID.int, 7, 'a reminder the taskboard splices into next-turn after the heartbeat\'s compaction is work: [it + heartbeat notice] is real', async (t) => {
    const lab = await labFor(t)
    const w = await lab.open(incidentOptions())
    await w.load(config(ONE, THRESHOLD))
    w.afterCompaction([SOURCE.taskboard], DSH.inbox.nextTurn)
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat 1 of 1')
    await assertCompactions(lab, w, ONE, 'the cooling compaction')
    await lab.until(() => w.pending()[DSH.inbox.nextTurn].length === ONE)
    await w.turn(TURN.heartbeat)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'a real turn re-arms')
  })
}
