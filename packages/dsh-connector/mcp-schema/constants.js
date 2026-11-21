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
 * The connector's runtime SDK pins, independent of the hosts' clients. Node 2.1.2 requires
 * server ^2.4.0. A change of either pin is a K1 amendment and also a change of
 * `packages/dsh-connector/package.json` (C-WIRE owns it after W1).
 */
export const SDK_PINS = Object.freeze({
  '@modelcontextprotocol/server': '2.4.0',
  '@modelcontextprotocol/node': '2.1.2',
})

/** Routes. DSH's listener routes are `exact` (S1 F3: exact routes win over DSH's `/api` prefix). */
export const PATHS = Object.freeze({
  mcp: '/api/agent/mcp',
  issuer: '/api/agent/oauth',
  token: '/api/agent/oauth/token',
  // RFC 9728 §3.1 / RFC 8414 §3.1: the well-known segment is inserted before the path.
  protectedResourcePrefix: '/.well-known/oauth-protected-resource',
  authorizationServerPrefix: '/.well-known/oauth-authorization-server',
  // The approval listener serves exactly these two; every other path gets 404 (R-OA-20).
  authorize: '/authorize',
  decision: '/authorize/decision',
})

/**
 * The connector's resources.
 * - events: the one event resource (R-EVS-01, R-CON-04). Its contents are a summary, never event
 *   bodies.
 * - identity (MULTI-0 amendment, 2026-11-18; PLAN-MULTI §4.3, Q02): a read-only resource whose one
 *   JSON text content is the standard MCP `Implementation` object `{name, version}` that
 *   `server/discover` advertises (`SERVER_IDENTITY.discoverMetaKey`), from the same live getter. It
 *   exists only so a rename can be pushed with the standard `notifications/resources/updated
 *   {uri}` over the existing `subscriptions/listen` stream: MCP 2026-07-28 has no
 *   server-name-changed notification, and `tools/list_changed` is not one.
 */
export const RESOURCE = Object.freeze({
  events: Object.freeze({ name: 'agent-events', uri: 'dsh-agent://events', mimeType: 'application/json' }),
  identity: Object.freeze({ name: 'dsh-identity', uri: 'dsh-agent://identity', mimeType: 'application/json' }),
})

/**
 * The connector's advertised MCP server identity (MULTI-0 amendment, 2026-11-18; PLAN-MULTI D04,
 * D05, D06, §4.1, §4.3):
 * - `serverInfo.name` is `<base><suffix>`: `base` is the `approval.dshName` setting verbatim when it
 *   holds any non-white-space character, else `node:os.hostname()`; `suffix` is appended once as an
 *   operation, even when the base already ends with it (no dedupe, no trim of a nonblank base);
 *   `version` stays the connector manifest's. No title is set, and the name has no tool-name grammar
 *   or length limit (MCP `Implementation.name`);
 * - `discoverMetaKey`: where `server/discover` carries it ([spec] `result._meta[...]`, not
 *   `result.serverInfo`);
 * - `updatedNotification`: the standard notification sent with `{uri: RESOURCE.identity.uri}` and
 *   no other param beyond the SDK's own `_meta` (it stamps
 *   `io.modelcontextprotocol/subscriptionId` on every listen notification) to every authenticated
 *   listen stream subscribed to that URI, when the effective name changed; an unchanged name sends
 *   nothing.
 */
export const SERVER_IDENTITY = Object.freeze({
  suffix: '-DSH',
  discoverMetaKey: 'io.modelcontextprotocol/serverInfo',
  updatedNotification: 'notifications/resources/updated',
})

/**
 * "Connected" (design §3.5, §3.6): a principal is connected (online) exactly while it holds at
 * least one open `subscriptions/listen` stream whose `resourceSubscriptions` include
 * `dsh-agent://events`. It is the one definition: embed-UI's lights, `ask_agent`'s `unavailable`
 * check and the native status column all use it. It is not a timer and no request refreshes it.
 */
export const CONNECTED = Object.freeze({ listenResource: RESOURCE.events.uri })

/** Access-token scopes (R-OA-04, R-OA-02). `offline_access` is never listed ([spec] S7b §4). */
export const SCOPE = Object.freeze({ full: 'agent', pair: 'agent:pair' })

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
  workspacesList: 'workspaces_list',
  modelsList: 'models_list',
  sessionStart: 'session_start',
  sessionMessage: 'session_message',
  sessionRedirect: 'session_redirect',
  sessionStop: 'session_stop',
  sessionRead: 'session_read',
  sessionRelease: 'session_release',
  approvalsList: 'approvals_list',
  approvalAnswer: 'approval_answer',
  questionAnswer: 'question_answer',
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

/**
 * Token values, access tokens, refresh tokens and codes (R-TOK-08, R-OA-05, design §5.1, §5.2,
 * §5.6). Every token value is generated (requirements 1.27, 1.31): there is no user-set value, so
 * there is no length rule (K1d withdrew `minChars` and `isTokenLongEnough`, TQ-4's length part).
 * The connector stores only `digestAlgorithm(value)` of a token value, never the value (K1d,
 * design §5.1): 256 random bits need no keyed digest.
 */
export const TOKEN_VALUE = Object.freeze({
  // [design] 32 random bytes, base64url, `dsht_` prefix (§1.0c): ≥ 256 bits, and recognised by scanners.
  generatedPrefix: 'dsht_',
  generatedBytes: 32,
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
  // No maximum chain lifetime (R-OA-23, requirements 1.32 R14; K1d withdrew `refreshChainMaxMs`
  // and DECIDED #18 with it): a chain lives until reuse revokes it or the entry is disabled or deleted.
})

/**
 * Request-rate limits (R-TOK-06, R-OA-17, design §5.6), counted per (remote address, OAuth
 * `client_id`), the key FAILURE_LIMIT.keyParts names. PROPOSED numbers: they allow the stock client's 2 token requests per failed
 * call and its 3 requests per hourly re-discovery (S7 §4.4) many times over.
 * - tokenRequestsPerWindow: every token-endpoint request, of any grant (R-OA-17).
 * - tokenRequestsPerAddressPerWindow (K1 amendment after W2; PROPOSED, Fishball 2026-11-14):
 *   every token request of one remote address, over all client ids, counted before its body is
 *   read, so refusals that never reach the per-(address, client id) limit (a query secret, a bad
 *   media type, an over-long or bad form) are bounded too and rotating `client_id` buys nothing
 *   past it. 150 is tokenRequestsPerWindow (30) scaled as FAILURE_LIMIT's address ceiling is
 *   (50 / 10). It shares windowMs.
 * Over a limit, as over FAILURE_LIMIT: HTTP 429 with `Retry-After` (whole seconds until the window
 * admits one more) and, at the token endpoint, `{error: "temporarily_unavailable"}`; nothing says
 * which tokens or ids exist.
 */
export const RATE_LIMITS = Object.freeze({
  windowMs: MINUTE_MS,
  tokenRequestsPerWindow: 30,
  tokenRequestsPerAddressPerWindow: 150,
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
 *   agent id at the token endpoint, the CIMD URL on the approval page); an MCP bearer names
 *   none, so its key is the address alone. On loopback every client shares one address, and an
 *   address-only key for every client would let one revoked agent's retries lock the hosted
 *   agent out. No token material is in a key.
 * - Limited (PROPOSED; S7b's `>=` rule, over S7b's one address-only key): a key with `perKeyPerWindow` or more counted failures within
 *   the last `windowMs`, or an address with `perAddressPerWindow` or more over all its keys.
 *   While limited, a **failing** credential gets RATE_LIMITS' 429 answer, uncounted. A valid one
 *   always passes (X-SEC X-03, C-WIRE-2, amending S7b P2 "even a valid credential is refused"):
 *   the credential is verified first, as MCP Authorization's guidance on token validation and
 *   OAuth 2.1 §7 (brute-force protection on failed attempts) expect, so one client's failures on a
 *   shared address (loopback, the user's tunnel) never lock out another, the hosted agent included.
 *   The values are unchanged (#19, #21).
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
 * The payload vocabularies and bounds of the core tools, moved here unchanged from the V2 contract
 * (contract 1.2 §4, §6.2, §8) when C-WIRE-2 deleted `./contract`: a move, not a K1 amendment (this
 * file's own note, K1). Each keeps its V2 value; only the one owner changed. The schemas in
 * shapes.js and the domain's bound checks read them from here.
 * - DELIVERY: `session_message` / `session_redirect` / `session_start` status; `unconfirmed` is never retried.
 * - APPROVAL_DECISION: `approval_answer`'s decisions. `ask` stays in the frozen list (core's
 *   APPROVAL copy mirrors it) but has no producer since C-WIRE-2: there is no `ask_agent` (the
 *   user, 2026-11-17), and a permission offer refuses `ask` with `invalid-decision` (the user's
 *   answer, 2026-11-17: "Refuse it").
 * - PROMPT_DECISIONS: `prompt_answer` takes allow or reject only.
 * - APPROVAL_KIND, PLAN_REVIEW: the descriptor's `kind` and the plan-review intent.
 * - IMAGE_TYPES: 0.2.2's image media types; any other media type travels as a file.
 */
export const DELIVERY = Object.freeze({ delivered: 'delivered', unconfirmed: 'unconfirmed' })
export const APPROVAL_DECISION = Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', ask: 'ask', escalate: 'escalate' })
export const RISK = Object.freeze({ low: 'low', high: 'high' })
export const GRANT_KIND = Object.freeze({ exact: 'exact', prefix: 'prefix' })
export const PROMPT_DECISIONS = Object.freeze([APPROVAL_DECISION.allow, APPROVAL_DECISION.reject])
/** `approval_answer`'s accepted decisions and a permission offer's `choices`: every decision but `ask` (X-02). */
export const ANSWER_DECISIONS = Object.freeze(Object.values(APPROVAL_DECISION).filter((decision) => decision !== APPROVAL_DECISION.ask))
export const APPROVAL_KIND = Object.freeze({ approval: 'approval', question: 'question' })
export const PLAN_REVIEW = 'plan-review'
export const ARGUMENTS_STATUS = Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' })
export const IMAGE_MEDIA = Object.freeze({ prefix: 'image/', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })
export const IMAGE_TYPES = Object.freeze([IMAGE_MEDIA.png, IMAGE_MEDIA.jpeg, IMAGE_MEDIA.webp, IMAGE_MEDIA.gif])

/**
 * The payload bounds the core tools check in domain code (design §3.2: the schema subset cannot
 * express lengths, counts or bytes), V2's LIMITS of contract 1.2 §8 unchanged, minus the embed
 * broker's, the envelope's and the V2 attach's, which have no MCP meaning. A value over a bound is
 * `limit-exceeded`, never clamped. Character bounds count code points.
 */
const MIB = KIB * KIB
export const PAYLOAD_LIMITS = Object.freeze({
  sessionsListed: 100,
  // One attachment_put of a 4 MiB image in base64, plus headroom (ENDPOINT_LIMITS.bodyBytes is this value).
  attachmentEnvelopeBytes: 8 * MIB,
  imageBytes: 4 * MIB,
  // DSH's own pixel budget; equal to imageBytes' byte value by coincidence only.
  imagePixels: 4_194_304,
  imagesPerMessage: 20,
  attachmentsPerMessage: 20,
  chunkBytes: 512 * KIB,
  hostRefTtlMs: 10 * MINUTE_MS,
  reasonChars: 500,
  noteChars: 500,
  feedbackChars: 500,
  customChars: 500,
  labelChars: 200,
  titleChars: 200,
  quoteBytes: 2048,
  grantPrefixChars: 512,
  questionsPerRequest: 32,
  selectedLabelsPerAnswer: 32,
})

/**
 * MCP endpoint limits (R-SEC-03, R-TOK-06, design §3.1 step 4). PROPOSED values.
 * - bodyBytes: one request body. 8 MiB, V2's attachment frame bound (contract §8
 *   `attachmentEnvelopeBytes`), so one `attachment_put` of a 4 MiB image in base64 fits.
 * - inFlightPerPrincipal: requests of one principal being processed at once; one more is 429.
 * - listenStreamsPerPrincipal: open listen streams of one principal; one more is 429.
 * - requestsPerMinute / requestBurst: a token bucket per principal; over it is 429.
 * "Per principal" (the names are K1's and stay) is counted per token entry (`Caller.entryKey`;
 * the user's decision, 2026-11-14, K1b), so a pair-only caller is limited too. C-HTTP applies
 * these through `RequestGate.admit` (REQUEST_GATE), after the bearer check.
 * A limit refusal is a structured JSON-RPC error body (code `jsonRpcCode`, message the refusal
 * word below) with no `id` member, never prose only. [spec] The body was never parsed, so no id
 * exists; JSON-RPC 2.0 §5 would write `id: null`, but MCP 2026-07-28's `JSONRPCErrorResponse` has
 * `id` optional and string or integer only, so both hosts' clients refuse `null`
 * (`@modelcontextprotocol/core` 2.2.0 `JSONRPCErrorResponseSchema`, the same in 0.2.1-rc.5 and
 * 0.2.2-rc.1; the user's decision 2026-11-14, K1b-EP-13: omit it). A 429 carries `Retry-After`.
 * `jsonRpcCode` is DECIDED (#4): -31000, one code for both refusals (the message tells them
 * apart), because MCP 2026-07-28 basic § Error Codes makes -32000…-32019 a legacy range new
 * implementations SHOULD NOT use and asks for codes outside the JSON-RPC reserved range
 * -32768…-32000.
 */
export const ENDPOINT_LIMITS = Object.freeze({
  bodyBytes: PAYLOAD_LIMITS.attachmentEnvelopeBytes,
  // Counts nested keys and array items, not string bytes. Allows a full 32 × 32 question answer
  // with its envelope and headroom for contributed tools, without unbounded schema diagnostics.
  maxToolInputElements: 4096,
  inFlightPerPrincipal: 32,
  listenStreamsPerPrincipal: 8,
  requestsPerMinute: 600,
  requestBurst: 120,
  jsonRpcCode: -31000,
  // JSON-RPC 2.0 §4: the `jsonrpc` member of the limit-refusal body.
  jsonRpcVersion: '2.0',
})

/**
 * The token endpoint's request body (K1 amendment after W2; RFC 6749 §3.2: a form).
 * formBodyBytes: PROPOSED (Fishball 2026-11-14): 8 KiB, the S7 prototype's `maxFormBytes`. It is
 * not ENDPOINT_LIMITS.bodyBytes, which bounds MCP bodies. A larger body is 400 `invalid_request`.
 */
export const TOKEN_ENDPOINT_LIMITS = Object.freeze({ formBodyBytes: 8 * KIB })

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
  // bucket's 429 derives its own value from ENDPOINT_LIMITS.requestsPerMinute. C-HTTP's 429 for
  // the listen-stream cap (ENDPOINT_LIMITS.listenStreamsPerPrincipal) reuses this value, for the
  // same reason: a stream slot frees as soon as any of the pair's streams ends (K1 amendment
  // after W2; PROPOSED, Fishball 2026-11-14, Q4). It has no value of its own.
  inFlightRetryAfterMs: SECOND_MS,
})

/**
 * The approval listener (R-OA-20, Q-OA-7 A). The default port is PROPOSED (any fixed value
 * works; it avoids DSH's own default 8080 and the 7777 the cases use for client redirects).
 * On a clash the connector retries the bind every `retryMs` (PROPOSED: R-OA-20 says the page is
 * unreachable "until the port is free or changed", so it recovers by itself), and a change of the
 * setting rebinds at once.
 * K1 amendment after W2, both PROPOSED (Fishball 2026-11-14):
 * - decisionBodyBytes: the `/authorize/decision` form body cap, 8 KiB (S7b's): the form carries a
 *   token, an id, a name and two opaque values. Over it is 413 with no body;
 * - pendingRequestsMax: pending authorization requests held at once. `GET /authorize` needs no
 *   credential and is reachable through a tunnel, so without a cap every request (held for
 *   LIFETIME.pendingRequestMs) would grow memory without bound. At the cap the oldest is evicted
 *   first; an evicted request answers "expired" like any other.
 */
export const APPROVAL_LISTENER = Object.freeze({
  defaultPort: 47615,
  retryMs: 30 * SECOND_MS,
  decisionBodyBytes: 8 * KIB,
  pendingRequestsMax: 256,
  // The page's response headers (R-OA-11, R-OA-12; S7b P-rows).
  headers: Object.freeze({
    'cache-control': 'no-store',
    // `same-origin` (X-SEC X-01, C-WIRE-2; was S7b's `no-referrer`): under `no-referrer` a browser
    // posts the form with `Origin: null` (Fetch, "append a request Origin header"), which the gate
    // rightly refuses, so no real browser could press Authorize. `same-origin` keeps the page's own
    // Origin on its POST and still sends no Referer across origins (the 303 to the client's
    // redirect_uri included). The gate keeps refusing `null`: an attacker can choose it.
    'referrer-policy': 'same-origin',
    // S7b's verified value. No `form-action`: browsers apply it to the 303 that follows the POST,
    // which would block the redirect to the client's loopback `redirect_uri`.
    // `style-src` (UI-POLISH-D; the user, 2026-11-18): the page's one inline `<style>` block, admitted
    // by its SHA-256 alone (src/mcp/oauth-web/page-theme.js PAGE_STYLE). No 'unsafe-inline', so a
    // style attribute or any other style block is still refused, and scripts, images, fonts,
    // connections and framing stay `'none'`. Editing PAGE_STYLE changes this hash: update both.
    'content-security-policy': "default-src 'none'; style-src 'sha256-wkX+PGd3j5mohFYHazp5lMQO5mPsM8loy17wNal+3SA='; frame-ancestors 'none'",
  }),
  // [spec] RFC 9700 §4.12: the redirect after the form POST is 303, never 307.
  redirectStatus: HTTP_STATUS.seeOther,
})

/**
 * Client ID Metadata Document fetch (R-OA-13; [spec] CIMD draft §3, §4.4, §6.5, §6.6).
 * `maxBytes` is the draft's figure; the time bound and the cache cap are PROPOSED (S7b's values).
 * cacheEntriesMax (K1 amendment after W2; PROPOSED, Fishball 2026-11-14): documents cached at
 * once, one per client id URL, so new client id URLs cannot grow memory without bound (each is
 * kept up to maxCacheMs). At the cap the oldest is evicted first.
 */
export const CIMD_LIMITS = Object.freeze({
  maxBytes: 5 * KIB,
  timeoutMs: 3 * SECOND_MS,
  maxCacheMs: DAY_MS,
  cacheEntriesMax: 256,
  scheme: 'https:',
  forbiddenAuthFields: Object.freeze(['client_secret', 'client_secret_expires_at']),
})

/** Agent ids (R-ID-02, TQ-1 C): 1–64 of `A–Z a–z 0–9 _ -`, case-sensitive, never a dot. */
const ID_BODY = '[A-Za-z0-9_-]{1,64}'
export const ID_GRAMMAR = Object.freeze({ pattern: Object.freeze(new RegExp(`^${ID_BODY}$`)) })

/**
 * The browser client's id on the approval page (R-OA-22, R-ID-01, requirements 1.32 R13, 1.33
 * Q-A1 B; design §5.5a; K1d). The page asks for no id:
 * - AUTHORIZE_EXTENSION.agentIdParam: the authorization-request extension parameter that carries
 *   the agent's own id (§1.0c: `fishball_id` renamed `agent_id`) [spec: RFC 6749 §3.1 lets an
 *   authorization server define request parameters; one it does not know is ignored];
 * - DERIVED_AGENT_ID: the fixed id a client that passes none gets: `prefix` followed by the first
 *   `chars` characters of the RFC 4648 base32 encoding, in `alphabet` (lower case, no padding), of
 *   the raw `digestAlgorithm` bytes of the UTF-8 `client_id` string exactly as the request carries
 *   it (no normalisation; K1d pins the input so two implementations derive one id). Deterministic,
 *   no dot, and within ID_GRAMMAR (20 characters).
 */
export const AUTHORIZE_EXTENSION = Object.freeze({ agentIdParam: 'agent_id' })
export const DERIVED_AGENT_ID = Object.freeze({
  prefix: 'cid-',
  chars: 16,
  alphabet: 'abcdefghijklmnopqrstuvwxyz234567',
  digestAlgorithm: 'sha256',
})

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
 * still settles it. The request id has the agent-id alphabet (no dot), so the last `.r`
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
/**
 * `turn-finished` (WAKE-REDUCE, the user's decision 2026-11-21): emitted once a managed session's
 * tree stands still (no running agent, subagent or background job, nothing queued).
 * - `completed`: its last turn completed; `finalMessage` is the last assistant text, cut to
 *   `finalMessageBytes` UTF-8 bytes including `truncationMarker` ("a few KB", the user);
 * - `stopped`: it stopped for any reason but its manager's own stop; `stop` says why.
 */
export const TURN_OUTCOME = Object.freeze({ completed: 'completed', stopped: 'stopped' })
export const TURN_FINISHED = Object.freeze({ finalMessageBytes: 4096, truncationMarker: '…[truncated]' })

/** `contributed:<namespace>.<event>`; the prefix has one owner, K2. */
export const CONTRIBUTED_TYPE_PREFIX = CONTRIBUTED_EVENT.typePrefix

/**
 * The three offer types (R-EVS-02). Their events carry `offer`; a revocation withdraws them to the
 * user (R-TOK-05). An `ask` (ask_agent) is answered the same way, with `approval_answer` on its
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
 * - `mailboxGeneration` (K1 amendment after W2; Fishball 2026-11-14): a box's generation is
 *   set when its storage record is first made, and changes only when that storage is lost or
 *   reset (the box record is gone, so the next use makes a new one). Delete (`drop`), the end of
 *   a hold (`expireHolds`) and re-enable (`release`) keep it. A cursor of an older generation is
 *   answered `{resync: {reason: RESYNC_REASON.staleCursor, headSequence}}` (EVT-UC-01 E2).
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
 * `by: delegate` (dshConnectorSessions delegates; the user, 2026-11-20: "yes send settlements"): a
 * main-DSH plugin decided the request before any offer was made, so the manager never saw the offer;
 * the settlement then carries `delegate` `{name, toolName, reason}` to say what was decided.
 */
export const SETTLEMENT_OUTCOME = Object.freeze({ allowed: 'allowed', rejected: 'rejected', answered: 'answered' })
export const SETTLED_BY = Object.freeze({ user: 'user', principal: 'principal', delegate: 'delegate' })
/**
 * A permission offer's optional `delegate` `{name, outcome, reason?}` (the user, 2026-11-21, after
 * the Watchdog live test): a delegate claimed the request and did not decide it, so the manager can
 * tell a judged `passed` (its reason, when it gave one) from a `failed` delegate (a throw or an
 * invalid answer; reason = the failure's code). No field: no delegate claimed the request.
 */
export const DELEGATE_OUTCOME = Object.freeze({ passed: 'passed', failed: 'failed' })

/**
 * Who wrote one message `session_read` returns (K1 amendment at W4b, C-WIRE; requirements 1.41
 * Q-G8 = B, neutral names): V2's `fishball` role is `principal` here, since any principal may send
 * (as SETTLED_BY). The other words are V2's ROLE unchanged: `user` (the user typed it), `assistant`
 * (that session's agent), `agent` (another session sent it), `context` (anything else recorded).
 */
export const READ_ROLE = Object.freeze({ user: 'user', assistant: 'assistant', principal: 'principal', agent: 'agent', context: 'context' })

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
 * - ENTRY_STATUS (K1d, design §5.9): `ok` only. A generated value can be neither too short nor
 *   unset, so `token-too-short` and `token-unconfigured` are withdrawn. The field stays, so a caller
 *   that admits only `status === ENTRY_STATUS.ok` is unchanged.
 */
export const ENTRY_STATUS = Object.freeze({ ok: 'ok' })
/**
 * A settings save of the tokens list is refused, the previous list is written back, and the
 * settings page shows a notice naming the entries' labels only (R-TOK-08, R3, R5; design §5.9).
 * `token-duplicate` (K1d; PROPOSED, decided item 9) replaces `ref-duplicate` and `value-duplicate`.
 * It covers two items with one entry `key`, two entries with one value digest, and an item with no
 * record (added by hand, so it has no digest; R5). Found outside a save, the same entries refuse
 * service and the page shows the same notice. So one value always names one principal (R-TOK-07).
 */
export const SETTINGS_REFUSAL = Object.freeze({ tokenDuplicate: 'token-duplicate' })
/**
 * K1 `RevocationKind` as data (K1d), so the connector writes each word once: `disabled` (the entry
 * was switched off; its pair and held mailbox stay, R-ID-09) and `deleted`. A value can no longer
 * change (requirements 1.27), so `value-changed` is withdrawn.
 */
export const REVOCATION_KIND = Object.freeze({ disabled: 'disabled', deleted: 'deleted' })
export const PAIR_STATE = Object.freeze({ paired: 'paired', unpaired: 'unpaired' })
export const CONNECTOR_STATUS = Object.freeze({ approvalPortInUse: 'approval-port-in-use' })

/**
 * The words of a Fishball DSH's link to its target connector. K1 is their one runtime owner
 * (DECIDED D7): they cross the connector–core boundary, and core vendors K1. K3
 * `host-services/child.d.ts` types the same words as `TargetState` and `TargetCode`, and K3
 * `core/contracts/events.d.ts` types `disconnected` in `CommitSendResult`; a K3 amendment of one
 * of those types changes this object in the same change.
 * - TARGET_STATE: `targetStatus().state` (design §4.1).
 * - TARGET_CODE: `targetStatus().code` (design §6.1, §9.1; R-MIG-03; R-HOST-10 for `token-revoked`).
 *   `insecure` and `invalid` (DECIDED D5) are core's own refusals of a target URL before any
 *   request (R-FB-04; REM-EP-01 rows 6–8), reported with state `target-unset`: plain `http:` to a
 *   host that is not a loopback name, and a value that is not an `http:` / `https:` URL.
 * - LINK_REFUSAL: the answer code of a call made while the link is down (design §6.3, R-REM-04):
 *   the call never reached the connector.
 */
export const TARGET_STATE = Object.freeze({
  connected: 'connected',
  unreachable: 'target-unreachable',
  refused: 'token-refused',
  unset: 'target-unset',
})
export const TARGET_CODE = Object.freeze({
  unreachable: 'TARGET_UNREACHABLE',
  refused: 'TOKEN_REFUSED',
  incompatible: 'TARGET_INCOMPATIBLE',
  revoked: 'token-revoked',
  insecure: 'target-insecure',
  invalid: 'target-invalid',
})
export const LINK_REFUSAL = Object.freeze({ disconnected: 'disconnected' })


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
  // The V2 domain's operation codes (contract 1.2 §7), unchanged; moved here with the payload
  // vocabularies when C-WIRE-2 deleted `./contract`.
  notReferenced: 'not-referenced',
  tooLarge: 'too-large',
  imagesUnsupported: 'images-unsupported',
  notManaged: 'not-managed',
  featureOff: 'feature-off',
  sessionNotLive: 'session-not-live',
  invalidDecision: 'invalid-decision',
  riskRequired: 'risk-required',
  reasonRequired: 'reason-required',
  allowNeedsLowRisk: 'allow-needs-low-risk',
  argumentsIncomplete: 'arguments-incomplete',
  questionRequired: 'question-required',
  modeUser: 'mode-user',
  badAnswer: 'bad-answer',
  alreadySettled: 'already-settled',
  grantInvalid: 'grant-invalid',
  prefixNotShellTool: 'prefix-not-shell-tool',
  prefixEmpty: 'prefix-empty',
  prefixNotInCall: 'prefix-not-in-call',
  expiresRequired: 'expires-at-required',
  expiresInvalid: 'expires-at-invalid',
  expiresPast: 'expires-at-past',
  grantUnknown: 'unknown',
  grantEnded: 'ended',
  // message_agent (the managed session's own tool): an empty message.
  empty: 'empty',
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
  // PairStore.succeed (K1 amendment after W2): the successor has not paired yet. The word of K3's
  // RetireRefusalCode (host-services/tokens.d.ts), which C-SUCCEED returns unchanged.
  successorUnpaired: 'successor-unpaired',
})

/**
 * ManagedState's refusals (task K1c; index.d.ts `ManagedState`). Each word keeps its one owner
 * through REFUSAL, so the tools that return them (`session_start`, `session_release`) answer the
 * same strings:
 * - alreadyManaged: `manage` on a session that has a manager, the caller included (the rule of
 *   K3's `handOver`, Q-HO-1 C);
 * - notManaged: `release` of a session nobody manages (V2's release code);
 * - otherManager: `release` of a session another principal manages (R-ROUTE-02, HAND-ST-01 row 9).
 */
export const MANAGED_REFUSAL = Object.freeze({
  alreadyManaged: REFUSAL.conflict,
  notManaged: REFUSAL.notManaged,
  otherManager: REFUSAL.forbidden,
})

/** The `id-invalid` word of `fishball-core`'s settings and of the approval page (R-ID-02, R-OA-12). */
export const ID_REFUSAL = Object.freeze({ idInvalid: 'id-invalid' })

/**
 * A `notice` event's `code` (R-EVS-02). The grammar is K2's refusal-code grammar; which notices
 * exist is left to the task that produces each one, which adds its code here as a K1 amendment.
 * None is frozen yet. K1c (README "User decisions" K1c-4): C-ROUTE produces none (a revocation's
 * note is a `system` note in the session). A
 * notice C-WIRE produces is still its own K1 amendment.
 */
export const NOTICE = Object.freeze({
  codeGrammar: NAME_GRAMMAR.code,
  codes: Object.freeze({
    // A managed session's ask_user_question call ended before an answer while its turn went on (e.g.
    // its run_code program reached its deadline; a cancelled turn withdraws the question instead).
    // The question stays open with its manager, and an answer to it is delivered into the session as
    // a message (the user, 2026-11-21: "Keep it open, send the answer later"). Correlation id: the
    // question's current offer id.
    questionCallEnded: 'question-call-ended',
  }),
})

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
