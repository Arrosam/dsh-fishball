/**
 * The one place that binds the C-REVOKE step-1 cases to their modules: the REAL C-ROUTE routing
 * module and the REAL C-MAILBOX, opened exactly as the C-ROUTE suite opens them
 * (test/v3/dsh-connector/routing/subject.mjs `routeWorld`: real DSH storage of the SDK under test,
 * fake pairs, tokens, presence, settings and sessions), with this suite's journaling mailbox port
 * (fakes.mjs revocationPort).
 *
 * The step-1 surface (relayed by the dev session, C-REVOKE step 1):
 *   routing.endPrincipal(entryKey, {freshRetirements}) → Promise<Readonly<{principalKey: string | undefined,
 *       sessions: readonly string[], offers: readonly Readonly<{offerId, sessionId, type}>[]}>>
 *     TypeError synchronously when `entryKey` is not a non-empty string, or the options object is
 *     missing / `freshRetirements` is not a boolean. The principal is the entry's current pair, or
 *     the pair it was last seen bound to when that pair was removed in the same settings sync.
 *   routing.askDropped(offerId)   a dropped `ask`: its waiting asker answers {ok: false, code: 'unavailable'}
 * Routing no longer subscribes to `tokens.onRevoked`; C-REVOKE step 2 calls `endPrincipal` from its
 * own handler. In this suite the cases play C-REVOKE's sequencing themselves (hold / endPrincipal /
 * release for a disable; endPrincipal / drop / askDropped for a delete).
 */
import assert from 'node:assert/strict'
import { lateAckPort } from '../routing/fakes.mjs'
import { routeWorld } from '../routing/subject.mjs'
import { SURFACE } from './constants.mjs'
import { revocationPort } from './fakes.mjs'

/**
 * One C-REVOKE world for `t` (cleaned up by `t`): routeWorld with the journaling port. `lateAck`:
 * the port's `onAcked` fires only on `w.mailbox.announceAcks()` (the C-ROUTE suite's lateAckPort),
 * so an offer can be acked in the mailbox while routing's ledger still thinks it pending.
 */
export async function revocationWorld(t, sdk, { lateAck = false } = {}) {
  const port = lateAck ? (real) => revocationPort(real, lateAckPort) : revocationPort
  const w = await routeWorld(t, sdk, { port })
  for (const m of Object.values(SURFACE)) assert.equal(typeof w.routing[m], 'function', `openRouting's result has no ${m}() (C-REVOKE step 1)`)
  return w
}
