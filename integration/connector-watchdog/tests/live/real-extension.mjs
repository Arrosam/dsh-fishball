/**
 * The interactions worker extension for the manual real-model judge run (real-model.manual.mjs).
 * `realJudge` adds the provider to llm-pi-ai and selects it in Watchdog's own settings. The global
 * default stays scripted. `assistantTexts` and `failures` read the judge's side-session log.
 */
import { bundles, overlayRows, ops as baseOps } from 'dsh-connector-test-helpers/connector-world/interactions-extension'

export { bundles, overlayRows }
const PI_AI_ROW = 'llm-pi-ai'
const WATCHDOG_ROW = 'dsh-connector-watchdog'

export async function ops(deps) {
  const { ctx } = deps
  const base = await baseOps(deps)
  return {
    ...base,
    async realJudge({ provider, model, reasoningEffort, profile }) {
      const row = ctx.settings.describe().find((d) => d.ns === PI_AI_ROW)
      const providers = { ...(row?.value?.providers ?? {}), [provider]: profile }
      await ctx.settings.update(PI_AI_ROW, { providers }, row?.revision)
      const selection = { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
      await ctx.settings.mutate(WATCHDOG_ROW, [{ op: 'set', path: ['model'], value: selection }])
      return true
    },
    assistantTexts({ sessionId }) {
      const agent = ctx.agents.get(sessionId)
      if (!agent) return null
      return agent.session.snapshotEvents().filter((e) => e.type === 'assistant/message')
        .map((e) => (e.data?.message?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join(''))
        .filter((t) => t !== '')
    },
    failures({ sessionId }) {
      const agent = ctx.agents.get(sessionId)
      if (!agent) return null
      return agent.session.snapshotEvents().filter((e) => /error|fail/i.test(e.type)).map((e) => ({ type: e.type, data: JSON.stringify(e.data).slice(0, 600) }))
    },
  }
}
