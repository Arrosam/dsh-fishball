/**
 * E1 re-test (P1) — the instance follows the connector at run time.
 *
 * Requirement (the user's E1 report and its fix): after both plugins are installed, disabling the
 * connector on DSH's Plugins page must make the instance report `connector-missing` and stop its
 * child; enabling the connector again must bring the instance back to `ready` without a DSH
 * restart. The 0.2.1 runtime unloads the connector's injected sub-scope; its departure disposer
 * must stop the child (the earlier code returned that disposer from a callback Cordis treated as
 * a constructor, so the disposer was discarded).
 *
 * Observation points: `GET /api/fishball-instance/status` (the instance's own state), DSH's plugin
 * manager (`setBundleEnabled`, the Plugins page action) and the instance's own runtime directory
 * (`lifecycle.log` transitions and the per-launch record). No product internals are read.
 *
 * Techniques: ST (ready → connector-missing → ready), DT (enable × disable), EP (the two runs'
 * children are distinct), P (an orphan is impossible without a live launch record).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | P1-ST-01 | ST (ready → disabled) | the state becomes `connector-missing`; the child stops (STOP logged, launch record gone) |
 * | P1-ST-02 | ST (disabled → enabled) | the state returns to `ready` with a new child |
 * | P1-DT-01 | DT (enable) | disabling and enabling both change the profile through DSH's manager |
 * | P1-EP-01 | EP (child identity) | the re-enabled child is a different launch, so the first one is gone |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { bootHost, newHome } from './support/host.mjs'
import { until } from './support/util.mjs'

const STATUS_PATH = '/api/fishball-instance/status'
const STATE = Object.freeze({ ready: 'ready', missing: 'connector-missing' })
const TIMEOUT = Object.freeze({ boot: 90_000, transition: 30_000, stop: 15_000 })
const PLUGIN = Object.freeze({ connector: 'fishball-connector' })

const runtimeDir = (home) => path.join(home, 'fishball', 'runtime')
const launchesOf = (home) => {
  const dir = path.join(runtimeDir(home), 'launches')
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []
}
const lifecycleOf = (home) => {
  const file = path.join(runtimeDir(home), 'lifecycle.log')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}
/** How often the runtime logged a completed stop (every transition appends one line). */
const stopCount = (home) => (lifecycleOf(home).match(/"code":"STOP"/g) ?? []).length

async function waitState(host, state) {
  let last
  const reached = await until(async () => {
    const answer = await host.get(STATUS_PATH)
    last = answer.json
    return last?.state === state
  }, TIMEOUT.transition, 250)
  assert.ok(reached, 'the status never reached ' + state + '; last ' + JSON.stringify(last))
  return last
}

describe('P1 the instance stops with the connector and returns with it', () => {
  it('P1-ST-01 disabling the connector gives connector-missing and stops the child', async (t) => {
    const home = newHome('e1-p1')
    const host = await bootHost(home)
    t.after(async () => { await host.stop().catch(() => {}) })

    // The state before the transition: ready, one child, nothing stopped yet.
    const ready = await waitState(host, STATE.ready)
    assert.equal(ready.code, null)
    const first = launchesOf(home)
    assert.equal(first.length, 1, 'one child launch record while ready')
    assert.equal(stopCount(home), 0, 'no stop yet')

    const off = await host.call('setBundleEnabled', { name: PLUGIN.connector, enabled: false })
    assert.equal(off.changed, true, 'the connector bundle is deselected through DSH')
    assert.equal(off.error, null)

    const missing = await waitState(host, STATE.missing)
    assert.equal(missing.code, null, 'connector-missing is a state, not an error code')

    const stopped = await until(() => stopCount(home) === 1, TIMEOUT.stop, 100)
    assert.ok(stopped, 'the running child was stopped: ' + lifecycleOf(home))
    assert.deepEqual(launchesOf(home), [], 'the stopped child keeps no live launch record')
  })

  it('P1-ST-02 re-enabling the connector returns the instance to ready with a new child', async (t) => {
    const home = newHome('e1-p1')
    const host = await bootHost(home)
    t.after(async () => { await host.stop().catch(() => {}) })

    await waitState(host, STATE.ready)
    const first = launchesOf(home)
    assert.equal(first.length, 1)

    assert.equal((await host.call('setBundleEnabled', { name: PLUGIN.connector, enabled: false })).changed, true)
    await waitState(host, STATE.missing)
    assert.ok(await until(() => stopCount(home) === 1, TIMEOUT.stop, 100), 'the first child stopped')

    assert.equal((await host.call('setBundleEnabled', { name: PLUGIN.connector, enabled: true })).changed, true)
    const ready = await waitState(host, STATE.ready)
    assert.equal(ready.code, null)

    const second = launchesOf(home)
    assert.equal(second.length, 1, 'one live child again')
    assert.notDeepEqual(second, first, 'the re-enabled instance launched a new child')
  })
})
