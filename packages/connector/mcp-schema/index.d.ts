/**
 * Types of `fishball-connector/mcp-schema` (task K1). The values are in `index.js`; the prose
 * freeze is `README.md`. The interfaces under "Internal module interfaces" are the seams the W2
 * tasks build and test against with fakes (v3-tasks.md W2); they are connector-internal, never a
 * DSH service and never reachable over MCP or HTTP.
 */
import type { JsonSchemaNode, JsonSchemaObject, JsonValue } from '../tools/index.js'

export type Scope = 'fishball' | 'fishball:pair'
export type EventType =
  | 'permission' | 'question' | 'plan-review' | 'settlement' | 'retirement' | 'turn-finished' | 'state'
  | 'message' | 'ask' | 'handover' | 'takeback' | 'notice' | `contributed:${string}.${string}`

/** Milliseconds since the Unix epoch. */
export type EpochMs = number

/** The core tools' structured result (R-CON-02). */
export type ToolResult<T extends object = Record<string, JsonValue>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message?: string; [extra: string]: JsonValue | undefined }

export interface CallToolResult {
  readonly structuredContent: { ok: boolean; [key: string]: unknown }
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly isError: boolean
}

export interface Offer { offerId: string; revision: number; decisionKind: 'approval' | 'question' }

export interface MailboxEvent {
  eventId: string
  mailboxGeneration: string
  sequence: number
  type: EventType
  at: EpochMs
  sourceSessionId: string | null
  correlationId: string | null
  offer?: Offer
  payload: JsonValue
  payloadDigest: string
}

export type PollResult =
  | { ok: true; events: MailboxEvent[]; nextCursor: string; hasMore: boolean }
  | { ok: true; resync: { reason: 'stale-cursor'; headSequence: number } }
  | { ok: false; code: 'forbidden' | 'limit-exceeded' | 'invalid-arguments' }

export interface Receipt { eventId: string; payloadDigest: string }
export type AckResult = { ok: true; acked: number } | { ok: false; code: 'unknown-event' | 'digest-mismatch' }

// ---------------------------------------------------------------------------------------------
// Internal module interfaces (W2)
// ---------------------------------------------------------------------------------------------

/** An opaque, stable key of one token entry (never the token, its ref or its label). */
export type EntryKey = string
/**
 * A principal key: opaque and stable for one (entry, bound id). Handed to contributors as
 * `call.principal.key` (R-EXT-10) and to embed-UI as `principal.key` (design §3.6).
 */
export type PrincipalKey = string

/** Whatever authenticated one request: the principal it acts as, and its live power. */
export interface Caller {
  readonly entryKey: EntryKey
  /** The client id the access token was issued to. */
  readonly clientId: string
  /** Present when the entry is bound to `clientId` (full power). */
  readonly principalKey?: PrincipalKey
  /** Evaluated live (R-ID-03): `fishball` as soon as `pair` binds this token's entry to `clientId`. */
  readonly scope: Scope
  /** The canonical MCP URI the token was issued for (its audience). */
  readonly audience: string
  /** The entry generation the token was issued under (TokenEntry.generation); a newer one means revoked. */
  readonly generation: number
}

/**
 * C-OAUTH's bearer verifier, called by C-HTTP after the Host/Origin checks and before any MCP
 * processing (design §3.1 step 3). It never throws and never says which tokens exist.
 */
export interface BearerVerifier {
  /**
   * @param authorization the raw `Authorization` header, or undefined
   * @param audience the canonical MCP URI of the checked request host
   * @param now injected clock
   * @returns the caller, or `{error}`: `missing` (no Bearer value: 401 without `error`) or
   *   `invalid_token` (unknown, expired at `now >= issuedAt + 3600 s`, revoked, foreign audience:
   *   401 with `error="invalid_token"`)
   */
  verify(authorization: string | undefined, audience: string, now: EpochMs): Caller | { error: 'missing' | 'invalid_token' }
}

/** The connector-side state of one token entry. Never carries the value. */
export interface TokenEntry {
  readonly entryKey: EntryKey
  readonly label: string
  readonly enabled: boolean
  readonly ref: string
  /** `ok`, `token-too-short` or `token-unconfigured` (ENTRY_STATUS). */
  readonly status: 'ok' | 'token-too-short' | 'token-unconfigured'
  /**
   * Bumped on disable, delete or value change. Every access and refresh token records the
   * generation it was issued under, so a re-enable revives none (R-OA-06, S7 §4.4).
   */
  readonly generation: number
  /** Whether the connector generated the value (so a delete unsets it, R-TOK-09). */
  readonly generated: boolean
}

export type RevocationKind = 'disabled' | 'deleted' | 'value-changed'

/** C-TOKENS: token entries over native settings and `ctx.credentials`. */
export interface TokenRegistry {
  /**
   * Constant-time match of a presented value against the **enabled**, `ok` entries' digests
   * (R-TOK-06). `undefined` for every miss, whatever the reason. Two entries never hold one
   * value: such a settings save is refused `value-duplicate` (SETTINGS_REFUSAL), so a match is
   * unique.
   */
  match(value: string): TokenEntry | undefined
  get(entryKey: EntryKey): TokenEntry | undefined
  list(): readonly TokenEntry[]
  /** Fires synchronously when an entry is disabled, deleted or its value changed (R-TOK-05). */
  onRevoked(listener: (entryKey: EntryKey, kind: RevocationKind, generation: number) => void): () => void
}

export interface Pair {
  readonly entryKey: EntryKey
  readonly principalKey: PrincipalKey
  readonly id: string
  readonly name: string | null
  readonly pairedAt: EpochMs
  readonly lastSeenAt: EpochMs | null
  /** Recorded for a pair the approval page made (R-ID-13, R-OA-12). */
  readonly clientIdUrl?: string
  readonly redirectUri?: string
}

export type PairResult =
  | { ok: true; paired: true; id: string; name: string | null; nameAssigned?: boolean; nameRefused?: 'name-taken' | 'name-invalid' }
  | { ok: false; code: 'already-paired'; bound: { idMatches: boolean; boundId: string; name: string | null; pairedAt: EpochMs; lastSeenAt: EpochMs | null }; advice: string }
  | { ok: false; code: 'id-taken' }

export type SetNameResult = { ok: true; name: string | null } | { ok: false; code: 'name-taken' | 'name-invalid' }

/**
 * C-PAIR's pair store: one serial registry over every pair and name (S3: DSH storage has no
 * secondary index, so `pair`, the page's bind and `set_name` are one transaction each over it).
 */
export interface PairStore {
  /** Every pair, for the native status rows (R-ID-12) and the hand-over service's `principals()`. */
  list(): readonly Pair[]
  pairOf(entryKey: EntryKey): Pair | undefined
  byPrincipal(principalKey: PrincipalKey): Pair | undefined
  /** `pair` (R-ID-03/04/13, R-NAME-06): already-paired before id-taken; a name never fails it. */
  pair(entryKey: EntryKey, id: string, name: string | undefined, now: EpochMs): Promise<PairResult>
  /**
   * The approval page's bind (R-OA-12 (3)–(4)): unlike `pair`, a bad or held name refuses and
   * binds nothing.
   */
  bindFromPage(entryKey: EntryKey, id: string, name: string | undefined, client: { clientIdUrl: string; redirectUri: string }, now: EpochMs):
    Promise<{ ok: true; pair: Pair } | { ok: false; code: 'already-paired' | 'id-invalid' | 'id-taken' | 'name-invalid' | 'name-taken' }>
  /** `set_name`; `null` clears (R-NAME-02). */
  setName(principalKey: PrincipalKey, name: string | null): Promise<SetNameResult>
  /** Records an authenticated request; writes at most once per PAIR_TIMING.lastSeenWriteIntervalMs. */
  seen(principalKey: PrincipalKey, now: EpochMs): void
  /** Deleting an entry frees its id and name (R-ID-13, R-NAME-02). */
  remove(entryKey: EntryKey): Promise<void>
  onChange(listener: () => void): () => void
}

/** What a producer commits; the mailbox adds `eventId`, generation, sequence, digest and `at`. */
export interface EventDraft {
  type: EventType
  sourceSessionId: string | null
  correlationId: string | null
  offer?: Offer
  payload: JsonValue
  /** Contributor events only: a pending duplicate from the same contributor is `duplicate`. */
  dedupeKey?: string
}

export type CommitResult = { ok: true; eventId: string } | { ok: false; code: 'queue-full' | 'duplicate' }

/** C-MAILBOX: one durable ledger per pair (R-CON-03, R-ID-06). */
export interface Mailbox {
  /** Commits one event and sends its hint on that pair's listen streams only (R-EVT-04, S7 §4.4). */
  commit(recipient: PrincipalKey, draft: EventDraft): Promise<CommitResult>
  poll(principalKey: PrincipalKey, cursor: string | undefined, limit: number): Promise<PollResult>
  ack(principalKey: PrincipalKey, receipts: readonly Receipt[]): Promise<AckResult>
  summary(principalKey: PrincipalKey): Promise<{ pending: number; headSequence: number; mailboxGeneration: string }>
  /** Replaces a pending event by a `retirement` naming it (R-EXT-19, R-TOK-05, R-HOST-09). */
  retire(principalKey: PrincipalKey, eventId: string, reason: 'withdrawn' | 'revoked' | 'released' | 'reissued' | 'contributor-withdrawn'): Promise<void>
  /** Disable (R-TOK-05): the mailbox is held, not pollable, for MAILBOX.disabledRetentionMs from `now`. */
  hold(principalKey: PrincipalKey, now: EpochMs): Promise<void>
  /** Re-enable within the hold: the held events are pending again, same identities. */
  release(principalKey: PrincipalKey): Promise<void>
  /**
   * Delete, or the end of the hold: every event is dropped. Returns the dropped `ask` events'
   * correlation ids, so the asking sessions are answered `unavailable` (R-TOK-05).
   */
  drop(principalKey: PrincipalKey): Promise<{ droppedAsks: readonly string[] }>
}

/** C-HTTP's side of the hint (R-EVT-04): the mailbox calls it after each commit, for that pair only. */
export interface HintSink {
  resourceUpdated(principalKey: PrincipalKey, uri: string): void
}

/**
 * The token store C-OAUTH and C-OAUTH-WEB share (R-OA-05, R-OA-14, R-OA-16). Everything is held
 * by SHA-256 digest of the opaque value. Access tokens and codes are in memory only; refresh
 * tokens persist as digests with their chain id and entry generation (Q-S7B-3 A).
 */
export interface IssuedAccessToken {
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly audience: string
  readonly generation: number
  readonly issuedAt: EpochMs
  /** Set for a token from the code or refresh grant: revoking the chain revokes it (R-OA-16 (2)). */
  readonly chainId?: string
}
export interface RefreshRecord {
  readonly chainId: string
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly audience: string
  readonly generation: number
  readonly chainStartedAt: EpochMs
  /** Set once spent; within LIFETIME.refreshGraceMs a repeat gets `successor` (R-OA-16 (4a)). */
  readonly spentAt?: EpochMs
}
export interface CodeRecord {
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly audience: string
  readonly issuedAt: EpochMs
}
export interface OAuthTokenStore {
  putAccess(digest: string, token: IssuedAccessToken): void
  getAccess(digest: string): IssuedAccessToken | undefined
  putCode(digest: string, code: CodeRecord): void
  /** Single use (R-OA-14): returns and removes the record; a second take is `undefined`. */
  takeCode(digest: string): CodeRecord | undefined
  putRefresh(digest: string, record: RefreshRecord): Promise<void>
  getRefresh(digest: string): RefreshRecord | undefined
  /** Revokes every access and refresh token of a chain (reuse, replayed code). */
  revokeChain(chainId: string): Promise<void>
  /** Revokes every token derived from an entry below `generation` (R-OA-06). */
  revokeEntry(entryKey: EntryKey, generation: number): Promise<void>
}

/** What an event is about, for routing (R-EVS-03). */
export interface RouteSubject {
  type: EventType
  sessionId: string | null
  /** For `settlement`, `retirement` and `takeback`: the pair that received the original. */
  followsPrincipal?: PrincipalKey
  /** For `contributed:*`: the contributor's namespace (rate limits and dedupe are per contributor and recipient, R-EXT-18). */
  contributor?: string
}

/** The no-recipient outcome, by type (R-CON-09, R-EXT-17). */
export type NoRecipient = { recipient: null; fallback: 'to-user' | 'queue' | 'unavailable' | 'no-fishball' | 'dropped' }

/**
 * C-ROUTE's router: exactly one recipient per event, decided at creation (R-EVS-03, EVT-DT-01).
 * A follow-up goes to `followsPrincipal`; a managed session's event to its manager; an unmanaged
 * session's (or no session's) `message`, `ask`, `notice` or contributor event to the designated
 * Fishball; unmanaged `turn-finished` / `state` are not produced at all (`dropped`).
 */
export interface Router {
  recipientFor(subject: RouteSubject): { recipient: PrincipalKey } | NoRecipient
}

/** The one "connected" definition (CONNECTED): an open listen stream on `fishball://events`. */
export interface Presence {
  isConnected(principalKey: PrincipalKey): boolean
  onChange(listener: (principalKey: PrincipalKey, connected: boolean) => void): () => void
}

// ---------------------------------------------------------------------------------------------
// Runtime exports (index.js). Literal types mirror the frozen values; a K1 amendment changes both.
// ---------------------------------------------------------------------------------------------

export declare const ANSWERABLE_TYPES: readonly ["permission", "question", "plan-review", "ask"]
export declare const APPROVAL_LISTENER: { readonly defaultPort: 47615; readonly retryMs: 30000; readonly headers: { readonly "cache-control": "no-store"; readonly "referrer-policy": "no-referrer"; readonly "content-security-policy": "default-src 'none'; frame-ancestors 'none'" }; readonly redirectStatus: 303 }
export declare const BEARER_CHALLENGE: { readonly scheme: "Bearer"; readonly basicScheme: "Basic"; readonly params: readonly ["error", "error_description", "scope", "resource_metadata"]; readonly queryParameter: "access_token"; readonly queryClientSecret: "client_secret" }
export declare const CIMD_LIMITS: { readonly maxBytes: 5120; readonly timeoutMs: 3000; readonly maxCacheMs: 86400000; readonly scheme: "https:"; readonly forbiddenAuthFields: readonly ["client_secret", "client_secret_expires_at"] }
export declare const CLIENT_AUTH: { readonly basic: "client_secret_basic"; readonly post: "client_secret_post"; readonly none: "none" }
export declare const CONNECTED: { readonly listenResource: "fishball://events" }
export declare const CONNECTOR_STATUS: { readonly approvalPortInUse: "approval-port-in-use" }
export declare const CONTRIBUTED_TYPE_PREFIX: "contributed:"
export declare const DECISION_KIND: { readonly approval: "approval"; readonly question: "question" }
export declare const DECISION_KIND_OF: { readonly permission: "approval"; readonly ask: "approval"; readonly question: "question"; readonly "plan-review": "question" }
export declare const ENDPOINT_LIMITS: { readonly bodyBytes: 8388608; readonly inFlightPerPrincipal: 32; readonly listenStreamsPerPrincipal: 8; readonly requestsPerMinute: 600; readonly requestBurst: 120; readonly jsonRpcCode: -32000 }
export declare const ENTRY_STATUS: { readonly ok: "ok"; readonly tokenTooShort: "token-too-short"; readonly tokenUnconfigured: "token-unconfigured" }
export declare const EVENT_TYPE: { readonly permission: "permission"; readonly question: "question"; readonly planReview: "plan-review"; readonly settlement: "settlement"; readonly retirement: "retirement"; readonly turnFinished: "turn-finished"; readonly state: "state"; readonly message: "message"; readonly ask: "ask"; readonly handover: "handover"; readonly takeback: "takeback"; readonly notice: "notice" }
export declare const GRANT: { readonly clientCredentials: "client_credentials"; readonly authorizationCode: "authorization_code"; readonly refreshToken: "refresh_token" }
export declare const HOSTS: { readonly loopbackNames: readonly ["localhost", "127.0.0.1", "[::1]"]; readonly loopbackScheme: "http:"; readonly remoteScheme: "https:"; readonly forwardedHeadersIgnored: readonly ["forwarded", "x-forwarded-proto", "x-forwarded-host"] }
export declare const HTTP_REFUSAL: { readonly insecureListener: "insecure-listener"; readonly tooLarge: "limit-exceeded"; readonly rateLimited: "rate-limited" }
export declare const HTTP_STATUS: { readonly ok: 200; readonly seeOther: 303; readonly badRequest: 400; readonly unauthorized: 401; readonly forbidden: 403; readonly notFound: 404; readonly methodNotAllowed: 405; readonly payloadTooLarge: 413; readonly tooManyRequests: 429; readonly internalServerError: 500; readonly serviceUnavailable: 503 }
export declare const ID_GRAMMAR: { readonly pattern: RegExp }
export declare const ID_REFUSAL: { readonly idInvalid: "id-invalid" }
export declare const OAUTH_METADATA: {
  readonly protectedResource: { readonly bearer_methods_supported: readonly ["header"]; readonly scopes_supported: readonly ["fishball"] }
  readonly authorizationServer: {
    readonly grant_types_supported: readonly ["client_credentials", "authorization_code", "refresh_token"]
    readonly response_types_supported: readonly ["code"]
    readonly code_challenge_methods_supported: readonly ["S256"]
    readonly token_endpoint_auth_methods_supported: readonly ["client_secret_basic", "client_secret_post", "none"]
    readonly client_id_metadata_document_supported: true
    readonly authorization_response_iss_parameter_supported: true
    readonly scopes_supported: readonly ["fishball", "fishball:pair"]
  }
}
export declare const INSUFFICIENT_SCOPE_REASON: { readonly notPaired: "not-paired"; readonly idMismatch: "id-mismatch" }
export declare const LIFETIME: { readonly accessTokenMs: 3600000; readonly codeMs: 60000; readonly pendingRequestMs: 600000; readonly refreshGraceMs: 10000; readonly refreshChainMaxMs: 2592000000 }
export declare const MAILBOX: { readonly pageDefault: 50; readonly pageMax: 100; readonly disabledRetentionMs: 2592000000; readonly ackedReceiptMs: 86400000 }
export declare const NAME_RULES: { readonly minChars: 1; readonly maxChars: 64; readonly whitespaceRun: RegExp; readonly control: RegExp; readonly space: " "; readonly normalForm: "NFC"; readonly namelessPrefix: "ID: " }
export declare const NOTICE: { readonly codeGrammar: RegExp; readonly codes: Readonly<Record<string, never>> }
export declare const OAUTH_ERROR: { readonly invalidRequest: "invalid_request"; readonly invalidClient: "invalid_client"; readonly invalidGrant: "invalid_grant"; readonly unsupportedGrantType: "unsupported_grant_type"; readonly invalidTarget: "invalid_target"; readonly unsupportedResponseType: "unsupported_response_type"; readonly accessDenied: "access_denied"; readonly serverError: "server_error"; readonly temporarilyUnavailable: "temporarily_unavailable"; readonly invalidToken: "invalid_token"; readonly insufficientScope: "insufficient_scope" }
export declare const OAUTH_ERROR_STATUS: { readonly invalid_request: 400; readonly invalid_client: 401; readonly invalid_grant: 400; readonly unsupported_grant_type: 400; readonly invalid_target: 400; readonly temporarily_unavailable: 429; readonly invalid_token: 401; readonly insufficient_scope: 403; readonly server_error: 500 }
export declare const OFFER_ID: { readonly pattern: RegExp; readonly separator: ".r"; readonly firstRevision: 1 }
export declare const OFFER_TYPES: readonly ["permission", "question", "plan-review"]
export declare const PAIR_ADVICE: { readonly idMatches: "continue with this token and id only if no other agent uses this id with this token; otherwise use a new token and a new id"; readonly idDiffers: "use a new token" }
export declare const PAIR_ONLY: { readonly methods: readonly ["server/discover", "tools/list"]; readonly tools: readonly ["pair"] }
export declare const PAIR_STATE: { readonly paired: "paired"; readonly unpaired: "unpaired" }
export declare const PAIR_TIMING: { readonly lastSeenWriteIntervalMs: 60000 }
export declare const PATHS: { readonly mcp: "/api/fishball/mcp"; readonly issuer: "/api/fishball/oauth"; readonly token: "/api/fishball/oauth/token"; readonly protectedResourcePrefix: "/.well-known/oauth-protected-resource"; readonly authorizationServerPrefix: "/.well-known/oauth-authorization-server"; readonly authorize: "/authorize"; readonly decision: "/authorize/decision" }
export declare const PKCE: { readonly method: "S256" }
export declare const PROTOCOL: { readonly version: "2026-07-28"; readonly unsupportedVersionCode: -32022; readonly headerMismatchCode: -32020; readonly ignoredHeaders: readonly ["mcp-session-id"]; readonly clientCredentialsExtension: "io.modelcontextprotocol/oauth-client-credentials" }
export declare const QUEUE: { readonly maxQueuedInputs: 200; readonly refusedTypes: readonly ["message", "turn-finished", "state", "notice"]; readonly contributedRefused: true }
export declare const RATE_LIMITS: { readonly windowMs: 60000; readonly keyParts: readonly ["remoteAddress", "clientId"]; readonly failuresPerWindow: 10; readonly failuresPerAddressPerWindow: 50; readonly tokenRequestsPerWindow: 30; readonly retryAfterHeader: "retry-after" }
export declare const REFUSAL: { readonly limitExceeded: "limit-exceeded"; readonly invalidArguments: "invalid-arguments"; readonly queueFull: "queue-full"; readonly rateLimited: "rate-limited"; readonly operationFailed: "operation-failed"; readonly forbidden: "forbidden"; readonly unknownSession: "unknown-session"; readonly expired: "expired"; readonly conflict: "conflict"; readonly unavailable: "unavailable"; readonly unsupportedOperation: "unsupported-operation"; readonly notReferenced: "not-referenced"; readonly tooLarge: "too-large"; readonly imagesUnsupported: "images-unsupported"; readonly notManaged: "not-managed"; readonly featureOff: "feature-off"; readonly sessionNotLive: "session-not-live"; readonly invalidDecision: "invalid-decision"; readonly riskRequired: "risk-required"; readonly reasonRequired: "reason-required"; readonly allowNeedsLowRisk: "allow-needs-low-risk"; readonly argumentsIncomplete: "arguments-incomplete"; readonly questionRequired: "question-required"; readonly modeUser: "mode-user"; readonly badAnswer: "bad-answer"; readonly alreadySettled: "already-settled"; readonly grantInvalid: "grant-invalid"; readonly prefixNotShellTool: "prefix-not-shell-tool"; readonly prefixEmpty: "prefix-empty"; readonly prefixNotInCall: "prefix-not-in-call"; readonly expiresRequired: "expires-at-required"; readonly expiresInvalid: "expires-at-invalid"; readonly expiresPast: "expires-at-past"; readonly grantUnknown: "unknown"; readonly grantEnded: "ended"; readonly alreadyPaired: "already-paired"; readonly idTaken: "id-taken"; readonly nameInvalid: "name-invalid"; readonly nameTaken: "name-taken"; readonly unknownEvent: "unknown-event"; readonly digestMismatch: "digest-mismatch" }
export declare const RESOURCE: { readonly events: { readonly name: "fishball-events"; readonly uri: "fishball://events"; readonly mimeType: "application/json" } }
export declare const RESPONSE_TYPE: { readonly code: "code" }
export declare const RESYNC_REASON: { readonly staleCursor: "stale-cursor" }
export declare const RETIREMENT_REASON: { readonly withdrawn: "withdrawn"; readonly revoked: "revoked"; readonly released: "released"; readonly reissued: "reissued"; readonly contributorWithdrawn: "contributor-withdrawn" }
export declare const SCOPE: { readonly full: "fishball"; readonly pair: "fishball:pair" }
export declare const SDK_PINS: { readonly "@modelcontextprotocol/server": "2.2.0"; readonly "@modelcontextprotocol/node": "2.1.0" }
export declare const SETTINGS_REFUSAL: { readonly refDuplicate: "ref-duplicate"; readonly valueDuplicate: "value-duplicate" }
export declare const SETTLED_BY: { readonly user: "user"; readonly principal: "principal" }
export declare const SETTLEMENT_OUTCOME: { readonly allowed: "allowed"; readonly rejected: "rejected"; readonly answered: "answered" }
export declare const TIME_UNIT: { readonly msPerSecond: 1000 }
export declare const TOKEN_RESPONSE_HEADERS: { readonly "cache-control": "no-store"; readonly pragma: "no-cache" }
export declare const TOKEN_TYPE: "Bearer"
export declare const TOKEN_VALUE: { readonly generatedPrefix: "fbt_"; readonly generatedBytes: 32; readonly minChars: 32; readonly opaqueBytes: 32; readonly digestAlgorithm: "sha256" }
export declare const TOOL: { readonly sessionsList: "sessions_list"; readonly sessionStart: "session_start"; readonly sessionMessage: "session_message"; readonly sessionRedirect: "session_redirect"; readonly sessionStop: "session_stop"; readonly sessionRead: "session_read"; readonly sessionRelease: "session_release"; readonly approvalsList: "approvals_list"; readonly approvalAnswer: "approval_answer"; readonly questionAnswer: "question_answer"; readonly questionAsk: "question_ask"; readonly questionAnswerOwn: "question_answer_own"; readonly promptsList: "prompts_list"; readonly promptAnswer: "prompt_answer"; readonly grantsList: "grants_list"; readonly grantRevoke: "grant_revoke"; readonly attachmentPut: "attachment_put"; readonly attachmentRead: "attachment_read"; readonly inboxPoll: "inbox_poll"; readonly inboxAck: "inbox_ack"; readonly pair: "pair"; readonly setName: "set_name" }
export declare const WIRE: { readonly digestHexChars: 64; readonly digestPattern: RegExp }

/** A core tool's definition as `tools/list` lists it. */
export interface CoreToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchemaObject
  /** An exact-one `oneOf` of the success shape(s) and the refusal envelope. */
  readonly outputSchema: { readonly oneOf: readonly JsonSchemaNode[] }
}
export declare const TOOLS: readonly CoreToolDefinition[]
export declare const TOOL_NAMES: readonly string[]
export declare function toolDefinition(name: string): CoreToolDefinition | undefined
export declare function refusalSchema(extra?: Record<string, JsonSchemaNode>): JsonSchemaObject

export declare const EVENT_PAYLOAD_SCHEMA: Readonly<Record<Exclude<EventType, `contributed:${string}`>, JsonSchemaObject>>
export declare const CONTRIBUTED_PAYLOAD_SCHEMA: JsonSchemaObject
export declare const MAILBOX_EVENT_SCHEMA: JsonSchemaObject
export declare const MAILBOX_SUMMARY_SCHEMA: JsonSchemaObject
export declare function payloadSchemaOf(type: unknown): JsonSchemaObject | undefined

export declare function okResult(fields?: Record<string, JsonValue>): CallToolResult
export declare function refusalResult(code: string, extra?: Record<string, JsonValue>, message?: string): CallToolResult

export interface OAuthUrls {
  readonly issuer: string
  readonly resource: string
  readonly tokenEndpoint: string
  readonly protectedResourceMetadata: string
  readonly authorizationServerMetadata: string
}
export declare function oauthUrls(origin: string): OAuthUrls
export declare function protectedResourceMetadata(origin: string): Readonly<Record<string, JsonValue>>
export declare function authorizationServerMetadata(origin: string, approvalOrigin: string): Readonly<Record<string, JsonValue>>
export declare function tokenResponse(issued: { accessToken: string; scope: Scope; refreshToken?: string }):
  Readonly<{ access_token: string; token_type: 'Bearer'; expires_in: 3600; scope: Scope; refresh_token?: string }>
export declare function oauthErrorBody(error: string, description?: string): Readonly<{ error: string; error_description?: string }>
export declare function bearerChallenge(origin: string, problem?: { error?: 'invalid_token' | 'insufficient_scope'; description?: 'not-paired' | 'id-mismatch' }): string
export declare function invalidTokenChallenge(origin: string): string
export declare function insufficientScopeChallenge(origin: string, reason: 'not-paired' | 'id-mismatch'): string

export declare function isFishballId(value: unknown): value is string
export declare function normaliseName(value: unknown): string | undefined
export declare function checkName(value: unknown): Readonly<{ ok: true; name: string } | { ok: false; code: 'name-invalid' }>
export declare function nameKey(normalisedName: string): string
export declare function principalLabel(name: string | null, id: string): Readonly<{ name: string } | { prefix: 'ID: '; id: string }>
export declare function isTokenLongEnough(value: unknown): boolean
export declare function formatOfferId(requestId: string, revision: number): string | undefined
export declare function parseOfferId(value: unknown): Readonly<{ requestId: string; revision: number }> | undefined
export declare function isEventType(value: unknown): value is EventType
