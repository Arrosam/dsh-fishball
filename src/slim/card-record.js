/**
 * The card record (T08/T09, the user's request 2026-11-06): one visible row each time a card a
 * session raised (a question, a plan review or a permission request) ends, kept in two places:
 * - in the asking session's own log, at the point it ended (src/card-records.js writes it);
 * - in Fishball's chat, with the asking session named (src/slim/child/chat.js writes it).
 * Nothing lives in settings.
 *
 * The row is a DSH plugin record (`appendPluginRecord`): DSH persists, forks and resumes it with
 * the session and sends it to the browser, but never projects it into a model request, so the
 * record adds no context to either agent. The browser draws it through one conversation
 * definition registered by client.js (keep the type and vocabularies there in step with these).
 *
 * The main host and the child both import this file (the child snapshot copies src/slim).
 *
 * Record data, version 1 (every text is plain text and already cut to the contract's caps):
 *   v          1
 *   id         this record's own id (also the inbox dedupe key)
 *   cardId     the card's id (apr_…, qst_…, oqn_…, prm_…)
 *   kind       KIND
 *   at         epoch ms of the end
 *   by         BY, or absent for a closure
 *   place      PLACE where the user answered, or absent (Fishball's answer, a closure)
 *   outcome    OUTCOME
 *   own        true for Fishball's own question to the user (ask_user)
 *   from       { sessionId, title } — only in Fishball's copy, which names the asking session
 *   questions  [{ header?, question, options? }] for a question or plan review
 *   answer     the chosen labels and custom text, joined; absent when skipped
 *   tool, reason, arguments, argumentsStatus   for a permission request
 *   note       the user's Reject note, or Fishball's reason for its own decision
 *   closed     the user-facing reason a card closed without an answer
 */
export const CARD_RECORD = Object.freeze({
  type: 'plugin:fishball/card-record',
  version: 1,
  /** The main row's provider event the slim relay turns into the RECORD_ITEM inbox item. */
  event: 'card-record',
  kind: Object.freeze({ permission: 'permission', question: 'question', planReview: 'plan-review' }),
  by: Object.freeze({ user: 'user', fishball: 'fishball' }),
  place: Object.freeze({ pile: 'pile', session: 'session' }),
  outcome: Object.freeze({ allowed: 'allowed', granted: 'granted', rejected: 'rejected', answered: 'answered', skipped: 'skipped', closed: 'closed' }),
})
