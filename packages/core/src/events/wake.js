/**
 * The wake settings as core's delivery list reads them (WAKE, `contracts/constants.js`; the user's
 * design 2026-11-21). The caller passes the raw values (core's row: its live volatile settings, so a
 * change applies from the next event on, with no restart); they are checked here, at the boundary,
 * and anything out of bounds reads as its default, the same rule the row's schema applies to a bad
 * stored value. Pure: no clock, no timer.
 */
import { WAKE } from '../../contracts/constants.js'

const CLASS_WORDS = new Set(Object.values(WAKE.class))
const isWhole = (value, min) => Number.isSafeInteger(value) && value >= min
const isObject = (value) => value !== null && typeof value === 'object'

/**
 * @param {{quietWindowSeconds?: unknown, maxBatch?: unknown, classes?: unknown} | undefined} raw
 * @returns {Readonly<{windowMs: number, maxBatch: number, classes: Readonly<Record<string, string>>}>}
 *   the quiet window in milliseconds, the max batch (wake events), and every listed type's class:
 *   the defaults overlaid with each stored entry whose value is a class word.
 */
export function wakeSettings(raw) {
  const seconds = isWhole(raw?.quietWindowSeconds, WAKE.bounds.quietWindowSeconds) ? raw.quietWindowSeconds : WAKE.defaults.quietWindowSeconds
  const maxBatch = isWhole(raw?.maxBatch, WAKE.bounds.maxBatch) ? raw.maxBatch : WAKE.defaults.maxBatch
  const stored = isObject(raw?.classes) ? Object.entries(raw.classes).filter(([, word]) => CLASS_WORDS.has(word)) : []
  return Object.freeze({
    windowMs: seconds * WAKE.msPerSecond,
    maxBatch,
    classes: Object.freeze({ ...WAKE.defaults.classes, ...Object.fromEntries(stored) }),
  })
}

/** An event type's class; a type the settings do not list (another contributed event) wakes. */
export const classOf = (settings, type) => (Object.hasOwn(settings.classes, type) ? settings.classes[type] : WAKE.class.wake)
