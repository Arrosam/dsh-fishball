/**
 * fishball-heartbeat compaction on cooling: black-box cases written from the requirements alone
 * (the user's words of 2026-11-21 as the lead relayed them, the row's public schema in
 * src/config.js, its README and DESIGN §30); src/heartbeat.js, src/compactor.js and src/turns.js
 * were not read. src/constants.js was seen (with index.js), but no oracle uses its log wording: a
 * failure is asserted as "some warning or error line", never by its text.
 *
 * Requirement: when the heartbeat gives up warming the cache (maxConsecutive reached, or it otherwise
 * stops and lets the cache cool: a failed send, a late timer dropped, an overdue gap or the limit
 * found at restart), it measures Fishball's context (tokenMeter.measure(session).totalTokens) and,
 * if it is strictly longer than compactThresholdTokens (natural number, default 256000, row config
 * only), compacts it ONCE for that cooling through compactNow(agent, signal) of the engine read as
 * agentPresets.serviceFor(agent, 'compaction'), else the host-plane 'compaction' service. A real
 * turn starts a new cooling. No service: a warning, nothing else. A failure is logged, never retried,
 * and leaves the heartbeat working. Row disposal aborts the signal and logs no failure. The threshold's
 * default does not turn the heartbeat on.
 *
 * Techniques: HB-CMP-EP equivalence partitions, HB-CMP-BVA boundaries, HB-CMP-DT decision table
 * (cooling reason × size vs threshold × engine), HB-CMP-ST state transitions, HB-CMP-INT the whole
 * flow over a real Session. World and oracles as in cases.mjs; "a compaction" = one recorded
 * compactNow call (world.mjs compactionSeam).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { COMPACT, DSH, HEARTBEAT, TIME, TURN, WAIT } from './constants.mjs'
import { NOTIFY_MODE, labFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ ep: 'HB-CMP-EP', bva: 'HB-CMP-BVA', dt: 'HB-CMP-DT', st: 'HB-CMP-ST', int: 'HB-CMP-INT' })
const CFG = HEARTBEAT.config
const INTERVAL_MS = TIME.intervalSeconds * TIME.secondMs
const HALF_MS = INTERVAL_MS / 2
const SILENCE_MS = INTERVAL_MS * TIME.silenceIntervals
const EDGE_MS = 1
/** Test values: a configured threshold small enough to read, and a limit no case reaches. */
const THRESHOLD = 1000
const ROOMY = 1000
const OVER = THRESHOLD + EDGE_MS
const HUGE = COMPACT.defaultThreshold * 10
const ONE = 1
const show = (value) => JSON.stringify(value)
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)

/** A threshold the case leaves unset, so the schema's default applies (not undefined: that would select cfg's own default). */
const UNSET = null
/** Row config: both timer settings, and the threshold unless it is UNSET. */
const cfg = (max, threshold = THRESHOLD) => ({ [CFG.interval]: TIME.intervalSeconds, [CFG.max]: max, ...(threshold === UNSET ? {} : { [COMPACT.config]: threshold }) })
/** World options with the meter answering `tokens` and the given compaction composition. */
const seamOptions = (tokens, extra = {}) => ({ ...extra, meter: { tokens, ...extra.meter } })

/** Engines a composition offers (world.mjs compactionSeam's `compaction` option). */
const ENGINE = Object.freeze({
  preset: Object.freeze({ preset: true, host: false, registry: true }),
  hostOnly: Object.freeze({ preset: false, host: true, registry: true }),
  hostNoRegistry: Object.freeze({ preset: false, host: true, registry: false }),
  both: Object.freeze({ preset: true, host: true, registry: true }),
  none: Object.freeze({ preset: false, host: false, registry: true }),
  noneNoRegistry: Object.freeze({ preset: false, host: false, registry: false }),
})

// ------------------------------------------------------------------------------------------------
// Coolings: each brings a world to the point where the heartbeat lets the cache cool, measuring
// `tokens`, then lets one more interval pass so a compaction tied to that cooling has happened.

async function loaded(t, config, options) {
  const lab = await labFor(t)
  const w = await lab.open(options)
  await w.load(config)
  return { lab, w }
}

/** A restart over the same home: `earlier`'s log resumed after `elapsedMs`, the new world measuring `tokens`. */
async function restarted(lab, earlier, elapsedMs, config, options) {
  const seed = earlier.snapshot()
  await earlier.close()
  lab.setTime(lab.now() + elapsedMs)
  const later = await lab.open({ ...options, seedFrom: seed })
  await later.load(config)
  return later
}

/** An earlier process that wrote `turns` with a context too small to compact (it does nothing itself). */
async function earlierWith(lab, config, turns) {
  const earlier = await lab.open(seamOptions(0))
  await earlier.load(config)
  for (const sources of turns) await earlier.turn(sources)
  return earlier
}

const COOLING = Object.freeze({
  /** maxConsecutive 1: a real turn, its heartbeat, the heartbeat turn ends at the limit. */
  async limit(t, options, config = cfg(ONE)) {
    const { lab, w } = await loaded(t, config, { ...options, autoTurn: true })
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, ONE, 'the one heartbeat was sent')
    return { lab, w }
  },
  /** The heartbeat's send is refused: no retry, the cache cools. */
  async notifyFailed(t, options, config = cfg(ROOMY)) {
    const { lab, w } = await loaded(t, config, { ...options, notify: NOTIFY_MODE.reject })
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, ONE, 'the send was attempted')
    return { lab, w }
  },
  /** The timer fires past the late tolerance: the heartbeat is dropped. */
  async lateDropped(t, options, config = cfg(ROOMY)) {
    const { lab, w } = await loaded(t, config, options)
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS - EDGE_MS)
    await lab.jump(HEARTBEAT.lateToleranceMs + 2 * EDGE_MS)
    assert.deepEqual(w.notices, [], 'the late heartbeat was dropped')
    return { lab, w }
  },
  /** A restart after the gap's heartbeat came due: nothing is sent. */
  async restartOverdue(t, options, config = cfg(ROOMY)) {
    const lab = await labFor(t)
    const earlier = await earlierWith(lab, config, [TURN.real])
    const w = await restarted(lab, earlier, INTERVAL_MS + EDGE_MS, config, options)
    return { lab, w }
  },
  /** A restart inside the interval onto a log already at the limit (real, heartbeat; max 1). */
  async restartAtLimit(t, options, config = cfg(ONE)) {
    const lab = await labFor(t)
    const earlier = await earlierWith(lab, config, [TURN.real, TURN.heartbeat])
    const w = await restarted(lab, earlier, HALF_MS, config, options)
    return { lab, w }
  },
})

/** Runs a cooling, then one more interval. */
async function cooled(t, reason, options, config) {
  const world = await COOLING[reason](t, options, config)
  await world.lab.tick(INTERVAL_MS)
  return world
}

/** Asserts exactly `n` compactNow calls (waiting a little real time for a pending one). */
async function assertCompactions(lab, w, n, label) {
  if (n > 0) await lab.until(() => w.compactions.length >= n)
  else await lab.settle()
  assert.equal(w.compactions.length, n, `${label}: ${n} compaction(s), got ${w.compactions.length}`)
}

/** Asserts one well-formed compactNow call: the manager's live agent and a live AbortSignal, from `provider`. */
function assertCall(w, call, provider = COMPACT.provider.preset) {
  assert.equal(call.provider, provider, 'the engine reached: ' + call.provider)
  assert.equal(call.agent, w.live, 'compactNow got the manager agent')
  assert.ok(call.signal instanceof AbortSignal, 'compactNow got an AbortSignal')
  assert.equal(call.abortedAtCall, false, 'the signal was not aborted at the call')
  assert.ok(w.measures.some((m) => m.session === w.session), 'the manager session was measured')
}

/** Asserts the row still warms: a real turn arms a heartbeat one interval later. */
async function assertStillBeats(lab, w, label) {
  assert.ok(w.active(), label + ': the row stays up')
  await w.turn(TURN.real)
  const before = w.notices.length
  await lab.tick(INTERVAL_MS - EDGE_MS)
  assert.equal(w.notices.length, before, label + ': no heartbeat before the interval')
  await lab.tick(EDGE_MS)
  assert.equal(w.notices.length, before + ONE, label + ': the next real turn arms a heartbeat')
}

export function registerHeartbeatCompactCases() {
  // ============================================================================================
  // HB-CMP-EP: equivalence partitions.

  row(ID.ep, 1, 'only compactThresholdTokens set: the row stays off (no tool, no heartbeat, no compaction) however long the context', async (t) => {
    const { lab, w } = await loaded(t, { [COMPACT.config]: THRESHOLD }, seamOptions(HUGE))
    assert.equal(w.tool(), undefined, 'no tool')
    await w.turn(TURN.real)
    await lab.tick(SILENCE_MS)
    assert.deepEqual(w.notices, [], 'no heartbeat')
    await assertCompactions(lab, w, 0, 'off')
  })
  for (const p of [
    { part: 2, label: 'neither timer setting', config: {} },
    { part: 3, label: 'only intervalSeconds (and the threshold)', config: { [CFG.interval]: TIME.intervalSeconds, [COMPACT.config]: THRESHOLD } },
    { part: 4, label: 'only maxConsecutive (and the threshold)', config: { [CFG.max]: ONE, [COMPACT.config]: THRESHOLD } },
  ]) {
    row(ID.ep, p.part, `${p.label}: off, nothing is compacted`, async (t) => {
      const { lab, w } = await loaded(t, p.config, seamOptions(HUGE, { autoTurn: true }))
      assert.equal(w.tool(), undefined, 'no tool')
      await w.turn(TURN.real)
      await lab.tick(SILENCE_MS)
      assert.deepEqual(w.notices, [], 'no heartbeat')
      await assertCompactions(lab, w, 0, 'off')
    })
  }
  row(ID.ep, 5, 'over the threshold at the limit: one compactNow on the preset engine with the manager agent and an unaborted signal', async (t) => {
    const { lab, w } = await cooled(t, 'limit', seamOptions(OVER))
    await assertCompactions(lab, w, ONE, 'cooling')
    assertCall(w, w.compactions[0])
  })
  row(ID.ep, 6, 'while heartbeats keep the cache warm (limit not reached) nothing is compacted, however long the context', async (t) => {
    const { lab, w } = await loaded(t, cfg(ROOMY), seamOptions(HUGE, { autoTurn: true }))
    await w.turn(TURN.real)
    for (let n = 1; n <= TIME.silenceIntervals; n++) await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, TIME.silenceIntervals, 'one heartbeat per interval')
    await assertCompactions(lab, w, 0, 'warming')
  })
  row(ID.ep, 7, 'a restart inside the interval below the limit is no cooling: nothing is compacted at setup', async (t) => {
    const lab = await labFor(t)
    const earlier = await earlierWith(lab, cfg(ROOMY), [TURN.real])
    const w = await restarted(lab, earlier, HALF_MS, cfg(ROOMY), seamOptions(HUGE))
    await assertCompactions(lab, w, 0, 'no cooling')
    await lab.tick(HALF_MS)
    assert.equal(w.notices.length, ONE, 'the gap\'s heartbeat is still sent')
    await assertCompactions(lab, w, 0, 'still warming')
  })
  row(ID.ep, 8, 'Fishball cannot set the threshold: heartbeat_focus has no such parameter and refuses it as invalid-input', async (t) => {
    const { lab, w } = await loaded(t, cfg(ONE), seamOptions(OVER, { autoTurn: true }))
    const parameters = w.tool().parameters
    assert.ok(!show(parameters).includes(COMPACT.config), 'no threshold parameter: ' + show(parameters))
    const result = await w.call({ [HEARTBEAT.argument]: 'x', [COMPACT.config]: HUGE })
    assert.deepEqual(result, { ok: false, code: HEARTBEAT.code.invalidInput }, show(result))
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    await lab.tick(INTERVAL_MS)
    await assertCompactions(lab, w, ONE, 'the user\'s threshold still applies')
    assert.deepEqual([...w.global.tools.keys()], [], 'no global tool')
  })
  row(ID.ep, 9, 'the user changes the threshold: a reload with a higher one stops a compaction the old one would have run', async (t) => {
    const lab = await labFor(t)
    const w = await lab.open(seamOptions(OVER, { autoTurn: true }))
    await w.load(cfg(ONE))
    await w.configure(cfg(ONE, OVER))
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, ONE, 'the heartbeat ran')
    await assertCompactions(lab, w, 0, 'at the new threshold')
  })

  // ============================================================================================
  // HB-CMP-BVA: the threshold's edges (strictly greater compacts), its default and invalid values.

  for (const p of [
    { part: 1, label: 'threshold - 1', tokens: THRESHOLD - EDGE_MS, n: 0 },
    { part: 2, label: 'exactly the threshold', tokens: THRESHOLD, n: 0 },
    { part: 3, label: 'threshold + 1', tokens: THRESHOLD + EDGE_MS, n: ONE },
    { part: 4, label: 'default 256000 - 1 (unset)', tokens: COMPACT.defaultThreshold - EDGE_MS, n: 0, threshold: UNSET },
    { part: 5, label: 'exactly the default 256000 (unset)', tokens: COMPACT.defaultThreshold, n: 0, threshold: UNSET },
    { part: 6, label: 'default 256000 + 1 (unset)', tokens: COMPACT.defaultThreshold + EDGE_MS, n: ONE, threshold: UNSET },
    { part: 7, label: 'an empty context (0 tokens)', tokens: 0, n: 0 },
  ]) {
    row(ID.bva, p.part, `context of ${p.label} at cooling: ${p.n ? 'compacted once' : 'not compacted'}`, async (t) => {
      const config = 'threshold' in p ? cfg(ONE, p.threshold) : cfg(ONE)
      const { lab, w } = await cooled(t, 'limit', seamOptions(p.tokens), config)
      await assertCompactions(lab, w, p.n, p.label)
      assert.ok(w.measures.some((m) => m.session === w.session), 'the context was measured at cooling')
      if (p.n) assertCall(w, w.compactions[0])
    })
  }
  for (const p of [
    { part: 8, label: 'compactThresholdTokens -1', value: -1 },
    { part: 9, label: 'compactThresholdTokens 1.5', value: 1.5 },
  ]) {
    row(ID.bva, p.part, `${p.label} is refused by the schema: the row is inert (no tool, no heartbeat, no compaction)`, async (t) => {
      const { lab, w } = await loaded(t, cfg(ONE, p.value), seamOptions(HUGE, { autoTurn: true }))
      assert.equal(w.tool(), undefined, 'no tool')
      await w.turn(TURN.real)
      await lab.tick(SILENCE_MS)
      assert.deepEqual(w.notices, [], 'no heartbeat')
      await assertCompactions(lab, w, 0, p.label)
    })
  }

  // ============================================================================================
  // HB-CMP-DT: cooling reason × size vs threshold (preset engine).

  for (const [index, reason] of Object.keys(COOLING).entries()) {
    for (const [offset, size] of [{ label: 'over', tokens: OVER, n: ONE }, { label: 'at', tokens: THRESHOLD, n: 0 }].entries()) {
      row(ID.dt, 1 + 2 * index + offset, `cooling by ${reason}, context ${size.label} the threshold → ${size.n ? 'one compaction' : 'none'}`, async (t) => {
        const { lab, w } = await cooled(t, reason, seamOptions(size.tokens))
        await assertCompactions(lab, w, size.n, reason)
        if (size.n) assertCall(w, w.compactions[0])
        await lab.tick(SILENCE_MS)
        await assertCompactions(lab, w, size.n, reason + ', no more later')
      })
    }
  }
  const DT_ENGINE_FROM = 1 + 2 * Object.keys(COOLING).length
  // Engines (cooling by the limit, context over the threshold).
  for (const [index, p] of [
    { label: 'preset engine only', compaction: ENGINE.preset, provider: COMPACT.provider.preset },
    { label: 'host-plane engine only (the preset has none)', compaction: ENGINE.hostOnly, provider: COMPACT.provider.host },
    { label: 'host-plane engine only, no preset registry', compaction: ENGINE.hostNoRegistry, provider: COMPACT.provider.host },
    { label: 'both: the preset engine is the one used', compaction: ENGINE.both, provider: COMPACT.provider.preset },
  ].entries()) {
    row(ID.dt, DT_ENGINE_FROM + index, `${p.label} → compactNow on the ${p.provider} engine, once`, async (t) => {
      const { lab, w } = await cooled(t, 'limit', seamOptions(OVER, { compaction: p.compaction }))
      await assertCompactions(lab, w, ONE, p.label)
      assertCall(w, w.compactions[0], p.provider)
    })
  }
  const DT_ABSENT_FROM = DT_ENGINE_FROM + 4
  for (const [index, p] of [
    { label: 'no compaction service (registry answers none, no host engine)', options: { compaction: ENGINE.none } },
    { label: 'no compaction service and no preset registry', options: { compaction: ENGINE.noneNoRegistry } },
    { label: 'no token meter', options: { meter: { mode: COMPACT.meter.absent } } },
    { label: 'a token meter that throws', options: { meter: { mode: COMPACT.meter.throws } } },
  ].entries()) {
    row(ID.dt, DT_ABSENT_FROM + index, `${p.label}, context over the threshold → a warning, no compaction, heartbeats unaffected`, async (t) => {
      const { lab, w } = await cooled(t, 'limit', seamOptions(OVER, p.options))
      await assertCompactions(lab, w, 0, p.label)
      assert.ok(w.warnings().length > 0, 'a warning was logged: ' + show(w.logs.slice(-5)))
      assert.deepEqual(w.linesWith(HEARTBEAT.coreMissing), [], 'not the core-missing line')
      const warnings = w.warnings().length
      await assertStillBeats(lab, w, p.label)
      // A second cooling (the heartbeat turn at the limit) logs nothing new: the absence is reported once.
      await lab.tick(INTERVAL_MS)
      await assertCompactions(lab, w, 0, p.label + ', second cooling')
      if (p.options.compaction) assert.equal(w.warnings().length, warnings, 'the missing service is not re-logged at every cooling: ' + show(w.warnings()))
    })
  }
  const DT_FAIL_FROM = DT_ABSENT_FROM + 4
  for (const [index, p] of [
    { label: 'compactNow rejects', result: COMPACT.result.reject, failed: true },
    { label: 'compactNow throws synchronously', result: COMPACT.result.throws, failed: true },
    { label: 'compactNow finds nothing to compact (null)', result: COMPACT.result.nothing, failed: false },
  ].entries()) {
    row(ID.dt, DT_FAIL_FROM + index, `${p.label} → ${p.failed ? 'logged as a failure, ' : ''}not retried, the row stays up and keeps beating`, async (t) => {
      const { lab, w } = await cooled(t, 'limit', seamOptions(OVER, { compaction: { ...ENGINE.preset, result: p.result } }))
      await assertCompactions(lab, w, ONE, p.label)
      if (p.failed) assert.ok(w.problems().length > 0, 'the failure was logged: ' + show(w.logs.slice(-5)))
      await lab.tick(SILENCE_MS)
      await assertCompactions(lab, w, ONE, p.label + ', no retry loop')
      await assertStillBeats(lab, w, p.label)
    })
  }
  row(ID.dt, DT_FAIL_FROM + 3, 'no compaction service and a context at or below the threshold → nothing is compacted', async (t) => {
    const { lab, w } = await cooled(t, 'limit', seamOptions(THRESHOLD, { compaction: ENGINE.none }))
    await assertCompactions(lab, w, 0, 'under')
    assert.ok(w.active(), 'the row stays up')
  })

  // ============================================================================================
  // HB-CMP-ST: once per cooling; a real turn starts a new cooling; idle wait; disposal.

  row(ID.st, 1, 'once per cooling: neither time, a later heartbeat turn nor an empty turn compacts again while the context stays long', async (t) => {
    const { lab, w } = await cooled(t, 'limit', seamOptions(OVER))
    await assertCompactions(lab, w, ONE, 'first')
    await lab.tick(SILENCE_MS)
    await w.turn(TURN.heartbeat)
    await lab.tick(INTERVAL_MS)
    await w.turn(TURN.empty)
    await lab.tick(SILENCE_MS)
    await assertCompactions(lab, w, ONE, 'still the same cooling')
  })
  row(ID.st, 2, 'a real turn starts a new cooling: its limit compacts again (two coolings, two compactions)', async (t) => {
    const { lab, w } = await cooled(t, 'limit', seamOptions(OVER))
    await assertCompactions(lab, w, ONE, 'first cooling')
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, 2, 'the real turn re-armed the heartbeat')
    await lab.tick(INTERVAL_MS)
    await assertCompactions(lab, w, 2, 'second cooling')
    assertCall(w, w.compactions[1])
  })
  row(ID.st, 3, 'a failed compaction is not retried in its cooling, and the next cooling (after a real turn) tries again', async (t) => {
    const { lab, w } = await cooled(t, 'limit', seamOptions(OVER, { compaction: { ...ENGINE.preset, result: COMPACT.result.reject } }))
    await assertCompactions(lab, w, ONE, 'failed')
    w.setCompactionResult(COMPACT.result.compacted)
    await w.turn(TURN.heartbeat)
    await lab.tick(SILENCE_MS)
    await assertCompactions(lab, w, ONE, 'no retry within the cooling')
    await w.turn(TURN.real)
    await lab.tick(2 * INTERVAL_MS)
    await assertCompactions(lab, w, 2, 'the next cooling')
  })
  row(ID.st, 4, 'a restart after a compaction does not compact again for the same cooling', async (t) => {
    const lab = await labFor(t)
    const earlier = await lab.open(seamOptions(OVER, { autoTurn: true }))
    await earlier.load(cfg(ONE))
    await earlier.turn(TURN.real)
    await lab.tick(2 * INTERVAL_MS)
    await assertCompactions(lab, earlier, ONE, 'the earlier process compacted')
    const w = await restarted(lab, earlier, HALF_MS, cfg(ONE), seamOptions(OVER, { autoTurn: true }))
    await lab.tick(SILENCE_MS)
    await assertCompactions(lab, w, 0, 'the restarted process, same cooling')
    await assertStillBeats(lab, w, 'after the restart')
    await lab.tick(INTERVAL_MS)
    await assertCompactions(lab, w, ONE, 'a real turn after the restart starts a new cooling')
  })
  row(ID.st, 5, 'the compaction waits for the agent to be idle (whenIdle), then runs once', async (t) => {
    const { lab, w } = await loaded(t, cfg(ONE), seamOptions(OVER, { autoTurn: true }))
    w.holdIdle()
    await w.turn(TURN.real)
    await lab.tick(2 * INTERVAL_MS)
    await assertCompactions(lab, w, 0, 'not idle yet')
    await w.releaseIdle()
    await assertCompactions(lab, w, ONE, 'idle')
    assertCall(w, w.compactions[0])
  })
  row(ID.st, 6, 'a real turn while waiting for idle supersedes that cooling (DESIGN §30); the next cooling compacts', async (t) => {
    const { lab, w } = await loaded(t, cfg(ONE), seamOptions(OVER, { autoTurn: true }))
    w.holdIdle()
    await w.turn(TURN.real)
    await lab.tick(2 * INTERVAL_MS)
    await w.turn(TURN.real)
    await w.releaseIdle()
    await assertCompactions(lab, w, 0, 'superseded by the real turn')
    await lab.tick(2 * INTERVAL_MS)
    await assertCompactions(lab, w, ONE, 'the real turn\'s own cooling')
  })
  for (const p of [
    { part: 7, label: 'disabling the row', dispose: (w) => w.disable() },
    { part: 8, label: 'disposing the X2 setup', dispose: (w) => w.disposeSetups() },
  ]) {
    row(ID.st, p.part, `${p.label} mid-compaction aborts the signal given to compactNow and logs no failure`, async (t) => {
      const { lab, w } = await cooled(t, 'limit', seamOptions(OVER, { compaction: { ...ENGINE.preset, result: COMPACT.result.hang } }))
      await assertCompactions(lab, w, ONE, 'running')
      const call = w.compactions[0]
      assert.equal(call.signal.aborted, false, 'still running')
      const problems = w.problems().length
      await p.dispose(w)
      await lab.settle()
      assert.equal(call.signal.aborted, true, 'the signal was aborted by the disposal')
      assert.deepEqual(w.problems().slice(problems), [], 'no failure logged for the abort')
      await lab.tick(SILENCE_MS)
      await assertCompactions(lab, w, ONE, 'not restarted')
    })
  }

  // ============================================================================================
  // HB-CMP-INT: the whole flow over a real Session with the fake core running heartbeat turns.

  row(ID.int, 1, 'real → hb → hb (max 2) → one compaction after the last heartbeat turn ended → real turn → heartbeats resume → compaction again', async (t) => {
    const max = 2
    const { lab, w } = await loaded(t, cfg(max), seamOptions(OVER, { autoTurn: true }))
    await w.turn(TURN.real)
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, ONE, 'heartbeat 1')
    await assertCompactions(lab, w, 0, 'still warming after heartbeat 1')
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, max, 'heartbeat 2')
    await lab.tick(INTERVAL_MS)
    await assertCompactions(lab, w, ONE, 'cooling')
    assertCall(w, w.compactions[0])
    const events = w.session.snapshotEvents()
    const lastEnd = events.findLastIndex((e) => e.type === DSH.event.turnEnd)
    const start = events.findIndex((e) => e.type === COMPACT.event.start)
    assert.ok(start > lastEnd, 'the compaction began after the last heartbeat turn ended: ' + show(events.map((e) => e.type)))
    // The compaction's own log records are no turn: a real turn still re-arms one interval later.
    await assertStillBeats(lab, w, 'after the compaction')
    await lab.tick(INTERVAL_MS)
    assert.equal(w.notices.length, max + max, 'two heartbeats after the real turn')
    await lab.tick(INTERVAL_MS)
    await assertCompactions(lab, w, 2, 'the second cooling')
    await lab.tick(SILENCE_MS)
    assert.equal(w.notices.length, max + max, 'cool until the next real turn')
  })
}
