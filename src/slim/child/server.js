/**
 * The child app's loopback HTTP surface (§3.1, §3.3, §15 T03, T07, T06).
 *
 * The browser never addresses this origin: the main DSH proxies /fishball/embed/* to it with the
 * parent bearer (§3.1). The child therefore serves the unprefixed tails of the contract routes,
 * admits only the contract's methods, and answers 401 to anything that does not carry this
 * instance's bearer before it looks at a path or a method.
 *
 * This module owns the shell document, the /ui/* static files, the liveness API, the reminder
 * API (T10), the chat API (T07), the image upload API (T06) and the SSE stream with the
 * contract's heartbeat; a path beyond them is a bodyless 404, so an unknown route can never
 * serve bytes. Each surface module owns its validation and typed refusals; this hook only moves
 * the request's method, query and bounded JSON body into the matched surface and its status and
 * body back out.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BEARER, ERROR, LIMITS, ROUTES } from '../contract.js'
import { APPROVALS_API } from './approvals.js'
import { CHAT } from './chat.js'
import { IMAGES, ImageApiError } from './images.js'
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
  // These modules publish their own unprefixed tails (/api/...); the broker adds
  // /fishball/embed in front of them (§3.1).
  reminders: REMINDERS.path,
  chat: CHAT.path,
  model: CHAT.modelPath,
  upload: IMAGES.uploadPath,
  approvals: APPROVALS_API.path,
  approvalAnswer: APPROVALS_API.answerPath,
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
 * One chat change frame: an entry, a text delta, a stream end or a state/model change. The
 * payload is already the contract src/slim/ui/chat.js understands; this hook only frames it.
 */
function chatFrame(payload) {
  return 'event: ' + CHAT.event + '\ndata: ' + JSON.stringify(payload) + '\n\n'
}

/**
 * One approvals change frame. Like reminders it says only "something changed" (the approvals
 * module's own change payload), so the view re-reads and cannot drift from the child's state.
 */
function approvalFrame(payload) {
  return 'event: ' + APPROVALS_API.event + '\ndata: ' + JSON.stringify(payload) + '\n\n'
}

/**
 * The JSON API routes' own body refusals. The parsed body is handed to the matched surface, but
 * a body that never parsed or was over the contract bound has no surface code of its own; these
 * two carry the shared 400 vocabulary and the contract's too-large.
 */
const BODY = Object.freeze({
  invalid: Object.freeze({ code: 'invalid-input', message: 'The request body must be JSON.' }),
  tooLarge: Object.freeze({ code: ERROR.tooLarge, message: 'The request body is too large.' }),
})

/** A body read that failed before the matched surface saw anything; status and JSON body. */
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
  /** The chat routes read a page and accept one POST; their module refuses a wrong method too. */
  chat: CHAT.methods,
  approvals: APPROVALS_API.pageMethods,
  approvalAnswer: APPROVALS_API.answerMethods,
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

/** Send one surface answer as JSON; HEAD carries the same status and no body. */
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
 * Parse one bounded JSON body. A refusal is a status/body the route answers as-is; a read
 * failure is thrown for the outer handler, exactly like any other handler failure.
 */
async function readJson(req, limit) {
  try {
    return { body: JSON.parse(await readBody(req, limit)) }
  } catch (error) {
    if (error instanceof BodyError) return { refusal: error }
    if (error instanceof SyntaxError) return { refusal: { status: HTTP.badRequest, body: BODY.invalid } }
    throw error
  }
}

/**
 * One JSON API hook for the reminder and chat surfaces: GET and HEAD ask for a page, POST reads
 * one bounded body and mutates. The surface owns validation, bounds and typed refusals; this
 * hook only carries status and body.
 */
async function serveApi(req, res, handle) {
  if (req.method === METHOD.post) {
    const parsed = await readJson(req, LIMITS.embedJsonBodyBytes)
    if (parsed.refusal !== undefined) { sendAnswer(res, parsed.refusal, false); return }
    sendAnswer(res, await handle({ method: req.method, body: parsed.body }), false)
    return
  }
  const url = new URL(req.url, BASE_ORIGIN)
  sendAnswer(res, await handle({ method: req.method, query: url.searchParams }), req.method === METHOD.head)
}

/**
 * The upload hook (T06): POST one bounded JSON body to the image service. The module owns the
 * media-type, size, digest and store rules, and answers a typed ImageApiError; this hook only
 * carries the status and body back. Its body bound is the broker's 8 MiB upload bound (§3.6).
 */
async function serveUpload(req, res, images) {
  const parsed = await readJson(req, IMAGES.maxUploadBytes)
  if (parsed.refusal !== undefined) { sendAnswer(res, parsed.refusal, false); return }
  try {
    sendAnswer(res, { status: HTTP.ok, body: await images.upload(parsed.body) }, false)
  } catch (error) {
    if (!(error instanceof ImageApiError)) throw error
    sendAnswer(res, error, false)
  }
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
function serveEvents(res, heartbeatMs, streams, reminders, chat, approvals) {
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
  let unsubscribeChat = () => {}
  let unsubscribeApprovals = () => {}
  const close = () => {
    if (closed) return
    closed = true
    clearInterval(timer)
    // The subscriptions belong to this stream only: a closed stream must not keep re-reading
    // a list it can no longer send.
    unsubscribe()
    unsubscribeChat()
    unsubscribeApprovals()
    streams.delete(close)
    try { res.end() } catch { /* the client already closed the response */ }
  }
  const write = (frame) => {
    if (closed) return
    try { res.write(frame) } catch { close() }
  }
  unsubscribe = reminders.subscribe(() => write(REMINDER_FRAME))
  // The chat surface exists only when the app mounted it; without it the stream still carries
  // reminders, so a T03-only server keeps working.
  if (chat !== undefined) unsubscribeChat = chat.subscribe((payload) => write(chatFrame(payload)))
  if (approvals !== undefined) unsubscribeApprovals = approvals.subscribe((payload) => write(approvalFrame(payload)))
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
      serve: (_req, res) => serveEvents(res, options.heartbeatMs, options.streams, options.reminders, options.chat, options.approvals),
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
      serve: (req, res) => serveApi(req, res, (request) => options.reminders.handle(request)),
    }
  }
  if (pathname === PATHS.upload && options.images !== undefined) {
    // Upload is POST only; the image module owns the body's shape and its typed refusals (T06).
    return {
      allow: IMAGES.uploadMethods,
      serve: (req, res) => serveUpload(req, res, options.images),
    }
  }
  if (options.chat !== undefined) {
    // The chat route (T07) reads the page and queues one prompt; its module refuses a wrong
    // method and any payload key beyond the contract.
    const chat = options.chat
    if (pathname === PATHS.chat) return { allow: ALLOW.chat, serve: (req, res) => serveApi(req, res, (request) => chat.handle(CHAT.path, request)) }
    if (pathname === PATHS.model) return { allow: ALLOW.chat, serve: (req, res) => serveApi(req, res, (request) => chat.handle(CHAT.modelPath, request)) }
  }
  if (options.approvals !== undefined) {
    // The approvals page and its one answer route (T09's UI seam); the module owns validation,
    // the live-offer check and the typed refusal, this hook only carries status and body.
    const approvals = options.approvals
    if (pathname === PATHS.approvals) return { allow: ALLOW.approvals, serve: (req, res) => serveApi(req, res, (request) => approvals.handle(APPROVALS_API.path, request)) }
    if (pathname === PATHS.approvalAnswer) return { allow: ALLOW.approvalAnswer, serve: (req, res) => serveApi(req, res, (request) => approvals.handle(APPROVALS_API.answerPath, request)) }
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
 * @param {{ handle: Function, subscribe: Function }} [options.chat] - the chat surface from
 *   src/slim/child/chat.js (T07): /api/chat, /api/model and the SSE chat event. Optional so a
 *   shell-only server still serves the document, reminders and liveness.
 * @param {{ upload: Function }} [options.images] - the image surface from src/slim/child/images.js
 *   (T06). The child app row supplies it beside the reminders surface; without it /api/upload is
 *   an ordinary 404 and no route claims the path.
 * @param {{ handle: Function, subscribe: Function }} [options.approvals] - the approvals surface
 *   from src/slim/child/approvals.js (T09): /api/approvals, its answer route and the SSE event.
 *   Optional: a composition without the approvals row serves every other route.
 * @returns {{ readonly origin: string | undefined, start: () => Promise<string>, close: () => Promise<void> }}
 *   origin is undefined until start() resolves; start() binds 127.0.0.1:0 and returns the origin.
 */
export function createAppServer(options) {
  const { authority, uiDir, document, heartbeatMs = LIMITS.embedSseHeartbeatMs, reminders, chat, images, approvals } = options ?? {}
  if (!authority || typeof authority.accepts !== 'function') throw new TypeError('fishball-native-app: a bearer authority is required')
  if (typeof uiDir !== 'string' || !path.isAbsolute(uiDir)) throw new TypeError('fishball-native-app: an absolute UI directory is required')
  if (!Buffer.isBuffer(document)) throw new TypeError('fishball-native-app: the shell document must be a Buffer')
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0) throw new TypeError('fishball-native-app: the heartbeat must be a positive whole number of milliseconds')
  if (!reminders || typeof reminders.handle !== 'function' || typeof reminders.subscribe !== 'function') {
    throw new TypeError('fishball-native-app: the reminders surface is required')
  }
  if (chat !== undefined && (typeof chat.handle !== 'function' || typeof chat.subscribe !== 'function')) {
    throw new TypeError('fishball-native-app: the chat surface must implement handle and subscribe')
  }
  if (images !== undefined && typeof images?.upload !== 'function') {
    throw new TypeError('fishball-native-app: the image surface must implement upload')
  }
  if (approvals !== undefined && (typeof approvals.handle !== 'function' || typeof approvals.subscribe !== 'function')) {
    throw new TypeError('fishball-native-app: the approvals surface must implement handle and subscribe')
  }

  const streams = new Set()
  const settings = { authority, uiDir, document, heartbeatMs, streams, reminders, chat, images, approvals }
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
