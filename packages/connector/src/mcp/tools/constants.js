/**
 * Constants of the core MCP tools (task C-TOOLS). Every value of the MCP surface (tool names,
 * schemas, refusal codes, pair-only power) is K1's and is imported from `../../../mcp-schema`;
 * the V2 payload rules (limits, codes) are `../../../contract`'s. This file holds only what is
 * this module's own: which V2 validator checks which tool, the session-access rows, and log lines.
 */
import { OPERATION } from '../../../contract/index.js'
import { REFUSAL, TOOL } from '../../../mcp-schema/index.js'

/**
 * The V2 request validator (contract 1.2 §4, §8) that checks a tool's arguments after K1's input
 * schema: the schema subset cannot express lengths, counts, bytes or "reason required", so those
 * stay V2's domain checks with V2's codes (design §3.2). A tool absent here has no V2 payload rule
 * (inbox, pair, set_name, question_ask).
 */
export const V2_PAYLOAD = Object.freeze({
  [TOOL.sessionsList]: OPERATION.sessionList,
  [TOOL.sessionStart]: OPERATION.sessionStart,
  [TOOL.sessionMessage]: OPERATION.sessionMessage,
  [TOOL.sessionRedirect]: OPERATION.sessionRedirect,
  [TOOL.sessionStop]: OPERATION.sessionStop,
  [TOOL.sessionRead]: OPERATION.sessionRead,
  [TOOL.sessionRelease]: OPERATION.sessionRelease,
  [TOOL.approvalsList]: OPERATION.approvalList,
  [TOOL.approvalAnswer]: OPERATION.approvalAnswer,
  [TOOL.questionAnswer]: OPERATION.questionAnswer,
  [TOOL.questionAnswerOwn]: OPERATION.questionAnswerOwn,
  [TOOL.promptAnswer]: OPERATION.promptAnswer,
  [TOOL.grantRevoke]: OPERATION.grantRevoke,
  [TOOL.attachmentPut]: OPERATION.attachmentPut,
  [TOOL.attachmentRead]: OPERATION.attachmentRead,
})

/**
 * Arguments a V3 tool adds to its V2 payload, removed before the V2 validator runs (it refuses an
 * unknown key). `question_answer` names the offer it answers, as `approval_answer` does (K1 README
 * "Payloads"); V2's question.answer had no offer.
 */
export const V3_ONLY_ARGUMENTS = Object.freeze({
  [TOOL.questionAnswer]: Object.freeze(['offerId']),
})

/**
 * What an unmanaged session answers, by what the tool does with it (sessions.js has the whole
 * table, Fishball's decision 2026-11-14):
 * - `manage`: acting on the session (message, redirect, stop, release, approvals, prompt answer)
 *   is its manager's; unmanaged is `not-managed`, as V2 and K1c `release` say;
 * - `read`: reading (session_read, attachment_read) is its manager's too, and an unmanaged
 *   session is `forbidden` (R-ROUTE-02, 1.23 item 4; Fishball's Q4: only managed sessions are
 *   related, because V3 has no watches).
 */
export const SESSION_ACCESS = Object.freeze({
  manage: Object.freeze({ unmanaged: REFUSAL.notManaged }),
  read: Object.freeze({ unmanaged: REFUSAL.forbidden }),
})

/** Whose a session is, for one caller: ManagedState's manager is the caller, another principal, or nobody. */
export const AUTHORITY = Object.freeze({ mine: 'mine', other: 'other', none: 'none' })

/** The two MCP methods this module answers on the caller's server (dispatch.js says why it owns both). */
export const TOOLS_METHOD = Object.freeze({ list: 'tools/list', call: 'tools/call' })

/** The JSON-RPC -32602 message of an unknown tool. It names no tool: the client knows which it called. */
export const UNKNOWN_TOOL = 'Unknown tool'

/** Background log lines (never an argument, id, name or token). `logger.warn(LOG.format, line, diagnostic)`. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  toolFailed: 'core tools: a tool call failed unexpectedly; answered operation-failed',
  outputInvalid: 'core tools: a domain answer did not fit the tool\'s output schema; answered operation-failed',
  manageFailed: 'core tools: making a started session managed failed; it starts unmanaged',
})
