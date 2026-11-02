/**
 * S34 fixture: per-session "managed" tools, and stop / redirect of another session's turn.
 *
 * Mechanism under test:
 * - Managed tools are registered in the managed agent's OWN scope layer while it is live, never
 *   globally, so a session the user owns has no trace of them.
 *   owner 'plugin' (default): through a context the PLUGIN owns, tagged with the agent's scope key
 *   (`createScope(pluginCtx, scopeOf(agent.ctx))`), so stopping the plugin removes them too.
 *   owner 'agent': through `agent.ctx.tools.register`, owned by the agent's fiber.
 *   The registry resolves visibility on every view, so the next request sees the change.
 * - `agent/created` re-applies them to every new agent of a managed session (resume,
 *   clear, compaction), because scoped registrations unwind when an agent is disposed.
 * - Stop calls the same in-process method the browser's Stop button reaches over Remote:
 *   `sessionController.cancel({sessionId})` -> `agent.cancel({kind:'user'}, {keepInbox:true})`.
 */
import { hostPkg } from '../harness.mjs'

const { createScope, scopeOf } = await hostPkg('dsh-scope')

export const MANAGED_TOOLS = Object.freeze(['ask_fishball', 'message_fishball', 'list_user_messages'])

const tool = (name, calls) => ({
  name,
  description: 'S34 fixture managed tool ' + name,
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
  async execute(args, exec) { calls.push({ name, session: exec.agent?.id, args }); return name + ' ran' },
})

/**
 * @param c - a host plugin context with `tools`, `agents` and `sessionController` injected.
 * @param options.owner - who owns the scoped registrations: 'plugin' (default) or 'agent'.
 * @param options.subagents - also give the tools to subagents whose root session is managed.
 *   Subagents do not inherit their parent agent's scope layer, so this must be explicit.
 * @returns the control surface Fishball's build would own.
 */
export function createSessionControl(c, { owner = 'plugin', subagents = false } = {}) {
  const managed = new Set()
  /** The session the user sees: a subagent session's header names its parent (as src/session-info.js). */
  const rootOf = (agent) => {
    let header = agent.session.header
    let id = agent.id
    while (subagents && header?.origin === 'subagent' && header.parentSession !== undefined) {
      id = header.parentSession
      header = c.agents.get(id)?.session.header
    }
    return id
  }
  /** Live agent -> disposers of its scoped registrations. */
  const applied = new Map()
  const calls = []
  const apply = (agent) => {
    if (applied.has(agent)) return
    if (owner === 'agent') {
      applied.set(agent, MANAGED_TOOLS.map((name) => agent.ctx.tools.register(tool(name, calls))))
      return
    }
    const scope = createScope(c, scopeOf(agent.ctx))
    // Each register() disposer undoes synchronously; scope.dispose() quiesces asynchronously, and
    // a request assembled before it settles would still list the tools (seen in the first run).
    const undo = MANAGED_TOOLS.map((name) => scope.ctx.tools.register(tool(name, calls)))
    applied.set(agent, [...undo, scope.dispose])
  }
  const remove = (agent) => {
    for (const dispose of applied.get(agent) ?? []) dispose()
    applied.delete(agent)
  }
  c.on('agent/created', ({ agent }) => { if (managed.has(rootOf(agent))) apply(agent) })
  c.on('agent/disposed', ({ agent }) => remove(agent))
  return {
    calls,
    managed,
    connect(sessionId) {
      managed.add(sessionId)
      for (const agent of c.agents.list()) if (rootOf(agent) === sessionId) apply(agent)
    },
    disconnect(sessionId) {
      managed.delete(sessionId)
      for (const agent of [...applied.keys()]) if (rootOf(agent) === sessionId) remove(agent)
    },
    /** Exactly what the Stop button runs on the host. */
    stop(sessionId) { return c.sessionController.cancel({ sessionId }) },
    /** Stop, then queue the instruction as the next turn (it runs once the aborted turn is idle). */
    redirect(sessionId, message) {
      this.stop(sessionId)
      c.agents.get(sessionId).followup(message)
    },
  }
}
