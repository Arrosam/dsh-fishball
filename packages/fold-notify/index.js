import { PLUGIN, TOOL } from './src/constants.js'
import { registerManagerNotify } from './src/tool.js'
import { followInstance } from './src/instance.js'

export { Config } from './src/config.js'
export const name = PLUGIN.name
// Cordis on both supported hosts treats '?' literally, not as optional injection.
// The instance is looked up at runtime (src/instance.js), so the FN1 row loads without X0-C.
export const inject = ['tools']

export function apply(ctx) {
  // Disabling the row removes notify_user with the X2 registration (followInstance's effect).
  followInstance(ctx, TOOL.host, registerManagerNotify)
}
