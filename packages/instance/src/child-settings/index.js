/**
 * fishball-hosted-settings, host half (SET, docs/planning/v2-set.md; R-HOST-11): the Fetch routes
 * the hosted-only settings sections call at the child's own origin. Owned by the instance; mounted
 * only by the child's launch overlay, never in main DSH (I-PLACE later places it as the bundle).
 *
 * The sections show the main card's status line from the same source (packages/instance/client.js),
 * so these routes answer the same paths and shapes as the main routes. They are built from the
 * main routes' own route table (src/native-web.js); only the backing service differs: here it is
 * the settings relay to the main host (src/slim/settings-relay.js), because only that host owns
 * the instance's lifecycle.
 *
 * There is no model-sync route here (`models/check`, `models/add`): the child must never start a
 * sync, which only the main DSH's "Model for Fishball" block does (the user's decision of
 * 2026-11-11, docs/planning/v2-set.md). DSH's Fetch registry answers those paths 404.
 *
 * DSH's connection.fetch registry is owner-only and applies the child's native admission, so these
 * routes take the child page's own cookie; the relay carries no browser credential.
 */
import { createSettingsRelayClient, SETTINGS_RELAY } from '../slim/settings-relay.js'
import { instanceStatusRoutes } from '../native-web.js'
import { SYNC_PAGE } from '../slim/host/provider-sync-routes.js'
import { registerGetRoute, registerPostRoutes } from '../slim/host/fetch-routes.js'

export const name = 'fishball-hosted-settings'
export const inject = ['nativeRuntime', 'connection']

const SETTINGS = Object.freeze({
  restartPath: '/api/fishball-instance/restart',
  // A typed refusal is a page result, as on every Fishball owner route (settings-routes.js).
  ok: 200,
})
const OP = SETTINGS_RELAY.op

/**
 * The restart route answers the relay's typed outcome as it is: `{ok:true,result:{state,code,detail}}` or
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
 * A relay status answer as the status routes' readers expect it: the `{state, code, detail}` the main host
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
  ctx.effect(() => registerGetRoute(ctx, statusRoute), name + ': status route')
  registerPostRoutes(ctx, [retryRoute, restartRoute(relay)], name + ': settings routes')
  if (typeof ctx.nativeRuntime?.onInstanceSettingsTransport === 'function') {
    ctx.effect(() => ctx.nativeRuntime.onInstanceSettingsTransport((transport) => {
      try { relay.attach(transport) } catch { /* the next wire replaces it */ }
    }), name + ': settings relay')
  }
  ctx.effect(() => () => relay.close(), name + ': relay close')
}
