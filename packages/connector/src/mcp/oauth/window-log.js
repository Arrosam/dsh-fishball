/**
 * A sliding-window event log per key, in memory, with an injected clock: the one counting rule of
 * the token endpoint's request-rate limit (K1 RATE_LIMITS) and of the shared failure limit (K1
 * FAILURE_LIMIT). An event at `t` counts at `now` while `t > now - windowMs` (S7b's limiter), so
 * an event leaves the window exactly `windowMs` after it happened.
 */
import { SWEEP } from './constants.js'

const NONE = Object.freeze([])

/**
 * @param windowMs - the window length
 * @returns `{count(key, now), retryAfterMs(key, now, limit), add(key, now)}`
 */
export function createWindowLog(windowMs) {
  const logs = new Map()
  let sweepAt = SWEEP.floor

  /** The key's events still in the window at `now`, oldest first; forgets a key with none. */
  function live(key, now) {
    const times = logs.get(key)
    if (times === undefined) return NONE
    // A filter rather than a shift from the front: an injected clock may step back, so the stored
    // order is not trusted to be the time order.
    const kept = times.filter((time) => time > now - windowMs)
    if (kept.length === 0) logs.delete(key)
    else logs.set(key, kept)
    return kept
  }

  /** Drops every key with no event left in the window, once the map doubled since the last sweep. */
  function sweep(now) {
    if (logs.size < sweepAt) return
    for (const key of [...logs.keys()]) live(key, now)
    sweepAt = Math.max(SWEEP.floor, logs.size * SWEEP.growthFactor)
  }

  return Object.freeze({
    count: (key, now) => live(key, now).length,

    /**
     * Milliseconds until the key holds fewer than `limit` events, assuming no new one: the
     * `(count - limit + 1)`-th oldest event has to leave the window. 0 when it already holds fewer.
     */
    retryAfterMs(key, now, limit) {
      const times = [...live(key, now)].sort((a, b) => a - b)
      if (times.length < limit) return 0
      return times[times.length - limit] + windowMs - now
    },

    add(key, now) {
      logs.set(key, [...live(key, now), now])
      sweep(now)
    },
  })
}
