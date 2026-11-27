/**
 * The settings page under DSH's own form object (regression for the settings page that never
 * appeared in a real DSH).
 *
 * DSH's plugin manager renders a bundle's `plugins.bundle.config` entry with `{view: 'page'}` only
 * (no `form`), so the page takes its form from `configForms.get(id)`. DSH's form is a
 * ConfigFormController whose `getSnapshot` and `subscribe` are class methods reading `this.store`.
 * The page passed them to useSyncExternalStore detached from the object, so they threw "Cannot read
 * properties of undefined (reading 'store')" and the page crashed (seen in a real Chromium on DSH
 * 0.2.1-rc.5, 0.2.2-rc.1 and 0.2.2-rc.3; the layout rows UIFD-SETTINGS timed out on it).
 * The row fails before the fix in client.js (makePage) and passes after it.
 * Techniques: EP over the form the page gets (the owner's prop / DSH's own form object).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { worldFor } from '../tokens/world.mjs'
import { CLIENT, WAIT } from './constants.mjs'
import { openTokensPage } from './page.mjs'
import { routesOf } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const ID = 'SETPAGE-FORM-EP-01'

export function registerHostFormCases(sdk) {
  test(caseName(sdk, ID, 'dsh form, no owner form', 'opened with {view} only over DSH\'s own form object: the page renders its token list, with no page error'), T, async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world), dshForms: true })
    const view = await page.open(CLIENT.view.page, { ownerForm: false })
    assert.deepEqual(page.errors, [])
    assert.equal(view.find(CLIENT.attr.root).length, 1, 'the settings page root is not rendered')
  })
}