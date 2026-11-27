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
import { APPROVAL, LOG, LOG_EVENT, POST_EXECUTE, WORDING } from './constants.js'

const textBlock = (text) => ({ type: 'text', text })
// Session and call id: providers may reuse call ids across sessions (V2 review 2).
const keyOf = (sessionId, callId) => sessionId + WORDING.keySeparator + callId

/** @param ctx - the row's context (host level, so it sees every agent's calls) */
export function createWording(ctx, logger) {
  /** sessionId|callId → {sessionId, toolName, text}; automatic marks use the actual session. */
  const marks = new Map()
  const automatic = new Map()

  // A call with no id cannot be reworded; only a result of the same tool is rewritten.
  const markRejection = (table, sessionId, callId, toolName, text) => {
    if (callId !== undefined) table.set(keyOf(sessionId, callId), { sessionId, toolName, text })
  }
  function takeMark(table, sessionId, exec) {
    const key = keyOf(sessionId, exec.callId)
    const mark = table.get(key)
    if (mark?.toolName !== exec.name) return undefined
    table.delete(key)
    return mark
  }

  function sendIncompleteNote(agent, toolName, callId) {
    const { source, summary, target, wake } = WORDING.incompleteNote
    try {
      const feedback = WORDING.incompleteContext(toolName, callId) + ' ' + WORDING.incomplete
      agent.send(createUserMessage({ content: [textBlock(feedback)], source: { ...source, summary: boundContextSummary(summary) } }), target, wake)
    } catch (error) { logger.warn(LOG.format, LOG.incompleteFeedbackFailed, diagnosticOf(error)) }
  }

  const disposers = [ctx.on(POST_EXECUTE.event, (exec, result, next) => {
    if (exec.agent === undefined) return next()
    const auto = takeMark(automatic, exec.agent.id, exec)
    if (auto !== undefined) {
      const info = result.error?.info
      // The host can still cancel a call after our waterfall step returns.
      // Older SDKs do not attach a structured approval code.
      if (exec.signal?.aborted) return next()
      if (!result.isError || (info !== undefined && info.code !== APPROVAL.rejectedErrorCode)) {
        // A tool can ask directly and return its own result. Leave it intact.
        sendIncompleteNote(exec.agent, exec.name, exec.callId)
        return next()
      }
      return { kind: POST_EXECUTE.block, feedback: [textBlock(auto.text)], info }
    }
    const mark = takeMark(marks, rootSessionOf(ctx, exec.agent.id), exec)
    return mark === undefined ? next() : { kind: POST_EXECUTE.block, feedback: [textBlock(mark.text)] }
  }), ctx.on(LOG_EVENT.sessionEvent, (session, event) => {
    if (event.type !== LOG_EVENT.turnEnd) return
    for (const table of [marks, automatic]) {
      for (const [key, mark] of table) if (mark.sessionId === session.id) table.delete(key)
    }
  })]

  return Object.freeze({
    reject: (sessionId, callId, toolName, reason) => markRejection(marks, sessionId, callId, toolName, WORDING.rejected(reason)),
    rejectIncomplete(agent, { callId, toolName, args }) {
      if (args.status === ARGUMENTS_STATUS.truncated) {
        markRejection(automatic, agent.id, callId, toolName, WORDING.incomplete)
        return
      }
      // With no matching logged call, don't risk rewriting a different call's result.
      // Put the guidance in the requesting agent's next step without waking any agent.
      sendIncompleteNote(agent, toolName, callId)
    },
    close: () => { for (const dispose of disposers.splice(0)) dispose?.() },
  })
}
