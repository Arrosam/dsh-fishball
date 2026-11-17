/**
 * The guard check (design §5a.2; R-FB-09, R-FB-12, R-FB-13; spike V3-S6 §3.5): it compares what
 * core's patch intends with what is in effect, read only through DSH's public services and
 * profile functions, and returns a K3 `GuardReport`. It reads; it never changes anything back.
 */
import { readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { scopeParentOf } from '@deepseek-ai/dsh-scope'
import { UI_GUARDS } from 'fishball-shared/ui-seam'
import { GUARDS } from '../../contracts/constants.js'
import { bundlesOf, coreLast } from './reorder.js'
import { CONTRIBUTED_TOOLS } from '../manager/contributed.js'

const { code, services } = GUARDS

/** The value at `member` (a path of property names) of the service `name`, or undefined. */
function read(ctx, name, member) {
  let value = ctx.get(name)
  for (const key of member) value = value?.[key]
  return value
}

const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && b.every((item) => a.includes(item))

/**
 * Guard rows that are present and enabled. A row absent from the composition counts as held,
 * because it cannot run (S6). `entry.disabled` includes `!!js` expressions and disabled ancestors.
 */
function overriddenRows(ctx, rows) {
  const loader = ctx.get(services.loader)
  if (typeof loader?.entries !== 'function') return []
  const enabled = new Set()
  for (const entry of loader.entries()) if (!entry.disabled) enabled.add(entry.options?.id)
  return rows.filter((id) => enabled.has(id)).map((id) => code.rowPrefix + id)
}

/**
 * The guard rows in this DSH: core's own guard rows, then the UI guard rows (`uiRows`). Those are in
 * core's patch since R-FIX-FUI but held only beside fishball-ui (R-FB-14: UI-only rows are
 * fishball-ui's), so they are checked only while fishball-ui's row provides `fishballUiGuards`.
 * Without fishball-ui they are DSH's own rows, not guards, and are never reported (Q-G1).
 */
function guardedRows(ctx, intended) {
  return ctx.get(UI_GUARDS.service) === undefined ? intended.rows : [...intended.rows, ...intended.uiRows]
}

/** The intended value of one IntendedPolicy key (readIntendedGuards). */
const intendedValue = (intended, key) => intended.policy.find((entry) => entry.key === key).value

function overriddenPolicy(ctx, intended) {
  return GUARDS.policy.filter((spec) => {
    const value = read(ctx, spec.service, spec.member)
    const wanted = intendedValue(intended, spec.key)
    return spec.keys ? !sameSet(value, wanted) : value !== wanted
  }).map((spec) => code.policyPrefix + spec.key)
}

/** `agent-presets` when the roster offers any preset other than core's own. */
async function overriddenPresets(ctx, managerPreset) {
  const presets = ctx.get(services.agentPresets)
  if (typeof presets?.list !== 'function') return []
  const ids = (await presets.list()).map((preset) => preset.id)
  return ids.every((id) => id === managerPreset) ? [] : [code.agentPresets]
}

/**
 * `bundle-order` when core is in `dsh.profile.bundles` but not last (R-FB-12). It reads the
 * profile manifest as written, not the started list: after the reorder the file says "last" and
 * the rows the old order missed are named on their own (`row:<id>`) until the recompose or the
 * restart; a later move by the owner, or a guarded bundle installed after core, shows here.
 * Not a bundle in this profile (a hosted child of V2 placement, or no profile): nothing to check.
 */
function overriddenOrder(ctx) {
  const profile = ctx.get(services.profileContext)
  if (typeof profile?.dir !== 'string') return []
  const bundles = bundlesOf(readProfileManifest(GUARDS.diagnostic, profile.dir))
  return coreLast(bundles) === undefined ? [] : [code.bundleOrder]
}

/** Every name in core's own tool tables (GUARDS.coreTools), read once. */
let coreToolNames
function loadCoreToolNames() {
  coreToolNames ??= Promise.allSettled(GUARDS.coreTools.map(({ module, table }) => import(new URL(module, import.meta.url).href).then((loaded) => Object.values(loaded[table]))))
    .then((results) => new Set(results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])))
  return coreToolNames
}

/** Tool names one scope sees (dsh-tools `schemas(scope)`, both SDKs; the agent is its own scope key). */
const toolNames = (tools, scope) => new Set(tools.schemas(scope).map((schema) => schema.name))

/**
 * The live manager sessions: core's own manager (by id), and every live agent composed on the
 * manager's preset, `IntendedPolicy.defaultAgentPreset` (user decision 2026-11-14, matching spike S6
 * round 2, which resumed a controller-made `fishball` session). `composedPreset` is public on both
 * SDKs; rc.5 has no `presetForSession`, so the live composition is the only per-session preset read.
 */
function managerAgents(ctx, managerPreset) {
  const agents = ctx.get(services.agents)
  if (typeof agents?.list !== 'function') return []
  const presets = ctx.get(services.agentPresets)
  const own = ctx.get(services.instance)?.manager?.sessionId?.()
  return agents.list().filter((agent) => agent.id === own || presets?.composedPreset?.(agent.ctx) === managerPreset)
}

/**
 * Whether `name`, as `agent` sees it, is Fishball's own tool rather than the preset's (user decision
 * 2026-11-14: core's tools are not the preset's). Two sources qualify, and only in the agent's own
 * layer (a definition its parent scope does not see), because core registers nothing globally:
 * - a name in core's tool tables (`GUARDS.coreTools`), however it got there (the private Skills,
 *   reminders and `ask_user`);
 * - a name an X2 contribution holds in this manager's scope now (`fishballInstance[CONTRIBUTED_TOOLS]`,
 *   core's own read, F-WIRE): the bridge façade's connector tools and a set member's.
 *   X2 is the one way into the manager's scope, so they are Fishball's.
 * A preset-scoped tool with one of those names, e.g. DSH's own `schedule_create` from
 * `dsh-tool-schedule`, is the parent scope's, so it is not excluded and is reported.
 */
function isCoreTool(name, core, contributed, inherited) {
  return (core.has(name) || contributed.has(name)) && !inherited.has(name)
}

/**
 * `manager-tools` when a live manager session's model tools, core's own left out, are not exactly
 * `GUARDS.managerTools` (R-FB-13: checked by its tools, because 0.2.1-rc.5 cannot report a
 * session's preset). Any other tool counts, wherever it is registered: DSH also registers
 * session-creating tools in an agent's own scope (rc.5 `dsh-tool-subagent` standing mode). No live
 * manager: nothing to check.
 */
async function overriddenManagerTools(ctx, managerPreset) {
  const tools = ctx.get(services.tools)
  const agents = managerAgents(ctx, managerPreset)
  if (agents.length === 0 || typeof tools?.schemas !== 'function') return []
  const core = await loadCoreToolNames()
  const instance = ctx.get(services.instance)
  const contributedOf = instance?.[CONTRIBUTED_TOOLS]
  const exact = (agent) => {
    const inherited = toolNames(tools, scopeParentOf(agent))
    const contributed = new Set(typeof contributedOf === 'function' ? contributedOf.call(instance, agent) : [])
    const model = [...toolNames(tools, agent)].filter((name) => !isCoreTool(name, core, contributed, inherited))
    return sameSet(model, GUARDS.managerTools)
  }
  return agents.every(exact) ? [] : [code.managerTools]
}

/**
 * One check over the effective state.
 * @param {object} ctx - the row's Cordis context (`ctx.get` lookups only).
 * @param {{rows: readonly string[], policy: readonly {key: string, value: unknown}[]}} intended - readIntendedGuards().
 * @returns {Promise<import('../../contracts/guards.js').GuardReport>}
 */
export async function checkGuards(ctx, intended) {
  const managerPreset = intendedValue(intended, GUARDS.managerPresetKey)
  const overridden = Object.freeze([
    ...overriddenRows(ctx, guardedRows(ctx, intended)),
    ...overriddenPolicy(ctx, intended),
    ...await overriddenPresets(ctx, managerPreset),
    ...overriddenOrder(ctx),
    ...await overriddenManagerTools(ctx, managerPreset),
  ])
  return Object.freeze({ status: overridden.length === 0 ? GUARDS.status.ok : GUARDS.status.overridden, overridden })
}
