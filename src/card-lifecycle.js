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
 * Every end the user did not answer leaves one visible line in Fishball's chat (closedChat below),
 * so a card never disappears unseen; the slim child, whose chat is a different session, receives
 * the same closure through the inbox marker (CARD_CLOSED in src/slim/inbox-markers.js). Nothing
 * here arms a timer: a card leaves only through the ends above.
 *
 * The pile is memory-only (src/pile.js; DSH's own approval and question requests never outlive
 * their turn). A card survives a page reload and a pile re-render because the browser re-reads the
 * host's snapshot; it does not survive a main-DSH restart, which ends every turn and so every
 * request a card could be answered with. Persisting it is deliberately out of scope.
 */
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { CARD_END, INTAKE_KIND, QUESTION_KIND, REQUEST_KIND, SOURCE } from './constants.js'
import { authorOf } from './author.js'
import { diagnosticOf } from './errors.js'
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
})

/** What each card kind is called in the closure line (never a bare word at a call site). */
const CARD_NOUN = Object.freeze({
  [QUESTION_KIND.question]: 'question',
  [QUESTION_KIND.planReview]: 'plan review',
  [REQUEST_KIND.asked]: 'permission request',
  [REQUEST_KIND.direct]: 'permission request',
  [REQUEST_KIND.own]: 'Fishball\'s request',
})

/**
 * The user-facing closure line, in Fishball's own chat. The child's copy is the inbox item
 * `CARD_CLOSED.text` (src/slim/inbox-markers.js), because its chat is a different session's.
 */
const closedChat = (what, reason) => 'Card closed: ' + what + ' left the pile before you answered: ' + reason + '. Nothing is waiting for an answer.'

/** Whether this end is a closure without the user's answer (CARD_END.inSession is not: it was answered). */
export const isClosed = (end) => Object.hasOwn(CARD_CLOSE, end)

/**
 * The card's name in a closure line: its kind and the request id Fishball's own messages show.
 * An unknown kind still names the id, so a line never calls a card by the wrong noun.
 */
export function cardName(card) {
  const id = typeof card?.questionId === 'string' ? card.questionId : typeof card?.requestId === 'string' ? card.requestId : ''
  const noun = CARD_NOUN[card?.kind]
  if (noun === undefined) return id
  return id === '' ? noun : noun + ' ' + id
}

/**
 * Tell Fishball one closure: a visible line in its chat (never a wake), and the slim child's own
 * copy through the bridge when a listener is given. Absent agent: the line cannot be shown, and
 * the bridge event still goes out.
 * @param card - the pile card that left: { kind, requestId/questionId, sessionId }.
 * @param end - a CARD_END; a non-closure end (the user's answer, a settlement elsewhere) says nothing.
 * @param notify - optional, receives { type, approvalId, sessionId, reason } (src/slim/host/approvals.js).
 */
export function closeCard(agent, card, end, logger, notify) {
  if (!isClosed(end)) return false
  const reason = CARD_CLOSE[end]
  tellWithoutWake(agent, closedChat(cardName(card), reason), logger)
  notify?.({ type: CARD_CLOSED.event, approvalId: card?.requestId, sessionId: card?.sessionId, reason })
  return true
}

/**
 * A short Fishball notice injected without a wake (it reads it at its next turn), shared by the
 * broker, the question router and Fishball's own requests. @param agent - Fishball's agent, or
 * undefined (not live: the line is dropped; the bridge event still goes out).
 */
export function tellWithoutWake(agent, text, logger) {
  if (agent === undefined) return false
  try {
    agent.inject(createUserMessage({ content: [{ type: 'text', text }], source: { ...SOURCE.notice, summary: boundContextSummary(text), author: authorOf(INTAKE_KIND.system) } }))
    return true
  } catch (error) {
    logger?.warn('Fishball note failed (%s)', diagnosticOf(error))
    return false
  }
}
