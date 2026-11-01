/**
 * The row's config: Fishball's safety limits (DESIGN §16). Every field is `.volatile()` so
 * DSH's settings service edits it live without remounting the row (spike S21), and the
 * Plugins page form shows it. Only the user changes these; Fishball has no tool for it.
 *
 * Each limit is declared once here with its default, minimum and meaning; every other
 * module reads limits through `readLimits()` so a value is never copied.
 */
import Schema from '@deepseek-ai/schemastery'

/**
 * Minimum for counts and sizes, and for hourly caps (where 0 turns the cap off). The reply cap's
 * share is at least 2, so the automatic reply cap is at most half a smaller window (the user's decision,
 * 2026-11-01): at 1 the cap would fill the whole window and leave no room for the conversation.
 */
const MIN = Object.freeze({ count: 1, hourlyCap: 0, replyCapShare: 2 })

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
  // Moved from constants in revision 11 (DESIGN §16 "Hard-coded limits moved to config"); defaults are the old values.
  ['requestUserMessageBytes', 2048, MIN.count, 'How much of your latest message in the asking session a permission request shows Fishball, in bytes.'],
  ['rationaleChars', 500, MIN.count, 'Characters of Fishball\'s rationale kept in the approval audit.'],
  ['approvalsShown', 20, MIN.count, 'Approval audit entries the settings page shows.'],
  ['intakeRowsShown', 20, MIN.count, 'Intake queue rows the settings page shows.'],
  ['outboxShown', 20, MIN.count, 'Outbox entries the settings page shows.'],
  ['watchesShown', 50, MIN.count, 'Watches the settings page and list_watches show.'],
  ['readSessionMessages', 12, MIN.count, 'Messages read_session returns.'],
  ['readSessionBytes', 12288, MIN.count, 'Bytes read_session returns.'],
  ['forwardExcerptBytes', 3072, MIN.count, 'How much of a session\'s last answer a forward or a watch notice carries, in bytes.'],
  ['pluginHistoryShown', 10, MIN.count, 'Changes a plugin page shows.'],
  ['settingsPromptValueBytes', 200, MIN.count, 'Bytes of each old and new value in set_plugin_settings\' permission request.'],
  ['replyCapShare', 8, MIN.replyCapShare, 'With a smaller context window, the automatic reply-length cap is one in this many of its tokens.'],
  // At 20,000 tokens one eighth is 2,500, as in spike S5, so a summary of that length fits.
  ['headroomShare', 8, MIN.count, 'With a smaller context window, compaction headroom (and the summary\'s cap) is one in this many of its tokens, at most DSH\'s 65,536.'],
  // Below this the reply and summary caps would be a few hundred tokens; it bounds a save made
  // before any request has measured the prompt and tools (P4 review M2).
  ['minWindowTokens', 4096, MIN.count, 'The smallest context window you can set, in tokens.'],
  // DSH's plugin manager has no such setting; its other package bounds are read from DSH (src/fishball-plugin-manager.js).
  ['pluginManagerStartMs', 30000, MIN.count, 'How long Fishball\'s plugin manager may take to start before a package operation gives up, in milliseconds.'],
  // Revision 11 (rev11b): list_user_messages (your answer, Q-r11-list).
  ['userMessagesListed', 20, MIN.count, 'Messages list_user_messages returns to a managed session, newest first.'],
  ['userMessageExcerptChars', 1000, MIN.count, 'Characters of each excerpt list_user_messages returns.'],
  // Revision 11 (rev11c): S37's fixture value, so the composer stays in view below the pile.
  ['pileMaxHeightVh', 45, MIN.count, 'Height of your pile of waiting requests above Fishball\'s composer, as a percentage of the window height; past it the pile scrolls.'],
  ['defaultReplyCapTokens', 32000, MIN.count, 'The most the automatic reply-length cap can be with a smaller context window; your own reply cap still wins.'],
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

/** Every limit at its default: what applies before any config exists (module-level state). */
export const DEFAULT_LIMITS = readLimits(undefined)
