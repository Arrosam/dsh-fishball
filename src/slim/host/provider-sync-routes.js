/**
 * Provider-sync routes for the settings page (§10, §15 T16/T12 slot).
 *
 * The page's T16 slot calls exactly `service.providerSync.preview()` and
 * `service.providerSync.confirm({previewId, ids, confirmed})`, the API the main host exposes
 * beside `service.admin` (native-host.js). The child is the target: preview reads only provider
 * metadata from this process and returns ids and masks, and a confirmed import is the only path
 * that can read a selected API-key record. Nothing here reads, logs or echoes a credential.
 *
 * The routes are registered on DSH's owner-only Fetch registry through the same helper as the
 * admin routes (src/slim/host/fetch-routes.js). On top of the registry's authentication and
 * Host/Origin fence this handler applies the legacy sync route's explicit same-origin check:
 * an Origin that names another site, or a Sec-Fetch-Site outside the allowed pair, is refused.
 *
 * Every answer is HTTP 200 with `{ok:true,result}` or `{ok:false,error:{code}}`, because a
 * refusal is a page result. A body that is not a JSON object, or is over the sync body bound,
 * is the one HTTP 400, with the same typed shape.
 */
import { SYNC_PAGE } from '../../provider-sync-service.js'
import { registerPostRoutes } from './fetch-routes.js'

/** The T16 actions and their exact paths. Keep the slugs in step with client.js. */
export const PROVIDER_SYNC_ROUTE = Object.freeze({
  prefix: '/api/fishball/native/provider-sync/',
  action: Object.freeze({ preview: 'preview', confirm: 'confirm' }),
  pathOf(action) {
    if (action !== PROVIDER_SYNC_ROUTE.action.preview && action !== PROVIDER_SYNC_ROUTE.action.confirm) {
      throw new TypeError('fishball provider sync: unknown route action')
    }
    return PROVIDER_SYNC_ROUTE.prefix + action
  },
})

const HTTP = Object.freeze({ ok: 200, badRequest: 400, forbidden: 403 })
const EMPTY = Object.freeze({})
const INVALID_PAYLOAD = 'invalid-payload'
const json = (status, value) => new Response(JSON.stringify(value), { status, headers: SYNC_PAGE.headers })
const refusal = (code) => ({ ok: false, error: { code } })
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The legacy sync route's admission rule: same origin, or no Origin with a same-site fetch. */
function sameOrigin(request) {
  const origin = request.headers.get(SYNC_PAGE.originHeader)
  const site = request.headers.get(SYNC_PAGE.siteHeader)
  if (origin && origin !== new URL(request.url).origin) return false
  if (site && !SYNC_PAGE.allowedSites.includes(site)) return false
  return true
}

/**
 * An empty body means "no payload"; anything else must parse to a plain object. The result is
 * tagged so the handler can answer the right typed code instead of guessing from a sentinel key.
 * @returns {{value: object} | {error: string}}
 */
async function payloadOf(request) {
  let body
  try { body = await request.text() } catch { return { error: INVALID_PAYLOAD } }
  if (Buffer.byteLength(body) > SYNC_PAGE.maxBodyBytes) return { error: SYNC_PAGE.code.large }
  if (body.trim() === '') return { value: EMPTY }
  let value
  try { value = JSON.parse(body) } catch { return { error: INVALID_PAYLOAD } }
  return isRecord(value) ? { value } : { error: INVALID_PAYLOAD }
}

/** One action: decode the payload once, ask the host bridge once, answer its typed outcome. */
function handlerFor(service, action) {
  return async (request) => {
    if (!sameOrigin(request)) return json(HTTP.forbidden, refusal(SYNC_PAGE.code.refused))
    const parsed = await payloadOf(request)
    if (parsed.error !== undefined) return json(HTTP.badRequest, refusal(parsed.error))
    const payload = parsed.value
    let outcome
    try {
      outcome = action === PROVIDER_SYNC_ROUTE.action.preview
        ? await service.providerSync.preview()
        : await service.providerSync.confirm({
          previewId: payload.previewId,
          ids: payload.ids,
          confirmed: payload.confirmed,
        }, { signal: request.signal })
    } catch { outcome = refusal(SYNC_PAGE.code.refused) }
    return json(HTTP.ok, isRecord(outcome) ? outcome : refusal(SYNC_PAGE.code.refused))
  }
}

/**
 * Register the preview and confirm routes on DSH's owner-only Fetch registry.
 *
 * @param {object} ctx - the native host row's context (needs `connection`).
 * @param {object} service - `nativeFishballRuntime`; `providerSync.preview/confirm` are the
 *   only methods used.
 * @returns a disposer when registered, otherwise undefined.
 */
export function registerProviderSyncRoutes(ctx, service) {
  if (typeof service?.providerSync?.preview !== 'function' || typeof service.providerSync.confirm !== 'function') return undefined
  return registerPostRoutes(ctx, [
    { path: PROVIDER_SYNC_ROUTE.pathOf(PROVIDER_SYNC_ROUTE.action.preview), fetch: handlerFor(service, PROVIDER_SYNC_ROUTE.action.preview) },
    { path: PROVIDER_SYNC_ROUTE.pathOf(PROVIDER_SYNC_ROUTE.action.confirm), fetch: handlerFor(service, PROVIDER_SYNC_ROUTE.action.confirm) },
  ], 'fishball: provider-sync routes')
}
