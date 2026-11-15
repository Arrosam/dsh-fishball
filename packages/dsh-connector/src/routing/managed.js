/**
 * Managed state (task C-ROUTE; K1c `ManagedState`, `MANAGED_REFUSAL`; README "Managed state",
 * K1c-1 and K1c-2; R-ROUTE-01, R-WATCH-01). At most one manager per root session id.
 *
 * - Durable: every change is written to the `managed` table before its promise resolves, and the
 *   table is read back at open, so a connector restart keeps it (K1c-1).
 * - Serial: every change runs on one chain, so of two overlapping calls the first wins and the
 *   second sees its result (the rule of V2's ManagedRegistry, review M1). Offer commits run on the
 *   same chain (`withState`), and so do settle, withdraw and askDropped, so a release can never
 *   miss an offer committed while it runs.
 * - Visible on resolve: the in-memory map changes right after the write, inside the same step.
 * - One way in (`assign`: `session_start`, Hand over) and one way out (`end`: `session_release`,
 *   Take back, revocation). Leaving always runs `leave(sessionId, manager, reason)`, which retires
 *   the session's live offers (K1c-2), inside the same step.
 * - A follow-up (`then`: Hand over's `handover`, Take back's `takeback`) runs once the change is
 *   stored. The change is the authority: a follow-up that fails is logged and the change stands,
 *   as V2's managed notes did ("a refused note is logged, the change itself stands"). Its draft is
 *   checked before the change (handover/index.js), so only a storage failure can fail it.
 */
import { MANAGED_REFUSAL, RETIREMENT_REASON } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { isNonEmptyString } from '../mailbox/draft.js'
import { LOG, MISUSE } from './constants.js'
import { managedKeyOf } from './store.js'
import { listenerSet, serialChain } from './support.js'

const OK = Object.freeze({ ok: true })
const refusal = (code) => Object.freeze({ ok: false, code })
const ALREADY_MANAGED = refusal(MANAGED_REFUSAL.alreadyManaged)
const NOT_MANAGED = refusal(MANAGED_REFUSAL.notManaged)
const OTHER_MANAGER = refusal(MANAGED_REFUSAL.otherManager)

const assertSession = (sessionId) => { if (!isNonEmptyString(sessionId)) throw new TypeError(MISUSE.sessionId) }
const assertPrincipal = (principalKey) => { if (!isNonEmptyString(principalKey)) throw new TypeError(MISUSE.principalKey) }

/**
 * @param {object} deps
 * @param deps.table - the routing domain's `managed` table (store.js)
 * @param deps.logger - `{warn}`; a throwing change listener and a failed follow-up are logged there
 * @param {(sessionId: string, manager: string, reason: string, freshRetirements?: boolean) => Promise<unknown>} deps.leave -
 *   after a session stopped being managed (its live offers are retired with `reason`); it must not
 *   reject. What it resolves to is handed back by `endAllOf` (the offers revocation retired).
 * @returns `{state, assign, end, endAllOf, withState, drain}`: `state` is the K1c `ManagedState`;
 *   the rest is for the hand-over service, revocation and the offer path, never handed to C-TOOLS.
 */
export function createManagedState({ table, logger, leave }) {
  const serial = serialChain()
  const changes = listenerSet(logger, LOG.format, LOG.listenerFailed)
  /** Root session id → its manager's principal key; derived from the table, which stays the authority. */
  const managers = new Map()
  for (const [, record] of table.entries()) managers.set(record.sessionId, record.principalKey)

  /** Runs a stored change's follow-up; a failure is logged, never undoes the change (module comment). */
  async function followUp(then, ...args) {
    try { await then?.(...args) } catch (error) { logger.warn(LOG.format, LOG.followUpFailed, diagnosticOf(error)) }
  }

  /**
   * Makes `principalKey` the manager of an unmanaged session; a managed one, the caller included,
   * is `conflict` (K1c-1, the rule of K3 `handOver`).
   * @param options.admit - `() => refusal | undefined`, checked inside the step after the conflict
   *   check, so K3's order `conflict` → `no-agent` holds against a racing change. With it, the
   *   principal key is admit's to judge (a bad key is K3's `no-agent`, never a throw).
   * @param options.then - the follow-up, run once the change is stored (Hand over's event).
   * @throws TypeError for a bad session id, or a bad principal key without `admit` (a caller bug)
   */
  function assign(sessionId, principalKey, { admit, then } = {}) {
    assertSession(sessionId)
    if (admit === undefined) assertPrincipal(principalKey)
    return serial(async () => {
      if (managers.has(sessionId)) return ALREADY_MANAGED
      const refused = admit?.()
      if (refused !== undefined) return refused
      await table.put(managedKeyOf(sessionId), { sessionId, principalKey })
      managers.set(sessionId, principalKey)
      changes.fire()
      await followUp(then)
      return OK
    })
  }

  /**
   * One end, inside a serial step (see `end`).
   * @returns `{ok: true, manager, left}`, where `left` is what `leave` resolved to, or a refusal
   */
  async function endNow(sessionId, { by, reason, then, freshRetirements }) {
    const manager = managers.get(sessionId)
    if (manager === undefined) return NOT_MANAGED
    if (by !== undefined && by !== manager) return OTHER_MANAGER
    await table.delete(managedKeyOf(sessionId))
    managers.delete(sessionId)
    changes.fire()
    // `followUp` logs instead of throwing; the `finally` keeps "always retire" true if that ever
    // changes: the session is unmanaged now, so its offers must not stay with the old pair (K1c-2).
    let left
    try {
      await followUp(then, manager)
    } finally {
      left = await leave(sessionId, manager, reason, freshRetirements)
    }
    return Object.freeze({ ok: true, manager, left })
  }

  /**
   * Ends a session's management.
   * @param options.by - only this principal may end it (`session_release`): another manager is
   *   `forbidden`; absent for Take back, which ends it for whoever manages it.
   * @param options.reason - RETIREMENT_REASON for its live offers.
   * @param options.then - `(manager) => Promise`, the follow-up, run once the change is stored and
   *   before the offers are retired (Take back's `takeback`).
   * @returns `{ok: true, manager}` or a K1c refusal; a refusal changes nothing.
   */
  function end(sessionId, options) {
    assertSession(sessionId)
    if (options.by !== undefined) assertPrincipal(options.by)
    return serial(() => endNow(sessionId, options))
  }

  /**
   * Ends every session `principalKey` manages (its entry was revoked; R-ROUTE-06), in one step:
   * the list is read inside the chain, so a `manage` that was queued before it is ended too.
   * @param freshRetirements - handed to `leave` (routing's offer ledger: off for a delete)
   * @returns once every `leave` has run, `[{sessionId, left}]` in the order they were ended
   */
  function endAllOf(principalKey, reason, freshRetirements) {
    assertPrincipal(principalKey)
    return serial(async () => {
      const sessions = [...managers].filter(([, manager]) => manager === principalKey).map(([sessionId]) => sessionId)
      const ended = []
      for (const sessionId of sessions) {
        const { left } = await endNow(sessionId, { by: principalKey, reason, freshRetirements })
        ended.push(Object.freeze({ sessionId, left }))
      }
      return Object.freeze(ended)
    })
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

  return Object.freeze({
    state,
    assign,
    end,
    endAllOf,
    /**
     * Runs `step` on the managed chain: no change can land between its read of the manager and its end.
     * A step must never await another managed-chain call (`assign`, `end`, `endAllOf`, or routing's
     * `settle`, `withdraw`, `askDropped`): it would wait on itself.
     */
    withState: (step) => serial(step),
    /** Resolves once every change queued so far has settled (`close`). */
    drain: () => serial(async () => {}),
  })
}
