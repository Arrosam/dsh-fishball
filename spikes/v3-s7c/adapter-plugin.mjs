/**
 * V3-S7c throwaway prototype: a standalone DSH plugin that gives stock `@deepseek-ai/dsh-mcp-client`
 * rows MCP browser authorization (discovery, CIMD, authorization code + PKCE, loopback redirect,
 * rotating refresh tokens) without a host patch. NOT product code.
 *
 * One token manager per adapted row owns the grant; each row picks how the bearer reaches the server:
 * - `config-editor` (mechanism a1): rewrite the row's `headers` through DSH's public `configEditor`;
 * - `live-object`  (a2): mutate the running row's resolved `headers` object in place (not a public API);
 * - `js-restart`   (a3): the row's header is a `!!js` expression over this plugin's service; restart the row;
 * - `proxy`        (c):  the row points at this plugin's loopback proxy, which adds the bearer;
 * - `child-row`    (c2): as c, but this plugin mounts the stock dsh-mcp-client itself (`ctx.plugin`), so
 *                        the user's configuration holds no `!!js` and no row of its own;
 * - `own-client`   (d):  this plugin runs its own SDK client for the server and registers the tools.
 *
 * The grant lives only in `ctx.credentials` as a `grant` record (`modifyRecord`, the store's
 * read-decide-replace path under its cross-process lock). The browser leg runs as a public
 * `ctx.authorization` flow, so a DSH surface that renders flows renders this one.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import http from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { S7C } from './constants.mjs'

export const name = S7C.pluginName
export const inject = ['credentials', 'authorization', 'webServer', 'tools']

const SERVICE = 'mcpOAuthAdapter'
const CONTROL_PATH = '/__s7c/control'
const BEARER = 'Bearer '
const sameSecret = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const opaque = (bytes = S7C.localBearerBytes) => randomBytes(bytes).toString('base64url')

async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
const sendJson = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }

export async function apply(ctx, config) {
  // The host's own SDK and MCP client (a product plugin gets them as peer dependencies).
  const sdk = await import(pathToFileURL(config.hostModules.sdk).href)
  const mcpClient = await import(pathToFileURL(config.hostModules.mcpClient).href)
  let clockOffsetMs = 0
  const now = () => Date.now() + clockOffsetMs
  const leadMs = (config.refreshLeadSeconds ?? S7C.refreshLeadSeconds) * 1000
  const rows = new Map()
  const controlKey = opaque()

  // ---- grant storage: one credential record per row --------------------------------------------------
  const keyOf = (row) => `${S7C.recordScope}/${row.id}`
  const readGrant = async (row) => (await ctx.credentials.readRecord(keyOf(row)))?.payload
  // A grant record must survive a JSON round trip (dsh-credentials GrantRecord); SDK objects carry
  // `undefined` fields (absent scope, discovery URLs), which the local store refuses.
  const grantRecord = (payload) => ({ kind: 'grant', payload: JSON.parse(JSON.stringify(payload)) })
  const tokensFrom = (raw) => ({
    access_token: raw.access_token, refresh_token: raw.refresh_token, token_type: raw.token_type, scope: raw.scope,
    expiresAt: raw.expires_in === undefined ? undefined : now() + raw.expires_in * 1000,
  })

  // ---- the browser leg (authorization code + PKCE, CIMD, loopback redirect) ---------------------------
  /** A loopback callback listener on an OS-chosen port; the CIMD registers the path, loopback ports may vary. */
  function callbackListener(signal) {
    return new Promise((resolve, reject) => {
      let deliver
      const got = new Promise((r) => { deliver = r })
      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        if (url.pathname !== S7C.callbackPath) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' })
        res.end('You can close this tab and return to DSH.')
        deliver(url.searchParams)
      })
      const close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) })
      signal.addEventListener('abort', () => { close(); deliver(undefined) }, { once: true })
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, got, close }))
    })
  }

  /** One interactive attempt. Uses the SDK's own `auth()`; the provider only holds what the SDK hands it. */
  async function runBrowserFlow(row, session) {
    const cb = await callbackListener(session.signal)
    const redirectUrl = `http://127.0.0.1:${cb.port}${S7C.callbackPath}`
    const expectedState = opaque()
    const draft = {}
    const provider = {
      clientMetadataUrl: config.clientMetadataUrl,
      redirectUrl,
      clientMetadata: { client_name: config.clientName, redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
      state: () => expectedState,
      clientInformation: () => draft.clientInformation,
      saveClientInformation: (info) => { draft.clientInformation = info },
      tokens: () => draft.tokens,
      saveTokens: (tokens) => { draft.tokens = tokens },
      saveCodeVerifier: (verifier) => { draft.verifier = verifier },
      codeVerifier: () => draft.verifier,
      saveDiscoveryState: (state) => { draft.discovery = state },
      discoveryState: () => draft.discovery,
      saveResourceUrl: (resource) => { draft.resource = resource },
      invalidateCredentials: (scope) => { if (scope === 'tokens' || scope === 'all') draft.tokens = undefined },
      // The URL reaches the surface through ctx.authorization's notice; it is never logged.
      redirectToAuthorization: (url) => { session.notify({ message: `Authorize ${row.id} in your browser`, url: String(url) }) },
    }
    try {
      const first = await sdk.auth(provider, { serverUrl: new URL(row.upstream) })
      if (first !== 'REDIRECT') throw new Error(`expected a browser redirect, got ${first}`)
      const params = await Promise.race([cb.got, new Promise((r) => setTimeout(r, S7C.authorizationTimeoutMs).unref())])
      if (params === undefined) throw new Error('authorization timed out or was cancelled')
      // The SDK does not compare `state`; the client that chose it must (OAuth 2.1 §4.1.2, RFC 9700 §4.7).
      if (params.get('state') !== expectedState) throw new Error('authorization response state mismatch')
      if (params.get('error')) {
        // RFC 9207: `iss` is checked on error responses too, before the error is believed.
        sdk.validateAuthorizationResponseIssuer({ iss: params.get('iss') ?? undefined, expectedIssuer: draft.discovery?.authorizationServerMetadata?.issuer, issParameterSupported: draft.discovery?.authorizationServerMetadata?.authorization_response_iss_parameter_supported === true })
        throw new Error(`authorization refused: ${params.get('error')}`)
      }
      const second = await sdk.auth(provider, { serverUrl: new URL(row.upstream), authorizationCode: params.get('code'), iss: params.get('iss') ?? undefined })
      if (second !== 'AUTHORIZED' || draft.tokens?.access_token === undefined) throw new Error('code exchange did not return tokens')
      const payload = { v: 1, upstream: row.upstream, clientInformation: draft.clientInformation, discovery: draft.discovery, resource: draft.resource, tokens: tokensFrom(draft.tokens) }
      await session.commit(grantRecord(payload))
    } finally {
      await cb.close()
    }
  }

  // ---- refresh: single flight in process, read-decide-replace under the store's lock across processes --
  /**
   * Refresh only if the stored access token is still the one that failed (or is near expiry): a caller
   * that lost the race finds a newer token under the lock and declines. So one refresh token is presented
   * once, and the connector's reuse detection (R-OA-16) never fires for this adapter.
   */
  function refresh(row, failedAccessToken) {
    row.refreshing ??= (async () => {
      try {
        const record = await ctx.credentials.modifyRecord(keyOf(row), async (current) => {
          const grant = current?.payload
          const tokens = grant?.tokens
          if (tokens?.refresh_token === undefined) return undefined
          const stale = failedAccessToken === undefined ? tokens.expiresAt !== undefined && tokens.expiresAt - leadMs <= now() : tokens.access_token === failedAccessToken
          if (!stale) return undefined
          row.stats.refreshRequests += 1
          try {
            const next = await sdk.refreshAuthorization(grant.discovery.authorizationServerUrl, {
              metadata: grant.discovery.authorizationServerMetadata, clientInformation: grant.clientInformation,
              refreshToken: tokens.refresh_token, resource: grant.resource ? new URL(grant.resource) : undefined,
            })
            return grantRecord({ ...grant, tokens: tokensFrom(next) })
          } catch (error) {
            if (error?.code !== 'invalid_grant') throw error
            // The chain is gone (revoked, reused, connector restarted): only a new browser approval helps.
            row.stats.refreshRejected += 1
            return grantRecord({ ...grant, tokens: undefined })
          }
        })
        await adopt(row, record?.payload)
      } finally {
        row.refreshing = undefined
      }
    })()
    return row.refreshing
  }

  /**
   * Take a grant into memory, push the bearer to the row's mechanism (unless `push` is false) and arm the
   * expiry timer. Serialized per row: the record-updated listener and the attempt's own settlement can
   * both adopt the same new grant, and only one of them may see it as "first".
   */
  function adopt(row, grant, options) {
    const run = (row.adopting ?? Promise.resolve()).then(() => adoptNow(row, grant, options))
    row.adopting = run.catch(() => undefined)
    return run
  }
  async function adoptNow(row, grant, { push = true } = {}) {
    const before = row.grant?.tokens?.access_token
    row.grant = grant
    row.status = grant?.tokens?.access_token ? S7C.status.authorized : S7C.status.needsAuthorization
    clearTimeout(row.timer)
    const expiresAt = grant?.tokens?.expiresAt
    if (expiresAt !== undefined && grant.tokens.refresh_token) {
      const delay = Math.max(S7C.minRefreshDelayMs, expiresAt - leadMs - now())
      row.timer = setTimeout(() => { refresh(row).catch((e) => ctx.logger.warn('mcp-oauth-adapter: refresh of %s failed: %s', row.id, e?.message)) }, delay)
      row.timer.unref()
    }
    const after = grant?.tokens?.access_token
    if (push && after !== before) await row.mechanism.onToken(row, { first: before === undefined && after !== undefined })
  }

  const bearerOf = (row) => (row.grant?.tokens?.access_token ? BEARER + row.grant.tokens.access_token : undefined)
  const rowEntry = (row) => [...ctx.get('loader').entries()].find((entry) => entry.options.id === row.entry)

  // ---- mechanisms ------------------------------------------------------------------------------------
  /**
   * Before the first authorization a row cannot connect, so the stock client sits in its reconnect backoff
   * (and gives up after `reconnect.maxAttempts`). The first token therefore restarts the row once; later
   * tokens reach it without a restart in the per-request mechanisms (a2, c, d).
   */
  const restartRow = async (row) => {
    const fiber = rowEntry(row)?.fiber
    if (fiber?.uid) { row.stats.rowRestarts += 1; await fiber.restart() }
  }
  const mechanisms = {
    /** a1: persist the header through DSH's ConfigEditor; `headers` is not volatile, so the loader restarts the row. */
    'config-editor': {
      async onToken(row) {
        const bearer = bearerOf(row)
        await ctx.get('configEditor').edit(rowEntry(row), (current) => {
          const headers = { ...(current.headers ?? {}) }
          if (bearer) headers.Authorization = bearer
          else delete headers.Authorization
          return { ...current, headers }
        })
        row.stats.rowRestarts += 1
      },
    },
    /**
     * a2: the row starts with `!!js` over this plugin's service; later tokens are written into the running
     * row's resolved `headers` object, which its transport copies into a new `Headers` on every request.
     */
    'live-object': {
      async onToken(row, { first }) {
        if (first) return restartRow(row)
        // 0.2.1: `fiber.config` is the resolved config the row's transport holds. 0.2.2: `fiber.config`
        // is the RAW config (a `!!js` node here) and the resolved one is the private `_effectiveConfig`.
        // The spike writes only through the public-looking field, so 0.2.2 shows the break.
        const headers = rowEntry(row)?.fiber?.config?.headers
        if (headers === undefined || headers.__jsExpr !== undefined) { row.stats.liveObjectUnreachable += 1; return }
        const bearer = bearerOf(row)
        if (bearer) headers.Authorization = bearer
        else delete headers.Authorization
      },
    },
    /** a3: the row's header is `!!js` over this plugin's service; every token restarts the row to re-evaluate it. */
    'js-restart': { onToken: (row) => restartRow(row) },
    /** c: the proxy reads the current bearer per request. */
    proxy: { async onToken(row, { first }) { if (first) await restartRow(row) } },
    /** c2: the first token mounts the stock client as this plugin's child, pointed at the proxy. */
    'child-row': { async onToken(row, { first }) { if (first) mountChildRow(row) } },
    /** d: the own client's AuthProvider reads the current bearer per request. */
    'own-client': { async onToken(row, { first }) { if (first && row.ownClient === undefined) await startOwnClient(row) } },
  }

  // ---- c: loopback proxy ------------------------------------------------------------------------------
  const PROXIED = ['proxy', 'child-row']
  const proxy = { server: undefined, port: undefined }
  /** c2: the stock dsh-mcp-client as a child of this plugin; disposed with it. */
  function mountChildRow(row) {
    if (row.child !== undefined) return
    row.child = ctx.plugin(mcpClient, {
      transport: 'streamable-http', serverName: row.serverName, url: service.url(row.id), headers: service.localHeaders(row.id),
      failOnStartupError: false,
    })
  }
  function forwardHeaders(req, bearer) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (S7C.dropRequestHeaders.includes(key) || value === undefined) continue
      for (const v of [value].flat()) headers.append(key, v)
    }
    headers.set('authorization', bearer)
    return headers
  }
  async function proxyHandler(req, res) {
    const path = new URL(req.url, 'http://127.0.0.1').pathname
    const row = rows.get(path.slice(S7C.proxyPathPrefix.length))
    // The row proves it is the row: a per-start local bearer, never on disk, compared in constant time.
    if (!path.startsWith(S7C.proxyPathPrefix) || !PROXIED.includes(row?.mechanismName) || !sameSecret(req.headers.authorization, BEARER + row.localBearer)) {
      res.writeHead(404); res.end(); return
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req, config.proxyMaxBodyBytes)
    if (body === undefined && !['GET', 'HEAD'].includes(req.method)) { res.writeHead(413); res.end(); return }
    const abort = new AbortController()
    res.on('close', () => abort.abort())
    const send = (bearer) => fetch(row.upstream, { method: req.method, headers: forwardHeaders(req, bearer), body, redirect: 'manual', signal: abort.signal })
    try {
      let bearer = bearerOf(row)
      if (bearer === undefined) { res.writeHead(401); res.end(); return }
      let upstream = await send(bearer)
      if (upstream.status === 401) {
        // One retry after a refresh. Concurrent 401s for the same token share one refresh (single flight).
        row.stats.proxy401 += 1
        await upstream.body?.cancel()
        await refresh(row, bearer.slice(BEARER.length))
        bearer = bearerOf(row)
        if (bearer === undefined) { res.writeHead(401); res.end(); return }
        upstream = await send(bearer)
      }
      const headers = {}
      for (const [key, value] of upstream.headers) if (!S7C.dropResponseHeaders.includes(key)) headers[key] = value
      res.writeHead(upstream.status, headers)
      if (upstream.body === null) { res.end(); return }
      res.flushHeaders()
      for await (const chunk of upstream.body) res.write(chunk)   // streams (subscriptions/listen) stay open
      res.end()
    } catch (error) {
      if (!res.headersSent) { res.writeHead(502); res.end() } else res.destroy(error)
    }
  }

  // ---- d: own client ----------------------------------------------------------------------------------
  /** Minimal AuthProvider (not OAuthClientProvider): our single-flight refresh instead of the SDK's racing one (S7b F2). */
  async function startOwnClient(row) {
    const authProvider = {
      token: async () => row.grant?.tokens?.access_token,
      onUnauthorized: async () => {
        row.stats.ownClient401 += 1
        const failed = row.grant?.tokens?.access_token
        await refresh(row, failed)
        if (bearerOf(row) === undefined) throw new sdk.UnauthorizedError('needs browser authorization')
      },
    }
    const client = new sdk.Client({ name: S7C.pluginName, version: '0.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } })
    await client.connect(new sdk.StreamableHTTPClientTransport(new URL(row.upstream), { authProvider }))
    row.stats.ownClientConnects += 1
    const { tools } = await client.listTools()
    for (const tool of tools) {
      const definition = mcpClient.createMcpToolDefinition(ctx, {
        name: `mcp__${row.serverName}__${tool.name}`, rawName: tool.name, description: tool.description ?? '',
        inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, taskRequired: false,
        call: (args, execution) => client.callTool({ name: tool.name, arguments: args }, { signal: execution.signal, toolDefinition: tool }),
      })
      ctx.tools.register(definition)
    }
    row.ownClient = client
  }

  // ---- the service rows reference from `!!js` -------------------------------------------------------
  const service = {
    /** a2/a3: the row's headers, evaluated when the row (re)starts. No Authorization before authorization. */
    headers: (id) => { const bearer = bearerOf(rows.get(id)); return bearer ? { Authorization: bearer } : {} },
    /** c: the proxy URL and the local bearer for a row. */
    url: (id) => `http://127.0.0.1:${proxy.port}${S7C.proxyPathPrefix}${id}`,
    localHeaders: (id) => ({ Authorization: BEARER + rows.get(id).localBearer }),
  }

  // ---- wiring -----------------------------------------------------------------------------------------
  for (const spec of config.rows) {
    const row = { ...spec, mechanismName: spec.mechanism, mechanism: mechanisms[spec.mechanism], status: S7C.status.needsAuthorization, localBearer: opaque(),
      stats: { liveObjectUnreachable: 0, refreshRequests: 0, refreshRejected: 0, rowRestarts: 0, proxy401: 0, ownClient401: 0, ownClientConnects: 0 } }
    if (row.mechanism === undefined) throw new Error(`unknown mechanism ${spec.mechanism}`)
    rows.set(row.id, row)
    ctx.effect(() => ctx.authorization.registerFlow({
      key: keyOf(row), label: `MCP server ${row.id}`, methods: [{ id: 'browser', label: 'Sign in with the browser' }],
      run: (session) => runBrowserFlow(row, session),
    }), `flow ${row.id}`)
  }
  // An external change (another process refreshed, the user removed the record) is taken in as it lands.
  ctx.on('credentials/record-updated', async (key) => {
    const row = [...rows.values()].find((r) => keyOf(r) === key)
    if (row && !row.refreshing) await adopt(row, await readGrant(row)).catch((e) => ctx.logger.warn('mcp-oauth-adapter: %s: %s', row.id, e?.message))
  })

  await new Promise((resolve) => {
    proxy.server = http.createServer((req, res) => { proxyHandler(req, res).catch(() => res.destroy()) })
    proxy.server.listen(0, '127.0.0.1', () => { proxy.port = proxy.server.address().port; resolve() })
  })
  ctx.effect(() => () => { proxy.server.closeAllConnections(); proxy.server.close() }, 'proxy')
  ctx.effect(() => () => { for (const row of rows.values()) { clearTimeout(row.timer); row.ownClient?.close() } }, 'rows')

  // A stored grant survives a DSH restart. It is loaded before the service is provided, so rows that
  // inject the service start with it; nothing is pushed (the rows have not started yet), and the timer
  // refreshes it when the stored access token is near expiry or already past it.
  for (const row of rows.values()) await adopt(row, await readGrant(row), { push: false })

  // ---- spike control route (stands in for a settings surface) -----------------------------------------
  async function startAuthorization(row) {
    let resolveUrl
    const urlKnown = new Promise((r) => { resolveUrl = r })
    row.attempt = ctx.authorization.begin({
      key: keyOf(row),
      interaction: { notify: (notice) => { if (notice.url) resolveUrl(notice.url) }, prompt: () => Promise.reject(new Error('no prompts in this flow')) },
    }).then(async (outcome) => {
      // The record-updated listener usually adopted the grant already; adopting again is a no-op then.
      if (outcome.status === 'authorized') await adopt(row, await readGrant(row))
      return outcome
    }, (error) => ({ status: 'failed', error: error.message }))
    return Promise.race([urlKnown, row.attempt.then((o) => { throw new Error(`flow ended before a redirect: ${JSON.stringify(o)}`) })])
  }
  const toolNames = () => [...ctx.tools.view().visible.keys()].filter((n) => n.startsWith('mcp__'))
  async function callTool(name) {
    const definition = ctx.tools.get(name)
    if (definition === undefined) return { ok: false, error: 'no such tool' }
    try { return { ok: true, value: await definition.execute({}, { signal: AbortSignal.timeout(config.callTimeoutMs) }) } } catch (error) { return { ok: false, error: `${error?.name}: ${error?.message}`.slice(0, 300) } }
  }
  async function control(req, res) {
    const body = await readBody(req, config.proxyMaxBodyBytes)
    if (!sameSecret(req.headers['x-s7c-control'], controlKey)) { res.writeHead(404); res.end(); return }
    const cmd = JSON.parse(body.toString('utf8') || '{}')
    const row = rows.get(cmd.row)
    try {
      switch (cmd.action) {
        case 'authorize': return sendJson(res, 200, { url: await startAuthorization(row) })
        case 'awaitAuthorized': return sendJson(res, 200, await row.attempt)
        case 'call': return sendJson(res, 200, await callTool(cmd.tool))
        case 'callMany': return sendJson(res, 200, await Promise.all(Array.from({ length: cmd.n }, () => callTool(cmd.tool))))
        case 'advance': clockOffsetMs += cmd.ms; for (const r of rows.values()) await adopt(r, r.grant).catch(() => undefined); break
        case 'settingsMutate': {
          // Mechanism a1 through the Settings form API, as DSH's own GUI would write it.
          const outcome = await ctx.get('settings').mutate(row.entry, [{ op: 'set', path: ['headers', 'Authorization'], value: 'Bearer x' }]).then(() => 'accepted', (e) => e.message)
          return sendJson(res, 200, { outcome })
        }
        case 'rowDiag': {
          // Which token the running row would send, compared with the adapter's current one (never the value).
          // Diagnostic only: reads the resolved config where each version keeps it (0.2.2: a private field).
          const fiber = rowEntry(row)?.fiber
          const resolved = fiber?._effectiveConfig ?? fiber?.config
          const sent = resolved?.headers?.Authorization
          return sendJson(res, 200, { fiberState: fiber?.state, publicConfigIsRaw: fiber?.config?.headers?.__jsExpr !== undefined, hasHeader: sent !== undefined, headerIsCurrent: sent !== undefined && sent === bearerOf(row) })
        }
        case 'state': break
        default: return sendJson(res, 400, { error: 'unknown action' })
      }
      sendJson(res, 200, {
        tools: toolNames(),
        rows: Object.fromEntries([...rows.values()].map((r) => [r.id, { mechanism: r.mechanismName, status: r.status, hasRefreshToken: Boolean(r.grant?.tokens?.refresh_token), expiresInMs: r.grant?.tokens?.expiresAt === undefined ? null : r.grant.tokens.expiresAt - now(), stats: r.stats }])),
      })
    } catch (error) {
      sendJson(res, 500, { error: `${error?.name}: ${error?.message}`.slice(0, 400) })
    }
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: CONTROL_PATH, handler: (req, res) => { control(req, res).catch(() => res.destroy()) } }), 'control')

  // Provided last: rows that `inject` the service start only now, with the proxy port and stored grants known.
  ctx.provide(SERVICE, service)
  for (const row of rows.values()) {
    if (!row.grant?.tokens) continue
    if (row.mechanismName === 'own-client') await startOwnClient(row).catch((e) => ctx.logger.warn('mcp-oauth-adapter: %s: %s', row.id, e?.message))
    if (row.mechanismName === 'child-row') mountChildRow(row)
  }
  writeFileSync(join(process.env.DSH_HOME, S7C.spikeFile), JSON.stringify({ origin: ctx.webServer.getOrigin(), controlPath: CONTROL_PATH, controlKey, proxyPort: proxy.port }))
}
