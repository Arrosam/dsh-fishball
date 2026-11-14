/**
 * fishball-ui's guard row (design §5a.2): core's bundle patch inserts it (`cordis.patch.yml`) and
 * the guard rows beside it. It provides `fishballGuards` (src/guards/): the standalone self-reorder
 * and the `guards-overridden` report. It has no package manifest of its own, so DSH resolves its
 * host imports through core's manifest (its peers) and serves no second client for it.
 */
import { GUARDS } from '../../contracts/constants.js'
import { createGuards } from '../../src/guards/index.js'

export const name = GUARDS.pluginName

/** Every service the guards read is looked up, never injected: a missing one is "nothing to check". */
export function apply(ctx) {
  ctx.provide(GUARDS.serviceName, createGuards(ctx))
}
