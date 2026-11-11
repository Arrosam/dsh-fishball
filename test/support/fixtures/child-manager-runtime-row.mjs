/**
 * CHILD-BOOT-REOPEN fixture host row: a detached `nativeRuntime`, so the child's manager chain
 * (fishball-native-session-tools -> fishball-native-approvals -> fishball-native-app, which provides
 * `fishballInstance` and so the `api/fishball/session` route) can activate in a plain DSH web profile.
 * The real service comes from the Fishball instance's native child row, which needs a main DSH to
 * attach to. This one names a host id (the bridge client refuses an empty one) and never offers a
 * transport, which the session-tools row documents as an ordinary state ("the child boots
 * detached"). Manager tools that need the main host therefore stay unavailable; CHILD-BOOT-REOPEN
 * observes only the page open, the manager session and the session list.
 */
export const name = 'fbtest-child-manager-runtime'
const SERVICE = 'nativeRuntime'
const HOST_ID = 'fbtest-child-reopen-host'
/** No transport ever arrives: subscribing is accepted and the disposer does nothing. */
const never = () => () => {}
export function apply(ctx) {
  ctx.provide(SERVICE, { hostId: HOST_ID, onControlTransport: never, onAdminTransport: never, onProviderSyncTransport: never, onInstanceSettingsTransport: never })
}
