/** Recovery, archive, limits and guard checks (implementer smoke, not the black-box suite). */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, until, REPO } from './harness.mjs'
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const port = 3098
const { ctx } = await bootDsh('p2b', [{ insert: [{ id: 'fake-hidden', name: path.join(REPO, 'spikes', 'fixtures', 'hidden-tools.mjs') }] }], { args: ['--no-open', '--port', String(port)], setupProfile: link })
const base = 'http://127.0.0.1:' + port
const token = globalThis.__dshToken
const out = {}
// Get a cookie: read the token from the webServer-printed URL captured by stdout is awkward; use connection authorizeIndex via HTTP with token from env.
const tokenLine = process.env.SPIKE_TOKEN
await until(() => ctx.agents.list().some((a) => a.session.header.agentPreset === 'fishball:assistant'), 15000)
const fishball = ctx.agents.list().find((a) => a.session.header.agentPreset === 'fishball:assistant')
// Guard checks through model-driven calls.
const results = () => fishball.session.snapshotEvents().filter((e) => e.type === 'tool/result').map((e) => e.data.message.content.map((b) => b.text).join(''))
const call = async (tool, args) => {
  model.queue(fishball.id, [{ tool, args }], [{ text: 'ok' }])
  fishball.steer(message('go'))
  await until(() => fishball.status === 'running', 2000, 5)
  await until(() => fishball.status === 'idle', 15000)
  return results().at(-1)
}
out.bskSave = await call('bsk_inspect', { action: 'x', output: '/tmp/x.json' })
out.bskVideoSave = await call('bsk_inspect', { action: 'x', videoAction: 'save' })
out.bskOk = await call('bsk_inspect', { action: 'x' })
out.write = await call('write', { a: '1' })
out.demo = await call('demo_echo', { a: '1' })
out.calls = (globalThis.__smokeCalls ?? []).map(([n]) => n)
// Limits via settings
const d = ctx.settings.describe().find((x) => x.ns === 'fishball')
out.limitsDescriptor = d && { value: d.value, revision: d.revision }
await ctx.settings.update('fishball', { wakeupsPerHour: 0, maxQueuedInputs: 5 }, d.revision)
let invalid
try { await ctx.settings.update('fishball', { maxQueuedInputs: 0 }, ctx.settings.describe().find((x) => x.ns === 'fishball').revision) } catch (e) { invalid = String(e.message).slice(0, 120) }
out.invalid = invalid
out.stillLive = ctx.agents.get(fishball.id) === fishball
// Archive with stop
await ctx.workspaceRegistry.archiveSession(fishball.id, { stopActivity: true })
await until(() => ctx.agents.get(fishball.id) === undefined, 10000)
out.afterArchiveLive = ctx.agents.get(fishball.id) !== undefined
const stateRoute = async () => { const r = await fetch('http://127.0.0.1:' + port + '/api/fishball/state'); return r.status }
// Read the lifecycle state through the row's published snapshot via settings describe is not possible; use the connection route table.
const routes = ctx.connection?.fetch
out.connectionKeys = Object.keys(ctx.connection ?? {}).slice(0, 20)
fs.writeFileSync(process.env.SMOKE_OUT, JSON.stringify(out, null, 1))
process.exit(0)