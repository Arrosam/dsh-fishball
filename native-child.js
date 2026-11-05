import { applyNativeChild } from './src/native-runtime/child.js'
import * as sessionTools from './src/slim/child/session-tools.js'
import * as approvals from './src/slim/child/approvals.js'

/**
 * The attached child's lifecycle row: identity checks, control wire and bounded shutdown.
 * launchOverlay inserts the slim app row (src/slim/child/app.js) beside it; that row provides
 * `fishballApp`, and this row's readiness probe requires it and its bearer (§2.3, §3.2).
 *
 * The authenticated control transport carries envelope v2 only (§5.1). The v1 control row
 * (src/native-control/child.js) is deliberately not mounted: its channel closes the wire on a
 * frame it does not recognise, so it and the session bridge cannot share one transport. The
 * session-tools row attaches the v2 bridge client to that transport exactly as the v1 row did
 * (ctx.nativeRuntime.onControlTransport), and the lifecycle channel (health, readiness, stop,
 * the embed bearer) stays on the wire's own lifecycle operations, untouched by either.
 */
export const name = 'fishball-native-child'
export const inject = ['profileContext', 'pluginPackages', 'agents', 'sessions', 'tools', 'appExit', 'appReady']
export async function apply(ctx, config) {
  await applyNativeChild(ctx, config)
  // The row injects the nativeRuntime this call has just provided and the child's tools.
  ctx.plugin(sessionTools, {})
  // The approval tools, their cards and Fishball's own question answerer share that row's one
  // bridge client (fishballBridge); T09 opens no second channel.
  ctx.plugin(approvals, {})
}
