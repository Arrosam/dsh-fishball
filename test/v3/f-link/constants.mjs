/**
 * Vocabulary for the F-LINK cases (v3-tasks.md row F-LINK; v3-remaining-plan.md W2): REM-EP-01,
 * REM-DT-01 and REM-UC-02 (Fishball side), plus the row's definition of done ("core never sends a
 * token to another origin; it refuses plain http: to non-loopback targets itself").
 *
 * Every value comes from docs/test-design/v3/09-standalone-remote.md, docs/planning/v3-requirements.md
 * (R-FB-03, R-FB-04, R-REM-04), v3-design.md §4.1 / §6.3 / §9.1, and the frozen contracts:
 * K1 `fishball-connector/mcp-schema` (paths, hosts, protocol, tools, OAuth builders) and K3
 * `packages/connector/host-services/child.d.ts` (TargetState, TargetCode). Tunable values are imported
 * from K1, never restated. The link's status words, which K3 types but exports no runtime value for,
 * are imported from F-LINK's one declaration of them (see STATE); no other value comes from an
 * implementation.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { REPO } from '../../support/constants.mjs'
import * as K1 from '../../../packages/connector/mcp-schema/index.js'
import * as CORE_LINK from '../../../packages/core/src/link/constants.js'

export { K1 }

/**
 * Core's target status (K3 child.d.ts `TargetState`, design §4.1; REM-DT-01), its codes (K3
 * `TargetCode`, design §6.1; R-MIG-03 for TARGET_INCOMPATIBLE) and the answer code of a call made
 * while the link is down (design §6.3, K3 events.d.ts `CommitSendResult`: `{ok: false, code:
 * 'disconnected'}`, REM-UC-02 step 3). K3 types these words only; F-LINK declares their one runtime
 * copy (PROPOSED until K-VALUES), so they are imported from it rather than restated.
 */
export const STATE = CORE_LINK.TARGET_STATE
export const CODE = CORE_LINK.TARGET_CODE
export const DISCONNECTED = CORE_LINK.LINK_REFUSAL.disconnected

/** MCP 2026-07-28 method names the fake connector answers (spec vocabulary, not product values). */
export const RPC = Object.freeze({
  discover: 'server/discover',
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  listen: 'subscriptions/listen',
  acknowledged: 'notifications/subscriptions/acknowledged',
  resourcesRead: 'resources/read',
  resourcesList: 'resources/list',
  legacyInitialize: 'initialize',
  jsonrpc: '2.0',
  /** 2026-07-28: every result carries `resultType`; a finished one is `complete`. */
  resultComplete: 'complete',
  protocolHeader: 'mcp-protocol-version',
  /** The 2026-07-28 `_meta` key naming the listen request a notification belongs to. */
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
  /** JSON-RPC 2.0 error codes (spec). */
  parseError: -32700,
  methodNotFound: -32601,
})

/** HTTP and media-type words the fake uses. */
export const WEB = Object.freeze({
  json: 'application/json',
  sse: 'text/event-stream',
  basic: 'Basic ',
  bearer: K1.TOKEN_TYPE + ' ',
  temporaryRedirect: 307,
  accepted: 202,
  post: 'POST',
  get: 'GET',
})

/**
 * The principal the cases authenticate as (R-FB-04: client id = fishball id, secret = the token).
 * The secrets are generated per run with K1's token shape, so no secret is a literal of this file.
 */
export const token = () => K1.TOKEN_VALUE.generatedPrefix + randomBytes(K1.TOKEN_VALUE.generatedBytes).toString('base64url')
export const PRINCIPAL = Object.freeze({ clientId: 'fbtest-f-link', secret: token(), wrongSecret: token() })

/** REM-EP-01 target classes. Host names are the case rows' test data; paths are K1's. */
export const TARGET = Object.freeze({
  /** REM-EP-01 rows 2–4 are exactly K1's loopback names (127.0.0.1, localhost, [::1]): one test each. */
  loopbackRows: '2–4',
  /** Any loopback target, and a second loopback name: a different origin on the same machine. */
  anyLoopback: K1.HOSTS.loopbackNames[0],
  otherLoopback: K1.HOSTS.loopbackNames[1],
  remoteHost: 'b.example',
  privateHost: '192.168.1.5',
  ftpScheme: 'ftp:',
  malformed: 'not a url',
  blank: '',
})
/** `<scheme>//<host>[:port]<mcp path>` for a host. */
export const mcpUrl = (scheme, host, port) => `${scheme}//${host}${port === undefined ? '' : ':' + port}${K1.PATHS.mcp}`

/** An `approval_answer` argument set that fits K1's input schema (REM-UC-02 step 3/4). */
const APPROVAL_ID = 'a1'
export const ANSWER = Object.freeze({
  sessionId: 's1',
  approvalId: APPROVAL_ID,
  offerId: K1.formatOfferId(APPROVAL_ID, K1.OFFER_ID.firstRevision),
  answer: Object.freeze({ decision: 'allow', risk: 'low' }),
})
/** A `permission` payload that fits K1's EVENT_PAYLOAD_SCHEMA (REM-UC-02 precondition: a pending offer). */
export const OFFER_PAYLOAD = Object.freeze({
  approvalId: ANSWER.approvalId,
  offerId: ANSWER.offerId,
  kind: K1.DECISION_KIND.approval,
  prompt: 'run the build',
  choices: Object.freeze([]),
  title: 'shell',
  at: 0,
  toolName: 'bash',
  callId: null,
  reason: 'needs approval',
  quotes: Object.freeze([]),
})
/** REM-UC-02 A1: the user settled the offer in S1 while F was offline. */
export const SETTLEMENT_PAYLOAD = Object.freeze({ approvalId: ANSWER.approvalId, outcome: K1.SETTLEMENT_OUTCOME.allowed, by: K1.SETTLED_BY.user })
/** The offer descriptor of an answerable event (K1 MAILBOX_EVENT_SCHEMA `offer`). */
export const OFFER = Object.freeze({ offerId: ANSWER.offerId, revision: K1.OFFER_ID.firstRevision, decisionKind: K1.DECISION_KIND_OF[K1.EVENT_TYPE.permission] })
/** Tools that would stop or let go of a managed session (REM-UC-02 postcondition: none is called). */
export const STOPPING_TOOLS = Object.freeze([K1.TOOL.sessionStop, K1.TOOL.sessionRelease])

/** Fake mailbox data (test fixtures; K1 fixes only their shapes). */
export const MAILBOX = Object.freeze({ cursor: 'fbtest-cursor', generation: 'g1', digestFill: 'a' })

/**
 * The link module, the one seam between these cases and F-LINK (v3-tasks.md: `packages/core/src/link/`).
 * K1, K2 and K3 freeze no JS entry for it, so the assumed shape is named here once (see link-driver.mjs).
 */
export const LINK = Object.freeze({
  dir: path.join(REPO, 'packages', 'core', 'src', 'link'),
  entry: 'index.js',
  factory: 'createLink',
})

/** Harness waits and polls only; never a product oracle. */
export const HARNESS = Object.freeze({
  settleMs: 20000,
  pollMs: 25,
  /** How long a "nothing happens" check watches before it decides. */
  quietMs: 1500,
  /** A "no value stored" credential reference (R-FB-03): resolveSecret answers undefined. */
  noSecret: null,
  /** Dual-stack wildcard: one fake answers 127.0.0.1, localhost and [::1] on one port. */
  bindHost: '::',
})

/**
 * Design §9.1 / §9.2: core packages its own MCP client, "a packaged copy of the same line" as both
 * hosts' 2.2.0. A line is major.minor; the pin is exact, as K1's SDK_PINS are.
 */
export const CLIENT_PIN = Object.freeze({
  name: '@modelcontextprotocol/client',
  exactVersion: /^\d+\.\d+\.\d+$/,
  line: (version) => version.split('.').slice(0, 2).join('.'),
  nodeModules: 'node_modules',
  manifest: 'package.json',
})

/**
 * Core's vendored copy of K1 (design §9.1) and its generator. The command and the output folder are
 * F-LINK's (packages/core/package.json `//files`): `node scripts/vendor-mcp-schema.mjs [coreDir]`
 * writes `<coreDir>/vendor/`, each file at its path relative to the connector package.
 */
export const VENDOR = Object.freeze({
  generator: path.join(REPO, 'packages', 'core', 'scripts', 'vendor-mcp-schema.mjs'),
  connectorDir: path.join(REPO, 'packages', 'connector'),
  committedDir: path.join(REPO, 'packages', 'core', 'vendor'),
  directory: 'vendor',
  entry: path.join('mcp-schema', 'index.js'),
  tempPrefix: 'fbtest-f-link-vendor-',
  timeoutMs: 60000,
})

/** Rows that need a later task. */
export const LATER = Object.freeze({
  intercept: 'F-INTERCEPT (a polled event, the settlement included, reaches core\'s acceptance ledger and dispatch: no event lost)',
})
