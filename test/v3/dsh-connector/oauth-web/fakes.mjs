/**
 * Fakes of the K1 / K1b seams C-OAUTH-WEB builds against (index.d.ts; v3-tasks.md W2: "C-OAUTH and
 * C-OAUTH-WEB build against fakes"). Each follows its frozen contract only, and records what the
 * subject did to it, so a case can prove a call happened or never happened:
 *
 * - RequestGate (C-HTTP's): `check` per REQUEST_GATE (405 → 403 → 503) over the listener facts;
 *   `admit` must never be called on the approval surface (REQUEST_GATE.admitSurfaces);
 * - TokenRegistry (C-TOKENS'): enabled, `ok` entries only match; disable and delete
 *   bump the generation and fire `onRevoked`;
 * - PairStore (C-PAIR's): `bindFromPage` / `reconnectFromPage` per K1d (K1d-4, K1d-5: id grammar,
 *   id and name uniqueness by `nameKey`, a deleted entry frees both; a reconnect keeps the
 *   principal and records the newest client; on an unpaired entry it throws TypeError);
 * - OAuthTokenStore (C-OAUTH's): access tokens and codes in memory, refresh digests "persisted"
 *   (they survive `restart()`); no `chainsOf` (withdrawn with the chain cap, R-OA-23);
 *   `revokeEntryChains` (K1d-6) and the bound of K1d-7 (per chain only the newest spent record
 *   and the live one are kept);
 * - FailureLimiter (C-OAUTH's): per key and per address within FAILURE_LIMIT.windowMs;
 * - a CIMD fetcher: `fetch(url)` answers what the case scripted, and counts calls;
 * - a logger that keeps every line, for the leak checks.
 */
import {
  ENTRY_STATUS, FAILURE_LIMIT, GATE_SURFACE, HOSTS, HTTP_REFUSAL, HTTP_STATUS, ID_REFUSAL, REFUSAL, REQUEST_GATE, checkName, isAgentId,
  nameKey,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'

const hostnameOf = (host) => (host ?? '').replace(/:\d+$/, '')
const isLoopbackName = (hostname) => HOSTS.loopbackNames.includes(hostname)
const header = (headers, name) => { const v = headers[name]; return Array.isArray(v) ? v[0] : v }

/** C-HTTP's gate, by its contract; `facts` are GateListenerFacts (host, secure, trustedHosts). */
export function fakeGate(facts) {
  const calls = []
  const admits = []
  return {
    calls,
    admits,
    check(req, surface) {
      calls.push({ method: req.method, path: req.path, surface, host: header(req.headers, REQUEST_GATE.headers.host), origin: header(req.headers, REQUEST_GATE.headers.origin) })
      const methods = REQUEST_GATE.routes[surface]?.[req.path]
      if (methods !== undefined && !methods.includes(req.method)) {
        return { pass: false, status: HTTP_STATUS.methodNotAllowed, headers: { [REQUEST_GATE.headers.allow]: methods.join(REQUEST_GATE.allowSeparator) }, body: null }
      }
      const host = header(req.headers, REQUEST_GATE.headers.host)
      const hostname = hostnameOf(host)
      const allowed = isLoopbackName(hostname) || hostname === facts.host || facts.trustedHosts.includes(hostname)
      const origin = header(req.headers, REQUEST_GATE.headers.origin)
      const scheme = isLoopbackName(hostname) ? HOSTS.loopbackScheme : HOSTS.remoteScheme
      const ownOrigin = `${scheme}//${host}`
      const originRefused = origin !== undefined && (REQUEST_GATE.originRule[surface] !== 'own-only' || origin !== ownOrigin)
      if (!allowed || originRefused) return { pass: false, status: HTTP_STATUS.forbidden, headers: {}, body: null }
      if (!isLoopbackName(facts.host) && !facts.secure) return { pass: false, status: HTTP_STATUS.serviceUnavailable, headers: {}, body: { error: HTTP_REFUSAL.insecureListener } }
      return { pass: true }
    },
    admit(req, surface, caller) {
      admits.push({ path: req.path, surface, caller })
      return { pass: true, done() {} }
    },
  }
}

/** C-TOKENS' registry: entries by test number `n`, keyed by `key(n)`. */
export function fakeTokens(key) {
  const entries = new Map()
  const listeners = new Set()
  const view = (e) => Object.freeze({ entryKey: e.entryKey, label: e.label, enabled: e.enabled, ref: e.ref, status: e.status, generation: e.generation, generated: false })
  const revoke = (e, kind) => { e.generation += 1; for (const l of listeners) l(e.entryKey, kind, e.generation) }
  return {
    add(n, value, { enabled = true, status = ENTRY_STATUS.ok } = {}) {
      entries.set(key(n), { entryKey: key(n), label: `entry ${n}`, ref: `ref-${n}`, enabled, status, value, generation: 1 })
      return view(entries.get(key(n)))
    },
    /** `silently`: while the connector is down nobody hears it, but the generation still moves (C-TOKENS persists it). */
    disable(n, { silently = false } = {}) { const e = entries.get(key(n)); e.enabled = false; if (silently) e.generation += 1; else revoke(e, 'disabled') },
    enable(n) { entries.get(key(n)).enabled = true },
    remove(n) { const e = entries.get(key(n)); entries.delete(key(n)); revoke(e, 'deleted') },
    match(value) {
      const e = [...entries.values()].find((x) => x.enabled && x.status === ENTRY_STATUS.ok && x.value === value)
      return e === undefined ? undefined : view(e)
    },
    get: (entryKey) => (entries.has(entryKey) ? view(entries.get(entryKey)) : undefined),
    list: () => [...entries.values()].map(view),
    onRevoked(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}

/** C-PAIR's store, by K1 `PairStore`. */
export function fakePairs() {
  const pairs = new Map()
  const listeners = new Set()
  const calls = []
  let principals = 0
  const others = (entryKey) => [...pairs.values()].filter((p) => p.entryKey !== entryKey)
  const put = (pair) => { pairs.set(pair.entryKey, Object.freeze(pair)); for (const l of listeners) l(); return pairs.get(pair.entryKey) }
  const nameHeld = (entryKey, name) => others(entryKey).some((p) => p.name !== null && nameKey(p.name) === nameKey(name))
  /** R-FIX-CONNECTOR F06: the next page bind or reconnect waits until `open()` (`holdNext`). */
  const holds = []
  const held = async (member) => {
    const at = holds.findIndex((h) => h.member === member)
    if (at < 0) return
    const [h] = holds.splice(at, 1)
    h.arrive()
    await h.opened
  }
  const newPair = (entryKey, id, name, now, client) => put({
    entryKey, principalKey: `principal-${(principals += 1)}`, id, name, pairedAt: now, lastSeenAt: null, ...client,
  })
  return {
    calls,
    list: () => [...pairs.values()],
    pairOf: (entryKey) => pairs.get(entryKey),
    byPrincipal: (principalKey) => [...pairs.values()].find((p) => p.principalKey === principalKey),
    /** Machine pairing (R-ID-03); a case uses it to set up "paired to a machine client". */
    async pair(entryKey, id, name, now) {
      calls.push(['pair', entryKey, id])
      const usable = name === undefined ? undefined : checkName(name)
      const stored = usable?.ok && !nameHeld(entryKey, usable.name) ? usable.name : null
      return newPair(entryKey, id, stored, now, {})
    },
    /**
     * The next `member` call (bindFromPage or reconnectFromPage) waits, before it writes, until
     * `open()`; `reached` resolves once it waits. Returns `{reached, open}`.
     */
    holdNext(member) {
      let arrive
      let open
      const h = { member, reached: new Promise((r) => { arrive = r }), opened: new Promise((r) => { open = r }) }
      h.arrive = arrive
      holds.push(h)
      return { reached: h.reached, open }
    },
    async bindFromPage(entryKey, id, name, client, now) {
      calls.push(['bindFromPage', entryKey, id, name, client])
      await held('bindFromPage')
      if (pairs.has(entryKey)) return { ok: false, code: REFUSAL.alreadyPaired }
      if (!isAgentId(id)) return { ok: false, code: ID_REFUSAL.idInvalid }
      if (others(entryKey).some((p) => p.id === id)) return { ok: false, code: REFUSAL.idTaken }
      let stored = null
      if (name !== undefined) {
        const checked = checkName(name)
        if (!checked.ok) return { ok: false, code: checked.code }
        if (nameHeld(entryKey, checked.name)) return { ok: false, code: REFUSAL.nameTaken }
        stored = checked.name
      }
      return { ok: true, pair: newPair(entryKey, id, stored, now, { clientIdUrl: client.clientIdUrl, redirectUri: client.redirectUri }) }
    },
    /** K1d: the same id keeps the principal and records the newest client; any other id is already-paired. */
    async reconnectFromPage(entryKey, id, client) {
      calls.push(['reconnectFromPage', entryKey, id, client])
      await held('reconnectFromPage')
      const p = pairs.get(entryKey)
      if (p === undefined) throw new TypeError(`reconnectFromPage of the unpaired entry ${entryKey}`)
      if (p.id !== id) return { ok: false, code: REFUSAL.alreadyPaired }
      return { ok: true, pair: put({ ...p, clientIdUrl: client.clientIdUrl, redirectUri: client.redirectUri }) }
    },
    async setName(principalKey, name) {
      const p = this.byPrincipal(principalKey)
      put({ ...p, name })
      return { ok: true, name }
    },
    seen(principalKey, now) { const p = this.byPrincipal(principalKey); if (p) put({ ...p, lastSeenAt: now }) },
    async remove(entryKey) { pairs.delete(entryKey); for (const l of listeners) l() },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}

/**
 * C-OAUTH's token store (K1d `OAuthTokenStore`: no `chainsOf`). `restart()` is a connector restart:
 * access tokens and codes go, refresh digests stay (Q-S7B-3 A).
 */
export function fakeOAuthStore() {
  let access = new Map()
  let codes = new Map()
  const refresh = new Map()
  const calls = []
  const revoke = (chainId) => {
    for (const [d, r] of refresh) if (r.chainId === chainId) refresh.delete(d)
    for (const [d, a] of access) if (a.chainId === chainId) access.delete(d)
  }
  return {
    calls,
    /** What the connector's storage holds: refresh digests and their records. */
    persisted: () => ({ refresh: [...refresh.entries()] }),
    accessTokens: () => [...access.entries()],
    restart() { access = new Map(); codes = new Map() },
    putAccess(digest, token) { calls.push(['putAccess', digest]); access.set(digest, token) },
    getAccess: (digest) => access.get(digest),
    putCode(digest, code) { calls.push(['putCode', digest]); codes.set(digest, code) },
    takeCode(digest) { calls.push(['takeCode', digest]); const c = codes.get(digest); codes.delete(digest); return c },
    async putRefresh(digest, record) {
      calls.push(['putRefresh', digest])
      // K1d-7: a rotation (a spent record) deletes the chain's older spent records.
      if (record.spentAt !== undefined) for (const [d, r] of refresh) if (d !== digest && r.chainId === record.chainId && r.spentAt !== undefined) refresh.delete(d)
      refresh.set(digest, record)
    },
    getRefresh: (digest) => refresh.get(digest),
    async revokeChain(chainId) { calls.push(['revokeChain', chainId]); revoke(chainId) },
    /** K1d-6: every chain of the entry with its access tokens, and its unredeemed codes; chainless access tokens stay. */
    async revokeEntryChains(entryKey) {
      calls.push(['revokeEntryChains', entryKey])
      for (const [d, r] of refresh) if (r.entryKey === entryKey) refresh.delete(d)
      for (const [d, a] of access) if (a.entryKey === entryKey && a.chainId !== undefined) access.delete(d)
      for (const [d, c] of codes) if (c.entryKey === entryKey) codes.delete(d)
    },
    async revokeEntry(entryKey, generation) {
      calls.push(['revokeEntry', entryKey, generation])
      for (const [d, r] of refresh) if (r.entryKey === entryKey && r.generation < generation) refresh.delete(d)
      for (const [d, a] of access) if (a.entryKey === entryKey && a.generation < generation) access.delete(d)
    },
  }
}

/** C-OAUTH's failure limiter, by K1 `FailureLimiter`. */
export function fakeLimiter() {
  const failures = []
  const checks = []
  const within = (now) => failures.filter((f) => now - f.now < FAILURE_LIMIT.windowMs)
  return {
    failures,
    checks,
    check(key, now) {
      checks.push({ key, now })
      const recent = within(now)
      const own = recent.filter((f) => f.key.remoteAddress === key.remoteAddress && f.key.clientId === key.clientId)
      const address = recent.filter((f) => f.key.remoteAddress === key.remoteAddress)
      const over = own.length >= FAILURE_LIMIT.perKeyPerWindow ? own : address.length >= FAILURE_LIMIT.perAddressPerWindow ? address : null
      return over === null ? { limited: false } : { limited: true, retryAfterMs: over[0].now + FAILURE_LIMIT.windowMs - now }
    },
    recordFailure(key, now) { failures.push({ key: { ...key }, now }) },
  }
}

/** A CIMD fetcher (`{fetch(clientId)}` → `{ok, doc}` / `{ok: false, reason}`), scripted per client id; an unscripted id fails. */
export function fakeCimd() {
  const answers = new Map()
  const calls = []
  return {
    calls,
    answer(url, result) { answers.set(url, result) },
    document(url, doc) { answers.set(url, { ok: true, doc }) },
    async fetch(url) { calls.push(url); return answers.get(url) ?? { ok: false, reason: 'unscripted' } },
  }
}

/** A logger (cordis-like methods) that keeps every line as text. */
export function fakeLogger() {
  const lines = []
  const record = (level) => (...args) => { lines.push({ level, text: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ') }) }
  const logger = { lines }
  for (const level of ['debug', 'info', 'warn', 'error', 'success']) logger[level] = record(level)
  return logger
}

/** Node-shaped timers that never fire by themselves: `fire(ms)` runs every pending timer of that delay. */
export function fakeTimers() {
  const pending = new Map()
  let ids = 0
  const add = (fn, ms, repeat) => { ids += 1; pending.set(ids, { fn, ms, repeat }); return ids }
  return {
    pending,
    setTimeout: (fn, ms) => add(fn, ms, false),
    setInterval: (fn, ms) => add(fn, ms, true),
    clearTimeout: (id) => pending.delete(id),
    clearInterval: (id) => pending.delete(id),
    delays: () => [...pending.values()].map((p) => p.ms),
    fire(ms) {
      for (const [id, p] of [...pending]) {
        if (p.ms !== ms) continue
        if (!p.repeat) pending.delete(id)
        p.fn()
      }
    },
  }
}

/** The fake clock (README "clock"): an injected `now`. */
export function fakeClock(t0) {
  let now = t0
  return { now: () => now, set(at) { now = at }, advance(ms) { now += ms } }
}

export const APPROVAL = GATE_SURFACE.approval
