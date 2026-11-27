/**
 * fishball-heartbeat live settings (R2, R3 of the amenities' settings pages, relayed by the lead on
 * 2026-11-22), black-box; the package's src/ was not read (index.js and src/config.js are imported
 * as modules).
 *
 * Techniques: EP (HB-LC-SC-01: the schema; HB-LC-EP-01: the served namespace),
 * BVA (HB-LC-BVA-01: a live intervalSeconds 0 / 1 / max / max+1), DT (HB-LC-DT-01: interval set ×
 * max set, changed live), ST (HB-LC-ST-01: off → on → interval changed → off, each live).
 *
 * Level: integration. world.mjs (the real row as a loader row, real session store, fake core,
 * MockTimers); a live change is loader.update with a volatile-only config, so "not remounted" is
 * "the row's fiber passed through no state" (cordis 'internal/status') and stayed the same fiber.
 *
 * Not here: HB-LC-SC-02 and HB-LC-EP-01 row 3 read fishball-board's Config (another package of this
 * repository): they are integration rows.
 */
import assert from 'node:assert/strict'
import { importBound } from 'fishball-test-helpers/bind'
import { caseTest } from 'fishball-test-helpers/cases'
import { assertField, fieldsOf, servedNamespace } from 'fishball-test-helpers/settings'
import { HEARTBEAT, LIVE, TIME, TURN, WAIT } from './constants.mjs'
import { labFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)
const CFG = HEARTBEAT.config
const S = TIME.secondMs
const INTERVAL_MS = TIME.intervalSeconds * S
const SILENCE_MS = INTERVAL_MS * TIME.silenceIntervals
const EDGE_MS = 1
const ROOMY = 1000
const show = (v) => JSON.stringify(v)
const config = (max, interval = TIME.intervalSeconds) => ({ [CFG.interval]: interval, [CFG.max]: max })

async function opened(t, cfg) {
  const lab = await labFor(t)
  const w = await lab.open()
  await w.load(cfg)
  return { lab, w }
}
async function firesAfter(lab, w, ms, label) {
  const before = w.notices.length
  await lab.tick(ms - EDGE_MS)
  assert.equal(w.notices.length, before, label + ': nothing before ' + ms + ' ms')
  await lab.tick(EDGE_MS)
  assert.equal(w.notices.length, before + 1, label + ': one heartbeat at ' + ms + ' ms')
}
async function silent(lab, w, label, ms = SILENCE_MS) {
  const before = w.notices.length
  await lab.tick(ms)
  assert.equal(w.notices.length, before, label + ': nothing sent ' + show(w.notices.slice(before)))
}
/** A live change: the row's fiber stays the same and passes through no state. */
async function liveChange(w, cfg, label) {
  const fiber = w.fiber()
  const mark = w.statusMark()
  await w.configure(cfg)
  assert.equal(w.fiber(), fiber, label + ': the same row fiber')
  assert.deepEqual(w.rowStatuses(mark), [], label + ': the row fiber was not remounted')
  assert.ok(w.active(), label + ': the row is active')
}

export function registerHeartbeatLiveCases() {
  // ============================================================================================
  // R2: the schema

  row('HB-LC-SC-01', 'order', 'Config holds intervalSeconds and maxConsecutive, in that order (another branch may add compactThresholdTokens)', async () => {
    const names = Object.keys(fieldsOf((await importBound(LIVE.config)).Config)).filter((n) => n !== LIVE.optionalField)
    assert.deepEqual(names, LIVE.fields.map((f) => f.name))
  })
  for (const field of LIVE.fields) {
    row('HB-LC-SC-01', field.name, `${field.name}: a volatile natural, min ${field.min}${field.max ? ', max ' + field.max : ', no max'}, no default, description kept`, async () => {
      const { Config } = await importBound(LIVE.config)
      assertField(fieldsOf(Config)[field.name], { ...field, volatile: true }, field.name)
    })
  }
  row('HB-LC-SC-01', 'index', "index.js exports the same Config (volatile fields) as its row's schema", async () => {
    const mod = await importBound(HEARTBEAT.entry)
    for (const field of LIVE.fields) assert.equal(fieldsOf(mod.Config)[field.name]?.meta.volatile, true, field.name)
  })
  row('HB-LC-EP-01', 1, "DSH's settings service serves the fishball-heartbeat namespace with the user's values", async () => {
    const { Config } = await importBound(HEARTBEAT.entry)
    const view = await servedNamespace({ id: HEARTBEAT.name, Config, raw: config(ROOMY) })
    assert.ok(view, 'served')
    assert.equal(view.value[CFG.interval], TIME.intervalSeconds)
    assert.equal(view.value[CFG.max], ROOMY)
    assert.deepEqual(view.user, config(ROOMY))
  })
  row('HB-LC-EP-01', 2, 'an unset heartbeat is still served (its fields have no value yet)', async () => {
    const { Config } = await importBound(HEARTBEAT.entry)
    const view = await servedNamespace({ id: HEARTBEAT.name, Config, raw: {} })
    assert.ok(view, 'served')
    assert.equal(view.value[CFG.interval], undefined)
    assert.equal(view.value[CFG.max], undefined)
  })

  // ============================================================================================
  // R3: live changes

  row('HB-LC-ST-01', 1, 'off → both set live → on: heartbeat_focus appears and a real turn arms one heartbeat at intervalSeconds; not remounted', async (t) => {
    const { lab, w } = await opened(t, {})
    assert.equal(w.tool(), undefined, 'off at first')
    await w.turn(TURN.real)
    await silent(lab, w, 'off')
    await liveChange(w, config(ROOMY), 'both set')
    assert.ok(w.tool(), 'heartbeat_focus is registered')
    await w.turn(TURN.real)
    await firesAfter(lab, w, INTERVAL_MS, 'on')
  })
  row('HB-LC-ST-01', 2, 'intervalSeconds changed live (60 → 120 s right after a turn end): the next heartbeat comes at 120 s, not 60 s', async (t) => {
    const { lab, w } = await opened(t, config(ROOMY))
    await w.turn(TURN.real)
    await liveChange(w, config(ROOMY, 2 * TIME.intervalSeconds), 'interval 120')
    await firesAfter(lab, w, 2 * INTERVAL_MS, 'the new interval')
  })
  row('HB-LC-ST-01', 3, 'intervalSeconds shortened live (60 → 30 s right after a turn end): the next heartbeat comes at 30 s', async (t) => {
    const { lab, w } = await opened(t, config(ROOMY))
    await w.turn(TURN.real)
    await liveChange(w, config(ROOMY, TIME.intervalSeconds / 2), 'interval 30')
    await firesAfter(lab, w, INTERVAL_MS / 2, 'the shorter interval')
  })
  for (const [part, cfg, label] of [[4, { [CFG.max]: ROOMY }, 'intervalSeconds'], [5, { [CFG.interval]: TIME.intervalSeconds }, 'maxConsecutive']]) {
    row('HB-LC-ST-01', part, `unsetting ${label} live while armed turns it off: the tool goes, nothing is sent`, async (t) => {
      const { lab, w } = await opened(t, config(ROOMY))
      await w.turn(TURN.real)
      await lab.tick(INTERVAL_MS / 2)
      await liveChange(w, cfg, 'unset ' + label)
      assert.equal(w.tool(), undefined, 'no heartbeat_focus')
      await silent(lab, w, 'off again')
      await w.turn(TURN.real)
      await silent(lab, w, 'a real turn arms nothing')
    })
  }
  row('HB-LC-ST-01', 6, 'maxConsecutive changed live (1 → 2) applies: two heartbeats in a row, then silence', async (t) => {
    const { lab, w } = await opened(t, config(1))
    await liveChange(w, config(2), 'max 2')
    await w.turn(TURN.real)
    await firesAfter(lab, w, INTERVAL_MS, 'first')
    await w.turn(TURN.heartbeat)
    await firesAfter(lab, w, INTERVAL_MS, 'second')
    await w.turn(TURN.heartbeat)
    await silent(lab, w, 'the limit of two')
  })

  // ---- BVA: a live intervalSeconds ----
  for (const [part, interval, applied] of [[1, LIVE.fields[0].min - 1, false], [2, LIVE.fields[0].min, true], [3, LIVE.fields[0].max, true], [4, LIVE.fields[0].max + 1, false]]) {
    row('HB-LC-BVA-01', part, `intervalSeconds ${interval} set live: ${applied ? 'applied' : 'refused, the old 60 s stays'}`, async (t) => {
      const { lab, w } = await opened(t, config(ROOMY))
      await liveChange(w, config(ROOMY, interval), 'interval ' + interval)
      await w.turn(TURN.real)
      if (applied && interval === LIVE.fields[0].min) await firesAfter(lab, w, interval * S, 'min')
      else if (applied) { await silent(lab, w, 'not at the old 60 s'); assert.ok(w.tool(), 'still on') }
      else await firesAfter(lab, w, INTERVAL_MS, 'the old interval')
    })
  }

  // ---- DT: interval set × max set, reached live ----
  for (const [part, cfg, on] of [
    [1, {}, false], [2, { [CFG.interval]: TIME.intervalSeconds }, false], [3, { [CFG.max]: ROOMY }, false], [4, config(ROOMY), true],
  ]) {
    row('HB-LC-DT-01', part, `from ${show(config(ROOMY))} live to ${show(cfg)}: ${on ? 'on' : 'off'}`, async (t) => {
      const { lab, w } = await opened(t, config(ROOMY, 2 * TIME.intervalSeconds))
      await liveChange(w, cfg, show(cfg))
      await w.turn(TURN.real)
      if (on) { assert.ok(w.tool()); await firesAfter(lab, w, INTERVAL_MS, 'on') } else { assert.equal(w.tool(), undefined); await silent(lab, w, 'off') }
    })
  }
}
