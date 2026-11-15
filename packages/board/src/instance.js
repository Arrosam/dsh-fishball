/**
 * Keep one contribution bound to the live, compatible `fishballInstance` (extension points §1).
 *
 * A missing service or another `apiVersion` is an "older instance": nothing is attached. The
 * service may arrive after this row (the app row publishes it after an asynchronous chat start),
 * be replaced, or disappear. Cordis emits `internal/service` for each of these in both supported
 * SDKs (`ReflectService.notify`, also on the provider's ACTIVE transition), so the binding follows
 * it without timers or a required inject, which would block activation on an older instance.
 *
 * The binding is released by a row effect, never by apply's return value: Cordis runs a
 * function-declaration `apply` as a constructor (`isConstructor`, then `new apply(ctx, config)`)
 * and discards what it returns, so a returned disposer would never run on disable.
 *
 * @param {object} ctx - the row's Cordis context (`get`, `on`, `effect`).
 * @param {{service: string, apiVersion: number, serviceEvent: string}} host - the service contract.
 * @param {(instance: object) => (() => void)} attach - contributes to one instance; returns its dispose.
 * @returns {{attached: () => boolean}} whether a compatible instance is bound now.
 */
export function followInstance(ctx, host, attach) {
  let bound
  let detach
  const release = () => {
    const done = detach
    bound = detach = undefined
    done?.()
  }
  const sync = () => {
    // Strict get: a provider that is not ACTIVE (still loading or unloading) reads as absent.
    const instance = ctx.get(host.service)
    if (instance === bound) return
    // Never keep contributions in a replaced or removed instance.
    release()
    if (instance?.apiVersion !== host.apiVersion) return
    bound = instance
    detach = attach(instance)
  }
  sync()
  ctx.on(host.serviceEvent, (name) => { if (name === host.service) sync() })
  ctx.effect(() => release)
  return { attached: () => bound !== undefined }
}

/**
 * R-FB-06: without fishball-core the row only logs one `fishball-core-missing` line, once per load.
 *
 * The check runs at the DSH's app ready, not at row load: core is the last bundle (design §8),
 * so this row normally loads before core's app row publishes the instance, and a load-time check
 * would report a core that is about to arrive. The app row publishes before boot settles, and app
 * ready commits only after it (dsh profile-boot, both SDKs), so a core that is present is bound by
 * then. `onReady` calls a late listener at once, which covers a row enabled after boot. A host
 * without `appReady` (a bare Cordis host, not a DSH profile) has no ready moment, so the check
 * runs at load there. An instance that arrives later is still attached by followInstance; the
 * line is not withdrawn, because it reports the state at ready. A core with another `apiVersion`
 * is an "older instance" (extension points §1) and also reads as missing.
 *
 * @param {object} ctx - the row's Cordis context (`get`, `effect`).
 * @param {{appReady: string}} host - the name of DSH's app-ready service.
 * @param {{attached: () => boolean}} binding - followInstance's result.
 * @param {() => void} warn - writes the one line.
 */
export function reportCoreMissing(ctx, host, binding, warn) {
  const check = () => { if (!binding.attached()) warn() }
  const appReady = ctx.get(host.appReady)
  if (typeof appReady?.onReady !== 'function') {
    check()
    return
  }
  // The disposer cancels a listener that has not fired when the row is disabled before ready.
  ctx.effect(() => appReady.onReady(check))
}
