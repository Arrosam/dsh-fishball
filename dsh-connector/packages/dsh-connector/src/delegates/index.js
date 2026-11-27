/**
 * Permission delegates of managed sessions (`dshConnectorSessions.delegates`; host-services/sessions.d.ts).
 *
 * A delegate is a main-DSH plugin that may decide a managed session's permission request before the
 * connector offers it to the session's manager (the user, 2026-11-20, for dsh-connector-watchdog: "2",
 * a generic connector hook). The permission broker (domain/permissions.js) asks `decide` after its
 * standing-grant check and before any offer:
 * - the first registered delegate whose `claims(rootSessionId)` is true gets the request; there is
 *   at most one answer per request, so two delegates never race;
 * - `allow` / `reject` with a non-empty reason decides that one call (never a standing grant); the
 *   manager gets a `settlement {by: delegate}` so it sees what was decided (the user: "yes send
 *   settlements");
 * - `pass`, a throw or an invalid verdict → the request goes on to the manager, and its offer says
 *   so: `delegate {name, outcome: passed | failed, reason?}` (K1 DELEGATE_OUTCOME; the user,
 *   2026-11-21: after the Watchdog live test a failed judge must not read as a judged pass). There
 *   is still no failure state: a failure only changes that word, and is logged;
 * - a delegate that went away while deciding no longer speaks for the connector: the offer is made
 *   exactly as without delegates.
 * Questions and plan reviews never reach a delegate.
 */
import { diagnosticOf } from '../errors.js'
import { trimmed } from '../domain/support.js'
import { DELEGATE_OUTCOME } from '../../mcp-schema/index.js'
import { DELEGATE_NAME, INVALID_VERDICT, LOG, MISUSE, VERDICT } from './constants.js'

export { SESSIONS_SERVICE, VERDICT } from './constants.js'

/** A thrown error's string `code`, else its string `name`, else '': the offer's reason must be text (K1 descriptor). */
const failureCode = (error) => [error?.code, error?.name].find((part) => typeof part === 'string' && part !== '') ?? ''

const isDefinition = (d) => d !== null && typeof d === 'object' && typeof d.name === 'string' && DELEGATE_NAME.test(d.name)
  && typeof d.claims === 'function' && typeof d.decide === 'function'

/** @param deps.logger - `{warn}` */
export function createDelegates({ logger }) {
  /** name → definition, in registration order (a Map keeps it). */
  const delegates = new Map()
  let closed = false

  function register(definition) {
    if (closed) throw new Error(MISUSE.closed)
    if (!isDefinition(definition)) throw new TypeError(MISUSE.definition)
    if (delegates.has(definition.name)) throw new Error(MISUSE.exists)
    const entry = Object.freeze({ name: definition.name, claims: definition.claims, decide: definition.decide })
    delegates.set(entry.name, entry)
    return () => { if (delegates.get(entry.name) === entry) delegates.delete(entry.name) }
  }

  function claimant(sessionId) {
    for (const entry of delegates.values()) {
      try {
        if (entry.claims(sessionId) === true) return entry
      } catch (error) {
        logger.warn(LOG.format, LOG.claimFailed, diagnosticOf(error))
      }
    }
    return undefined
  }

  /**
   * @param sessionId - the request's root session
   * @param describe - `() => Promise<descriptor>`: the K1 descriptor the manager's offer would carry,
   *   read only once a delegate claims the session
   * @param signal - the call's own cancellation
   * @returns `{name, verdict: allow | reject, reason}` (decided); `{name, outcome: passed | failed,
   *   reason?}` (to the manager, the offer's `delegate`); undefined (no delegate speaks: to the
   *   manager as without delegates)
   */
  async function decide(sessionId, describe, signal) {
    const entry = claimant(sessionId)
    if (entry === undefined) return undefined
    const toManager = (outcome, reason) => Object.freeze({ name: entry.name, outcome, ...(reason === '' ? {} : { reason }) })
    const failed = (code) => {
      logger.warn(LOG.format, LOG.decideFailed, code === '' ? diagnosticOf(undefined) : code)
      return delegates.get(entry.name) === entry ? toManager(DELEGATE_OUTCOME.failed, code) : undefined
    }
    let answer
    try {
      const request = Object.freeze({ sessionId, descriptor: await describe() })
      answer = await entry.decide(request, Object.freeze({ signal }))
    } catch (error) {
      return failed(failureCode(error))
    }
    // Withdrawn while deciding: its answer no longer speaks for the connector.
    if (delegates.get(entry.name) !== entry) return undefined
    const verdict = answer?.verdict
    const reason = trimmed(answer?.reason)
    if (verdict === VERDICT.pass) return toManager(DELEGATE_OUTCOME.passed, reason)
    if ((verdict !== VERDICT.allow && verdict !== VERDICT.reject) || reason.length === 0) return failed(INVALID_VERDICT)
    return Object.freeze({ name: entry.name, verdict, reason })
  }

  return Object.freeze({
    register,
    decide,
    close() { closed = true; delegates.clear() },
  })
}
