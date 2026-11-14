/**
 * The bearer verifier (K1 `BearerVerifier`; R-TOK-01, R-TOK-02, R-OA-05, R-OA-06, R-OA-07,
 * R-OA-10, R-ID-03; design §5.5 "MCP endpoint check"). C-HTTP calls it after `RequestGate.check`
 * and before any MCP processing; C-HTTP also records the counted failure on the shared
 * FailureLimiter, since only it knows the remote address.
 *
 * Only access tokens from the token endpoint are accepted. A raw token value, `<id>.<token>` or a
 * value with an id header is simply an unknown access token (R-OA-10 withdrawn): no other lookup
 * exists. The lookup is by digest (`./digest.js`), so the presented value is never compared
 * character by character and no timing difference tells one stored token from another.
 *
 * Power is evaluated live at each call (R-ID-03): `powerOf` over the pair as it stands now, so a
 * pair-only token turns full the moment `pair` binds its entry to its client id.
 */
import { BEARER_CHALLENGE, ENTRY_STATUS, LIFETIME, OAUTH_ERROR, SCOPE } from '../../../mcp-schema/index.js'
import { powerOf } from '../../pairs/index.js'
import { AUTH_HEADER } from './constants.js'
import { digestOf } from './digest.js'

const MISSING = Object.freeze({ error: 'missing' })
const INVALID = Object.freeze({ error: OAUTH_ERROR.invalidToken })

/**
 * The bearer value of an `Authorization` header, or `undefined` when it carries none: absent,
 * another scheme (`Basic …`, AUTH-EP-02 row 2) or an empty value. The scheme is matched
 * case-insensitively (RFC 7235 §2.1).
 */
function bearerOf(authorization) {
  if (typeof authorization !== 'string') return undefined
  const separator = authorization.indexOf(AUTH_HEADER.schemeSeparator)
  if (separator < 0) return undefined
  if (authorization.slice(0, separator).toLowerCase() !== BEARER_CHALLENGE.scheme.toLowerCase()) return undefined
  const value = authorization.slice(separator + 1).trim()
  return value === '' ? undefined : value
}

/**
 * Whether the entry still stands behind a token issued under `generation`: present, enabled,
 * usable, and not disabled, deleted or given a new value since (R-OA-06). The generation check
 * also covers a revocation that happened while the connector was down.
 */
const entryStands = (entry, generation) => entry !== undefined && entry.enabled && entry.status === ENTRY_STATUS.ok && entry.generation === generation

/**
 * @param deps.tokenStore - the K1 `OAuthTokenStore`
 * @param deps.tokenRegistry - C-TOKENS' K1 `TokenRegistry` (`get`)
 * @param deps.pairStore - C-PAIR's K1 `PairStore` (`pairOf`)
 * @returns the K1 `BearerVerifier`
 */
export function createBearerVerifier({ tokenStore, tokenRegistry, pairStore }) {
  return Object.freeze({
    verify(authorization, audience, now) {
      const bearer = bearerOf(authorization)
      if (bearer === undefined) return MISSING
      const token = tokenStore.getAccess(digestOf(bearer))
      if (token === undefined) return INVALID
      // "Expired" is `now >= issuedAt + lifetime` (K1 LIFETIME); use never extends it (R-OA-07).
      if (now >= token.issuedAt + LIFETIME.accessTokenMs || token.audience !== audience) return INVALID
      if (!entryStands(tokenRegistry.get(token.entryKey), token.generation)) return INVALID
      const pair = pairStore.pairOf(token.entryKey)
      const { scope } = powerOf(pair, token.clientId)
      return Object.freeze({
        entryKey: token.entryKey,
        clientId: token.clientId,
        ...(scope === SCOPE.full ? { principalKey: pair.principalKey } : {}),
        scope,
        audience: token.audience,
        generation: token.generation,
      })
    },
  })
}
