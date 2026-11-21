/**
 * dsh-connector-watchdog live settings (R2, R3), black-box over the row's public surface
 * (constants.mjs names the sources; index.js and src/config.js were not read).
 *
 * Techniques: EP (WD-LC-EP-*: the four fields and their partitions; which briefs are re-armed), BVA
 * (WD-LC-BVA-*: the interval's min/max and their neighbours, the patrol's firing edge), DT
 * (WD-LC-DT-01: brief state × change), ST (WD-LC-ST-01: armed(600) → live change → armed(900) → fired
 * → re-armed), plus the schema rows (WD-LC-SC-*) and DSH's settings service serving the namespace.
 *
 * Level: integration. The real row on a real Loader of each SDK, fake connector services and a fake
 * clock (world.mjs); DSH's own dsh-settings for the served namespace (test/support/amenity-settings.mjs).
 */
import assert from 'node:assert/strict'
import { assertField, fieldsOf, servedNamespace } from '../../../../test/support/amenity-settings.mjs'
import { FIELDS, FIXTURE, TIME, WATCHDOG } from './constants.mjs'
import { caseTest, rowModule, storedBrief, watchdogWorld } from './world.mjs'

const S = TIME.secondMs
const EDGE = TIME.edgeMs
const show = (v) => JSON.stringify(v)
const interval = (seconds) => ({ minCheckIntervalSeconds: seconds })

/** Asserts exactly one patrol of `sessionId` arrives `ms` from now (none at ms - 1). */
async function assertPatrolAfter(w, sessionId, ms, label) {
  const from = w.reads.length
  await w.tick(ms - EDGE)
  assert.deepEqual(w.patrolsOf(sessionId, from), [], label + ': no patrol before ' + ms + ' ms')
  await w.tick(EDGE)
  const fired = w.patrolsOf(sessionId, from)
  assert.equal(fired.length, 1, label + ': one patrol at ' + ms + ' ms: ' + show(fired))
  return fired[0]
}
async function assertNoPatrol(w, sessionId, ms, label) {
  const from = w.reads.length
  await w.tick(ms)
  assert.deepEqual(w.patrolsOf(sessionId, from), [], label + ': no patrol within ' + ms + ' ms')
}
/** A world with one fresh brief on FIXTURE.session under `config`. */
async function briefed(t, sdk, config) {
  const w = await watchdogWorld(t, sdk, { config })
  const result = await w.call(WATCHDOG.tool.brief, { sessionId: FIXTURE.session, purpose: FIXTURE.purpose })
  assert.equal(result.ok, true, 'brief: ' + show(result))
  return w
}

export function registerWatchdogLiveConfigCases(sdk) {
  // ============================================================================================
  // R2: the schema

  caseTest(sdk, 'WD-LC-SC-01', 'order', 'Config has exactly the four user settings, in order', async () => {
    assert.deepEqual(Object.keys(fieldsOf((await rowModule(sdk)).Config)), FIELDS.map((f) => f.name))
  })
  for (const field of FIELDS) {
    caseTest(sdk, 'WD-LC-SC-01', field.name, `${field.name}: volatile natural, default ${field.default}, ${field.min}..${field.max}, description kept`, async () => {
      assertField(fieldsOf((await rowModule(sdk)).Config)[field.name], { ...field, volatile: true }, field.name)
    })
    caseTest(sdk, 'WD-LC-BVA-01', field.name, `${field.name}: ${field.min} and ${field.max} accepted; ${field.min - 1}, ${field.max + 1} and a fraction refused`, async () => {
      const { Config } = await rowModule(sdk)
      for (const ok of [field.min, field.max]) assert.equal(Config({ [field.name]: ok })[field.name].get(), ok, field.name + ' ' + ok)
      for (const bad of [field.min - 1, field.max + 1, field.min + 0.5]) assert.throws(() => Config({ [field.name]: bad }), undefined, field.name + ' ' + bad + ' is refused')
      assert.equal(Config({})[field.name].get(), field.default, 'unset → the default')
    })
  }
  caseTest(sdk, 'WD-LC-SC-02', 1, 'DSH\'s settings service serves the dsh-connector-watchdog namespace with all four fields and their values', async () => {
    const { Config } = await rowModule(sdk)
    const view = await servedNamespace(sdk, { id: WATCHDOG.name, Config, raw: interval(FIXTURE.interval.first) })
    assert.ok(view, 'the namespace is served')
    assert.deepEqual(Object.keys(view.value).sort(), FIELDS.map((f) => f.name).sort())
    assert.equal(view.value.minCheckIntervalSeconds, FIXTURE.interval.first)
    for (const f of FIELDS.slice(1)) assert.equal(view.value[f.name], f.default, f.name)
    assert.deepEqual(view.user, interval(FIXTURE.interval.first), 'the user layer holds what the user set')
  })

  // ============================================================================================
  // R3: a live change re-applies the row

  caseTest(sdk, 'WD-LC-ST-01', 1, 'armed at 600 s; a live change to 900 s at +100 s re-arms: no patrol at the old 600 s, one 900 s after the change; same fiber, tools kept', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    const fiber = w.fiber()
    await w.tick(100 * S)
    await w.configure(interval(FIXTURE.interval.second))
    assert.equal(w.fiber(), fiber, 'the row fiber is the same')
    assert.ok(w.active(), 'the row stayed active')
    assert.deepEqual([...w.tools.keys()].sort(), Object.values(WATCHDOG.tool).sort(), 'the four tools are registered after the re-apply')
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.second * S, 'the new interval from the change')
  })
  caseTest(sdk, 'WD-LC-ST-01', 2, 'after the change, the patrol keeps the new interval: fired → re-armed at 900 s again', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    await w.configure(interval(FIXTURE.interval.second))
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.second * S, 'first patrol')
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.second * S, 'second patrol')
  })
  caseTest(sdk, 'WD-LC-ST-01', 3, 'a shorter interval applies at once too (600 s → 120 s at +10 s: one patrol 120 s after the change)', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    await w.tick(10 * S)
    await w.configure(interval(FIXTURE.interval.short))
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.short * S, 'the short interval')
  })
  caseTest(sdk, 'WD-LC-ST-01', 4, 'the brief survives the re-apply: it is still the manager\'s (a second brief is refused, pause works)', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    await w.configure(interval(FIXTURE.interval.second))
    const again = await w.call(WATCHDOG.tool.brief, { sessionId: FIXTURE.session, purpose: FIXTURE.purpose })
    assert.equal(again.ok, false, 'a second brief is refused: the first one stands: ' + show(again))
    const paused = await w.call(WATCHDOG.tool.pause, { sessionId: FIXTURE.session })
    assert.equal(paused.ok, true, show(paused))
  })
  caseTest(sdk, 'WD-LC-EP-01', 1, 'readMaxMessages and readMaxBytes changed live: the next patrol reads with the new numbers', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    await w.configure({ ...interval(FIXTURE.interval.first), readMaxMessages: FIXTURE.reads.messages, readMaxBytes: FIXTURE.reads.bytes })
    const read = await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.first * S, 'patrol after the read change')
    assert.equal(read.maxMessages, FIXTURE.reads.messages)
    assert.equal(read.maxBytes, FIXTURE.reads.bytes)
  })
  caseTest(sdk, 'WD-LC-EP-01', 2, 'defaults: an unset config patrols at 1740 s and reads 8 messages / 8192 bytes', async (t) => {
    const w = await briefed(t, sdk, {})
    const read = await assertPatrolAfter(w, FIXTURE.session, FIELDS[0].default * S, 'default interval')
    assert.equal(read.maxMessages, FIELDS[1].default)
    assert.equal(read.maxBytes, FIELDS[2].default)
  })

  // ---- BVA on the live interval ----
  for (const [part, seconds] of [[1, 60], [2, 86_400]]) {
    caseTest(sdk, 'WD-LC-BVA-02', part, `a live change to ${seconds} s (the ${part === 1 ? 'minimum' : 'maximum'}) is applied: the patrol fires ${seconds} s after it`, async (t) => {
      const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
      await w.configure(interval(seconds))
      await assertPatrolAfter(w, FIXTURE.session, seconds * S, seconds + ' s')
    })
  }
  for (const [part, seconds] of [[3, 59], [4, 86_401], [5, 600.5]]) {
    caseTest(sdk, 'WD-LC-BVA-02', part, `a live change to ${seconds} s is refused: the patrol keeps the old 600 s, the row stays`, async (t) => {
      const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
      const fiber = w.fiber()
      await w.configure(interval(seconds))
      assert.equal(w.fiber(), fiber)
      assert.ok(w.active())
      await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.first * S, 'the old interval stands')
    })
  }

  // ---- DT: which briefs are re-armed ----
  caseTest(sdk, 'WD-LC-DT-01', 1, 'stored briefs at start: the unpaused one is re-armed with the new interval after a live change, the paused one is not armed', async (t) => {
    const w = await watchdogWorld(t, sdk, { config: interval(FIXTURE.interval.first), briefs: [storedBrief(FIXTURE.session), storedBrief(FIXTURE.paused, { paused: true })] })
    await w.tick(100 * S)
    await w.configure(interval(FIXTURE.interval.second))
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.second * S, 'the stored unpaused brief')
    assert.deepEqual(w.patrolsOf(FIXTURE.paused), [], 'the paused brief is never patrolled')
  })
  caseTest(sdk, 'WD-LC-DT-01', 2, 'a brief paused before the change stays unarmed after it; resumed, it patrols at the new interval', async (t) => {
    const w = await briefed(t, sdk, interval(FIXTURE.interval.first))
    await w.call(WATCHDOG.tool.pause, { sessionId: FIXTURE.session })
    await w.configure(interval(FIXTURE.interval.short))
    await assertNoPatrol(w, FIXTURE.session, FIXTURE.interval.first * S * 2, 'paused')
    const resumed = await w.call(WATCHDOG.tool.resume, { sessionId: FIXTURE.session })
    assert.equal(resumed.ok, true, show(resumed))
    await assertPatrolAfter(w, FIXTURE.session, FIXTURE.interval.short * S, 'resumed at the new interval')
  })
  caseTest(sdk, 'WD-LC-DT-01', 3, 'no brief: a live change arms nothing', async (t) => {
    const w = await watchdogWorld(t, sdk, { config: interval(FIXTURE.interval.first) })
    await w.configure(interval(FIXTURE.interval.short))
    await w.tick(FIXTURE.interval.first * S * 2)
    assert.deepEqual(w.reads, [])
  })
}
