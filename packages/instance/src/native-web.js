/** Native lifecycle status over rc3's exact, authenticated Connection route.
 * Do not move this to webServer: that would bypass Connection's admission and owner checks.
 * The browser is admitted to the child only through the embed broker's launch redirect
 * (src/slim/host/embed.js); the old capability-URL open route is gone, so this file exposes the
 * instance's status and its Retry (the instance's Plugins card, client.js) and nothing else.
 * Neither answer ever carries the child's origin or launch token.
 */
import { INSTANCE_CODES, INSTANCE_STATES } from './host/binding.js'
import { registerGetRoute, registerPostRoutes } from './slim/host/fetch-routes.js'

const WEB = Object.freeze({
  // The original route, kept with its shape ({enabled, state, code, detail}) for its existing
  // readers (the slim test suites read it).
  statusPath: '/api/fishball/native/status',
  // The route design §18.5 inst-OQ-01 names: exactly {state, code}.
  instanceStatusPath: '/api/fishball-instance/status',
  // The card's Retry (design §0.7: "its Plugins card in the main DSH (Retry)"); answers the
  // status once the retry has run, in the instanceStatusPath shape.
  retryPath: '/api/fishball-instance/retry',
  unavailable: 'unavailable',
  ok: 200, json: 'application/json; charset=utf-8',
  headers: Object.freeze({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff' }),
})
const STATES = new Set(INSTANCE_STATES)
const CODES = new Set(INSTANCE_CODES)

/** One lifecycle status as the page may see it: known states and codes only (§11). */
function safeStatus(value) {
  return { enabled: value?.enabled === true,
    state: STATES.has(value?.state) ? value.state : WEB.unavailable,
    code: CODES.has(value?.code) ? value.code : null,
    // Always null: only the launch settings ever set it, and I2 removed them (D28). The field
    // stays so this route keeps the shape its readers expect.
    detail: null }
}
const UNREADABLE = Object.freeze({ enabled: false, state: WEB.unavailable, code: null, detail: null })
const stateAndCode = ({ state, code }) => ({ state, code })
/**
 * The instance's public `{state, code}`, as the card's status route answers it. SET's settings
 * relay answers the child panel in the same shape, so both pages read one vocabulary.
 */
export const publicStatus = (value) => stateAndCode(safeStatus(value))
const json = value => new Response(JSON.stringify(value), { status: WEB.ok, headers: { ...WEB.headers, 'content-type': WEB.json } })

/** Requires connection; service.status() is synchronous and carries no token. */
export function registerNativeWeb(ctx, service) {
  const status = () => {
    try { return safeStatus(service.status()) } catch { return UNREADABLE }
  }
  // An absent or duplicate status route must not take down the native service.
  const register = route => registerGetRoute(ctx, route)
  register({ path: WEB.statusPath, fetch: () => json(status()) })
  // service.retry() restarts only a failed instance and is queued behind the row's other starts
  // and stops (host.js), so a repeated click cannot start a second child.
  const [statusRoute, retryRoute] = instanceStatusRoutes(() => service.status(), () => service.retry())
  register(statusRoute)
  registerPostRoutes(ctx, [retryRoute], 'fishball instance: retry route')
}

/**
 * The card's status and Retry routes, `{state, code}` each, over any status reader and Retry: the
 * main row's own lifecycle, or the child settings panel's relay to it
 * (child-web/fishball-settings/index.js), so the status line reads the same answers on both pages.
 * A failed Retry answers the status as it now reads. Either reader may be async.
 * @returns {[{path, fetch}, {path, fetch}]} the GET status route and the POST Retry route.
 */
export function instanceStatusRoutes(read, retry) {
  const current = async () => { try { return publicStatus(await read()) } catch { return publicStatus(UNREADABLE) } }
  return [
    { path: WEB.instanceStatusPath, fetch: async () => json(await current()) },
    { path: WEB.retryPath, fetch: async () => { try { return json(publicStatus(await retry())) } catch { return json(await current()) } } },
  ]
}
