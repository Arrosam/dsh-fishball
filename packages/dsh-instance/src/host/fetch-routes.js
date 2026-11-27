/**
 * The one owner-only Fetch route registration shared by the instance's page route modules (§9, §10).
 *
 * DSH's connection.fetch registry is exact-path and owner-only: its shared handler answers 403
 * for any peer whose principal is not the owner, and its bridge applies DSH's Host/Origin fence.
 * A module therefore supplies only its exact paths and handlers; owning authentication stays
 * with DSH. A registry that is absent, or a path another row already claimed, leaves the page
 * without that route rather than failing the native row — the page then shows its typed
 * "unavailable" refusal, the same rule the status route follows.
 */
const FETCH = Object.freeze({ method: 'POST', get: 'GET', body: 'buffered' })

/** Shared JSON response and bounded-object-body helpers for same-origin feature routes. */
export const JSON_ROUTE = Object.freeze({
  maxBodyBytes: 16384,
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  http: Object.freeze({ ok: 200, badRequest: 400, forbidden: 403 }),
})

export const isJsonRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
export const jsonResponse = (status, value, headers = JSON_ROUTE.headers) => new Response(JSON.stringify(value), { status, headers })

/** Reads a bounded JSON object body, or returns `undefined` if unreadable, oversized or non-object. */
export async function readJsonObjectBody(request, maxBytes = JSON_ROUTE.maxBodyBytes) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (Buffer.byteLength(text) > maxBytes) return undefined
  try { const value = JSON.parse(text); return isJsonRecord(value) ? value : undefined } catch { return undefined }
}

/**
 * Wraps a same-origin JSON route handler: enforces `sameOrigin(connection, request)` (403 on
 * refusal) and catches unexpected throws into HTTP 200 `{ok: false, code: failCode}`.
 */
export function sameOriginJsonHandler(connection, sameOrigin, failCode, run) {
  const failed = () => ({ ok: false, code: failCode })
  return async (request) => {
    if (!sameOrigin(connection, request)) return jsonResponse(JSON_ROUTE.http.forbidden, failed())
    try {
      const outcome = await run(request)
      return outcome instanceof Response ? outcome : jsonResponse(JSON_ROUTE.http.ok, isJsonRecord(outcome) ? outcome : failed())
    } catch {
      return jsonResponse(JSON_ROUTE.http.ok, failed())
    }
  }
}

/** Wraps a same-origin JSON POST route with bounded object parsing and HTTP 400 on invalid input. */
export function sameOriginJsonPost(connection, sameOrigin, { failCode, invalidCode, maxBodyBytes = JSON_ROUTE.maxBodyBytes, parse, run }) {
  return sameOriginJsonHandler(connection, sameOrigin, failCode, async (request) => {
    const body = await readJsonObjectBody(request, maxBodyBytes)
    const argument = body === undefined ? undefined : parse(body)
    if (argument === undefined) return jsonResponse(JSON_ROUTE.http.badRequest, { ok: false, code: invalidCode })
    return run(argument)
  })
}

/**
 * Register one exact GET route. An absent registry or a path another row already claimed leaves
 * the page without it (the page then reads "unavailable"), never failing the row.
 * @param {object} ctx - the row's context (needs `connection`).
 * @param {{path: string, fetch: (request: Request) => Promise<Response>|Response}} route
 * @returns a disposer; a no-op when nothing was registered.
 */
export function registerGetRoute(ctx, route) {
  try { return ctx.connection.fetch.register({ methods: [FETCH.get], requestBody: FETCH.body, ...route }) } catch { return () => {} }
}

/**
 * Register exact POST routes for one feature.
 *
 * @param {object} ctx - the native host row's context (needs `connection`).
 * @param {Array<{path: string, fetch: (request: Request) => Promise<Response>}>} routes
 * @param {string} effectName - the Cordis effect label.
 * @returns a disposer when registered, otherwise undefined.
 */
export function registerPostRoutes(ctx, routes, effectName) {
  const register = ctx?.connection?.fetch?.register
  if (typeof register !== 'function' || !Array.isArray(routes) || routes.length === 0) return undefined
  const removeAll = (removers) => { for (const remove of removers) { try { remove() } catch { /* already gone */ } } }
  try {
    return ctx.effect(() => {
      const removers = []
      try {
        for (const { path, fetch } of routes) {
          removers.push(register({ path, methods: [FETCH.method], requestBody: FETCH.body, fetch }))
        }
      } catch {
        // A route another row already owns or a partial registration failure leaves none of
        // this row's routes behind, so the page never sees a half-registered feature.
        removeAll(removers)
        return () => {}
      }
      return () => removeAll(removers)
    }, effectName)
  } catch {
    return undefined
  }
}
