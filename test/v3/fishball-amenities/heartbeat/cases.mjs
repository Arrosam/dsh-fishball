/**
 * fishball-heartbeat black-box cases, written from the requirements alone (the user's words, the
 * lead's derived row contract and the lead's refinement of 2026-11-21); no file under
 * packages/fishball-amenities/heartbeat/ was read.
 *
 * Techniques (ids are this suite's own):
 * - EP: HB-EP-01 config partitions (unset / one set / both set / invalid values), HB-EP-02 the core
 *   seam (absent, apiVersion 1, apiVersion 2, appReady, late, removed, re-provided), HB-EP-03 the
 *   tool's callers and argument shapes, HB-EP-04 which session's events count;
 * - BVA: HB-BVA-01 intervalSeconds 0/1/max/max+1 (+ non-integer), HB-BVA-02 maxConsecutive 0/1/2,
 *   HB-BVA-03 focus length 2000/2001 code points (ASCII and astral, trimmed first), HB-BVA-04 the
 *   restart edge (elapsed interval-1 ms / exactly interval / +1 ms; "remaining <= 0 is overdue:
 *   nothing sent", the lead's refinement 3), HB-BVA-05 the firing edge (interval-1 ms / interval);
 * - DT: HB-DT-01 turn classification (heartbeat notice × user message × step entered × other
 *   sources × end reason);
 * - ST: HB-ST-01 idle → armed → fired → heartbeat turn → … → limit → cool → real turn → armed, and
 *   HB-ST-02 the restart reconstruction of count and anchor;
 * - integration: HB-INT-* (focus persistence, notify rejection, disposal, dedupe keys, text).
 *
 * Level: integration, in-process (world.mjs): the real row on a real Loader of the SDK under test,
 * a fake fishballInstance (apiVersion 2) whose X2 setups run on a manager agent context, and turns
 * appended to a real dsh-session Session of the SDK's SessionStore, so the row hears the store's
 * real 'session/event' publications. HB-UC-01 is the system-level flow: the fake core answers each
 * notice by running the turn real core starts (the notice admitted as a user/message), through the
 * real session, and Fishball calls heartbeat_focus at the end of that turn.
 *
 * Oracles: "a heartbeat" = one recorded manager.notify call; "no timer" = no notify over
 * TIME.silenceIntervals intervals of fake time; "the tool" = heartbeat_focus in the manager scope
 * (never in DSH's global registry); "the focus" = what the next heartbeat text carries.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { DSH, FIXTURE, HEARTBEAT, TIME, TURN, WAIT } from './constants.mjs'
import { NOTIFY_MODE, labFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({
  ep01: 'HB-EP-01', ep02: 'HB-EP-02', ep03: 'HB-EP-03', ep04: 'HB-EP-04',
  bva01: 'HB-BVA-01', bva02: 'HB-BVA-02', bva03: 'HB-BVA-03', bva04: 'HB-BVA-04', bva05: 'HB-BVA-05',
  dt01: 'HB-DT-01', st01: 'HB-ST-01', st02: 'HB-ST-02', uc01: 'HB-UC-01', int: 'HB-INT',
})
const CFG = HEARTBEAT.config
const LIMIT = HEARTBEAT.limit
const CODE = HEARTBEAT.code
const INTERVAL_MS = TIME.intervalSeconds * TIME.secondMs
const HALF_MS = INTERVAL_MS / 2
const SILENCE_MS = INTERVAL_MS * TIME.silenceIntervals
/** The one fake-clock step that resolves "exactly at" from "just before". */
const EDGE_MS = 1

const row = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)
const config = (maxConsecutive, intervalSeconds = TIME.intervalSeconds) => ({ [CFG.interval]: intervalSeconds, [CFG.max]: maxConsecutive })
/** A max no case reaches, so only the timer is under test. */
const ROOMY = 1000
const show = (value) => JSON.stringify(value)

// ------------------------------------------------------------------------------------------------
// Helpers

/** A lab and one world with the row loaded under `cfg`; `options` are world options. */
async function loaded(t, sdk, cfg, options = {}) {
  const lab = await labFor(t, sdk)
  const w = await lab.open(options)
  await w.load(cfg)
  return { lab, w }
}

/** Asserts exactly one heartbeat arrives `ms` from now (none at ms - 1); returns it. */
async function assertFiresAfter(lab, w, ms, label) {
  const before = w.notices.length
  if (ms > EDGE_MS) await lab.tick(ms - EDGE_MS)
  assert.equal(w.notices.length, before, `${label}: no heartbeat before ${ms} ms: ${show(w.notices.slice(before))}`)
  await lab.tick(EDGE_MS)
  assert.equal(w.notices.length, before + 1, `${label}: one heartbeat at ${ms} ms: ${show(w.notices.slice(before))}`)
  return w.notices.at(-1)
}

/** Asserts no heartbeat over `ms` of fake time. */
async function assertSilent(lab, w, label, ms = SILENCE_MS) {
  const before = w.notices.length
  await lab.tick(ms)
  assert.equal(w.notices.length, before, `${label}: no heartbeat: ${show(w.notices.slice(before))}`)
}

/** Asserts the row is enabled: its tool is in the manager scope, and a real turn arms the timer. */
async function assertEnabled(lab, w, intervalMs, label) {
  assert.ok(w.tool(), `${label}: ${HEARTBEAT.tool} is registered`)
  await w.turn(TURN.real)
  return assertFiresAfter(lab, w, intervalMs, label)
}

/** Asserts the row does nothing: no tool anywhere, and no heartbeat after a real turn. */
async function assertInert(lab, w, label) {
  assert.equal(w.tool(), undefined, `${label}: no ${HEARTBEAT.tool} in the manager scope`)
  assert.deepEqual([...w.global.tools.keys()], [], `${label}: no global tool`)
  if (w.live) await w.turn(TURN.real)
  await assertSilent(lab, w, label)
}

/** The fields every heartbeat carries (contract: pluginId, wake true, a string dedupeKey and text). */
function assertNoticeShape(notice) {
  assert.equal(notice.pluginId, HEARTBEAT.notice.pluginId, 'pluginId')
  assert.equal(notice.wake, HEARTBEAT.notice.wake, 'wake: true')
  assert.equal(typeof notice.dedupeKey, 'string', 'dedupeKey is a string')
  assert.ok(notice.dedupeKey.length > 0, 'dedupeKey is not empty')
  assert.equal(typeof notice.text, 'string', 'text is a string')
  assert.ok(notice.text.includes(HEARTBEAT.tool), `the text names ${HEARTBEAT.tool}: ${show(notice.text)}`)
}

/** Sets the focus through the tool and asserts the success shape. */
async function setFocus(w, focus, expected = focus.trim()) {
  const result = await w.call({ [HEARTBEAT.argument]: focus })
  assert.deepEqual(result, { ok: true, focus: expected }, 'heartbeat_focus succeeded: ' + show(result))
}

/** The next heartbeat's text, from a real turn ending now. */
async function nextText(lab, w) {
  await w.turn(TURN.real)
  const notice = await assertFiresAfter(lab, w, INTERVAL_MS, 'next heartbeat')
  assertNoticeShape(notice)
  return notice.text
}

/** A world whose manager log was written by an earlier world over the same home (a restart). */
async function restarted(lab, earlier, elapsedMs, cfg, options = {}) {
  const seed = earlier.snapshot()
  await earlier.close()
  await lab.tick(elapsedMs)
  const later = await lab.open({ ...options, seedFrom: seed })
  await later.load(cfg)
  return later
}

/**
 * Checks a tool's declared parameters: one required string `focus` and nothing else. A definition
 * may carry DSH's compiled JSON Schema (`{type: 'object', properties, required}`, what defineTool
 * returns) or the per-property spec (`{focus: {type, required: true}}`); both are accepted.
 */
function assertFocusParameters(parameters) {
  const compiled = parameters?.type === 'object' && typeof parameters.properties === 'object'
  const props = compiled ? parameters.properties : parameters
  assert.deepEqual(Object.keys(props ?? {}), [HEARTBEAT.argument], 'the only parameter is focus: ' + show(parameters))
  assert.equal(props[HEARTBEAT.argument].type, 'string', 'focus is a string')
  const required = compiled ? parameters.required?.includes(HEARTBEAT.argument) : props[HEARTBEAT.argument].required === true
  assert.ok(required, 'focus is required: ' + show(parameters))
}

export function registerHeartbeatCases(sdk) {
  // ============================================================================================
  // HB-EP-01: config partitions. Enabled only when the user set both fields.

  const partitions = [
    { part: 1, label: 'neither set', cfg: {} },
    { part: 2, label: 'only intervalSeconds set', cfg: { [CFG.interval]: TIME.intervalSeconds } },
    { part: 3, label: 'only maxConsecutive set', cfg: { [CFG.max]: ROOMY } },
  ]
  for (const p of partitions) {
    row(sdk, ID.ep01, p.part, `${p.label}: the row is up but registers no tool, sets no timer and sends nothing`, async (t) => {
      const { lab, w } = await loaded(t, sdk, p.cfg)
      assert.ok(w.active(), 'the row is active')
      assert.deepEqual(w.linesWith(HEARTBEAT.coreMissing), [], 'core is present: no core-missing line')
      await assertInert(lab, w, p.label)
    })
  }
  row(sdk, ID.ep01, 4, 'both set: the tool is in the manager scope only, and a real turn arms one heartbeat', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    assert.ok(w.active(), 'the row is active')
    assert.ok(w.manager.setups.includes(HEARTBEAT.name), 'registered its X2 setup under fishball-heartbeat')
    assertNoticeShape(await assertEnabled(lab, w, INTERVAL_MS, 'both set'))
    assert.deepEqual([...w.global.tools.keys()], [], 'never registered globally')
  })
  row(sdk, ID.ep01, 5, 'config changes re-apply: unset → set enables, set → unset disables (tool removed, armed timer cleared)', async (t) => {
    const { lab, w } = await loaded(t, sdk, {})
    assert.equal(w.tool(), undefined, 'disabled at first')
    await w.configure(config(ROOMY))
    assert.ok(w.tool(), 'enabled by the user setting both')
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.configure({ [CFG.max]: ROOMY })
    assert.equal(w.tool(), undefined, 'the tool is removed when intervalSeconds is unset')
    await assertSilent(lab, w, 'the armed timer died with the old config')
  })
  row(sdk, ID.ep01, 6, 'a changed intervalSeconds applies from the last turn end (60 s → 120 s at +30 s fires at +120 s)', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.configure(config(ROOMY, TIME.intervalSeconds * 2))
    await assertFiresAfter(lab, w, 2 * INTERVAL_MS - HALF_MS, 'new interval, same anchor')
  })

  // ============================================================================================
  // HB-BVA-01: intervalSeconds 0 / 1 / max / max + 1 (and a non-integer).

  for (const p of [
    { part: 1, label: 'intervalSeconds 0 (below min)', value: LIMIT.intervalMin - 1 },
    { part: 4, label: 'intervalSeconds max + 1 (2147484)', value: LIMIT.intervalMax + 1 },
    { part: 5, label: 'intervalSeconds 1.5 (not an integer)', value: LIMIT.intervalMin + 0.5 },
  ]) {
    row(sdk, ID.bva01, p.part, `${p.label} is refused: no tool, no heartbeat`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(ROOMY, p.value))
      assert.equal(w.tool(), undefined, 'no tool')
      await w.turn(TURN.real)
      await assertSilent(lab, w, p.label, Math.ceil(p.value * TIME.secondMs) + SILENCE_MS)
    })
  }
  row(sdk, ID.bva01, 2, 'intervalSeconds 1 (min): fires 1000 ms after the turn end, not at 999 ms', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY, LIMIT.intervalMin))
    await assertEnabled(lab, w, LIMIT.intervalMin * TIME.secondMs, 'min interval')
  })
  row(sdk, ID.bva01, 3, 'intervalSeconds 2147483 (max): fires exactly 2147483000 ms after the turn end', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY, LIMIT.intervalMax))
    await assertEnabled(lab, w, LIMIT.intervalMax * TIME.secondMs, 'max interval')
  })

  // ============================================================================================
  // HB-BVA-02: maxConsecutive 0 / 1 / 2 (the system-level fake core runs each heartbeat turn).

  row(sdk, ID.bva02, 1, 'maxConsecutive 0 (below min) is refused: no tool, no heartbeat', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(LIMIT.maxMin - 1))
    await assertInert(lab, w, 'max 0')
  })
  for (const max of [LIMIT.maxMin, LIMIT.maxMin + 1]) {
    row(sdk, ID.bva02, max + 1, `maxConsecutive ${max}: exactly ${max} heartbeat(s) after a real turn, then none`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(max), { autoTurn: true })
      await w.turn(TURN.real)
      for (let n = 1; n <= max; n++) await assertFiresAfter(lab, w, INTERVAL_MS, `heartbeat ${n} of ${max}`)
      await assertSilent(lab, w, 'the limit is reached: the cache cools')
    })
  }

  // ============================================================================================
  // HB-BVA-05: the firing edge, and the timer's reset by every turn.

  row(sdk, ID.bva05, 1, 'the heartbeat fires at exactly interval after the turn end (none at interval - 1 ms), once per idle gap', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await assertEnabled(lab, w, INTERVAL_MS, 'edge')
    await assertSilent(lab, w, 'one notify per idle gap: no retry while no turn follows')
  })
  row(sdk, ID.bva05, 2, 'a turn ending inside the interval resets the timer to interval after that turn', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'reset by the second turn')
  })
  row(sdk, ID.bva05, 3, 'no heartbeat while a turn is open: the timer is cleared at turn/start and re-armed at its turn/end', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    const open = await w.beginTurn(TURN.real)
    await assertSilent(lab, w, 'turn open')
    await open.end()
    await assertFiresAfter(lab, w, INTERVAL_MS, 're-armed at turn/end')
  })
  row(sdk, ID.bva05, 4, 'a fresh row over a manager with no turn yet sends nothing (no turn end to measure from)', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await assertSilent(lab, w, 'no history')
  })

  // ============================================================================================
  // HB-DT-01: turn classification. Observed with maxConsecutive 1: a real turn ends at T, the
  // turn under test X ends at T + interval/2. Real X → the next heartbeat is interval after X;
  // heartbeat X → count 1 = max, nothing; neutral X (no step) → the anchor stays T, fires at
  // T + interval.

  const OUTCOME = Object.freeze({ real: 'real', heartbeat: 'heartbeat', neutral: 'neutral' })
  const decisions = [
    { part: 1, label: 'heartbeat notice, no user message', sources: TURN.heartbeat, outcome: OUTCOME.heartbeat },
    { part: 2, label: 'heartbeat notice and the user\'s message', sources: TURN.mixed, outcome: OUTCOME.real },
    { part: 3, label: 'the user\'s message only', sources: TURN.real, outcome: OUTCOME.real },
    { part: 4, label: 'a step with neither message', sources: TURN.stepOnly, outcome: OUTCOME.real },
    { part: 5, label: 'another plugin\'s fishball-notice only', sources: TURN.otherPlugin, outcome: OUTCOME.real },
    { part: 6, label: 'another source kind only', sources: TURN.otherKind, outcome: OUTCOME.real },
    { part: 7, label: 'heartbeat notice plus another plugin\'s notice, no user message', sources: TURN.heartbeatAndOther, outcome: OUTCOME.heartbeat },
    { part: 8, label: 'no step entered (empty turn)', sources: TURN.empty, outcome: OUTCOME.neutral },
    { part: 9, label: 'the user\'s message, turn aborted', sources: TURN.real, reason: DSH.endReason.aborted, outcome: OUTCOME.real },
    { part: 10, label: 'heartbeat notice, turn ended in error', sources: TURN.heartbeat, reason: DSH.endReason.error, outcome: OUTCOME.heartbeat },
    { part: 11, label: 'heartbeat notice, turn aborted', sources: TURN.heartbeat, reason: DSH.endReason.aborted, outcome: OUTCOME.heartbeat },
  ]
  for (const d of decisions) {
    row(sdk, ID.dt01, d.part, `${d.label} → ${d.outcome} turn`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(LIMIT.maxMin))
      await w.turn(TURN.real)
      await lab.tick(HALF_MS)
      await w.turn(d.sources, { reason: d.reason })
      if (d.outcome === OUTCOME.real) await assertFiresAfter(lab, w, INTERVAL_MS, 'a real turn resets count and anchor')
      else if (d.outcome === OUTCOME.neutral) await assertFiresAfter(lab, w, HALF_MS, 'a neutral turn keeps the earlier anchor')
      else await assertSilent(lab, w, 'a heartbeat turn counts: limit 1 reached')
    })
  }
  row(sdk, ID.dt01, 12, 'an empty turn does not reset the count: at the limit it keeps the cache cool', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(LIMIT.maxMin), { autoTurn: true })
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat 1 of 1')
    await w.turn(TURN.empty)
    await assertSilent(lab, w, 'still at the limit')
  })
  row(sdk, ID.dt01, 13, 'an empty turn after the anchor is overdue re-arms nothing', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'the gap\'s heartbeat (no turn follows it)')
    await lab.tick(HALF_MS)
    await w.turn(TURN.empty)
    await assertSilent(lab, w, 'anchor still the real turn: overdue')
  })

  // ============================================================================================
  // HB-EP-04: only the manager's session counts.

  row(sdk, ID.ep04, 1, 'another session\'s turns neither reset nor arm the timer', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    const other = w.otherSession()
    await w.turn(TURN.real, { session: other })
    await assertSilent(lab, w, 'another session\'s turn arms nothing')
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    const open = await w.beginTurn(TURN.real, other)
    await assertFiresAfter(lab, w, HALF_MS, 'another session\'s open turn does not clear the timer')
    await open.end()
    await assertSilent(lab, w, 'another session\'s turn end does not re-arm it')
  })
  row(sdk, ID.ep04, 2, 'another session\'s real turn does not reset the manager\'s consecutive count', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(LIMIT.maxMin), { autoTurn: true })
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat 1 of 1')
    await w.turn(TURN.real, { session: w.otherSession() })
    await assertSilent(lab, w, 'the manager is still at its limit')
  })

  // ============================================================================================
  // HB-ST-01 / HB-UC-01: the whole walk, with the fake core running each heartbeat turn and
  // Fishball updating the focus at the end of each (the user's "update the next heartbeat's focus").

  row(sdk, ID.uc01, 'main', 'system flow over a real Session: real turn → heartbeats with the focus set each time → limit → cool → real turn → heartbeats resume', async (t) => {
    const max = LIMIT.maxMin + 1
    const { lab, w } = await loaded(t, sdk, config(max), { autoTurn: true })
    await w.turn(TURN.real)
    const first = await assertFiresAfter(lab, w, INTERVAL_MS, 'idle → armed → fired (1)')
    assertNoticeShape(first)
    await setFocus(w, FIXTURE.focus)
    const second = await assertFiresAfter(lab, w, INTERVAL_MS, 'heartbeat turn → armed → fired (2)')
    assertNoticeShape(second)
    assert.ok(second.text.includes(FIXTURE.focus), 'the second heartbeat carries the focus set in the first heartbeat turn: ' + show(second.text))
    assert.notEqual(second.dedupeKey, first.dedupeKey, 'two idle gaps never share a dedupeKey')
    await setFocus(w, FIXTURE.otherFocus)
    await assertSilent(lab, w, 'limit → cool')
    await w.turn(TURN.real)
    const third = await assertFiresAfter(lab, w, INTERVAL_MS, 'real turn → armed again')
    assert.ok(third.text.includes(FIXTURE.otherFocus), 'the focus set at the limit is carried by the next heartbeat')
    assert.ok(![first.dedupeKey, second.dedupeKey].includes(third.dedupeKey), 'a new gap, a new key')
    // Every heartbeat turn admitted its notice text as a user/message in the real session.
    const admitted = w.session.snapshotEvents().filter((e) => e.type === DSH.event.userMessage && e.data.source?.pluginId === HEARTBEAT.name)
    assert.equal(admitted.length, w.notices.length, 'each notice became one heartbeat turn')
  })
  row(sdk, ID.st01, 1, 'a real turn in the middle of the run resets the count (max 2: hb, real, hb, hb, then cool)', async (t) => {
    const max = LIMIT.maxMin + 1
    const { lab, w } = await loaded(t, sdk, config(max), { autoTurn: true })
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'hb 1')
    await lab.tick(HALF_MS)
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'hb 1 after the reset')
    await assertFiresAfter(lab, w, INTERVAL_MS, 'hb 2 after the reset')
    await assertSilent(lab, w, 'limit')
  })

  // ============================================================================================
  // HB-BVA-04 / HB-ST-02: restart reconstruction from live.session.snapshotEvents().

  for (const p of [
    { part: 1, label: 'interval/2', elapsed: HALF_MS, firesAfter: HALF_MS },
    { part: 2, label: 'interval - 1 ms', elapsed: INTERVAL_MS - EDGE_MS, firesAfter: EDGE_MS },
    { part: 3, label: 'exactly interval (remaining 0: overdue)', elapsed: INTERVAL_MS },
    { part: 4, label: 'interval + 1 ms', elapsed: INTERVAL_MS + EDGE_MS },
  ]) {
    row(sdk, ID.bva04, p.part, `restart ${p.label} after the last turn end: ${p.firesAfter ? 'fires for the remaining time' : 'nothing until the next turn ends'}`, async (t) => {
      const lab = await labFor(t, sdk)
      const earlier = await lab.open()
      await earlier.load(config(ROOMY))
      await earlier.turn(TURN.real)
      const w = await restarted(lab, earlier, p.elapsed, config(ROOMY))
      assert.deepEqual(earlier.notices, [], 'the closed world sent nothing after disposal')
      if (p.firesAfter) await assertFiresAfter(lab, w, p.firesAfter, 'remaining time')
      else {
        await assertSilent(lab, w, 'overdue: the cache is presumed cold')
        await assertEnabled(lab, w, INTERVAL_MS, 'the next turn re-arms')
      }
    })
  }
  const histories = [
    { part: 1, label: 'real, heartbeat (max 2)', turns: [TURN.real, TURN.heartbeat], fires: true },
    { part: 2, label: 'real, heartbeat, heartbeat (max 2)', turns: [TURN.real, TURN.heartbeat, TURN.heartbeat], fires: false },
    { part: 3, label: 'heartbeat, heartbeat, real (max 2)', turns: [TURN.heartbeat, TURN.heartbeat, TURN.real], fires: true },
    { part: 4, label: 'real, heartbeat, heartbeat, empty (max 2)', turns: [TURN.real, TURN.heartbeat, TURN.heartbeat, TURN.empty], fires: false },
    { part: 5, label: 'real, heartbeat, the user\'s message with a heartbeat notice (max 2)', turns: [TURN.real, TURN.heartbeat, TURN.mixed], fires: true },
  ]
  for (const h of histories) {
    row(sdk, ID.st02, h.part, `restart inside the interval after ${h.label}: ${h.fires ? 'one more heartbeat' : 'no heartbeat (count at the limit)'}`, async (t) => {
      const max = LIMIT.maxMin + 1
      const lab = await labFor(t, sdk)
      const earlier = await lab.open()
      await earlier.load(config(max))
      for (const sources of h.turns) await earlier.turn(sources)
      const w = await restarted(lab, earlier, HALF_MS, config(max))
      if (!h.fires) {
        await assertSilent(lab, w, 'rebuilt count is at the limit')
        await assertEnabled(lab, w, INTERVAL_MS, 'a real turn resets the rebuilt count')
        return
      }
      await assertFiresAfter(lab, w, HALF_MS, 'rebuilt count below the limit')
    })
  }
  row(sdk, ID.st02, 6, 'restart onto a log whose last turn is still open arms nothing until that turn ends', async (t) => {
    const lab = await labFor(t, sdk)
    const earlier = await lab.open()
    await earlier.load(config(ROOMY))
    await earlier.turn(TURN.real)
    await earlier.beginTurn(TURN.real)
    const w = await restarted(lab, earlier, HALF_MS, config(ROOMY))
    await assertSilent(lab, w, 'a turn is open')
    await w.closeOpenTurn()
    await assertFiresAfter(lab, w, INTERVAL_MS, 'armed at the turn end')
  })
  row(sdk, ID.st02, 7, 'X2 create after the row loaded (resume): the count and anchor are rebuilt when the manager comes up', async (t) => {
    const max = LIMIT.maxMin + 1
    const lab = await labFor(t, sdk)
    const earlier = await lab.open()
    await earlier.load(config(max))
    await earlier.turn(TURN.real)
    await earlier.turn(TURN.heartbeat)
    const seed = earlier.snapshot()
    await earlier.close()
    const w = await lab.open({ managerLive: false, seedFrom: seed })
    await w.load(config(max))
    assert.equal(w.tool(), undefined, 'no manager yet: no tool')
    await lab.tick(HALF_MS)
    await w.startManager()
    assert.ok(w.tool(), 'the tool arrives with the manager')
    await assertFiresAfter(lab, w, HALF_MS, 'remaining time from the rebuilt anchor')
  })
  row(sdk, ID.st02, 8, 'a config reload inside the interval re-arms the same gap with the same dedupeKey', async (t) => {
    const lab = await labFor(t, sdk)
    const reference = await lab.open()
    await reference.load(config(ROOMY))
    await reference.turn(TURN.real)
    await lab.tick(HALF_MS)
    // A second process over the same log and home, its row applied mid-gap: the same gap.
    const reloaded = await lab.open({ seedFrom: reference.snapshot() })
    await reloaded.load(config(ROOMY + 1))
    await reloaded.configure(config(ROOMY))
    await lab.tick(HALF_MS)
    assert.equal(reference.notices.length, 1, 'the reference fired once')
    assert.equal(reloaded.notices.length, 1, 'the reloaded row fired once, at the same moment')
    assert.equal(reloaded.notices[0].dedupeKey, reference.notices[0].dedupeKey, 'same gap → same dedupeKey')
  })

  // ============================================================================================
  // HB-EP-02: the core seam.

  for (const p of [
    { part: 1, label: 'no fishballInstance', core: null },
    { part: 2, label: 'a fishballInstance with apiVersion 1', core: HEARTBEAT.olderApiVersion },
  ]) {
    row(sdk, ID.ep02, p.part, `${p.label}: exactly one fishball-core-missing warning at load; nothing else`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(ROOMY), { core: p.core })
      assert.ok(w.active(), 'the row booted')
      const lines = w.linesWith(HEARTBEAT.coreMissing)
      assert.equal(lines.length, 1, 'one line: ' + show(lines))
      assert.equal(lines[0].type, DSH.warn, 'a warning')
      assert.equal(lines[0].name, HEARTBEAT.name, 'logged by the fishball-heartbeat logger')
      assert.deepEqual(w.manager.setups, [], 'no X2 setup on an incompatible instance')
      await assertInert(lab, w, p.label)
      assert.deepEqual(w.notices, [], 'nothing sent')
    })
  }
  row(sdk, ID.ep02, 3, 'with an appReady service the core check runs at ready, not at load', async (t) => {
    const { w } = await loaded(t, sdk, config(ROOMY), { core: null, appReady: true })
    assert.deepEqual(w.linesWith(HEARTBEAT.coreMissing), [], 'no line before ready')
    await w.ready()
    assert.equal(w.linesWith(HEARTBEAT.coreMissing).length, 1, 'one line at ready')
  })
  row(sdk, ID.ep02, 4, 'with appReady, a core that arrives before ready is bound and no line is logged', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY), { core: null, appReady: true })
    await w.provideCore(HEARTBEAT.apiVersion)
    await w.ready()
    assert.deepEqual(w.linesWith(HEARTBEAT.coreMissing), [], 'no line')
    await assertEnabled(lab, w, INTERVAL_MS, 'bound')
  })
  row(sdk, ID.ep02, 5, 'a core arriving after load is followed: X2 setup, tool and heartbeats; still one warning in total', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY), { core: null })
    await w.provideCore(HEARTBEAT.olderApiVersion)
    await w.removeCore()
    await w.provideCore(HEARTBEAT.apiVersion)
    assert.equal(w.linesWith(HEARTBEAT.coreMissing).length, 1, 'one line per load, not per service event')
    assert.ok(w.manager.setups.includes(HEARTBEAT.name), 'registered with the arriving core')
    assertNoticeShape(await assertEnabled(lab, w, INTERVAL_MS, 'late core'))
  })
  row(sdk, ID.ep02, 6, 'the core going away while armed removes the tool and nothing is sent', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.removeCore()
    assert.equal(w.tool(), undefined, 'the tool left with the core')
    assert.ok(w.active(), 'the row stays up')
    await assertSilent(lab, w, 'no heartbeat after the core left')
  })
  row(sdk, ID.ep02, 7, 'a core replaced mid-gap: the new instance gets the setup and the gap\'s heartbeat; the old one gets nothing', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    const first = w.generation
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.removeCore()
    await w.provideCore(HEARTBEAT.apiVersion)
    assert.ok(w.tool(), 'the tool is back with the new core')
    const notice = await assertFiresAfter(lab, w, HALF_MS, 'the rebuilt anchor')
    assert.notEqual(notice.generation, first, 'sent to the new instance')
    assert.ok(w.notices.every((n) => n.generation !== first), 'the old instance got nothing')
  })

  // ============================================================================================
  // HB-EP-03 / HB-BVA-03: the heartbeat_focus tool.

  row(sdk, ID.ep03, 1, 'heartbeat_focus declares one required string parameter, focus, and nothing for the interval or limit', async (t) => {
    const { w } = await loaded(t, sdk, config(ROOMY))
    const definition = w.tool()
    assert.ok(definition, 'registered in the manager scope')
    assert.equal(definition.name, HEARTBEAT.tool)
    assertFocusParameters(definition.parameters)
    assert.deepEqual([...w.global.tools.keys()], [], 'not global')
  })
  row(sdk, ID.ep03, 2, 'a caller other than the manager gets not-manager and the focus is unchanged', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await setFocus(w, FIXTURE.focus)
    const result = await w.call({ [HEARTBEAT.argument]: FIXTURE.otherFocus }, w.foreignAgent())
    assert.deepEqual(result, { ok: false, code: CODE.notManager })
    const text = await nextText(lab, w)
    assert.ok(text.includes(FIXTURE.focus) && !text.includes(FIXTURE.otherFocus), 'the focus is the manager\'s: ' + show(text))
  })
  for (const [index, shape] of FIXTURE.invalidArgs.entries()) {
    row(sdk, ID.ep03, 3 + index, `arguments with ${shape.label} → invalid-input; the focus and the timer are unchanged`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(ROOMY))
      await setFocus(w, FIXTURE.focus)
      const result = await w.call(shape.args)
      assert.deepEqual(result, { ok: false, code: CODE.invalidInput }, show(result))
      const text = await nextText(lab, w)
      assert.ok(text.includes(FIXTURE.focus), 'the earlier focus stands: ' + show(text))
    })
  }
  const after = 3 + FIXTURE.invalidArgs.length
  row(sdk, ID.ep03, after, 'focus is trimmed; a heartbeat with no focus set still names the tool', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    assert.ok((await nextText(lab, w)).includes(HEARTBEAT.tool), 'no focus yet: the instruction is there')
    await setFocus(w, FIXTURE.padded, FIXTURE.padded.trim())
    assert.ok((await nextText(lab, w)).includes(FIXTURE.padded.trim()), 'the trimmed focus is carried verbatim')
  })
  row(sdk, ID.ep03, after + 1, 'a blank focus clears it: the next heartbeat no longer carries the old focus', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await setFocus(w, FIXTURE.focus)
    await setFocus(w, FIXTURE.blank, '')
    const text = await nextText(lab, w)
    assert.ok(!text.includes(FIXTURE.focus), 'cleared: ' + show(text))
    assert.ok(text.includes(HEARTBEAT.tool), 'still names the tool')
  })
  row(sdk, ID.ep03, after + 2, 'a storage failure returns focus-unavailable and never throws', async (t) => {
    const lab = await labFor(t, sdk)
    // A regular file where the row's folder would be: every write under it fails.
    fs.writeFileSync(path.join(lab.home, HEARTBEAT.storeDir), FIXTURE.ascii)
    const w = await lab.open()
    await w.load(config(ROOMY))
    const result = await w.call({ [HEARTBEAT.argument]: FIXTURE.focus })
    assert.deepEqual(result, { ok: false, code: CODE.focusUnavailable }, show(result))
  })
  for (const p of [
    { part: 1, label: '2000 ASCII code points', focus: FIXTURE.ascii.repeat(LIMIT.focusCodePoints), ok: true },
    { part: 2, label: '2001 ASCII code points', focus: FIXTURE.ascii.repeat(LIMIT.focusCodePoints + 1), ok: false },
    { part: 3, label: '2000 astral code points (4000 UTF-16 units)', focus: FIXTURE.astral.repeat(LIMIT.focusCodePoints), ok: true },
    { part: 4, label: '2001 astral code points', focus: FIXTURE.astral.repeat(LIMIT.focusCodePoints + 1), ok: false },
    { part: 5, label: '2000 code points padded with whitespace (measured after trim)', focus: FIXTURE.padded.replace(FIXTURE.padded.trim(), FIXTURE.ascii.repeat(LIMIT.focusCodePoints)), ok: true },
    { part: 6, label: '1 code point', focus: FIXTURE.ascii, ok: true },
  ]) {
    row(sdk, ID.bva03, p.part, `focus of ${p.label}: ${p.ok ? 'accepted' : 'invalid-input'}`, async (t) => {
      const { lab, w } = await loaded(t, sdk, config(ROOMY))
      if (p.ok) {
        await setFocus(w, p.focus)
        assert.ok((await nextText(lab, w)).includes(p.focus.trim()), 'the whole focus is carried')
      } else {
        assert.deepEqual(await w.call({ [HEARTBEAT.argument]: p.focus }), { ok: false, code: CODE.invalidInput })
        assert.ok(!(await nextText(lab, w)).includes(p.focus.trim().slice(0, LIMIT.focusCodePoints)), 'nothing was saved')
      }
    })
  }

  // ============================================================================================
  // HB-INT: persistence, notify rejection, disposal.

  row(sdk, ID.int, 1, 'the focus is saved under <home>/fishball-heartbeat/ and survives a row reload and a restart', async (t) => {
    const lab = await labFor(t, sdk)
    const earlier = await lab.open()
    await earlier.load(config(ROOMY))
    await setFocus(earlier, FIXTURE.focus)
    assert.ok(earlier.files().some((f) => f.startsWith(HEARTBEAT.storeDir + path.sep)), 'a file under fishball-heartbeat/: ' + show(earlier.files()))
    await earlier.configure(config(ROOMY + 1))
    assert.ok((await nextText(lab, earlier)).includes(FIXTURE.focus), 'kept across a reload')
    const w = await restarted(lab, earlier, INTERVAL_MS, config(ROOMY))
    assert.ok((await nextText(lab, w)).includes(FIXTURE.focus), 'kept across a restart with the same home')
  })
  row(sdk, ID.int, 2, 'a rejected notify is logged as a warning, not retried, and the next turn end arms again', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY), { notify: NOTIFY_MODE.reject })
    const before = w.warnings().length
    await assertEnabled(lab, w, INTERVAL_MS, 'the attempt')
    assert.ok(w.warnings().length > before, 'a warning was logged: ' + show(w.logs.slice(-5)))
    assert.ok(w.active(), 'the row stays up')
    await assertSilent(lab, w, 'no retry')
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'armed again by the next turn end')
  })
  row(sdk, ID.int, 3, 'disabling the row while armed clears the timer and removes the tool', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.disable()
    assert.equal(w.tool(), undefined, 'tool removed')
    await assertSilent(lab, w, 'disabled')
  })
  row(sdk, ID.int, 4, 'disposing the X2 registration while armed clears the timer and removes the tool', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(ROOMY))
    await w.turn(TURN.real)
    await lab.tick(HALF_MS)
    await w.disposeSetups()
    assert.equal(w.tool(), undefined, 'tool removed')
    await assertSilent(lab, w, 'setup disposed')
    await w.turn(TURN.real)
    await assertSilent(lab, w, 'no listener survives the setup')
  })
  row(sdk, ID.int, 5, 'the tool takes no interval or limit: a call with them is refused and changes neither', async (t) => {
    const { lab, w } = await loaded(t, sdk, config(LIMIT.maxMin), { autoTurn: true })
    const result = await w.call({ [HEARTBEAT.argument]: FIXTURE.focus, [CFG.interval]: LIMIT.intervalMin, [CFG.max]: ROOMY })
    assert.deepEqual(result, { ok: false, code: CODE.invalidInput }, show(result))
    await w.turn(TURN.real)
    await assertFiresAfter(lab, w, INTERVAL_MS, 'the user\'s interval')
    await assertSilent(lab, w, 'the user\'s limit')
  })
}