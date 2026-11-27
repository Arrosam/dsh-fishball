/**
 * Fakes of core's status ports (targets, guards, notify), each speaking only the relayed contract
 * (subject.mjs), and of DSH's
 * host services, shaped as the current DSH's types declare them:
 * - `appReady` (dsh-app-boot): `onReady(fn)` → disposer; fn is called at once when already ready;
 * - `pluginManager` (dsh-plugin-manager types.d.ts): `listBundles(): Promise<BundleInfo[]>`; the
 *   manager's mutating operations exist and are recorded, so a case can say "nothing was changed";
 * - `loader` (cordis-plugin-loader config/tree.d.ts): `entries()` yields Entry-shaped objects
 *   (`id`, `disabled`, `_initTask?`, `fiber?` with `state` (cordis FiberState) and `await()`).
 * Every port fake records its calls and how many listeners it holds, so close() and "sends nothing"
 * are observable.
 */
import { HOST } from './constants.mjs'

/** A listener set with the dispose contract `onX(fn) → dispose`; emits isolated like a real source would not need to. */
class Source {
  #listeners = new Set()
  on(fn) { this.#listeners.add(fn); return () => { this.#listeners.delete(fn) } }
  emit(value) { for (const fn of [...this.#listeners]) fn(value) }
  get count() { return this.#listeners.size }
}

/** A port whose value is read by `read()` and announced to `onX` listeners when set. */
class ValuePort {
  source = new Source()
  constructor(value) { this.value = value }
  set(value) { this.value = value; this.source.emit(this.copy()) }
  copy() { return this.value === undefined ? undefined : structuredClone(this.value) }
  get listeners() { return this.source.count }
}

/** MULTI-1: the target collection port `{list(), onChange(fn)}` (relayed seam; FishballTargets' read half). */
export class FakeTargets extends ValuePort {
  list() { return this.copy() }
  onChange(fn) { return this.source.on(fn) }
}

/** The guard report (F-GUARDS `fishballGuards`): `{report(), onChange(fn)}`; report() may be undefined. */
export class FakeGuards extends ValuePort {
  report() { return this.copy() }
  onChange(fn) { return this.source.on(fn) }
}

/** How one notify call settles. `hold` leaves it pending until the case settles it (`held`). */
export const NOTIFY = Object.freeze({ accept: 'accept', reject: 'reject', hold: 'hold' })
/**
 * Fishball's manager notice: records every call. `outcomes` says how each call in turn settles
 * (NOTIFY.accept resolves, NOTIFY.reject rejects, NOTIFY.hold stays pending); calls past the list
 * settle as `then`. `decide(notice, index)`, when given, picks each outcome instead (so a case can
 * hold or reject one kind of notice only). A held call is in `held` as {notice, accept(), reject()}.
 */
export function fakeNotify({ outcomes = [], then = NOTIFY.accept, decide } = {}) {
  const calls = []
  const held = []
  const notify = (notice) => {
    const outcome = decide ? decide(notice, calls.length) : (outcomes[calls.length] ?? then)
    calls.push(structuredClone(notice))
    if (outcome === NOTIFY.hold) {
      return new Promise((resolve, reject) => { held.push({ notice: calls.at(-1), accept: () => resolve(), reject: () => reject(new Error(NOTIFY_FAILED)) }) })
    }
    return outcome === NOTIFY.reject ? Promise.reject(new Error(NOTIFY_FAILED)) : Promise.resolve()
  }
  return { notify, calls, held }
}
const NOTIFY_FAILED = 'fbtest notify refused'
const FIBER_FAILED = 'fbtest row failed to start'

/** dsh-app-boot's readiness service. */
export class FakeAppReady {
  #source = new Source()
  constructor(ready = false) { this.ready = ready }
  onReady(fn) {
    if (this.ready) { fn(); return () => {} }
    return this.#source.on(fn)
  }
  fire() { this.ready = true; this.#source.emit() }
}

/** dsh-plugin-manager: listBundles plus the mutating operations, which a status must never call. */
const MUTATIONS = Object.freeze(['setBundleEnabled', 'setPluginEnabled', 'installBundle', 'removeBundle', 'install', 'remove'])
export class FakePluginManager {
  lists = 0
  mutations = []
  constructor(bundles = []) {
    this.bundles = bundles
    for (const name of MUTATIONS) this[name] = async (...args) => { this.mutations.push({ name, args }) }
  }
  async listBundles() { this.lists += 1; return structuredClone(this.bundles) }
}

/** The loader: `entries()` yields Entry-shaped objects (id, disabled, `_initTask?`, fiber?). */
export class FakeLoader {
  constructor(entries = []) { this.list = entries }
  *entries() { yield* this.list }
}
/**
 * A cordis Fiber as far as the status may read it: `state` and `await()`, which (as the real one,
 * both SDKs) resolves once settled and rejects with the startup error when the state is FAILED.
 * `settled` is the promise the fiber waits on before it reports its final state.
 */
function fiber(state, settled = Promise.resolve()) {
  const f = { state, await: () => settled.then(() => (f.state === HOST.fiberFailed ? Promise.reject(new Error(FIBER_FAILED)) : f)) }
  return f
}
/**
 * Marks an entry with no fiber. An explicit marker, because an `undefined` state would take the
 * parameter default (ACTIVE) and build a loaded fiber instead.
 */
export const NO_FIBER = Symbol('no fiber')
/**
 * One settled loader entry. `state: NO_FIBER` → no fiber: a disabled entry has none, and a live
 * entry whose import failed has none either (the loader catches the import error). `_initTask` is
 * an own property set to undefined, as on the real Entry (a class field the loader clears once the
 * import settled; cordis-plugin-loader lib/index.js `init`/`_init`, both SDKs).
 */
export const entry = (id, { disabled = false, state = HOST.fiberActive } = {}) =>
  // `fiber` is a class field of the real Entry too: an own property, undefined when there is none.
  ({ id, disabled, _initTask: undefined, fiber: state === NO_FIBER ? undefined : fiber(state) })

/** A deferred: `{promise, resolve}`. */
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
/** A live entry whose fiber is still LOADING; `end(state)` settles it in that state. */
export function loadingEntry(id) {
  const gate = deferred()
  const e = { id, disabled: false, fiber: fiber(HOST.fiberLoading, gate.promise) }
  return { entry: e, end(state) { e.fiber.state = state; gate.resolve() } }
}
/**
 * A live entry whose import is still running (`_initTask` pending, no fiber yet); `end(state)`
 * ends it: with a fiber in `state`, or with no fiber when `state` is NO_FIBER (import failed),
 * and `_initTask` cleared, before the task resolves.
 */
export function initializingEntry(id) {
  const gate = deferred()
  const e = { id, disabled: false, _initTask: gate.promise, fiber: undefined }
  return {
    entry: e,
    end(state) {
      if (state !== NO_FIBER) e.fiber = fiber(state)
      e._initTask = undefined
      gate.resolve()
    },
  }
}

/** One BundleInfo (types.d.ts) with the fields the status may read; the rest are filled as DSH fills them. */
export function bundle(name, { enabled = true, installed = true, error, rows = [] } = {}) {
  return {
    name, official: false, availability: installed ? 'profile' : 'missing', enabled, installed, optional: false, removable: installed,
    ...(error === undefined ? {} : { error: { code: error } }),
    rows: rows.map(([rowId, entryId]) => ({ rowId, moduleName: name, ...(entryId === undefined ? {} : { entryId }) })),
    overrides: [],
  }
}
