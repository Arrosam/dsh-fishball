/**
 * OAuth metadata and challenge builders (task K1; R-OA-01/02, R-TOK-01, R-ID-06; design §5.5,
 * §5.5a; spikes S1, S7, S7b). Pure functions of the checked request origin: which hosts are
 * allowed, and how the origin is derived from the `Host`, is C-HTTP's check (HOSTS); these only
 * turn an already-checked origin into the frozen documents, so C-OAUTH and C-OAUTH-WEB build the
 * same bytes.
 */
import {
  BEARER_CHALLENGE, INSUFFICIENT_SCOPE_REASON, LIFETIME, OAUTH_ERROR, OAUTH_METADATA, PATHS, SCOPE, TIME_UNIT, TOKEN_TYPE,
} from './constants.js'

/** The only `error` / `error_description` values a challenge may carry, so RFC 6750 §3 quoting stays trivial. */
const CHALLENGE_ERRORS = Object.freeze([OAUTH_ERROR.invalidToken, OAUTH_ERROR.insufficientScope])
const CHALLENGE_DESCRIPTIONS = Object.freeze(Object.values(INSUFFICIENT_SCOPE_REASON))

/**
 * The URLs one checked origin names (R-OA-01). `origin` is `<scheme>://<host>[:port]` with no
 * path, exactly as the client dialled it (S1 C29, S7 §4.2).
 * @param {string} origin
 */
export function oauthUrls(origin) {
  const issuer = origin + PATHS.issuer
  return Object.freeze({
    issuer,
    resource: origin + PATHS.mcp,
    tokenEndpoint: origin + PATHS.token,
    // RFC 9728 §3.1 and RFC 8414 §3.1: the well-known segment goes between host and path.
    protectedResourceMetadata: origin + PATHS.protectedResourcePrefix + PATHS.mcp,
    authorizationServerMetadata: origin + PATHS.authorizationServerPrefix + PATHS.issuer,
  })
}

/** RFC 9728 protected resource metadata (design §5.5 table). */
export function protectedResourceMetadata(origin) {
  const urls = oauthUrls(origin)
  return Object.freeze({
    resource: urls.resource,
    authorization_servers: Object.freeze([urls.issuer]),
    ...OAUTH_METADATA.protectedResource,
  })
}

/**
 * RFC 8414 authorization server metadata (R-OA-02; design §5.5 table; S7b §3.2 item 1).
 * `approvalOrigin` is where the approval listener answers for this client: on loopback the
 * client's hostname with the approval port, behind a tunnel the tunnel origin itself (R-OA-11, S7b
 * F4). The endpoint is listed even while the port is in use, because stock clients refuse metadata
 * without it (R-OA-20, S1 F1). No `registration_endpoint`, and never `offline_access` [spec].
 */
export function authorizationServerMetadata(origin, approvalOrigin) {
  const urls = oauthUrls(origin)
  return Object.freeze({
    issuer: urls.issuer,
    token_endpoint: urls.tokenEndpoint,
    authorization_endpoint: approvalOrigin + PATHS.authorize,
    ...OAUTH_METADATA.authorizationServer,
  })
}

/**
 * The standard token response (R-OA-04, R-OA-18: standard fields only), sent with
 * TOKEN_RESPONSE_HEADERS. `refreshToken` is given
 * only for a browser client's grant (R-OA-16); machine exchange has none (R-OA-07).
 * @param {{accessToken: string, scope: string, refreshToken?: string}} issued
 */
export function tokenResponse({ accessToken, scope, refreshToken }) {
  const body = {
    access_token: accessToken,
    token_type: TOKEN_TYPE,
    expires_in: LIFETIME.accessTokenMs / TIME_UNIT.msPerSecond,
    scope,
  }
  return Object.freeze(refreshToken === undefined ? body : { ...body, refresh_token: refreshToken })
}

/** `{error, error_description?}`, the OAuth error body (RFC 6749 §5.2). */
export function oauthErrorBody(error, description) {
  return Object.freeze(description === undefined ? { error } : { error, error_description: description })
}

const quoted = (value) => `"${value}"`

/**
 * The `WWW-Authenticate` value of the MCP endpoint's 401 and 403 (R-TOK-01, R-ID-06).
 * - no token presented: `Bearer scope="fishball", resource_metadata="…"`;
 * - an invalid one: the same with `error="invalid_token"` first;
 * - a pair-only token on a full-power call: `error="insufficient_scope"`, the reason as
 *   `error_description`, then `scope="fishball"` (the scope needed, never `fishball:pair`, [spec]).
 * The parameter order is BEARER_CHALLENGE.params, so equal inputs give byte-identical headers.
 * Only the frozen error and reason words are written; any other value is dropped, so no caller
 * text can break the header's quoting (RFC 6750 §3).
 * @param {string} origin the checked origin
 * @param {{error?: string, description?: string}} [problem]
 */
export function bearerChallenge(origin, problem = {}) {
  const values = {
    error: CHALLENGE_ERRORS.includes(problem.error) ? problem.error : undefined,
    error_description: CHALLENGE_DESCRIPTIONS.includes(problem.description) ? problem.description : undefined,
    scope: SCOPE.full,
    resource_metadata: oauthUrls(origin).protectedResourceMetadata,
  }
  const parts = BEARER_CHALLENGE.params.filter((key) => values[key] !== undefined).map((key) => `${key}=${quoted(values[key])}`)
  return `${BEARER_CHALLENGE.scheme} ${parts.join(', ')}`
}

/** The challenge for an invalid, expired, revoked or foreign access token. */
export const invalidTokenChallenge = (origin) => bearerChallenge(origin, { error: OAUTH_ERROR.invalidToken })

/** The 403 challenge of a pair-only token (`reason` from INSUFFICIENT_SCOPE_REASON). */
export const insufficientScopeChallenge = (origin, reason) => bearerChallenge(origin, { error: OAUTH_ERROR.insufficientScope, description: reason })
