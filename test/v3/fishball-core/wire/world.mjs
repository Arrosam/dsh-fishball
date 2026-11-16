/** Standalone DSH worker. Only public host services and installed bundles are inspected. */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { C, runtimeOf } from './constants.mjs'
import { FAKE, FAKE_LLM_MODULE } from '../../../support/constants.mjs'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { until } from '../../../support/util.mjs'
const host = (name) => import(pathToFileURL(path.join(runtimeOf(process.env.FBW_SDK), '@deepseek-ai', name, 'lib/index.js')).href)
const home = fs.realpathSync(process.env.DSH_HOME)
if (!home.startsWith(fs.realpathSync(C.temp)) || !home.includes(C.homesSuffix)) throw new Error('Refusing non-test home')
const profile = path.join(home, 'profiles', C.profile)
const manifest = path.join(profile, 'package.json')
const { runProfile, initializeProfileFromDefault } = await import(pathToFileURL(path.join(runtimeOf(process.env.FBW_SDK), '@deepseek-ai/dsh/lib/profile-boot.js')).href)
const { loadLayeredEnv } = await host('dsh-app-boot')
linkContractForSourceRun()
if (!fs.existsSync(profile)) {
  initializeProfileFromDefault(C.profile, 'web', home)
  const pkg = JSON.parse(fs.readFileSync(manifest, C.encoding))
  const members = JSON.parse(process.env.FBW_MEMBERS)
  const folders = { [C.core]: 'core', [C.ui]: 'fishball-ui', [C.board]: 'board', [C.shared]: 'shared' }
  for (const name of [...members, C.shared]) {
    const dir = path.join(C.repo, 'packages', folders[name])
    pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + dir }
    fs.mkdirSync(path.join(profile, 'node_modules'), { recursive: true })
    fs.symlinkSync(dir, path.join(profile, 'node_modules', name))
  }
  pkg.dsh.profile.bundles.push(...members)
  fs.writeFileSync(manifest, JSON.stringify(pkg))
}
const overlay = path.join(home, 'wire.overlay.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: 'fbtest-llm', name: FAKE_LLM_MODULE }] },
]))
const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: C.profile, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)
const { createUserMessage } = await host('dsh-llm')
const instance = () => ctx.get('fishballInstance')
const manager = () => ctx.agents.get(instance().manager.sessionId())
const shape = (value, depth = C.first) => value == null ? null : typeof value === 'function' ? 'function' : typeof value !== 'object' || depth > 3 ? typeof value : Object.fromEntries(Object.keys(value).map((k) => [k, shape(value[k], depth + C.one)]))
const ops = {
  async ready() { return Boolean(await until(() => instance() && ctx.get('fishballStatus'), C.budget.call, C.budget.poll)) },
  shape: () => ({ apiVersion: instance()?.apiVersion, shape: shape(instance()) }),
  async ensure() { await instance().manager.ensureSession(); const a = instance().manager.sessionId(); await instance().manager.ensureSession(); const b = instance().manager.sessionId(); return { a, b, id: instance().manager.sessionId(), ids: ctx.agents.list().map((a) => a.session.id) } },
  snapshot: () => ctx.get('fishballStatus')?.snapshot(),
  guards: () => instance()?.ui.guards.report(),
  // The settings layers of core's namespace: `user` is what the user saved (DESIGN §20 keeps the
  // generated identity.id out of it), `value` the effective document.
  config: () => { const d = ctx.settings.describe().find((row) => row.ns === C.core); return d === undefined ? null : { value: d.value, user: d.user } },
  async turn() {
    const a = manager(); const before = model.requests.length
    a.steer(createUserMessage({ content: [{ type: 'text', text: C.turn }], source: { kind: 'user' } }))
    await until(() => model.requests.slice(before).some((r) => r.sessionId === a.session.id), C.budget.call, C.budget.poll)
    await a.whenIdle()
    return model.requests.slice(before).filter((r) => r.sessionId === a.session.id)
  },
  /**
   * The manager's tools as its model sees them (the first request of a turn), and DSH's global view.
   * `tools.schemas()` without a scope key is the global view (dsh-tools ScopeKey), so the manager's
   * scoped tools are read from its own request; no public scope key of an agent is used.
   */
  async tools() { const [first] = await ops.turn(); return { local: first?.tools.map((t) => t.name) ?? [], global: ctx.tools.schemas().map((t) => t.name) } },
  /** The model of the manager's next request: the live selection, not the create-time `Agent.options`. */
  async requestModel() { const [first] = await ops.turn(); return first?.model ?? null },
  async mutate({ path: at, value, unset = false }) { await ctx.settings.mutate(C.core, [{ op: unset ? 'unset' : 'set', path: at, ...(unset ? {} : { value }) }]); return true },
  rows: ({ ids }) => ids.map((id) => { const e = [...ctx.loader.entries()].find((e) => e.options?.id === id); return { id, present: Boolean(e), disabled: Boolean(e?.disabled), name: e?.options?.name } }),
  async disableCore() { await ctx.pluginManager.setBundleEnabled(C.core, false); return true },
  async shutdown() { await shutdown.shutdown(C.first); return true },
}
process.on('message', async (msg) => {
  if (msg?.type !== 'call') return
  try { const value = await ops[msg.op](msg.args ?? {}); process.send({ type: 'reply', id: msg.id, ok: true, value: value ?? null }) }
  catch (error) { process.send({ type: 'reply', id: msg.id, ok: false, error: { message: String(error.message) } }) }
})
process.on('disconnect', () => process.exit(C.one))
process.send({ type: 'ready' })
