/**
 * Watchdog's health vocabulary (task WD-ROUTE; R-WD-07, R-FB-06, R-FB-07, R-WD-08; design §7.3).
 * Watchdog's own values; the K3 and K1 words it reads are in ../intercept/contract.js.
 */

/**
 * One plugin generation's health. `down` and `off` are final for the generation: recovery is a
 * restart of the plugin, which builds a new generation (WD-ST-01 row 5), so a stale callback of the
 * old one can never make it healthy again.
 * - starting: loaded, not registered with core yet;
 * - healthy: both registrations live (WD-ST-01 row 1);
 * - down: a failure of any kind (R-WD-07); one "watchdog is down" notice per episode;
 * - off: the owner disabled the plugin (WD-ST-01 row 7): no notice, since that is no failure
 *   (WD-UC-05 A2).
 */
export const HEALTH = Object.freeze({ starting: 'starting', healthy: 'healthy', down: 'down', off: 'off' })

/**
 * Failure kinds, R-WD-07's list, one vocabulary for every Watchdog module. The notice and the log name
 * the kind only, never a payload. WD-ROUTE raises `load` (core's contract cannot be read),
 * `registration` (core refused an interception) and `runtime` (a handler threw); the others are
 * raised through `health.fail(cause)` by the W4 modules that detect them (WD-DECIDE, WD-PATROL) and
 * by WD-WIRE.
 */
export const CAUSE = Object.freeze({
  load: 'load',
  readiness: 'readiness',
  registration: 'registration',
  registrationLost: 'registration-lost',
  model: 'model',
  budget: 'budget',
  store: 'store',
  claim: 'claim',
  attach: 'attach',
  runtime: 'runtime',
})

/**
 * The "watchdog is down" notice (R-WD-07, R-WD-08): `manager.notify` (X10) with `wake: true`, so
 * Fishball gets one notice turn. X10's dedupe is durable, so every episode needs its own key: a key
 * reused after a restart would be dropped as a duplicate.
 */
export const NOTICE = Object.freeze({
  dedupePrefix: 'fishball-watchdog:down:',
  wake: true,
})

/** Texts: the notice goes into Fishball's context; the rest is the background log. */
export const TEXT = Object.freeze({
  down: (cause) => `Fishball notice: watchdog is down (${cause}). Until it is back, every permission request comes to you; no session was stopped.`,
  /** Thrown (and logged) when the bound core offers no `manager.notify`. */
  notifyMissing: 'manager.notify is unavailable',
  logDown: 'watchdog is down (%s)',
  logAgain: 'watchdog failed again while down (%s)',
  logNoticeFailed: 'the "watchdog is down" notice could not be sent (%s)',
  logListenerFailed: 'an effective-off step failed (%s); the others still ran',
})
