/**
 * A fake target DSH for the MULTI-1 system rows: one ordinary connector MCP server per instance, so a
 * real standalone Fishball DSH (world.mjs) can hold several at once (PLAN-MULTI D01). It speaks only
 * what the frozen contracts define, from K1's own builders (`dsh-connector/mcp-schema`):
 * - RFC 9728 / 8414 metadata, a `client_credentials` token endpoint (the token entered for a target
 *   is the client secret, K3a), and an authorization-code endpoint is NOT served (Connect is the
 *   link-save suite's);
 * - MCP 2026-07-28: `server/discover` whose result carries the advertised name only at
 *   `_meta['io.modelcontextprotocol/serverInfo'].name` (K1 `SERVER_IDENTITY`; a `title` and a stale
 *   top-level `serverInfo` are planted to catch the wrong field), `tools/list`, `tools/call`,
 *   `resources/list` (the identity resource can be left out: an unsupported server), and
 *   `subscriptions/listen`, whose filter is recorded and acknowledged;
 * - the identity push: `rename(name)` changes the live name and sends only
 *   `notifications/resources/updated {uri: 'dsh-agent://identity'}` to every open stream that
 *   subscribed to that URI (K1 MULTI-0 "Push"); nothing on an unchanged name.
 * Pairing follows K1's rules through F-PAIR's `FakePairs` double (reused): a token's scope is `agent`
 * once its entry is paired with the caller's id. Every request is recorded with its Host and
 * Authorization, so a case proves where each credential went and which target got a call.
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { FakePairs } from '../identity/fake-connector.mjs'
import { FAKE_DSH } from './constants.mjs'
import { connectorTools } from './targets-oracle.mjs'

const RPC = FAKE_DSH.rpc
const sse = (message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`
const result = (id, body) => ({ jsonrpc: RPC.jsonrpc, id, result: { resultType: RPC.resultComplete, ...body } })
const failure = (id, code, message) => ({ jsonrpc: RPC.jsonrpc, id, error: { code, message } })
const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c).toString('utf8'))); req.on('error', () => resolve('')) })
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': FAKE_DSH.web.json, ...headers }); res.end(JSON.stringify(body)) }

/** A token value of K1's generated shape, fresh per call (no secret is a literal). */
export const newToken = () => K1.TOKEN_VALUE.generatedPrefix + randomBytes(K1.TOKEN_VALUE.generatedBytes).toString('base64url')

/**
 * Starts one fake target DSH on loopback.
 * @param {{name: string, identity?: boolean, tools?: object[], path?: string, onTool?: (name, args) => unknown}} options
 *   `name` the advertised `Implementation.name`; `identity` false leaves `dsh-agent://identity` out
 *   of `resources/list` (live identity unsupported); `tools` the listed tools (default K1's);
 *   `onTool` a scripted tool result (a promise may hold the call); `extraPaths` more MCP endpoint
 *   paths on the same origin (two targets of one origin, PLAN-MULTI §3.1 "same-origin isolation").
 */
export async function startFakeDsh({ name, identity = true, tools = connectorTools(K1.TOOLS), onTool, extraPaths = [] } = {}) {
  const pairs = new FakePairs()
  const entries = new Map()
  const issued = new Map()
  const requests = []
  const calls = []
  const listens = []
  const discovers = []
  const sockets = new Set()
  const state = { name, identity, tools: [...tools], refuseTokens: false, failDiscover: 0 }
  let entrySeq = 0

  const originOf = (req) => `${K1.HOSTS.loopbackScheme}//${req.headers.host}`
  const basicOf = (header = '') => {
    if (!header.startsWith(FAKE_DSH.web.basic)) return {}
    const [id, ...rest] = Buffer.from(header.slice(FAKE_DSH.web.basic.length), 'base64').toString('utf8').split(':')
    return { clientId: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) }
  }
  const scopeOf = (entryKey, clientId) => (pairs.pairOf(entryKey)?.id === clientId ? K1.SCOPE.full : K1.SCOPE.pair)

  function tokenEndpoint(req, res, body) {
    const form = new URLSearchParams(body)
    const basic = basicOf(req.headers.authorization)
    const clientId = basic.clientId ?? form.get(FAKE_DSH.oauth.clientId)
    const secret = basic.secret ?? form.get(FAKE_DSH.oauth.clientSecret)
    const entry = [...entries.values()].find((e) => e.secret === secret)
    if (state.refuseTokens || form.get(FAKE_DSH.oauth.grantType) !== K1.GRANT.clientCredentials || entry === undefined || !K1.isAgentId(clientId ?? '')) {
      return send(res, K1.OAUTH_ERROR_STATUS[K1.OAUTH_ERROR.invalidClient], K1.oauthErrorBody(K1.OAUTH_ERROR.invalidClient), { [FAKE_DSH.web.wwwAuthenticate]: K1.BEARER_CHALLENGE.basicScheme })
    }
    const accessToken = newToken()
    issued.set(accessToken, { entryKey: entry.entryKey, clientId })
    return send(res, K1.HTTP_STATUS.ok, K1.tokenResponse({ accessToken, scope: scopeOf(entry.entryKey, clientId) }), K1.TOKEN_RESPONSE_HEADERS)
  }

  async function toolCall(caller, toolName, args) {
    const call = { name: toolName, args, clientId: caller.clientId, endpoint: caller.endpoint, at: Date.now() }
    calls.push(call)
    if (toolName === K1.TOOL.pair) {
      const r = await pairs.pair(caller.entryKey, caller.clientId, args?.name, Date.now())
      return r.ok ? K1.okResult({ paired: r.paired, id: r.id, name: r.name }) : K1.refusalResult(r.code, { bound: r.bound, advice: r.advice })
    }
    if (toolName === K1.TOOL.setName) {
      const r = await pairs.setName(pairs.pairOf(caller.entryKey).principalKey, args?.name ?? null)
      return r.ok ? K1.okResult({ name: r.name }) : K1.refusalResult(r.code)
    }
    const scripted = await onTool?.(toolName, args, call)
    if (scripted !== undefined) return K1.okResult(scripted)
    if (toolName === K1.TOOL.inboxPoll) { const events = c.mailbox.splice(0); return K1.okResult({ events, nextCursor: FAKE_DSH.cursor, hasMore: false }) }
    if (toolName === K1.TOOL.inboxAck) { c.acked.push(...(args?.receipts ?? [])); return K1.okResult({ acked: args?.receipts?.length ?? 0 }) }
    if (toolName === K1.TOOL.approvalAnswer) return K1.okResult({ accepted: true })
    return K1.okResult({ fbtestTarget: state.name })
  }

  async function mcp(req, res, body, endpoint) {
    const origin = originOf(req)
    const auth = req.headers.authorization ?? ''
    const issuedTo = auth.startsWith(FAKE_DSH.web.bearer) ? issued.get(auth.slice(FAKE_DSH.web.bearer.length)) : undefined
    const caller = issuedTo === undefined ? undefined : { ...issuedTo, endpoint }
    if (caller === undefined) return send(res, K1.HTTP_STATUS.unauthorized, {}, { [FAKE_DSH.web.wwwAuthenticate]: auth ? K1.invalidTokenChallenge(origin) : K1.bearerChallenge(origin) })
    let message
    try { message = JSON.parse(body) } catch { return send(res, K1.HTTP_STATUS.badRequest, failure(null, RPC.parseError, 'parse error')) }
    if (message.id === undefined) { res.writeHead(FAKE_DSH.web.accepted); return res.end() }
    const full = scopeOf(caller.entryKey, caller.clientId) === K1.SCOPE.full
    const reach = K1.PAIR_ONLY.methods.includes(message.method) || (message.method === RPC.toolsCall && K1.PAIR_ONLY.tools.includes(message.params?.name))
    if (!full && !reach) return send(res, K1.HTTP_STATUS.forbidden, {}, { [FAKE_DSH.web.wwwAuthenticate]: K1.insufficientScopeChallenge(origin, K1.INSUFFICIENT_SCOPE_REASON.notPaired) })
    switch (message.method) {
      case RPC.discover: {
        discovers.push({ at: Date.now(), name: state.name })
        if (state.failDiscover > 0) { state.failDiscover -= 1; return send(res, K1.HTTP_STATUS.internalServerError, failure(message.id, RPC.internalError, 'fbtest transient')) }
        return send(res, K1.HTTP_STATUS.ok, result(message.id, {
          supportedVersions: [K1.PROTOCOL.version],
          capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: false } },
          // Decoys: neither a title nor a top-level serverInfo is the name (PLAN-MULTI §4.1).
          serverInfo: { name: FAKE_DSH.decoy.serverInfo, version: FAKE_DSH.version },
          _meta: { [K1.SERVER_IDENTITY.discoverMetaKey]: { name: state.name, title: FAKE_DSH.decoy.title, version: FAKE_DSH.version } },
        }))
      }
      case RPC.toolsList: return send(res, K1.HTTP_STATUS.ok, result(message.id, { ...FAKE_DSH.cacheable, tools: full ? state.tools : state.tools.filter((t) => K1.PAIR_ONLY.tools.includes(t.name)) }))
      case RPC.toolsCall: return send(res, K1.HTTP_STATUS.ok, result(message.id, { ...await toolCall(caller, message.params?.name, message.params?.arguments) }))
      case RPC.resourcesList: return send(res, K1.HTTP_STATUS.ok, result(message.id, { ...FAKE_DSH.cacheable, resources: [K1.RESOURCE.events, ...(state.identity ? [K1.RESOURCE.identity] : [])] }))
      case RPC.resourcesRead: {
        const uri = message.params?.uri
        const text = uri === K1.RESOURCE.identity.uri ? JSON.stringify({ name: state.name, version: FAKE_DSH.version }) : JSON.stringify({ pending: c.mailbox.length, headSequence: 0, mailboxGeneration: FAKE_DSH.generation })
        return send(res, K1.HTTP_STATUS.ok, result(message.id, { ...FAKE_DSH.cacheable, contents: [{ uri, mimeType: FAKE_DSH.web.json, text }] }))
      }
      case RPC.listen: {
        const filter = message.params?.notifications ?? {}
        // A server without the identity resource honours only what it serves (the ack names what it took).
        const honoured = { ...filter, resourceSubscriptions: (filter.resourceSubscriptions ?? []).filter((u) => u !== K1.RESOURCE.identity.uri || state.identity) }
        const listen = { filter, honoured, id: message.id, res, at: Date.now(), closed: false }
        res.on('close', () => { listen.closed = true })
        listens.push(listen)
        res.writeHead(K1.HTTP_STATUS.ok, { 'content-type': FAKE_DSH.web.sse, ...K1.TOKEN_RESPONSE_HEADERS })
        res.write(sse({ jsonrpc: RPC.jsonrpc, method: RPC.acknowledged, params: { notifications: honoured, _meta: { [RPC.subscriptionIdKey]: message.id } } }))
        return undefined
      }
      default: return send(res, K1.HTTP_STATUS.ok, failure(message.id, RPC.methodNotFound, 'method not found'))
    }
  }

  async function handle(req, res) {
    const body = await readBody(req)
    const url = new URL(req.url, originOf(req))
    const endpoint = url.pathname === K1.PATHS.mcp || extraPaths.includes(url.pathname) ? url.pathname : null
    requests.push({ method: req.method, path: url.pathname, endpoint, host: req.headers.host, authorization: req.headers.authorization ?? null, body, at: Date.now() })
    const origin = originOf(req)
    if (req.method === FAKE_DSH.web.get && url.pathname.startsWith(K1.PATHS.protectedResourcePrefix)) {
      // RFC 9728 §3.1: the resource is the endpoint whose path follows the well-known prefix.
      const resourcePath = url.pathname.slice(K1.PATHS.protectedResourcePrefix.length)
      const doc = K1.protectedResourceMetadata(origin)
      return send(res, K1.HTTP_STATUS.ok, extraPaths.includes(resourcePath) ? { ...doc, resource: origin + resourcePath } : doc)
    }
    if (req.method === FAKE_DSH.web.get && url.pathname.startsWith(K1.PATHS.authorizationServerPrefix)) return send(res, K1.HTTP_STATUS.ok, K1.authorizationServerMetadata(origin, origin))
    if (req.method === FAKE_DSH.web.post && url.pathname === K1.PATHS.token) return tokenEndpoint(req, res, body)
    if (endpoint !== null && req.method === FAKE_DSH.web.post) return mcp(req, res, body, endpoint)
    return send(res, K1.HTTP_STATUS.notFound, {})
  }
  const server = http.createServer((req, res) => { handle(req, res).catch(() => { try { res.destroy() } catch { /* gone */ } }) })
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  await new Promise((resolve) => server.listen(0, FAKE_DSH.bindHost, resolve))
  const port = server.address().port
  const openStreams = (uri) => listens.filter((l) => !l.res.destroyed && !l.res.writableEnded && (l.honoured.resourceSubscriptions ?? []).includes(uri))

  const c = {
    port, requests, calls, listens, discovers, state, pairs,
    mailbox: [],
    acked: [],
    /** This target's MCP URL under a loopback name (two names of one fake: two origins, R9). */
    url: (host = FAKE_DSH.host.first, pathname = K1.PATHS.mcp) => `${K1.HOSTS.loopbackScheme}//${host}:${port}${pathname}`,
    /** A new token entry; its secret is what the user enters for this target. */
    addEntry() { const entry = { entryKey: FAKE_DSH.entryPrefix + ++entrySeq, secret: newToken() }; entries.set(entry.entryKey, entry); return entry },
    /** The secrets presented at the token endpoint, in order, with the Host each went to. */
    presented: () => requests.filter((r) => r.path === K1.PATHS.token).map((r) => ({ host: r.host, secret: basicOf(r.authorization ?? '').secret ?? new URLSearchParams(r.body).get(FAKE_DSH.oauth.clientSecret) })),
    callsOf: (toolName) => calls.filter((x) => x.name === toolName),
    /** The live name changes; the identity push goes to every stream that subscribed to the URI. */
    rename(next) {
      if (next === state.name) return 0
      state.name = next
      return c.pushIdentity()
    },
    /** One standard `notifications/resources/updated {uri: identity}` to each subscribed stream; returns how many. */
    pushIdentity() {
      const streams = openStreams(K1.RESOURCE.identity.uri)
      for (const l of streams) l.res.write(sse({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: K1.RESOURCE.identity.uri } }))
      return streams.length
    },
    /** The events hint after `enqueue`. */
    hintEvents() { for (const l of openStreams(K1.RESOURCE.events.uri)) l.res.write(sse({ jsonrpc: RPC.jsonrpc, method: RPC.resourceUpdated, params: { uri: K1.RESOURCE.events.uri } })) },
    enqueue(...events) { c.mailbox.push(...events); c.hintEvents() },
    /** Ends every open listen stream (the link reconnects and listens again). */
    dropStreams() { for (const l of listens) l.res.destroy() },
    /** Requests received after `at` (ms epoch): what a runtime still running after a close would send. */
    requestsAfter: (at) => requests.filter((r) => r.at > at),
    /** Listen streams the client has not closed. */
    openListens: () => listens.filter((l) => !l.closed),
    /** Every access token dies (an auth refusal on the next request). */
    revokeAll() { issued.clear(); state.refuseTokens = true; c.dropStreams() },
    /** The tool list changes and `tools/list_changed` would be sent; the link re-lists on reconnect. */
    setTools(list) { state.tools = [...list] },
    stop: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()) }),
  }
  return c
}
