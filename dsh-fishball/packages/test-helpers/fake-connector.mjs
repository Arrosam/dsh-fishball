/**
 * Fake DSH connectors: loopback HTTP peers that speak the connector's published contract (K1,
 * ./connector-contract/mcp-schema) and nothing else, so a case can drive a real MCP/OAuth client
 * against them and read what it sent.
 *
 * One base, `FakeConnector`, holds the plumbing every variant shares: request recording, JSON and
 * SSE framing, JSON-RPC envelopes, RFC 9728 / 8414 metadata, the `client_credentials` token grant, the
 * MCP 2026-07-28 endpoint (`server/discover`, `tools/list`, `tools/call`, `resources/list`,
 * `resources/read`, `subscriptions/listen`) with K1's pair-only scope rule, `pair` / `set_name` on a
 * K1 PairStore, and a mailbox for `inbox_poll` / `inbox_ack`. The variants override only what differs:
 *
 * - `startFakeConnector({store?, entries, now?, extraTokenFields?})`: the pairing connector (F-PAIR):
 *   fixed token entries, a caller-supplied PairStore, `lastSeenAt` kept on every full-scope request,
 *   `drop()` / `restore()` on the same port.
 * - `startFakeDsh({name, identity?, tools?, onTool?, extraPaths?, generation?})`: one target DSH among
 *   several (MULTI): the advertised server name only at `_meta[serverInfo].name` (with decoys), the
 *   identity resource and its push, a scripted mailbox, revocation.
 * - `startConnectFake()`: the Connect-capable connector (F-LINK-SAVE): `authorization_code` with PKCE
 *   S256, `refresh_token` rotation with reuse detection, an approval listener (`/authorize`), a trap
 *   listener for redirects, scripted misbehaviours, and every secret kept in `planted` for leak sweeps.
 *   `approvalBrowser.approve(url, …)` is the owner's scripted browser on its approval page.
 * - `startFakeTarget()`: metadata only; the token endpoint refuses every client and the MCP endpoint
 *   answers the Bearer challenge (enough for a connector check; nothing is ever authorized).
 *
 * `FakePairs` is an in-memory PairStore that follows K1's rules (R-ID-04 / R-ID-13 precedence,
 * `checkName` / `nameKey`); `RetirablePairs` adds retired entries.
 */
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import * as K1 from './connector-contract/mcp-schema/index.js'

/** MCP 2026-07-28 method names and JSON-RPC words (spec vocabulary, not product values). */
export const RPC = Object.freeze({
  jsonrpc: '2.0', resultComplete: 'complete',
  discover: 'server/discover', toolsList: 'tools/list', toolsCall: 'tools/call',
  resourcesList: 'resources/list', resourcesRead: 'resources/read', listen: 'subscriptions/listen',
  acknowledged: 'notifications/subscriptions/acknowledged', resourceUpdated: 'notifications/resources/updated',
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
  parseError: -32700, methodNotFound: -32601, internalError: -32603,
  /** SEP-2549: list results carry a cache hint; 0 / private is "never cached". */
  cacheable: Object.freeze({ ttlMs: 0, cacheScope: 'private' }),
  capabilities: Object.freeze({ tools: Object.freeze({ listChanged: true }), resources: Object.freeze({ subscribe: true, listChanged: false }) }),
})

/** HTTP and media-type words. */
export const WEB = Object.freeze({
  json: 'application/json', sse: 'text/event-stream', html: 'text/html; charset=utf-8', form: 'application/x-www-form-urlencoded',
  basic: 'Basic ', bearer: K1.TOKEN_TYPE + ' ', get: 'GET', post: 'POST', accepted: 202,
  location: 'location', wwwAuthenticate: 'www-authenticate', allow: 'allow', contentType: 'content-type',
})

/** OAuth vocabulary (RFC 6749, 7636, 8707, 9207: spec terms) and the fake approval page's own form. */
export const OAUTH = Object.freeze({
  responseType: 'response_type', clientId: 'client_id', clientSecret: 'client_secret', redirectUri: 'redirect_uri',
  state: 'state', scope: 'scope', resource: 'resource', codeChallenge: 'code_challenge', codeChallengeMethod: 'code_challenge_method',
  code: 'code', codeVerifier: 'code_verifier', iss: 'iss', error: 'error', grantType: 'grant_type', refreshToken: 'refresh_token',
  form: Object.freeze({ request: 'request', token: 'token', name: 'name', decision: 'decision' }),
  decision: Object.freeze({ authorize: 'authorize', cancel: 'cancel' }),
})

/** Fake mailbox data (K1 fixes only their shapes). */
export const MAILBOX = Object.freeze({ cursor: 'fbtest-cursor', generation: 'g1' })

/** The fake target DSH's own words (startFakeDsh). */
export const FAKE_DSH = Object.freeze({
  version: '0.0.0-fbtest', generation: 'fbtest-gen-1', entryPrefix: 'fbtest-multi-entry-',
  /** Values a wrong reader would pick: the name is only `_meta[serverInfo].name` (PLAN-MULTI §4.1). */
  decoy: Object.freeze({ title: 'FBTEST-TITLE-not-the-name', serverInfo: 'FBTEST-STALE-serverInfo' }),
  transient: 'fbtest transient',
})

/** The OAuth steps whose answer a Connect fake can turn into a redirect (startConnectFake `script.redirect`). */
export const REDIRECT = Object.freeze({
  step: Object.freeze({
    protectedResource: 'protected-resource discovery', authorizationServer: 'authorization-server discovery',
    codeExchange: 'authorization-code exchange', refresh: 'refresh-token request',
  }),
  trapPath: '/fbtest-redirect-trap',
})

/** Where the fakes listen, and harness-only words. */
export const HARNESS = Object.freeze({
  /** Dual-stack wildcard: one fake answers 127.0.0.1, localhost and [::1] on one port. */
  dualStack: '::',
  ipv4Loopback: '127.0.0.1', ipv6Loopback: '::1',
  /** Two loopback names of one fake are two origins (K1 HOSTS). */
  host: Object.freeze({ first: K1.HOSTS.loopbackNames[0], ipv4: '127.0.0.1', other: K1.HOSTS.loopbackNames[1] }),
  /** Attempts to hold one port on both loopback addresses (startConnectFake). */
  portPairAttempts: 8,
  entryPrefix: 'fbtest-entry-', connectEntryPrefix: 'fbtest-link-save-entry-', principalPrefix: 'fbtest-principal-',
  listener: Object.freeze({ web: 'web', approval: 'approval', trap: 'trap' }),
  text: Object.freeze({ parseError: 'parse error', methodNotFound: 'method not found', expired: 'this request has expired', invalid: 'this token or id is not valid', noRequest: 'fbtest browser: the approval page has no request id: ', badDecision: 'fbtest browser: the decision answered ' }),
  previewChars: 200,
})

// ---- plumbing ----------------------------------------------------------------------------------

export const readBody = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')))
})
export const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { [WEB.contentType]: WEB.json, ...headers })
  res.end(JSON.stringify(body))
}
export const sseFrame = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
export const rpcResult = (id, result) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...result } })
export const rpcError = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })
const rpcNotice = (method, params) => ({ jsonrpc: RPC.jsonrpc, method, params })
const pick = (object, keys) => Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]))
const loopbackOrigin = (host) => `${K1.HOSTS.loopbackScheme}//${host}`

/** A token value of K1's generated shape, fresh per call (no secret is a literal). */
export const newToken = () => K1.TOKEN_VALUE.generatedPrefix + randomBytes(K1.TOKEN_VALUE.generatedBytes).toString('base64url')
const opaque = () => randomBytes(K1.TOKEN_VALUE.opaqueBytes).toString('base64url')
const s256 = (verifier) => createHash('sha256').update(verifier).digest('base64url')

/** `{clientId, secret}` of a token request: the Basic header first, else the form (a URLSearchParams). */
export function clientOf(headers, form) {
  const basic = headers.authorization ?? ''
  if (basic.startsWith(WEB.basic)) {
    const [id, ...rest] = Buffer.from(basic.slice(WEB.basic.length), 'base64').toString('utf8').split(':')
    return { clientId: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) }
  }
  return { clientId: form.get(OAUTH.clientId), secret: form.get(OAUTH.clientSecret) }
}

/** One HTTP listener on `host`; `listen(port)` (0: any) can be called again after `close()` (same port). */
function serve(handler, host) {
  let port
  const server = http.createServer((req, res) => { handler(req, res).catch(() => { try { res.destroy() } catch { /* gone */ } }) })
  const sockets = new Set()
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  const listen = (requested = 0) => new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(requested, host, () => { server.off('error', reject); port = server.address().port; resolve(port) })
  })
  const close = () => new Promise((resolve) => {
    for (const s of sockets) s.destroy()
    if (!server.listening) return resolve()
    server.close(() => resolve())
  })
  return { listen, close, get port() { return port } }
}

/**
 * Both loopback addresses on one port, so `localhost` resolves to this fake whichever address it
 * picks. On macOS a wildcard bind can share a port with an existing exact-address listener, so both
 * exact addresses are held; only the port allocation is retried, never an HTTP exchange.
 */
function serveLoopbacks(handler) {
  const ipv4 = serve(handler, HARNESS.ipv4Loopback)
  const ipv6 = serve(handler, HARNESS.ipv6Loopback)
  const close = () => Promise.all([ipv4.close(), ipv6.close()])
  async function listen(requested = 0) {
    for (let attempt = 1; ; attempt++) {
      const port = await ipv4.listen(requested)
      try { await ipv6.listen(port); return port } catch (error) {
        await ipv4.close()
        if (requested !== 0 || error.code !== 'EADDRINUSE' || attempt >= HARNESS.portPairAttempts) throw error
      }
    }
  }
  return { listen, close, get port() { return ipv4.port } }
}

// ---- pair stores -------------------------------------------------------------------------------

/**
 * An in-memory pair registry following K1's `PairStore` rules for the members the fakes use
 * (`list`, `pairOf`, `byPrincipal`, `pair`, `setName`, `seen`). A double whose answers are derived
 * from R-ID-03/04/13 and R-NAME-02/06 only, not the connector's store.
 */
export class FakePairs {
  #pairs = new Map()

  list() { return [...this.#pairs.values()] }
  pairOf(entryKey) { return this.#pairs.get(entryKey) }
  byPrincipal(principalKey) { return this.list().find((p) => p.principalKey === principalKey) }

  #heldByOther(name, principalKey) {
    const key = K1.nameKey(name)
    return this.list().some((p) => p.principalKey !== principalKey && p.name !== null && K1.nameKey(p.name) === key)
  }

  async pair(entryKey, id, name, now) {
    const bound = this.#pairs.get(entryKey)
    if (bound !== undefined) {
      const idMatches = bound.id === id
      return {
        ok: false, code: K1.REFUSAL.alreadyPaired,
        bound: { idMatches, boundId: bound.id, name: bound.name, pairedAt: bound.pairedAt, lastSeenAt: bound.lastSeenAt },
        advice: idMatches ? K1.PAIR_ADVICE.idMatches : K1.PAIR_ADVICE.idDiffers,
      }
    }
    if (this.list().some((p) => p.id === id)) return { ok: false, code: K1.REFUSAL.idTaken }
    const principalKey = HARNESS.principalPrefix + entryKey
    let assigned = null
    let refused
    if (name !== undefined) {
      const checked = K1.checkName(name)
      if (!checked.ok) refused = K1.REFUSAL.nameInvalid
      else if (this.#heldByOther(checked.name, principalKey)) refused = K1.REFUSAL.nameTaken
      else assigned = checked.name
    }
    this.#pairs.set(entryKey, { entryKey, principalKey, id, name: assigned, pairedAt: now, lastSeenAt: null })
    const outcome = name === undefined ? {} : { nameAssigned: assigned !== null, ...(refused === undefined ? {} : { nameRefused: refused }) }
    return { ok: true, paired: true, id, name: assigned, ...outcome }
  }

  async setName(principalKey, name) {
    const pair = this.byPrincipal(principalKey)
    if (name === null) {
      this.#pairs.set(pair.entryKey, { ...pair, name: null })
      return { ok: true, name: null }
    }
    const checked = K1.checkName(name)
    if (!checked.ok) return { ok: false, code: K1.REFUSAL.nameInvalid }
    if (this.#heldByOther(checked.name, principalKey)) return { ok: false, code: K1.REFUSAL.nameTaken }
    this.#pairs.set(pair.entryKey, { ...pair, name: checked.name })
    return { ok: true, name: checked.name }
  }

  seen(principalKey, now) {
    const pair = this.byPrincipal(principalKey)
    if (pair !== undefined) this.#pairs.set(pair.entryKey, { ...pair, lastSeenAt: now })
  }
}

/** FakePairs where a retired entry no longer holds a pair (its id and name are free again, design §5.4). */
export class RetirablePairs extends FakePairs {
  #retired = new Set()
  retire(entryKey) { this.#retired.add(entryKey) }
  list() { return super.list().filter((p) => !this.#retired.has(p.entryKey)) }
  pairOf(entryKey) { return this.#retired.has(entryKey) ? undefined : super.pairOf(entryKey) }
}

// ---- the base ----------------------------------------------------------------------------------

/** A JSON-RPC error with its HTTP status, thrown by a method handler. */
class RpcFailure extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

/**
 * The shared connector. Options: `pairs` (a PairStore; FakePairs by default), `entries` (initial
 * token entries `{entryKey, secret, enabled?}`), `now` (the pair clock), `tools` (the listed tools,
 * K1's by default), `onTool(name, args, call)` (a scripted tool result; undefined falls through),
 * `extraPaths` (more MCP endpoint paths on the same origin), `extraTokenFields` (added to every token
 * response), `generation` (the mailbox generation `resources/read` reports).
 *
 * Every request is recorded in `requests` as `{listener, at, host, method, path, query, endpoint,
 * headers, authorization, body}`; every tool call in `calls` as `{name, args, clientId, agentId,
 * entryKey, endpoint, via, at, result}`; every listen stream in `listens` as `{filter, honoured, id,
 * clientId, entryKey, via, endpoint, at, res, closed}`.
 */
export class FakeConnector {
  /** The loopback name `url()` uses by default. */
  defaultHost = HARNESS.host.first
  entryPrefix = HARNESS.entryPrefix

  constructor({ pairs = new FakePairs(), entries = [], now = Date.now, tools = K1.TOOLS, onTool, extraPaths = [], extraTokenFields = {}, generation = MAILBOX.generation } = {}) {
    this.pairs = pairs
    this.now = now
    this.onTool = onTool
    this.extraPaths = extraPaths
    this.extraTokenFields = extraTokenFields
    this.generation = generation
    this.state = { tools: [...tools], refuseTokens: false }
    this.registry = new Map()
    this.access = new Map()
    this.requests = []
    this.calls = []
    this.listens = []
    this.mailbox = []
    this.acked = []
    /** One-shot: before the next `pair` on an entry, another client binds it to that id. */
    this.racers = new Map()
    this.entrySeq = 0
    for (const entry of entries) this.addEntry(entry)
  }

  // -- lifecycle (a variant may bind differently)
  listener() { return serve((req, res) => this.web(req, res), HARNESS.dualStack) }
  async open() { this.web$ = this.listener(); await this.web$.listen(); return this }
  get port() { return this.web$.port }
  /** The target becomes unreachable; `restore()` brings it back on the same port. */
  drop() { return this.web$.close() }
  restore() { return this.web$.listen(this.port) }
  stop() { return this.web$.close() }

  // -- hooks
  /** Every secret or token value this fake issues or receives passes here (a leak sweep can keep them). */
  remember(value) { return value }
  scopeOf(entryKey, clientId) { return this.pairs.pairOf(entryKey)?.id === clientId ? K1.SCOPE.full : K1.SCOPE.pair }
  /** A full-scope MCP request of a caller was admitted. */
  onFullRequest() {}
  /** Overrides of the web listener before routing (true: answered). */
  async beforeRoute() { return false }
  protectedResource(origin, resourcePath) {
    const doc = K1.protectedResourceMetadata(origin)
    // RFC 9728 §3.1: the resource is the endpoint whose path follows the well-known prefix.
    return this.extraPaths.includes(resourcePath) ? { ...doc, resource: origin + resourcePath } : doc
  }
  authorizationServer(origin) { return K1.authorizationServerMetadata(origin, origin) }
  /** A token request whose grant is not client_credentials. */
  otherGrant(req, res) { return this.failToken(res, K1.OAUTH_ERROR.invalidClient) }
  /** The caller of an MCP request (from its bearer token), or undefined when it is not authorized. */
  callerOf(token) {
    const caller = this.access.get(token)
    return caller !== undefined && this.registry.get(caller.entryKey)?.enabled ? caller : undefined
  }
  /** The part of a listen filter this server serves. */
  honour(filter) { return filter }
  discoverResult() { return { supportedVersions: [K1.PROTOCOL.version], capabilities: RPC.capabilities } }
  resources() { return [K1.RESOURCE.events] }
  resourceContent() {
    return { uri: K1.RESOURCE.events.uri, mimeType: K1.RESOURCE.events.mimeType, text: JSON.stringify({ pending: this.mailbox.length, headSequence: 0, mailboxGeneration: this.generation }) }
  }
  /** A tool other than pair / set_name / the inbox, with no scripted result. */
  defaultTool() { return K1.okResult({}) }

  // -- entries and tokens
  /** A token entry (as the connector's settings page creates one): given, or generated. Answers `{entryKey, secret}`. */
  addEntry(entry = { entryKey: this.entryPrefix + ++this.entrySeq, secret: newToken() }) {
    this.registry.set(entry.entryKey, { ...entry, enabled: entry.enabled ?? true })
    this.remember(entry.secret)
    return { entryKey: entry.entryKey, secret: entry.secret }
  }
  /** The owner switches an entry off or on; off kills its access tokens and listen streams at once. */
  setEnabled(entryKey, enabled) {
    this.registry.get(entryKey).enabled = enabled
    if (!enabled) for (const l of this.listens) if (l.entryKey === entryKey) l.res.destroy()
  }
  /** Another client binds `entryKey` to `id` just before the next `pair` on it. */
  bindBeforeNextPair(entryKey, id) { this.racers.set(entryKey, id) }
  entryBySecret(secret) { return [...this.registry.values()].find((e) => e.secret === secret) }
  issueAccess(grant) {
    const token = this.remember(newToken())
    this.access.set(token, grant)
    return token
  }
  /** Every access token dies early (a connector restart), and every listen stream ends. */
  dropAccess() { this.access.clear(); this.dropStreams() }
  /** Every access token dies and new token requests are refused. */
  revokeAll() { this.state.refuseTokens = true; this.dropAccess() }
  issuedTokens() { return [...this.access.keys()] }

  // -- the web listener
  async web(req, res) {
    const body = await readBody(req)
    const origin = loopbackOrigin(req.headers.host)
    const url = new URL(req.url, origin)
    const endpoint = url.pathname === K1.PATHS.mcp || this.extraPaths.includes(url.pathname) ? url.pathname : null
    this.requests.push({ listener: HARNESS.listener.web, at: Date.now(), host: req.headers.host, method: req.method, path: url.pathname, query: url.search, endpoint, headers: { ...req.headers }, authorization: req.headers.authorization ?? null, body })
    if (await this.beforeRoute(req, res, url, body)) return undefined
    if (req.method === WEB.get && url.pathname.startsWith(K1.PATHS.protectedResourcePrefix)) return sendJson(res, K1.HTTP_STATUS.ok, this.protectedResource(origin, url.pathname.slice(K1.PATHS.protectedResourcePrefix.length)))
    if (req.method === WEB.get && url.pathname.startsWith(K1.PATHS.authorizationServerPrefix)) return sendJson(res, K1.HTTP_STATUS.ok, this.authorizationServer(origin, origin + url.pathname.slice(K1.PATHS.authorizationServerPrefix.length)))
    if (req.method === WEB.post && url.pathname === K1.PATHS.token) return this.token(req, res, body, origin)
    if (endpoint !== null) {
      if (req.method === WEB.post) return this.mcp(req, res, body, origin, endpoint)
      res.writeHead(K1.HTTP_STATUS.methodNotAllowed, { [WEB.allow]: WEB.post })
      return res.end()
    }
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }

  failToken(res, error) {
    return sendJson(res, K1.OAUTH_ERROR_STATUS[error], K1.oauthErrorBody(error), { ...K1.TOKEN_RESPONSE_HEADERS, ...(error === K1.OAUTH_ERROR.invalidClient ? { [WEB.wwwAuthenticate]: K1.BEARER_CHALLENGE.basicScheme } : {}) })
  }
  okToken(res, body) { return sendJson(res, K1.HTTP_STATUS.ok, { ...body, ...this.extraTokenFields }, K1.TOKEN_RESPONSE_HEADERS) }

  token(req, res, body, origin) {
    const form = new URLSearchParams(body)
    const grant = form.get(OAUTH.grantType)
    if (grant !== K1.GRANT.clientCredentials) return this.otherGrant(req, res, form, origin)
    const { clientId, secret } = clientOf(req.headers, form)
    this.remember(secret)
    const entry = this.entryBySecret(secret)
    if (this.state.refuseTokens || entry === undefined || !entry.enabled || !K1.isAgentId(clientId ?? '')) return this.failToken(res, K1.OAUTH_ERROR.invalidClient)
    const accessToken = this.issueAccess({ entryKey: entry.entryKey, clientId, agentId: clientId, via: grant, origin })
    return this.okToken(res, K1.tokenResponse({ accessToken, scope: this.scopeOf(entry.entryKey, clientId) }))
  }

  async mcp(req, res, body, origin, endpoint) {
    const auth = req.headers.authorization ?? ''
    const granted = auth.startsWith(WEB.bearer) ? this.callerOf(auth.slice(WEB.bearer.length), origin) : undefined
    if (granted === undefined) return sendJson(res, K1.HTTP_STATUS.unauthorized, {}, { [WEB.wwwAuthenticate]: auth ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    const caller = { ...granted, endpoint }
    let message
    try { message = JSON.parse(body) } catch { return sendJson(res, K1.HTTP_STATUS.badRequest, rpcError(null, RPC.parseError, HARNESS.text.parseError)) }
    if (message.id === undefined) { res.writeHead(WEB.accepted); return res.end() }
    const full = this.scopeOf(caller.entryKey, caller.clientId) === K1.SCOPE.full
    const reach = K1.PAIR_ONLY.methods.includes(message.method) || (message.method === RPC.toolsCall && K1.PAIR_ONLY.tools.includes(message.params?.name))
    if (!full && !reach) {
      const reason = this.pairs.pairOf(caller.entryKey) === undefined ? K1.INSUFFICIENT_SCOPE_REASON.notPaired : K1.INSUFFICIENT_SCOPE_REASON.idMismatch
      return sendJson(res, K1.HTTP_STATUS.forbidden, {}, { [WEB.wwwAuthenticate]: K1.insufficientScopeChallenge(origin, reason) })
    }
    if (full) this.onFullRequest(caller)
    const method = this.methods[message.method]
    if (method === undefined) return sendJson(res, K1.HTTP_STATUS.ok, rpcError(message.id, RPC.methodNotFound, HARNESS.text.methodNotFound))
    try {
      const result = await method.call(this, { message, caller, full, res })
      if (result !== undefined) sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, result))
    } catch (error) {
      if (!(error instanceof RpcFailure)) throw error
      sendJson(res, error.status, rpcError(message.id, error.code, error.message))
    }
    return undefined
  }

  /** The MCP methods, each answering a result (or undefined when it answered itself). */
  methods = {
    [RPC.discover]() { return this.discoverResult() },
    [RPC.toolsList]({ full }) { return { ...RPC.cacheable, tools: full ? this.state.tools : this.state.tools.filter((t) => K1.PAIR_ONLY.tools.includes(t.name)) } },
    async [RPC.toolsCall]({ message, caller }) { return { ...await this.toolResult(caller, message.params?.name, message.params?.arguments) } },
    [RPC.resourcesList]() { return { ...RPC.cacheable, resources: this.resources() } },
    [RPC.resourcesRead]({ message }) { return { ...RPC.cacheable, contents: [this.resourceContent(message.params?.uri)] } },
    [RPC.listen]({ message, caller, res }) {
      const filter = message.params?.notifications ?? {}
      const honoured = this.honour(filter)
      const listen = { filter, honoured, id: message.id, clientId: caller.clientId, entryKey: caller.entryKey, via: caller.via, endpoint: caller.endpoint, at: Date.now(), res, closed: false }
      res.on('close', () => { listen.closed = true })
      this.listens.push(listen)
      res.writeHead(K1.HTTP_STATUS.ok, { [WEB.contentType]: WEB.sse, ...K1.TOKEN_RESPONSE_HEADERS })
      res.write(sseFrame(rpcNotice(RPC.acknowledged, { notifications: honoured, _meta: { [RPC.subscriptionIdKey]: message.id } })))
      return undefined
    },
  }

  async toolResult(caller, name, args) {
    const call = { name, args, clientId: caller.clientId, agentId: caller.clientId, entryKey: caller.entryKey, endpoint: caller.endpoint, via: caller.via, at: Date.now(), result: undefined }
    this.calls.push(call)
    if (name === K1.TOOL.pair) {
      const racer = this.racers.get(caller.entryKey)
      if (racer !== undefined) { this.racers.delete(caller.entryKey); await this.pairs.pair(caller.entryKey, racer, undefined, this.now()) }
      const result = await this.pairs.pair(caller.entryKey, caller.clientId, args?.name, this.now())
      call.result = result
      if (result.ok) return K1.okResult({ paired: result.paired, id: result.id, name: result.name, ...pick(result, ['nameAssigned', 'nameRefused']) })
      return K1.refusalResult(result.code, pick(result, ['bound', 'advice']))
    }
    if (name === K1.TOOL.setName) {
      const result = await this.pairs.setName(this.pairs.pairOf(caller.entryKey).principalKey, args?.name ?? null)
      call.result = result
      return result.ok ? K1.okResult({ name: result.name }) : K1.refusalResult(result.code)
    }
    const scripted = await this.onTool?.(name, args, call)
    if (scripted !== undefined) return K1.okResult(scripted)
    if (name === K1.TOOL.inboxPoll) return K1.okResult({ events: this.mailbox.splice(0), nextCursor: MAILBOX.cursor, hasMore: false })
    if (name === K1.TOOL.inboxAck) { this.acked.push(...(args?.receipts ?? [])); return K1.okResult({ acked: args?.receipts?.length ?? 0 }) }
    return this.defaultTool(name, args)
  }

  // -- reading what happened
  /** This fake's MCP URL under a loopback name (two names of one fake: two origins). */
  url(host = this.defaultHost, pathname = K1.PATHS.mcp) { return `${loopbackOrigin(host)}:${this.port}${pathname}` }
  callsOf(name) { return this.calls.filter((c) => c.name === name) }
  tokenRequests() { return this.requests.filter((r) => r.listener === HARNESS.listener.web && r.path === K1.PATHS.token) }
  clientCredentialRequests() { return this.tokenRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.grantType) === K1.GRANT.clientCredentials) }
  /** The client ids of every token request, in order (Basic or form). */
  tokenClientIds() { return this.tokenRequests().map((r) => clientOf(r.headers, new URLSearchParams(r.body)).clientId) }
  /** The secrets of every token request, in order. */
  tokenSecrets() { return this.tokenRequests().map((r) => clientOf(r.headers, new URLSearchParams(r.body)).secret) }
  /** The client_credentials secrets presented, in order, with the Host each went to. */
  presented() { return this.clientCredentialRequests().map((r) => ({ at: r.at, host: r.host, ...clientOf(r.headers, new URLSearchParams(r.body)) })) }
  /** Requests received after `at` (ms epoch): what a runtime still running after a close would send. */
  requestsAfter(at) { return this.requests.filter((r) => r.at > at) }
  /** Listen streams opened on the events resource (K1 CONNECTED), open or not. */
  eventListens() { return this.listens.filter((l) => (l.filter.resourceSubscriptions ?? []).includes(K1.CONNECTED.listenResource)) }
  /** Listen streams the client has not closed. */
  openListens() { return this.listens.filter((l) => !l.closed) }
  /** Open streams that subscribed (as honoured) to `uri`. */
  openStreams(uri) { return this.listens.filter((l) => !l.res.destroyed && !l.res.writableEnded && (l.honoured.resourceSubscriptions ?? []).includes(uri)) }
  /** One `notifications/resources/updated {uri}` to each subscribed stream; answers how many. */
  pushUpdated(uri) {
    const streams = this.openStreams(uri)
    for (const l of streams) l.res.write(sseFrame(rpcNotice(RPC.resourceUpdated, { uri })))
    return streams.length
  }
  /** Mailbox events for the next `inbox_poll`, and the events hint to every subscribed stream. */
  enqueue(...events) { this.mailbox.push(...events); this.hintEvents() }
  hintEvents() { return this.pushUpdated(K1.RESOURCE.events.uri) }
  /** Ends every open listen stream (a client reconnects and listens again). */
  dropStreams() { for (const l of this.listens) l.res.destroy() }
  /** The tool list changes (a client re-lists on reconnect). */
  setTools(list) { this.state.tools = [...list] }
}

// ---- variants ----------------------------------------------------------------------------------

/** F-PAIR's connector: the caller's PairStore, whose `lastSeenAt` every full-scope request keeps. */
class PairingConnector extends FakeConnector {
  onFullRequest(caller) {
    const pair = this.pairs.pairOf(caller.entryKey)
    if (pair !== undefined) this.pairs.seen(pair.principalKey, this.now())
  }
}

/**
 * The pairing connector on a dual-stack loopback port.
 * @param {{store?: object, entries: Array<{entryKey: string, secret: string, enabled?: boolean}>, now?: () => number, extraTokenFields?: object}} options
 *   `store` a K1 PairStore (FakePairs by default; integration rows pass the connector's real one).
 */
export function startFakeConnector({ store, entries = [], now, extraTokenFields } = {}) {
  const fake = new PairingConnector({ pairs: store, entries, now, extraTokenFields })
  fake.store = fake.pairs
  return fake.open()
}

/** One target DSH among several: an advertised server name, the identity resource and its push. */
class TargetDsh extends FakeConnector {
  defaultHost = HARNESS.host.ipv4
  entryPrefix = FAKE_DSH.entryPrefix
  discovers = []

  discoverResult() {
    this.discovers.push({ at: Date.now(), name: this.state.name })
    if (this.state.failDiscover > 0) { this.state.failDiscover -= 1; throw new RpcFailure(K1.HTTP_STATUS.internalServerError, RPC.internalError, FAKE_DSH.transient) }
    return {
      ...super.discoverResult(),
      // Decoys: neither a title nor a top-level serverInfo is the name (PLAN-MULTI §4.1).
      serverInfo: { name: FAKE_DSH.decoy.serverInfo, version: FAKE_DSH.version },
      _meta: { [K1.SERVER_IDENTITY.discoverMetaKey]: { name: this.state.name, title: FAKE_DSH.decoy.title, version: FAKE_DSH.version } },
    }
  }
  resources() { return [...super.resources(), ...(this.state.identity ? [K1.RESOURCE.identity] : [])] }
  resourceContent(uri) {
    if (uri !== K1.RESOURCE.identity.uri) return { ...super.resourceContent(), mimeType: WEB.json }
    return { uri, mimeType: WEB.json, text: JSON.stringify({ name: this.state.name, version: FAKE_DSH.version }) }
  }
  /** A server without the identity resource honours only what it serves (the ack names what it took). */
  honour(filter) {
    return { ...filter, resourceSubscriptions: (filter.resourceSubscriptions ?? []).filter((u) => u !== K1.RESOURCE.identity.uri || this.state.identity) }
  }
  defaultTool(name) { return name === K1.TOOL.approvalAnswer ? K1.okResult({ accepted: true }) : K1.okResult({ fbtestTarget: this.state.name }) }
  /** The live name changes; the identity push goes to every stream that subscribed to the URI (none on an unchanged name). */
  rename(next) {
    if (next === this.state.name) return 0
    this.state.name = next
    return this.pushIdentity()
  }
  pushIdentity() { return this.pushUpdated(K1.RESOURCE.identity.uri) }
}

/**
 * One fake target DSH on loopback.
 * @param {{name: string, identity?: boolean, tools?: object[], onTool?: Function, extraPaths?: string[], generation?: string}} options
 *   `name` the advertised `Implementation.name`; `identity` false leaves `dsh-agent://identity` out of
 *   `resources/list`; `tools` the listed tools (K1's by default: pass the subset your client knows);
 *   `onTool` a scripted tool result (a promise may hold the call); `extraPaths` more MCP endpoint
 *   paths on the same origin. `state.failDiscover` n fails the next n discovers with a 500.
 */
export function startFakeDsh({ name, identity = true, tools, onTool, extraPaths, generation = FAKE_DSH.generation } = {}) {
  const fake = new TargetDsh({ tools, onTool, extraPaths, generation })
  Object.assign(fake.state, { name, identity, failDiscover: 0 })
  return fake.open()
}

/**
 * The Connect-capable connector. `script` (mutable) holds the misbehaviours a case sets:
 * - `metadata`: `{resource?(origin), authorizationServers?(origin), scopes?}` (`scopes: null` drops the field);
 * - `codeError`: an OAuth error the next `authorization_code` request answers, once;
 * - `refreshError`: an OAuth error every `refresh_token` request answers while set;
 * - `redirect`: `{step, status}`: every request of that OAuth step (REDIRECT.step) is answered with
 *   `status` and a Location on the trap listener, which records what it gets (`trapRequests()`);
 * - `authorizationServer(origin, approvalOrigin)`: fields replacing the RFC 8414 document's own
 *   (an `undefined` value drops the field);
 * - `discoveryHold`: a promise every metadata request waits on before it is answered.
 */
class ConnectConnector extends FakeConnector {
  entryPrefix = HARNESS.connectEntryPrefix
  planted = new Set()
  script = {}
  refresh = new Map()
  codes = new Map()
  pending = new Map()
  /** Every refresh token issued, oldest first (a rotation appends one). */
  refreshIssued = []

  constructor() { super({ pairs: new RetirablePairs() }) }

  listener() { return serveLoopbacks((req, res) => this.web(req, res)) }
  async open() {
    await super.open()
    this.approval = serve((req, res) => this.approvalWeb(req, res), HARNESS.ipv4Loopback)
    this.trap = serve((req, res) => this.trapWeb(req, res), HARNESS.ipv4Loopback)
    try { await this.approval.listen(); await this.trap.listen() } catch (error) { await this.stop(); throw error }
    return this
  }
  stop() { return Promise.all([this.web$.close(), this.approval?.close(), this.trap?.close()]) }

  remember(value) { if (typeof value === 'string' && value.length > 0) this.planted.add(value); return value }
  /** A token value of the connector's shape that no entry holds; planted for the sweep. */
  unknownToken() { return this.remember(newToken()) }
  approvalOrigin() { return `${loopbackOrigin(HARNESS.ipv4Loopback)}:${this.approval.port}` }
  trapUrl() { return `${loopbackOrigin(HARNESS.ipv4Loopback)}:${this.trap.port}${REDIRECT.trapPath}` }

  callerOf(token, origin) {
    const caller = super.callerOf(token)
    return caller === undefined || caller.chain?.live === false || caller.origin !== origin ? undefined : caller
  }

  /** The OAuth step one web request is (REDIRECT.step), or undefined. */
  stepOf(method, pathname, body) {
    if (method === WEB.get && pathname.startsWith(K1.PATHS.protectedResourcePrefix)) return REDIRECT.step.protectedResource
    if (method === WEB.get && pathname.startsWith(K1.PATHS.authorizationServerPrefix)) return REDIRECT.step.authorizationServer
    if (method !== WEB.post || pathname !== K1.PATHS.token) return undefined
    const grant = new URLSearchParams(body).get(OAUTH.grantType)
    if (grant === K1.GRANT.authorizationCode) return REDIRECT.step.codeExchange
    if (grant === K1.GRANT.refreshToken) return REDIRECT.step.refresh
    return undefined
  }
  async beforeRoute(req, res, url, body) {
    if (this.script.redirect !== undefined && this.stepOf(req.method, url.pathname, body) === this.script.redirect.step) {
      res.writeHead(this.script.redirect.status, { [WEB.location]: this.trapUrl() })
      res.end()
      return true
    }
    const discovery = this.stepOf(req.method, url.pathname, body)
    if ((discovery === REDIRECT.step.protectedResource || discovery === REDIRECT.step.authorizationServer) && this.script.discoveryHold !== undefined) await this.script.discoveryHold
    return false
  }
  protectedResource(origin) {
    const m = this.script.metadata ?? {}
    const doc = {
      ...K1.protectedResourceMetadata(origin),
      ...(m.resource === undefined ? {} : { resource: m.resource(origin) }),
      ...(m.authorizationServers === undefined ? {} : { authorization_servers: m.authorizationServers(origin) }),
      ...(m.scopes === undefined ? {} : { scopes_supported: m.scopes }),
    }
    if (doc.scopes_supported === null) delete doc.scopes_supported
    return doc
  }
  /** Any issuer path is served with its own issuer, so a not-a-connector row fails the check, not the read. */
  authorizationServer(origin, issuer) {
    const doc = { ...K1.authorizationServerMetadata(origin, this.approvalOrigin()), issuer, ...(this.script.authorizationServer?.(origin, this.approvalOrigin()) ?? {}) }
    for (const [k, v] of Object.entries(doc)) if (v === undefined) delete doc[k]
    return doc
  }

  issueChain(chain, grant, origin) {
    const accessToken = this.issueAccess({ entryKey: chain.entryKey, clientId: chain.agentId, agentId: chain.agentId, via: grant, origin, chain })
    const refreshToken = this.remember(opaque())
    this.refresh.set(refreshToken, { chain, used: false })
    this.refreshIssued.push(refreshToken)
    return K1.tokenResponse({ accessToken, scope: K1.SCOPE.full, refreshToken })
  }
  /** The public-client grants: no client secret of any kind (R-OA-14), the resource is this MCP endpoint. */
  otherGrant(req, res, form, origin) {
    const grant = form.get(OAUTH.grantType)
    if (form.has(OAUTH.clientSecret) || req.headers.authorization) return this.failToken(res, K1.OAUTH_ERROR.invalidClient)
    if (form.get(OAUTH.resource) !== origin + K1.PATHS.mcp) return this.failToken(res, K1.OAUTH_ERROR.invalidTarget)
    if (grant === K1.GRANT.authorizationCode) return this.codeGrant(res, form, origin)
    if (grant === K1.GRANT.refreshToken) return this.refreshGrant(res, form, origin)
    return this.failToken(res, K1.OAUTH_ERROR.unsupportedGrantType)
  }
  codeGrant(res, form, origin) {
    if (this.script.codeError !== undefined) { const error = this.script.codeError; this.script.codeError = undefined; return this.failToken(res, error) }
    const code = this.codes.get(form.get(OAUTH.code))
    const verifier = this.remember(form.get(OAUTH.codeVerifier) ?? '')
    if (!code || code.used || code.clientId !== form.get(OAUTH.clientId) || code.redirectUri !== form.get(OAUTH.redirectUri) || s256(verifier) !== code.challenge) return this.failToken(res, K1.OAUTH_ERROR.invalidGrant)
    code.used = true
    return this.okToken(res, this.issueChain({ entryKey: code.entryKey, agentId: code.agentId, clientId: code.clientId, live: true }, K1.GRANT.authorizationCode, origin))
  }
  refreshGrant(res, form, origin) {
    if (this.script.refreshError !== undefined) return this.failToken(res, this.script.refreshError)
    const held = this.refresh.get(form.get(OAUTH.refreshToken))
    if (!held || !held.chain.live || !this.registry.get(held.chain.entryKey)?.enabled || held.chain.clientId !== form.get(OAUTH.clientId)) return this.failToken(res, K1.OAUTH_ERROR.invalidGrant)
    if (held.used) {
      // R-OA-16: a reused refresh token revokes the whole chain.
      held.chain.live = false
      return this.failToken(res, K1.OAUTH_ERROR.invalidGrant)
    }
    held.used = true
    return this.okToken(res, this.issueChain(held.chain, K1.GRANT.refreshToken, origin))
  }

  recordOn(listener, req, url, body) {
    this.requests.push({ listener, at: Date.now(), host: req.headers.host, method: req.method, path: url.pathname, query: url.search, endpoint: null, headers: { ...req.headers }, authorization: req.headers.authorization ?? null, body })
  }
  async approvalWeb(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, loopbackOrigin(req.headers.host))
    this.recordOn(HARNESS.listener.approval, req, url, body)
    if (req.method === WEB.get && url.pathname === K1.PATHS.authorize) return this.authorizePage(res, url)
    if (req.method === WEB.post && url.pathname === K1.PATHS.decision) return this.decision(res, body)
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }
  /** Any request on the trap is a followed redirect. */
  async trapWeb(req, res) {
    const body = await readBody(req)
    this.recordOn(HARNESS.listener.trap, req, new URL(req.url, loopbackOrigin(req.headers.host)), body)
    return sendJson(res, K1.HTTP_STATUS.notFound, {})
  }
  authorizePage(res, url) {
    const id = opaque()
    this.pending.set(id, Object.fromEntries(url.searchParams))
    res.writeHead(K1.HTTP_STATUS.ok, { [WEB.contentType]: WEB.html, ...K1.APPROVAL_LISTENER.headers })
    res.end(`<form method="post" action="${K1.PATHS.decision}"><input type="hidden" name="${OAUTH.form.request}" value="${id}"></form>`)
  }
  async decision(res, body) {
    const form = new URLSearchParams(body)
    const request = this.pending.get(form.get(OAUTH.form.request))
    const page = (status, text) => { res.writeHead(status, { [WEB.contentType]: WEB.html }); res.end(text) }
    if (!request) return page(K1.HTTP_STATUS.ok, HARNESS.text.expired)
    const origin = new URL(request[OAUTH.resource]).origin
    const back = new URL(request[OAUTH.redirectUri])
    const reply = { [OAUTH.iss]: origin + K1.PATHS.issuer }
    if (request[OAUTH.state] !== undefined) reply[OAUTH.state] = request[OAUTH.state]
    if (form.get(OAUTH.form.decision) === OAUTH.decision.cancel) {
      reply[OAUTH.error] = K1.OAUTH_ERROR.accessDenied
    } else {
      const entry = this.entryBySecret(form.get(OAUTH.form.token))
      const agentId = request[K1.AUTHORIZE_EXTENSION.agentIdParam]
      if (entry === undefined || !entry.enabled || !K1.isAgentId(agentId ?? '')) return page(K1.HTTP_STATUS.badRequest, HARNESS.text.invalid)
      // The approval page binds the entry to the agent id before any code exists (R-OA-22).
      const name = form.get(OAUTH.form.name)
      if (this.pairs.pairOf(entry.entryKey) === undefined) await this.pairs.pair(entry.entryKey, agentId, name === '' || name === null ? undefined : name, Date.now())
      const code = this.remember(opaque())
      this.codes.set(code, { clientId: request[OAUTH.clientId], redirectUri: request[OAUTH.redirectUri], challenge: request[OAUTH.codeChallenge], entryKey: entry.entryKey, agentId, used: false })
      reply[OAUTH.code] = code
    }
    this.pending.delete(form.get(OAUTH.form.request))
    for (const [k, v] of Object.entries(reply)) back.searchParams.set(k, v)
    res.writeHead(K1.APPROVAL_LISTENER.redirectStatus, { [WEB.location]: back.href })
    return res.end()
  }

  /** The entry is deleted (or retired by a succession): its tokens die and its pair is gone. */
  retireEntry(entryKey) { this.setEnabled(entryKey, false); this.pairs.retire(entryKey) }
  /** Open listen streams on the events resource only. */
  eventListens() { return super.eventListens().filter((l) => !l.res.destroyed) }
  codeRequests() { return this.tokenRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.grantType) === K1.GRANT.authorizationCode) }
  refreshRequests() { return this.tokenRequests().filter((r) => new URLSearchParams(r.body).get(OAUTH.grantType) === K1.GRANT.refreshToken) }
  approvalRequests() { return this.requests.filter((r) => r.listener === HARNESS.listener.approval) }
  trapRequests() { return this.requests.filter((r) => r.listener === HARNESS.listener.trap) }
  stepRequests(step) { return this.requests.filter((r) => r.listener === HARNESS.listener.web && this.stepOf(r.method, r.path, r.body) === step) }
}

/** Starts the Connect-capable connector (see ConnectConnector). */
export function startConnectFake() { return new ConnectConnector().open() }

/**
 * The owner's scripted browser on a Connect fake's approval page: open the URL, post the form (the
 * typed token, the typed name, Authorize or Cancel), read the 303 and follow it to the client's
 * callback after `mutate(location)` (a forged `state` or `iss`). Answers `{location, status}` or
 * `{location, refused: true}` when nothing listens there.
 */
export const approvalBrowser = Object.freeze({
  async approve(url, { token, name = '', decision = OAUTH.decision.authorize, mutate } = {}) {
    const page = await (await globalThis.fetch(url)).text()
    const request = new RegExp(`name="${OAUTH.form.request}" value="([^"]+)"`).exec(page)?.[1]
    if (request === undefined) throw new Error(HARNESS.text.noRequest + page.slice(0, HARNESS.previewChars))
    const form = new URLSearchParams({ [OAUTH.form.request]: request, [OAUTH.form.token]: token ?? '', [OAUTH.form.name]: name, [OAUTH.form.decision]: decision })
    const posted = await globalThis.fetch(new URL(K1.PATHS.decision, url), { method: WEB.post, body: form, headers: { [WEB.contentType]: WEB.form }, redirect: 'manual' })
    if (posted.status !== K1.APPROVAL_LISTENER.redirectStatus) throw new Error(HARNESS.text.badDecision + posted.status + ': ' + (await posted.text()).slice(0, HARNESS.previewChars))
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

/** Metadata only: no entry exists, so every token request is `invalid_client` and the MCP endpoint answers the Bearer challenge. */
class MetadataTarget extends FakeConnector {
  defaultHost = HARNESS.host.ipv4
  listener() { return serve((req, res) => this.web(req, res), HARNESS.ipv4Loopback) }
}

/** Starts the metadata-only target; answers `{url, requests, stop}` (and the rest of FakeConnector). */
export async function startFakeTarget() {
  const fake = await new MetadataTarget().open()
  fake.url = FakeConnector.prototype.url.call(fake)
  return fake
}
