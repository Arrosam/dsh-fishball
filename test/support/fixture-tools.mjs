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
