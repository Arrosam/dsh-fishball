/**
 * P10 smoke (implementer evidence, not the black-box suite): plugin statuses and defaults.
 * New install: a profile-enabled DSH plugin starts off in Fishball (status dsh-disabled,
 * actions [enable]); turning it on gives dsh-enabled/[disable] and leaves the profile alone;
 * add_plugin (allowed) installs a package into Fishball's own folder with the same name as a
 * DSH plugin, runs it in the private tree only, and remove_plugin uninstalls it after the turn.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, model, message, runSpike, until, REPO } from './harness.mjs'

const { scopeOf } = await hostPkg('dsh-scope')
const DEMO = path.join(REPO, 'spikes', 'fixtures', 'demo-plugin')
const ADDED = path.join(REPO, 'test', 'support', 'fixtures', 'fbtest-added')
const link = (dir, name, target, enable) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (enable) pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(target, path.join(dir, 'node_modules', name))
}
await runSpike('P10-smoke', async () => {
  const { ctx, profileDir } = await bootDsh('p10smoke', [], { setupProfile: (dir) => { link(dir, 'dsh-fishball', REPO, true); link(dir, 'fishball-spike-demo', DEMO, true); link(dir, 'fbtest-added', ADDED, false) } })
  const asked = []
  ctx.on('approval/request', async (req) => { asked.push(req.toolName); return 'allowed-once' }, { prepend: true })
  let agent
  const sidOf = () => JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
  await until(() => { try { agent = ctx.agents.get(sidOf()) } catch { agent = undefined } return agent !== undefined && agent.status === 'idle' && model.requestsFor(agent.id).length > 0 }, 30000)
  if (agent === undefined) return { pass: false, error: 'no fishball agent' }
  const visible = () => ctx.tools.schemas(scopeOf(agent.ctx)).map((t) => t.name)
  const profileBefore = fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')
  const results = []
  const turn = async (tool, args) => {
    const id = 'call_' + Math.random().toString(36).slice(2, 8)
    model.queue(agent.id, [{ tool, args, id }], [{ text: 'done' }])
    agent.steer(message('go'))
    await until(() => agent.status === 'running', 3000, 5)
    await until(() => agent.status === 'idle', 60000)
    await new Promise((r) => setTimeout(r, 1500))
    const ev = agent.session.snapshotEvents().filter((e) => e.type === 'tool/result' || e.type === 'tool/end').at(-1)
    results.push({ tool, ev: JSON.stringify(ev?.data ?? null).slice(0, 400) })
  }
  const snap = async () => {
    // list_plugins through a turn would cost a model step; run the tool body directly instead.
    const def = ctx.tools.get('list_plugins', scopeOf(agent.ctx))
    return (await def.execute({}, { agent: agent.ctx, callId: 'x' })).plugins
  }
  const pick = (plugins, key) => { const p = plugins.find((x) => x.plugin === key); return p && { kind: p.kind, status: p.status, actions: p.actions, on: p.on, removing: p.removing } }
  const out = {}
  let plugins = await snap()
  out.start = { demo: pick(plugins, 'fishball-spike-demo'), added: pick(plugins, 'fbtest-added'), web: pick(plugins, 'builtin:web') }
  await turn('set_plugin_enabled', { plugin: 'fishball-spike-demo', on: true })
  plugins = await snap()
  out.demoOn = pick(plugins, 'fishball-spike-demo')
  await turn('add_plugin', { spec: ADDED, reason: 'smoke' })
  plugins = await snap()
  const fbDir = path.join(process.env.DSH_HOME, 'profiles', '.fishball-plugins')
  out.afterAdd = { fishball: pick(plugins, 'fishball:fbtest-added'), dsh: pick(plugins, 'fbtest-added'), folder: fs.existsSync(path.join(fbDir, 'node_modules', 'fbtest-added')), visibleAdded: visible().includes('added_echo'), globalAdded: ctx.tools.get('added_echo') !== undefined }
  await turn('remove_plugin', { plugin: 'fbtest-added', reason: 'smoke' })
  await turn('remove_plugin', { plugin: 'fishball:fbtest-added', reason: 'smoke' })
  await until(() => !fs.existsSync(path.join(fbDir, 'node_modules', 'fbtest-added')), 20000)
  plugins = await snap()
  out.afterRemove = { fishball: pick(plugins, 'fishball:fbtest-added') ?? null, folder: fs.existsSync(path.join(fbDir, 'node_modules', 'fbtest-added')), visibleAdded: visible().includes('added_echo') }
  out.asked = asked
  out.profileUnchanged = fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8') === profileBefore
  out.results = results
  const pass = out.start.demo?.status === 'dsh-disabled' && out.start.demo.actions.join() === 'enable'
    && out.start.web?.on === true && out.demoOn?.status === 'dsh-enabled' && out.demoOn.actions.join() === 'disable'
    && out.afterAdd.fishball?.status === 'installed-in-fishball' && out.afterAdd.fishball.actions.join() === 'disable,uninstall'
    && out.afterAdd.folder && out.afterAdd.visibleAdded && !out.afterAdd.globalAdded
    && out.afterRemove.fishball === null && !out.afterRemove.folder && !out.afterRemove.visibleAdded && out.profileUnchanged
    && asked.filter((t) => t === 'remove_plugin').length === 1
  return { pass, ...out }
})
