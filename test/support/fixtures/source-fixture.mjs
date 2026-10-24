/**
 * P8: shared body of the ctx.fishball source fixtures. Each fixture row captures the context it
 * gets the 'fishball' service in (through ctx.inject, or the row's own context with a static
 * inject), so the worker can register sources and publish AS that row: the service names a source
 * after the calling plugin. apply/dispose of the row and inject/release of the service context
 * are recorded, so a test can tell whether the plugin's code runs.
 */
import { store } from '../fixture-tools.mjs'

store.sourceCtxs ??= new Map()
store.sourceEvents ??= []
/**
 * P8 review: the service object a row held, per label, kept after the row unloads. Cordis refuses
 * ctx.fishball on an inactive context itself, so a plugin that kept the object is the only way a
 * call after the unload reaches Fishball.
 */
store.staleServices ??= new Map()

export function sourceFixture(name, { staticInject = false } = {}) {
  return {
    name,
    inject: staticInject ? ['fishball'] : [],
    apply(ctx, config) {
      // Several rows may share one module: the row's config names it.
      const label = config?.label ?? name
      const record = (type) => store.sourceEvents.push({ label, type, at: Date.now() })
      ctx.effect(() => { record('apply'); return () => record('dispose') }, name + ' fixture')
      const capture = (fc) => {
        store.sourceCtxs.set(label, fc)
        const service = fc.fishball
        record('inject')
        fc.effect(() => () => { if (store.sourceCtxs.get(label) === fc) store.sourceCtxs.delete(label); store.staleServices.set(label, service); record('release') }, name + ' fishball context')
      }
      if (staticInject) capture(ctx)
      else ctx.inject(['fishball'], capture)
    },
  }
}
