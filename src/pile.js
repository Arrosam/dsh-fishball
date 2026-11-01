/**
 * Your pile (DESIGN §7a.6, §9 "Session cards", requirements items 14-16): the requests that
 * wait for you, shown above Fishball's composer and on the asking session's running row.
 *
 * A card is filed by the broker (src/approvals.js) when Fishball escalates an ask_fishball
 * request, does not answer in time, or cannot be told; the asking agent keeps waiting on it.
 * A direct call Fishball escalates or does not answer in time is a card too, beside the stock
 * prompt in its session (rev11e, §7a.6): the first answer in either place wins.
 * Each card settles exactly once, in one place (settle), so your answer in the pile, your answer
 * on the session's row, the call's cancellation and a release can race safely: the first wins
 * and every later one is refused (answering in either place clears both, item 15).
 *
 * Cards live in memory: a card exists only while its asking turn runs, and a restart ends turns,
 * so none survives one (item 16).
 */
import { CARD_END } from './constants.js'

export class Pile {
  /** requestId -> { card, settle } */
  #cards = new Map()
  #onChange

  /** @param onChange - called after each card is filed or leaves (the state feed publishes). */
  constructor(onChange) {
    this.#onChange = onChange
  }

  /**
   * File one card.
   * @param card - { requestId, kind, sessionId, callId?, toolName, arguments, argumentsStatus,
   *   quotes, why, thread, note?, since }; plain data, published to the browser as it is.
   * @returns a promise of how it left: { end: CARD_END.user, decision, note? } for your answer,
   *   or the { end } given to settle() by a release or a cancellation.
   */
  file(card) {
    // The executor runs synchronously, so the card is in the pile when file() returns.
    const ended = new Promise((settle) => { this.#cards.set(card.requestId, { card, settle }) })
    this.#onChange()
    return ended
  }

  /** Your answer on one card. @returns whether the card was still in the pile. */
  answer(requestId, decision, note) {
    return this.settle(requestId, { end: CARD_END.user, decision, ...(note === undefined ? {} : { note }) })
  }

  /** End one card once. @returns whether it was still in the pile. */
  settle(requestId, result) {
    const entry = this.#cards.get(requestId)
    if (entry === undefined) return false
    this.#cards.delete(requestId)
    entry.settle(result)
    this.#onChange()
    return true
  }

  /** End every card that matches with `result`. */
  settleWhere(matches, result) {
    for (const { card } of [...this.#cards.values()]) if (matches(card)) this.settle(card.requestId, result)
  }

  /** Whether this request's card is still in the pile. */
  has(requestId) {
    return this.#cards.has(requestId)
  }

  /** Cards in the pile (the maxPendingApprovals count includes them, §7a.6). */
  get size() {
    return this.#cards.size
  }

  /** The cards, newest first (Reading, §10e "Order and count"). */
  cards() {
    return [...this.#cards.values()].map((entry) => entry.card).sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0))
  }
}
