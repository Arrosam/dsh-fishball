/**
 * Constants of the connector's MCP HTTP layer (task C-HTTP). Every tunable of the surface (paths,
 * hosts, limits, statuses, challenges, the gate's order and routes) is K1's and is imported from
 * `../../../mcp-schema`; this file holds only what is this module's own: wire words of HTTP and
 * JSON-RPC that K1 does not name, the server's identity, and log lines.
 */

import { TIME_UNIT } from '../../../mcp-schema/index.js'

/** HTTP header names and values the endpoint writes or reads (lower case, as Node delivers them). */
export const HTTP_HEADER = Object.freeze({
  contentType: 'content-type',
  contentLength: 'content-length',
  wwwAuthenticate: 'www-authenticate',
  authorization: 'authorization',
})

/**
 * How the gate reads an authority (`Host`, a `--trusted-host` entry, the bind address):
 * - `notBare`: characters a bare `host[:port]` never holds (whitespace, userinfo, path, query,
 *   fragment, backslash); WHATWG parsing would silently drop or reinterpret what follows them;
 * - `schemeSuffix`: what joins a scheme and an authority into a parseable URL;
 * - `zoneSeparator` / `ipv6Separator`: a bind address's `%zone` (an interface selector, not address
 *   text, ignored as DSH's `isBindAddressAuthority` does) and the mark of an IPv6 literal, which a
 *   URL authority needs bracketed (`ipv6Open` / `ipv6Close`).
 */
export const AUTHORITY = Object.freeze({
  notBare: Object.freeze(/[\s/?#@\\]/),
  schemeSuffix: '//',
  zoneSeparator: '%',
  ipv6Separator: ':',
  ipv6Open: '[',
  ipv6Close: ']',
})

/** The token bucket refills ENDPOINT_LIMITS.requestsPerMinute per this many milliseconds. */
const SECONDS_PER_MINUTE = 60
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * TIME_UNIT.msPerSecond

/** A token bucket admits a request while it holds at least this many tokens; a pass takes it. */
export const BUCKET_COST = 1
export const MEDIA_TYPE = Object.freeze({
  json: 'application/json',
  // The SDK's listen router answers a stream with this; any other answer to a listen request is
  // a refusal (bad filter, version) and opens nothing.
  eventStream: 'text/event-stream',
})

/** The BearerVerifier's refusal word for "no Bearer value" (index.d.ts BearerVerifier.verify): 401 without `error`. */
export const BEARER_MISSING = 'missing'

/**
 * `createMcpHandler` options of the SDK that are this module's choices:
 * - `legacy`: modern-only (Q12): a 2025-era request gets the SDK's -32022, never a legacy session;
 * - `noListenStreams`: the `maxSubscriptions` of the handler that serves ordinary requests. Listen
 *   streams belong only on a pair's own handler (S1 F2, streams.js), so the shared one refuses
 *   every `subscriptions/listen` in band, should one ever reach it.
 */
export const SDK_OPTION = Object.freeze({ legacy: 'reject', noListenStreams: 0 })

/** The manifest's text encoding. */
export const TEXT_ENCODING = 'utf8'

/** The JSON-RPC members and methods the endpoint reads before the SDK (pair-only power, listen routing). */
export const JSON_RPC = Object.freeze({
  listenMethod: 'subscriptions/listen',
  toolsCallMethod: 'tools/call',
})

/**
 * The FailureLimiter address of a request whose socket has already gone (Node then reports no
 * `remoteAddress`): such requests share one key rather than escaping the limit.
 */
export const UNKNOWN_ADDRESS = 'unknown'

/** The URL base for parsing a request target's query; only the query is read, never this host. */
export const URL_BASE = 'http://request.invalid'

/** `serverInfo.name` of `server/discover` (Fishball 2026-11-14, Q10); the version is the package's. */
export const SERVER_NAME = 'dsh-connector'
/** The connector manifest, relative to this module, read once for `serverInfo.version`. */
export const MANIFEST_URL = new URL('../../../package.json', import.meta.url)

/**
 * The message of the endpoint's -32022 (PROTOCOL.unsupportedVersionCode) answer. The SDK names only
 * the requested revision; design §3.1 wants the message itself to name the served one, so a
 * 2025-era client can show the user why it cannot connect (PLAT-UC-01 E1).
 */
export const unsupportedVersionMessage = (served) => `Unsupported protocol version: this server serves only ${served}`

/** Background log lines (never a token, key, id or body). `logger.warn(LOG.format, line, diagnostic)`. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  requestFailed: 'mcp endpoint: a request failed before the SDK answered it',
  sdkError: 'mcp endpoint: the SDK reported an error',
  presenceListenerFailed: 'mcp endpoint: a presence listener threw',
  closeFailed: 'mcp endpoint: closing a listen handler failed',
  // Once per listener, when the gate is built (R-REM-02 "refused at load, with a diagnostic").
  insecureListener: 'request gate: DSH\'s listener is not loopback and not https; every connector route answers 503',
})
