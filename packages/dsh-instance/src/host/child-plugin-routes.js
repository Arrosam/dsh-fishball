/**
 * The Fishball tab's routes (design §28): the child's plugins, managed from the main DSH. Owner-only
 * DSH Fetch routes on the same registry and helpers as the page's routes (fetch-routes.js), with the
 * model-sync routes' explicit same-origin check on top (provider-sync-routes.js sameOrigin), because
 * these run pnpm. JSON, no-store; every answer is HTTP 200 with `{ok: true, …}` or `{ok: false, code}`
 * (a refusal is a page result), except a malformed or oversized body (400 `invalid-request`) and a
 * request the fence refuses (403 `operation-failed`).
 * - GET  plugins           → `{ok, bundles}` (child-plugins.js list)
 * - POST plugins/inspect   `{spec}` → `{ok, inspection}` (DSH's PluginSpecInspection)
 * - POST plugins/install   `{spec, requestId, approvedBuilds?}` → `{ok, name, version}`
 * - POST plugins/cancel    `{requestId}` → `{ok, outcome}`
 * - POST plugins/uninstall `{name}` → `{ok, name}`
 * - POST plugins/use       `{name}` → `{ok, name}`
 * Progress is not served here: DSH forwards its own `plugin-manager/install-state` and
 * `install-log` events to the browser (dsh-api-remotes API_REMOTE_FORWARDED_EVENTS), and the
 * dialog filters them by the request id it chose.
 */
import { REFUSAL } from '../native-runtime/constants.js'
import { registerGetRoute, registerPostRoutes } from './fetch-routes.js'
import { sameOrigin } from './provider-sync-routes.js'

/** The routes' exact paths; keep them in step with client.fishball.js FISHBALL_API. */
export const CHILD_PLUGIN_ROUTE = Object.freeze({
  list: '/api/dsh-instance/plugins',
  inspect: '/api/dsh-instance/plugins/inspect',
  install: '/api/dsh-instance/plugins/install',
  cancel: '/api/dsh-instance/plugins/cancel',
  uninstall: '/api/dsh-instance/plugins/uninstall',
  use: '/api/dsh-instance/plugins/use',
  // A spec, a name or a request id is short; this bounds what a page can make the Host parse.
  maxBodyBytes: 16384,
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  http: Object.freeze({ ok: 200, badRequest: 400, forbidden: 403 }),
  label: 'dsh-instance: Fishball plugin routes',
})
const R = CHILD_PLUGIN_ROUTE

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: R.headers })
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim().length > 0
const failed = () => ({ ok: false, code: REFUSAL.failed })

/** Body readers: the validated argument, or undefined for anything malformed. */
const BODY = Object.freeze({
  spec: (body) => (isText(body.spec) ? body.spec.trim() : undefined),
  install: (body) => (isText(body.spec) && isText(body.requestId)
    && (body.approvedBuilds === undefined || (Array.isArray(body.approvedBuilds) && body.approvedBuilds.every(isText)))
    ? { spec: body.spec.trim(), requestId: body.requestId, ...(body.approvedBuilds === undefined ? {} : { approvedBuilds: [...body.approvedBuilds] }) }
    : undefined),
  requestId: (body) => (isText(body.requestId) ? body.requestId : undefined),
  name: (body) => (isText(body.name) ? body.name.trim() : undefined),
})

/** The bounded JSON object body, or undefined. */
async function bodyOf(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (Buffer.byteLength(text) > R.maxBodyBytes) return undefined
  try { const value = JSON.parse(text); return isRecord(value) ? value : undefined } catch { return undefined }
}

/** Admit, run `call`, answer its outcome; a throw is `operation-failed`. */
const answer = (connection, call) => async (request) => {
  if (!sameOrigin(connection, request)) return json(R.http.forbidden, failed())
  try { const outcome = await call(request); return outcome instanceof Response ? outcome : json(R.http.ok, isRecord(outcome) ? outcome : failed()) } catch { return json(R.http.ok, failed()) }
}

/** One POST: read the body with `read`, 400 when it does not take it, else `run(argument)`. */
const post = (connection, read, run) => answer(connection, async (request) => {
  const body = await bodyOf(request)
  const argument = body === undefined ? undefined : read(body)
  if (argument === undefined) return json(R.http.badRequest, { ok: false, code: REFUSAL.invalid })
  return run(argument)
})

/**
 * Register the Fishball tab's routes.
 * @param ctx - the dsh-instance row's context (`connection`).
 * @param plugins - createChildPlugins()'s operations.
 */
export function registerChildPluginRoutes(ctx, plugins) {
  const connection = ctx.connection
  registerGetRoute(ctx, { path: R.list, fetch: answer(connection, () => plugins.list()) })
  return registerPostRoutes(ctx, [
    { path: R.inspect, fetch: post(connection, BODY.spec, (spec) => plugins.inspect(spec)) },
    { path: R.install, fetch: post(connection, BODY.install, (input) => plugins.install(input)) },
    { path: R.cancel, fetch: post(connection, BODY.requestId, (requestId) => plugins.cancel(requestId)) },
    { path: R.uninstall, fetch: post(connection, BODY.name, (name) => plugins.uninstall(name)) },
    { path: R.use, fetch: post(connection, BODY.name, (name) => plugins.use(name)) },
  ], R.label)
}
