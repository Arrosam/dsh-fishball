/**
 * The DSH-side ports the V3 modules take for sessions (task C-WIRE): routing's `sessions` source
 * (routing/index.js: `exists`, `rootOf`, `onTurnFinished`, `onState` over root session ids; `rootOf`
 * is what the hand-over service acts on), the `sessionExists` port of C-EXT's `emit`, and K1d
 * `SessionNotes`.
 * All of them read DSH through the services the V2 domain already uses (session-info.js, the
 * session controller), so no session rule is written twice.
 */
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { TURN_FINISHED, TURN_OUTCOME } from '../../mcp-schema/index.js'
import { isSessionGone, rootSessionOf, storedRootOf, textOfEvent } from '../session-info.js'
import { RUNNING_AGENT } from '../domain/session-port.js'
import { byteLength, cutToBytes } from '../text.js'
import { SESSION_EVENT, STOP_TEXT, SYSTEM_NOTE, TURN_END_REASON } from './constants.js'

/**
 * Whether a session of this DSH has that id (TQ-14): a DSH not-found read is the only "no". A
 * non-string or empty id names no session.
 */
export function sessionExistsIn(ctx) {
  return async (sessionId) => typeof sessionId === 'string' && sessionId.length > 0 && !(await isSessionGone(ctx, sessionId))
}

/**
 * `text` bounded to TURN_FINISHED.finalMessageBytes, the marker included when it is cut. Pure.
 * @returns `{text, truncated}`
 */
export function boundedFinalMessage(text) {
  if (byteLength(text) <= TURN_FINISHED.finalMessageBytes) return { text, truncated: false }
  return { text: cutToBytes(text, TURN_FINISHED.finalMessageBytes, TURN_FINISHED.truncationMarker), truncated: true }
}

/** `stop.message` for a turn that ended with `reason` (a DSH TurnEndReason), not completed. */
function stopMessageOf(reason) {
  if (reason?.kind === TURN_END_REASON.error) return STOP_TEXT.error(reason.error)
  if (reason?.kind === TURN_END_REASON.aborted) return STOP_TEXT.aborted(reason.reason)
  return typeof STOP_TEXT[reason?.kind] === 'string' ? STOP_TEXT[reason.kind] : STOP_TEXT.other(String(reason?.kind))
}

/**
 * Routing's `sessions` source. A subagent's turn counts as its root's (K1c keys are root ids).
 * - `rootOf(id)`: the root Hand over and Take back act on, stopped sessions included
 *   (session-info.js `storedRootOf`; review UI-01), or undefined for no such session;
 * - `onTurnFinished(fn(rootId, facts))`: once per **standstill** of a root's agents, after the root's
 *   turn ended. No agent of the tree may be running or holding queued input, and no subagent run
 *   may still be live. Background jobs do not block this report: a deliverable can depend on a
 *   job staying live (for example, a preview server). A turn end before standstill emits nothing;
 *   the next idle status, subagent end or turn end checks again. `facts` is `{outcome, finalMessage?}`
 *   for a completed last turn (`boundedFinalMessage` of its last assistant text) or
 *   `{outcome: stopped, stop: {kind, message}}` for any other end;
 * - `stoppedByManager(rootId)`: the managing agent is stopping the root's turn itself
 *   (session_stop, the cancel of session_redirect): the turn end that follows reports nothing,
 *   because the manager asked for it and already has its own tool result. Since the manager's
 *   stop stops the whole tree (domain/tree-stop.js, the user's decision of 2026-11-21), it also
 *   covers a root turn end already held behind running subagents: the standstill the stop
 *   brings about is the manager's, not a report. The tree stop marks again each notice-only turn
 *   of the stopped work it swallows on the root, so those report nothing either.
 * DESIGN: the pending standstill per root is in memory only. A row reload or a restart loses an
 * unreported one, which is acceptable: no turn of a session survives a restart either.
 * Each subscription is a row event listener, so it ends with the row.
 */
export function createSessionSource(ctx) {
  const exists = sessionExistsIn(ctx)
  /** root id → the last root turn's end not yet reported: `{reason, byManager}`. */
  const pending = new Map()
  /** Roots whose next turn end the manager caused (`stoppedByManager`). */
  const managerStops = new Set()
  /**
   * runId → root id of each subagent run between `subagent/start` and `subagent/end`. A run counts
   * as moving until its end even while its agent reads idle: DSH queues the child's result into
   * its parent (the hand-back turn) only during the child's teardown, after the child's idle edge
   * and before `subagent/end` (dsh-subagent `finishDisposal`), so the idle child alone would show
   * a false standstill in between. The root is resolved from the child's own id (`info.id`, on
   * every SDK; `parentSessionId` exists only from 0.2.2-rc.3) at the start, while the child is
   * attached, and remembered, because the child may be detached by its end.
   */
  const liveRuns = new Map()
  const runsOf = (root) => [...liveRuns.values()].filter((runRoot) => runRoot === root).length

  const rootOf = (sessionId) => rootSessionOf(ctx, sessionId)
  const treeOf = (root) => ctx.agents.list().filter((agent) => agent.id === root || rootOf(agent.id) === root)
  const moving = (agent) => agent.status === RUNNING_AGENT || agent.inbox?.hasPending === true
  const standsStill = (root) => runsOf(root) === 0 && !treeOf(root).some(moving)

  /** The root's last assistant text, or undefined; read from the live session. */
  function finalTextOf(root) {
    const events = ctx.sessions.get(root)?.snapshotEvents() ?? []
    for (let index = events.length - 1; index >= 0; index--) {
      if (events[index].type !== SESSION_EVENT.assistantMessage) continue
      const text = textOfEvent(events[index])
      if (text.length > 0) return text
    }
    return undefined
  }

  function factsOf(root, reason) {
    if (TURN_END_REASON.completedKinds.includes(reason?.kind)) {
      const text = finalTextOf(root)
      return text === undefined ? { outcome: TURN_OUTCOME.completed } : { outcome: TURN_OUTCOME.completed, finalMessage: boundedFinalMessage(text) }
    }
    return { outcome: TURN_OUTCOME.stopped, stop: { kind: String(reason?.kind), message: stopMessageOf(reason) } }
  }

  const listeners = new Set()
  /** Reports each root whose pending end now stands still; a manager's own stop is dropped there. */
  function settle(roots = [...pending.keys()]) {
    for (const root of roots) {
      const end = pending.get(root)
      if (end === undefined || !standsStill(root)) continue
      pending.delete(root)
      if (end.byManager) continue
      const facts = factsOf(root, end.reason)
      for (const listener of [...listeners]) listener(root, facts)
    }
  }
  // DSH publishes `turn/end` and `subagent/end` while the agent still reads `running`; its status
  // settles after the publication's own tasks, so a check runs on the next macrotask (both SDKs).
  const later = (roots) => setImmediate(() => settle(roots))

  function onTurnEnd(session, event) {
    const root = rootOf(session.id)
    // Only the root's own turn decides the outcome; a subagent's turn end is a quiet edge only.
    if (session.id === root) {
      const byManager = managerStops.delete(root)
      pending.set(root, { reason: event.data?.reason, byManager })
    }
    later([root])
  }

  const disposers = []
  function subscribe() {
    disposers.push(ctx.on(SESSION_EVENT.sessionEvent, (session, event) => { if (event.type === SESSION_EVENT.turnEnd) onTurnEnd(session, event) }))
    disposers.push(ctx.on(SESSION_EVENT.agentStatus, ({ agent }) => { if (agent !== undefined) later([rootOf(agent.id)]) }))
    const runRootOf = (info) => rootOf(info.parentSessionId ?? info.id)
    disposers.push(ctx.on(SESSION_EVENT.subagentStart, (info) => {
      if (info?.runId !== undefined && info.id !== undefined) liveRuns.set(info.runId, runRootOf(info))
    }))
    disposers.push(ctx.on(SESSION_EVENT.subagentEnd, (info) => {
      const root = liveRuns.get(info?.runId) ?? (info?.id === undefined ? undefined : runRootOf(info))
      liveRuns.delete(info?.runId)
      later(root === undefined ? undefined : [root])
    }))
  }

  return Object.freeze({
    exists,
    rootOf: (sessionId) => storedRootOf(ctx, sessionId),
    onTurnFinished(listener) {
      if (disposers.length === 0) subscribe()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        for (const dispose of disposers.splice(0)) dispose?.()
      }
    },
    /**
     * Marks the root's next turn end as its manager's, and a root turn end still held behind its
     * running tree (see above). Only a running root's next turn end counts: a stop of an idle
     * session ends no turn, and a stop aimed at a subagent's own session ends no root turn.
     */
    stoppedByManager(sessionId) {
      if (rootOf(sessionId) !== sessionId) return
      const held = pending.get(sessionId)
      if (held !== undefined) held.byManager = true
      if (ctx.agents.get(sessionId)?.status === RUNNING_AGENT) managerStops.add(sessionId)
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
