/** Wire fixture: observe host turn boundaries and gate the fake model, not the connector. */
import { randomUUID } from 'node:crypto'
import { DSH } from '../report/constants.mjs'

const CHILD = Object.freeze({ provider: 'spawn', label: 'fbtest hold root report', delivery: 'caller' })

export function ops({ ctx, model, agentOf }) {
  const holds = (model.holds ??= new Map())
  const children = new Map()
  function release(sessionId) {
    const resume = holds.get(sessionId)
    holds.delete(sessionId)
    resume?.()
  }
  return {
    async turnBoundaries({ sessionId }) {
      const agent = await agentOf(sessionId)
      return agent.session.snapshotEvents()
        .filter(({ type }) => type === DSH.sessionEvent.turnStart || type === DSH.sessionEvent.turnEnd)
        .map(({ type, seq, data }) => ({ type, seq, turn: data.turn, reason: data.reason?.kind }))
    },
    holdModel({ sessionId }) {
      holds.set(sessionId, null)
    },
    modelHeld({ sessionId }) { return typeof holds.get(sessionId) === 'function' },
    releaseModel({ sessionId }) { release(sessionId) },
    async spawnHeldChild({ sessionId }) {
      const childId = randomUUID()
      holds.set(childId, null)
      try {
        const activation = await ctx.subagents.startActivation({
          ...CHILD, childId, parent: await agentOf(sessionId), signal: new AbortController().signal,
          prompt: [{ type: DSH.textBlock, text: CHILD.label }],
        })
        children.set(childId, activation.result)
        return childId
      } catch (error) {
        release(childId)
        throw error
      }
    },
    async finishHeldChild({ sessionId }) {
      release(sessionId)
      try { await children.get(sessionId) } finally { children.delete(sessionId) }
    },
  }
}
