/**
 * Vocabulary for the C-TOOLS cases (v3-tasks.md row C-TOOLS; .runtime/reports/v3-w3-briefs.md
 * "C-TOOLS test brief"): PLAT-UC-02, PLAT-EP-02 (rows 1–6, 4a), PLAT-ST-01 (11-platform.md),
 * WATCH-UC-03, and the rows moved here from C-ROUTE (O8, Q-15): WATCH-UC-01 E1 and WATCH-ST-01
 * rows 7 and 8 (06-watch.md).
 *
 * Every product value is K1's (`dsh-connector/mcp-schema`: TOOLS, TOOL, REFUSAL, PAIR_ONLY,
 * MAILBOX, …) or the V2 contract vocabulary K1 reuses (`dsh-connector/contract`). The MCP
 * error code of an unknown tool comes from the SDK under test (subject.mjs). The rest is fixture
 * data (ids, names, session ids) or the requirement words for the removed V2 tools.
 */
import path from 'node:path'
import { DECISION, RISK } from '../../../../packages/dsh-connector/contract/contract.js'
import {
  EVENT_TYPE, MAILBOX, MANAGED_REFUSAL, PAIR_ADVICE, PAIR_ONLY, PROTOCOL, REFUSAL, RESOURCE, SCOPE, TOOL, TOOL_NAMES, TOOLS, formatOfferId,
  oauthUrls, toolDefinition,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../../support/constants.mjs'

export {
  DECISION, EVENT_TYPE, MAILBOX, MANAGED_REFUSAL, PAIR_ADVICE, PAIR_ONLY, PROTOCOL, REFUSAL, RESOURCE, RISK, SCOPE, TOOL, TOOL_NAMES, TOOLS,
  formatOfferId, oauthUrls, toolDefinition,
}

/**
 * C-TOOLS' "Owns" folder and entry, and C-HTTP's entry (the endpoint the tools are mounted on).
 * FBTEST_C_TOOLS_ENTRY / FBTEST_C_HTTP_ENTRY move them (another checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_TOOLS_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mcp', 'tools', 'index.js'),
  /** The one factory that returns `populate(server, caller)` (subject.mjs states the assumed shape). */
  factory: /^create\w*Tools$/,
  httpEntry: process.env.FBTEST_C_HTTP_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mcp', 'http', 'index.js'),
  gateFactory: 'createRequestGate',
  endpointFactory: 'createMcpEndpoint',
})

/** R-WATCH-03: the V2 watch tools that no longer exist, and the argument that is gone. */
export const REMOVED = Object.freeze({
  watchTools: Object.freeze(['session_watch', 'session_unwatch', 'watches_list']),
  watchWord: /watch/,
  notifyArgument: 'notifyWhenFinished',
  /** R-EXT-13: the attention signal is embed-UI's contributed tool, never a core one. */
  attentionWord: /attention/,
})

/** The session-control tools of PLAT-EP-02 row 1 (R-CON-02: list, start, message, redirect, stop, read, release). */
export const SESSION_CONTROL = Object.freeze([
  TOOL.sessionsList, TOOL.sessionStart, TOOL.sessionMessage, TOOL.sessionRedirect, TOOL.sessionStop, TOOL.sessionRead, TOOL.sessionRelease,
])

/** MCP wire facts the cases rely on [spec: MCP 2026-07-28 tools § Tool Result]. */
export const MCP_RESULT = Object.freeze({ textType: 'text', textBlocks: 1 })

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  /** The fake clock's reference instant (README "clock"). */
  t0: Date.UTC(2026, 10, 14),
  loopback: '127.0.0.1',
  urlBase: 'http://fbtest.invalid',
  clientInfo: Object.freeze({ name: 'fbtest-c-tools', version: '0.0.0' }),
  generation: 1,
  entry: (id) => `fbtest-entry-${id}`,
  /**
   * The bearer value is built from a token-safe label of the id (base64url, RFC 6750 token68), not
   * the raw id: the F6 row's invalid id has spaces, and C-HTTP's FakeVerifier splits the
   * Authorization header on a space, so a raw id would 401 before the tools are reached. The raw
   * id still goes to the verifier's caller and to PairStore.pair (subject.mjs `issue`).
   */
  accessToken: (id) => `fbtest-at-${Buffer.from(id).toString('base64url')}`,
  /** P manages S1; Q is another principal (README fixtures). */
  idP: 'agent-p',
  idQ: 'agent-q',
  nameP: 'Agent P',
  nameQ: 'Agent Q',
  /** A name that is blank after normalisation (name-invalid, R-NAME-02). */
  blankName: '   ',
  /** An id outside `^[A-Za-z0-9_-]{1,64}$` (R-ID-02): the F6 row's client id. */
  invalidId: 'fbtest bad id!',
  /** A root session id of the main DSH. */
  s1: 'fbtest-session-s1',
  folder: '/fbtest-folder',
  title: 'fbtest title',
  message: 'fbtest message',
  reason: 'fbtest reason',
  requestId: 'fbtest-request-1',
  /** session_read bounds (any whole numbers; the domain caps them). */
  maxMessages: 1,
  maxBytes: 1024,
  /** A receipt naming no event of the caller's mailbox (EVT-EP-02 row 4). */
  unknownEventId: 'fbtest-event-unknown',
  zeroDigest: '0'.repeat(64),
  /** An event the world commits to a mailbox, to see `inbox_poll` succeed. */
  messagePayload: Object.freeze({ text: 'fbtest hello', images: Object.freeze([]) }),
})

/** Text that must never appear in a tool result (README common oracle: no stack, no path). */
export const LEAK = Object.freeze({
  stackFrame: /\n\s+at\s/,
  repo: REPO,
})

/** Harness timing only. */
export const WAIT = Object.freeze({ ackMs: 10000 })

/** Owners of the rows C-TOOLS cannot run alone (Fishball's answer to Q2, 2026-11-14). */
export const LATER = Object.freeze({
  firstCommit: 'C-WIRE or the W3 merge: needs C-ROUTE merged, a live offer raised by a real session through the real V2 approvals domain in a DSH host (no child launch here); first-commit-wins is never faked (Fishball Q2)',
  domain: 'C-WIRE or the W3 merge: needs the real V2 session domain in a DSH host process (no child launch here) and its relayed populate port (Fishball Q2)',
  revoke: 'C-REVOKE (revocation: the offer goes to the user card)',
  succeed: 'C-SUCCEED (succession: same request, revision + 1, the old id expired)',
  escalate: 'WD-DECIDE (Watchdog commits escalate)',
  attention: 'U-ATTN (embed-ui.attention.* contributed through C-EXT when embed-UI is present)',
  settings: 'C-WIRE (the connector settings schema: no setting stops delegated items)',
})
