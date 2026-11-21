/**
 * Values of core's target collection (task MULTI-1; PLAN-MULTI §3–§5; MULTI-0 freeze
 * `contracts/targets.d.ts`). The frozen values are `contracts/constants.js` `TARGETS` (ids, keys,
 * credentials, tool names, storage) and `fishball-shared/ui-seam` `SEAM_TARGETS` (states, kinds,
 * routes, refusals); what is here is the module's own: its log lines, its route's HTTP words and
 * the running-sessions read.
 */
import { MCP } from '../../contracts/constants.js'

export const TARGET_LOG = Object.freeze({
  name: 'fishball-core-targets',
  failed: '%s failed (%s)',
  save: 'saving a target record',
  saveBinding: 'saving a tool-name binding',
  forget: 'deleting a removed target\'s token material',
  binding: 'tool %s is not offered: its name is bound to another target or endpoint',
  reconcile: 'reconciling a target\'s ask cards',
  void: 'voiding a retired target\'s ask cards',
  intake: 'taking a polled event',
  page: 'taking a polled page',
  parentDuplicate: 'the instance points the parent at an endpoint an added target already has; both connect to it',
  sessions: 'listing a target\'s running managed sessions',
})

/**
 * A target's running managed sessions (sessions.js):
 * - `listLimit`: the connector's own maximum for `sessions_list` `limit` (K1 `PAYLOAD_LIMITS.sessionsListed`,
 *   100; a larger value is refused `limit-exceeded`, never clamped). One page is all core reads: the
 *   list is the caller's managed root sessions only, so a manager holding more is not expected;
 * - `refreshOn`: the mailbox event types the connector pushes for a managed session whose running
 *   state or management may have changed (agent status, a finished turn, handover, take-back,
 *   retirement); a polled page holding one of them asks for a new list. `state` stays for a
 *   connector before WAKE-REDUCE (dsh-connector 44a414c, 2026-11-21), which no longer produces it;
 * - `refreshAfter`: the connector tools whose answer reports a session as running (WAKE-REDUCE:
 *   "running" is now told by these tools' results, not by an event), so the bridge's answer to
 *   Fishball's own call asks for a new list;
 * - `unexpected`: the code logged for an answer that is neither a success with `sessions` nor a refusal.
 */
export const TARGET_SESSIONS = Object.freeze({
  limitArgument: 'limit',
  listLimit: 100,
  refreshOn: Object.freeze([MCP.eventTypes.state, MCP.eventTypes.turnFinished, MCP.eventTypes.handover, MCP.eventTypes.takeback, MCP.eventTypes.retirement]),
  refreshAfter: Object.freeze([MCP.tools.sessionStart, MCP.tools.sessionMessage, MCP.tools.sessionRedirect, MCP.tools.sessionStop, MCP.tools.sessionRelease]),
  unexpected: 'unexpected-answer',
})

/** The target routes' own HTTP words (the statuses and the unavailable code are `SEAM_TARGETS.http`). */
export const TARGET_HTTP = Object.freeze({
  requestBody: 'buffered',
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  /** The `ConnectBegin` members each outcome carries besides `outcome` (connect.d.ts); any other outcome is not answered. */
  beginMembers: Object.freeze({
    authorized: Object.freeze([]),
    'approval-url': Object.freeze(['url']),
    'needs-configuration': Object.freeze(['code']),
  }),
})

/** Programming errors (TypeError) of the collection's in-process members. */
export const TARGET_MISUSE = Object.freeze({
  record: 'fishball-core targets: malformed target record',
  binding: 'fishball-core targets: malformed tool binding',
})
