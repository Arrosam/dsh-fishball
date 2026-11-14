/**
 * Core's target status (REM-DT-01; R-FB-03, R-FB-04, R-MIG-03; K3 child.d.ts `TargetStatus`).
 * Pure: it maps what one connection attempt saw to `{state, code}`.
 *
 * | Rule | Seen | state | code |
 * | --- | --- | --- | --- |
 * | 1 | target blank | `target-unset` | `null` |
 * | 1a | target URL refused by core (REM-EP-01 rows 6–8) | `target-unset` | the refusal |
 * | 3 | no token value (K3: a reference with no value is `target-unset`, PROPOSED) | `target-unset` | `null` |
 * | 2 | no answer, or any other failure | `target-unreachable` | `TARGET_UNREACHABLE` |
 * | 4 | the target refused the credential | `token-refused` | `TOKEN_REFUSED` |
 * | 4a | as 4, for a credential the link's pairing gate holds a paired record for (R-HOST-10, K3 `TargetCode`) | `token-refused` | `token-revoked` |
 * | 5 | connected (listen stream open) | `connected` | `null` |
 * | 6 | the MCP route answered 404 (a V2 connector), the target sends the link to another origin or
 * |   | names another issuer, or its listen stream does not honour `fishball://events` | `target-unreachable` | `TARGET_INCOMPATIBLE` |
 *
 * Rule 6 uses K3's wording "the target … is not a V3 connector" for its state: a V3 connector
 * always names its own origin's K1 issuer and honours the events subscription (the user's
 * decisions, 2026-11-14). Rule 4 is decided from what the SDK threw, never from an earlier 401
 * alone: a 401 challenge precedes every first token request, so it says nothing about the outcome.
 */
import { HTTP_STATUS, TARGET_CODE, TARGET_STATE } from './schema.js'
import { REFUSED_OAUTH_ERRORS } from './constants.js'

/** The link's fetch guard refused a URL outside the target origin; it never left the process. */
export class OffTargetRequest extends Error {}

const status = (state, code) => Object.freeze({ state, code })

export const STATUS = Object.freeze({
  unset: status(TARGET_STATE.unset, null),
  connected: status(TARGET_STATE.connected, null),
  unreachable: status(TARGET_STATE.unreachable, TARGET_CODE.unreachable),
  refused: status(TARGET_STATE.refused, TARGET_CODE.refused),
  // Rule 4a: decided by the pairing gate (F-PAIR), which alone knows the paired records.
  revoked: status(TARGET_STATE.refused, TARGET_CODE.revoked),
  incompatible: status(TARGET_STATE.unreachable, TARGET_CODE.incompatible),
})

/** `target-unset` with core's own refusal code for the target URL (rule 1a). */
export const refusedTarget = (code) => status(TARGET_STATE.unset, code)

const REFUSED_HTTP = Object.freeze([HTTP_STATUS.unauthorized, HTTP_STATUS.forbidden])

/** The error and every `cause` below it (the SDK wraps transport and auth errors); a cycle ends the walk. */
function* causes(error) {
  const seen = new Set()
  for (let e = error; e !== undefined && e !== null && !seen.has(e); e = e.cause) {
    seen.add(e)
    yield e
  }
}

const is = (Kind, error) => typeof Kind?.isInstance === 'function' && Kind.isInstance(error)

/**
 * Classifies a failed connection attempt (rules 2, 4, 6).
 * @param {object} sdk the `@modelcontextprotocol/client` module the link runs on
 * @param {unknown} error what the attempt threw
 * @param {number | undefined} mcpStatus the last HTTP status the MCP URL answered in this attempt
 */
export function failureStatus(sdk, error, mcpStatus) {
  if (mcpStatus === HTTP_STATUS.notFound) return STATUS.incompatible
  const chain = [...causes(error)]
  const any = (test) => chain.some(test)
  if (any((e) => e instanceof OffTargetRequest || is(sdk.AuthorizationServerMismatchError, e) || is(sdk.IssuerMismatchError, e))) return STATUS.incompatible
  if (any((e) => is(sdk.OAuthError, e) && REFUSED_OAUTH_ERRORS.includes(e.code))) return STATUS.refused
  if (any((e) => is(sdk.InsufficientScopeError, e) || is(sdk.UnauthorizedError, e))) return STATUS.refused
  if (any((e) => is(sdk.SdkHttpError, e) && REFUSED_HTTP.includes(e.status))) return STATUS.refused
  return STATUS.unreachable
}
