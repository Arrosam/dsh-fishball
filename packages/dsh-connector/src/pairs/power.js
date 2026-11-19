/**
 * Live scope evaluation (R-ID-03, R-ID-06, R-OA-04; AUTH-DT-01 rules 5–7, AUTH-DT-02 rules 2–9):
 * what a token of an entry, presented with a client id, may do now. It is evaluated from the pair
 * as it stands at each request, never from what the token said when issued: a pair-only token
 * becomes full the moment `pair` binds its entry to its client id, and stays pair-only (now
 * `id-mismatch`) when another client bound the entry first.
 *
 * Pure: the caller (C-OAUTH's token endpoint and bearer verifier) passes `PairStore.pairOf(entry)`.
 */
import { INSUFFICIENT_SCOPE_REASON, SCOPE } from '../../mcp-schema/index.js'

const FULL = Object.freeze({ scope: SCOPE.full })
const NOT_PAIRED = Object.freeze({ scope: SCOPE.pair, reason: INSUFFICIENT_SCOPE_REASON.notPaired })
const ID_MISMATCH = Object.freeze({ scope: SCOPE.pair, reason: INSUFFICIENT_SCOPE_REASON.idMismatch })

/**
 * @param pair - the entry's pair, or `undefined` when the entry is unbound
 * @param clientId - the client id the token was issued to; compared exactly (case-sensitive, R-ID-02)
 * @returns `{scope: 'agent'}`, or `{scope: 'agent:pair', reason}` with the `error_description`
 *   of a 403 `insufficient_scope` (`not-paired` / `id-mismatch`)
 */
export function powerOf(pair, clientId) {
  if (pair === undefined) return NOT_PAIRED
  return pair.id === clientId ? FULL : ID_MISMATCH
}

/**
 * Whether the approval page bound the pair (R-OA-22): only a page bind or reconnect records the
 * client id URL (K1 `Pair.clientIdUrl`). Such an entry belongs to a browser client, so the token
 * endpoint refuses it `client_credentials` (K1d; decided item 4: one token, one client type).
 * @param pair - the entry's pair, or `undefined` when the entry is unbound
 */
export const isPageBound = (pair) => pair?.clientIdUrl !== undefined
