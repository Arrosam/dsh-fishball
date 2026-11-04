/** Native rc3 Connection exact fetch routes enforce authenticated owner peers.
 * Do not move these to webServer: that would bypass admission and owner checks.
 * The launch capability appears only in the clicked POST's Location header.
 */
const WEB = Object.freeze({
  statusPath: '/api/fishball/native/status', openPath: '/api/fishball/native/open',
  get: 'GET', post: 'POST', body: 'buffered', ready: 'ready', unavailable: 'unavailable',
  states: Object.freeze(['disabled', 'waiting', 'starting', 'ready', 'stopping', 'stopped', 'failed']),
  codes: Object.freeze(['NATIVE_START_FAILED', 'NATIVE_STOP_FAILED', 'NATIVE_CHILD_EXITED', 'NATIVE_UNAVAILABLE', 'NATIVE_OPEN_FAILED', 'NATIVE_TIMEOUT', 'NATIVE_DISABLED']),
  ok: 200, forbidden: 403, unavailableStatus: 503, redirect: 303,
  protocol: 'http:', host: '127.0.0.1', siteHeader: 'sec-fetch-site', sameOrigin: 'same-origin',
  headers: Object.freeze({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff' }),
  text: 'Isolated Fishball is unavailable. Return to the Fishball panel and check its status.',
})

/** Requires connection; service.status() is synchronous and service.openUrl() asynchronous. */
export function registerNativeWeb(ctx, service) {
  const status = () => {
    try {
      const value = service.status()
      return { enabled: value?.enabled === true,
        state: WEB.states.includes(value?.state) ? value.state : WEB.unavailable,
        code: WEB.codes.includes(value?.code) ? value.code : null }
    } catch { return { enabled: false, state: WEB.unavailable, code: null } }
  }
  const ready = () => { const value = status(); return value.enabled && value.state === WEB.ready }
  const unavailable = (code = WEB.unavailableStatus) => new Response(WEB.text, {
    status: code, headers: { ...WEB.headers, 'content-type': 'text/plain; charset=utf-8' },
  })
  // Registration itself is context-owned by rc3. Partial failure rolls back only our route.
  const disposers = []
  const dispose = () => {
    for (const remove of disposers.splice(0).reverse()) {
      try { remove() } catch { /* Cleanup failures must not affect legacy disposal or expose errors. */ }
    }
  }
  try {
    disposers.push(ctx.connection.fetch.register({
      path: WEB.statusPath, methods: [WEB.get], requestBody: WEB.body,
      fetch: () => new Response(JSON.stringify(status()), {
        status: WEB.ok, headers: { ...WEB.headers, 'content-type': 'application/json; charset=utf-8' },
      }),
    }))
    disposers.push(ctx.connection.fetch.register({
      path: WEB.openPath, methods: [WEB.post], requestBody: WEB.body,
      fetch: async (request) => {
        // In addition to rc3 authenticated Host/Origin admission, allow only same-origin
        // browser submissions. request.url has synthetic origin http://dsh.internal.
        if (request.headers.get(WEB.siteHeader) !== WEB.sameOrigin) return unavailable(WEB.forbidden)
        if (request.signal.aborted || !ready()) return unavailable()
        try {
          const url = new URL(await service.openUrl())
          if (request.signal.aborted || !ready() || url.protocol !== WEB.protocol ||
              url.hostname !== WEB.host || !url.port || url.username || url.password) return unavailable()
          return new Response(null, { status: WEB.redirect, headers: { ...WEB.headers, location: url.href } })
        } catch {
          // Exceptions may contain capabilities: never log, persist or reflect them.
          return unavailable()
        }
      },
    }))
  } catch {
    dispose()
    // An absent/duplicate route must not take down the native service or legacy Fishball.
  }
  return dispose
}
