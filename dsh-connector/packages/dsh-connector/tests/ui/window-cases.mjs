/**
 * WINDOWS rows of the connector's UI backend (contract A, 2026-11-21: "entries by window"). The
 * user's requirement: the main DSH's sidebar shows one entry per connected agent that can provide
 * a Fishball UI here, decided by capability (a window this DSH can open), not by identity. The
 * backend's part: `service.offerWindows(source)` and the snapshot's `windows`, one
 * `{key, name, id}` per `handover.principals()` row that is enabled, paired and online and whose
 * pair (`pairs.byPrincipal(row.key)`) has an entry key some offered source claims, in principals()
 * order. Written from the requirement and the contract only; nothing under src/ui/ was read.
 *
 * Techniques: Use case (one agent gets one window), Decision table (enabled × paired × online ×
 * a pair × claimed), EP (identity: a Fishball-named agent no source claims, a non-Fishball one a
 * source claims; nameless; the source's Iterable; invalid sources), BVA (0, 1, 2 windows; the
 * order), State transition (offer, the source's change, dispose, online / offline, rename, close),
 * and a routed level over the real K3 hand-over service of C-ROUTE with its fake pair store.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { until } from 'dsh-connector-test-helpers/wait'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { FIXTURE as ROUTE_FIXTURE } from '../routing/constants.mjs'
import { unit } from './cases.mjs'
import { FIXTURE, SURFACE, WAIT } from './constants.mjs'
import { FakePairStore, row as principalRow, windowSource } from './fakes.mjs'
import { routedBackend } from './world.mjs'

const ID = Object.freeze({ uc: 'WIN-UC-01', dt: 'WIN-DT-01', ep: 'WIN-EP-01', src: 'WIN-EP-02', bva: 'WIN-BVA-01', st: 'WIN-ST-01', routed: 'WIN-UC-02' })
const T = { timeout: WAIT.testMs }
const TR = { timeout: WAIT.routeTestMs }
const row = (sdk, id, part, title, fn, options = T) => test(caseName(sdk, id, part, title), options, fn)
const { p: P, q: Q, d: D, x: X, u: U } = FIXTURE
/** The window a principal is listed as (contract A: key = principalKey, as in targets). */
const win = ({ key, name, id }) => ({ key, name, id })
const quiet = () => new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
const eventually = async (predicate, what) => assert.ok(await until(predicate, WAIT.settleMs, WAIT.pollMs), 'timed out: ' + what)
const on = (p, over = {}) => principalRow(p, { online: true, ...over })

/** A unit world with a pair store; `offer(entries)` offers one source (disposed by `t`) and returns its driver. */
async function windowsWorld(t, sdk) {
  const pairs = new FakePairStore()
  const w = await unit(t, sdk, { pairs })
  const offer = (entries, options) => {
    const s = windowSource(entries, options)
    s.dispose = w.backend.service.offerWindows(s.source)
    t.after(() => s.dispose())
    return s
  }
  return { ...w, pairs, offer, windows: () => w.backend.snapshot().windows }
}

export function registerWindowCases(sdk) {
  // ---------------------------------------------------------------- the use case
  row(sdk, ID.uc, 'main', 'one enabled, paired, online agent whose entry a source claims → windows = [{key, name, id}], frozen; the state route and the stream carry it', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [on(P)] })
    assert.deepEqual(w.windows(), [win(P)])
    assert.ok(Object.isFrozen(w.windows()), 'windows is not frozen')
    const read = await (await w.route('state')).json()
    assert.deepEqual(read.state.windows, [win(P)])
    const { sse } = await w.stream()
    assert.deepEqual((await sse.next()).windows, [win(P)])
  })
  row(sdk, ID.uc, 'E1', 'no source offered → no window, though the agent is connected and paired (no hint entry either)', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.pairs.bind(P)
    w.handover.set({ principals: [on(P)] })
    assert.deepEqual(w.windows(), [])
  })
  row(sdk, ID.uc, 'E2', 'no pair store given (an older wiring) → windows is [], never a failure', async (t) => {
    const w = await unit(t, sdk)
    w.backend.service.offerWindows(windowSource([FIXTURE.strayEntry]).source)
    w.handover.set({ principals: [on(P)] })
    assert.deepEqual(w.backend.snapshot().windows, [])
  })

  // ---------------------------------------------------------------- DT: who gets a window
  // Columns: enabled, paired (row), online, a pair in the store, its entry claimed → listed.
  const RULES = [
    [1, 'enabled, paired, online, claimed', P, on(P), true, true],
    [2, 'offline', P, principalRow(P), true, false],
    [3, 'disabled (still online)', X, on(X, { enabled: false }), true, false],
    [4, 'not paired (the row says so; the store has a pair)', U, on(U, { paired: false }), true, false],
    [5, 'paired row, but the store has no pair for it', P, on(P), 'no-pair', false],
    [6, 'a Fishball by name ("Fishball") whose entry no source claims (no window here)', D, on(D), 'unclaimed', false],
    [7, 'not a Fishball by name ("Planner") whose entry IS claimed (it has a window here)', P, on(P), true, true],
    [8, 'disabled, unpaired and offline', U, principalRow(U, { enabled: false, paired: false }), true, false],
  ]
  for (const [rule, title, p, r, claim, listed] of RULES) {
    row(sdk, ID.dt, 'rule ' + rule, `${title} → ${listed ? 'one window' : 'no window'}`, async (t) => {
      const w = await windowsWorld(t, sdk)
      const entry = claim === 'no-pair' ? FakePairStore.entryOf(p.key) : w.pairs.bind(p)
      w.offer(claim === 'unclaimed' ? [FIXTURE.strayEntry] : [entry])
      w.handover.set({ principals: [r] })
      assert.deepEqual(w.windows(), listed ? [win(p)] : [])
    })
  }
  row(sdk, ID.dt, 'rule 9', 'a source claims an entry nobody is paired under → no window; the other claimed agent still has one', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([FIXTURE.strayEntry, w.pairs.bind(P)])
    w.handover.set({ principals: [on(P), on(D)] })
    w.pairs.bind(D)
    assert.deepEqual(w.windows(), [win(P)])
  })

  // ---------------------------------------------------------------- BVA: 0, 1, 2 and the order
  for (const n of [0, 1, 2]) {
    row(sdk, ID.bva, String(n), `${n} window-capable connected agent(s) beside a connected unclaimed one, a disabled and an offline claimed one → exactly ${n} window(s)`, async (t) => {
      const w = await windowsWorld(t, sdk)
      const capable = [P, Q].slice(0, n)
      w.pairs.bind(D)
      w.offer([...capable, X, U].map((p) => w.pairs.bind(p)))
      w.handover.set({ principals: [on(D), on(X, { enabled: false }), ...capable.map((p) => on(p)), principalRow(U)] })
      assert.deepEqual(w.windows(), capable.map(win))
    })
  }
  row(sdk, ID.bva, 'order', 'windows follow principals() order, not the order the source claims them', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P), w.pairs.bind(Q), w.pairs.bind(D)])
    w.handover.set({ principals: [on(D), on(Q), on(P)] })
    assert.deepEqual(w.windows(), [win(D), win(Q), win(P)])
  })

  // ---------------------------------------------------------------- EP: the window's fields
  row(sdk, ID.ep, 'nameless', 'a nameless agent → its window has name null and its id (the label is the UI\'s)', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(Q)])
    w.handover.set({ principals: [on(Q)] })
    assert.deepEqual(w.windows(), [{ key: Q.key, name: null, id: Q.id }])
  })
  row(sdk, ID.ep, 'shape', 'a window carries exactly key, name and id (no online flag, no entry key)', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [on(P)] })
    assert.deepEqual(Object.keys(w.windows()[0]).sort(), [...SURFACE.windowKeys].sort())
  })

  // ---------------------------------------------------------------- EP: sources
  row(sdk, ID.src, 'iterable', 'entries() may answer any Iterable (a Set) → claimed as an array is', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)], { iterable: 'set' })
    w.handover.set({ principals: [on(P)] })
    assert.deepEqual(w.windows(), [win(P)])
  })
  row(sdk, ID.src, 'union', 'two sources, one entry each → both windows; the same entry claimed by both → one window', async (t) => {
    const w = await windowsWorld(t, sdk)
    const a = w.pairs.bind(P)
    const b = w.pairs.bind(Q)
    w.offer([a])
    w.offer([b, a])
    w.handover.set({ principals: [on(P), on(Q)] })
    assert.deepEqual(w.windows(), [win(P), win(Q)])
  })
  row(sdk, ID.src, 'union dispose', 'an entry two sources claim stays while one of them is left; goes with the last', async (t) => {
    const w = await windowsWorld(t, sdk)
    const a = w.pairs.bind(P)
    const one = w.offer([a])
    const two = w.offer([a])
    w.handover.set({ principals: [on(P)] })
    one.dispose()
    assert.deepEqual(w.windows(), [win(P)])
    two.dispose()
    assert.deepEqual(w.windows(), [])
  })
  const fn = () => {}
  const INVALID = [
    ['undefined', undefined], ['null', null], ['a string', FIXTURE.marker], ['an empty object', {}],
    ['entries only', { entries: () => [] }], ['onChange only', { onChange: () => fn }],
    ['entries not a function', { entries: [], onChange: () => fn }], ['onChange not a function', { entries: () => [], onChange: true }],
  ]
  for (const [title, value] of INVALID) {
    row(sdk, ID.src, 'invalid', `offerWindows(${title}) → TypeError; nothing changes`, async (t) => {
      const w = await windowsWorld(t, sdk)
      const before = w.backend.snapshot()
      assert.throws(() => w.backend.service.offerWindows(value), TypeError)
      assert.deepEqual(w.backend.snapshot(), before)
    })
  }
  row(sdk, ID.src, 'closed', 'after close() offerWindows(a valid source) throws an Error', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.backend.close()
    assert.throws(() => w.backend.service.offerWindows(windowSource([]).source), Error)
  })
  row(sdk, ID.src, 'dispose', 'dispose is idempotent: twice → no throw; the window goes; the source\'s listener is released', async (t) => {
    const w = await windowsWorld(t, sdk)
    const s = w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [on(P)] })
    s.dispose()
    s.dispose()
    assert.deepEqual(w.windows(), [])
    assert.equal(s.listening(), 0, 'the source still has a listener after dispose')
  })

  // ---------------------------------------------------------------- ST: live changes reach the stream
  const seen = (sse, expected, what) => sse.seen((s) => JSON.stringify(s.windows) === JSON.stringify(expected), what)
  row(sdk, ID.st, 'offer → change → dispose', 'no source → [] ; offered → a frame with the window; the source claims nothing (onChange) → a frame with []; claims it again → back; disposed → a frame with []', async (t) => {
    const w = await windowsWorld(t, sdk)
    const entry = w.pairs.bind(P)
    w.handover.set({ principals: [on(P)] })
    const { sse } = await w.stream()
    assert.deepEqual((await sse.next()).windows, [])
    const s = w.offer([entry])
    await seen(sse, [win(P)], 'the offered window')
    s.set([])
    await seen(sse, [], 'the window gone after the source changed')
    s.set([entry])
    await seen(sse, [win(P)], 'the window back after the source changed')
    s.dispose()
    await seen(sse, [], 'the window gone after dispose')
  })
  row(sdk, ID.st, 'online → offline → online', 'the agent comes online → a frame with its window; goes offline → a frame with []; online again → back', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [principalRow(P)] })
    const { sse } = await w.stream()
    assert.deepEqual((await sse.next()).windows, [])
    w.handover.patch(P.key, { online: true })
    await seen(sse, [win(P)], 'the window once online')
    w.handover.patch(P.key, { online: false })
    await seen(sse, [], 'no window once offline')
    w.handover.patch(P.key, { online: true })
    await seen(sse, [win(P)], 'the window once online again')
  })
  row(sdk, ID.st, 'disable / unpair', 'a connected agent with a window → its entry disabled → []; enabled again → back; unpaired → []', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [on(P)] })
    w.handover.patch(P.key, { enabled: false })
    assert.deepEqual(w.windows(), [])
    w.handover.patch(P.key, { enabled: true })
    assert.deepEqual(w.windows(), [win(P)])
    w.handover.patch(P.key, { paired: false })
    assert.deepEqual(w.windows(), [])
  })
  row(sdk, ID.st, 'rename', 'a rename (row and pair) → a frame whose window carries the new name', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P)])
    w.handover.set({ principals: [on(P)] })
    const { sse } = await w.stream()
    await sse.next()
    w.pairs.rename(P.key, FIXTURE.renamed)
    w.handover.patch(P.key, { name: FIXTURE.renamed })
    await seen(sse, [{ ...win(P), name: FIXTURE.renamed }], 'the renamed window')
  })
  row(sdk, ID.st, 'second agent', 'one window → a second capable agent connects → two windows, the first unchanged', async (t) => {
    const w = await windowsWorld(t, sdk)
    w.offer([w.pairs.bind(P), w.pairs.bind(Q)])
    w.handover.set({ principals: [on(P), principalRow(Q)] })
    assert.deepEqual(w.windows(), [win(P)])
    w.handover.patch(Q.key, { online: true })
    assert.deepEqual(w.windows(), [win(P), win(Q)])
  })

  // ---------------------------------------------------------------- routed: the real K3 hand-over service
  const R = FIXTURE.routeIds
  const windowsOf = (b) => b.snapshot().windows
  row(sdk, ID.routed, 'connect / disconnect', 'real hand-over service: a paired agent whose entry is claimed connects → one window {key, name, id}; disconnects → none', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    t.after(backend.service.offerWindows(windowSource([ROUTE_FIXTURE.entry(R.p)]).source))
    const key = w.principal(R.p, { name: FIXTURE.routeNames.p })
    await quiet()
    assert.deepEqual(windowsOf(backend), [], 'a window while offline')
    w.presence.connect(key)
    await eventually(() => windowsOf(backend).length === 1, 'the window once connected')
    assert.deepEqual(windowsOf(backend), [{ key, name: FIXTURE.routeNames.p, id: R.p }])
    w.presence.disconnect(key)
    await eventually(() => windowsOf(backend).length === 0, 'no window once disconnected')
  }, TR)
  row(sdk, ID.routed, 'capability', 'real hand-over service: two connected agents, a Fishball-named one unclaimed and another claimed → only the claimed one has a window', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    t.after(backend.service.offerWindows(windowSource([ROUTE_FIXTURE.entry(R.p)]).source))
    w.principal(R.d, { name: FIXTURE.routeNames.d, connected: true })
    const p = w.principal(R.p, { name: FIXTURE.routeNames.p, connected: true })
    await eventually(() => windowsOf(backend).length > 0, 'a window')
    await quiet()
    assert.deepEqual(windowsOf(backend).map((x) => x.key), [p])
  }, TR)
  row(sdk, ID.routed, 'disable / rename / unpaired', 'real hand-over service: a rename shows in the window; a disabled entry loses it; an unpaired connected entry never has one', async (t) => {
    const { w, backend } = await routedBackend(t, sdk)
    t.after(backend.service.offerWindows(windowSource([ROUTE_FIXTURE.entry(R.p), ROUTE_FIXTURE.entry(R.later)]).source))
    w.principal(R.later, { paired: false, connected: true })
    const p = w.principal(R.p, { name: FIXTURE.routeNames.p, connected: true })
    await eventually(() => windowsOf(backend).length === 1, 'one window')
    assert.equal(windowsOf(backend)[0].key, p, 'the unpaired entry got a window')
    await w.pairs.setName(p, FIXTURE.routeNames.renamed)
    await eventually(() => windowsOf(backend)[0]?.name === FIXTURE.routeNames.renamed, 'the renamed window')
    w.tokens.disable(R.p)
    await eventually(() => windowsOf(backend).length === 0, 'no window once disabled')
  }, TR)
}
