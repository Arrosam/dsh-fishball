/**
 * Frozen data of the connector's MCP surface (task K1; design §3, §5.5, §5.5a, §5.8, §11 V3-K;
 * requirements R-CON, R-TOK, R-OA, R-ID, R-NAME, R-EVS, R-REM; spikes V3-S1 `9499ec6`, S2
 * `a499141`, S3 `b4dca86`, S7 `8e92b84`, S7b `141ac3b`). Data only: no DSH import, no behaviour.
 * Every name here is part of the `./mcp-schema` freeze; changing one is a K1 amendment.
 *
 * Marks used in the comments:
 * - [spec]     decided per MCP 2026-07-28 and the RFCs it cites (requirements 1.18);
 * - [req]      the value is in the requirements;
 * - [design]   the value is in the design, which a requirement defers to;
 * - PROPOSED   no requirement fixes it: frozen as written unless the user changes it at review;
 * - DECIDED    the user decided the value at review (relayed by Fishball); #n is its row in
 *              README.md "User decisions", the one record of the decisions of K1, K2 and K3.
 *
 * Units are part of each name. Values with different meanings keep separate names even when they
 * coincide. Every RegExp is frozen and has no `g` flag, so importers share no `lastIndex` state.
 */
import { CALL_CODE, CONTRIBUTED_EVENT, NAME_GRAMMAR, SHARED_CODES, TOOLS_API } from '../tools/constants.js'
// The V2 domain's operation codes keep their one owner, `./contract`, until C-WIRE retires it;
// C-WIRE then moves these values here unchanged (a move, not a K1 amendment).
import { ERROR as V2_ERROR, LIMITS as V2_LIMITS } from '../contract/contract.js'

// K2's frozen SHARED_CODES, by its declared order (tools/README.md "Codes"), so each word keeps
// K2 as its one owner. The order is part of K2's freeze: reordering it is a K2 amendment, and
// that amendment must update this line.
const [, forbidden, unknownSession, expired, conflict, unavailable, unsupportedOperation] = SHARED_CODES

const KIB = 1024
const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Unit conversion for the wire's whole-second fields (`expires_in`, `Retry-After`). */
export const TIME_UNIT = Object.freeze({ msPerSecond: SECOND_MS })

/**
 * The one MCP revision served (Q12, R-CON-01). The value has one owner, K2's TOOLS_API, because
 * contributors receive the same string as `call.protocolVersion`.
 */
export const PROTOCOL = Object.freeze({
  version: TOOLS_API.protocolVersion,
  // The SDK's `createMcpHandler(..., {legacy: 'reject'})` answers these itself (S1 C17–C19).
  unsupportedVersionCode: -32022,
  headerMismatchCode: -32020,
  // [spec] 2026-07-28 removed protocol sessions: a client's `Mcp-Session-Id` is ignored (S1 C21).
  ignoredHeaders: Object.freeze(['mcp-session-id']),
  // [req] R-OA-09: `server/discover` advertises this extension, with an empty settings object.
  clientCredentialsExtension: 'io.modelcontextprotocol/oauth-client-credentials',
})

/**
 * The runtime SDK pins (R-CONN `368e848`). `@modelcontextprotocol/node` 2.1.1 and later need
 * server ^2.3.0, so 2.1.0 is the newest adapter that admits server 2.2.0, the line of both hosts'
 * client. A change of either pin is a K1 amendment and also a change of
 * `packages/connector/package.json` (C-WIRE owns it after W1).
 */
export const SDK_PINS = Object.freeze({
  '@modelcontextprotocol/server': '2.2.0',
  '@modelcontextprotocol/node': '2.1.0',
})

/** Routes. DSH's listener routes are `exact` (S1 F3: exact routes win over DSH's `/api` prefix). */
export const PATHS = Object.freeze({
  mcp: '/api/fishball/mcp',
  issuer: '/api/fishball/oauth',
  token: '/api/fishball/oauth/token',
  // RFC 9728 §3.1 / RFC 8414 §3.1: the well-known segment is inserted before the path.
  protectedResourcePrefix: '/.well-known/oauth-protected-resource',
  authorizationServerPrefix: '/.well-known/oauth-authorization-server',
  // The approval listener serves exactly these two; every other path gets 404 (R-OA-20).
  authorize: '/authorize',
  decision: '/authorize/decision',
})

/** The one event resource (R-EVS-01, R-CON-04). Its contents are a summary, never event bodies. */
export const RESOURCE = Object.freeze({
  events: Object.freeze({ name: 'fishball-events', uri: 'fishball://events', mimeType: 'application/json' }),
})

/**
 * "Connected" (design §3.5, §3.6): a principal is connected (online) exactly while it holds at
 * least one open `subscriptions/listen` stream whose `resourceSubscriptions` include
 * `fishball://events`. It is the one definition: embed-UI's lights, `ask_fishball`'s `unavailable`
 * check and the native status column all use it. It is not a timer and no request refreshes it.
 */
export const CONNECTED = Object.freeze({ listenResource: RESOURCE.events.uri })

/** Access-token scopes (R-OA-04, R-OA-02). `offline_access` is never listed ([spec] S7b §4). */
export const SCOPE = Object.freeze({ full: 'fishball', pair: 'fishball:pair' })

/** OAuth grants and client-authentication methods (R-OA-02). */
export const GRANT = Object.freeze({
  clientCredentials: 'client_credentials',
  authorizationCode: 'authorization_code',
  refreshToken: 'refresh_token',
})
/**
 * The token endpoint's `grant_type` dispatch (task K1b; R-OA-02, RFC 6749 §5.2). C-OAUTH owns the
 * endpoint, the dispatch, `unsupported_grant_type`, the shared FailureLimiter and the `builtIn`
 * handlers; every other grant of OAUTH_METADATA's `grant_types_supported` (`authorization_code`,
 * `refresh_token`) is a C-OAUTH-WEB `GrantHandler` that C-WIRE registers (index.d.ts).
 */
export const GRANT_DISPATCH = Object.freeze({
  formField: 'grant_type',
  builtIn: Object.freeze([GRANT.clientCredentials]),
})
export const CLIENT_AUTH = Object.freeze({ basic: 'client_secret_basic', post: 'client_secret_post', none: 'none' })
export const RESPONSE_TYPE = Object.freeze({ code: 'code' })
export const PKCE = Object.freeze({ method: 'S256' })
export const TOKEN_TYPE = 'Bearer'

/**
 * OAuth error codes and their HTTP statuses [spec]: RFC 6749 §5.2 (token endpoint), §4.1.2.1
 * (authorization response), RFC 6750 §3.1 (resource server), RFC 8707 §2 (`invalid_target`).
 * `invalid_scope` is never sent: a requested scope the entry does not earn is narrowed
 * (R-OA-04, OAuth 2.1 §1.4.1).
 */
export const OAUTH_ERROR = Object.freeze({
  invalidRequest: 'invalid_request',
  invalidClient: 'invalid_client',
  invalidGrant: 'invalid_grant',
  unsupportedGrantType: 'unsupported_grant_type',
  invalidTarget: 'invalid_target',
  unsupportedResponseType: 'unsupported_response_type',
  accessDenied: 'access_denied',
  serverError: 'server_error',
  // RFC 6749 §4.1.2.1 defines this for the authorization response only; RFC 6749 §5.2 lists no
  // token-endpoint code for "too many requests", so the token endpoint uses it too, with 429
  // (DECIDED #1: kept).
  temporarilyUnavailable: 'temporarily_unavailable',
  invalidToken: 'invalid_token',
  insufficientScope: 'insufficient_scope',
})

export const HTTP_STATUS = Object.freeze({
  ok: 200,
  seeOther: 303,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  payloadTooLarge: 413,
  tooManyRequests: 429,
  internalServerError: 500,
  serviceUnavailable: 503,
})

/**
 * The HTTP status of each OAuth error [spec]. `invalid_client` is 401 with
 * `WWW-Authenticate: Basic` when the client authenticated with the Authorization header
 * (RFC 6749 §5.2), as at the token endpoint today (S7 T7).
 */
export const OAUTH_ERROR_STATUS = Object.freeze({
  [OAUTH_ERROR.invalidRequest]: HTTP_STATUS.badRequest,
  [OAUTH_ERROR.invalidClient]: HTTP_STATUS.unauthorized,
  [OAUTH_ERROR.invalidGrant]: HTTP_STATUS.badRequest,
  [OAUTH_ERROR.unsupportedGrantType]: HTTP_STATUS.badRequest,
  [OAUTH_ERROR.invalidTarget]: HTTP_STATUS.badRequest,
  [OAUTH_ERROR.temporarilyUnavailable]: HTTP_STATUS.tooManyRequests,
  [OAUTH_ERROR.invalidToken]: HTTP_STATUS.unauthorized,
  [OAUTH_ERROR.insufficientScope]: HTTP_STATUS.forbidden,
  [OAUTH_ERROR.serverError]: HTTP_STATUS.internalServerError,
})

/** [spec] RFC 6749 §5.1 / OAuth 2.1 §3.2.3: every token response MUST NOT be cached. */
export const TOKEN_RESPONSE_HEADERS = Object.freeze({ 'cache-control': 'no-store', pragma: 'no-cache' })

/**
 * `WWW-Authenticate` on the MCP endpoint (R-TOK-01, R-ID-06, [spec] Authorization § Scope
 * Selection Strategy, § Runtime Insufficient Scope Errors). Parameter order is fixed, so every 401
 * is byte-identical apart from the presence of `error` (AUTH-EP-02): error, error_description,
 * scope, resource_metadata.
 */
export const BEARER_CHALLENGE = Object.freeze({
  scheme: 'Bearer',
  basicScheme: 'Basic',
  params: Object.freeze(['error', 'error_description', 'scope', 'resource_metadata']),
  // A query-string token is refused even with a valid header (R-TOK-02). [spec] RFC 6750 §2.3:
  // the query method is not offered and a client MUST NOT use two methods, so it is 400
  // `invalid_request` before any lookup, with or without a header.
  queryParameter: 'access_token',
  // The same rule at the token endpoint: a secret in the URL is 400 `invalid_request` (S7 T7).
  queryClientSecret: 'client_secret',
})

/**
 * The fixed fields of the two metadata documents, under their RFC field names (RFC 9728 §2,
 * RFC 8414 §2; R-OA-01/02; design §5.5 table; S7b §3.2 item 1). The URL fields (`resource`,
 * `authorization_servers`, `issuer`, `token_endpoint`, `authorization_endpoint`) follow the checked
 * host and are added by `oauth.js`. No `registration_endpoint`, and never `offline_access` [spec].
 */
export const OAUTH_METADATA = Object.freeze({
  protectedResource: Object.freeze({
    // The header only (R-TOK-02).
    bearer_methods_supported: Object.freeze(['header']),
    scopes_supported: Object.freeze([SCOPE.full]),
  }),
  authorizationServer: Object.freeze({
    grant_types_supported: Object.freeze([GRANT.clientCredentials, GRANT.authorizationCode, GRANT.refreshToken]),
    response_types_supported: Object.freeze([RESPONSE_TYPE.code]),
    code_challenge_methods_supported: Object.freeze([PKCE.method]),
    token_endpoint_auth_methods_supported: Object.freeze([CLIENT_AUTH.basic, CLIENT_AUTH.post, CLIENT_AUTH.none]),
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: Object.freeze([SCOPE.full, SCOPE.pair]),
  }),
})

/** `error_description` of a pair-only token's 403, a human-readable hint only (R-ID-06). */
export const INSUFFICIENT_SCOPE_REASON = Object.freeze({ notPaired: 'not-paired', idMismatch: 'id-mismatch' })

/** Core tool names (design §3.2, R-CON-02). No watch tools (R-WATCH-03); no attention tool (R-EXT-13). */
export const TOOL = Object.freeze({
  sessionsList: 'sessions_list',
  sessionStart: 'session_start',
  sessionMessage: 'session_message',
  sessionRedirect: 'session_redirect',
  sessionStop: 'session_stop',
  sessionRead: 'session_read',
  sessionRelease: 'session_release',
  approvalsList: 'approvals_list',
  approvalAnswer: 'approval_answer',
  questionAnswer: 'question_answer',
  questionAsk: 'question_ask',
  questionAnswerOwn: 'question_answer_own',
  promptsList: 'prompts_list',
  promptAnswer: 'prompt_answer',
  grantsList: 'grants_list',
  grantRevoke: 'grant_revoke',
  attachmentPut: 'attachment_put',
  attachmentRead: 'attachment_read',
  inboxPoll: 'inbox_poll',
  inboxAck: 'inbox_ack',
  pair: 'pair',
  setName: 'set_name',
})

/** A pair-only access token reaches exactly these (R-OA-04, R-EXT-05). */
export const PAIR_ONLY = Object.freeze({
  methods: Object.freeze(['server/discover', 'tools/list']),
  tools: Object.freeze([TOOL.pair]),
})

/** Token values, access tokens, refresh tokens and codes (R-TOK-08, R-OA-05, design §5.2, §5.6). */
export const TOKEN_VALUE = Object.freeze({
  // [design] 32 random bytes, base64url, `fbt_` prefix: ≥ 256 bits, and recognised by scanners.
  generatedPrefix: 'fbt_',
  generatedBytes: 32,
  // [req] TQ-4 A. Characters are Unicode code points, as every `*Chars` limit of the connector.
  minChars: 32,
  // Opaque access tokens, refresh tokens, codes and form nonces: 256 bits each [design §5.5].
  opaqueBytes: 32,
  digestAlgorithm: 'sha256',
})

/** Lifetimes (R-OA-07, R-OA-14, R-OA-15, R-OA-16). "Expired" is `now >= issuedAt + lifetime`. */
export const LIFETIME = Object.freeze({
  // [req] Q27: exactly 3600 s; `expires_in` is this in seconds.
  accessTokenMs: HOUR_MS,
  // [req] R-OA-14 (K): the code is single-use and expires 60 s after issue.
  codeMs: MINUTE_MS,
  // [req] R-OA-15 (K): a pending approval page request expires 10 min after `/authorize`.
  pendingRequestMs: 10 * MINUTE_MS,
  // [req] R-OA-16 (4a) (K): a spent refresh token presented again strictly before 10 s gets the
  // identical successor; at 10 s and later it is reuse (AUTH-BVA-08).
  refreshGraceMs: 10 * SECOND_MS,
  // DECIDED (#18): R-OA-16 (5) asks for a maximum chain lifetime: 365 days from the code
  // redemption. A refresh at or after it is `invalid_grant`. The owner then renews the chain on the same
  // entry, keeping its pair (R-OA-16 (7), R-OA-12 (2)): re-entering the bound token on the
  // approval page, from the same client id and with the bound id, mints a new code instead of
  // answering `already-paired`.
  refreshChainMaxMs: 365 * DAY_MS,
})

/**
 * Request-rate limits (R-TOK-06, R-OA-17, design §5.6), counted per (remote address, OAuth
 * `client_id`), the key FAILURE_LIMIT.keyParts names. PROPOSED numbers: they allow the stock client's 2 token requests per failed
 * call and its 3 requests per hourly re-discovery (S7 §4.4) many times over.
 * - tokenRequestsPerWindow: every token-endpoint request, of any grant (R-OA-17).
 * Over a limit, as over FAILURE_LIMIT: HTTP 429 with `Retry-After` (whole seconds until the window
 * admits one more) and, at the token endpoint, `{error: "temporarily_unavailable"}`; nothing says
 * which tokens or ids exist.
 */
export const RATE_LIMITS = Object.freeze({
  windowMs: MINUTE_MS,
  tokenRequestsPerWindow: 30,
  retryAfterHeader: 'retry-after',
})

/**
 * The one failure limit (task K1a; R-OA-17, R-TOK-06, design §5.6), shared by the token endpoint,
 * the approval page and the MCP endpoint's bearer check through C-OAUTH's `FailureLimiter`
 * (index.d.ts). The grouping into one constant and one limiter is PROPOSED (K1a, pending the user's
 * review); the values are the user's (#19, #21 DECIDED: kept as they were, no relaxing).
 * - Counted: every refused credential: a wrong client secret, a wrong token typed on the approval
 *   page, and an invalid bearer at the MCP endpoint (AUTH-UC-07). An empty page field is
 *   "enter a token" and does not count (PROPOSED, the spike's behaviour). A request refused because
 *   the key is already limited is not counted again (S7b's limiter).
 * - Key (#19 DECIDED): the remote address plus the OAuth `client_id` the request names (the
 *   fishball id at the token endpoint, the CIMD URL on the approval page); an MCP bearer names
 *   none, so its key is the address alone. On loopback every client shares one address, and an
 *   address-only key for every client would let one revoked agent's retries lock the hosted
 *   Fishball out. No token material is in a key.
 * - Limited (PROPOSED; S7b's `>=` rule, over S7b's one address-only key): a key with `perKeyPerWindow` or more counted failures within
 *   the last `windowMs`, or an address with `perAddressPerWindow` or more over all its keys.
 *   While limited, even a valid credential is refused (S7b P2), with RATE_LIMITS' 429 answer.
 */
export const FAILURE_LIMIT = Object.freeze({
  // Its own window: a failure window and a request-rate window mean different things, even
  // though both are one minute today.
  windowMs: MINUTE_MS,
  keyParts: Object.freeze(['remoteAddress', 'clientId']),
  // #21 DECIDED: 10 per key per minute.
  perKeyPerWindow: 10,
  // An address-wide ceiling (PROPOSED), so rotating `client_id` from one address buys no extra
  // guesses beyond it. Loopback clients share it too, so it is set well above one agent's
  // normal failures.
  perAddressPerWindow: 50,
})

/**
 * MCP endpoint limits (R-SEC-03, R-TOK-06, design §3.1 step 4). PROPOSED values.
 * - bodyBytes: one request body. 8 MiB, V2's attachment frame bound (contract §8
 *   `attachmentEnvelopeBytes`), so one `attachment_put` of a 4 MiB image in base64 fits.
 * - inFlightPerPrincipal: requests of one principal being processed at once; one more is 429.
 * - listenStreamsPerPrincipal: open listen streams of one principal; one more is 429.
 * - requestsPerMinute / requestBurst: a token bucket per principal; over it is 429.
 * "Per principal" (the names are K1's and stay) is counted per token entry (`Caller.entryKey`; the user's decision, 2026-11-14,
 * K1b), so a pair-only caller is limited too. C-HTTP applies these through `RequestGate.admit`
 * (REQUEST_GATE), after the bearer check.
 * A limit refusal is a structured JSON-RPC error body (code `jsonRpcCode`, message the refusal
 * word below) with id `null` (JSON-RPC 2.0 §5: the body was never parsed), never prose only; a
 * 429 carries `Retry-After`. `jsonRpcCode` is DECIDED (#4): -31000, one code for both refusals
 * (the message tells them apart), because MCP 2026-07-28 basic § Error Codes makes -32000…-32019 a
 * legacy range new implementations SHOULD NOT use and asks for codes outside the JSON-RPC
 * reserved range -32768…-32000.
 */
export const ENDPOINT_LIMITS = Object.freeze({
  bodyBytes: V2_LIMITS.attachmentEnvelopeBytes,
  inFlightPerPrincipal: 32,
  listenStreamsPerPrincipal: 8,
  requestsPerMinute: 600,
  requestBurst: 120,
  jsonRpcCode: -31000,
  // JSON-RPC 2.0 §4: the `jsonrpc` member of the limit-refusal body.
  jsonRpcVersion: '2.0',
})

/** The HTTP methods the connector's routes serve (design §3.1 step 1, §5.5 approval listener table). */
export const HTTP_METHOD = Object.freeze({ get: 'GET', post: 'POST' })

/** HTTP-level refusal words of the connector's own routes (design §3.1). */
export const HTTP_REFUSAL = Object.freeze({
  // [design §3.1] a non-loopback listener over plain http: every route answers 503 with this.
  insecureListener: 'insecure-listener',
  tooLarge: CALL_CODE.limitExceeded,
  rateLimited: CALL_CODE.rateLimited,
})

/**
 * Host and Origin (R-REM-03, R-REM-05, S1 F3). The allowed hosts are these loopback names, the
 * listener's bind address and DSH's `--trusted-host` list (`webStartup.trustedHosts`); any other
 * `Host` is 403 before authentication. A loopback host is served over `http`, any other allowed
 * host over `https` (R-REM-05 (3)); no forwarded-scheme header is ever read.
 * Origin: [design §3.1] the allowlist of DSH's listener routes is empty, so any present `Origin`
 * (including `null`) is 403; the approval form accepts only its own page's origin (R-OA-17).
 * There is no Origin setting in V3 (DECIDED #60: kept).
 */
export const HOSTS = Object.freeze({
  loopbackNames: Object.freeze(['localhost', '127.0.0.1', '[::1]']),
  loopbackScheme: 'http:',
  remoteScheme: 'https:',
  forwardedHeadersIgnored: Object.freeze(['forwarded', 'x-forwarded-proto', 'x-forwarded-host']),
})

/** The three request surfaces C-HTTP's one `RequestGate` serves (index.d.ts; task K1b). */
export const GATE_SURFACE = Object.freeze({ mcp: 'mcp', token: 'token', approval: 'approval' })

/** How a surface treats a present `Origin` (HOSTS): `refuse-any` on DSH's listener, the page's own origin on the approval listener. */
export const ORIGIN_RULE = Object.freeze({ refuseAny: 'refuse-any', ownOnly: 'own-only' })

/**
 * The request gate (task K1b; design §3.1, §5.5; R-REM-02/03, R-SEC-03, R-OA-20). C-HTTP owns the
 * only `RequestGate` implementation; C-OAUTH, C-OAUTH-WEB and C-HTTP's MCP route each call it.
 * - Built by C-WIRE with the listener facts (DSH's `webServer.host`, `protocol`, `--trusted-host`;
 *   the approval listener binds the same host on its own port, the user's decision 2026-11-14) and
 *   an injected clock (index.d.ts GateListenerFacts).
 * - `check` (before authentication, every surface) refuses in this fixed order, each step only
 *   after every earlier one passed: 405 (the path's methods; `Allow` lists them, no body), 403
 *   (`Host` not allowed, or an `Origin` the surface's ORIGIN_RULE refuses; no body), 503 (a
 *   non-loopback listener over plain http; body `{error: HTTP_REFUSAL.insecureListener}`). The
 *   empty 405/403 bodies and the 503 body shape are the user's decision (2026-11-14, K1b).
 * - `admit` (after the bearer check, `mcp` only; the user's decision 2026-11-14, K1b) refuses 413
 *   before 429, with ENDPOINT_LIMITS' JSON-RPC body. The token endpoint keeps C-OAUTH's own
 *   RATE_LIMITS and FAILURE_LIMIT; the approval page has no `admit`.
 * - `routes`: each surface's paths and their methods. A wrong method on a listed path is 405
 *   (S7 T7 for the token endpoint; the approval page's two paths by the user's decision
 *   2026-11-14, K1b). A path not listed passes the 405 step only: the 403 and 503 steps still
 *   apply, and its route answers 404 once `check` passes.
 *   The two metadata documents are C-OAUTH's (v3-tasks.md C-OAUTH), so they are on `token`.
 */
export const REQUEST_GATE = Object.freeze({
  checkOrder: Object.freeze([HTTP_STATUS.methodNotAllowed, HTTP_STATUS.forbidden, HTTP_STATUS.serviceUnavailable]),
  admitOrder: Object.freeze([HTTP_STATUS.payloadTooLarge, HTTP_STATUS.tooManyRequests]),
  admitSurfaces: Object.freeze([GATE_SURFACE.mcp]),
  routes: Object.freeze({
    [GATE_SURFACE.mcp]: Object.freeze({ [PATHS.mcp]: Object.freeze([HTTP_METHOD.post]) }),
    [GATE_SURFACE.token]: Object.freeze({
      [PATHS.token]: Object.freeze([HTTP_METHOD.post]),
      [PATHS.protectedResourcePrefix + PATHS.mcp]: Object.freeze([HTTP_METHOD.get]),
      [PATHS.authorizationServerPrefix + PATHS.issuer]: Object.freeze([HTTP_METHOD.get]),
    }),
    [GATE_SURFACE.approval]: Object.freeze({
      [PATHS.authorize]: Object.freeze([HTTP_METHOD.get]),
      [PATHS.decision]: Object.freeze([HTTP_METHOD.post]),
    }),
  }),
  originRule: Object.freeze({
    [GATE_SURFACE.mcp]: ORIGIN_RULE.refuseAny,
    [GATE_SURFACE.token]: ORIGIN_RULE.refuseAny,
    [GATE_SURFACE.approval]: ORIGIN_RULE.ownOnly,
  }),
  // Header names are lower case, as Node delivers request headers.
  headers: Object.freeze({ host: 'host', origin: 'origin', allow: 'allow' }),
  // `Allow` joins the methods with this (RFC 9110 §10.2.1: a comma-separated list).
  allowSeparator: ', ',
  // `Retry-After` of the in-flight 429 (PROPOSED, the user's choice 2026-11-14): one second, the
  // smallest whole-second value, because a slot frees as soon as any request ends. The token
  // bucket's 429 derives its own value from ENDPOINT_LIMITS.requestsPerMinute.
  inFlightRetryAfterMs: SECOND_MS,
})

/**
 * The approval listener (R-OA-20, Q-OA-7 A). The default port is PROPOSED (any fixed value
 * works; it avoids DSH's own default 8080 and the 7777 the cases use for client redirects).
 * On a clash the connector retries the bind every `retryMs` (PROPOSED: R-OA-20 says the page is
 * unreachable "until the port is free or changed", so it recovers by itself), and a change of the
 * setting rebinds at once.
 */
export const APPROVAL_LISTENER = Object.freeze({
  defaultPort: 47615,
  retryMs: 30 * SECOND_MS,
  // The page's response headers (R-OA-11, R-OA-12; S7b P-rows).
  headers: Object.freeze({
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    // S7b's verified value. No `form-action`: browsers apply it to the 303 that follows the POST,
    // which would block the redirect to the client's loopback `redirect_uri`.
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  }),
  // [spec] RFC 9700 §4.12: the redirect after the form POST is 303, never 307.
  redirectStatus: HTTP_STATUS.seeOther,
})

/**
 * Client ID Metadata Document fetch (R-OA-13; [spec] CIMD draft §3, §4.4, §6.5, §6.6).
 * `maxBytes` is the draft's figure; the time bound and the cache cap are PROPOSED (S7b's values).
 */
export const CIMD_LIMITS = Object.freeze({
  maxBytes: 5 * KIB,
  timeoutMs: 3 * SECOND_MS,
  maxCacheMs: DAY_MS,
  scheme: 'https:',
  forbiddenAuthFields: Object.freeze(['client_secret', 'client_secret_expires_at']),
})

/** Fishball ids (R-ID-02, TQ-1 C): 1–64 of `A–Z a–z 0–9 _ -`, case-sensitive, never a dot. */
const ID_BODY = '[A-Za-z0-9_-]{1,64}'
export const ID_GRAMMAR = Object.freeze({ pattern: Object.freeze(new RegExp(`^${ID_BODY}$`)) })

/**
 * Names (R-NAME-02, TQ-6 A). Normalise: trim Unicode White_Space, collapse every inner run to one
 * space, then NFC; then 1–64 code points with no `Cc` control character and no `Cf` format
 * character (bidi overrides, zero-width characters and other invisible ones; the user's decision,
 * 2026-11-13, so a name cannot look like another). Uniqueness compares the
 * case-folded normalised name.
 */
export const NAME_RULES = Object.freeze({
  minChars: 1,
  maxChars: 64,
  whitespaceRun: Object.freeze(/\p{White_Space}+/u),
  control: Object.freeze(/[\p{Cc}\p{Cf}]/u),
  space: ' ',
  normalForm: 'NFC',
  // R-NAME-08: a principal with no name is shown as its id after this prefix, the prefix bold.
  namelessPrefix: 'ID: ',
})

/** `lastSeenAt` is written at most once per this interval per pair [design §5.8]: 60 s or more since the last write updates it. */
export const PAIR_TIMING = Object.freeze({ lastSeenWriteIntervalMs: MINUTE_MS })

/** `pair`'s fixed advice texts (R-ID-04), by `idMatches`. */
export const PAIR_ADVICE = Object.freeze({
  idMatches: 'continue with this token and id only if no other agent uses this id with this token; otherwise use a new token and a new id',
  idDiffers: 'use a new token',
})

/**
 * Offer ids (R-HOST-09, Q-S3-1, S3 §4 item 4): `<requestId>.r<revision>`. A request has one
 * settlement record; a succession re-issues the offer as revision n+1 in the same registry write,
 * so an agent's answer to `.r<n>` gets `expired` while the user's answer to the request's card
 * still settles it. The request id has the fishball-id alphabet (no dot), so the last `.r`
 * always starts the revision.
 */
export const OFFER_ID = Object.freeze({
  pattern: Object.freeze(new RegExp(`^(${ID_BODY})\\.r([1-9][0-9]{0,8})$`)),
  separator: '.r',
  firstRevision: 1,
})

/** Event types (R-EVS-02). A client tells kinds apart only by `type`. */
export const EVENT_TYPE = Object.freeze({
  permission: 'permission',
  question: 'question',
  planReview: 'plan-review',
  settlement: 'settlement',
  retirement: 'retirement',
  turnFinished: 'turn-finished',
  state: 'state',
  message: 'message',
  ask: 'ask',
  handover: 'handover',
  takeback: 'takeback',
  notice: 'notice',
})
/** `contributed:<namespace>.<event>`; the prefix has one owner, K2. */
export const CONTRIBUTED_TYPE_PREFIX = CONTRIBUTED_EVENT.typePrefix

/**
 * The three offer types (R-EVS-02). Their events carry `offer`; a revocation withdraws them to the
 * user (R-TOK-05). An `ask` (ask_fishball) is answered the same way, with `approval_answer` on its
 * `offer.offerId` (it is V2's asked request, contract 1.2 §4.2), but it is not an offer for
 * revocation: a disable keeps it for 30 days and the asker keeps waiting (R-TOK-05).
 */
export const OFFER_TYPES = Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.question, EVENT_TYPE.planReview])
export const ANSWERABLE_TYPES = Object.freeze([...OFFER_TYPES, EVENT_TYPE.ask])

/** Which tool answers an answerable event's `offer.offerId`. */
export const DECISION_KIND = Object.freeze({ approval: 'approval', question: 'question' })
export const DECISION_KIND_OF = Object.freeze({
  [EVENT_TYPE.permission]: DECISION_KIND.approval,
  [EVENT_TYPE.ask]: DECISION_KIND.approval,
  [EVENT_TYPE.question]: DECISION_KIND.question,
  [EVENT_TYPE.planReview]: DECISION_KIND.question,
})

/**
 * The mailbox's capacity rule (R-CON-09, R-EXT-18, design §3.4, V2 contract 1.2 §9). Every
 * pending event counts toward the recipient's `maxQueuedInputs`: a connector setting (V2's, kept,
 * design §10) whose default K1 freezes at 200 (design §3.4); the connector's settings schema
 * (`src/config.js`) takes its default from here,
 * but only these types are refused `queue-full` past it. PROPOSED split, from the rules it must
 * keep: offers always reach their manager's mailbox (R-CON-09 "always"); a `settlement` or
 * `retirement` must follow the event it ends, or a client would hold a dead offer; `handover` /
 * `takeback` are the user's own actions, which V2 never refused for a full queue; an `ask` waits
 * for an answer like an offer. Contributor events count (R-EXT-18).
 */
export const QUEUE = Object.freeze({
  maxQueuedInputs: 200,
  refusedTypes: Object.freeze([EVENT_TYPE.message, EVENT_TYPE.turnFinished, EVENT_TYPE.state, EVENT_TYPE.notice]),
  contributedRefused: true,
})

/**
 * Mailbox paging and retention (R-CON-03, R-TOK-05; design §3.4).
 * - pageDefault / pageMax: PROPOSED. `limit` is a whole number 1–pageMax; 0 or above pageMax is
 *   `limit-exceeded` (V2 contract §8: a value outside a limit is `limit-exceeded`), never clamped.
 * - A pending event never expires (R-CON-03, R-CON-05).
 * - disabledRetentionMs: [req] events of a disabled entry are kept 30 days, then dropped as on delete.
 * - ackedReceiptMs: DECIDED (#36: kept at 1 day). An acked event's receipt is remembered this
 *   long, so a repeated ack is a no-op success (EVT-ST-01 row 8) rather than `unknown-event`.
 */
export const MAILBOX = Object.freeze({
  pageDefault: 50,
  pageMax: 100,
  disabledRetentionMs: 30 * DAY_MS,
  ackedReceiptMs: DAY_MS,
})

/** `inbox_poll`'s explicit resync answer (R-CON-03): the cursor names an older mailbox generation. */
export const RESYNC_REASON = Object.freeze({ staleCursor: 'stale-cursor' })

/**
 * A `settlement`'s outcome and who settled it (R-CON-06). PROPOSED: V2's `approval.settled`
 * carried the raw DECISION with `by: user | fishball`; over MCP a settlement reports what happened
 * to the request, not the answer verb: `allow` and `grant` → `allowed`; `reject` → `rejected`;
 * a question or plan review answered → `answered`. `ask` (the thread continues) and `escalate`
 * (the request moves to the user, S3 §5.1) settle nothing, so they produce no settlement; the
 * user's later answer does. `by: principal` replaces V2's `fishball`, since any principal may answer.
 */
export const SETTLEMENT_OUTCOME = Object.freeze({ allowed: 'allowed', rejected: 'rejected', answered: 'answered' })
export const SETTLED_BY = Object.freeze({ user: 'user', principal: 'principal' })

/** Why a `retirement` withdrew an earlier event (R-TOK-05, R-ROUTE-06, R-HOST-09, R-EXT-19). */
export const RETIREMENT_REASON = Object.freeze({
  // The session's call ended, was cancelled or the session ended before an answer.
  withdrawn: 'withdrawn',
  // The holding principal was disabled or deleted; the offer went to the user (R-TOK-05).
  revoked: 'revoked',
  // The session left the principal's management (release, Take back).
  released: 'released',
  // A succession re-issued the offer to the new principal with revision n+1 (R-HOST-09).
  reissued: 'reissued',
  // The contributor was quarantined or withdrawn (R-EXT-19).
  contributorWithdrawn: 'contributor-withdrawn',
})

/**
 * Native-settings status of a token entry, and the save refusal (R-TOK-08, R-ID-12, R-OA-20).
 * The `pairState` column is read-only.
 */
export const ENTRY_STATUS = Object.freeze({
  ok: 'ok',
  tokenTooShort: 'token-too-short',
  tokenUnconfigured: 'token-unconfigured',
})
/**
 * A settings save is refused, and the previous settings stay (R-TOK-08): two entries share one
 * `ref` (`ref-duplicate`), or two entries' refs resolve to the same value (`value-duplicate`; the
 * user's decision 2026-11-13, AUTH-EP-04 7a), so one value always names one principal (R-TOK-07).
 * The value check compares digests in constant time and names only the entries' labels.
 */
export const SETTINGS_REFUSAL = Object.freeze({ refDuplicate: 'ref-duplicate', valueDuplicate: 'value-duplicate' })
export const PAIR_STATE = Object.freeze({ paired: 'paired', unpaired: 'unpaired' })
export const CONNECTOR_STATUS = Object.freeze({ approvalPortInUse: 'approval-port-in-use' })


/**
 * Refusal codes of the core tools (R-CON-02): `structuredContent.code` of `{ok: false}`. The shared
 * words have one owner each: K2's SHARED_CODES / CALL_CODE, and V2's operation codes, which the
 * wrapped V2 domain still answers (design §3.2). V2's wire-only codes (envelope, handshake,
 * capability, host, duplicate request, channel timeout) do not exist over MCP.
 */
export const REFUSAL = Object.freeze({
  // K2's shared vocabulary.
  limitExceeded: CALL_CODE.limitExceeded,
  invalidArguments: CALL_CODE.invalidArguments,
  queueFull: CALL_CODE.queueFull,
  rateLimited: CALL_CODE.rateLimited,
  operationFailed: CALL_CODE.operationFailed,
  forbidden,
  unknownSession,
  expired,
  conflict,
  unavailable,
  unsupportedOperation,
  // The V2 domain's operation codes (contract 1.2 §7), unchanged.
  notReferenced: V2_ERROR.notReferenced,
  tooLarge: V2_ERROR.tooLarge,
  imagesUnsupported: V2_ERROR.imagesUnsupported,
  notManaged: V2_ERROR.notManaged,
  featureOff: V2_ERROR.featureOff,
  sessionNotLive: V2_ERROR.sessionNotLive,
  invalidDecision: V2_ERROR.invalidDecision,
  riskRequired: V2_ERROR.riskRequired,
  reasonRequired: V2_ERROR.reasonRequired,
  allowNeedsLowRisk: V2_ERROR.allowNeedsLowRisk,
  argumentsIncomplete: V2_ERROR.argumentsIncomplete,
  questionRequired: V2_ERROR.questionRequired,
  modeUser: V2_ERROR.modeUser,
  badAnswer: V2_ERROR.badAnswer,
  alreadySettled: V2_ERROR.alreadySettled,
  grantInvalid: V2_ERROR.grantInvalid,
  prefixNotShellTool: V2_ERROR.prefixNotShellTool,
  prefixEmpty: V2_ERROR.prefixEmpty,
  prefixNotInCall: V2_ERROR.prefixNotInCall,
  expiresRequired: V2_ERROR.expiresRequired,
  expiresInvalid: V2_ERROR.expiresInvalid,
  expiresPast: V2_ERROR.expiresPast,
  grantUnknown: V2_ERROR.grantUnknown,
  grantEnded: V2_ERROR.grantEnded,
  // New in V3.
  alreadyPaired: 'already-paired',
  idTaken: 'id-taken',
  nameInvalid: 'name-invalid',
  nameTaken: 'name-taken',
  // inbox_ack (the codes DECIDED #5, #6: kept): a receipt naming no event of the caller's mailbox (never "it
  // belongs to another pair", R-TOK-00), or a digest that differs from the event's. All or nothing
  // (DECIDED #61: kept): one bad receipt acks nothing.
  unknownEvent: 'unknown-event',
  digestMismatch: 'digest-mismatch',
})

/** The `id-invalid` word of `fishball-core`'s settings and of the approval page (R-ID-02, R-OA-12). */
export const ID_REFUSAL = Object.freeze({ idInvalid: 'id-invalid' })

/**
 * A `notice` event's `code` (R-EVS-02). The grammar is K2's refusal-code grammar; which notices
 * exist is left to the task that produces each one (C-ROUTE, C-WIRE), which adds its code here as a
 * K1 amendment. None is frozen yet.
 */
export const NOTICE = Object.freeze({ codeGrammar: NAME_GRAMMAR.code, codes: Object.freeze({}) })

/**
 * Wire conventions of every result and event:
 * - every time (`at`, `pairedAt`, `lastSeenAt`, `expiresAt`, `since`) is a whole number of
 *   milliseconds since the Unix epoch, as in contract 1.2;
 * - `payloadDigest` is 64 lowercase hex characters (SHA-256); a client echoes it in `inbox_ack`
 *   and never computes it;
 * - cursors, event ids, entry keys and principal keys are opaque non-empty strings.
 */
const DIGEST_HEX_CHARS = 64
export const WIRE = Object.freeze({
  digestHexChars: DIGEST_HEX_CHARS,
  // Built from digestHexChars, so the length is written once.
  digestPattern: Object.freeze(new RegExp('^[0-9a-f]{' + DIGEST_HEX_CHARS + '}$')),
})
