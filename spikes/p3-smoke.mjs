/**
 * P3 smoke (implementer evidence, not the black-box suite). Boots a Web profile with
 * dsh-fishball linked, a profile-wide demo plugin (demo_echo: unchecked) and the same demo
 * installed-but-off as a second package (Fishball-only candidate). Checks: catalog contents,
 * default built-ins, mask decisions, set_plugin_enabled off/on with an approval answered by
 * a prepended approval/request listener, and the Fishball-only mount.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, model, message, runSpike, until, REPO } from './harness.mjs'

const { scopeOf } = await hostPkg('dsh-scope')
const DEMO = path.join(REPO, 'spikes', 'fixtures', 'demo-plugin')
const OFF = path.join(REPO, '.runtime', 'p3-off-plugin')
fs.rmSync(OFF, { recursive: true, force: true })
fs.mkdirSync(OFF, { recursive: true })
fs.writeFileSync(path.join(OFF, 'package.json'), JSON.stringify({ name: 'fishball-p3-off', version: '0.0.1', type: 'module', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
fs.writeFileSync(path.join(OFF, 'cordis.patch.yml'), "- insert:\n    - id: p3-off\n      name: 'fishball-p3-off'\n")
fs.writeFileSync(path.join(OFF, 'index.js'), "export const name='fishball-p3-off'; export const inject=['tools']; export function apply(ctx){ globalThis.__p3OffApplies=(globalThis.__p3OffApplies??0)+1; ctx.tools.register({ name:'off_echo', description:'Echo (fishball-only fixture).', parameters:{type:'object',properties:{text:{type:'string'}}}, output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:String(v)}]}, async execute(a){ return String(a.text) } }) }\n")
const link = (dir, name, target, enable) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (enable) pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(target, path.join(dir, 'node_modules', name))
}
await runSpike('P3-smoke', async () => {
  const { ctx } = await bootDsh('p3smoke', [], { setupProfile: (dir) => { link(dir, 'dsh-fishball', REPO, true); link(dir, 'fishball-spike-demo', DEMO, true); link(dir, 'fishball-p3-off', OFF, false) } })
  let answer = 'allowed-once'
  const asked = []
  ctx.on('approval/request', async (req, next) => { asked.push({ tool: req.toolName, reason: req.reason }); return answer }, { prepend: true })
  let agent
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  await until(() => { try { agent = ctx.agents.get(sidOf()) } catch { agent = undefined } return agent !== undefined && agent.status === 'idle' && model.requestsFor(agent.id).length > 0 }, 30000)
  if (agent === undefined) return { pass: false, error: 'no fishball agent' }
  const sid = agent.id
  const visible = () => ctx.tools.schemas(scopeOf(agent.ctx)).map((t) => t.name).sort()
  const out = { visibleAtStart: visible() }
  const call = async (tool, args) => {
    model.queue(sid, [{ tool, args }], [{ text: 'ok' }])
    agent.steer(message('go'))
    await until(() => agent.status === 'running', 3000, 5)
    await until(() => agent.status === 'idle', 20000)
    const results = agent.session.snapshotEvents().filter((e) => e.type === 'tool/result')
    return results.at(-1)?.data?.message?.content?.map((b) => b.text).join('')
  }
  out.list = JSON.parse(await call('list_plugins', {}))
  out.offDemo = JSON.parse(await call('set_plugin_enabled', { plugin: 'fishball-spike-demo', on: false }))
  await until(() => !visible().includes('demo_echo'), 3000)
  out.visibleAfterOff = visible()
  answer = 'rejected'
  out.onDemoRejected = JSON.parse(await call('set_plugin_enabled', { plugin: 'fishball-spike-demo', on: true }))
  out.visibleAfterReject = visible()
  answer = 'allowed-once'
  out.onDemoAllowed = JSON.parse(await call('set_plugin_enabled', { plugin: 'fishball-spike-demo', on: true }))
  await until(() => visible().includes('demo_echo'), 3000)
  out.visibleAfterAllow = visible()
  out.onOff = JSON.parse(await call('set_plugin_enabled', { plugin: 'fishball-p3-off', on: true }))
  await until(() => visible().includes('off_echo'), 3000)
  out.visibleAfterFishballOnly = visible()
  out.offApplies = globalThis.__p3OffApplies ?? 0
  out.globalHasOffEcho = ctx.tools.schemas().some((t) => t.name === 'off_echo')
  out.asked = asked
  out.requestToolsLast = (model.requestsFor(sid).at(-1)?.tools ?? []).map((t) => t.name).sort()
  out.storeFile = JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).tables
  const v = out.list.plugins?.map((p) => [p.plugin, p.kind, p.on, p.applied]) ?? []
  out.catalogSummary = v.filter(([k]) => !k.startsWith('@deepseek-ai/'))
  out.list2 = JSON.parse(await call('list_plugins', {}))
  out.demoAfter = out.list2.plugins.find((p) => p.plugin === 'fishball-spike-demo')
  out.otherToolsAfter = out.list2.otherTools
  delete out.list2
  return { pass: out.visibleAfterAllow.includes('demo_echo') && !out.visibleAfterReject.includes('demo_echo') && !out.visibleAfterOff.includes('demo_echo') && out.visibleAfterFishballOnly.includes('off_echo') && !out.globalHasOffEcho && out.asked.length === 3, ...out }
})