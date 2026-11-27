/**
 * Register during profile composition so the app-ready sample belongs to that callback, not a
 * later IPC round trip. runProfile commits appReady before returning its root context to worker.mjs.
 */
import { DSH, SURFACE } from './constants.mjs'

export const name = DSH.readyProbeRow
export const inject = ['appReady']
export function apply(ctx) {
  ctx.appReady.onReady(() => {
    globalThis.__fbwireReady = Object.fromEntries(Object.values(SURFACE.service).map((name) => {
      const service = ctx.get(name)
      return [name, { present: service != null, apiVersion: service?.apiVersion ?? null }]
    }))
  })
}
