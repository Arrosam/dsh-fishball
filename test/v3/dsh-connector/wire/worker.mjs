/**
 * C-WIRE test worker: boots the real installed DSH Web runtime (FBTEST_DSH_RUNTIME) in-process on a
 * throwaway DSH_HOME, as an ordinary DSH profile with this checkout's `dsh-connector` installed as a
 * bundle (and its two libraries as plain dependencies). **`dsh-instance` is never linked**, so no
 * hosted child is ever launched (the brief: "Launch no hosted child"). Optionally `dsh-connector-ui`
 * and generated contributor bundles are linked (ENV.link, ENV.contributors). A scripted fake model
 * answers every session turn (support/fixtures/fake-llm.mjs).
 *
 * The parent drives it over IPC (world.mjs `call`); stdin is held open by the parent because DSH's
 * launcher shuts down on stdin EOF. Black box: the connector is reached only through what DSH itself
 * offers: its root services (`ctx.get(name)`), DSH's settings service, DSH's sessions, its HTTP
 * listener (from the parent) and its logger (wrapped before boot, as F-GUARDS' worker does).
 */
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_LLM_MODULE, RUNTIME } from '../../../support/constants.mjs'
import { until } from '../../../support/util.mjs'
import { BUDGET, DSH, ENV, FIXTURE, PACKAGES, SURFACE } from './constants.mjs'

const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
if (!home || !home.includes(path.join('.runtime', 'test-homes'))) throw new Error('worker refuses a DSH_HOME outside .runtime/test-homes: ' + home)
const json = (name, fallback) => JSON.parse(process.env[name] ?? JSON.stringify(fallback))

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
const { createUserMessage } = await hostPkg('dsh-llm')
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)

/** Every log line of this process (DSH's one cordis Logger, wrapped before DSH starts; it still writes). */
const LOG = []
{
  const { Logger } = await hostPkg('cordis')
  const method = Logger.prototype._method
  Logger.prototype._method = function (type, level) {
    const write = method.call(this, type, level)
    const name = this.name
    return (...args) => { LOG.push({ name, type, text: args.map((a) => (typeof a === 'string' ? a : (a instanceof Error ? a.name + ': ' + a.message + (a.code ? ' [' + a.code + ']' : '') : a?.message !== undefined ? 'msg:' + a.message : String(JSON.stringify(a) ?? a)))).join(' ') }); return write(...args) }
  }
}

const profileDir = path.join(home, 'profiles', DSH.profile)
const manifestFile = path.join(profileDir, 'package.json')
const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const writeManifest = (pkg) => fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2))

/** Installs one package as DSH's native add does: a dependency, its node_modules link and (bundle) the bundle list. */
function install(name, target, bundle) {
  const pkg = readManifest()
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (bundle && !pkg.dsh.profile.bundles.includes(name)) pkg.dsh.profile.bundles.push(name)
  writeManifest(pkg)
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.rmSync(path.join(profileDir, 'node_modules', name), { force: true })
  fs.symlinkSync(target, path.join(profileDir, 'node_modules', name))
}

/**
 * A generated contributor bundle (R10): its row opens `dshConnectorTools` in an inject sub-scope, as
 * a real contributor does, and leaves the scoped service where the worker's `emit` op can call it, so
 * the connector identifies the caller as this bundle's loader entry.
 */
function contributorBundle(name) {
  const dir = path.join(home, 'fixtures', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.1', type: 'module', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2))
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: name, name, config: {} }] }], null, 2))
  fs.writeFileSync(path.join(dir, 'index.js'), [
    `export const name = ${JSON.stringify(name)}`,
    'export function apply(ctx) {',
    `  ctx.inject([${JSON.stringify(SURFACE.service.tools)}], (scope) => {`,
    '    const slot = (globalThis.__fbwireContributors ??= {})',
    `    slot[${JSON.stringify(name)}] = scope[${JSON.stringify(SURFACE.service.tools)}]`,
    `    scope.effect(() => () => { delete slot[${JSON.stringify(name)}] })`,
    '  })',
    '}',
    '',
  ].join('\n'))
  return dir
}

/**
 * An opt-in extension (ENV.extension: a module path) for suites that reuse this worker:
 * - `bundles()` → [{name, dir}]: fixture bundles installed BEFORE the connector, so their rows mount
 *   first. A listener such a row prepends to a waterfall then runs after the connector's own
 *   (prepended later, at its apply) and before DSH's own answerers (V2's fbtest-tools order);
 * - `overlayRows()`: rows inserted into the boot overlay (extra presets);
 * - `ops(deps)`: operations that join the worker's ops once DSH runs.
 * Without it the C-WIRE boot is unchanged.
 */
const extension = process.env[ENV.extension] ? await import(pathToFileURL(process.env[ENV.extension]).href) : null

if (!fs.existsSync(profileDir)) {
  initializeProfileFromDefault(DSH.profile, 'web', home)
  if (process.env[ENV.noWebApp] === ENV.on) {
    const pkg = readManifest()
    pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((name) => name !== DSH.webBundle)
    writeManifest(pkg)
  }
  for (const library of PACKAGES.libraries) if (fs.existsSync(library.dir)) install(library.name, library.dir, false)
  for (const bundle of extension?.bundles?.() ?? []) install(bundle.name, bundle.dir, true)
  if (process.env[ENV.noConnector] !== ENV.on) install(PACKAGES.connector.name, PACKAGES.connector.dir, true)
  for (const extra of json(ENV.link, [])) install(extra.name, extra.dir, true)
  for (const name of json(ENV.contributors, [])) install(name, contributorBundle(name), true)
  /**
   * The connector row's starting config in the user's own profile patch layer (where DSH's settings
   * service writes the user's edits too): a later layer would replace the row's config wholesale and
   * hide those edits. It carries the approval port each home picks, so parallel files never share one.
   */
  fs.writeFileSync(path.join(profileDir, DSH.homePatch), JSON.stringify([{ id: SURFACE.rowId, config: json(ENV.rowConfig, {}) }], null, 2))
}

const overlay = path.join(home, 'fbwire.overlay.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: DSH.defaultModelRow, config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: DSH.fakeLlmRow, name: FAKE_LLM_MODULE }] },
  { insert: [{ id: DSH.readyProbeRow, name: path.join(import.meta.dirname, 'ready-probe.mjs') }] },
  ...(extension?.overlayRows ? [{ insert: extension.overlayRows() }] : []),
], null, 2))

const trusted = [FIXTURE.tunnelHost, `${FIXTURE.tunnelHost}:${FIXTURE.tunnelPort}`].flatMap((h) => ['--trusted-host', h])
const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: DSH.profile, patchFiles: [overlay], args: ['--no-open', '--port', '0', ...trusted] })

const appReady = { at: null }
ctx.get('appReady')?.onReady(() => { appReady.at = Date.now() })
const activity = []
ctx.on(DSH.activityEvent, (sessionId, timestamp) => activity.push({ sessionId, timestamp }))

const entryOf = (id) => [...ctx.loader.entries()].find((entry) => entry.options?.id === id)
/** A stable tag per fiber object, so a remount (a new fiber) is visible to the parent. */
const fiberTags = new WeakMap()
let fiberCounter = 0
const tagOf = (fiber) => { if (!fiber) return null; if (!fiberTags.has(fiber)) fiberTags.set(fiber, ++fiberCounter); return fiberTags.get(fiber) }
const plain = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)))
const errorInfo = (e) => ({ name: e?.name ?? null, ctor: e?.constructor?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 400) })
const controller = () => ctx.sessionController.agents ?? ctx.sessionController
const describeRow = () => ctx.settings.describe().find((d) => d.ns === SURFACE.rowId)

async function agentOf(sessionId) {
  const live = ctx.agents.get(sessionId)
  if (live) return live
  const { agent } = await controller().resolveAgent(sessionId)
  return agent
}
/** A JSON summary of a session event, for the parent. */
function eventSummary(e) {
  const message = e.data?.message ?? e.data
  const text = Array.isArray(message?.content) ? message.content.map((b) => b?.text ?? '').join('') : String(message?.content ?? '')
  return { type: e.type, sourceKind: message?.source?.kind ?? null, text: text.slice(0, 4000) }
}

const ops = {
  info: () => ({ home, profileDir, pid: process.pid }),
  async waitReady() { return Boolean(await until(() => appReady.at !== null, BUDGET.readyMs, BUDGET.pollMs)) },
  logs: () => LOG,
  atReadyServices: () => globalThis.__fbwireReady ?? null,
  activity: () => activity,
  /** Toggle the installed bundle through DSH, never call the product's apply/dispose directly. */
  async bundleEnabled({ enabled }) {
    const result = await ctx.pluginManager.setBundleEnabled(PACKAGES.connector.name, enabled)
    return { result: plain(result), row: ops.row() }
  },
  /** The connector row: present, active or pending (cordis: waiting for a required service), and its fiber's tag (a new tag means the row was remounted). */
  row: ({ id = SURFACE.rowId } = {}) => {
    const entry = entryOf(id)
    return entry === undefined ? { present: false } : { present: true, disabled: Boolean(entry.disabled), active: entry.fiber?.state === DSH.fiberActive, pending: entry.fiber?.state === DSH.fiberPending, fiber: tagOf(entry.fiber) }
  },
  /** Each named root service: whether DSH provides it, its apiVersion and its member names. */
  services: ({ names }) => Object.fromEntries(names.map((name) => {
    const s = ctx.get(name)
    if (s === undefined || s === null) return [name, { present: false }]
    const members = new Set()
    for (let o = s; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor') members.add(k)
    return [name, { present: true, apiVersion: s.apiVersion ?? null, members: [...members].sort() }]
  })),
  /** Calls `service[method](...args)` and answers its (awaited) result, or how it threw / rejected. */
  async call({ service, method, args = [] }) {
    const s = ctx.get(service)
    if (!s) return { absent: true }
    let sync = true
    try {
      const pending = s[method](...args)
      sync = false
      return { value: plain(await pending) }
    } catch (e) {
      return { threw: errorInfo(e), sync }
    }
  },
  settings: () => { const d = describeRow(); return d ? { value: plain(d.value), revision: d.revision, schema: plain(d.schema) } : null },
  async settingsUpdate({ patch }) {
    try { await ctx.settings.update(SURFACE.rowId, patch, describeRow()?.revision); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  async settingsMutate({ ops: edits }) {
    try { await ctx.settings.mutate(SURFACE.rowId, edits, describeRow()?.revision); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Two user saves back to back (R5): the second is sent as soon as the first resolves, before any write-back settles. */
  async settingsTwice({ first, second }) {
    const out = []
    for (const edits of [first, second]) {
      try { await ctx.settings.mutate(SURFACE.rowId, edits); out.push({ ok: true }) } catch (e) { out.push({ ok: false, error: errorInfo(e) }) }
    }
    return out
  },
  /** `dshConnectorTokens.createHosted` and, in the same tick after it resolves, `principals()` and the settings list (R3, R4, R14). */
  async createHosted({ instanceId }) {
    const before = ctx.get(SURFACE.service.handover)?.principals().length ?? null
    try {
      const made = await ctx.get(SURFACE.service.tokens).createHosted(instanceId)
      const principals = plain(ctx.get(SURFACE.service.handover)?.principals() ?? null)
      return { made: plain(made), before, principals, tokens: plain(describeRow()?.value?.[SURFACE.settings.tokens] ?? null) }
    } catch (e) {
      return { threw: errorInfo(e) }
    }
  },
  /**
   * Hold the first native settings acknowledgement after its real durable edit, then perform the
   * user's real save before createHosted can finish. A same-tick launch alone could edit while
   * createHosted was still making its credential record, missing the own-write race entirely.
   * Only the host service boundary is delayed; no connector flag, registry or outcome is replaced.
   */
  async raceHostedUserSave({ instanceId, tokens }) {
    const settings = ctx.settings
    const methods = DSH.settingsWriteMethods
    const originals = Object.fromEntries(methods.map((method) => [method, settings[method]]))
    const entered = Promise.withResolvers()
    const release = Promise.withResolvers()
    let held = false
    let hosted
    try {
      for (const method of methods) settings[method] = async function (ns, ...args) {
        const hold = ns === SURFACE.rowId && !held
        if (hold) held = true
        const result = await originals[method].call(this, ns, ...args)
        if (hold) { entered.resolve(); await release.promise }
        return result
      }
      hosted = ops.createHosted({ instanceId })
      const first = await Promise.race([entered.promise.then(() => true), hosted.then(() => false)])
      if (!first) throw new Error('createHosted completed without entering a native settings save')
      const during = await ops.settingsUpdate({ patch: { [SURFACE.settings.tokens]: tokens } })
      release.resolve()
      return { held, hosted: await hosted, during }
    } finally {
      release.resolve()
      for (const method of methods) settings[method] = originals[method]
      await hosted
    }
  },
  /** `n` createHosted calls started in one tick (R3: calls run in call order); their entry keys in call order, and the list after all. */
  async createHostedMany({ instanceId, n }) {
    const tokens = ctx.get(SURFACE.service.tokens)
    const runs = Array.from({ length: n }, () => tokens.createHosted(instanceId).then((made) => ({ entryKey: made.entryKey }), (e) => ({ threw: errorInfo(e) })))
    const results = await Promise.all(runs)
    return { results, tokens: plain(describeRow()?.value?.[SURFACE.settings.tokens] ?? null) }
  },
  /** A contributor's emit (R10), through its own scoped `dshConnectorTools`. */
  async emit({ contributor, event }) {
    const tools = globalThis.__fbwireContributors?.[contributor]
    if (!tools) return { absent: true }
    try { return { value: plain(await tools.emit(event)) } } catch (e) { return { threw: errorInfo(e) } }
  },
  /** A folder for sessions (session_start takes an absolute folder). */
  folder: ({ name = FIXTURE.folder }) => { const dir = path.join(home, 'work', name); fs.mkdirSync(dir, { recursive: true }); return fs.realpathSync(dir) },
  /** A new ordinary session through DSH's own session controller (no turn). */
  async createSession({ name = FIXTURE.folder }) {
    const cwd = ops.folder({ name })
    const created = await ctx.sessionController.create({ cwd })
    await agentOf(created.sessionId)
    return { sessionId: created.sessionId, cwd }
  },
  /** The same owner prompt API used by DSH's composer, including its native activity event. */
  async userDrive({ sessionId, text = FIXTURE.userText }) {
    const agent = await agentOf(sessionId)
    const before = model.requests.length
    await ctx.sessionController.prompt({ sessionId, requestId: randomUUID(), mode: DSH.promptMode, content: [{ type: 'text', text }] }, new AbortController().signal)
    await until(() => model.requests.length > before || agent.status === 'running', BUDGET.turnMs, BUDGET.pollMs)
    await until(() => agent.status === 'idle', BUDGET.turnMs, BUDGET.pollMs)
    return { status: agent.status, requests: model.requests.length - before }
  },
  /** One user turn in a session, waited until its agent is idle again; answers the model requests it made. */
  async drive({ sessionId, text = FIXTURE.userText }) {
    const agent = await agentOf(sessionId)
    if (!agent) throw new Error('no agent for ' + sessionId)
    const before = model.requests.length
    agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await until(() => model.requests.length > before || agent.status === 'running', BUDGET.turnMs, BUDGET.pollMs)
    await until(() => agent.status === 'idle', BUDGET.turnMs, BUDGET.pollMs)
    return { status: agent.status, requests: model.requests.length - before }
  },
  async session({ sessionId }) {
    const agent = await agentOf(sessionId)
    return {
      live: Boolean(agent),
      status: agent?.status ?? null,
      events: agent ? agent.session.snapshotEvents().map(eventSummary) : null,
      requests: model.requests.filter((r) => r.sessionId === sessionId).length,
    }
  },
  /** Waits until the session's agent is idle (a session_start turn). */
  async waitIdle({ sessionId }) {
    const agent = await agentOf(sessionId)
    await until(() => agent?.status === 'idle', BUDGET.turnMs, BUDGET.pollMs)
    return agent?.status ?? null
  },
  /** The model requests of one session: their model and the tail of their message text. */
  requests: ({ sessionId }) => model.requests.filter((r) => r.sessionId === sessionId).map((r) => ({ model: r.model, texts: r.texts })),
  /** Every stored session id (DSH's persistence). */
  async sessionIds() { return (await ctx.sessionPersistence.list()).map((s) => s.header.id) },
  async shutdown() {
    await Promise.race([shutdown.shutdown(0), new Promise((resolve) => setTimeout(resolve, BUDGET.stopMs))])
    return true
  },
}

if (extension?.ops) Object.assign(ops, await extension.ops({ ctx, model, agentOf, eventSummary, errorInfo, plain, createUserMessage, until, budget: BUDGET }))

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
process.on('disconnect', () => process.exit(1))
process.send({ type: 'ready', pid: process.pid })
