/**
 * The mailbox port of the C-REVOKE world: the C-ROUTE suite's mailboxPort (a real C-MAILBOX plus
 * `onAcked`) with a journal of what reaches the mailbox and two test-only drivers. Nothing here
 * reads C-ROUTE's or C-MAILBOX's code.
 *
 * - `journal`: one frozen entry per completed `retire` (`{op, principalKey, eventId, reason,
 *   outcome}`), per `commit` (`{op: OP.freshRetirement, principalKey, retiredEventId, reason}` for
 *   a `retirement` draft, which only routing's fresh retirements are, else `{op: OP.commit, …}`),
 *   and per `hold` / `release` (on completion) and `drop` (on its start, so every entry before it
 *   ran before the drop began).
 * - `holdRetires()` → `{reached, open()}`: every `retire` after the call waits until `open()`;
 *   `reached` resolves once the first one waits (a slow retirement, for "resolves only after every
 *   retirement has run").
 * - `failRetireOf(eventId)` / `failFreshRetirementOf(eventId)`: that retire, or the fresh
 *   `retirement` commit naming that event, rejects (a retirement that fails).
 */
import { mailboxPort } from '../routing/fakes.mjs'
import { EVENT_TYPE, MISUSE, OP, PHASE, TIMER } from './constants.mjs'

/** `basePort` builds the C-ROUTE suite's port over `real` (mailboxPort, or lateAckPort for the ack race). */
export function revocationPort(real, basePort = mailboxPort) {
  const base = basePort(real)
  const journal = []
  const failing = { retire: new Set(), fresh: new Set() }
  let gate = null
  const log = (entry) => { journal.push(Object.freeze(entry)) }
  const fail = (entry) => { log({ ...entry, failed: true }); throw new Error(MISUSE.failure) }
  return {
    ...base,
    journal,
    failRetireOf(eventId) { failing.retire.add(eventId) },
    failFreshRetirementOf(eventId) { failing.fresh.add(eventId) },
    holdRetires() {
      let arrive
      let open
      const reached = new Promise((resolve) => { arrive = resolve })
      const opened = new Promise((resolve) => { open = resolve })
      gate = { arrive, opened }
      return { reached, open: () => { gate = null; open() } }
    },
    async retire(principalKey, eventId, reason) {
      const waiting = gate
      if (waiting !== null) { waiting.arrive(); await waiting.opened }
      if (failing.retire.has(eventId)) fail({ op: OP.retire, principalKey, eventId, reason })
      const outcome = await base.retire(principalKey, eventId, reason)
      log({ op: OP.retire, principalKey, eventId, reason, outcome })
      return outcome
    },
    async commit(recipient, draft) {
      const fresh = draft?.type === EVENT_TYPE.retirement
      const entry = fresh
        ? { op: OP.freshRetirement, principalKey: recipient, retiredEventId: draft.payload?.retiredEventId, reason: draft.payload?.reason }
        : { op: OP.commit, principalKey: recipient, type: draft?.type }
      if (fresh && failing.fresh.has(entry.retiredEventId)) fail(entry)
      const result = await base.commit(recipient, draft)
      log({ ...entry, result })
      return result
    },
    async hold(principalKey, now) { await base.hold(principalKey, now); log({ op: OP.hold, principalKey }) },
    async release(principalKey) { await base.release(principalKey); log({ op: OP.release, principalKey }) },
    drop(principalKey) { log({ op: OP.drop, principalKey }); return base.drop(principalKey) },
  }
}

// ------------------------------------------------------------------------------------------------
// Step 2: the revocation module's ports (subject.mjs revocationModuleWorld wires them)

/**
 * One journal of every port call the revocation module makes, in the order they happen: a `call`
 * entry when the call starts, then `done` (with its result) or `failed`. Every entry carries the
 * call's arguments and the port label (constants.mjs PORT). Test-only drivers:
 * - `failNext(label, times)`: the next `times` calls of `label` reject (before reaching the port);
 * - `gateNext(label)` → `{reached, open()}`: the next call of `label` waits until `open()`;
 *   `reached` resolves once it waits. `openAll()` opens every gate (a row's cleanup).
 */
export class PortCalls {
  entries = []
  #failing = new Map()
  #gates = new Map()
  #opens = []
  failNext(label, times = 1) { this.#failing.set(label, (this.#failing.get(label) ?? 0) + times) }
  gateNext(label) {
    let arrive
    let open
    const reached = new Promise((resolve) => { arrive = resolve })
    const opened = new Promise((resolve) => { open = resolve })
    this.#gates.set(label, { arrive, opened })
    this.#opens.push(open)
    return { reached, open }
  }
  openAll() { for (const open of this.#opens) open() }
  #log(label, phase, args, extra) { this.entries.push(Object.freeze({ label, phase, args, ...extra })) }
  /** `fn` as the async port method `label`: journaled, failable and gateable. */
  wrap(label, fn) {
    return async (...args) => {
      this.#log(label, PHASE.call, args)
      const gate = this.#gates.get(label)
      if (gate !== undefined) { this.#gates.delete(label); gate.arrive(); await gate.opened }
      const left = this.#failing.get(label) ?? 0
      if (left > 0) {
        this.#failing.set(label, left - 1)
        this.#log(label, PHASE.failed, args)
        throw new Error(MISUSE.failure)
      }
      try {
        const result = await fn(...args)
        this.#log(label, PHASE.done, args, { result })
        return result
      } catch (error) {
        this.#log(label, PHASE.failed, args)
        throw error
      }
    }
  }
  /** `fn` as the synchronous port method `label` (closeEntry, liveAsksOf): journaled only. */
  wrapSync(label, fn) {
    return (...args) => {
      this.#log(label, PHASE.call, args)
      const result = fn(...args)
      this.#log(label, PHASE.done, args, { result })
      return result
    }
  }
  /** The entries of `label` in `phase` (default: the calls), optionally only those whose first argument is `first`. */
  of(label, phase = PHASE.call, first) {
    return this.entries.filter((e) => e.label === label && e.phase === phase && (first === undefined || e.args[0] === first))
  }
  /** The index of the `nth` (0-based) entry of `label` in `phase` naming `first` (−1 when there is none). */
  indexOf(label, phase, first, nth = 0) {
    const found = this.of(label, phase, first)[nth]
    return found === undefined ? -1 : this.entries.indexOf(found)
  }
  /** Calls that have neither resolved nor rejected yet. */
  unsettled() {
    const settled = this.entries.filter((e) => e.phase !== PHASE.call).length
    return this.entries.length - 2 * settled
  }
}

/**
 * The `timers` port over the world's fake clock. It records every delay it is given; like Node's
 * setTimeout, a delay above TIMER.maxDelayMs is not honoured (it is due at once), so a module
 * that arms a 30-day timer is caught both by `delays` and by firing too early. Drivers:
 * `pending()` lists the armed timers, `advance(ms, afterEach)` moves the clock, firing each timer
 * due by then in due order with the clock at its due time (never moved back for an overdue one),
 * and awaits `afterEach()` after each, so work a callback starts (and a re-arm after it) settles.
 */
export class FakeTimers {
  delays = []
  #clock
  #next = 1
  #pending = new Map()
  constructor(clock) { this.#clock = clock }
  setTimeout = (fn, ms) => {
    this.delays.push(ms)
    const delay = ms > TIMER.maxDelayMs ? 0 : ms
    // An object handle with Node's no-op members, in case the module unrefs its timers.
    const handle = Object.freeze({ id: this.#next++, unref() { return this }, ref() { return this }, hasRef: () => false })
    this.#pending.set(handle, { fn, at: this.#clock.now() + delay, delay: ms })
    return handle
  }
  clearTimeout = (handle) => { this.#pending.delete(handle) }
  pending() { return [...this.#pending.values()].map(({ at, delay }) => ({ at, delay })) }
  async advance(ms, afterEach) {
    const end = this.#clock.now() + ms
    for (;;) {
      const due = [...this.#pending.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at || a[0].id - b[0].id)[0]
      if (due === undefined) break
      const [handle, timer] = due
      this.#pending.delete(handle)
      if (timer.at > this.#clock.now()) this.#clock.advance(timer.at - this.#clock.now())
      timer.fn()
      await afterEach()
    }
    if (end > this.#clock.now()) this.#clock.advance(end - this.#clock.now())
  }
}

