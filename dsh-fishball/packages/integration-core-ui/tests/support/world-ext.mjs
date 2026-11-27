/**
 * This package's extension of the fishball-test-helpers DSH world (child side): ops over the public
 * surfaces core and fishball-ui publish beside DSH's own: core's `fishballInstance` (targets,
 * manager), core's `fishballStatus` snapshot, DSH's `profileContext` and settings service, and
 * DSH's plugin manager.
 */
import fs from 'node:fs'
import path from 'node:path'
import { until } from 'fishball-test-helpers/wait'
import { NAMES } from './names.mjs'

const SHAPE_DEPTH = 3
const WORLD_FILES = Object.freeze({ standinLog: 'standin.log', manifest: 'package.json', profilePatch: 'cordis.patch.yml' })
const CONTROLLER_TURN_TEXT = 'fbtest controller turn'
const shape = (value, depth = 0) => value == null ? null : typeof value === 'function' ? 'function' : typeof value !== 'object' || depth > SHAPE_DEPTH ? typeof value : Object.fromEntries(Object.keys(value).map((k) => [k, shape(value[k], depth + 1)]))

/**
 * Ready once core's services are up, except in a world whose owner switched core off (FBTEST_CU_CORE_OFF set
 * by the case): there DSH's own app ready is the whole wait.
 */
export const ready = ({ ctx }) => process.env[NAMES.coreOffEnv] !== undefined || Boolean(ctx.get(NAMES.instance) && ctx.get(NAMES.status))

export function ops({ ctx, model, world }) {
  const instance = () => ctx.get(NAMES.instance)
  const manifestFile = path.join(world.profileDir, WORLD_FILES.manifest)
  const readManifest = () => JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const sessionFacts = (agent) => ({ sandbox: ctx.sandboxPolicy.resolve({ session: agent.session }).mode, permission: ctx.permissionPresets.current(agent.session) })
  const turnTools = async (sessionId) => {
    const requests = await world.turn(sessionId, [], CONTROLLER_TURN_TEXT)
    return { answered: requests.length > 0, tools: [...new Set(requests.flatMap((r) => r.tools))] }
  }
  const ensure = async () => { await instance().manager.ensureSession(); return instance().manager.sessionId() }
  return {
    shape: () => ({ apiVersion: instance()?.apiVersion ?? null, shape: shape(instance()) }),
    snapshot: () => ctx.get(NAMES.status)?.snapshot() ?? null,
    startedBundles: () => [...(ctx.get(NAMES.profileContext)?.startedBundles ?? [])],
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
    // ---- standalone profile order and owner settings (PLAT-DT-04, PLAT-UC-04)
    bundles: () => readManifest().dsh.profile.bundles,
    dependencies: () => Object.keys(readManifest().dependencies ?? {}),
    manifestStat: () => { const st = fs.statSync(manifestFile); return { mtimeMs: st.mtimeMs, text: fs.readFileSync(manifestFile, 'utf8') } },
    /** The owner moves a bundle in `dsh.profile.bundles` (a hand edit of the profile manifest). */
    moveBundle: ({ name, index }) => { const pkg = readManifest(); const rest = pkg.dsh.profile.bundles.filter((b) => b !== name); rest.splice(index, 0, name); pkg.dsh.profile.bundles = rest; fs.writeFileSync(manifestFile, JSON.stringify(pkg, null, 2)); return rest },
    standinStarts: () => { const f = path.join(world.home, WORLD_FILES.standinLog); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const [row, pid] = l.split(' '); return { row, pid: Number(pid) } }) : [] },
    async presets() { return { ids: (await ctx.agentPresets.list()).map((p) => p.id), defaultId: ctx.agentPresets.defaultId } },
    policy: () => ({ sandbox: ctx.get('sandboxPolicy')?.defaultMode, approval: ctx.get('approval')?.config?.policy, permissionPresets: [...(ctx.get('permissionPresets')?.names ?? [])], defaultPermissionPreset: ctx.get('permissionPresets')?.defaultPreset, defaultAgentPreset: ctx.get('agentPresets')?.defaultId }),
    async bundleList() { return (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled })) },
    writeProfilePatch: ({ text }) => { fs.writeFileSync(path.join(world.profileDir, WORLD_FILES.profilePatch), text); return true },
    async newSession() { const { sessionId } = await world.ops.create(); return { sessionId, ...(await turnTools(sessionId)), ...sessionFacts(await world.agentOf(sessionId)) } },
    async resumeSession({ sessionId }) { try { const agent = await world.agentOf(sessionId); return { resumed: true, ...(await turnTools(sessionId)), ...sessionFacts(agent) } } catch (e) { return { resumed: false, error: String(e?.message ?? e) } } },
  }
}
