/**
 * Test worker: boots the real installed DSH Web runtime in-process on a
 * throwaway DSH_HOME (env), with the plugin under test linked as a profile
 * bundle, a fixture tools bundle and a scripted fake model. The parent drives
 * it through named operations over the IPC channel. stdin is held open by the
 * parent because DSH's launcher shuts down on stdin EOF.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_LLM_MODULE, FIXTURE_BUNDLE, PACKAGE_NAME, PRESET, PROFILE, REPO, ROW_ID, RUNTIME, SENTINEL_PRESET } from './constants.mjs'
import { fixtureTool, registerFixtures, store } from './fixture-tools.mjs'
import { textOf, until } from './util.mjs'

const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
if (!home || !home.includes(path.join('.runtime', 'test-homes'))) throw new Error('worker refuses a DSH_HOME outside .runtime/test-homes: ' + home)

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
const { createUserMessage } = await hostPkg('dsh-llm')
const { setSandboxMode } = await hostPkg('dsh-sandbox-policy')
const { WorkspaceActiveSessionError } = await hostPkg('dsh-workspace')
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)

/** Add one linked bundle to the profile, as a user-installed plugin would be. */
function link(profileDir, name, target) {
  const file = path.join(profileDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.symlinkSync(target, path.join(profileDir, 'node_modules', name))
}

const profileDir = path.join(home, 'profiles', PROFILE)
// Only the first boot of a home initializes the profile: re-initializing would discard saved settings.
if (!fs.existsSync(profileDir)) {
  initializeProfileFromDefault(PROFILE, 'web', home)
  link(profileDir, FIXTURE_BUNDLE.name, FIXTURE_BUNDLE.dir)
  link(profileDir, PACKAGE_NAME, REPO)
}
// FBTEST_PLUGIN=off boots this home with the plugin installed but its bundle not selected (used to seed state).
setBundleSelected(profileDir, PACKAGE_NAME, process.env.FBTEST_PLUGIN !== 'off')

function setBundleSelected(dir, name, selected) {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bundles = pkg.dsh.profile.bundles.filter((b) => b !== name)
  if (selected) bundles.push(name)
  if (JSON.stringify(bundles) === JSON.stringify(pkg.dsh.profile.bundles)) return
  pkg.dsh.profile.bundles = bundles
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
}
const overlay = path.join(home, 'fbtest.overlay.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [
    { id: 'fbtest-llm', name: FAKE_LLM_MODULE },
    // An ordinary preset with no tools of its own, so the global fixture tools are what its sessions see.
    { id: 'preset-fbtest-bare', name: '@deepseek-ai/dsh-agent-preset', config: { id: PRESET.bare, order: 90, plugins: [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }] } },
  ] },
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })

const tags = new WeakMap()
let tagCounter = 0
const tagOf = (agent) => { if (!tags.has(agent)) tags.set(agent, 'agent-' + ++tagCounter); return tags.get(agent) }
const globalDisposers = new Map()
const scopedDisposers = new Map()
const errorInfo = (e) => ({ name: e?.name ?? null, ctor: e?.constructor?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 400) })

function liveAgent(sessionId) {
  const agent = ctx.agents.get(sessionId)
  if (!agent) throw new Error('no live agent for ' + sessionId)
  return agent
}

/** JSON-safe summary of one session event. */
function eventSummary(e) {
  const out = { type: e.type }
  if (e.type === 'user/message') { out.source = e.data?.source ?? e.data?.message?.source ?? null; out.text = textOf(e.data?.content ?? e.data?.message?.content).slice(0, 2000) }
  if (e.type === 'sandbox/mode') out.mode = e.data?.mode
  if (e.type === 'approval/policy') out.policy = e.data?.policy
  if (e.type === 'tool/result') out.result = { callId: e.data.message.callId, isError: e.data.message.isError, text: textOf(e.data.message.content).slice(0, 2000) }
  if (e.type === 'approval/asked') out.toolName = e.data?.toolName ?? null
  if (e.type === 'turn/end') out.reason = e.data?.reason ?? null
  if (e.type === 'step/end') out.data = JSON.parse(JSON.stringify(e.data ?? null))
  return out
}

const ops = {
  info: () => ({ home, profileDir, pid: process.pid }),

  async sentinelSessions() {
    const list = await ctx.sessionPersistence.list()
    return list.filter((s) => s.header.agentPreset === SENTINEL_PRESET).map((s) => ({ id: s.header.id, cwd: s.header.cwd }))
  },

  async sessionsInDir({ dir }) {
    if (!fs.existsSync(dir)) return []
    const want = fs.realpathSync(dir)
    const real = (p) => { try { return fs.realpathSync(p) } catch { return p } }
    const list = await ctx.sessionPersistence.list()
    return list.filter((s) => s.header.cwd && real(s.header.cwd) === want).map((s) => ({ id: s.header.id, agentPreset: s.header.agentPreset ?? null }))
  },

  async inspect({ sessionId, events = false }) {
    const agent = ctx.agents.get(sessionId)
    const snap = await ctx.sessionPersistence.stat(sessionId)
    const session = agent?.session
    let controllerSame = null
    if (agent) { const r = await ctx.sessionController.resolveAgent(sessionId); controllerSame = r.agent === agent }
    return {
      live: Boolean(agent),
      agentTag: agent ? tagOf(agent) : null,
      status: agent?.status ?? null,
      persisted: Boolean(snap),
      header: JSON.parse(JSON.stringify(snap?.header ?? session?.header ?? null)),
      sandboxMode: session ? ctx.sandboxPolicy.resolve({ session }).mode : null,
      approvalOverride: session ? ctx.approval.overrideOf(session) ?? null : null,
      controllerSame,
      events: events && session ? session.snapshotEvents().map(eventSummary) : null,
    }
  },

  workspaces() {
    const r = ctx.workspaceRegistry
    return { list: r.list().map((w) => ({ id: w.id, path: w.path, title: w.title, sessionIds: [...w.sessionIds] })), pinned: [...r.pinnedSessionIds], archived: [...r.archivedSessionIds] }
  },

  async presets() { return (await ctx.agentPresets.list()).map((p) => p.id) },

  async bundles() {
    return (await ctx.pluginManager.listBundles()).filter((b) => b.name === PACKAGE_NAME).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, rows: b.rows }))
  },

  settingsDescribe() {
    const d = ctx.settings.describe().find((x) => x.ns === ROW_ID)
    return d ? { value: JSON.parse(JSON.stringify(d.value ?? null)), revision: d.revision, applies: d.applies } : null
  },

  async settingsUpdate({ patch, revision }) {
    const rev = revision ?? ctx.settings.describe().find((x) => x.ns === ROW_ID)?.revision
    try { await ctx.settings.update(ROW_ID, patch, rev); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },

  /** Steer one user message into a live agent and wait until it is idle again. */
  async drive({ sessionId, script = [], text = 'fbtest turn', timeoutMs = 20000 }) {
    const agent = liveAgent(sessionId)
    model.queues.delete(sessionId)
    for (const step of script) model.queue(sessionId, step)
    const before = model.requests.length
    const eventsBefore = agent.session.snapshotEvents().length
    agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await until(() => agent.status === 'running', 2000, 5)
    const idle = await until(() => agent.status === 'idle', timeoutMs, 20)
    const events = agent.session.snapshotEvents().slice(eventsBefore).map(eventSummary)
    const leftover = model.queues.get(sessionId)?.length ?? 0
    model.queues.delete(sessionId)
    return {
      idle: Boolean(idle),
      requests: model.requests.slice(before).filter((r) => r.sessionId === sessionId),
      results: events.filter((e) => e.type === 'tool/result').map((e) => e.result),
      asked: events.filter((e) => e.type === 'approval/asked').length,
      turnEnds: events.filter((e) => e.type === 'turn/end').map((e) => e.reason),
      leftover,
    }
  },

  /** Create an ordinary session through DSH's own session controller. */
  async ordinary({ preset, folder = 'work' }) {
    const cwd = path.join(home, 'work', folder)
    fs.mkdirSync(cwd, { recursive: true })
    const created = await ctx.sessionController.create({ cwd, ...(preset ? { agentPreset: preset } : {}) })
    const found = await ctx.sessionController.resolveAgent(created.sessionId)
    return { sessionId: created.sessionId, agentPreset: created.agentPreset ?? null, error: found.error ? errorInfo(found.error) : null }
  },

  registerGlobal({ names }) {
    for (const name of names) globalDisposers.set(name, registerFixtures(ctx, [name]))
    return names
  },
  unregisterGlobal({ names }) {
    for (const name of names) { globalDisposers.get(name)?.(); globalDisposers.delete(name) }
    return names
  },
  /** Register a fixture tool in one agent's own scope (scope-local tools are not masked by restrict). */
  registerScoped({ sessionId, name }) {
    const key = sessionId + ':' + name
    try { scopedDisposers.set(key, liveAgent(sessionId).ctx.tools.register(fixtureTool(name))); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  unregisterScoped({ sessionId, name }) { const key = sessionId + ':' + name; scopedDisposers.get(key)?.(); scopedDisposers.delete(key); return true },

  setSandboxMode({ sessionId, mode }) { setSandboxMode(liveAgent(sessionId).session, mode); return ctx.sandboxPolicy.resolve({ session: liveAgent(sessionId).session }).mode },

  async archive({ sessionId, stopActivity }) {
    try {
      await ctx.workspaceRegistry.archiveSession(sessionId, stopActivity ? { stopActivity: true } : undefined)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errorInfo(e), activeSessionError: e instanceof WorkspaceActiveSessionError, activityKinds: (e?.activity ?? []).map((a) => a.kind) }
    }
  },
  async unarchive({ sessionId }) { await ctx.workspaceRegistry.unarchiveSession(sessionId); return true },
  async unpin({ sessionId }) { await ctx.workspaceRegistry.unpinSession(sessionId); return [...ctx.workspaceRegistry.pinnedSessionIds] },

  /** Create a stored session that never had a turn, in the given folder with the given preset id, then release it. */
  async seedBlankSession({ sessionId, cwd, agentPreset }) {
    fs.mkdirSync(cwd, { recursive: true })
    const handle = await ctx.agents.create({ sessionId, meta: { cwd, agentPreset }, agentOptions: { provider: FAKE.provider, model: FAKE.model } })
    await ctx.sessions.flush(handle.agent.session)
    const types = handle.agent.session.snapshotEvents().map((e) => e.type)
    await handle.dispose()
    return { sessionId, types }
  },

  fixtureCalls({ name, sessionId } = {}) { return store.calls.filter((c) => (!name || c.name === name) && (!sessionId || c.sessionId === sessionId)) },
  fixtureErrors() { return store.registerErrors },
  lifecycle() { return store.lifecycle },
  requests({ sessionId }) { return model.requests.filter((r) => r.sessionId === sessionId) },
  modelTimes() { return { delayStartedAt: model.delayStartedAt ?? null, delayReleasedAt: model.delayReleasedAt ?? null } },
  globalToolNames() { return ctx.tools.schemas().map((t) => t.name).sort() },

  async shutdown() {
    await Promise.race([shutdown.shutdown(0), new Promise((resolve) => setTimeout(resolve, 15000))])
    return true
  },
}

process.on('message', async (msg) => {
  if (!msg || msg.type !== 'call') return
  const op = ops[msg.op]
  try {
    if (!op) throw new Error('unknown worker op ' + msg.op)
    const value = await op(msg.args ?? {})
    process.send({ type: 'reply', id: msg.id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) })
    if (msg.op === 'shutdown') setTimeout(() => process.exit(0), 50)
  } catch (error) {
    process.send({ type: 'reply', id: msg.id, ok: false, error: errorInfo(error) })
  }
})
// A crashed or finished test runner must not leave a DSH process behind.
process.on('disconnect', () => process.exit(1))
process.send({ type: 'ready', pid: process.pid })
