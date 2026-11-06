/**
 * Fishball's own questions in the user's pile (§15 T09, D9; the slim child's ask_user tool).
 *
 * The slim child has no blocking question tool: when Fishball needs something from the user, that
 * tool files a card here and returns at once with the card's id (the child never waits, and no
 * DSH question request is raised). The card is the user's, and it never expires:
 * - it is filed into a pile of its own in the same store the approval broker's pile uses (scope
 *   PILE_SCOPE.ownQuestions), so the snapshot already publishes it (index.js pileView) and the
 *   browser draws it as a question card with its options;
 * - a card the store rebuilt at a restart is taken over here (restore), not closed: an own question
 *   never waited on a call, so it is still the user's to answer after the restart;
 * - it carries no end time and nothing here arms a timer (src/card-lifecycle.js owns that rule);
 * - an end without the user's answer is announced by the pile's own onClose path, which the broker
 *   turns into the CARD_CLOSED inbox item the slim child shows as its closed row.
 *
 * One answer settles it, from either card: the user's answer in the pile (commands.answerQuestion,
 * the same route a managed session's question card uses) or the answer on the child's own copy of
 * the card (question.answerOwn over the bridge). Both settle the one pile card with CARD_END.user
 * and emit the answer event below, which the slim host relays as the QUESTION_ANSWER inbox item —
 * the carrier a question Fishball sent the user already uses, so the child has one answer row.
 */
import { randomUUID } from 'node:crypto'
import { CARD_END, QUESTION_ERROR, QUESTION_KIND } from './constants.js'
import { answerWords, batchFor } from './questions.js'
import { OWN_ANSWER } from './slim/inbox-markers.js'
import { CARD_RECORD } from './slim/card-record.js'

/** What one own question's card shows and how it is answered; nothing here is a timer. */
export const OWN_QUESTION = Object.freeze({
  /** The card's id prefix (oqn_<id>), distinct from a managed session's qst_ ids. */
  idPrefix: 'oqn_',
  kind: QUESTION_KIND.question,
  /** The child's tool that files the card; the card names it like any question card names its tool. */
  toolName: 'ask_user',
  /** The card's author line: the question comes from Fishball, not from a session of the user's. */
  title: 'Fishball',
})

export class OwnQuestions {
  #pile
  #readLimits
  #records
  #listeners = new Set()
  /** questionId -> { sessionId, questions } for the cards still in the pile. */
  #open = new Map()

  /**
   * The pile publishes every change itself (its own onChange is the state feed), so filing and
   * settling a card needs no second notification from here.
   * @param pile - the user's pile (src/pile.js); its onClose announces a closure without an answer.
   * @param deps.readLimits - () => limits (rationaleChars bounds the answer's words).
   * @param deps.records - CardRecords (src/card-records.js); Fishball's own question has only
   *   Fishball's copy, because Fishball's chat is the session that asked.
   */
  constructor(pile, { readLimits, records }) {
    this.#pile = pile
    this.#readLimits = readLimits
    this.#records = records
  }

  /**
   * T08's restart rule for this pile (src/pile.js). The broker's cards are closed as restarted and
   * the question router's are re-filed when their continued question survives (src/questions.js);
   * an own question needs neither: ask() returned at once, so no call died with the restart and the
   * question is still the user's to answer. Re-filing the stored card under its own id (Pile.file
   * adopts a restored card) keeps one card on screen, clears the detached flag and makes both
   * answer paths work again.
   */
  restore() {
    for (const card of this.#pile.cards()) {
      // Only this pile's own cards; an unreadable record stays for its owner's own closure pass.
      if (card.restored !== true || card.kind !== OWN_QUESTION.kind) continue
      if (!Array.isArray(card.questions) || card.questions.length === 0) continue
      if (!this.#open.has(card.requestId)) this.#open.set(card.requestId, { sessionId: card.sessionId, questions: card.questions })
      const live = { ...card }
      delete live.restored
      void this.#pile.file(live)
    }
  }

  /**
   * File one card for Fishball's question and answer at once (§5.2 question.ask).
   * @param input.sessionId - Fishball's own session, the card's author (it names no main session).
   * @param input.questions - DSH's question items, already contract-validated (1..32, unique ids).
   * @returns {{ok: true, questionId: string}}
   */
  ask({ sessionId, questions }) {
    const questionId = OWN_QUESTION.idPrefix + randomUUID().replace(/-/g, '')
    this.#open.set(questionId, { sessionId, questions })
    void this.#pile.file({
      requestId: questionId, questionId, kind: OWN_QUESTION.kind, sessionId, callId: null,
      toolName: OWN_QUESTION.toolName, questions, continued: false, note: '',
      title: OWN_QUESTION.title, since: new Date().toISOString(),
    })
    return { ok: true, questionId }
  }

  /** Whether this id names an own question whose card is still waiting for the user. */
  has(questionId) {
    if (!this.#open.has(questionId)) return false
    // A card that left without an answer (its closure was announced by the pile) is over here too.
    if (this.#pile.has(questionId)) return true
    this.#open.delete(questionId)
    return false
  }

  /**
   * The user's answer on the card, from the pile's route or from the child's own copy of it.
   * Validated as answer_question's answer is (src/questions.js batchFor), so a bad batch leaves
   * the card open and a taken one settles it once.
   * @param input - { questionId, answers } or { questionId, approve } / { questionId, feedback }.
   * @returns undefined when it was taken, else { code: QUESTION_ERROR, reason? }.
   */
  answerCard({ questionId, answers, approve, feedback }) {
    const entry = this.#open.get(questionId)
    if (entry === undefined) return { code: QUESTION_ERROR.expired }
    const built = batchFor(OWN_QUESTION.kind, entry.questions, { answers, approve, feedback })
    if (built.reason !== undefined) return { code: QUESTION_ERROR.badAnswer, reason: built.reason }
    const settled = this.#pile.settle(questionId, { end: CARD_END.user })
    this.#open.delete(questionId)
    if (!settled) return { code: QUESTION_ERROR.expired }
    // The words travel like a question sent to the user: one inbox item, one chat row (§5.2, T09).
    this.#emit({ type: OWN_ANSWER.event, questionId, sessionId: entry.sessionId, words: answerWords(built.batch.answers, this.#readLimits().rationaleChars) })
    this.#records.question({ id: questionId, sessionId: entry.sessionId, kind: OWN_QUESTION.kind, questions: entry.questions }, { by: CARD_RECORD.by.user, place: CARD_RECORD.place.pile, answers: built.batch.answers, own: true })
    return undefined
  }

  /**
   * Observe each answer, for the slim host's inbox relay (index.js provides it).
   * @param {(event: {type: string, questionId: string, sessionId: string, words: string}) => void} listener
   * @returns {() => void} disposer
   */
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball own questions: a listener must be a function')
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** A listener owns its failure, as the broker's and the router's events do. */
  #emit(event) {
    for (const listener of this.#listeners) {
      try { listener(event) } catch { /* its own failure */ }
    }
  }
}
