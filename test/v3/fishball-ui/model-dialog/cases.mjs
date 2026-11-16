import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { textOf } from '../../../support/rp-recommend.mjs'
import { until } from '../../../support/util.mjs'
import { boot, request } from '../../fishball-core/wire/subject.mjs'
import { C } from '../../fishball-core/wire/constants.mjs'
import { page, firstFrame, routeStatus } from './subject.mjs'
import { U } from './constants.mjs'
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
  for (const lang of U.lang) test(`${sdk} STRIP-SYS-01 ${lang} immediate SSE frame contract`, async () => {
    const h = await get(); const r = await firstFrame(h, lang)
    assert.equal(r.status, U.success); assert.ok(r.contentType.includes(U.sse)); assert.ok(Array.isArray(r.frame.lines))
    for (const l of r.frame.lines) { assert.equal(typeof l.kind, 'string'); assert.equal(typeof l.text, 'string'); assert.ok(l.text.length) }
    assert.ok(r.frame.control === null || U.actions.includes(r.frame.control.action))
  })
  test(`${sdk} STRIP-DT-01 controls use core Connect and cancel routes`, async () => {
    const h = await get()
    const begin = await request(h, C.routes.connect, {})
    assert.equal(begin.status, C.status.ok)
    assert.equal(begin.json.outcome, 'needs-configuration')
    assert.ok(C.configurationCodes.includes(begin.json.code))
    const cancel = await request(h, C.routes.cancel, {})
    assert.equal(cancel.status, C.status.ok)
    assert.ok(C.connectStates.includes(cancel.json.state))
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
    assert.equal((await request(h, C.routes.connect)).status, C.status.missing)
    assert.equal((await request(h, C.routes.connect, {})).status, C.status.missing)
  })
  test(`${sdk} MODEL browser page reload and real settings navigation`, { todo: U.todo }, () => {})
}
