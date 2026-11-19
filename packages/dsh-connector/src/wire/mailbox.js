/**
 * The mailbox port routing takes (routing/index.js: "`mailbox`: K1 `Mailbox` plus C-MAILBOX's
 * `stage` and `onAcked(listener(principalKey, receipts)) → dispose`, fired after each successful
 * `inbox_ack` with its receipts ... C-WIRE and C-TOOLS must route every `inbox_ack` through this
 * port"). C-MAILBOX's mailbox has no ack signal of its own, so the wiring adds it here, once:
 * every caller (C-TOOLS' `inbox_ack`, C-HTTP, routing, revocation, the hosted service, C-EXT) gets
 * this one object, so no ack can bypass the signal.
 *
 * Everything but `ack` is the mailbox's own member, unchanged. `ack` resolves the mailbox's own
 * answer; a listener runs after it, only for `{ok: true}`, and a throwing listener is logged and
 * never changes that answer (the ack has already been committed).
 */
import { diagnosticOf } from '../errors.js'
import { LOG } from './constants.js'

/**
 * @param mailbox - C-MAILBOX's `createMailbox(...)` result
 * @param logger - `{warn}`
 * @returns the same members, with `ack` firing `onAcked` listeners and `onAcked` added
 */
export function withAckSignal(mailbox, logger) {
  const listeners = new Set()
  async function ack(principalKey, receipts) {
    const answer = await mailbox.ack(principalKey, receipts)
    if (answer?.ok === true) {
      for (const listener of [...listeners]) {
        try { listener(principalKey, receipts) } catch (error) { logger.warn(LOG.format, LOG.ackListenerFailed, diagnosticOf(error)) }
      }
    }
    return answer
  }
  function onAcked(listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  // C-MAILBOX's members are own methods of a frozen object (no `this`), so copying them keeps them working.
  return Object.freeze({ ...mailbox, ack, onAcked })
}
