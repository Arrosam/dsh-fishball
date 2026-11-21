/**
 * Window offers (the user, 2026-11-21: "decide by capability, not by identity"): which connected
 * agents can show their own window in this DSH, so dsh-connector-ui draws one sidebar entry each.
 * The connector cannot see what an agent is, and an agent's own claim of being Fishball proves
 * nothing a window needs; only a row of this DSH that can actually open an agent's window knows
 * it can. So such a row (today the instance, through dsh-connector-ui's host half) offers a
 * source naming the token entries whose agent it can open, and the UI backend lists exactly the
 * online, enabled and paired principals of those entries (state.js `windows`). An agent no source
 * names gets no entry, whatever it is; one a source names gets one, whatever it is.
 *
 * A source is `{entries() → Iterable<EntryKey>, onChange(listener) → dispose}`. Entry keys, not
 * principal keys: the offering row knows the token entry it set up, and a principal key exists only
 * once that entry pairs (handover.d.ts). Every source's entries are read at each snapshot, so a
 * source never has to push its whole state, only say that it changed.
 */
import { MISUSE } from './constants.js'

const isFunction = (value) => typeof value === 'function'
const isSource = (source) => source !== null && typeof source === 'object' && isFunction(source.entries) && isFunction(source.onChange)

/**
 * @param {object} deps
 * @param deps.changed - called when a source is offered, changes or goes
 * @returns `{offer(source) → dispose, claims(entryKey) → boolean, close()}`
 */
export function createWindowOffers({ changed }) {
  /** source → its onChange disposer */
  const offers = new Map()
  let closed = false

  /** Withdraws one source once; a throwing disposer of the source's own subscription changes nothing here. */
  function withdraw(source) {
    const unfollow = offers.get(source)
    if (!offers.delete(source)) return false
    try { unfollow?.() } catch { /* the source's own teardown already dropped it */ }
    return true
  }

  return Object.freeze({
    offer(source) {
      if (!isSource(source)) throw new TypeError(MISUSE.windowSource)
      if (closed) throw new Error(MISUSE.closed)
      // The same source offered twice is one offer: the first disposer withdraws it.
      if (!offers.has(source)) {
        // Subscribed before it counts, so a source whose onChange throws is never half offered.
        const unfollow = source.onChange(() => { if (offers.has(source)) changed() })
        offers.set(source, unfollow)
        changed()
      }
      return () => { if (withdraw(source)) changed() }
    },
    /** Whether any source names `entryKey` now. A source that throws names nothing. */
    claims(entryKey) {
      if (typeof entryKey !== 'string') return false
      for (const source of offers.keys()) {
        try { if ([...source.entries()].includes(entryKey)) return true } catch { /* names nothing this time */ }
      }
      return false
    },
    close() {
      closed = true
      for (const source of [...offers.keys()]) withdraw(source)
    },
  })
}
