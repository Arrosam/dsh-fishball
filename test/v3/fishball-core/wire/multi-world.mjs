/**
 * The MULTI-1 system world: one real standalone (or hosted stand-in) Fishball DSH (world.mjs worker,
 * core installed as a bundle) plus N fake target DSHs (fake-dsh.mjs) in this test process. Every
 * action goes through a public surface: `fishballInstance.ui.targets` / `ui.asks` / `bridge` /
 * `attention`, the owner-only HTTP routes, DSH's credential store, the manager's model request.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { until } from '../../../support/util.mjs'
import { MULTI } from './constants.mjs'
import { startFakeDsh } from './fake-dsh.mjs'
import { boot, request } from './subject.mjs'
import { credentialNamesOf } from './targets-oracle.mjs'

/** One booted Fishball DSH per call, stopped after the file; fakes stopped with it. */
export function multiWorld(sdk, { members = ['fishball-core'], child } = {}) {
  const live = []
  after(async () => { for (const stop of live.splice(0).reverse()) await stop().catch(() => {}) })
  return async function open({ home, expect } = {}) {
    const h = await boot(sdk, members, home, {}, child === undefined ? {} : { child })
    live.push(() => h.stop())
    // A restart: the stored records are read after boot; wait (harness only) until `expect` targets are listed.
    if (expect !== undefined) await until(async () => ((await h.call('targets'))?.targets.length ?? 0) >= expect, MULTI.budget.connectMs, MULTI.budget.pollMs)
    const w = {
      h,
      async fake(options) { const f = await startFakeDsh(options); live.push(() => f.stop()); return f },
      list: async () => (await h.call('targets')),
      view: async (targetId) => (await h.call('targets')).targets.find((t) => t.targetId === targetId),
      act: (op, ...args) => h.call('targetAction', { op, args }),
      /** Adds `fake`'s URL, enters a fresh token for it under the target's own reference; resolves the view once connected. */
      async connect(fake, { url = fake.url(), connected = true } = {}) {
        const added = await w.act('add', url)
        assert.equal(added.ok, true, 'add refused: ' + JSON.stringify(added))
        const view = await w.view(added.targetId)
        const entry = fake.addEntry()
        await h.call('credSet', { ref: credentialNamesOf(view).tokenRef, value: entry.secret })
        if (connected) await w.until(added.targetId, (v) => v.state === 'connected' && v.name !== null, 'connected with a name')
        return { targetId: added.targetId, entry, view: await w.view(added.targetId) }
      },
      /** Waits until `predicate(view)` holds for one target; fails naming `what`. */
      async until(targetId, predicate, what) {
        let last
        const ok = await until(async () => { last = await w.view(targetId); return last !== undefined && predicate(last) }, MULTI.budget.connectMs, MULTI.budget.pollMs)
        assert.ok(ok, `target ${targetId} never reached "${what}": ${JSON.stringify(last)}`)
        return last
      },
      route: (path, body) => request(h, path, body),
      /** A DSH restart: DSH's own graceful shutdown first (the worker's `shutdown` op), then the process stop. */
      async stop() { await h.call('shutdown').catch(() => {}); await h.stop() },
      /** The manager's model-facing tools of one turn (ensures the manager first). */
      async tools() { await h.call('ensure'); return h.call('managerTools') },
    }
    return w
  }
}
