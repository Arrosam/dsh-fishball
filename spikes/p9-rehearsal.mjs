/**
 * P9 rehearsal (implementer evidence): the owner's 'web' profile plugin set, LINKED read-only from
 * ~/.dsh/profiles/web into a throwaway home, plus dsh-fishball. Nothing in ~/.dsh is written.
 * Boots DSH Web on a test port and stays up (SPIKE_STDIN_SECONDS) for a browser check; reports
 * whether Fishball went live, its catalog, failed rows and which tools Fishball sees.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, runSpike, until, REPO } from './harness.mjs'

const WEB = '/Users/samuel/.dsh/profiles/web'
process.env.BSK_HOME ??= path.join(REPO, '.runtime', 'bsk-home')
const port = Number(process.env.SMOKE_PORT ?? 3099)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }

await runSpike('P9-rehearsal', async () => {
  const webPkg = JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8'))
  const deps = Object.keys(webPkg.dependencies ?? {})
  const bundles = webPkg.dsh?.profile?.bundles ?? []
  const linked = []
  const skipped = []
  const { ctx, home } = await bootDsh('p9rehearsal', [], { args: ['--no-open', '--port', String(port)], setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    // dsh-fishball itself is linked to this checkout below, even once the web profile lists it.
    for (const name of deps.filter((d) => d !== 'dsh-fishball')) {
      const source = path.join(WEB, 'node_modules', name)
      if (!fs.existsSync(source) || pkg.dependencies?.[name] !== undefined) { skipped.push(name); continue }
      const target = fs.realpathSync(source)
      pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
      fs.mkdirSync(path.dirname(path.join(dir, 'node_modules', name)), { recursive: true })
      if (!fs.existsSync(path.join(dir, 'node_modules', name))) fs.symlinkSync(target, path.join(dir, 'node_modules', name))
      linked.push(name)
    }
    for (const b of bundles) if (!pkg.dsh.profile.bundles.includes(b)) pkg.dsh.profile.bundles.push(b)
    pkg.dependencies['dsh-fishball'] = 'link:' + REPO
    if (!pkg.dsh.profile.bundles.includes('dsh-fishball')) pkg.dsh.profile.bundles.push('dsh-fishball')
    fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  } })
  await until(() => url !== undefined, 10000)
  const base = 'http://127.0.0.1:' + port
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const state = async () => (await (await fetch(base + '/api/fishball/state', { headers: { cookie, origin: base } })).json())
  await until(async () => ['live', 'recovery', 'failed'].includes((await state()).status), 60000, 500)
  const s = await state()
  const failedRows = [...ctx.loader.entries()].filter((e) => !e.disabled && e.fiber && e.fiber.state === 3).map((e) => e.options.name)
  const fishballTools = Object.entries(s.catalog?.plugins ?? {}).length
  const visible = (s.catalog?.plugins ?? []).flatMap((p) => p.tools.filter((t) => t.status === 'visible').map((t) => t.name))
  const unchecked = (s.catalog?.plugins ?? []).flatMap((p) => p.tools.filter((t) => t.status === 'unchecked').map((t) => p.plugin + ':' + t.name))
  // An ordinary session in a registered workspace, for the browser check of the session menu.
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const workspace = await ctx.workspaceRegistry.create(ws).catch(() => undefined)
  const ordinary = await ctx.sessionController.create(workspace ? { workspaceId: workspace.id } : { cwd: ws }).catch(() => undefined)
  // One turn, so the sidebar lists it as an ordinary (non-blank) session with its row menu.
  if (ordinary) {
    const resolved = await ctx.sessionController.resolveAgent(ordinary.sessionId)
    resolved.agent?.steer(message('Summarise the README.'))
    await until(() => resolved.agent?.status === 'idle' && model.requestsFor(ordinary.sessionId).length > 0, 15000)
  }
  fs.writeFileSync(path.join(REPO, '.runtime', 'p9-rehearsal-url.txt'), url + '\n')
  // Stay up for a browser check while P9_HOLD_MS lasts (the launcher ends with stdin anyway).
  const hold = Number(process.env.P9_HOLD_MS ?? 0)
  if (hold > 0) {
    fs.writeFileSync(path.join(REPO, '.runtime', 'p9-rehearsal-ready.txt'), new Date().toISOString() + '\n')
    await new Promise((r) => setTimeout(r, hold))
  }
  return { ordinarySession: ordinary?.sessionId ?? null, workspace: workspace?.id ?? null, pass: s.status === 'live', status: s.status, error: s.error, linked: linked.length, skipped, failedRows, catalogPlugins: (s.catalog?.plugins ?? []).length, visible, unchecked, otherTools: s.catalog?.otherTools ?? [], sources: s.sources, url: base }
})
