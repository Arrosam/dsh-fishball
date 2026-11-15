/**
 * The live-offer ledger (task C-ROUTE; K1c-2; Fishball 2026-11-14). Every offer and `ask` C-ROUTE
 * commits is recorded with the pair that holds it, its event and whether that pair has acked it,
 * so a session leaving management can retire exactly its live offers.
 *
 * In memory only: an offer is live while the session's call waits, and no call survives a connector
 * restart (V2 contract 1.2 §5.1: "there are no live offers across a restart"; design §10), so there
 * is nothing to retire after one.
 *
 * Retiring one offer (Fishball's decision, 2026-11-14): K1c-2 says one `retirement` per live offer,
 * and an agent that already acked the offer still holds it in its context, so it must be told too.
 * - still pending in the pair's mailbox: `Mailbox.retire(pair, eventId, reason)`, which replaces it;
 * - already acked: a fresh `retirement` draft naming it, committed to the same pair through the
 *   normal commit path (the router's follow-up rule).
 * The ledger's `acked` (from `markAcked`) only says which to try first. It flips when the mailbox
 * port's `onAcked` fires, after `ack` has resolved, so an `inbox_ack` of the offer can land on the
 * mailbox's chain just before `retire` (W2 finding SF3). `retire` then finds nothing pending and
 * resolves `{retired: false}` (K1 amendment at the W3 merge, DECIDED #W3-1), and the fresh
 * retirement is sent instead, so the pair is told either way.
 * The same rule serves `session_release` and Take back (`released`) and a revocation (`revoked`).
 * `false` also answers an event that is gone because its box was dropped (a delete), and a fresh
 * retirement into that box would never be polled. So C-REVOKE drops a revoked pair's mailbox only
 * after routing's `revoked` retirements for it have run (the user's decision at the W3 merge,
 * option a; `endPrincipal` resolves once they have); this module does not check for a dropped box
 * itself. For a delete C-REVOKE also turns fresh retirements off (`freshRetirements: false`, the
 * user's review note): the box is dropped next, so a retirement committed into it is a write
 * nobody polls. A disable keeps them on, because the held box is pollable again on re-enable.
 * An `ask` is not retired when management ends: it is not an offer for revocation (K1
 * OFFER_TYPES), and its asker keeps waiting for the answer of the pair that got it.
 */
import { EVENT_TYPE, OFFER_TYPES } from '../../mcp-schema/index.js'

/**
 * @param {object} deps
 * @param deps.mailbox - the K1 `Mailbox` port
 * @param {(subject: object, draft: object) => Promise<object>} deps.produce - the one commit path (index.js)
 * @param {(error: unknown) => void} deps.onRetireFailed - logs a failed retirement of `retireSession`
 * @returns the ledger
 */
export function createOfferLedger({ mailbox, produce, onRetireFailed }) {
  /** offerId → {type, sessionId, principalKey, eventId, acked, answer?}; `answer` resolves an ask's waiting call. */
  const live = new Map()

  /**
   * Retires one live offer by the rule above.
   * @param freshRetirements - whether a not-pending (acked) offer gets a fresh `retirement`; only a
   *   delete turns it off (module comment), so every other caller keeps the default.
   */
  async function retireOne(offerId, record, reason, freshRetirements = true) {
    live.delete(offerId)
    if (!record.acked && (await mailbox.retire(record.principalKey, record.eventId, reason)).retired) return
    if (!freshRetirements) return
    await produce(
      { type: EVENT_TYPE.retirement, sessionId: record.sessionId, followsPrincipal: record.principalKey },
      { sourceSessionId: record.sessionId, correlationId: offerId, payload: { retiredEventId: record.eventId, reason } },
    )
  }

  return Object.freeze({
    has: (offerId) => live.has(offerId),

    /** Records an offer or ask committed as `eventId` to `principalKey`. */
    record(offerId, entry) {
      live.set(offerId, { ...entry, acked: false })
    },

    /** The pair acked these receipts: its offers among them are acked from now on. */
    markAcked(principalKey, receipts) {
      const eventIds = new Set((Array.isArray(receipts) ? receipts : []).map((receipt) => receipt?.eventId))
      for (const record of live.values()) if (record.principalKey === principalKey && eventIds.has(record.eventId)) record.acked = true
    },

    /** `{sessionId, principalKey}` of a live offer or ask, or undefined. */
    holderOf(offerId) {
      const record = live.get(offerId)
      return record === undefined ? undefined : Object.freeze({ sessionId: record.sessionId, principalKey: record.principalKey })
    },

    /** An offer or ask was answered: it is no longer live; a waiting ask gets `result`. */
    settle(offerId, result) {
      const record = live.get(offerId)
      if (record === undefined) return false
      live.delete(offerId)
      record.answer?.(result)
      return true
    },

    /**
     * The session's call ended before an answer: the offer (or ask) is retired from its pair by the
     * same rule as above, and a waiting ask gets `result`.
     * @returns whether it was live
     */
    async withdraw(offerId, reason, result) {
      const record = live.get(offerId)
      if (record === undefined) return false
      record.answer?.(result)
      await retireOne(offerId, record, reason)
      return true
    },

    /**
     * Retires every live offer of `sessionId` held by `principalKey` (K1c-2). Every offer is tried,
     * and each failure goes to `onRetireFailed`: it never rejects, because managed state's `leave`
     * must not (the management change stands either way).
     * @param options.freshRetirements - see `retireOne`; absent (release, Take back) means `true`
     * @returns the offers it retired, `{offerId, sessionId, type}` each, failed ones included: they
     *   are no longer live either way, so C-REVOKE still hands each to the user (R-ROUTE-06). A
     *   failed retire leaves its event as it was: on a disable it is pollable again on re-enable.
     */
    async retireSession(sessionId, principalKey, reason, { freshRetirements } = {}) {
      const offers = [...live].filter(([, record]) => record.sessionId === sessionId && record.principalKey === principalKey && OFFER_TYPES.includes(record.type))
      for (const [offerId, record] of offers) {
        try { await retireOne(offerId, record, reason, freshRetirements) } catch (error) { onRetireFailed(error) }
      }
      return Object.freeze(offers.map(([offerId, record]) => Object.freeze({ offerId, sessionId, type: record.type })))
    },
  })
}
