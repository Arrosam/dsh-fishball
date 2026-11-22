/**
 * F-WIRE model dialog rows (README.md beside this file). The user, 2026-11-16: "fishball打开的时候可以看到
 * 自己选没选模型，然后会提示用户选择配置的模型" (when Fishball opens, show whether a model is chosen and
 * prompt to choose a configured one). "When the Fishball page opens" is fishball-page's public root
 * mark `<html data-fishball-page>` (code review, F-WIRE): the dialog shows only while the mark is
 * present; a dismissal lasts while the page stays open and is forgotten when the mark goes away.
 *
 * Level: component (../support/b-model.mjs `modelPage`: fishball-ui's real client alone in the
 * scripted DSH page; core's namespace, DSH's catalog read and DSH's Settings launcher are scripted).
 * Techniques: EP (model unset / set; catalog with models / none), ST (page closed → open; dismiss →
 * focus → reopen; dismiss → closed → open), BVA (zero catalog models).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { CATALOG, MODEL, emptyCatalog, modelPage } from '../support/b-model.mjs'

const NONE = 0
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const modelWrite = (p) => p.world.mutations.find((m) => m.ns === MODEL.namespace && m.ops.some((o) => same(o.path, MODEL.path)))

export function registerDialogCases() {
  for (const lang of MODEL.langs) {
    caseTest('MODEL-EP-01', lang, 'unset model prompts with all catalog models', async (t) => {
      const p = await modelPage(t, { lang })
      assert.deepEqual(p.world.errors, []); assert.deepEqual(p.world.failedFibers, [])
      assert.ok(p.dialogs().length, 'No model dialog on Fishball page open')
      for (const name of CATALOG.wireNames) assert.ok(p.text().includes(name), name)
    })
    caseTest('MODEL-ST-01', lang, 'choose writes core model path', async (t) => {
      const p = await modelPage(t, { lang })
      await p.choose(CATALOG.wireNames[1])
      const write = modelWrite(p)
      assert.ok(write, 'No core model mutation')
      const op = write.ops.find((o) => same(o.path, MODEL.path))
      assert.equal(op.op, 'set')
      assert.equal(op.value.provider, MODEL.selection.provider); assert.equal(op.value.model, MODEL.selection.model)
      assert.deepEqual(Object.keys(op.value).filter((k) => !MODEL.selectionKeys.includes(k)), [])
    })
    caseTest('MODEL-ST-02', lang, 'dismiss stays dismissed in page; fresh page prompts', async (t) => {
      const p = await modelPage(t, { lang }); assert.ok(p.dialogs().length)
      await p.dismiss()
      assert.equal(p.dialogs().length, NONE); assert.deepEqual(p.world.mutations, [])
      assert.ok((await modelPage(t, { lang })).dialogs().length)
    })
    caseTest('MODEL-ST-04', lang, 'page not open (no data-fishball-page) with unset model: no dialog', async (t) => {
      const p = await modelPage(t, { lang, open: false })
      assert.deepEqual(p.world.errors, []); assert.deepEqual(p.world.failedFibers, [])
      assert.equal(p.dialogs().length, NONE, 'Model dialog shown while the Fishball page is not open')
      assert.deepEqual(p.world.mutations, [])
    })
    caseTest('MODEL-ST-05', lang, 'closed → data-fishball-page set: dialog shows', async (t) => {
      const p = await modelPage(t, { lang, open: false }); assert.equal(p.dialogs().length, NONE)
      await p.openPage()
      assert.ok(p.dialogs().length, 'No model dialog when the Fishball page opens')
      for (const name of CATALOG.wireNames) assert.ok(p.text().includes(name), name)
    })
    caseTest('MODEL-ST-06', lang, 'dismiss → page closed → page opened again: dialog shows again', async (t) => {
      const p = await modelPage(t, { lang }); assert.ok(p.dialogs().length)
      await p.dismiss(); assert.equal(p.dialogs().length, NONE)
      await p.closePage(); assert.equal(p.dialogs().length, NONE, 'Model dialog shown after the Fishball page closed')
      await p.openPage(); assert.ok(p.dialogs().length, 'Dismissal outlived the Fishball page close')
      assert.deepEqual(p.world.mutations, [])
    })
    caseTest('MODEL-EP-02', lang, 'configured core model does not prompt', async (t) => {
      const p = await modelPage(t, { lang, model: MODEL.selection })
      assert.equal(p.dialogs().length, NONE); assert.deepEqual(p.world.mutations, [])
    })
    caseTest('MODEL-BVA-01', lang, 'zero catalog models explains and opens DSH Settings', async (t) => {
      const p = await modelPage(t, { lang, catalog: emptyCatalog() })
      assert.ok(p.dialogs().length); assert.match(p.text(), MODEL.empty)
      await p.press(p.control(MODEL.settings))
      assert.ok(p.launcherPresses > NONE, 'Settings launcher was not pressed')
      assert.deepEqual(p.world.mutations, [])
    })
  }
}
