/**
 * Fixture bundle: registers the global fixture tools at boot (hidden names,
 * shell names and ordinary names) and records agent lifecycle events.
 */
import { BOOT_TOOLS, LATE_TOOLS } from '../../constants.mjs'
import { registerFixtures, store } from '../../fixture-tools.mjs'

export const name = 'fbtest-tools'
export const inject = ['tools']
export function apply(ctx) {
  ctx.effect(() => registerFixtures(ctx, BOOT_TOOLS.filter((n) => !LATE_TOOLS.includes(n))), 'fbtest fixture tools')
  ctx.on('agent/created', ({ agent, source }) => { store.lifecycle.push({ type: 'created', id: agent.id, source: source?.kind ?? String(source), at: Date.now() }) })
  ctx.on('agent/disposed', ({ agent }) => { store.lifecycle.push({ type: 'disposed', id: agent.id, at: Date.now() }) })
}
