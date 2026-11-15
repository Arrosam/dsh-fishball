/**
 * What both browser grants and the page share: whether an entry still stands behind a binding, and
 * minting one chain link (R-OA-05, R-OA-14, R-OA-16). The stores are K1's `TokenRegistry`,
 * `PairStore` and `OAuthTokenStore`; nothing here holds a token value after it returns.
 */
import { ENTRY_STATUS, SCOPE, tokenResponse } from '../../../mcp-schema/index.js'
import { digestOf, mintOpaque } from './secrets.js'

/**
 * The entry and its pair when the entry is enabled and usable (R-OA-06, R-TOK-08) and still bound
 * to the browser client `clientIdUrl` the token was issued for; undefined otherwise. A reconnect
 * records the newest client id URL (R-OA-22) and revokes every earlier chain (K1d-6), so this
 * check is the second line: it refuses a chain of another client that a failed revocation left.
 * @param generation when given, the entry must still be at it (a refresh token records the one it
 *   was issued under, so a disable or delete since revokes it, R-OA-16 (3))
 */
export function liveBinding({ tokens, pairs }, entryKey, clientIdUrl, generation) {
  const entry = tokens.get(entryKey)
  if (entry === undefined || !entry.enabled || entry.status !== ENTRY_STATUS.ok) return undefined
  if (generation !== undefined && entry.generation !== generation) return undefined
  const pair = pairs.pairOf(entryKey)
  return pair !== undefined && pair.clientIdUrl === clientIdUrl ? { entry, pair } : undefined
}

/**
 * Mints one access token and one refresh token of `chain` and returns the token response.
 * The refresh token is written first (it is the durable half, Q-S7B-3 A): if that write fails, no
 * access token exists either, and C-OAUTH answers the throw with 500.
 * - the access token's `clientId` is the bound fishball id, so the live scope rule (`powerOf`)
 *   gives it full power; the refresh token's is the CIMD URL, which the refresh grant compares
 *   (Fishball 2026-11-14, item 2, agreed with C-OAUTH);
 * - `scope` is `agent`: a browser client is bound before its first token (R-OA-18).
 * @param chain `{chainId}`: a new chain's at a code redemption, the presented record's at a rotation
 * @returns `{body, refreshDigest}`: the token response, and the new refresh token's store key, by
 *   which the refresh grant later sees whether the chain was revoked since
 */
export async function issueLink(store, { entry, pair }, clientIdUrl, audience, chain, now) {
  const accessToken = mintOpaque()
  const refreshToken = mintOpaque()
  const refreshDigest = digestOf(refreshToken)
  await store.putRefresh(refreshDigest, {
    chainId: chain.chainId, entryKey: entry.entryKey, clientId: clientIdUrl, audience, generation: entry.generation,
  })
  store.putAccess(digestOf(accessToken), {
    entryKey: entry.entryKey, clientId: pair.id, audience, generation: entry.generation, issuedAt: now, chainId: chain.chainId,
  })
  return { body: tokenResponse({ accessToken, scope: SCOPE.full, refreshToken }), refreshDigest }
}
