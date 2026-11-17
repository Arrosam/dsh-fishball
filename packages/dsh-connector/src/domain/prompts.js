/**
 * Prompts already showing (design §7a.9 as V3 keeps it; task C-WIRE-2): the stock permission
 * prompts the user is being shown, which the prompt gate remembers while they show. The core tools
 * list and answer only those of sessions the caller manages (the user, 2026-11-17: "Agent不能回答
 * 不归自己管的会话，只能操作自己管的会话"); this module leaves out the caller's own escalations (the
 * user's answer q7: "an escalated prompt is the user's"). Answering one never changes who manages
 * the session ("Answering never takes over management").
 */
import { APPROVAL_DECISION, REFUSAL } from '../../mcp-schema/index.js'
import { allowRuleBroken } from './permissions.js'
import { APPROVAL } from './constants.js'

const refused = (code) => Object.freeze({ ok: false, code })
/** `prompt_answer`'s decision as DSH's outcome (allow or reject only). */
const OUTCOME = Object.freeze({ [APPROVAL_DECISION.allow]: APPROVAL.outcome.allowedOnce, [APPROVAL_DECISION.reject]: APPROVAL.outcome.rejected })

/**
 * @param deps.gate - prompt-gate.js
 * @param deps.wording - wording.js
 * @param deps.titleOf - `(sessionId) => Promise<string>`
 */
export function createPrompts({ gate, wording, titleOf }) {
  const open = () => gate.list().filter((prompt) => !prompt.escalated)
  return Object.freeze({
    /** K1 `promptSummary` rows of every open prompt; the core tools keep the caller's. */
    list: () => Promise.all(open().map(async (prompt) => Object.freeze({
      promptId: prompt.promptId, sessionId: prompt.sessionId, title: await titleOf(prompt.sessionId), toolName: prompt.toolName,
      argumentsStatus: prompt.args.status, since: prompt.since, managed: true,
    }))),

    /**
     * Allow or reject one open prompt (allow's rules: low risk, a reason, complete arguments; the
     * payload rules required the reason). The prompt closes, and the session continues.
     * @returns `{ok: true, promptId, decision, managed: true}` or `{ok: false, code}`
     */
    answer({ promptId, decision, risk, reason }) {
      const prompt = open().find((entry) => entry.promptId === promptId)
      if (prompt === undefined) return refused(REFUSAL.expired)
      if (decision === APPROVAL_DECISION.allow) {
        if (risk === undefined) return refused(REFUSAL.riskRequired)
        const broken = allowRuleBroken(risk, reason, prompt.args.status)
        if (broken !== undefined) return refused(broken)
      } else wording.reject(prompt.sessionId, prompt.callId, prompt.toolName, reason.trim())
      // Lost the race (the user clicked, or the call was cancelled, a moment ago): already answered.
      if (!prompt.answer(OUTCOME[decision])) return refused(REFUSAL.expired)
      return Object.freeze({ ok: true, promptId, decision, managed: true })
    },
  })
}
