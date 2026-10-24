/**
 * S1 private tree mounts built-ins and an installed-but-off bundle's rows.
 * S2 restrict({deny}) in agent scope A hides global tools AND tools P's tree registered; persona in P.
 * S9 which global prompt sections exist; shadowing by name.
 * S19 scoped bsk_inspect-like shadow replaces a global tool for one agent only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, model, runSpike, until, stage, REPO } from './harness.mjs'

const { createScope, bindScopeParent, scopeOf } = await hostPkg('dsh-scope')
const { EntryTree } = await hostPkg('cordis-plugin-loader')
const { prepareProfileEntries } = await hostPkg('dsh-app-boot')
const { auditRows, leakedServices } = await hostPkg('dsh-agent-preset-registry')

class PrivateTree extends EntryTree {
  constructor(ctx) {
    const owner = ctx.fiber.entry; const subtree = owner?.subtree; const subgroup = owner?.subgroup
    super(ctx)
    if (owner !== undefined) { if (subtree === undefined) delete owner.subtree; else owner.subtree = subtree; if (subgroup === undefined) delete owner.subgroup; else owner.subgroup = subgroup }
  }
  write() {}
}

const DEMO = path.join(REPO, 'spikes', 'fixtures', 'demo-plugin')
const fakeTool = (name, extra = {}) => ({
  name, description: 'spike tool ' + name,
  parameters: { type: 'object', properties: { a: { type: 'string' }, output: { type: 'string' } } },
  output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
  async execute(args) { return 'global:' + JSON.stringify(args) },
  ...extra,
})

await runSpike('S1-S2-S9-S19', async () => {
  const { ctx, home } = await bootDsh('s1', [], {
    setupProfile: async (dir) => {
      // Install the demo bundle as a profile dependency WITHOUT selecting it (enabled:false shape).
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      pkg.dependencies = { ...pkg.dependencies, 'fishball-spike-demo': 'link:' + DEMO }
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      fs.symlinkSync(DEMO, path.join(dir, 'node_modules', 'fishball-spike-demo'))
    },
  })
  const out = {}
  stage('booted')
  try {
    // Global tools standing in for profile-wide plugin tools (bsk_inspect, image_generate).
    ctx.tools.register(fakeTool('bsk_inspect'))
    ctx.tools.register(fakeTool('image_generate'))

    // --- private scope P under a real plugin fiber (the fishball row's position), with a private tree ---
    const P = {}
    stage('host row')
    const rowCtx = await new Promise((resolve, reject) => {
      const fiber = ctx.plugin({ name: 'fishball-spike-row', inject: ['tools', 'loader'], apply: (c) => resolve(c) })
      Promise.resolve(fiber).catch(reject)
    })
    await rowCtx.fiber.await?.()
    const pScope = createScope(rowCtx, P)
    const pctx = pScope.ctx.extend({ baseUrl: ctx.baseUrl })
    out.baseUrl = String(pctx.baseUrl)
    const tree = new PrivateTree(pctx)
    pctx.effect(() => () => { tree.root.stop() }, 'spike.tree')
    stage('listBundles')
    const bundles = await ctx.pluginManager.listBundles()
    const demo = bundles.find((b) => b.name === 'fishball-spike-demo')
    out.demoBundle = demo && { enabled: demo.enabled, installed: demo.installed, availability: demo.availability, rows: demo.rows, overrides: demo.overrides }
    const rows = [
      { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are Fishball, a personal assistant.', includeRuntimeContext: false } },
      { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true } },
      { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
      { id: 'spike-demo', name: 'fishball-spike-demo', config: {} },
    ]
    stage('mount tree')
    let mountError
    try { await tree.root.update(prepareProfileEntries(pctx, rows, pctx.baseUrl)) } catch (e) { mountError = String(e?.stack ?? e) }
    await tree.await()
    stage('audit')
    const audit = await auditRows(tree)
    out.S1 = { mountError, audit, leaked: leakedServices(ctx, pctx.fiber), demoApplies: globalThis.__spikeDemoApplies ?? 0, entries: [...tree.entries()].map((e) => [e.options.id, e.options.name, e.fiber?.state]) }

    // S19: scoped shadow of bsk_inspect in P, without the 'output' arg.
    const shadowCalls = []
    pctx.tools.register(fakeTool('bsk_inspect', {
      parameters: { type: 'object', properties: { a: { type: 'string' } } },
      async execute(args, exec) { shadowCalls.push(args); return ctx.tools.get('bsk_inspect').execute(args, exec) },
    }))

    // --- assistant agent A under P ---
    const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
    stage('create agent')
    let restrictError
    const handle = await ctx.agents.create({
      sessionId: 'session-fishball-spike',
      meta: { cwd },
      agentOptions: { provider: 'fishball-spike', model: 'spike-model' },
      setup: async (actx, agent) => {
        bindScopeParent(scopeOf(actx), P)
        try { actx.tools.restrict({ deny: ['image_generate', 'demo_echo'] }) } catch (e) { restrictError = String(e) }
        actx.tools.guard((exec) => (exec.name === 'write' ? 'fishball never writes files' : undefined))
      },
    })
    const agent = handle.agent
    const visibleA = ctx.tools.schemas(scopeOf(agent.ctx)).map((t) => t.name).sort()
    const visibleP = ctx.tools.schemas(P).map((t) => t.name).sort()
    const visibleGlobal = ctx.tools.schemas().map((t) => t.name).sort()
    // An ordinary session for comparison.
    stage('other session')
    const other = await ctx.sessionController.create({ cwd: path.join(home, 'ws') })
    const otherAgent = (await ctx.sessionController.agents.resolveAgent(other.sessionId)).agent
    const visibleOther = ctx.tools.schemas(scopeOf(otherAgent.ctx)).map((t) => t.name).sort()
    out.S2 = { restrictError, visibleA, visiblePcount: visibleP.length, visibleOtherHasImage: visibleOther.includes('image_generate'), visibleOtherHasDemo: visibleOther.includes('demo_echo'), globalHasDemo: visibleGlobal.includes('demo_echo') }

    // Drive one turn so the real request (system prompt + tools) is observed.
    stage('drive fishball turn')
    model.requests.length = 0
    agent.steer({ id: 'msg-spike-1', role: 'user', content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } })
    await until(() => model.requests.length > 0 && agent.status === 'idle', 15000)
    const req = model.requests[0]
    const sys = req?.messages?.find((m) => m.role === 'system')
    const sysText = sys?.content?.map((b) => b.text).join('') ?? ''
    out.S2.requestTools = (req?.tools ?? []).map((t) => t.name).sort()
    out.S2.bskSchema = (req?.tools ?? []).find((t) => t.name === 'bsk_inspect')?.parameters
    out.S2.personaIsFishball = sysText.includes('You are Fishball')
    out.S2.personaIsCoding = sysText.includes('coding agent')
    out.S9 = { systemPromptHead: sysText.slice(0, 1500), sectionsNote: 'see systemPromptHead' }
    // Other session's request for comparison
    model.requests.length = 0
    otherAgent.steer({ id: 'msg-spike-2', role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })
    await until(() => model.requests.length > 0 && otherAgent.status === 'idle', 15000)
    const oreq = model.requests[0]
    out.S19 = { otherBskSchemaHasOutput: Boolean((oreq?.tools ?? []).find((t) => t.name === 'bsk_inspect')?.parameters?.properties?.output), fishballBskHasOutput: Boolean(out.S2.bskSchema?.properties?.output), otherPersonaCoding: (oreq?.messages?.find((m) => m.role === 'system')?.content?.map((b) => b.text).join('') ?? '').includes('coding agent'), otherHasDemo: (oreq?.tools ?? []).some((t) => t.name === 'demo_echo') }
    const pass = !mountError && out.S1.audit.failed.length === 0 && out.S1.leaked.length === 0 && !restrictError
      && !out.S2.requestTools.includes('image_generate') && !out.S2.requestTools.includes('demo_echo')
      && out.S2.personaIsFishball && !out.S2.personaIsCoding && !out.S19.fishballBskHasOutput && out.S19.otherBskSchemaHasOutput
    await handle.dispose()
    return { pass, ...out }
  } catch (error) {
    return { pass: false, failedAt: globalThis.__spikeStage, error: String(error?.stack ?? error), ...out }
  }
})
process.exit(0)