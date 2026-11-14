/**
 * The vocabulary of Watchdog's routing and plugin row (task WD-ROUTE; R-FB-06, R-INT-07). The K1
 * words of core's contract are not here: they are read through ./contract.js.
 */

/** The DSH host values the plugin row reads (both SDKs). */
export const HOST = Object.freeze({
  /** dsh profile-boot's app-ready service; `onReady(listener)` calls a late listener at once. */
  appReady: 'appReady',
  /** Cordis emits it with the service name whenever a service appears, is replaced or goes (both SDKs). */
  serviceEvent: 'internal/service',
  effectLabel: 'fishball-watchdog: interception',
  readyLabel: 'fishball-watchdog: core-missing check',
})

/** `ctl.release`'s one option (K3 events.d.ts: `{toFishball: true}`, a literal type with no constant). */
export const RELEASE = Object.freeze({ toFishball: true })

/** Background-log texts (R-INT-09: a code at most, never a payload). */
export const LOG = Object.freeze({
  /** R-FB-06: the one line a Watchdog without fishball-core logs, at app ready. */
  coreMissing: 'fishball-core-missing',
  loadFailed: 'fishball-core\'s contract could not be loaded (%s)',
  registerFailed: 'interception registration failed (%s)',
  disposeFailed: 'interception dispose failed (%s)',
})
