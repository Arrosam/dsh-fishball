/**
 * Server-private native admission target (PG-ORIGIN, docs/planning/v2-final-scope.md §4.3 (4)).
 *
 * The browser now consumes native admission itself: the embed broker answers the authenticated
 * launch route with a 303 to the exact URL built here, native DSH mints its own cookie on the
 * child's origin and redirects to clean `./`. The child document therefore runs at its own
 * browser origin (own localStorage), not behind a main-origin proxy.
 *
 * The reusable native launch token is in that one redirect's Location, so it is visible in the
 * browser's redirect trace; native DSH has no one-use launch id in 0.2.1-rc.5 or 0.2.2-rc.1. Never
 * log, serialize or echo the URL, and never put it in status, descriptors or error text.
 */
const AUTH = Object.freeze({
  protocol: 'http:', hostname: '127.0.0.1', root: '/', token: 'token',
  unavailable: 'NATIVE_ACCESS_UNAVAILABLE',
})
const unavailable = () => new Error(AUTH.unavailable)

/**
 * The exact owned target: plain-HTTP loopback child origin at its root, and an authenticated URL
 * on that same origin whose only query is one non-empty `token`. Anything else (another host,
 * credentials, a path, a fragment, extra parameters) is refused, so the broker can never be made
 * to redirect a browser anywhere but the current child's native admission.
 */
function validate(value) {
  try {
    const origin = new URL(value.origin)
    const login = new URL(value.authenticatedUrl)
    if (typeof value.generation !== 'string' || !value.generation ||
        !(value.signal instanceof AbortSignal) || value.signal.aborted ||
        origin.protocol !== AUTH.protocol || origin.hostname !== AUTH.hostname || !origin.port ||
        origin.username || origin.password || origin.pathname !== AUTH.root || origin.search || origin.hash ||
        login.origin !== origin.origin || login.username || login.password || login.hash ||
        login.pathname !== AUTH.root || login.searchParams.getAll(AUTH.token).length !== 1 ||
        !login.searchParams.get(AUTH.token) || [...login.searchParams.keys()].some((key) => key !== AUTH.token)) throw unavailable()
    return { signal: value.signal, login }
  } catch { throw unavailable() }
}

/**
 * Producer contract: ready-only service.nativeEmbedAccess() -> {generation, origin,
 * authenticatedUrl, signal}. Its signal fences stop/restart/control loss synchronously, so a
 * late answer for a retired generation is refused here rather than redirected to.
 */
export function createNativeAdmission(service) {
  let closed = false
  return Object.freeze({
    /**
     * The 303 target for one launch. `fragment` is an already-validated, non-secret continuation
     * ('' for none): browsers carry a redirect's fragment across a Location without one (RFC 9110
     * §10.2.2), so it survives native's `303 ./` while the token query does not, and a fragment
     * is never sent to any server or written to its request log.
     * @returns {Promise<string>} never logged or serialized by the caller.
     */
    async location(fragment) {
      if (closed) throw unavailable()
      let source
      try { source = validate(await service.nativeEmbedAccess()) } catch { throw unavailable() }
      if (closed || source.signal.aborted) throw unavailable()
      source.login.hash = fragment
      return source.login.href
    },
    close() { closed = true },
  })
}
