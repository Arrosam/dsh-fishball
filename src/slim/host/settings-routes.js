/**
 * Admin routes for the settings page (§9, §15 T12).
 *
 * The page (client.js, "Plugins → Fishball → settings") reads and changes the isolated child
 * through these routes. Each one calls exactly `service.admin.request(operation, payload)`
 * once: the relay (src/slim/host/admin.js) frames the request, the child's admin service
 * (src/slim/child/admin.js) applies it with the child's own DSH services, and the main process
 * never opens a child file. The page sends the settings revision or the plugin-inventory digest
 * in every mutation; a stale token comes back as a typed refusal, never as a thrown error.
 *
 * Why `connection.fetch` and not the Web server: that registry is exact-path and
 * owner-only (the shared handler answers 403 for any peer whose principal is not the owner)
 * and its bridge applies DSH's Host/Origin fence. Registering here therefore gives the
 * "owner-only same-origin routes" of §9 without this module owning authentication. Each route
 * answers HTTP 200 with `{ok:true,result}` or `{ok:false,error:{code,...}}`; a refusal is a
 * normal page result, so the page can show the typed reason instead of a network error. A body
 * that is not a JSON object is the one HTTP 400, with the same typed shape.
 */
import { ADMIN_ERROR, ADMIN_OPERATION } from '../child/admin.js'

const SLUGS = Object.freeze({
  [ADMIN_OPERATION.status]: 'status',
  [ADMIN_OPERATION.restart]: 'restart',
  [ADMIN_OPERATION.modelGet]: 'model/get',
  [ADMIN_OPERATION.modelSet]: 'model/set',
  [ADMIN_OPERATION.pluginsGet]: 'plugins/get',
  [ADMIN_OPERATION.pluginInstall]: 'plugin/install',
  [ADMIN_OPERATION.pluginRemove]: 'plugin/remove',
  [ADMIN_OPERATION.pluginEnable]: 'plugin/enable',
  [ADMIN_OPERATION.pluginDisable]: 'plugin/disable',
  [ADMIN_OPERATION.settingsGet]: 'settings/get',
  [ADMIN_OPERATION.settingsMutate]: 'settings/mutate',
})

/** The page's route table: every operation's exact path. Keep the slugs in step with client.js. */
export const ADMIN_ROUTE = Object.freeze({
  prefix: '/api/fishball/native/admin/',
  pathOf: (operation) => ADMIN_ROUTE.prefix + (SLUGS[operation] ?? ''),
})

const PATHS = Object.freeze(Object.entries(SLUGS).map(
  ([operation, slug]) => Object.freeze({ operation, path: ADMIN_ROUTE.prefix + slug }),
))

const HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  json: 'application/json; charset=utf-8',
  post: 'POST',
  buffered: 'buffered',
})
const EMPTY = Object.freeze({})
const HEADERS = Object.freeze({ 'content-type': HTTP.json, 'cache-control': 'no-store' })

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: HEADERS })
const refusal = (code) => ({ ok: false, error: { code } })
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** An empty body means "no payload"; anything else must parse to a plain object. */
async function payloadOf(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (text.trim() === '') return EMPTY
  let value
  try { value = JSON.parse(text) } catch { return undefined }
  return isRecord(value) ? value : undefined
}

/**
 * One route: decode the payload, ask the relay once, answer its typed outcome.
 * The relay never throws; this only guards a broken wiring so the page still gets a code.
 */
function handlerFor(service, operation) {
  return async (request) => {
    const payload = await payloadOf(request)
    if (payload === undefined) return json(HTTP.badRequest, refusal(ADMIN_ERROR.payload))
    let outcome
    try { outcome = await service.admin.request(operation, payload) } catch { outcome = refusal(ADMIN_ERROR.failed) }
    return json(HTTP.ok, outcome)
  }
}

/**
 * Register every admin route on DSH's owner-only Fetch registry.
 *
 * A missing registry or a route already claimed by another row leaves the page without that
 * route rather than failing the native row (the same rule as the status route and the embed
 * broker): the page then shows the typed "unavailable" refusal.
 *
 * @param {object} ctx - the native host row's context (needs `connection`).
 * @param {object} service - `nativeFishballRuntime`; `admin.request` is the only method used.
 * @returns a disposer when registered, otherwise undefined.
 */
export function registerAdminRoutes(ctx, service) {
  if (typeof service?.admin?.request !== 'function') return undefined
  const register = ctx?.connection?.fetch?.register
  if (typeof register !== 'function') return undefined
  const removeAll = (removers) => { for (const remove of removers) { try { remove() } catch { /* already gone */ } } }
  try {
    return ctx.effect(() => {
      const removers = []
      try {
        for (const { operation, path } of PATHS) {
          removers.push(register({
            path, methods: [HTTP.post], requestBody: HTTP.buffered, fetch: handlerFor(service, operation),
          }))
        }
      } catch {
        // A route another row already owns leaves none of this row's routes behind.
        removeAll(removers)
        return () => {}
      }
      return () => removeAll(removers)
    }, 'fishball: admin routes')
  } catch {
    return undefined
  }
}
