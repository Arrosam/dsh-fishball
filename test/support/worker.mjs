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
import { BOOT_LOG, CONNECTOR, FAKE, FAKE_LLM_MODULE, FIXTURE_BUNDLE, INSTANCE, INSTALL_EVENTS, LIBRARIES, MANAGER_BUNDLES, ONLY_BUNDLES, OUTCOME, PACKAGE_NAME, PRESET, PROFILE, REPO, REVIEW_BUNDLES, RUNTIME, SENTINEL_PRESET, SPOOF_MODULE, SPOOF_ROWS } from './constants.mjs'
import { linkContractForSourceRun } from './contract-link.mjs'
import { fixtureTool, plainConfig, registerFixtures, store } from './fixture-tools.mjs'
import { textOf, until } from './util.mjs'

const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
if (!home || !home.includes(path.join('.runtime', 'test-homes'))) throw new Error('worker refuses a DSH_HOME outside .runtime/test-homes: ' + home)

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
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
  for (const p of pluginPackages()) link(profileDir, p.name, p.dir)
  // P3: installed in the profile but not enabled there, so they are Fishball-only candidates.
  for (const b of Object.values(ONLY_BUNDLES)) link(profileDir, b.name, b.dir, false)
  // Post-review: the defective Fishball-only candidates, only in homes that ask for them.
  if (process.env.FBTEST_REVIEW_BUNDLES === '1') for (const b of Object.values(REVIEW_BUNDLES)) link(profileDir, b.name, b.dir, false)
  // P12: the settings fixtures (fishball-only with every field kind, on in DSH, invalid patch), only in homes that ask for them.
  if (process.env.FBTEST_MANAGER === '1') for (const b of Object.values(MANAGER_BUNDLES)) link(profileDir, b.name, b.dir, b.enabled)
}
/**
 * The two M1 plugin packages linked into every test profile (docs/package-layout.md): the connector
 * (row, client, settings) and the instance (the built-in Fishball). The root is not a plugin.
 * FBTEST_PLUGIN_DIR points the connector at another checkout for the existing-install cases; its
 * `workspaces` field is what tells a split checkout from an old single-package one.
 */
function pluginPackages() {
  const target = process.env.FBTEST_PLUGIN_DIR
  if (!target) return [CONNECTOR, INSTANCE]
  const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
  // The connector's npm name changed (dsh-connector → dsh-agent-connector, 2026-11-17), so another
  // checkout's connector is linked under the name its own manifest gives (its row loads that name).
  const connectorDir = path.join(target, 'packages', 'dsh-connector')
  if (pkg.workspaces) return [{ name: JSON.parse(fs.readFileSync(path.join(connectorDir, 'package.json'), 'utf8')).name, dir: connectorDir }, { name: INSTANCE.name, dir: path.join(target, 'packages', 'dsh-instance') }]
  // Old single-package checkout: one bundle holding both rows; there is no instance package to link.
  return [{ name: pkg.name, dir: target }]
}
/**
 * V3 R-SHARED (R-ARCH-08; one library per side since SPLIT-SHARED): `dsh-connector-shared` and
 * `fishball-shared` of the same checkout as pluginPackages(), each when that checkout has its folder
 * (a checkout from before R-SHARED or SPLIT-SHARED lacks one). They are libraries, not bundles.
 */
function libraryPackages() {
  const target = process.env.FBTEST_PLUGIN_DIR
  return LIBRARIES.map((library) => ({ name: library.name, dir: target ? path.join(target, 'packages', library.folder) : library.dir }))
    .filter((library) => fs.existsSync(library.dir))
}
/**
 * Plugin statuses: every boot re-points the links, so the same home can boot the old and the new
 * version. FBTEST_LINK (JSON [{name, dir, enabled}]) links further bundles on this boot when the
 * profile lacks them (a bundle installed while DSH was down).
 */
linkContractForSourceRun()
for (const p of pluginPackages()) relinkPlugin(profileDir, p.name, p.dir)
// V3 R-SHARED: the libraries beside the plugins, as a plain dependency (relinkPlugin never selects a bundle).
for (const p of libraryPackages()) relinkPlugin(profileDir, p.name, p.dir)
for (const b of JSON.parse(process.env.FBTEST_LINK ?? '[]')) {
  const deps = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')).dependencies ?? {}
  if (!Object.hasOwn(deps, b.name)) link(profileDir, b.name, b.dir, b.enabled)
}

function relinkPlugin(dir, name, target) {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (pkg.dependencies?.[name] !== 'link:' + target) {
    pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
  }
  const linkPath = path.join(dir, 'node_modules', name)
  let current = null
  try { current = fs.readlinkSync(linkPath) } catch { /* missing */ }
  if (current === target) return
  fs.rmSync(linkPath, { force: true })
  fs.symlinkSync(target, linkPath)
}
// FBTEST_PLUGIN=off boots this home with both plugins installed but their bundles not selected
// (used to seed state).
setBundleSelected(profileDir, pluginPackages().map((p) => p.name), process.env.FBTEST_PLUGIN !== 'off')

function setBundleSelected(dir, names, selected) {
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  const bundles = pkg.dsh.profile.bundles.filter((b) => !names.includes(b))
  if (selected) bundles.push(...names)
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
  // start_session titles: FBTEST_NO_SESSION_TITLE boots DSH without its session-title row, so no sessionTitle service exists.
  ...(process.env.FBTEST_NO_SESSION_TITLE === '1' ? [{ id: 'session-title', disabled: true }] : []),
  { insert: [
    { id: 'fbtest-llm', name: FAKE_LLM_MODULE },
    // FBTEST_BOOT_LOG: a row that records every log line from boot on (bootLog), for lines logged at app ready.
    ...(process.env.FBTEST_BOOT_LOG === '1' ? [{ id: BOOT_LOG.row, name: BOOT_LOG.module }] : []),
    // An ordinary preset with no tools of its own, so the global fixture tools are what its sessions see.
    { id: 'preset-fbtest-bare', name: '@deepseek-ai/dsh-agent-preset', config: { id: PRESET.bare, order: 90, plugins: [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }] } },
    // rev11g: ordinary presets whose sessions can ask the user questions (ask_user_question: blocking, as the shipped presets, or timed).
    { id: 'preset-fbtest-ask', name: '@deepseek-ai/dsh-agent-preset', config: { id: PRESET.ask, order: 91, plugins: [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }, { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' }] } },
    { id: 'preset-fbtest-ask-timed', name: '@deepseek-ai/dsh-agent-preset', config: { id: PRESET.askTimed, order: 92, plugins: [{ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }, { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user', config: { mode: 'timed', timeout: 120 } }] } },
    // Post-review change 11: host rows whose ids look like private-tree ids.
    ...(process.env.FBTEST_SPOOF_ROWS === '1' ? SPOOF_ROWS.map((r) => ({ id: r.id, name: SPOOF_MODULE, config: { tool: r.tool } })) : []),
  ] },
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })

/**
 * Warnings and errors DSH's logger saw (the same exporter hook DSH's own boot diagnostics use), so a test can check
 * that a problem was logged. DSH_HOME test hosts print nothing to stdout for them.
 */
const logged = []
ctx.logger.exporter({
  levels: { default: 2 },
  export: ({ ts, name, type, args }) => {
    if (type === 'warn' || type === 'error') logged.push({ at: ts, name, type, text: args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ') })
  },
})

/**
 * Scripted approver standing in for the person at DSH's stock prompt: a prepended host-level
 * approval/request answerer (the S12 position) that rejects, so an unexpected prompt never hangs a
 * turn. REMOVE-V2c removed its scripted outcomes, held questions and the asking tool with the H-STUB
 * suites that drove them; no surviving suite answers a prompt through this worker.
 */
ctx.on('approval/request', () => OUTCOME.reject, { prepend: true })

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
const errorInfo = (e) => ({ name: e?.name ?? null, ctor: e?.constructor?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 400) })

function liveAgent(sessionId) {
  const agent = ctx.agents.get(sessionId)
  if (!agent) throw new Error('no live agent for ' + sessionId)
  return agent
}

/** JSON-safe summary of one session event. */
function eventSummary(e) {
  const out = { type: e.type }
  // rev11g: the event's own sequence number when it has one, and a tool call's name and id (to place a tag record in its turn).
  out.seq = e.seq ?? null
  if (e.type === 'tool/call') { out.callId = e.data?.callId ?? null; out.name = e.data?.name ?? null }
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

  async presets() { return (await ctx.agentPresets.list()).map((p) => p.id) },

  async bundles() {
    return (await ctx.pluginManager.listBundles()).filter((b) => b.name === PACKAGE_NAME).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, rows: b.rows }))
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

  async archive({ sessionId, stopActivity }) {
    try {
      await ctx.workspaceRegistry.archiveSession(sessionId, stopActivity ? { stopActivity: true } : undefined)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errorInfo(e), activeSessionError: e instanceof WorkspaceActiveSessionError, activityKinds: (e?.activity ?? []).map((a) => a.kind) }
    }
  },
  async unpin({ sessionId }) { await ctx.workspaceRegistry.unpinSession(sessionId); return [...ctx.workspaceRegistry.pinnedSessionIds] },

  fixtureCalls({ name, sessionId } = {}) { return store.calls.filter((c) => (!name || c.name === name) && (!sessionId || c.sessionId === sessionId)) },
  fixtureErrors() { return store.registerErrors },
  lifecycle() { return store.lifecycle },
  modelTimes() { return { delayStartedAt: model.delayStartedAt ?? null, delayReleasedAt: model.delayReleasedAt ?? null } },

  // ---- P3 operations ----
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

  // ---- P5 operations ----
  /** Make a stored session live again through DSH's session controller (as opening it in the GUI does). */
  async resume({ sessionId }) {
    // Right after a boot the session controller service may not be provided yet.
    await until(() => ctx.sessionController, 15000, 50)
    const r = await ctx.sessionController.resolveAgent(sessionId); return { live: Boolean(ctx.agents.get(sessionId)), error: r.error ? errorInfo(r.error) : null } },
  /** Stored header of any session (live or not). */
  async header({ sessionId }) { const s = await ctx.sessionPersistence.stat(sessionId); return s ? JSON.parse(JSON.stringify(s.header)) : null },
  /** DSH's configured default preset id, as an ordinary create with no preset reports it. */

  // ---- P6 operations ----
  /** Cancel a live agent's running turn the way the GUI's Stop does (the turn ends 'aborted'). */
  cancel({ sessionId }) { liveAgent(sessionId).cancel({ kind: 'user' }); return true },

  // ---- P7 operations ----
  /** Every call of the asking tool: session, call id, text, outcome (null while waiting) and times. */
  // ---- rev11g operations (questions and plan reviews) ----
  questionPlanState() { return model.questionPlans.map((p) => ({ needle: p.needle, callId: p.callId, used: p.used })) },
  clearPlans() { model.plans.length = 0; return true },
  planState() { return model.plans.map((p) => ({ needle: p.needle, callId: p.callId, used: p.used })) },

  /** P8: any row's settings entry (ns = row id), and an update of it through DSH's settings service. */
  async settingsUpdateNs({ ns, patch }) {
    const rev = ctx.settings.describe().find((x) => x.ns === ns)?.revision
    try { await ctx.settings.update(ns, patch, rev); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  // ---- P11 operations (Messenger look: authors) ----
  /** Every row id of the dsh-fishball bundle as DSH's plugin manager lists it (the messenger must add none). */
  async fishballRows() { return (await ctx.pluginManager.listBundles()).filter((b) => b.name === PACKAGE_NAME).flatMap((b) => b.rows.map((r) => r.rowId)).sort() },

  // ---- Log operations ----
  /** Warnings and errors logged so far (optionally those after the first `since`). */
  loggedProblems({ since = 0 } = {}) { return logged.slice(since) },
  /** Every log line since boot, at every level (FBTEST_BOOT_LOG=1; fixtures/boot-log.mjs), or null without that row. */
  bootLog() { return globalThis.__fbtestBootLog ?? null },

  // ---- Revision 10a operations (Install for Fishball) ----
  /** DSH's install progress events seen on the host bus, optionally for one request id. */
  installEvents({ requestId } = {}) { return store.installEvents.filter((e) => !requestId || e.requestId === requestId).map(({ json, ...e }) => ({ ...e, json: JSON.stringify(json).slice(0, 2000) })) },

  // ---- Revision 10b operations ----
  /** Whether each named service resolves from DSH's root context, as every other session's rows resolve it. */
  rootServices({ names }) { return Object.fromEntries(names.map((name) => [name, ctx.get(name) !== undefined])) },

  // ---- P12 operations (plugin manager settings) ----
  /** The config the latest apply of a row received, read now (a volatile field shows its current value). */
  settingsLive({ plugin, row }) {
    const last = store.settingsConfigs.filter((c) => c.plugin === plugin && c.row === row).at(-1)
    return last ? { entryId: last.entryId, config: plainConfig(last.config) } : null
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
