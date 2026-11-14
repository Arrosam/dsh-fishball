/**
 * Managed state (task C-ROUTE; K1c `ManagedState`, `MANAGED_REFUSAL`; README "Managed state",
 * K1c-1 and K1c-2; R-ROUTE-01, R-WATCH-01). At most one manager per root session id.
 *
 * - Durable: every change is written to the `managed` table before its promise resolves, and the
 *   table is read back at open, so a connector restart keeps it (K1c-1).
 * - Serial: every change runs on one chain, so of two overlapping calls the first wins and the
 *   second sees its result (the rule of V2's ManagedRegistry, review M1).
 * - Visible on resolve: the in-memory map changes right after the write, inside the same step.
 * - One way in (`assign`: `session_start`, Hand over) and one way out (`end`: `session_release`,
 *   Take back, revocation). Leaving runs `leave(sessionId, manager, reason)`, which retires the
 *   session's live offers (K1c-2), inside the same step, so a later change sees them retired.
 */
import { MANAGED_REFUSAL, RETIREMENT_REASON } from '../../mcp-schema/index.js'
import { LOG, MISUSE } from './constants.js'
import { managedKeyOf } from './store.js'
import { isKey, listenerSet, serialChain } from './support.js'

const OK = Object.freeze({ ok: true })
const refusal = (code) => Object.freeze({ ok: false, code })
const ALREADY_MANAGED = refusal(MANAGED_REFUSAL.alreadyManaged)
const NOT_MANAGED = refusal(MANAGED_REFUSAL.notManaged)
const OTHER_MANAGER = refusal(MANAGED_REFUSAL.otherManager)

function assertKeys(sessionId, principalKey) {
  if (!isKey(sessionId)) throw new TypeError(MISUSE.sessionId)
  if (principalKey !== undefined && !isKey(principalKey)) throw new TypeError(MISUSE.principalKey)
}

/**
 * @param {object} deps
 * @param deps.table - the routing domain's `managed` table (store.js)
 * @param deps.logger - `{warn}`; a throwing change listener is logged there
 * @param {(sessionId: string, manager: string, reason: string) => Promise<void>} deps.leave - after a
 *   session stopped being managed (its live offers are retired with `reason`)
 * @returns `{state, assign, end, endAllOf, drain}`: `state` is the K1c `ManagedState`; the rest is
 *   for the hand-over service and revocation, never handed to C-TOOLS.
 */
export function createManagedState({ table, logger, leave }) {
  const serial = serialChain()
  const changes = listenerSet(logger, LOG.format, LOG.listenerFailed)
  /** Root session id → its manager's principal key; derived from the table, which stays the authority. */
  const managers = new Map()
  for (const [, record] of table.entries()) managers.set(record.sessionId, record.principalKey)

  /**
   * Makes `principalKey` the manager of an unmanaged session; a managed one, the caller included,
   * is `conflict` (K1c-1, the rule of K3 `handOver`).
   * @param options.admit - `() => refusal | undefined`, checked inside the step after the conflict
   *   check, so K3's order `conflict` → `no-fishball` holds against a racing change.
   * @param options.then - runs inside the step once the change is stored (Hand over commits its event there).
   */
  function assign(sessionId, principalKey, { admit, then } = {}) {
    assertKeys(sessionId, principalKey)
    return serial(async () => {
      if (managers.has(sessionId)) return ALREADY_MANAGED
      const refused = admit?.()
      if (refused !== undefined) return refused
      await table.put(managedKeyOf(sessionId), { sessionId, principalKey })
      managers.set(sessionId, principalKey)
      changes.fire()
      await then?.()
      return OK
    })
  }

  /**
   * Ends a session's management.
   * @param options.by - only this principal may end it (`session_release`): another manager is
   *   `forbidden`; absent for Take back and revocation, which end it for whoever manages it.
   * @param options.reason - RETIREMENT_REASON for its live offers.
   * @param options.then - `(manager) => Promise`, run once the change is stored and before the
   *   offers are retired (Take back commits its `takeback` there).
   * @returns `{ok: true, manager}` or a K1c refusal; a refusal changes nothing.
   */
  function end(sessionId, { by, reason, then }) {
    assertKeys(sessionId, by)
    return serial(async () => {
      const manager = managers.get(sessionId)
      if (manager === undefined) return NOT_MANAGED
      if (by !== undefined && by !== manager) return OTHER_MANAGER
      await table.delete(managedKeyOf(sessionId))
      managers.delete(sessionId)
      changes.fire()
      await then?.(manager)
      await leave(sessionId, manager, reason)
      return Object.freeze({ ok: true, manager })
    })
  }

  /** Ends every session `principalKey` manages (its entry was revoked; R-ROUTE-06). */
  async function endAllOf(principalKey, reason) {
    const sessions = [...managers].filter(([, manager]) => manager === principalKey).map(([sessionId]) => sessionId)
    for (const sessionId of sessions) await end(sessionId, { by: principalKey, reason })
  }

  const state = Object.freeze({
    managerOf: (sessionId) => managers.get(sessionId),
    managed: () => Object.freeze([...managers].map(([sessionId, principalKey]) => Object.freeze({ sessionId, principalKey }))),
    manage: (sessionId, principalKey) => assign(sessionId, principalKey),
    async release(sessionId, principalKey) {
      const result = await end(sessionId, { by: principalKey, reason: RETIREMENT_REASON.released })
      return result.ok ? OK : result
    },
    onChange: changes.add,
  })

  /** Resolves once every change queued so far has settled (`close`). */
  const drain = () => serial(async () => {})

  return Object.freeze({ state, assign, end, endAllOf, drain })
}
