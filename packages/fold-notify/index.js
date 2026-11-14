import { LOG, PLUGIN, TOOL } from './src/constants.js'
import { registerManagerNotify } from './src/tool.js'
import { followInstance, reportCoreMissing } from './src/instance.js'

export { Config } from './src/config.js'
export const name = PLUGIN.name
// Cordis on both supported hosts treats '?' literally, not as optional injection.
// fishball-core's instance is looked up at runtime (src/instance.js), so the row loads without core.
export const inject = ['tools']

export function apply(ctx) {
  // Disabling the row removes notify_user with the X2 registration (followInstance's effect).
  const binding = followInstance(ctx, TOOL.host, registerManagerNotify)
  reportCoreMissing(ctx, TOOL.host, binding, () => ctx.logger(PLUGIN.name).warn(LOG.coreMissing))
}
