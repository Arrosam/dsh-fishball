/**
 * Vocabulary for the F-LINK-SAVE black-box cases (USE-CASES.md beside this file): REM-ST-01,
 * REM-UC-04 and the FLS-* EP / DT / BVA rows.
 *
 * Every expected value comes from the requirements relayed in the test brief (R7, R9, R10, R12 = B,
 * R14, Q-LS1 = A), the frozen K3a contract (`packages/core/contracts/link.d.ts`, `connect.d.ts`,
 * `constants.js`: HOSTED_IMPORT, CONNECT, MCP, LINK, LINK_BACKOFF), the relayed F-PAIR words
 * (../identity/constants.mjs RELAYED) and K1's published builders (`dsh-connector/mcp-schema`),
 * which the fake connector speaks. None comes from the code under test. Fixture values (ids, names,
 * the CIMD URL) are test data. No token, code or grant is a literal: the fake generates them.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { CONNECT, HOSTED_IMPORT, LINK, LINK_BACKOFF, MCP } from '../../../../packages/core/contracts/constants.js'
import { IDENTITY, RELAYED } from '../identity/constants.mjs'

export { CONNECT, HOSTED_IMPORT, IDENTITY, K1, LINK, LINK_BACKOFF, MCP, RELAYED }

/** The module under test and the surface the dev session relayed (nothing else of it is read). */
export const SUBJECT = Object.freeze({
  task: 'F-LINK-SAVE',
  entry: path.join(REPO, 'packages', 'core', 'src', 'link', 'index.js'),
  factory: 'createLinkCredentials',
  members: Object.freeze(['credentials', 'connect', 'onChange', 'dispose']),
  connectMembers: Object.freeze(['status', 'onChange', 'begin', 'cancel']),
  /** `ConnectBegin.outcome` (connect.d.ts). */
  outcome: Object.freeze({ authorized: 'authorized', approvalUrl: 'approval-url', needsConfiguration: 'needs-configuration' }),
})

/** The DSH events core reacts to and the test watches (dsh-credentials types.d.ts, both SDKs). */
export const EVENT = Object.freeze({
  referenceUpdated: 'credentials/reference-updated',
  recordUpdated: 'credentials/record-updated',
})

/** OAuth vocabulary (RFC 6749, 7636, 8707, 9207: spec terms) and the fake approval page's form. */
export const OAUTH = Object.freeze({
  responseType: 'response_type',
  clientId: 'client_id',
  clientSecret: 'client_secret',
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
  /** The fake approval page's own form fields and decisions. */
  form: Object.freeze({ request: 'request', token: 'token', name: 'name', decision: 'decision' }),
  decision: Object.freeze({ authorize: 'authorize', cancel: 'cancel' }),
})

/** MCP 2026-07-28 method names the fake answers (spec vocabulary). */
export const RPC = Object.freeze({
  jsonrpc: '2.0',
  discover: 'server/discover',
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  listen: 'subscriptions/listen',
  acknowledged: 'notifications/subscriptions/acknowledged',
  resourcesRead: 'resources/read',
  resourcesList: 'resources/list',
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
  resultComplete: 'complete',
  parseError: -32700,
  methodNotFound: -32601,
  /** SEP-2549: list results carry a cache hint; 0 / private is "never cached". */
  cacheable: Object.freeze({ ttlMs: 0, cacheScope: 'private' }),
})

/** HTTP words the fake uses. */
export const WEB = Object.freeze({
  json: 'application/json',
  sse: 'text/event-stream',
  html: 'text/html; charset=utf-8',
  form: 'application/x-www-form-urlencoded',
  basic: 'Basic ',
  bearer: K1.TOKEN_TYPE + ' ',
  get: 'GET',
  post: 'POST',
  accepted: 202,
  location: 'location',
  wwwAuthenticate: 'www-authenticate',
  /** The loopback callback core listens on (CONNECT.callback.loopbackPath, any OS port). */
  callbackHost: '127.0.0.1',
})

/** Fixture world: core's identity, the user-hosted CIMD URL classes, names, references. */
export const FIXTURE = Object.freeze({
  /** Core's `identity.id` (R-ID-02-valid test data). */
  coreId: 'fbtest-link-save',
  /** The name the owner types on the approval page (REM-UC-04 main 3). */
  pageName: 'Fishball Remote',
  /** R12 = B: the user-hosted CIMD document URL, and its classes (FLS-EP-02, FLS-BVA-02). */
  cimd: Object.freeze({
    valid: 'https://agent.example/fishball-core.json',
    shortestPath: 'https://agent.example/a',
    notHttps: 'http://agent.example/fishball-core.json',
    rootSlash: 'https://agent.example/',
    noPath: 'https://agent.example',
    empty: '',
  }),
  /** A reference the user owns (never written by core, link.d.ts), in DSH's reference grammar. */
  userRef: 'FBTEST_USER_TOKEN',
  /** The two loopback names one dual-stack fake answers under: two different origins (R9). */
  host: Object.freeze({ first: K1.HOSTS.loopbackNames[0], other: K1.HOSTS.loopbackNames[1] }),
  /** Dual-stack wildcard for the fake's web listener; the approval listener stays on 127.0.0.1. */
  bindHost: '::',
  approvalHost: '127.0.0.1',
  /** A path the not-a-connector rows put in the metadata instead of the connector's own. */
  wrong: Object.freeze({ resourcePath: '/api/other/mcp', issuerPath: '/api/other/oauth', scope: 'read', otherOrigin: 'http://localhost:1' }),
  /** R14: a refresh far beyond any plausible chain cap (about ten years). */
  farFutureMs: 10 * 365 * 24 * 60 * 60 * 1000,
  /** A fixed fake-clock start (any value works; fixed so failures read the same). */
  t0: Date.UTC(2026, 10, 16, 0, 0, 0),
  /** The fake mailbox's cursor (K1 fixes only its shape). */
  cursor: 'fbtest-cursor',
  generation: 'g1',
  entryPrefix: 'fbtest-link-save-entry-',
})

/** `<scheme>//<host>:<port><mcp path>` for a loopback target. */
export const mcpUrl = (host, port) => `${K1.HOSTS.loopbackScheme}//${host}:${port}${MCP.paths.mcp}`

/** Harness waits and polls only; never a product oracle. */
export const HARNESS = Object.freeze({
  testMs: 120 * 1000,
  settleMs: 20 * 1000,
  pollMs: 25,
  /** How long a "nothing happens" check watches before it decides. */
  quietMs: 1500,
  /**
   * FLS-BVA-01: the refused-reference retry. LINK_BACKOFF's first waits are 1 s and 2 s, so a
   * window of 3.5 s sees the first try and at most two retries; slack absorbs timer jitter.
   */
  backoffWindowMs: 3500,
  backoffSlackMs: 150,
  /** Token requests closer than this belong to one connection attempt (half of LINK_BACKOFF's first wait). */
  attemptGapMs: LINK_BACKOFF.initialMs / 2,
  tempPrefix: 'fbtest-link-save-',
})
