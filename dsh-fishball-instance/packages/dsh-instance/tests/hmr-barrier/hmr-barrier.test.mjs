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
import { describe } from 'node:test'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { hold, turn, until } from '@dsh-instance/test-helpers/wait'
import { HMR } from './constants.mjs'
import { hmrWorld } from './subject.mjs'

eachSdk((sdk) => {
  describe(`dsh-instance HMR shutdown barrier recovery (SDK ${sdk})`, () => {
    caseTest(sdk, 'HMR-ST-01', 'main', 'failed predecessor shutdown blocks automatic startup and retry while still failing, then retry recovers once predecessor stops', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      await until(() => a.service.status().state === 'ready')
      assert.equal(a.runtime.calls.start, 1)

      // Predecessor shutdown fails transiently (e.g. STOP_TIMEOUT while unwinding).
      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      await until(() => b.service.status().state === 'failed')
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

    caseTest(sdk, 'HMR-ST-02', 'main', 'enabled off→on recovers once predecessor shutdown succeeds', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      await until(() => a.service.status().state === 'ready')

      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      await until(() => b.service.status().state === 'failed')
      assert.equal(b.runtime.calls.start, 0)

      a.runtime.failShutdown = false
      b.setEnabled(false)
      await until(() => b.service.status().state === 'disabled')
      b.setEnabled(true)
      await until(() => b.service.status().state === 'ready')
      assert.equal(b.runtime.calls.start, 1)
    })

    caseTest(sdk, 'HMR-ST-03', 'main', 'subsequent HMR reload recovers automatically once predecessor stops', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      await until(() => a.service.status().state === 'ready')

      a.runtime.failShutdown = true
      const b = await w.applyRow()
      b.fireReady()
      await until(() => b.service.status().state === 'failed')
      assert.equal(b.runtime.calls.start, 0)

      // Predecessor finishes unwinding before the next HMR reload C.
      a.runtime.failShutdown = false
      const c = await w.applyRow()
      c.fireReady()
      await until(() => c.service.status().state === 'ready')
      assert.equal(c.service.status().code, null)
      assert.equal(c.runtime.calls.start, 1)
    })

    caseTest(sdk, 'HMR-ST-04', 'main', 'repeated failed HMR reloads do not leak process exit listeners and clean shutdown clears registry', async (t) => {
      const w = await hmrWorld(t, sdk)
      const baseline = process.listenerCount('exit')

      const first = await w.applyRow()
      first.fireReady()
      await until(() => first.service.status().state === 'ready')
      first.runtime.failShutdown = true

      let latest = first
      for (let i = 0; i < HMR.reloads; i += 1) {
        latest = await w.applyRow()
        await until(() => latest.service.status().state === 'failed')
      }

      assert.equal(
        process.listenerCount('exit') - baseline,
        1,
        'only the single active host row should retain a process exit listener',
      )

      first.runtime.failShutdown = false
      await latest.dispose()
      assert.equal(process.listenerCount('exit'), baseline, 'clean disposal must remove the last exit listener')
      assert.equal(globalThis[HMR.registryKey]?.has(w.home) ?? false, false, 'clean disposal must clear registry entry')
    })

    caseTest(sdk, 'HMR-ST-05', 'main', 'concurrent stop() deduplicates onto an in-flight predecessor shutdown', async (t) => {
      const w = await hmrWorld(t, sdk)
      const a = await w.applyRow()
      a.fireReady()
      await until(() => a.service.status().state === 'ready')

      const stopped = hold()
      w.releaseOnCleanup(stopped.open)
      a.runtime.shutdownGate = stopped.enter

      const b = await w.applyRow()
      await stopped.reached
      assert.equal(a.runtime.calls.shutdown, 1)

      const stopPromise = b.service.stop()
      // Give microtasks a turn to verify no second shutdown is launched while the first is in-flight.
      await turn()
      assert.equal(a.runtime.calls.shutdown, 1, 'must not start a duplicate concurrent predecessor shutdown')

      stopped.open()
      const result = await stopPromise
      assert.equal(result.state, 'stopped')
      assert.equal(a.runtime.calls.shutdown, 1)
    })
  })
})
