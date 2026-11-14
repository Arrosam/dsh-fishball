/**
 * Which host-only services embed-UI can use now (task U-SHELL; design §4.2; R-UI-01, R-UI-08,
 * R-UI-09; UIM-EP-01). Each is looked up at runtime with `ctx.get`, never injected (K3
 * host-services/index.d.ts), and counts only with `apiVersion` SERVICE.apiVersion: any other value
 * is the service absent (UIM-EP-01 row 5).
 *
 * Cordis emits `internal/service` whenever a service appears, is replaced or goes (both SDKs), so
 * the lookup follows it without a timer or a gating inject.
 */
import { LABEL, LOG, SERVICE } from './constants.js'

/** The service `name` if it is provided now with the contract's version, else undefined. */
export function usable(ctx, name) {
  const service = ctx.get(name)
  return service?.apiVersion === SERVICE.apiVersion ? service : undefined
}

/**
 * What the client may register, as UIM-EP-01 reads it: `page` (the Fishball page, frame, status,
 * Retry and the Plugins card's model sync) needs `fishballChild`; `connector` (marks, Hand over,
 * fish and dots, attention tools) needs both connector services. `legacy` is the V2 connector
 * service, which keeps the V2 frame and marks working until W4b removes it (SERVICE.legacyConnector).
 */
export function availability(ctx) {
  return Object.freeze({
    page: usable(ctx, SERVICE.child) !== undefined,
    connector: usable(ctx, SERVICE.handover) !== undefined && usable(ctx, SERVICE.tools) !== undefined,
    legacy: ctx.get(SERVICE.legacyConnector) !== undefined,
  })
}

/**
 * Logs `instance-missing` once per row activation when no usable `fishballChild` exists once the
 * app is ready (R-UI-01: "registers no frame and logs one `instance-missing` diagnostic"). It waits
 * for app-ready because the instance's row may load after this one in the same boot; a DSH with
 * no app-ready service is checked at once.
 * @param ctx - the host row's context. @param logger - the row's logger.
 */
export function reportInstanceMissing(ctx, logger) {
  let reported = false
  const check = () => {
    if (reported || usable(ctx, SERVICE.child) !== undefined) return
    reported = true
    logger.warn(LOG.instanceMissing, SERVICE.apiVersion)
  }
  const appReady = ctx.get(SERVICE.appReady)
  if (typeof appReady?.onReady === 'function') ctx.effect(() => appReady.onReady(check), LABEL.ready)
  else check()
}
