/**
 * CONN-REPORT (connector event reduction and turn-finished; the user's approved requirements of
 * 2026-11-21), the session-source part (B). Product values come only from K1
 * (`dsh-agent-connector/mcp-schema`: TURN_FINISHED, TURN_OUTCOME) and from DSH's own vocabulary as
 * the installed SDKs declare it (dsh-session TurnEndReason, dsh-jobs JobView / JobEvent, the
 * subagent header), restated in DSH below. The interface is the one the lead relayed for
 * src/wire/sessions.js (createSessionSource); no line of its body was read.
 */
import path from 'node:path'
import { REPO } from 'dsh-connector-test-helpers/legacy'
import { TURN_FINISHED, TURN_OUTCOME } from '../../mcp-schema/index.js'

export { TURN_FINISHED, TURN_OUTCOME }

/** The subject: its file and factory, and the members the cases use. */
export const SUBJECT = Object.freeze({
  entry: path.join(REPO, 'packages', 'dsh-connector', 'src', 'wire', 'sessions.js'),
  factory: 'createSessionSource',
  members: Object.freeze(['onTurnFinished', 'stoppedByManager']),
  /** The manager's tree stop (the user's decision of 2026-11-21): stopTree(ctx, root, logger). */
  treeStop: path.join(REPO, 'packages', 'dsh-connector', 'src', 'domain', 'tree-stop.js'),
})

/** DSH's words (dsh-session TurnEndReason, AgentCancelCause; dsh-jobs; dsh-subagent headers; DSH events). */
export const DSH = Object.freeze({
  event: Object.freeze({ session: 'session/event', status: 'agent/status', subagentEnd: 'subagent/end' }),
  sessionEvent: Object.freeze({ turnStart: 'turn/start', turnEnd: 'turn/end', assistant: 'assistant/message', user: 'user/message' }),
  status: Object.freeze({ running: 'running', idle: 'idle' }),
  reason: Object.freeze({
    completed: () => ({ kind: 'completed' }),
    maxTokens: () => ({ kind: 'max-tokens' }),
    error: (code, message) => ({ kind: 'error', error: { code, message } }),
    aborted: (cause) => ({ kind: 'aborted', reason: cause }),
    blocked: () => ({ kind: 'blocked' }),
    interrupted: () => ({ kind: 'interrupted' }),
  }),
  cause: Object.freeze({ user: () => ({ kind: 'user' }), parent: () => ({ kind: 'parent' }), hook: (reason) => ({ kind: 'hook', reason }) }),
  kinds: Object.freeze({ error: 'error', aborted: 'aborted', blocked: 'blocked', interrupted: 'interrupted' }),
  causeWords: Object.freeze({ user: 'user', hook: 'hook' }),
  /** A subagent session's header (origin 'subagent' + parentSession). */
  subagentHeader: (parent) => ({ origin: 'subagent', parentSession: parent }),
  userHeader: () => ({ origin: 'user' }),
  jobs: Object.freeze({ service: 'jobs', running: 'running', stopping: 'stopping', completed: 'completed', killed: 'killed', settled: 'settled', registered: 'registered' }),
  textBlock: 'text',
})

/** Fixture data. */
export const FIXTURE = Object.freeze({
  root: 'fbtest-report-root',
  child: 'fbtest-report-child',
  grandchild: 'fbtest-report-grandchild',
  other: 'fbtest-report-other',
  job: (n) => 'fbtest-job-' + n,
  text: (n) => 'FBTEST-REPORT-FINAL-' + n,
  errorCode: 'FBTEST_FAIL',
  errorMessage: 'fbtest provider failure',
  hookReason: 'fbtest hook said no',
  pad: 'a',
  twoByte: '\u00e9',
  euro: '\u20ac',
  astral: '\u{1F600}',
})

/** Harness timing only: the source checks on setImmediate after each edge; a quiet wait covers several. */
export const WAIT = Object.freeze({ settleMs: 40, testMs: 30000 })
