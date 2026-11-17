/**
 * The Fishball side's OAuth browser client (the S7c K2 token manager; design §6.3a; requirements
 * 1.31, 1.40; R-OA-13/14/16, R-OA-22). Core's Connect (F-LINK-SAVE) runs on it. One copy per side
 * (requirements 1.40: "duplicated, one copy per side"): the DSH side keeps its own in
 * `dsh-connector-shared/oauth-client` for the adapter, and nothing here is imported across the
 * sides. This copy keeps only what core needs: no loopback proxy, no timer refresh (core's link
 * refreshes when a token is due or refused), plus `authorizationParameters` (core passes its
 * `agent_id`, R-OA-22) and `grantId` (the grant's own random, non-secret identity, so a later
 * Connect is a new credential for core's pairing records).
 * It was fishball-shared's `./oauth-client` until REMOVE-V2b: core is its one user, so R-ARCH-08
 * strict (two importers on a library's side, Fishball 2026-11-16) puts it in core's link.
 *
 * Generic: it knows OAuth 2.1 + PKCE against an MCP server, a Client ID Metadata Document client
 * id, the loopback callback, and one `grant` record in DSH's credential store. It knows no server
 * check; that is the caller's.
 *
 * It imports nothing but Node. The caller passes the MCP client SDK module
 * (`@modelcontextprotocol/client` 2.2.0, the line both hosts ship), so this module takes no package
 * edge. The protocol steps are the SDK's own primitives (`startAuthorization`, `exchangeAuthorization`,
 * `refreshAuthorization`, `validateAuthorizationResponseIssuer`, the two discovery reads). The SDK's
 * `auth()` orchestrator is NOT used: on an `invalid_grant` from the code exchange it runs the exchange
 * again with the same code, a second use the connector answers by revoking every token of that code
 * (R-OA-14); and it would fall back to dynamic registration, which this client never uses (R-OA-13).
 *
 * Secrets: the access and refresh tokens, the code and the PKCE verifier live only in memory during
 * a call and in the caller's credential record (R-TOK-04). Nothing here logs, and no error message
 * carries a value.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'

/** Fixed protocol and storage vocabulary of this client. */
export const OAUTH_CLIENT = Object.freeze({
  /** RFC 8252 §7.3: a loopback IP literal, never `localhost` (R-OA-14 treats them as distinct hosts). */
  loopbackHost: '127.0.0.1',
  /** The path the user's CIMD document registers; the port is the OS's, fresh per attempt (R-OA-14). */
  callbackPath: '/callback',
  /** Grant record payload version. */
  grantVersion: 1,
  /** dsh-credentials record kind for an authorization grant. */
  recordKind: 'grant',
  /** Bytes of randomness in `state` (base64url); 256 bits, as for any unguessable client value. */
  stateBytes: 32,
  /** Default deadline of each outbound OAuth request (discovery, code exchange, refresh), 30 s, as the DSH side's copy. */
  requestTimeoutMs: 30_000,
  /**
   * Fetch's redirect mode for every outbound OAuth request: a redirect is an error, never followed.
   * A 307/308 from the token endpoint would re-POST the code and verifier, or the refresh token, to
   * any `Location` (X-SEC X-11; design §6.3 "credentials are never forwarded on a redirect"), and the
   * SDK checks only the first URL. The same value as the link's `LINK_MCP.redirect`, restated because
   * this module imports nothing but Node (see the header).
   */
  redirect: 'error',
  /** The one PKCE method this client sends; an authorization server that does not list it is refused (X-SEC X-13). */
  pkceMethod: 'S256',
  /** listen() port 0: the OS picks a free port. */
  osPort: 0,
  /** Node event names this module listens to. */
  event: Object.freeze({ abort: 'abort', error: 'error' }),
  randomEncoding: 'base64url',
  /** How an attempt ended without a grant. */
  attemptEnd: Object.freeze({ denied: 'denied', rejected: 'rejected', expired: 'expired', failed: 'failed' }),
  refreshOutcome: Object.freeze({ refreshed: 'refreshed', declined: 'declined', invalidGrant: 'invalid-grant', noRefreshToken: 'no-refresh-token' }),
  /** `clientMetadataUrl` problems: absent, not https, or the root path (CIMD draft §3). */
  urlProblem: Object.freeze({ missing: 'missing', notHttps: 'not-https', rootPath: 'root-path' }),
  /** RFC 6749 §4.1.2 response parameters, and RFC 9207's `iss`. */
  param: Object.freeze({ code: 'code', state: 'state', iss: 'iss', error: 'error' }),
  /** The one OAuth error code an attempt maps on its own (Cancel on the approval page, R-OA-15). */
  accessDenied: 'access_denied',
  /** MCP Authorization § Scope Selection Strategy: added only when the AS lists it. */
  offlineAccess: 'offline_access',
  /** Only an https client-id URL with a non-root path is a CIMD client id (CIMD draft §3). */
  clientIdUrl: Object.freeze({ protocol: 'https:', rootPath: '/' }),
  scopeSeparator: ' ',
  msPerSecond: 1000,
  /** What the user's browser shows after the redirect: no value, no referrer, no cache. */
  callbackPage: Object.freeze({
    status: 200,
    notFound: 404,
    headers: Object.freeze({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }),
    body: 'You can close this tab and return to Fishball.',
  }),
})

/** Error messages (never a value). */
const MESSAGE = Object.freeze({
  discovery: 'the server\'s OAuth metadata could not be read',
  noCimd: 'the authorization server does not accept Client ID Metadata Documents',
  noS256: 'the authorization server does not list PKCE S256',
  noAuthorizationServer: 'the protected-resource metadata names no authorization server',
  [OAUTH_CLIENT.attemptEnd.denied]: 'the authorization was denied',
  [OAUTH_CLIENT.attemptEnd.rejected]: 'the authorization response was not accepted (state or issuer)',
  [OAUTH_CLIENT.attemptEnd.expired]: 'the authorization attempt timed out',
  [OAUTH_CLIENT.attemptEnd.failed]: 'the authorization attempt failed',
})

/** An attempt or discovery that ended without a grant; `code` is one of OAUTH_CLIENT.attemptEnd. */
export class OAuthAttemptError extends Error {
  constructor(code, message = MESSAGE[code], options) {
    super(message, options)
    this.name = 'OAuthAttemptError'
    this.code = code
  }
}

/**
 * Why a `clientMetadataUrl` value cannot be used (the SDK's own `isHttpsUrl` rule, one problem per
 * failing rule so the caller can name it).
 * @returns `undefined` when it is an https URL whose path is not `/`, else an OAUTH_CLIENT.urlProblem.
 */
export function clientMetadataUrlProblem(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return OAUTH_CLIENT.urlProblem.missing
  // A padded value would be sent as the client id verbatim, which is not the document's URL.
  if (value.trim() !== value || !URL.canParse(value)) return OAUTH_CLIENT.urlProblem.notHttps
  const url = new URL(value)
  if (url.protocol !== OAUTH_CLIENT.clientIdUrl.protocol) return OAUTH_CLIENT.urlProblem.notHttps
  return url.pathname === OAUTH_CLIENT.clientIdUrl.rootPath ? OAUTH_CLIENT.urlProblem.rootPath : undefined
}

/**
 * RFC 9728 then RFC 8414 discovery, with no fallback guess of the authorization server: the issuer
 * is `authorization_servers[0]` of the protected-resource metadata, or discovery fails.
 * @param options.acceptResource gate on the protected-resource metadata, run before the
 *   authorization server is contacted at all; when it returns false discovery stops there.
 * @returns `{authorizationServerUrl, resourceMetadata, authorizationServerMetadata}`; `undefined`
 *   when `acceptResource` said no.
 * @throws OAuthAttemptError `failed` when either document cannot be read.
 */
export async function discoverServer({ sdk, serverUrl, fetchFn: rawFetch = globalThis.fetch, requestTimeoutMs = OAUTH_CLIENT.requestTimeoutMs, acceptResource = () => true }) {
  const fetchFn = withDeadline(rawFetch, requestTimeoutMs)
  try {
    const resourceMetadata = await sdk.discoverOAuthProtectedResourceMetadata(new URL(serverUrl), undefined, fetchFn)
    if (!acceptResource(resourceMetadata)) return undefined
    const authorizationServerUrl = resourceMetadata.authorization_servers?.[0]
    if (authorizationServerUrl === undefined) throw new Error(MESSAGE.noAuthorizationServer)
    const authorizationServerMetadata = await sdk.discoverAuthorizationServerMetadata(authorizationServerUrl, { fetchFn })
    if (authorizationServerMetadata === undefined) throw new Error(MESSAGE.discovery)
    return { authorizationServerUrl, resourceMetadata, authorizationServerMetadata }
  } catch (cause) {
    throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed, MESSAGE.discovery, { cause })
  }
}

/** The access token of a grant payload, or `undefined` when it holds none. */
export const accessTokenOf = (grant) => grant?.tokens?.access_token

/**
 * Whether a stored grant may be used for `serverUrl`: its record version is this client's and it was
 * issued for exactly that server. A grant kept after the server's URL changed would send a token to
 * a server it was not issued for (MCP Security § Token Passthrough), so it counts as absent.
 */
export const isGrantFor = (grant, serverUrl) => grant?.v === OAUTH_CLIENT.grantVersion && grant.upstream === serverUrl

const opaqueValue = (bytes) => randomBytes(bytes).toString(OAUTH_CLIENT.randomEncoding)
/** A grant record must survive a JSON round trip (dsh-credentials-local refuses `undefined` and class instances). */
const grantRecord = (payload) => ({ kind: OAUTH_CLIENT.recordKind, payload: JSON.parse(JSON.stringify(payload)) })
const withoutTokens = ({ tokens, ...grant }) => grant
/** The token endpoint refused the code or refresh token (RFC 6749 §5.2). */
const isInvalidGrant = (sdk, error) => error instanceof sdk.OAuthError && error.code === sdk.OAuthErrorCode.InvalidGrant

/**
 * MCP Authorization § Scope Selection Strategy: the protected resource's `scopes_supported`, plus
 * `offline_access` only when the authorization server lists it.
 */
function scopeFor({ resourceMetadata, authorizationServerMetadata }) {
  const scopes = [...(resourceMetadata.scopes_supported ?? [])]
  if (authorizationServerMetadata.scopes_supported?.includes(OAUTH_CLIENT.offlineAccess) && !scopes.includes(OAUTH_CLIENT.offlineAccess)) scopes.push(OAUTH_CLIENT.offlineAccess)
  return scopes.length === 0 ? undefined : scopes.join(OAUTH_CLIENT.scopeSeparator)
}

/**
 * The request's path and query, or `undefined` when its target is not a parseable URL (e.g.
 * `GET //`): parsing must never throw inside a synchronous request handler, where nothing catches it.
 */
function requestUrl(req) {
  try { return new URL(req.url, `http://${OAUTH_CLIENT.loopbackHost}`) } catch { return undefined }
}

/**
 * A callback listener is `{redirectUrl, received, close, expect?}`: the redirect URI sent in the
 * authorization request, a promise of the first callback's query parameters, `close()` at the
 * end of the attempt, after which the URI is dead (S7c rules), and an optional `expect(state)`,
 * told the attempt's `state` before the user is sent to the approval page, for a listener that
 * must ignore anyone else's request (the authorization response still checks `state` itself). `authorize` takes any such listener
 * (`options.callback`), so a caller with its own https web route (core's web callback for a browser
 * on another machine, Q-A3 B) supplies one; the default is this loopback one.
 *
 * One attempt's loopback callback listener on 127.0.0.1 with an OS port. It answers every request
 * until the attempt ends and delivers only the first one on the callback path.
 */
function listenForCallback() {
  let deliver
  const received = new Promise((r) => { deliver = r })
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = requestUrl(req)
      if (url?.pathname !== OAUTH_CLIENT.callbackPath) { res.writeHead(OAUTH_CLIENT.callbackPage.notFound); res.end(); return }
      res.writeHead(OAUTH_CLIENT.callbackPage.status, OAUTH_CLIENT.callbackPage.headers)
      res.end(OAUTH_CLIENT.callbackPage.body)
      deliver(url.searchParams)
    })
    // closeAllConnections: a browser's keep-alive socket must not hold the attempt's end open.
    const close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) })
    server.once(OAUTH_CLIENT.event.error, reject)
    server.listen(OAUTH_CLIENT.osPort, OAUTH_CLIENT.loopbackHost, () => {
      const redirectUrl = `http://${OAUTH_CLIENT.loopbackHost}:${server.address().port}${OAUTH_CLIENT.callbackPath}`
      resolve({ redirectUrl, close, received })
    })
  })
}

/**
 * Check an authorization response before believing it (RFC 6749 §4.1.2, RFC 9700 §4.7: the client
 * that chose `state` compares it, the SDK does not; RFC 9207 §2.4: `iss` on success and error).
 * @returns the code. @throws OAuthAttemptError rejected / denied / failed.
 */
function acceptResponse(sdk, params, { state, metadata }) {
  if (params.get(OAUTH_CLIENT.param.state) !== state) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.rejected)
  try {
    sdk.validateAuthorizationResponseIssuer({
      iss: params.get(OAUTH_CLIENT.param.iss) ?? undefined,
      expectedIssuer: metadata.issuer,
      issParameterSupported: metadata.authorization_response_iss_parameter_supported === true,
    })
  } catch (cause) {
    throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.rejected, undefined, { cause })
  }
  const error = params.get(OAUTH_CLIENT.param.error)
  if (error !== null) throw new OAuthAttemptError(error === OAUTH_CLIENT.accessDenied ? OAUTH_CLIENT.attemptEnd.denied : OAUTH_CLIENT.attemptEnd.failed)
  const code = params.get(OAUTH_CLIENT.param.code)
  if (code === null) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.rejected)
  return code
}

/** Wait for the callback, the attempt timeout or the session's abort, whichever comes first. */
function awaitCallback(listener, { signal, timers, timeoutMs }) {
  return new Promise((resolve, reject) => {
    // An abort during the steps before this wait fired its event already and would not fire again.
    if (signal.aborted) { reject(signal.reason); return }
    const finish = (settle) => { timers.clearTimeout(timer); signal.removeEventListener(OAUTH_CLIENT.event.abort, onAbort); settle() }
    const onAbort = () => finish(() => reject(signal.reason))
    const timer = timers.setTimeout(() => finish(() => reject(new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.expired))), timeoutMs)
    signal.addEventListener(OAUTH_CLIENT.event.abort, onAbort, { once: true })
    listener.received.then((params) => finish(() => resolve(params)))
  })
}

/**
 * `fetchFn` with a deadline on every request, joined to the caller's own signal, and no redirect
 * followed (`OAUTH_CLIENT.redirect`, set after the caller's init so nothing can turn it back on).
 * The refresh runs inside `credentials.modifyRecord`, which holds the store's cross-process lock,
 * so an unanswered token endpoint must not hold it longer than a writer elsewhere waits for that
 * lock (dsh-credentials-local DOCUMENT_LOCK_WAIT_MS, 30 s).
 */
function withDeadline(fetchFn, timeoutMs) {
  return (input, init = {}) => fetchFn(input, {
    ...init,
    redirect: OAUTH_CLIENT.redirect,
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(init.signal ? [init.signal] : [])]),
  })
}

/**
 * The token manager for one credential record.
 * @param options.sdk the `@modelcontextprotocol/client` module.
 * @param options.credentials DSH's `ctx.credentials`.
 * @param options.key the record's `CredentialKey` (also the `ctx.authorization` flow key).
 * @param options.now epoch ms (default `Date.now`); `expiresAt` is in this clock.
 * @param options.refreshLeadMs how long before expiry a refresh is due.
 * @param options.fetchFn fetch for every token-endpoint request (default global).
 */
export function createTokenManager({ sdk, credentials, key, now = Date.now, refreshLeadMs, fetchFn = globalThis.fetch, requestTimeoutMs = OAUTH_CLIENT.requestTimeoutMs }) {
  const tokenFetch = withDeadline(fetchFn, requestTimeoutMs)
  const tokensFrom = (raw) => {
    const issuedAt = now()
    return {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      token_type: raw.token_type,
      scope: raw.scope,
      issuedAt,
      expiresAt: raw.expires_in === undefined ? undefined : issuedAt + raw.expires_in * OAUTH_CLIENT.msPerSecond,
    }
  }
  const dueAt = (tokens) => (tokens?.expiresAt === undefined ? undefined : tokens.expiresAt - refreshLeadMs)
  let inFlight

  /**
   * Single-flight refresh (R-OA-16 (1)). Concurrent callers in this process share one promise; the
   * decision runs under `modifyRecord`'s cross-process lock, so a caller in another process that lost
   * the race finds the newer token and declines. One refresh token is therefore presented once.
   * A caller refreshes only if the stored access token is still the one that failed, or it is due.
   */
  async function refreshNow(failedAccessToken) {
    let outcome
    const record = await credentials.modifyRecord(key, async (current) => {
      const grant = current?.payload
      const tokens = grant?.tokens
      if (tokens?.refresh_token === undefined) { outcome = OAUTH_CLIENT.refreshOutcome.noRefreshToken; return undefined }
      const stale = (failedAccessToken !== undefined && tokens.access_token === failedAccessToken) || (dueAt(tokens) !== undefined && dueAt(tokens) <= now())
      if (!stale) { outcome = OAUTH_CLIENT.refreshOutcome.declined; return undefined }
      try {
        const next = await sdk.refreshAuthorization(grant.discovery.authorizationServerUrl, {
          metadata: grant.discovery.authorizationServerMetadata,
          clientInformation: grant.clientInformation,
          refreshToken: tokens.refresh_token,
          resource: new URL(grant.resource),
          fetchFn: tokenFetch,
        })
        outcome = OAUTH_CLIENT.refreshOutcome.refreshed
        return grantRecord({ ...grant, tokens: tokensFrom(next) })
      } catch (error) {
        if (!isInvalidGrant(sdk, error)) throw error
        // The chain is gone (revoked, reused, entry disabled): only a new browser approval helps.
        outcome = OAUTH_CLIENT.refreshOutcome.invalidGrant
        return grantRecord(withoutTokens(grant))
      }
    })
    return { outcome, grant: record?.payload }
  }

  return Object.freeze({
    /** The stored grant payload, or `undefined`. */
    read: async () => (await credentials.readRecord(key))?.payload,

    /** Whether the grant's access token is within the lead of its expiry (a refresh is due before use). */
    isDue: (grant) => grant?.tokens?.refresh_token !== undefined && dueAt(grant.tokens) !== undefined && dueAt(grant.tokens) <= now(),

    /**
     * One interactive attempt inside a `ctx.authorization` flow session: CIMD client id, PKCE S256,
     * `state`, `resource`, scope, extra `authorizationParameters`, the callback (`options.callback`, a
     * listener factory as `listenForCallback`; default the loopback one), `iss` check,
     * code exchange with no secret, commit of the grant record (once, R9). Resolves after the commit.
     * @param options.discovery `discoverServer`'s result (the caller has already decided to trust it).
     * @param options.message the notice text that goes with the approval URL.
     * @param options.timeoutMs the attempt's lifetime; `timers` the clock that measures it.
     * @param options.payloadFields the caller's own non-secret fields, stored in the grant payload
     *   beside this client's (core records the agent id it passed, R-FIX F10).
     * @throws OAuthAttemptError denied / rejected / expired / failed, or the signal's reason on abort.
     */
    async authorize({ session, serverUrl, clientMetadataUrl, discovery, authorizationParameters = {}, payloadFields = {}, message, timeoutMs, timers = globalThis, callback = listenForCallback }) {
      const metadata = discovery.authorizationServerMetadata
      // CIMD only (R-OA-13): no dynamic-registration fallback, and no hard-coded client.
      if (metadata.client_id_metadata_document_supported !== true) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed, MESSAGE.noCimd)
      // MCP Authorization: a client MUST refuse a server that does not list S256 (R-OA-02). The SDK
      // checks the list only when it is present, so an absent list would pass there (X-SEC X-13).
      const methods = metadata.code_challenge_methods_supported
      if (!Array.isArray(methods) || !methods.includes(OAUTH_CLIENT.pkceMethod)) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed, MESSAGE.noS256)
      const clientInformation = { client_id: clientMetadataUrl }
      const resource = await sdk.selectResourceURL(new URL(serverUrl), {}, discovery.resourceMetadata)
      const listener = await callback()
      try {
        session.signal.throwIfAborted()
        const redirectUrl = listener.redirectUrl
        const state = opaqueValue(OAUTH_CLIENT.stateBytes)
        const { authorizationUrl, codeVerifier } = await sdk.startAuthorization(discovery.authorizationServerUrl, {
          metadata, clientInformation, redirectUrl, scope: scopeFor(discovery), state, resource,
        })
        for (const [name, value] of Object.entries(authorizationParameters)) authorizationUrl.searchParams.set(name, value)
        // A listener reachable by others (core's web callback) delivers only this state's callback.
        listener.expect?.(state)
        session.notify({ message, url: String(authorizationUrl) })
        const params = await awaitCallback(listener, { signal: session.signal, timers, timeoutMs })
        const authorizationCode = acceptResponse(sdk, params, { state, metadata })
        let tokens
        try {
          tokens = await sdk.exchangeAuthorization(discovery.authorizationServerUrl, {
            metadata, clientInformation, authorizationCode, iss: params.get(OAUTH_CLIENT.param.iss) ?? undefined,
            codeVerifier, redirectUri: redirectUrl, resource,
            fetchFn: (input, init) => tokenFetch(input, { ...init, signal: session.signal }),
          })
        } catch (cause) {
          // A refused code (spent, expired, bound elsewhere) is a rejected response; anything else
          // (network, server error) is a failure of the attempt.
          throw new OAuthAttemptError(isInvalidGrant(sdk, cause) ? OAUTH_CLIENT.attemptEnd.rejected : OAUTH_CLIENT.attemptEnd.failed, undefined, { cause })
        }
        await session.commit(grantRecord({
          ...payloadFields,
          v: OAUTH_CLIENT.grantVersion, upstream: serverUrl, clientInformation, discovery, resource: String(resource), grantId: randomUUID(), tokens: tokensFrom(tokens),
        }))
      } finally {
        await listener.close()
      }
    },

    /** @returns `{outcome, grant}`, outcome one of OAUTH_CLIENT.refreshOutcome. */
    refresh({ failedAccessToken } = {}) {
      inFlight ??= refreshNow(failedAccessToken).finally(() => { inFlight = undefined })
      return inFlight
    },

    /**
     * Drop the tokens and keep the rest of the grant (the access token was refused again after a
     * refresh), but only while the stored access token is still the one that failed: under the same
     * lock as the refresh, so a newer token another process just obtained survives.
     * @returns the grant as stored afterwards.
     */
    async dropTokens({ failedAccessToken } = {}) {
      const record = await credentials.modifyRecord(key, async (current) => {
        const stored = accessTokenOf(current?.payload)
        const drop = stored !== undefined && (failedAccessToken === undefined || stored === failedAccessToken)
        return drop ? grantRecord(withoutTokens(current.payload)) : undefined
      })
      return record?.payload
    },
  })
}
