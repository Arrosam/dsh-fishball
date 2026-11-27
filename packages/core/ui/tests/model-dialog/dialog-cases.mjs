// The legacy Fishball page picker was superseded by dsh-instance onboarding.
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { CATALOG, MODEL, emptyCatalog, modelPage } from '../support/b-model.mjs'

const NONE = 0
function assertNoModal(p) {
  assert.equal(p.dialogs().length, NONE, 'no legacy model dialog should render')
  assert.equal(p.nodes().filter((n) => n.props?.[MODEL.removedHook] !== undefined).length, NONE)
}
function assertHealthy(p) {
  assert.deepEqual(p.world.errors, [])
  assert.deepEqual(p.world.failedFibers, [])
}

export function registerDialogCases() {
  for (const lang of MODEL.langs) {
    caseTest('MODEL-REMOVED-01', lang, 'unset core model does not register or render a picker, even after reopening', async (t) => {
      let catalogReads = 0
      const p = await modelPage(t, {
        lang,
        modelCatalog: async () => {
          catalogReads += 1
          return { ok: true, value: structuredClone(CATALOG.wire) }
        },
      })
      assertHealthy(p)
      for (const slot of MODEL.slots) {
        const match = p.world.entries(slot).filter((e) => e.options?.id === MODEL.removedEntry)
        assert.deepEqual(match, [], `removed entry ${MODEL.removedEntry} must not be registered in ${slot}`)
      }
      const assertNoPickerEffects = () => {
        assertNoModal(p)
        assert.equal(catalogReads, NONE, 'the legacy picker must not read the catalog')
        assert.deepEqual(p.world.mutations, [])
      }
      assertNoPickerEffects()
      await p.closePage()
      await p.openPage()
      assertNoPickerEffects()
    })

    caseTest('MODEL-REMOVED-02', lang, 'unset core model and empty catalog do not render a picker', async (t) => {
      const p = await modelPage(t, { lang, catalog: emptyCatalog() })
      assertHealthy(p)
      assertNoModal(p)
      assert.equal(p.launcherPresses, NONE)
      assert.deepEqual(p.world.mutations, [])
    })
  }
}
