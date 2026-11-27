/**
 * S32 (revision 10b, DESIGN §4 "Auditing"). First run (S32-private-services-isolated.json): these
 * plugins mounted with their services isolated in a cordis group, but nothing could then use them,
 * so the owner chose to keep them off and say why. This run checks that behaviour, with the real
 * dsh-fishball and DSH's own optional bundles (off in DSH):
 * - each plugin that publishes a service, turned on for Fishball, ends off with `leaks-service`,
 *   then reports `blocked: leaks-service` with no "on" action, and a second "on" is refused;
 * - plugins whose patch edits other rows are reported `blocked` with no "on" action up front.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, runSpike, until, REPO } from './harness.mjs'

const LEAKING = ['inspector-profile', 'voice-input-bundle', 'cot-translation-bundle', 'tool-worktree', 'plugin-market-bundle'].map((n) => '@deepseek-ai/dsh-experimental-' + n)
const BLOCKED = ['agent-team-profile', 'session-titles-bundle'].map((n) => '@deepseek-ai/dsh-experimental-' + n)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }

await runSpike('S32-private-services', async () => {
  await bootDsh('s32', [], {
    args: ['--no-open', '--port', '0'],
    setupProfile: (dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
      pkg.dsh.profile.bundles.push('dsh-fishball')
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
    },
  })
  await until(() => url !== undefined, 20000)
  const base = new URL(url).origin
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const call = async (method, route, body) => (await fetch(base + route, { method, headers: { cookie, origin: base, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json()
  const plugins = async () => (await call('GET', '/api/fishball/state')).catalog?.plugins ?? []
  await until(async () => (await call('GET', '/api/fishball/state')).status === 'live', 60000, 500)

  const out = { leaking: {}, blocked: {} }
  for (const key of LEAKING) {
    const first = await call('POST', '/api/fishball/plugins', { plugin: key, on: true })
    await until(async () => (await plugins()).find((p) => p.plugin === key)?.lastError !== null, 30000, 300).catch(() => {})
    const entry = (await plugins()).find((p) => p.plugin === key)
    const second = await call('POST', '/api/fishball/plugins', { plugin: key, on: true })
    out.leaking[key.slice(30)] = { firstAccepted: first.ok === true, on: entry?.on, lastError: entry?.lastError, blocked: entry?.blocked, actions: entry?.actions, secondRefused: second.ok === false ? second.code : 'accepted' }
  }
  for (const key of BLOCKED) {
    const entry = (await plugins()).find((p) => p.plugin === key)
    out.blocked[key.slice(30)] = { blocked: entry?.blocked, actions: entry?.actions }
  }
  const pass = Object.values(out.leaking).every((p) => p.on === false && p.lastError === 'leaks-service' && p.blocked === 'leaks-service' && p.actions.length === 0 && p.secondRefused === 'refused')
    && Object.values(out.blocked).every((p) => p.blocked === 'edits-other-rows' && p.actions.length === 0)
  return { pass, ...out }
})
