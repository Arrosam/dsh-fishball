/**
 * The one owner-only Fetch route registration shared by the slim page route modules (§9, §10).
 *
 * DSH's connection.fetch registry is exact-path and owner-only: its shared handler answers 403
 * for any peer whose principal is not the owner, and its bridge applies DSH's Host/Origin fence.
 * A module therefore supplies only its exact paths and handlers; owning authentication stays
 * with DSH. A registry that is absent, or a path another row already claimed, leaves the page
 * without that route rather than failing the native row — the page then shows its typed
 * "unavailable" refusal, the same rule the status route and the embed broker follow.
 */
const FETCH = Object.freeze({ method: 'POST', body: 'buffered' })

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
