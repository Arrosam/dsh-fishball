/**
 * The token endpoint and the two metadata documents (task C-OAUTH; K1b `GrantRegistry` /
 * `GrantHandler`; R-OA-01, R-OA-02, R-OA-03, R-OA-17, R-TOK-02, R-TOK-06; design §5.5).
 *
 * One token request, in order (nothing past a refusal runs):
 * 1. `RequestGate.check(req, 'token')`: 405, 403 (`Host`, `Origin`), 503 (C-HTTP's gate). A `Host`
 *    the gate passed but no origin can be built from is 403 too.
 * 2. The address ceiling (ADDRESS_RATE_LIMIT, Fishball 2026-11-14, #15): every request counts,
 *    before its body is read, so no refusal below is free.
 * 3. `client_secret` or `access_token` in the URL query: 400 `invalid_request` (R-TOK-02, RFC 6750
 *    §2.3). Before the body is read, so a secret in the URL is refused even with a valid form.
 * 4. The body: the form media type, at most TOKEN_FORM.maxBodyBytes, no repeated parameter (RFC
 *    6749 §3.2), else 400 `invalid_request`. An empty value counts as omitted (§3.1).
 * 5. Client authentication: two methods at once is 400 `invalid_request` (§2.3).
 * 6. The limits per (address, client id): FAILURE_LIMIT through the shared `FailureLimiter`, then
 *    RATE_LIMITS. The client id is the one the request names, before it is verified (K1
 *    FAILURE_LIMIT). Every request reaching this step counts toward RATE_LIMITS, whatever its
 *    grant (R-OA-17).
 * 7. `grant_type`: missing is 400 `invalid_request`; with no handler 400 `unsupported_grant_type`.
 * 8. The grant's handler; its result is written unchanged (Fishball 2026-11-14), with
 *    `WWW-Authenticate: Basic` on `invalid_client` after Basic, and its counted failure recorded.
 *    A throw is 500 `server_error`.
 * Over a limit (2 or 6): 429, `Retry-After` in whole seconds (the longest wait when several
 * apply), `temporarily_unavailable`; a refused request counts toward no limit.
 *
 * Steps 6–8 run one request at a time per (address, client id): a handler that awaits (the
 * durable `putRefresh` of C-OAUTH-WEB's grants) would otherwise let parallel requests of one key
 * all pass the failure check before any of their failures is recorded, overshooting
 * FAILURE_LIMIT.perKeyPerWindow. Different keys still run in parallel.
 */
import {
  BEARER_CHALLENGE, CLIENT_AUTH, GATE_SURFACE, GRANT_DISPATCH, HTTP_STATUS, OAUTH_ERROR, OAUTH_METADATA, PATHS, RATE_LIMITS,
  TIME_UNIT, authorizationServerMetadata, protectedResourceMetadata,
} from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { clientAuthOf } from './client-auth.js'
import { createClientCredentialsGrant } from './client-credentials.js'
import {
  ADDRESS_RATE_LIMIT, EMPTY_VALUE, HEADER, HEADER_VALUE, LOG, MISUSE, ROUTE_KIND, SILENT_LOGGER, TEXT_ENCODING, TOKEN_FORM, UNKNOWN_ADDRESS,
  URL_BASE,
} from './constants.js'
import { limitKeyOf } from './failure-limiter.js'
import { originOf } from './origin.js'
import { writeHostRefused, writeJson, writeOAuthError, writeRefusal, writeServerError, writeToken } from './respond.js'
import { createWindowLog } from './window-log.js'

const QUERY_SECRETS = Object.freeze([BEARER_CHALLENGE.queryClientSecret, BEARER_CHALLENGE.queryParameter])
const TOO_LARGE = Symbol('too-large')
/** The form's parse failures, all one answer: 400 `invalid_request`. */
const BAD_FORM = Symbol('bad-form')

const GRANT_ERRORS = new Set([OAUTH_ERROR.invalidRequest, OAUTH_ERROR.invalidClient, OAUTH_ERROR.invalidGrant, OAUTH_ERROR.invalidTarget])

/** Whether a handler's answer is a K1b `GrantResult`; anything else is treated as a throw. */
function isGrantResult(result) {
  if (result === null || typeof result !== 'object') return false
  if (result.ok === true) return result.body !== null && typeof result.body === 'object'
  return result.ok === false && GRANT_ERRORS.has(result.error) && typeof result.countedFailure === 'boolean'
    && (result.description === undefined || typeof result.description === 'string')
}

/**
 * The request body as text, or TOO_LARGE once it passes `maxBytes`. Reading stops there: only
 * this reader's own listener is removed, and the caller closes the connection (`writeUnread`),
 * so the rest of the body is never drained.
 */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    function onData(chunk) {
      size += chunk.length
      if (size <= maxBytes) { chunks.push(chunk); return }
      req.off('data', onData)
      req.pause()
      resolve(TOO_LARGE)
    }
    req.on('data', onData)
    req.on('end', () => resolve(Buffer.concat(chunks).toString(TEXT_ENCODING)))
    req.on('error', reject)
  })
}

/** Whether a declared `Content-Length` already says the body is over `maxBytes`. */
function declaredTooLarge(req, maxBytes) {
  const declared = Number(req.headers[HEADER.contentLength])
  return Number.isFinite(declared) && declared > maxBytes
}

/** Whether the `Content-Type` names the form media type (parameters such as `charset` ignored). */
function isFormMediaType(contentType) {
  if (typeof contentType !== 'string') return false
  return contentType.split(TOKEN_FORM.mediaTypeParameterSeparator)[0].trim().toLowerCase() === TOKEN_FORM.mediaType
}

/**
 * The form as a frozen record of single values, or BAD_FORM when a parameter repeats (RFC 6749
 * §3.2). Parameters with an empty value are omitted (§3.1), and a repeat is judged among the
 * present ones. A null-prototype record, so a `__proto__` field is just a field.
 */
function parseForm(body) {
  const form = Object.create(null)
  for (const [name, value] of new URLSearchParams(body)) {
    if (value === EMPTY_VALUE) continue
    if (name in form) return BAD_FORM
    form[name] = value
  }
  return Object.freeze(form)
}

/** The request URL (Node's `req.url` is the path and query only). */
const urlOf = (req) => new URL(req.url, URL_BASE)

/**
 * The K1b `GateRequest` of a Node request: its method, its path without the query, its headers.
 * A Node request (and DSH's webServer, which passes it unchanged) has no `path` of its own.
 */
const gateRequestOf = (req) => Object.freeze({ method: req.method, path: urlOf(req).pathname, headers: req.headers })

const retryAfterSeconds = (retryAfterMs) => String(Math.ceil(retryAfterMs / TIME_UNIT.msPerSecond))
const remoteAddressOf = (req) => req.socket?.remoteAddress ?? UNKNOWN_ADDRESS

/**
 * An OAuth error for a request whose body is left unread: `Connection: close`, and the request is
 * destroyed once the answer is out, so Node never drains an unbounded body on a kept-alive socket.
 */
function writeUnread(req, res, error, headers = {}) {
  res.on('finish', () => req.destroy())
  writeOAuthError(res, error, { ...headers, [HEADER.connection]: HEADER_VALUE.close })
}

/**
 * Runs `task` after every earlier task of `key` has settled; tasks of other keys run in parallel.
 * A key leaves the map when its last task ends, so the map holds only keys with work in flight.
 */
function createKeyedQueue() {
  const tails = new Map()
  return function enqueue(key, task) {
    const run = (tails.get(key) ?? Promise.resolve()).then(task)
    const tail = run.catch(() => {})
    tails.set(key, tail)
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
    return run
  }
}

/**
 * @param deps.gate - C-HTTP's K1b `RequestGate` (`check` only: the token endpoint keeps its own
 *   RATE_LIMITS and FAILURE_LIMIT, K1b)
 * @param deps.failureLimiter - the shared K1a `FailureLimiter`
 * @param deps.tokenStore, deps.tokenRegistry, deps.pairStore - for the built-in grant
 * @param deps.secure - whether DSH's listener is TLS (`webServer.protocol`), for `originOf`
 * @param deps.approvalOrigin - `(req, origin) => string`: where the approval listener answers for
 *   this client (C-WIRE / C-OAUTH-WEB know the approval port; design §5.5a item 8)
 * @param deps.now - injected clock
 * @param deps.logger - background log
 * @returns `{register(handler), handleToken(req, res), handleProtectedResource(req, res),
 *   handleAuthorizationServer(req, res), routes}`: `register` is the K1b `GrantRegistry`; `routes`
 *   are the three DSH `WebRoute`s (exact) for `webServer.register`.
 */
export function createTokenEndpoint({ gate, failureLimiter, tokenStore, tokenRegistry, pairStore, secure, approvalOrigin, now, logger = SILENT_LOGGER }) {
  const handlers = new Map()
  const builtIn = [createClientCredentialsGrant({ tokenStore, tokenRegistry, pairStore })]
  for (const handler of builtIn) handlers.set(handler.grantType, handler)
  const requests = createWindowLog(RATE_LIMITS.windowMs)
  const addressRequests = createWindowLog(RATE_LIMITS.windowMs)
  const perKey = createKeyedQueue()

  /** K1b `GrantRegistry.register`: a wiring bug (built-in, duplicate or unsupported type) throws. */
  function register(handler) {
    if (handler === null || typeof handler !== 'object' || typeof handler.handle !== 'function') throw new TypeError(MISUSE.handler)
    const type = handler.grantType
    const supported = OAUTH_METADATA.authorizationServer.grant_types_supported.includes(type)
    if (!supported || GRANT_DISPATCH.builtIn.includes(type) || handlers.has(type)) throw new TypeError(MISUSE.grantType)
    handlers.set(type, handler)
  }

  /** Runs the gate; writes its refusal, or a 403 for an unusable `Host`. @returns the origin, or `undefined` when refused. */
  function gated(req, res) {
    const checked = gate.check(gateRequestOf(req), GATE_SURFACE.token)
    if (!checked.pass) { writeRefusal(res, checked); return undefined }
    const origin = originOf(req, { secure })
    if (origin === undefined) writeHostRefused(res)
    return origin
  }

  const rateLimitedHeaders = (retryAfterMs) => ({ [RATE_LIMITS.retryAfterHeader]: retryAfterSeconds(retryAfterMs) })

  /** The wait of the per-key limits (FAILURE_LIMIT, RATE_LIMITS) at `at`: 0 when the key may proceed. */
  function keyWaitMs(failureKey, at) {
    const failure = failureLimiter.check(failureKey, at)
    const rateMs = requests.retryAfterMs(limitKeyOf(failureKey), at, RATE_LIMITS.tokenRequestsPerWindow)
    return Math.max(failure.limited ? failure.retryAfterMs : 0, rateMs)
  }

  /** Steps 6–8, one at a time per key (see the header). */
  async function grant(res, form, auth, failureKey, origin) {
    const at = now()
    const waitMs = keyWaitMs(failureKey, at)
    if (waitMs > 0) return writeOAuthError(res, OAUTH_ERROR.temporarilyUnavailable, rateLimitedHeaders(waitMs))
    requests.add(limitKeyOf(failureKey), at)

    const grantType = form[GRANT_DISPATCH.formField]
    if (grantType === undefined) return writeOAuthError(res, OAUTH_ERROR.invalidRequest)
    const handler = handlers.get(grantType)
    if (handler === undefined) return writeOAuthError(res, OAUTH_ERROR.unsupportedGrantType)

    let result
    try {
      result = await handler.handle(form, Object.freeze({ origin, client: auth.client, failureKey, now: at }))
    } catch (error) {
      logger.warn(LOG.format, LOG.grantFailed, diagnosticOf(error))
      return writeServerError(res)
    }
    if (!isGrantResult(result)) {
      logger.warn(LOG.format, LOG.grantFailed, MISUSE.grantResult)
      return writeServerError(res)
    }
    if (result.ok) return writeToken(res, HTTP_STATUS.ok, result.body)
    if (result.countedFailure) failureLimiter.recordFailure(failureKey, at)
    // RFC 6749 §5.2: a 401 `invalid_client` after Basic names the scheme the client used (K1 basicScheme).
    const basic = result.error === OAUTH_ERROR.invalidClient && auth.client.method === CLIENT_AUTH.basic
    return writeOAuthError(res, result.error, basic ? { [HEADER.wwwAuthenticate]: BEARER_CHALLENGE.basicScheme } : {}, result.description)
  }

  async function serveToken(req, res, origin) {
    const address = remoteAddressOf(req)
    const at = now()
    const addressWaitMs = addressRequests.retryAfterMs(address, at, ADDRESS_RATE_LIMIT.tokenRequestsPerAddressPerWindow)
    if (addressWaitMs > 0) return writeUnread(req, res, OAUTH_ERROR.temporarilyUnavailable, rateLimitedHeaders(addressWaitMs))
    addressRequests.add(address, at)

    const query = urlOf(req).searchParams
    if (QUERY_SECRETS.some((name) => query.has(name))) return writeUnread(req, res, OAUTH_ERROR.invalidRequest)
    if (!isFormMediaType(req.headers[HEADER.contentType])) return writeUnread(req, res, OAUTH_ERROR.invalidRequest)
    if (declaredTooLarge(req, TOKEN_FORM.maxBodyBytes)) return writeUnread(req, res, OAUTH_ERROR.invalidRequest)
    const body = await readBody(req, TOKEN_FORM.maxBodyBytes)
    if (body === TOO_LARGE) return writeUnread(req, res, OAUTH_ERROR.invalidRequest)
    const form = parseForm(body)
    if (form === BAD_FORM) return writeOAuthError(res, OAUTH_ERROR.invalidRequest)
    const auth = clientAuthOf(req.headers[HEADER.authorization], form)
    if (auth.twoMethods) return writeOAuthError(res, OAUTH_ERROR.invalidRequest)

    const failureKey = Object.freeze({ remoteAddress: address, ...(auth.client.clientId === undefined ? {} : { clientId: auth.client.clientId }) })
    return perKey(limitKeyOf(failureKey), () => grant(res, form, auth, failureKey, origin))
  }

  /** Wraps a route body: a throw past the gate is 500 `server_error`, never an unhandled rejection. */
  const guarded = (serve) => async (req, res) => {
    try {
      const origin = gated(req, res)
      if (origin !== undefined) await serve(req, res, origin)
    } catch (error) {
      logger.warn(LOG.format, LOG.requestFailed, diagnosticOf(error))
      writeServerError(res)
    }
  }

  const handleToken = guarded(serveToken)
  const handleProtectedResource = guarded((req, res, origin) => writeJson(res, HTTP_STATUS.ok, {}, protectedResourceMetadata(origin)))
  const handleAuthorizationServer = guarded((req, res, origin) =>
    writeJson(res, HTTP_STATUS.ok, {}, authorizationServerMetadata(origin, approvalOrigin(req, origin))))

  return Object.freeze({
    register,
    handleToken,
    handleProtectedResource,
    handleAuthorizationServer,
    routes: Object.freeze([
      Object.freeze({ kind: ROUTE_KIND, path: PATHS.token, handler: handleToken }),
      Object.freeze({ kind: ROUTE_KIND, path: PATHS.protectedResourcePrefix + PATHS.mcp, handler: handleProtectedResource }),
      Object.freeze({ kind: ROUTE_KIND, path: PATHS.authorizationServerPrefix + PATHS.issuer, handler: handleAuthorizationServer }),
    ]),
  })
}
