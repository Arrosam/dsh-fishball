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
 * @returns {{attached: boolean}} whether a compatible instance was bound at call time.
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
  return { attached: bound !== undefined }
}
