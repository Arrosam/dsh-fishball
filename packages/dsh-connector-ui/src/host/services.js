/**
 * Which host-only services embed-UI can use now (tasks U-SHELL, U-DRAW; design §1.0, §4.2;
 * R-ARCH-04, R-UI-01, R-UI-08, R-UI-09; requirements 1.38 Q-U1; UIM-EP-01). Each is looked up at
 * runtime with `ctx.get`, never injected (K3 host-services/index.d.ts), and counts only with
 * `apiVersion` SERVICE.apiVersion: any other value is the service absent (UIM-EP-01 row 5).
 *
 * Each caller looks up afresh (a route per request, the client once per page load), so a service
 * that appears, is replaced or goes is seen at the next lookup, without a timer or a gating inject.
 */
import { LABEL, LOG, SERVICE } from './constants.js'

/** Whether a service object carries the contract's version (any other value is the service absent). */
const isUsable = (service) => service?.apiVersion === SERVICE.apiVersion

/** The service `name` if it is provided now with the contract's version, else undefined. */
export function usable(ctx, name) {
  const service = ctx.get(name)
  return isUsable(service) ? service : undefined
}

/**
 * Whether a local connector is there (Q-U1: "embed UI是connector的附属插件，不能脱离connector运作"):
 * its UI backend, or (until C-WIRE) V2's connector service, which serves only the V2 frame. This
 * is wider than availability's `connector` flag, which is the UI backend alone: the logs and the
 * route refusals ask "is there a connector at all", the client asks "what can I draw".
 */
export const hasConnector = (ctx) => usable(ctx, SERVICE.ui) !== undefined || ctx.get(SERVICE.legacyConnector) !== undefined

/**
 * What the client may register (UIM-EP-01, design §4.2), one flag per service:
 * - connector: the connector's UI backend (the fish, its light, the notify prompt, the marks and
 *   Hand over / Take back, the window or the hint); `ui` carries its routes, page-relative;
 * - page: `dshInstanceChild` (the window onto the hosted child's page and its status);
 * - legacy: V2's connector service, which keeps the V2 frame working until W4b removes it
 *   (SERVICE.legacyConnector).
 * @param pageRelative - turns a route path into the form the browser resolves against DSH's page.
 */
export function availability(ctx, pageRelative) {
  const ui = usable(ctx, SERVICE.ui)
  const uiRoutes = ui === undefined ? {} : Object.fromEntries(Object.entries(ui.routes).map(([key, path]) => [key, pageRelative(path)]))
  return Object.freeze({
    connector: ui !== undefined,
    page: usable(ctx, SERVICE.child) !== undefined,
    legacy: ctx.get(SERVICE.legacyConnector) !== undefined,
    ui: Object.freeze(uiRoutes),
  })
}

/**
 * Logs once per row activation, once the app is ready (the instance's or the connector's row may
 * load after this one in the same boot; a DSH with no app-ready service is checked at once):
 * - no local connector: one `connector-missing` error and nothing else (Q-U1, R-UI-09);
 * - a connector but no usable `dshInstanceChild`: one `instance-missing` warning (R-UI-01).
 * @param ctx - the host row's context. @param logger - the row's logger.
 */
export function reportMissing(ctx, logger) {
  let reported = false
  const check = () => {
    if (reported) return
    reported = true
    if (!hasConnector(ctx)) logger.error(LOG.connectorMissing, SERVICE.apiVersion)
    else if (usable(ctx, SERVICE.child) === undefined) logger.warn(LOG.instanceMissing, SERVICE.apiVersion)
  }
  const appReady = ctx.get(SERVICE.appReady)
  if (typeof appReady?.onReady === 'function') ctx.effect(() => appReady.onReady(check), LABEL.ready)
  else check()
}

/**
 * @param logger - the row's logger.
 * Declares embed-UI's notify and attention tools (R-FN-01, R-EXT-13 amended by 1.34, design §13.6):
 * while both the UI backend and the contribution service are there, the backend's `contribute`
 * registers its tool definitions through `dshConnectorTools.register`. Both are reached through
 * the sub-scope's own service handles, so the contribution service's traced `this.ctx` is this
 * row's scope: C-EXT then derives the namespace from this package (R-EXT-03, never passed in).
 * The sub-scope ends when this row or either service goes, and its end disposes the contribution,
 * which takes the tools out of `tools/list` and resets the latch and the prompt (§13.6).
 * Embed-UI holds no tool handler and no state; the backend owns both (1.34).
 */
export function contributeTools(ctx, logger) {
  ctx.inject([SERVICE.ui, SERVICE.tools], (scope) => {
    const ui = scope[SERVICE.ui]
    if (!isUsable(ui) || !isUsable(scope[SERVICE.tools])) return
    scope.effect(() => {
      // A refused registration (C-EXT: contributor-unidentified, namespace-reserved, tool-exists)
      // leaves no tool behind (the backend disposes the ones it made) and is logged once on this
      // row, instead of failing the sub-scope with no row log line.
      try { return ui.contribute((definition) => scope[SERVICE.tools].register(definition)) } catch (error) {
        logger.warn(LOG.toolsRefused, error?.code ?? error?.message ?? String(error))
        return undefined
      }
    }, LABEL.tools)
  })
}
