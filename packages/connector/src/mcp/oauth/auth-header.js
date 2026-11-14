/**
 * `Authorization` header splitting (RFC 7235 §2.1), shared by the bearer verifier and the token
 * endpoint's Basic client authentication: `<scheme> <credentials>`, the scheme matched
 * case-insensitively.
 */
import { AUTH_HEADER } from './constants.js'

/**
 * @param authorization - the raw header, or undefined
 * @param scheme - the expected scheme word (K1 BEARER_CHALLENGE.scheme / basicScheme)
 * @returns the trimmed credentials (`''` when the header holds the scheme alone), or `undefined`
 *   when there is no header or it names another scheme
 */
export function credentialsOf(authorization, scheme) {
  if (typeof authorization !== 'string') return undefined
  const separator = authorization.indexOf(AUTH_HEADER.schemeSeparator)
  const named = separator < 0 ? authorization : authorization.slice(0, separator)
  if (named.toLowerCase() !== scheme.toLowerCase()) return undefined
  return separator < 0 ? '' : authorization.slice(separator + 1).trim()
}
