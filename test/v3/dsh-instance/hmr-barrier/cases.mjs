/**
 * Regression suite for dsh-instance/host.js HMR shutdown barrier recovery and exit-listener cleanup.
 *
 * Covers:
 * - A failed predecessor shutdown still blocks automatic successor startup (no silent takeover).
 * - Explicit retry/restart still refuses while the predecessor cannot stop (no duplicate child).
 * - Explicit retry, restart, and enabled off→on recover once the predecessor stops cleanly.
 * - A subsequent HMR reload recovers automatically once the predecessor stops cleanly.
 * - Repeated failed HMR reloads do not leak `process.on('exit')` listeners, and clean teardown
 *   removes the registry entry and all listeners.
 * - Concurrent stop() while predecessor shutdown is still in-flight deduplicates onto it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

const WORLDS_KEY = Symbol.for('dsh-fishball.hmr-barrier-test-worlds.v1')
const REGISTRY_KEY = Symbol.for('dsh-fishball.native-lifecycle.v1')
const WORLD_PARAM = 'fbhmr'
const FAKE_RUNTIME = pathToFileURL(path.join(import.meta.dirname, 'fake-runtime.mjs')).href
const REPO_URL = pathToFileURL(path.dirname(path.dirname(V3.instance.dir)) + path.sep).href
const RUNTIME_MODULE = /\/src\/native-runtime\/index\.js$/

const worlds = (globalThis[WORLDS_KEY] ??= new Map())
let hooked = false
let worldSeq = 0

const tagOf = (url) => {
  try { return new URL(url).searchParams.get(WORLD_PARAM) ?? undefined } catch { return undefined }
}
const withTag = (url, id) => {
  const next = new URL(url)
  next.searchParams.set(WORLD_PARAM, id)
  return next.href
}

function ensureHook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const id = tagOf(context.parentURL)
      const resolved = nextResolve(specifier, context)
      if (id === undefined || !resolved.url.startsWith(REPO_URL)) return resolved
      const url = new URL(resolved.url)
      if (RUNTIME_MODULE.test(url.pathname)) {
        const fake = new URL(FAKE_RUNTIME)
        for (const [k, v] of url.searchParams) fake.searchParams.set(k, v)
        return { ...resolved, url: withTag(fake.href, id) }
      }
      return { ...resolved, url: withTag(resolved.url, id) }
    },
  })
}

function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open: () => open() }
}

const live = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

async function hmrWorld(t, sdk) {
  ensureHook()
  await importInstance(sdk, path.join('src', 'native-runtime', 'constants.js'))
  const id = String(++worldSeq)
  const rawHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-hmr-barrier-'))
  const home = fs.realpathSync(rawHome)
  const ctl = { instances: [] }
  worlds.set(id, ctl)

  const url = new URL(pathToFileURL(path.join(V3.instance.dir, 'host.js')))
  url.searchParams.set('fbsdk', sdk)
  url.searchParams.set(WORLD_PARAM, id)
  const host = await import(url.href)

  const enabledField = live(true)
  const rows = []

  t.after(async () => {
    for (const instance of ctl.instances) {
      instance.failShutdown = false
      instance.shutdownGate = null
    }
    for (const row of [...rows].reverse()) {
      await row.dispose().catch(() => {})
    }
    worlds.delete(id)
    globalThis[REGISTRY_KEY]?.delete(home)
    fs.rmSync(home, { recursive: true, force: true })
  })

  async function applyRow() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const readyCallbacks = new Set()
    const ctx = {
      profileContext: { home, installAnchor: '', packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: { onReady(fn) { readyCallbacks.add(fn); return () => readyCallbacks.delete(fn) } },
      connection: { fetch: { register: () => () => {} } },
      webServer: { getOrigin: () => 'http://127.0.0.1:41998' },
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
      service: services.get('nativeFishballRuntime'),
      locator: services.get('dshInstanceChild'),
      fireReady() { for (const fn of [...readyCallbacks]) fn(); readyCallbacks.clear() },
      setEnabled(next) {
        enabledField.set(next)
        for (const fn of [...(listeners.get('loader/volatile-update') ?? [])]) fn([['enabled']])
      },
      async dispose() {
        for (const fn of effects.splice(0).reverse()) await fn()
      },
    }
    rows.push(row)
    return row
  }

  async function until(cond, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs
    while (!cond()) {
      if (Date.now() > deadline) return false
      await new Promise((r) => setTimeout(r, 10))
    }
    return true
  }

  return { home, ctl, applyRow, until }
}

export function registerHmrBarrierCases(sdk) {
  describe(`dsh-instance HMR shutdown barrier recovery (SDK ${sdk})`, () => {
    test('failed predecessor shutdown blocks automatic startup and retry while still failing, then retry recovers once predecessor stops', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      assert.ok(await w.until(() => a.service.status().state === 'ready'))
      assert.equal(a.runtime.calls.start, 1)

      // Predecessor shutdown fails transiently (e.g. STOP_TIMEOUT while unwinding).
      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      assert.ok(await w.until(() => b.service.status().state === 'failed'))
      assert.equal(b.runtime.calls.start, 0, 'successor must not start while predecessor shutdown failed')

      // While predecessor still fails to stop, retry must re-check and still refuse to start a duplicate child.
      const beforeRetry = a.runtime.calls.shutdown
      const failedRetry = await b.service.retry()
      assert.equal(failedRetry.state, 'failed')
      assert.equal(failedRetry.code, 'NATIVE_STOP_FAILED')
      assert.equal(a.runtime.calls.shutdown, beforeRetry + 1, 'retry must re-verify predecessor shutdown')
      assert.equal(b.runtime.calls.start, 0, 'retry must not start a duplicate child when predecessor still fails')

      // Once predecessor finishes stopping, retry clears the barrier and starts the successor cleanly.
      a.runtime.failShutdown = false
      const recovered = await b.service.retry()
      assert.equal(recovered.state, 'ready')
      assert.equal(recovered.code, null)
      assert.equal(b.runtime.calls.start, 1)
    })

    test('enabled off→on recovers once predecessor shutdown succeeds', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      assert.ok(await w.until(() => a.service.status().state === 'ready'))

      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      assert.ok(await w.until(() => b.service.status().state === 'failed'))
      assert.equal(b.runtime.calls.start, 0)

      a.runtime.failShutdown = false
      b.setEnabled(false)
      assert.ok(await w.until(() => b.service.status().state === 'disabled'))
      b.setEnabled(true)
      assert.ok(await w.until(() => b.service.status().state === 'ready'))
      assert.equal(b.runtime.calls.start, 1)
    })

    test('subsequent HMR reload recovers automatically once predecessor stops', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      assert.ok(await w.until(() => a.service.status().state === 'ready'))

      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      assert.ok(await w.until(() => b.service.status().state === 'failed'))
      assert.equal(b.runtime.calls.start, 0)

      // Predecessor finishes unwinding before the next HMR reload C.
      a.runtime.failShutdown = false
      const c = await w.applyRow()
      c.fireReady()
      assert.ok(await w.until(() => c.service.status().state === 'ready'))
      assert.equal(c.service.status().code, null)
      assert.equal(c.runtime.calls.start, 1)
    })

    test('repeated failed HMR reloads do not leak process exit listeners and clean shutdown clears registry', async (t) => {
      const w = await hmrWorld(t, sdk)
      const baseline = process.listenerCount('exit')

      const first = await w.applyRow()
      first.fireReady()
      assert.ok(await w.until(() => first.service.status().state === 'ready'))
      first.runtime.failShutdown = true

      let latest = first
      for (let i = 0; i < 15; i += 1) {
        latest = await w.applyRow()
        await w.until(() => latest.service.status().state === 'failed')
      }

      assert.equal(
        process.listenerCount('exit') - baseline,
        1,
        'only the single active host row should retain a process exit listener',
      )

      first.runtime.failShutdown = false
      await latest.dispose()
      assert.equal(process.listenerCount('exit'), baseline, 'clean disposal must remove the last exit listener')
      assert.equal(globalThis[REGISTRY_KEY]?.has(w.home) ?? false, false, 'clean disposal must clear registry entry')
    })

    test('concurrent stop() deduplicates onto an in-flight predecessor shutdown', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      assert.ok(await w.until(() => a.service.status().state === 'ready'))

      const hold = gate()
      const started = gate()
      a.runtime.shutdownGate = hold.promise
      a.runtime.shutdownStarted = () => started.open()

      const b = await w.applyRow()
      await started.promise
      assert.equal(a.runtime.calls.shutdown, 1)

      const stopPromise = b.service.stop()
      // Give microtasks a turn to verify no second shutdown is launched while the first is in-flight.
      await new Promise((r) => setTimeout(r, 25))
      assert.equal(a.runtime.calls.shutdown, 1, 'must not start a duplicate concurrent predecessor shutdown')

      hold.open()
      const result = await stopPromise
      assert.equal(result.state, 'stopped')
      assert.equal(a.runtime.calls.shutdown, 1)
    })
  })
}
