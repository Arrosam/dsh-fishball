/**
 * The fakes of C-ROUTE's injected ports (subject.mjs names each port). Each implements the K1
 * interface it stands for (`fishball-connector/mcp-schema/index.d.ts`) plus the test-only drivers
 * named in its comment; nothing here reads C-ROUTE's code.
 *
 * Keys follow FIXTURE: entry `fbtest-entry-<id>`, principal `fbtest-principal-<id>` (the same
 * formulas test/v3/c-http uses, so the end-to-end world's listen streams and these keys agree).
 */
import { ENTRY_STATUS, FIXTURE, REVOCATION } from './constants.mjs'

/** Calls every listener; one that throws does not stop the others (the K1c / K3 listener rule). */
function fire(listeners, ...args) {
  for (const listener of [...listeners]) {
    try { listener(...args) } catch { /* a listener's failure is its own */ }
  }
}
/** Adds `listener` to `set` and returns its idempotent disposer. */
function subscribe(set, listener) {
  set.add(listener)
  return () => { set.delete(listener) }
}

/**
 * K1 `TokenRegistry`: token entries in the native settings' list order (insertion order).
 * Drivers: `add(id)`, `disable(id)`, `remove(id)` (each revocation fires `onRevoked` as C-TOKENS does).
 */
export class FakeTokens {
  #entries = new Map()
  #revoked = new Set()
  add(id) {
    const entryKey = FIXTURE.entry(id)
    this.#entries.set(entryKey, Object.freeze({
      entryKey, label: FIXTURE.label(id), enabled: true, ref: FIXTURE.ref(id), status: ENTRY_STATUS.ok, generation: FIXTURE.generation, generated: false,
    }))
    return entryKey
  }
  #revoke(id, kind, next) {
    const entryKey = FIXTURE.entry(id)
    const entry = this.#entries.get(entryKey)
    if (next === undefined) this.#entries.delete(entryKey)
    else this.#entries.set(entryKey, Object.freeze({ ...entry, ...next(entry) }))
    fire(this.#revoked, entryKey, kind, entry.generation + 1)
  }
  disable(id) { this.#revoke(id, REVOCATION.disabled, (e) => ({ enabled: false, generation: e.generation + 1 })) }
  remove(id) { this.#revoke(id, REVOCATION.deleted) }
  match() { return undefined }
  get(entryKey) { return this.#entries.get(entryKey) }
  list() { return [...this.#entries.values()] }
  onRevoked(listener) { return subscribe(this.#revoked, listener) }
}

/**
 * K1 `PairStore` (the members C-ROUTE reads: `list`, `pairOf`, `byPrincipal`, `onChange`; plus
 * `setName` and `remove`, which fire `onChange` as C-PAIR does). Driver: `bind(id, name)`.
 */
export class FakePairs {
  #pairs = new Map()
  #changed = new Set()
  bind(id, name = null) {
    const entryKey = FIXTURE.entry(id)
    this.#pairs.set(entryKey, Object.freeze({ entryKey, principalKey: FIXTURE.principal(id), id, name, pairedAt: FIXTURE.epochMs, lastSeenAt: null }))
    fire(this.#changed)
    return FIXTURE.principal(id)
  }
  list() { return [...this.#pairs.values()] }
  pairOf(entryKey) { return this.#pairs.get(entryKey) }
  byPrincipal(principalKey) { return this.list().find((p) => p.principalKey === principalKey) }
  async setName(principalKey, name) {
    const pair = this.byPrincipal(principalKey)
    this.#pairs.set(pair.entryKey, Object.freeze({ ...pair, name }))
    fire(this.#changed)
    return { ok: true, name }
  }
  async remove(entryKey) {
    this.#pairs.delete(entryKey)
    fire(this.#changed)
  }
  seen() {}
  onChange(listener) { return subscribe(this.#changed, listener) }
}

/** K1 `Presence` (CONNECTED: an open listen stream). Drivers: `connect(key)`, `disconnect(key)`. */
export class FakePresence {
  #connected = new Set()
  #changed = new Set()
  connect(key) { this.#connected.add(key); fire(this.#changed, key, true) }
  disconnect(key) { this.#connected.delete(key); fire(this.#changed, key, false) }
  isConnected(key) { return this.#connected.has(key) }
  onChange(listener) { return subscribe(this.#changed, listener) }
}

/**
 * The connector's live routing settings: `routing.fishballToken` (an EntryKey or undefined) and
 * `maxQueuedInputs` (undefined = the K1 default). Driver: `set(patch)` fires `onChange`.
 */
export class FakeSettings {
  #values = { fishballToken: undefined, maxQueuedInputs: undefined }
  #changed = new Set()
  get() { return { ...this.#values } }
  set(patch) { this.#values = { ...this.#values, ...patch }; fire(this.#changed) }
  onChange(listener) { return subscribe(this.#changed, listener) }
}

/**
 * The session source (Fishball 2026-11-14 #7): which sessions exist, and their turn ends and state
 * changes. Drivers: `add(id)`, `finishTurn(id, {running, queued})`, `changeState(id, {running, pendingInteraction})`.
 */
export class FakeSessions {
  #sessions = new Set()
  #turns = new Set()
  #states = new Set()
  add(id) { this.#sessions.add(id); return id }
  exists(id) { return this.#sessions.has(id) }
  onTurnFinished(listener) { return subscribe(this.#turns, listener) }
  onState(listener) { return subscribe(this.#states, listener) }
  finishTurn(id, { running = false, queued = false } = {}) { fire(this.#turns, id, { running, queued }) }
  changeState(id, { running = false, pendingInteraction = false } = {}) { fire(this.#states, id, { running, pendingInteraction }) }
}

/**
 * The mailbox port: a real K1 `Mailbox` (C-MAILBOX's) plus the
 * room-freed signal `onAcked(listener(principalKey, receipts))` (Fishball 2026-11-14 #3), fired after
 * each successful `ack` with the receipts that `ack` (the `inbox_ack` argument) acknowledged, so a
 * listener knows which events left the mailbox. The dev session aligns the real port; this wrapper
 * is the agreed shape.
 */
export function mailboxPort(real) {
  const acked = new Set()
  return {
    commit: (...a) => real.commit(...a),
    poll: (...a) => real.poll(...a),
    async ack(principalKey, receipts) {
      const result = await real.ack(principalKey, receipts)
      if (result?.ok) fire(acked, principalKey, receipts)
      return result
    },
    summary: (...a) => real.summary(...a),
    retire: (...a) => real.retire(...a),
    retireContributor: (...a) => real.retireContributor(...a),
    hold: (...a) => real.hold(...a),
    release: (...a) => real.release(...a),
    drop: (...a) => real.drop(...a),
    onAcked: (listener) => subscribe(acked, listener),
  }
}

/**
 * mailboxPort with a slow commit on demand: the C-MAILBOX commit of an offer or ask still in
 * flight, so a row can call `settle` (or a release) while that offer's step is on the managed
 * chain. Driver: `holdNext(match(recipient, draft))` → `{reached, open()}`. The first commit after
 * the call that `match`es waits until `open()`; `reached` resolves with `{recipient, draft}` once it
 * is waiting. `open()` also cancels a hold no commit has reached; `openAll()` opens every hold
 * (a row's cleanup, so a failed row never leaves the chain blocked for close()). Every other member
 * is mailboxPort's.
 */
export function gatedMailboxPort(real) {
  const port = mailboxPort(real)
  const holds = []
  const opens = []
  return {
    openAll() { for (const open of opens) open() },
    ...port,
    async commit(recipient, draft) {
      const at = holds.findIndex((h) => h.match(recipient, draft))
      if (at >= 0) {
        const [hold] = holds.splice(at, 1)
        hold.arrive({ recipient, draft })
        await hold.opened
      }
      return port.commit(recipient, draft)
    },
    holdNext(match) {
      let arrive
      let open
      const hold = { match, reached: new Promise((resolve) => { arrive = resolve }), opened: new Promise((resolve) => { open = resolve }) }
      hold.arrive = arrive
      holds.push(hold)
      const release = () => {
        const at = holds.indexOf(hold)
        if (at >= 0) holds.splice(at, 1)
        open()
      }
      opens.push(release)
      return { reached: hold.reached, open: release }
    },
  }
}

/** A cordis-style logger that records every line by level. */
export function recordingLogger() {
  const lines = []
  const at = (level) => (...args) => { lines.push({ level, text: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }) }
  return { lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') }
}

/** An injected clock; `advance` moves it. */
export function fakeClock(start = FIXTURE.epochMs) {
  let ms = start
  return { now: () => ms, advance: (by) => { ms += by } }
}
