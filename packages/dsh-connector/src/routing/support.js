/**
 * Small helpers the routing and hand-over modules share: one serial chain per state owner, and a
 * listener set whose throwing listener does not stop the others (K1c-1, K3 `onChange`).
 */
import { diagnosticOf } from '../errors.js'
import { assertDraft } from '../mailbox/draft.js'

/**
 * Checks `{type, ...fields}` as the K1 EventDraft it becomes, and returns `fields`: the routing
 * module's commit path (`produce(subject, fields)`) takes the type from the subject, so a draft
 * is checked whole before any change and handed on without it.
 * @throws TypeError for an invalid draft (C-MAILBOX `assertDraft`)
 */
export function checkedFields(type, fields) {
  assertDraft({ type, ...fields })
  return fields
}

/**
 * A listener set. `fire(...args)` calls every listener in turn; one that throws is logged by its
 * diagnostic code only and the rest still run.
 * @param logger - `{warn(format, line, code)}`
 * @param format - the connector's `'%s (%s)'` log format; @param line - the log line for a throw
 */
export function listenerSet(logger, format, line) {
  const listeners = new Set()
  return Object.freeze({
    add(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    fire(...args) {
      for (const listener of [...listeners]) {
        try { listener(...args) } catch (error) { logger.warn(format, line, diagnosticOf(error)) }
      }
    },
  })
}
