/**
 * The live-offer ledger (task C-ROUTE; K1c-2; Fishball 2026-11-14). Every offer C-ROUTE
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
 * Only offers (K1 OFFER_TYPES) are recorded: C-WIRE-2 removed `ask_agent`, the producer of `ask`.
 *
 * Escalated (C-WIRE-2): a principal's `escalate` (or a question's `toUser`) also shows the request
 * to the user. K1 says escalate settles nothing, so the record stays until the first answer settles
 * it (the user's, to the same pair as every settlement, or the principal's) or its call ends
 * (withdrawn). It stays the agent's too (the user, 2026-11-21: "Fishball can always answer while
 * the request is open"): `liveOffers` lists it, its answer is accepted, a session leaving
 * management retires it as any other offer, and a succession re-issues it.
 *
 * One record per **request** (C-SUCCEED; R-HOST-09, Q-S3-1: one settlement record per request,
 * offer id `<requestId>.r<revision>`). A succession re-issues a live offer as revision n+1 to the
 * successor (`reissued`), and the record follows it: every member below takes any revision of the
 * request's id and acts on the current one, so the user's answer to the request's card is never
 * refused because of a succession (HOST-UC-03 E1a). Refusing an agent's answer to an old revision
 * is C-TOOLS' rule (`expired`), over `current` / `liveOffers`. The record keeps the event's checked
 * draft, so the offer can be re-issued.
 */
import { EVENT_TYPE, parseOfferId } from '../../mcp-schema/index.js'

/** The ledger key of an offer id: its request id (undefined for a value that is no offer id). */
const requestOf = (offerId) => parseOfferId(offerId)?.requestId

/**
 * @param {object} deps
 * @param deps.mailbox - the K1 `Mailbox` port
 * @param {(subject: object, draft: object) => Promise<object>} deps.produce - the one commit path (index.js)
 * @param {(error: unknown) => void} deps.onRetireFailed - logs a failed retirement of `retireSession`
 * @returns the ledger
 */
export function createOfferLedger({ mailbox, produce, onRetireFailed }) {
  /**
   * requestId → {offerId, type, sessionId, principalKey, eventId, draft, acked}: `offerId` is the
   * current revision's and `draft` the committed event's fields (index.js `answerable`).
   */
  const live = new Map()
  const recordOf = (offerId) => live.get(requestOf(offerId))
  /** Removes the request's record and returns it, or undefined. */
  function take(offerId) {
    const record = recordOf(offerId)
    if (record !== undefined) live.delete(requestOf(offerId))
    return record
  }
  const offerView = (record) => Object.freeze({ offerId: record.offerId, sessionId: record.sessionId, type: record.type })

  /**
   * Retires one live offer by the rule above.
   * @param freshRetirements - whether a not-pending (acked) offer gets a fresh `retirement`; only a
   *   delete turns it off (module comment), so every other caller keeps the default.
   */
  async function retireOne(record, reason, freshRetirements = true) {
    live.delete(requestOf(record.offerId))
    if (!record.acked && (await mailbox.retire(record.principalKey, record.eventId, reason)).retired) return
    if (!freshRetirements) return
    await produce(
      { type: EVENT_TYPE.retirement, sessionId: record.sessionId, followsPrincipal: record.principalKey },
      { sourceSessionId: record.sessionId, correlationId: record.offerId, payload: { retiredEventId: record.eventId, reason } },
    )
  }

  return Object.freeze({
    /** Whether the request `offerId` names (any revision) is live. */
    has: (offerId) => recordOf(offerId) !== undefined,

    /** Records an offer committed as `eventId` to `principalKey`, with its draft. */
    record(offerId, entry) {
      live.set(requestOf(offerId), { ...entry, offerId, acked: false })
    },

    /** The pair acked these receipts: its offers among them are acked from now on. */
    markAcked(principalKey, receipts) {
      const eventIds = new Set((Array.isArray(receipts) ? receipts : []).map((receipt) => receipt?.eventId))
      for (const record of live.values()) if (record.principalKey === principalKey && eventIds.has(record.eventId)) record.acked = true
    },

    /** `{offerId, sessionId, principalKey}` of the live request `offerId` names (any revision), or undefined. */
    holderOf(offerId) {
      const record = recordOf(offerId)
      return record === undefined ? undefined : Object.freeze({ offerId: record.offerId, sessionId: record.sessionId, principalKey: record.principalKey })
    },

    /**
     * The live offers of `sessionId` with their holders and current descriptors (C-TOOLS'
     * `interactions.liveOffers` port, which C-WIRE binds to this: `approvals_list` and the answer
     * check read the current `offerId` from here). Escalated ones are listed too (module comment).
     */
    liveOffers: (sessionId) => Object.freeze([...live.values()]
      .filter((record) => record.sessionId === sessionId)
      .map((record) => Object.freeze({ principalKey: record.principalKey, descriptor: Object.freeze(structuredClone(record.draft.payload)) }))),

    /** A principal escalated the offer to the user (module comment). @returns whether it was live and not escalated yet */
    escalate(offerId) {
      const record = recordOf(offerId)
      if (record === undefined || record.escalated === true) return false
      record.escalated = true
      return true
    },

    /** An offer was answered: it is no longer live. @returns whether it was live */
    settle: (offerId) => take(offerId) !== undefined,

    /**
     * The session's call ended before an answer: the offer is retired from its pair by the same
     * rule as above.
     * @returns whether it was live
     */
    async withdraw(offerId, reason) {
      const record = recordOf(offerId)
      if (record === undefined) return false
      await retireOne(record, reason)
      return true
    },

    /**
     * C-SUCCEED (R-HOST-09): every live offer `from` holds is held by `to` from now on, with
     * its event as it is (Mailbox.transfer moved it with its `eventId`).
     * @returns `{requests, undo}`: the moved request ids to re-issue, and `undo()`, which gives every
     *   moved record back to `from`
     */
    moveHolder(from, to) {
      const records = [...live.values()].filter((record) => record.principalKey === from)
      for (const record of records) record.principalKey = to
      const requests = Object.freeze(records.map((record) => requestOf(record.offerId)))
      return Object.freeze({ requests, undo: () => { for (const record of records) if (record.principalKey === to) record.principalKey = from } })
    },

    /**
     * A copy of a live request's record as it is now (`offerId`, `type`, `sessionId`,
     * `principalKey`, `eventId`, a detached `draft`), or undefined.
     */
    current(requestId) {
      const record = live.get(requestId)
      return record === undefined ? undefined : Object.freeze({ ...record, draft: structuredClone(record.draft) })
    },

    /**
     * The request was committed again to its holder (C-SUCCEED): its current revision is `offerId`
     * (its r<n+1>), committed as `eventId` with `draft`.
     */
    reissued(requestId, { offerId, eventId, draft }) {
      const record = live.get(requestId)
      if (record !== undefined) Object.assign(record, { offerId, eventId, draft, acked: false })
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
      const offers = [...live.values()].filter((record) => record.sessionId === sessionId && record.principalKey === principalKey)
      for (const record of offers) {
        try { await retireOne(record, reason, freshRetirements) } catch (error) { onRetireFailed(error) }
      }
      return Object.freeze(offers.map(offerView))
    },
  })
}
