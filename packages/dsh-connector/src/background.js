/**
 * Background steps of the V3 connector modules that must not be skipped (C-REVOKE's drop after its
 * retirements, C-SUCCEED's delete of a succeeded entry): retry-until-done, and the
 * one-`system`-note-per-session write (K1d SessionNotes). Shared by `revocation/` and `hosted/`,
 * so it belongs to neither.
 */
import { diagnosticOf } from './errors.js'

/** The rejection a pending retry gets when its owner closes: the caller ends its job there, quietly. */
export const RETRY_CLOSED = Symbol('retry closed')

/**
 * @param {object} options
 * @param options.timers - `{setTimeout, clearTimeout}`
 * @param options.logger - `{warn(format, line, code)}`
 * @param {string} options.format - the connector's `'%s (%s)'` log format
 * @param {number} options.retryMs - the wait before the next try
 * @returns `{untilDone(line, step), later(line, step), close()}`: `untilDone` runs `step` until it
 *   resolves, logging each rejection as `line` with its diagnostic code only; it rejects
 *   `RETRY_CLOSED` once `close` ran. `later` is the same, its first try after `retryMs` (for a step
 *   that has just failed in the caller's own try). `close` cancels every pending retry.
 */
export function createRetrier({ timers, logger, format, retryMs }) {
  /** Pending retry timer → the rejection that ends its job. */
  const pending = new Map()
  let closed = false

  /** Tries `step` now (or after `retryMs` when `wait`), again after each rejection, until it resolves. */
  function run(line, step, wait) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (closed) return void reject(RETRY_CLOSED)
        Promise.resolve().then(step).then(resolve, (error) => {
          logger.warn(format, line, diagnosticOf(error))
          schedule()
        })
      }
      const schedule = () => {
        if (closed) return void reject(RETRY_CLOSED)
        const handle = timers.setTimeout(() => { pending.delete(handle); attempt() }, retryMs)
        pending.set(handle, () => reject(RETRY_CLOSED))
      }
      if (wait) schedule()
      else attempt()
    })
  }

  function close() {
    closed = true
    for (const [handle, stop] of pending) { timers.clearTimeout(handle); stop() }
    pending.clear()
  }

  return Object.freeze({
    untilDone: (line, step) => run(line, step, false),
    later: (line, step) => run(line, step, true),
    close,
  })
}

/**
 * One `system` note per session (K1d SessionNotes; R-ROUTE-06). A note that fails is reported to
 * `onFailed`, which decides whether to retry it (C-REVOKE does not, C-SUCCEED does).
 * @returns once every note was written or failed (never rejects)
 */
export const writeNotes = (notes, sessionIds, text, onFailed) => Promise.all(sessionIds
  .map((sessionId) => Promise.resolve().then(() => notes.system(sessionId, text)).catch(onFailed)))
