import path from 'node:path'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { swapWorlds } from '@dsh-instance/test-helpers/swap'
import { MODULE, ROW_CONFIG } from '../support/constants.mjs'
import { PACKAGE_DIR, importInstance, packageFile } from '../support/instance.mjs'
import { HMR } from './constants.mjs'

const worlds = swapWorlds(HMR.tag, {
  root: PACKAGE_DIR,
  replace: { [packageFile(MODULE.runtime)]: path.join(import.meta.dirname, 'fake-runtime.mjs') },
})

const live = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

export async function hmrWorld(t, sdk) {
  const scope = cleanups(t)
  const home = tempRoot(scope, HMR.tempPrefix)
  const { RUNTIME_LIMITS } = await importInstance(sdk, MODULE.constants)
  const ctl = { instances: [], limits: RUNTIME_LIMITS }
  const id = worlds.open(ctl)
  const enabledField = live(true)
  const rows = []
  const releases = []
  scope.defer(async () => {
    try {
      for (const instance of ctl.instances) instance.failShutdown = false
      for (const release of releases) release()
      for (const row of rows.reverse()) await row.dispose().catch(() => {})
    } finally {
      worlds.close(id)
      globalThis[HMR.registryKey]?.delete(home)
    }
  })
  const host = await worlds.importIn(id, packageFile(MODULE.host), { [SDK.versionTag]: sdk })

  async function applyRow() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const readyCallbacks = new Set()
    const ctx = {
      profileContext: { home, installAnchor: '', packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: { onReady(fn) { readyCallbacks.add(fn); return () => readyCallbacks.delete(fn) } },
      connection: { fetch: fetchRegistry().fetch },
      webServer: { getOrigin: () => HMR.webOrigin },
      logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
      provide(name, value) { services.set(name, value) },
      on(event, fn) {
        const set = listeners.get(event) ?? new Set()
        set.add(fn)
        listeners.set(event, set)
        return () => set.delete(fn)
      },
      get: (name) => services.get(name),
    }
    await host.apply(ctx, { enabled: enabledField.ref })
    const runtime = ctl.instances.at(-1)
    const row = {
      runtime,
      service: services.get(HMR.service),
      fireReady() { for (const fn of [...readyCallbacks]) fn(); readyCallbacks.clear() },
      setEnabled(next) {
        enabledField.set(next)
        for (const fn of [...(listeners.get(ROW_CONFIG.volatileUpdate) ?? [])]) fn([[ROW_CONFIG.enabled]])
      },
      async dispose() {
        for (const fn of effects.splice(0).reverse()) await fn()
      },
    }
    rows.push(row)
    return row
  }

  return { home, applyRow, releaseOnCleanup: (fn) => releases.push(fn) }
}
