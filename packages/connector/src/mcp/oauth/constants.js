/**
 * Constants of the connector's authorization server (task C-OAUTH; design §5.5, §5.6; spike V3-S7
 * `8e92b84`). Every tunable of the OAuth surface (lifetimes, rate and failure limits, error codes,
 * grants, paths, token sizes) is K1's and is imported from `../../../mcp-schema`; this file holds
 * only what K1 leaves to this module: the token form's field and media-type words, header words,
 * the storage layout and the module's messages.
 */

/**
 * The token request body (RFC 6749 §3.2: `application/x-www-form-urlencoded`). Its size bound is
 * K1's TOKEN_ENDPOINT_LIMITS.formBodyBytes.
 * - A media type other than `mediaType` (parameters such as `charset` aside) is 400
 *   `invalid_request` (Fishball 2026-11-14, #4).
 */
export const TOKEN_FORM = Object.freeze({
  mediaType: 'application/x-www-form-urlencoded',
  mediaTypeParameterSeparator: ';',
  // The form's client fields (RFC 6749 §2.3.1, §3.2); `resource` is RFC 8707's.
  fields: Object.freeze({ clientId: 'client_id', clientSecret: 'client_secret', resource: 'resource' }),
})

/** Request and response header names (Node delivers request header names in lower case). */
export const HEADER = Object.freeze({
  authorization: 'authorization',
  contentType: 'content-type',
  contentLength: 'content-length',
  wwwAuthenticate: 'www-authenticate',
  connection: 'connection',
})

/** Response header values this module writes. */
export const HEADER_VALUE = Object.freeze({
  json: 'application/json',
  // Sent with every refusal that leaves the request body unread (an over-long form, a refusal
  // before the body), and the socket is then destroyed, so Node never drains an unbounded body.
  close: 'close',
})

/**
 * `Authorization` header parsing (RFC 7235 §2.1: the scheme is case-insensitive; one space before
 * the credentials). The scheme words themselves are K1's (BEARER_CHALLENGE).
 */
export const AUTH_HEADER = Object.freeze({
  schemeSeparator: ' ',
  // RFC 7617 §2: `user-id ":" password`, split at the first colon (a user-id holds none).
  basicSeparator: ':',
  basicEncoding: 'base64',
  // RFC 6749 §2.3.1 form-encodes both Basic parts; these characters are the only ones whose
  // presence makes the raw and the form-decoded value differ (`%xx` escapes and `+` for space).
  formEncodedMarks: Object.freeze(['%', '+']),
  formSpace: '+',
  space: ' ',
})

/** A base for parsing a request's path and query from `req.url`, which holds no origin. */
export const URL_BASE = 'http://request.invalid'

/** The remote address when Node no longer knows it (a socket already gone): one shared bucket. */
export const UNKNOWN_ADDRESS = ''

/** A Basic part or form value that is empty is absent (RFC 6749 §3.1; Fishball 2026-11-14, #4). */
export const EMPTY_VALUE = ''

/** The generation floor of an entry nothing has revoked yet: every generation is at or above it. */
export const NO_GENERATION_FLOOR = 0

/**
 * A `Host` header usable as an origin's authority (RFC 9110 §7.2): a bracketed IPv6 literal or a
 * name / IPv4 address, then an optional port. No userinfo, path, query or fragment. `originOf`
 * also has WHATWG URL parse it, which refuses out-of-range ports and malformed addresses.
 */
export const HOST_AUTHORITY = Object.freeze({
  pattern: Object.freeze(/^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::[0-9]{1,5})?$/),
  hostnameGroup: 1,
  schemeSuffix: '//',
})

/** Text encoding of forms, decoded Basic credentials and hashed values. */
export const TEXT_ENCODING = 'utf8'

/** Opaque values (access tokens): TOKEN_VALUE.opaqueBytes of randomness in this encoding. */
export const OPAQUE_ENCODING = 'base64url'
/** Digest keys of the token store (Fishball 2026-11-14, shared with C-OAUTH-WEB): lowercase hex, WIRE.digestPattern. */
export const DIGEST_ENCODING = 'hex'

/** DSH's route kind for every connector route: exact routes win over DSH's `/api` prefix (S7 §4.4). */
export const ROUTE_KIND = 'exact'

/**
 * In-memory sweep of the sliding-window logs and the access-token and code maps (`swept-map.js`):
 * a full sweep runs once a map's size has doubled since the last one, and never below `floor`, so
 * sweeping stays amortised O(1) per insert while an address-rotating client cannot grow them
 * without bound. Implementation values, not K1 tunables: they change only memory and CPU, never
 * an answer, because every read also checks staleness itself.
 */
export const SWEEP = Object.freeze({ floor: 64, growthFactor: 2 })

/**
 * The durable half of the token store (R-OA-16 (5), Q-S7B-3 A): refresh-token digests and the
 * chains they belong to. One DSH storage domain of the connector, apart from the pair registry and
 * the mailbox, so it has its own write chain. Per-record layout, because every refresh writes one
 * record. Keys must be path-safe (`[A-Za-z0-9_-]+`): a refresh record's key is the digest of the
 * key it was put under, a chain's key is the digest of its chain id (chain ids are C-OAUTH-WEB's and need not be
 * path-safe). Authoritative data, so a record that fails its schema fails the open: losing a
 * revoked chain silently could let `chainsOf` answer `ended` and renew an entry that must not.
 */
export const OAUTH_STORE = Object.freeze({
  domain: 'fishball_oauth',
  version: 1,
  layout: 'per-record',
  table: Object.freeze({ refresh: 'refresh', chains: 'chains' }),
})

/**
 * K1 `RevocationKind`'s one value this module tells apart (index.d.ts `TokenRegistry.onRevoked`).
 * K1 declares the kinds as a type only, with no runtime constant, so the word is named here.
 */
export const REVOCATION_KIND = Object.freeze({ deleted: 'deleted' })

/** The `error` of K1 `BearerVerifier.verify` when no Bearer value was presented (a 401 without `error`). */
export const BEARER_MISSING = 'missing'

/** K1 `ChainsState` (index.d.ts, a type only there): what `OAuthTokenStore.chainsOf` answers. */
export const CHAINS_STATE = Object.freeze({ none: 'none', live: 'live', ended: 'ended', revoked: 'revoked' })

/** Programming-error messages (contract misuse, never shown to a client). */
export const MISUSE = Object.freeze({
  refreshRecord: 'fishball oauth store: refresh record does not match its shape',
  grantType: 'fishball token endpoint: this grant_type cannot be registered (built in, already registered or not supported)',
  handler: 'fishball token endpoint: a grant handler needs a grantType and a handle function',
  grantResult: 'fishball token endpoint: a grant handler returned something that is not a GrantResult',
})

/**
 * The default background log of every factory of this module: drops everything. C-WIRE passes the
 * connector's logger. (C-PAIR keeps its own copy in `../../pairs/store.js`, outside this task.)
 */
export const SILENT_LOGGER = Object.freeze({ warn() {} })

/** Background log lines (never a token value, secret, id or address). */
export const LOG = Object.freeze({
  /** `logger.warn(format, line, diagnostic code)`: the connector's log convention (../../errors.js). */
  format: '%s (%s)',
  grantFailed: 'token endpoint: a grant handler failed',
  revokeFailed: 'oauth store: persisting a revocation failed',
  forgetFailed: 'oauth store: forgetting a deleted entry failed',
  pruneFailed: 'oauth store: pruning an ended chain failed',
  verifyFailed: 'bearer verifier: reading the entry or the pair failed',
  requestFailed: 'token endpoint: reading the request failed',
})
