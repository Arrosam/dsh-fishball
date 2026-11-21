/**
 * The judge: one side session per supervised session, on Watchdog's own agent preset `watchdog`
 * (notes 1.24, U8; the user's decision of 2026-11-20). Each judgement is one user message with the
 * whole brief and the new messages (core.js builds it), and the side session's next assistant
 * message is read as one JSON object `{verdict, reason}`.
 *
 * - The side session is created on first use in `<home>/dsh-connector-watchdog/side` and its id is
 *   kept in the brief, so a restart resumes the same conversation.
 * - Judgements of one side session run one after another (a chain per session); the caller's signal
 *   (Stop, `checkTimeoutSeconds`) stops the side turn.
 * - Anything that is not one JSON object with a string `verdict` reads as `{verdict: 'pass'}`.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SIDE, STORE, WATCHDOG } from './constants.js'
import { PASS, parseVerdict } from './verdict.js'

const textOf = (event) => (event.data?.message?.content ?? []).filter((block) => block?.type === SIDE.textBlock).map((block) => block.text).join('')

/**
 * @param ctx - the row's context (`sessionController`, `on`)
 * @param deps.home - the profile home
 * @param deps.store - store.js (the side session id is kept in the brief)
 */
export function createJudge(ctx, { home, store }) {
  const dir = path.join(home, STORE.directory, SIDE.directory)
  const chains = new Map()

  async function sideAgent(brief) {
    if (brief.sideSessionId !== null) {
      const resolved = await ctx.sessionController.resolveAgent(brief.sideSessionId).catch(() => undefined)
      if (resolved?.agent !== undefined) return resolved.agent
    }
    await mkdir(dir, { recursive: true, mode: STORE.directoryMode })
    const { sessionId } = await ctx.sessionController.create({ cwd: dir, agentPreset: WATCHDOG.preset })
    await store.update(brief.sessionId, { sideSessionId: sessionId })
    return (await ctx.sessionController.resolveAgent(sessionId)).agent
  }

  /** Resolves with the side session's next `turn/end`, or rejects when `signal` aborts (the turn is stopped). */
  function turnEnded(sessionId, signal) {
    return new Promise((resolve, reject) => {
      const off = ctx.on(SIDE.sessionEvent, (session, event) => {
        if (session.id !== sessionId || event.type !== SIDE.turnEnd) return
        cleanup()
        resolve()
      })
      const onAbort = () => {
        cleanup()
        void Promise.resolve(ctx.sessionController.cancel({ sessionId })).catch(() => undefined)
        reject(signal.reason)
      }
      const cleanup = () => { off(); signal?.removeEventListener('abort', onAbort) }
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  async function once(brief, prompt, signal) {
    const agent = await sideAgent(store.get(brief.sessionId) ?? brief)
    const sessionId = agent.session.id
    const before = agent.session.snapshotEvents().length
    const ended = turnEnded(sessionId, signal)
    agent.steer(createUserMessage({ content: [{ type: SIDE.textBlock, text: prompt }], source: { kind: SIDE.userSource } }))
    await ended
    const answer = agent.session.snapshotEvents().slice(before).filter((event) => event.type === SIDE.assistantEvent).map(textOf).filter((t) => t !== '').at(-1)
    return answer === undefined ? PASS : parseVerdict(answer)
  }

  return Object.freeze({
    judge(brief, prompt, signal) {
      const run = (chains.get(brief.sessionId) ?? Promise.resolve()).then(() => once(brief, prompt, signal))
      chains.set(brief.sessionId, run.catch(() => undefined))
      return run
    },
  })
}