/**
 * What a managed session's agent reads when the manager or connector rejected its call (spike S35; the
 * V2 result wording as V3 keeps it, C-WIRE-2). DSH's approval outcome carries no text and DSH
 * words a rejection itself ("the user rejected tool X"), so the permission broker marks the call
 * and this ONE host-level `tools/post-execute` listener rewrites that call's result once, as a
 * `block` with the reason. Denied calls pass through post-execute too, and the model and the log
 * get the same text (S35). An allowed call keeps the tool's own output: V2's hint pointed at
 * `ask_agent`, which V3 does not have (the user, 2026-11-17).
 *
 * A call cancelled after its answer may never reach post-execute, so marks also end with the
 * session's turn (S35 risks; no count cap).
 */
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import { ARGUMENTS_STATUS } from '../../mcp-schema/index.js'
import { diagnosticOf } from '../errors.js'
import { rootSessionOf } from '../session-info.js'
import { LOG, LOG_EVENT, POST_EXECUTE, WORDING } from './constants.js'

const textBlock = (text) => ({ type: 'text', text })
// Session and call id: providers may reuse call ids across sessions (V2 review 2).
const keyOf = (sessionId, callId) => sessionId + WORDING.keySeparator + callId

/** @param ctx - the row's context (host level, so it sees every agent's calls) */
export function createWording(ctx, logger) {
  /** sessionId|callId → {sessionId, toolName, text} */
  const marks = new Map()

  // A call with no id cannot be reworded; only a result of the same tool is rewritten.
  const markRejection = (sessionId, callId, toolName, text) => {
    if (callId !== undefined) marks.set(keyOf(sessionId, callId), { sessionId, toolName, text })
  }

  const disposers = [ctx.on(POST_EXECUTE.event, (exec, result, next) => {
    if (exec.agent === undefined) return next()
    const key = keyOf(rootSessionOf(ctx, exec.agent.id), exec.callId)
    const mark = marks.get(key)
    if (mark === undefined || mark.toolName !== exec.name) return next()
    marks.delete(key)
    return { kind: POST_EXECUTE.block, feedback: [textBlock(mark.text)] }
  }), ctx.on(LOG_EVENT.sessionEvent, (session, event) => {
    if (event.type !== LOG_EVENT.turnEnd) return
    for (const [key, mark] of [...marks]) if (mark.sessionId === session.id) marks.delete(key)
  })]

  return Object.freeze({
    reject: (sessionId, callId, toolName, reason) => markRejection(sessionId, callId, toolName, WORDING.rejected(reason)),
    rejectIncomplete(agent, { sessionId, callId, toolName, args }) {
      if (args.status === ARGUMENTS_STATUS.truncated) {
        markRejection(sessionId, callId, toolName, WORDING.incomplete)
        return
      }
      // With no matching logged call, don't risk rewriting a different call's result.
      // Put the guidance in the requesting agent's next step without waking any agent.
      const { source, summary, target, wake } = WORDING.incompleteNote
      try {
        agent.send(createUserMessage({ content: [textBlock(WORDING.incomplete)], source: { ...source, summary: boundContextSummary(summary) } }), target, wake)
      } catch (error) { logger.warn(LOG.format, LOG.incompleteFeedbackFailed, diagnosticOf(error)) }
    },
    close: () => { for (const dispose of disposers.splice(0)) dispose?.() },
  })
}
