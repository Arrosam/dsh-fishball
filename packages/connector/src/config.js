/**
 * The row's config: the connector's settings (design §0.7, §18.5 conn-OQ-20). They are its
 * safety limits (DESIGN §16) and the question mode. Every field is `.volatile()`, so DSH's
 * settings service edits it live without remounting the row (spike S21). DSH's own Plugins →
 * settings form of `fishball-connector` is the only place they change (D24). No instance reads
 * or writes them: contract v1 has no settings operation.
 *
 * Each field is declared once here with its default, minimum and meaning. Every other module
 * reads the limits through `readLimits()` and the mode through `readQuestionMode()`, so a value
 * is never copied.
 */
import Schema from '@deepseek-ai/schemastery'
import { QUESTION_MODE } from './constants.js'

/** Minimum for counts and sizes. No limit has a maximum (conn-OQ-19). */
const MIN = Object.freeze({ count: 1 })

/**
 * One row per limit: [field, default, minimum, description]. Only the fields the connector's
 * code still reads after the split (conn-OQ-20). The in-process agent's fields went with it, and
 * a stored value of one is ignored.
 */
export const LIMITS = Object.freeze([
  ['maxQueuedInputs', 200, MIN.count, 'Inputs (messages, finish notices, plugin events) that have arrived but Fishball has not read yet.'],
  ['maxActiveWatches', 50, MIN.count, 'Open "tell Fishball when this session finishes" requests.'],
  ['maxPendingApprovals', 8, MIN.count, 'Permission requests open at the same time: waiting for Fishball, or waiting for you in your pile; extra requests go to you in their session.'],
  ['approvalAnswerSeconds', 120, MIN.count, 'How long another session\'s permission request waits for Fishball before it goes to you.'],
  ['argumentExcerptBytes', 8192, MIN.count, 'How much of a requested tool call Fishball sees.'],
  ['maxMessageBytes', 65536, MIN.count, 'Size of one message to or from Fishball, and of one plugin event.'],
  ['auditEntriesKept', 500, MIN.count, 'Entries kept in each audit list (approvals, outbox, plugin changes).'],
  // Moved from constants in revision 11 (DESIGN §16 "Hard-coded limits moved to config"); defaults are the old values.
  ['requestUserMessageBytes', 2048, MIN.count, 'How much of your latest message in the asking session a permission request shows Fishball, in bytes.'],
  ['rationaleChars', 500, MIN.count, 'Characters of Fishball\'s rationale kept in the approval audit.'],
  ['watchesShown', 50, MIN.count, 'Watches the settings page and list_watches show.'],
  ['readSessionMessages', 12, MIN.count, 'Messages read_session returns.'],
  ['readSessionBytes', 12288, MIN.count, 'Bytes read_session returns.'],
  ['forwardExcerptBytes', 3072, MIN.count, 'How much of a session\'s last answer a forward or a watch notice carries, in bytes.'],
  // Revision 11 (rev11b): list_user_messages (your answer, Q-r11-list).
  ['userMessagesListed', 20, MIN.count, 'Messages list_user_messages returns to a managed session, newest first.'],
  ['userMessageExcerptChars', 1000, MIN.count, 'Characters of each excerpt list_user_messages returns.'],
].map(([field, defaultValue, min, description]) => Object.freeze({ field, defaultValue, min, description })))

/** The question mode's field (design §0.7): who answers managed sessions' questions. */
export const QUESTION_MODE_SETTING = Object.freeze({
  field: 'questionMode',
  defaultValue: QUESTION_MODE.auto,
  description: 'Who answers the questions and plan reviews of sessions Fishball manages: auto (Fishball, when your own words cover it), fishball (Fishball\'s judgement) or user (you).',
})

/** The modes DSH's form accepts; anything else is refused by the schema. */
const QUESTION_MODES = Object.freeze(Object.values(QUESTION_MODE))

/**
 * Limits: whole numbers at or above the limit's minimum. The mode: one of QUESTION_MODE.
 * schemastery refuses anything else, so DSH's form refuses it too.
 */
export const Config = Schema.object({
  ...Object.fromEntries(LIMITS.map(({ field, defaultValue, min, description }) => [
    field,
    Schema.natural().min(min).default(defaultValue).description(description).volatile(),
  ])),
  [QUESTION_MODE_SETTING.field]: Schema.union(QUESTION_MODES).default(QUESTION_MODE_SETTING.defaultValue).description(QUESTION_MODE_SETTING.description).volatile(),
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

/**
 * The question mode now. An unlisted value reads as the default, as readLimits does for a limit.
 * @param config - the row config Cordis passed to apply().
 * @returns one of QUESTION_MODE.
 */
export function readQuestionMode(config) {
  const value = liveValue(config, QUESTION_MODE_SETTING.field)
  return QUESTION_MODES.includes(value) ? value : QUESTION_MODE_SETTING.defaultValue
}

/** Every limit at its default: what applies before any config exists (module-level state). */
export const DEFAULT_LIMITS = readLimits(undefined)
