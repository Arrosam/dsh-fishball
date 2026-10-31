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
import { APPROVER_HOLDS, APPROVER_THROWS, ASK_REASON, ASK_TOOL, EXAMPLE, FAKE, FAKE_LLM_MODULE, FIXTURE_BUNDLE, INSTALL_EVENTS, MANAGER_BUNDLES, ONLY_BUNDLES, OUTCOME, PACKAGE_NAME, PRESET, PROFILE, REPO, REVIEW_BUNDLES, ROW_ID, RUNTIME, SENTINEL_PRESET, SOURCE_BUNDLES, SOURCE_ROW, SPOOF_MODULE, SPOOF_ROWS } from './constants.mjs'
import { fixtureTool, plainConfig, registerFixtures, store } from './fixture-tools.mjs'
import { textOf, until } from './util.mjs'

const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
const APPROVER_AFTER = process.env.FBTEST_APPROVER_AFTER === '1'
const SOURCES = process.env.FBTEST_SOURCES === '1'
const EXAMPLE_MODE = process.env.FBTEST_EXAMPLE ?? null
/**
 * P8 R5: the example is linked from a folder in the home that holds the example's own files, with
 * its notes (FBTEST_EXAMPLE_NOTES) written into the row config of its bundle patch: a Fishball-only
 * plugin's rows are read from its bundle patch, so a profile edit could not reach them. index.js is
 * a symlink, so Node resolves it (and its imports) at its real path in examples/.
 */
function exampleDir() {
  const dir = path.join(home, 'example-plugin')
  fs.mkdirSync(dir, { recursive: true })
  for (const f of ['index.js', 'package.json', 'README.md']) if (!fs.existsSync(path.join(dir, f))) fs.symlinkSync(path.join(EXAMPLE.dir, f), path.join(dir, f))
  // Rewritten at every boot, so a restart can carry other notes (the user edited the config while DSH was down).
  const notes = JSON.parse(process.env.FBTEST_EXAMPLE_NOTES ?? '[]')
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: EXAMPLE.row, name: EXAMPLE.name, config: { notes } }] }], null, 2))
  return dir
}
if (!home || !home.includes(path.join('.runtime', 'test-homes'))) throw new Error('worker refuses a DSH_HOME outside .runtime/test-homes: ' + home)

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
const { createUserMessage } = await hostPkg('dsh-llm')
const { setSandboxMode } = await hostPkg('dsh-sandbox-policy')
const { WorkspaceActiveSessionError } = await hostPkg('dsh-workspace')
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)

/** Add one linked bundle to the profile, as a user-installed plugin would be; enabled=false leaves it installed but off. */
function link(profileDir, name, target, enabled = true) {
  const file = path.join(profileDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (enabled) pkg.dsh.profile.bundles.push(name)
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
  // P3: installed in the profile but not enabled there, so they are Fishball-only candidates.
  for (const b of Object.values(ONLY_BUNDLES)) link(profileDir, b.name, b.dir, false)
  // Post-review: the defective Fishball-only candidates, only in homes that ask for them.
  if (process.env.FBTEST_REVIEW_BUNDLES === '1') for (const b of Object.values(REVIEW_BUNDLES)) link(profileDir, b.name, b.dir, false)
  // P8: the source fixtures (profile-wide, static inject, Fishball-only), only in homes that ask for them.
  if (SOURCES) for (const [kind, b] of Object.entries(SOURCE_BUNDLES)) link(profileDir, b.name, b.dir, kind !== 'only')
  // P8 R5: the example plugin, for everyone or Fishball-only (FBTEST_EXAMPLE), with its notes (see exampleDir).
  if (EXAMPLE_MODE) link(profileDir, EXAMPLE.name, exampleDir(), EXAMPLE_MODE === 'everyone')
  // P12: the settings fixtures (fishball-only with every field kind, on in DSH, invalid patch), only in homes that ask for them.
  if (process.env.FBTEST_MANAGER === '1') for (const b of Object.values(MANAGER_BUNDLES)) link(profileDir, b.name, b.dir, b.enabled)
} else if (EXAMPLE_MODE) exampleDir()
/**
 * Plugin statuses: FBTEST_PLUGIN_DIR links dsh-fishball to another checkout (the previous version, for the
 * existing-install cases); every boot re-points the link, so the same home can boot the old and the new version.
 * FBTEST_LINK (JSON [{name, dir, enabled}]) links further bundles on this boot when the profile lacks them
 * (a bundle installed while DSH was down).
 */
relinkPlugin(profileDir, process.env.FBTEST_PLUGIN_DIR ?? REPO)
for (const b of JSON.parse(process.env.FBTEST_LINK ?? '[]')) {
  const deps = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')).dependencies ?? {}
  if (!Object.hasOwn(deps, b.name)) link(profileDir, b.name, b.dir, b.enabled)
}

function relinkPlugin(dir, target) {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (pkg.dependencies?.[PACKAGE_NAME] !== 'link:' + target) {
    pkg.dependencies = { ...pkg.dependencies, [PACKAGE_NAME]: 'link:' + target }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
  }
  const linkPath = path.join(dir, 'node_modules', PACKAGE_NAME)
  let current = null
  try { current = fs.readlinkSync(linkPath) } catch { /* missing */ }
  if (current === target) return
  fs.rmSync(linkPath, { force: true })
  fs.symlinkSync(target, linkPath)
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
  // P11: FBTEST_TITLE_MAX_BYTES raises DSH's title byte cap (80 in dsh-base), so a test can give a session a title
  // longer than the 200-byte author-name bound. The other two fields repeat dsh-base's values.
  ...(process.env.FBTEST_TITLE_MAX_BYTES ? [{ id: 'session-title', config: { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: Number(process.env.FBTEST_TITLE_MAX_BYTES) } }] : []),
  { insert: [
    { id: 'fbtest-llm', name: FAKE_LLM_MODULE },
    // An ordinary preset with no tools of its own, so the global fixture tools are what its sessions see.
    { id: 'preset-fbtest-bare', name: '@deepseek-ai/dsh-agent-preset', config: { id: PRESET.bare, order: 90, plugins: [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }] } },
    // Post-review change 11: host rows whose ids look like private-tree ids.
    ...(process.env.FBTEST_SPOOF_ROWS === '1' ? SPOOF_ROWS.map((r) => ({ id: r.id, name: SPOOF_MODULE, config: { tool: r.tool } })) : []),
    // P8: a plain host row (no catalog plugin owns it) that uses ctx.fishball.
    ...(SOURCES ? [{ id: SOURCE_ROW.id, name: SOURCE_ROW.module, config: { label: SOURCE_ROW.label } }] : []),
  ] },
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })

/**
 * Scripted approver standing in for the person at DSH's stock prompt: a prepended
 * host-level approval/request answerer (the S12 position) that records every
 * question and answers with the current outcome. Default 'rejected', so an
 * unexpected prompt never hangs a turn.
 */
const approver = { outcome: process.env.FBTEST_APPROVAL ?? OUTCOME.reject, queue: [], held: [], seen: [] }
function answerQuestion(req) {
  // A queued answer (one per question, in order) wins over the standing outcome.
  const answer = approver.queue.length > 0 ? approver.queue.shift() : approver.outcome
  approver.seen.push({ sessionId: req.agent?.id ?? null, toolName: req.toolName, callId: req.callId ?? null, reason: req.reason ?? null, answered: answer, at: Date.now() })
  if (answer === APPROVER_THROWS) throw new Error('fbtest approver failed')
  // Hold the question open until the test calls releaseApproval (a person who has not clicked yet).
  if (answer === APPROVER_HOLDS) return new Promise((resolve) => approver.held.push(resolve))
  return answer
}
/**
 * P7: with FBTEST_APPROVER_AFTER=1 the scripted answerer stands in for the browser prompt AFTER
 * Fishball's broker: fbtest-tools (mounted before dsh-fishball) registers the prepended listener at
 * boot and calls this function, so the broker (prepended later) runs first and its next() reaches it.
 * Otherwise the worker's own listener, prepended after every row, answers before the broker.
 */
if (APPROVER_AFTER) store.answerQuestion = answerQuestion
else ctx.on('approval/request', (req) => answerQuestion(req), { prepend: true })

/**
 * P7: an asking tool for ordinary sessions, registered from the root (unattributed, so Fishball never
 * sees it). Its body asks through ctx.approval.request with its own call id, as DSH's sandbox
 * escalation does. nocall omits the call id, fakecall names a call id that is not in the log, and
 * as asks under another tool name than the call's (the call was to a different tool).
 */
if (APPROVER_AFTER) {
  store.asks ??= []
  ctx.tools.register({
    name: ASK_TOOL,
    description: 'fbtest asking tool. Asks for permission in its body.',
    parameters: { type: 'object', properties: { text: { type: 'string' }, pad: { type: 'string' }, nocall: { type: 'boolean' }, fakecall: { type: 'boolean' }, as: { type: 'string' } }, required: ['text'] },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
    async execute(args, exec) {
      const callId = args.nocall ? undefined : args.fakecall ? 'call_fbtest_nowhere' : exec.callId
      const entry = { sessionId: exec.agent?.id ?? null, callId: exec.callId, text: args.text, askedAt: Date.now(), outcome: null }
      store.asks.push(entry)
      const outcome = await ctx.get('approval').request({ agent: exec.agent, toolName: args.as ?? ASK_TOOL, ...(callId ? { callId } : {}), reason: ASK_REASON(args.text), signal: exec.signal })
      entry.outcome = outcome
      entry.decidedAt = Date.now()
      return 'outcome=' + outcome
    },
  })
}

/** Revision 10a: DSH's install progress events on the host bus, so a test can see which request id they carry. */
store.installEvents ??= []
for (const type of [INSTALL_EVENTS.state, INSTALL_EVENTS.log]) {
  ctx.on(type, (payload) => {
    let json
    try { json = JSON.parse(JSON.stringify(payload ?? null)) } catch { json = null }
    store.installEvents.push({ type, requestId: payload?.requestId ?? null, phase: payload?.phase ?? null, at: Date.now(), json })
  })
}

const tags = new WeakMap()
let tagCounter = 0
const tagOf = (agent) => { if (!tags.has(agent)) tags.set(agent, 'agent-' + ++tagCounter); return tags.get(agent) }
const globalDisposers = new Map()
const serviceDisposers = new Map()
const scopedDisposers = new Map()
/** P8: sources registered through sourceRegister, by key. */
const sources = new Map()
const errorInfo = (e) => ({ name: e?.name ?? null, ctor: e?.constructor?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 400) })

function liveAgent(sessionId) {
  const agent = ctx.agents.get(sessionId)
  if (!agent) throw new Error('no live agent for ' + sessionId)
  return agent
}

/** JSON-safe summary of one session event. */
function eventSummary(e) {
  const out = { type: e.type }
  if (e.type === 'user/message') { out.source = e.data?.source ?? e.data?.message?.source ?? null; out.text = textOf(e.data?.content ?? e.data?.message?.content).slice(0, 12000); out.textLength = textOf(e.data?.content ?? e.data?.message?.content).length }
  if (e.type === 'sandbox/mode') out.mode = e.data?.mode
  if (e.type === 'tool/result') out.result = { callId: e.data.message.toolCallId ?? e.data.message.callId, isError: e.data.message.isError, text: textOf(e.data.message.content).slice(0, 400000) }
  if (e.type === 'approval/asked') { out.toolName = e.data?.toolName ?? null; out.id = e.data?.id ?? null; out.callId = e.data?.callId ?? null }
  if (e.type === 'approval/decided') { out.id = e.data?.id ?? null; out.outcome = e.data?.outcome ?? null }
  if (e.type === 'approval/policy') out.policy = e.data?.policy
  if (e.type === 'turn/end') out.reason = e.data?.reason ?? null
  if (e.type === 'step/end') out.data = JSON.parse(JSON.stringify(e.data ?? null))
  if (e.type === 'assistant/message') out.text = textOf(e.data?.content ?? e.data?.message?.content).slice(0, 2000)
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
    // P12: DSH's tool-result pruner appends a shortened replacement of an earlier tool result, each
    // immediately after a compaction/prune event (dsh-compaction-tool-result-pruner). Those replacements are
    // not results of this turn's calls, so they are left out of `results`.
    const all = agent.session.snapshotEvents()
    const replacements = new Set(all.flatMap((e, i) => (e.type === 'tool/result' && all[i - 1]?.type === 'compaction/prune' ? [i] : [])))
    const events = all.slice(eventsBefore).map(eventSummary)
    const turnResults = all.slice(eventsBefore).flatMap((e, i) => (e.type === 'tool/result' && !replacements.has(eventsBefore + i) ? [eventSummary(e).result] : []))
    const leftover = model.queues.get(sessionId)?.length ?? 0
    model.queues.delete(sessionId)
    return {
      idle: Boolean(idle),
      // P4: compaction events of this turn, and the auxiliary calls made for this session during it.
      compactions: events.filter((e) => e.type.startsWith('compaction/')).map((e) => e.type),
      assistantTexts: events.filter((e) => e.type === 'assistant/message').map((e) => e.text),
      userLengths: events.filter((e) => e.type === 'user/message').map((e) => e.textLength),
      requests: model.requests.slice(before).filter((r) => r.sessionId === sessionId),
      results: turnResults,
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

  /** Register fixture tools globally; asFixture registers them as the fbtest-tools plugin (attributable), else from the root (no plugin). */
  registerGlobal({ names, asFixture = false }) {
    const owner = asFixture ? store.fixtureCtx : ctx
    if (!owner) throw new Error('fbtest-tools context not captured')
    for (const name of names) globalDisposers.set(name, registerFixtures(owner, [name]))
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

  // ---- P3 operations ----
  /** Answer the oldest held approval question; returns false when none is held. */
  releaseApproval({ outcome }) { const resolve = approver.held.shift(); resolve?.(outcome); return Boolean(resolve) },
  heldApprovals() { return approver.held.length },
  setApprover({ outcome, queue = [] }) { approver.outcome = outcome; approver.queue = [...queue]; return outcome },
  approvals({ sessionId } = {}) { return approver.seen.filter((a) => !sessionId || a.sessionId === sessionId) },
  agentScoped() { return store.agentScoped ?? [] },
  bundleEvents({ bundle } = {}) { return store.bundleEvents.filter((e) => !bundle || e.bundle === bundle) },

  /** Every bundle DSH's plugin manager lists, with the fields the catalog requirement refers to. */
  async allBundles() {
    return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, optional: b.optional, availability: b.availability, overrides: b.overrides, rows: b.rows.map((r) => r.rowId) }))
  },

  /** Provide a host service from the root context (post-review change 1: rows waiting for it can start). */
  provideService({ name }) { serviceDisposers.set(name, ctx.provide(name, { fbtest: true })); return true },

  /** Install a local package through DSH's own plugin manager while DSH runs (post-review change 13). */
  async installBundle({ spec, enabled }) {
    const r = await ctx.pluginManager.installBundle(spec, { enabled })
    return { changed: r.changed, application: r.application, stage: r.stage, bundle: r.bundle ?? null, enabled: r.enabled ?? null, error: r.error ? JSON.parse(JSON.stringify(r.error)) : null }
  },

  /** Plugin statuses: remove a bundle from the DSH profile through DSH's plugin manager while DSH runs. */
  async removeBundle({ name }) {
    const r = await ctx.pluginManager.removeBundle(name)
    return { changed: r.changed, application: r.application, stage: r.stage, error: r.error ? JSON.parse(JSON.stringify(r.error)) : null }
  },

  /** Re-register one fbtest-tools tool AS that plugin, with other parameters (R7: a plugin update changing a schema). */
  reregisterFixture({ name, parameters }) {
    const fixtureCtx = store.fixtureCtx
    if (!fixtureCtx) throw new Error('fbtest-tools context not captured')
    store.fixtureRegs.get(name)?.()
    store.fixtureRegs.set(name, fixtureCtx.tools.register(fixtureTool(name, parameters)))
    return true
  },

  // ---- P4 operations ----
  aux({ sessionId, purpose } = {}) { return model.aux.filter((a) => (!sessionId || a.sessionId === sessionId) && (!purpose || a.purpose === purpose)) },
  /** Every compaction/* event type in a session's log so far. */
  compactionEvents({ sessionId }) {
    const agent = ctx.agents.get(sessionId)
    return agent ? agent.session.snapshotEvents().filter((e) => e.type.startsWith('compaction/')).map((e) => e.type) : null
  },
  /** Change a fake model's window (null = no window); replace() publishes llm/adapters-updated. */
  setModelWindow({ model: id = FAKE.model, window }) {
    model.windows[id] = window ?? undefined
    model.adapterHandle?.replace([FAKE.provider])
    return true
  },
  /** C10: make exact-model lookups of one model fail ('throw'), hang ('hang') or work again (null). */
  setLookupFailure({ model: id = FAKE.model, mode, hangMs }) { if (mode) model.lookupFailure[id] = mode; else delete model.lookupFailure[id]; model.lookupHangMs = hangMs; return true },
  lookupCount() { return model.lookups },
  prepareDelay() { return model.prepareDelayed ?? null },
  /** C12: make compaction summary calls answer no text (DSH then fails the summary). */
  setCompactionFailure({ on }) { model.compactionFails = Boolean(on); return true },
  /** C15: when the boot-time window flip happened, if at all. */
  windowFlip() { return model.flipped ?? null },
  /** Pick another model for a session the way DSH's model picker does (also saves DSH's default). */
  async selectModel({ sessionId, model: id }) {
    try { return { ok: true, value: await ctx.sessionController.selectModel({ sessionId, provider: FAKE.provider, model: id }) } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Hold the next conversation request of a session until releaseHold (a turn in progress). */
  holdNext({ sessionId }) { model.holds ??= new Map(); model.holds.set(sessionId, null); return true },
  isHeld({ sessionId }) { return typeof model.holds?.get(sessionId) === 'function' },
  releaseHold({ sessionId }) { const r = model.holds?.get(sessionId); model.holds?.delete(sessionId); if (typeof r === 'function') r(); return typeof r === 'function' },
  /** Steer a message without waiting; pair with waitIdle. */
  driveStart({ sessionId, text = 'fbtest turn', script = [], source = { kind: 'user' } }) {
    const agent = liveAgent(sessionId)
    model.queues.delete(sessionId)
    for (const step of script) model.queue(sessionId, step)
    // P7: source lets a test start a turn that the user did not start (an agent relay).
    agent.steer(createUserMessage({ content: [{ type: 'text', text }], source }))
    return true
  },
  async waitIdle({ sessionId, timeoutMs = 20000 }) {
    const agent = liveAgent(sessionId)
    await until(() => agent.status === 'running', 2000, 5)
    return Boolean(await until(() => agent.status === 'idle', timeoutMs, 20))
  },
  /** The last turn/end reason of a session. */
  lastTurnEnd({ sessionId }) { const e = liveAgent(sessionId).session.snapshotEvents().filter((x) => x.type === 'turn/end').at(-1); return e?.data?.reason ?? null },

  // ---- P5 operations ----
  /** Queue scripted answers for any request whose latest user message contains marker. */
  queueMarker({ marker, script = [], except = null }) { model.markers.set(marker, { script: [...script], except, sessions: new Set() }); return true },
  /** The sessions that took a marker's answers, and how many answers are left. */
  markerState({ marker }) { const e = model.markers.get(marker); return e ? { sessions: [...e.sessions], left: e.script.length } : null },
  /** Every recorded conversation request whose message text contains a needle (any session). */
  requestsContaining({ needle }) { return model.requests.filter((r) => r.texts.includes(needle)).map((r) => ({ sessionId: r.sessionId, tools: r.tools.map((t) => t.name), system: r.system.slice(0, 300) })) },
  /** Make a stored session live again through DSH's session controller (as opening it in the GUI does). */
  async resume({ sessionId }) {
    // Right after a boot the session controller service may not be provided yet.
    await until(() => ctx.sessionController, 15000, 50)
    const r = await ctx.sessionController.resolveAgent(sessionId); return { live: Boolean(ctx.agents.get(sessionId)), error: r.error ? errorInfo(r.error) : null } },
  /** Stored header of any session (live or not). */
  async header({ sessionId }) { const s = await ctx.sessionPersistence.stat(sessionId); return s ? JSON.parse(JSON.stringify(s.header)) : null },
  /** Every stored session id. */
  async allSessions() { return (await ctx.sessionPersistence.list()).map((s) => ({ id: s.header.id, cwd: s.header.cwd ?? null, agentPreset: s.header.agentPreset ?? null })) },
  /** The live agent's status, or null when the session has no live agent. */
  agentStatus({ sessionId }) { return ctx.agents.get(sessionId)?.status ?? null },
  /** Register a DSH workspace for an existing folder (start_session may name it by id). */
  async createWorkspace({ dir }) { fs.mkdirSync(dir, { recursive: true }); const w = await ctx.workspaceRegistry.create(dir); return { id: w.id, path: w.path } },
  /** Every user/message of a session's stored log (live or not), summarized. */
  async userMessages({ sessionId }) {
    const agent = ctx.agents.get(sessionId)
    if (agent) return agent.session.snapshotEvents().filter((e) => e.type === 'user/message').map(eventSummary)
    return null
  },
  /** DSH's configured default preset id, as an ordinary create with no preset reports it. */
  defaultPreset() { return ctx.agentPresets.defaultId },

  // ---- P6 operations ----
  /** Cancel a live agent's running turn the way the GUI's Stop does (the turn ends 'aborted'). */
  cancel({ sessionId }) { liveAgent(sessionId).cancel({ kind: 'user' }); return true },
  /** Reject the next proposed step of one session once (an agent/pre-step reject: the turn ends 'blocked'). */
  rejectNextStep({ sessionId }) {
    let armed = true
    const dispose = ctx.on('agent/pre-step', (payload, next) => {
      if (armed && payload.agent?.id === sessionId) { armed = false; queueMicrotask(() => dispose()); return Promise.resolve({ kind: 'reject' }) }
      return next()
    })
    return true
  },
  /** Queue an ordinary follow-up turn (it runs after the current turn, before the agent goes idle). */
  followup({ sessionId, text }) { liveAgent(sessionId).followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })); return true },
  /** Flush a live session's log to disk (before a hard kill). */
  async flush({ sessionId }) { await ctx.sessions.flush(liveAgent(sessionId).session); return true },
  /** Every turn/end reason of a live session. */
  turnEnds({ sessionId }) { const a = ctx.agents.get(sessionId); return a ? a.session.snapshotEvents().filter((e) => e.type === 'turn/end').map((e) => e.data?.reason?.kind ?? null) : null },

  // ---- P7 operations ----
  /** Every call of the asking tool: session, call id, text, outcome (null while waiting) and times. */
  asks({ sessionId } = {}) { return (store.asks ?? []).filter((a) => !sessionId || a.sessionId === sessionId) },
  /** Every approval/asked and approval/decided event of a live session. */
  approvalEvents({ sessionId }) { return liveAgent(sessionId).session.snapshotEvents().filter((e) => e.type.startsWith('approval/')).map(eventSummary) },
  /** Switch a live session's approval policy the way DSH's policy switch does ('ask' or 'never'). */
  setApprovalPolicy({ sessionId, policy }) { ctx.get('approval').setPolicy(liveAgent(sessionId), policy); return ctx.get('approval').effectivePolicy(liveAgent(sessionId).session) },
  /** Let Fishball's model answer the next permission request whose text contains needle with answer_approval(args). */
  planApproval({ sessionId, needle, args, callId }) { model.plans.push({ sessionId, needle, args, callId, used: null }); return true },
  /**
   * DSH pins every subagent's approval policy to 'never' at delegation, so its requests never reach
   * any answerer. With on, every agent created from now on is switched back to 'ask' (DSH's policy
   * switch), so a subagent's request reaches the broker (P1 review: subagent attribution).
   */
  askInNewAgents({ on }) {
    store.askInNewAgentsOff?.()
    store.askInNewAgentsOff = on ? ctx.on('agent/created', ({ agent }) => { try { ctx.get('approval').setPolicy(agent, 'ask') } catch (e) { store.registerErrors.push({ name: 'askInNewAgents', error: String(e?.message ?? e) }) } }) : undefined
    return true
  },
  clearPlans() { model.plans.length = 0; return true },
  planState() { return model.plans.map((p) => ({ needle: p.needle, callId: p.callId, used: p.used })) },

  // ---- P8 operations (ctx.fishball sources) ----
  /** Call registerSource as the fixture row captured under label; the source is kept under key. */
  sourceRegister({ label, def, key = label + ':' + def?.id }) {
    const fc = store.sourceCtxs?.get(label)
    if (!fc) return { ok: false, error: { code: 'FBTEST_NO_CONTEXT', message: 'no fishball context captured for ' + label } }
    try {
      const source = fc.fishball.registerSource(def)
      const entry = { source, enabledCalls: 0 }
      // X7: count onEnabled calls from the moment of registration.
      entry.offEnabled = source.onEnabled(() => { entry.enabledCalls++ })
      sources.set(key, entry)
      return { ok: true, key, enabled: source.enabled, keys: Object.keys(source).sort() }
    } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** publish(event) on a kept source; resolves to the answer or the rejection's code. */
  async sourcePublish({ key, event }) {
    const entry = sources.get(key)
    if (!entry) throw new Error('no source kept under ' + key)
    try { return { ok: true, value: await entry.source.publish(event) } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  sourceState({ key }) {
    const entry = sources.get(key)
    return entry ? { enabled: entry.source.enabled, enabledCalls: entry.enabledCalls ?? null } : null
  },
  /** P8: any row's settings entry (ns = row id), and an update of it through DSH's settings service. */
  settingsOf({ ns }) { const d = ctx.settings.describe().find((x) => x.ns === ns); return d ? { value: JSON.parse(JSON.stringify(d.value ?? null)), revision: d.revision, applies: d.applies } : null },
  async settingsUpdateNs({ ns, patch }) {
    const rev = ctx.settings.describe().find((x) => x.ns === ns)?.revision
    try { await ctx.settings.update(ns, patch, rev); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Call the function onEnabled returned for a kept source (stop counting its calls). */
  sourceOffEnabled({ key }) { const entry = sources.get(key); entry?.offEnabled?.(); return Boolean(entry) },
  /** registerSource taken off the service object and called detached (the guide: FISHBALL_UNKNOWN_PLUGIN). */
  sourceRegisterDetached({ label, def }) {
    const fc = store.sourceCtxs?.get(label)
    if (!fc) return { ok: false, error: { code: 'FBTEST_NO_CONTEXT', message: 'no fishball context captured for ' + label } }
    const { registerSource } = fc.fishball
    try { registerSource(def); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** registerSource on the service object a row kept from before it unloaded (the guide: FISHBALL_UNKNOWN_PLUGIN). */
  sourceRegisterStale({ label, def }) {
    const service = store.staleServices?.get(label)
    if (!service) return { ok: false, error: { code: 'FBTEST_NO_CONTEXT', message: 'no released service for ' + label } }
    try { service.registerSource(def); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Add an onEnabled listener that throws (mode 'throw') or rejects ('reject'); counts its calls. */
  sourceBadListener({ key, mode }) {
    const entry = sources.get(key)
    if (!entry) throw new Error('no source kept under ' + key)
    entry.badCalls = 0
    entry.source.onEnabled(() => { entry.badCalls++; if (mode === 'throw') throw new Error('fbtest listener throws'); return Promise.reject(new Error('fbtest listener rejects')) })
    return true
  },
  sourceBadCalls({ key }) { return sources.get(key)?.badCalls ?? null },
  /** registerSource called from the root context (no loader row). */
  sourceRegisterRoot({ def }) {
    try { ctx.get('fishball').registerSource(def); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Whether a fishball context is captured for label, and the row's recorded apply/dispose/inject/release. */
  sourceRow({ label }) { return { captured: store.sourceCtxs?.has(label) ?? false, events: (store.sourceEvents ?? []).filter((e) => e.label === label).map((e) => e.type) } },
  /** The root realm's fishball service: present, and its own keys. */
  fishballService() { const s = ctx.get('fishball'); return { present: s !== undefined && s !== null, hasRegister: typeof s?.registerSource === 'function' } },

  // ---- P11 operations (Messenger look: authors) ----
  /** Rename a live session the way DSH's rename does (a user title, through DSH's session-title service). */
  renameSession({ sessionId, title }) {
    try { return { ok: true, title: ctx.get('sessionTitle').rename(liveAgent(sessionId).session, title).title } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** A live session's current title as DSH's session-title service reports it ('' when it has none). */
  sessionTitle({ sessionId }) { return ctx.get('sessionTitle')?.get(liveAgent(sessionId).session)?.title ?? '' },
  /** Every row id of the dsh-fishball bundle as DSH's plugin manager lists it (the messenger must add none). */
  async fishballRows() { return (await ctx.pluginManager.listBundles()).filter((b) => b.name === PACKAGE_NAME).flatMap((b) => b.rows.map((r) => r.rowId)).sort() },

  // ---- Revision 10a operations (Install for Fishball) ----
  /** DSH's install progress events seen on the host bus, optionally for one request id. */
  installEvents({ requestId } = {}) { return store.installEvents.filter((e) => !requestId || e.requestId === requestId).map(({ json, ...e }) => ({ ...e, json: JSON.stringify(json).slice(0, 2000) })) },

  // ---- P12 operations (plugin manager settings) ----
  /** apply/dispose/fail events of the settings fixtures' rows, with the config each apply received. */
  settingsEvents({ plugin, row } = {}) { return store.settingsEvents.filter((e) => (!plugin || e.plugin === plugin) && (!row || e.row === row)) },
  /** The config the latest apply of a row received, read now (a volatile field shows its current value). */
  settingsLive({ plugin, row }) {
    const last = store.settingsConfigs.filter((c) => c.plugin === plugin && c.row === row).at(-1)
    return last ? { entryId: last.entryId, config: plainConfig(last.config) } : null
  },
  /** Select or deselect a bundle in the DSH profile through DSH's plugin manager (your action on DSH's Installed tab). */
  async setBundleEnabled({ name, enabled }) {
    const r = await ctx.pluginManager.setBundleEnabled(name, enabled)
    return { changed: r.changed, application: r.application, stage: r.stage ?? null, error: r.error ? JSON.parse(JSON.stringify(r.error)) : null }
  },

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
