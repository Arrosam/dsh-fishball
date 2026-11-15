/**
 * The target URL rule of core's link (R-FB-03, R-FB-04, R-REM-02; REM-EP-01). Pure: no request.
 *
 * Core refuses plain `http:` to a non-loopback host itself, before any request: the MCP SDK's own
 * https rule covers only the token endpoint, so the access token would otherwise travel in plain
 * text to the MCP URL (spike V3-S7 `8e92b84` §4.4).
 */
import { LINK } from '../../contracts/constants.js'
import { issuerOf } from './schema.js'
import { STATUS, refusedTarget } from './status.js'

/**
 * @typedef {{ ok: true, url: URL, origin: string, issuer: string }} UsableTarget
 * @typedef {{ ok: false, status: {state: string, code: string | null} }} RefusedTarget
 */

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

const unusable = (status) => Object.freeze({ ok: false, status })
const refused = (code) => unusable(refusedTarget(code))

/**
 * Checks a configured target URL.
 * The refusal carries the TargetStatus to report (`status`), so the rule has one place.
 * - blank (absent, empty or white space only): `target-unset`, code `null` (R-FB-03);
 * - not a URL, a scheme other than http/https, or a URL with a user name or password (a fetch
 *   refuses those, so it could never connect): `target-unset`, `LINK.code.invalid`;
 * - `http:` to a host that is not a loopback name: `target-unset`, `LINK.code.insecure`;
 * - otherwise usable, with the issuer core pins (`expectedIssuer`): the target origin's connector issuer,
 *   so the client secret can only ever go to an authorization server of the target's own origin.
 * @param {unknown} value
 * @returns {UsableTarget | RefusedTarget}
 */
export function checkTarget(value) {
  if (isBlank(value)) return unusable(STATUS.unset)
  if (typeof value !== 'string' || !URL.canParse(value)) return refused(LINK.code.invalid)
  const url = new URL(value)
  if (url.username !== '' || url.password !== '') return refused(LINK.code.invalid)
  const loopback = LINK.hosts.loopbackNames.includes(url.hostname)
  if (url.protocol === LINK.hosts.loopbackScheme && !loopback) return refused(LINK.code.insecure)
  if (url.protocol !== LINK.hosts.loopbackScheme && url.protocol !== LINK.hosts.remoteScheme) return refused(LINK.code.invalid)
  return Object.freeze({ ok: true, url, origin: url.origin, issuer: issuerOf(url.origin) })
}
