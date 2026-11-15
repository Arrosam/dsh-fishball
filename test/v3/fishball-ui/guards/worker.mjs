/**
 * F-GUARDS test worker: boots the real installed DSH Web runtime (FBTEST_DSH_RUNTIME) in-process on
 * a throwaway DSH_HOME as an ordinary **standalone** DSH profile, with this checkout's
 * `packages/core` and generated stand-in bundles installed in the order a test asks for. There is no
 * connector, no instance and no hosted child. The parent drives it over IPC (support/host.mjs
 * `call`); stdin is held open by the parent because DSH's launcher shuts down on stdin EOF.
 *
 * Environment (JSON lists of member names, see MEMBERS):
 * - FBG_MEMBERS: installed and selected at the first boot of the home, in install order;
 * - FBG_DESELECTED: installed at the first boot but not selected;
 * - FBG_ADD: installed and appended at this boot when the profile lacks them (installed while down);
 * - FBG_HMR=off: boot with DSH's `hmr` row disabled (as a hosted child's launch overlay sets it).
 *
 * Black box: core is used only as an installed bundle; its report is found by its K3 shape
 * (report.mjs) and every other fact is read through DSH's own public services.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_LLM_MODULE, RUNTIME } from '../../../support/constants.mjs'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { until } from '../../../support/util.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { BUDGET, DSH_ROW, ENV, FIBER_ACTIVE, FIXTURE, GUARDS, OWNER, PROFILE } from './constants.mjs'
import { findReport, stillProvided, subscribeReport } from './report.mjs'

const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
if (!home || !home.includes(path.join('.runtime', 'test-homes'))) throw new Error('worker refuses a DSH_HOME outside .runtime/test-homes: ' + home)
const list = (name) => JSON.parse(process.env[name] ?? '[]')

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
const { createUserMessage } = await hostPkg('dsh-llm')
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)

const profileDir = path.join(home, 'profiles', PROFILE)
const manifestFile = path.join(profileDir, 'package.json')
const bundlesDir = path.join(home, FIXTURE.dir)
const cwd = path.join(home, 'work')
fs.mkdirSync(cwd, { recursive: true })

/** A generated bundle: package.json, its patch (JSON is a YAML subset) and an entry module. */
function fixtureBundle(name, rows, entry) {
  const dir = path.join(bundlesDir, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: FIXTURE.version, type: 'module', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2))
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }], null, 2))
  fs.writeFileSync(path.join(dir, 'index.js'), entry)
  return dir
}
const standinEntry = (row) => `import { standin } from ${JSON.stringify(pathToFileURL(FIXTURE.standinModule).href)}\nexport const name = ${JSON.stringify(row)}\nexport const apply = standin(${JSON.stringify(row)})\n`

/** The other offered preset (K3 FishballAgentPreset without the default), as fishball-watchdog would contribute it. */
const otherOffered = GUARDS.offeredPresets.filter((p) => p !== GUARDS.policy.defaultAgentPreset)

/** The installable members a test can name. */
const MEMBERS = {
  [V3.core.name]: () => V3.core.dir,
  [FIXTURE.instance]: () => fixtureBundle(FIXTURE.instance, [{ id: FIXTURE.instance, name: FIXTURE.instance, config: {} }], standinEntry(FIXTURE.instance)),
  [FIXTURE.hostedSettings]: () => fixtureBundle(FIXTURE.hostedSettings, [{ id: FIXTURE.hostedSettings, name: FIXTURE.hostedSettings, config: {} }], standinEntry(FIXTURE.hostedSettings)),
  [FIXTURE.deselected]: () => fixtureBundle(FIXTURE.deselected, [{ id: FIXTURE.deselected, name: FIXTURE.deselected, config: {} }], standinEntry(FIXTURE.deselected)),
  [FIXTURE.probe.name]: () => fixtureBundle(FIXTURE.probe.name, [{ id: FIXTURE.probe.name, name: FIXTURE.probe.name, config: {} }], `export * from ${JSON.stringify(pathToFileURL(FIXTURE.probe.module).href)}\n`),
  // A stand-in for fishball-watchdog's own preset (design §7): read-only file tools, no session-creating tool.
  [FIXTURE.watchdog.name]: () => fixtureBundle(FIXTURE.watchdog.name, otherOffered.map((id) => ({
    id: FIXTURE.watchdog.row, name: DSH_ROW.agentPreset,
    config: { id, order: FIXTURE.watchdog.order, plugins: [DSH_ROW.fileTools(OWNER.readOnlyFiles)] },
  })), `export const name = ${JSON.stringify(FIXTURE.watchdog.name)}\nexport function apply() {}\n`),
}
const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const writeManifest = (pkg) => fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2))

/** Install one package into the profile as DSH's native add does: a dependency, its node_modules link, and (selected) appended to the bundle list. */
function install(name, target, selected) {
  const pkg = readManifest()
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (selected) pkg.dsh.profile.bundles.push(name)
  writeManifest(pkg)
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.rmSync(path.join(profileDir, 'node_modules', name), { force: true })
  fs.symlinkSync(target, path.join(profileDir, 'node_modules', name))
}
const memberDir = (name) => {
  const make = MEMBERS[name]
  if (!make) throw new Error('unknown member ' + name)
  return make()
}

linkContractForSourceRun()
if (!fs.existsSync(profileDir)) {
  initializeProfileFromDefault(PROFILE, 'web', home)
  // Core's bundled library, as its own dependency beside it (never a bundle).
  install(V3.shared.name, V3.shared.dir, false)
  for (const name of list('FBG_MEMBERS')) install(name, memberDir(name), true)
  for (const name of list('FBG_DESELECTED')) install(name, memberDir(name), false)
}
for (const name of list('FBG_ADD')) if (!Object.hasOwn(readManifest().dependencies ?? {}, name)) install(name, memberDir(name), true)

const overlay = path.join(home, 'fbg.overlay.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: DSH_ROW.defaultModel, config: { provider: FAKE.provider, model: FAKE.model } },
  ...(process.env[ENV.hmr] === ENV.off ? [{ id: DSH_ROW.hmr, disabled: true }] : []),
  { insert: [{ id: DSH_ROW.fakeLlm, name: FAKE_LLM_MODULE }] },
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: PROFILE, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })

/** Every change of core's report in this process: [{at, status, overridden}] (null: no report found). */
const history = []
const sameReport = (a, b) => JSON.stringify(a && { s: a.status, o: [...a.overridden].sort() }) === JSON.stringify(b && { s: b.status, o: [...b.overridden].sort() })
const record = (report) => { if (history.length === 0 || !sameReport(history.at(-1).report, report)) history.push({ at: Date.now(), report }) }
// Subscribe in the same tick runProfile returns, before any await, so the first check's report
// and a recompose's report a few milliseconds later are both recorded: a poll misses a value that
// stands for a few milliseconds only. Each tick re-subscribes if a recompose replaced the service.
// Only while no service offers a listener member is the report polled, because a poll's
// asynchronous read could record a value out of order next to a subscription.
let subscribed = subscribeReport(ctx, record)
const sampler = setInterval(async () => {
  if (subscribed !== null && stillProvided(ctx, subscribed)) return
  subscribed = subscribeReport(ctx, record)
  if (subscribed === null) record(await findReport(ctx).catch(() => null))
}, BUDGET.sampleMs)
sampler.unref()

/** When DSH's own app-ready signal fired in this process (the boundary R-FB-09 names). */
const appReady = { at: null }
ctx.get('appReady')?.onReady(() => { appReady.at = Date.now() })

const entryOf = (id) => [...ctx.loader.entries()].find((entry) => entry.options?.id === id)
const rowState = (id) => {
  const entry = entryOf(id)
  return entry === undefined ? { id, present: false } : { id, present: true, disabled: Boolean(entry.disabled), active: entry.fiber?.state === FIBER_ACTIVE }
}
const sessions = new Map()

async function turnTools(agent, sessionId) {
  const before = model.requests.length
  agent.steer(createUserMessage({ content: [{ type: 'text', text: FIXTURE.turnText }], source: { kind: 'user' } }))
  const answered = await until(() => model.requests.slice(before).some((r) => r.sessionId === sessionId), BUDGET.turnMs, BUDGET.pollMs)
  await until(() => agent.status === 'idle', BUDGET.turnMs, BUDGET.pollMs)
  const tools = [...new Set(model.requests.slice(before).filter((r) => r.sessionId === sessionId).flatMap((r) => r.tools.map((t) => t.name)))]
  return { answered: Boolean(answered), tools }
}
const sessionFacts = (agent) => ({
  sandbox: ctx.sandboxPolicy.resolve({ session: agent.session }).mode,
  permission: ctx.permissionPresets.current(agent.session),
})
const controller = () => ctx.sessionController.agents ?? ctx.sessionController

const ops = {
  info: () => ({ home, profileDir, pid: process.pid }),
  async waitReady() { return Boolean(await until(() => appReady.at !== null, BUDGET.readyMs, BUDGET.pollMs)) },
  readyAt: () => appReady.at,
  async report() { return findReport(ctx) },
  history: () => history,
  probe: () => globalThis.__fbgProbe ?? null,
  rows: ({ ids }) => ids.map(rowState),
  bundles: () => readManifest().dsh.profile.bundles,
  manifestStat: () => { const s = fs.statSync(manifestFile); return { mtimeMs: s.mtimeMs, text: fs.readFileSync(manifestFile, 'utf8') } },
  dependencies: () => Object.keys(readManifest().dependencies ?? {}),
  /** The owner moves a bundle to the given position of `dsh.profile.bundles` (a hand edit). */
  moveBundle: ({ name, index }) => {
    const pkg = readManifest()
    const rest = pkg.dsh.profile.bundles.filter((b) => b !== name)
    rest.splice(index, 0, name)
    pkg.dsh.profile.bundles = rest
    writeManifest(pkg)
    return rest
  },
  standinStarts: () => (fs.existsSync(path.join(home, FIXTURE.log)) ? fs.readFileSync(path.join(home, FIXTURE.log), 'utf8').trim().split('\n').filter(Boolean).map((line) => { const [row, pid] = line.split(' '); return { row, pid: Number(pid) } }) : []),
  async presets() { return { ids: (await ctx.agentPresets.list()).map((p) => p.id), defaultId: ctx.agentPresets.defaultId } },
  policy: () => ({
    sandbox: ctx.get('sandboxPolicy')?.defaultMode,
    approval: ctx.get('approval')?.config?.policy,
    permissionPresets: [...(ctx.get('permissionPresets')?.names ?? [])],
    defaultPermissionPreset: ctx.get('permissionPresets')?.defaultPreset,
    defaultAgentPreset: ctx.get('agentPresets')?.defaultId,
  }),
  async bundleList() { return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled, rows: b.rows.map((r) => r.rowId) })) },
  /** The owner's native Plugins switch on one row (DSH's own plugin manager). */
  async setRowEnabled({ id, enabled }) {
    const row = (await ctx.pluginManager.listPlugins()).find((item) => item.patchId === id)
    if (!row) throw new Error('no manageable plugin row ' + id)
    await ctx.pluginManager.setPluginEnabled(row.entryId, enabled)
    return true
  },
  async setBundleEnabled({ name, enabled }) { await ctx.pluginManager.setBundleEnabled(name, enabled); return true },
  /** The owner's hand edit of their profile patch file (DSH's profile layer). */
  writeProfilePatch: ({ text }) => { fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), text); return true },
  readProfilePatch: () => { const f = path.join(profileDir, 'cordis.patch.yml'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null },
  /** A new session on the default preset through DSH's own session controller, and one turn. */
  async newSession() {
    const created = await ctx.sessionController.create({ cwd })
    const { agent, error } = await controller().resolveAgent(created.sessionId)
    if (!agent) throw new Error('the new session did not resolve: ' + JSON.stringify(error))
    sessions.set(created.sessionId, agent)
    return { sessionId: created.sessionId, agentPreset: created.agentPreset ?? null, ...(await turnTools(agent, created.sessionId)), ...sessionFacts(agent) }
  },
  /** Resume a stored session in this (new) process through the controller, and one turn. */
  async resumeSession({ sessionId }) {
    const { agent, error } = await controller().resolveAgent(sessionId)
    if (!agent) return { resumed: false, error: error?.code ?? null }
    return { resumed: true, ...(await turnTools(agent, sessionId)), ...sessionFacts(agent) }
  },
  async shutdown() {
    clearInterval(sampler)
    await Promise.race([shutdown.shutdown(0), new Promise((resolve) => setTimeout(resolve, BUDGET.stopMs))])
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
    process.send({ type: 'reply', id: msg.id, ok: false, error: { name: error?.name ?? null, message: String(error?.message ?? error).slice(0, 400) } })
  }
})
process.on('disconnect', () => process.exit(1))
process.send({ type: 'ready', pid: process.pid })
