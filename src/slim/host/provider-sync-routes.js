/**
 * The provider-sync route for the settings page (§10).
 *
 * The page's "Refresh models" button calls this one route before it reloads the child's model
 * list; the route calls `service.providerSync.sync()` (src/provider-sync-service.js), which
 * previews and confirms on the host. The request carries no payload and the answer carries only
 * provider ids, names, outcomes and reason codes. Nothing here reads, logs or echoes a credential.
 *
 * The route is registered on DSH's owner-only Fetch registry through the same helper as the
 * admin routes (src/slim/host/fetch-routes.js). On top of the registry's authentication and
 * Host/Origin fence this handler applies an explicit same-origin check: an Origin that names
 * another site, or a Sec-Fetch-Site outside the allowed pair, is refused.
 *
 * Every answer is HTTP 200 with `{ok:true,result}` or `{ok:false,error:{code}}`, because a
 * refusal is a page result. A body over the sync body bound is the one HTTP 400, with the same
 * typed shape.
 */
import { SYNC_PAGE } from '../../provider-sync-service.js'
import { registerPostRoutes } from './fetch-routes.js'

/** The route's exact path. Keep it in step with client.js CHILD_SYNC_UI.path. */
export const PROVIDER_SYNC_ROUTE = Object.freeze({ path: '/api/fishball/native/provider-sync/sync' })

const HTTP = Object.freeze({ ok: 200, badRequest: 400, forbidden: 403 })
const json = (status, value) => new Response(JSON.stringify(value), { status, headers: SYNC_PAGE.headers })
const refusal = (code) => ({ ok: false, error: { code } })
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The admission rule: same origin, or no Origin with a same-site fetch.
 *
 * The Origin is judged against the request's Host by DSH's own fence
 * (`connection.requestRejection`, the check the embed broker also uses), never against
 * `request.url`: DSH's /api bridge rebuilds every Request on a fixed internal base
 * (`http://dsh.internal`, dsh-client-connection lib/index.js:46 on 0.2.1-rc.5 and 0.2.2-rc.1),
 * so the URL never carries the browser's authority. A missing connection service or any
 * rejection refuses the request.
 */
function sameOrigin(connection, request) {
  const site = request.headers.get(SYNC_PAGE.siteHeader)
  if (site && !SYNC_PAGE.allowedSites.includes(site)) return false
  if (typeof connection?.requestRejection !== 'function') return false
  try { return connection.requestRejection({ headers: request.headers }) === undefined } catch { return false }
}

/** The request has no payload; an oversized body is refused before the host is asked. */
async function oversized(request) {
  try { return Buffer.byteLength(await request.text()) > SYNC_PAGE.maxBodyBytes } catch { return true }
}

async function handleSync(connection, service, request) {
  if (!sameOrigin(connection, request)) return json(HTTP.forbidden, refusal(SYNC_PAGE.code.refused))
  if (await oversized(request)) return json(HTTP.badRequest, refusal(SYNC_PAGE.code.large))
  let outcome
  try { outcome = await service.providerSync.sync() } catch { outcome = refusal(SYNC_PAGE.code.refused) }
  return json(HTTP.ok, isRecord(outcome) ? outcome : refusal(SYNC_PAGE.code.refused))
}

/**
 * Register the sync route on DSH's owner-only Fetch registry.
 *
 * @param {object} ctx - the native host row's context (needs `connection`).
 * @param {object} service - `nativeFishballRuntime`; `providerSync.sync` is the only method used.
 * @returns a disposer when registered, otherwise undefined.
 */
export function registerProviderSyncRoutes(ctx, service) {
  if (typeof service?.providerSync?.sync !== 'function') return undefined
  return registerPostRoutes(ctx, [
    { path: PROVIDER_SYNC_ROUTE.path, fetch: (request) => handleSync(ctx.connection, service, request) },
  ], 'fishball: provider-sync routes')
}
