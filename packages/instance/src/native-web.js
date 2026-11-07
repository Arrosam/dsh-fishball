/** Native lifecycle status over rc3's exact, authenticated Connection route.
 * Do not move this to webServer: that would bypass Connection's admission and owner checks.
 * The browser reaches the child only through the embed broker (src/slim/host/embed.js); the old
 * capability-URL open route is gone, so this file exposes the instance's status and its Retry
 * (the instance's Plugins card, client.js) and nothing else.
 */
import { INSTANCE_CODES, INSTANCE_STATES } from './host/binding.js'
import { registerPostRoutes } from './slim/host/fetch-routes.js'

const WEB = Object.freeze({
  // The original route, kept with its shape ({enabled, state, code, detail}) for its existing
  // readers (the slim test suites read it).
  statusPath: '/api/fishball/native/status',
  // The route design §18.5 inst-OQ-01 names: exactly {state, code}.
  instanceStatusPath: '/api/fishball-instance/status',
  // The card's Retry (design §0.7: "its Plugins card in the main DSH (Retry)"); answers the
  // status once the retry has run, in the instanceStatusPath shape.
  retryPath: '/api/fishball-instance/retry',
  get: 'GET', body: 'buffered', unavailable: 'unavailable',
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
    // A launch-setting failure names the setting and the path it tried (host.js LAUNCH_ERROR);
    // it carries no token or key.
    detail: typeof value?.detail === 'string' ? value.detail : null }
}
const UNREADABLE = Object.freeze({ enabled: false, state: WEB.unavailable, code: null, detail: null })
const stateAndCode = ({ state, code }) => ({ state, code })
const json = value => new Response(JSON.stringify(value), { status: WEB.ok, headers: { ...WEB.headers, 'content-type': WEB.json } })

/** Requires connection; service.status() is synchronous and carries no token. */
export function registerNativeWeb(ctx, service) {
  const status = () => {
    try { return safeStatus(service.status()) } catch { return UNREADABLE }
  }
  const register = route => {
    try { return ctx.connection.fetch.register({ methods: [WEB.get], requestBody: WEB.body, ...route }) } catch {
      // An absent or duplicate status route must not take down the native service.
      return () => {}
    }
  }
  register({ path: WEB.statusPath, fetch: () => json(status()) })
  register({ path: WEB.instanceStatusPath, fetch: () => json(stateAndCode(status())) })
  // service.retry() restarts only a failed instance and is queued behind the row's other starts
  // and stops (host.js), so a repeated click cannot start a second child.
  registerPostRoutes(ctx, [{
    path: WEB.retryPath,
    fetch: async () => {
      try { return json(stateAndCode(safeStatus(await service.retry()))) } catch { return json(stateAndCode(status())) }
    },
  }], 'fishball instance: retry route')
}
