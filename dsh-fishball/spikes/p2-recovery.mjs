/** Recovery and archive over HTTP (implementer smoke). Boots twice: second boot after deleting the session log. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, until, REPO } from './harness.mjs'
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const port = Number(process.env.SMOKE_PORT ?? 3101)
// Capture the printed URL to log in.
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
const { ctx, home, shutdown } = await bootDsh('p2rec', [], { args: ['--no-open', '--port', String(port)], setupProfile: link })
await until(() => url !== undefined, 5000)
const base = 'http://127.0.0.1:' + port
const login = await fetch(url, { redirect: 'manual' })
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
const api = async (p, init = {}) => { const r = await fetch(base + p, { ...init, headers: { cookie, origin: base, 'content-type': 'application/json', ...(init.headers ?? {}) } }); return { status: r.status, body: await r.json().catch(() => null) } }
const out = { phase: process.env.SMOKE_PHASE }
await until(async () => ['live', 'recovery', 'archived'].includes((await api('/api/fishball/state')).body?.status), 20000, 200)
out.state = (await api('/api/fishball/state')).body
if (process.env.SMOKE_PHASE === 'recovery') {
  out.badBody = await api('/api/fishball/recovery', { method: 'POST', body: '{"action":"nope"}' })
  out.adopt = await api('/api/fishball/recovery', { method: 'POST', body: '{"action":"adopt"}' })
  out.adoptAgain = await api('/api/fishball/recovery', { method: 'POST', body: '{"action":"adopt"}' })
}
if (process.env.SMOKE_PHASE === 'archive') {
  await ctx.workspaceRegistry.archiveSession(out.state.sessionId, { stopActivity: true })
  await until(async () => (await api('/api/fishball/state')).body?.status === 'archived', 10000, 100)
  out.afterArchive = (await api('/api/fishball/state')).body.status
  await ctx.workspaceRegistry.unarchiveSession(out.state.sessionId)
  out.retry = await api('/api/fishball/recovery', { method: 'POST', body: '{"action":"retry"}' })
}
out.home = home
console.log('RESULT ' + JSON.stringify(out))
await shutdown.shutdown(0)
