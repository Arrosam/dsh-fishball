/**
 * Test doubles shared by the oauth-client and the adapter cases (no product code is read or imitated):
 *
 * - `startFakeConnector()`: a fake DSH connector on 127.0.0.1. It has two listeners, as R-OA-20
 *   splits them: DSH's web listener (PRM, AS metadata, token endpoint, MCP endpoint) and the approval
 *   listener (`/authorize` and its decision form). Its metadata comes from K1's own builders, with the
 *   overrides AUTH-DT-11 needs. The token endpoint follows R-OA-14/16: PKCE S256, single-use codes,
 *   `resource` required, refresh rotation and reuse detection, entry disable → `invalid_grant`. The MCP
 *   endpoint is enough of 2026-07-28 for `server/discover`, `tools/list`, `tools/call` and a long-lived
 *   `subscriptions/listen`. It records every request and every secret it issues or sees (planted
 *   values for the leak check).
 * - `otherServer()`: the non-DSH OAuth MCP server at `https://other.example` (AUTH-UC-14). It is a
 *   handler behind the injected fetch only, so no request leaves the machine.
 * - `recordingFetch()`: the `fetch` injected into the product. Loopback URLs go to the real network
 *   stack; `https://other.example` goes to its handler; anything else fails as unreachable.
 * - `fakeClock()`: `now()` plus Node-shaped `setTimeout` / `clearTimeout` driven by `advance(ms)`.
 * - `browser`: the owner's scripted browser (open the URL, post the form, follow the 303 by hand).
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import { FIXTURE, K, K1, MARK, OAUTH, RPC, WAIT, WEB } from './constants.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** A planted, recognisable secret of one class (MARK): the marker, the class, random base64url. */
export const plant = (kind) => MARK.prefix + kind + randomBytes(MARK.randomBytes).toString('base64url')
const s256 = (verifier) => createHash('sha256').update(verifier).digest('base64url')

const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', () => resolve(Buffer.concat(chunks)))
})
const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': WEB.json, ...headers })
  res.end(JSON.stringify(body))
}
export const rpcResult = (id, result) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...result } })
const rpcError = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })
export const sseFrame = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
const listenOn = (server, port = 0) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, FIXTURE.loopback, () => { server.off('error', reject); resolve(server.address().port) })
})
const trackSockets = (server) => {
  const sockets = new Set()
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  return sockets
}
const closeServer = (server, sockets) => new Promise((resolve) => {
  for (const s of sockets) s.destroy()
  if (!server.listening) return resolve()
  server.close(() => resolve())
})

/** The tools the fake MCP endpoint lists (AUTH-UC-12 step 6 names `pair` and `whoami`). */
export const FAKE_TOOLS = Object.freeze({ pair: 'pair', whoami: 'whoami' })
const toolList = Object.values(FAKE_TOOLS).map((name) => ({ name, description: 'fbtest ' + name, inputSchema: { type: 'object', properties: {} } }))
/** Text the fake's tools answer with: the bound agent id, so a call proves which pair it ran as. */
export const toolText = (agentId) => 'fbtest pair id=' + agentId

/**
 * Starts the fake connector. `options.issueRefresh` (default true) decides whether code redemptions
 * return a refresh token. `script` (mutable, on the returned object) holds the one-shot or standing
 * misbehaviours the cases set:
 * - `prm`: `'status'` (answer 500), `'missing'` (404) or `'not-json'`; `prmDelayMs`: answer the PRM
 *   only after this many real ms (`Infinity`: never, until the fake stops);
 * - `expiresInS`: the `expires_in` of every token response from now on (default K1's 3600); `asMetadata`: `'status'` (answer 500);
 * - `metadata`: `{resource?, authorizationServers?, scopes?}` (`scopes: null` removes the field);
 * - `tokenError`: `{grant, error, status}`, once;
 * - `rejectAllAccess`: every MCP request gets 401;
 * - `tokenStall`: the token endpoint never answers (until the fake stops; S2 deadlines);
 * - `beforeMcp(record)`: an async hook run before each MCP request is answered; resolving `true`
 *   answers that request 401 (the S4 race is sequenced through it);
 * - `tokenRedirect`: a URL; every token request is answered 307 to it (X-SEC X-05);
 * - `asOverride`: members merged over the AS metadata (`undefined` removes one): X-06, X-13.
 * - `tokenError.times`: how many token requests of that grant the error answers (default 1, once);
 *   `Infinity` makes it standing (review F4: repeated transient failures);
 * - `tokenDrop`: the next this many token requests are recorded, then their socket is destroyed (a
 *   network failure, review F4);
 * - `mcpReply(record, res)`: an async hook run after the access token was accepted; resolving `true`
 *   means it answered the request itself (review F2/F5/F6/F8: redirects, gateway statuses, streams,
 *   response headers).
 */
export async function startFakeConnector({ issueRefresh = true } = {}) {
  const requests = []
  const planted = new Set()
  const remember = (v) => { if (v) planted.add(v); return v }
  const entry = { token: remember(plant(MARK.connectorToken)), enabled: true }
  const codes = new Map()
  const access = new Map()
  const refresh = new Map()
  const pending = new Map()
  const listens = []
  const stats = { reuse: 0, refreshGrants: 0, codeGrants: 0, verifiers: [] }
  const script = {}

  const web = http.createServer((req, res) => handle(req, res, 'web').catch(() => res.destroy()))
  const approval = http.createServer((req, res) => handle(req, res, 'approval').catch(() => res.destroy()))
  const webSockets = trackSockets(web)
  const approvalSockets = trackSockets(approval)
  const webPort = await listenOn(web)
  const approvalPort = await listenOn(approval)
  const origin = `http://${FIXTURE.loopback}:${webPort}`
  const approvalOrigin = `http://${FIXTURE.loopback}:${approvalPort}`
  const urls = K1.oauthUrls(origin)

  const issuerOf = () => urls.issuer
  const prmFor = (resourcePath) => {
    const m = script.metadata ?? {}
    const doc = {
      ...K1.protectedResourceMetadata(origin),
      resource: m.resource ?? origin + resourcePath,
      authorization_servers: m.authorizationServers ?? [urls.issuer],
      scopes_supported: m.scopes === undefined ? [K1.SCOPE.full] : m.scopes,
    }
    if (doc.scopes_supported === null) delete doc.scopes_supported
    return doc
  }

  function tokenEndpoint(req, res, body) {
    if (script.tokenStall) return undefined
    if (script.tokenDrop > 0) {
      script.tokenDrop -= 1
      return req.socket.destroy()
    }
    if (script.tokenRedirect !== undefined) {
      res.writeHead(WEB.temporaryRedirect, { [WEB.location]: script.tokenRedirect })
      return res.end()
    }
    const form = new URLSearchParams(body.toString('utf8'))
    const grant = form.get(OAUTH.grantType)
    const fail = (error, status = K1.OAUTH_ERROR_STATUS[error] ?? WEB.badRequest) => sendJson(res, status, K1.oauthErrorBody(error), K1.TOKEN_RESPONSE_HEADERS)
    if (script.tokenError?.grant === grant) {
      const { error, status, times = 1 } = script.tokenError
      script.tokenError = times > 1 ? { ...script.tokenError, times: times - 1 } : undefined
      return fail(error, status)
    }
    if (form.has(OAUTH.clientSecret) || req.headers.authorization) return fail(K1.OAUTH_ERROR.invalidClient)
    if (form.get(OAUTH.resource) !== urls.resource) return fail(K1.OAUTH_ERROR.invalidTarget)
    const issue = (chain) => {
      const at = remember(plant(MARK.access))
      access.set(at, { chain, agentId: chain.agentId })
      const rt = issueRefresh ? remember(plant(MARK.refresh)) : undefined
      if (rt) refresh.set(rt, { chain, used: false })
      const body = K1.tokenResponse({ accessToken: at, scope: K1.SCOPE.full, refreshToken: rt })
      return script.expiresInS === undefined ? body : { ...body, expires_in: script.expiresInS }
    }
    if (grant === K1.GRANT.authorizationCode) {
      stats.codeGrants += 1
      const code = codes.get(form.get(OAUTH.code))
      const verifier = form.get(OAUTH.codeVerifier) ?? ''
      remember(verifier)
      stats.verifiers.push(verifier)
      if (!code || code.used || code.clientId !== form.get(OAUTH.clientId) || code.redirectUri !== form.get(OAUTH.redirectUri) || s256(verifier) !== code.challenge) {
        return fail(K1.OAUTH_ERROR.invalidGrant)
      }
      code.used = true
      return sendJson(res, WEB.ok, issue({ agentId: code.agentId, clientId: code.clientId, live: true }), K1.TOKEN_RESPONSE_HEADERS)
    }
    if (grant === K1.GRANT.refreshToken) {
      stats.refreshGrants += 1
      const held = refresh.get(form.get(OAUTH.refreshToken))
      if (!held || !held.chain.live || !entry.enabled || held.chain.clientId !== form.get(OAUTH.clientId)) return fail(K1.OAUTH_ERROR.invalidGrant)
      if (held.used) {
        // R-OA-16 (2): reuse revokes the whole chain.
        stats.reuse += 1
        held.chain.live = false
        for (const [t, a] of access) if (a.chain === held.chain) access.delete(t)
        return fail(K1.OAUTH_ERROR.invalidGrant)
      }
      held.used = true
      return sendJson(res, WEB.ok, issue(held.chain), K1.TOKEN_RESPONSE_HEADERS)
    }
    return fail(K1.OAUTH_ERROR.unsupportedGrantType)
  }

  async function mcpEndpoint(req, res, body, record) {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith(WEB.bearer) ? auth.slice(WEB.bearer.length) : undefined
    const held = token === undefined ? undefined : access.get(token)
    const forced = script.beforeMcp === undefined ? false : await script.beforeMcp(record)
    if (forced || script.rejectAllAccess || held === undefined || !held.chain.live || !entry.enabled) {
      return sendJson(res, WEB.unauthorized, {}, { [WEB.wwwAuthenticate]: token ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    }
    if (script.mcpReply !== undefined && await script.mcpReply(record, res)) return undefined
    let message
    try { message = JSON.parse(body.toString('utf8')) } catch { return sendJson(res, WEB.badRequest, rpcError(null, RPC.parseError, 'parse error')) }
    if (message.id === undefined) { res.writeHead(WEB.accepted); return res.end() }
    switch (message.method) {
      case RPC.discover:
        return sendJson(res, WEB.ok, rpcResult(message.id, { supportedVersions: [K1.PROTOCOL.version], capabilities: { tools: {} } }))
      case RPC.toolsList:
        return sendJson(res, WEB.ok, rpcResult(message.id, { ...RPC.cacheable, tools: toolList }))
      case RPC.toolsCall:
        return sendJson(res, WEB.ok, rpcResult(message.id, { content: [{ type: 'text', text: toolText(held.agentId) }] }))
      case RPC.listen: {
        const filter = message.params?.notifications ?? {}
        res.writeHead(WEB.ok, { 'content-type': WEB.sse, ...K1.TOKEN_RESPONSE_HEADERS })
        res.write(sseFrame({ jsonrpc: RPC.jsonrpc, method: RPC.acknowledged, params: { notifications: filter, _meta: { [RPC.subscriptionIdKey]: message.id } } }))
        listens.push({ res, id: message.id })
        res.on('close', () => { const i = listens.findIndex((l) => l.res === res); if (i >= 0) listens.splice(i, 1) })
        return undefined
      }
      default:
        return sendJson(res, WEB.ok, rpcError(message.id, RPC.methodNotFound, 'method not found'))
    }
  }

  function authorizePage(res, url) {
    const p = url.searchParams
    const id = randomBytes(MARK.randomBytes).toString('base64url')
    pending.set(id, Object.fromEntries(p))
    res.writeHead(WEB.ok, { 'content-type': WEB.html, ...K1.APPROVAL_LISTENER.headers })
    res.end(`<form method="post" action="${K1.PATHS.decision}"><input type="hidden" name="${OAUTH.form.request}" value="${id}"></form>`)
  }

  function decision(res, body) {
    const form = new URLSearchParams(body.toString('utf8'))
    const request = pending.get(form.get(OAUTH.form.request))
    if (!request) { res.writeHead(WEB.ok, { 'content-type': WEB.html }); return res.end('this request has expired') }
    const back = new URL(request[OAUTH.redirectUri])
    const reply = { [OAUTH.iss]: issuerOf() }
    if (request[OAUTH.state] !== undefined) reply[OAUTH.state] = request[OAUTH.state]
    if (form.get(OAUTH.form.decision) === OAUTH.decision.cancel) {
      reply[OAUTH.error] = K1.OAUTH_ERROR.accessDenied
    } else {
      if (form.get(OAUTH.form.token) !== entry.token || !entry.enabled) { res.writeHead(WEB.ok, { 'content-type': WEB.html }); return res.end('this token is not valid') }
      const code = remember(plant(MARK.code))
      codes.set(code, {
        clientId: request[OAUTH.clientId], redirectUri: request[OAUTH.redirectUri], challenge: request[OAUTH.codeChallenge],
        agentId: form.get(OAUTH.form.agentId), used: false,
      })
      reply[OAUTH.code] = code
    }
    pending.delete(form.get(OAUTH.form.request))
    for (const [k, v] of Object.entries(reply)) back.searchParams.set(k, v)
    res.writeHead(WEB.seeOther, { [WEB.location]: back.href })
    return res.end()
  }

  async function handle(req, res, listener) {
    const body = await readBody(req)
    const url = new URL(req.url, `http://${req.headers.host}`)
    const record = { listener, method: req.method, path: url.pathname, query: url.search, headers: { ...req.headers }, body: body.toString('utf8'), bodyBytes: body.length, at: Date.now() }
    requests.push(record)
    if (listener === 'approval') {
      if (req.method === WEB.get && url.pathname === K1.PATHS.authorize) return authorizePage(res, url)
      if (req.method === WEB.post && url.pathname === K1.PATHS.decision) return decision(res, body)
      return sendJson(res, WEB.notFound, {})
    }
    if (req.method === WEB.get && url.pathname.startsWith(K1.PATHS.protectedResourcePrefix)) {
      if (script.prmDelayMs !== undefined) {
        if (script.prmDelayMs === Infinity) return undefined
        await sleep(script.prmDelayMs)
      }
      if (script.prm === 'status') return sendJson(res, WEB.serverError, {})
      if (script.prm === 'missing') return sendJson(res, WEB.notFound, {})
      if (script.prm === 'not-json') { res.writeHead(WEB.ok, { 'content-type': WEB.html }); return res.end('<html>not json</html>') }
      return sendJson(res, WEB.ok, prmFor(url.pathname.slice(K1.PATHS.protectedResourcePrefix.length)))
    }
    if (req.method === WEB.get && url.pathname.startsWith(K1.PATHS.authorizationServerPrefix)) {
      if (script.asMetadata === 'status') return sendJson(res, WEB.serverError, {})
      // Any issuer path is served with its own issuer, so DT-11 rule 4 reads valid metadata and fails only the check.
      const issuer = origin + url.pathname.slice(K1.PATHS.authorizationServerPrefix.length)
      const meta = { ...K1.authorizationServerMetadata(origin, approvalOrigin), issuer, ...(script.asOverride ?? {}) }
      for (const [k, v] of Object.entries(meta)) if (v === undefined) delete meta[k]
      return sendJson(res, WEB.ok, meta)
    }
    if (req.method === WEB.post && url.pathname === K1.PATHS.token) return tokenEndpoint(req, res, body)
    if (url.pathname === K1.PATHS.mcp || url.pathname === FIXTURE.wrong.mcpPath) {
      if (req.method === WEB.post) return mcpEndpoint(req, res, body, record)
      res.writeHead(WEB.methodNotAllowed, { allow: WEB.post })
      return res.end()
    }
    return sendJson(res, WEB.notFound, {})
  }

  const c = {
    origin, approvalOrigin, urls, requests, planted, stats, script, entry, listens,
    /** The configured server URL of the fake (U). */
    get url() { return urls.resource },
    tokenRequests: () => requests.filter((r) => r.path === K1.PATHS.token),
    refreshRequests: () => c.tokenRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.grantType) === K1.GRANT.refreshToken),
    codeRequests: () => c.tokenRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.grantType) === K1.GRANT.authorizationCode),
    mcpRequests: () => requests.filter((r) => r.listener === 'web' && (r.path === K1.PATHS.mcp || r.path === FIXTURE.wrong.mcpPath)),
    discoveryRequests: () => requests.filter((r) => r.path.startsWith('/.well-known/')),
    approvalRequests: () => requests.filter((r) => r.listener === 'approval'),
    /** Approval pages opened (one per browser step: the GET of `/authorize`). */
    approvalPages: () => requests.filter((r) => r.listener === 'approval' && r.path === K1.PATHS.authorize),
    /** Requests a DT-11 / UC-13 refusal forbids: authorization, registration, token. */
    forbiddenRequests: () => requests.filter((r) => r.listener === 'approval' || r.path === K1.PATHS.token || r.path.includes(OAUTH.registrationPath)),
    /** The access tokens the fake holds now. */
    liveAccessTokens: () => [...access.keys()],
    /** R-OA-05 TQ-5 / R-OA-16 (5): a connector restart: access tokens and pending requests go, refresh tokens stay. */
    restart() {
      access.clear()
      pending.clear()
      for (const l of listens.splice(0)) l.res.destroy()
    },
    /** R-OA-21 A3: the connector drops every access token early. */
    dropAccess() { access.clear() },
    /** R-OA-06 / R-OA-16 (3): the owner disables the entry; its refresh tokens die with it. */
    disableEntry() {
      entry.enabled = false
      for (const r of refresh.values()) r.chain.live = false
      access.clear()
    },
    /** A `resources/updated` notification on every open listen stream. */
    emitEvent() {
      for (const l of listens) l.res.write(sseFrame({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: K1.RESOURCE.events.uri, _meta: { [RPC.subscriptionIdKey]: l.id } } }))
    },
    stop: async () => { await closeServer(web, webSockets); await closeServer(approval, approvalSockets) },
  }
  return c
}

/**
 * The non-DSH OAuth-protected MCP server (AUTH-UC-14 precondition): its PRM names
 * `https://other.example/oauth` with `scopes_supported: ["read"]`. Unknown metadata paths are served
 * with their own issuer, so a DT-11 rule that points one of the connector's documents here still
 * reads valid metadata. Reached only through `recordingFetch`.
 */
export function otherServer() {
  const o = FIXTURE.other
  const requests = []
  const json = (body, status = WEB.ok) => new Response(JSON.stringify(body), { status, headers: { 'content-type': WEB.json } })
  return {
    origin: o.origin,
    requests,
    forbiddenRequests: () => requests.filter((r) => [o.authorizePath, o.tokenPath, o.registerPath].includes(r.path)),
    async handle(url, init) {
      const u = new URL(url)
      requests.push({ method: init?.method ?? WEB.get, path: u.pathname, headers: Object.fromEntries(new Headers(init?.headers ?? {})) })
      if (u.pathname.startsWith(K1.PATHS.protectedResourcePrefix)) {
        return json({ resource: o.origin + u.pathname.slice(K1.PATHS.protectedResourcePrefix.length), authorization_servers: [o.origin + o.issuerPath], scopes_supported: [...o.scopes] })
      }
      if (u.pathname.startsWith(K1.PATHS.authorizationServerPrefix)) {
        const issuer = o.origin + u.pathname.slice(K1.PATHS.authorizationServerPrefix.length)
        return json({
          issuer, authorization_endpoint: o.origin + o.authorizePath, token_endpoint: o.origin + o.tokenPath, registration_endpoint: o.origin + o.registerPath,
          response_types_supported: [K1.RESPONSE_TYPE.code], code_challenge_methods_supported: [K1.PKCE.method], scopes_supported: [...o.scopes],
        })
      }
      return json({}, WEB.unauthorized)
    },
  }
}

/** Header names of a fetch init or Request, lower-cased, as a plain object. */
const headersOf = (input, init) => Object.fromEntries(new Headers(init?.headers ?? (input instanceof Request ? input.headers : {})))
const urlOf = (input) => (input instanceof Request ? input.url : String(input))

/**
 * The fetch injected into the product: loopback only, plus `other`. Every call is recorded (URL,
 * method, headers, and a string or URLSearchParams body).
 */
export function recordingFetch(other) {
  const calls = []
  const fetchFn = async (input, init) => {
    const url = urlOf(input)
    const body = typeof init?.body === 'string' || init?.body instanceof URLSearchParams ? String(init.body) : undefined
    calls.push({ url, method: init?.method ?? (input instanceof Request ? input.method : WEB.get), headers: headersOf(input, init), body })
    const host = new URL(url).hostname
    if (host === FIXTURE.loopback) return globalThis.fetch(input, init)
    if (other !== undefined && new URL(url).origin === other.origin) return other.handle(url, init)
    throw new TypeError('fetch failed (fbtest: no network outside 127.0.0.1): ' + url)
  }
  return { fetch: fetchFn, calls }
}

/**
 * A fake clock with Node-shaped timers. `advance(ms)` fires every due timer in order, letting each
 * callback's async work settle (real time, WAIT.settleMs) before the next one.
 */
export function fakeClock(start = FIXTURE.t0) {
  let now = start
  let seq = 0
  let fired = 0
  const queue = new Map()
  const handle = (id) => ({ id, unref() { return this }, ref() { return this }, hasRef: () => true, [Symbol.toPrimitive]: () => id })
  const timers = {
    setTimeout(fn, delay = 0, ...args) {
      const id = ++seq
      queue.set(id, { at: now + Math.max(0, Number(delay) || 0), fn: () => fn(...args), seq: id })
      return handle(id)
    },
    clearTimeout(h) { queue.delete(typeof h === 'object' && h !== null ? h.id : h) },
  }
  return {
    timers,
    now: () => now,
    pending: () => [...queue.values()].map((t) => t.at - now).sort((a, b) => a - b),
    /** Timer callbacks run so far (S1: no tight timer loop). */
    fired: () => fired,
    async advance(ms) {
      const target = now + ms
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= target).sort(([, a], [, b]) => a.at - b.at || a.seq - b.seq)[0]
        if (!due) break
        queue.delete(due[0])
        now = due[1].at
        fired += 1
        if (fired > WAIT.maxTimerFires) throw new Error('fbtest clock: more than ' + WAIT.maxTimerFires + ' timer callbacks (a spin)')
        due[1].fn()
        await sleep(WAIT.settleMs)
      }
      now = target
      await sleep(WAIT.settleMs)
    },
    /** Moves to an absolute time (never backwards). */
    async to(at) { if (at > now) await this.advance(at - now) },
  }
}

/** Whether something accepts TCP connections on 127.0.0.1:`port` now. */
export const portAccepts = (port) => new Promise((resolve) => {
  const s = net.connect({ host: FIXTURE.loopback, port })
  s.once('connect', () => { s.destroy(); resolve(true) })
  s.once('error', () => resolve(false))
})

/**
 * The owner's scripted browser (brief "approval browser"). It opens `url`, posts the page's form
 * (connector token, id, no name, Authorize or Cancel), reads the 303 and follows it with fetch after
 * `mutate(location)` (to forge a wrong `state` or `iss`, or an error). It returns `{location, status}`
 * or `{location, refused: true}` when nothing accepts the callback.
 */
export const browser = Object.freeze({
  async approve(c, url, { decision = OAUTH.decision.authorize, token = c.entry.token, agentId = FIXTURE.agentId, mutate } = {}) {
    const page = await (await globalThis.fetch(url)).text()
    const request = new RegExp(`name="${OAUTH.form.request}" value="([^"]+)"`).exec(page)?.[1]
    if (request === undefined) throw new Error('fbtest browser: the approval page has no request id: ' + page.slice(0, 200))
    const form = new URLSearchParams({ [OAUTH.form.request]: request, [OAUTH.form.token]: token, [OAUTH.form.agentId]: agentId, [OAUTH.form.name]: '', [OAUTH.form.decision]: decision })
    const posted = await globalThis.fetch(new URL(K1.PATHS.decision, url), { method: WEB.post, body: form, headers: { 'content-type': WEB.form }, redirect: 'manual' })
    if (posted.status !== WEB.seeOther) throw new Error('fbtest browser: the decision answered ' + posted.status + ': ' + (await posted.text()).slice(0, 200))
    const location = new URL(posted.headers.get(WEB.location))
    if (mutate) mutate(location)
    return browser.follow(location)
  },
  /** Follow (or replay) a redirect to a loopback callback. */
  async follow(location) {
    try {
      const r = await globalThis.fetch(location, { redirect: 'manual' })
      await r.arrayBuffer().catch(() => {})
      return { location: location.href, status: r.status }
    } catch {
      return { location: location.href, refused: true }
    }
  },
})

/** Polls `predicate` (real time) until truthy or WAIT.eventuallyMs pass; returns its last value. */
export async function eventually(predicate, ms = WAIT.eventuallyMs) {
  const end = Date.now() + ms
  for (;;) {
    const v = await predicate()
    if (v || Date.now() >= end) return v
    await sleep(WAIT.pollMs)
  }
}
/** Watches `predicate` for WAIT.quietMs and returns whether it stayed falsy. */
export async function staysFalse(predicate, ms = WAIT.quietMs) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await predicate()) return false
    await sleep(WAIT.pollMs)
  }
  return !(await predicate())
}
export { sleep }
