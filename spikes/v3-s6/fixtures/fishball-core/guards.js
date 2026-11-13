/**
 * V3-S6 probe: compare fishball-core's intended guards (its own bundle patch) with the effective
 * composition and policy, using only public host services: the Cordis `loader` (entries, their
 * effective `disabled`), `permissionPresets`, `sandboxPolicy`, `approval` and `agentPresets`.
 * No DSH file is read.
 */

/**
 * The intended guards as constants. They MUST equal cordis.patch.yml; a product test pins the pair
 * (the spike checks it with the SDK's own patch parser). Core cannot parse its YAML patch at
 * runtime without a YAML dependency, and the `!!js` row makes a JSON patch impossible.
 */
export const GUARDS = Object.freeze({
  disabled: Object.freeze(['ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization',
    'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller', 'fishball-instance',
    'preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  sandbox: 'read-only',
  approval: 'ask',
  presets: Object.freeze(['read-only']),
  defaultPreset: 'read-only',
  agentPreset: 'fishball',
  /** The presets the guarded DSH may offer: core's and fishball-watchdog's (shipped ones are switched off). */
  agentPresets: Object.freeze(['fishball', 'watchdog']),
})
export const intendedGuards = () => GUARDS

/** One loader entry per row id at the root include, or undefined when the row is absent. */
function entryOf(ctx, id) {
  for (const entry of ctx.loader.entries()) if (entry.options.id === id) return entry
}

/**
 * The effective view. A guard row that is absent from the composition counts as satisfied
 * (it cannot run); one present and enabled is overridden.
 */
export async function effectivePresets(ctx) {
  return (await ctx.get('agentPresets')?.list?.())?.map((preset) => preset.id) ?? []
}

export function effectiveGuards(ctx) {
  const intended = intendedGuards()
  const rows = intended.disabled.map((id) => {
    const entry = entryOf(ctx, id)
    return { id, present: entry !== undefined, disabled: entry === undefined ? true : entry.disabled }
  })
  const policy = {
    sandbox: ctx.get('sandboxPolicy')?.defaultMode,
    approval: ctx.get('approval')?.config?.policy,
    presets: ctx.get('permissionPresets')?.names,
    defaultPreset: ctx.get('permissionPresets')?.defaultPreset,
    agentPreset: ctx.get('agentPresets')?.defaultId,
  }
  const overridden = [
    ...rows.filter((row) => !row.disabled).map((row) => row.id),
    ...['sandbox', 'approval', 'defaultPreset', 'agentPreset'].filter((key) => policy[key] !== intended[key]).map((key) => 'policy.' + key),
    ...(JSON.stringify(policy.presets) === JSON.stringify(intended.presets) ? [] : ['policy.presets']),
  ]
  return { rows, policy, overridden, status: overridden.length ? 'guards-overridden' : 'ok' }
}
