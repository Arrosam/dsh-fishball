/**
 * The MULTI-1 system world of the wire area: one real standalone (or hosted stand-in) Fishball DSH
 * with core installed (../support/core-world.mjs over fishball-test-helpers/dsh-world) plus N fake
 * target DSHs (fishball-test-helpers/fake-connector startFakeDsh) in this test process. Every action
 * goes through a public surface: `fishballInstance.ui.targets` / `ui.asks` / `bridge` / `attention`,
 * the owner-only HTTP routes, DSH's credential store, the manager's model request.
 *
 * The hosted child is a stand-in for the instance's child-side row (fixtures/child-row: the published
 * id `dsh-instance-child` and its volatile `targetUrl`). Default: a launch overlay row, as the
 * instance's launch overlay inserts it. `liveChild`: the row lives in the home's patch instead, written
 * at every start (as the instance's overlay is) and changed live by `setChildUrl` (the patch rewritten,
 * then dsh-app-boot's public reconcileProfilePatches), because an overlay row refuses settings writes.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import * as K1 from 'fishball-test-helpers/connector-contract/mcp-schema'
import { newHome, removeHome } from 'fishball-test-helpers/dsh-world'
import { startFakeDsh } from 'fishball-test-helpers/fake-connector'
import { until } from 'fishball-test-helpers/wait'
import { bootCore, NATIVE_MANAGER } from '../support/core-world.mjs'
import { SEAM_TARGETS, connectorTools, credentialNamesOf } from '../support/targets-oracle.mjs'
import { C, MULTI } from './constants.mjs'

/** The hosted stand-in row with `child` ({targetUrl}) as its config. */
const childRow = (child) => ({ insert: [{ id: C.childRow, name: C.childStandIn, config: child }] })
export const HOME_LABEL = 'fbwire'

/** Every booted DSH, fake and home of this file, stopped / removed after it. */
const live = []
const homes = []
after(async () => {
  for (const stop of live.splice(0).reverse()) await stop().catch(() => {})
  for (const home of homes.splice(0)) removeHome(home, HOME_LABEL)
})
export const wireHome = () => { const home = newHome(HOME_LABEL); homes.push(home); return home }
/** A fake target DSH stopped after the file; it lists core's own copy of the connector tools by default. */
export async function fakeTarget(options = {}) {
  const fake = await startFakeDsh({ tools: connectorTools(K1.TOOLS), ...options })
  live.push(() => fake.stop())
  return fake
}

/** One booted core DSH (stopped after the file). `homePatch` and `handoff` as ../support/core-world.mjs. */
export async function bootWire({ home = wireHome(), child, liveChild = false, packages, homePatch, profileConfig, handoff } = {}) {
  const hosted = child === undefined ? {} : liveChild ? { homePatch: [childRow(child)] } : { overlay: [childRow(child)] }
  const h = await bootCore(home, { packages, profileConfig, handoff, ...hosted, ...(homePatch === undefined ? {} : { homePatch }) })
  live.push(() => h.stop())
  return h
}

/** A multi-target world factory (the old multiWorld): `open({home, expect, child, handoff})`. */
export function multiWorld({ child, liveChild = false, coreConfig = NATIVE_MANAGER } = {}) {
  return async function open({ home, expect, child: childNow = child, handoff } = {}) {
    const h = await bootWire({ home, child: childNow, liveChild, handoff, profileConfig: coreConfig })
    // A restart: the stored records are read after boot; wait (harness only) until `expect` targets are listed.
    if (expect !== undefined) await until(async () => ((await h.call('targets'))?.targets.length ?? 0) >= expect, MULTI.budget.connectMs, MULTI.budget.pollMs)
    const w = {
      h,
      fake: fakeTarget,
      list: async () => h.call('targets'),
      view: async (targetId) => (await h.call('targets')).targets.find((t) => t.targetId === targetId),
      act: (op, ...args) => h.call('targetAction', { op, args }),
      /** Adds `fake`'s URL, enters a fresh token under the target's own reference; resolves the view once connected. */
      async connect(fake, { url = fake.url(), connected = true } = {}) {
        const added = await w.act('add', url)
        assert.equal(added.ok, true, 'add refused: ' + JSON.stringify(added))
        const view = await w.view(added.targetId)
        const entry = fake.addEntry()
        await h.call('credSet', { ref: credentialNamesOf(view).tokenRef, value: entry.secret })
        if (connected) await w.until(added.targetId, (v) => v.state === SEAM_TARGETS.state.connected && v.name !== null, 'connected with a name')
        return { targetId: added.targetId, entry, view: await w.view(added.targetId) }
      },
      /** Waits until `predicate(view)` holds for one target; fails naming `what`. */
      async until(targetId, predicate, what) {
        let last
        const ok = await until(async () => { last = await w.view(targetId); return last !== undefined && predicate(last) }, MULTI.budget.connectMs, MULTI.budget.pollMs)
        assert.ok(ok, `target ${targetId} never reached "${what}": ${JSON.stringify(last)}`)
        return last
      },
      route: (route, body) => h.request(route, body === undefined ? {} : { method: C.method.post, body }),
      /** A DSH restart: DSH's own graceful shutdown, then the process stop (dsh-world stop does both). */
      stop: () => h.stop(),
      /** The manager's model-facing tools of one turn. */
      tools: () => h.call('managerTools'),
    }
    return w
  }
}