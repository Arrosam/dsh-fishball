/**
 * The host half's own Fetch routes (task U-SHELL; design §4.1, §4.2; R-UI-02, R-UI-03, R-HOST-06,
 * R-HOST-07; UIM-EP-02). They re-serve the instance locator `dshInstanceChild` to embed-UI's web
 * client, which can never call a host-only service itself. The locator is looked up per request,
 * so a route always answers for the service provided now; without a usable one it answers
 * REFUSAL.unavailable.
 *
 * Security (R-UI-02, R-UI-06; K3 child.d.ts `admit`):
 * - DSH's `connection.fetch` is owner-only and applies its Host/Origin fence first;
 * - admit's hostname is the main page's own request Host, never a client field, so the ticket is
 *   bound to the name the page was opened under; any name but the three loopback names is refused
 *   here, before the locator is called (`hostname-refused`);
 * - the admission URL goes only into the admit answer: it is never logged, stored or put in an error;
 * - a locator failure without a K3 code answers REFUSAL.failed and never echoes its message.
 */
import { ADMIT, FETCH, HTTP, LOG, LOOPBACK, REFUSAL, ROUTE, ROUTE_PREFIX, SERVICE } from './constants.js'
import { availability, usable } from './services.js'

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: HTTP.headers })
const refused = (status, code) => json(status, { ok: false, code })
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The main page's hostname from its request's Host header, parsed as a WHATWG URL does (so
 * lower-cased, an IPv6 literal kept in brackets), if it is one of the loopback names; else undefined.
 */
export function loopbackHostname(request) {
  const host = request.headers.get(LOOPBACK.hostHeader)
  if (typeof host !== 'string' || LOOPBACK.notInAuthority.test(host)) return undefined
  let hostname
  try { hostname = new URL(LOOPBACK.parseScheme + host).hostname } catch { return undefined }
  return LOOPBACK.hostnames.includes(hostname) ? hostname : undefined
}

/** The request body as JSON, or undefined when unreadable, over the bound or not JSON. */
async function jsonBody(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (Buffer.byteLength(text) > HTTP.maxBodyBytes) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

/** Admit's closed body `{view, lang}` with K3's values, or undefined. */
function admitBody(value) {
  if (!isRecord(value) || Object.keys(value).length !== ADMIT.bodyKeys.length || !ADMIT.bodyKeys.every((key) => Object.hasOwn(value, key))) return undefined
  return ADMIT.views.includes(value.view) && ADMIT.langs.includes(value.lang) ? { view: value.view, lang: value.lang } : undefined
}

/** A K3 admit rejection keeps its code (409); anything else is REFUSAL.failed (502). */
const admitRefusal = (error) => (Object.values(ADMIT.code).includes(error?.code)
  ? refused(HTTP.conflict, error.code)
  : refused(HTTP.badGateway, REFUSAL.failed))

/** Every route but `services`, by its ROUTE key, as a path relative to DSH's page. */
const pageRoutes = Object.freeze(Object.fromEntries(Object.entries(ROUTE).map(([key, path]) => [key, path.slice(ROUTE_PREFIX.length)])))

/**
 * Runs `answer(child)` with the usable locator, or answers REFUSAL.unavailable. A throw is
 * REFUSAL.failed with no detail (it may name a path or a URL).
 */
function withChild(ctx, answer) {
  return async (request) => {
    const child = usable(ctx, SERVICE.child)
    if (child === undefined) return refused(HTTP.unavailable, REFUSAL.unavailable)
    try { return await answer(child, request) } catch { return refused(HTTP.badGateway, REFUSAL.failed) }
  }
}

/** The child's status as the client shows it outside the frame (R-UI-03): no token, no origin. */
const statusOf = (child) => ({ ok: true, status: child.status(), target: child.targetStatus() })

/** Model sync's answers are V2's `{ok, result|error}` already (K3 `ProviderSync`); anything else is a refusal. */
const syncAnswer = (outcome) => json(HTTP.ok, isRecord(outcome) && typeof outcome.ok === 'boolean' ? outcome : { ok: false, error: { code: REFUSAL.failed } })

/** The routes, as `{path, methods, fetch}`. */
export function routes(ctx) {
  return [
    { path: ROUTE.services, methods: [FETCH.get], fetch: () => json(HTTP.ok, { ok: true, ...availability(ctx), routes: pageRoutes }) },
    { path: ROUTE.status, methods: [FETCH.get], fetch: withChild(ctx, (child) => json(HTTP.ok, statusOf(child))) },
    { path: ROUTE.retry, methods: [FETCH.post], fetch: withChild(ctx, async (child) => { await child.retry(); return json(HTTP.ok, statusOf(child)) }) },
    {
      path: ROUTE.admit,
      methods: [FETCH.post],
      fetch: withChild(ctx, async (child, request) => {
        const hostname = loopbackHostname(request)
        if (hostname === undefined) return refused(HTTP.conflict, ADMIT.code.hostnameRefused)
        const body = admitBody(await jsonBody(request))
        if (body === undefined) return refused(HTTP.badRequest, REFUSAL.invalid)
        let admitted
        try { admitted = await child.admit({ ...body, hostname }) } catch (error) { return admitRefusal(error) }
        return typeof admitted?.url === 'string' ? json(HTTP.ok, { ok: true, url: admitted.url }) : refused(HTTP.badGateway, REFUSAL.failed)
      }),
    },
    { path: ROUTE.modelsCheck, methods: [FETCH.post], fetch: withChild(ctx, async (child) => syncAnswer(await child.providerSync.check())) },
    {
      path: ROUTE.modelsAdd,
      methods: [FETCH.post],
      fetch: withChild(ctx, async (child, request) => {
        const body = await jsonBody(request)
        const valid = isRecord(body) && typeof body.checkId === 'string' && Array.isArray(body.ids) && body.ids.every((id) => typeof id === 'string')
        if (!valid) return refused(HTTP.badRequest, REFUSAL.invalid)
        return syncAnswer(await child.providerSync.add({ checkId: body.checkId, ids: [...body.ids] }))
      }),
    },
  ]
}

/**
 * Registers every route for the row's life. An absent registry, or a path another row already
 * claimed, leaves that route out and logs it (the client then reads "unavailable"); it never
 * fails the row, as the instance's own routes do (instance src/slim/host/fetch-routes.js).
 */
export function registerRoutes(ctx, logger) {
  for (const route of routes(ctx)) {
    try { ctx.connection.fetch.register({ ...route, requestBody: FETCH.body }) } catch (error) { logger.warn(LOG.routeUnavailable, route.path, error?.message ?? String(error)) }
  }
}
