/**
 * A fake Fishball connector for the F-LINK cases (level "unit: one module with fakes ... transport",
 * test-design README). It speaks only what the requirements and the frozen K1 module define:
 * RFC 9728 / 8414 metadata from K1's builders, a client-credentials token endpoint, and an MCP
 * 2026-07-28 endpoint (server/discover, tools/list, tools/call, subscriptions/listen) whose tool
 * results use K1's envelope. It is a test double, not a connector: it checks only what a case needs.
 *
 * Every request it receives is recorded (method, path, headers, body), so a case can prove where a
 * credential went. `drop()` makes the target unreachable (closes the listener and every socket) and
 * `restore()` brings it back on the same port, so the link's own reconnect can be watched.
 */
import http from 'node:http'
import { HARNESS, K1, MAILBOX, RPC, WEB, token } from './constants.mjs'

/** How the fake behaves (one decision-table input per field). */
export const MODE = Object.freeze({
  /** A V3 connector (the default). */
  v3: Symbol('v3'),
  /** A V2 connector: no MCP route, 404 everywhere (R-MIG-03). */
  v2: Symbol('v2'),
  /** The MCP endpoint answers every POST with a redirect to `redirectTo` (REM-UC-01 E4). */
  redirect: Symbol('redirect'),
})

const SSE_FRAME = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`

const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', () => resolve(''))
})

const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': WEB.json, ...headers })
  res.end(JSON.stringify(body))
}

/** `{jsonrpc, id, result}` with the 2026-07-28 `resultType`. */
const rpcResult = (id, result) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...result } })
/**
 * MCP 2026-07-28 CacheableResult (SEP-2549): `tools/list`, `resources/list` and `resources/read`
 * results REQUIRE `ttlMs` (a non-negative integer) and `cacheScope` ('public' | 'private'); the
 * SDK 2.2.0 client rejects such a result without them (INVALID_RESULT). 0 is the spec's
 * "immediately stale" and 'private' its non-shared scope, so a fake list is never cached.
 */
const CACHEABLE = Object.freeze({ ttlMs: 0, cacheScope: 'private' })
const rpcError = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })

/** A mailbox event of K1's shape (MAILBOX_EVENT_SCHEMA), with a fake digest of K1's length. */
export function mailboxEvent(sequence, type, payload, offer) {
  return {
    eventId: `e${sequence}`,
    mailboxGeneration: MAILBOX.generation,
    sequence,
    type,
    at: Date.now(),
    sourceSessionId: null,
    correlationId: null,
    ...(offer === undefined ? {} : { offer }),
    payload,
    payloadDigest: MAILBOX.digestFill.repeat(K1.WIRE.digestHexChars),
  }
}

/**
 * Starts a fake connector on a dual-stack loopback port, so `127.0.0.1`, `localhost` and `[::1]`
 * all reach it.
 * @param {{mode?: string, clientId: string, secret: string, issuerOrigin?: string, redirectTo?: string,
 *   tools?: () => object[], onTool?: (name: string, args: object) => unknown, onRpc?: (message: object) => {status: number, body: object, headers?: object} | undefined}} options
 *   `issuerOrigin` overrides the authorization server the protected resource metadata names
 *   (a foreign issuer); `redirectTo` is the target of MODE.redirect. R-FIX-CORE additions, each
 *   off by default: `tools()` answers `tools/list` (default K1's full list); `onTool(name, args)`
 *   answers a `tools/call` with its own structuredContent fields (a promise may hold the call;
 *   `undefined` falls back to the defaults below); `onRpc(message)` answers an authenticated MCP
 *   request with a raw HTTP status and body instead (a scripted failure).
 */
export async function startFakeConnector({ mode = MODE.v3, clientId, secret, issuerOrigin, redirectTo, tools = () => K1.TOOLS, onTool, onRpc }) {
  const requests = []
  const listens = []
  // The open listen responses, kept apart from `listens` (a case prints those as JSON).
  const streams = []
  const calls = []
  const issued = new Set()
  // R-FIX-CORE: the token endpoint refuses even the right secret while false (a runtime refusal).
  let secretAccepted = true
  const sockets = new Set()
  /** Events the next inbox_poll returns (then cleared: a fake mailbox with no cursor semantics). */
  let pending = []
  let port = 0

  const originOf = (req) => `http://${req.headers.host}`
  const basicOk = (header) => header === WEB.basic + Buffer.from(`${clientId}:${secret}`).toString('base64')

  async function tokenEndpoint(req, res, body) {
    const form = new URLSearchParams(body)
    const viaPost = form.get('client_id') === clientId && form.get('client_secret') === secret
    if (form.get('grant_type') !== K1.GRANT.clientCredentials || !secretAccepted || !(basicOk(req.headers.authorization) || viaPost)) {
      const error = K1.OAUTH_ERROR.invalidClient
      return sendJson(res, K1.OAUTH_ERROR_STATUS[error], K1.oauthErrorBody(error), { 'www-authenticate': K1.BEARER_CHALLENGE.basicScheme })
    }
    // Opaque and random, so no part of the client secret ever travels inside an access token.
    const accessToken = token()
    issued.add(accessToken)
    return sendJson(res, K1.HTTP_STATUS.ok, K1.tokenResponse({ accessToken, scope: K1.SCOPE.full }), K1.TOKEN_RESPONSE_HEADERS)
  }

  async function toolResult(name, args) {
    calls.push({ name, args })
    const scripted = await onTool?.(name, args)
    if (scripted !== undefined) return K1.okResult(scripted)
    if (name === K1.TOOL.inboxPoll) {
      const events = pending
      pending = []
      return K1.okResult({ events, nextCursor: MAILBOX.cursor, hasMore: false })
    }
    if (name === K1.TOOL.inboxAck) return K1.okResult({ acked: args?.receipts?.length ?? 0 })
    if (name === K1.TOOL.approvalAnswer) return K1.okResult({ accepted: true })
    return K1.okResult({})
  }

  async function mcpEndpoint(req, res, body) {
    const origin = originOf(req)
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith(WEB.bearer) || !issued.has(auth.slice(WEB.bearer.length))) {
      return sendJson(res, K1.HTTP_STATUS.unauthorized, {}, { 'www-authenticate': auth ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    }
    let message
    try { message = JSON.parse(body) } catch { return sendJson(res, K1.HTTP_STATUS.badRequest, rpcError(null, RPC.parseError, 'parse error')) }
    if (message.id === undefined) { res.writeHead(WEB.accepted); return res.end() }
    const raw = onRpc?.(message)
    if (raw !== undefined) return sendJson(res, raw.status, raw.body, raw.headers)
    switch (message.method) {
      case RPC.discover:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          supportedVersions: [K1.PROTOCOL.version],
          capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: false } },
        }))
      case RPC.toolsList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...CACHEABLE, tools: tools() }))
      case RPC.toolsCall:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...await toolResult(message.params?.name, message.params?.arguments) }))
      case RPC.resourcesRead:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          ...CACHEABLE,
          contents: [{ uri: K1.RESOURCE.events.uri, mimeType: K1.RESOURCE.events.mimeType, text: JSON.stringify({ pending: pending.length, headSequence: 0, mailboxGeneration: MAILBOX.generation }) }],
        }))
      case RPC.resourcesList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...CACHEABLE, resources: [K1.RESOURCE.events] }))
      case RPC.listen: {
        const filter = message.params?.notifications ?? {}
        listens.push({ filter, at: Date.now() })
        streams.push({ res, id: message.id })
        res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': WEB.sse, ...K1.TOKEN_RESPONSE_HEADERS })
        res.write(SSE_FRAME({ jsonrpc: RPC.jsonrpc, method: RPC.acknowledged, params: { notifications: filter, _meta: { [RPC.subscriptionIdKey]: message.id } } }))
        return undefined // held open until the client or drop() ends it
      }
      default:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcError(message.id, RPC.methodNotFound, 'method not found'))
    }
  }

  async function handle(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, originOf(req))
    requests.push({ method: req.method, path: url.pathname, query: url.search, headers: { ...req.headers }, body })
    if (mode === MODE.v2) return sendJson(res, K1.HTTP_STATUS.notFound, {})
    const origin = originOf(req)
    if (req.method === WEB.get && url.pathname === K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp) {
      const doc = K1.protectedResourceMetadata(origin)
      return sendJson(res, K1.HTTP_STATUS.ok, issuerOrigin === undefined ? doc : { ...doc, authorization_servers: [issuerOrigin + K1.PATHS.issuer] })
    }
    if (req.method === WEB.get && url.pathname === K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer) {
      return sendJson(res, K1.HTTP_STATUS.ok, K1.authorizationServerMetadata(origin, origin))
    }
    if (req.method === WEB.post && url.pathname === K1.PATHS.token) return tokenEndpoint(req, res, body)
    if (url.pathname === K1.PATHS.mcp) {
      if (mode === MODE.redirect) { res.writeHead(WEB.temporaryRedirect, { location: redirectTo }); return res.end() }
      if (req.method === WEB.post) return mcpEndpoint(req, res, body)
      res.writeHead(K1.HTTP_STATUS.methodNotAllowed, { allow: WEB.post })
      return res.end()
    }
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }

  const server = http.createServer((req, res) => { handle(req, res).catch(() => { try { res.destroy() } catch { /* gone */ } }) })
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })

  const listen = () => new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HARNESS.bindHost, () => { server.off('error', reject); port = server.address().port; resolve() })
  })
  const close = () => new Promise((resolve) => {
    for (const s of sockets) s.destroy()
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })
  await listen()

  return {
    get port() { return port },
    requests,
    listens,
    calls,
    /** Origin under one loopback name, e.g. `http://[::1]:49152`. */
    origin: (host) => `http://${host}:${port}`,
    /** Queue events for the next inbox_poll. */
    enqueue: (...events) => { pending.push(...events) },
    /** tools/call requests of one tool name. */
    callsOf: (name) => calls.filter((c) => c.name === name),
    tokenRequests: () => requests.filter((r) => r.path === K1.PATHS.token),
    /** The target becomes unreachable: listener closed, every socket destroyed. */
    drop: close,
    /** The target comes back on the same port. */
    restore: listen,
    stop: close,
    /**
     * R-FIX-CORE: the events hint (`notifications/resources/updated` on `dsh-agent://events`) on
     * every open listen stream, as the connector sends it after a mailbox commit (R-CON-04).
     */
    hint() {
      for (const s of streams) {
        if (s.res.destroyed || s.res.writableEnded) continue
        s.res.write(SSE_FRAME({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: K1.RESOURCE.events.uri, _meta: { [RPC.subscriptionIdKey]: s.id } } }))
      }
    },
    /** R-FIX-CORE: every access token dies, the listen streams stay open (a revoked OAuth chain). */
    revokeAccess: () => { issued.clear() },
    /** R-FIX-CORE: the token endpoint refuses (`false`) or accepts (`true`) the principal's secret. */
    acceptSecret: (accepted) => { secretAccepted = accepted },
  }
}

/** A plain recorder on another origin: answers 404 to everything and records what it was sent. */
export async function startRecorder() {
  const requests = []
  const server = http.createServer(async (req, res) => {
    requests.push({ method: req.method, path: req.url, headers: { ...req.headers }, body: await readBody(req) })
    sendJson(res, K1.HTTP_STATUS.notFound, {})
  })
  await new Promise((resolve) => server.listen(0, HARNESS.bindHost, resolve))
  const port = server.address().port
  return {
    requests,
    origin: (host) => `http://${host}:${port}`,
    stop: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}

/** A loopback port with nothing listening on it (bound once, then released). */
export async function freePort() {
  const server = http.createServer()
  await new Promise((resolve) => server.listen(0, HARNESS.bindHost, resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}
