/**
 * fishball-shared's `./instance-follower`: how each amenity (fishball-board, fishball-heartbeat,
 * fishball-taskboard) binds one contribution to a compatible `fishballInstance` and reports a missing
 * core once (README; DESIGN.md §33; extension points §1; R-FB-06). Black box over a real cordis
 * Context of the current DSH (world.mjs): the observations are `binding.attached()`, the instances
 * `attach` is handed, the disposes it returns being called, and `warn`'s calls. Oracles and their
 * sources: constants.mjs. The id index is ../README.md.
 *
 * - FOLLOW-EP-01 / FOLLOW-EP-02: the instance met at load / arriving after load (none, compatible,
 *   older, newer, no apiVersion);
 * - FOLLOW-BVA-01: apiVersion v − 1, v, v + 1 for each version the amenities bind (1 and 2);
 * - FOLLOW-ST-01: the walk present → replaced → removed → present, then FOLLOW-ST-02 one row per
 *   transition (incompatible replacements, unrelated services, a provider still loading, the row's
 *   own disposal);
 * - CORE-MISSING-DT-01: reportCoreMissing's one warning over appReady × core × moment.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { ABSENT_VERSION, API, BOUNDS, PARTITIONS } from './constants.mjs'
import { worldFor } from './world.mjs'

const versionLabel = (v) => (v === ABSENT_VERSION ? 'none' : String(v))

/** Exactly `instance` (or nothing, for null) is attached and live, and attached() says so. */
function assertBound(w, instance, what) {
  assert.equal(w.binding.attached(), instance !== null, what + ': attached()')
  assert.deepEqual(w.live(), instance === null ? [] : [instance], what + ': the live attachment')
  if (instance !== null) assert.equal(w.live()[0], instance, what + ': the same instance object')
}
/** Every attachment so far was disposed exactly once, except the live ones (never disposed). */
function assertDisposedOnce(w, what) {
  assert.deepEqual(w.attaches.filter((a) => a.disposed > 1).map((a) => a.instance.gen), [], what + ': disposed more than once')
}

export function registerInstanceFollowerCases() {
  // ================================================================ FOLLOW-EP-01 / -02: the partitions
  for (const p of PARTITIONS) {
    caseTest('FOLLOW-EP-01', p.row, `at load, ${p.label}: ${p.attached ? 'attached, attach handed that instance once' : 'nothing attached'}`, async (t) => {
      const w = await worldFor(t, { apiVersion: API.current })
      const instance = p.instance === null ? null : await w.provideCore(p.instance)
      await w.loadRow()
      assertBound(w, p.attached ? instance : null, p.label)
      assert.equal(w.attaches.length, p.attached ? 1 : 0, 'attach calls')
    })
    if (p.instance === null) continue
    caseTest('FOLLOW-EP-02', p.row, `arriving after load, ${p.label}: ${p.attached ? 'followed through internal/service and attached' : 'still nothing attached'}`, async (t) => {
      const w = await worldFor(t, { apiVersion: API.current })
      await w.loadRow()
      assertBound(w, null, 'before')
      const instance = await w.provideCore(p.instance)
      assertBound(w, p.attached ? instance : null, p.label)
      assert.equal(w.attaches.length, p.attached ? 1 : 0, 'attach calls')
    })
  }

  // ================================================================ FOLLOW-BVA-01: apiVersion boundaries
  BOUNDS.forEach((b, index) => {
    caseTest('FOLLOW-BVA-01', index + 1, `host apiVersion ${b.host}, instance ${versionLabel(b.instance)}: ${b.attached ? 'attached' : 'not attached'}`, async (t) => {
      const w = await worldFor(t, { apiVersion: b.host })
      const instance = await w.provideCore(b.instance)
      await w.loadRow()
      assertBound(w, b.attached ? instance : null, `${b.host} vs ${b.instance}`)
    })
  })

  // ================================================================ FOLLOW-ST-01: the main walk
  caseTest('FOLLOW-ST-01', 'walk', 'present → replaced → removed → present: each instance attached while it is the live one, each detached exactly once', async (t) => {
    const w = await worldFor(t, { apiVersion: API.current })
    const first = await w.provideCore(API.current)
    await w.loadRow()
    assertBound(w, first, 'present')

    const second = await w.replaceCore(API.current)
    assertBound(w, second, 'replaced')
    assert.equal(w.attaches[0].disposed, 1, 'the replaced instance\'s contribution was disposed')

    await w.removeCore()
    assertBound(w, null, 'removed')
    assert.equal(w.attaches[1].disposed, 1, 'the removed instance\'s contribution was disposed')

    const third = await w.provideCore(API.current)
    assertBound(w, third, 'present again')
    assert.deepEqual(w.attaches.map((a) => a.instance), [first, second, third], 'one attach per instance, in order')
    assertDisposedOnce(w, 'walk')
  })

  // ================================================================ FOLLOW-ST-02: one row per transition
  const TRANSITIONS = [
    ['compatible → older', 'the contribution leaves the old instance; the older one gets nothing', async (w) => {
      await w.provideCore(API.current); await w.loadRow()
      await w.replaceCore(API.board)
      assertBound(w, null, 'older')
      assert.equal(w.attaches[0].disposed, 1)
    }],
    ['older → compatible', 'nothing until the compatible instance arrives, then attached', async (w) => {
      await w.provideCore(API.board); await w.loadRow()
      assertBound(w, null, 'older')
      const next = await w.replaceCore(API.current)
      assertBound(w, next, 'compatible')
    }],
    ['absent → older → removed → compatible', 'only the compatible instance is ever attached (HB-EP-02 row 5)', async (w) => {
      await w.loadRow()
      await w.provideCore(API.board)
      await w.removeCore()
      const next = await w.provideCore(API.current)
      assertBound(w, next, 'compatible')
      assert.equal(w.attaches.length, 1)
    }],
    ['present, another service changes', 'an internal/service event for another name changes nothing', async (w) => {
      const core = await w.provideCore(API.current); await w.loadRow()
      await w.provideOther()
      assertBound(w, core, 'unchanged')
      assert.equal(w.attaches.length, 1, 'no second attach')
      assert.equal(w.attaches[0].disposed, 0, 'not detached')
    }],
    ['loading → active', 'a provider still loading reads as absent; it is attached when it becomes active', async (w) => {
      await w.loadRow()
      const loading = await w.provideLoadingCore(API.current)
      assertBound(w, null, 'loading')
      await loading.finish()
      assertBound(w, loading.instance, 'active')
    }],
    ['row disposed while bound', 'disposing the row disposes the contribution once; a later core change reaches nothing', async (w) => {
      await w.provideCore(API.current); await w.loadRow()
      await w.disposeRow()
      assert.equal(w.attaches[0].disposed, 1, 'disposed with the row')
      await w.replaceCore(API.current)
      await w.removeCore()
      assert.equal(w.attaches.length, 1, 'no attach after the row left')
      assert.equal(w.attaches[0].disposed, 1, 'not disposed twice')
    }],
  ]
  TRANSITIONS.forEach(([from, title, walk], index) => {
    caseTest('FOLLOW-ST-02', index + 1, `${from}: ${title}`, async (t) => {
      const w = await worldFor(t, { apiVersion: API.current })
      await walk(w)
      assertDisposedOnce(w, from)
    })
  })

  // ================================================================ CORE-MISSING-DT-01: the one warning
  /**
   * Decision table: [appReady, core at load, steps after load, warnings expected after the steps].
   * Steps: 'ready' fires app ready; 'core' provides a compatible core; 'older' an older one;
   * 'remove' removes it; 'dispose' disposes the row. `atLoad`: warnings right after load.
   */
  const NONE = null
  const READY = Object.freeze({ none: false, live: true, fired: 'fired' })
  const STEP = Object.freeze({
    ready: (w) => w.ready(),
    core: (w) => w.provideCore(API.current),
    older: (w) => w.provideCore(API.board),
    remove: (w) => w.removeCore(),
    dispose: (w) => w.disposeRow(),
  })
  const RULES = [
    [1, 'no appReady, no core', READY.none, NONE, 1, [], 1],
    [2, 'no appReady, compatible core', READY.none, API.current, 0, [], 0],
    [3, 'no appReady, older core', READY.none, API.board, 1, [], 1],
    [4, 'no appReady, no core, a core arrives later: the line stands, the core is still attached', READY.none, NONE, 1, ['core'], 1],
    [5, 'appReady, no core: nothing at load, one line at ready', READY.live, NONE, 0, ['ready'], 1],
    [6, 'appReady, a core arriving before ready: no line', READY.live, NONE, 0, ['core', 'ready'], 0],
    [7, 'appReady, compatible core at load: no line at ready', READY.live, API.current, 0, ['ready'], 0],
    [8, 'appReady, core removed before ready: one line at ready', READY.live, API.current, 0, ['remove', 'ready'], 1],
    [9, 'appReady, an older core: one line at ready', READY.live, API.board, 0, ['ready'], 1],
    [10, 'appReady already fired (a row enabled after boot), no core: one line at once', READY.fired, NONE, 1, [], 1],
    [11, 'appReady already fired, compatible core: no line', READY.fired, API.current, 0, [], 0],
    [12, 'appReady, row disposed before ready: no line at ready', READY.live, NONE, 0, ['dispose', 'ready'], 0],
    [13, 'appReady, no core, ready, then core events: still one line per load (HB-EP-02 row 5)', READY.live, NONE, 0, ['ready', 'older', 'remove', 'core', 'remove'], 1],
  ]
  for (const [row, title, appReady, core, atLoad, steps, expected] of RULES) {
    caseTest('CORE-MISSING-DT-01', row, `${title}: ${expected} warning(s)`, async (t) => {
      const w = await worldFor(t, { apiVersion: API.current, appReady: appReady !== READY.none, report: true })
      if (appReady === READY.fired) await w.ready()
      if (core !== NONE) await w.provideCore(core)
      await w.loadRow()
      assert.equal(w.warnings, atLoad, 'warnings at load')
      for (const step of steps) await STEP[step](w)
      assert.equal(w.warnings, expected, 'warnings after ' + (steps.join(', ') || 'load'))
      if (steps.at(-1) === 'core') assert.equal(w.binding.attached(), true, 'the late core is attached')
    })
  }
}
