/**
 * The hand-over rules core uses whenever it gives the Fishball agent a message of its own as one
 * turn (design §6.4; spike V3-S2 `a499141` "hold, don't queue"): the delivery list of events
 * (delivery.js) and the reminders (manager/reminders.js, R-FIX F08). Both hand a message over only
 * inside `runMaintenance` (true idle), remove a copy an earlier process left pending first, and
 * decide an unadmitted claim by how its turn ended. Shared here so the two cannot drift apart.
 */
import { REASON } from '../../contracts/constants.js'
import { HOST } from './constants.js'

/** claimVerdict's answer for a claim that is handed over again. */
export const REDELIVER = Symbol('redeliver')

/**
 * What the end of the turn that claimed a message, before admitting it, means (the user's decision
 * 2026-11-14 1.B; S2-Q3 A; for reminders the user's decision 2026-11-18 "如果被停止了就丢掉").
 * Such a claim reached no model (S2 §2.1 item 5).
 * - owner teardown (`aborted` by `disposed`, which is not the user's decision): deliver again;
 * - a user Stop: discard (S2-Q3 A);
 * - an error, a blocked step, a stop by a parent or a hook, or any other end: discard.
 * @returns {string|symbol} a REASON to discard with, or REDELIVER.
 */
export function claimVerdict(end) {
  if (end?.kind === HOST.aborted && end.reason?.kind === HOST.causeDisposed) return REDELIVER
  return end?.kind === HOST.aborted && end.reason?.kind === HOST.causeUser ? REASON.userStopped : REASON.claimTurnEnded
}

/**
 * Runs `job` under the agent's true-idle maintenance and returns its promise, or `undefined` when
 * another owner holds the agent (a turn, or another plugin's maintenance, which emits no status
 * edge); `retry` then runs once the agent is idle again (dsh-agent runMaintenance contract).
 */
export function whenTrulyIdle(agent, job, retry) {
  try {
    return agent.runMaintenance(job)
  } catch {
    void agent.whenIdle().then(retry)
    return undefined
  }
}

/**
 * Core's own removals of a stale pending copy from DSH's inbox. DSH reports every removal as
 * `agent/inbox/discarded`, synchronously; the owner asks `isOwn(id)` in its listener, so its own
 * deduplication is never read as the user's discard (R-FIX F11).
 */
export function createOwnRemovals() {
  const removing = new Set()
  return Object.freeze({
    remove(agent, messageId) {
      removing.add(messageId)
      try { agent.inbox.remove(messageId) } finally { removing.delete(messageId) }
    },
    isOwn: (messageId) => removing.has(messageId),
  })
}
