/**
 * The one failure limit (K1a `FailureLimiter`; R-OA-17, R-TOK-06, design §5.6). The token
 * endpoint, the approval page (C-OAUTH-WEB) and the MCP bearer check (C-HTTP) share one instance,
 * so a wrong page entry and a wrong client secret count toward the same limit (S7b P2). In memory
 * only, with an injected clock; a key holds an address and the digest of a client id, never
 * token material.
 *
 * Limited at `now`: the key's own counted failures in the last FAILURE_LIMIT.windowMs reach
 * perKeyPerWindow, or its address's failures over every key reach perAddressPerWindow. The
 * address ceiling is what keeps a client that rotates `client_id` from one address to that many
 * guesses (FAILURE_LIMIT).
 */
import { FAILURE_LIMIT } from '../../../mcp-schema/index.js'
import { digestOf } from './digest.js'
import { createWindowLog } from './window-log.js'

const NOT_LIMITED = Object.freeze({ limited: false })

/**
 * The per-key log's key (FAILURE_LIMIT.keyParts), also the token endpoint's RATE_LIMITS key, which
 * K1 counts per the same (address, client id). The client id is held as its digest (Fishball
 * 2026-11-14, #16), so a key's size is bounded whatever a client sends. JSON of the two parts, so
 * no pair collides with another. An absent client id (an MCP bearer, or a token request naming
 * none) is its own key: the address alone.
 */
export const limitKeyOf = ({ remoteAddress, clientId }) => JSON.stringify([remoteAddress, clientId === undefined ? null : digestOf(clientId)])

/** @returns the K1 `FailureLimiter`. */
export function createFailureLimiter() {
  const perKey = createWindowLog(FAILURE_LIMIT.windowMs)
  const perAddress = createWindowLog(FAILURE_LIMIT.windowMs)

  return Object.freeze({
    check(key, now) {
      // The wait is the longer of the two: the request is admitted only once both are under.
      const retryAfterMs = Math.max(
        perKey.retryAfterMs(limitKeyOf(key), now, FAILURE_LIMIT.perKeyPerWindow),
        perAddress.retryAfterMs(key.remoteAddress, now, FAILURE_LIMIT.perAddressPerWindow),
      )
      return retryAfterMs > 0 ? Object.freeze({ limited: true, retryAfterMs }) : NOT_LIMITED
    },

    recordFailure(key, now) {
      perKey.add(limitKeyOf(key), now)
      perAddress.add(key.remoteAddress, now)
    },
  })
}
