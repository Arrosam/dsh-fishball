/**
 * P8 smoke (implementer evidence, not the black-box suite). ctx.fishball (DESIGN §8, R5):
 * - the example source plugin enabled for everyone delivers its notes once, each waking Fishball,
 *   although it loads before Fishball is live (onEnabled);
 * - a loader fixture (spikes/fixtures/source-direct.mjs) checks duplicate, invalid input, limits;
 * - turning the example off for Fishball disables its source (settings feed), its code still runs;
 * - the example as a Fishball-only plugin runs only while Fishball has it on, keeps the same
 *   source identity, and stops when turned off.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, runSpike, until, REPO } from './harness.mjs'

const EXAMPLE = path.join(REPO, 'examples', 'fishball-source-example')
const link = (dir, name, target, enable) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (enable) pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(target, path.join(dir, 'node_modules', name))
}
const port = Number(process.env.SMOKE_PORT ?? 3101)
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }

await runSpike('P8-smoke', async () => {
  const notes = [{ id: 'n1', title: 'Lunch with Ana', body: 'Ana asks about lunch on Friday.' }, { id: 'n2', title: 'Invoice due', body: 'Invoice 42 is due tomorrow.' }]
  const onlyFishball = process.env.P8_FISHBALL_ONLY === '1'
  const rows = [{ insert: [{ id: 'source-direct', name: path.join(REPO, 'spikes', 'fixtures', 'source-direct.mjs') }] }]
  if (!onlyFishball) rows.unshift({ id: 'fishball-source-example', config: { notes } })
  const { ctx } = await bootDsh('p8smoke', rows, { args: ['--no-open', '--port', String(port)], setupProfile: (dir) => { link(dir, 'dsh-fishball', REPO, true); link(dir, 'fishball-source-example', EXAMPLE, !onlyFishball) } })
  await until(() => url !== undefined, 5000)
  const base = 'http://127.0.0.1:' + port
  const login = await fetch(url, { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const api = async (p, body) => {
    const init = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }
    const r = await fetch(base + p, { ...init, headers: { cookie, origin: base, 'content-type': 'application/json' } })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  let fishball
  await until(() => { try { fishball = ctx.agents.get(sidOf()) } catch { fishball = undefined } return fishball !== undefined && fishball.status === 'idle' && model.requestsFor(fishball.id).length > 0 }, 30000)
  if (fishball === undefined) return { pass: false, error: 'no fishball agent' }
  const out = { onlyFishball }
  const pluginNotices = () => fishball.session.snapshotEvents().filter((e) => e.type === 'user/message' && String(e.data?.content?.[0]?.text ?? '').includes('an event from the plugin source "Example notes"'))
  const exampleSource = async () => (await api('/api/fishball/state')).body.sources.sources.find((s) => s.title === 'Example notes')
  const exampleRunning = () => [...ctx.loader.entries()].some((e) => e.options.name === 'fishball-source-example' && e.fiber?.state === 2)
  const turn = async (steps) => {
    model.queue(fishball.id, ...steps)
    fishball.steer(message('go'))
    await until(() => fishball.status === 'running', 3000, 5)
    await until(() => fishball.status === 'idle', 20000)
    await new Promise((r) => setTimeout(r, 500))
  }

  if (onlyFishball) {
    // Fishball-only: its rows live in Fishball's private tree (not among the host loader's
    // entries), so "running" is read from its registered source: present only while its code runs.
    const exampleRunning = async () => (await exampleSource()) !== undefined
    out.runningBefore = await exampleRunning()
    await turn([[{ tool: 'set_plugin_enabled', id: 'on_example', args: { plugin: 'fishball-source-example', on: true } }], [{ text: 'ok' }]])
    out.runningWhenOn = await exampleRunning()
    out.sourceWhenOn = await exampleSource()
    await turn([[{ tool: 'set_plugin_enabled', id: 'off_example', args: { plugin: 'fishball-source-example', on: false } }], [{ text: 'ok' }]])
    out.runningWhenOff = await exampleRunning()
    out.sourceWhenOff = (await exampleSource()) ?? null
    const pass = !out.runningBefore && out.runningWhenOn && out.sourceWhenOn?.enabled === true
      && out.sourceWhenOn?.identity === 'fishball-source-example/fishball-source-example/notes' && !out.runningWhenOff && out.sourceWhenOff === null
    return { pass, ...out }
  }

  await until(() => pluginNotices().length >= 2 && fishball.status === 'idle', 20000)
  out.delivered = pluginNotices().length
  await until(() => (globalThis.__p8Direct ?? {}).done, 15000)
  out.direct = globalThis.__p8Direct
  out.sourceBefore = await exampleSource()
  await turn([[{ tool: 'set_plugin_enabled', id: 'off_example', args: { plugin: 'fishball-source-example', on: false } }], [{ text: 'ok' }]])
  out.sourceAfterOff = await exampleSource()
  out.runningAfterOff = exampleRunning()
  const d = out.direct ?? {}
  const pass = out.delivered === 2 && out.sourceBefore?.enabled === true && out.sourceBefore?.identity === 'fishball-source-example/fishball-source-example/notes'
    && out.sourceAfterOff?.enabled === false && out.runningAfterOff
    && d.first?.status === 'accepted' && d.again?.status === 'duplicate' && d.dup === 'FISHBALL_SOURCE_DUPLICATE' && d.longTitle === 'FISHBALL_TOO_LARGE'
    && d.noKey === 'FISHBALL_INVALID' && d.badTime === 'FISHBALL_INVALID' && d.badId === 'FISHBALL_INVALID' && d.limit === 'FISHBALL_LIMIT'
  return { pass, ...out }
})
