/** S14 browser fixture server: isolated DSH Web with the brand fixture and one assistant session. Stays up for the browser check. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostRow, message, model, until, REPO } from './harness.mjs'
const relay = (sender) => ({ kind: 'agent-message', form: 'relay', senderSessionId: sender })
const BRAND = path.join(REPO, 'spikes', 'fixtures', 'brand-plugin')
const port = process.env.SPIKE_PORT ?? '3096'
const { ctx, home } = await bootDsh('s14', [], {
  args: ['--no-open', '--port', port],
  setupProfile: async (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    pkg.dependencies = { ...pkg.dependencies, 'fishball-spike-brand': 'link:' + BRAND }
    pkg.dsh.profile.bundles.push('fishball-spike-brand')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    fs.symlinkSync(BRAND, path.join(dir, 'node_modules', 'fishball-spike-brand'))
  },
})
const brokerSeen = []
const row = await hostRow(ctx, 'fishball-spike-row', ['agents', 'workspaceRegistry', 'tools', 'approval', 'connection', 'sessionController'], (c) => {
  // S12 browser half: a prepended broker that always passes on; the stock browser prompt must still appear.
  c.on('approval/request', (req, next) => { brokerSeen.push(req.toolName); return next() }, { prepend: true })
  c.tools.register({
    name: 'ask_me', description: 'Spike tool that asks for approval in its body.',
    parameters: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args, exec) { return 'outcome=' + await c.approval.request({ agent: exec.agent, toolName: 'ask_me', callId: exec.callId, reason: 'spike asks: ' + args.what, displayReason: { en: 'Spike asks: ' + args.what }, signal: exec.signal }) },
  })
  const json = (v) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } })
  c.effect(() => c.connection.fetch.register({ path: '/api/fishball-spike/relay', methods: ['POST'], requestBody: 'buffered', fetch: async (req) => {
    const { sessionId, text } = await req.json()
    const found = await c.sessionController.agents.resolveAgent(sessionId)
    if (found.error) return json({ error: String(found.error.message) })
    found.agent.steer(message(text, relay(globalThis.__spikeAssistantId)))
    return json({ ok: true })
  } }), 'relay route')
  c.effect(() => c.connection.fetch.register({ path: '/api/fishball-spike/start', methods: ['POST'], requestBody: 'buffered', fetch: async (req) => {
    const { cwd, text } = await req.json()
    const created = await c.sessionController.create({ cwd })
    const found = await c.sessionController.agents.resolveAgent(created.sessionId)
    found.agent.steer(message(text, relay(globalThis.__spikeAssistantId)))
    return json(created)
  } }), 'start route')
  c.effect(() => c.connection.fetch.register({ path: '/api/fishball-spike/broker', methods: ['GET'], requestBody: 'buffered', fetch: async () => json({ brokerSeen }) }), 'broker route')
})
// A session whose user writes "please ask" gets an ask_me call first.
const baseRespond = model.respond.bind(model)
model.respond = (options) => {
  const queued = model.queues.get(options.sessionId)
  if (queued?.length) return queued.shift()
  // The last request message can be a runtime-context snapshot, so look at the whole request; ask once per turn.
  const text = JSON.stringify(options.messages)
  if (text.includes('please ask') && !text.includes('toolCallId')) return [{ tool: 'ask_me', args: { what: 'browser check' } }]
  return baseRespond(options)
}
const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
await ctx.workspaceRegistry.create(cwd, 'Assistant')
const sid = 'session-fishball-s14'
const handle = await row.agents.create({ sessionId: sid, meta: { cwd, agentPreset: 'fishball:assistant' }, agentOptions: { provider: 'fishball-spike', model: 'spike-model' } })
model.queue(sid, [{ text: 'Hello, I am the spike assistant.' }])
handle.agent.steer(message('hello assistant'))
await until(() => handle.agent.status === 'idle', 10000)
globalThis.__spikeAssistantId = sid
console.log('S14-READY ' + sid)