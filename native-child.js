import { applyNativeChild } from './src/native-runtime/child.js'
import * as childControl from './src/native-control/child.js'

export const name = 'fishball-native-child'
export const inject = ['profileContext', 'pluginPackages', 'webServer', 'webApp', 'connection', 'sessionController', 'pluginManager', 'appExit', 'appReady']
export async function apply(ctx, config) {
  await applyNativeChild(ctx, config)
  ctx.plugin(childControl, config.control ?? {})
}
