/**
 * A fake Fishball connector for the F-PAIR cases: F-PAIR's own copy of the F-LINK fake-connector
 * pattern (the brief forbids importing it from another task's folder). It speaks only what the
 * requirements and the frozen K1 module define:
 * - RFC 9728 / 8414 metadata from K1's builders;
 * - a `client_credentials` token endpoint whose `scope` follows R-OA-04 / R-ID-03: `fishball` when
 *   the token's entry is bound to the caller's id, else `fishball:pair`; `invalid_client` for an
 *   unknown or disabled entry or an invalid id (R-ID-02);
 * - an MCP 2026-07-28 endpoint (discover, tools/list, tools/call, listen) with K1's envelope, where
 *   a pair-only access token reaches exactly K1 PAIR_ONLY and the scope is evaluated live (R-ID-03).
 *
 * `pair` and `set_name` go to a `PairStore` (K1 index.d.ts subset: `pairOf`, `byPrincipal`,
 * `list`, `pair`, `setName`, `seen`). The unit rows pass FakePairs below, a test double that
 * follows K1's rules (R-ID-04 / R-ID-13 precedence, K1 `checkName` / `nameKey`); the NAME-UC-02
 * integration rows pass C-PAIR's real store.
 *
 * Every request it receives is recorded (method, path, headers, body), so a case can count what
 * core sent (AUTH-UC-05 E1: nothing while the warning is open). `drop()` / `restore()` make the
 * target unreachable and bring it back on the same port.
 */
import http from 'node:http'
import { HARNESS, K1, MAILBOX, RPC, WEB, token } from './constants.mjs'

const SSE_FRAME = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
/** MCP 2026-07-28 CacheableResult: list/read results need `ttlMs` and `cacheScope` (0 / private: never cached). */
const CACHEABLE = Object.freeze({ ttlMs: 0, cacheScope: 'private' })
const PRINCIPAL_PREFIX = 'fbtest-principal-'

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
const rpcResult = (id, result) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...result } })
const rpcError = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })

/**
 * An in-memory pair registry following K1's `PairStore` rules for the members the fake uses.
 * Not C-PAIR: a double whose answers are derived from R-ID-03/04/13 and R-NAME-02/06 only.
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
        ok: false,
        code: K1.REFUSAL.alreadyPaired,
        bound: { idMatches, boundId: bound.id, name: bound.name, pairedAt: bound.pairedAt, lastSeenAt: bound.lastSeenAt },
        advice: idMatches ? K1.PAIR_ADVICE.idMatches : K1.PAIR_ADVICE.idDiffers,
      }
    }
    if (this.list().some((p) => p.id === id)) return { ok: false, code: K1.REFUSAL.idTaken }
    const principalKey = PRINCIPAL_PREFIX + entryKey
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

/**
 * Starts a fake connector on a dual-stack loopback port.
 * @param {{store: object, entries: Array<{entryKey: string, secret: string, enabled?: boolean}>,
 *   now?: () => number, extraTokenFields?: object}} options
 *   `entries` is the fake token registry (R-TOK); `extraTokenFields` adds custom fields to every
 *   token response (AUTH-DT-06 rule 9: core must not read them).
 */
export async function startFakeConnector({ store, entries, now = Date.now, extraTokenFields = {} }) {
  const requests = []
  const listens = []
  const calls = []
  const issued = new Map()
  const sockets = new Set()
  const registry = new Map(entries.map((e) => [e.entryKey, { ...e, enabled: e.enabled ?? true }]))
  /** One-shot: before the next `pair` on this entry, another client binds it (AUTH-DT-06 rule 7). */
  const racers = new Map()
  let port = 0

  const originOf = (req) => `http://${req.headers.host}`
  const entryBySecret = (secret) => [...registry.values()].find((e) => e.secret === secret)
  const liveScope = (entryKey, clientId) => (store.pairOf(entryKey)?.id === clientId ? K1.SCOPE.full : K1.SCOPE.pair)

  function clientOf(req, form) {
    const basic = req.headers.authorization ?? ''
    if (basic.startsWith(WEB.basic)) {
      const [id, ...rest] = Buffer.from(basic.slice(WEB.basic.length), 'base64').toString('utf8').split(':')
      return { clientId: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) }
    }
    return { clientId: form.get(WEB.formClientId), secret: form.get(WEB.formSecret) }
  }

  function tokenEndpoint(req, res, body) {
    const form = new URLSearchParams(body)
    const { clientId, secret } = clientOf(req, form)
    const entry = entryBySecret(secret)
    if (form.get(WEB.formGrant) !== K1.GRANT.clientCredentials || entry === undefined || !entry.enabled || !K1.isFishballId(clientId)) {
      const error = K1.OAUTH_ERROR.invalidClient
      return sendJson(res, K1.OAUTH_ERROR_STATUS[error], K1.oauthErrorBody(error), { 'www-authenticate': K1.BEARER_CHALLENGE.basicScheme })
    }
    const accessToken = token()
    issued.set(accessToken, { entryKey: entry.entryKey, clientId })
    return sendJson(res, K1.HTTP_STATUS.ok, { ...K1.tokenResponse({ accessToken, scope: liveScope(entry.entryKey, clientId) }), ...extraTokenFields }, K1.TOKEN_RESPONSE_HEADERS)
  }

  async function toolResult(caller, name, args) {
    const call = { name, args, clientId: caller.clientId, entryKey: caller.entryKey, result: undefined }
    calls.push(call)
    if (name === K1.TOOL.pair) {
      const racer = racers.get(caller.entryKey)
      if (racer !== undefined) { racers.delete(caller.entryKey); await store.pair(caller.entryKey, racer, undefined, now()) }
      const result = await store.pair(caller.entryKey, caller.clientId, args?.name, now())
      call.result = result
      if (result.ok) return K1.okResult({ paired: result.paired, id: result.id, name: result.name, ...pick(result, ['nameAssigned', 'nameRefused']) })
      return K1.refusalResult(result.code, pick(result, ['bound', 'advice']))
    }
    if (name === K1.TOOL.setName) {
      const result = await store.setName(store.pairOf(caller.entryKey).principalKey, args?.name ?? null)
      call.result = result
      return result.ok ? K1.okResult({ name: result.name }) : K1.refusalResult(result.code)
    }
    if (name === K1.TOOL.inboxPoll) return K1.okResult({ events: [], nextCursor: MAILBOX.cursor, hasMore: false })
    if (name === K1.TOOL.inboxAck) return K1.okResult({ acked: args?.receipts?.length ?? 0 })
    return K1.okResult({})
  }

  async function mcpEndpoint(req, res, body) {
    const origin = originOf(req)
    const auth = req.headers.authorization ?? ''
    const caller = auth.startsWith(WEB.bearer) ? issued.get(auth.slice(WEB.bearer.length)) : undefined
    // A token of a disabled entry is dead at once (AUTH-ST-02 row 4).
    if (caller === undefined || !registry.get(caller.entryKey)?.enabled) {
      return sendJson(res, K1.HTTP_STATUS.unauthorized, {}, { 'www-authenticate': auth ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    }
    let message
    try { message = JSON.parse(body) } catch { return sendJson(res, K1.HTTP_STATUS.badRequest, rpcError(null, RPC.parseError, 'parse error')) }
    if (message.id === undefined) { res.writeHead(WEB.accepted); return res.end() }
    const full = liveScope(caller.entryKey, caller.clientId) === K1.SCOPE.full
    const toolName = message.params?.name
    const pairOnlyReach = K1.PAIR_ONLY.methods.includes(message.method) || (message.method === RPC.toolsCall && K1.PAIR_ONLY.tools.includes(toolName))
    if (!full && !pairOnlyReach) {
      const reason = store.pairOf(caller.entryKey) === undefined ? K1.INSUFFICIENT_SCOPE_REASON.notPaired : K1.INSUFFICIENT_SCOPE_REASON.idMismatch
      return sendJson(res, K1.HTTP_STATUS.forbidden, {}, { 'www-authenticate': K1.insufficientScopeChallenge(origin, reason) })
    }
    if (full) {
      const pair = store.pairOf(caller.entryKey)
      if (pair !== undefined) store.seen(pair.principalKey, now())
    }
    switch (message.method) {
      case RPC.discover:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          supportedVersions: [K1.PROTOCOL.version],
          capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: false } },
        }))
      case RPC.toolsList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...CACHEABLE, tools: full ? K1.TOOLS : K1.TOOLS.filter((t) => K1.PAIR_ONLY.tools.includes(t.name)) }))
      case RPC.toolsCall:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...await toolResult(caller, toolName, message.params?.arguments) }))
      case RPC.resourcesRead:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, {
          ...CACHEABLE,
          contents: [{ uri: K1.RESOURCE.events.uri, mimeType: K1.RESOURCE.events.mimeType, text: JSON.stringify({ pending: 0, headSequence: 0, mailboxGeneration: MAILBOX.generation }) }],
        }))
      case RPC.resourcesList:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcResult(message.id, { ...CACHEABLE, resources: [K1.RESOURCE.events] }))
      case RPC.listen: {
        const filter = message.params?.notifications ?? {}
        listens.push({ filter, clientId: caller.clientId, entryKey: caller.entryKey, at: Date.now(), res })
        res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': WEB.sse, ...K1.TOKEN_RESPONSE_HEADERS })
        res.write(SSE_FRAME({ jsonrpc: RPC.jsonrpc, method: RPC.acknowledged, params: { notifications: filter, _meta: { [RPC.subscriptionIdKey]: message.id } } }))
        return undefined
      }
      default:
        return sendJson(res, K1.HTTP_STATUS.ok, rpcError(message.id, RPC.methodNotFound, 'method not found'))
    }
  }

  async function handle(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, originOf(req))
    requests.push({ method: req.method, path: url.pathname, query: url.search, headers: { ...req.headers }, body })
    const origin = originOf(req)
    if (req.method === WEB.get && url.pathname === K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp) return sendJson(res, K1.HTTP_STATUS.ok, K1.protectedResourceMetadata(origin))
    if (req.method === WEB.get && url.pathname === K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer) return sendJson(res, K1.HTTP_STATUS.ok, K1.authorizationServerMetadata(origin, origin))
    if (req.method === WEB.post && url.pathname === K1.PATHS.token) return tokenEndpoint(req, res, body)
    if (url.pathname === K1.PATHS.mcp) {
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
    store,
    requests,
    listens,
    calls,
    callsOf: (name) => calls.filter((c) => c.name === name),
    /** Listen streams opened on the events resource (R-CON-04, K1 CONNECTED). */
    eventListens: () => listens.filter((l) => (l.filter.resourceSubscriptions ?? []).includes(K1.CONNECTED.listenResource)),
    tokenRequests: () => requests.filter((r) => r.path === K1.PATHS.token),
    /** The client ids of every token request, in order (Basic or POST form). */
    tokenClientIds: () => requests.filter((r) => r.path === K1.PATHS.token).map((r) => clientOf({ headers: r.headers }, new URLSearchParams(r.body)).clientId),
    /** The secrets of every token request, in order. */
    tokenSecrets: () => requests.filter((r) => r.path === K1.PATHS.token).map((r) => clientOf({ headers: r.headers }, new URLSearchParams(r.body)).secret),
    /** Every access token issued so far (the leak oracles look for them too). */
    issuedTokens: () => [...issued.keys()],
    /**
     * The user switches a token entry off or on (R-TOK, R-HOST-10). Off kills the entry's access
     * tokens at once (AUTH-ST-02 row 4) and ends its open listen streams, so the link sees it.
     */
    setEnabled: (entryKey, enabled) => {
      registry.get(entryKey).enabled = enabled
      if (!enabled) for (const l of listens) if (l.entryKey === entryKey) l.res.destroy()
    },
    /** Another client binds `entryKey` to `id` just before core's next `pair` on it. */
    bindBeforeNextPair: (entryKey, id) => { racers.set(entryKey, id) },
    drop: close,
    restore: listen,
    stop: close,
  }
}

function pick(object, keys) {
  return Object.fromEntries(keys.filter((k) => object[k] !== undefined).map((k) => [k, object[k]]))
}
