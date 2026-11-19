/**
 * Vocabulary for the C-HTTP cases (v3-tasks.md row C-HTTP; .runtime/reports/v3-remaining-plan.md
 * W2): PLAT-UC-01, PLAT-EP-01, PLAT-BVA-02 (11-platform.md), REM-UC-03, REM-EP-02, REM-EP-03
 * (09-standalone-remote.md), EVT-EP-04 rows 3 and 4 (04-events-interception.md), AUTH-EP-02 rows
 * 1, 2 and 11–14 (01-auth-pairing.md), and the K1b rows the K1 suite left `todo` for C-HTTP
 * (k1b-cases.mjs: K1b-UC-01, K1b-DT-05, K1b-BVA-02, K1b-ST-02).
 *
 * Every product value is K1's (`dsh-agent-connector/mcp-schema`): statuses, paths, the request
 * gate's routes, orders, headers and Retry-After (REQUEST_GATE), limits, refusal words, the
 * protocol revision and codes, the bearer challenge. MCP wire names that the SDK owns (the `_meta`
 * keys, the legacy revision, METHOD_NOT_FOUND) come from the SDK under test (subject.mjs). The rest
 * is fixture data (hosts, origins, ids, keys) or harness timing, which are not product values.
 */
import path from 'node:path'
import {
  APPROVAL_LISTENER, BEARER_CHALLENGE, ENDPOINT_LIMITS, FAILURE_LIMIT, GATE_SURFACE, HOSTS, HTTP_METHOD, HTTP_REFUSAL, HTTP_STATUS, OAUTH_ERROR,
  OAUTH_ERROR_STATUS, PATHS, PROTOCOL, RATE_LIMITS, REQUEST_GATE, RESOURCE, SCOPE, TIME_UNIT, bearerChallenge, oauthUrls,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../../support/constants.mjs'

export {
  APPROVAL_LISTENER, BEARER_CHALLENGE, ENDPOINT_LIMITS, FAILURE_LIMIT, GATE_SURFACE, HOSTS, HTTP_METHOD, HTTP_REFUSAL, HTTP_STATUS, OAUTH_ERROR,
  OAUTH_ERROR_STATUS, PATHS, PROTOCOL, RATE_LIMITS, REQUEST_GATE, RESOURCE, SCOPE, TIME_UNIT, bearerChallenge, oauthUrls,
}

/**
 * C-HTTP's "Owns" folder and entry. K1b freezes `RequestGate` and `HintSink` but no factory, so the
 * two factories are found by meaning (subject.mjs states the one assumed shape of each).
 * FBTEST_C_HTTP_ENTRY moves the entry (another checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_HTTP_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mcp', 'http', 'index.js'),
  gateFactory: /^create\w*Gate$/i,
  routeFactory: /^create\w*(?:Route|Endpoint)$/i,
  /** K1b `RequestGate` methods. */
  gateMethods: Object.freeze(['check', 'admit']),
})

/** Release requirement: the endpoint byte cap remains 8 MiB regardless of argument structure. */
export const BODY_CAP_BYTES = 8 * 1024 * 1024

/** The SDK's MCP client, under the installed SDK (`@modelcontextprotocol/client` 2.2.0 on both hosts). */
export const SDK_CLIENT = Object.freeze({
  dir: path.join('node_modules', '@modelcontextprotocol', 'client'),
  entry: path.join('dist', 'index.mjs'),
})

/** MCP method and notification names [spec: MCP 2026-07-28 and 2025-11-25 schemas]. */
export const RPC = Object.freeze({
  discover: 'server/discover',
  listen: 'subscriptions/listen',
  initialize: 'initialize',
  toolsList: 'tools/list',
  subscribe: 'resources/subscribe',
  resourceUpdated: 'notifications/resources/updated',
  jsonrpc: ENDPOINT_LIMITS.jsonRpcVersion,
})

/** HTTP request headers the cases send [spec: Streamable HTTP; RFC 9110]; Node lower-cases them. */
export const HEADER = Object.freeze({
  authorization: 'authorization',
  contentType: 'content-type',
  contentLength: 'content-length',
  accept: 'accept',
  protocolVersion: 'mcp-protocol-version',
  mcpMethod: 'mcp-method',
  sessionId: PROTOCOL.ignoredHeaders[0],
  wwwAuthenticate: 'www-authenticate',
  /** RFC 6750 §2.1 / RFC 9110 §11.4: `<scheme> SP <credentials>`. */
  schemeSeparator: ' ',
  /** RFC 9110 §5.6.1 list separator of `Accept`. */
  listSeparator: ', ',
  json: 'application/json',
  sse: 'text/event-stream',
})

/** Server-sent events framing [spec: WHATWG HTML § Server-sent events]: lines, and a message's data field. */
export const SSE = Object.freeze({ lineBreak: '\n', dataField: 'data:' })

/** RevocationKind (index.d.ts, types only). */
export const REVOCATION = Object.freeze({ disabled: 'disabled' })
/** BearerVerifier's `{error}` for "no Bearer value" (index.d.ts, types only); the other is OAUTH_ERROR.invalidToken. */
export const VERIFY = Object.freeze({ missing: 'missing' })
/** The recording logger's levels that count as a diagnostic (cordis logger method names). */
export const DIAGNOSTIC_LEVELS = Object.freeze(['warn', 'error'])

/** Fixture data: hosts, origins, keys and ids of the case tables; not product values. */
export const FIXTURE = Object.freeze({
  /** The loopback bind of DSH's listener in these worlds (a member of HOSTS.loopbackNames). */
  loopback: HOSTS.loopbackNames[1],
  /** REM-EP-01 row 7's private address: a non-loopback bind. */
  lanHost: '192.168.1.5',
  /** A `--trusted-host` entry (REM-EP-02 row 4, R-REM-05: the user's tunnel name). */
  tunnelHost: 'fishball.tunnel.example',
  /** A `Host` none of the allowed hosts names (REM-UC-03 E3, AUTH-EP-09 row 5). */
  foreignHost: 'evil.example',
  foreignOrigin: 'https://evil.example',
  /** REM-EP-03 row 4. */
  nullOrigin: 'null',
  /** A method REQUEST_GATE serves on no route (PLAT-UC-01 E3) [spec: RFC 9110 §9.3.5]. */
  deleteMethod: 'DELETE',
  /** The port in a gate unit row's `Host` (DSH's listener; any port). */
  dshPort: 8080,
  /** A client's protocol-session id (PLAT-UC-01 E5). */
  sessionIds: Object.freeze(['fbtest-session-1', 'fbtest-session-2']),
  /** A base to parse a request target's pathname with (any absolute URL). */
  urlBase: 'http://fbtest.invalid',
  /** A path of no surface's routes (K1b-DT-05 row 4). */
  unlistedPath: '/api/fishball/not-a-route',
  clientInfo: Object.freeze({ name: 'fbtest-c-http', version: '0.0.0' }),
  /** The fake clock's reference instant (README "clock"). */
  t0: Date.UTC(2026, 10, 14),
  /** EVT-EP-04 row 3: two ids differing only in case (ids are case-sensitive, R-ID-02). */
  idP: 'agent',
  idQ: 'Agent',
  entry: (name) => `fbtest-entry-${name}`,
  principal: (id) => `fbtest-principal-${id}`,
  /** An opaque access token value the fake verifier knows (never a real token). */
  accessToken: (name) => `fbtest-at-${name}`,
  /** X-SEC X-03: bearers no verifier knows. */
  wrongToken: (i) => `fbtest-at-wrong-${i}`,
  /** A value no fake verifier knows. */
  unknownToken: 'fbtest-at-unknown',
  basicCredentials: 'ZmJ0ZXN0OmZidGVzdA==',
  generation: 1,
  /** The JSON-RPC id of a raw request. */
  rpcId: 1,
  /** JSON padding used to grow a body to an exact byte count. */
  pad: ' ',
})

/** K1 amendment rows (amend-cases.mjs): how the raw uploads are sent. Harness data, not product values. */
export const UPLOAD = Object.freeze({
  /** HTTP/1.1 chunked framing [spec: RFC 9112 §7.1]. */
  transferEncoding: 'transfer-encoding',
  chunked: 'chunked',
  /** The body bytes a held upload sends before it stops mid-body. */
  heldPrefixBytes: 1,
  /** The size of each chunk a streamed body is written in. */
  chunkBytes: 64 * 1024,
})

/** Harness timing only. */
export const WAIT = Object.freeze({
  /** How long a hint or a stream close may take to arrive. */
  eventMs: 5000,
  /** How long a stream that must get nothing is watched. */
  quietMs: 400,
  pollMs: 20,
  /** The SDK client's listen acknowledgement timeout. */
  ackMs: 10000,
})

/** Owners of the flows C-HTTP cannot run alone (v3-tasks.md W2–W4). */
export const LATER = Object.freeze({
  tools: 'C-TOOLS (core tools over MCP: tools/list and tools/call)',
  oauth: 'C-OAUTH (token endpoint and the two metadata documents on DSH\'s listener)',
  web: 'C-OAUTH-WEB (approval listener: its port and its two paths)',
  wire: 'C-WIRE (the connector row: every route mounted on DSH\'s listener, nothing else listening)',
})

/** R-FIX-CONNECTOR review rows (review-x-cases.mjs, finding F07): the row id. */
export const REVIEW_X = Object.freeze({ id: 'RX-F07' })
