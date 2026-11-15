/**
 * PB: fishball-page `apply` setup unwinding and teardown (R-A, R-A1..R-A3), black-box.
 *
 * The page's classic script is loaded by the existing node:vm harness (page-open-session-page.mjs,
 * `loadPage`) through its `hooks`. This file only wraps the harness's fakes with recorders, so every
 * part the requirement names becomes an observable resource with mount/dispose events on one clock:
 *   stylesheet in `document.adoptedStyleSheets`, `<html data-fishball-page>`, window/document/
 *   navigation listeners, the four store subscriptions, the body MutationObserver and the three slot
 *   contributions. Faults are injected only through those fakes (a fake service method or browser API
 *   throws, or an unsubscribe throws), never by touching client.js.
 *
 * "Surfaces as an uncaught error after the effect returned" is observed by the page's own
 * `queueMicrotask`: the harness's sandbox global is replaced by a recorder that runs the callback on
 * the host microtask queue and keeps whatever it throws (in a browser that is the uncaught error).
 *
 * Techniques: BVA over the failure position in the mount order, EP over the kind of failing API,
 * DT over (setup fails?, which disposers throw), ST for mount → teardown. Each case names its technique.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadPage, settle } from './page-open-session-page.mjs'

const PB = Object.freeze({
  attribute: 'data-fishball-page',
  slot: Object.freeze({ launcher: 'settings.launcher', hero: 'conversation.hero.workspace', overlay: 'shell.overlay' }),
  overlayId: 'fishball-page.navigation',
  event: Object.freeze({ keydown: 'keydown', focus: 'focus', click: 'click', navigate: 'navigate' }),
  sessionReply: Object.freeze({ status: 200, body: Object.freeze({ sessionId: 'session-page-boot-1' }) }),
})

/** Observable resource keys, one per mounted thing the requirement names. */
const KEY = Object.freeze({
  sheet: 'stylesheet',
  attr: 'html-attribute',
  keydown: 'window:keydown',
  catalog: 'sub:shortcuts.catalog',
  uiSession: 'sub:uiSession.adapter.current',
  sessionsList: 'sub:sessions.list',
  focus: 'window:focus',
  observer: 'observer:body',
  locale: 'sub:locale',
  navigate: 'navigation:navigate',
  click: 'document:click',
  launcher: 'inject:' + PB.slot.launcher,
  hero: 'inject:' + PB.slot.hero,
  overlay: 'register:' + PB.slot.overlay,
})

/**
 * The parts in the requirement's mount order (R-A). Order between the keys of one part is not
 * specified, so ordering is only asserted between parts.
 */
const PARTS = Object.freeze([
  Object.freeze({ name: 'stylesheet', keys: Object.freeze([KEY.sheet]) }),
  Object.freeze({ name: 'html attribute', keys: Object.freeze([KEY.attr]) }),
  Object.freeze({ name: 'shortcuts', keys: Object.freeze([KEY.keydown, KEY.catalog]) }),
  Object.freeze({ name: 'session', keys: Object.freeze([KEY.uiSession, KEY.sessionsList, KEY.focus]) }),
  Object.freeze({ name: 'observer + locale', keys: Object.freeze([KEY.observer, KEY.locale]) }),
  Object.freeze({ name: 'navigation guards', keys: Object.freeze([KEY.navigate, KEY.click]) }),
  Object.freeze({ name: 'settings.launcher inject', keys: Object.freeze([KEY.launcher]) }),
  Object.freeze({ name: 'hero inject', keys: Object.freeze([KEY.hero]) }),
  Object.freeze({ name: 'shell.overlay register', keys: Object.freeze([KEY.overlay]) }),
])
const ALL_KEYS = Object.freeze(PARTS.flatMap((part) => part.keys))
const partOf = (key) => PARTS.findIndex((part) => part.keys.includes(key))

/** Where a setup fault is injected; each throws its own sentinel from inside the fake. */
const FAULT = Object.freeze({
  sheetAppend: 'append-stylesheet',
  catalogSubscribe: 'catalog-subscribe',
  observe: 'observer-observe',
  clickListener: 'document-click-listener',
  heroInject: 'hero-inject',
  overlayRegister: 'overlay-register',
})
/** Fault → the index (in PARTS) of the part it breaks. */
const FAULT_PART = Object.freeze({
  [FAULT.sheetAppend]: 0,
  [FAULT.catalogSubscribe]: 2,
  [FAULT.observe]: 4,
  [FAULT.clickListener]: 5,
  [FAULT.heroInject]: 7,
  [FAULT.overlayRegister]: 8,
})

/** Recorder for mount/dispose events of every key on one sequence clock. */
function createTracker() {
  let clock = 0
  const state = new Map(ALL_KEYS.map((key) => [key, { live: 0, mounts: [], disposes: [] }]))
  return {
    mount(key) { const s = state.get(key); s.live++; s.mounts.push(++clock) },
    dispose(key) { const s = state.get(key); s.live--; s.disposes.push(++clock) },
    live: () => ALL_KEYS.filter((key) => state.get(key).live > 0),
    mounted: (key) => state.get(key).mounts.length > 0,
    firstMount: (key) => state.get(key).mounts[0],
    lastDispose: (key) => state.get(key).disposes.at(-1),
    snapshot: () => ALL_KEYS.filter((key) => state.get(key).live > 0),
  }
}

/** A sentinel error per fault site, created in this realm so identity can be compared. */
const sentinel = (label) => Object.assign(new Error('PB sentinel: ' + label), { pbSentinel: label })

/** An idempotent wrapper: real unsubscribe/remove functions are idempotent, a second call is a no-op. */
function once(fn) { let done = false; return () => { if (done) return; done = true; fn() } }

const captureOf = (options) => (typeof options === 'boolean' ? options : Boolean(options?.capture))

/**
 * Listener recorder over an EventTarget-like object. Removal matches type, function and capture
 * flag, as the DOM does; a removal with another capture flag leaves the listener live.
 */
function trackListeners(target, keys, tracker, faultFor = () => undefined) {
  const original = { add: target.addEventListener?.bind(target), remove: target.removeEventListener?.bind(target) }
  const live = []
  target.addEventListener = (type, fn, options) => {
    const fault = faultFor(type)
    if (fault) throw fault
    original.add?.(type, fn, options)
    if (!keys[type]) return
    const capture = captureOf(options)
    if (live.some((entry) => entry.type === type && entry.fn === fn && entry.capture === capture)) return
    live.push({ type, fn, capture })
    tracker.mount(keys[type])
  }
  target.removeEventListener = (type, fn, options) => {
    original.remove?.(type, fn, options)
    const capture = captureOf(options)
    const at = live.findIndex((entry) => entry.type === type && entry.fn === fn && entry.capture === capture)
    if (at < 0) return
    live.splice(at, 1)
    tracker.dispose(keys[type])
  }
}

/**
 * Load and apply the page with recorders and faults.
 * @param options.setupFault - one FAULT value, or none.
 * @param options.throwingUnsubscribes - subscription keys (KEY.catalog/sessionsList/locale/…) whose
 *   first unsubscribe removes the subscription and then throws that key's sentinel.
 * @param options.navigation - give the window a `navigation` object (default true).
 */
function bootPage({ setupFault, throwingUnsubscribes = [], navigation = true } = {}) {
  const tracker = createTracker()
  const errors = {
    setup: setupFault ? sentinel(setupFault) : undefined,
    unsubscribe: Object.fromEntries(throwingUnsubscribes.map((key) => [key, sentinel('unsubscribe ' + key)])),
  }
  const uncaught = []
  const effects = []
  let armed = false
  const setupFaultIs = (fault) => armed && setupFault === fault

  function beforeScript({ sandbox, window, document }) {
    // Disposer errors must surface via a queued microtask (R-A2/R-A3): record what such a task throws.
    const recordingMicrotask = (callback) => queueMicrotask(() => { try { callback() } catch (error) { uncaught.push(error) } })
    sandbox.queueMicrotask = recordingMicrotask
    window.queueMicrotask = recordingMicrotask

    // adoptedStyleSheets: in-place mutation (push/splice) and reassignment are both observed.
    let sheets = []
    const present = () => sheets.length > 0
    const observeSheets = (mutate) => {
      const before = present()
      mutate()
      if (!before && present()) tracker.mount(KEY.sheet)
      if (before && !present()) tracker.dispose(KEY.sheet)
    }
    const view = () => new Proxy(sheets, {
      set(target, prop, value) {
        if (setupFaultIs(FAULT.sheetAppend)) throw errors.setup
        let ok
        observeSheets(() => { ok = Reflect.set(target, prop, value) })
        return ok
      },
      deleteProperty(target, prop) { let ok; observeSheets(() => { ok = Reflect.deleteProperty(target, prop) }); return ok },
    })
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      get: view,
      set(next) {
        if (setupFaultIs(FAULT.sheetAppend) && next.length > sheets.length) throw errors.setup
        observeSheets(() => { sheets = [...next] })
      },
    })

    // <html data-fishball-page>: presence after every attribute call.
    const html = document.documentElement
    for (const method of ['setAttribute', 'removeAttribute', 'toggleAttribute']) {
      const original = html[method].bind(html)
      html[method] = (...args) => {
        const before = html.hasAttribute(PB.attribute)
        const result = original(...args)
        const after = html.hasAttribute(PB.attribute)
        if (!before && after) tracker.mount(KEY.attr)
        if (before && !after) tracker.dispose(KEY.attr)
        return result
      }
    }

    trackListeners(window, { [PB.event.keydown]: KEY.keydown, [PB.event.focus]: KEY.focus }, tracker)
    const clickFault = (type) => (type === PB.event.click && setupFaultIs(FAULT.clickListener) ? errors.setup : undefined)
    trackListeners(document, { [PB.event.click]: KEY.click }, tracker, clickFault)
    if (navigation) {
      const nav = {}
      trackListeners(nav, { [PB.event.navigate]: KEY.navigate }, tracker)
      window.navigation = nav
      sandbox.navigation = nav
    }

    sandbox.MutationObserver = class TrackingObserver {
      constructor(callback) { this.callback = callback; this.live = false }
      observe(target) {
        if (setupFaultIs(FAULT.observe)) throw errors.setup
        if (target !== document.body || this.live) return
        this.live = true
        tracker.mount(KEY.observer)
      }
      disconnect() { if (!this.live) return; this.live = false; tracker.dispose(KEY.observer) }
      takeRecords() { return [] }
    }
  }

  function wrapSubscribe(owner, key, fault) {
    const original = owner.subscribe.bind(owner)
    let firstRecord = true
    owner.subscribe = (listener) => {
      if (fault && setupFaultIs(fault)) throw errors.setup
      const unsubscribe = original(listener)
      tracker.mount(key)
      const throwing = firstRecord && errors.unsubscribe[key]
      firstRecord = false
      return once(() => {
        unsubscribe()
        tracker.dispose(key)
        if (throwing) throw throwing
      })
    }
  }

  function beforeApply(ctx) {
    armed = true
    wrapSubscribe(ctx.shortcuts.catalog, KEY.catalog, FAULT.catalogSubscribe)
    wrapSubscribe(ctx.uiSession.adapter.current, KEY.uiSession)
    wrapSubscribe(ctx.sessions.list, KEY.sessionsList)
    wrapSubscribe(ctx.locale, KEY.locale)
    const slots = { inject: ctx.slots.inject.bind(ctx.slots), register: ctx.slots.register.bind(ctx.slots) }
    ctx.slots.inject = (name, fn) => {
      if (name === PB.slot.hero && setupFaultIs(FAULT.heroInject)) throw errors.setup
      const dispose = slots.inject(name, fn)
      const key = 'inject:' + name
      if (!ALL_KEYS.includes(key)) return dispose
      tracker.mount(key)
      return once(() => { dispose(); tracker.dispose(key) })
    }
    // The real SDK throws here for a duplicate list-slot id; the fake throws the setup sentinel.
    ctx.slots.register = (options, Component) => {
      if (options?.name === PB.slot.overlay && setupFaultIs(FAULT.overlayRegister)) throw errors.setup
      const dispose = slots.register(options, Component)
      const key = 'register:' + options?.name
      if (!ALL_KEYS.includes(key)) return dispose
      tracker.mount(key)
      return once(() => { dispose(); tracker.dispose(key) })
    }
    // ctx.effect records what the effect returned or threw, and what was live at the moment it threw.
    ctx.effect = (execute) => {
      const record = { dispose: undefined, error: undefined, liveAtThrow: undefined, uncaughtAtThrow: undefined }
      effects.push(record)
      try {
        record.dispose = execute()
      } catch (error) {
        record.error = error
        record.liveAtThrow = tracker.snapshot()
        record.uncaughtAtThrow = uncaught.length
        throw error
      }
      return record.dispose
    }
  }

  let applyError
  try {
    loadPage({ respond: () => PB.sessionReply, hooks: { beforeScript, beforeApply } })
  } catch (error) {
    applyError = error
  }
  return { tracker, errors, uncaught, effects, applyError }
}

/** The one effect that threw (R-A1 setups) or the one that returned a disposer (teardown). */
function theEffect(world) {
  assert.equal(world.effects.length, 1, 'precondition: apply runs exactly one ctx.effect (R-A "its effect")')
  return world.effects[0]
}

/** Every key of every part before `index` was mounted: the fault really hit after them (R-A order). */
function assertMountedBefore(world, index) {
  for (const part of PARTS.slice(0, index)) {
    for (const key of part.keys) assert.ok(world.tracker.mounted(key), `precondition: part "${part.name}" (${key}) was mounted before the fault in part "${PARTS[index].name}"`)
  }
}

/**
 * Parts outside `exempt` (part indexes) hold nothing live at the given moment. Exempt are the part
 * whose setup step failed and any part whose own disposer throws: R-A2/R-A3 guarantee only that
 * every OTHER part is disposed; what a throwing part leaves of itself is not specified.
 */
function assertNothingLiveOutside(live, exempt, moment) {
  const leaked = live.filter((key) => !exempt.includes(partOf(key)))
  assert.deepEqual(leaked, [], `${moment}: no mounted part is left live (subscriptions, listeners, observer, stylesheet, attribute, slots)`)
}

/** Parts were mounted in PARTS order: every first mount of part i precedes every first mount of part j > i. */
function assertMountOrder(tracker) {
  for (let i = 0; i < PARTS.length - 1; i++) {
    const last = Math.max(...PARTS[i].keys.map(tracker.firstMount))
    const next = Math.min(...PARTS[i + 1].keys.map(tracker.firstMount))
    assert.ok(last < next, `part "${PARTS[i].name}" mounts before part "${PARTS[i + 1].name}"`)
  }
}

/**
 * Parts were disposed in reverse PARTS order: part i+1 is removed before part i is touched. Only
 * keys that were disposed take part (a throwing part may keep some of itself, see above).
 */
function assertReverseDisposeOrder(tracker) {
  const disposedAt = (part) => part.keys.map(tracker.lastDispose).filter((at) => at !== undefined)
  for (let i = 0; i < PARTS.length - 1; i++) {
    const earlier = disposedAt(PARTS[i])
    const later = disposedAt(PARTS[i + 1])
    if (earlier.length === 0 || later.length === 0) continue
    assert.ok(Math.max(...later) < Math.min(...earlier), `part "${PARTS[i + 1].name}" is disposed before part "${PARTS[i].name}" (reverse mount order)`)
  }
}

/** Indexes of the parts that own one of the given keys. */
const partsOf = (keys) => [...new Set(keys.map(partOf))]

/** Run the effect's returned disposer; returns {threw, error}. */
function teardown(record) {
  assert.equal(typeof record.dispose, 'function', 'precondition: the effect returned a disposer')
  try { record.dispose(); return { threw: false } } catch (error) { return { threw: true, error } }
}

// ---------------------------------------------------------------------------------------------
// R-A1: a failed setup unwinds what it mounted and rethrows its own error
// ---------------------------------------------------------------------------------------------

/** BVA over the failure position: first part, early, middle (two APIs), penultimate, last part. */
const UNWIND_ROWS = Object.freeze([
  Object.freeze({ id: 'PB-BVA-01', technique: 'BVA (first part)', fault: FAULT.sheetAppend, what: 'appending the stylesheet throws' }),
  Object.freeze({ id: 'PB-BVA-02', technique: 'BVA (first ctx service)', fault: FAULT.catalogSubscribe, what: 'ctx.shortcuts.catalog.subscribe throws' }),
  Object.freeze({ id: 'PB-EP-03', technique: 'EP (browser API, middle)', fault: FAULT.observe, what: 'MutationObserver.observe throws' }),
  Object.freeze({ id: 'PB-EP-04', technique: 'EP (DOM listener, middle)', fault: FAULT.clickListener, what: "document.addEventListener('click') throws" }),
  Object.freeze({ id: 'PB-BVA-05', technique: 'BVA (penultimate part)', fault: FAULT.heroInject, what: "slots.inject('conversation.hero.workspace') throws" }),
  Object.freeze({ id: 'PB-BVA-06', technique: 'BVA (last part)', fault: FAULT.overlayRegister, what: "slots.register shell.overlay throws (duplicate list-slot id)" }),
])

describe('PB R-A1 fishball-page: a failed setup disposes every mounted part, then throws its own error', () => {
  for (const row of UNWIND_ROWS) {
    it(`${row.id} ${row.technique}: ${row.what}`, () => {
      const world = bootPage({ setupFault: row.fault })
      const failing = FAULT_PART[row.fault]
      const record = theEffect(world)
      assert.equal(record.error, world.errors.setup, 'the effect throws the setup\'s original error (same object)')
      assert.equal(world.applyError, world.errors.setup, 'apply propagates that same error')
      assertMountedBefore(world, failing)
      assertNothingLiveOutside(record.liveAtThrow, [failing], 'at the moment the effect throws')
    })
  }
})

// ---------------------------------------------------------------------------------------------
// R-A2: a throwing disposer during the unwinding
// ---------------------------------------------------------------------------------------------

/** DT rows: setup fails late (last part) × which already-mounted part's disposer throws. */
const UNWIND_THROW_ROWS = Object.freeze([
  Object.freeze({ id: 'PB-DT-07', throwing: KEY.catalog, what: 'an early part (shortcuts catalog unsubscribe)' }),
  Object.freeze({ id: 'PB-DT-08', throwing: KEY.locale, what: 'a later part (locale unsubscribe)' }),
])

describe('PB R-A2 fishball-page: a throwing disposer while a failed setup unwinds', () => {
  for (const row of UNWIND_THROW_ROWS) {
    it(`${row.id} DT (setup fails at shell.overlay; ${row.what} throws)`, async () => {
      const world = bootPage({ setupFault: FAULT.overlayRegister, throwingUnsubscribes: [row.throwing] })
      const record = theEffect(world)
      const disposerError = world.errors.unsubscribe[row.throwing]
      assertMountedBefore(world, FAULT_PART[FAULT.overlayRegister])
      assert.equal(record.error, world.errors.setup, 'the effect throws the setup\'s original error, not the disposer\'s')
      assert.notEqual(record.error, disposerError)
      assertNothingLiveOutside(record.liveAtThrow, [FAULT_PART[FAULT.overlayRegister], ...partsOf([row.throwing])], 'at the moment the effect throws (every other part still disposed)')
      assert.equal(record.liveAtThrow.includes(row.throwing), false, 'precondition: the throwing unsubscribe itself was called')
      assert.equal(record.uncaughtAtThrow, 0, 'the disposer error is not rethrown synchronously')
      await settle()
      assert.deepEqual(world.uncaught, [disposerError], 'the disposer error surfaces once from a queued microtask after the effect returned')
    })
  }
})

// ---------------------------------------------------------------------------------------------
// R-A3: normal teardown
// ---------------------------------------------------------------------------------------------

/** DT/BVA over the number of throwing disposers at teardown: 0, 1, 2, 3 (parts 3, 4, 5). */
const TEARDOWN_ROWS = Object.freeze([
  Object.freeze({ id: 'PB-ST-09', technique: 'ST mounted → disposed; BVA 0 throwing', throwing: Object.freeze([]), first: undefined }),
  Object.freeze({ id: 'PB-DT-10', technique: 'DT/BVA 1 throwing', throwing: Object.freeze([KEY.catalog]), first: KEY.catalog }),
  Object.freeze({ id: 'PB-DT-11', technique: 'DT/BVA 2 throwing', throwing: Object.freeze([KEY.catalog, KEY.sessionsList]), first: KEY.sessionsList }),
  Object.freeze({ id: 'PB-DT-12', technique: 'DT/BVA 3 throwing', throwing: Object.freeze([KEY.catalog, KEY.sessionsList, KEY.locale]), first: KEY.locale }),
])

describe('PB R-A3 fishball-page: teardown disposes every part in reverse mount order', () => {
  for (const row of TEARDOWN_ROWS) {
    const label = row.throwing.length === 0 ? 'no disposer throws' : row.throwing.join(', ') + ' throw'
    it(`${row.id} ${row.technique}: ${label}`, async () => {
      const world = bootPage({ throwingUnsubscribes: row.throwing })
      assert.equal(world.applyError, undefined, 'precondition: setup succeeds')
      const record = theEffect(world)
      assertMountOrder(world.tracker)
      assert.deepEqual(world.tracker.live(), ALL_KEYS, 'precondition: every part is live after setup')
      const result = teardown(record)
      assertNothingLiveOutside(world.tracker.live(), partsOf(row.throwing), 'after teardown (every other part disposed)')
      for (const key of row.throwing) assert.equal(world.tracker.live().includes(key), false, 'precondition: the throwing unsubscribe ' + key + ' was called')
      assertReverseDisposeOrder(world.tracker)
      if (row.first === undefined) {
        assert.equal(result.threw, false, 'the disposer returns normally when no part disposer throws')
      } else {
        assert.equal(result.threw, true, 'the disposer throws')
        assert.equal(result.error, world.errors.unsubscribe[row.first], 'it throws the first disposer error met in reverse mount order')
      }
      assert.deepEqual(world.uncaught, [], 'nothing is rethrown synchronously through the microtask recorder yet')
      await settle()
      const further = row.throwing.filter((key) => key !== row.first).map((key) => world.errors.unsubscribe[key])
      assert.equal(world.uncaught.length, further.length, 'each further disposer error surfaces once from a queued microtask')
      for (const error of further) assert.ok(world.uncaught.includes(error), 'surfaced: ' + error.message)
    })
  }

  it('PB-EP-13 EP (no window.navigation): setup mounts no navigate listener; teardown still removes everything', () => {
    const world = bootPage({ navigation: false })
    assert.equal(world.applyError, undefined, 'precondition: setup succeeds without window.navigation')
    const record = theEffect(world)
    assert.equal(world.tracker.mounted(KEY.navigate), false)
    assert.deepEqual(world.tracker.live(), ALL_KEYS.filter((key) => key !== KEY.navigate), 'every other part is live')
    const result = teardown(record)
    assert.equal(result.threw, false)
    assert.deepEqual(world.tracker.live(), [], 'every part is disposed')
  })
})
