/**
 * What a managed session's agent reads after Fishball answered its direct call (DESIGN §7a.4,
 * spike S35, requirements item 12).
 *
 * DSH's approval outcome carries no text (allowed-once / rejected / cancelled / unavailable), and
 * DSH words a rejection itself ("the user rejected tool X"). So the broker marks the call id when
 * Fishball answers, and this ONE host-level `tools/post-execute` listener, the only place Fishball
 * sets wording, rewrites that call's result once and forgets the mark. Denied calls pass through
 * post-execute too, and the model and the session log get the same text (S35).
 * - allowed: the tool's own output with the hint appended (Reading: in the output, because item
 *   12 says the result recommends ask_fishball). Inside run_code (`exec.parent` set) the program
 *   receives the call's value, not its text, so the hint goes in `additionalContexts` instead: a
 *   Fishball notice the agent sees after the run_code result (S35 PTC).
 * - rejected: `block` with Fishball's reason and the hint (also Fishball's answer_prompt reject,
 *   §7a.9: that session is managed from then on, so the hint applies);
 * - your Reject with a note on a direct call's card: `block` with your note, the only way the note
 *   reaches the agent (§7a.4 Reading, S33: DSH's outcome carries no text);
 * - Fishball's question on a direct call: `block` naming the request id, so the agent continues
 *   the same thread with ask_fishball (your answer, Q-r11-direct-reply);
 * - Fishball's own request past maxPendingApprovals: `block` with the too-many-waiting text, so
 *   its call returns at once instead of waiting on a prompt (Q-r11-cap-own, rev11c). One path
 *   for Fishball's own tools and for other plugins' tools in its session alike;
 * - another plugin's tool in Fishball's session whose request became Fishball's card (rev11f,
 *   §7a.11): `block` with the waiting text naming the request (S35 variant A). Fishball's own tools
 *   return that text themselves and are never marked.
 * Inside run_code a block reaches the program as the thrown error's message.
 *
 * A call cancelled after its approval may never reach post-execute, so marks also end with the
 * asking session's turn (S35 risks; no count cap, §16).
 */
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { EVENT, INTAKE_KIND, POST_DECISION, SOURCE, TOO_MANY_WAITING } from './constants.js'
import { authorOf } from './author.js'
import { rootSessionOf } from './session-info.js'
import { waitingText } from './own-requests.js'

/** What Fishball answered for one marked call. */
export const WORDING = Object.freeze({ allow: 'allow', reject: 'reject', userReject: 'user-reject', question: 'question', tooManyWaiting: TOO_MANY_WAITING, waiting: 'waiting' })

/** Agent-visible texts (S35's proposal, kept as the plugin's constants). */
const TEXT = Object.freeze({
  hint: 'Next time, call ask_fishball before a call that needs approval, and explain why it is needed.',
  allowed: 'Fishball approved this call once.',
  rejected: (reason) => `Fishball rejected this call: ${reason}`,
  userRejected: (note) => `The user rejected this call: ${note}`,
  question: (requestId, question) => `Fishball did not run this call yet; it asks a question first (request ${requestId}): ${question}\nAnswer with ask_fishball({request_id: "${requestId}", reply: "…"}); that continues the same request. If Fishball then allows it, make this identical call again.`,
  summary: 'Fishball approved a call once',
  tooManyWaiting: `${TOO_MANY_WAITING}: too many permission requests are waiting for the user, so this call was not made and nothing was asked. Try it again once the user has answered some of them, or withdraw one of your own waiting requests with withdraw_request.`,
})
const SEPARATOR = '\n\n'
const textBlock = (text) => ({ type: 'text', text })

/** Joins session and call id: providers may reuse call ids across sessions (review 2). */
const KEY_SEPARATOR = '|'
const keyOf = (sessionId, callId) => sessionId + KEY_SEPARATOR + callId

export class ResultWording {
  #ctx
  /** sessionId|callId -> { sessionId, toolName, kind: WORDING, reason?, requestId?, question?, note? } */
  #marks = new Map()

  /** @param ctx - fishball row context (host level, so it sees every agent's calls). */
  constructor(ctx) {
    this.#ctx = ctx
    ctx.on(EVENT.postExecute, (exec, result, next) => this.#rewrite(exec, result, next))
  }

  /**
   * Remember Fishball's answer for one call (a call with no id cannot be reworded).
   * @param sessionId - the session the user sees, whose turn end sweeps the mark.
   * @param toolName - the call's tool: only a result of that tool is rewritten.
   */
  mark(callId, sessionId, toolName, mark) {
    if (callId === undefined) return
    this.#marks.set(keyOf(sessionId, callId), { sessionId, toolName, ...mark })
  }

  /** Forget the marks of one session (its turn ended). */
  dropSession(sessionId) {
    for (const [key, mark] of [...this.#marks]) if (mark.sessionId === sessionId) this.#marks.delete(key)
  }

  #rewrite(exec, result, next) {
    if (exec.agent === undefined) return next()
    const key = keyOf(rootSessionOf(this.#ctx, exec.agent.id), exec.callId)
    const mark = this.#marks.get(key)
    if (mark === undefined || mark.toolName !== exec.name) return next()
    this.#marks.delete(key)
    if (mark.kind === WORDING.allow) {
      const notice = `${TEXT.allowed} ${TEXT.hint}`
      if (exec.parent !== undefined) return { kind: POST_DECISION.accept, additionalContexts: [noticeMessage(notice)] }
      return { kind: POST_DECISION.accept, content: [...result.content, textBlock(SEPARATOR + notice)] }
    }
    if (mark.kind === WORDING.waiting) return { kind: POST_DECISION.block, feedback: [textBlock(waitingText(mark.requestId))] }
    if (mark.kind === WORDING.tooManyWaiting) return { kind: POST_DECISION.block, feedback: [textBlock(TEXT.tooManyWaiting)] }
    if (mark.kind === WORDING.userReject) return { kind: POST_DECISION.block, feedback: [textBlock(TEXT.userRejected(mark.note))] }
    if (mark.kind === WORDING.reject) return { kind: POST_DECISION.block, feedback: [textBlock(`${TEXT.rejected(mark.reason)}\n${TEXT.hint}`)] }
    return { kind: POST_DECISION.block, feedback: [textBlock(TEXT.question(mark.requestId, mark.question))] }
  }
}

/** A Fishball notice the agent reads after the run_code result (S35 PTC). */
function noticeMessage(text) {
  return createUserMessage({ content: [textBlock(text)], source: { ...SOURCE.notice, summary: boundContextSummary(TEXT.summary), author: authorOf(INTAKE_KIND.system) } })
}
