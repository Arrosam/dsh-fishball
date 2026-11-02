import { bootDsh, model, runSpike, until } from './harness.mjs'
await runSpike('S0-boot', async () => {
  const { ctx, shutdown, home } = await bootDsh('s0')
  try {
    const services = ['agents', 'sessionController', 'agentPresets', 'tools', 'approval', 'pluginManager', 'storageDomain', 'settings', 'workspaceRegistry', 'sessionQuery', 'sandboxPolicy', 'connection', 'systemPrompt', 'loader', 'agentDefaultModel'].map((n) => [n, ctx.get(n) !== undefined])
    model.respond = () => [{ text: 'hello from spike' }]
    const cwd = home + '/ws'
    const created = await ctx.sessionController.create({ cwd })
    const found = await ctx.sessionController.agents.resolveAgent(created.sessionId).catch((e) => ({ error: String(e) }))
    return { pass: true, services, created, controllerKeys: Object.keys(ctx.sessionController).slice(0, 40), resolved: Object.keys(found) }
  } finally { await shutdown.shutdown?.(0).catch?.(() => {}) }
})
process.exit(0)
