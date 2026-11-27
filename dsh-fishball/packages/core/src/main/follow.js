/**
 * A port over another row's service that may start after core's main row, be replaced or go away
 * (the guard row's `fishballGuards`). Cordis emits `internal/service` with the service's name for
 * each of these (both SDKs), so the port follows it with no
 * inject (a missing service must not stop this row) and no timer.
 */
import { GUARDS } from '../../contracts/constants.js'
import { emitIsolated, subscribe } from '../link/listeners.js'

/**
 * @param {object} ctx the main row's Cordis context
 * @param {string} name the service name
 * @param {{report: (service: object) => unknown, onChange: string}} read how to read the service's
 *   value, and the name of its change-subscription method
 * @returns {{report(): unknown, onChange(fn: (value: unknown) => void): () => void, dispose(): void}}
 *   `report()` is null while the service is absent; `onChange` fires on the service's own changes
 *   and when it arrives, is replaced or leaves
 */
export function followService(ctx, name, read) {
  const listeners = new Set()
  let bound
  let unbind = () => {}
  const report = () => (bound === undefined ? null : read.report(bound))
  const sync = () => {
    const service = ctx.get(name)
    if (service === bound) return
    unbind()
    bound = service
    unbind = typeof service?.[read.onChange] === 'function' ? service[read.onChange](() => emitIsolated(listeners, report())) : () => {}
    emitIsolated(listeners, report())
  }
  sync()
  const off = ctx.on(GUARDS.serviceEvent, (changed) => { if (changed === name) sync() })
  return Object.freeze({
    report,
    onChange: (fn) => subscribe(listeners, fn),
    dispose() { off?.(); unbind(); listeners.clear() },
  })
}
