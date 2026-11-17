/**
 * The DSH-side ports the V3 modules take for sessions (task C-WIRE): routing's `sessions` source
 * (routing/index.js: `exists`, `onTurnFinished`, `onState` over root session ids), the
 * `sessionExists` port of the hand-over service and of C-EXT's `emit`, and K1d `SessionNotes`.
 * All of them read DSH through the services the V2 domain already uses (session-info.js, the
 * session controller), so no session rule is written twice.
 */
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { diagnosticOf } from '../errors.js'
import { isSessionGone, rootSessionOf, storedRootOf } from '../session-info.js'
import { RUNNING_AGENT } from '../domain/session-port.js'
import { LOG, SESSION_EVENT, SYSTEM_NOTE } from './constants.js'

/**
 * Whether a session of this DSH has that id (TQ-14): a DSH not-found read is the only "no". A
 * non-string or empty id names no session.
 */
export function sessionExistsIn(ctx) {
  return async (sessionId) => typeof sessionId === 'string' && sessionId.length > 0 && !(await isSessionGone(ctx, sessionId))
}

/**
 * Routing's `sessions` source. A subagent's turn or state counts as its root's (K1c keys are root
 * ids), as V2's watches judged it.
 * - `rootOf(id)`: the root Hand over and Take back act on, stopped sessions included
 *   (session-info.js `storedRootOf`; review UI-01), or undefined for no such session;
 * - `onTurnFinished(fn(rootId, {running, queued}))`: after each `turn/end`; `running` is whether
 *   another turn has started already, `queued` whether input waits for the next turn;
 * - `onState(fn(rootId, {running, pendingInteraction}))`: on each agent status change.
 *   `pendingInteraction` is read from DSH's passive state where the SDK has it (0.2.2), false on
 *   0.2.1, as the V2 session port reads it (slim/host/session-port.js `activityOf`).
 * Each subscription is a row event listener, so it ends with the row.
 */
export function createSessionSource(ctx, logger) {
  const exists = sessionExistsIn(ctx)
  const agentOf = (sessionId) => ctx.agents.get(sessionId)
  const runningOf = (sessionId) => agentOf(sessionId)?.status === RUNNING_AGENT
  const queuedOf = (sessionId) => (agentOf(sessionId)?.inbox?.nextTurn?.length ?? 0) > 0

  async function pendingOf(sessionId) {
    if (typeof ctx.sessionController.state !== 'function') return false
    try {
      const passive = await ctx.sessionController.state({ sessionId })
      return Array.isArray(passive?.pendingInput) && passive.pendingInput.length > 0
    } catch (error) {
      logger.warn(LOG.format, LOG.sessionReadFailed, diagnosticOf(error))
      return false
    }
  }

  return Object.freeze({
    exists,
    rootOf: (sessionId) => storedRootOf(ctx, sessionId),
    onTurnFinished(listener) {
      return ctx.on(SESSION_EVENT.sessionEvent, (session, event) => {
        if (event.type !== SESSION_EVENT.turnEnd) return
        // DSH publishes `turn/end` while the agent still reads `running`; its status settles to
        // idle (or, with queued input, to the next turn) after the publication's own tasks, so
        // the facts are read on the next macrotask (observed on both SDKs).
        setImmediate(() => listener(rootSessionOf(ctx, session.id), { running: runningOf(session.id), queued: queuedOf(session.id) }))
      })
    },
    onState(listener) {
      return ctx.on(SESSION_EVENT.agentStatus, ({ agent }) => {
        // `running` is read after the pending read resolves, not from the event, so a slow read
        // that resolves after a later status change reports the agent's status now, never a
        // stale one (two reads may then report the same state; routing commits what it is told).
        void pendingOf(agent.id).then((pendingInteraction) => {
          listener(rootSessionOf(ctx, agent.id), { running: runningOf(agent.id), pendingInteraction })
        })
      })
    },
  })
}

/**
 * K1d `SessionNotes.system(sessionId, note)`: one user message from the connector, sent to the
 * session's agent for its next turn without waking it (W4 Q2 = A: it starts no turn). Rejects for a session DSH does not know (K1d-3), and with DSH's own error when the agent cannot
 * be resolved.
 */
export function createSessionNotes(ctx) {
  return Object.freeze({
    async system(sessionId, note) {
      const resolved = await ctx.sessionController.resolveAgent(sessionId)
      if (resolved.agent === undefined) throw Object.assign(new Error(SYSTEM_NOTE.unknownSession), { code: SYSTEM_NOTE.unknownSession })
      const message = createUserMessage({
        content: [{ type: 'text', text: note }],
        source: { ...SYSTEM_NOTE.source, summary: boundContextSummary(SYSTEM_NOTE.summary) },
      })
      resolved.agent.send(message, SESSION_EVENT.nextTurn, SYSTEM_NOTE.wake)
    },
  })
}
