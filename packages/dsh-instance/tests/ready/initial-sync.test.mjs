/**
 * The one automatic model-list sync of a newly created child (README "Model sync": "Once,
 * automatically, at first install … The marker initial-model-sync.json sits in the runtime folder, so
 * a reinstall syncs again. A refused check or add writes no marker and is tried at the next start. It
 * never affects the start."; createInitialSync JSDoc: `run` resolves true once the marker is written
 * or was there, false after a refusal, never rejects; concurrent calls share one run; codes only in
 * the log).
 *
 * Techniques: decision table (marker × check × missing count × add), BVA on the missing count
 * (0/1/many), EP on thrown errors, state transitions (no marker → refused → marker → restart;
 * concurrency; reinstall), and one use case over the real host row (the sync runs after ready and
 * the start does not wait for it).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { INITSYNC as C } from './constants.mjs'
import { initialSyncOf } from './subject.mjs'
import { rowWorld, gate } from './row.mjs'
import { until } from './wait.mjs'

/**
 * One sync world: a scratch runtime folder, a scripted model sync (`check`, `add`; the defaults
 * answer a successful check listing `count` missing providers and an add whose items take
 * `outcomes` in turn), and a recorded warn.
 */
async function world(t, sdk, { count = 1, marker = false, check, add, outcomes = ['added'] } = {}) {
  const root = tempRoot(cleanups(t), C.prefix)
  const file = path.join(root, C.file)
  const { createInitialSync } = await initialSyncOf(sdk)
  const missing = C.providers.slice(0, count)
  const calls = { check: 0, add: [], warn: [] }
  const goodCheck = { ok: true, result: { checkId: C.checkId, missing, notOffered: [], present: [] } }
  const goodAdd = { ok: true, result: { items: missing.map((p, i) => ({ id: p.id, outcome: outcomes[i % outcomes.length], reason: C.privateText })) } }
  const sync = {
    async check() { calls.check += 1; return check ? check() : goodCheck },
    async add(value) { calls.add.push(value); return add ? add(value) : goodAdd },
  }
  const make = () => createInitialSync({ sync, codes: C.codes, root: () => root, warn: (...args) => calls.warn.push(args) })
  if (marker) fs.writeFileSync(file, JSON.stringify({ format: 1 }))
  return { runner: make(), make, calls, file, missing, goodCheck }
}
/** The warnings are exactly `codes`, one line each, and none carries a provider's private text. */
function warnedCodes(w, codes) {
  assert.deepEqual(w.calls.warn.map((args) => args.at(-1)), codes)
  assert.equal(JSON.stringify(w.calls.warn).includes(C.privateText), false, 'private text in the log')
}
/** One add, of exactly every missing id, under the check's id. */
const addedAll = (w) => assert.deepEqual(w.calls.add, [{ checkId: C.checkId, ids: w.missing.map((p) => p.id) }])
const refused = (code) => ({ ok: false, error: { code, message: C.privateText } })
const throwing = (code) => () => { throw Object.assign(new Error(C.privateText), code ? { code } : {}) }
const markerWritten = (w) => fs.existsSync(w.file)

eachSdk((sdk) => {
  caseTest(sdk, 'INITSYNC-DT-01', 'existing', 'marker suppresses even a failing check across new coordinator instances', async (t) => {
    const w = await world(t, sdk, { marker: true, check: throwing(C.thrown) })
    const before = fs.readFileSync(w.file, 'utf8')
    assert.equal(await w.runner.run(), true)
    assert.equal(await w.make().run(), true)
    assert.equal(w.calls.check, 0)
    assert.deepEqual(w.calls.add, [])
    assert.equal(fs.readFileSync(w.file, 'utf8'), before)
    warnedCodes(w, [])
  })
  caseTest(sdk, 'INITSYNC-DT-02', 'check-refused', 'refused check stops before add and leaves no marker', async (t) => {
    const w = await world(t, sdk, { check: () => refused(C.refused) })
    assert.equal(await w.runner.run(), false)
    assert.equal(w.calls.check, 1)
    assert.deepEqual(w.calls.add, [])
    assert.equal(markerWritten(w), false)
    warnedCodes(w, [C.refused])
  })
  for (const count of C.counts) {
    caseTest(sdk, 'INITSYNC-DT-03', count, 'successful check with 0/1/many missing providers adds exactly all ids or skips add', async (t) => {
      const w = await world(t, sdk, { count })
      assert.equal(await w.runner.run(), true)
      assert.equal(w.calls.check, 1)
      if (count > 0) addedAll(w)
      else assert.deepEqual(w.calls.add, [])
      assert.equal(markerWritten(w), true)
      warnedCodes(w, [])
    })
  }
  for (const count of C.counts.filter(Boolean)) {
    caseTest(sdk, 'INITSYNC-DT-04', count, 'refused add leaves no marker and logs only its code', async (t) => {
      const w = await world(t, sdk, { count, add: () => refused(C.addRefused) })
      assert.equal(await w.runner.run(), false)
      assert.equal(w.calls.check, 1)
      addedAll(w)
      assert.equal(markerWritten(w), false)
      warnedCodes(w, [C.addRefused])
    })
  }
  for (const outcome of C.outcomes) {
    caseTest(sdk, 'INITSYNC-DT-05', outcome, 'successful add records completion even for failed provider items', async (t) => {
      const w = await world(t, sdk, { outcomes: [outcome] })
      assert.equal(await w.runner.run(), true)
      addedAll(w)
      assert.equal(markerWritten(w), true)
      warnedCodes(w, outcome === C.codes.outcomeFailed ? [C.codes.outcomeFailed] : [])
      // Done once: a later run checks and adds nothing more.
      assert.equal(await w.runner.run(), true)
      assert.equal(w.calls.check, 1)
      assert.equal(w.calls.add.length, 1)
    })
  }
  caseTest(sdk, 'INITSYNC-DT-06', 'mixed-items', 'all offered ids are submitted once despite mixed per-provider outcomes', async (t) => {
    const w = await world(t, sdk, { count: C.providers.length, outcomes: C.outcomes })
    assert.equal(await w.runner.run(), true)
    addedAll(w)
    warnedCodes(w, [C.codes.outcomeFailed])
    assert.equal(markerWritten(w), true)
  })
  for (const phase of ['check', 'add']) {
    for (const code of [C.thrown, undefined]) {
      caseTest(sdk, 'INITSYNC-EP-01', `${phase}-${code ?? 'uncoded'}`, 'thrown errors resolve false with code-only diagnostics and no marker', async (t) => {
        const w = await world(t, sdk, { [phase]: throwing(code) })
        assert.equal(await w.runner.run(), false)
        assert.equal(w.calls.check, 1)
        if (phase === 'add') addedAll(w)
        else assert.deepEqual(w.calls.add, [])
        assert.equal(markerWritten(w), false)
        warnedCodes(w, [code ?? C.codes.failed])
      })
    }
  }
  for (const phase of ['check', 'add']) {
    caseTest(sdk, 'INITSYNC-ST-01', phase, 'no marker → refusal → next attempt succeeds → durable marker suppresses later start', async (t) => {
      let fail = true
      const w = await world(t, sdk, { [phase]: () => (fail ? refused(C.refused) : phase === 'check' ? w.goodCheck : { ok: true, result: { items: [] } }) })
      assert.equal(await w.runner.run(), false)
      assert.equal(markerWritten(w), false)
      fail = false
      assert.equal(await w.runner.run(), true)
      assert.equal(markerWritten(w), true)
      const before = structuredClone(w.calls)
      // A later start: a new coordinator over the same runtime folder.
      assert.equal(await w.make().run(), true)
      assert.deepEqual(w.calls, before)
      assert.equal(w.calls.check, 2)
      warnedCodes(w, [C.refused])
    })
  }
  for (const success of [true, false]) {
    caseTest(sdk, 'INITSYNC-ST-02', String(success), 'concurrent run calls share one pending attempt and result', async (t) => {
      const held = gate()
      const w = await world(t, sdk, { count: 0, check: () => held.promise })
      const first = w.runner.run()
      const second = w.runner.run()
      held.open(success ? w.goodCheck : refused(C.refused))
      assert.deepEqual(await Promise.all([first, second]), [success, success])
      assert.equal(w.calls.check, 1)
      assert.deepEqual(w.calls.add, [])
      assert.equal(markerWritten(w), success)
      warnedCodes(w, success ? [] : [C.refused])
    })
  }
  caseTest(sdk, 'INITSYNC-ST-03', 'pending-add', 'marker is absent until the successful add completes', async (t) => {
    const entered = gate()
    const held = gate()
    const w = await world(t, sdk, { add: () => { entered.open(); return held.promise } })
    const result = w.runner.run()
    await entered.promise
    assert.equal(markerWritten(w), false)
    held.open({ ok: true, result: { items: [] } })
    assert.equal(await result, true)
    assert.equal(markerWritten(w), true)
    addedAll(w)
  })
  caseTest(sdk, 'INITSYNC-ST-04', 'reinstall', 'removing runtime marker allows a reinstalled coordinator to sync again', async (t) => {
    const w = await world(t, sdk, { count: 0 })
    assert.equal(await w.runner.run(), true)
    // Uninstall removes the runtime folder, the marker with it (README "Model sync").
    fs.unlinkSync(w.file)
    assert.equal(await w.make().run(), true)
    assert.equal(w.calls.check, 2)
    assert.equal(markerWritten(w), true)
    warnedCodes(w, [])
  })

  // ---------------------------------------------------------------- the host row: after ready, not awaited
  caseTest(sdk, 'INITSYNC-WIRE-01', 'start', 'start schedules automatic sync after ready without awaiting it', async (t) => {
    const scope = cleanups(t)
    const home = path.join(tempRoot(scope), 'home')
    fs.mkdirSync(home, { mode: 0o700 })
    const row = await rowWorld(scope, sdk, home)
    await row.apply()
    row.fireReady()
    // The sync's first step reads the main DSH's providers; that read is held open below.
    await row.providersRead
    await until(() => row.service().status().state === 'ready')
    assert.deepEqual(row.providerReads, ['ready'], 'the automatic sync ran before the child was ready')
    assert.equal(row.world.calls.start, 1)
    // The start is finished while the sync still waits: it never held the start up.
    assert.equal(row.service().status().state, 'ready')
    assert.equal(fs.existsSync(path.join(home, 'fishball', 'runtime', C.file)), false, 'the marker before the sync finished')
  })
})
