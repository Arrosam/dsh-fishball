/**
 * Vocabulary for the F-LINK cases: REM-UC-02 (Fishball side), REM-EP-01, REM-DT-01, the row's
 * definition of done ("core never sends a token to another origin; it refuses plain http: to
 * non-loopback targets itself"), F-FIX-3 (LNK-FIX3-*) and R-FIX-CORE F02–F04 (RFIX-F0*).
 *
 * Every value comes from the requirements (R-FB-03, R-FB-04, R-REM-04, design §4.1 / §6.3 / §9.1)
 * and the frozen contracts: K1, the connector's published MCP surface (vendored as
 * fishball-test-helpers/connector-contract/mcp-schema since the connector left this repository in
 * 6b7c53bf), and core's own K3a copy (core's ./contracts export). The link's log line and reason
 * (F-FIX-3) are imported from core's published ./link export, never restated.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import * as K1 from 'fishball-test-helpers/connector-contract/mcp-schema'
import { LINK, LINK_BACKOFF } from 'fishball-core/contracts'
import { LINK_MCP, LINK_SAVE } from 'fishball-core/link'
import { DSH_RUNTIME } from 'fishball-test-helpers/dsh'

export { K1, LINK, LINK_BACKOFF, LINK_MCP, LINK_SAVE }

/** Core's package folder (this file is packages/core/tests/link/constants.mjs). */
export const CORE_DIR = path.join(import.meta.dirname, '..', '..')

/**
 * Core's target status (K3 TargetState / TargetCode, design §4.1; REM-DT-01) and the answer of a
 * call made while the link is down (design §6.3, CommitSendResult `{ok: false, code: 'disconnected'}`).
 * K1 owns their one runtime copy (DECIDED D7).
 */
export const STATE = K1.TARGET_STATE
export const CODE = K1.TARGET_CODE
export const DISCONNECTED = K1.LINK_REFUSAL.disconnected

/** MCP 2026-07-28 words the cases read in recorded requests (spec vocabulary, not product values). */
export const RPC = Object.freeze({
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  listen: 'subscriptions/listen',
  resourceUpdated: 'notifications/resources/updated',
  legacyInitialize: 'initialize',
  jsonrpc: '2.0',
  protocolHeader: 'mcp-protocol-version',
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
})

/** HTTP words the cases and the fake use. */
export const WEB = Object.freeze({
  bearer: K1.TOKEN_TYPE + ' ',
  temporaryRedirect: 307,
  post: 'POST',
  location: 'location',
})

/**
 * The principal the cases authenticate as (R-FB-04: client id = fishball id, secret = the token).
 * The secrets are generated per run with K1's token shape, so no secret is a literal of this file.
 */
export const token = () => K1.TOKEN_VALUE.generatedPrefix + randomBytes(K1.TOKEN_VALUE.generatedBytes).toString('base64url')
export const PRINCIPAL = Object.freeze({ clientId: 'fbtest-f-link', secret: token(), wrongSecret: token(), entryKey: 'fbtest-f-link-entry' })

/** REM-EP-01 target classes. Host names are the case rows' test data; paths are K1's. */
export const TARGET = Object.freeze({
  /** REM-EP-01 rows 2–4 are exactly K1's loopback names (127.0.0.1, localhost, [::1]): one test each. */
  loopbackRows: '2–4',
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
  approvalId: ANSWER.approvalId, offerId: ANSWER.offerId, kind: K1.DECISION_KIND.approval, prompt: 'run the build',
  choices: Object.freeze([]), title: 'shell', at: 0, toolName: 'bash', callId: null, reason: 'needs approval', quotes: Object.freeze([]),
})
/** REM-UC-02 A1: the user settled the offer in S1 while F was offline. */
export const SETTLEMENT_PAYLOAD = Object.freeze({ approvalId: ANSWER.approvalId, outcome: K1.SETTLEMENT_OUTCOME.allowed, by: K1.SETTLED_BY.user })
/** The offer descriptor of an answerable event (K1 MAILBOX_EVENT_SCHEMA `offer`). */
export const OFFER = Object.freeze({ offerId: ANSWER.offerId, revision: K1.OFFER_ID.firstRevision, decisionKind: K1.DECISION_KIND_OF[K1.EVENT_TYPE.permission] })
/** Tools that would stop or let go of a managed session (REM-UC-02 postcondition: none is called). */
export const STOPPING_TOOLS = Object.freeze([K1.TOOL.sessionStop, K1.TOOL.sessionRelease])

/** Fake mailbox data (test fixtures; K1 fixes only their shapes). */
export const MAILBOX = Object.freeze({ generation: 'g1', digestFill: 'a' })

/**
 * The link module, the one seam between these cases and F-LINK (packages/core/src/link/): its
 * entry is core's published `./link` export; the folder is read for the import rule (done 5).
 */
export const LINK_MODULE = Object.freeze({
  dir: path.join(CORE_DIR, 'src', 'link'),
  entry: path.join(CORE_DIR, 'src', 'link', 'index.js'),
  factory: 'createLink',
})

/**
 * Core's own MCP client (design §5a.1, §9.1; F-LINK done 6): the package core depends on, pinned
 * exactly (REL-PACK's release pin, the manifest's `//dependencies` note: 2.4.0).
 */
export const CLIENT_PIN = Object.freeze({ name: '@modelcontextprotocol/client', version: '2.4.0' })
/**
 * The MCP client the cases hand the link as `sdk`: the copy the current DSH ships (as the old
 * per-SDK suite did: "[DSH x]" runs the link on that DSH's client). Only the F-FIX-3 rows give no
 * `sdk`, so the link loads core's own packaged client through its lazy import.
 */
export const DSH_CLIENT = Object.freeze({ file: path.join(DSH_RUNTIME, '@modelcontextprotocol', 'client', 'dist', 'index.mjs') })

/** The connector's npm name (F-LINK done 5: the link imports nothing from it). */
export const CONNECTOR_PACKAGE = 'dsh-agent-connector'

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
