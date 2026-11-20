import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { textOf } from '../../../support/rp-recommend.mjs'
import { until } from '../../../support/util.mjs'
import { boot, request } from '../../fishball-core/wire/subject.mjs'
import { C, MULTI } from '../../fishball-core/wire/constants.mjs'
import { page, firstFrame, routeStatus } from './subject.mjs'
import { U } from './constants.mjs'
import { registerModelPolishCases } from './polish-cases.mjs'
import { registerStripCases } from './strip-cases.mjs'
import { registerCatalogCases } from './catalog-cases.mjs'
import { registerTargetsCases } from './targets-cases.mjs'
import { registerSessionsCases } from './sessions-cases.mjs'
import { FRAME, SEAM_TARGETS, WITHDRAWN } from './targets-constants.mjs'
import { withdrawnRow } from './withdrawn.mjs'

const STATES = Object.freeze(Object.values(SEAM_TARGETS.state))
/** Press the dialog's dismiss control, then let a window focus pass (a reopen trigger it must ignore). */
async function dismiss(p) {
  await p.press(p.buttons().find((n) => U.dismiss.test(textOf(n))))
  p.world.dispatchWindow('focus'); await new Promise((resolve) => setImmediate(resolve))
}
// The user, 2026-11-16: "fishball打开的时候可以看到自己选没选模型，然后会提示用户选择配置的模型"
// (when Fishball opens, show whether a model is chosen and prompt to choose a configured one).
// "When the Fishball page opens" is fishball-page's public root mark `<html data-fishball-page>`
// (code review, F-WIRE): the dialog shows only while the mark is present; a dismissal lasts while
// the page stays open and is forgotten when the mark goes away, so it shows again when it returns.
export function registerModelDialogCases(sdk) {
  // UI-POLISH-F §4 (grouped choices, aria-labels) and §2 (the drawn status card).
  registerModelPolishCases(sdk)
  registerStripCases(sdk)
  // R-FIX-FUI F4: the catalog is read on every opening.
  registerCatalogCases(sdk)
  // MULTI-3: the per-target frame, the sidebar target list, the ask card's source and handle.
  registerTargetsCases(sdk)
  // The running managed sessions under each target's row.
  registerSessionsCases(sdk)
  for (const lang of U.lang) {
    test(`${sdk} MODEL-EP-01 ${lang} unset model prompts with all catalog models`, async (t) => {
      const p = await page(t, sdk, { lang })
      assert.deepEqual(p.world.errors, []); assert.deepEqual(p.world.failedFibers, [])
      assert.ok(p.dialogs().length, 'No model dialog on Fishball page open')
      for (const name of U.modelNames) assert.ok(p.text().includes(name), name)
    })
    test(`${sdk} MODEL-ST-01 ${lang} choose writes core model path`, async (t) => {
      const p = await page(t, sdk, { lang })
      await p.choose(U.modelNames[U.one])
      const write = p.world.mutations.find((m) => m.ns === U.core && m.ops.some((o) => JSON.stringify(o.path) === JSON.stringify(C.modelSeam.path)))
      assert.ok(write, 'No core model mutation')
      const op = write.ops.find((o) => JSON.stringify(o.path) === JSON.stringify(C.modelSeam.path))
      assert.equal(op.op, 'set'); assert.equal(op.value.provider, C.selection.provider); assert.equal(op.value.model, C.selection.model)
      assert.deepEqual(Object.keys(op.value).filter((k) => !['provider', 'model', 'reasoningEffort'].includes(k)), [])
    })
    test(`${sdk} MODEL-ST-02 ${lang} dismiss stays dismissed in page; fresh page prompts`, async (t) => {
      const p = await page(t, sdk, { lang }); assert.ok(p.dialogs().length)
      await dismiss(p)
      assert.equal(p.dialogs().length, U.first); assert.deepEqual(p.world.mutations, [])
      assert.ok((await page(t, sdk, { lang })).dialogs().length)
    })
    test(`${sdk} MODEL-ST-04 ${lang} page not open (no data-fishball-page) with unset model: no dialog`, async (t) => {
      const p = await page(t, sdk, { lang, open: false })
      assert.deepEqual(p.world.errors, []); assert.deepEqual(p.world.failedFibers, [])
      assert.equal(p.dialogs().length, U.first, 'Model dialog shown while the Fishball page is not open')
      assert.deepEqual(p.world.mutations, [])
    })
    test(`${sdk} MODEL-ST-05 ${lang} closed → data-fishball-page set: dialog shows`, async (t) => {
      const p = await page(t, sdk, { lang, open: false }); assert.equal(p.dialogs().length, U.first)
      await p.openPage()
      assert.ok(p.dialogs().length, 'No model dialog when the Fishball page opens')
      for (const name of U.modelNames) assert.ok(p.text().includes(name), name)
    })
    test(`${sdk} MODEL-ST-06 ${lang} dismiss → page closed → page opened again: dialog shows again`, async (t) => {
      const p = await page(t, sdk, { lang }); assert.ok(p.dialogs().length)
      await dismiss(p); assert.equal(p.dialogs().length, U.first)
      await p.closePage(); assert.equal(p.dialogs().length, U.first, 'Model dialog shown after the Fishball page closed')
      await p.openPage(); assert.ok(p.dialogs().length, 'Dismissal outlived the Fishball page close')
      assert.deepEqual(p.world.mutations, [])
    })
    test(`${sdk} MODEL-EP-02 ${lang} configured core model does not prompt`, async (t) => {
      const p = await page(t, sdk, { lang, model: C.selection })
      assert.equal(p.dialogs().length, U.first); assert.deepEqual(p.world.mutations, [])
    })
    test(`${sdk} MODEL-BVA-01 ${lang} zero catalog models explains and opens DSH Settings`, async (t) => {
      const p = await page(t, sdk, { lang, catalog: { ...U.catalog, groups: [], routableProviders: [] } })
      assert.ok(p.dialogs().length); assert.match(p.text(), U.empty)
      await p.press(p.buttons().find((n) => U.settings.test(textOf(n))))
      assert.ok(p.world.launcherPresses > U.first, 'Settings launcher was not pressed')
      assert.deepEqual(p.world.mutations, [])
    })
  }
  let live; let run
  const get = () => run ??= boot(sdk, [C.ui, C.core]).then((h) => { live = h; return h })
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
  // DESIGN §20 "Live core on/off: fishball-ui's rows read core's selection in the profile manifest
  // while HMR runs"; requirements 1.41 Q-G2 = A: without core fishball-ui changes nothing and only
  // logs fishball-core-missing. So fishball-ui's own rows go off with core: no strip route, and no
  // core Connect route either (both 404); the composer picker is back and the missing row is on.
  test(`${sdk} MODEL-ST-03 HMR disable core restores picker, activates missing row, serves neither strip nor Connect`, async () => {
    const h = await get(); await h.call('disableCore')
    let rows
    await until(async () => { rows = await h.call('rows', { ids: [U.row, U.missingRow] }); return rows[U.first].disabled === false && rows[U.one].present && !rows[U.one].disabled }, C.budget.call, C.budget.poll)
    assert.equal(rows[U.first].disabled, false); assert.equal(rows[U.one].present, true); assert.equal(rows[U.one].disabled, false)
    assert.equal(await routeStatus(h, U.route.strip + U.lang[U.first]), C.status.missing)
    // Re-baselined (MULTI-0 review S6): the Connect route is core's per-target one; without core it is not served (404) or answers 503 TARGETS_UNAVAILABLE.
    const connect = await request(h, SEAM_TARGETS.route.connect, { [SEAM_TARGETS.route.targetIdField]: 't-fbtestunknownaaaa' })
    assert.ok([C.status.missing, SEAM_TARGETS.http.unavailable].includes(connect.status), `${connect.status} ${connect.text}`)
  })
  test(`${sdk} MODEL browser page reload and real settings navigation`, { todo: U.todo }, () => {})
}
