/**
 * The supervision state Watchdog's two interception filters read (task WD-ROUTE; R-INT-07, R-WD-11,
 * R-WD-12; design §6.4, §7.1). In memory, one per generation: a new generation (a restart of the
 * plugin or of core) starts with nothing claimed, and a claim is made again only by the module that
 * owns claims (WD-PATROL, W4). That is R-WD-07's "its claims are released" for free.
 *
 * - claimed sessions: one side session per watched session (U8); their `permission` requests are
 *   Watchdog's while it is healthy;
 * - held offers: offer ids Watchdog held or escalated to the user (WD-DECIDE, W4); their
 *   `settlement` / `retirement` are Watchdog's.
 * A `settlement` or `retirement` ends its offer, so the handler forgets it (`forget`).
 */
export function createSupervision() {
  const claimed = new Set()
  const held = new Set()
  return Object.freeze({
    claim: (sessionId) => { claimed.add(sessionId) },
    /** The claim ends at once (R-WD-11): no stop of the session, no notice. */
    release: (sessionId) => { claimed.delete(sessionId) },
    isClaimed: (sessionId) => claimed.has(sessionId),
    hold: (offerId) => { held.add(offerId) },
    forget: (offerId) => { held.delete(offerId) },
    holds: (offerId) => held.has(offerId),
    /** Effective off (R-WD-07): every claim released and every held offer forgotten. */
    clear: () => { claimed.clear(); held.clear() },
  })
}
