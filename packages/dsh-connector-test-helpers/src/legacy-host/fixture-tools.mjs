/**
 * Fixture tools shared by the fixture bundles (registered at boot or when Fishball
 * mounts them) and the worker (registered later). Every call is recorded so a
 * test can tell whether a tool body ran. State lives on globalThis because DSH
 * may load a bundle through a different module URL than the worker.
 */
import { BSK_PARAMETERS, FIXTURE_DESCRIPTION } from './constants.mjs'

export const store = (globalThis.__fbtestFixtures ??= {})
store.calls ??= []
store.lifecycle ??= []
store.registerErrors ??= []
/** apply/dispose of the Fishball-only fixture bundles: proves whether their code runs. */
store.bundleEvents ??= []
/** Per-name disposers of the fbtest-tools registrations, so a test can re-register one with another schema. */
store.fixtureRegs ??= new Map()

export const GENERIC_PARAMETERS = {
  type: 'object',
  properties: {
    text: { type: 'string' }, command: { type: 'string' }, description: { type: 'string' },
    path: { type: 'string' }, content: { type: 'string' },
    sandbox_permissions: { type: 'string' }, justification: { type: 'string' },
  },
}

export function fixtureTool(name, parameters = name === 'bsk_inspect' ? BSK_PARAMETERS : GENERIC_PARAMETERS) {
  return {
    name,
    // Two lines: an approval reason must carry only the first one (R6).
    description: FIXTURE_DESCRIPTION.first(name) + '\n' + FIXTURE_DESCRIPTION.second,
    parameters,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      store.calls.push({ name, args, sessionId: exec?.agent?.id ?? null, at: Date.now() })
      return 'fixture:' + name + ':' + JSON.stringify(args)
    },
  }
}

/** Register each named fixture tool on a context; a failing name is recorded, never thrown. */
export function registerFixtures(ctx, names, registry) {
  const disposers = []
  for (const name of names) {
    try {
      const dispose = ctx.tools.register(fixtureTool(name))
      disposers.push(dispose)
      registry?.set(name, dispose)
    } catch (error) { store.registerErrors.push({ name, error: String(error?.message ?? error) }) }
  }
  return () => { for (const dispose of disposers) dispose() }
}

/** Cordis plugin of a fixture bundle that is installed but not enabled in the profile: one tool, apply/dispose recorded. */
export function bundleFixture(bundle, toolName) {
  return {
    name: bundle,
    inject: ['tools'],
    apply(ctx) {
      ctx.effect(() => {
        store.bundleEvents.push({ bundle, type: 'apply', at: Date.now() })
        const dispose = ctx.tools.register(fixtureTool(toolName))
        return () => { dispose(); store.bundleEvents.push({ bundle, type: 'dispose', at: Date.now() }) }
      }, bundle + ' fixture')
    },
  }
}

// ---- P12 (plugin manager settings) ----
/** apply/dispose/fail of the settings fixtures' rows, with the config each apply received (plain values). */
store.settingsEvents ??= []
/** The live config objects the settings rows received, so a volatile change can be read where the plugin reads it. */
store.settingsConfigs ??= []

/** A config snapshot with volatile fields read through their getter, as the plugin itself reads them (S30). */
export function plainConfig(value) {
  if (typeof value?.get === 'function') return plainConfig(value.get())
  if (Array.isArray(value)) return value.map(plainConfig)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plainConfig(child)]))
  return value
}

/**
 * The apply of one settings-fixture row: records the mounted entry id (private-tree rows carry the
 * fbo-<bundle>-- prefix, DESIGN §4) and the config, and a dispose when the row stops. A config that
 * failOn(config) accepts makes apply throw after recording 'fail', so a valid value can fail to mount.
 */
export function settingsRow(plugin, row, failOn) {
  return function apply(ctx, config) {
    const entryId = ctx.fiber?.entry?.options?.id ?? null
    const base = { plugin, row, entryId, config: plainConfig(config ?? {}), at: Date.now() }
    if (failOn?.(config ?? {})) {
      store.settingsEvents.push({ ...base, type: 'fail' })
      throw new Error(plugin + ': apply throws on purpose')
    }
    store.settingsEvents.push({ ...base, type: 'apply' })
    store.settingsConfigs.push({ plugin, row, entryId, config })
    ctx.effect(() => () => { store.settingsEvents.push({ plugin, row, entryId, type: 'dispose', at: Date.now() }) }, plugin + ' ' + row)
  }
}
