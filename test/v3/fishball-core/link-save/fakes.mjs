/**
 * A faithful fake DSH connector for the F-LINK-SAVE cases. It speaks only what the requirements and
 * the frozen contracts define, from K1's own builders (`dsh-connector/mcp-schema`):
 *
 * - web listener (dual-stack, so `127.0.0.1` and `localhost` are two origins of one fake):
 *   RFC 9728 / RFC 8414 metadata (with the overrides the not-a-connector rows need), the token
 *   endpoint and the MCP 2026-07-28 endpoint;
 * - token endpoint: `client_credentials` with `client_secret_basic` or `_post` (the hosted import's
 *   path), `authorization_code` with PKCE S256 and no client secret, and `refresh_token` with
 *   rotation and reuse detection (Connect's path). A client-credentials token's scope is `agent`
 *   when its entry is bound to the caller's id, else `agent:pair` (R-OA-04, R-ID-03);
 * - approval listener (its own port, R-OA-20): `/authorize` renders a form and its decision posts
 *   back. Approving binds the typed token's entry to the request's `agent_id` (R-OA-22) with the
 *   typed name, as the connector's approval page does, then redirects to `redirect_uri` with
 *   `code`, `state` and `iss`; Cancel redirects with `error=access_denied`;
 * - MCP endpoint: `server/discover`, `tools/list`, `tools/call` (`pair`, `set_name`, `inbox_poll`,
 *   `inbox_ack`) and a long-lived `subscriptions/listen`; a pair-only token reaches K1 PAIR_ONLY only.
 *
 * Pairing runs on F-PAIR's `FakePairs` (K1's PairStore rules), reused, not copied, with one addition:
 * a retired entry's pair is gone (the owner deleted the entry, or the instance's succession retired
 * it, design §5.4), so its id is free for another entry. Every request is
 * recorded with its Host, so a case can prove which origin a credential went to; every secret the
 * fake issues or sees is kept in `planted` for the leak sweep.
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { FakePairs } from '../identity/fake-connector.mjs'
import { token as generatedToken } from '../identity/constants.mjs'
import { FIXTURE, K1, MCP, OAUTH, REDIRECT, RPC, WEB } from './constants.mjs'

/** F-PAIR's FakePairs, where a retired entry no longer holds a pair (its id and name are free). */
class RetirablePairs extends FakePairs {
  #retired = new Set()
  retire(entryKey) { this.#retired.add(entryKey) }
  list() { return super.list().filter((p) => !this.#retired.has(p.entryKey)) }
  pairOf(entryKey) { return this.#retired.has(entryKey) ? undefined : super.pairOf(entryKey) }
  byPrincipal(principalKey) { return this.list().find((p) => p.principalKey === principalKey) }
}

const s256 = (verifier) => createHash('sha256').update(verifier).digest('base64url')
const opaque = () => randomBytes(K1.TOKEN_VALUE.opaqueBytes).toString('base64url')
const sseFrame = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
const rpcResult = (id, result) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...result } })
const rpcError = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })

const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')))
})
const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': WEB.json, ...headers })
  res.end(JSON.stringify(body))
}
const pick = (object, keys) => Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]))

/** `{clientId, secret}` of a token request (Basic header first, else the form). */
export function clientOf(headers, form) {
  const basic = headers.authorization ?? ''
  if (basic.startsWith(WEB.basic)) {
    const [id, ...rest] = Buffer.from(basic.slice(WEB.basic.length), 'base64').toString('utf8').split(':')
    return { clientId: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) }
  }
  return { clientId: form.get(OAUTH.clientId), secret: form.get(OAUTH.clientSecret) }
}

function serve(handler, port, host) {
  const server = http.createServer((req, res) => { handler(req, res).catch(() => { try { res.destroy() } catch { /* gone */ } }) })
  const sockets = new Set()
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  const listen = () => new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.off('error', reject); port = server.address().port; resolve(port) })
  })
  const close = () => new Promise((resolve) => {
    for (const s of sockets) s.destroy()
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })
  return { listen, close, get port() { return port } }
}

/**
 * Starts the fake connector. `script` (mutable, on the returned object) holds the misbehaviours the
 * cases set:
 * - `metadata`: `{resource?, authorizationServers?, scopes?}` (`scopes: null` drops the field);
 * - `codeError`: an OAuth error the next `authorization_code` request answers, once;
 * - `refreshError`: an OAuth error every `refresh_token` request answers while set;
 * - `redirect`: `{step, status}` (X-11): every request of that OAuth step (REDIRECT.step) is answered
 *   with `status` and a `Location` on the fake's trap listener, another origin that records every
 *   request it gets (`trapRequests()`), so a followed redirect is seen there;
 * - `authorizationServer`: `(origin, approvalOrigin) => overrides` (X-12, X-13): fields replacing
 *   the RFC 8414 document's own; an `undefined` value drops the field.
 */
export async function startFakeConnector() {
  const pairs = new RetirablePairs()
  const requests = []
  const calls = []
  const listens = []
  const planted = new Set()
  const remember = (v) => { if (typeof v === 'string' && v.length > 0) planted.add(v); return v }
  const registry = new Map()
  const access = new Map()
  const refresh = new Map()
  const codes = new Map()
  const pending = new Map()
  const script = {}
  const refreshIssued = []
  let entrySeq = 0

  const originOfHost = (host) => `${K1.HOSTS.loopbackScheme}//${host}`
  const entryBySecret = (secret) => [...registry.values()].find((e) => e.secret === secret)
  const liveScope = (entryKey, agentId) => (pairs.pairOf(entryKey)?.id === agentId ? K1.SCOPE.full : K1.SCOPE.pair)
  const issueAccess = (grant) => {
    const at = remember(generatedToken())
    access.set(at, grant)
    return at
  }

  function tokenEndpoint(req, res, body) {
    const form = new URLSearchParams(body)
    const grant = form.get(OAUTH.grantType)
    const origin = originOfHost(req.headers.host)
    const fail = (error) => sendJson(res, K1.OAUTH_ERROR_STATUS[error], K1.oauthErrorBody(error), { ...K1.TOKEN_RESPONSE_HEADERS, ...(error === K1.OAUTH_ERROR.invalidClient ? { [WEB.wwwAuthenticate]: K1.BEARER_CHALLENGE.basicScheme } : {}) })
    const ok = (body) => sendJson(res, K1.HTTP_STATUS.ok, body, K1.TOKEN_RESPONSE_HEADERS)
    if (grant === K1.GRANT.clientCredentials) {
      const { clientId, secret } = clientOf(req.headers, form)
      remember(secret)
      const entry = entryBySecret(secret)
      if (entry === undefined || !entry.enabled || !K1.isAgentId(clientId)) return fail(K1.OAUTH_ERROR.invalidClient)
      const at = issueAccess({ entryKey: entry.entryKey, agentId: clientId, via: grant, origin })
      return ok(K1.tokenResponse({ accessToken: at, scope: liveScope(entry.entryKey, clientId) }))
    }
    // The public-client grants: no client secret of any kind (R-OA-14).
    if (form.has(OAUTH.clientSecret) || req.headers.authorization) return fail(K1.OAUTH_ERROR.invalidClient)
    if (form.get(OAUTH.resource) !== origin + MCP.paths.mcp) return fail(K1.OAUTH_ERROR.invalidTarget)
    const issuePair = (chain) => {
      const at = issueAccess({ entryKey: chain.entryKey, agentId: chain.agentId, via: grant, origin, chain })
      const rt = remember(opaque())
      refresh.set(rt, { chain, used: false })
      refreshIssued.push(rt)
      return K1.tokenResponse({ accessToken: at, scope: K1.SCOPE.full, refreshToken: rt })
    }
    if (grant === K1.GRANT.authorizationCode) {
      if (script.codeError !== undefined) { const error = script.codeError; script.codeError = undefined; return fail(error) }
      const code = codes.get(form.get(OAUTH.code))
      const verifier = remember(form.get(OAUTH.codeVerifier) ?? '')
      if (!code || code.used || code.clientId !== form.get(OAUTH.clientId) || code.redirectUri !== form.get(OAUTH.redirectUri) || s256(verifier ?? '') !== code.challenge) {
        return fail(K1.OAUTH_ERROR.invalidGrant)
      }
      code.used = true
      return ok(issuePair({ entryKey: code.entryKey, agentId: code.agentId, clientId: code.clientId, live: true }))
    }
    if (grant === K1.GRANT.refreshToken) {
      if (script.refreshError !== undefined) return fail(script.refreshError)
      const held = refresh.get(form.get(OAUTH.refreshToken))
      if (!held || !held.chain.live || !registry.get(held.chain.entryKey)?.enabled || held.chain.clientId !== form.get(OAUTH.clientId)) return fail(K1.OAUTH_ERROR.invalidGrant)
      if (held.used) {
        // R-OA-16: a reused refresh token revokes the whole chain.
        held.chain.live = false
        return fail(K1.OAUTH_ERROR.invalidGrant)
      }
      held.used = true
      return ok(issuePair(held.chain))
    }
    return fail(K1.OAUTH_ERROR.unsupportedGrantType)
  }

  async function toolResult(caller, name, args) {
    const call = { name, args, agentId: caller.agentId, entryKey: caller.entryKey, via: caller.via, result: undefined }
    calls.push(call)
    if (name === K1.TOOL.pair) {
      const result = await pairs.pair(caller.entryKey, caller.agentId, args?.name, Date.now())
      call.result = result
      if (result.ok) return K1.okResult({ paired: result.paired, id: result.id, name: result.name, ...pick(result, ['nameAssigned', 'nameRefused']) })
      return K1.refusalResult(result.code, pick(result, ['bound', 'advice']))
    }
    if (name === K1.TOOL.setName) {
      const result = await pairs.setName(pairs.pairOf(caller.entryKey).principalKey, args?.name ?? null)
      call.result = result
      return result.ok ? K1.okResult({ name: result.name }) : K1.refusalResult(result.code)
    }
    if (name === K1.TOOL.inboxPoll) return K1.okResult({ events: [], nextCursor: FIXTURE.cursor, hasMore: false })
    if (name === K1.TOOL.inboxAck) return K1.okResult({ acked: args?.receipts?.length ?? 0 })
    return K1.okResult({})
  }

  async function mcpEndpoint(req, res, body) {
    const origin = originOfHost(req.headers.host)
    const auth = req.headers.authorization ?? ''
    const caller = auth.startsWith(WEB.bearer) ? access.get(auth.slice(WEB.bearer.length)) : undefined
    const dead = caller === undefined || !registry.get(caller.entryKey)?.enabled || caller.chain?.live === false || caller.origin !== origin
    if (dead) return sendJson(res, K1.HTTP_STATUS.unauthorized, {}, { [WEB.wwwAuthenticate]: auth ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    let message
    try { message = JSON.parse(body) } catch { return sendJson(res, K1.HTTP_STATUS.badRequest, rpcError(null, RPC.parseError, 'parse error')) }
    if (message.id === undefined) { res.writeHead(WEB.accepted); return res.end() }
    const full = liveScope(caller.entryKey, caller.agentId) === K1.SCOPE.full
    const toolName = message.params?.name
    const pairOnlyReach = K1.PAIR_ONLY.methods.includes(message.method) || (message.method === RPC.toolsCall && K1.PAIR_ONLY.tools.includes(toolName))
    if (!full && !pairOnlyReach) {
      const reason = pairs.pairOf(caller.entryKey) === undefined ? K1.INSUFFICIENT_SCOPE_REASON.notPaired : K1.INSUFFICIENT_SCOPE_REASON.idMismatch
      return sendJson(res, K1.HTTP_STATUS.forbidden, {}, { [WEB.wwwAuthenticate]: K1.insufficientScopeChallenge(origin, reason) })
    }
    switch (message.method) {
      case RPC.discover:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          supportedVersions: [K1.PROTOCOL.version],
          capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: false } },
        }))
      case RPC.toolsList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...RPC.cacheable, tools: full ? K1.TOOLS : K1.TOOLS.filter((t) => K1.PAIR_ONLY.tools.includes(t.name)) }))
      case RPC.toolsCall:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...await toolResult(caller, toolName, message.params?.arguments) }))
      case RPC.resourcesRead:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          ...RPC.cacheable,
          contents: [{ uri: K1.RESOURCE.events.uri, mimeType: K1.RESOURCE.events.mimeType, text: JSON.stringify({ pending: 0, headSequence: 0, mailboxGeneration: FIXTURE.generation }) }],
        }))
      case RPC.resourcesList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...RPC.cacheable, resources: [K1.RESOURCE.events] }))
      case RPC.listen: {
        const filter = message.params?.notifications ?? {}
        listens.push({ filter, entryKey: caller.entryKey, via: caller.via, res })
        res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': WEB.sse, ...K1.TOKEN_RESPONSE_HEADERS })
        res.write(sseFrame({ jsonrpc: RPC.jsonrpc, method: RPC.acknowledged, params: { notifications: filter, _meta: { [RPC.subscriptionIdKey]: message.id } } }))
        return undefined
      }
      default:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcError(message.id, RPC.methodNotFound, 'method not found'))
    }
  }

  function prmFor(origin) {
    const m = script.metadata ?? {}
    const doc = {
      ...K1.protectedResourceMetadata(origin),
      ...(m.resource === undefined ? {} : { resource: m.resource(origin) }),
      ...(m.authorizationServers === undefined ? {} : { authorization_servers: m.authorizationServers(origin) }),
      ...(m.scopes === undefined ? {} : { scopes_supported: m.scopes }),
    }
    if (doc.scopes_supported === null) delete doc.scopes_supported
    return doc
  }

  function asmFor(origin, issuer) {
    const doc = { ...K1.authorizationServerMetadata(origin, approvalOrigin()), issuer, ...(script.authorizationServer?.(origin, approvalOrigin()) ?? {}) }
    for (const [k, v] of Object.entries(doc)) if (v === undefined) delete doc[k]
    return doc
  }

  /** The OAuth step one web request is (REDIRECT.step), or undefined. */
  function stepOf(req, url, body) {
    if (req.method === WEB.get && url.pathname.startsWith(MCP.paths.protectedResourcePrefix)) return REDIRECT.step.protectedResource
    if (req.method === WEB.get && url.pathname.startsWith(MCP.paths.authorizationServerPrefix)) return REDIRECT.step.authorizationServer
    if (req.method === WEB.post && url.pathname === MCP.paths.token) {
      const grant = new URLSearchParams(body).get(OAUTH.grantType)
      if (grant === K1.GRANT.authorizationCode) return REDIRECT.step.codeExchange
      if (grant === K1.GRANT.refreshToken) return REDIRECT.step.refresh
    }
    return undefined
  }

  async function webHandler(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, originOfHost(req.headers.host))
    requests.push({ listener: 'web', at: Date.now(), host: req.headers.host, method: req.method, path: url.pathname, query: url.search, headers: { ...req.headers }, body })
    const origin = originOfHost(req.headers.host)
    if (script.redirect !== undefined && stepOf(req, url, body) === script.redirect.step) {
      res.writeHead(script.redirect.status, { [WEB.location]: trapUrl() })
      return res.end()
    }
    if (req.method === WEB.get && url.pathname.startsWith(MCP.paths.protectedResourcePrefix)) return sendJson(res, K1.HTTP_STATUS.ok, prmFor(origin))
    if (req.method === WEB.get && url.pathname.startsWith(MCP.paths.authorizationServerPrefix)) {
      // Any issuer path is served with its own issuer, so a not-a-connector row fails the check, not the read.
      return sendJson(res, K1.HTTP_STATUS.ok, asmFor(origin, origin + url.pathname.slice(MCP.paths.authorizationServerPrefix.length)))
    }
    if (req.method === WEB.post && url.pathname === MCP.paths.token) return tokenEndpoint(req, res, body)
    if (url.pathname === MCP.paths.mcp && req.method === WEB.post) return mcpEndpoint(req, res, body)
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }

  function authorizePage(res, url) {
    const id = opaque()
    pending.set(id, Object.fromEntries(url.searchParams))
    res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': WEB.html, ...K1.APPROVAL_LISTENER.headers })
    res.end(`<form method="post" action="${K1.PATHS.decision}"><input type="hidden" name="${OAUTH.form.request}" value="${id}"></form>`)
  }

  async function decision(res, body) {
    const form = new URLSearchParams(body)
    const request = pending.get(form.get(OAUTH.form.request))
    if (!request) { res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': WEB.html }); return res.end('this request has expired') }
    const origin = new URL(request[OAUTH.resource]).origin
    const back = new URL(request[OAUTH.redirectUri])
    const reply = { [OAUTH.iss]: origin + MCP.paths.issuer }
    if (request[OAUTH.state] !== undefined) reply[OAUTH.state] = request[OAUTH.state]
    if (form.get(OAUTH.form.decision) === OAUTH.decision.cancel) {
      reply[OAUTH.error] = K1.OAUTH_ERROR.accessDenied
    } else {
      const entry = entryBySecret(form.get(OAUTH.form.token))
      const agentId = request[MCP.oauth.agentIdParameter]
      if (entry === undefined || !entry.enabled || !K1.isAgentId(agentId ?? '')) { res.writeHead(K1.HTTP_STATUS.badRequest, { 'content-type': WEB.html }); return res.end('this token or id is not valid') }
      // The approval page binds the entry to the agent id before any code exists (R-OA-22).
      const name = form.get(OAUTH.form.name)
      if (pairs.pairOf(entry.entryKey) === undefined) await pairs.pair(entry.entryKey, agentId, name === '' || name === null ? undefined : name, Date.now())
      const code = remember(opaque())
      codes.set(code, { clientId: request[OAUTH.clientId], redirectUri: request[OAUTH.redirectUri], challenge: request[OAUTH.codeChallenge], entryKey: entry.entryKey, agentId, used: false })
      reply[OAUTH.code] = code
    }
    pending.delete(form.get(OAUTH.form.request))
    for (const [k, v] of Object.entries(reply)) back.searchParams.set(k, v)
    res.writeHead(K1.APPROVAL_LISTENER.redirectStatus, { [WEB.location]: back.href })
    return res.end()
  }

  async function approvalHandler(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, `http://${req.headers.host}`)
    requests.push({ listener: 'approval', at: Date.now(), host: req.headers.host, method: req.method, path: url.pathname, query: url.search, headers: { ...req.headers }, body })
    if (req.method === WEB.get && url.pathname === K1.PATHS.authorize) return authorizePage(res, url)
    if (req.method === WEB.post && url.pathname === K1.PATHS.decision) return decision(res, body)
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }

  /** X-11: where a scripted redirect points. Any request here is a followed redirect. */
  async function trapHandler(req, res) {
    const body = await readBody(req)
    requests.push({ listener: 'trap', at: Date.now(), host: req.headers.host, method: req.method, path: new URL(req.url, `http://${req.headers.host}`).pathname, headers: { ...req.headers }, body })
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }

  const web = serve(webHandler, 0, FIXTURE.bindHost)
  const approval = serve(approvalHandler, 0, FIXTURE.approvalHost)
  const trap = serve(trapHandler, 0, FIXTURE.approvalHost)
  await web.listen()
  await approval.listen()
  await trap.listen()
  const approvalOrigin = () => `${K1.HOSTS.loopbackScheme}//${FIXTURE.approvalHost}:${approval.port}`
  const trapUrl = () => `${K1.HOSTS.loopbackScheme}//${FIXTURE.approvalHost}:${trap.port}${REDIRECT.trapPath}`

  const tokenRequests = () => requests.filter((r) => r.listener === 'web' && r.path === MCP.paths.token)
  const grantOf = (r) => new URLSearchParams(r.body).get(OAUTH.grantType)
  const c = {
    pairs, requests, calls, listens, planted, script,
    /** Every refresh token issued, oldest first (a rotation appends one). */
    refreshIssued,
    get port() { return web.port },
    /** The MCP URL under one loopback name (two names, two origins of this one fake). */
    url: (host = FIXTURE.host.first) => `${K1.HOSTS.loopbackScheme}//${host}:${web.port}${MCP.paths.mcp}`,
    /** A new token entry (as the connector's settings page creates one); its value is generated. */
    addEntry() {
      const entry = { entryKey: FIXTURE.entryPrefix + String(++entrySeq), secret: remember(generatedToken()), enabled: true }
      registry.set(entry.entryKey, entry)
      return { entryKey: entry.entryKey, secret: entry.secret }
    },
    /** A token value of the connector's shape that no entry holds (the target refuses it); planted for the sweep. */
    unknownToken: () => remember(generatedToken()),
    /** The owner switches an entry off or on; off kills its access tokens and listen streams at once. */
    setEnabled(entryKey, enabled) {
      registry.get(entryKey).enabled = enabled
      if (!enabled) for (const l of listens) if (l.entryKey === entryKey) l.res.destroy()
    },
    /** The entry is deleted (or retired by a succession): its tokens die and its pair is gone. */
    retireEntry(entryKey) {
      c.setEnabled(entryKey, false)
      pairs.retire(entryKey)
    },
    /** Every access token dies early (a connector restart), and every listen stream ends. */
    dropAccess() {
      access.clear()
      for (const l of listens.splice(0)) l.res.destroy()
    },
    tokenRequests,
    clientCredentialRequests: () => tokenRequests().filter((r) => grantOf(r) === K1.GRANT.clientCredentials),
    codeRequests: () => tokenRequests().filter((r) => grantOf(r) === K1.GRANT.authorizationCode),
    refreshRequests: () => tokenRequests().filter((r) => grantOf(r) === K1.GRANT.refreshToken),
    /** The secrets presented with client_credentials, in order, with the Host each went to. */
    presented: () => c.clientCredentialRequests().map((r) => ({ at: r.at, host: r.host, secret: clientOf(r.headers, new URLSearchParams(r.body)).secret, clientId: clientOf(r.headers, new URLSearchParams(r.body)).clientId })),
    approvalRequests: () => requests.filter((r) => r.listener === 'approval'),
    /** X-11: every request the trap got (a followed redirect), and every web request of one OAuth step. */
    trapRequests: () => requests.filter((r) => r.listener === 'trap'),
    stepRequests: (step) => requests.filter((r) => r.listener === 'web' && stepOf(r, new URL(r.path, originOfHost(r.host)), r.body) === step),
    /** The approval origin the fake's own metadata names (X-12 rows build endpoints beside it). */
    approvalOrigin: () => approvalOrigin(),
    callsOf: (name) => calls.filter((call) => call.name === name),
    eventListens: () => listens.filter((l) => (l.filter.resourceSubscriptions ?? []).includes(K1.CONNECTED.listenResource) && !l.res.destroyed),
    stop: async () => { await web.close(); await approval.close(); await trap.close() },
  }
  return c
}

/**
 * The owner's scripted browser on the fake approval page: open the URL, post the form (the typed
 * token, the typed name, Authorize or Cancel), read the 303 and follow it to core's callback after
 * `mutate(location)` (a forged `state` or `iss`). Returns `{location, status}` or `{refused: true}`.
 */
export const browser = Object.freeze({
  async approve(url, { token, name = '', decision = OAUTH.decision.authorize, mutate } = {}) {
    const page = await (await globalThis.fetch(url)).text()
    const request = new RegExp(`name="${OAUTH.form.request}" value="([^"]+)"`).exec(page)?.[1]
    if (request === undefined) throw new Error('fbtest browser: the approval page has no request id: ' + page.slice(0, 200))
    const form = new URLSearchParams({ [OAUTH.form.request]: request, [OAUTH.form.token]: token ?? '', [OAUTH.form.name]: name, [OAUTH.form.decision]: decision })
    const posted = await globalThis.fetch(new URL(K1.PATHS.decision, url), { method: WEB.post, body: form, headers: { 'content-type': WEB.form }, redirect: 'manual' })
    if (posted.status !== K1.APPROVAL_LISTENER.redirectStatus) throw new Error('fbtest browser: the decision answered ' + posted.status + ': ' + (await posted.text()).slice(0, 200))
    const location = new URL(posted.headers.get(WEB.location))
    if (mutate) mutate(location)
    try {
      const r = await globalThis.fetch(location, { redirect: 'manual' })
      await r.arrayBuffer().catch(() => {})
      return { location: location.href, status: r.status }
    } catch {
      return { location: location.href, refused: true }
    }
  },
})
