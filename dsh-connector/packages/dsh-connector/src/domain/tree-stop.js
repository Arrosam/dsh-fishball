/**
 * The manager's stop of a whole session tree (the user's decision of 2026-11-21): Fishball's
 * `session_stop`, and the cancel part of `session_redirect`, must bring the session to a true
 * standstill. DSH's own cancel (sessionController.cancel, the Stop button) ends the root's turn only;
 * its subagents and background jobs run on, so the sidebar still showed the session busy (the
 * user's report: "after Fishball stopped your session, the sidebar still showed it running").
 *
 * `stopTree(ctx, root)` stops, besides the root's own turn (the caller's):
 * - every live agent of the root's tree that is not the root itself (a subagent at any depth,
 *   `rootSessionOf`), as DSH stops a subagent when its parent is torn down: `cancel({kind: parent})`.
 *   An idle member is left alone (cancelling it is DSH's no-op);
 * - every background job a member of the tree owns that is still running (`jobs.kill`, with the
 *   owner as caller), as DSH's archive stop does for a session's own jobs (dsh-jobs
 *   installJobArchiveAdmission). A job already `stopping` has been asked and is left alone.
 * The root is skipped: the caller cancels it its own way (`keepInbox` for the Stop button's
 * semantics, or a redirect's cancel). A failure on one member never stops the rest; each is logged
 * with its code only. The jobs service is optional (a DSH without it has no jobs to stop).
 *
 * The stopped work's own notices must not wake the tree again. When DSH settles a stopped
 * subagent it sends its parent a `subagent-settled` notice ("was stopped before it finished") as
 * waking input (dsh-subagent `notifySettlement`), and a killed job's `tool-jobs` notice may wake
 * its owner too (dsh-tool-jobs `deliverSettlement`); either would start a new turn of the session
 * the manager just stopped, and so a turn-finished the manager did not want (seen on a real DSH).
 * So the stop installs a one-shot hold on each member (`holdNotices`): a turn whose claimed input
 * is only such notices of the stopped work enters no step (DSH's own empty-step path, no model
 * call, no turn-finished worth reporting: the session source sees the tree still and the manager
 * asked for the stop). The notice stays in the session's log as context for its next real turn.
 * The hold ends at the first claim carrying any other input (the user or the manager speaking
 * again), and at most after `TREE_STOP.holdMs`, so it never outlives the stop it belongs to. Each
 * swallowed turn of the root is told to `onRootHeld` (the session source's `stoppedByManager`),
 * so that empty turn's end is the manager's too and reports nothing.
 */
import { rootSessionOf } from '../session-info.js'
import { TREE_STOP } from './constants.js'

/** Whether `message` is a notice of stopped work (a settled subagent, a settled job). */
const isStopNotice = (message) => TREE_STOP.noticeKinds.includes(message?.source?.kind)

/**
 * A one-shot hold on `agent`'s next proposed steps: a step whose claimed input is only notices of
 * the stopped work is entered empty, so the turn ends with no model call (the agent loop's own
 * "first step with no messages" completion). Removed at the first other input or after holdMs.
 */
function holdNotices(agent, onHeld) {
  if (typeof agent?.ctx?.on !== 'function') return
  let release
  const off = agent.ctx.on(TREE_STOP.preStep, async (payload, next) => {
    const decision = await next()
    if (decision.kind !== TREE_STOP.enter || payload.agent !== agent || payload.step !== TREE_STOP.firstStep) return decision
    if (payload.messages.length === 0 || !payload.messages.every(isStopNotice)) { release(); return decision }
    onHeld?.()
    return { ...decision, messages: [] }
  })
  const timer = setTimeout(() => release(), TREE_STOP.holdMs)
  timer.unref?.()
  release = () => { clearTimeout(timer); off?.() }
}

/**
 * @param {object} ctx - the connector row's context (`agents`, `sessions`, `get`)
 * @param {string} root - the root session whose tree stops
 * @param {{warn: Function}} [logger]
 * @param {(root: string) => void} [onRootHeld] told when the hold swallows a notice-only turn of the root
 * @returns {{subagents: number, jobs: number}} how many cancels and kills were requested
 */
export function stopTree(ctx, root, logger, onRootHeld) {
  const warn = (what, id, error) => logger?.warn(TREE_STOP.log.failed, what, id, String(error?.code ?? error?.name ?? TREE_STOP.log.unknown))
  const members = ctx.agents.list().filter((agent) => agent.id === root || rootSessionOf(ctx, agent.id) === root)
  const running = members.filter((agent) => agent.id !== root && agent.status === TREE_STOP.runningAgent)
  const registry = ctx.get(TREE_STOP.jobsService)
  const canKill = typeof registry?.list === 'function' && typeof registry.kill === 'function'
  const jobsOf = (agent) => (canKill ? registry.list(agent.id).filter((job) => job.owner === agent.id && job.status === TREE_STOP.runningJob) : [])
  const killing = members.map((agent) => [agent, jobsOf(agent)]).filter(([, jobs]) => jobs.length > 0)
  // Every member a stopped subagent or a killed job reports to: the subagents' parents (the whole
  // tree stops, so the members themselves) and the jobs' owners. Held before anything is stopped.
  if (running.length > 0 || killing.length > 0) for (const agent of members) holdNotices(agent, agent.id === root ? () => onRootHeld?.(root) : undefined)
  let subagents = 0
  for (const agent of running) {
    try { agent.cancel(TREE_STOP.cause); subagents += 1 } catch (error) { warn(TREE_STOP.log.subagent, agent.id, error) }
  }
  let jobs = 0
  for (const [agent, list] of killing) {
    for (const job of list) {
      try { if (registry.kill(job.id, agent.id, TREE_STOP.killReason) === TREE_STOP.killRequested) jobs += 1 } catch (error) { warn(TREE_STOP.log.job, job.id, error) }
    }
  }
  return Object.freeze({ subagents, jobs })
}
