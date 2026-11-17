/**
 * F-WIRE manager world: boots the installed DSH Web runtime (FBTEST_DSH_RUNTIME) in-process on a
 * throwaway DSH_HOME as an ordinary standalone profile with this checkout's `fishball-core` (and its
 * bundled library `fishball-shared` as a dependency) installed, and the scripted model of
 * test/support/fixtures/fake-llm.mjs as DSH's default model. No connector, no instance, no child.
 *
 * Black box: core is used only as an installed bundle. Facts are read through DSH's public
 * services (session controller, agent presets, settings, the scripted model's request digests)
 * and core's published `fishballInstance` service; the parent drives it over IPC.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FAKE, FAKE_LLM_MODULE, REPO } from '../../../support/constants.mjs'
import { linkContractForSourceRun } from '../../../support/contract-link.mjs'
import { until } from '../../../support/util.mjs'
import { BUDGET, WORLD } from './constants.mjs'

const RUNTIME = process.env.FBTEST_DSH_RUNTIME
const host = (spec) => import(pathToFileURL(path.join(RUNTIME, spec)).href)
const hostPkg = (name) => host(path.join('@deepseek-ai', name, 'lib', 'index.js'))

const home = process.env.DSH_HOME
if (!home || !home.includes(WORLD.homeMarker)) throw new Error('world refuses a DSH_HOME outside the test homes: ' + home)

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await hostPkg('dsh-app-boot')
const { createUserMessage } = await hostPkg('dsh-llm')
const { model } = await import(pathToFileURL(FAKE_LLM_MODULE).href)

const profileDir = path.join(home, 'profiles', WORLD.profile)
const manifestFile = path.join(profileDir, 'package.json')
const cwd = path.join(home, WORLD.workDir)
fs.mkdirSync(cwd, { recursive: true })

/** Install one package as DSH's native add does: a dependency, its node_modules link, and (selected) a bundle. */
function install(name, selected) {
  const target = path.join(REPO, 'packages', WORLD.folders[name])
  const pkg = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  if (selected) pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true })
  fs.rmSync(path.join(profileDir, 'node_modules', name), { force: true })
  fs.symlinkSync(target, path.join(profileDir, 'node_modules', name))
}

linkContractForSourceRun()
const firstStart = !fs.existsSync(profileDir)
if (firstStart) {
  initializeProfileFromDefault(WORLD.profile, 'web', home)
  install(WORLD.shared, false)
  install(WORLD.core, true)
}

/** The files a settings save could write, read before DSH (and core) start. */
const patchFiles = [path.join(profileDir, WORLD.patchFile), path.join(home, WORLD.patchFile)]
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)
const patchesBefore = Object.fromEntries(patchFiles.map((f) => [f, readText(f)]))

const overlay = path.join(home, WORLD.overlay)
fs.writeFileSync(overlay, JSON.stringify([
  { id: WORLD.defaultModelRow, config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: WORLD.fakeLlmRow, name: FAKE_LLM_MODULE }] },
], null, 2))

const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile: WORLD.profile, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })
// R-FIX-CORE F09: the background log as DSH's logger exports it (core logs `id-invalid` by code).
const logs = []
ctx.logger.exporter({ levels: { default: 3 }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }) })
const appReady = { at: null }
ctx.get('appReady')?.onReady(() => { appReady.at = Date.now() })

const instance = () => ctx.get('fishballInstance')
const controller = () => ctx.sessionController.agents ?? ctx.sessionController
const agents = new Map()
async function agentOf(sessionId) {
  if (agents.has(sessionId)) return agents.get(sessionId)
  const { agent, error } = await controller().resolveAgent(sessionId)
  if (!agent) throw new Error('session did not resolve: ' + JSON.stringify(error))
  agents.set(sessionId, agent)
  return agent
}
/** What a case reads of one model request (the digest of fake-llm.mjs). */
const view = (r) => ({ at: r.at, model: r.model, system: r.system, tools: r.tools.map((t) => t.name), last: r.last, texts: r.texts })
const requestsOf = (sessionId, from = 0) => model.requests.slice(from).filter((r) => r.sessionId === sessionId).map(view)

/**
 * One user turn on a session: `scripts` (fake-llm responses, one per model request, in order)
 * answer its first requests; later requests answer plain text.
 */
async function turn(sessionId, scripts = []) {
  const agent = await agentOf(sessionId)
  await until(() => agent.status === WORLD.idle, BUDGET.turnMs, BUDGET.pollMs)
  if (scripts.length) model.queue(sessionId, ...scripts)
  const before = model.requests.length
  agent.steer(createUserMessage({ content: [{ type: 'text', text: WORLD.turnText }], source: { kind: WORLD.roles.user } }))
  await until(() => model.requests.slice(before).some((r) => r.sessionId === sessionId), BUDGET.turnMs, BUDGET.pollMs)
  await until(() => agent.status === WORLD.idle, BUDGET.turnMs, BUDGET.pollMs)
  return requestsOf(sessionId, before)
}

const ops = {
  async waitReady() { return Boolean(await until(() => appReady.at !== null && instance() !== undefined, BUDGET.readyMs, BUDGET.pollMs)) },
  firstStart: () => firstStart,
  /** The settings-document candidates before this start, now, and DSH's own document path. */
  patches: () => {
    const documentPath = ctx.settings?.documentPath ?? null
    const files = documentPath && !patchFiles.includes(documentPath) ? [...patchFiles, documentPath] : patchFiles
    return { documentPath, files: files.map((file) => ({ file, before: Object.hasOwn(patchesBefore, file) ? patchesBefore[file] : undefined, now: readText(file) })) }
  },
  managerId: () => instance()?.manager?.sessionId() ?? null,
  guards: () => instance()?.ui?.guards?.report() ?? null,
  turn: ({ sessionId }) => turn(sessionId),
  /**
   * The model calls one tool in a manager turn; answers the tool-role message the next request
   * carries (its text tail and error flag), or null when no request followed the call.
   */
  async callTool({ sessionId, tool, args, id }) {
    const requests = await turn(sessionId, [[{ tool, args, id }]])
    const result = requests[1]?.last.filter((m) => m.role === WORLD.roles.tool).at(-1)
    return { offered: requests[0]?.tools.includes(tool) ?? false, result: result === undefined ? null : { text: result.text, isError: result.isError } }
  },
  /** Every request of a session from `since` (ms epoch) on: deliveries arrive without a turn. */
  requestsSince: ({ sessionId, since }) => requestsOf(sessionId).filter((r) => r.at >= since),
  now: () => Date.now(),
  /** R-FIX-CORE F09: the log records from index `from` on. */
  logs: ({ from = 0 } = {}) => logs.slice(from),
  async newSession() {
    const created = await ctx.sessionController.create({ cwd })
    return { sessionId: created.sessionId, requests: await turn(created.sessionId) }
  },
  async presets({ sessionId }) {
    const registry = ctx.agentPresets
    const agent = await agentOf(sessionId)
    const supported = typeof registry.presetForSession === 'function'
    return { defaultId: registry.defaultId, supported, preset: supported ? registry.presetForSession(agent.session) : null }
  },
  settings: () => {
    const d = ctx.settings.describe().find((row) => row.ns === WORLD.core)
    return d === undefined ? null : { value: d.value, user: d.user }
  },
  async mutate({ ops: edits }) { await ctx.settings.mutate(WORLD.core, edits); return true },
  async shutdown() {
    await Promise.race([shutdown.shutdown(0), new Promise((resolve) => setTimeout(resolve, BUDGET.stopMs))])
    return true
  },
}

process.on('message', async (msg) => {
  if (msg?.type !== WORLD.call) return
  try {
    const op = ops[msg.op]
    if (!op) throw new Error('unknown world op ' + msg.op)
    const value = await op(msg.args ?? {})
    process.send({ type: WORLD.reply, id: msg.id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) })
    if (msg.op === 'shutdown') setTimeout(() => process.exit(0), 50)
  } catch (error) {
    process.send({ type: WORLD.reply, id: msg.id, ok: false, error: { message: String(error?.message ?? error).slice(0, 600) } })
  }
})
process.on('disconnect', () => process.exit(1))
process.send({ type: WORLD.ready, pid: process.pid })
