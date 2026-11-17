/**
 * The DSH side's OAuth browser client (the S7c K2 token manager; design §5.5b, §6.3a; requirements
 * 1.40, R-OA-13/14/16, R-OA-21 rules 3, 5 and 9). One copy per side (requirements 1.40): the Fishball
 * side writes its own for core's Connect (F-LINK-SAVE, design §6.3a), so nothing here is imported
 * across the sides.
 *
 * Generic on purpose: it knows OAuth 2.1 + PKCE against an MCP server, a Client ID Metadata Document
 * client id, the loopback callback, and one `grant` record in DSH's credential store. It knows no
 * server check, no proxy and no tool; those are the adapter's (packages/dsh-connector-adapter).
 *
 * It imports nothing. The caller passes the MCP client SDK module (`@modelcontextprotocol/client`
 * 2.2.0, the line both hosts ship), so this library takes no package edge and each user pins its
 * own SDK. The protocol steps are the SDK's own primitives (`startAuthorization`,
 * `exchangeAuthorization`, `refreshAuthorization`, `validateAuthorizationResponseIssuer`, the two
 * discovery reads). The SDK's `auth()` orchestrator is NOT used: on an `invalid_grant` from the code
 * exchange it invalidates and runs the exchange again with the same code, a second use the
 * connector answers by revoking every token of that code (R-OA-14); and it would fall back to
 * dynamic registration, which these clients never use (R-OA-13: CIMD only).
 *
 * Secrets: the access and refresh tokens, the code and the PKCE verifier live only in memory during
 * a call and in the caller's credential record (R-TOK-04). Nothing here logs, and no error message
 * carries a value.
 */
import { randomBytes } from 'node:crypto'
import http from 'node:http'

/** Fixed protocol and storage vocabulary of this client. */
export const OAUTH_CLIENT = Object.freeze({
  /** Fetch's redirect mode on every OAuth request: a redirect is an error, never followed (X-05). */
  redirect: 'error',
  /** The PKCE method the authorization server must advertise (MCP Authorization; X-13). */
  pkceMethod: 'S256',
  /** RFC 8252 §7.3: a loopback IP literal, never `localhost` (R-OA-14 treats them as distinct hosts). */
  loopbackHost: '127.0.0.1',
  /** The path the user's CIMD document registers; the port is the OS's, fresh per attempt (R-OA-14). */
  callbackPath: '/callback',
  /** Grant record payload version (S7c plan step K1, "grant record v1"). */
  grantVersion: 1,
  /** dsh-credentials record kind for an authorization grant. */
  recordKind: 'grant',
  /** Bytes of randomness in `state` (base64url); 256 bits, as for any unguessable client value. */
  stateBytes: 32,
  /**
   * Default deadline of each outbound OAuth request (discovery, code exchange, refresh), 30 s
   * (Fishball's decision on the C-MCP-ADAPTER review, S2); a caller may pass its own.
   */
  requestTimeoutMs: 30_000,
  /** listen() port 0: the OS picks a free port. */
  osPort: 0,
  /** Node event names this module listens to. */
  event: Object.freeze({ abort: 'abort', error: 'error' }),
  randomEncoding: 'base64url',
  /** How an attempt ended without a grant. */
  attemptEnd: Object.freeze({ denied: 'denied', rejected: 'rejected', expired: 'expired', failed: 'failed' }),
  refreshOutcome: Object.freeze({ refreshed: 'refreshed', declined: 'declined', invalidGrant: 'invalid-grant', noRefreshToken: 'no-refresh-token' }),
  /** `clientMetadataUrl` problems (R-OA-21 rule 1). */
  urlProblem: Object.freeze({ missing: 'missing', invalid: 'invalid' }),
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
    body: 'You can close this tab and return to DSH.',
  }),
})

/** Error messages (never a value). */
const MESSAGE = Object.freeze({
  discovery: 'the server\'s OAuth metadata could not be read',
  noCimd: 'the authorization server does not accept Client ID Metadata Documents',
  noS256: 'the authorization server does not support PKCE S256',
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
 * Why a `clientMetadataUrl` value cannot be used (R-OA-21 rule 1, the SDK's own `isHttpsUrl` rule).
 * @returns `undefined` when it is an https URL whose path is not `/`, else `missing` or `invalid`.
 */
export function clientMetadataUrlProblem(value) {
  if (typeof value !== 'string' || value.length === 0) return OAUTH_CLIENT.urlProblem.missing
  try {
    const url = new URL(value)
    return url.protocol === OAUTH_CLIENT.clientIdUrl.protocol && url.pathname !== OAUTH_CLIENT.clientIdUrl.rootPath ? undefined : OAUTH_CLIENT.urlProblem.invalid
  } catch {
    return OAUTH_CLIENT.urlProblem.invalid
  }
}

/**
 * RFC 9728 then RFC 8414 discovery, with no fallback guess of the authorization server: the issuer
 * is `authorization_servers[0]` of the protected-resource metadata, or discovery fails.
 * @param options.requestTimeoutMs the deadline of each discovery request (default OAUTH_CLIENT.requestTimeoutMs).
 * @param options.acceptResource optional gate on the protected-resource metadata, run before the
 *   authorization server is contacted at all; when it returns false discovery stops there.
 * @returns the SDK's discovery-state shape `{authorizationServerUrl, resourceMetadata,
 *   authorizationServerMetadata}`, ready for a grant record; `undefined` when `acceptResource` said no.
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

/** An unguessable value of `bytes` random bytes, base64url (state, local bearers). */
export const opaqueValue = (bytes) => randomBytes(bytes).toString(OAUTH_CLIENT.randomEncoding)
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
 * An HTTP listener on 127.0.0.1 with an OS port (the callback here, the adapter's proxy).
 * @param handler a node:http request handler.
 * @returns `{port, close()}`; `close` drops open connections too, so it never waits on a stream.
 */
export function listenLoopback(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    const close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()) })
    server.once(OAUTH_CLIENT.event.error, reject)
    server.listen(OAUTH_CLIENT.osPort, OAUTH_CLIENT.loopbackHost, () => resolve({ port: server.address().port, close }))
  })
}

/**
 * The request's path and query, or `undefined` when its target is not a parseable URL (e.g.
 * `GET //`): parsing must never throw inside a synchronous request handler, where nothing catches it.
 */
function requestUrl(req) {
  try { return new URL(req.url, `http://${OAUTH_CLIENT.loopbackHost}`) } catch { return undefined }
}

/**
 * One attempt's loopback callback listener. It answers every request until the attempt ends and
 * delivers only the first one on the callback path; `close()` at the end of the attempt leaves
 * nothing listening, so the URL is dead once the attempt ends (S7c rules).
 */
async function listenForCallback() {
  let deliver
  const received = new Promise((r) => { deliver = r })
  const listener = await listenLoopback((req, res) => {
    const url = requestUrl(req)
    if (url?.pathname !== OAUTH_CLIENT.callbackPath) { res.writeHead(OAUTH_CLIENT.callbackPage.notFound); res.end(); return }
    res.writeHead(OAUTH_CLIENT.callbackPage.status, OAUTH_CLIENT.callbackPage.headers)
    res.end(OAUTH_CLIENT.callbackPage.body)
    deliver(url.searchParams)
  })
  return { ...listener, received }
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
 * `fetchFn` with a deadline on every request, joined to the caller's own signal. The refresh runs
 * inside `credentials.modifyRecord`, which holds the store's queue and cross-process file lock, so
 * an unanswered token endpoint must not hold them for longer than a writer elsewhere waits for that
 * lock (dsh-credentials-local DOCUMENT_LOCK_WAIT_MS, 30 s); discovery and the code exchange get the
 * same deadline so the sign-in tool and an attempt cannot hang on a silent server.
 */
function withDeadline(fetchFn, timeoutMs) {
  return (input, init = {}) => fetchFn(input, {
    ...init,
    // Never followed (X-SEC X-05): a 307/308 would re-send a code, verifier or refresh token to
    // whatever the `Location` names; the SDK checks only the first URL.
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
 * @param options.refreshLeadMs how long before expiry a timer refresh is due.
 * @param options.fetchFn fetch for every token-endpoint request (default global).
 * @param options.requestTimeoutMs the deadline of each token-endpoint request (default OAUTH_CLIENT.requestTimeoutMs).
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
  /**
   * A lifetime no longer than the lead is due the moment it is issued, so a timer would refresh it
   * again at once, forever: such a token gets no timer and is refreshed only on a 401.
   */
  const refreshesByTimer = (tokens) => dueAt(tokens) !== undefined && (tokens.issuedAt === undefined || tokens.expiresAt - tokens.issuedAt > refreshLeadMs)
  let inFlight

  /**
   * Single-flight refresh (R-OA-16 (1), R-OA-21 rule 5; S7c F5). Concurrent callers in this process
   * share one promise; the decision runs under `modifyRecord`'s cross-process lock, so a caller in
   * another process that lost the race finds the newer token and declines. One refresh token is
   * therefore presented once, and this client never needs the connector's 10 s grace window.
   * A caller refreshes only if the stored access token is still the one that failed, or it is within
   * the lead of expiry (the timer passes no failed token).
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

    /**
     * One interactive attempt inside a `ctx.authorization` flow session: CIMD client id, PKCE S256,
     * `state`, `resource`, scope, loopback callback, `iss` check, code exchange with no secret,
     * commit of the v1 grant record. Resolves after the commit.
     * @param options.discovery `discoverServer`'s result (the caller has already decided to trust it).
     * @param options.message the notice text that goes with the approval URL.
     * @param options.timeoutMs the attempt's lifetime; `timers` the clock that measures it.
     * @throws OAuthAttemptError denied / rejected / expired / failed, or the signal's reason on abort.
     */
    async authorize({ session, serverUrl, clientMetadataUrl, discovery, message, timeoutMs, timers = globalThis }) {
      const metadata = discovery.authorizationServerMetadata
      // CIMD only (R-OA-13): no dynamic-registration fallback, and no hard-coded client.
      if (metadata.client_id_metadata_document_supported !== true) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed, MESSAGE.noCimd)
      // MCP Authorization: a client MUST refuse an authorization server that does not advertise
      // S256 (X-SEC X-13); the SDK checks it only when the list is present.
      if (!metadata.code_challenge_methods_supported?.includes(OAUTH_CLIENT.pkceMethod)) throw new OAuthAttemptError(OAUTH_CLIENT.attemptEnd.failed, MESSAGE.noS256)
      const clientInformation = { client_id: clientMetadataUrl }
      const resource = await sdk.selectResourceURL(new URL(serverUrl), {}, discovery.resourceMetadata)
      const listener = await listenForCallback()
      try {
        session.signal.throwIfAborted()
        const redirectUrl = `http://${OAUTH_CLIENT.loopbackHost}:${listener.port}${OAUTH_CLIENT.callbackPath}`
        const state = opaqueValue(OAUTH_CLIENT.stateBytes)
        const { authorizationUrl, codeVerifier } = await sdk.startAuthorization(discovery.authorizationServerUrl, {
          metadata, clientInformation, redirectUrl, scope: scopeFor(discovery), state, resource,
        })
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
          v: OAUTH_CLIENT.grantVersion, upstream: serverUrl, clientInformation, discovery, resource: String(resource), tokens: tokensFrom(tokens),
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
     * Drop the tokens and keep the rest of the grant (a second 401, R-OA-21 rule 5), but only while
     * the stored access token is still the one that failed: under the same lock as the refresh, so a
     * newer token another process just obtained survives. Called with no failed token (the relayed
     * K2 form), it drops whatever tokens are stored.
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

    /**
     * Milliseconds until the timer refresh is due (≤ 0 when already due), or `undefined` when no
     * timer refresh applies: no expiry, no refresh token, or a lifetime no longer than the lead.
     */
    refreshDueInMs(grant) {
      const tokens = grant?.tokens
      return tokens?.refresh_token === undefined || !refreshesByTimer(tokens) ? undefined : dueAt(tokens) - now()
    },
  })
}
