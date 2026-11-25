import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { until } from '../../../support/util.mjs'
import { boot, request } from '../../fishball-core/wire/subject.mjs'
import { C, MULTI } from '../../fishball-core/wire/constants.mjs'
import { page, firstFrame, routeStatus } from './subject.mjs'
import { U } from './constants.mjs'
import { registerStripCases } from './strip-cases.mjs'
import { registerTargetsCases } from './targets-cases.mjs'
import { registerSessionsCases } from './sessions-cases.mjs'
import { FRAME, SEAM_TARGETS, WITHDRAWN } from './targets-constants.mjs'
import { withdrawnRow } from './withdrawn.mjs'

const STATES = Object.freeze(Object.values(SEAM_TARGETS.state))

// Re-baselined (2026-11-25): the legacy in-page "Choose Fishball's model" modal (`client.model.js` /
// `fishball-ui.model-dialog`) was removed and superseded by `dsh-instance`'s multi-step onboarding
// wizard. Opening the Fishball page with `fishball-core.model` unset must render no model-picker modal.
export function registerModelDialogCases(sdk) {
  registerStripCases(sdk)
  // MULTI-3: the per-target frame, the sidebar target list, the ask card's source and handle.
  registerTargetsCases(sdk)
  // The running managed sessions under each target's row.
  registerSessionsCases(sdk)

  for (const lang of U.lang) {
    test(`${sdk} MODEL-REMOVED-01 ${lang} unset fishball-core.model renders no model-picker modal and never registers fishball-ui.model-dialog`, async (t) => {
      let catalogReads = 0
      const p = await page(t, sdk, {
        lang,
        model: undefined,
        modelCatalog: async () => {
          catalogReads += 1
          return { ok: true, value: structuredClone(U.catalog) }
        },
      })
      assert.deepEqual(p.world.errors, [])
      assert.deepEqual(p.world.failedFibers, [])
      for (const slot of U.slots) {
        const match = p.world.entries(slot).filter((e) => e.options?.id === U.removedDialog.entryId)
        assert.deepEqual(match, [], `removed entry ${U.removedDialog.entryId} must not be registered in ${slot}`)
      }
      assert.equal(p.dialogs().length, U.first, 'no dialog should render when fishball-core.model is unset')
      assert.equal(
        p.nodes().filter((n) => n.props?.[U.removedDialog.attr] !== undefined).length,
        U.first,
        `[${U.removedDialog.attr}] must not render when fishball-core.model is unset`,
      )
      assert.equal(catalogReads, U.first, 'unset model on Fishball page must not trigger a legacy model-dialog catalog read')
      assert.deepEqual(p.world.mutations, [])

      // Closing and reopening the Fishball page also renders no model-picker modal
      await p.closePage()
      await p.openPage()
      assert.equal(p.dialogs().length, U.first, 'no dialog after Fishball page reopen')
      assert.equal(
        p.nodes().filter((n) => n.props?.[U.removedDialog.attr] !== undefined).length,
        U.first,
      )
      assert.equal(catalogReads, U.first)
      assert.deepEqual(p.world.mutations, [])
    })

    test(`${sdk} MODEL-REMOVED-02 ${lang} unset fishball-core.model with zero catalog models renders no modal`, async (t) => {
      const p = await page(t, sdk, { lang, model: undefined, catalog: { ...U.catalog, groups: [], routableProviders: [] } })
      assert.deepEqual(p.world.errors, [])
      assert.deepEqual(p.world.failedFibers, [])
      assert.equal(p.dialogs().length, U.first, 'no modal should render even with empty catalog')
      assert.equal(p.nodes().filter((n) => n.props?.[U.removedDialog.attr] !== undefined).length, U.first)
      assert.equal(p.world.launcherPresses, U.first)
      assert.deepEqual(p.world.mutations, [])
    })
  }
  let live; let run
  const get = () => run ??= boot(sdk, [C.core]).then((h) => { live = h; return h })
  after(async () => live?.stop())
  test(`${sdk} MODEL-SYS-01 composer picker off with core`, async () => {
    const h = await get(); const rows = await h.call('rows', { ids: [U.row] })
    assert.ok(rows[U.first].present); assert.equal(rows[U.first].disabled, true)
  })
  // Re-baselined (MULTI-3 requirement B): the strip route now serves targetsView's frame
  // {on, title, empty, notices, targets, words, brandStyle}; a standalone DSH with no target is on with an empty list.
  for (const lang of U.lang) test(`${sdk} STRIP-SYS-01 ${lang} immediate SSE frame contract`, async () => {
    const h = await get(); const r = await firstFrame(h, lang)
    assert.equal(r.status, U.success); assert.ok(r.contentType.includes(U.sse))
    assert.deepEqual(Object.keys(r.frame).sort(), [...FRAME.keys].sort())
    assert.ok(Array.isArray(r.frame.targets) && Array.isArray(r.frame.notices))
    for (const target of r.frame.targets) {
      assert.ok(STATES.includes(target.state), target.state)
      for (const l of target.lines) { assert.equal(typeof l.kind, 'string'); assert.equal(typeof l.text, 'string'); assert.ok(l.text.length) }
      assert.ok(target.control === null || U.actions.includes(target.control.action))
    }
    if (r.frame.on && r.frame.targets.length === 0) assert.ok(typeof r.frame.empty === 'string' && r.frame.empty.length > 0, 'no empty text')
  })
  // Withdrawn (MULTI-0 review S6): the K3a Connect routes this row called no longer exist.
  withdrawnRow(sdk, 'STRIP-DT-01', 'K3a routes', 'controls use core Connect and cancel routes', WITHDRAWN.connectRoutes)
  // MULTI-3 / MULTI-0 review fixes (SEAM_TARGETS.http): core's per-target Connect route in a real
  // standalone DSH; with no target in the list any id is unknown → 404 unknown-target, and the K3a route is gone.
  // Runs as a todo (reported, not gating) until MULTI-1's core serves the per-target routes on this branch.
  test(`${sdk} STRIP-DT-02 target Connect route answers per SEAM_TARGETS.http`, { todo: WITHDRAWN.needsCore }, async () => {
    const h = await get()
    const unknown = await request(h, SEAM_TARGETS.route.connect, { [SEAM_TARGETS.route.targetIdField]: 't-fbtestunknownaaaa' })
    assert.equal(unknown.status, SEAM_TARGETS.http.notFound, unknown.text)
    assert.equal(unknown.json?.code, SEAM_TARGETS.refusal.unknownTarget)
    assert.equal((await request(h, MULTI.withdrawnRoutes[0], {})).status, C.status.missing, 'the withdrawn K3a Connect route still answers')
  })
  // DESIGN §20 "Live core on/off"; 117cb2a2: fishball-ui is core's ./ui/ component, so disabling
  // core removes its UI rows with it. The composer picker returns to DSH's own (enabled), there is
  // no fishball-ui-core-missing row any more, and neither the strip nor the Connect route is served.
  test(`${sdk} MODEL-ST-03 HMR disable core removes core and its UI component rows; picker restored, no strip or Connect`, async () => {
    const h = await get(); await h.call('disableCore')
    let rows
    await until(async () => { rows = await h.call('rows', { ids: [U.row, U.missingRow] }); return rows[U.first].disabled === false }, C.budget.call, C.budget.poll)
    assert.equal(rows[U.first].disabled, false)
    assert.equal(rows[U.one].present, false, 'the old core-missing row is still inserted')
    assert.equal(await routeStatus(h, U.route.strip + U.lang[U.first]), C.status.missing)
    // Re-baselined (MULTI-0 review S6): the Connect route is core's per-target one; without core it is not served (404) or answers 503 TARGETS_UNAVAILABLE.
    const connect = await request(h, SEAM_TARGETS.route.connect, { [SEAM_TARGETS.route.targetIdField]: 't-fbtestunknownaaaa' })
    assert.ok([C.status.missing, SEAM_TARGETS.http.unavailable].includes(connect.status), `${connect.status} ${connect.text}`)
  })
}
