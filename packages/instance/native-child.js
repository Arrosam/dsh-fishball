import { applyNativeChild } from './src/native-runtime/child.js'

/**
 * The attached child's lifecycle row: identity checks, control wire and bounded shutdown.
 * launchOverlay inserts the slim rows beside it (src/native-runtime/overlay.js): the session-tools
 * row, the approvals row, the app row (src/slim/child/app.js) and the inbox row. The app row
 * provides `fishballApp`, and this row's readiness probe requires it and its bearer (§2.3, §3.2).
 *
 * The authenticated control transport carries envelope v2 only (§5.1). The v1 control row was
 * never mounted here and was removed (I10): its channel closed the wire on a frame it did not
 * recognise, so it and the session bridge could not share one transport. The
 * session-tools row attaches the v2 bridge client to that transport exactly as the v1 row did
 * (ctx.nativeRuntime.onControlTransport), and the lifecycle channel (health, readiness, stop,
 * the embed bearer) stays on the wire's own lifecycle operations, untouched by either.
 *
 * The slim rows used to be plugged here with ctx.plugin. They are overlay rows now, because the
 * loader's boot settlement waits only for its own rows' chains: a plugin nested here could still
 * be starting when appReady fired, and the app row then missed fishballApprovals (B5).
 */
export const name = 'fishball-native-child'
export const inject = ['profileContext', 'pluginPackages', 'agents', 'sessions', 'tools', 'appExit', 'appReady']
export async function apply(ctx, config) {
  await applyNativeChild(ctx, config)
}
