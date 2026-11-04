import { applyNativeChild } from './src/native-runtime/child.js'
import * as childControl from './src/native-control/child.js'

/**
 * The attached child's lifecycle row: identity checks, control wire and bounded shutdown.
 * launchOverlay inserts the slim app row (src/slim/child/app.js) beside it; that row provides
 * `fishballApp`, and this row's readiness probe requires it and its bearer (§2.3, §3.2).
 */
export const name = 'fishball-native-child'
export const inject = ['profileContext', 'pluginPackages', 'agents', 'sessions', 'tools', 'appExit', 'appReady']
export async function apply(ctx, config) {
  await applyNativeChild(ctx, config)
  ctx.plugin(childControl, config.control ?? {})
}
