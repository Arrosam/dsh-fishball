/**
 * R1 black-box cases for `fishball-heartbeat/src/live-settings.js` (USE-CASES.md beside this file): `settingsSnapshot(config)` and
 * `runWithSettings(ctx, config, body)`, written from the requirement alone (R1, relayed by the lead on 2026-11-22, with the implementer's correction of the module's place; live-settings.js was not read).
 *
 * Techniques: EP (LS-EP-*: the config partitions and the rows a change belongs to), BVA (LS-BVA-*:
 * the schema's min/max edges of a live value), DT (LS-DT-*: change kind × outcome), ST (LS-ST-*:
 * first run → re-run → … → dispose / restart), UC (LS-UC-*: the row a settings page edits).
 *
 * Level: integration. A fixture row whose apply returns runWithSettings is mounted as a loader row
 * on the current DSH's real cordis + cordis-plugin-loader, and its config is changed with loader.update, so
 * a volatile-only change is the Loader's own commit + 'loader/volatile-update'. Observation is the
 * body's calls (settings, scope), the disposers of effects it registers on its scope, how often the
 * row's apply ran (a remount re-runs it) and the row fiber's state.
 */
import assert from 'node:assert/strict'
import { ROW } from './constants.mjs'
import { caseTest, liveWorld, plainConfig, schemaOf, subject } from './world.mjs'

const show = (value) => JSON.stringify(value)
/** The settings one run receives, as plain data. */
const valuesOf = (run) => ({ count: run.settings.count, label: run.settings.label, mode: run.settings.mode })

export function registerLiveSettingsCases() {
  // ============================================================================================
  // settingsSnapshot

  caseTest('LS-EP-01', 1, 'a schema-resolved config: each volatile reference becomes its current value, a plain field passes through', async () => {
    const { settingsSnapshot } = await subject()
    const Config = await schemaOf()
    const resolved = Config({ count: ROW.initial, label: ROW.label, mode: ROW.ordinary })
    assert.equal(typeof resolved.count?.get, 'function', 'fixture: count is a volatile reference')
    const snap = settingsSnapshot(resolved)
    assert.deepEqual({ ...snap }, { count: ROW.initial, label: ROW.label, mode: ROW.ordinary })
    assert.ok(Object.isFrozen(snap), 'the snapshot is frozen')
  })
  caseTest('LS-EP-01', 2, 'an unset volatile field reads as undefined, a defaulted plain field as its default', async () => {
    const { settingsSnapshot } = await subject()
    const snap = settingsSnapshot((await schemaOf())({}))
    assert.equal(snap.count, undefined)
    assert.equal(snap.label, undefined)
    assert.equal(snap.mode, ROW.ordinaryDefault)
  })
  caseTest('LS-EP-01', 3, 'a plain object of values (no references) passes through unchanged and frozen', async () => {
    const { settingsSnapshot } = await subject()
    const plain = { count: ROW.next, label: ROW.label, nested: { a: 1 }, list: [1, 2] }
    const snap = settingsSnapshot(plain)
    assert.deepEqual({ ...snap }, plain)
    assert.ok(Object.isFrozen(snap))
    assert.equal(Object.isFrozen(plain), false, 'the input is not frozen in place')
  })
  for (const [part, input] of [[4, undefined], [5, null]]) {
    caseTest('LS-EP-01', part, `config ${String(input)} → an empty frozen object`, async () => {
      const { settingsSnapshot } = await subject()
      const snap = settingsSnapshot(input)
      assert.deepEqual({ ...snap }, {})
      assert.equal(Object.keys(snap).length, 0)
      assert.ok(Object.isFrozen(snap))
    })
  }
  caseTest('LS-EP-01', 6, 'a snapshot is taken once: a later commit into the reference does not change it', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    const first = row.runs[0].settings
    await w.update(row, plainConfig(ROW.next))
    assert.equal(first.count, ROW.initial, 'the first snapshot keeps the value of its run')
    assert.equal(row.runs.at(-1).settings.count, ROW.next)
  })

  // ============================================================================================
  // runWithSettings: first run

  caseTest('LS-UC-01', 1, 'the first run: body(scope, settings) once, with the row\'s values, as a child plugin of the row', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount({ ...plainConfig(ROW.initial), label: ROW.label })
    assert.equal(row.applies, 1)
    assert.equal(row.runs.length, 1, 'one run: ' + show(row.runs.map(valuesOf)))
    assert.deepEqual(valuesOf(row.runs[0]), { count: ROW.initial, label: ROW.label, mode: ROW.ordinaryDefault })
    assert.ok(Object.isFrozen(row.runs[0].settings), 'the settings are frozen')
    const scope = row.runs[0].scope
    assert.notEqual(scope, row.applyCtx, 'the scope is not the row context itself')
    assert.notEqual(scope.fiber, row.applyCtx.fiber, 'the body runs in its own fiber (a child plugin)')
    assert.ok(row.active(), 'the row is active')
  })
  caseTest('LS-UC-01', 2, 'runWithSettings resolves only once an async first run has settled', async (t) => {
    const w = await liveWorld(t)
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const row = await w.mount(plainConfig(ROW.initial), { body: async () => { await gate }, wait: false })
    let settled = false
    row.result.then(() => { settled = true }, () => { settled = true })
    await w.settle()
    assert.equal(settled, false, 'still pending while the body is')
    release()
    await row.result
    assert.equal(settled, true)
  })
  caseTest('LS-UC-01', 3, 'a first run that throws: runWithSettings rejects with that very error', async (t) => {
    const w = await liveWorld(t)
    const failure = new Error('fbtest first run')
    const row = await w.mount(plainConfig(ROW.initial), { body: () => { throw failure }, wait: false })
    const error = await row.result.then(() => undefined, (e) => e)
    assert.equal(error, failure)
  })
  caseTest('LS-UC-01', 4, 'a first run that rejects asynchronously: runWithSettings rejects with that error', async (t) => {
    const w = await liveWorld(t)
    const failure = new Error('fbtest async first run')
    const row = await w.mount(plainConfig(ROW.initial), { body: async () => { await w.settle(); throw failure }, wait: false })
    assert.equal(await row.result.then(() => undefined, (e) => e), failure)
  })

  // ============================================================================================
  // runWithSettings: live changes

  caseTest('LS-ST-01', 1, 'a volatile-only change: the old child is disposed, then body runs again with the new values; the row is not remounted', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    const fiber = row.fiber()
    await w.update(row, { ...plainConfig(ROW.next), label: ROW.label })
    assert.equal(row.runs.length, 2, show(row.runs.map(valuesOf)))
    assert.deepEqual(valuesOf(row.runs[1]), { count: ROW.next, label: ROW.label, mode: ROW.ordinaryDefault })
    assert.deepEqual(row.log, ['run ' + ROW.initial, 'dispose ' + ROW.initial, 'run ' + ROW.next], 'the old effects are disposed before the new run')
    assert.equal(row.applies, 1, 'apply did not run again (no remount)')
    assert.equal(row.fiber(), fiber, 'same row fiber')
    assert.ok(row.active(), 'the row fiber stayed active')
    assert.notEqual(row.runs[1].scope.fiber, row.fiber(), 'the re-run is a child of the row too')
  })
  caseTest('LS-ST-01', 2, 'every effect of the old run is disposed, not just one', async (t) => {
    const w = await liveWorld(t)
    const disposed = []
    const body = (scope, settings) => { for (const k of [1, 2, 3]) scope.effect(() => () => disposed.push(settings.count + ':' + k)) }
    const row = await w.mount(plainConfig(ROW.initial), { body })
    await w.update(row, plainConfig(ROW.next))
    assert.deepEqual([...disposed].sort(), [1, 2, 3].map((k) => ROW.initial + ':' + k))
  })
  caseTest('LS-ST-01', 3, 'successive changes: each re-run gets the latest values and disposes only its predecessor', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.min))
    for (let v = ROW.min + 1; v <= ROW.min + 3; v++) await w.update(row, plainConfig(v))
    assert.deepEqual(row.runs.map((r) => r.settings.count), [1, 2, 3, 4])
    assert.deepEqual(row.log.filter((l) => l.startsWith('dispose')), ['dispose 1', 'dispose 2', 'dispose 3'])
    assert.equal(row.applies, 1)
    assert.ok(row.active())
  })
  caseTest('LS-ST-01', 4, 'unsetting a volatile field re-runs with it undefined', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount({ ...plainConfig(ROW.initial), label: ROW.label })
    await w.update(row, plainConfig(ROW.initial))
    assert.equal(row.runs.length, 2)
    assert.equal(row.runs[1].settings.label, undefined)
    assert.equal(row.applies, 1)
  })
  caseTest('LS-ST-01', 5, 'disposing the row disposes the live child; no run follows', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    await w.update(row, plainConfig(ROW.next))
    await w.disable(row)
    assert.equal(row.log.at(-1), 'dispose ' + ROW.next)
    assert.equal(row.runs.length, 2)
  })

  // ============================================================================================
  // BVA: the schema's bounds decide whether a change is applied

  for (const [part, value, applied] of [
    [1, ROW.min - 1, false], [2, ROW.min, true], [3, ROW.max, true], [4, ROW.max + 1, false],
  ]) {
    caseTest('LS-BVA-01', part, `count ${value} (min ${ROW.min}, max ${ROW.max}): ${applied ? 're-run with it' : 'refused by the Loader: no re-run, old values stay'}`, async (t) => {
      const w = await liveWorld(t)
      const start = ROW.initial
      const row = await w.mount(plainConfig(start))
      await w.update(row, plainConfig(value))
      if (applied) {
        assert.equal(row.runs.length, 2)
        assert.equal(row.runs[1].settings.count, value)
      } else {
        assert.equal(row.runs.length, 1, 'no re-run: ' + show(row.runs.map(valuesOf)))
        assert.equal(row.log.filter((l) => l.startsWith('dispose')).length, 0, 'the running child was not disposed')
        await w.update(row, { ...plainConfig(start), label: ROW.label })
        assert.equal(row.runs.at(-1).settings.count, start, 'the old value stands for the next run')
      }
      assert.equal(row.applies, 1)
      assert.ok(row.active())
    })
  }
  caseTest('LS-BVA-01', 5, 'a non-integer count (natural) is refused: no re-run', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    await w.update(row, plainConfig(ROW.initial + 0.5))
    assert.equal(row.runs.length, 1)
  })

  // ============================================================================================
  // DT: change kind × body outcome

  caseTest('LS-DT-01', 1, 'a re-run whose body throws: the row is restarted (apply runs again) and comes up with the new value', async (t) => {
    const w = await liveWorld(t)
    let thrown = false
    const body = (scope, settings) => {
      if (settings.count === ROW.failMarker && !thrown) { thrown = true; throw new Error('fbtest re-run failure') }
    }
    const row = await w.mount(plainConfig(ROW.initial), { body })
    await w.update(row, plainConfig(ROW.failMarker))
    assert.ok(thrown, 'the re-run ran')
    assert.equal(row.applies, 2, 'the row was restarted: its apply ran again')
    assert.equal(row.runs.at(-1).settings.count, ROW.failMarker, 'the restarted row runs with the new value')
    assert.ok(row.active(), 'the restarted row is active')
  })
  caseTest('LS-DT-01', 2, 'a re-run whose async body rejects: the row is restarted too', async (t) => {
    const w = await liveWorld(t)
    let thrown = false
    const body = async (scope, settings) => {
      await new Promise((resolve) => setImmediate(resolve))
      if (settings.count === ROW.failMarker && !thrown) { thrown = true; throw new Error('fbtest async re-run failure') }
    }
    const row = await w.mount(plainConfig(ROW.initial), { body })
    await w.update(row, plainConfig(ROW.failMarker))
    assert.ok(thrown)
    assert.equal(row.applies, 2)
  })
  caseTest('LS-DT-01', 3, 'an ordinary (non-volatile) change remounts the row: apply runs again with the new values', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    await w.update(row, { ...plainConfig(ROW.next), mode: ROW.ordinary })
    assert.equal(row.applies, 2)
    assert.deepEqual(valuesOf(row.runs.at(-1)), { count: ROW.next, label: undefined, mode: ROW.ordinary })
    assert.ok(row.log.includes('dispose ' + ROW.initial), 'the old run was disposed with the old row')
  })
  caseTest('LS-DT-01', 4, 'a change that leaves every value equal: no re-run', async (t) => {
    const w = await liveWorld(t)
    const row = await w.mount(plainConfig(ROW.initial))
    await w.update(row, plainConfig(ROW.initial))
    assert.equal(row.runs.length, 1)
  })

  // ============================================================================================
  // EP: whose change it is

  caseTest('LS-EP-02', 1, 'a live change of one row re-runs only that row, not another row using runWithSettings', async (t) => {
    const w = await liveWorld(t)
    const a = await w.mount(plainConfig(ROW.initial))
    const b = await w.mount(plainConfig(ROW.initial), { name: ROW.other })
    await w.update(a, plainConfig(ROW.next))
    assert.equal(a.runs.length, 2)
    assert.equal(b.runs.length, 1, 'the other row was not re-run')
    assert.deepEqual(b.log, ['run ' + ROW.initial])
  })
}
