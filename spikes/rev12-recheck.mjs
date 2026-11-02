/**
 * Revision 12 sandbox re-check (DESIGN §10f, your answer Q-rec-recheck): does each listed
 * recommended plugin still run for Fishball alone? Boots a throwaway DSH home under .runtime/
 * with the fake model and dsh-fishball linked, then installs each listed spec through
 * Fishball's own install route (revision 10a: DSH's inherited process, Fishball's folder only;
 * DSH's profile is never touched). After each install, which turns the plugin on for Fishball,
 * records whether its rows applied in the private tree or were refused (lastError, blocked),
 * then turns it off again so the next check starts from the same tree (P10-S23's method).
 *
 * Specs come from argv (default: the whole list), so the check can run in batches that each fit
 * a foreground run (SPIKE_DEADLINE_MS bounds each); SPIKE_REUSE_HOME boots the same home again.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { bootDsh, runSpike, until, REPO } from './harness.mjs'

const LIST = ['dsh-idle-compact', 'dsh-plugin-save-token', 'smart-compaction', '@openviking/dsh-memory-plugin', 'meow-memory', '@a9i5k4/dsh-auto-memory', '@zilliz/memsearch-dsh', '@michengai/dsh-im-connect', '@zaofan/dsh-qqbot', 'dsh-telegram-notify', 'dsh-slack', 'dsh-plugin-discord', 'dsh-dingtalk-channel']
const specs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : LIST
const port = Number(process.env.SMOKE_PORT ?? 3112)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const reuse = process.env.SPIKE_REUSE_HOME !== undefined

await runSpike('rev12-recheck-' + specs.map((s) => s.replace(/[@/]/g, '_')).join('+').slice(0, 80), async () => {
  const { home } = await bootDsh('rev12recheck', [], { args: ['--no-open', '--port', String(port)], setupProfile: reuse ? undefined : link })
  await until(() => url !== undefined, 30000)
  const base = 'http://127.0.0.1:' + port
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const api = async (p, body) => {
    const init = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }
    const r = await fetch(base + p, { ...init, headers: { cookie, origin: base, 'content-type': 'application/json' } })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await until(async () => (await api('/api/fishball/state')).body?.status === 'live', 120000, 300)
  const entry = async (key) => (await api('/api/fishball/state')).body?.catalog?.plugins?.find((p) => p.plugin === key)
  const results = {}
  for (const spec of specs) {
    const started = Date.now()
    const installed = await api('/api/fishball/install', { spec, requestId: crypto.randomUUID() })
    if (installed.status !== 200) { results[spec] = { install: installed.status, code: installed.body?.code ?? null, ms: Date.now() - started }; continue }
    const key = installed.body.plugin
    let state
    await until(async () => { state = await entry(key); return state?.applied === true || state?.lastError != null || state?.blocked != null || state?.on === false }, 60000, 300).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))
    state = await entry(key)
    results[spec] = {
      install: installed.status, version: installed.body.version, onAfterInstall: installed.body.on, onCode: installed.body.code ?? null,
      on: state?.on ?? null, applied: state?.applied ?? null, waiting: state?.waiting ?? null, lastError: state?.lastError ?? null, blocked: state?.blocked ?? null,
      tools: (state?.tools ?? []).map((t) => t.name + ':' + t.status), ms: Date.now() - started,
    }
    if (state?.on) {
      await api('/api/fishball/plugins', { plugin: key, on: false })
      await until(async () => (await entry(key))?.applied === false, 30000, 300).catch(() => {})
    }
  }
  const status = (await api('/api/fishball/state')).body?.status
  return { pass: status === 'live', home, fishballStatus: status, results }
})
