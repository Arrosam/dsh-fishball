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
 * A filed card has no deadline: this class arms no timer, and the owners file cards only after
 * Fishball's own answer window is over (src/card-lifecycle.js has the rule and the closure line).
 * `onClose` tells the owner every end, so a card that closes without your answer is announced in
 * Fishball's chat instead of vanishing.
 *
 * Persistence (T08, the user's requirement that a card never expires). Every filed card is
 * written to the plugin's own storage domain (fishball.json, table `pile`) under this pile's
 * scope, and read back here when the plugin starts. DSH ends every turn at a restart, so a
 * restored card's call no longer exists and it cannot be answered: `answer()` refuses it, and
 * each owner closes the cards it did not re-file (CARD_END.restarted; src/index.js closes the
 * broker's, src/questions.js closes the question router's after it re-files every continued
 * question it could rebuild from its session log). Writing never blocks a decision: the store
 * queues its own atomic write and a failure is diagnostic only (this run keeps the card).
 *
 * A page reload or a re-render re-reads the host's snapshot; the store is what survives a
 * restart, not a re-render.
 */
import { CARD_END } from './constants.js'
import { diagnosticOf } from './errors.js'
import { latestFirst } from './text.js'

export class Pile {
  /** requestId -> { card, settle, onAnswer? } */
  #cards = new Map()
  #onChange
  #onClose
  /** The store's `pile` table, or undefined when the pile has no durable side. */
  #stored
  /** Which pile's records this instance owns and restores (PILE_SCOPE). */
  #scope
  #logger

  /**
   * @param onChange - called after each card is filed or leaves (the state feed publishes).
   * @param onClose - optional, called with (card, end) once per card that leaves, where end is the
   *   CARD_END of the result that settled it; the owners announce a closure without your answer and
   *   pass that end to the slim bridge.
   * @param options.stored - optional store table (get/entries/put/delete) that keeps cards across
   *   a restart; when it is absent the pile is memory-only (the pre-T08 behaviour).
   * @param options.scope - the pile's PILE_SCOPE; a pile restores only its own scope's records.
   * @param options.logger - optional; a failed write is logged, never thrown at a decision.
   */
  constructor(onChange, onClose, options = {}) {
    this.#onChange = onChange
    this.#onClose = onClose
    this.#stored = options?.stored
    this.#scope = options?.scope
    this.#logger = options?.logger
    // A stored pile must say which pile it is: two piles read the same table, and a record without
    // a scope could be shown in both.
    if (this.#stored !== undefined && (typeof this.#scope !== 'string' || this.#scope === '')) {
      throw new TypeError('fishball pile: a stored pile needs a scope (PILE_SCOPE)')
    }
    // Restored here, before any owner can file or answer, so a card the user still had is in the
    // pile at the first publish and not one render later.
    if (this.#stored !== undefined) this.#restore()
  }

  /** Put back every stored card of this pile's scope. A record this code cannot read is skipped. */
  #restore() {
    for (const [requestId, record] of this.#stored.entries()) {
      if (record?.scope !== this.#scope) continue
      const card = record.card
      if (card === null || typeof card !== 'object' || card.requestId !== requestId || this.#cards.has(requestId)) continue
      // No executor: no call waits on a restored card in this process, and no owner awaits it.
      // The flag is what `answer()` and the owners' close pass key on.
      this.#cards.set(requestId, { card: { ...card, restored: true }, settle: () => {} })
    }
  }

  /**
   * File one card.
   * @param card - { requestId, kind, sessionId, callId?, toolName, arguments, argumentsStatus,
   *   quotes, why, thread, note?, since }; plain data, published to the browser as it is.
   * @param onAnswer - optional, called synchronously with { decision, note? } when you answer it
   *   (a direct call's card races its stock prompt in the same tick, src/approvals.js).
   * @returns a promise of how it left: { end: CARD_END.user, decision, note? } for your answer,
   *   or the { end } given to settle() by a release or a cancellation.
   */
  file(card, onAnswer) {
    // Filing under the id of a restored card adopts it: the live card replaces the detached one,
    // so the question router's rebuild of a continued question yields one answerable card, not a
    // live one beside a card that is about to be closed as restarted.
    const ended = new Promise((settle) => { this.#cards.set(card.requestId, { card, settle, onAnswer }) })
    this.#save(card)
    this.#onChange()
    return ended
  }

  /** Your answer on one card. A restored card is refused: its call ended with the restart. */
  answer(requestId, decision, note) {
    const entry = this.#cards.get(requestId)
    if (entry === undefined || entry.card.restored === true) return false
    const answer = { decision, ...(note === undefined ? {} : { note }) }
    if (!this.settle(requestId, { end: CARD_END.user, ...answer })) return false
    entry.onAnswer?.(answer)
    return true
  }

  /** End one card once. @returns whether it was still in the pile. */
  settle(requestId, result) {
    const entry = this.#cards.get(requestId)
    if (entry === undefined) return false
    this.#cards.delete(requestId)
    this.#forget(requestId)
    entry.settle(result)
    this.#onClose?.(entry.card, result.end)
    this.#onChange()
    return true
  }

  /** End every card that matches with `result`. */
  settleWhere(matches, result) {
    for (const { card } of [...this.#cards.values()]) if (matches(card)) this.settle(card.requestId, result)
  }

  /** Whether this request's card is still in the pile (restored ones included). */
  has(requestId) {
    return this.#cards.has(requestId)
  }

  /** Cards in the pile (the maxPendingApprovals count includes them, §7a.6). */
  get size() {
    return this.#cards.size
  }

  /** The cards, newest first (Reading, §10e "Order and count"). */
  cards() {
    return [...this.#cards.values()].map((entry) => entry.card).sort((a, b) => latestFirst(a.since, b.since))
  }

  /**
   * Store one card. Never awaited and never thrown: a decision must not wait on a file write, the
   * store queues its own atomic write, and a failed write leaves the card correct in memory for
   * this run (only the next start loses it).
   */
  #save(card) {
    if (this.#stored === undefined) return
    Promise.resolve(this.#stored.put(card.requestId, { scope: this.#scope, card, filedAt: new Date().toISOString() }))
      .catch((error) => this.#logger?.warn('pile card %s not stored (%s)', card.requestId, diagnosticOf(error)))
  }

  /** Forget a card that left; an absent key is a no-op in the store. */
  #forget(requestId) {
    if (this.#stored === undefined) return
    Promise.resolve(this.#stored.delete(requestId))
      .catch((error) => this.#logger?.warn('pile card %s not forgotten (%s)', requestId, diagnosticOf(error)))
  }
}
