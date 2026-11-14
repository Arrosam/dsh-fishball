/**
 * Oracles for the K1b rows: the request gate and the grant dispatch frozen in
 * `fishball-connector/mcp-schema` (design §3.1, §5.5, §5.5a, §5.6; 01-auth-pairing.md AUTH-EP-01
 * row 6, AUTH-EP-09; 11-platform.md PLAT-UC-01 E3, PLAT-EP-01, PLAT-BVA-02), with the K1b
 * decisions Fishball relayed on 2026-11-14:
 * - `check(req, surface)` runs before authentication on all three surfaces, in the order 405 →
 *   403 (Host, Origin) → 503 TLS (`{error: "insecure-listener"}`); 405 and 403 have no body, a 405
 *   carries `Allow`; a path the surface does not list skips only the 405 step;
 * - the bearer verifier then answers 401;
 * - `admit(req, surface, caller)` runs after authentication, for `mcp` only, in the order
 *   413 → 429, counted per token entry (`entryKey`), so a pair-only caller is limited too; an
 *   in-flight 429's Retry-After is `REQUEST_GATE.inFlightRetryAfterMs` = 1 s; an open listen
 *   stream holds no in-flight slot;
 * - approval paths have their own methods: `GET /authorize`, `POST /authorize/decision`;
 * - `GrantHandler {grantType, handle(form, ctx)}` returns a token response or an OAuth error, one
 *   of `invalid_request`, `invalid_client`, `invalid_grant`, `invalid_target`; registering a
 *   built-in, duplicate or unsupported grant type throws `TypeError`.
 *
 * Statuses, paths, grants and refusal words are K1's frozen constants: the rows take them from the
 * loaded module by their K1 key names below, never as literals. Only the words K1b adds (export
 * and type names, surfaces, methods, header and form-field names) are oracles here, from the
 * requirements, the RFCs they cite and the names K1b froze in `index.d.ts` (`dev/v3-k1b` 445b1fc).
 */

/** The K1b export names. */
export const K1B_EXPORTS = Object.freeze({
  surface: 'GATE_SURFACE',
  originRule: 'ORIGIN_RULE',
  gate: 'REQUEST_GATE',
  method: 'HTTP_METHOD',
  grantDispatch: 'GRANT_DISPATCH',
})
/** REQUEST_GATE's and GRANT_DISPATCH's fields. */
export const GATE_FIELDS = Object.freeze(['checkOrder', 'admitOrder', 'admitSurfaces', 'routes', 'originRule', 'headers', 'allowSeparator', 'inFlightRetryAfterMs'])
export const DISPATCH_FIELDS = Object.freeze(['formField', 'builtIn'])
/** The K1b declarations in index.d.ts. */
export const K1B_TYPES = Object.freeze([
  'RequestGate', 'GateRequest', 'AdmitRequest', 'CheckRefusal', 'AdmitRefusal', 'GateRefusal',
  'GrantHandler', 'GrantRegistry', 'GrantContext', 'GrantResult', 'TokenForm', 'GrantErrorCode',
])

/** The gate's interface and the names its types are built from. */
export const GATE_TYPE = Object.freeze({
  name: 'RequestGate',
  check: Object.freeze({ name: 'check', params: 2, request: 'GateRequest', surface: 'GateSurface' }),
  admit: Object.freeze({ name: 'admit', params: 3, request: 'AdmitRequest', surface: 'AdmitSurface', caller: 'Caller', bodyBytes: 'bodyBytes' }),
  /** `check`'s surface type names GATE_SURFACE; `admit`'s names REQUEST_GATE.admitSurfaces. */
  surfaceSource: Object.freeze({ check: /\bGATE_SURFACE\b/, admit: /\bREQUEST_GATE\.admitSurfaces\b/ }),
  checkRefusal: 'CheckRefusal',
  admitRefusal: 'AdmitRefusal',
  refusal: 'GateRefusal',
  pass: 'pass',
  status: 'status',
  body: 'body',
  headers: 'headers',
  /** `admit`'s pass hands back the slot it took: the caller calls it when the response ends. */
  done: 'done',
  literal: Object.freeze({ true: 'true', false: 'false', null: 'null' }),
  /** `admit` counts per token entry, so a caller without a binding (pair-only) is admissible. */
  entryKey: 'entryKey',
  boundKey: 'principalKey',
})
/**
 * The refusal decision table, by K1 HTTP_STATUS key: the body and headers each refusal carries,
 * as the K1/K1b constant its type names (`null`: no body; `{}`: no header).
 */
export const REFUSAL_TABLE = Object.freeze({
  [GATE_TYPE.checkRefusal]: Object.freeze([
    Object.freeze({ status: 'methodNotAllowed', body: null, header: 'REQUEST_GATE.headers.allow' }),
    Object.freeze({ status: 'forbidden', body: null, header: null }),
    Object.freeze({ status: 'serviceUnavailable', body: 'HTTP_REFUSAL.insecureListener', header: null }),
  ]),
  [GATE_TYPE.admitRefusal]: Object.freeze([
    Object.freeze({ status: 'payloadTooLarge', body: 'HTTP_REFUSAL.tooLarge', header: null }),
    Object.freeze({ status: 'tooManyRequests', body: 'HTTP_REFUSAL.rateLimited', header: 'RATE_LIMITS.retryAfterHeader' }),
  ]),
})
/** A refusal's `status` type: `typeof HTTP_STATUS.<key>`. */
export const STATUS_TYPE = /^typeof\s+HTTP_STATUS\.(\w+)$/
/** A header-less refusal's headers type: a record of `never`. */
export const NO_HEADERS = /Record<\s*string\s*,\s*never\s*>/
/** A structured limit body: ENDPOINT_LIMITS' JSON-RPC version and code are named by its type. */
export const LIMIT_BODY = Object.freeze({ version: 'ENDPOINT_LIMITS.jsonRpcVersion', code: 'ENDPOINT_LIMITS.jsonRpcCode', id: 'id' })

export const GRANT_TYPE = Object.freeze({
  handler: 'GrantHandler',
  registry: 'GrantRegistry',
  register: 'register',
  grantType: 'grantType',
  grantTypeSource: /\bGRANT\b/,
  handle: Object.freeze({ name: 'handle', params: 2, form: 'TokenForm', context: 'GrantContext' }),
  result: 'GrantResult',
  /** A token response (RFC 6749 §5.1, K1's builder) or an OAuth error (§5.2). */
  tokenBuilder: 'tokenResponse',
  errorField: 'error',
  errorCode: 'GrantErrorCode',
  /** `register` takes no built-in grant type. */
  builtInExcluded: /Exclude<[^>]*GRANT_DISPATCH\.builtIn/,
  /** A grant error code: `typeof OAUTH_ERROR.<key>`. */
  codeType: /^typeof\s+OAUTH_ERROR\.(\w+)$/,
})
/** OAUTH_ERROR keys (K1's names) a grant may answer (Fishball, 2026-11-14). */
export const GRANT_ERROR_KEYS = Object.freeze(['invalidRequest', 'invalidClient', 'invalidGrant', 'invalidTarget'])

/** The three surfaces. */
export const SURFACES = Object.freeze({ mcp: 'mcp', token: 'token', approval: 'approval' })
/** The surfaces `admit` applies to: `mcp` only (C-OAUTH keeps its own limits for the other two). */
export const ADMIT_SURFACES = Object.freeze([SURFACES.mcp])
/** ORIGIN_RULE's keys and the rule of each surface (design §3.1: empty allowlist; R-OA-17: the page's own origin). */
export const ORIGIN_RULES = Object.freeze({
  keys: Object.freeze(['refuseAny', 'ownOnly']),
  bySurface: Object.freeze({ [SURFACES.mcp]: 'refuseAny', [SURFACES.token]: 'refuseAny', [SURFACES.approval]: 'ownOnly' }),
})
/** RFC 9110 §9 method names. */
export const METHODS = Object.freeze({ get: 'GET', post: 'POST' })
/**
 * The method each route allows, by surface; a path is built from K1 PATHS keys (a list is joined:
 * RFC 9728 §3.1 / RFC 8414 §3.1 insert the well-known segment before the resource's path).
 * Design §3.1: MCP is POST only; §5.5: the token endpoint is POST and the two metadata documents
 * are on DSH's listener (C-OAUTH's surface); §5.5a: `GET /authorize`, `POST /authorize/decision`.
 */
export const ROUTES = Object.freeze({
  [SURFACES.mcp]: Object.freeze([[['mcp'], [METHODS.post]]]),
  [SURFACES.token]: Object.freeze([
    [['token'], [METHODS.post]],
    [['protectedResourcePrefix', 'mcp'], [METHODS.get]],
    [['authorizationServerPrefix', 'issuer'], [METHODS.get]],
  ]),
  [SURFACES.approval]: Object.freeze([[['authorize'], [METHODS.get]], [['decision'], [METHODS.post]]]),
})
/** REQUEST_GATE.headers: lower-case header names (Node's request headers); RFC 9110 §10.2.1 `Allow`. */
export const HEADER_NAMES = Object.freeze({ host: 'host', origin: 'origin', allow: 'allow' })
/** RFC 9110 §5.6.1: a list is comma-separated, optional whitespace around the comma. */
export const ALLOW_SEPARATOR = /^[ \t]*,[ \t]*$/
/** The in-flight 429's Retry-After (Fishball, 2026-11-14): 1 s, in K1's TIME_UNIT. */
export const IN_FLIGHT_RETRY_AFTER_S = 1
/** RFC 6749 §4.1.3, §4.4.2, §6: the token form field naming the grant. */
export const GRANT_FORM_FIELD = 'grant_type'
/** GRANT keys (K1's names) of the built-in handler: C-OAUTH's `client_credentials`; C-OAUTH-WEB supplies the others. */
export const BUILT_IN_GRANT_KEYS = Object.freeze(['clientCredentials'])

/**
 * HTTP_STATUS keys (K1's names) of each stage. One MCP request is check → bearer → admit (design
 * §3.1; PLAT-EP-01 rows 1–4: 405, 403, 401, 413).
 */
export const STATUS_KEY = Object.freeze({
  method: 'methodNotAllowed',
  hostOrigin: 'forbidden',
  tls: 'serviceUnavailable',
  bearer: 'unauthorized',
  body: 'payloadTooLarge',
  rate: 'tooManyRequests',
})
export const CHECK_ORDER_KEYS = Object.freeze([STATUS_KEY.method, STATUS_KEY.hostOrigin, STATUS_KEY.tls])
export const ADMIT_ORDER_KEYS = Object.freeze([STATUS_KEY.body, STATUS_KEY.rate])

/** K1 values the K1b constants must take from their K1 owner: each is written once in the module's code. */
export const K1_OWNED = Object.freeze({
  statusKeys: Object.freeze(Object.values(STATUS_KEY)),
  pathKeys: Object.freeze(['mcp', 'issuer', 'token', 'protectedResourcePrefix', 'authorizationServerPrefix', 'authorize', 'decision']),
  refusalKeys: Object.freeze(['insecureListener']),
})
/** The source files searched for restated values (code only; comments are blanked). */
export const CODE_FILE = /\.(?:c|m)?js$/

/** Owners of the behaviour rows (v3-tasks.md W2). */
export const K1B_LATER = Object.freeze({
  http: 'C-HTTP (RequestGate implementation on the MCP route)',
  oauth: 'C-OAUTH (token endpoint over the gate; GrantRegistry)',
})
