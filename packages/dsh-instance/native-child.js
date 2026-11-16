import { applyNativeChild } from './src/native-runtime/child.js'
import { RUNTIME } from './src/native-runtime/constants.js'

/**
 * The attached child's lifecycle row: identity checks, the authenticated lifecycle wire, the
 * readiness gate (I-READY: generic DSH signals only, src/native-runtime/child.js childReadiness)
 * and bounded shutdown. The child-side row `dsh-instance-child` (child-row.js) injects the
 * `nativeRuntime` service it provides. No Fishball-side row is mounted or read here (R-ARCH-10).
 *
 * `inject` names the base services the gate requires (RUNTIME.requiredServices) besides
 * `pluginPackages`, so the row, and with it the child-side row, starts only once they are up.
 */
export const name = 'fishball-native-child'
export const inject = ['pluginPackages', ...RUNTIME.requiredServices]
export async function apply(ctx, config) {
  await applyNativeChild(ctx, config)
}
