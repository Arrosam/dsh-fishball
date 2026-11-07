/**
 * The model-sync routes of the "Model for Fishball" block (§10, D26).
 *
 * The instance's Plugins card (client.js) posts `models/check` (no body) when the user presses
 * Check for new models, and `models/add` `{checkId, ids}` when they press Add selected. The
 * routes call `service.providerSync.check()` and `service.providerSync.add()`
 * (src/provider-sync-service.js), which preview and confirm over the shared coordinator. The answer
 * carries only provider ids, names, model ids, outcomes, reason codes and the opaque check id.
 * Nothing here reads, logs or echoes a credential.
 *
 * The routes are registered on DSH's owner-only Fetch registry through the same helper as the
 * admin routes (src/slim/host/fetch-routes.js). On top of the registry's authentication and
 * Host/Origin fence each handler applies an explicit same-origin check: an Origin that names
 * another site, or a Sec-Fetch-Site outside the allowed pair, is refused.
 *
 * Every answer is HTTP 200 with `{ok:true,result}` or `{ok:false,error:{code}}`, because a
 * refusal is a page result. A body over the sync body bound, or an Add body that is not
 * `{checkId: string, ids: string[]}`, is the one HTTP 400, with the same typed shape.
 */
import { SYNC_PAGE } from '../../provider-sync-service.js'
import { registerPostRoutes } from './fetch-routes.js'

/**
 * The routes' exact paths, under the instance row's own prefix (§10, inst-OQ-19). Keep them in
 * step with client.js MODEL_SYNC_UI.
 */
export const PROVIDER_SYNC_ROUTE = Object.freeze({
  check: '/api/fishball-instance/models/check',
  add: '/api/fishball-instance/models/add',
})
/** The Add body's exact keys (§10 step 3). */
const ADD_KEYS = Object.freeze(['checkId', 'ids'])

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

/** The request body as text, or undefined when it cannot be read or is over the bound. */
async function bodyOf(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  return Buffer.byteLength(text) > SYNC_PAGE.maxBodyBytes ? undefined : text
}

/**
 * The Add body: exactly `{checkId, ids}`, a string and an array of strings. Whether the ids
 * belong to the check is the coordinator's rule (`invalid-selection`), not this shape check.
 */
function addPayload(text) {
  let value
  try { value = JSON.parse(text) } catch { return undefined }
  if (!isRecord(value) || Object.keys(value).length !== ADD_KEYS.length || !ADD_KEYS.every((key) => Object.hasOwn(value, key))) return undefined
  if (typeof value.checkId !== 'string' || !Array.isArray(value.ids) || value.ids.some((id) => typeof id !== 'string')) return undefined
  return { checkId: value.checkId, ids: [...value.ids] }
}

/**
 * One route: admit, read the bounded body, let `decode` turn it into the call's argument (undefined
 * refuses it with 400), then answer the service's typed outcome.
 */
function handlerFor(connection, decode, call) {
  return async (request) => {
    if (!sameOrigin(connection, request)) return json(HTTP.forbidden, refusal(SYNC_PAGE.code.refused))
    const text = await bodyOf(request)
    if (text === undefined) return json(HTTP.badRequest, refusal(SYNC_PAGE.code.large))
    const argument = decode(text)
    if (argument === undefined) return json(HTTP.badRequest, refusal(SYNC_PAGE.code.payload))
    let outcome
    try { outcome = await call(argument) } catch { outcome = refusal(SYNC_PAGE.code.refused) }
    return json(HTTP.ok, isRecord(outcome) ? outcome : refusal(SYNC_PAGE.code.refused))
  }
}

/** Check takes no payload; its body is only bounded, as the old sync route's was. */
const noPayload = () => null

/**
 * Register the check and add routes on DSH's owner-only Fetch registry.
 *
 * @param {object} ctx - the native host row's context (needs `connection`).
 * @param {object} service - `nativeFishballRuntime`; `providerSync.check` and `providerSync.add`
 *   are the only methods used.
 * @returns a disposer when registered, otherwise undefined.
 */
export function registerProviderSyncRoutes(ctx, service) {
  const sync = service?.providerSync
  if (typeof sync?.check !== 'function' || typeof sync?.add !== 'function') return undefined
  return registerPostRoutes(ctx, [
    { path: PROVIDER_SYNC_ROUTE.check, fetch: handlerFor(ctx.connection, noPayload, () => sync.check()) },
    { path: PROVIDER_SYNC_ROUTE.add, fetch: handlerFor(ctx.connection, addPayload, (payload) => sync.add(payload)) },
  ], 'fishball: model-sync routes')
}
