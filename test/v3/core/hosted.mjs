/**
 * One real hosted setup per test file and SDK process: a host DSH on the SDK with this checkout's
 * instance, its child, and the child's admission (page.mjs). Shared by the R-CORE and K3 integration
 * rows; each file boots its own and removes its own home afterwards.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { TEST_HOMES } from '../../support/constants.mjs'
import { bootHost, newHome, until } from '../../support/host.mjs'
import { BUDGET, ROUTE, STATE, runtimeOf } from './constants.mjs'
import { admitChild } from './page.mjs'

/**
 * Register the setup for this file. `label` names its home. Returns `ready(sdk)`, which boots the
 * host once, asserts that the child is ready and resolves to {home, host, status, child}.
 */
export function hostedChildFor(label) {
  let live
  const start = (sdk) => {
    live ??= (async () => {
      // Canonical and outside the checkout: the child refuses a non-canonical main home and a Git ancestor.
      const home = fs.realpathSync(newHome(label))
      const host = await bootHost(home, { env: { FBTEST_DSH_RUNTIME: runtimeOf(sdk) } })
      let status
      await until(async () => { status = (await host.get(ROUTE.status)).json; return status?.state === STATE.ready || status?.state === STATE.failed }, BUDGET.readyMs, BUDGET.pollMs)
      return { home, host, status }
    })()
    return live
  }
  after(async () => {
    if (live === undefined) return
    const setup = await live.catch(() => undefined)
    await setup?.host.stop().catch(() => {})
    // Guard the one recursive delete: a home this file created directly under the test-homes root.
    if (setup && path.dirname(setup.home) === fs.realpathSync(TEST_HOMES) && path.basename(setup.home).startsWith(label)) fs.rmSync(setup.home, { recursive: true, force: true })
  })
  return async function ready(sdk) {
    const setup = await start(sdk)
    assert.equal(setup.status?.state, STATE.ready, 'precondition: the hosted child is ready; status ' + JSON.stringify(setup.status))
    return { ...setup, child: await admitChild(setup.host) }
  }
}
