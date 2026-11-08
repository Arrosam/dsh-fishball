/** Opt-in host-bus observer. No event synthesis, clock override, projection or cache writes. */
import { LIST_ACTIVITY as C } from '../../session-list-activity-data.mjs'

export const name = C.fixture.name
export const inject = ['sessionController', 'workspaceRegistry', 'agents']

export function apply(ctx) {
  const events = []
  ctx.on(C.event, (sessionId, timestamp) => { events.push({ sessionId, timestamp }) })
  let undoFollowup
  let followupFailures = C.counts.none
  ctx.effect(() => () => undoFollowup?.())
  const operations = {
    events: () => events,
    failFollowup({ sessionId, on }) {
      undoFollowup?.()
      undoFollowup = null
      if (!on) return true
      const agent = ctx.agents.get(sessionId)
      const original = agent.followup
      followupFailures = C.counts.none
      agent.followup = () => { followupFailures += C.counts.one; throw new Error(C.probe.followupFailure) }
      undoFollowup = () => { agent.followup = original }
      return true
    },
    followupFailures: () => followupFailures,
    list: () => ctx.sessionController.list({}, new AbortController().signal),
    async pin({ sessionId }) { await ctx.workspaceRegistry.pinSession(sessionId); return true },
    async order({ workspaceId, sessionId, beforeSessionId }) {
      await ctx.workspaceRegistry.get(workspaceId).insertSessionBefore(sessionId, beforeSessionId)
      return true
    },
  }
  const listener = async message => {
    if (message?.type !== C.fixture.request) return
    try {
      const value = await operations[message.op](message.args ?? {})
      process.send({ type: C.fixture.response, id: message.id, ok: true, value })
    } catch (error) {
      process.send({ type: C.fixture.response, id: message.id, ok: false, error: String(error) })
    }
  }
  process.on('message', listener)
  ctx.effect(() => () => process.off('message', listener))
}
