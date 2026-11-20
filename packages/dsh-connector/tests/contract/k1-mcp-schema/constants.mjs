/**
 * Vocabulary for the K1 cases: the freeze of `dsh-agent-connector/mcp-schema` (v3-tasks.md row K1,
 * "resolves K flags in AUTH, NAME, EVT, PLAT, WATCH"), read at `test/v3-cases` `b1295de`.
 *
 * Every value comes from docs/planning/v3-requirements.md, from docs/planning/v3-design.md where a
 * requirement defers to it (flag D§n), from the case files of docs/test-design/v3, or from spike
 * V3-S7b (`141ac3b`). None comes from an implementation.
 */
import path from 'node:path'

/** The frozen module, as consumers import it (R-CONN declared the subpath; K1 fills the folder). */
export const SCHEMA_MODULE = Object.freeze({
  specifier: 'dsh-agent-connector/mcp-schema',
  folder: path.join('packages', 'dsh-connector', 'mcp-schema'),
  /** The declaration file that types the internal interfaces (task K1a names it). */
  declarations: 'index.d.ts',
  /** Files whose text carries the module's interfaces (types) and its written freeze record. */
  textFile: /\.(?:(?:c|m)?(?:js|ts)|md)$/,
  /** Code files only (sources and declarations), where the W2 interfaces are typed. */
  codeFile: /\.(?:c|m)?(?:js|ts)$/,
})
/** K2's frozen module: K1 shares its protocol version and the contributed-event prefix (Fishball, 2026-11-12). */
export const TOOLS_SPECIFIER = 'dsh-agent-connector/tools'
/** The connector manifest that carries the pinned SDK versions (K1 row: a change of a pin is a K1 amendment). */
export const CONNECTOR_MANIFEST = path.join('packages', 'dsh-connector', 'package.json')

/** The MCP SDK packages each DSH install carries (2.2.0 on both), the oracle of spec-defined shapes. */
export const MCP = Object.freeze({
  scope: '@modelcontextprotocol',
  client: path.join('@modelcontextprotocol', 'client'),
  core: path.join('@modelcontextprotocol', 'core'),
  clientEntry: path.join('dist', 'index.mjs'),
  coreEntry: path.join('dist', 'index.mjs'),
  ajvEntry: path.join('dist', 'validators', 'ajv.mjs'),
})

/** R-OA-01, design §5.5 (D§5.5): paths on DSH's listener. */
export const PATHS = Object.freeze({ mcp: '/api/agent/mcp', issuer: '/api/agent/oauth', token: '/api/agent/oauth/token' })
/** RFC 9728 / RFC 8414 path-inserted well-known prefixes (R-OA-01); the AS one is cross-checked with the SDK's own builder. */
export const WELL_KNOWN = Object.freeze({ resource: '/.well-known/oauth-protected-resource', server: '/.well-known/oauth-authorization-server', base: 'http://127.0.0.1' })
/** Design §5.5a (D§5.5a): the approval listener serves only these two paths. */
export const APPROVAL_PATHS = Object.freeze({ authorize: '/authorize', decision: '/authorize/decision' })
/** R-EVS-01: the one event resource. */
export const EVENTS_URI = 'dsh-agent://events'
/** R-CON-01 / Q12: the only protocol revision served (K2 froze the same value as TOOLS_API.protocolVersion). */
export const PROTOCOL_VERSION = '2026-07-28'
/** R-OA-04: the two scope values; R-OA-09: the extension `server/discover` advertises. */
const SCOPE_FULL = 'agent'
export const SCOPE = Object.freeze({ full: SCOPE_FULL, pair: 'agent:pair' })
export const CC_EXTENSION = 'io.modelcontextprotocol/oauth-client-credentials'
/** R-ID-06: the 403 `error_description` hints. */
export const SCOPE_HINT = Object.freeze({ notPaired: 'not-paired', idMismatch: 'id-mismatch' })

/** R-OA-01/02 (and S7b §3.2 D1): the metadata lists, compared as sets. */
export const METADATA = Object.freeze({
  grantTypes: Object.freeze(['client_credentials', 'authorization_code', 'refresh_token']),
  responseTypes: Object.freeze(['code']),
  challengeMethods: Object.freeze(['S256']),
  authMethods: Object.freeze(['client_secret_basic', 'client_secret_post', 'none']),
  asScopes: Object.freeze([SCOPE.full, SCOPE.pair]),
  /** RFC 9728 `bearer_methods_supported` (design §5.5 table). */
  bearerMethods: Object.freeze(['header']),
  /** Boolean metadata flags that must be true (R-OA-02). */
  trueFlags: Object.freeze(['client_id_metadata_document_supported', 'authorization_response_iss_parameter_supported']),
  /** A key that must not appear in any exported metadata (R-OA-02, R-OA-13: no dynamic registration). */
  forbiddenKey: /registration_endpoint/,
  /** RFC 9728 `scopes_supported` of the protected resource (R-OA-01): exactly the full scope. */
  resourceScopes: Object.freeze([SCOPE_FULL]),
})

/** OAuth error codes the AUTH cases name (R-OA-03/05/07/14/15/16, R-ID-06, R-TOK-01). */
export const OAUTH_ERRORS = Object.freeze([
  'invalid_client', 'invalid_grant', 'invalid_target', 'invalid_request', 'unsupported_grant_type',
  'unsupported_response_type', 'access_denied', 'invalid_token', 'insufficient_scope',
])
/** R-OA-03, R-TOK-01, R-ID-06: the HTTP status the frozen error mapping gives these codes. */
export const ERROR_STATUS = Object.freeze({ invalid_client: 401, invalid_token: 401, insufficient_scope: 403 })

/**
 * Codes the AUTH and NAME cases show on the page, in a settings refusal or in `pair` / `set_name`
 * results. K1d (design §5.9, requirements 1.27–1.29): `token-duplicate` replaces `ref-duplicate`
 * and value-duplicate; `token-too-short` and `token-unconfigured` are withdrawn (ENTRY_OK below).
 */
export const AUTH_CODES = Object.freeze([
  'already-paired', 'id-taken', 'id-invalid', 'name-taken', 'name-invalid',
  'token-duplicate', 'approval-port-in-use',
])
/** K1d ENTRY_STATUS: the one entry status. */
export const ENTRY_OK = 'ok'
/** Token codes K1d withdrew (design §5.9): none may be exported. */
export const WITHDRAWN_TOKEN_CODES = Object.freeze(['token-too-short', 'token-unconfigured', 'ref-duplicate', 'value-duplicate', 'value-changed'])
/** Core-tool refusal codes the requirements name (R-CON-02, R-CON-06, R-CON-09, R-ID-13, WATCH-UC-01 E1). */
export const TOOL_CODES = Object.freeze([
  'limit-exceeded', 'expired', 'queue-full', 'already-settled', 'forbidden', 'unavailable', 'invalid-arguments',
  'already-paired', 'id-taken', 'name-taken', 'name-invalid',
])

/** R-EVS-02: the fixed event `type` vocabulary (contributed types use K2's prefix). */
export const EVENT_TYPES = Object.freeze([
  'permission', 'question', 'plan-review', 'settlement', 'retirement', 'turn-finished', 'state',
  'message', 'ask', 'handover', 'takeback', 'notice',
])

/**
 * R-CON-02 with the names of design §3.2 (PLAT-EP-02, K: names D§3.2), in tools/list order. The
 * DISCOVERY-TOOLS decision adds workspaces_list and models_list right after sessions_list (22 tools).
 */
export const CORE_TOOLS = Object.freeze([
  'sessions_list', 'workspaces_list', 'models_list', 'session_start', 'session_message', 'session_redirect', 'session_stop', 'session_read', 'session_release',
  'approvals_list', 'approval_answer', 'question_answer', 'prompts_list', 'prompt_answer', 'grants_list', 'grant_revoke',
  'attachment_put', 'attachment_read', 'inbox_poll', 'inbox_ack', 'pair', 'set_name',
])
/** R-WATCH-03 (WATCH-UC-03) and R-EXT-13 (PLAT-EP-02 row 4): never core tools. */
export const ABSENT_TOOLS = Object.freeze(['session_watch', 'session_unwatch', 'watches_list', 'attention_signal'])
export const ABSENT_TOOL_WORDS = /watch|attention/
/**
 * R-WATCH-03: the argument that no longer exists on session_start and session_message (WATCH-UC-01
 * E1). The cases pick those tools, and pair / inbox_poll / inbox_ack, by the module's own TOOL
 * names: selecting a definition is not what they check (CORE_TOOLS is the name oracle).
 */
export const NO_NOTIFY = Object.freeze({ argument: 'notifyWhenFinished' })

/**
 * R-CON-02 / design §3.2: the refusal envelope every output schema admits. Its `code` is any frozen
 * refusal code, taken from the module in the case (`REFUSAL.limitExceeded`).
 */
export const REFUSAL = Object.freeze({ ok: false, message: 'over the limit' })

/** Results of `pair` the requirements spell out (R-ID-03/04/13, R-NAME-06; AUTH-UC-02, NAME-DT-01). */
export const PAIR_RESULT = Object.freeze({
  /** AUTH-UC-02 step 5 and NAME-DT-01 rule 1 (K: `nameAssigned` absent when no name was given). */
  nameless: Object.freeze({ ok: true, paired: true, id: 'agent-a', name: null }),
  /** AUTH-UC-02 A1, NAME-DT-01 rule 2. */
  named: Object.freeze({ ok: true, paired: true, id: 'agent-a', name: 'Agent A', nameAssigned: true }),
  /** NAME-DT-01 rules 3 and 4. */
  refused: Object.freeze(['name-taken', 'name-invalid'].map((nameRefused) => Object.freeze({ ok: true, paired: true, id: 'agent-a', name: null, nameAssigned: false, nameRefused }))),
  /** R-ID-04 / AUTH-UC-04 step 2, without its timestamps (their JSON type is K1's; cases.mjs tries both forms). */
  alreadyPaired: Object.freeze({ ok: false, code: 'already-paired', message: 'already paired', bound: Object.freeze({ idMatches: true, boundId: '123', name: 'Fishball' }) }),
  /** R-ID-13 (with the envelope's message, design §3.2). */
  idTaken: Object.freeze({ ok: false, code: 'id-taken', message: 'id taken' }),
})
/** R-ID-04: `advice` is a fixed text, one per `idMatches` value. */
export const ADVICE = Object.freeze({
  idMatches: 'continue with this token and id only if no other agent uses this id with this token; otherwise use a new token and a new id',
  idMismatch: 'use a new token',
})
/** R-HOST-09 (K1 freezes it): an offer id is `<request>.r<n>`. Request ids of several plausible forms. */
export const OFFER_ID = Object.freeze({
  requests: Object.freeze(['req1', '3f2b8c1e-9d4a-4e7b-8c2f-1a2b3c4d5e6f', 'r_42']),
  revision: (request, n) => `${request}.r${n}`,
  bareRevisionMarker: '.r',
})
/** Two encodings of one instant, for the `pairedAt` / `lastSeenAt` fields whose JSON type is K1's. */
export const INSTANT = Object.freeze({ iso: '2026-11-12T00:00:00.000Z', epochMs: 1794441600000 })

/**
 * Fishball ids (R-ID-02; AUTH-EP-03 rows 1–6, AUTH-BVA-02): 1–64 of `A–Z a–z 0–9 _ -`, no dot.
 * `refused` holds rows 2a, 2b, 3, 4, 5 and 6 (`é`, full-width `ｆｂ`, NUL).
 */
export const IDS = Object.freeze({
  maxChars: 64,
  pad: 'a',
  dot: '.',
  accepted: Object.freeze(['abc', 'Az_09-']),
  refused: Object.freeze(['fb.1', '.fb', 'fb.', '.', 'a b', 'a/b', 'a:b', 'a@b', '\u00e9', '\uff46\uff42', 'a\u0000b']),
})
/** R-NAME-02 / NAME-BVA-01: a name is 1–64 characters after normalisation (K: code points after NFC). */
export const NAME_MAX_CHARS = 64

/**
 * Seconds per unit, for frozen durations: the unit is read from the end of the value's own key,
 * because the project names units in constants (AGENTS.md); a bare number has no unit to compare.
 * Case-sensitive camel/snake forms, so `maxItems` is not read as milliseconds.
 */
export const UNITS = Object.freeze([
  [/(?:[a-z0-9]Ms|_(?:ms|MS)|^ms|[Mm]illis(?:econds)?)$/, 0.001],
  [/(?:[Ss]econds?|[a-z0-9]Sec|_(?:s|S|sec|SEC|SECONDS)|^s)$/, 1],
  [/(?:[Mm]inutes?|_(?:min|MIN|MINUTES))$/, 60],
  [/(?:[Hh]ours?|_(?:h|H|HOURS))$/, 3600],
  [/(?:[Dd]ays?|_(?:d|D|DAYS))$/, 86400],
])
/** Tolerance when comparing a converted duration (ms → s) with its expected value. */
export const SECONDS_EPSILON = 1e-9

/**
 * Frozen durations, in seconds, from the requirements and cases: oracles, so they are kept here and
 * not read from the module (reading them back would make each check compare the module with itself).
 */
export const DURATION_S = Object.freeze({
  accessToken: 3600, // R-OA-07
  code: 60, // R-OA-14, AUTH-BVA-07 (K)
  pending: 600, // R-OA-15, AUTH-BVA-07 (K)
  grace: 10, // R-OA-16 (4a), AUTH-BVA-08 (K)
  retention: 30 * 86400, // R-TOK-05 (30 days)
  lastSeen: 60, // design §5.8 (D§5.8), AUTH-BVA-05 (K)
})
/** R-OA-13 / AUTH-EP-08 (decided per spec: 5 KiB). */
export const CIMD_MAX_BYTES = 5 * 1024
/** AUTH-BVA-06 row 6: the frozen per-client token-request limit lets the stock client's 2 requests per failed call through. */
export const STOCK_TOKEN_REQUESTS_PER_FAILED_CALL = 2
/** TCP port numbers. A fixed default (R-OA-20) is never 0, the "OS picks one" value. */
export const PORT_RANGE = Object.freeze({ min: 1, max: 65535 })
/** design §3.4 (D§3.4): `maxQueuedInputs` default (EVT-BVA-02, K): in the module, or recorded as left to a task. */
export const MAX_QUEUED_DEFAULT = 200
/** K1 row: the internal module interfaces W2 uses, by the words that name them (types in the declaration files). */
export const INTERFACES = Object.freeze([
  ['bearer verifier', /bearer/i], ['token registry', /registry/i], ['pair store', /pair/i],
  ['mailbox commit', /commit/], ['mailbox poll', /poll/i], ['mailbox ack', /ack/i], ['router recipientFor', /recipientFor/],
])
/** Mailbox field names the cases use (EVT-UC-01, EVT-EP-02, EVT-BVA-01, WATCH-UC-01; D§3.3, D§3.4). */
export const FIELDS = Object.freeze({
  event: Object.freeze(['eventId', 'type', 'payloadDigest']),
  summary: Object.freeze(['pending', 'headSequence', 'mailboxGeneration']),
  poll: Object.freeze(['events', 'hasMore', 'resync', 'reason', 'headSequence']),
  turnFinished: Object.freeze(['running', 'queued']),
  pollArgs: Object.freeze(['cursor', 'limit']),
  receipt: Object.freeze({ receipts: Object.freeze([Object.freeze({ eventId: 'e1', payloadDigest: 'd1' })]) }),
})

/**
 * Where a frozen value is found by meaning: the dotted path of an exported leaf must satisfy the
 * predicate. The export names are K1's choice; the cases fix only the values (as in K2).
 */
const has = (...patterns) => (p) => patterns.every((re) => re.test(p))
const lifetime = /lifetime|expir|ttl|valid/i
/**
 * AUTH-ST-05 row K as K1d rewrote it (R-OA-23, 1.32 R14): the chain cap is withdrawn, and the
 * README is the freeze record that says so (the README's "Lifetimes and limits" row).
 */
export const CHAIN_CAP = Object.freeze({ withdrawn: 'refreshChainMaxMs', requirement: 'R-OA-23', withdrawnWord: /withdrawn/i, readme: /README\.md$/ })
export const MEANING = Object.freeze({
  accessToken: has(/access/i, lifetime),
  code: (p) => /code/i.test(p) && lifetime.test(p) && !/pending|request/i.test(p),
  pending: (p) => /pending|request/i.test(p) && lifetime.test(p) && !/code/i.test(p),
  grace: has(/grace|reuse|idempot/i),
  chain: has(/chain/i),
  retention: has(/retention|retain/i),
  lastSeen: has(/last_?seen/i),
  cimd: has(/cimd|metadata_?document|client_?metadata/i),
  cimdTime: has(/cimd|metadata_?document|client_?metadata/i, /timeout|time/i),
  rateWindow: has(/rate|attempt|failure/i, /window/i),
  rate: has(/rate|attempt|failure/i, /token|client|failure|attempt/i),
  approvalPort: has(/approval/i, /port/i),
  page: has(/page|poll/i, /limit|max|size/i),
  body: has(/body/i),
  inFlight: has(/in_?flight/i),
  queued: has(/queued/i),
  nameMax: (p) => /name/i.test(p) && /max|length/i.test(p) && !/tool|event|namespace|public|local/i.test(p),
  offerId: has(/offer/i),
  connected: has(/connected|online/i),
})
/**
 * Task K1a (R-OA-17): ONE failure limit shared by the token endpoint and the approval page. The
 * constant is found by meaning, as every K1 value: its own keys name a per-key ceiling, a
 * per-address ceiling and a window (with a unit), and a string list names the key parts (the
 * remote address and the client id). RATE_LIMITS is named by the requirement itself.
 */
export const FAILURE_LIMIT_MEANING = Object.freeze({
  failure: /fail/i,
  perKey: /key/i,
  perAddress: /address/i,
  window: /window/i,
  keyParts: Object.freeze([/address/i, /client/i]),
  rateConstant: 'RATE_LIMITS',
})
/** K1a: the declarations name the limiter interface with a check and a record-failure member. */
export const FAILURE_LIMITER = Object.freeze({ name: 'FailureLimiter', check: 'check', record: /^record\w*Fail/i })
/** K1a definition of done: C-OAUTH owns the one OAuthTokenStore implementation, durable putRefresh included. */
export const TOKEN_STORE = Object.freeze({ name: 'OAuthTokenStore', owner: 'C-OAUTH', durable: 'putRefresh', implementation: /implementation/i, promise: /^Promise\s*</ })

/** Walk depth into exported data (constant objects are shallow; deeper is schema detail). */
export const WALK_DEPTH = 12

/**
 * Behavioural K decisions with no value of their own. The K1 definition of done: "every K value
 * used by a case is in the module or explicitly left to a task", so each is checked to be recorded
 * in the module's text by its case id (see the K1 case questions).
 */
export const RECORDED = Object.freeze([
  ['AUTH-EP-01', 5, 'the code for a request with no grant_type (unsupported_grant_type or invalid_request)'],
  ['AUTH-EP-01', 6, 'the answer to a GET on the token endpoint (405 proposed)'],
  ['AUTH-EP-02', 11, 'the status for a valid header plus ?access_token= in the query (400 or 401)'],
  ['PLAT-UC-03', 'connected', 'the one "connected" definition (design §3.5, §3.6)'],
  ['AUTH-ST-04', 9, 'a wrong code_verifier: is the code consumed?'],
  ['AUTH-DT-08', 10, 'an empty token field is not counted as a failure'],
  ['AUTH-DT-09', 4, 'when a freed approval port is bound again (next start, or retried)'],
  ['EVT-EP-01', 15, 'which connector notices exist'],
  ['EVT-EP-02', '4–5', 'the codes for an ack of another pair\'s eventId and for a wrong payloadDigest'],
  ['EVT-BVA-01', '5–6', 'limit 0 → limit-exceeded or invalid-arguments; limit LIMIT + 1 → refused or clamped'],
  ['EVT-ST-01', 5, 'is an offer event retired when the user settles the offer?'],
  ['EVT-ST-01', 8, 'a second ack of an acked event is a no-op'],
  ['NAME-EP-01', '11–12', 'name characters are code points; a non-string name is name-invalid or invalid-arguments'],
  ['NAME-BVA-01', 'K', 'name length counts Unicode code points after NFC'],
  ['PLAT-UC-01', 'E5', 'an Mcp-Session-Id header is ignored and creates no session'],
  ['PLAT-BVA-01', 'K', 'a board day is 86400 s and 30 d is the inclusive edge (or left to FEAT-PEERS)'],
  ['PLAT-DT-02', 'K', 'plugin-set-incomplete, and rule 4 reports nothing missing (or left to F-STATUS)'],
])

/**
 * The K1 amendment after W2 that moved module-local limits into K1 (Fishball, 2026-11-14): each
 * `[owner, key, value]` is one constant now defined once in the module, with the value the
 * amendment states. `oldNames` are the local definitions the modules had, which must be gone from
 * packages/dsh-connector/src/ (a no-duplicate check over source text).
 */
const KIB = 1024
export const MOVED_LIMITS = Object.freeze({
  values: Object.freeze([
    Object.freeze(['APPROVAL_LISTENER', 'decisionBodyBytes', 8 * KIB]),
    Object.freeze(['TOKEN_ENDPOINT_LIMITS', 'formBodyBytes', 8 * KIB]),
    Object.freeze(['APPROVAL_LISTENER', 'pendingRequestsMax', 256]),
    Object.freeze(['CIMD_LIMITS', 'cacheEntriesMax', 256]),
    Object.freeze(['RATE_LIMITS', 'tokenRequestsPerAddressPerWindow', 150]),
  ]),
  /** README section that lists every limit. */
  readme: 'README.md',
  section: '### Lifetimes and limits',
  nextSection: /\n#{2,3} /,
  /** The listen-stream cap's 429 reuses the in-flight Retry-After (documented in K1). */
  listenRetry: Object.freeze({ cap: 'ENDPOINT_LIMITS.listenStreamsPerPrincipal', retry: 'REQUEST_GATE.inFlightRetryAfterMs' }),
  /** The old local definitions: a binding of the name (const/let/var/export), or the TOKEN_FORM key. */
  oldNames: Object.freeze(['FORM_LIMITS', 'STATE_CAPS', 'ADDRESS_RATE_LIMIT']),
  oldMember: Object.freeze({ owner: 'TOKEN_FORM', key: 'maxBodyBytes' }),
  source: path.join('packages', 'dsh-connector', 'src'),
  sourceFile: /\.(?:c|m)?js$/,
})

/** Owners of the rows K1 cannot check (v3-tasks.md W2–W4). */
export const LATER = Object.freeze({
  http: 'C-HTTP (MCP route, check order, limits)',
  oauth: 'C-OAUTH (token endpoint, access tokens, 401s)',
  pair: 'C-PAIR (pair store, pair / set_name, names)',
  mailbox: 'C-MAILBOX (ledger, inbox_poll / inbox_ack)',
  route: 'C-ROUTE (recipients, watching is managing)',
  tools: 'C-TOOLS (core tools over MCP)',
  status: 'F-STATUS (core status, plugin-set completeness)',
  board: 'FEAT-PEERS (board retention)',
  intercept: 'K3 (fishballInstance.events.intercept freeze) and F-INTERCEPT',
  adapter: 'C-MCP-ADAPTER (provisional on spike V3-S7c)',
})
