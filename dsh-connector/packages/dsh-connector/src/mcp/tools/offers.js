/**
 * Answer authority over live offers (task C-TOOLS; design §3.4; R-CON-05/06/07; spike V3-S3
 * Q-S3-1: one record per request, offer id `<requestId>.r<revision>`).
 *
 * The live offer, its current `offerId` and the principal holding it come from the
 * `interactions` port, which C-ROUTE and C-WIRE supply (Fishball's decision Q1, 2026-11-14): this
 * module mints no offer id and keeps no offer record. It decides only who may commit an answer,
 * in this order (Fishball's decision, 2026-11-14):
 * - the offer is live and held by another principal → `forbidden`;
 * - live and held by the caller, but `offerId` is not its current one → `expired`;
 * - live, held by the caller, current → the domain commits (its own refusal, such as
 *   `risk-required`, leaves the offer live and answerable);
 * - not live, and this connector settled that `offerId` for the caller → `already-settled`;
 *   for another principal → `forbidden`; anything else not live → `expired`.
 * An accepted answer that settles nothing (`toUser`, `escalate`: the request goes on waiting with
 * the user) is never remembered as settled, so the principal can still answer it while it is open
 * (the user, 2026-11-21: "Fishball can always answer while the request is open").
 *
 * **First commit wins (OQ-14).** The domain settles a request once. On top of that, answers to
 * one request through these tools run one after another, so of two principal answers the second
 * sees the first's outcome (`already-settled`), never a half-done state. A user's answer in the
 * session still races in the domain; the loser then sees the request not live (`expired`).
 *
 * **The settled set (Fishball's decision Q2, 2026-11-14)** holds every `offerId` this module
 * committed, with its holder, in memory for the connector's life: no bound, no timer and no new
 * tunable (R-CON-05: nothing here expires by time). After a restart a settled id answers `expired`.
 */
import { REFUSAL, parseOfferId } from '../../../mcp-schema/index.js'

const refused = (code) => Object.freeze({ ok: false, code })

/**
 * @param {object} ports
 * @param {{liveOffers(sessionId: string): Promise<readonly {principalKey: string, descriptor: {approvalId: string, offerId: string}}[]> | readonly object[]}} ports.interactions
 */
export function createOfferDesk({ interactions }) {
  /** offerId → the principal key it was committed for. */
  const settled = new Map()
  /** requestId → the tail of its answer queue. */
  const queues = new Map()

  /** Runs `task` after every earlier answer to `requestId` has finished, whatever their outcome. */
  function serial(requestId, task) {
    const run = (queues.get(requestId) ?? Promise.resolve()).then(task)
    const tail = run.then(() => undefined, () => undefined)
    queues.set(requestId, tail)
    void tail.then(() => { if (queues.get(requestId) === tail) queues.delete(requestId) })
    return run
  }

  /** The offers of a session, with their holders, as the port lists them. */
  const liveOffers = async (sessionId) => [...(await interactions.liveOffers(sessionId))]

  /** The caller's live offers of one session, as `approvals_list` shows them. */
  async function heldBy(sessionId, principalKey) {
    return (await liveOffers(sessionId)).filter((offer) => offer.principalKey === principalKey).map((offer) => offer.descriptor)
  }

  /** The answer for an offer that is not live (see the header). */
  function notLive(offerId, principalKey) {
    const holder = settled.get(offerId)
    if (holder === undefined) return refused(REFUSAL.expired)
    return refused(holder === principalKey ? REFUSAL.alreadySettled : REFUSAL.forbidden)
  }

  /**
   * One principal answer.
   * @param {{sessionId: string, requestId: string, offerId: string, principalKey: string, settles?: boolean}} answer
   *   `settles: false` for an answer that hands the request on without deciding it (toUser, escalate)
   * @param {(sessionId: string) => Promise<{ok: boolean, code?: string}>} commit the domain's answer for the
   *   offer's root session, run only when allowed
   * @returns the domain's result, or `{ok: false, code}`
   */
  function answer({ sessionId, requestId, offerId, principalKey, settles = true }, commit) {
    // An offer id names its request: one naming another request never answers this one.
    if (parseOfferId(offerId)?.requestId !== requestId) return Promise.resolve(refused(REFUSAL.expired))
    return serial(requestId, async () => {
      // A committed id is never answerable again, whatever the port's timing in dropping it from
      // `liveOffers` (a retirement may follow the commit asynchronously): first commit wins.
      if (settled.has(offerId)) return notLive(offerId, principalKey)
      const live = (await liveOffers(sessionId)).find((offer) => offer.descriptor.approvalId === requestId)
      if (live === undefined) return notLive(offerId, principalKey)
      if (live.principalKey !== principalKey) return refused(REFUSAL.forbidden)
      if (live.descriptor.offerId !== offerId) return refused(REFUSAL.expired)
      const result = await commit(sessionId)
      if (result?.ok === true && settles) settled.set(offerId, principalKey)
      return result
    })
  }

  return Object.freeze({ heldBy, answer })
}
