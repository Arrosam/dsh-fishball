/**
 * One in-process host for the instance-follower cases: the current DSH's real cordis `Context`
 * (fishball-test-helpers/dsh importDsh('cordis')), no DSH process. Everything the cases observe is
 * the follower's public surface and cordis' own behaviour:
 * - the row is a cordis plugin whose apply calls `followInstance` (and, when asked, `reportCoreMissing`)
 *   exactly as an amenity's row does; `attach` records every instance it is handed and every dispose
 *   it returns being called; `warn` counts its calls;
 * - the fake core is its own plugin fiber providing `fishballInstance`, so providing, removing and
 *   replacing it emit cordis' `internal/service` as DSH does when core's row starts, stops or reloads;
 * - `appReady` (optional) is DSH's launcher readiness stand-in: `onReady(fn) → dispose`, a late
 *   listener called at once, fired by `w.ready()`.
 */
import { importDsh } from 'fishball-test-helpers/dsh'
import { settle } from 'fishball-test-helpers/wait'
import { followInstance, reportCoreMissing } from 'fishball-shared/instance-follower'
import { ABSENT_VERSION, FIXTURE, HOST } from './constants.mjs'

const { Context } = await importDsh('cordis')

/** A fake `fishballInstance` of `apiVersion` (ABSENT_VERSION: no such member); `gen` tells instances apart. */
const fakeInstance = (apiVersion, gen) => (apiVersion === ABSENT_VERSION ? { gen } : { apiVersion, gen })

/**
 * A fresh host, disposed by `t`'s cleanup. Options: `apiVersion` (the row's host version),
 * `appReady` (provide the readiness stand-in),
 * `report` (also call reportCoreMissing).
 */
export async function worldFor(t, { apiVersion, appReady = false, report = false }) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const ready = { fired: false, listeners: new Set() }
  if (appReady) {
    ctx.provide(HOST.appReady, {
      onReady(listener) {
        if (ready.fired) { listener(); return () => {} }
        ready.listeners.add(listener)
        return () => { ready.listeners.delete(listener) }
      },
    })
  }

  /** attach calls ({instance, disposed}) in order, and warn calls. */
  const attaches = []
  let warnings = 0
  let binding
  let rowFiber
  let coreFiber
  let generation = 0
  const host = Object.freeze({ ...HOST, apiVersion })

  const w = {
    ctx,
    attaches,
    get warnings() { return warnings },
    get binding() { return binding },
    /** Instances currently attached (attached and not yet disposed). */
    live: () => attaches.filter((a) => !a.disposed).map((a) => a.instance),
    /** Mounts the row. */
    async loadRow() {
      rowFiber = ctx.plugin({
        name: FIXTURE.row,
        apply(c) {
          binding = followInstance(c, host, (instance) => {
            const entry = { instance, disposed: 0 }
            attaches.push(entry)
            return () => { entry.disposed++ }
          })
          if (report) reportCoreMissing(c, host, binding, () => { warnings++ })
        },
      })
      await rowFiber
      await settle()
    },
    async disposeRow() { await rowFiber.dispose(); await settle() },
    /** Provides a fake core of `version` from its own fiber; answers the instance. */
    async provideCore(version) {
      const instance = fakeInstance(version, ++generation)
      coreFiber = ctx.plugin({ name: FIXTURE.core, apply: (c) => { c.provide(HOST.service, instance) } })
      await coreFiber
      await settle()
      return instance
    },
    /**
     * Provides a fake core whose fiber is still loading (its apply has provided the service and waits):
     * answers {instance, finish()}; finish() lets the fiber become ACTIVE, as core's app row does
     * after its asynchronous chat start.
     */
    async provideLoadingCore(version) {
      const instance = fakeInstance(version, ++generation)
      let finish
      const gate = new Promise((resolve) => { finish = resolve })
      coreFiber = ctx.plugin({ name: FIXTURE.core, async apply(c) { c.provide(HOST.service, instance); await gate } })
      await settle()
      return { instance, async finish() { finish(); await coreFiber; await settle() } }
    },
    async removeCore() { await coreFiber?.dispose(); coreFiber = undefined; await settle() },
    /** Replaces the core as a reload of core's row does: the old provider leaves, a new one arrives. */
    async replaceCore(version) { await w.removeCore(); return w.provideCore(version) },
    /** Another service coming and going (its own internal/service events). */
    async provideOther() {
      const fiber = ctx.plugin({ name: FIXTURE.otherService, apply: (c) => { c.provide(FIXTURE.otherService, {}) } })
      await fiber
      await settle()
      await fiber.dispose()
      await settle()
    },
    /** Fires DSH's app ready (appReady: true). */
    async ready() {
      ready.fired = true
      for (const listener of [...ready.listeners]) listener()
      ready.listeners.clear()
      await settle()
    },
  }
  return w
}
