/**
 * V3-S7b throwaway prototype: the connector as its own OAuth authorization server for BOTH grants
 * (client_credentials and authorization_code + PKCE with Client ID Metadata Documents and rotating
 * refresh tokens), with the metadata, token endpoint and MCP endpoint on DSH's listener and the
 * token-only approval page on the connector's own approval listener (design §5.5, §5.5a; R-OA-01…20).
 * Loaded into a disposable DSH by a patch `insert` row. NOT product code.
 *
 * Deliberate simplifications (S7b does not test them): entries, pairs and names live in memory
 * (the spike's entry list is fixed in constants), and a control route stands in for the native
 * settings form. Everything S7b does test follows the design: token values only in
 * `ctx.credentials`, digests in memory, constant-time comparison, audience binding, uniform
 * refusals, revocation by generation, values only in POST bodies, `no-store` on the page.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { join } from 'node:path'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { createCimdFetcher } from './cimd-fetch.mjs'
import { S7B } from './constants.mjs'
import { escapeHtml, readBody, sendEmpty, sendJson, toRequest, writeResponse } from './http-util.mjs'

export const name = 'fishball-s7b-oauth-spike'
export const inject = ['webServer', 'credentials', 'webStartup']

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest()
const hex = (value) => sha256(value).toString('hex')
const opaque = () => randomBytes(S7B.opaqueBytes).toString('base64url')
const newTokenValue = () => S7B.tokenPrefix + randomBytes(S7B.tokenBytes).toString('base64url')
const sameDigest = (a, b) => a !== undefined && b !== undefined && timingSafeEqual(a, b)
const s256 = (verifier) => createHash('sha256').update(verifier, 'ascii').digest('base64url')
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/
const SEE_OTHER = 303

/** Same loopback rule as DSH's own fence (dsh-client-connection isLoopbackHostname). */
const isLoopbackHostname = (hostname) => hostname === 'localhost' || hostname === '[::1]'
  || (/^127(\.\d{1,3}){3}$/.test(hostname) && hostname.split('.').every((p) => Number(p) <= 255))

/** R-NAME-02: trim, collapse inner whitespace, NFC; 1–64 chars, no control characters. Fold = case-insensitive key. */
function normaliseName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/gu, ' ').normalize('NFC')
  if (name === '') return { empty: true }
  if ([...name].length > S7B.nameMaxChars || /\p{Cc}/u.test(name)) return { invalid: true }
  return { name, fold: name.toLowerCase() }   // spike approximation of Unicode case folding
}

export function apply(ctx, config = {}) {
  const web = ctx.webServer
  const trustedHosts = ctx.webStartup?.trustedHosts ?? []
  let clockOffsetMs = 0
  const now = () => Date.now() + clockOffsetMs
  const controlKey = randomBytes(16).toString('hex')
  const cimdHosts = config.cimdHosts ?? {}
  const cimd = createCimdFetcher({
    // Simulated DNS for the spike's client hosts; every answer still goes through the private-address check.
    resolve: async (hostname) => (cimdHosts[hostname] ? [cimdHosts[hostname].address] : []),
    route: (address) => {
      const host = Object.values(cimdHosts).find((h) => h.address === address)
      return { host: S7B.host, port: host?.port ?? 1 }
    },
    ca: config.cimdCaFile ? readFileSync(config.cimdCaFile) : undefined,
    now,
  })

  const state = {
    entries: new Map(S7B.entries.map((e) => [e.key, { ...e, enabled: true, deleted: false, digest: undefined, valueChars: 0, generation: 0, binding: undefined }])),
    accessTokens: new Map(),   // digest hex -> {entryKey, generation, id, audience, expiresAt, chainId?}
    refreshTokens: new Map(),  // digest hex -> {entryKey, generation, clientId, audience, chainId, used}
    chains: new Map(),         // chainId -> {revoked}
    codes: new Map(),          // digest hex -> {entryKey, clientId, redirectUri, challenge, resource, expiresAt, used, chainId}
    pending: new Map(),        // request id -> pending browser authorization
    failures: new Map(),       // remote address -> failure timestamps (shared by token endpoint and page)
    handlers: new Map(),
    approval: { port: config.approvalPort, server: undefined, status: S7B.status.ok, diagnostics: [] },
    // Spike-only fault injection: a wrong `iss` on authorization responses, to show the clients enforce RFC 9207.
    issOverride: undefined,
    // Q-S7B-1 option B (off by default = R-OA-16 as written): a used refresh token presented again within
    // this window by the same client for the same resource gets the identical successor response instead
    // of revoking the chain. Held in memory only, for the window only.
    refreshGraceMs: config.refreshGraceMs ?? 0,
    stats: { tokenRequests: 0, pageAuthorizeAttempts: 0, cimd: cimd.stats, refused: {}, mcp: {}, tokenForms: [], metadataFetches: 0 },
  }
  const countRefusal = (code) => { state.stats.refused[code] = (state.stats.refused[code] ?? 0) + 1 }

  // ---- credentials -----------------------------------------------------------------------------
  async function refreshDigest(entry) {
    const resolved = await ctx.credentials.resolve(entry.ref)
    entry.digest = resolved === undefined ? undefined : sha256(resolved.value)
    entry.valueChars = resolved === undefined ? 0 : resolved.value.length
  }
  async function ensureValues() {
    for (const entry of state.entries.values()) {
      const info = await ctx.credentials.describe(entry.ref)
      if (!info.configured && info.writable) await ctx.credentials.set(entry.ref, newTokenValue())
      await refreshDigest(entry)
    }
  }
  ctx.on('credentials/reference-updated', async (ref) => {
    for (const entry of state.entries.values()) if (entry.ref === ref) { await refreshDigest(entry); revokeEntry(entry) }
  })

  /** Constant-time scan of every usable entry (enabled, not deleted, value ≥ 32 chars: TQ-4). */
  function entryForValue(value) {
    const digest = sha256(value)
    let found
    for (const entry of state.entries.values()) {
      const usable = entry.enabled && !entry.deleted && entry.valueChars >= S7B.minTokenChars
      if (sameDigest(digest, entry.digest) && usable) found = entry
    }
    return found
  }
  const liveEntry = (key, generation) => {
    const entry = state.entries.get(key)
    return entry && entry.enabled && !entry.deleted && entry.generation === generation ? entry : undefined
  }

  /** Disable, delete and value change all bump the generation: every derived AT, RT and code dies, and re-enabling revives none. */
  function revokeEntry(entry) {
    entry.generation += 1
    const handler = state.handlers.get(entry.key)
    state.handlers.delete(entry.key)
    handler?.close().catch(() => undefined)
  }

  // ---- failure limit shared by the token endpoint and the page (R-OA-17) --------------------------
  const remoteOf = (req) => req.socket.remoteAddress ?? 'unknown'
  function limited(req) {
    const list = (state.failures.get(remoteOf(req)) ?? []).filter((t) => t > now() - S7B.failureLimit.windowMs)
    state.failures.set(remoteOf(req), list)
    return list.length >= S7B.failureLimit.max
  }
  const recordFailure = (req) => state.failures.set(remoteOf(req), [...(state.failures.get(remoteOf(req)) ?? []), now()])

  // ---- hosts, issuer, canonical URI (R-OA-01, R-REM-03, R-REM-05) ----------------------------------
  /** Authority check against loopback, the bind address and --trusted-host. X-Forwarded-* is never read. */
  function checkedHost(req, protocolForDefaultPort) {
    const host = req.headers.host
    if (typeof host !== 'string') return undefined
    let url
    try { url = new URL(`${protocolForDefaultPort}//${host}`) } catch { return undefined }
    if (url.username || url.password || url.pathname !== '/') return undefined
    const loopback = isLoopbackHostname(url.hostname)
    const bind = web.host === url.hostname || `[${web.host}]` === url.hostname
    const trusted = trustedHosts.some((entry) => {
      const e = new URL(`${protocolForDefaultPort}//${entry}`)
      return entry.includes(':') && !entry.startsWith('[') ? e.host === url.host : e.hostname === url.hostname
    })
    if (!loopback && !bind && !trusted) return undefined
    // R-REM-05 (3): loopback keeps the listener's own scheme; any other allowed host is https (the user's tunnel terminates TLS).
    const scheme = loopback ? web.protocol : 'https:'
    return { url, loopback, origin: `${scheme}//${url.host}` }
  }
  const issuerFor = (h) => h.origin + S7B.paths.issuer
  const resourceFor = (h) => h.origin + S7B.paths.mcp
  const prmUrlFor = (h) => h.origin + S7B.paths.prmPrefix + S7B.paths.mcp
  /** The approval page origin as clients see it: loopback → same hostname, approval port; tunnel → same host, path-routed (Q-S7B-3). */
  const approvalOriginFor = (h) => (h.loopback ? `http://${h.url.hostname}:${state.approval.port}` : h.origin)
  /** On the approval listener the issuer is rebuilt from the Host the browser used: loopback hostname + DSH's port, or the tunnel host. */
  function dshHostForApproval(req) {
    const h = checkedHost(req, 'http:')
    if (h === undefined) return undefined
    if (!h.loopback) return h
    const authority = `${h.url.hostname}:${web.port}`
    return { url: new URL(`${web.protocol}//${authority}`), loopback: true, origin: `${web.protocol}//${authority}` }
  }
  /** A present Origin must be this very origin (S1 F3; R-REM-03). */
  const originAllowed = (req, expected) => req.headers.origin === undefined || req.headers.origin === expected

  // ---- metadata ---------------------------------------------------------------------------------
  const asMetadata = (h) => ({
    issuer: issuerFor(h),
    token_endpoint: h.origin + S7B.paths.token,
    // Always listed, also while the approval port is taken (Q-OA-7 A: stock parsers require it, S1/S7).
    authorization_endpoint: approvalOriginFor(h) + S7B.paths.authorize,
    grant_types_supported: Object.values(S7B.grants),
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [S7B.scope.full, S7B.scope.pair],
  })
  const prm = (h) => ({ resource: resourceFor(h), authorization_servers: [issuerFor(h)], bearer_methods_supported: ['header'], scopes_supported: [S7B.scope.full] })

  // ---- token endpoint -----------------------------------------------------------------------------
  const oauthError = (res, status, error, headers = {}) => sendJson(res, status, { error }, headers)
  const invalidClient = (req, res) => { recordFailure(req); countRefusal('invalid_client'); oauthError(res, 401, 'invalid_client', { 'www-authenticate': 'Basic realm="fishball"' }) }

  function clientSecretAuth(req, form) {
    const header = req.headers.authorization
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
      const colon = decoded.indexOf(':')
      if (colon < 0) return { method: 'client_secret_basic' }
      return { method: 'client_secret_basic', id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) }
    }
    if (form.has('client_secret')) return { method: 'client_secret_post', id: form.get('client_id') ?? '', secret: form.get('client_secret') }
    return undefined
  }

  function issueAccessToken(entry, id, audience, chainId) {
    const accessToken = opaque()
    state.accessTokens.set(hex(accessToken), { entryKey: entry.key, generation: entry.generation, id, audience, expiresAt: now() + S7B.accessLifetimeSeconds * 1000, chainId })
    return accessToken
  }
  function issueRefreshToken(entry, clientId, audience, chainId) {
    const refreshToken = opaque()
    state.refreshTokens.set(hex(refreshToken), { entryKey: entry.key, generation: entry.generation, clientId, audience, chainId, used: false })
    return refreshToken
  }
  /** Reuse detection and code replay revoke every AT and RT descending from one code (R-OA-14, R-OA-16 (2)). */
  function revokeChain(chainId) {
    state.chains.set(chainId, { revoked: true })
    for (const [k, r] of state.accessTokens) if (r.chainId === chainId) state.accessTokens.delete(k)
    for (const [k, r] of state.refreshTokens) if (r.chainId === chainId) state.refreshTokens.delete(k)
  }
  const bearerTokens = (entry, accessToken, scope, refreshToken) => ({
    access_token: accessToken, token_type: 'Bearer', expires_in: S7B.accessLifetimeSeconds, scope,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  })

  async function tokenEndpoint(req, res) {
    if (req.method !== 'POST') return sendEmpty(res, 405, { allow: 'POST' })
    const h = checkedHost(req, web.protocol)
    if (h === undefined) return sendEmpty(res, 403)
    if (!originAllowed(req, h.origin)) return sendEmpty(res, 403)
    if (new URL(req.url, h.origin).search !== '') return oauthError(res, 400, 'invalid_request')
    if (limited(req)) { countRefusal('rate-limited'); return oauthError(res, 429, 'invalid_client', { 'retry-after': String(S7B.failureLimit.windowMs / 1000) }) }
    const body = await readBody(req, S7B.maxFormBytes)
    if (body === undefined) return oauthError(res, 413, 'invalid_request')
    const form = new URLSearchParams(body.toString('utf8'))
    state.stats.tokenRequests += 1
    const grant = form.get('grant_type')
    state.stats.tokenForms.push({ grant, params: [...form.keys()].sort(), scope: form.get('scope'), basic: req.headers.authorization?.startsWith('Basic ') === true })
    const resource = form.get('resource')
    const resourceOk = resource === resourceFor(h)
    switch (grant) {
      case S7B.grants.cc: {
        const auth = clientSecretAuth(req, form)
        if (auth?.secret === undefined) return invalidClient(req, res)
        const entry = entryForValue(auth.secret)
        if (entry === undefined || !S7B.idPattern.test(auth.id)) return invalidClient(req, res)
        if (!resourceOk) { countRefusal('invalid_target'); return oauthError(res, 400, 'invalid_target') }
        // R-OA-04: pair state decides the scope; a requested `fishball` is narrowed, never refused (OAuth 2.1 §1.4.1).
        const full = entry.binding?.id === auth.id
        return sendJson(res, 200, bearerTokens(entry, issueAccessToken(entry, auth.id, resource), full ? S7B.scope.full : S7B.scope.pair))
      }
      case S7B.grants.code: {
        // Public client (CIMD, token_endpoint_auth_method none): a client secret here is refused.
        if (clientSecretAuth(req, form) !== undefined) return invalidClient(req, res)
        const code = form.get('code') ?? ''
        const record = state.codes.get(hex(code))
        if (record === undefined) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        if (record.used) { revokeChain(record.chainId); countRefusal('code-replay'); return oauthError(res, 400, 'invalid_grant') }
        const verifier = form.get('code_verifier') ?? ''
        const ok = record.expiresAt > now() && record.clientId === form.get('client_id') && record.redirectUri === form.get('redirect_uri')
          && PKCE_VERIFIER.test(verifier) && s256(verifier) === record.challenge
        if (!ok) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        if (resource !== record.resource) { countRefusal('invalid_target'); return oauthError(res, 400, 'invalid_target') }
        record.used = true
        const entry = liveEntry(record.entryKey, record.generation)
        if (entry === undefined) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        const at = issueAccessToken(entry, entry.binding.id, resource, record.chainId)
        const rt = issueRefreshToken(entry, record.clientId, resource, record.chainId)
        return sendJson(res, 200, bearerTokens(entry, at, S7B.scope.full, rt))
      }
      case S7B.grants.refresh: {
        // Machine clients never hold refresh tokens (Q27): any value they present is unknown → invalid_grant.
        const record = state.refreshTokens.get(hex(form.get('refresh_token') ?? ''))
        if (record === undefined) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        const sameCaller = record.clientId === form.get('client_id') && resource === record.audience
        if (record.used && record.grace && record.grace.until > now() && sameCaller && liveEntry(record.entryKey, record.generation)) {
          countRefusal('refresh-grace-replay')
          return sendJson(res, 200, record.grace.body)
        }
        if (record.used) { revokeChain(record.chainId); countRefusal('refresh-reuse'); return oauthError(res, 400, 'invalid_grant') }
        if (record.clientId !== form.get('client_id') || clientSecretAuth(req, form) !== undefined) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        if (resource !== record.audience) { countRefusal('invalid_target'); return oauthError(res, 400, 'invalid_target') }
        const entry = liveEntry(record.entryKey, record.generation)
        if (entry === undefined) { countRefusal('invalid_grant'); return oauthError(res, 400, 'invalid_grant') }
        record.used = true   // rotation: the presented RT is spent; its successor carries the chain on
        const at = issueAccessToken(entry, entry.binding.id, resource, record.chainId)
        const rt = issueRefreshToken(entry, record.clientId, resource, record.chainId)
        const response = bearerTokens(entry, at, S7B.scope.full, rt)
        if (state.refreshGraceMs > 0) record.grace = { body: response, until: now() + state.refreshGraceMs }
        return sendJson(res, 200, response)
      }
      default:
        countRefusal('unsupported_grant_type')
        return oauthError(res, 400, 'unsupported_grant_type')
    }
  }

  // ---- MCP endpoint -------------------------------------------------------------------------------
  function principalFor(bearer, audience) {
    const record = state.accessTokens.get(hex(bearer))
    if (record === undefined || record.expiresAt <= now() || record.audience !== audience) return undefined
    const entry = liveEntry(record.entryKey, record.generation)
    if (entry === undefined) return undefined
    return { entry, id: record.id }
  }
  // Scope is evaluated live, so `pair` upgrades the very access token that called it (R-ID-03).
  const isFull = (p) => p.entry.binding?.id === p.id
  const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value })

  function makeServer(principal) {
    const server = new McpServer({ name: 'fishball-s7b', version: '0.0.0' }, {
      capabilities: { tools: {}, extensions: { [S7B.extension]: {} } },
    })
    server.registerTool(S7B.pairOnly.tool, { description: 'Bind this token to the caller id', inputSchema: { name: z.string().optional() } }, async ({ name: rawName }) => {
      const entry = principal.entry
      if (entry.binding) return result({ ok: false, code: 'already-paired', bound: { idMatches: entry.binding.id === principal.id } })
      if ([...state.entries.values()].some((e) => !e.deleted && e.binding?.id === principal.id)) return result({ ok: false, code: 'id-taken' })
      const n = normaliseName(rawName)
      const usable = n.name !== undefined && !nameHeld(n.fold, entry)
      entry.binding = { id: principal.id, name: usable ? n.name : null, fold: usable ? n.fold : undefined, kind: 'machine', pairedAt: now(), lastSeenAt: now() }
      return result({ ok: true, paired: true, id: principal.id, name: entry.binding.name, nameAssigned: usable })
    })
    if (isFull(principal)) {
      server.registerTool('whoami', { description: 'Echo the principal (spike only)' }, async () =>
        result({ ok: true, entry: principal.entry.key, id: principal.id, name: principal.entry.binding.name, kind: principal.entry.binding.kind }))
    }
    return server
  }
  function handlerFor(entry) {
    let handler = state.handlers.get(entry.key)
    if (handler === undefined) {
      handler = createMcpHandler(({ authInfo }) => makeServer(authInfo.extra.principal), { legacy: 'reject' })
      state.handlers.set(entry.key, handler)
    }
    return handler
  }

  function challenge(h, extra) {
    return `Bearer resource_metadata="${prmUrlFor(h)}", scope="${S7B.scope.full}"${extra}`
  }

  async function mcpRoute(req, res) {
    if (req.method !== 'POST') return sendEmpty(res, 405, { allow: 'POST' })
    const h = checkedHost(req, web.protocol)
    if (h === undefined) return sendEmpty(res, 403)
    if (!originAllowed(req, h.origin)) return sendEmpty(res, 403)
    const header = req.headers.authorization
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
    const principal = bearer === undefined ? undefined : principalFor(bearer, resourceFor(h))
    if (principal === undefined) {
      countRefusal('401')
      return sendEmpty(res, 401, { 'www-authenticate': challenge(h, bearer === undefined ? '' : ', error="invalid_token"') })
    }
    const body = await readBody(req, S7B.maxFormBytes * 8)
    if (body === undefined) return sendEmpty(res, 413)
    if (!isFull(principal)) {
      // R-OA-04 / R-ID-06: a pair-only token reaches discovery, tools/list and `pair` only; the rest is 403 insufficient_scope.
      let message
      try { message = JSON.parse(body.toString('utf8')) } catch { message = undefined }
      const allowed = message && (S7B.pairOnly.methods.includes(message.method)
        || (message.method === 'tools/call' && message.params?.name === S7B.pairOnly.tool))
      if (!allowed) {
        countRefusal('403-insufficient_scope')
        const why = principal.entry.binding ? 'id-mismatch' : 'not-paired'
        return sendEmpty(res, 403, { 'www-authenticate': `Bearer error="insufficient_scope", scope="${S7B.scope.full}", resource_metadata="${prmUrlFor(h)}", error_description="${why}"` })
      }
    }
    if (principal.entry.binding) principal.entry.binding.lastSeenAt = now()
    let method
    try { method = JSON.parse(body.toString('utf8')).method } catch { method = 'unparsed' }
    const key = `${principal.id}:${method}`
    state.stats.mcp[key] = (state.stats.mcp[key] ?? 0) + 1
    const authInfo = { token: '[held]', clientId: principal.id, scopes: [isFull(principal) ? S7B.scope.full : S7B.scope.pair], extra: { principal } }
    await writeResponse(res, await handlerFor(principal.entry).fetch(toRequest(req, res, h.origin, body), { authInfo }))
  }

  // ---- approval listener (R-OA-11…15, R-OA-20) ---------------------------------------------------
  const PAGE_HEADERS = Object.freeze({
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', pragma: 'no-cache',
    'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  })
  function page(res, status, title, inner) {
    res.writeHead(status, PAGE_HEADERS)
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1>${inner}</body></html>`)
  }
  const errorPage = (res, message) => page(res, 400, 'Authorization error', `<p role="alert">${escapeHtml(message)}</p>`)

  // 303 after the POST form (RFC 9700 §4.12: never 307, which would re-POST the token value to the client).
  function redirectTo(res, redirectUri, params, status = 302) {
    const url = new URL(redirectUri)
    const out = state.issOverride ? { ...params, iss: state.issOverride } : params
    for (const [k, v] of Object.entries(out)) if (v !== undefined && v !== null) url.searchParams.set(k, v)
    res.writeHead(status, { location: url.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
    res.end()
  }

  /** Exact match, except a loopback http redirect may differ in port only (OAuth 2.1 §2.3.1, §8.4.2). */
  function redirectAllowed(requested, registered) {
    let r
    try { r = new URL(requested) } catch { return false }
    return registered.some((value) => {
      if (value === requested) return true
      const g = new URL(value)
      return r.protocol === 'http:' && g.protocol === 'http:' && isLoopbackHostname(g.hostname)
        && r.hostname === g.hostname && r.pathname === g.pathname && r.search === g.search && r.hash === '' && r.username === '' && r.password === ''
    })
  }

  function renderForm(res, pending, message, status = 200) {
    pending.nonce = opaque()   // single-use form value, bound to this pending request (R-OA-17)
    const redirectHost = new URL(pending.redirectUri).hostname
    const localhostOnly = pending.doc.redirect_uris.every((u) => isLoopbackHostname(new URL(u).hostname))
    page(res, status, `Authorize ${pending.doc.client_name} (unverified)`, [
      message ? `<p role="alert">${escapeHtml(message)}</p>` : '',
      `<p>Client: <b>${escapeHtml(pending.doc.client_name)}</b> <i>(unverified)</i>, client id host <b>${escapeHtml(new URL(pending.clientId).host)}</b>.</p>`,
      `<p>Redirect host: <b>${escapeHtml(redirectHost)}</b>.</p>`,
      localhostOnly ? '<p role="note">Warning: this client only redirects to this computer (localhost). Any program on it could claim this name.</p>' : '',
      `<p>DSH: <b>${escapeHtml(S7B.page.dshName)}</b>, ${escapeHtml(pending.resource)}.</p>`,
      '<p>Authorizing gives this agent full manager rights over this DSH\'s sessions, delegated approvals and questions included. A token can be used for one agent only. The id must be unique and cannot be changed later; the name can.</p>',
      `<form method="post" action="${S7B.paths.decision}">`,
      `<input type="hidden" name="request" value="${escapeHtml(pending.id)}"><input type="hidden" name="form" value="${escapeHtml(pending.nonce)}">`,
      '<label>Token <input type="password" name="token" autocomplete="off" required></label>',
      '<label>Fishball id <input type="text" name="id" autocomplete="off" required maxlength="64"></label>',
      `<label>Name (optional) <input type="text" name="name" autocomplete="off" maxlength="64" placeholder="${escapeHtml(pending.doc.client_name)}"></label>`,
      '<button type="submit" name="action" value="authorize">Authorize</button> <button type="submit" name="action" value="cancel" formnovalidate>Cancel</button>',
      '</form>',
    ].join(''))
  }

  async function authorizeGet(req, res) {
    const h = dshHostForApproval(req)
    if (h === undefined) return sendEmpty(res, 403)
    const url = new URL(req.url, 'http://placeholder')
    const p = (k) => url.searchParams.get(k) ?? undefined
    const clientId = p('client_id')
    const fetched = clientId ? await cimd.fetchDocument(clientId) : { ok: false, reason: 'client-id-missing' }
    if (!fetched.ok) { countRefusal(`cimd:${fetched.reason}`); return errorPage(res, S7B.page.badClient) }
    const redirectUri = p('redirect_uri')
    if (!redirectUri || !redirectAllowed(redirectUri, fetched.doc.redirect_uris)) { countRefusal('redirect-mismatch'); return errorPage(res, S7B.page.badRedirect) }
    const iss = issuerFor(h)
    const fail = (error) => { countRefusal(`authorize:${error}`); redirectTo(res, redirectUri, { error, state: p('state'), iss }) }
    if (p('response_type') !== 'code') return fail('unsupported_response_type')
    if (p('code_challenge_method') !== 'S256' || !PKCE_CHALLENGE.test(p('code_challenge') ?? '')) return fail('invalid_request')
    if (p('resource') !== resourceFor(h)) return fail('invalid_target')
    const pending = { id: opaque(), clientId, doc: fetched.doc, redirectUri, state: p('state'), challenge: p('code_challenge'), resource: p('resource'), iss, createdAt: now(), approvalOrigin: approvalOriginFor(h) }
    state.pending.set(pending.id, pending)
    renderForm(res, pending)
  }

  function nameHeld(fold, except) {
    return [...state.entries.values()].some((e) => e !== except && !e.deleted && e.binding?.fold === fold)
  }

  async function decisionPost(req, res) {
    const h = dshHostForApproval(req)
    if (h === undefined) return sendEmpty(res, 403)
    if (req.headers['sec-fetch-site'] === 'cross-site') { countRefusal('csrf'); return sendEmpty(res, 403) }
    const body = await readBody(req, S7B.maxFormBytes)
    if (body === undefined) return sendEmpty(res, 413)
    const form = new URLSearchParams(body.toString('utf8'))
    const pending = state.pending.get(form.get('request') ?? '')
    if (pending === undefined) return errorPage(res, S7B.page.expired)
    // Same-origin only: a present Origin must be the page's own origin; the single-use form value covers the rest.
    if (!originAllowed(req, pending.approvalOrigin)) { countRefusal('csrf'); return sendEmpty(res, 403) }
    if (form.get('form') !== pending.nonce) { countRefusal('csrf'); return sendEmpty(res, 403) }
    if (pending.createdAt + S7B.pendingLifetimeMs <= now()) { state.pending.delete(pending.id); return errorPage(res, S7B.page.expired) }
    if (form.get('action') === 'cancel') {
      state.pending.delete(pending.id)
      return redirectTo(res, pending.redirectUri, { error: 'access_denied', state: pending.state, iss: pending.iss }, SEE_OTHER)
    }
    state.stats.pageAuthorizeAttempts += 1
    if (limited(req)) { countRefusal('page-rate-limited'); return renderForm(res, pending, S7B.page.rateLimited, 429) }
    const value = form.get('token') ?? ''
    if (value === '') return renderForm(res, pending, S7B.page.enterToken)
    const entry = entryForValue(value)
    if (entry === undefined) { recordFailure(req); countRefusal('page-invalid-token'); return renderForm(res, pending, S7B.page.invalidToken) }
    if (entry.binding) {
      countRefusal('already-paired')
      const b = entry.binding
      return renderForm(res, pending, `${S7B.page.alreadyPaired} Bound to ${b.name ?? `ID: ${b.id}`}, last seen ${new Date(b.lastSeenAt).toISOString()}.`)
    }
    const id = form.get('id') ?? ''
    if (!S7B.idPattern.test(id)) { countRefusal('id-invalid'); return renderForm(res, pending, S7B.page.idInvalid) }
    if ([...state.entries.values()].some((e) => !e.deleted && e.binding?.id === id)) { countRefusal('id-taken'); return renderForm(res, pending, S7B.page.idTaken) }
    const n = normaliseName(form.get('name'))
    if (n.invalid) { countRefusal('name-invalid'); return renderForm(res, pending, S7B.page.nameInvalid) }
    if (n.fold !== undefined && nameHeld(n.fold, entry)) { countRefusal('name-taken'); return renderForm(res, pending, S7B.page.nameTaken) }
    // One synchronous step (the event loop gives the atomicity the product gets from one registry write).
    entry.binding = { id, name: n.name ?? null, fold: n.fold, kind: 'browser', clientIdUrl: pending.clientId, redirectUri: pending.redirectUri, pairedAt: now(), lastSeenAt: now() }
    const code = opaque()
    const chainId = opaque()
    state.codes.set(hex(code), { entryKey: entry.key, generation: entry.generation, clientId: pending.clientId, redirectUri: pending.redirectUri, challenge: pending.challenge, resource: pending.resource, expiresAt: now() + S7B.codeLifetimeMs, used: false, chainId })
    state.pending.delete(pending.id)
    redirectTo(res, pending.redirectUri, { code, state: pending.state, iss: pending.iss }, SEE_OTHER)
  }

  async function approvalHandler(req, res) {
    try {
      const path = new URL(req.url, 'http://placeholder').pathname
      if (path === S7B.paths.authorize && req.method === 'GET') return await authorizeGet(req, res)
      if (path === S7B.paths.decision && req.method === 'POST') return await decisionPost(req, res)
      return sendEmpty(res, 404)
    } catch {
      return sendEmpty(res, 500)
    }
  }

  /** Bind the approval listener; a clash is one diagnostic and a status, never a failure of the plugin (R-OA-20). */
  function bindApproval(port) {
    return new Promise((resolve) => {
      const server = http.createServer(approvalHandler)
      server.once('error', (error) => {
        state.approval = { ...state.approval, port, server: undefined, status: error.code === 'EADDRINUSE' ? S7B.status.portInUse : `approval-${error.code}` }
        const line = `fishball-connector: approval listener could not bind 127.0.0.1:${port} (${error.code}); status ${state.approval.status}`
        state.approval.diagnostics.push(line)
        ctx.logger?.warn?.(line)
        resolve()
      })
      server.listen(port, S7B.host, () => {
        state.approval = { ...state.approval, port: server.address().port, server, status: S7B.status.ok }
        resolve()
      })
    })
  }
  async function rebindApproval(port) {
    const old = state.approval.server
    if (old) await new Promise((r) => { old.close(() => r()); old.closeAllConnections() })
    await bindApproval(port)
  }

  // ---- spike control route (stands in for the native settings form) --------------------------------
  async function control(req, res) {
    const body = await readBody(req, S7B.maxFormBytes)
    if (req.headers['x-s7b-control'] !== controlKey) return sendEmpty(res, 404)
    const cmd = JSON.parse(body?.toString('utf8') || '{}')
    const entry = state.entries.get(cmd.entry)
    switch (cmd.action) {
      case 'enable': entry.enabled = cmd.value; if (!cmd.value) revokeEntry(entry); break
      case 'delete': entry.deleted = true; entry.binding = undefined; revokeEntry(entry); break
      case 'setValue': await ctx.credentials.set(entry.ref, cmd.value); await refreshDigest(entry); revokeEntry(entry); break
      case 'rotate': await ctx.credentials.set(entry.ref, newTokenValue()); await refreshDigest(entry); revokeEntry(entry); break
      case 'expireAll': for (const r of state.accessTokens.values()) r.expiresAt = now(); break
      case 'advance': clockOffsetMs += cmd.ms; break
      case 'resetLimits': state.failures.clear(); break
      case 'clearCimdCache': cimd.clear(); break
      // A connector restart: every in-memory token, code and pending request is lost; bindings persist.
      case 'simulateRestart': state.accessTokens.clear(); state.refreshTokens.clear(); state.codes.clear(); state.pending.clear(); state.chains.clear(); break
      case 'rebind': await rebindApproval(cmd.port ?? state.approval.port); break
      case 'issOverride': state.issOverride = cmd.value; break
      case 'refreshGrace': state.refreshGraceMs = cmd.ms; break
      case 'state': break
      default: return sendEmpty(res, 400)
    }
    sendJson(res, 200, {
      ok: true,
      approval: { port: state.approval.port, status: state.approval.status, listening: state.approval.server !== undefined, diagnostics: state.approval.diagnostics },
      bindings: Object.fromEntries([...state.entries.values()].map((e) => [e.key, { enabled: e.enabled, deleted: e.deleted, binding: e.binding && { ...e.binding, fold: undefined } }])),
      counts: { accessTokens: state.accessTokens.size, refreshTokens: state.refreshTokens.size, codes: state.codes.size, pending: state.pending.size },
      stats: state.stats,
    })
  }

  // ---- wiring -------------------------------------------------------------------------------------
  const metadataRoute = (doc) => (req, res) => {
    if (req.method !== 'GET') return sendEmpty(res, 405, { allow: 'GET' })
    const h = checkedHost(req, web.protocol)
    if (h === undefined) return sendEmpty(res, 403)
    state.stats.metadataFetches += 1
    sendJson(res, 200, doc(h), { 'cache-control': 'no-store' })
  }
  const routes = [
    { kind: 'exact', path: S7B.paths.mcp, handler: mcpRoute },
    { kind: 'exact', path: S7B.paths.token, handler: tokenEndpoint },
    { kind: 'exact', path: S7B.paths.prmPrefix + S7B.paths.mcp, handler: metadataRoute(prm) },
    { kind: 'exact', path: S7B.paths.asmPrefix + S7B.paths.issuer, handler: metadataRoute(asMetadata) },
    { kind: 'exact', path: S7B.paths.control, handler: control },
  ]
  for (const route of routes) ctx.effect(() => web.register(route), `s7b ${route.path}`)
  ctx.effect(() => async () => {
    for (const handler of state.handlers.values()) await handler.close()
    const server = state.approval.server
    if (server) { server.closeAllConnections(); await new Promise((r) => server.close(() => r())) }
  }, 's7b teardown')

  ensureValues().then(() => bindApproval(config.approvalPort ?? 0)).then(() => {
    // Non-secret facts the probe needs; the control key guards only this throwaway home's spike route.
    writeFileSync(join(process.env.DSH_HOME, S7B.paths.spikeFile), JSON.stringify({
      origin: web.getOrigin(), port: web.port, protocol: web.protocol, controlKey,
      approvalPort: state.approval.port, approvalStatus: state.approval.status, trustedHosts,
    }))
  })
}
