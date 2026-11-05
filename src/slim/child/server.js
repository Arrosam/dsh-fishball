/**
 * The child app's loopback HTTP surface (§3.1, §3.3, §15 T03).
 *
 * The browser never addresses this origin: the main DSH proxies /fishball/embed/* to it with the
 * parent bearer (§3.1). The child therefore serves the unprefixed tails of the contract routes,
 * admits only the contract's methods, and answers 401 to anything that does not carry this
 * instance's bearer before it looks at a path or a method.
 *
 * The full chat UI and its API arrive in later tasks. This module owns the shell document, the
 * /ui/* static files, the liveness API, the reminder API (T10) and the SSE stream with the
 * contract's heartbeat; a path beyond them is a bodyless 404, so an unknown route can never
 * serve bytes. The reminder module owns its validation and typed refusals; this hook only moves
 * the request's method, query and bounded JSON body into it and its status and body back out.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BEARER, ERROR, LIMITS, ROUTES } from '../contract.js'
import { REMINDERS } from './reminders.js'

/**
 * The child owns the contract routes without the broker prefix: §3.1 names the child's paths
 * "/", "/ui/*", "/api/*" and "/api/events", and the broker adds /fishball/embed in front.
 */
const childPath = (route) => route.slice(ROUTES.prefix.length)

const PATHS = Object.freeze({
  document: childPath(ROUTES.document),
  ui: childPath(ROUTES.ui),
  events: childPath(ROUTES.events),
  health: childPath(ROUTES.api) + 'health',
  // REMINDERS.path is already the child's unprefixed tail (/api/reminders); the broker adds
  // /fishball/embed in front of it (§3.1, T10).
  reminders: REMINDERS.path,
})

/** Loopback only; port 0 lets the OS choose, and the parent learns the port from the service. */
const BIND = Object.freeze({ host: '127.0.0.1', port: 0, minPort: 1, maxHeaderBytes: 16 * 1024 })

const METHOD = Object.freeze({ get: 'GET', head: 'HEAD', post: 'POST' })

/** The statuses this server answers; 401 is the contract's bearer refusal (§3.2). */
const HTTP = Object.freeze({
  ok: 200,
  badRequest: 400,
  unauthorized: BEARER.unauthorizedStatus,
  notFound: 404,
  methodNotAllowed: 405,
  payloadTooLarge: 413,
  serverError: 500,
})

const TYPE = Object.freeze({
  html: 'text/html; charset=utf-8',
  javascript: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  eventStream: 'text/event-stream; charset=utf-8',
})

/** Static types the shell and its no-build ES modules use; any other extension is not served. */
const UI_TYPES = Object.freeze({
  '.html': TYPE.html,
  '.js': TYPE.javascript,
  '.css': TYPE.css,
})

/**
 * The child origin can never be framed directly and never joins a cross-origin load (§3.3).
 * default-src admits only same-origin files, so the shell carries no inline script or style;
 * img-src still allows its data: favicon. Vary keeps a cache from reusing one credential's
 * response for another.
 */
const SECURITY = Object.freeze({
  'content-security-policy': "frame-ancestors 'none'; default-src 'self'; img-src 'self' data:; connect-src 'self'",
  'cross-origin-resource-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  vary: 'authorization',
})

/** Comment frames carry the shell's connection state and stop proxies from buffering (§3.6). */
const SSE = Object.freeze({
  connected: ': connected\n\n',
  heartbeat: ': heartbeat\n\n',
})

/**
 * One reminder change frame. The data is REMINDERS.change, never a diff: the view re-reads its
 * list on the event (src/slim/ui/reminders.js), so the payload can only ever say "something
 * changed" and cannot drift from what the child actually stored.
 */
const REMINDER_FRAME = 'event: ' + REMINDERS.event + '\ndata: ' + JSON.stringify(REMINDERS.change) + '\n\n'

/**
 * The reminder route's own body refusals. The parsed body is handed to the reminder API, but a
 * body that never parsed or was over the contract bound has no reminder code of its own; these
 * two carry the API's 400 vocabulary (src/slim/child/reminders.js) and the contract's too-large.
 */
const BODY = Object.freeze({
  invalid: Object.freeze({ code: 'invalid-input', message: 'The request body must be JSON.' }),
  tooLarge: Object.freeze({ code: ERROR.tooLarge, message: 'The request body is too large.' }),
})

/** A body read that failed before the reminder API saw anything; status and JSON body. */
class BodyError extends Error {
  constructor(status, body) {
    super(body.code)
    this.status = status
    this.body = body
  }
}

/** The liveness answer the parent's readiness probe and the shell may read (§2.3). */
const HEALTH = Buffer.from(JSON.stringify({ ok: true }), 'utf8')

const BASE_ORIGIN = 'http://' + BIND.host
const SEPARATOR = path.sep

/**
 * The methods each route supports. Allow is a property of the target resource (RFC 9110 §10.2.1),
 * so a 405 names this list, never the contract's wider GET/HEAD/POST proxy set.
 */
const ALLOW = Object.freeze({
  readable: Object.freeze([METHOD.get, METHOD.head]),
  events: Object.freeze([METHOD.get]),
})

/** One response shape, so every status carries the security and cache headers. */
function send(res, status, headers, body) {
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.from(body)
  res.writeHead(status, {
    ...SECURITY,
    'cache-control': 'no-store',
    'content-length': payload.length,
    ...headers,
  })
  res.end(payload)
}

/** A handler failure after headers went out can only tear the connection down. */
function fail(res) {
  if (res.headersSent) { res.destroy(); return }
  send(res, HTTP.serverError)
}

function notFound(res) { send(res, HTTP.notFound) }

function methodNotAllowed(res, allowed) {
  send(res, HTTP.methodNotAllowed, { allow: allowed.join(', ') })
}

/** Send one reminder answer as JSON; HEAD carries the same status and no body. */
function sendAnswer(res, answer, head) {
  const status = Number.isSafeInteger(answer?.status) ? answer.status : HTTP.serverError
  if (head) { send(res, status, { 'content-type': TYPE.json }); return }
  const body = answer?.body === undefined ? '' : JSON.stringify(answer.body)
  send(res, status, { 'content-type': TYPE.json }, body)
}

/**
 * Read one JSON request body up to the contract's bound. Bytes past the bound are drained and
 * then refused, so the client always receives its 413 instead of a destroyed connection; the
 * caller parses only what fit.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    let overflow = false
    const chunks = []
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes <= limit) { chunks.push(chunk); return }
      // Stop buffering but keep reading: the response needs the request to reach 'end'.
      overflow = true
      chunks.length = 0
    })
    req.on('end', () => {
      if (overflow) { reject(new BodyError(HTTP.payloadTooLarge, BODY.tooLarge)); return }
      resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

/**
 * The reminders hook (T10): GET and HEAD list, POST reads one body and mutates. The reminder
 * module owns validation, bounds and typed refusals; this hook only carries status and body.
 */
async function serveReminders(req, res, reminders) {
  if (req.method === METHOD.post) {
    let body
    try {
      body = JSON.parse(await readBody(req, LIMITS.embedJsonBodyBytes))
    } catch (error) {
      // A body refusal is 413/400; a read failure is the handler failure the outer catch answers.
      if (error instanceof BodyError) { sendAnswer(res, error, false); return }
      if (!(error instanceof SyntaxError)) throw error
      sendAnswer(res, { status: HTTP.badRequest, body: BODY.invalid }, false)
      return
    }
    sendAnswer(res, await reminders.handle({ method: req.method, body }), false)
    return
  }
  const url = new URL(req.url, BASE_ORIGIN)
  sendAnswer(res, await reminders.handle({ method: req.method, query: url.searchParams }), req.method === METHOD.head)
}

/**
 * Parse an origin-form request target and return its pathname. Absolute-form targets and
 * protocol-relative "//host/path" targets are refused here, as the broker refuses them (§3.6).
 */
function requestPath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) return undefined
  let url
  try { url = new URL(rawUrl, BASE_ORIGIN) } catch { return undefined }
  if (url.origin !== BASE_ORIGIN) return undefined
  return url.pathname
}

/**
 * Resolve one /ui/* request to a file under the UI directory, or undefined. Decoding happens once,
 * and a decoded "../", an empty segment, a NUL or a backslash is refused, so no request can leave
 * the directory the child shipped (§3.6's no-traversal rule).
 */
function uiFile(uiDir, pathname) {
  let relative
  try { relative = decodeURIComponent(pathname.slice(PATHS.ui.length)) } catch { return undefined }
  if (relative === '' || relative.includes('\0') || relative.includes('\\')) return undefined
  const segments = relative.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return undefined
  const root = path.resolve(uiDir)
  const file = path.join(root, ...segments)
  return file.startsWith(root + SEPARATOR) ? file : undefined
}

/**
 * Resolve one /ui/* target to its route by reading the file as part of resolution: only an
 * existing file with a servable type is a route. A missing one is therefore a bodyless 404 for
 * every method, and the read that decides existence also supplies the body, so no second lookup
 * can race a 405 or a 200 against a file that changed in between.
 */
async function uiRoute(uiDir, pathname) {
  const file = uiFile(uiDir, pathname)
  const type = file === undefined ? undefined : UI_TYPES[path.extname(file)]
  if (file === undefined || type === undefined) return undefined
  let body
  try { body = await readFile(file) } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return undefined
    throw error
  }
  return {
    allow: ALLOW.readable,
    serve: (_req, res) => send(res, HTTP.ok, { 'content-type': type }, body),
  }
}

/**
 * One SSE stream. Headers go out before the first comment so EventSource fires "open"; the
 * heartbeat keeps a 30 s idle broker from closing it (§3.6). Closing the response, the client
 * dropping, or the server disposing all run the same cleanup exactly once.
 */
function serveEvents(res, heartbeatMs, streams, reminders) {
  res.writeHead(HTTP.ok, {
    ...SECURITY,
    'content-type': TYPE.eventStream,
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  res.flushHeaders()
  let timer
  let closed = false
  let unsubscribe = () => {}
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    // The reminder subscription belongs to this stream only: a closed stream must not keep
    // re-reading a list it can no longer send.
    unsubscribe()
    streams.delete(close)
    try { res.end() } catch { /* the client already closed the response */ }
  }
  const write = (frame) => {
    if (closed) return
    try { res.write(frame) } catch { close() }
  }
  unsubscribe = reminders.subscribe(() => write(REMINDER_FRAME))
  streams.add(close)
  res.on('close', close)
  res.on('error', close)
  write(SSE.connected)
  timer = setInterval(() => write(SSE.heartbeat), heartbeatMs)
  timer.unref?.()
}

/**
 * Resolve one parsed pathname to its route, which owns both the methods that target supports and
 * its handler; undefined means no target, which is a bodyless 404 for every method. A /ui/* target
 * is resolved by reading its file first, so the method check only ever sees an existing resource.
 */
async function resolveRoute(pathname, options) {
  if (pathname === PATHS.document) {
    return {
      allow: ALLOW.readable,
      serve: (_req, res) => send(res, HTTP.ok, { 'content-type': TYPE.html }, options.document),
    }
  }
  if (pathname.startsWith(PATHS.ui)) return uiRoute(options.uiDir, pathname)
  if (pathname === PATHS.events) {
    return {
      allow: ALLOW.events,
      serve: (_req, res) => serveEvents(res, options.heartbeatMs, options.streams, options.reminders),
    }
  }
  if (pathname === PATHS.health) {
    return {
      allow: ALLOW.readable,
      serve: (_req, res) => send(res, HTTP.ok, { 'content-type': TYPE.json }, HEALTH),
    }
  }
  if (pathname === PATHS.reminders) {
    // The reminder module's own method list: GET and HEAD list, POST mutates (T10).
    return {
      allow: REMINDERS.methods,
      serve: (req, res) => serveReminders(req, res, options.reminders),
    }
  }
  return undefined
}

async function handle(req, res, options) {
  try {
    // Bearer first: an unauthenticated request learns nothing about paths or methods.
    if (!options.authority.accepts(req.headers.authorization)) {
      send(res, HTTP.unauthorized, { 'www-authenticate': BEARER.scheme })
      return
    }
    // Resolve before checking the method: Allow describes the target resource, and an unknown
    // path is a 404 whatever the method (RFC 9110 §10.2.1).
    const pathname = requestPath(req.url)
    const route = pathname === undefined ? undefined : await resolveRoute(pathname, options)
    if (route === undefined) { notFound(res); return }
    if (!route.allow.includes(req.method)) { methodNotAllowed(res, route.allow); return }
    await route.serve(req, res)
  } catch { fail(res) }
}

/**
 * Create the child's loopback server.
 *
 * @param {object} options
 * @param {{ accepts: (headerValue: unknown) => boolean }} options.authority - this instance's bearer check.
 * @param {string} options.uiDir - absolute directory served under /ui/.
 * @param {Buffer} options.document - the shell document served at /.
 * @param {number} [options.heartbeatMs] - SSE heartbeat interval; defaults to the contract limit.
 * @param {{ handle: Function, subscribe: Function }} options.reminders - the reminder surface
 *   from src/slim/child/reminders.js (T10): /api/reminders and the SSE change event.
 * @returns {{ readonly origin: string | undefined, start: () => Promise<string>, close: () => Promise<void> }}
 *   origin is undefined until start() resolves; start() binds 127.0.0.1:0 and returns the origin.
 */
export function createAppServer(options) {
  const { authority, uiDir, document, heartbeatMs = LIMITS.embedSseHeartbeatMs, reminders } = options ?? {}
  if (!authority || typeof authority.accepts !== 'function') throw new TypeError('fishball-native-app: a bearer authority is required')
  if (typeof uiDir !== 'string' || !path.isAbsolute(uiDir)) throw new TypeError('fishball-native-app: an absolute UI directory is required')
  if (!Buffer.isBuffer(document)) throw new TypeError('fishball-native-app: the shell document must be a Buffer')
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0) throw new TypeError('fishball-native-app: the heartbeat must be a positive whole number of milliseconds')
  if (!reminders || typeof reminders.handle !== 'function' || typeof reminders.subscribe !== 'function') {
    throw new TypeError('fishball-native-app: the reminders surface is required')
  }

  const streams = new Set()
  const settings = { authority, uiDir, document, heartbeatMs, streams, reminders }
  let origin
  let listening = false
  let closed = false
  const server = createServer({ maxHeaderSize: BIND.maxHeaderBytes }, (req, res) => { void handle(req, res, settings).catch(() => fail(res)) })
  server.on('clientError', (_error, socket) => socket.destroy())

  async function start() {
    if (listening || closed) throw new Error('fishball-native-app: the server cannot be started again')
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: BIND.host, port: BIND.port }, () => { server.off('error', reject); resolve() })
    })
    const address = server.address()
    if (!address || address.address !== BIND.host || !Number.isSafeInteger(address.port) || address.port < BIND.minPort) {
      await new Promise((resolve) => server.close(resolve))
      throw new Error('fishball-native-app: the loopback server did not bind the expected address')
    }
    // A dispose that raced startup must not leave a listening server behind.
    if (closed) {
      await new Promise((resolve) => server.close(resolve))
      throw new Error('fishball-native-app: the server was closed during startup')
    }
    listening = true
    origin = BASE_ORIGIN + ':' + address.port
    return origin
  }

  async function close() {
    if (closed) return
    closed = true
    for (const stop of [...streams]) stop()
    if (!listening) return
    await new Promise((resolve) => server.close(resolve))
  }

  return Object.freeze({
    get origin() { return origin },
    start,
    close,
  })
}
