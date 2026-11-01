/**
 * Fixture bundle: registers the global fixture tools at boot (hidden names,
 * shell names and ordinary names) and records agent lifecycle events. Its
 * context is kept so the worker can register, swap or remove tools AS this
 * plugin (attribution follows the registering context).
 */
import { AGENT_SCOPE_TOOL, BOOT_TOOLS, LATE_TOOLS } from '../../constants.mjs'
import { fixtureTool, registerFixtures, store } from '../../fixture-tools.mjs'

export const name = 'fbtest-tools'
export const inject = ['tools']
export function apply(ctx) {
  store.fixtureCtx = ctx
  ctx.effect(() => registerFixtures(ctx, BOOT_TOOLS.filter((n) => !LATE_TOOLS.includes(n)), store.fixtureRegs), 'fbtest fixture tools')
  // P7 (FBTEST_APPROVER_AFTER=1): the browser prompt's stand-in. This row mounts before dsh-fishball and
  // prepends, so Fishball's broker (prepended later) runs first and its next() reaches this listener,
  // which answers through the worker's scripted answerer. Before the worker sets it up: rejected.
  if (process.env.FBTEST_APPROVER_AFTER === '1') {
    ctx.on('approval/request', (req) => (store.answerQuestion ? store.answerQuestion(req) : 'rejected'), { prepend: true })
  }
  ctx.on('agent/created', ({ agent, source }) => { store.lifecycle.push({ type: 'created', id: agent.id, source: source?.kind ?? String(source), at: Date.now() }) })
  ctx.on('agent/disposed', ({ agent }) => { store.lifecycle.push({ type: 'disposed', id: agent.id, at: Date.now() }) })
  // Post-review change 2: a plugin that registers a tool straight into each new agent's own scope.
  // Post-review R1: FBTEST_AGENT_SCOPE_SHADOW lists names registered in the agent's scope too, shadowing visible tools.
  const scopedNames = [
    ...(process.env.FBTEST_AGENT_SCOPE_TOOL === '1' ? [AGENT_SCOPE_TOOL] : []),
    ...(process.env.FBTEST_AGENT_SCOPE_SHADOW ?? '').split(',').filter(Boolean),
  ]
  if (scopedNames.length > 0) {
    store.agentScoped ??= []
    ctx.on('agent/created', ({ agent }) => {
      for (const toolName of scopedNames) {
        try { agent.ctx.tools.register(fixtureTool(toolName)); store.agentScoped.push(agent.id) } catch (error) { store.registerErrors.push({ name: toolName, error: String(error?.message ?? error) }) }
      }
    })
  }
}
