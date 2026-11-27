/**
 * The running sessions re-read while a Fishball page watches (the image-loop branch, requirements
 * S1–S8 relayed by the lead 2026-11-22). The connector sends no event when a managed session starts
 * running, so core re-reads each connected target's `sessions_list` every
 * `TARGET_SESSIONS.watchIntervalMs` (15000 ms) while at least one page holds core's page stream
 * (GET /api/fishball/page/events) open. Rules under test:
 * - S1/S2 a session that starts / stops by itself enters / leaves the list within one interval;
 * - S3 the first stream opening (watching false → true) reads once at once;
 * - S4 no page → no timer read (no `watch`, or not watching, or the last stream closed);
 * - S5 several streams: one read per interval per target;
 * - S6 a target off a connection is not read; its list stays `null`;
 * - S7 the earlier triggers and the one-in-flight coalescing hold with the poll;
 * - S8 the page stream stays the one route (no new connection or event type);
 * - the default timer is unref'd (never keeps the process alive); dispose stops everything.
 * Techniques: ST (watching × connection transitions, dispose), BVA (14999 / 15000 ms, 0 / 1 / 3
 * streams, 1 / 2 targets), EP (watch absent / idle / watching), DT (watching × connected → reads).
 * Levels: unit on `targets/sessions.js` with a scripted link, a scripted `watch` and injected
 * timers; unit on core's page stream (`page/stream.js`) as the `watch`; `createTargets` over
 * scripted links with node:test's mock clock. The system row (core + fishball-ui) is an integration row.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importBound } from 'fishball-test-helpers/bind'
import { caseName } from 'fishball-test-helpers/cases'
import { MCP } from '../support/targets-oracle.mjs'
import { linkScope } from './running-sessions-link.mjs'
import { ROW_MS, coreFile, listed, session, settle, targetsWorld, unit } from './running-sessions.mjs'

// TARGET_SESSIONS is core's own constant (src/targets/constants.js); the BVA row checks it against the requirement's 15000 ms.
const { TARGET_SESSIONS } = await importBound(coreFile('targets', 'constants.js'))
const E = MCP.eventTypes
const W = Object.freeze({
  /** S1: the interval the requirement fixes. */
  intervalMs: 15000,
  route: '/api/fishball/page/events',
  query: '?lang=en&tz=UTC',
  secondTarget: 'https://c.example/api/agent/mcp',
})

/** A scripted `watch`: `set(v)` changes `watching()` and tells every listener. */
function fakeWatch(initial = false) {
  let on = initial
  const fns = new Set()
  return {
    watch: Object.freeze({ watching: () => on, onWatch(fn) { fns.add(fn); return () => { fns.delete(fn) } } }),
    set(v) { on = v; for (const fn of [...fns]) fn(v) },
    listeners: () => fns.size,
  }
}

/** Injected timers: `armed` every setInterval, `live()` the uncleared, `tick()` one interval of each. */
function fakeTimers() {
  const armed = []
  return {
    armed,
    live: () => armed.filter((h) => !h.cleared),
    tick() { for (const h of armed.filter((x) => !x.cleared)) h.fn() },
    timers: Object.freeze({
      setInterval(fn, ms) { const h = { fn, ms, cleared: false }; armed.push(h); return h },
      clearInterval(h) { if (h) h.cleared = true },
    }),
  }
}

/** A unit with a scripted watch and timers; `connect` connects and answers the connect read with `[]`. */
async function watched({ watching = false, connect = true, before } = {}) {
  const w = fakeWatch(watching)
  const clock = fakeTimers()
  const u = await unit({ watch: w.watch, timers: clock.timers }, before)
  if (connect) { u.s.connect(); u.s.answer(u.s.calls.length - 1, listed()); await settle() }
  return { ...u, w, clock }
}
const answerLast = async (s, value) => { s.answer(s.calls.length - 1, value); await settle() }
const ids = (list) => list?.map((x) => x.sessionId)

/** Core's page stream on a scripted route table; `open()` one GET of the stream, `close()` / `cancel()` it. */
async function pageStream() {
  const { createPageStream } = await importBound(coreFile('page', 'stream.js'))
  const routes = []
  const ctx = { connection: { fetch: { register(route) { routes.push(route); return async () => {} } } } }
  const page = createPageStream(ctx, { warn() {} })
  async function open() {
    const abort = new AbortController()
    const res = await routes[0].fetch(new Request('http://127.0.0.1' + W.route + W.query, { signal: abort.signal }))
    const reader = res.body.getReader()
    return { res, abort: () => abort.abort(), cancel: () => reader.cancel() }
  }
  return { page, routes, open }
}

export function registerRunningSessionsWatchCases() {
  const row = (name, fn) => test(caseName('SESSIONS-WATCH', '', name), { timeout: ROW_MS }, fn)

  // ---------------------------------------------------------------- the constant (BVA)
  row('BVA TARGET_SESSIONS.watchIntervalMs is 15000 and the poll is armed with it', async () => {
    assert.equal(TARGET_SESSIONS.watchIntervalMs, W.intervalMs)
    const { w, clock } = await watched()
    w.set(true)
    assert.deepEqual(clock.live().map((h) => h.ms), [W.intervalMs])
  })

  // ---------------------------------------------------------------- S1 / S2 (ST)
  row('ST S1 a session that starts by itself appears after one interval; S2 it leaves after one more', async () => {
    const { s, read, w, clock, changes } = await watched()
    w.set(true)
    await answerLast(s, listed())
    assert.deepEqual(read.list(), [])
    const before = s.calls.length
    clock.tick()
    assert.equal(s.calls.length, before + 1, 'the interval did not read')
    assert.deepEqual(s.calls.at(-1).args, { limit: 100 })
    const changed = changes.n
    await answerLast(s, listed(session('a', true, 'Started alone'), session('idle', false)))
    assert.deepEqual(JSON.parse(JSON.stringify(read.list())), [{ sessionId: 'a', title: 'Started alone' }])
    assert.equal(changes.n, changed + 1, 'the new session did not fire onChange')
    clock.tick()
    await answerLast(s, listed(session('a', false)))
    assert.deepEqual(read.list(), [], 'the stopped session stayed')
    assert.equal(changes.n, changed + 2)
  })
  row('ST an unchanged answer of an interval read fires no onChange', async () => {
    const { s, w, clock, changes } = await watched()
    w.set(true); await answerLast(s, listed(session('a', true)))
    const n = changes.n
    for (let i = 0; i < 3; i++) { clock.tick(); await answerLast(s, listed(session('a', true))) }
    assert.equal(changes.n, n)
  })

  // ---------------------------------------------------------------- S3 (ST)
  row('ST S3 watching false → true reads once at once, before any interval', async () => {
    const { s, w } = await watched()
    const before = s.calls.length
    w.set(true)
    assert.equal(s.calls.length, before + 1, 'no read when the page started watching')
  })
  row('ST S3 watching true → false → true reads at once again; still one live interval', async () => {
    const { s, w, clock } = await watched()
    w.set(true); await answerLast(s, listed())
    w.set(false)
    assert.equal(clock.live().length, 0, 'the poll outlived the last page')
    const before = s.calls.length
    w.set(true)
    assert.equal(s.calls.length, before + 1)
    assert.equal(clock.live().length, 1)
  })
  row('ST watching at creation, not yet connected: no read until connect; connect reads once; the interval then reads', async () => {
    const { s, clock } = await watched({ watching: true, connect: false })
    clock.tick()
    assert.equal(s.calls.length, 0, 'read while not connected')
    s.connect()
    assert.equal(s.calls.length, 1, 'connect did not read exactly once')
    await answerLast(s, listed())
    clock.tick()
    assert.equal(s.calls.length, 2, 'the interval armed at creation did not read')
  })

  // ---------------------------------------------------------------- S4 (EP, ST)
  row('EP S4 no watch: no timer is armed and nothing reads over time', async () => {
    const clock = fakeTimers()
    const { s } = await unit({ timers: clock.timers })
    s.connect(); await answerLast(s, listed())
    clock.tick(); clock.tick()
    assert.equal(clock.armed.length, 0, 'a timer was armed without a watch')
    assert.equal(s.calls.length, 1)
  })
  row('EP S4 a watch that is not watching: nothing reads over time', async () => {
    const { s, clock } = await watched()
    for (let i = 0; i < 3; i++) clock.tick()
    assert.equal(clock.live().length, 0, 'a timer is live while no page watches')
    assert.equal(s.calls.length, 1, 'read with no page watching')
  })
  row('ST S4 watching true → false stops the poll: no more reads over time', async () => {
    const { s, w, clock } = await watched()
    w.set(true); await answerLast(s, listed())
    clock.tick(); await answerLast(s, listed())
    const n = s.calls.length
    w.set(false)
    assert.equal(s.calls.length, n, 'stopping read')
    for (let i = 0; i < 3; i++) clock.tick()
    assert.equal(s.calls.length, n, 'read after the last page closed')
  })

  // ---------------------------------------------------------------- S6 (DT watching × connected)
  for (const [label, act] of [
    ['never connected', async () => watched({ connect: false })],
    ['dropped', async () => { const u = await watched(); u.s.drop(); return u }],
  ]) {
    row(`DT S6 watching, link ${label}: no read at the start or over time; list stays null`, async () => {
      const u = await act()
      const n = u.s.calls.length
      u.w.set(true)
      for (let i = 0; i < 3; i++) u.clock.tick()
      assert.equal(u.s.calls.length, n, 'a target off a connection was read')
      assert.equal(u.read.list(), null)
    })
  }
  row('ST S6 watching: a drop pauses the reads, a reconnect reads once and the interval resumes', async () => {
    const { s, read, w, clock } = await watched()
    w.set(true); await answerLast(s, listed(session('a', true)))
    s.drop()
    assert.equal(read.list(), null)
    const n = s.calls.length
    clock.tick()
    assert.equal(s.calls.length, n)
    s.connect()
    assert.equal(s.calls.length, n + 1)
    await answerLast(s, listed(session('b', true)))
    clock.tick()
    assert.equal(s.calls.length, n + 2, 'the interval did not resume after the reconnect')
    await answerLast(s, listed())
    assert.deepEqual(read.list(), [])
  })

  // ---------------------------------------------------------------- S7 (ST)
  row('ST S7 intervals during a call in flight: one call at a time, exactly one more after it', async () => {
    const { s, read, w, clock } = await watched()
    w.set(true)
    const n = s.calls.length
    for (let i = 0; i < 4; i++) clock.tick()
    s.page(E.turnFinished)
    assert.equal(s.calls.length, n, 'more than one call in flight')
    await answerLast(s, listed(session('a', true)))
    assert.equal(s.calls.length, n + 1, 'not exactly one follow-up')
    await answerLast(s, listed(session('a', true), session('b', true)))
    assert.equal(s.calls.length, n + 1)
    assert.deepEqual(ids(read.list()), ['a', 'b'])
  })
  row('ST S7 with a watching page, the earlier triggers still read (refreshOn page, answered session call)', async () => {
    const { s, read, w } = await watched()
    w.set(true); await answerLast(s, listed())
    for (const type of TARGET_SESSIONS.refreshOn) { const n = s.calls.length; s.page(type); assert.equal(s.calls.length, n + 1, type); await answerLast(s, listed()) }
    for (const tool of TARGET_SESSIONS.refreshAfter) { const n = s.calls.length; read.called(tool); assert.equal(s.calls.length, n + 1, tool); await answerLast(s, listed()) }
  })
  row('EP S7 an interval read that fails keeps the last list and logs a code only', async () => {
    const { s, read, w, clock, warns } = await watched()
    w.set(true); await answerLast(s, listed(session('a', true)))
    clock.tick()
    s.fail(s.calls.length - 1, Object.assign(new Error('fbtest secret text'), { code: 'ECONNRESET' })); await settle()
    assert.deepEqual(ids(read.list()), ['a'])
    assert.equal(warns.length, 1)
    assert.equal(JSON.stringify(warns[0]).includes('fbtest secret text'), false)
    assert.ok(warns[0].includes('ECONNRESET'))
  })

  // ---------------------------------------------------------------- dispose (ST)
  row('ST dispose while watching: the interval is cleared, the watch listener removed, nothing reads', async () => {
    const { s, read, w, clock } = await watched()
    w.set(true); await answerLast(s, listed())
    read.dispose()
    assert.equal(clock.live().length, 0, 'the interval outlived dispose')
    assert.equal(w.listeners(), 0, 'the watch listener stayed')
    const n = s.calls.length
    w.set(false); w.set(true)
    for (const h of clock.armed) h.fn()
    assert.equal(s.calls.length, n, 'read after dispose')
  })

  // ---------------------------------------------------------------- default timers (unref)
  row('EP the default timer is unref\'d: a watching read keeps no active timer', async () => {
    const timeouts = () => process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length
    const w = fakeWatch()
    const before = timeouts()
    const { s, read } = await unit({ watch: w.watch })
    s.connect(); await answerLast(s, listed())
    w.set(true); await answerLast(s, listed())
    try { assert.equal(timeouts(), before, 'a ref\'d timer keeps the process alive') } finally { read.dispose() }
  })

  // ---------------------------------------------------------------- core's page stream as the watch (S3, S4, S5, S8)
  row('ST page stream: watching() and onWatch follow the first open and the last close only', async () => {
    const p = await pageStream()
    const told = []
    p.page.onWatch((v) => told.push(v))
    assert.equal(p.page.watching(), false)
    const a = await p.open()
    assert.equal(a.res.status, 200)
    assert.deepEqual(told, [true]); assert.equal(p.page.watching(), true)
    const b = await p.open(); const c = await p.open()
    assert.deepEqual(told, [true], 'a second stream told the watchers again')
    a.abort(); b.cancel(); await settle()
    assert.deepEqual(told, [true], 'a stream other than the last told the watchers')
    assert.equal(p.page.watching(), true)
    c.abort(); await settle()
    assert.deepEqual(told, [true, false])
    assert.equal(p.page.watching(), false)
    const d = await p.open()
    assert.deepEqual(told, [true, false, true])
    d.cancel(); await settle()
    assert.deepEqual(told, [true, false, true, false])
    await p.page.dispose()
  })
  row('ST page stream: dispose closes every stream and tells watching false once', async () => {
    const p = await pageStream()
    const told = []
    p.page.onWatch((v) => told.push(v))
    await p.open(); await p.open()
    await p.page.dispose()
    assert.deepEqual(told, [true, false])
    assert.equal(p.page.watching(), false)
  })
  row('EP S8 page stream: one route, GET /api/fishball/page/events, the same with sessions watching', async () => {
    const p = await pageStream()
    const clock = fakeTimers()
    await unit({ watch: p.page, timers: clock.timers })
    assert.equal(p.routes.length, 1)
    assert.equal(p.routes[0].path, W.route)
    assert.deepEqual(p.routes[0].methods, ['GET'])
    await p.page.dispose()
  })
  for (const streams of [1, 3]) {
    row(`BVA S5 ${streams} open page stream(s): one interval, one read per interval`, async () => {
      const p = await pageStream()
      const clock = fakeTimers()
      const { s } = await unit({ watch: p.page, timers: clock.timers })
      s.connect(); await answerLast(s, listed())
      const open = []
      for (let i = 0; i < streams; i++) open.push(await p.open())
      assert.equal(s.calls.length, 2, 'the first stream did not read exactly once at once')
      await answerLast(s, listed())
      assert.equal(clock.live().length, 1, 'one interval per stream')
      clock.tick(); await answerLast(s, listed())
      assert.equal(s.calls.length, 3, 'more than one read for one interval')
      for (const o of open) o.abort()
      await settle()
      assert.equal(clock.live().length, 0, 'S4 the poll outlived the last stream')
      clock.tick()
      assert.equal(s.calls.length, 3)
      await p.page.dispose()
    })
  }

  // ---------------------------------------------------------------- createTargets with the mock clock (BVA 14999 / 15000, S5 per target)
  row('BVA createTargets: 14999 ms reads nothing, 15000 ms reads each connected target once; the snapshot follows', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const links = []
    await linkScope.run({ links }, async () => {
      const w = fakeWatch()
      const world = await targetsWorld(t, links, { watch: w.watch })
      const second = await world.controller.service.add(W.secondTarget)
      assert.equal(second.ok, true, JSON.stringify(second))
      const [a, b] = links
      a.connect(); b.connect()
      a.answer(0, listed()); b.answer(0, listed()); await settle()
      w.set(true)
      assert.deepEqual([a.calls.length, b.calls.length], [2, 2], 'S3 not one read per target at once')
      a.answer(1, listed()); b.answer(1, listed()); await settle()
      t.mock.timers.tick(W.intervalMs - 1)
      assert.deepEqual([a.calls.length, b.calls.length], [2, 2], 'read before one interval')
      t.mock.timers.tick(1)
      assert.deepEqual([a.calls.length, b.calls.length], [3, 3], 'not one read per target at the interval')
      const count = world.emitted.length
      a.answer(2, listed(session('x', true, 'By itself'))); b.answer(2, listed()); await settle()
      assert.deepEqual(JSON.parse(JSON.stringify(world.view().runningSessions)), [{ sessionId: 'x', title: 'By itself' }])
      assert.ok(world.emitted.length > count, 'no snapshot for the new session')
      b.drop()
      t.mock.timers.tick(W.intervalMs)
      assert.deepEqual([a.calls.length, b.calls.length], [4, 3], 'S6 a dropped target was read')
      a.answer(3, listed()); await settle()
      w.set(false)
      t.mock.timers.tick(W.intervalMs * 3)
      assert.deepEqual([a.calls.length, b.calls.length], [4, 3], 'S4 read with no page watching')
    })
  })
  row('EP createTargets without a watch: no interval read over time', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const links = []
    await linkScope.run({ links }, async () => {
      const world = await targetsWorld(t, links)
      world.link.connect(); world.link.answer(0, listed()); await settle()
      t.mock.timers.tick(W.intervalMs * 4)
      assert.equal(world.link.calls.length, 1)
    })
  })

  // SYS S1–S4 (a real DSH with core + fishball-ui, the strip topic read from the page stream) is an
  // integration row: it needs fishball-ui installed beside core.
}
