/**
 * A decision card's life in the user's pile (DESIGN §7a.6, §10e; the slim child's T09 cards).
 *
 * One rule owns every card: once it is in the user's pile, nothing schedules a timer. The only
 * window Fishball's code puts on a card is `approvalAnswerSeconds` (src/config.js), and it decides
 * only whether the card moves from Fishball to the user at all; a card that moved has no deadline.
 * A card therefore ends only when:
 * - the user answers it, on the card or earlier in the session's own prompt (CARD_END.user,
 *   CARD_END.inSession);
 * - the originating session cancels or withdraws the call (cancelled), its turn ends
 *   (session-ended), it leaves Fishball's management (released), it stops or dismisses its
 *   question (dismissed), or the question goes back to its own card (back);
 * - Fishball or its Permission requests row goes off (off); or
 * - Fishball withdraws its own request (withdrawn).
 * Every end the user did not answer reaches the isolated Fishball through the inbox marker
 * (CARD_CLOSED in src/slim/inbox-markers.js), whose chat shows "closed: <reason>", so a card never
 * disappears unseen. Nothing here arms a timer: a card leaves only through the ends above.
 *
 * Cards are stored while they wait (src/pile.js, T08): a main-DSH restart ends every turn, so the
 * request a card waited on is gone when the next process starts. The card is still rebuilt into
 * the pile, and its owner closes it with `restarted` (src/pile.js, src/questions.js); the closure
 * line says why. A question DSH still holds (a continued one, found by src/questions.js rebuild)
 * is the one card that is answerable again: it is re-filed under its old id before it is closed.
 */
import { CARD_END } from './constants.js'
import { CARD_CLOSED } from './slim/inbox-markers.js'

/** Why a card ended without the user's answer, in the user's words. */
export const CARD_CLOSE = Object.freeze({
  [CARD_END.cancelled]: 'the asking session cancelled its call',
  [CARD_END.sessionEnded]: 'the asking session ended',
  [CARD_END.dismissed]: 'the session stopped or dismissed it',
  [CARD_END.back]: 'the question went back to its own session',
  [CARD_END.unavailable]: 'its session could not take an answer',
  [CARD_END.released]: 'the session left Fishball\'s management',
  [CARD_END.off]: 'Fishball or its permission requests were turned off',
  [CARD_END.withdrawn]: 'Fishball withdrew its own request',
  [CARD_END.restarted]: 'DSH restarted, so the call it waited on ended',
})

/** Whether this end is a closure without the user's answer (CARD_END.inSession is not: it was answered). */
export const isClosed = (end) => Object.hasOwn(CARD_CLOSE, end)

/**
 * Tell the isolated Fishball one closure: the bridge's listener turns it into the CARD_CLOSED inbox
 * item (src/slim/host/approvals.js).
 * @param card - the pile card that left: { kind, requestId/questionId, sessionId }.
 * @param end - a CARD_END; a non-closure end (the user's answer, a settlement elsewhere) says nothing.
 * @param notify - receives { type, approvalId, sessionId, reason }.
 */
export function closeCard(card, end, notify) {
  if (!isClosed(end)) return false
  notify({ type: CARD_CLOSED.event, approvalId: card?.requestId, sessionId: card?.sessionId, reason: CARD_CLOSE[end] })
  return true
}
