/**
 * SET's child row, host half (docs/planning/v2-set.md): the Fetch routes the slim settings panel
 * calls at the child's own origin. Mounted only by the child's launch overlay, never in main DSH.
 *
 * The panel shows the main card's status line and "Model for Fishball" block from the same source
 * (packages/instance/client.js), so these routes answer the same paths and shapes as the main
 * routes. They are built from the main routes' own route tables (src/native-web.js,
 * src/slim/host/provider-sync-routes.js); only the backing service differs: here it is the
 * settings relay to the main host (src/slim/settings-relay.js), because only that host owns the
 * instance's lifecycle and the main DSH's providers.
 *
 * DSH's connection.fetch registry is owner-only and applies the child's native admission, so these
 * routes take the child page's own cookie; the relay carries no browser credential.
 */
import { createSettingsRelayClient, SETTINGS_RELAY } from '../../src/slim/settings-relay.js'
import { instanceStatusRoutes } from '../../src/native-web.js'
import { providerSyncRoutes, SYNC_PAGE } from '../../src/slim/host/provider-sync-routes.js'
import { registerGetRoute, registerPostRoutes } from '../../src/slim/host/fetch-routes.js'

export const name = 'fishball-settings'
export const inject = ['nativeRuntime', 'connection']

const SETTINGS = Object.freeze({
  restartPath: '/api/fishball-instance/restart',
  // A typed refusal is a page result, as on every Fishball owner route (settings-routes.js).
  ok: 200,
})
const OP = SETTINGS_RELAY.op

/**
 * The restart route answers the relay's typed outcome as it is: `{ok:true,result:{state,code}}` or
 * `{ok:false,error:{code}}`. The answer to a restart is usually lost with the child that serves
 * this route, which the panel expects (it keeps "Restarting…").
 */
function restartRoute(relay) {
  return {
    path: SETTINGS.restartPath,
    fetch: async () => new Response(JSON.stringify(await relay.request(OP.restart)), { status: SETTINGS.ok, headers: SYNC_PAGE.headers }),
  }
}

/**
 * A relay status answer as the status routes' readers expect it: the `{state, code}` the main host
 * sent. A refusal throws, so the status route answers `unavailable` and a refused Retry answers
 * the status as it now reads (src/native-web.js instanceStatusRoutes).
 */
async function relayed(relay, op) {
  const outcome = await relay.request(op)
  if (!outcome.ok) throw new Error(outcome.error.code)
  return outcome.result
}

export function apply(ctx) {
  const relay = createSettingsRelayClient()
  const [statusRoute, retryRoute] = instanceStatusRoutes(() => relayed(relay, OP.status), () => relayed(relay, OP.retry))
  const sync = {
    check: () => relay.request(OP.check),
    add: (payload) => relay.request(OP.add, payload),
  }
  ctx.effect(() => registerGetRoute(ctx, statusRoute), name + ': status route')
  registerPostRoutes(ctx, [retryRoute, restartRoute(relay), ...providerSyncRoutes(ctx.connection, sync)], name + ': settings routes')
  if (typeof ctx.nativeRuntime?.onInstanceSettingsTransport === 'function') {
    ctx.effect(() => ctx.nativeRuntime.onInstanceSettingsTransport((transport) => {
      try { relay.attach(transport) } catch { /* the next wire replaces it */ }
    }), name + ': settings relay')
  }
  ctx.effect(() => () => relay.close(), name + ': relay close')
}
