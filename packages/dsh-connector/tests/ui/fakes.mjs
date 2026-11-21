/**
 * Fakes of what the UI backend is given, and the harness readers of what it answers. Each fake
 * follows the contract it stands for and records every call; nothing here imitates the backend.
 * - FakeHandover: K3 `DshConnectorHandover` (host-services/handover.d.ts) with scriptable rows,
 *   listeners the case fires, and handOver / takeBack that record their arguments and answer a
 *   scripted result (default: success, applied to `managed()` and announced through onChange, as
 *   the real service does);
 * - FakeCtx: the Cordis-like connector row context `provide(ctx)` is given (relayed surface:
 *   `effect`, `provide`, `connection.fetch.register`);
 * - captureRegister: a `register` function for `service.contribute` that keeps each definition;
 * - SSE reading of the events route.
 */
import assert from 'node:assert/strict'
import { FIXTURE, SURFACE, WAIT } from './constants.mjs'

const ref = ({ key, name, id }) => ({ key, name, id })
/** A K3 HandoverPrincipal row of a fixture principal; `over` changes fields. */
export const row = (p, over = {}) => ({ key: p.key, name: p.name, id: p.id, online: false, enabled: true, paired: true, ...over })

/**
 * K3 `DshConnectorHandover`. Drivers: `set({managed, principals})`, `fire()`, `script`, and
 * (R-FIX-CUI, UI-01: handOver / takeBack act on the root of the session they are given) `parents`,
 * a child → parent map: the default answers resolve the given id to its root first, as the real
 * service does. A takeBack of an unmanaged root answers `not-managed`, and a handOver of a managed
 * one `conflict` (K3), only when `parents` is used, so the older rows keep their answers.
 */
export class FakeHandover {
  apiVersion = 1
  #managed = []
  #principals = []
  parents = new Map()
  listeners = new Set()
  calls = { handOver: [], takeBack: [] }
  /** The next answers: a result object, `{throws: Error}` (sync throw) or `{rejects: Error}`. */
  script = { handOver: undefined, takeBack: undefined }
  managed() { return this.#managed.map((m) => ({ sessionId: m.sessionId, principal: { ...m.principal } })) }
  principals() { return this.#principals.map((p) => ({ ...p })) }
  onChange(fn) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  /** Replaces rows (any of `managed`, `principals`) and fires onChange once. */
  set({ managed, principals } = {}) {
    if (managed !== undefined) this.#managed = managed.map((m) => ({ sessionId: m.sessionId, principal: ref(m.principal) }))
    if (principals !== undefined) this.#principals = principals.map((p) => ({ ...p }))
    this.fire()
  }
  /** Changes one principal row by key and fires onChange. */
  patch(key, over) { this.set({ principals: this.#principals.map((p) => (p.key === key ? { ...p, ...over } : p)) }) }
  fire() { for (const fn of [...this.listeners]) { try { fn() } catch { /* a listener's failure is its own (K3) */ } } }
  #answer(kind, fallback) {
    const scripted = this.script[kind]
    this.script[kind] = undefined
    if (scripted?.throws) throw scripted.throws
    if (scripted?.rejects) return Promise.reject(scripted.rejects)
    if (scripted !== undefined) return Promise.resolve(scripted)
    return Promise.resolve(fallback())
  }
  /** The root of `sessionId` through `parents`. */
  rootOf(sessionId) {
    let root = sessionId
    while (this.parents.has(root)) root = this.parents.get(root)
    return root
  }
  #isManaged = (sessionId) => this.#managed.some((m) => m.sessionId === sessionId)
  handOver(...args) {
    this.calls.handOver.push(args)
    return this.#answer('handOver', () => {
      const [given, principalKey] = args
      const sessionId = this.rootOf(given)
      if (this.parents.size > 0 && this.#isManaged(sessionId)) return { ok: false, code: 'conflict' }
      const p = this.#principals.find((x) => x.key === principalKey)
      this.set({ managed: [...this.#managed, { sessionId, principal: p }] })
      return { ok: true, principal: ref(p) }
    })
  }
  takeBack(...args) {
    this.calls.takeBack.push(args)
    return this.#answer('takeBack', () => {
      const sessionId = this.rootOf(args[0])
      if (this.parents.size > 0 && !this.#isManaged(sessionId)) return { ok: false, code: 'not-managed' }
      this.set({ managed: this.#managed.filter((m) => m.sessionId !== sessionId) })
      return { ok: true }
    })
  }
}

/**
 * K1 `PairStore` as the UI backend reads it (contract A, 2026-11-21: only `byPrincipal(principalKey)`
 * → `{entryKey, principalKey, id, name, ...} | undefined`). Drivers: `bind(p, entryKey?)` pairs a
 * fixture principal under its entry key (`FakePairStore.entryOf(p.key)` by default), `rename`,
 * `unbind`. Every read is recorded.
 */
export class FakePairStore {
  static entryOf = (principalKey) => FIXTURE.entryOf(principalKey)
  #pairs = new Map()
  reads = []
  bind(p, entryKey = FakePairStore.entryOf(p.key)) {
    this.#pairs.set(p.key, Object.freeze({ entryKey, principalKey: p.key, id: p.id, name: p.name }))
    return entryKey
  }
  rename(principalKey, name) { const pair = this.#pairs.get(principalKey); if (pair) this.#pairs.set(principalKey, Object.freeze({ ...pair, name })) }
  unbind(principalKey) { this.#pairs.delete(principalKey) }
  byPrincipal(principalKey) { this.reads.push(principalKey); return this.#pairs.get(principalKey) }
}

/**
 * A window source as `offerWindows` takes it (contract A): `{entries(), onChange(listener) → dispose}`.
 * Drivers: `set(entries)` replaces the claimed entry keys and fires every listener; `listening()`.
 * `iterable: 'set'` answers a Set instead of an array (entries() is any Iterable).
 */
export function windowSource(entries = [], { iterable = 'array' } = {}) {
  let list = [...entries]
  const listeners = new Set()
  const source = {
    entries: () => (iterable === 'set' ? new Set(list) : [...list]),
    onChange(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    source,
    set(next) { list = [...next]; for (const fn of [...listeners]) fn() },
    listening: () => listeners.size,
  }
}

/** The connector row's context, Cordis-like: effects run at once and their disposers on `dispose()`. */
export class FakeCtx {
  effects = []
  provided = []
  routes = []
  #inEffect = 0
  /** Disposer calls: `provide:<name>` and `route:<path>`. */
  disposed = []
  effect(fn) {
    this.#inEffect++
    let disposer
    try { disposer = fn() } finally { this.#inEffect-- }
    const entry = { disposer, done: false }
    this.effects.push(entry)
    return () => this.#run(entry)
  }
  #run(entry) {
    if (entry.done) return
    entry.done = true
    entry.disposer?.()
  }
  provide(name, value) {
    this.provided.push({ name, value, inEffect: this.#inEffect > 0 })
    return () => { this.disposed.push('provide:' + name) }
  }
  connection = {
    fetch: {
      register: (route) => {
        this.routes.push({ route, inEffect: this.#inEffect > 0 })
        return () => { this.disposed.push('route:' + route.path) }
      },
    },
  }
  dispose() { for (const entry of [...this.effects].reverse()) this.#run(entry) }
  /** The registered route of a UI_ROUTE key. */
  route(key) {
    const [, routePath] = SURFACE.routes[key]
    const found = this.routes.find((r) => r.route.path === routePath)
    assert.ok(found, 'no route registered at ' + routePath)
    return found.route
  }
}

/** A `register` for `contribute` that keeps definitions and counts each disposer's calls. */
export function captureRegister({ throwAt } = {}) {
  const defs = []
  const disposals = []
  const register = (def) => {
    if (throwAt !== undefined && defs.length === throwAt) throw new Error(FIXTURE.failure)
    const index = defs.length
    defs.push(def)
    disposals[index] = 0
    return () => { disposals[index]++ }
  }
  return { register, defs, disposals, byName: (name) => defs.find((d) => d.name === name) }
}

/** A recording `{info, warn}` logger. */
export function recordingLogger() {
  const lines = []
  const at = (level) => (...args) => { lines.push({ level, args }) }
  return { lines, info: at('info'), warn: at('warn') }
}

/** A real `Request` to a UI route; `body` is a string (sent as is) or a value (sent as JSON). */
export function requestOf(key, body, signal) {
  const [method, routePath] = SURFACE.routes[key]
  const init = { method, signal }
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request(FIXTURE.origin + routePath, init)
}

/**
 * A reader of the events route's body. `next()` resolves the next frame's parsed Snapshot (fails
 * after WAIT.settleMs); `quiet()` asserts no frame arrives for WAIT.quietMs; `ended()` resolves
 * true once the stream ends (closed or errored) within WAIT.settleMs.
 */
export function sseReader(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const frames = []
  let done = false
  let pending = null
  const waiters = new Set()
  const notify = () => { for (const w of [...waiters]) w() }
  const pump = async () => {
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })
        let at
        while ((at = buffer.indexOf(SURFACE.frame.end)) >= 0) {
          frames.push(buffer.slice(0, at + SURFACE.frame.end.length))
          buffer = buffer.slice(at + SURFACE.frame.end.length)
        }
        notify()
      }
    } catch { /* an errored stream has ended too */ }
    done = true
    notify()
  }
  pending = pump()
  let read = 0
  const wait = (cond, ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(check); resolve(false) }, ms)
    const check = () => { if (cond()) { clearTimeout(timer); waiters.delete(check); resolve(true) } }
    waiters.add(check)
    check()
  })
  const parse = (text) => {
    assert.ok(text.startsWith(SURFACE.frame.prefix), 'a frame is not `data: …`: ' + JSON.stringify(text))
    return JSON.parse(text.slice(SURFACE.frame.prefix.length, -SURFACE.frame.end.length))
  }
  return {
    frames,
    async next() {
      assert.ok(await wait(() => frames.length > read || done, WAIT.settleMs), 'no frame within ' + WAIT.settleMs + ' ms')
      assert.ok(frames.length > read, 'the stream ended before the next frame')
      return parse(frames[read++])
    },
    /** Every frame not read yet, parsed (after `quiet`). */
    rest() { const out = frames.slice(read).map(parse); read = frames.length; return out },
    async quiet() {
      const before = frames.length
      await new Promise((resolve) => setTimeout(resolve, WAIT.quietMs))
      assert.equal(frames.length, before, 'unexpected frame(s): ' + frames.slice(before).join(''))
    },
    async settle() { await new Promise((resolve) => setTimeout(resolve, WAIT.quietMs)) },
    /** Waits until an unread frame satisfies `pred`; consumes frames up to it and returns it. */
    async seen(pred, what) {
      let found
      const look = () => {
        while (frames.length > read) {
          const snapshot = parse(frames[read++])
          if (pred(snapshot)) { found = snapshot; return true }
        }
        return false
      }
      assert.ok(await wait(look, WAIT.settleMs), 'no frame shows ' + what)
      return found
    },
    ended: () => wait(() => done, WAIT.settleMs),
    cancel: async () => { try { await reader.cancel() } catch { /* already ended */ } await pending },
  }
}
