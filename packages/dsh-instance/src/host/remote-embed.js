import { request as openRequest, STATUS_CODES } from 'node:http'
import { pipeline } from 'node:stream'
import { LOOPBACK, RUNTIME, TICKET } from '../native-runtime/constants.js'

const WEB = Object.freeze({
  mount: '/fishball', socket: '/api/remote.mux', root: '/',
  privatePaths: ['/connect', TICKET.path, '/inspector', '/api/experimental-inspector'],
  https: 'https:', http: 'http:', get: 'GET', head: 'HEAD', owner: 'owner',
  // Do not forward cookies, authorization, Origin, Referer or deployment-specific headers.
  requestHeaders: ['accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length', 'range', 'if-range', 'if-modified-since', 'if-none-match'],
  socketHeaders: ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions'],
  responseDrop: ['connection', 'keep-alive', 'transfer-encoding', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'te', 'set-cookie', 'set-cookie2', 'clear-site-data', 'service-worker-allowed', 'refresh'],
  // 'no-referrer' can make browsers send Origin: null for same-origin mutations.
  privateHeaders: { 'cache-control': 'no-store', 'referrer-policy': 'same-origin' },
  csp: 'content-security-policy', framePolicy: "frame-ancestors 'self'",
  status: { redirect: 308, admission: 303, upgrade: 101, forbidden: 403, notFound: 404, failed: 502, unavailable: 503 },
  tokenQuery: 'token', badUrl: 'remoteEmbedUrl must be the public HTTPS root of the main DSH (optional path prefix, no credentials, query or fragment)',
  unavailableApi: 'Remote Fishball requires DSH web routing, WebSocket and browser authentication APIs',
})

/** A per-instance deployment override. Never infer a public URL from forwarded headers. */
export function parseRemoteEmbedUrl(value) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !/^https:\/\/[^/@]+(?:\/[^?#]*)?$/i.test(value) || /[\u0000-\u0020\u007f\\?#]/u.test(value)) throw new TypeError(WEB.badUrl)
  const url = URL.parse(value)
  if (!url || url.username || url.password) throw new TypeError(WEB.badUrl)
  if (!url.pathname.endsWith(WEB.root)) url.pathname += WEB.root
  return url
}

function publicMount(publicUrl) {
  return new URL(WEB.mount.slice(1) + WEB.root, publicUrl)
}

function matchesPublicRequest(publicUrl, host, origin, needsOrigin) {
  return typeof host === 'string' && !/[@/?#\\\s]/u.test(host) &&
    URL.parse(WEB.https + '//' + host)?.host === publicUrl.host &&
    (origin === undefined || origin === null ? !needsOrigin : origin === publicUrl.origin)
}

/** Owner-only POST routes call this with validated view/lang. No child credential leaves the host. */
export function remoteEmbedAdmission(publicUrl, request, { view, lang }) {
  if (!publicUrl || !matchesPublicRequest(publicUrl, request.headers.get('host'), request.headers.get('origin'), true)) return undefined
  const url = publicMount(publicUrl)
  url.hash = new URLSearchParams({ [TICKET.fragment.view]: view, [TICKET.fragment.lang]: lang }).toString()
  return { url: url.href }
}

function loopbackOrigin(value) {
  const url = typeof value === 'string' ? URL.parse(value) : null
  return url?.protocol === WEB.http && url.hostname === RUNTIME.host && url.port && url.href === url.origin + WEB.root ? url : undefined
}

function incomingPath(req) {
  const value = req.url
  if (!value?.startsWith(WEB.root) || value.startsWith('//') || value.includes('\\')) return undefined
  return URL.parse(value, 'http://dsh.invalid') ?? undefined
}

function childPath(target) {
  return target?.pathname.startsWith(WEB.mount + WEB.root) ? target.pathname.slice(WEB.mount.length) : undefined
}

function transferHeaders(source, names) {
  return Object.fromEntries(names.filter((name) => source[name] !== undefined).map((name) => [name, source[name]]))
}

function forwardOptions(req, child, path, cookie, websocket = false) {
  const headers = transferHeaders(req.headers, websocket ? WEB.socketHeaders : WEB.requestHeaders)
  if (req.headers.origin !== undefined) headers.origin = child.origin
  if (websocket) Object.assign(headers, { connection: 'Upgrade', upgrade: 'websocket' })
  return { method: req.method, hostname: child.hostname, port: child.port, path, headers: { ...headers, cookie } }
}

function rejectHttp(res, status) {
  if (res.headersSent) return res.destroy()
  res.writeHead(status, WEB.privateHeaders).end()
}

function rejectSocket(socket, status) {
  socket.end('HTTP/1.1 ' + status + ' ' + STATUS_CODES[status] + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
}

// Reuse the short-lived, one-use child ticket for the server-to-server login. The child cookie
// is kept in memory and never sent to the browser, where it would share the main DSH's origin.
async function childSession(child, ticket, signal) {
  const admission = new URL(TICKET.path, child)
  admission.searchParams.set(TICKET.param, await ticket({ audience: child.host, view: LOOPBACK.openView, lang: LOOPBACK.langs[0] }))
  const res = await fetch(admission, { signal, redirect: 'manual' })
  await res.body?.cancel()
  const cookie = res.headers.getSetCookie()[0]
  const pair = cookie?.split(';', 1)[0]
  if (res.status !== WEB.status.admission || !pair || !pair.includes('=')) return undefined
  const maxAge = /;\s*max-age=(\d+)(?:;|$)/i.exec(cookie)
  // Without an explicit expiry the credential can serve this request, but may not be cached.
  return { pair, expiresAt: Date.now() + Number(maxAge?.[1] ?? 0) * 1000 }
}

function redirectedLocation(location, options, child, mount) {
  if (typeof location !== 'string') return undefined
  const redirect = URL.parse(location, child.origin + options.path)
  if (!redirect || redirect.origin !== child.origin || redirect.searchParams.has(WEB.tokenQuery) || redirect.searchParams.has(TICKET.param)) return undefined
  const result = new URL(mount)
  // Assign the pathname rather than resolving the child path as a URL (it may begin with //).
  result.pathname = mount.pathname + redirect.pathname.slice(1)
  result.search = redirect.search
  result.hash = redirect.hash
  return result.href
}

function proxyHttp(req, res, options, child, mount, signal) {
  const upstream = openRequest({ ...options, signal }, (response) => {
    const hop = new Set([...WEB.responseDrop, ...(response.headers.connection ?? '').toLowerCase().split(/\s*,\s*/)])
    const headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => !hop.has(key)))
    if (headers.location !== undefined) {
      headers.location = redirectedLocation(headers.location, options, child, mount)
      if (!headers.location) {
        response.destroy()
        return rejectHttp(res, WEB.status.failed)
      }
    }
    // Add a policy rather than replacing an upstream CSP. Only the main origin may frame the child.
    headers[WEB.csp] = [headers[WEB.csp], WEB.framePolicy].filter(Boolean)
    res.writeHead(response.statusCode, { ...headers, ...WEB.privateHeaders })
    pipeline(response, res, () => {})
  })
  upstream.once('error', () => rejectHttp(res, WEB.status.failed))
  // The response's close listener aborts upstream on disconnect, including after request upload.
  req.once('error', () => upstream.destroy())
  req.pipe(upstream)
}

function proxySocket(socket, head, options, signal) {
  const upstream = openRequest({ ...options, signal, agent: false })
  let upgraded = false
  upstream.once('response', (response) => {
    response.destroy()
    rejectSocket(socket, WEB.status.failed)
  })
  upstream.once('error', () => {
    if (!upgraded && !socket.destroyed) rejectSocket(socket, WEB.status.failed)
  })
  upstream.once('upgrade', (response, target, initial) => {
    const accept = response.headers['sec-websocket-accept']
    if (response.statusCode !== WEB.status.upgrade || !accept || signal.aborted) {
      target.destroy()
      return rejectSocket(socket, WEB.status.failed)
    }
    upgraded = true
    const headers = transferHeaders(response.headers, [...WEB.socketHeaders, 'sec-websocket-accept'])
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n' +
      Object.entries(headers).map(([name, value]) => name + ': ' + value + '\r\n').join('') + '\r\n')
    if (head.length) target.write(head)
    if (initial.length) socket.write(initial)
    const closeTarget = () => target.destroy()
    signal.addEventListener('abort', closeTarget, { once: true })
    target.once('close', () => { signal.removeEventListener('abort', closeTarget); socket.destroy() })
    target.once('error', () => socket.destroy())
    socket.pipe(target).pipe(socket)
  })
  upstream.end()
}

/** Mount the owner-only relay for the lifetime of this instance row. */
export function registerRemoteEmbed({ webServer, connection }, { publicUrl, childOrigin, onChange, ticket }) {
  if (!publicUrl) return () => {}
  if (typeof webServer.registerUpgrade !== 'function' || typeof connection.admit !== 'function' || typeof connection.authorizeIndex !== 'function') throw new Error(WEB.unavailableApi)
  const mount = publicMount(publicUrl)
  const active = new Set()
  let generation
  function current() {
    const origin = childOrigin()
    if (generation?.origin === origin) return generation
    closeGeneration()
    const child = loopbackOrigin(origin)
    generation = child ? { child, origin, login: new AbortController() } : undefined
    return generation
  }

  function closeGeneration() {
    generation?.login.abort()
    generation = undefined
    for (const controller of active) controller.abort()
    active.clear()
  }

  function browserRejection(req, websocket) {
    const needsOrigin = websocket || (req.method !== WEB.get && req.method !== WEB.head)
    if (!matchesPublicRequest(publicUrl, req.headers.host, req.headers.origin, needsOrigin)) return WEB.status.forbidden
    const admission = connection.admit(req)
    if (admission.rejection !== undefined) return admission.rejection
    if (admission.peer?.principal.kind !== WEB.owner) return WEB.status.forbidden
    // Newer SDKs also give API operator peers the owner principal. A query-free index request
    // distinguishes a real browser session without accepting a launch token at the proxy.
    const sink = { writeHead() {}, setHeader() {}, end() {} }
    return connection.authorizeIndex({ method: WEB.get, url: WEB.root, headers: req.headers }, sink) ? undefined : WEB.status.forbidden
  }

  async function cookieFor(run) {
    if (run.session?.expiresAt > Date.now()) return run.session.pair
    run.pending ??= childSession(run.child, ticket, AbortSignal.any([run.login.signal, AbortSignal.timeout(TICKET.ttlMs)])).then((session) => {
      run.session = session
      return session?.pair
    }).finally(() => { run.pending = undefined })
    return run.pending
  }

  async function dispatch(req, downstream, head) {
    const websocket = head !== undefined
    const reject = (status) => websocket ? rejectSocket(downstream, status) : rejectHttp(downstream, status)
    const refusal = browserRejection(req, websocket)
    if (refusal !== undefined) return reject(refusal)
    const target = incomingPath(req)
    const path = childPath(target)
    if (path === undefined && target?.pathname === WEB.mount && !websocket && (req.method === WEB.get || req.method === WEB.head)) {
      return downstream.writeHead(WEB.status.redirect, { ...WEB.privateHeaders, location: mount.href }).end()
    }
    if (!path || path.startsWith('//') || WEB.privatePaths.some((prefix) => path === prefix || path.startsWith(prefix + WEB.root)) ||
      req.headers['service-worker'] !== undefined || req.headers['sec-fetch-dest'] === 'serviceworker' ||
      target.searchParams.has(WEB.tokenQuery) || target.searchParams.has(TICKET.param) || (websocket && path !== WEB.socket)) return reject(WEB.status.notFound)
    const run = current()
    if (!run) return reject(WEB.status.unavailable)
    const controller = new AbortController()
    if (websocket) downstream.once('error', () => downstream.destroy())
    active.add(controller)
    downstream.once('close', () => { active.delete(controller); controller.abort() })
    try {
      const cookie = await cookieFor(run)
      if (downstream.destroyed) return
      if (current() !== run || controller.signal.aborted) return reject(WEB.status.unavailable)
      if (!cookie) return reject(WEB.status.failed)
      const options = forwardOptions(req, run.child, path + target.search, cookie, websocket)
      if (websocket) proxySocket(downstream, head, options, controller.signal)
      else proxyHttp(req, downstream, options, run.child, mount, controller.signal)
    } catch {
      if (!downstream.destroyed) reject(controller.signal.aborted ? WEB.status.unavailable : WEB.status.failed)
    }
  }

  const disposeHttp = webServer.register({ kind: 'prefix', path: WEB.mount, handler: (req, res) => dispatch(req, res) })
  let disposeUpgrade
  let off
  try {
    disposeUpgrade = webServer.registerUpgrade({ path: WEB.mount + WEB.socket, handler: dispatch })
    off = onChange(current)
  } catch (error) {
    disposeUpgrade?.()
    disposeHttp()
    throw error
  }
  return () => {
    off()
    disposeUpgrade()
    disposeHttp()
    closeGeneration()
  }
}
