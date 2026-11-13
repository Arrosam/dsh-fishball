/**
 * The target URL rule of core's link (R-FB-03, R-FB-04, R-REM-02; REM-EP-01). Pure: no request.
 *
 * Core refuses plain `http:` to a non-loopback host itself, before any request: the MCP SDK's own
 * https rule covers only the token endpoint, so the access token would otherwise travel in plain
 * text to the MCP URL (spike V3-S7 `8e92b84` §4.4).
 */
import { oauthUrls } from './schema.js'
import { TARGET_REFUSAL, TARGET_STATE, TARGET_URL } from './constants.js'

/**
 * @typedef {{ ok: true, url: URL, origin: string, issuer: string }} UsableTarget
 * @typedef {{ ok: false, state: string, code: string | null }} RefusedTarget
 */

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const refused = (code) => Object.freeze({ ok: false, state: TARGET_STATE.unset, code })

/**
 * Checks a configured target URL.
 * - blank (absent, empty or white space only): `target-unset`, code `null` (R-FB-03);
 * - not a URL, or a scheme other than http/https: `target-unset`, `TARGET_REFUSAL.invalid`;
 * - `http:` to a host that is not a loopback name: `target-unset`, `TARGET_REFUSAL.insecure`;
 * - otherwise usable, with the issuer core pins (`expectedIssuer`): the target origin's K1 issuer,
 *   so the client secret can only ever go to an authorization server of the target's own origin.
 * @param {unknown} value
 * @returns {UsableTarget | RefusedTarget}
 */
export function checkTarget(value) {
  if (isBlank(value)) return refused(null)
  if (typeof value !== 'string' || !URL.canParse(value)) return refused(TARGET_REFUSAL.invalid)
  const url = new URL(value)
  const loopback = TARGET_URL.loopbackNames.includes(url.hostname)
  if (url.protocol === TARGET_URL.loopbackScheme && !loopback) return refused(TARGET_REFUSAL.insecure)
  if (url.protocol !== TARGET_URL.loopbackScheme && url.protocol !== TARGET_URL.remoteScheme) return refused(TARGET_REFUSAL.invalid)
  return Object.freeze({ ok: true, url, origin: url.origin, issuer: oauthUrls(url.origin).issuer })
}
