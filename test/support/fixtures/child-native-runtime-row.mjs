/**
 * CHILD-BOOT fixture host row: provides an empty `nativeRuntime` service, so the child-only
 * `fishball-settings` row (inject: nativeRuntime, connection) can activate in a plain DSH profile.
 * The real service comes from the Fishball instance's native child rows, which need a main DSH to
 * attach to. An empty object offers no `onInstanceSettingsTransport`, so the settings relay stays
 * unattached: the settings routes (status, retry, restart only; model sync is main-only) answer
 * "unavailable", which CHILD-BOOT does not observe.
 */
export const name = 'fbtest-child-native-runtime'
const SERVICE = 'nativeRuntime'
export function apply(ctx) {
  ctx.provide(SERVICE, {})
}
