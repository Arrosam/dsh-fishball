/**
 * V3-S6 round 2: the decisions of 2026-11-12, one SDK per run, three processes on one home.
 *  boot 1 (S6_STEP=1): plain web profile; a leftover session is created on the shipped default preset.
 *          Then core, board, instance and watchdog are installed natively, core FIRST (install order).
 *  boot 2 (S6_STEP=2): core reorders itself last while it starts; this boot's composition is the
 *          old one (instance still on). Records: when the reorder ran, the manifest after it, any
 *          conflict/preflight line, whether HMR recomposed live.
 *  boot 3 (S6_STEP=3): the next start with core last: fishball-instance off, every shipped preset
 *          off but still present, presets = fishball + watchdog, a manager session created and
 *          resumed through DSH's session controller on `fishball`, read-only, no session-creating
 *          tool; the leftover session is discarded (archived) without a crash.
 * S6_HMR=off boots steps 2 and 3 with `hmr` disabled, as the instance's §6.2 launch overlay does (hosted).
 * Env: SDK, S6_STEP, S6_HOME (steps 2, 3), S6_HMR. Writes results/decided[-nohmr]-<step>-<sdk>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { boot, CORE_PACKAGES, dshPlugin, initProfile, isolateHome, record, sdkPkg, sleep, TARBALLS, until, WATCHDOG_PACKAGE, writePatch } from './harness.mjs'
import { login } from './inspect.mjs'

const STEP = Number(process.env.S6_STEP ?? 1)
const NO_HMR = process.env.S6_HMR === 'off'
const LABEL = NO_HMR ? 'decided-nohmr' : 'decided'
const STATE = 'decided-state.json'
const SHIPPED_PRESETS = Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal'])
const SESSION_CREATING = /subagent|workflow|schedule|send_message|list_agents|agent_team|agent_preset/
const INSTALL_ORDER = Object.freeze([CORE_PACKAGES.core, CORE_PACKAGES.board, CORE_PACKAGES.instance, WATCHDOG_PACKAGE])
const SETTLE_MS = 3000
const ANSWER_MS = 15000

const iso = isolateHome('decided', process.env.S6_HOME)
const statePath = path.join(iso.home, STATE)
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'))
const bundlesOnDisk = () => JSON.parse(fs.readFileSync(path.join(iso.profileDir, 'package.json'), 'utf8')).dsh.profile.bundles
const hello = async () => (await sdkPkg('dsh-llm')).createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })
const conflictLines = (booted) => booted.stderr.filter((line) => /disabling profile plugin|skipping profile bundle|conflict|incompatible|restart required/i.test(line)).map((line) => line.trim())

/** Steer one message and return the tools the model was given in that turn. */
async function turn(agent, sessionId) {
  const sent = (globalThis.__s6Requests ?? []).length
  agent.steer(await hello())
  const answered = await until(() => (globalThis.__s6Requests ?? []).slice(sent).some((request) => request.sessionId === sessionId), ANSWER_MS)
  await until(() => agent.status === 'idle', ANSWER_MS)
  const tools = [...new Set((globalThis.__s6Requests ?? []).slice(sent).filter((request) => request.sessionId === sessionId).flatMap((request) => request.tools))]
  return { answered, tools, sessionCreatingTools: tools.filter((name) => SESSION_CREATING.test(name)) }
}

/** The loader's view of named rows: present, effective disabled, running. */
function rows(ctx, ids) {
  return Object.fromEntries(ids.map((id) => {
    const entry = [...ctx.loader.entries()].find((item) => item.options.id === id)
    return [id, entry === undefined ? 'absent' : `${entry.disabled ? 'off' : 'on'}:${entry.fiber?.state === 2 ? 'active' : 'idle'}`]
  }))
}

if (STEP === 1) {
  await initProfile(iso)
  const booted = await boot(iso)
  const created = await booted.ctx.sessionController.create({ cwd: iso.cwd })
  const { agent } = await booted.ctx.sessionController.agents.resolveAgent(created.sessionId)
  const first = await turn(agent, created.sessionId)
  fs.writeFileSync(statePath, JSON.stringify({ leftover: { sessionId: created.sessionId, agentPreset: created.agentPreset } }))
  await booted.shutdown.stop?.()
  // Native install, core first: the order §5a.3 lists and DSH appends in.
  const install = {}
  for (const name of INSTALL_ORDER) install[name] = (await dshPlugin(['add', path.join(TARBALLS, `${name}-0.0.0-spike.1.tgz`)])).ok
  record(`${LABEL}-1`, { home: iso.home, leftover: { agentPreset: created.agentPreset, answered: first.answered }, install, bundlesAfterInstall: bundlesOnDisk() })
  console.log('[s6-home]', iso.home)
  process.exit(0)
}

globalThis.__s6 = { checks: [] }
const bundlesBefore = bundlesOnDisk()
const overlays = NO_HMR ? [writePatch(iso.home, 'nohmr.patch.yml', [{ id: 'hmr', disabled: true }])] : []
const booted = await boot(iso, { overlays })
const { ctx } = booted
await until(() => globalThis.__s6.checks.some((check) => check.trigger === 'app-ready'), ANSWER_MS)
const rowsAtAppReady = rows(ctx, ['fishball-instance'])

if (STEP === 2) {
  const reorder = await globalThis.__s6.reorder
  await sleep(SETTLE_MS)
  record(`${LABEL}-2`, {
    hmr: !NO_HMR,
    bundlesBefore,
    reorder,
    bundlesAfter: bundlesOnDisk(),
    rowsAtAppReady,
    // This boot composed with the old order; HMR may recompose after the manifest change.
    rowsAfterSettle: rows(ctx, ['fishball-instance', ...SHIPPED_PRESETS]),
    instanceStarted: globalThis.__s6.instanceStarted === true,
    reportAfterSettle: globalThis.__s6.last?.overridden,
    checkTriggers: [...new Set(globalThis.__s6.checks.map((check) => check.trigger))],
    conflictLines: conflictLines(booted),
  })
  process.exit(0)
}

// STEP 3: the next start with core last.
const state = readState()
const reorder = await globalThis.__s6.reorder
const presets = (await ctx.agentPresets.list()).map((preset) => preset.id)
const shippedRows = rows(ctx, [...SHIPPED_PRESETS, 'fishball-instance', 'preset-fishball', 'preset-watchdog'])
// The shipped presets are switched off, not deleted: the rows are still in the composition.
const created = await ctx.sessionController.create({ cwd: iso.cwd })
const resolvedNew = await ctx.sessionController.agents.resolveAgent(created.sessionId)
const managerTurn = await turn(resolvedNew.agent, created.sessionId)
const policy = { sandbox: ctx.sandboxPolicy.resolve({ session: resolvedNew.agent.session }).mode, permission: ctx.permissionPresets.current(resolvedNew.agent.session) }
// The leftover from boot 1 (recorded preset `standard`, now switched off): discard, do not resume.
const leftover = { recordedPreset: state.leftover.agentPreset }
const resolvedOld = await ctx.sessionController.agents.resolveAgent(state.leftover.sessionId)
leftover.controllerResolve = resolvedOld.agent === undefined ? (resolvedOld.error?.code ?? 'no-agent') : 'resumed'
try {
  leftover.archive = await ctx.workspaceController.archiveSession({ sessionId: state.leftover.sessionId })
} catch (error) {
  leftover.archive = { error: String(error?.code ?? error?.name ?? error) }
}
const cookie = await login(booted.url())
const page = await fetch(new URL('/api/fishball/recommended', new URL(booted.url()).origin), { headers: { cookie } })
leftover.processAlive = true
const listed = (await ctx.sessionController.list({}, AbortSignal.timeout(ANSWER_MS))).items
leftover.listedAfterArchive = listed.some((item) => (item.sessionId ?? item.id) === state.leftover.sessionId)
leftover.pageAfterDiscard = page.status
record(`${LABEL}-3`, {
  hmr: !NO_HMR,
  rowsAtAppReady,
  bundles: bundlesOnDisk(),
  reorder,
  conflictLines: conflictLines(booted),
  presets,
  defaultPreset: ctx.agentPresets.defaultId,
  rows: shippedRows,
  instanceStarted: globalThis.__s6.instanceStarted === true,
  watchdogStarted: globalThis.__s6.watchdogStarted === true,
  reportAtAppReady: globalThis.__s6.checks.find((check) => check.trigger === 'app-ready')?.overridden,
  manager: { created: { agentPreset: created.agentPreset }, ...managerTurn, ...policy },
  leftover,
  sessionIds: { manager: created.sessionId },
})
console.log('[s6-manager]', created.sessionId)
process.exit(0)
