/**
 * P12 smoke server (implementer evidence, not the black-box suite): the real dsh-fishball in a
 * throwaway home with the manager-demo fixture installed but off in DSH (it runs only in
 * Fishball's tree when on) and fishball-spike-demo on in DSH. Checks the plugin manager's Host
 * routes once, then stays up for the browser check (DESIGN §10d).
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { bootDsh, until, REPO } from './harness.mjs'

const port = process.env.SPIKE_PORT ?? '3095'
const FIX = (folder) => path.join(REPO, 'spikes', 'fixtures', folder)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
const { ctx: hostCtx, home, profileDir } = await bootDsh('p12smoke', [], {
  args: ['--no-open', '--port', port],
  setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    const link = (name, target, selected) => {
      pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
      if (selected) pkg.dsh.profile.bundles.push(name)
      fs.symlinkSync(target, path.join(dir, 'node_modules', name))
    }
    link('dsh-fishball', REPO, true)
    link('fishball-spike-manager-demo', FIX('manager-demo'), false)
    link('fishball-spike-demo', FIX('demo-plugin'), true)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  },
})
await until(() => url !== undefined, 20000)
const base = new URL(url).origin
const login = await fetch(url, { redirect: 'manual' })
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
const call = async (method, route, body) => {
  const response = await fetch(base + route, { method, headers: { cookie, origin: base, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const type = response.headers.get('content-type') ?? ''
  return { status: response.status, type, body: type.includes('json') ? await response.json() : (await response.arrayBuffer()).byteLength }
}
await until(async () => (await call('GET', '/api/fishball/state')).body.status === 'live', 60000, 500)
const DEMO = 'fishball-spike-manager-demo'
const plugin = async (key) => (await call('GET', '/api/fishball/state')).body.catalog.plugins.find((p) => p.plugin === key)
const pick = (p) => p && { dsh: p.dsh, runs: p.runs, packageName: p.packageName, version: p.version, description: p.description, meta: p.meta, hasIcon: p.hasIcon, settings: p.settings }
const out = {}
out.demoEntry = pick(await plugin(DEMO))
out.sharedEntry = pick(await plugin('fishball-spike-demo'))
out.webEntry = pick(await plugin('builtin:web'))
out.messengerEntry = pick(await plugin('builtin:messenger'))
out.detail = await call('GET', '/api/fishball/plugins/detail?plugin=' + DEMO)
out.detailUnknown = (await call('GET', '/api/fishball/plugins/detail?plugin=nope')).status
out.detailNoParam = (await call('GET', '/api/fishball/plugins/detail')).status
out.icon = await call('GET', '/api/fishball/plugins/icon?plugin=' + DEMO)
out.iconNone = (await call('GET', '/api/fishball/plugins/icon?plugin=builtin:web')).status
out.on = (await call('POST', '/api/fishball/plugins', { plugin: DEMO, on: true })).status
await until(async () => (await plugin(DEMO)).applied === true, 20000, 200)
out.appliesBefore = [...(globalThis.__managerDemo ?? [])]
out.save = await call('POST', '/api/fishball/plugins/settings', { plugin: DEMO, row: 'manager-demo', values: { limit: 7, token: 's3cret-value', mode: 'careful' } })
out.saveState = out.save.body.ok
delete out.save.body.state
out.invalid = await call('POST', '/api/fishball/plugins/settings', { plugin: DEMO, row: 'manager-demo', values: { limit: 99 } })
out.shared = await call('POST', '/api/fishball/plugins/settings', { plugin: 'fishball-spike-demo', row: 'spike-demo', values: { a: 1 } })
out.unknownRow = await call('POST', '/api/fishball/plugins/settings', { plugin: DEMO, row: 'nope', values: { a: 1 } })
out.compaction = await call('POST', '/api/fishball/plugins/settings', { plugin: 'builtin:compaction', row: 'compaction-basic', values: { a: 1 } })
await until(() => (globalThis.__managerDemo ?? []).length > out.appliesBefore.length, 20000, 200).catch(() => {})
out.appliesAfter = [...(globalThis.__managerDemo ?? [])]
const after = await call('GET', '/api/fishball/plugins/detail?plugin=' + DEMO)
out.detailAfter = { settings: after.body.detail.settings, row: after.body.detail.rows[0] && { user: after.body.detail.rows[0].user, value: after.body.detail.rows[0].value, secrets: after.body.detail.rows[0].secrets }, history: after.body.detail.history }
out.secretLeaked = JSON.stringify(await call('GET', '/api/fishball/state')).includes('s3cret-value') || JSON.stringify(after).includes('s3cret-value')
out.demoEntryAfter = pick(await plugin(DEMO))
// Install for Fishball through DSH's inherited process (revision 10a): check, install, events, DSH untouched.
const profileHash = () => ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml'].map((f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(profileDir, f))).digest('hex') } catch { return null } }).join(',')
const beforeProfile = profileHash()
const installEvents = []
hostCtx.on('plugin-manager/install-state', (e) => installEvents.push(e.phase))
out.inspectInstall = (await call('POST', '/api/fishball/install/inspect', { spec: FIX('manager-demo') })).body
const installRequest = 'p12-smoke-install'
out.install = (await call('POST', '/api/fishball/install', { spec: FIX('manager-demo'), requestId: installRequest })).body
out.installAgain = (await call('POST', '/api/fishball/install', { spec: FIX('manager-demo'), requestId: 'again' })).body
out.installEvents = installEvents
out.profileUntouched = beforeProfile === profileHash()
out.installedEntry = pick(await plugin('fishball:fishball-spike-manager-demo'))
if (out.detail.body?.detail?.rows) out.detail.body.detail.rows = out.detail.body.detail.rows.map((r) => ({ ...r, schema: r.schema ? '(schema json)' : null }))
console.log('P12-SMOKE ' + JSON.stringify(out, null, 1))
console.log('P12-READY ' + JSON.stringify({ url, home }))
