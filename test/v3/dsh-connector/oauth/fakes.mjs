/**
 * Fakes of the K1 seams C-OAUTH builds against (index.d.ts), written from the frozen interfaces
 * only: C-HTTP's `RequestGate`, C-OAUTH-WEB's `authorization_code` / `refresh_token`
 * `GrantHandler`s, C-TOKENS' `TokenRegistry`, C-PAIR's `PairStore` (the read side), an injected clock
 * and a recording logger. Each records what it was asked, so a case can show what C-OAUTH did and,
 * as important, what it did not do.
 */
import { ENTRY_STATUS, FIXTURE, HOSTS, HTTP_STATUS, REQUEST_GATE, REVOCATION } from './constants.mjs'

/** An injected clock (README "clock"): `now()` for GateListenerFacts, `set` / `advance` for the cases. */
export function fakeClock(start = FIXTURE.t0) {
  let ms = start
  return { now: () => ms, set: (at) => { ms = at }, advance: (by) => { ms += by } }
}

/** A cordis-like logger whose every line is kept, so a case can grep it for planted secrets. */
export function recordingLogger() {
  const lines = []
  const log = (level) => (...args) => { lines.push(`${level} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`) }
  return { lines, info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug'), success: log('success') }
}

/** The hostname of a `Host` header value (`[::1]:80` → `[::1]`, `a:80` → `a`). */
const hostname = (host) => (host ?? '').replace(/:\d+$/, '')

/**
 * C-HTTP's `RequestGate`, faked from K1b's freeze (REQUEST_GATE, HOSTS): `check` refuses 405 for a
 * listed path with another method, then 403 for a `Host` outside the loopback names, the bind
 * address and `--trusted-host`, or for any `Origin` on a `refuse-any` surface. The listener is
 * loopback, so the 503 step never fires. `admit` must never be called on `token` (K1b-UC-02).
 */
export class FakeGate {
  checks = []
  admits = []
  constructor(facts) { this.facts = facts }
  check(req, surface) {
    this.checks.push({ method: req.method, path: req.path, headers: { ...req.headers }, surface })
    const methods = REQUEST_GATE.routes[surface]?.[req.path]
    if (methods !== undefined && !methods.includes(req.method)) {
      return { pass: false, status: HTTP_STATUS.methodNotAllowed, headers: { [REQUEST_GATE.headers.allow]: methods.join(REQUEST_GATE.allowSeparator) }, body: null }
    }
    const allowed = [...HOSTS.loopbackNames, this.facts.host, ...this.facts.trustedHosts]
    const origin = req.headers[REQUEST_GATE.headers.origin]
    if (!allowed.includes(hostname(req.headers[REQUEST_GATE.headers.host])) || origin !== undefined) {
      return { pass: false, status: HTTP_STATUS.forbidden, headers: {}, body: null }
    }
    return { pass: true }
  }
  admit(req, surface, caller) {
    this.admits.push({ path: req.path, surface, caller })
    return { pass: true, done() {} }
  }
  /** The checks of one path (the token endpoint, a metadata document). */
  checksOf(path) { return this.checks.filter((c) => c.path === path) }
}

/**
 * One of C-OAUTH-WEB's grants, faked (K1b `GrantHandler`): it records every `(form, ctx)` and
 * answers what the case scripted (`answer`), a 200 token body by default. `throws` makes it throw.
 */
export class FakeGrant {
  calls = []
  throws = false
  constructor(grantType, answer) { this.grantType = grantType; this.answer = answer }
  async handle(form, ctx) {
    this.calls.push({ form: { ...form }, ctx })
    if (this.throws) throw new Error('fbtest: scripted grant failure')
    return this.answer
  }
}

/**
 * C-TOKENS' `TokenRegistry`, faked from K1 (TokenEntry, RevocationKind): `match` finds only an
 * enabled `ok` entry by its exact value; disable and delete bump the generation and
 * fire `onRevoked` synchronously; re-enabling does not bump it (K1 TokenEntry.generation).
 */
export class FakeTokenRegistry {
  #entries = new Map()
  #values = new Map()
  #listeners = new Set()
  #count = 0
  /** How often `match` was asked (never with what): R-TOK-00, nothing is checked before the gate passes. */
  matchCalls = 0
  /** Adds an entry; returns `{entryKey, value}` (the value only the case and the client know). */
  add({ enabled = true, status, value = FIXTURE.value() } = {}) {
    this.#count += 1
    const entryKey = FIXTURE.entryKey(this.#count)
    this.#entries.set(entryKey, Object.freeze({ entryKey, label: entryKey, enabled, ref: entryKey, status: status ?? ENTRY_STATUS.ok, generation: FIXTURE.firstGeneration, generated: true }))
    this.#values.set(entryKey, value)
    return { entryKey, value }
  }
  match(value) {
    this.matchCalls += 1
    return [...this.#entries.values()].find((e) => e.enabled && e.status === ENTRY_STATUS.ok && this.#values.get(e.entryKey) === value)
  }
  get(entryKey) { return this.#entries.get(entryKey) }
  list() { return [...this.#entries.values()] }
  onRevoked(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
  #revoke(entryKey, kind, change) {
    const before = this.#entries.get(entryKey)
    const after = Object.freeze({ ...before, ...change, generation: before.generation + 1 })
    if (kind === REVOCATION.deleted) this.#entries.delete(entryKey)
    else this.#entries.set(entryKey, after)
    for (const listener of this.#listeners) listener(entryKey, kind, after.generation)
  }
  disable(entryKey) { this.#revoke(entryKey, REVOCATION.disabled, { enabled: false }) }
  enable(entryKey) { this.#entries.set(entryKey, Object.freeze({ ...this.#entries.get(entryKey), enabled: true })) }
  remove(entryKey) { this.#revoke(entryKey, REVOCATION.deleted, {}) }
}

/**
 * C-PAIR's `PairStore`, faked on its read side (K1d `Pair`): `bind` stands in for a `pair` call the
 * case made at the MCP endpoint, or, with `client` ({clientIdUrl, redirectUri}), for the approval
 * page's bind (K1d: only a page-bound pair carries them). Every write member records the call, so a
 * case can show the token endpoint never pairs (R-ID-05, AUTH-UC-03 post).
 */
export class FakePairStore {
  #pairs = new Map()
  writes = []
  bind(entryKey, id, name = null, now = FIXTURE.t0, client = {}) {
    const pair = Object.freeze({ entryKey, principalKey: FIXTURE.principalKey(entryKey), id, name, pairedAt: now, lastSeenAt: null, ...client })
    this.#pairs.set(entryKey, pair)
    return pair
  }
  list() { return [...this.#pairs.values()] }
  pairOf(entryKey) { return this.#pairs.get(entryKey) }
  byPrincipal(principalKey) { return this.list().find((p) => p.principalKey === principalKey) }
  #write(member) { return async (...args) => { this.writes.push([member, ...args]); return undefined } }
  pair = this.#write('pair')
  bindFromPage = this.#write('bindFromPage')
  reconnectFromPage = this.#write('reconnectFromPage')
  setName = this.#write('setName')
  remove = this.#write('remove')
  seen() {}
  onChange() { return () => {} }
}
