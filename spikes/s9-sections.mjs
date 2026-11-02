/** S9 which named global sections and contexts reach an agent scope, and does an empty scoped shadow remove one. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, hostRow, runSpike, stage } from './harness.mjs'
const { createScope, bindScopeParent, scopeOf } = await hostPkg('dsh-scope')
await runSpike('S9-sections', async () => {
  const { ctx, home } = await bootDsh('s9')
  const row = await hostRow(ctx, 'fishball-spike-row', ['agents', 'systemPrompt'])
  const cwd = path.join(home, 'a'); fs.mkdirSync(cwd, { recursive: true })
  const handle = await row.agents.create({ sessionId: 'session-s9', meta: { cwd }, agentOptions: { provider: 'fishball-spike', model: 'spike-model' } })
  const scope = scopeOf(handle.agent.ctx)
  const before = await ctx.systemPrompt.assemble({ scope })
  const names = before.sections.map((s) => s.name)
  const contexts = before.contexts.map((c) => c.name)
  // Shadow one global section with empty text in the agent scope.
  const victim = names.find((n) => n.startsWith('harness:') || n.includes('web')) ?? names[1]
  handle.agent.ctx.systemPrompt.section({ name: victim, order: 0, text: '' })
  const after = await ctx.systemPrompt.assemble({ scope })
  const removed = !after.sections.some((s) => s.name === victim && s.text.length > 0)
  await handle.dispose()
  return { pass: removed, sections: before.sections.map((s) => [s.name, s.text.length]), contexts, shadowed: victim, removed }
})
