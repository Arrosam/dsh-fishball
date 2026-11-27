/** Fishball's scoped use of the host executor; this is not a new model tool. */
export const MANAGER_PTC = Object.freeze({
  setting: 'ptc',
  default: true,
  runtime: 'ptcRuntime',
  tools: 'tools',
  transport: 'run_code',
  permissions: 'sandbox_permissions',
  readOnly: 'Fishball programs are read-only and cannot request a wider sandbox.',
})

export async function installManagerPtc(agentCtx, enabled) {
  // 0.2.1 still supports Fishball but has no scoped executor API.
  const registry = agentCtx.get(MANAGER_PTC.tools)
  if (typeof registry?.setExecutor !== 'function') return false
  const programmatic = enabled !== false && Boolean(agentCtx.get(MANAGER_PTC.runtime))
  const { apply } = programmatic
    ? await import('@deepseek-ai/dsh-tool-executor-ptc')
    : await import('@deepseek-ai/dsh-tool-executor-native')
  // Mount on the singleton agent, not on the profile's default preset: another session can use
  // that preset too, and the manager may have already been resumed outside core.
  if (programmatic) {
    // DSH's transport would otherwise let an approved one-shot override widen the program.
    registry.guard((call) => call.name === MANAGER_PTC.transport && call.arguments[MANAGER_PTC.permissions] !== undefined
      ? MANAGER_PTC.readOnly
      : undefined)
  }
  apply(agentCtx, {})
  return programmatic
}
