/**
 * Fixture tools shared by the fixture bundle (registered at boot) and the worker
 * (registered later). Every call is recorded so a test can tell whether a tool
 * body ran. State lives on globalThis because DSH may load the bundle through a
 * different module URL than the worker.
 */
import { BSK_PARAMETERS } from './constants.mjs'

export const store = (globalThis.__fbtestFixtures ??= { calls: [], lifecycle: [], registerErrors: [] })

const GENERIC_PARAMETERS = {
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
    description: 'fbtest fixture tool ' + name + '. Records every call.',
    parameters,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      store.calls.push({ name, args, sessionId: exec?.agent?.id ?? null, at: Date.now() })
      return 'fixture:' + name + ':' + JSON.stringify(args)
    },
  }
}

/** Register each named fixture tool on a context; a failing name is recorded, never thrown. */
export function registerFixtures(ctx, names) {
  const disposers = []
  for (const name of names) {
    try { disposers.push(ctx.tools.register(fixtureTool(name))) } catch (error) { store.registerErrors.push({ name, error: String(error?.message ?? error) }) }
  }
  return () => { for (const dispose of disposers) dispose() }
}
