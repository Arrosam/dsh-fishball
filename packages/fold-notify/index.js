import { PLUGIN, TOOL } from './src/constants.js'
import { registerManagerNotify } from './src/tool.js'

export { Config } from './src/config.js'
export const name = PLUGIN.name
// Cordis on both supported hosts treats '?' literally, not as optional injection.
// Optional instance injection leaves the FN1 settings row loadable without X0-C.
export const inject = ['tools']

export function apply(ctx) {
  ctx.inject([TOOL.service], registerManagerNotify)
}
