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
const { loadLayeredEnv, loadProfileDirectory, readProfilePatches, reconcileProfilePatches } = await host('dsh-app-boot')
linkContractForSourceRun()
if (!fs.existsSync(profile)) {
  initializeProfileFromDefault(C.profile, 'web', home)
  const pkg = JSON.parse(fs.readFileSync(manifest, C.encoding))
  const members = JSON.parse(process.env.FBW_MEMBERS)
  // SHELVE-BOARD: fishball-board is the suite's stand-in bundle, never the shelved packages/board.
  const folders = { [C.core]: path.join(C.repo, 'packages', 'core'), [C.ui]: path.join(C.repo, 'packages', 'core', 'ui'), [C.board]: C.shelved.standIn, [C.shared]: path.join(C.repo, 'packages', 'shared') }
  // A member may come from another folder (the broken stand-in copy).
  const dirs = JSON.parse(process.env.FBW_DIRS ?? '{}')
  for (const name of [...members, C.shared]) {
    const dir = dirs[name] ?? folders[name]
    pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + dir }
    fs.mkdirSync(path.join(profile, 'node_modules'), { recursive: true })
    fs.symlinkSync(dir, path.join(profile, 'node_modules', name))
  }
  pkg.dsh.profile.bundles.push(...members)
  fs.writeFileSync(manifest, JSON.stringify(pkg))
}
const overlay = path.join(home, 'wire.overlay.yml')
// MULTI-1: FBW_CHILD (JSON `{targetUrl}`) makes this a hosted child for core: a stand-in for the
// instance's child-side row, inserted under its published id, so DSH's settings lists the namespace
// `dsh-instance-child` with that value (link.d.ts "Hosted signal"). Absent: standalone.
const child = process.env.FBW_CHILD ? JSON.parse(process.env.FBW_CHILD) : undefined
// FBW_CHILD_LIVE: the stand-in row lives in the profile's own patch (rewritten at every start),
// so DSH's settings can change its value live (an overlay-owned row refuses settings writes).
const profilePatch = path.join(profile, C.profilePatch)
const corePatch = (config) => ({ id: C.core, name: C.main, config })
if (process.env.FBW_CORE_CONFIG) fs.writeFileSync(profilePatch, JSON.stringify([corePatch(JSON.parse(process.env.FBW_CORE_CONFIG))]))
if (child !== undefined && process.env.FBW_CHILD_LIVE) {
  // Written at every start, as the instance's launch overlay writes the child row's value at every
  // start (src/native-runtime/overlay.js). The profile's patch is a YAML array (DSH writes `[]`);
  // JSON is YAML, so the one entry is written as JSON.
  fs.writeFileSync(profilePatch, JSON.stringify([{ insert: [{ id: C.childRow, name: C.childStandIn, config: child }] }]))
}
fs.writeFileSync(overlay, JSON.stringify([
  { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: 'fbtest-llm', name: FAKE_LLM_MODULE }, ...(child === undefined || process.env.FBW_CHILD_LIVE ? [] : [{ id: C.childRow, name: C.childStandIn, config: child }])] },
]))
const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: C.profile, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)
const { createUserMessage } = await host('dsh-llm')
const instance = () => ctx.get('fishballInstance')
const manager = () => ctx.agents.get(instance().manager.sessionId())
const shape = (value, depth = C.first) => value == null ? null : typeof value === 'function' ? 'function' : typeof value !== 'object' || depth > 3 ? typeof value : Object.fromEntries(Object.keys(value).map((k) => [k, shape(value[k], depth + C.one)]))
// DSH's config editor reconciles these same persisted profile patches after a file edit.
async function replaceProfilePatch(entry, rowId) {
  fs.writeFileSync(profilePatch, JSON.stringify([entry]))
  const context = ctx.profileContext
  await reconcileProfilePatches(ctx.root, readProfilePatches(C.dshName, context, loadProfileDirectory(C.dshName, context.dir, context.installAnchor)), C.dshName, [rowId])
}
const ops = {
  async setCorePatch(config) { await replaceProfilePatch(corePatch(config), C.core); return true },
  async ready() {
    return Boolean(await until(() => instance() && ctx.get('fishballStatus'), C.budget.call, C.budget.poll))
  },
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
  /** MULTI-1: core switched back on in the same DSH (a core startup over the same storage and credentials). */
  async enableCore() { await ctx.pluginManager.setBundleEnabled(C.core, true); return Boolean(await until(() => instance()?.ui?.targets, C.budget.call, C.budget.poll)) },
  /** MULTI-1: core switched off; resolves with the time it resolved (a request after it is a leak). */
  async disableCoreAt() { await ctx.pluginManager.setBundleEnabled(C.core, false); return Date.now() },
  /** MULTI-1: DSH's own shutdown; resolves with the time it resolved. */
  async shutdownAt() { await shutdown.shutdown(C.first); return Date.now() },
  now: () => Date.now(),
  /** MULTI-1: an add() raced with core's close in one turn; answers the add's settled result and the close time. */
  async addThenDisable({ url }) {
    const added = instance().ui.targets.add(url).then((r) => r, (e) => ({ thrown: String(e?.message ?? e) }))
    const closed = ctx.pluginManager.setBundleEnabled(C.core, false).then(() => Date.now())
    const [result, at] = await Promise.all([added, closed])
    return { result, at }
  },
  // ---- MULTI-1: public surfaces only (ui.targets, DSH's credential store, the manager's request tools).
  targets: () => instance()?.ui.targets.list() ?? null,
  async targetAction({ op, args }) { return instance().ui.targets[op](...args) },
  async askCards() { return instance().ui.asks.list() },
  async askAnswer({ handle, answer }) { return instance().ui.asks.answer(handle, answer) },
  async bridgeCall({ pluginId, names, target, name, args }) {
    const b = instance().bridge(pluginId, names, target)
    const supports = b.supports(name)
    let result
    try { result = await b.call(name, args) } catch (e) { result = { thrown: String(e?.message ?? e) } }
    return { supports, result }
  },
  async attention({ pluginId, input, target }) { try { return await instance().attention.signal(pluginId, input, target) } catch (e) { return { thrown: String(e?.message ?? e) } } },
  async credSet({ ref, value }) { await ctx.credentials.set(ref, value); return true },
  async credDescribe({ ref }) { return ctx.credentials.describe(ref) },
  async credRecords() { return (await ctx.credentials.listRecords()).map((e) => ({ key: e.key, kind: e.kind })) },
  async credRecord({ key }) { return ctx.credentials.readRecord(key) },
  /**
   * MULTI-1 fixture: writes one credential record `{kind, payload}` under `key` ('<scope>/<id>')
   * through DSH's own credential API (modifyRecord, its one write path), e.g. persisted material of
   * an earlier endpoint epoch.
   */
  async credWriteRecord({ key, record }) {
    const { credentialKey } = await host('dsh-credentials')
    await ctx.credentials.modifyRecord(credentialKey(...key.split(C.keySeparator)), async () => record)
    return true
  },
  async mutateNs({ ns, path: at, value }) { await ctx.settings.mutate(ns, [{ op: 'set', path: at, value }]); return true },
  /**
   * MULTI-1: the instance writes a new parent URL while the child runs. DSH's config editor refuses a
   * settings write to a row inserted in the same patch (its own merge check), so the profile patch's
   * insert is rewritten and DSH reconciles the profile from disk (its configEditor), as a file edit would.
   */
  async setChildUrl({ url }) {
    await replaceProfilePatch({ insert: [{ id: C.childRow, name: C.childStandIn, config: { [C.childField]: url } }] }, C.childRow)
    return Boolean(await until(() => ctx.settings.describe().find((r) => r.ns === C.childRow)?.value?.[C.childField] === url, C.budget.call, C.budget.poll))
  },
  /** The names and descriptions of the manager's model request tools (one turn). */
  async managerTools() { const [first] = await ops.turn(); return first?.tools.map((t) => ({ name: t.name, description: t.description })) ?? [] },
  /** The manager's system prompt of one turn. */
  async managerSystem() { const [first] = await ops.turn(); return first?.system ?? '' },
  /** The manager model calls `tool` with `args` once; answers the tool-role message the next request carries. */
  async managerCall({ tool, args }) {
    await instance().manager.ensureSession()
    const a = manager(); const before = model.requests.length
    model.queue(a.session.id, [{ tool, args, id: C.multiCallId + before }])
    a.steer(createUserMessage({ content: [{ type: 'text', text: C.turn }], source: { kind: 'user' } }))
    await until(() => model.requests.slice(before).filter((r) => r.sessionId === a.session.id).length >= 2, C.budget.call, C.budget.poll)
    await a.whenIdle()
    const reqs = model.requests.slice(before).filter((r) => r.sessionId === a.session.id)
    return { offered: reqs[0]?.tools.map((t) => t.name) ?? [], result: reqs[1]?.last.filter((m) => m.role === 'tool').at(-1) ?? null }
  },
  /** The ids of the messages DSH queued into the manager's inbox (durable splices of its session log). */
  async managerInboxIds() {
    const a = manager(); await ctx.sessions.flush(a.session)
    const reader = await ctx.sessionPersistence.open(a.session.id, 'read')
    try { return (await reader.read()).events.filter((e) => e.type === C.inboxSpliced).flatMap((e) => (e.data?.inserted ?? []).map((m) => m.id)) } finally { await reader.close() }
  },
  /**
   * WAKE-BATCH: the manager's durable user messages core put there (source kind fishball-event), each as
   * {id, text, time}, and its turn starts (session log, public persistence).
   */
  async managerDeliveries() {
    const a = manager(); await ctx.sessions.flush(a.session)
    const reader = await ctx.sessionPersistence.open(a.session.id, 'read')
    try {
      const events = (await reader.read()).events
      const text = (content) => (content ?? []).map((b) => b?.text ?? '').join('\n')
      return {
        // Core's own messages only (source kind relayed 2026-11-21); DSH's runtime-context block is another kind.
        deliveries: events.filter((e) => e.type === 'user/message' && e.data?.source?.kind === 'fishball-event').map((e) => ({ id: e.data.id, text: text(e.data.content), time: e.time })),
        turns: events.filter((e) => e.type === 'turn/start').length,
      }
    } finally { await reader.close() }
  },
  /** The manager session's ids (one manager, MULTI-1 requirement 11). */
  agents: () => ctx.agents.list().map((x) => x.session.id),
  async shutdown() { await shutdown.shutdown(C.first); return true },
}
process.on('message', async (msg) => {
  if (msg?.type !== 'call') return
  try { const value = await ops[msg.op](msg.args ?? {}); process.send({ type: 'reply', id: msg.id, ok: true, value: value ?? null }) }
  catch (error) { process.send({ type: 'reply', id: msg.id, ok: false, error: { message: String(error.message) } }) }
})
process.on('disconnect', () => process.exit(C.one))
process.send({ type: 'ready' })
