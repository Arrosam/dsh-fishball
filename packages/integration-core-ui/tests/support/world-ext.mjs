/**
 * This package's extension of the fishball-test-helpers DSH world (child side): ops over the public
 * surfaces core and fishball-ui publish beside DSH's own: core's `fishballInstance` (guard report,
 * targets, manager), core's `fishballStatus` snapshot, fishball-ui's `fishballUiGuards` presence marker,
 * DSH's `profileContext` and settings service, and DSH's plugin manager.
 */
import fs from 'node:fs'
import path from 'node:path'
import { until } from 'fishball-test-helpers/wait'
import { NAMES } from './names.mjs'

const SHAPE_DEPTH = 3
const shape = (value, depth = 0) => value == null ? null : typeof value === 'function' ? 'function' : typeof value !== 'object' || depth > SHAPE_DEPTH ? typeof value : Object.fromEntries(Object.keys(value).map((k) => [k, shape(value[k], depth + 1)]))
const frozenDeep = (v) => v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(frozenDeep))

/**
 * Ready once core's services are up, except in a world whose owner switched core off (FBTEST_CU_CORE_OFF set
 * by the case): there DSH's own app ready is the whole wait.
 */
export const ready = ({ ctx }) => process.env[NAMES.coreOffEnv] !== undefined || Boolean(ctx.get(NAMES.instance) && ctx.get(NAMES.status))

/** Fishball's guard report history: every value `ui.guards.onChange` (contracts ui.d.ts) published. */
const GUARD = Object.freeze({ sampleMs: 50, standinLog: 'standin.log', manifest: 'package.json', profilePatch: 'cordis.patch.yml', turnText: 'fbtest guard turn', fiberActive: 2 })
const plainReport = (r) => (r == null ? null : JSON.parse(JSON.stringify(r)))

export function ops({ ctx, model, world }) {
  const instance = () => ctx.get(NAMES.instance)
  const history = []
  const same = (a, b) => JSON.stringify(a && { s: a.status, o: [...a.overridden].sort() }) === JSON.stringify(b && { s: b.status, o: [...b.overridden].sort() })
  const record = (report) => { const r = plainReport(report); if (history.length === 0 || !same(history.at(-1).report, r)) history.push({ at: Date.now(), report: r }) }
  let watched = null
  // A recompose replaces core's service: re-subscribe whenever the guards face changes.
  const follow = () => {
    const guards = instance()?.ui?.guards
    if (!guards || guards === watched) return
    watched = guards
    guards.onChange(record)
    record(guards.report())
  }
  follow()
  setInterval(follow, GUARD.sampleMs).unref()
  const appReady = { at: null }
  ctx.get('appReady')?.onReady(() => { appReady.at = Date.now() })
  const manifestFile = path.join(world.profileDir, GUARD.manifest)
  const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const sessionFacts = (agent) => ({ sandbox: ctx.sandboxPolicy.resolve({ session: agent.session }).mode, permission: ctx.permissionPresets.current(agent.session) })
  const turnTools = async (sessionId) => {
    const requests = await world.turn(sessionId, [], GUARD.turnText)
    return { answered: requests.length > 0, tools: [...new Set(requests.flatMap((r) => r.tools))] }
  }
  const ensure = async () => { await instance().manager.ensureSession(); return instance().manager.sessionId() }
  return {
    shape: () => ({ apiVersion: instance()?.apiVersion ?? null, shape: shape(instance()) }),
    report: () => instance()?.ui?.guards?.report() ?? null,
    snapshot: () => ctx.get(NAMES.status)?.snapshot() ?? null,
    startedBundles: () => [...(ctx.get(NAMES.profileContext)?.startedBundles ?? [])],
    /** One root service: present, its own keys, whether it is deeply frozen. */
    service: ({ name }) => { const v = ctx.get(name); return v == null ? { present: false } : { present: true, keys: typeof v === 'object' ? Object.keys(v) : [], frozen: frozenDeep(v) } },
    /** One row's namespace as DSH's settings service describes it, and whether `field` has a value. */
    rowConfig: ({ id, field }) => {
      const view = ctx.get(NAMES.settings)?.describe().find((d) => String(d.ns) === id)
      const value = view?.value
      const has = value !== null && typeof value === 'object' && value[field] !== undefined
      return { described: view !== undefined, has }
    },
    /** Loader entries by id with whether their fiber is active (a running row). */
    activeRows: ({ ids }) => ids.map((id) => { const e = [...ctx.loader.entries()].find((x) => x.options?.id === id); return { id, present: Boolean(e), disabled: Boolean(e?.disabled), active: Boolean(e?.fiber && e.fiber.state === 2) } }),
    async ensure() { const a = await ensure(); const b = await ensure(); return { a, b, ids: ctx.agents.list().map((x) => x.session.id) } },
    async managerTools() { const id = await ensure(); const before = model.requests.length; await world.turn(id); return model.requests.slice(before).find((r) => r.sessionId === id)?.tools.map((t) => t.name) ?? [] },
    targets: () => instance()?.ui.targets.list() ?? null,
    async targetAction({ op, args }) { return instance().ui.targets[op](...args) },
    async setCore({ enabled }) { await ctx.pluginManager.setBundleEnabled(NAMES.core, enabled); return enabled ? Boolean(await until(() => instance()?.ui?.targets, NAMES.budget.readyMs, NAMES.budget.pollMs)) : true },
    requestCount: () => model.requests.length,
    // ---- guards (PLAT-DT-04, PLAT-UC-04, UIM-DT-01)
    history: () => history,
    readyAt: () => appReady.at,
    probe: () => globalThis.__fbgProbe ?? null,
    bundles: () => readManifest().dsh.profile.bundles,
    dependencies: () => Object.keys(readManifest().dependencies ?? {}),
    manifestStat: () => { const st = fs.statSync(manifestFile); return { mtimeMs: st.mtimeMs, text: fs.readFileSync(manifestFile, 'utf8') } },
    /** The owner moves a bundle in `dsh.profile.bundles` (a hand edit of the profile manifest). */
    moveBundle: ({ name, index }) => { const pkg = readManifest(); const rest = pkg.dsh.profile.bundles.filter((b) => b !== name); rest.splice(index, 0, name); pkg.dsh.profile.bundles = rest; fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2)); return rest },
    standinStarts: () => { const f = path.join(world.home, GUARD.standinLog); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const [row, pid] = l.split(' '); return { row, pid: Number(pid) } }) : [] },
    async presets() { return { ids: (await ctx.agentPresets.list()).map((p) => p.id), defaultId: ctx.agentPresets.defaultId } },
    policy: () => ({ sandbox: ctx.get('sandboxPolicy')?.defaultMode, approval: ctx.get('approval')?.config?.policy, permissionPresets: [...(ctx.get('permissionPresets')?.names ?? [])], defaultPermissionPreset: ctx.get('permissionPresets')?.defaultPreset, defaultAgentPreset: ctx.get('agentPresets')?.defaultId }),
    async bundleList() { return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled })) },
    writeProfilePatch: ({ text }) => { fs.writeFileSync(path.join(world.profileDir, GUARD.profilePatch), text); return true },
    async newSession() { const { sessionId } = await world.ops.create(); return { sessionId, ...(await turnTools(sessionId)), ...sessionFacts(await world.agentOf(sessionId)) } },
    async resumeSession({ sessionId }) { try { const agent = await world.agentOf(sessionId); return { resumed: true, ...(await turnTools(sessionId)), ...sessionFacts(agent) } } catch (e) { return { resumed: false, error: String(e?.message ?? e) } } },
  }
}
