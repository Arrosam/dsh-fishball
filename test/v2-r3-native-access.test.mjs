/**
 * Round-2 BUG 3 — the native runtime admits the embed again after an in-process stop+start.
 *
 * Requirement R3 (round-2 brief): on the SAME runtime object (createNativeRuntime of
 * packages/dsh-instance/src/native-runtime/index.js), after shutdown() — or parentExit() + shutdown() —
 * followed by a new start(), and after restart(), nativeEmbedAccess() resolves again for the new
 * generation (generation equals the new instance id; not NOT_RUNNING / NOT_READY /
 * NATIVE_ACCESS_UNAVAILABLE), and an admission obtained before the stop has an aborted signal.
 * Before any new start, after shutdown, it is still refused. Row level: the row's Retry from
 * failed and the row's restart end 'ready', and GET /fishball/embed/ redirects (303) to the child
 * again rather than answering the unavailable card.
 *
 * Observation: a REAL child DSH of the SDK selected by FBTEST_DSH_RUNTIME, started and stopped by
 * one runtime object over a throwaway canonical main home (no mocks, no spawn seam); the row cases
 * use a real main DSH boot (support/host.mjs) and the child's own native admission.
 * Moved fault (decision A, 2026-11-11): R3-UC-01's failed start was a planted @deepseek-ai shadow;
 * that copy no longer fails a start, so it plants an invalid dependency package.json instead.
 *
 * | id | technique | requirement | expected |
 * |----|-----------|-------------|----------|
 * | R3-ST-01 | State Transition ready → shutdown → (refused) → start → ready | R3 | old access aborted; refused before the new start; resolves for the new instance id after it |
 * | R3-ST-02 | State Transition ready → parentExit+shutdown → start | R3 | same as R3-ST-01 after the parent-exit flag was set |
 * | R3-ST-03 | State Transition ready → restart → ready (twice) | R3 | each restart's access names its own new instance id; earlier signals aborted |
 * | R3-DT-01 | DT (stopped × started) | R3 | refused while stopped (code is not a resolved access), resolved while ready |
 * | R3-UC-01 | Use Case (row Retry from failed; invalid dependency manifest) | R3 | failed → Retry → ready; embed 303 to the child and the child admits |
 * | R3-UC-02 | Use Case (row restart from the child's settings view) | R3 | restart → ready with a new child; embed 303 to the new child |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, describe, it } from 'node:test'
import { RUNTIME } from './support/constants.mjs'
import { loadInstance, runtimeAnchor } from './support/body-soul-env.mjs'
import { bootHost, newHome } from './support/host.mjs'
import { until } from './support/util.mjs'
import { R2, R2_BUDGET, assertEmbedAdmits, bootAfterFault, launchRecords, plantInvalidManifest, removeHome, selectedSdk, settledStatus } from './support/v2-r2.mjs'

const SDK = selectedSdk(RUNTIME)
const R3 = Object.freeze({
  ready: 'ready',
  stopped: 'stopped',
  /** Refusal codes R3 names as "not a resolved access". */
  refusals: Object.freeze(['NOT_RUNNING', 'NOT_READY', 'NATIVE_ACCESS_UNAVAILABLE']),
  restarts: 2,
})
const { createNativeRuntime } = await loadInstance('src/native-runtime/index.js')

const homes = []
after(() => { for (const home of homes.splice(0)) removeHome(home) })

/** One runtime object on a canonical throwaway main home; stopped at the end of the case. */
function runtime(t, label) {
  const home = fs.realpathSync(newHome('v2-r3-' + label))
  homes.push(home)
  const owner = createNativeRuntime({ mainHome: home, installAnchor: runtimeAnchor(), mainWorkspaces: [] })
  t.after(async () => { await owner.shutdown().catch(() => {}) })
  return owner
}

/** A resolved access for the generation of `status`: generation = instanceId, live signal. */
async function assertAccess(owner, status, why) {
  let access
  try { access = await owner.nativeEmbedAccess() } catch (error) { assert.fail(why + ': nativeEmbedAccess refused with ' + (error?.code ?? error?.message)) }
  assert.equal(status.state, R3.ready, why + ': precondition ready')
  assert.equal(access.generation, status.instanceId, why + ': generation is the current instance id')
  assert.equal(access.signal?.aborted, false, why + ': the new admission signal is live')
  assert.equal(new URL(access.origin).hostname, R2.loopback, why + ': a loopback child origin')
  return access
}
async function assertRefused(owner, why) {
  await assert.rejects(owner.nativeEmbedAccess(), (error) => {
    assert.ok(typeof error?.code === 'string' && error.code.length > 0, why + ': a coded refusal')
    return true
  }, why + ': nativeEmbedAccess refused before a new start')
}

describe(`R3 [${SDK}] native access after an in-process stop and start`, { timeout: R2_BUDGET.caseMs * 4 }, () => {
  it('R3-ST-01 + R3-DT-01 shutdown → refused → start → access for the new instance; old admission aborted', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const owner = runtime(t, 'shutdown')
    const first = await owner.start()
    const before = await assertAccess(owner, first, 'first generation')
    const stopped = await owner.shutdown()
    assert.equal(stopped.state, R3.stopped, 'shutdown stops the child')
    assert.equal(before.signal.aborted, true, 'the admission obtained before the stop is aborted')
    await assertRefused(owner, 'after shutdown')
    const second = await owner.start()
    assert.notEqual(second.instanceId, first.instanceId, 'a new generation started')
    await assertAccess(owner, second, 'R3: after shutdown + start')
  })

  it('R3-ST-02 parentExit + shutdown → refused → start → access for the new instance', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const owner = runtime(t, 'parent-exit')
    const first = await owner.start()
    const before = await assertAccess(owner, first, 'first generation')
    owner.parentExit()
    await owner.shutdown()
    assert.equal(before.signal.aborted, true, 'the admission obtained before parentExit is aborted')
    await assertRefused(owner, 'after parentExit + shutdown')
    const second = await owner.start()
    assert.notEqual(second.instanceId, first.instanceId)
    await assertAccess(owner, second, 'R3: after parentExit + shutdown + start')
  })

  it('R3-ST-03 restart (twice) → each access names its own new instance; earlier admissions aborted', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const owner = runtime(t, 'restart')
    let status = await owner.start()
    let previous = await assertAccess(owner, status, 'first generation')
    const seen = new Set([status.instanceId])
    for (let round = 1; round <= R3.restarts; round++) {
      status = await owner.restart()
      assert.equal(previous.signal.aborted, true, 'restart ' + round + ': the earlier admission is aborted')
      assert.equal(seen.has(status.instanceId), false, 'restart ' + round + ': a new instance id')
      seen.add(status.instanceId)
      previous = await assertAccess(owner, status, 'R3: after restart ' + round)
    }
  })

  it('R3-UC-01 row: failed → Retry → ready, and /fishball/embed/ redirects (303) to the child again', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const home = newHome('v2-r3-row-retry')
    homes.push(home)
    const { host, restore } = await bootAfterFault(t, home, plantInvalidManifest, (first) => assertEmbedAdmits(first, 'first boot'))
    assert.equal((await settledStatus(host)).state, R2.state.failed, 'precondition: the invalid dependency manifest fails the start')
    restore()
    const retried = (await host.post(R2.route.retry, {})).json
    const ready = retried?.state === R2.state.ready ? retried : await settledStatus(host, [R2.state.ready])
    assert.equal(ready.state, R2.state.ready, 'Retry from failed ends ready')
    await assertEmbedAdmits(host, 'R3: after Retry from failed')
  })

  it('R3-UC-02 row: restart from the child settings view → ready with a new child; embed redirects to it', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const home = newHome('v2-r3-row-restart')
    homes.push(home)
    const host = await bootHost(home)
    t.after(async () => { await host.stop().catch(() => {}) })
    assert.equal((await settledStatus(host)).state, R2.state.ready, 'precondition: ready')
    const firstLaunch = launchRecords(home)
    const child = await assertEmbedAdmits(host, 'before restart')
    // The child's own Restart route (v2-set: relayed to the main host's restart). The child being
    // restarted may drop the connection before answering, so the answer itself is not the oracle.
    await fetch(child.origin + R2.route.childRestart, {
      method: 'POST',
      headers: { cookie: child.cookie, origin: child.origin, ...R2.sameOrigin, 'content-type': 'application/json' },
      body: '{}',
    }).then((response) => response.arrayBuffer()).catch(() => {})
    const replaced = await until(() => { const now = launchRecords(home); return now.length === 1 && now[0] !== firstLaunch[0] }, R2_BUDGET.settleMs, R2_BUDGET.pollMs)
    assert.ok(replaced, 'the restart launched a new child: ' + JSON.stringify(launchRecords(home)))
    assert.equal((await settledStatus(host, [R2.state.ready])).state, R2.state.ready, 'restart ends ready')
    const again = await assertEmbedAdmits(host, 'R3: after the row restart')
    assert.notEqual(again.origin, child.origin, 'the embed now redirects to the new child')
  })
})

