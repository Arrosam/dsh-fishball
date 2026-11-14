/**
 * The issuer origin seen from the approval listener (R-OA-11 "Approval origin"; S7b F4; Fishball
 * 2026-11-14, item 6). The browser reaches the page under some origin; the issuer (and the
 * canonical MCP URI) the client recorded is DSH's listener under the same host name:
 * - on loopback, and on a direct non-loopback bind, the browser dialled the approval port, so the
 *   issuer is that host name with DSH's port and the same scheme (both listeners share TLS, K1b);
 * - behind the user's tunnel the browser dialled the tunnel's one public origin, path-routed to
 *   both listeners, so the issuer is that origin as dialled.
 * The approval port is how the two cases are told apart. A tunnel whose public port equals the
 * approval port would be read as the first case; R-REM-05 has no tunnel feature, so this is the
 * documented limit, not handled.
 */
import { URL_RULES } from './constants.js'

/** `{scheme, host, port}` of `<scheme>//<authority>`, the port defaulted by scheme; undefined when unparsable. */
function originParts(origin) {
  const outer = URL_RULES.origin.exec(origin)
  if (outer === null) return undefined
  const [, scheme, authority] = outer
  const inner = URL_RULES.authority.exec(authority)
  if (inner === null) return undefined
  const [, host, port] = inner
  return { scheme, host, port: port === undefined ? URL_RULES.defaultPorts[scheme.toLowerCase()] : Number(port) }
}

/**
 * @param pageOrigin the checked origin of the approval request (C-OAUTH's `originOf`)
 * @param approvalPort the approval listener's port; `dshPort` DSH's own listener port
 * @returns the origin the issuer and canonical MCP URI are built from, or undefined when
 *   `pageOrigin` cannot be parsed
 */
export function issuerOriginFor(pageOrigin, approvalPort, dshPort) {
  const parts = originParts(pageOrigin)
  if (parts === undefined) return undefined
  if (parts.port !== approvalPort) return pageOrigin
  const portSuffix = URL_RULES.defaultPorts[parts.scheme.toLowerCase()] === dshPort ? '' : URL_RULES.portSeparator + dshPort
  return parts.scheme + URL_RULES.schemeSeparator + parts.host + portSuffix
}
