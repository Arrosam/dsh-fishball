/**
 * The origin a client dialled, from its checked `Host` (R-OA-01, R-REM-03, R-REM-05 (3); design
 * §5.5 "Issuer and canonical URI follow the checked host"; spike V3-S7 §4.2). The issuer, the
 * canonical MCP URI (the access token's audience) and the metadata URLs are all built from it,
 * so C-OAUTH, C-OAUTH-WEB and C-HTTP import this one rule (Fishball 2026-11-14, #2).
 *
 * Call it only after `RequestGate.check` passed: it does not decide whether a host is allowed.
 */
import { HOSTS } from '../../../mcp-schema/index.js'
import { HOST_AUTHORITY } from './constants.js'

/**
 * @param req - a Node request (only `headers.host` is read; no forwarded header ever is, HOSTS)
 * @param options.secure - whether the listener the request arrived on is TLS. Then every host is
 *   `https:` (Fishball 2026-11-14, #13: a loopback listener started with `--tls-cert` is dialled
 *   as `https://127.0.0.1`). Otherwise a loopback name is `http:` and any other allowed host is
 *   `https:`, since a non-loopback name is reached only through the user's TLS tunnel (R-REM-05 (3)).
 * @returns `"<scheme>//<Host>"` with the `Host` exactly as dialled (no trailing slash, no path),
 *   or `undefined` when the request has no usable `Host`: absent, empty, repeated, or not a bare
 *   authority that a URL parser keeps unchanged (userinfo, path, an out-of-range port, a host the
 *   parser would rewrite such as `0x7f.1`).
 */
export function originOf(req, { secure }) {
  const host = req.headers?.host
  if (typeof host !== 'string') return undefined
  const match = HOST_AUTHORITY.pattern.exec(host)
  if (match === null) return undefined
  const hostname = match[HOST_AUTHORITY.hostnameGroup].toLowerCase()
  // Parsed as an http authority: the WHATWG parser refuses a port over 65535 and rewrites hosts
  // such as `0x7f.1` or `127.1`, and a rewritten host is not the one the client dialled.
  let parsed
  try { parsed = new URL(HOSTS.loopbackScheme + HOST_AUTHORITY.schemeSuffix + host) } catch { return undefined }
  if (parsed.hostname !== hostname) return undefined
  const scheme = secure || !HOSTS.loopbackNames.includes(hostname) ? HOSTS.remoteScheme : HOSTS.loopbackScheme
  return scheme + HOST_AUTHORITY.schemeSuffix + host
}
