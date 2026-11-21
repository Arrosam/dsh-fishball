/**
 * Fixed values of the connector's sessions service `dshConnectorSessions` (host-services/sessions.d.ts;
 * the user, 2026-11-20: a generic pre-route step so a main-DSH plugin such as dsh-connector-watchdog
 * can decide a managed session's permission request before its manager sees it).
 */
export const SESSIONS_SERVICE = Object.freeze({
  name: 'dshConnectorSessions',
  apiVersion: 1,
  label: 'dsh-connector: dshConnectorSessions',
})

/** What a delegate's `decide` may answer. `pass` hands the request on to the manager. */
export const VERDICT = Object.freeze({ allow: 'allow', reject: 'reject', pass: 'pass' })

/** The failure reason of a delegate that answered no valid verdict (a throw reports its own code). */
export const INVALID_VERDICT = 'invalid-verdict'

/** A delegate's name: shown to the manager in the settlement's `delegate.name`. */
export const DELEGATE_NAME = Object.freeze(/^[a-z][a-z0-9-]{0,47}$/)

export const MISUSE = Object.freeze({
  definition: 'dshConnectorSessions: a delegate needs a name ([a-z][a-z0-9-]{0,47}), claims(sessionId) and decide(request, {signal})',
  exists: 'dshConnectorSessions: a delegate with this name is registered already',
  closed: 'dshConnectorSessions: the connector is closing',
  provideTwice: 'dshConnectorSessions: provided twice',
})

export const LOG = Object.freeze({
  format: '%s (%s)',
  claimFailed: 'delegates: a delegate\'s claims() threw; the request goes to the manager',
  decideFailed: 'delegates: a delegate\'s decide() failed or answered no valid verdict; the request goes to the manager',
})
