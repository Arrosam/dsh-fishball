/**
 * Unread replies from Fishball (DESIGN §10): the count the sidebar mark shows.
 *
 * - A reply is one assistant message of Fishball's own session that has text; a message with
 *   only tool calls is not something you read.
 * - The count is stored (a restart must not lose it) for the assistant session it was made for,
 *   as the context-window setting is: an adopted new session starts from zero.
 * - markRead() is called when the browser reports that Fishball's chat is on screen.
 * - Every change goes through one queue, so a reply arriving while the count is being cleared
 *   is neither lost nor counted twice.
 */
import { EVENT, SESSION_INFO, UNREAD } from './constants.js'
import { diagnosticOf } from './errors.js'
import { textOfEvent } from './session-info.js'

/** Whether an event is a reply you can read. */
const isReply = (event) => event.type === SESSION_INFO.assistantEvent && textOfEvent(event).length > 0

export class Unread {
  #store
  #logger
  #assistantId
  #onChange
  #queue = Promise.resolve()

  /**
   * @param ctx - fishball row context (session events).
   * @param store - Store (unread table).
   * @param logger - plugin logger.
   * @param deps.assistantId - () => assistant session id; deps.onChange - state changed.
   */
  constructor(ctx, store, logger, { assistantId, onChange }) {
    this.#store = store
    this.#logger = logger
    this.#assistantId = assistantId
    this.#onChange = onChange
    ctx.on(EVENT.sessionEvent, (session, event) => {
      if (session.id === this.#assistantId() && isReply(event)) this.#change((count) => count + 1, session.id)
    })
  }

  /** The unread replies for the current assistant session (0 for a record of another one). */
  #count() {
    const record = this.#store.unread.get(UNREAD.recordKey)
    return record?.sessionId === this.#assistantId() ? record.count : 0
  }

  /**
   * Apply one change to the count in order; a failed write is logged, never thrown into the event.
   * @param forSession - the session the change was made for. A change queued just before the
   *   assistant session was replaced (adopt) is dropped instead of counting into the new one.
   */
  #change(next, forSession = undefined) {
    const run = this.#queue.then(async () => {
      if (forSession !== undefined && forSession !== this.#assistantId()) return
      const current = this.#count()
      const count = next(current)
      if (count === current) return
      await this.#store.unread.put(UNREAD.recordKey, { sessionId: this.#assistantId(), count, changedAt: new Date().toISOString() })
      this.#onChange()
    })
    this.#queue = run.catch((error) => this.#logger.warn('unread count failed (%s)', diagnosticOf(error)))
    return run
  }

  /** Fishball's chat is on screen: every reply so far is read. */
  markRead() {
    return this.#change(() => 0)
  }

  snapshot() {
    return { count: this.#count() }
  }
}
