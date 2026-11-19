/**
 * What a managed session's agent reads when its managing agent rejected its call (spike S35; the
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
import { rootSessionOf } from '../session-info.js'
import { LOG_EVENT, POST_EXECUTE, WORDING } from './constants.js'

const textBlock = (text) => ({ type: 'text', text })
// Session and call id: providers may reuse call ids across sessions (V2 review 2).
const keyOf = (sessionId, callId) => sessionId + WORDING.keySeparator + callId

/** @param ctx - the row's context (host level, so it sees every agent's calls) */
export function createWording(ctx) {
  /** sessionId|callId → {sessionId, toolName, reason} */
  const marks = new Map()

  const disposers = [ctx.on(POST_EXECUTE.event, (exec, result, next) => {
    if (exec.agent === undefined) return next()
    const key = keyOf(rootSessionOf(ctx, exec.agent.id), exec.callId)
    const mark = marks.get(key)
    if (mark === undefined || mark.toolName !== exec.name) return next()
    marks.delete(key)
    return { kind: POST_EXECUTE.block, feedback: [textBlock(WORDING.rejected(mark.reason))] }
  }), ctx.on(LOG_EVENT.sessionEvent, (session, event) => {
    if (event.type !== LOG_EVENT.turnEnd) return
    for (const [key, mark] of [...marks]) if (mark.sessionId === session.id) marks.delete(key)
  })]

  return Object.freeze({
    /** Marks one call (a call with no id cannot be reworded); only a result of `toolName` is rewritten. */
    reject(sessionId, callId, toolName, reason) {
      if (callId !== undefined) marks.set(keyOf(sessionId, callId), { sessionId, toolName, reason })
    },
    close: () => { for (const dispose of disposers.splice(0)) dispose?.() },
  })
}
