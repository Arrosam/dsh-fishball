/**
 * The adapter's own contract (S7c plan step K1; design §5.5b, R-OA-21 as renamed by requirements
 * 1.41 / design §1.0c): names, states, the DSH-connector check, the tool's results, the proxy rules
 * and the K values. Frozen by C-MCP-ADAPTER; a change is a K amendment.
 *
 * The connector's paths and scope are copied here, not imported: the adapter does not depend on
 * dsh-connector (it runs in another DSH and talks to it only over its public MCP surface, design
 * §1.0), and the check must read what that surface publishes.
 */

export const ADAPTER = Object.freeze({
  name: 'dsh-connector-adapter',
  service: 'dshConnectorAdapter',
  /** Logger prefix; log lines name a server, never a value. */
  logLabel: 'dsh-connector-adapter',
  /** Labels of the plugin's effects (cordis diagnostics). */
  effect: Object.freeze({ proxy: 'dsh-connector-adapter.proxy', tool: 'dsh-connector-adapter.tool', flow: 'dsh-connector-adapter.flow', server: 'dsh-connector-adapter.server' }),
  /** The `ctx.authorization` flow's one method (S7c F4). */
  method: Object.freeze({ id: 'browser', label: 'Sign in with the browser' }),
})

/**
 * Credential-record key `<plugin>/server-<hex of the serverName's UTF-8 bytes>`: dsh-credentials keys
 * are `[a-z][a-z0-9-]*`, while a serverName may hold upper case and `_`; hex keeps each name its own key.
 * The proxy route reuses the same id.
 */
export const SERVER_ID = Object.freeze({ prefix: 'server-', encoding: 'hex', textEncoding: 'utf8' })

/**
 * The server URL rule (Fishball's decision on the review, S8): the proxy sends the access token to
 * this URL, so it must be https, except on a loopback host, where http stays local (MCP Security §
 * Communication Security). Anything else refuses the adapter's start with a typed code.
 */
export const SERVER_URL = Object.freeze({
  secureProtocol: 'https:',
  loopbackProtocol: 'http:',
  loopbackHosts: Object.freeze(['127.0.0.1', '[::1]', 'localhost']),
})

/** dsh-mcp-client's own serverName rule (lib/index.js SERVER_NAME_PATTERN), so the child row accepts it. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** What a `dsh-connector` endpoint publishes (design §1.0c; R-OA-21 rule 2, Q-S7C-5 = A). */
export const DSH_CONNECTOR = Object.freeze({
  mcpPath: '/api/agent/mcp',
  issuerPath: '/api/agent/oauth',
  scope: 'agent',
})

/** Typed codes of a configuration the adapter refuses to start with. */
export const CONFIG_ERROR = Object.freeze({
  duplicateServer: 'duplicate-server',
  insecureServerUrl: 'insecure-server-url',
})

/** States per server (R-OA-21). */
export const STATE = Object.freeze({
  needsConfiguration: 'needs-configuration',
  needsAuthorization: 'needs-authorization',
  authorizing: 'authorizing',
  authorized: 'authorized',
  failed: 'failed',
})

/** Why a server is `needs-configuration` or `failed` (status and tool results). */
export const REASON = Object.freeze({
  clientMetadataUrlMissing: 'client-metadata-url-missing',
  clientMetadataUrlInvalid: 'client-metadata-url-invalid',
  notADshConnector: 'not-a-dsh-connector',
  discoveryFailed: 'discovery-failed',
  authorizationFailed: 'authorization-failed',
})

/** The sign-in tool (Q-S7C-3 = B), renamed neutrally with the package (requirements 1.41). */
export const SIGN_IN_TOOL = Object.freeze({
  name: 'dsh_connector_sign_in',
  status: Object.freeze({
    authorized: STATE.authorized,
    approvalUrl: 'approval-url',
    /** The attempt ended before its approval URL was known (cancelled, refused): sign in again. */
    needsAuthorization: STATE.needsAuthorization,
    needsConfiguration: STATE.needsConfiguration,
    failed: STATE.failed,
    unknownServer: 'unknown-server',
  }),
})

/** Model-facing and log wording (English only, requirements Q7). */
export const TEXT = Object.freeze({
  toolDescription: 'Sign this DSH in to a configured DSH connector (an MCP server of another DSH). Returns status "authorized" when nothing is needed; "approval-url" with a URL for the user to open in a browser, where they enter a token from the connector\'s settings; "needs-configuration" or "failed" with a reason; "needs-authorization" when the attempt ended before a URL was ready (call again); or "unknown-server". Never ask the user for the token in the chat.',
  serverArg: 'The serverName of a server configured in the dsh-connector-adapter settings.',
  approval: 'Open this URL in your browser and enter a token from the connector\'s settings. The URL holds no secret and stops working once this sign-in ends.',
  flowLabel: (serverName) => `DSH connector ${serverName}`,
  needsAuthorizationAgain: '%s: %s needs a new sign-in (the connector refused the grant)',
  refreshFailed: '%s: refreshing %s failed: %s',
  configError: (code, serverName) => `${ADAPTER.logLabel}: ${code}: server "${serverName}"`,
  configClientMetadataUrl: 'The https URL of your Client ID Metadata Document (you host it; there is no default).',
  configServers: 'The DSH connectors to sign in to: one grant and one MCP client row per entry.',
  configServerName: 'Local name of the server; its tools appear as mcp__<serverName>__<tool>.',
  configUrl: `The connector's MCP endpoint, ending in ${DSH_CONNECTOR.mcpPath}; https, or http on a loopback host.`,
})

/**
 * K values (S7c plan step K1, frozen by C-MCP-ADAPTER).
 * - refreshLeadMs: 300 s before expiry, the spike's value; the access token lives 3600 s (Q27).
 * - minRefreshDelayMs: lower bound on the timer, so a tiny or already-past lifetime cannot spin.
 * - attemptTimeoutMs: 600 s, the connector's pending-request lifetime (R-OA-15), the most it may be.
 * The refresh timer is also clamped to dsh-timeout's MAX_TIMER_DELAY_MS (Node's largest delay, the
 * same on both SDKs): a longer delay would fire at once and loop.
 * - proxyBodyBytes: 8 MiB, the connector's own MCP body cap (dsh-connector ENDPOINT_LIMITS.bodyBytes),
 *   so the proxy never refuses a body the connector would take.
 * - localBearerBytes: 256 bits of randomness for the per-start local bearer.
 * - refreshRetry*: after a failed timer refresh (not `invalid_grant`) the next try waits 30 s, doubling
 *   per consecutive failure up to 300 s (the refresh lead), for as long as the grant is live (the
 *   user's decision on review F4).
 */
export const LIMIT = Object.freeze({
  refreshLeadMs: 300_000,
  minRefreshDelayMs: 1_000,
  attemptTimeoutMs: 600_000,
  proxyBodyBytes: 8 * 1024 * 1024,
  localBearerBytes: 32,
  refreshRetryFirstMs: 30_000,
  refreshRetryMaxMs: 300_000,
  refreshRetryFactor: 2,
})

/** HTTP statuses the proxy answers or classifies. */
const HTTP_STATUS = Object.freeze({ unauthorized: 401, notFound: 404, tooLarge: 413, badGateway: 502, serviceUnavailable: 503, gatewayTimeout: 504 })

/** The loopback proxy (R-OA-21 rule 7). */
export const PROXY = Object.freeze({
  host: '127.0.0.1',
  pathPrefix: '/mcp/',
  bearerPrefix: 'Bearer ',
  authorization: 'authorization',
  /** RFC 9110 §7.6.1: every field this header names is hop-by-hop too; its value is a comma list. */
  connection: 'connection',
  listSeparator: ',',
  /** RFC 9110 §7.6.1 hop-by-hop fields, plus the caller's own credentials (no token passthrough). */
  dropRequestHeaders: Object.freeze(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-connection', 'authorization', 'content-length']),
  /** fetch() already decoded the body, so its length and encoding no longer describe what is sent on. */
  dropResponseHeaders: Object.freeze(['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding', 'trailer', 'upgrade']),
  /** Methods sent with no body. */
  bodyless: Object.freeze(['GET', 'HEAD']),
  status: HTTP_STATUS,
  /** Not followed by the proxy's fetch, and never relayed: the child would follow them (review F2). */
  redirect: 'manual',
  /** The statuses fetch follows (WHATWG Fetch "redirect status"). */
  redirectStatuses: Object.freeze([301, 302, 303, 307, 308]),
  /**
   * What a gateway or tunnel answers while the connector behind it is down (review F5; the user's
   * decision): Bad Gateway, Service Unavailable, Gateway Timeout, and Cloudflare's 520–530 origin
   * errors (cloudflared). ngrok's 404 for an offline endpoint is not here: it cannot be told from a
   * real 404. Any other answer counts as the connector reachable.
   */
  gateway: Object.freeze({
    statuses: Object.freeze([HTTP_STATUS.badGateway, HTTP_STATUS.serviceUnavailable, HTTP_STATUS.gatewayTimeout]),
    tunnelRange: Object.freeze({ first: 520, last: 530 }),
  }),
  /** The local-bearer comparison digests both sides first. */
  digestAlgorithm: 'sha256',
  /** The response's close event: the child went away, so the upstream request is aborted. */
  closeEvent: 'close',
  /** A stream's failure event (the relayed upstream body). */
  errorEvent: 'error',
})

/** The child row: the stock dsh-mcp-client, pointed at the proxy (mechanism c2). */
export const CHILD_ROW = Object.freeze({
  transport: 'streamable-http',
  /** A start failure must not fail the adapter; the client's own reconnect takes over. */
  failOnStartupError: false,
})
