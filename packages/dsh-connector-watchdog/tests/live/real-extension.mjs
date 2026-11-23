/**
 * The interactions worker extension plus two ops for the real-model judge run (real-model.test.mjs):
 * - `realJudge({provider, model, reasoningEffort, profile})`: adds the provider route to this test
 *   home's llm-pi-ai row through DSH's settings service (as the Models page does) and routes every
 *   new agent on the `watchdog` preset (Watchdog's side sessions) to that model; every other session
 *   keeps the scripted fake model;
 * - `assistantTexts({sessionId})`: the side session's assistant replies, to report the verdicts.
 */
import { bundles, overlayRows, ops as baseOps } from '../../../dsh-connector/tests/interactions/extension.mjs'

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
