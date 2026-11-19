/**
 * A Map whose stale entries are dropped by a full sweep once its size has doubled since the last
 * one (SWEEP): sweeping stays amortised O(1) per insert, and no in-memory table of this module
 * (access tokens, codes, the sliding-window logs) grows without bound when a client never comes
 * back or rotates its key. Entries are also dropped by their owners when they are read stale.
 */
import { SWEEP } from './constants.js'

/**
 * @param isStale - `(value, now) => boolean`; `now` is the time of the insert that triggers the
 *   sweep (this module keeps no clock of its own)
 * @returns `{map, set(key, value, now)}`: `map` is the live Map for reads and deletes
 */
export function createSweptMap(isStale) {
  const map = new Map()
  let sweepAt = SWEEP.floor
  return Object.freeze({
    map,
    set(key, value, now) {
      map.set(key, value)
      if (map.size < sweepAt) return
      for (const [stored, held] of [...map]) if (isStale(held, now)) map.delete(stored)
      sweepAt = Math.max(SWEEP.floor, map.size * SWEEP.growthFactor)
    },
  })
}
