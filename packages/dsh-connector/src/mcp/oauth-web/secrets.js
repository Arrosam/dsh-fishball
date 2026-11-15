/**
 * Opaque values, their digests and PKCE (R-OA-05, R-OA-14, R-OA-16; RFC 7636). One home for the
 * module's crypto, so the page and both grants mint and hash the same way.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { PKCE, TOKEN_VALUE } from '../../../mcp-schema/index.js'
import { PKCE_RULES, SECRET_ENCODING } from './constants.js'

const sha256 = (text) => createHash(TOKEN_VALUE.digestAlgorithm).update(text, SECRET_ENCODING.text)

/** A fresh opaque value (code, refresh or access token, pending id, form nonce): 256 random bits. */
export const mintOpaque = () => randomBytes(TOKEN_VALUE.opaqueBytes).toString(SECRET_ENCODING.value)

/** The `OAuthTokenStore` key of an opaque value: lowercase hex SHA-256 (agreed with C-OAUTH). */
export const digestOf = (value) => sha256(value).digest(SECRET_ENCODING.digest)

/** Constant-time equality of two strings of unknown, possibly secret content (compares their digests). */
export const sameSecret = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && timingSafeEqual(sha256(a).digest(), sha256(b).digest())

/** Whether an authorization request's challenge is a well-formed S256 challenge (RFC 7636 §4.2, §4.3). */
export const isS256Challenge = (method, challenge) =>
  method === PKCE.method && typeof challenge === 'string' && PKCE_RULES.challenge.test(challenge)

/** Whether `verifier` is well formed and hashes to `challenge` under S256 (RFC 7636 §4.6). */
export function verifierMatches(verifier, challenge) {
  if (typeof verifier !== 'string' || !PKCE_RULES.verifier.test(verifier)) return false
  const computed = createHash(PKCE_RULES.digestAlgorithm).update(verifier, PKCE_RULES.verifierEncoding).digest(PKCE_RULES.challengeEncoding)
  return computed === challenge
}
