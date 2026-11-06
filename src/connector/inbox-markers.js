/**
 * The inbox system items T09 adds on top of the frozen §5.2 `inbox.push` payload, shared by the
 * main host and the child. The child snapshot copies `src/slim`, so both sides import one copy:
 * a host-side module (src/approvals.js through src/card-lifecycle.js) must not be the only home,
 * because the child does not ship it.
 *
 * `approval.settled` can carry neither a question's answer words nor a card's closure reason
 * (§5.2), so each arrives as inbox text with its marker; every consumer takes its own items by
 * marker and declines the rest (src/slim/child/inbox.js, src/slim/child/approvals.js).
 */

/** A question's answer: the user answered a question Fishball sent them (the main DSH's pile). */
export const QUESTION_ANSWER = Object.freeze({
  kind: 'system',
  dedupePrefix: 'question-answer:',
  fallback: 'The user answered the question you sent them.',
  text: (questionId, words) => '[question answer ' + questionId + '] ' + words,
  pattern: /^\[question answer ([^\]\s]+)\] ([\s\S]*)$/,
})

/**
 * Fishball's own question was answered: the main row's provider event for it (src/own-questions.js).
 * Its words travel as the QUESTION_ANSWER item above, the carrier a question Fishball sent to the
 * user already uses, so the child shows one answer row whichever card the user answered.
 */
export const OWN_ANSWER = Object.freeze({ event: 'own-answer' })

/**
 * One card record for Fishball's chat (src/slim/card-record.js): the record's JSON after the
 * marker. The child's inbox row takes it (src/slim/child/inbox.js), appends the record to
 * Fishball's session and, for the user's own answer, tells Fishball the answer's words.
 */
export const RECORD_ITEM = Object.freeze({
  kind: 'system',
  dedupePrefix: 'card-record:',
  text: (record) => '[card record] ' + JSON.stringify(record),
  pattern: /^\[card record\] ([\s\S]+)$/,
})

/** A card's closure: it left the user's pile without being answered, and this is why. */
export const CARD_CLOSED = Object.freeze({
  /** The slim relay's provider event and the inbox marker's name. */
  event: 'closed',
  kind: 'system',
  dedupePrefix: 'card-closed:',
  pattern: /^\[card closed ([^\]\s]+)\] ([\s\S]*)$/,
  /** The inbox text the host sends (no line breaks: one system row in the child's chat). */
  text: (id, reason) => '[card closed ' + id + '] ' + reason,
})
