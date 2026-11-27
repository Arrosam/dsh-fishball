/**
 * The DSH world's child process (started by ./dsh-world bootWorld; not imported by tests). It boots
 * the DSH runtime FBTEST_DSH_RUNTIME names with its own `runProfile`, on DSH_HOME, as an ordinary
 * standalone web profile: the packages FBTEST_WORLD_PACKAGES lists linked into the profile, the
 * scripted model (./fake-llm) inserted as a row and made DSH's default model by an overlay, and the
 * extra overlay entries FBTEST_WORLD_OVERLAY lists. The parent drives it over IPC with named ops
 * (BASE_OPS below, plus the ops of the module FBTEST_WORLD_EXTENSION names). stdin is held open by
 * the parent because DSH's launcher shuts down on stdin EOF.
 *
 * Every fact is read through DSH's public services (session controller, settings, plugin manager,
 * credentials, session persistence) and the scripted model's request digests.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_LLM, FAKE_LLM_MODULE, model } from './fake-llm.mjs'
import { importRuntime, runtimeFile } from './runtime.mjs'
import { until } from './wait.mjs'
import { WORLD, WORLD_BUDGET } from './dsh-world.mjs'

const CHILD = Object.freeze({
  template: 'web', defaultModelRow: 'agent-default-model', patchFile: 'cordis.patch.yml', manifest: 'package.json', modules: 'node_modules', link: 'link:',
  profilesDir: 'profiles', idle: 'idle', userKind: 'user', toolRole: 'tool', turnText: 'fbtest world turn',
  inboxSpliced: 'agent/inbox/spliced', userMessage: 'user/message', turnStart: 'turn/start', read: 'read', keySeparator: '/',
  bootArgs: Object.freeze(['--no-open', '--port', '0']), layeredEnv: 'dsh', errorChars: 600, exitDelayMs: 50,
})

// ---- the home: refuse anything outside the test homes ------------------------------------------
const homesRoot = process.env[WORLD.env.homes]
const home = process.env.DSH_HOME ? fs.realpathSync(process.env.DSH_HOME) : ''
if (!homesRoot || !home.includes(WORLD.homesMarker) || !home.startsWith(fs.realpathSync(homesRoot) + path.sep)) {
  throw new Error('the DSH world refuses a DSH_HOME outside the test homes (' + homesRoot + '): ' + process.env.DSH_HOME)
}

/**
 * Every log line of this process, {name, type, text}: DSH's own cordis Logger (the runtime's one copy)
 * is wrapped before DSH starts, because a row may log at its apply, before any exporter a test could
 * register exists. The wrap only records; the line still goes to DSH's exporters.
 */
const LOG = []
{
  const { Logger } = await importRuntime('cordis')
  const method = Logger.prototype._method
  Logger.prototype._method = function (type, level) {
    const write = method.call(this, type, level)
    const name = this.name
    return (...args) => { LOG.push({ at: Date.now(), name, type, text: args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a) ?? String(a))).join(' ') }); return write(...args) }
  }
}

const { runProfile, initializeProfileFromDefault } = await import(pathToFileURL(runtimeFile('dsh', path.join('lib', 'profile-boot.js'))).href)
const { loadLayeredEnv } = await importRuntime('dsh-app-boot')
const { createUserMessage } = await importRuntime('dsh-llm')

const extension = process.env[WORLD.env.extension] ? await import(pathToFileURL(process.env[WORLD.env.extension]).href) : null

// ---- the profile -------------------------------------------------------------------------------
const profileDir = path.join(home, CHILD.profilesDir, WORLD.profile)
const manifestFile = path.join(profileDir, CHILD.manifest)
const cwd = path.join(home, WORLD.workDir)
fs.mkdirSync(cwd, { recursive: true })
const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const writeManifest = (pkg) => fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2))

/**
 * Install one package as DSH's native add does: a `link:` dependency and its node_modules link, and,
 * selected, appended to the bundle list the first time the profile gets it. A later boot re-points the
 * link only, so the owner's own bundle edits are kept.
 */
function install({ name, dir, selected }) {
  const pkg = readManifest()
  const isNew = !Object.hasOwn(pkg.dependencies ?? {}, name)
  pkg.dependencies = { ...pkg.dependencies, [name]: CHILD.link + dir }
  if (isNew && selected && !pkg.dsh.profile.bundles.includes(name)) pkg.dsh.profile.bundles.push(name)
  writeManifest(pkg)
  const link = path.join(profileDir, CHILD.modules, name)
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.rmSync(link, { force: true })
  fs.symlinkSync(dir, link)
}

const firstStart = !fs.existsSync(profileDir)
// Only the first boot of a home initializes the profile: re-initializing would discard saved settings.
if (firstStart) initializeProfileFromDefault(WORLD.profile, CHILD.template, home)
for (const p of JSON.parse(process.env[WORLD.env.packages] ?? '[]')) install(p)
await extension?.prepare?.({ model, profileDir, firstStart })

/** The files a settings save could write, read before DSH starts. */
const patchFiles = [path.join(profileDir, CHILD.patchFile), path.join(home, CHILD.patchFile)]
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)
const patchesBefore = Object.fromEntries(patchFiles.map((f) => [f, readText(f)]))

const overlay = path.join(home, WORLD.overlay)
// JSON is YAML, so the overlay is written as JSON.
fs.writeFileSync(overlay, JSON.stringify([
  { id: CHILD.defaultModelRow, config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: FAKE_LLM.row, name: FAKE_LLM_MODULE }] },
  ...JSON.parse(process.env[WORLD.env.overlay] ?? '[]'),
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv(CHILD.layeredEnv), profile: WORLD.profile, patchFiles: [overlay], args: [...CHILD.bootArgs] })
const appReady = { at: null }
ctx.get('appReady')?.onReady(() => { appReady.at = Date.now() })

// ---- shared helpers (also handed to an extension's ops) ----------------------------------------
const errorInfo = (e) => ({ name: e?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, CHILD.errorChars) })
const textOf = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? '').join('\n') : String(content ?? ''))
const controller = () => ctx.sessionController.agents ?? ctx.sessionController
const agents = new Map()
/** The live agent of a session, resolved through DSH's session controller (as opening it in the GUI does). */
async function agentOf(sessionId) {
  const known = agents.get(sessionId)
  if (known && ctx.agents.get(sessionId) === known) return known
  const { agent, error } = await controller().resolveAgent(sessionId)
  if (!agent) throw new Error('session did not resolve: ' + JSON.stringify(error))
  agents.set(sessionId, agent)
  return agent
}
const whenIdle = (agent) => until(() => agent.status === CHILD.idle, WORLD_BUDGET.turnMs, WORLD_BUDGET.pollMs)
/** What a case reads of one model request (the fake-llm digest). */
const view = (r) => ({ at: r.at, model: r.model, system: r.system, tools: r.tools.map((t) => t.name), last: r.last, texts: r.texts, messageCount: r.messageCount, maxTokens: r.maxTokens })
const requestsOf = (sessionId, from = 0) => model.requests.slice(from).filter((r) => r.sessionId === sessionId).map(view)
const steerUser = (agent, text) => agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: CHILD.userKind } }))

/**
 * One user turn: `scripts` (fake-llm responses, one per model request, in order) answer its first
 * requests; later ones answer plain text. Answers the session's model requests of the turn.
 */
async function turn(sessionId, scripts = [], text = CHILD.turnText) {
  const agent = await agentOf(sessionId)
  await whenIdle(agent)
  if (scripts.length) model.queue(sessionId, ...scripts)
  const before = model.requests.length
  steerUser(agent, text)
  await until(() => model.requests.slice(before).some((r) => r.sessionId === sessionId), WORLD_BUDGET.turnMs, WORLD_BUDGET.pollMs)
  await whenIdle(agent)
  return requestsOf(sessionId, before)
}

/** A session's durable log events, read through DSH's public persistence after a flush. */
async function logEvents(sessionId) {
  const agent = ctx.agents.get(sessionId)
  if (agent) await ctx.sessions.flush(agent.session)
  const reader = await ctx.sessionPersistence.open(sessionId, CHILD.read)
  try { return (await reader.read()).events } finally { await reader.close() }
}

const release = (sessionId) => {
  const waiting = model.holds?.get(sessionId)
  model.holds?.delete(sessionId)
  if (typeof waiting === 'function') waiting()
  return typeof waiting === 'function'
}

async function manageableRow(id) {
  const row = (await ctx.pluginManager.listPlugins()).find((item) => item.patchId === id)
  if (!row) throw new Error('no manageable plugin row ' + id)
  return row
}

// ---- the base ops ------------------------------------------------------------------------------
const BASE_OPS = {
  /** DSH's app-ready signal fired (and the extension's `ready`, when it has one, holds). */
  async waitReady() { return Boolean(await until(() => appReady.at !== null && (extension?.ready?.({ ctx }) ?? true), WORLD_BUDGET.readyMs, WORLD_BUDGET.pollMs)) },
  info: () => ({ home, profileDir, cwd, pid: process.pid, firstStart, readyAt: appReady.at }),
  now: () => Date.now(),

  // settings (DSH's settings service)
  /** One namespace as DSH's settings service describes it, or null. */
  settings: ({ ns }) => { const d = ctx.settings.describe().find((row) => String(row.ns) === ns); return d === undefined ? null : { value: d.value, user: d.user, revision: d.revision ?? null } },
  /** `settings.mutate(ns, ops)` (ops `[{op: 'set' | 'unset', path, value?}]`); answers `{ok}` or the error. */
  async mutate({ ns, ops }) { try { await ctx.settings.mutate(ns, ops); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } } },
  /** The settings-document candidates before this start and now, and DSH's own document path. */
  patches: () => {
    const documentPath = ctx.settings?.documentPath ?? null
    const files = documentPath && !patchFiles.includes(documentPath) ? [...patchFiles, documentPath] : patchFiles
    return { documentPath, files: files.map((file) => ({ file, before: Object.hasOwn(patchesBefore, file) ? patchesBefore[file] : undefined, now: readText(file) })) }
  },

  // plugin manager (the owner's native Plugins page)
  async bundles() { return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, rows: b.rows.map((r) => r.rowId) })) },
  async setRowEnabled({ id, enabled }) { await ctx.pluginManager.setPluginEnabled((await manageableRow(id)).entryId, enabled); return true },
  async setBundleEnabled({ name, enabled }) { await ctx.pluginManager.setBundleEnabled(name, enabled); return true },
  /** Loader entries by row id: present, disabled, and their module name. */
  rows: ({ ids }) => ids.map((id) => { const e = [...ctx.loader.entries()].find((x) => x.options?.id === id); return { id, present: Boolean(e), disabled: Boolean(e?.disabled), name: e?.options?.name ?? null } }),
  /** Whether each named service resolves from DSH's root context. */
  services: ({ names }) => Object.fromEntries(names.map((name) => [name, ctx.get(name) !== undefined])),

  // credentials (DSH's credential service)
  async credSet({ ref, value }) { await ctx.credentials.set(ref, value); return true },
  async credUnset({ ref }) { await ctx.credentials.unset(ref); return true },
  credDescribe: ({ ref }) => ctx.credentials.describe(ref),
  async credRecords() { return (await ctx.credentials.listRecords()).map((e) => ({ key: e.key, kind: e.kind })) },
  credRecord: ({ key }) => ctx.credentials.readRecord(key),
  /** Write one record `{kind, payload}` under `key` (`<scope>/<id>`) through modifyRecord, DSH's one write path. */
  async credWriteRecord({ key, record }) {
    const { credentialKey } = await importRuntime('dsh-credentials')
    await ctx.credentials.modifyRecord(credentialKey(...key.split(CHILD.keySeparator)), async () => record)
    return true
  },

  // sessions (DSH's session controller and the scripted model)
  /** A new session in the world's work folder (`agentPreset` optional); answers `{sessionId, agentPreset}`. */
  async create({ agentPreset } = {}) {
    const created = await ctx.sessionController.create({ cwd, ...(agentPreset ? { agentPreset } : {}) })
    return { sessionId: created.sessionId, agentPreset: created.agentPreset ?? null }
  },
  sessions: () => ctx.agents.list().map((a) => a.session.id),
  async header({ sessionId }) { const s = await ctx.sessionPersistence.stat(sessionId); return s ? s.header : null },
  turn: ({ sessionId, scripts, text }) => turn(sessionId, scripts, text),
  /** A turn left running. With `holdAt` n the turn's n-th model request waits until `release`. */
  async startTurn({ sessionId, scripts = [], holdAt = 0, text = CHILD.turnText }) {
    const agent = await agentOf(sessionId)
    await whenIdle(agent)
    if (holdAt > 0) (model.holdNth ??= new Map()).set(sessionId, { at: holdAt, seen: 0 })
    if (scripts.length) model.queue(sessionId, ...scripts)
    steerUser(agent, text)
    return true
  },
  release: ({ sessionId }) => release(sessionId),
  held: ({ sessionId }) => typeof model.holds?.get(sessionId) === 'function',
  /** The user's Stop of the live turn (DSH's own cancel reason), then idle; a held request is let go after the stop. */
  async stopTurn({ sessionId }) {
    const agent = await agentOf(sessionId)
    agent.cancel({ kind: CHILD.userKind })
    release(sessionId)
    await whenIdle(agent)
    return true
  },
  async idle({ sessionId }) { return Boolean(await whenIdle(await agentOf(sessionId))) },
  /**
   * The model calls one tool in a turn; answers whether the first request offered it and the
   * tool-role message the next request carries (`{text, isError}`), or null when none followed.
   */
  async callTool({ sessionId, tool, args, id }) {
    const requests = await turn(sessionId, [[{ tool, args, id }]])
    const result = requests[1]?.last.filter((m) => m.role === CHILD.toolRole).at(-1)
    return { offered: requests[0]?.tools.includes(tool) ?? false, result: result === undefined ? null : { text: result.text, isError: result.isError } }
  },
  /** One tool as the newest request of the session offered it (name, description, parameters), or null. */
  toolSpec: ({ sessionId, name }) => model.requests.filter((r) => r.sessionId === sessionId && r.tools.some((t) => t.name === name)).at(-1)?.tools.find((t) => t.name === name) ?? null,
  queue({ sessionId, scripts }) { model.queue(sessionId, ...scripts); return true },
  /** The session's model requests from index `from`, or from time `since` (ms epoch). */
  requests: ({ sessionId, from = 0, since = 0 }) => requestsOf(sessionId, from).filter((r) => r.at >= since),
  aux: ({ sessionId, purpose } = {}) => model.aux.filter((a) => (!sessionId || a.sessionId === sessionId) && (!purpose || a.purpose === purpose)),

  // session log (durable events)
  /** The ids of the messages DSH spliced into the session's inbox. */
  async inboxIds({ sessionId }) { return (await logEvents(sessionId)).filter((e) => e.type === CHILD.inboxSpliced).flatMap((e) => (e.data?.inserted ?? []).map((m) => m.id)) },
  /** The durable user messages of one source kind (`{id, text, time}` each) and the session's turn starts. */
  async userMessages({ sessionId, kind }) {
    const events = await logEvents(sessionId)
    return {
      messages: events.filter((e) => e.type === CHILD.userMessage && e.data?.source?.kind === kind).map((e) => ({ id: e.data.id, text: textOf(e.data.content), time: e.time })),
      turns: events.filter((e) => e.type === CHILD.turnStart).length,
    }
  },
  /** Every log event type of the session so far. */
  async eventTypes({ sessionId }) { return (await logEvents(sessionId)).map((e) => e.type) },

  // logs
  /** Log lines from index `from`, optionally of one logger name or type. */
  logs: ({ from = 0, name, type } = {}) => LOG.slice(from).filter((l) => (name === undefined || l.name === name) && (type === undefined || l.type === type)),

  async shutdown() {
    await Promise.race([shutdown.shutdown(0), new Promise((resolve) => setTimeout(resolve, WORLD_BUDGET.stopMs))])
    return true
  },
}

/** What an extension's ops may use besides `ctx` and `model`. */
const world = Object.freeze({ home, profileDir, cwd, firstStart, logs: LOG, agentOf, turn, requestsOf, logEvents, whenIdle, errorInfo, ops: BASE_OPS })
const ops = { ...BASE_OPS, ...(extension?.ops?.({ ctx, model, world }) ?? {}) }

process.on('message', async (msg) => {
  if (msg?.type !== WORLD.message.call) return
  try {
    const op = ops[msg.op]
    if (!op) throw new Error('unknown world op ' + msg.op)
    const value = await op(msg.args ?? {})
    process.send({ type: WORLD.message.reply, id: msg.id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) })
    if (msg.op === WORLD.shutdownOp) setTimeout(() => process.exit(0), CHILD.exitDelayMs)
  } catch (error) {
    process.send({ type: WORLD.message.reply, id: msg.id, ok: false, error: errorInfo(error) })
  }
})
// A crashed or finished test runner must not leave a DSH process behind.
process.on('disconnect', () => process.exit(1))
process.send({ type: WORLD.message.ready, pid: process.pid })
