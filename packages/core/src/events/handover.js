/**
 * The hand-over rules core uses whenever it gives the Fishball agent a message of its own as one
 * turn (design §6.4; spike V3-S2 `a499141` "hold, don't queue"): the delivery list of events
 * (delivery.js) and the reminders (manager/reminders.js, R-FIX F08). Both hand a message over only
 * inside `runMaintenance` (true idle), remove a copy an earlier process left pending first, follow
 * the agent's live events, and decide an unadmitted claim by how its turn ended. Shared here
 * (`createHandover`) so the two cannot drift apart; each owner keeps only its own record of what
 * it handed over and what an outcome means for it.
 */
import { REASON } from '../../contracts/constants.js'
import { HOST } from './constants.js'

/** claimVerdict's answer for a claim that is handed over again. */
const REDELIVER = Symbol('redeliver')

/**
 * What the end of the turn that claimed a message, before admitting it, means (the user's decision
 * 2026-11-14 1.B; S2-Q3 A; for reminders the user's decision 2026-11-18 "如果被停止了就丢掉").
 * Such a claim reached no model (S2 §2.1 item 5).
 * - owner teardown (`aborted` by `disposed`, which is not the user's decision): deliver again;
 * - a user Stop: discard (S2-Q3 A);
 * - an error, a blocked step, a stop by a parent or a hook, or any other end: discard.
 * @returns {string|symbol} a REASON to discard with, or REDELIVER.
 */
function claimVerdict(end) {
  if (end?.kind === HOST.aborted && end.reason?.kind === HOST.causeDisposed) return REDELIVER
  return end?.kind === HOST.aborted && end.reason?.kind === HOST.causeUser ? REASON.userStopped : REASON.claimTurnEnded
}

/**
 * Runs `job` under the agent's true-idle maintenance and returns its promise, or `undefined` when
 * another owner holds the agent (a turn, or another plugin's maintenance, which emits no status
 * edge); `retry` then runs once the agent is idle again (dsh-agent runMaintenance contract).
 */
function whenTrulyIdle(agent, job, retry) {
  try {
    return agent.runMaintenance(job)
  } catch {
    void agent.whenIdle().then(retry)
    return undefined
  }
}

/**
 * The live half of a hand-over, for one owner (the event delivery, the reminders): it follows each
 * agent the owner hands messages to, all through the agent's public live events (dsh-agent, both
 * SDKs), never its log, and tells the owner what became of each of its messages:
 * - `agent/inbox/claimed`: a turn took the message (it is admitted, or its turn ends next);
 * - `agent/inbox/discarded`: removed from the inbox before admission. Any removal but core's own
 *   stale-copy removal (`handOver`) counts as the user's (events B1, 2026-11-14; R-FIX F11);
 * - `session/event`: the admission (`user/message` with the message id), and the end of a turn that
 *   claimed it without admitting it, decided by `claimVerdict`;
 * - `agent/status` idle: the owner's next hand-over.
 * A message is forgotten here as soon as its outcome is told; the owner keeps its own record.
 * @param {object} owner
 * @param {(messageId: string) => boolean} owner.isMine whether the owner handed this message over
 * @param {(messageId: string) => void} owner.admitted the session admitted it
 * @param {(messageId: string, reason: string) => void} owner.dropped it ended unadmitted (a REASON)
 * @param {(messageId: string) => void} owner.redeliver its claiming turn ended by owner teardown
 * @param {() => void} owner.idle an agent the owner follows became idle
 * @param {() => boolean} owner.closed whether the owner stopped (then nothing is told)
 * @param {(session: object) => unknown} [owner.flush] an optional `session/flush` listener
 */
export function createHandover({ isMine, admitted, dropped, redeliver, idle, closed, flush }) {
  const watched = new WeakSet()
  // messageId → the agent whose turn claimed it and has not admitted it yet.
  const claimed = new Map()
  // Message ids core itself is removing (a stale copy before a hand-over; see `handOver`).
  const removing = new Set()

  function observe(agent, event) {
    const messageId = event.data?.id
    if (event.type === HOST.userMessage && isMine(messageId)) {
      claimed.delete(messageId)
      return admitted(messageId)
    }
    if (event.type !== HOST.turnEnd) return undefined
    const verdict = claimVerdict(event.data?.reason)
    for (const [claimedId, owner] of [...claimed]) {
      if (owner !== agent) continue
      claimed.delete(claimedId)
      if (verdict === REDELIVER) redeliver(claimedId)
      else dropped(claimedId, verdict)
    }
    return undefined
  }

  function watch(agent) {
    if (watched.has(agent)) return
    watched.add(agent)
    const mine = (payload) => !closed() && payload.agent === agent && isMine(payload.message?.id)
    agent.ctx.on(HOST.inboxClaimed, (payload) => { if (mine(payload)) claimed.set(payload.message.id, agent) })
    agent.ctx.on(HOST.inboxDiscarded, (payload) => {
      if (!mine(payload) || removing.has(payload.message.id)) return
      claimed.delete(payload.message.id)
      dropped(payload.message.id, REASON.userStopped)
    })
    agent.ctx.on(HOST.sessionEvent, (session, event) => { if (!closed() && session === agent.session) observe(agent, event) })
    if (flush !== undefined) agent.ctx.on(HOST.sessionFlush, (session) => (session === agent.session ? flush(session) : undefined))
    agent.ctx.on(HOST.agentStatus, ({ status }) => { if (status === HOST.idle && !closed()) idle() })
  }

  return Object.freeze({
    watch,
    /**
     * Hands `message` to `agent` as its own next turn when the agent is truly idle (`runMaintenance`:
     * inside it the followup only latches the wake, and the maintenance release starts the turn that
     * claims it). A copy an earlier process left pending is removed first, as core's own removal, so
     * one id is pending once. Returns the maintenance promise, or `undefined` when the agent was not
     * idle: the owner's `idle` is told when it is again.
     */
    handOver(agent, message) {
      watch(agent)
      return whenTrulyIdle(agent, async () => {
        removing.add(message.id)
        try { agent.inbox.remove(message.id) } finally { removing.delete(message.id) }
        agent.followup(message)
      }, () => { if (!closed()) idle() })
    },
    /** Forget a message's claim (the owner settled it another way). */
    forget: (messageId) => { claimed.delete(messageId) },
  })
}
