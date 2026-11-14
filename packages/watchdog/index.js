/**
 * fishball-watchdog's plugin row (task WD-ROUTE; R-FB-06, R-WD-01, R-WD-02, R-INT-07; design §7.1).
 * WD-ROUTE wires the interception and the health only; WD-WIRE (W4b) adds WD-DECIDE and WD-PATROL.
 */
import { PLUGIN, SERVICES } from './src/constants.js'
import { HOST, LOG } from './src/intercept/constants.js'
import { openRouting } from './src/intercept/index.js'
export { Config } from './src/config.js'

export const name = PLUGIN.name
export const inject = [...SERVICES]

/**
 * Cordis has no '?' injection suffix, and a missing fishball-core must never fail the load
 * (R-FB-06), so `fishballInstance` is looked up at runtime and followed through Cordis's
 * `internal/service` event: core's app row publishes it after an asynchronous start, may replace it
 * on a restart, or withdraw it. Each bound core gets its own routing generation; a replaced or
 * withdrawn core ends the old one with no notice (there is no core left to tell). Recovery after a
 * failure is a restart of the plugin or of core (WD-ST-01 row 5), which binds a fresh generation.
 */
export function apply(ctx) {
  const logger = ctx.logger?.(PLUGIN.name)
  // `bound` compares the service object itself: core's `fishballInstance` carries no Cordis tracker
  // (only its `events` member does), so `ctx.get` returns the same object on every call. Revisit if
  // core ever traces the whole service, since a traced value is a fresh proxy per `get`.
  let bound
  let routing
  // Synchronous: off at once, with no notice (openRouting's `dispose`).
  const unbind = () => {
    const done = routing
    bound = routing = undefined
    done?.dispose()
  }
  const sync = () => {
    // A strict get: a provider not ACTIVE yet (or unloading) reads as absent.
    const instance = ctx.get(PLUGIN.instanceService)
    if (instance === bound) return
    unbind()
    if (instance?.apiVersion !== PLUGIN.apiVersion) return
    bound = instance
    routing = openRouting({ instance, pluginId: PLUGIN.name, logger })
  }
  sync()
  ctx.on(HOST.serviceEvent, (service) => { if (service === PLUGIN.instanceService) sync() })
  // Disabling the row is off, not a failure (WD-ST-01 row 7): both registrations go, no notice.
  ctx.effect(() => unbind, HOST.effectLabel)

  // R-FB-06: without fishball-core, Watchdog does nothing but log one line, a warning, since the
  // plugin is installed but cannot work. Judged at app ready, when every row (core's included) has
  // had its chance to publish; a DSH launcher always provides appReady, and onReady calls a late
  // listener at once. A `fishballInstance` of another apiVersion is no compatible core either (the
  // older-instance rule of fold-notify and board), so it logs the same line.
  const reportMissing = () => { if (bound === undefined) logger?.warn(LOG.coreMissing) }
  const appReady = ctx.get(HOST.appReady)
  if (typeof appReady?.onReady === 'function') ctx.effect(() => appReady.onReady(reportMissing), HOST.readyLabel)
  else reportMissing()
}
