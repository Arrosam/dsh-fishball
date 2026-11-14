/**
 * Small helpers the routing and hand-over modules share: one serial chain per state owner, and a
 * listener set whose throwing listener does not stop the others (K1c-1, K3 `onChange`).
 */
import { diagnosticOf } from '../errors.js'

/**
 * A serial chain: each step runs after every earlier one has settled, and a failed step never
 * blocks later ones (the rule of V2's ManagedRegistry and of C-MAILBOX).
 * @returns {(step: () => Promise<T>) => Promise<T>}
 */
export function serialChain() {
  let chain = Promise.resolve()
  return (step) => {
    const run = chain.then(step)
    chain = run.catch(() => {})
    return run
  }
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

/** A non-empty string (K1: session ids and principal keys are opaque non-empty strings). */
export const isKey = (value) => typeof value === 'string' && value.length > 0
