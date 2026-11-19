/**
 * V3-S7c spike constants (throwaway prototype, not product code).
 * Every value marked K is a spike placeholder for a number frozen at V3-K.
 */
export const S7C = Object.freeze({
  pluginName: 'mcp-oauth-adapter-spike',
  // `<scope>/<id>` credential-record key grammar (dsh-credentials KEY_SEGMENT_PATTERN): scope = our plugin name.
  recordScope: 'mcp-oauth-adapter',
  // Refresh before expiry: when less than this many seconds remain (K). The access token lives 3600 s (Q27).
  refreshLeadSeconds: 300,
  // Lower bound on the timer so a token with a tiny lifetime cannot spin (K).
  minRefreshDelayMs: 1000,
  callbackPath: '/callback',
  // Bounded wait for the user to finish the approval page (K). The connector's pending request lives 600 s.
  authorizationTimeoutMs: 600_000,
  // Loopback proxy (mechanism c): the path the stock row points at, one per adapted row.
  proxyPathPrefix: '/mcp/',
  status: Object.freeze({ needsAuthorization: 'needs-authorization', authorized: 'authorized' }),
  // Hop-by-hop or client-identity headers the proxy must not forward upstream (RFC 9110 §7.6.1), plus the
  // local bearer, which never leaves the loopback hop.
  dropRequestHeaders: Object.freeze(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'authorization', 'proxy-authorization', 'te', 'trailer', 'content-length']),
  dropResponseHeaders: Object.freeze(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding']),
  // The proxy's own local bearer, so other local processes cannot ride on the adapter's grant (K: length).
  localBearerBytes: 32,
  spikeFile: 's7c-adapter.json',
})
