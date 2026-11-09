/** CHILD-WEB §5.4: read X0-C/X1 live; this adapter never owns manager identity. */
const SESSION_ROUTE = Object.freeze({
  path: '/api/fishball/session',
  method: 'GET',
  service: 'fishballInstance',
  apiVersion: 1,
  requestBody: 'buffered',
  event: 'connection/request',
  ok: 200,
  methodNotAllowed: 405,
  unavailable: 503,
  methodCode: 'METHOD_NOT_ALLOWED',
  unavailableCode: 'MANAGER_UNAVAILABLE',
  headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
})

/**
 * GET /api/fishball/session -> 200 {sessionId: string|null}; undefined X1 means null.
 * Missing/incompatible/throwing/invalid X1 -> 503 {code:"MANAGER_UNAVAILABLE"}.
 * Other methods -> 405 {code:"METHOD_NOT_ALLOWED"}, Allow: GET (HEAD has no body).
 * Native authentication precedes both handlers. No admission capability is exposed here.
 */
export function registerSessionRoute(ctx) {
  // Fetch's public method union is GET/HEAD/POST. The authenticated waterfall handles
  // all other HTTP verbs too, without inventing unsupported Fetch registration methods
  // or bypassing Connection's Host/Origin and browser authentication policy.
  ctx.on(SESSION_ROUTE.event, async (request, response, next) => {
    const pathname = request.url?.split('?')[0]
    if (pathname !== SESSION_ROUTE.path || request.method === SESSION_ROUTE.method) return next()
    response.writeHead(SESSION_ROUTE.methodNotAllowed, { ...SESSION_ROUTE.headers, allow: SESSION_ROUTE.method })
    response.end(JSON.stringify({ code: SESSION_ROUTE.methodCode }))
  })
  ctx.connection.fetch.register({
    path: SESSION_ROUTE.path,
    methods: [SESSION_ROUTE.method],
    requestBody: SESSION_ROUTE.requestBody,
    async fetch() {
      try {
        // Resolve per request: service replacement, absence and manager changes must not
        // leave a stale session id in the page's startup guard. Do not create a manager.
        const instance = ctx.get(SESSION_ROUTE.service)
        if (instance?.apiVersion !== SESSION_ROUTE.apiVersion || typeof instance.manager?.sessionId !== 'function') throw new Error()
        const sessionId = instance.manager.sessionId()
        if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId.trim())) throw new Error()
        return new Response(JSON.stringify({ sessionId: sessionId ?? null }), { status: SESSION_ROUTE.ok, headers: SESSION_ROUTE.headers })
      } catch {
        // Never serialize SDK exceptions, service objects or private native admission values.
        return new Response(JSON.stringify({ code: SESSION_ROUTE.unavailableCode }), { status: SESSION_ROUTE.unavailable, headers: SESSION_ROUTE.headers })
      }
    },
  })
}
