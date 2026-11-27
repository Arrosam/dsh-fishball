/**
 * Core's one-time bundle reorder (R-FB-12). Keep this path row: DSH uses it to resolve core's
 * host peers and serve core's settings client once. The actual guards are in the bundle patch.
 */
import { GUARDS } from '../../contracts/constants.js'
import { reorderOnce } from './reorder.js'

export const name = GUARDS.pluginName

export function apply(ctx) {
  const profile = ctx.get(GUARDS.services.profileContext)
  // This boot is already composed. Do not wait on the plugin manager's manifest lock during boot.
  if (profile !== undefined) void reorderOnce(profile, ctx.logger(GUARDS.logger))
}
