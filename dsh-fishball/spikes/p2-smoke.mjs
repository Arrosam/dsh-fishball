/** Implementer smoke check (not the black-box suite). */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, message, model, until, REPO } from './harness.mjs'
const { scopeOf } = await hostPkg('dsh-scope')
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const port = 3097
const { ctx, home } = await bootDsh('smoke', [{ insert: [{ id: 'fake-hidden', name: path.join(REPO, 'spikes', 'fixtures', 'hidden-tools.mjs') }] }], { args: ['--no-open', '--port', String(port)], setupProfile: link })
const entry = [...ctx.loader.entries()].find((e) => e.options.id === 'fishball' || e.id.endsWith(':fishball'))
console.log('fishball entry state', entry?.id, entry?.fiber?.state)
const out = []
const origLog = console.log
// token from the boot line is printed on stdout; read it from the webServer service instead
const base = 'http://127.0.0.1:' + port
const tokenUrl = globalThis.__dshUrl
await until(async () => { const s = ctx.agents.list().find((a) => a.session.header.agentPreset === 'fishball:assistant'); return s !== undefined }, 15000)
const fishball = ctx.agents.list().find((a) => a.session.header.agentPreset === 'fishball:assistant')
console.log('fishball agent', fishball?.id, fishball?.session.header.cwd)
await until(() => ctx.workspaceRegistry.pinnedSessionIds.includes(fishball?.id), 5000)
console.log('pinned', ctx.workspaceRegistry.pinnedSessionIds.includes(fishball?.id))
console.log('workspace member', ctx.workspaceRegistry.list().find((w) => w.title === 'Assistant')?.sessionIds.includes(fishball?.id))
console.log('sandbox', ctx.sandboxPolicy.resolve({ session: fishball.session }).mode)
console.log('presets', (await ctx.agentPresets.list()).map((p) => p.id))
model.queue(fishball.id, [{ text: 'hi from fishball' }])
fishball.steer(message('hello'))
await until(() => model.requestsFor(fishball.id).length > 0 && fishball.status === 'idle', 15000)
const req = model.requestsFor(fishball.id)[0]
const sys = req.messages.find((m) => m.role === 'system')?.content.map((b) => b.text).join('') ?? ''
console.log('persona fishball', sys.includes('You are Fishball'), 'coding', sys.includes('coding agent'))
console.log('tools', (req.tools ?? []).map((t) => t.name).sort().join(','))
console.log('bsk params', JSON.stringify((req.tools ?? []).find((t) => t.name === 'bsk_inspect')?.parameters))
let archiveErr
try { await ctx.workspaceRegistry.archiveSession(fishball.id) } catch (e) { archiveErr = e?.name }
console.log('archive refused', archiveErr)
// Restart check: dispose the row's lifecycle by reloading? Instead record the id for a second run.
fs.writeFileSync(path.join(process.env.SMOKE_OUT ?? '/dev/null'), fishball.id)
process.exit(0)