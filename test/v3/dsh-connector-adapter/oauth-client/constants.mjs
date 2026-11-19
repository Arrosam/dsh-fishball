/**
 * Vocabulary for the C-MCP-ADAPTER black-box cases: the adapter's OAuth client module (moved from
 * `dsh-connector-shared/oauth-client` to `dsh-connector-adapter/src/oauth-client.js` at C-WIRE-2, R-ARCH-08 strict: its only user is the adapter)
 * (this folder) and the adapter `dsh-connector-adapter` (../../dsh-connector-adapter/adapter, which
 * imports these constants so each value is declared once).
 *
 * Every expected value comes from the requirements (R-OA-21, R-OA-13…16, R-TOK-01/04, R-SEC-02),
 * design §5.5a/§5.5b, spike S7c §4/§5, the AUTH-* case rows of docs/test-design/v3/01-auth-pairing.md,
 * the K values the dev session froze (relayed in the test brief), or the real connector's published
 * values (K1, `packages/dsh-connector/mcp-schema`: paths, scope, metadata builders). None comes from
 * the code under test. Fixture values (origins, ids, markers) are test data, not product values.
 */
import os from 'node:os'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'

export { K1 }

/** The two SDKs every case runs on (R-OA-21 rule 11, R-COMPAT-01). */
export const SDK = Object.freeze({
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  nodeModules: 'node_modules',
  /** The MCP SDK the caller hands the library (2.2.0 on both hosts; brief "Library module"). */
  mcpClient: Object.freeze({ name: '@modelcontextprotocol/client', entry: path.join('dist', 'index.mjs') }),
})

/** DSH's own packages the in-process host is composed from (both SDKs). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  credentials: '@deepseek-ai/dsh-credentials',
  credentialsLocal: '@deepseek-ai/dsh-credentials-local',
  authorization: '@deepseek-ai/dsh-authorization',
  launchEnvironment: '@deepseek-ai/dsh-launch-environment',
  systemPrompt: '@deepseek-ai/dsh-system-prompt',
  tools: '@deepseek-ai/dsh-tools',
  mcpClient: '@deepseek-ai/dsh-mcp-client',
  /** dsh-launch-environment's inherited-environment layer. */
  processLayer: 'process',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so nothing logged is missed. */
  allLevels: 3,
  /** R-OA-21 rule 9 / S7c S1: the credential file's mode. */
  fileMode: 0o600,
  modeBits: 0o777,
})

/** K values frozen by the adapter contract (S7c plan step K1, relayed). */
export const K = Object.freeze({
  leadMs: 300 * 1000,
  timeoutMs: 600 * 1000,
  bodyCapBytes: 8 * 1024 * 1024,
  minRefreshDelayMs: 1000,
  bearerBytes: 32,
  /** R-OA-15: the connector's pending lifetime, TIMEOUT's upper bound (AUTH-BVA-09 row 8). */
  pendingLifetimeMs: K1.LIFETIME.pendingRequestMs,
  /** R-OA-07/16: `expires_in` of every access token, in ms. */
  accessTokenMs: K1.LIFETIME.accessTokenMs,
  /** One clock step at a boundary. */
  tickMs: 1,
  /** S2 (Fishball's review decision, 2026-11-16): every outbound OAuth request's deadline. */
  requestTimeoutMs: 30 * 1000,
  /** S1: Node's largest timer delay (2^31 − 1 ms); a longer refresh delay is clamped to it. */
  maxTimerMs: 2 ** 31 - 1,
  msPerSecond: 1000,
})

/** The library under test and the surface the brief relays (nothing else of it is read). */
export const LIBRARY = Object.freeze({
  task: 'C-MCP-ADAPTER',
  // R-ARCH-08 strict (C-WIRE-2): the module's only user is the adapter, so it lives there.
  entry: path.join(REPO, 'packages', 'dsh-connector-adapter', 'src', 'oauth-client.js'),
  /** `isGrantFor` joined with review decision B2 (2026-11-16). */
  exports: Object.freeze(['clientMetadataUrlProblem', 'discoverServer', 'createTokenManager', 'accessTokenOf', 'isGrantFor', 'OAuthAttemptError', 'OAUTH_CLIENT']),
  managerMembers: Object.freeze(['read', 'authorize', 'refresh', 'dropTokens', 'refreshDueInMs']),
  /** `clientMetadataUrlProblem` answers. */
  problem: Object.freeze({ missing: 'missing', invalid: 'invalid' }),
  /** `OAUTH_CLIENT`, as relayed. */
  constants: Object.freeze({ callbackPath: '/callback', loopbackHost: '127.0.0.1', grantVersion: 1, requestTimeoutMs: K.requestTimeoutMs }),
  attemptEnd: Object.freeze({ denied: 'denied', rejected: 'rejected', expired: 'expired', failed: 'failed' }),
  refreshOutcome: Object.freeze({ refreshed: 'refreshed', declined: 'declined', invalidGrant: 'invalid-grant', noRefreshToken: 'no-refresh-token' }),
  /** The grant record's kind (dsh-credentials GrantRecord). */
  recordKind: 'grant',
})

/** OAuth vocabulary (RFC 6749, 7636, 8707, 9207; spec terms, not product values). */
export const OAUTH = Object.freeze({
  responseType: 'response_type',
  clientId: 'client_id',
  redirectUri: 'redirect_uri',
  state: 'state',
  scope: 'scope',
  resource: 'resource',
  codeChallenge: 'code_challenge',
  codeChallengeMethod: 'code_challenge_method',
  code: 'code',
  codeVerifier: 'code_verifier',
  iss: 'iss',
  error: 'error',
  grantType: 'grant_type',
  refreshToken: 'refresh_token',
  clientSecret: 'client_secret',
  /** EP-13 row 3: the only parameters an approval URL may carry. */
  urlParams: Object.freeze(['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource']),
  /** Path fragments a dynamic registration would use (RFC 7591); none may ever be requested. */
  registrationPath: 'register',
  /** The form fields of the approval page the scripted browser posts (fake connector's own form). */
  form: Object.freeze({ request: 'request', token: 'token', agentId: 'agent_id', name: 'name', decision: 'decision' }),
  decision: Object.freeze({ authorize: 'authorize', cancel: 'cancel' }),
})

/** MCP 2026-07-28 vocabulary the fake connector speaks (spec terms). */
export const RPC = Object.freeze({
  jsonrpc: '2.0',
  discover: 'server/discover',
  initialize: 'initialize',
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  listen: 'subscriptions/listen',
  acknowledged: 'notifications/subscriptions/acknowledged',
  resourceUpdated: 'notifications/resources/updated',
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
  resultComplete: 'complete',
  legacyVersion: '2025-11-25',
  parseError: -32700,
  methodNotFound: -32601,
  /** SEP-2549: list results carry a cache hint; 0 / private is "never cached". */
  cacheable: Object.freeze({ ttlMs: 0, cacheScope: 'private' }),
})

/** HTTP words used by the fakes and the raw proxy requests. */
export const WEB = Object.freeze({
  json: 'application/json',
  sse: 'text/event-stream',
  html: 'text/html; charset=utf-8',
  form: 'application/x-www-form-urlencoded',
  bearer: K1.TOKEN_TYPE + ' ',
  get: 'GET',
  post: 'POST',
  accepted: 202,
  ok: 200,
  seeOther: 303,
  temporaryRedirect: 307,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  methodNotAllowed: 405,
  serverError: 500,
  clientErrorMin: 400,
  clientErrorMax: 499,
  successMax: 299,
  authorization: 'authorization',
  wwwAuthenticate: 'www-authenticate',
  location: 'location',
})

/**
 * Fixture world (AUTH section "Connector adapter" fixtures, through the 1.41 renames): the CIMD
 * the user hosts, the non-DSH server's origin, the id typed on the approval page.
 */
export const FIXTURE = Object.freeze({
  cimd: 'https://agent.example/fb-adapter.json',
  clientName: 'fbtest adapter',
  loopback: '127.0.0.1',
  /** A fixed fake-clock start (any value works; fixed so failures read the same). */
  t0: Date.UTC(2026, 10, 16, 0, 0, 0),
  /** The fishball id the owner types on the approval page (AUTH-UC-12 step 4). */
  agentId: 'dsh-n',
  /** The non-DSH OAuth MCP server (AUTH-UC-14), reached only through the injected fetch. */
  other: Object.freeze({
    origin: 'https://other.example',
    mcpPath: '/mcp',
    issuerPath: '/oauth',
    scopes: Object.freeze(['read']),
    authorizePath: '/authorize',
    tokenPath: '/token',
    registerPath: '/register',
  }),
  /** Paths the DT-11 rules put in the metadata in place of the connector's own. */
  wrong: Object.freeze({ resourcePath: '/api/agent/other', issuerPath: '/api/agent/other-oauth', mcpPath: '/mcp' }),
  /** X-SEC X-05: where a 307 from the token endpoint points (a path the fake never serves). */
  redirectedTokenPath: '/fbtest-redirected-token',
  /** The library cases' own credential key scope (any plugin-shaped segment). */
  libraryKeyScope: 'fbtest-oauth-client',
  serverId: (serverName) => 'server-' + Buffer.from(serverName, 'utf8').toString('hex'),
  flowMethod: Object.freeze({ id: 'browser', label: 'Browser' }),
  message: 'fbtest: open the approval page in your browser and enter a connector token',
  tempPrefix: 'fbtest-oauth-client-',
  /**
   * S1 BVA on the token lifetime against LEAD (300 s): `expires_in` one second below, at and above
   * it, and one far beyond Node's 24.8-day timer bound (a lifetime of about 31.7 years).
   */
  expiresInS: Object.freeze({ belowLead: 299, atLead: 300, aboveLead: 301, huge: 1e9 }),
  /** B1: a request line whose target is not a parseable URL. */
  badRequestLine: 'GET // HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n',
  /** B2: grant payload versions that do not count. */
  otherGrantVersion: 2,
})

/** Every planted secret starts with this marker and names its class, so a sweep finds it by text. */
export const MARK = Object.freeze({
  prefix: 'FBTESTSECRET',
  connectorToken: 'connector',
  access: 'at',
  refresh: 'rt',
  code: 'code',
  randomBytes: 18,
})

/** Harness waits and polls only; never a product oracle. */
export const WAIT = Object.freeze({
  testMs: 120 * 1000,
  eventuallyMs: 15 * 1000,
  quietMs: 700,
  /** A timer callback count in one `advance` that can only be a spin (S1 "no tight timer loop"). */
  maxTimerFires: 200,
  /** S2: real-time slack around the 30 s request deadline. */
  deadlineSlackMs: 1500,
  deadlineCeilingMs: 10 * 1000,
  pollMs: 20,
  settleMs: 40,
})

/**
 * Review-fix rows (R-FIX-ADAPTER; review-x-dsh-connector-adapter.md findings F1–F8). Fixture data:
 * a grant bound to another upstream under the same key (F1), the case-id prefix of the new rows.
 */
export const REVIEW_FIX = Object.freeze({
  libraryId: (finding) => 'OAC-FIX-' + finding,
  adapterId: (finding) => 'ADP-FIX-' + finding,
  /** Another connector's server URL, written over the record of this key (F1); never contacted. */
  foreignUpstream: 'https://foreign.example/api/agent/mcp',
})
