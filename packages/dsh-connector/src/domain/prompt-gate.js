/**
 * The pass-through to the user's stock prompt (spike S33; design §7a.1), shared by the permission
 * broker's three ways to the user: an unmanaged session's call, an escalated offer, and a released
 * or revoked one. DSH's service already captured the asker's signal and both askers pass fresh
 * request objects, so replacing `req.signal` with `AbortSignal.any([original, own])` leaks nothing
 * back. Aborting `own` makes DSH's gateway withdraw the prompt in every browser. If DSH ever
 * freezes the request, S33's fallback re-dispatches the waterfall with a marked copy that owns the
 * signal (the broker's listener passes a marked copy straight on).
 *
 * Each prompt waiting this way is remembered while it shows: `prompts_list` lists those of the
 * caller's sessions that are not its own escalations (the user's answer q7, 2026-11-17: "an
 * escalated prompt is the user's"), and `prompt_answer` answers one. The first settle wins: the
 * user's click (the next answerer's outcome), the agent's `prompt_answer`, or the asker's abort.
 */
import { APPROVAL, REQUEST_ID } from './constants.js'
import { joinSignal, mintId } from './support.js'

/**
 * @param ctx - the row's context (`waterfall`)
 * @param {() => number} now - epoch ms
 */
export function createPromptGate(ctx, now) {
  /** promptId → the prompt (memory only: no call survives a restart, so neither does its prompt). */
  const showing = new Map()
  /** Copies the re-dispatch fallback hands on: the broker's listener passes them straight on. */
  const passing = new WeakSet()

  /** Calls the next answerer with `signal` (S33); undefined when neither way can carry it. */
  function handOn(target, req, next, signal, placed) {
    if (placed) return Promise.resolve().then(next)
    if (target === undefined) return undefined
    const copy = { ...req, signal }
    passing.add(copy)
    return Promise.resolve().then(() => ctx.waterfall(target, APPROVAL.waterfall, copy, () => APPROVAL.outcome.unavailable))
  }

  /** The next answerer, unguarded by our own signal, raced against the asker's abort. */
  function plainNext(next, asker) {
    const answer = Promise.resolve().then(next).then((outcome) => outcome, () => APPROVAL.outcome.unavailable)
    if (asker === undefined) return answer
    return Promise.race([answer, new Promise((resolve) => {
      if (asker.aborted) return resolve(APPROVAL.outcome.cancelled)
      asker.addEventListener('abort', () => resolve(APPROVAL.outcome.cancelled), { once: true })
    })])
  }

  return Object.freeze({
    /** Whether `req` is a copy this gate re-dispatched (the listener then calls `next` at once). */
    isPassing: (req) => passing.has(req),

    /**
     * Shows the stock prompt and resolves with its outcome (a DSH approval outcome).
     * @param via - `{target, req, next}` of the waterfall step
     * @param prompt - `{sessionId, toolName, callId, args, escalated, approvalId?}`: what `prompts_list`
     *   shows; `escalated` hides it from the agent that escalated it, and `approvalId` names the
     *   escalated request, whose manager answers it through `approval_answer` (permissions.js)
     */
    show({ target, req, next }, prompt) {
      const asker = req.signal
      const { own, signal, placed } = joinSignal(req)
      const downstream = handOn(target, req, next, signal, placed)
      if (downstream === undefined) return plainNext(next, asker)
      const promptId = mintId(REQUEST_ID.prompt)
      return new Promise((resolve) => {
        let settled = false
        const finish = (outcome) => {
          if (settled) return false
          settled = true
          showing.delete(promptId)
          asker?.removeEventListener('abort', onAbort)
          own.abort()
          resolve(outcome)
          return true
        }
        const onAbort = () => finish(APPROVAL.outcome.cancelled)
        showing.set(promptId, Object.freeze({ ...prompt, promptId, since: now(), answer: finish }))
        // A failing next answerer is `unavailable`, as DSH maps it.
        downstream.then((outcome) => finish(outcome), () => finish(APPROVAL.outcome.unavailable))
        asker?.addEventListener('abort', onAbort, { once: true })
        if (asker?.aborted) onAbort()
      })
    },

    /** The prompts showing now, oldest first. */
    list: () => [...showing.values()].sort((a, b) => a.since - b.since),

    /** One showing prompt, or undefined. */
    get: (promptId) => showing.get(promptId),
  })
}
