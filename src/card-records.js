/**
 * Card records, main-host half (the user's request 2026-11-06; schema in src/slim/card-record.js).
 *
 * The three card owners (src/approvals.js, src/questions.js, src/own-questions.js) call this once
 * per card that ends. It builds one record from what the owner already holds and puts it:
 * - into the asking session's log, unless the user answered in that session itself (DSH already
 *   shows that answer there; the user's decision 2026-11-06) or the card is Fishball's own
 *   question (its "asking session" is Fishball's chat, which gets its copy below);
 * - to the slim relay, as a copy naming the asking session, for Fishball's chat
 *   (src/slim/host/approvals.js turns it into the RECORD_ITEM inbox item).
 *
 * Writing never blocks or fails a decision. The append is queued to a microtask because a card can
 * end inside DSH's own session/event publication (a turn end settles its cards), and DSH refuses an
 * append that re-enters another one. A session that is not loaded (a closure at start, after a main
 * restart) gets no session copy; Fishball's copy still goes out.
 */
import { randomUUID } from 'node:crypto'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { QUESTION_KIND } from './constants.js'
import { CARD_CLOSE } from './card-lifecycle.js'
import { answerWords } from './questions.js'
import { OWN_QUESTION } from './own-questions.js'
import { diagnosticOf } from './errors.js'
import { CARD_RECORD } from './slim/card-record.js'
import { LIMITS } from './slim/limits.js'

const ID_PREFIX = 'crd_'
const ELLIPSIS = '…'
const KIND_OF = Object.freeze({ [QUESTION_KIND.question]: CARD_RECORD.kind.question, [QUESTION_KIND.planReview]: CARD_RECORD.kind.planReview })

/** A character cap with an ellipsis when cut; a non-text value is empty. */
function cut(text, max) {
  if (typeof text !== 'string') return ''
  const characters = [...text]
  return characters.length <= max ? text : characters.slice(0, Math.max(0, max - 1)).join('') + ELLIPSIS
}

/** The card's questions as the record shows them: header, question and option labels, cut. */
function questionsOf(questions) {
  return (Array.isArray(questions) ? questions : []).slice(0, LIMITS.questionsPerRequest).map((item) => ({
    ...(typeof item?.header === 'string' && item.header !== '' ? { header: cut(item.header, LIMITS.labelChars) } : {}),
    question: cut(item?.question, LIMITS.questionChars),
    ...(Array.isArray(item?.options) ? { options: item.options.map((option) => cut(option?.label, LIMITS.labelChars)).filter((label) => label !== '') } : {}),
  }))
}

/**
 * A permission request's fields from either shape that holds one: the broker's live request
 * ({ toolName, args: { text, status }, why | reason }) or its pile card ({ toolName, arguments,
 * argumentsStatus, why }).
 */
function permissionOf(source) {
  const argumentsText = source.args?.text ?? source.arguments
  const reason = source.why ?? source.reason
  return {
    tool: cut(source.toolName, LIMITS.labelChars),
    ...(typeof reason === 'string' && reason !== '' ? { reason: cut(reason, LIMITS.reasonChars) } : {}),
    ...(typeof argumentsText === 'string' && argumentsText !== '' ? { arguments: cut(argumentsText, LIMITS.argumentChars), argumentsStatus: source.args?.status ?? source.argumentsStatus } : {}),
  }
}

export class CardRecords {
  #ctx
  #logger
  #titleOf
  #now
  #listeners = new Set()

  /**
   * @param deps.ctx - the row context; `sessions.get(id)` gives a loaded Session.
   * @param deps.titleOf - (sessionId) => the session's title, or undefined.
   * @param deps.now - clock (epoch ms).
   */
  constructor({ ctx, logger, titleOf, now = Date.now }) {
    this.#ctx = ctx
    this.#logger = logger
    this.#titleOf = titleOf
    this.#now = now
  }

  /** Observe Fishball's copies (the slim relay). @returns disposer */
  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball card records: a listener must be a function')
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /**
   * A question or plan review answered by Fishball or the user.
   * @param card - { id, sessionId, kind (QUESTION_KIND), questions }.
   * @param answer.by - CARD_RECORD.by. @param answer.place - CARD_RECORD.place for the user's answer.
   * @param answer.answers - DSH's batch items, or undefined when the words are not known.
   * @param answer.own - Fishball's own question (ask_user): no session copy.
   */
  question(card, { by, place, answers, own = false }) {
    const words = Array.isArray(answers) ? answerWords(answers, LIMITS.reasonChars) : undefined
    this.#write(card.sessionId, {
      ...this.#base(card.id, KIND_OF[card.kind] ?? CARD_RECORD.kind.question, by, place, own),
      outcome: words === '' ? CARD_RECORD.outcome.skipped : CARD_RECORD.outcome.answered,
      questions: questionsOf(card.questions),
      ...(words === undefined || words === '' ? {} : { answer: words }),
    }, !own && place !== CARD_RECORD.place.session)
  }

  /**
   * A permission request decided by Fishball or the user.
   * @param request - the broker's request or prompt ({ id, sessionId, toolName, args, why|reason }).
   * @param outcome - CARD_RECORD.outcome (allowed, granted or rejected).
   * @param note - the user's Reject note, or Fishball's reason.
   */
  permission(request, { by, place, outcome, note }) {
    this.#write(request.sessionId, {
      ...this.#base(request.id, CARD_RECORD.kind.permission, by, place, false),
      outcome, ...permissionOf(request),
      ...(typeof note === 'string' && note.trim() !== '' ? { note: cut(note.trim(), LIMITS.noteChars) } : {}),
    }, place !== CARD_RECORD.place.session)
  }

  /** A pile card that closed without the user's answer (the owners' onClose; src/card-lifecycle.js). */
  closed(card, end) {
    const own = card.toolName === OWN_QUESTION.toolName
    const kind = KIND_OF[card.kind] ?? CARD_RECORD.kind.permission
    this.#write(card.sessionId, {
      ...this.#base(card.requestId, kind, undefined, undefined, own),
      outcome: CARD_RECORD.outcome.closed, closed: CARD_CLOSE[end] ?? '',
      ...(kind === CARD_RECORD.kind.permission ? permissionOf(card) : { questions: questionsOf(card.questions) }),
    }, !own)
  }

  #base(cardId, kind, by, place, own) {
    return {
      v: CARD_RECORD.version, id: ID_PREFIX + randomUUID().replace(/-/g, ''), cardId: String(cardId ?? ''), kind, at: this.#now(),
      ...(by === undefined ? {} : { by }), ...(place === undefined ? {} : { place }), ...(own ? { own: true } : {}),
    }
  }

  #write(sessionId, record, inSession) {
    if (inSession) queueMicrotask(() => this.#append(sessionId, record))
    const copy = { ...record, from: { sessionId, title: cut(this.#titleOf(sessionId) ?? '', LIMITS.titleChars) } }
    for (const listener of this.#listeners) {
      try { listener({ type: CARD_RECORD.event, sessionId, record: copy }) } catch { /* its own failure */ }
    }
  }

  #append(sessionId, record) {
    const session = this.#ctx.sessions?.get(sessionId)
    if (session === undefined) {
      this.#logger?.warn('card record %s not written to %s: the session is not loaded', record.id, sessionId)
      return
    }
    try { appendPluginRecord(session, CARD_RECORD.type, record) } catch (error) {
      this.#logger?.warn('card record %s not written to %s (%s)', record.id, sessionId, diagnosticOf(error))
    }
  }
}
