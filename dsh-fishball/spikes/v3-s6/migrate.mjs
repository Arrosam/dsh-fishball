/**
 * V3-S6 scenario F (migration, PLAT-UC-05): a session created before core is placed (it records the
 * shipped default preset `standard`) is resumed after core's patch has switched the shipped presets
 * off. Two processes: S6_PHASE=before (no Fishball packages) then S6_PHASE=after (core placed).
 * S6_VARIANT=redefine places a core whose patch REDEFINES the shipped `preset-standard` row (whole
 * config replaced with Fishball's plugin list) instead of switching it off and adding `fishball`.
 * Env: SDK, S6_PHASE, S6_HOME (after), S6_VARIANT. Writes results/migrate-<variant>-<sdk>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { boot, CORE_PACKAGES, initProfile, isolateHome, record, sdkPkg, until } from './harness.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const STATE = 'migrate-state.json'
const phase = process.env.S6_PHASE ?? 'before'
const VARIANT = process.env.S6_VARIANT ?? 'new-preset'
/** The redefine variant: keep the shipped id `standard`, replace its composition, default stays `standard`. */
const REDEFINE = Object.freeze({
  drop: '- { id: preset-standard, disabled: true }\n',
  defaultFrom: 'default: fishball', defaultTo: 'default: standard',
  append: `- id: preset-standard
  config:
    id: standard
    order: 0
    plugins:
      - { id: persona, name: '@deepseek-ai/dsh-persona', config: { prefix: 'You are Fishball (spike).', complete: true, includeRuntimeContext: false } }
      - { id: tool-fs, name: '@deepseek-ai/dsh-tool-fs', config: { read: true, readImage: true, write: false, edit: false } }
`,
})
const iso = isolateHome('migrate', process.env.S6_HOME)
const statePath = path.join(iso.home, STATE)
const hello = async () => (await sdkPkg('dsh-llm')).createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })

if (phase === 'before') {
  await initProfile(iso)
  const { ctx } = await boot(iso)
  const created = await ctx.sessionController.create({ cwd: iso.cwd })
  const { agent } = await ctx.sessionController.agents.resolveAgent(created.sessionId)
  agent.steer(await hello())
  await until(() => agent.status === 'idle' && (globalThis.__s6Requests ?? []).length > 0, 15000)
  fs.writeFileSync(statePath, JSON.stringify({ sessionId: created.sessionId, agentPreset: created.agentPreset, home: iso.home }))
  console.log('[s6-home]', iso.home)
  process.exit(0)
}

// after: place core as the instance would (vendor + node_modules copy, file: dependency, bundle).
const before = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const manifestPath = path.join(iso.profileDir, 'package.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
for (const dir of ['vendor', 'node_modules']) {
  const placed = path.join(iso.profileDir, dir, CORE_PACKAGES.core)
  fs.cpSync(path.join(FIXTURES, CORE_PACKAGES.core), placed, { recursive: true })
  if (VARIANT === 'redefine') {
    const patch = path.join(placed, 'cordis.patch.yml')
    fs.writeFileSync(patch, fs.readFileSync(patch, 'utf8').replace(REDEFINE.drop, '').replace(REDEFINE.defaultFrom, REDEFINE.defaultTo) + REDEFINE.append)
  }
}
manifest.dependencies = { ...manifest.dependencies, [CORE_PACKAGES.core]: `file:./vendor/${CORE_PACKAGES.core}` }
manifest.dsh.profile.bundles.push(CORE_PACKAGES.core)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const { ctx } = await boot(iso)
const outcome = { before }
/** Both resume paths: DSH's own session controller (the page) and agents.resume (the V2 manager's path). */
const logged = []
ctx.on('internal/error', (error) => logged.push(String(error?.message ?? error)))
const resolved = await ctx.sessionController.agents.resolveAgent(before.sessionId)
outcome.controller = resolved.agent === undefined ? { ok: false, result: JSON.parse(JSON.stringify(resolved)) } : { ok: true }
if (resolved.agent !== undefined) {
  const sent = (globalThis.__s6Requests ?? []).length
  resolved.agent.steer(await hello())
  const answered = await until(() => (globalThis.__s6Requests ?? []).length > sent, 15000)
  outcome.controller = { ok: true, modelAnswered: answered, tools: (globalThis.__s6Requests ?? []).slice(sent).flatMap((request) => request.tools), sandbox: ctx.sandboxPolicy.resolve({ session: resolved.agent.session }).mode, permission: ctx.permissionPresets.current(resolved.agent.session) }
}
// agents.resume is tried only when the controller could not resume (a second open is refused by design).
if (resolved.agent === undefined) try {
  const handle = await ctx.agents.resume({ resumeSessionId: before.sessionId })
  const sent = (globalThis.__s6Requests ?? []).length
  handle.agent.steer(await hello())
  const answered = await until(() => (globalThis.__s6Requests ?? []).length > sent, 15000)
  outcome.agentsResume = { ok: true, modelAnswered: answered, status: handle.agent.status, tools: (globalThis.__s6Requests ?? []).slice(sent).flatMap((request) => request.tools), sandbox: ctx.sandboxPolicy.resolve({ session: handle.agent.session }).mode, permission: ctx.permissionPresets.current(handle.agent.session) }
} catch (error) {
  outcome.agentsResume = { ok: false, code: error?.code ?? error?.name, message: String(error?.message ?? error).slice(0, 300), stack: String(error?.stack ?? '').split('\n').slice(0, 4) }
}
outcome.loggedErrors = logged
outcome.presetIds = (await ctx.agentPresets.list()).map((preset) => preset.id)
outcome.variant = VARIANT
outcome.newSession = await (async () => {
  const created = await ctx.sessionController.create({ cwd: iso.cwd })
  return { agentPreset: created.agentPreset }
})()
record(`migrate-${VARIANT}`, outcome)
process.exit(0)
