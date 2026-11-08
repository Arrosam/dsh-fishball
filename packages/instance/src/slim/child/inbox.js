/**
 * The inbox consumer in the isolated child (§5.2, §6.3, §15 T05/T06/T07).
 *
 * The main host pushes every message a managed session sent to Fishball - message_fishball,
 * a hand-over note, a watch notice or a system item - through `inbox.push`. This row is the one
 * consumer that delivers those items into Fishball's own chat session. T09 owns its own
 * `[question answer ...]` and `[card closed ...]` system items and this consumer declines them,
 * so neither row can steal an item from the other (§5.2's listener rule: a listener that returns
 * false refuses the item).
 *
 * Delivery rules kept here:
 * - The item's text is already framed by the host (which session sent it, the user's note for a
 *   hand-off, the untrusted block). This row forwards that text unchanged; it never re-frames
 *   content and never treats it as instructions.
 * - Images are pulled and validated by T06's `images.receiveInbox` before the turn is queued.
 *   A model that cannot take images refuses with `images-unsupported`, and the item is then
 *   acked with a visible system timeline entry instead of being redelivered forever.
 * - The bridge acks only after the chat row queued the turn. A transient failure is thrown, so
 *   the bridge refuses the item and the host keeps it queued for redelivery (§5.2).
 */
import { ContractError, ERROR } from '../contract.js'
import { CARD_CLOSED, QUESTION_ANSWER, RECORD_ITEM } from '../inbox-markers.js'
import { CARD_RECORD } from '../card-record.js'

/** Stable Cordis plugin name; the launch overlay inserts this row. */
export const name = 'fishball-native-inbox'

/** Services the consumer needs: the shared bridge client and T07's chat row. */
export const inject = ['fishballBridge', 'fishballChat']

const CHILD = Object.freeze({
  bridge: 'fishballBridge',
  chat: 'fishballChat',
  logger: 'fishball-native-inbox',
})

/**
 * Refusal codes that mean "try again later": the channel or the host was momentarily unable to
 * answer. Every other typed ContractError is a permanent refusal of this item, such as
 * images-unsupported or not-referenced; re-delivering it would keep the queue blocked.
 */
const TRANSIENT = new Set([
  ERROR.version,
  ERROR.host,
  ERROR.operation,
  ERROR.capability,
  ERROR.handshakeRequired,
  ERROR.limit,
  ERROR.disconnected,
  ERROR.timeout,
  ERROR.failed,
])

/** The one copy this row adds; the refused code stays visible, the message text is not lost. */
const TEXT = Object.freeze({
  imageRefused: (code) => 'Fishball could not receive an image from another session (' + code + '). The message was delivered without its images.',
  /**
   * What Fishball reads when the user answered a card themselves (the user's request 2026-11-06:
   * Fishball must see the answer, not only that it was answered). The session's own question text
   * is left out: it is that session's words, and read_session shows it.
   */
  answered: (record) => 'Fishball notice: the user answered ' + (record.own === true ? 'your question ' : NOUN[record.kind] + ' ') + record.cardId
    + (record.own === true ? '' : ' from session ' + JSON.stringify(record.from?.title || record.from?.sessionId || '') + ' (' + (record.from?.sessionId ?? '') + ')')
    + (record.place === CARD_RECORD.place.session ? ' in that session' : ' on its card') + ': '
    + (record.kind === CARD_RECORD.kind.permission ? OUTCOME_WORDS[record.outcome] + (record.note ? ', with the note ' + JSON.stringify(record.note) : '') : record.outcome === CARD_RECORD.outcome.skipped ? 'skipped' : record.answer === undefined ? TEXT_UNKNOWN_WORDS : JSON.stringify(record.answer)) + '.',
})
/** A late reply to a continued question carries no batch here; its words stay in that session's log. */
const TEXT_UNKNOWN_WORDS = 'answered (read_session shows the words)'
/** The card kinds and permission outcomes as Fishball's notice names them. */
const NOUN = Object.freeze({ [CARD_RECORD.kind.permission]: 'permission request', [CARD_RECORD.kind.question]: 'question', [CARD_RECORD.kind.planReview]: 'plan review' })
const OUTCOME_WORDS = Object.freeze({ [CARD_RECORD.outcome.allowed]: 'allowed once', [CARD_RECORD.outcome.granted]: 'allowed', [CARD_RECORD.outcome.rejected]: 'rejected' })

/** The record an item carries, or undefined when it is not a well-formed card record item. */
function recordOf(item) {
  if (item?.kind !== RECORD_ITEM.kind || typeof item.text !== 'string') return undefined
  const match = RECORD_ITEM.pattern.exec(item.text)
  if (match === null) return undefined
  let record
  try { record = JSON.parse(match[1]) } catch { return undefined }
  return record !== null && typeof record === 'object' && record.v === CARD_RECORD.version && typeof record.id === 'string' ? record : undefined
}

/**
 * Mount the consumer as its own child row. It waits for fishballChat, which app.js publishes
 * after Fishball's session record is read, and for the bridge client session-tools.js provides.
 */
export function apply(ctx) {
  const bridge = ctx.get(CHILD.bridge)
  const chat = ctx.get(CHILD.chat)
  const logger = typeof ctx.logger === 'function' ? ctx.logger(CHILD.logger) : undefined
  const consumer = createInboxConsumer({ bridge, chat, logger })
  ctx.effect(() => () => consumer.close(), name + ': inbox consumer')
}

/**
 * Create the consumer over an already-built bridge and chat service.
 * @param {object} options
 * @param {{ onInbox: Function }} options.bridge - the fishballBridge service.
 * @param {{ deliverInbox: Function, notify: Function }} options.chat - the fishballChat service.
 * @param {{ warn?: Function }} [options.logger] - diagnostics only; item text is never logged.
 * @returns {{ close: Function }} the disposer owner.
 */
export function createInboxConsumer(options) {
  const { bridge, chat, logger } = options ?? {}
  if (typeof bridge?.onInbox !== 'function') throw new TypeError('fishball-native-inbox: the bridge must implement onInbox')
  if (typeof chat?.deliverInbox !== 'function' || typeof chat?.notify !== 'function' || typeof chat?.recordCard !== 'function') {
    throw new TypeError('fishball-native-inbox: the chat must implement deliverInbox, notify and recordCard')
  }
  let closed = false

  const warn = (message, error) => {
    logger?.warn(message, String(error?.code ?? error?.name ?? error))
  }

  /**
   * Take one inbox item. Returning false declines it, so T09 can be its only consumer; returning
   * true (or nothing) tells the bridge to ack after delivery. A thrown transient failure leaves
   * the item unacked and queued on the host.
   */
  async function receive(item) {
    if (isApprovalsItem(item)) return false
    const record = recordOf(item)
    // A card record is a visible row in Fishball's chat, never a turn by itself; the user's own
    // answer is also told to Fishball as a notice that wakes it like any inbox item, so it reads
    // the words (labels, custom text, a decision's note) at once (7713 N9-b).
    if (record !== undefined) {
      await chat.recordCard(record, record.by === CARD_RECORD.by.user ? TEXT.answered(record) : undefined)
      return true
    }
    try {
      await chat.deliverInbox(item)
      return true
    } catch (error) {
      if (!isTypedRefusal(error)) throw error
      // A permanent refusal must not be retried forever. Record it visibly, deliver the text
      // without the refused images, then let the bridge ack the item.
      await chat.notify(TEXT.imageRefused(error.code))
      await chat.deliverInbox(item, { skipImages: true })
      return true
    }
  }

  const dispose = bridge.onInbox((item) => {
    if (closed) return false
    return receive(item).catch((error) => {
      // The bridge contains a listener failure and refuses the item; keep a diagnostic without
      // item content, since inbox text is untrusted and may be sensitive.
      warn('an inbox item could not be delivered (%s)', error)
      throw error
    })
  })

  function close() {
    if (closed) return
    closed = true
    try { dispose() } catch { /* the row is going away */ }
  }

  return Object.freeze({ close })
}

/**
 * T09's items are system messages carrying one of its markers (a question's answer, a card's
 * closure); every other item is ours and wakes Fishball as before.
 */
function isApprovalsItem(item) {
  if (item?.kind !== QUESTION_ANSWER.kind || typeof item.text !== 'string') return false
  return QUESTION_ANSWER.pattern.test(item.text) || CARD_CLOSED.pattern.test(item.text)
}

/** A typed refusal of this item; a channel/wiring failure stays transient and is retried. */
function isTypedRefusal(error) {
  return error instanceof ContractError
    && typeof error.code === 'string'
    && !TRANSIENT.has(error.code)
}
