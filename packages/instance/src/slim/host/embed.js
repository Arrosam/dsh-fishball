/**
 * Main-side embed broker (§3.1, §3.2, §3.6, §15 T04).
 *
 * The browser never addresses the child's loopback port. It loads /fishball/embed/ from the main
 * DSH origin; this module authenticates that request as the main DSH session, strips the prefix,
 * and forwards it to the child with the parent-only bearer. The child's CSP forbids framing and
 * its own cookies never reach this origin: the broker replaces the framing policy, drops browser
 * credentials, and adds the bearer only on the child side.
 *
 * The route answers the static error card (with a Retry that calls the lifecycle restart service)
 * when the child is not ready, so a stopped child is never redirected to legacy Fishball. SSE is
 * piped as it arrives; Node's pipe pauses the child when the browser stops reading.
 */
import { request as httpRequest } from 'node:http'
import { ADMISSION, BEARER, LIMITS, ROUTES, STATUS, STATUS_CODES } from '../contract.js'
import { INSTANCE_CODES, INSTANCE_STATES } from '../../host/binding.js'
// The page's own dictionaries and language rule (I9, D30): the 503 card is the page's stand-in,
// so it follows the same `lang` the framed page would. The module has no DOM or Node dependency.
import { i18nOf } from '../ui/i18n.js'

const PREFIX = ROUTES.prefix
const DOCUMENT = ROUTES.document
const UI = ROUTES.ui
const API = ROUTES.api

/** The child serves the broker routes without the prefix (§3.1). */
const CHILD = Object.freeze({
  document: '/',
  ui: UI.slice(PREFIX.length),
  api: API.slice(PREFIX.length),
  events: ROUTES.events.slice(PREFIX.length),
})

/** The one upload route (§3.6). T06/T07 must keep this path or move the limit with it. */
const UPLOAD = Object.freeze({ path: CHILD.api + 'upload' })

/**
 * The one API route whose child cache header survives the proxy: T06's read-only image route is
 * content-addressed, so its immutable header is safe. Keep the path in step with
 * IMAGES.readPath (src/slim/child/images.js); every other /api/* response stays no-store.
 */
const IMAGE_READ = Object.freeze({ path: CHILD.api + 'images/' })

/** The contract's proxy methods; every other method is refused with 405 (§3.6). */
const ALLOW = ROUTES.methods.join(', ')
const METHOD = Object.freeze({ head: 'HEAD', post: 'POST' })

const HTTP = Object.freeze({
  seeOther: 303,
  movedPermanently: 308,
  unauthorized: BEARER.unauthorizedStatus,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  payloadTooLarge: 413,
  tooManyRequests: 429,
  serverError: 500,
  unavailable: 503,
})

const TYPE = Object.freeze({
  html: 'text/html; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
})

const EVENT_STREAM = 'text/event-stream'

/**
 * Exact §3.3 response policy: framing by the main origin only, and default-src 'self' so no
 * inline script or style can run. Replacing (never appending to) the child's frame-ancestors
 * 'none' policy is what makes the same-origin iframe legal.
 */
const CSP = "frame-ancestors 'self'; default-src 'self'; img-src 'self' data:; connect-src 'self'"
const SECURITY = Object.freeze({
  'content-security-policy': CSP,
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})
const CACHE = Object.freeze({
  noStore: 'no-store',
  /** Only content-hashed /ui/ names may be immutable; a rename then publishes new bytes. */
  immutable: 'public, max-age=31536000, immutable',
})

/** Hash shape a build tool emits in a served file's name (for example shell-4f2c9a1b.js). */
const HASHED_NAME = /[-.][0-9a-f]{8,}\.[a-z0-9]+$/i

/** Browser credentials that must never reach the child, plus headers the proxy owns. */
const DROP_REQUEST = new Set([
  'authorization', 'cookie', 'cookie2', 'host', 'origin', 'referer',
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'content-length',
])
const DROP_RESPONSE = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'content-security-policy', 'content-security-policy-report-only',
  'x-frame-options', 'referrer-policy', 'set-cookie',
])

const BASE_ORIGIN = 'http://embed.invalid'

/**
 * Contract states and codes, plus the instance's own `connector-missing` (D25, inst-OQ-13) and
 * refused-attach codes (inst-OQ-03), are the only values the card may show (§11: safe code, no path).
 */
const STATES = new Set(INSTANCE_STATES)
const CODES = new Set(INSTANCE_CODES)

const HTML_ESCAPE = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character])

function safeView(service) {
  try {
    const value = service.status()
    return {
      enabled: value?.enabled === true,
      state: STATES.has(value?.state) ? value.state : STATUS.failed,
      code: CODES.has(value?.code) ? value.code : null,
    }
  } catch {
    return { enabled: false, state: STATUS.failed, code: STATUS_CODES.unavailable }
  }
}

const ready = (view) => view.enabled && view.state === STATUS.ready

/** A ready status whose access lookup failed is reported as unavailable, never with a token. */
const inaccessible = () => ({ enabled: false, state: STATUS.failed, code: STATUS_CODES.unavailable })

/**
 * One request target below the prefix. Absolute URLs, protocol-relative targets, backslashes, NULs
 * and encoded dot segments are refused; the parsed pathname then picks the child route. Query
 * parameters survive the prefix strip.
 */
function targetOf(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/') || rawUrl.startsWith('//')) return undefined
  const rawPath = rawUrl.split('?')[0]
  if (rawPath.includes('\\') || rawPath.includes('\0') || rawPath.toLowerCase().includes('%2e')) return undefined
  let url
  try { url = new URL(rawUrl, BASE_ORIGIN) } catch { return undefined }
  if (url.origin !== BASE_ORIGIN) return undefined
  const pathname = url.pathname
  if (pathname.includes('\\') || pathname.includes('\0')) return undefined
  if (pathname === PREFIX) return { redirect: DOCUMENT + url.search }
  let tail
  if (pathname === DOCUMENT) tail = CHILD.document
  else if (pathname.startsWith(UI)) tail = pathname.slice(PREFIX.length)
  else if (pathname.startsWith(API)) tail = pathname.slice(PREFIX.length)
  else return undefined
  if (tail.split('/').some((segment) => segment === '.' || segment === '..')) return undefined
  return { tail, search: url.search }
}

function bodyLimit(tail) {
  return tail === UPLOAD.path ? LIMITS.embedUploadBodyBytes : LIMITS.embedJsonBodyBytes
}

function upstreamHeaders(request, access, body) {
  const headers = {}
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || DROP_REQUEST.has(name)) continue
    headers[name] = value
  }
  headers[BEARER.header] = BEARER.scheme + BEARER.separator + access.bearer
  if (body !== undefined) headers['content-length'] = String(body.length)
  return headers
}

/** Prefix a child redirect so it cannot send the browser to the main origin's own root. */
function rewriteLocation(value) {
  const location = Array.isArray(value) ? value[0] : value
  if (typeof location !== 'string' || !location.startsWith('/') || location.startsWith('//')) return undefined
  if (location === PREFIX || location.startsWith(DOCUMENT)) return location
  return PREFIX + location
}

function cacheFor(tail, current) {
  // The child's own header is trusted only on the content-addressed image read route; a miss
  // there (404/405) carries no header and still falls back to no-store.
  if (tail.startsWith(IMAGE_READ.path)) return current ?? CACHE.noStore
  if (tail === CHILD.document || tail.startsWith(CHILD.api)) return CACHE.noStore
  if (tail.startsWith(CHILD.ui) && HASHED_NAME.test(tail)) return CACHE.immutable
  return current ?? CACHE.noStore
}

function responseHeaders(childHeaders, tail) {
  const headers = {}
  for (const [name, value] of Object.entries(childHeaders)) {
    if (value === undefined || DROP_RESPONSE.has(name)) continue
    if (name === 'location') {
      const location = rewriteLocation(value)
      if (location !== undefined) headers[name] = location
      continue
    }
    headers[name] = value
  }
  Object.assign(headers, SECURITY)
  headers['cache-control'] = cacheFor(tail, headers['cache-control'])
  return headers
}

const isEventStream = (headers) => {
  const type = headers['content-type']
  return typeof type === 'string' && type.toLowerCase().startsWith(EVENT_STREAM)
}

/**
 * The 503 card in the language of the request's `lang` (the first one, exactly `zh` for Chinese;
 * ui/i18n.js languageOf). The words are escaped like every other value.
 */
function errorDocument(view, search) {
  const { t, locale } = i18nOf(search)
  const word = (key) => escapeHtml(t(key))
  const lines = [
    '<!doctype html>',
    '<html lang="' + escapeHtml(locale) + '">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<title>' + word('unavailable.title') + '</title>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>' + word('unavailable.heading') + '</h1>',
    '<p>' + word('unavailable.state') + ' <code>' + escapeHtml(view.state) + '</code></p>',
    view.code ? '<p>' + word('unavailable.code') + ' <code>' + escapeHtml(view.code) + '</code></p>' : '',
    '<p>' + word('unavailable.retryHint') + '</p>',
    // No action attribute: the form retries the current document URL (with its `lang`), so the
    // page carries no path and the answer keeps the language.
    '<form method="post"><button type="submit">' + word('unavailable.retry') + '</button></form>',
    '</main>',
    '</body>',
    '</html>',
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * Read at most limit bytes. A declared or observed oversize is 413; the rest of the body is
 * drained so the connection can answer instead of resetting.
 */
function readBody(request, limit) {
  const declared = Number(request.headers['content-length'])
  if (Number.isSafeInteger(declared) && declared > limit) {
    request.resume()
    return Promise.reject(HTTP.payloadTooLarge)
  }
  return new Promise((resolve, reject) => {
    let chunks = []
    let total = 0
    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      chunks = []
      request.resume()
      reject(HTTP.payloadTooLarge)
    }
    request.on('data', (chunk) => {
      if (settled) return
      total += chunk.length
      if (total > limit) { fail(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    request.on('error', () => {
      if (settled) return
      settled = true
      reject(HTTP.serverError)
    })
    request.on('aborted', () => {
      if (settled) return
      settled = true
      reject(HTTP.serverError)
    })
  })
}

/**
 * Create the broker for one service. The connection is the main DSH admission service; the
 * route is mounted by registerEmbed so tests can exercise handle() with the same contract.
 */
export function createEmbedBroker({ service, connection }) {
  if (!service || typeof service.status !== 'function' || typeof service.embedAccess !== 'function' || typeof service.restart !== 'function') {
    throw new TypeError('fishball embed: a native service with status, embedAccess and restart is required')
  }
  if (!connection || typeof connection.requestRejection !== 'function') {
    throw new TypeError('fishball embed: the main connection admission service is required')
  }

  let activeStreams = 0
  const proxies = new Set()
  const tokens = new Set()

  function reserve() {
    if (activeStreams >= LIMITS.embedConcurrentStreams) return undefined
    activeStreams += 1
    const token = {}
    tokens.add(token)
    return () => {
      if (!tokens.delete(token)) return
      activeStreams -= 1
    }
  }

  function reply(response, method, status, headers, body = '') {
    if (response.destroyed || response.writableEnded) return
    if (response.headersSent) { response.end(); return }
    const payload = Buffer.from(body)
    response.writeHead(status, {
      ...SECURITY,
      'cache-control': CACHE.noStore,
      ...headers,
      'content-length': payload.length,
    })
    if (method === METHOD.head) response.end()
    else response.end(payload)
  }

  /** `search` is the request's query, which picks the 503 card's language; '' is English. */
  function unavailable(response, method, view, tail, search = '') {
    if (tail === CHILD.document) {
      reply(response, method, HTTP.unavailable, { 'content-type': TYPE.html }, errorDocument(view, search))
      return
    }
    if (tail.startsWith(CHILD.api)) {
      const body = JSON.stringify({ ok: false, state: view.state, code: view.code })
      reply(response, method, HTTP.unavailable, { 'content-type': TYPE.json }, body)
      return
    }
    reply(response, method, HTTP.unavailable, { 'content-type': TYPE.text }, 'Fishball is not available.')
  }

  function redirect(response, method, status, location) {
    reply(response, method, status, { location })
  }

  /**
   * One proxied request. The body is bounded before it leaves the main process; the response is
   * piped so SSE stays unbuffered and pipe supplies backpressure to the child.
   */
  function forward(request, response, target, access, body) {
    let origin
    try { origin = new URL(access.origin) } catch { unavailable(response, request.method, inaccessible(), target.tail, target.search); return }
    let reserved = false
    let released = () => {}
    if (target.tail === CHILD.events) {
      released = reserve()
      if (released === undefined) {
        request.resume()
        reply(response, request.method, HTTP.tooManyRequests, { 'content-type': TYPE.text }, 'Too many open Fishball streams.')
        return
      }
      reserved = true
    }
    let child
    try {
      child = httpRequest({
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port,
        method: request.method,
        path: target.tail + target.search,
        headers: upstreamHeaders(request, access, body),
      })
    } catch {
      released()
      unavailable(response, request.method, inaccessible(), target.tail, target.search)
      return
    }

    let responded = false
    let ended = false
    const release = () => { released(); released = () => {} }
    const abort = () => {
      if (ended) return
      ended = true
      proxies.delete(abort)
      release()
      try { child.destroy() } catch { /* the child request already ended */ }
      if (!response.destroyed && !response.writableEnded) {
        try { response.end() } catch { /* the browser already went away */ }
      }
    }
    proxies.add(abort)
    response.on('close', abort)
    response.on('error', abort)
    request.on('aborted', abort)
    request.on('error', abort)
    // A stream with no child bytes is dead; the child's 15 s heartbeat keeps SSE under this.
    // A request still waiting for headers becomes the 503 card rather than an empty 200.
    child.setTimeout(LIMITS.embedStreamIdleTimeoutMs, () => {
      if (ended) return
      if (responded) { abort(); return }
      responded = true
      ended = true
      proxies.delete(abort)
      release()
      try { child.destroy() } catch { /* the child request already ended */ }
      unavailable(response, request.method, inaccessible(), target.tail, target.search)
    })

    child.on('error', () => {
      if (responded) { abort(); return }
      responded = true
      proxies.delete(abort)
      release()
      unavailable(response, request.method, inaccessible(), target.tail, target.search)
    })
    child.on('response', (upstream) => {
      responded = true
      if (upstream.statusCode === HTTP.unauthorized) {
        // The bearer rotated under us: report the child as unavailable, not as a browser 401.
        ended = true
        proxies.delete(abort)
        release()
        upstream.resume()
        try { child.destroy() } catch { /* the child request already ended */ }
        unavailable(response, request.method, inaccessible(), target.tail, target.search)
        return
      }
      if (isEventStream(upstream.headers) && !reserved) {
        const reserveStream = reserve()
        if (reserveStream === undefined) {
          ended = true
          proxies.delete(abort)
          release()
          upstream.resume()
          try { child.destroy() } catch { /* the child request already ended */ }
          reply(response, request.method, HTTP.tooManyRequests, { 'content-type': TYPE.text }, 'Too many open Fishball streams.')
          return
        }
        released = reserveStream
        reserved = true
      }
      const headers = responseHeaders(upstream.headers, target.tail)
      try { response.writeHead(upstream.statusCode ?? HTTP.serverError, headers) } catch { abort(); return }
      if (isEventStream(upstream.headers)) response.flushHeaders()
      if (request.method === METHOD.head) {
        upstream.resume()
        response.end()
        return
      }
      upstream.on('error', abort)
      upstream.on('close', release)
      upstream.pipe(response)
    })
    child.end(body)
  }

  /** The Retry POST; it keeps the document's query, so the page after it keeps its `lang` and view. */
  async function retry(request, response, search) {
    request.resume()
    let view = safeView(service)
    if (ready(view)) { redirect(response, request.method, HTTP.seeOther, DOCUMENT + search); return }
    try { await service.restart() } catch { /* the status below is the safe answer */ }
    view = safeView(service)
    if (ready(view)) { redirect(response, request.method, HTTP.seeOther, DOCUMENT + search); return }
    unavailable(response, request.method, view, CHILD.document, search)
  }

  async function dispatch(request, response) {
    const target = targetOf(request.url)
    if (target === undefined) {
      request.resume()
      reply(response, request.method, HTTP.notFound, { 'content-type': TYPE.text }, '')
      return
    }
    if (!ROUTES.methods.includes(request.method)) {
      request.resume()
      reply(response, request.method, HTTP.methodNotAllowed, { allow: ALLOW, 'content-type': TYPE.text }, '')
      return
    }
    // Same-origin first: a cross-site request learns nothing about authentication state.
    if (request.headers[ADMISSION.siteHeader] !== ADMISSION.sameOrigin) {
      request.resume()
      reply(response, request.method, HTTP.forbidden, { 'content-type': TYPE.text }, '')
      return
    }
    const rejection = connection.requestRejection({ headers: request.headers })
    if (rejection !== undefined) {
      request.resume()
      reply(response, request.method, rejection, { 'content-type': TYPE.text }, '')
      return
    }
    if (target.redirect !== undefined) {
      request.resume()
      redirect(response, request.method, HTTP.movedPermanently, target.redirect)
      return
    }
    // POST to the document is the Retry action; the child never sees it.
    if (request.method === METHOD.post && target.tail === CHILD.document) {
      await retry(request, response, target.search)
      return
    }
    const view = safeView(service)
    if (!ready(view)) {
      request.resume()
      unavailable(response, request.method, view, target.tail, target.search)
      return
    }
    let access
    try { access = await service.embedAccess() } catch { access = undefined }
    if (access === undefined || response.destroyed || response.writableEnded) {
      request.resume()
      unavailable(response, request.method, inaccessible(), target.tail, target.search)
      return
    }
    let body
    try { body = await readBody(request, bodyLimit(target.tail)) } catch (status) {
      reply(response, request.method, status, { 'content-type': TYPE.text }, 'Request body is too large.')
      return
    }
    if (response.destroyed || response.writableEnded) return
    forward(request, response, target, access, body)
  }

  async function handle(request, response) {
    try { await dispatch(request, response) } catch {
      // Never echo an exception: an access failure may name the child or its credentials.
      request.resume()
      if (!response.headersSent) {
        reply(response, request.method, HTTP.serverError, { 'content-type': TYPE.text }, '')
      } else {
        try { response.destroy() } catch { /* already gone */ }
      }
    }
  }

  return Object.freeze({
    handle,
    close() {
      for (const abort of [...proxies]) abort()
      proxies.clear()
    },
  })
}

/**
 * Mount the broker on the main DSH web server. The route is registered only when both the web
 * server and connection admission exist; a missing service leaves the main DSH running.
 */
export function registerEmbed(ctx, service) {
  const webServer = ctx?.webServer
  const connection = ctx?.connection
  if (!webServer || !connection) return undefined
  let broker
  try { broker = createEmbedBroker({ service, connection }) } catch { return undefined }
  try {
    ctx.effect(() => {
      const remove = webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: (request, response) => broker.handle(request, response),
      })
      return () => {
        remove()
        broker.close()
      }
    }, 'fishball: embed broker')
  } catch {
    broker.close()
    return undefined
  }
  return broker
}
