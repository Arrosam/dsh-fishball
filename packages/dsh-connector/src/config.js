/**
 * The row's config: the connector's settings (design §0.7, §18.5 conn-OQ-20): its safety limits
 * (DESIGN §16) and the V3 settings (src/settings/schema.js). Every field is `.volatile()`, so DSH's
 * settings service edits it live without remounting the row (spike S21). DSH's own Plugins form of
 * `dsh-connector` and the connector's own settings page are the only places they change (D24).
 *
 * Each field is declared once here with its default, minimum and meaning. Every other module
 * reads the limits through `readLimits()`, so a value is never copied.
 */
import Schema from '@deepseek-ai/schemastery'
// The default of maxQueuedInputs has one owner, K1's QUEUE (data only, no DSH import).
import { QUEUE } from '../mcp-schema/constants.js'
import { SETTINGS_SCHEMA } from './settings/schema.js'

/** Minimum for counts and sizes. No limit has a maximum (conn-OQ-19). */
const MIN = Object.freeze({ count: 1 })

/**
 * One row per limit: [field, default, minimum, description]. Only the fields the connector's code
 * reads (conn-OQ-20). C-WIRE-2 removed the V2 broker's: maxPendingApprovals (the user, 2026-11-17:
 * "No cap on pending approvals"), list_user_messages' two ("list_user_messages is deleted"), the
 * audit's auditEntriesKept and rationaleChars (the user's answer: delete the V2 audit), the watches'
 * two, and requestUserMessageBytes and forwardExcerptBytes (V2's inbox notices, which V3's typed
 * events replace). A stored value of one is ignored (Q-M1: no migration).
 */
export const LIMITS = Object.freeze([
  ['maxQueuedInputs', QUEUE.maxQueuedInputs, MIN.count, 'Events that have arrived for an agent but it has not taken yet (messages, finish notices, contributed events).'],
  ['argumentExcerptBytes', 8192, MIN.count, 'How much of a requested tool call the managing agent sees, in bytes.'],
  ['maxMessageBytes', 65536, MIN.count, 'Size of one message to or from a managed session, in bytes.'],
  ['readSessionMessages', 12, MIN.count, 'Messages session_read returns.'],
  ['readSessionBytes', 12288, MIN.count, 'Bytes session_read returns.'],
].map(([field, defaultValue, min, description]) => Object.freeze({ field, defaultValue, min, description })))

/** The limits, plus the V3 settings (src/settings/schema.js: the token list, the approval port and the DSH name). */
export const Config = Schema.object({
  ...SETTINGS_SCHEMA,
  ...Object.fromEntries(LIMITS.map(({ field, defaultValue, min, description }) => [
    field,
    Schema.natural().min(min).default(defaultValue).description(description).volatile(),
  ])),
})

/**
 * A config field read now. A volatile field arrives as a live reference (`.get()`). A plain
 * value is accepted too, so direct construction in tests works the same way.
 */
function liveValue(config, field) {
  const raw = config?.[field]
  return raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw
}

/**
 * Current limit values. A value the schema would refuse (not a whole number at or above the
 * limit's minimum) reads as the default, so callers never see a value DSH's settings service
 * would reject.
 * @param config - the row config Cordis passed to apply().
 * @returns a frozen snapshot { field: number } read now.
 */
export function readLimits(config) {
  return Object.freeze(Object.fromEntries(LIMITS.map(({ field, defaultValue, min }) => {
    const value = liveValue(config, field)
    return [field, Number.isInteger(value) && value >= min ? value : defaultValue]
  })))
}
