/** CHILD-WEB §5.4: read X0-C/X1 live; this adapter never owns manager identity. */
const SESSION_ROUTE = Object.freeze({
  path: '/api/fishball/session',
  read: 'GET',
  ensure: 'POST',
  service: 'fishballInstance',
  readMember: 'sessionId',
  ensureMember: 'ensureSession',
  apiVersion: 1,
  requestBody: 'buffered',
  event: 'connection/request',
  ok: 200,
  methodNotAllowed: 405,
  unavailable: 503,
  methodCode: 'METHOD_NOT_ALLOWED',
  unavailableCode: 'MANAGER_UNAVAILABLE',
  allowSeparator: ', ',
  headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
})
const METHODS = Object.freeze([SESSION_ROUTE.read, SESSION_ROUTE.ensure])

function isSessionId(value) { return typeof value === 'string' && value.trim() !== '' }

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: SESSION_ROUTE.headers })
}

/** Resolve per request: service replacement, absence and manager changes must not be cached. */
function manager(ctx, member) {
  const instance = ctx.get(SESSION_ROUTE.service)
  if (instance?.apiVersion !== SESSION_ROUTE.apiVersion || typeof instance.manager?.[member] !== 'function') throw new Error()
  return instance.manager
}

/**
 * Read-only lookup; never creates a manager. undefined X1 means null.
 * @returns {{sessionId: string|null}}
 */
function read(ctx) {
  const sessionId = manager(ctx, SESSION_ROUTE.readMember).sessionId()
  if (sessionId !== undefined && !isSessionId(sessionId)) throw new Error()
  return { sessionId: sessionId ?? null }
}

/**
 * Create-or-resume through X0-C's single activation (user decision 7.A, 2026-11-09).
 * No turn or model call; idempotent because ensureSession joins the one activation owner.
 * @returns {Promise<{sessionId: string}>}
 */
async function ensure(ctx) {
  const sessionId = await manager(ctx, SESSION_ROUTE.ensureMember).ensureSession()
  if (!isSessionId(sessionId)) throw new Error()
  return { sessionId }
}

/**
 * GET /api/fishball/session -> 200 {sessionId: string|null}; read-only, undefined X1 means null.
 * POST /api/fishball/session -> 200 {sessionId: string}; ensures (creates or resumes) THE manager
 *   session via manager.ensureSession(), without starting a turn. Idempotent; the request body
 *   is ignored. Concurrent callers (page, notices, handover) share X0-C's one activation.
 * Either method: missing/incompatible/throwing/invalid X1 or ensureSession -> 503
 *   {code:"MANAGER_UNAVAILABLE"}.
 * Other methods -> 405 {code:"METHOD_NOT_ALLOWED"}, Allow: GET, POST (HEAD has no body).
 * Native authentication precedes all handlers. No admission capability is exposed here.
 */
export function registerSessionRoute(ctx) {
  // Fetch's public method union is GET/HEAD/POST. The authenticated waterfall handles
  // all other HTTP verbs too, without inventing unsupported Fetch registration methods
  // or bypassing Connection's Host/Origin and browser authentication policy.
  ctx.on(SESSION_ROUTE.event, async (request, response, next) => {
    const pathname = request.url?.split('?')[0]
    if (pathname !== SESSION_ROUTE.path || METHODS.includes(request.method)) return next()
    response.writeHead(SESSION_ROUTE.methodNotAllowed, { ...SESSION_ROUTE.headers, allow: METHODS.join(SESSION_ROUTE.allowSeparator) })
    response.end(JSON.stringify({ code: SESSION_ROUTE.methodCode }))
  })
  ctx.connection.fetch.register({
    path: SESSION_ROUTE.path,
    methods: METHODS,
    requestBody: SESSION_ROUTE.requestBody,
    async fetch(request) {
      try {
        return json(SESSION_ROUTE.ok, request.method === SESSION_ROUTE.ensure ? await ensure(ctx) : read(ctx))
      } catch {
        // Never serialize SDK exceptions, service objects or private native admission values.
        return json(SESSION_ROUTE.unavailable, { code: SESSION_ROUTE.unavailableCode })
      }
    },
  })
}
