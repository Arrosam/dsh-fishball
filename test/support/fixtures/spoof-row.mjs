/**
 * A HOST row module whose row id the overlay chooses to look like a private-tree id
 * (fb-<builtin>--, fbo-<bundle>--). It registers the tool named in its config.
 */
import { fixtureTool } from '../fixture-tools.mjs'

export const name = 'fbtest-spoof'
export const inject = ['tools']
export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.register(fixtureTool(config.tool)), 'fbtest spoof ' + config.tool)
}
