/**
 * Spikes SP-X1, SP-FN1 and S1 for docs/plugins/instance-extension-points.md §4.
 * Usage: node probe.mjs <dsh-version> <home> <phase a|b>
 *   a: fresh home. SP-FN1 placement, SP-X1, S1, then install another bundle and disable ours.
 *   b: the same home, a new process (restart): is the disable kept, is the vendored bundle still there.
 * Throwaway only: HOME, DSH_HOME, the npm/pnpm cache, store and user config all live in <home>.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const [version, home, phase] = process.argv.slice(2)
const NM = path.join(process.env.SPX_VERSIONS, version, 'node_modules')
process.env.SPX_NM = NM
const PROFILE = 'spx'
const NAME = Object.freeze({ bundle: 'spx-bundle', other: 'spx-other' })
const out = { version, phase, node: process.version }
const log = (key, value) => { out[key] = value; console.error('[spx]', key, JSON.stringify(value)) }

const imp = (spec) => import(pathToFileURL(path.join(NM, spec)).href)
const pkg = (name) => imp(path.join('@deepseek-ai', name, 'lib', 'index.js'))
const boot = await pkg('dsh-app-boot')
const { runProfile, INSTALL_ANCHOR } = await imp('@deepseek-ai/dsh/lib/profile-boot.js')
const { defineTool } = await pkg('dsh-tools')
const { createUserMessage } = await pkg('dsh-llm')
const { FAKE } = await import('./fake-llm.mjs')

const profileDir = path.join(home, 'profiles', PROFILE)
const manifestFile = path.join(profileDir, 'package.json')
const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(predicate, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { if (await predicate()) return true; await sleep(20) } return Boolean(await predicate()) }
const spx = () => globalThis.__spx
const requestsOf = (id) => spx().requests.filter((r) => r.sessionId === id && r.purpose === null)
const count = (haystack, needle) => haystack.split(needle).length - 1

/** A minimal bundle package: one row whose apply counts its own activations. */
function writeBundle(dir, name) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.1', type: 'module', main: 'index.js', engines: { dsh: '>=0.2.1-rc.5' }, dsh: { bundle: { patch: './cordis.patch.yml' } } }, null, 2))
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), `- insert:\n    - id: ${name}-row\n      name: ${name}\n`)
  fs.writeFileSync(path.join(dir, 'index.js'), `export const name = '${name}'\nexport function apply(ctx) { const c = (globalThis.__spxRows ??= {}); c['${name}'] = (c['${name}'] ?? 0) + 1; ctx.effect(() => () => { c['${name}:disposed'] = (c['${name}:disposed'] ?? 0) + 1 }) }\n`)
}

function pnpmEnv() {
  return { ...process.env, npm_config_update_notifier: 'false' }
}

// Isolation first: nothing below may read the user's real home or npm configuration.
process.env.HOME = home
process.env.DSH_HOME = home
process.env.DSH_TELEMETRY_DISABLED = '1'
process.env.npm_config_cache = path.join(home, 'npm-cache')
process.env.npm_config_store_dir = path.join(home, 'pnpm-store')
process.env.npm_config_userconfig = path.join(home, 'empty.npmrc')
process.env.XDG_CONFIG_HOME = path.join(home, 'xdg-config')
process.env.XDG_CACHE_HOME = path.join(home, 'xdg-cache')
process.env.XDG_DATA_HOME = path.join(home, 'xdg-data')
fs.mkdirSync(home, { recursive: true })
fs.writeFileSync(process.env.npm_config_userconfig, '')
process.chdir(home)

if (phase === 'a') {
  // ---- SP-FN1 placement, before boot ----
  boot.initProfile(profileDir, ['@deepseek-ai/dsh-base'])
  const vendor = path.join(profileDir, 'vendor', NAME.bundle)
  writeBundle(vendor, NAME.bundle)
  writeBundle(path.join(home, 'src', NAME.other), NAME.other)
  const m = readManifest()
  m.dependencies = { ...m.dependencies, [NAME.bundle]: 'file:./vendor/' + NAME.bundle }
  m.dsh.profile.bundles = [...m.dsh.profile.bundles, NAME.bundle]
  fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2) + '\n')
  const vendorOnly = boot.loadProfileDirectory('dsh', profileDir, INSTALL_ANCHOR)
  log('fn1_vendorOnly_skipped', vendorOnly.skippedBundles.map((s) => s.packageName))
  // SPX_PLACE=copy: no pnpm at start; the package is copied into node_modules (hoisted layout) beside vendor/.
  if (process.env.SPX_PLACE === 'copy') fs.cpSync(vendor, path.join(profileDir, 'node_modules', NAME.bundle), { recursive: true })
  else execFileSync('pnpm', ['install', '--offline'], { cwd: profileDir, env: pnpmEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  const placed = path.join(profileDir, 'node_modules', NAME.bundle)
  log('fn1_afterPnpmInstall', { exists: fs.existsSync(path.join(placed, 'package.json')), symlink: fs.existsSync(placed) && fs.lstatSync(placed).isSymbolicLink() })
  const loaded = boot.loadProfileDirectory('dsh', profileDir, INSTALL_ANCHOR)
  log('fn1_afterPnpmInstall_layers', { layers: loaded.layers.map((l) => l.packageName), skipped: loaded.skippedBundles.map((s) => s.packageName) })
}

const overlay = path.join(home, 'spx.patch.yml')
fs.writeFileSync(overlay, JSON.stringify([
  { id: 'agent-default-model', config: { provider: FAKE.provider, model: FAKE.model } },
  { insert: [{ id: 'spx-fake-llm', name: path.join(import.meta.dirname, 'fake-llm.mjs') }] },
], null, 2))
const { ctx } = await runProfile({ environment: boot.loadLayeredEnv('dsh'), profile: PROFILE, patchFiles: [overlay], args: ['--host', '127.0.0.1', '--port', '0', '--no-open'] })
await until(() => ctx.get('pluginManager') !== undefined && ctx.get('agents') !== undefined)
log('booted_rows', { ...globalThis.__spxRows })

const row = await new Promise((resolve, reject) => {
  Promise.resolve(ctx.plugin({ name: 'spx-probe-row', inject: ['agents', 'pluginManager', 'compaction'], apply: (c) => resolve(c) })).catch(reject)
})
const bundleInfo = async (name) => (await row.pluginManager.listBundles()).find((b) => b.name === name)

if (phase === 'b') {
  log('fn1_restart', { rows: { ...globalThis.__spxRows }, bundles: readManifest().dsh.profile.bundles, dependency: readManifest().dependencies[NAME.bundle], stillInstalled: fs.existsSync(path.join(profileDir, 'node_modules', NAME.bundle, 'package.json')), info: await bundleInfo(NAME.bundle) })
  const enable = await row.pluginManager.setBundleEnabled(NAME.bundle, true)
  await sleep(500)
  log('fn1_reenable', { ok: enable?.ok ?? enable, rows: { ...globalThis.__spxRows }, bundles: readManifest().dsh.profile.bundles })
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}

log('fn1_info', await bundleInfo(NAME.bundle))

// ---- SP-X1 and S1 in one manager-like session ----
const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
const sid = 'session-spx-' + version
const json = Object.freeze({ schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }] })
let late
let board = 0
const lateFiber = (agentCtx) => agentCtx.plugin({ name: 'spx-late', apply: (c) => {
  c.tools.register(defineTool({ name: 'spx_late', description: 'late tool', parameters: {}, output: json, execute: async () => ({ ok: true }) }))
  c.systemPrompt.section({ name: 'spx-late-section', order: 900, text: 'SPX-LATE-SECTION', interpolate: false })
} })
const setup = (agentCtx) => {
  agentCtx.tools.register(defineTool({ name: 'spx_probe', description: 'probe', parameters: {}, output: json, execute: async () => { late = lateFiber(agentCtx); await late; return { ok: true } } }))
  agentCtx.systemPrompt.context({ name: 'spx-board', order: 900, text: () => 'SPX-BOARD-' + board, interpolate: false })
}
const queue = (...steps) => { const q = spx().queues.get(sid) ?? []; q.push(...steps); spx().queues.set(sid, q) }
async function drive(agent, text) {
  agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await until(() => agent.status === 'running', 3000)
  return until(() => agent.status === 'idle', 20000)
}
const last = () => requestsOf(sid).at(-1)
const facts = (r) => ({ lateTool: r.tools.includes('spx_late'), lateSection: r.body.includes('SPX-LATE-SECTION'), board: 'SPX-BOARD-' + board, boardCount: count(r.body, 'SPX-BOARD-' + board), staleBoard: count(r.body, 'SPX-BOARD-') - count(r.body, 'SPX-BOARD-' + board) })

let handle = await row.agents.create({ sessionId: sid, meta: { cwd }, agentOptions: { provider: FAKE.provider, model: FAKE.model }, setup })
let agent = handle.agent
await drive(agent, 'hello')
log('x1_before', facts(last()))
// Mid-turn: the tool call registers the late fiber; the request after the tool result is the next step.
queue({ tool: 'spx_probe', id: 'call_1' }, { text: 'after probe' })
const before = requestsOf(sid).length
await drive(agent, 'call the probe')
const turn = requestsOf(sid).slice(before)
log('x1_midTurn', { steps: turn.length, step1: facts(turn[0]), step2: turn[1] && facts(turn[1]) })
await drive(agent, 'next turn')
log('x1_nextTurn', facts(last()))
await late.dispose()
await drive(agent, 'after dispose')
log('x1_afterDispose', facts(last()))

// S1: the agent-scoped context after a compaction and after a resume.
board = 1
for (let i = 0; i < 6; i++) { queue({ text: 'answer ' + i + ' ' + 'y'.repeat(6000) }); await drive(agent, 'turn ' + i + ' ' + 'x'.repeat(6000)) }
log('s1_beforeCompaction', facts(last()))
let compaction
try {
  const result = await row.compaction.compactNow(agent, new AbortController().signal)
  compaction = { result: result === null ? null : Object.keys(result), summaries: agent.session.snapshotEvents().filter((e) => e.type === 'compaction/summary').length }
} catch (error) { compaction = { error: String(error?.code ?? error) } }
log('s1_compaction', compaction)
board = 2
await drive(agent, 'after compaction')
log('s1_afterCompaction', facts(last()))
await handle.dispose()
board = 3
handle = await row.agents.resume({ resumeSessionId: sid, agentOptions: { provider: FAKE.provider, model: FAKE.model }, setup })
agent = handle.agent
await drive(agent, 'after resume')
log('s1_afterResume', facts(last()))
if (process.env.SPX_DUMP) { const b = last().body; const at = []; let i = -1; while ((i = b.indexOf('SPX-BOARD-', i + 1)) >= 0) at.push(b.slice(Math.max(0, i - 160), i + 14)); log('s1_where', at) }
const types = agent.session.snapshotEvents().map((e) => e.type)
log('s1_eventTypes', [...new Set(types)])

// ---- SP-FN1: another install keeps ours; a disable is persisted ----
const install = await row.pluginManager.installBundle(path.join(home, 'src', NAME.other), { activate: true })
log('fn1_installOther', { lock: fs.existsSync(path.join(profileDir, 'pnpm-lock.yaml')) ? fs.readFileSync(path.join(profileDir, 'pnpm-lock.yaml'), 'utf8').includes('spx-bundle@file:vendor/spx-bundle') : null, symlinkNow: fs.lstatSync(path.join(profileDir, 'node_modules', NAME.bundle)).isSymbolicLink(), ok: install?.ok, failedAt: install?.failedAt, code: install?.code, ours: fs.existsSync(path.join(profileDir, 'node_modules', NAME.bundle, 'package.json')), dependencies: readManifest().dependencies, bundles: readManifest().dsh.profile.bundles, rows: { ...globalThis.__spxRows } })
const disable = await row.pluginManager.setBundleEnabled(NAME.bundle, false)
await sleep(500)
log('fn1_disable', { ok: disable?.ok, bundles: readManifest().dsh.profile.bundles, rows: { ...globalThis.__spxRows }, info: await bundleInfo(NAME.bundle) })
console.log(JSON.stringify(out, null, 2))
process.exit(0)
