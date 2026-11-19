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
 * The link's transport rule for the target URL and Connect's authorization endpoint (the web
 * callback and the CIMD URL keep their own, stricter rules): `https:` to any host, or `http:` only to
 * a loopback name, an exact WHATWG hostname match (so `foo.localhost` and `127.0.0.2` are not
 * loopback here, unlike the MCP SDK's own token-endpoint exemption).
 * @param {URL} url
 */
export function isSecureOrLoopback(url) {
  if (url.protocol === LINK.hosts.remoteScheme) return true
  return url.protocol === LINK.hosts.loopbackScheme && LINK.hosts.loopbackNames.includes(url.hostname)
}

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
  if (url.protocol !== LINK.hosts.loopbackScheme && url.protocol !== LINK.hosts.remoteScheme) return refused(LINK.code.invalid)
  if (!isSecureOrLoopback(url)) return refused(LINK.code.insecure)
  return Object.freeze({ ok: true, url, origin: url.origin, issuer: issuerOf(url.origin) })
}
