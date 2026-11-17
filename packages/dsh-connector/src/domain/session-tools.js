/**
 * The one connector tool a managed session has: `message_agent` (task C-WIRE-2; R-CON-08 as the
 * user amended it, 2026-11-17: "不给ask_agent工具", and `list_user_messages` is deleted). It goes to
 * the session's managing agent (routing `messageAgent`), connected or not.
 *
 * Tools per session (spike S34, the V2 ManagedRegistry's mechanism): the tool is registered in each
 * managed agent's OWN scope layer, through a scope this row owns, so
 * - only that agent sees it: an unmanaged session has none, and a call there gets DSH's
 *   UNKNOWN_TOOL before any body runs; the registry re-reads visibility on every request, so a
 *   change reaches the next model request, also the next step of a running turn;
 * - the scope belongs to this row's fiber, so turning the connector off removes it everywhere;
 * - scoped registrations end with their agent, so `agent/created` (resume, clear, compaction)
 *   applies it again; a subagent is an agent with its own session id, which ManagedState never
 *   holds (its keys are roots), so it gets none;
 * - removal calls the register() disposer first, which undoes synchronously, and only then the
 *   asynchronous scope.dispose() (S34: a request assembled while it settled still listed the tool).
 *
 * The sender is the calling agent's root session, never an argument. A retried call of the same
 * response is one message: its key binds the calling session, the call id, the log seq of the
 * response that made the call (a later turn has another) and the text's digest (V2 review M2).
 * The keys of a session are forgotten at its turn end, since a retry happens inside that turn.
 */
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { REFUSAL } from '../../mcp-schema/index.js'
import { digestOf } from '../digest.js'
import { diagnosticOf } from '../errors.js'
import { rootSessionOf } from '../session-info.js'
import { byteLength } from '../text.js'
import { JSON_OUTPUT, ok, refused } from '../tool-results.js'
import { AGENT_EVENT, LOG, LOG_EVENT, MESSAGE_AGENT } from './constants.js'

/** The log seq of the latest assistant message: the response that made this call. */
function responseSeqOf(session) {
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index--) if (events[index].type === LOG_EVENT.assistant) return events[index].seq ?? index
  return MESSAGE_AGENT.noResponse
}

/**
 * @param ctx - the row's context (`agents`, `on`, `effect`)
 * @param deps.routing - `messageAgent`
 * @param deps.managed - K1c `ManagedState`: `managerOf`, `onChange`
 * @param deps.readLimits - the connector's live limits (`maxMessageBytes`)
 * @param deps.logger - `{warn}`
 * @returns `{close}`
 */
export function createSessionTools(ctx, { routing, managed, readLimits, logger }) {
  const warn = (line) => (error) => logger.warn(LOG.format, line, diagnosticOf(error))
  /** root session id → the message keys taken in its current turn (see the module comment). */
  const taken = new Map()
  /** Live agent → the undo steps of its scoped registration (S34). */
  const applied = new Map()
  let active = true

  const tool = defineTool({
    name: MESSAGE_AGENT.name,
    description: MESSAGE_AGENT.description,
    parameters: { message: { type: 'string', required: true, description: MESSAGE_AGENT.messageArg } },
    output: JSON_OUTPUT,
    async execute({ message }, exec) {
      if (exec.agent === undefined) return refused(REFUSAL.unknownSession)
      // Checked on the sender's text: nothing is framed around it.
      if (typeof message !== 'string' || message.trim().length === 0) return refused(REFUSAL.empty)
      if (byteLength(message) > readLimits().maxMessageBytes) return refused(REFUSAL.tooLarge)
      const sender = rootSessionOf(ctx, exec.agent.id)
      const key = [exec.agent.id, exec.callId, responseSeqOf(exec.agent.session), digestOf(message)].join(MESSAGE_AGENT.keySeparator)
      const keys = taken.get(sender) ?? new Set()
      if (keys.has(key)) return ok({ duplicate: true, note: MESSAGE_AGENT.duplicate })
      const result = await routing.messageAgent(sender, { text: message, images: [] })
      if (result.ok !== true) return refused(result.code)
      keys.add(key)
      taken.set(sender, keys)
      return ok({ note: MESSAGE_AGENT.delivered })
    },
  })

  function remove(agent) {
    const undo = applied.get(agent)
    if (undo === undefined) return
    applied.delete(agent)
    for (const step of undo) {
      try { step() } catch (error) { warn(LOG.toolsRemovalFailed)(error) }
    }
  }

  /** Gives one agent exactly what it should have now: the tool while its own session is managed. */
  function syncAgent(agent) {
    const wanted = active && managed.managerOf(agent.id) !== undefined
    if (wanted === applied.has(agent)) return
    if (!wanted) return remove(agent)
    // Recorded as each step succeeds, so a failure part-way undoes what was already applied.
    const undo = []
    applied.set(agent, undo)
    try {
      const scope = createScope(ctx, scopeOf(agent.ctx))
      // Kept last, and asynchronous: the synchronous disposer before it undoes the tool at once (S34).
      undo.push(() => void Promise.resolve(scope.dispose()).catch(warn(LOG.toolsRemovalFailed)))
      undo.unshift(scope.ctx.tools.register(tool))
    } catch (error) {
      warn(LOG.toolsFailed)(error)
      remove(agent)
    }
  }
  const syncAll = () => { for (const agent of ctx.agents.list()) syncAgent(agent) }

  // Unscoped, so it sees every new agent (S34 step 3).
  const disposers = [
    ctx.on(AGENT_EVENT.created, ({ agent }) => syncAgent(agent)),
    ctx.on(AGENT_EVENT.disposed, ({ agent }) => remove(agent)),
    ctx.on(LOG_EVENT.sessionEvent, (session, event) => { if (event.type === LOG_EVENT.turnEnd) taken.delete(session.id) }),
    managed.onChange(syncAll),
  ]
  syncAll()

  return Object.freeze({
    close() {
      active = false
      for (const dispose of disposers.splice(0)) dispose?.()
      for (const agent of [...applied.keys()]) remove(agent)
    },
  })
}
