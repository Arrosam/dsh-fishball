/**
 * The child's loopback bearer (§3.2, §15 T03).
 *
 * The child mints exactly one 256-bit token per server instance and hands it to the parent over
 * the authenticated lifecycle channel. The parent attaches it to every proxied child request;
 * the token is never persisted, never placed in a URL and never reaches page JavaScript. A
 * restarted child starts a new authority, so a token minted for an earlier instance is refused
 * with the contract's 401.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { BEARER } from '../contract.js'

/** Hex keeps the credential header-safe and matches this repository's other channel tokens. */
const TOKEN = Object.freeze({ encoding: 'hex' })

/**
 * Create the bearer authority for one child instance.
 *
 * `token` is the parent-only credential. `accepts` is the child server's whole check: only the
 * exact Authorization: Bearer header of this instance is admitted.
 * @returns {{ token: string, accepts: (headerValue: unknown) => boolean }}
 */
export function createAuthority() {
  const token = randomBytes(BEARER.tokenBytes).toString(TOKEN.encoding)
  const expected = Buffer.from(token, 'utf8')
  const prefix = BEARER.scheme + BEARER.separator
  return Object.freeze({
    token,
    accepts(headerValue) {
      if (typeof headerValue !== 'string' || !headerValue.startsWith(prefix)) return false
      // Compare the token text itself: a hex decode silently ignores trailing non-hex
      // characters, so decoding before the comparison could admit a longer credential.
      const supplied = Buffer.from(headerValue.slice(prefix.length), 'utf8')
      return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    },
  })
}
