/**
 * The hostname of a page's request (dsh-connector-shared, R-ARCH-08): the Host header, parsed as
 * a WHATWG URL parses it (lower-cased, an IPv6 literal kept in brackets). dsh-connector-ui's admit
 * route and dsh-instance's Open route both bind an admission to the name the page was opened under
 * (S4-Q1 A, K3 `LoopbackHostname`), so they read it with this one rule.
 */
const REQUEST_HOST = Object.freeze({
  header: 'host',
  parseScheme: 'http://',
  /**
   * Characters a bare `host[:port]` never holds; a Host with any of them (userinfo, a path, a
   * query or a fragment) is refused before parsing, because the URL parser would read a name out
   * of it (`evil@localhost` → `localhost`).
   */
  notInAuthority: /[@/?#\\]/,
})

/**
 * @param {Request} request - a Fetch request
 * @returns {string | undefined} its hostname, or undefined for a missing or malformed Host
 */
export function requestHostname(request) {
  const host = request.headers.get(REQUEST_HOST.header)
  if (typeof host !== 'string' || REQUEST_HOST.notInAuthority.test(host)) return undefined
  try { return new URL(REQUEST_HOST.parseScheme + host).hostname } catch { return undefined }
}
