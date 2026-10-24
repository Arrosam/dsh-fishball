/**
 * The row's config: Fishball's safety limits (DESIGN §16). Every field is `.volatile()` so
 * DSH's settings service edits it live without remounting the row (spike S21), and the
 * Plugins page form shows it. Only the user changes these; Fishball has no tool for it.
 *
 * Each limit is declared once here with its default, minimum and meaning; every other
 * module reads limits through `readLimits()` so a value is never copied.
 */
import Schema from '@deepseek-ai/schemastery'

/** Minimum for counts and sizes, and for hourly caps (where 0 turns the cap off). */
const MIN = Object.freeze({ count: 1, hourlyCap: 0 })

/** One row per limit: [field, default, minimum, description]. */
export const LIMITS = Object.freeze([
  ['maxQueuedInputs', 200, MIN.count, 'Inputs (messages, finish notices, plugin events) that have arrived but Fishball has not read yet.'],
  ['maxActiveWatches', 50, MIN.count, 'Open "tell Fishball when this session finishes" requests.'],
  ['maxSourcesPerPlugin', 8, MIN.count, 'Separate feeds one plugin can register.'],
  ['maxFishballOnlyPlugins', 32, MIN.count, 'Plugins mounted in Fishball\'s private tree at the same time.'],
  ['wakeupsPerHour', 60, MIN.hourlyCap, 'Times an input other than your message or a permission request starts a Fishball turn from idle. 0 = no cap.'],
  ['messagesPerHour', 30, MIN.hourlyCap, 'message_session calls per hour. 0 = no cap.'],
  ['sessionsPerHour', 10, MIN.hourlyCap, 'start_session calls per hour. 0 = no cap.'],
  ['maxPendingApprovals', 8, MIN.count, 'Permission requests Fishball decides at the same time; extra requests go to you.'],
  ['approvalAnswerSeconds', 120, MIN.count, 'How long another session\'s permission request waits for Fishball before it goes to you.'],
  ['argumentExcerptBytes', 8192, MIN.count, 'How much of a requested tool call Fishball sees.'],
  ['maxMessageBytes', 65536, MIN.count, 'Size of one message to or from Fishball, and of one plugin event.'],
  ['auditEntriesKept', 500, MIN.count, 'Entries kept in each audit list (approvals, outbox, plugin changes).'],
].map(([field, defaultValue, min, description]) => Object.freeze({ field, defaultValue, min, description })))

/** Whole numbers at or above the limit's minimum; schemastery rejects anything else. */
export const Config = Schema.object(Object.fromEntries(LIMITS.map(({ field, defaultValue, min, description }) => [
  field,
  Schema.natural().min(min).default(defaultValue).description(description).volatile(),
])))

/**
 * Current limit values. A volatile field arrives as a live reference (`.get()`); a plain
 * value is accepted too so the function also serves direct construction in tests. A value
 * the schema would refuse (not a whole number at or above the limit's minimum) reads as
 * the default, so callers never see a value DSH's settings service would reject.
 * @param config - the row config Cordis passed to apply().
 * @returns a frozen snapshot { field: number } read now.
 */
export function readLimits(config) {
  return Object.freeze(Object.fromEntries(LIMITS.map(({ field, defaultValue, min }) => {
    const raw = config?.[field]
    const value = raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw
    return [field, Number.isInteger(value) && value >= min ? value : defaultValue]
  })))
}
