/**
 * One real host DSH for an integration test, in its own process (spawned by host-dsh.mjs). It boots the
 * installed SDK's DSH on a throwaway DSH_HOME with a profile that links the packages the test names,
 * as a user-installed plugin is linked, and answers a few operations over IPC.
 *
 * Environment (set by host-dsh.mjs): DSH_HOME (must lie under a .runtime/test-homes folder),
 * DSHI_RUNTIME (the SDK's node_modules), DSHI_LINKS (JSON [{name, dir, bundle}]: bundle false links
 * a library without selecting it), DSHI_PROFILE. A worker that loses its parent exits.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HOMES_MARK = path.join('.runtime', 'test-homes')
const home = process.env.DSH_HOME
if (!home || !home.includes(HOMES_MARK)) throw new Error('host worker refuses a DSH_HOME outside ' + HOMES_MARK + ': ' + home)
const runtime = process.env.DSHI_RUNTIME
const profile = process.env.DSHI_PROFILE
const links = JSON.parse(process.env.DSHI_LINKS ?? '[]')
const host = (spec) => import(pathToFileURL(path.join(runtime, spec)).href)

const { runProfile, initializeProfileFromDefault } = await host('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await host(path.join('@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'))

const profileDir = path.join(home, 'profiles', profile)
if (!fs.existsSync(profileDir)) initializeProfileFromDefault(profile, 'web', home)

/** Point the profile's dependency and node_modules link at `dir`, and select it as a bundle when asked. */
function link({ name, dir, bundle = true }) {
  const file = path.join(profileDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + dir }
  const bundles = pkg.dsh.profile.bundles.filter((b) => b !== name)
  if (bundle) bundles.push(name)
  pkg.dsh.profile.bundles = bundles
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2))
  const at = path.join(profileDir, 'node_modules', name)
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.rmSync(at, { force: true })
  fs.symlinkSync(dir, at)
}
for (const entry of links) link(entry)

// The connector's approval prompt server binds a fixed port by default; an owned test profile takes any.
// It goes into the profile's own patch, not a command-line overlay: DSH refuses every settings write
// to a namespace an overlay overrides, and the connector writes its own settings (createHosted adds a token).
// Only on a fresh profile (no patch yet, or the empty list a new profile holds): from then on DSH
// keeps its saved settings in that file, and a later boot of the same home must not wipe them.
const profilePatch = path.join(profileDir, 'cordis.patch.yml')
const FRESH_PATCH = new Set(['', '[]'])
const freshPatch = !fs.existsSync(profilePatch) || FRESH_PATCH.has(fs.readFileSync(profilePatch, 'utf8').trim())
if (freshPatch && links.some((l) => l.name === 'dsh-agent-connector')) fs.writeFileSync(profilePatch, JSON.stringify([{ id: 'dsh-connector', config: { approval: { port: 0 } } }]))
const overlay = path.join(home, 'dshi.overlay.yml')
fs.writeFileSync(overlay, '[]')
const { ctx, shutdown } = await runProfile({ environment: loadLayeredEnv('dsh'), profile, patchFiles: [overlay], args: ['--no-open', '--port', '0'] })

// An unexpected approval prompt is rejected, so it can never hang a test.
ctx.on('approval/request', () => 'rejected', { prepend: true })

const errorInfo = (e) => ({ name: e?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 400) })
const ops = {
  info: () => ({ home, profileDir, pid: process.pid }),
  /** Every bundle DSH's plugin manager lists for the MAIN profile. */
  async allBundles() {
    return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, rows: b.rows.map((r) => r.rowId) }))
  },
  /** Update one row's settings through DSH's settings service (as the Plugins page's Save does). */
  async settingsUpdate({ ns, patch }) {
    const revision = ctx.settings.describe().find((x) => x.ns === ns)?.revision
    try { await ctx.settings.update(ns, patch, revision); return { ok: true } } catch (e) { return { ok: false, error: errorInfo(e) } }
  },
  /** Create an ordinary session using the host SDK, without running a model turn. */
  async createSession() {
    const { sessionId } = await ctx.sessionController.create({ cwd: home })
    return sessionId
  },
  async shutdown() { await shutdown.shutdown(0); return true },
}

process.on('message', async (msg) => {
  if (msg?.type !== 'call') return
  try {
    const op = ops[msg.op]
    if (!op) throw new Error('unknown host-worker op ' + msg.op)
    const value = await op(msg.args ?? {})
    process.send({ type: 'reply', id: msg.id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) })
    if (msg.op === 'shutdown') setImmediate(() => process.exit(0))
  } catch (error) {
    process.send({ type: 'reply', id: msg.id, ok: false, error: errorInfo(error) })
  }
})
process.on('disconnect', () => process.exit(1))
process.send({ type: 'ready', pid: process.pid })
