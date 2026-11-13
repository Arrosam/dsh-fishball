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
 * | 5 | connected (listen stream open) | `connected` | `null` |
 * | 6 | the MCP route answered 404 (a V2 connector), or the target names another issuer | `target-unreachable` | `TARGET_INCOMPATIBLE` |
 *
 * Rule 6 uses K3's wording "the target … is not a V3 connector" for its state. An issuer other
 * than the target origin's K1 issuer is counted there too: a V3 connector always names its own.
 */
import { LINK_HTTP, REFUSED_OAUTH_ERRORS, TARGET_CODE, TARGET_STATE } from './constants.js'

const status = (state, code) => Object.freeze({ state, code })

export const STATUS = Object.freeze({
  unset: status(TARGET_STATE.unset, null),
  connected: status(TARGET_STATE.connected, null),
  unreachable: status(TARGET_STATE.unreachable, TARGET_CODE.unreachable),
  refused: status(TARGET_STATE.refused, TARGET_CODE.refused),
  incompatible: status(TARGET_STATE.unreachable, TARGET_CODE.incompatible),
})

/** `target-unset` with core's own refusal code for the target URL (rule 1a). */
export const refusedTarget = (code) => status(TARGET_STATE.unset, code)

const is = (Kind, error) => typeof Kind?.isInstance === 'function' && Kind.isInstance(error)

/**
 * Classifies a failed connection attempt (rules 2, 4, 6).
 * @param {object} sdk the `@modelcontextprotocol/client` module the link runs on
 * @param {unknown} error what the attempt threw
 * @param {number | undefined} mcpStatus the last HTTP status the MCP URL answered in this attempt
 */
export function failureStatus(sdk, error, mcpStatus) {
  if (mcpStatus === LINK_HTTP.notFound) return STATUS.incompatible
  if (is(sdk.AuthorizationServerMismatchError, error) || is(sdk.IssuerMismatchError, error)) return STATUS.incompatible
  if (is(sdk.OAuthError, error) && REFUSED_OAUTH_ERRORS.includes(error.code)) return STATUS.refused
  if (is(sdk.InsufficientScopeError, error) || is(sdk.UnauthorizedError, error)) return STATUS.refused
  if (is(sdk.SdkHttpError, error) && (error.status === LINK_HTTP.unauthorized || error.status === LINK_HTTP.forbidden)) return STATUS.refused
  if (mcpStatus === LINK_HTTP.unauthorized || mcpStatus === LINK_HTTP.forbidden) return STATUS.refused
  return STATUS.unreachable
}
