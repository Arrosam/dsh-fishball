/**
 * Constants of the core MCP tools (task C-TOOLS). Every value of the MCP surface (tool names,
 * schemas, refusal codes, pair-only power) is K1's and is imported from `../../../mcp-schema`;
 * the payload bounds are K1's PAYLOAD_LIMITS, checked in payload-rules.js. This file holds only
 * what is this module's own: the session-access rows and log lines.
 */
import { REFUSAL } from '../../../mcp-schema/index.js'

/**
 * What an unmanaged session answers, by what the tool does with it (sessions.js has the whole
 * table, Fishball's decision 2026-11-14):
 * - `manage`: acting on the session (message, redirect, stop, release, approvals, prompt answer)
 *   is its manager's; unmanaged is `not-managed`, as V2 and K1c `release` say;
 * - `read`: reading (session_read, attachment_read) is its manager's too, and an unmanaged
 *   session is `forbidden` (R-ROUTE-02, 1.23 item 4; Fishball's Q4: only managed sessions are
 *   related, because V3 has no watches).
 * Fishball's decision R12 (2026-11-14) confirms the placements: approvals_list acts
 * (`not-managed`), attachment_read reads (`forbidden`).
 */
export const SESSION_ACCESS = Object.freeze({
  manage: Object.freeze({ unmanaged: REFUSAL.notManaged }),
  read: Object.freeze({ unmanaged: REFUSAL.forbidden }),
})

/** Whose a session is, for one caller: ManagedState's manager is the caller, another principal, or nobody. */
export const AUTHORITY = Object.freeze({ mine: 'mine', other: 'other', none: 'none' })

/** The two MCP methods this module answers on the caller's server (dispatch.js says why it owns both). */
export const TOOLS_METHOD = Object.freeze({ list: 'tools/list', call: 'tools/call' })

/** The keys of K1's result envelope itself (envelope.js); a refusal's extra fields never carry them. */
export const ENVELOPE_KEYS = Object.freeze(['ok', 'code', 'message'])

/** The JSON-RPC -32602 message of an unknown tool. It names no tool: the client knows which it called. */
export const UNKNOWN_TOOL = 'Unknown tool'

/** Background log lines (never an argument, id, name or token). `logger.warn(LOG.format, line, diagnostic)`. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  toolFailed: 'core tools: a tool call failed unexpectedly; answered operation-failed',
  outputInvalid: 'core tools: a domain answer did not fit the tool\'s output schema; answered operation-failed',
  manageFailed: 'core tools: making a started session managed failed; it starts unmanaged',
  // The diagnostic is the code itself: a domain constant, never client data.
  unknownCode: 'core tools: a domain refusal carried a code outside K1\'s vocabulary; answered operation-failed',
  contributedFailed: 'core tools: the contributed-tool pipeline threw; answered operation-failed',
})
