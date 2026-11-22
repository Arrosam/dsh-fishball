/**
 * The per-bundle button on a main-DSH bundle page (plugins.detail.actions; README "Plugins for
 * Fishball": "on each bundle's page: Uninstall from Fishball when Fishball has it; else Use in
 * Fishball for an official bundle DSH ships (added to the child's list, no pnpm run); else Install
 * to Fishball with the bundle's install source. Nothing for the bundles the instance owns …, which
 * the Host lists as protected"). DSH renders a detail entry with the page's `subject`
 * (plugin-manager README "Detail page extension points"); an entry renders null for a subject it has
 * nothing for.
 *
 * Decision table: C1 in Fishball's list · C2 official AND shipped (availability installation) ·
 * C3 has an install source · C4 the name is protected → Uninstall | Use | Install | nothing.
 * Row 10: a subject that is not a bundle (an official plugin's page) → nothing.
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { wordsOf } from '@dsh-instance/test-helpers/page'
import { findAll } from '@dsh-instance/test-helpers/react-shim'
import { DETAIL, ROUTE } from './constants.mjs'
import { requestsTo, scriptedInstance, show } from './fakes.mjs'
import { openDetail } from './open.mjs'

const ROWS = Object.freeze([
  // [part, name, C1 in Fishball, C2 official shipped, C3 source, expected]
  ['1 in Fishball, has source', 'fbtest-dt-one', true, false, true, DETAIL.uninstall],
  ['2 in Fishball, official shipped', '@deepseek-ai/dsh-experimental-session-search', true, true, false, DETAIL.uninstall],
  ['3 official shipped', '@deepseek-ai/dsh-experimental-session-search', false, true, false, DETAIL.use],
  ['4 has install source', 'fbtest-dt-four', false, false, true, DETAIL.install],
  ['5 official shipped and has source', '@deepseek-ai/dsh-experimental-tool-worktree', false, true, true, DETAIL.use],
  ['6 none', 'fbtest-dt-six', false, false, false, null],
  ['7 dsh-instance', 'dsh-instance', false, false, true, null],
  ['8 fishball-core in Fishball', 'fishball-core', true, false, true, null],
  ['9 fishball-ui', 'fishball-ui', false, false, true, null],
])

/** A main-DSH BundleInfo (dsh-plugin-manager types) for one row. */
const bundleInfo = (name, official, source) => ({
  name, version: '1.0.0', official, availability: official ? 'installation' : 'profile', installed: !official, enabled: true,
  optional: official, removable: !official, rows: [], overrides: [], ...(source ? { source: '/fbtest/source/' + name.replace(/\W/g, '-') + '.tgz' } : {}),
})
const actionWords = (tree) => findAll(tree(), (n) => n.tag === 'button').map(wordsOf)
const childListRead = (page) => requestsTo(page, 'GET', ROUTE.plugins).length > 0

eachSdk((sdk) => {
  for (const [part, name, inFishball, official, source, expected] of ROWS) {
    caseTest(sdk, 'CPB-DETAIL', part, `${name}: in Fishball ${inFishball}, official shipped ${official}, source ${source} → ${expected ?? 'nothing'}`, async (t) => {
      const info = bundleInfo(name, official, source)
      const world = scriptedInstance()
      world.plugins = { ...world.plugins, bundles: inFishball ? [{ name, version: '1.0.0', enabled: true }] : [] }
      const subject = { kind: 'bundle', pkg: { name, version: info.version, installed: info.installed, availability: info.availability, official, enabled: true, rows: [] } }
      const { page, tree } = await openDetail(t, sdk, { world, mainBundles: [info], subject })
      await page.until(() => childListRead(page))
      if (expected === null) { assert.deepEqual(actionWords(tree), [], 'a control for ' + name); return }
      assert.deepEqual(actionWords(tree).filter((w) => Object.values(DETAIL).includes(w)), [expected], 'actions ' + show(actionWords(tree)))
      if (expected === DETAIL.use) {
        // "added to the child's list, no pnpm run": one POST use {name}, nothing else posted.
        await page.press(findAll(tree(), (n) => n.tag === 'button' && wordsOf(n) === expected)[0])
        await page.until(() => requestsTo(page, 'POST', ROUTE.use).length > 0)
        assert.deepEqual(requestsTo(page, 'POST', ROUTE.use).map((r) => JSON.parse(r.body)), [{ name }])
        assert.deepEqual(page.requests.filter((r) => r.method === 'POST').map((r) => r.path), [ROUTE.use])
      }
    })
  }
  caseTest(sdk, 'CPB-DETAIL', '10 item subject', 'an official-plugin (item) page → nothing', async (t) => {
    const { page, tree } = await openDetail(t, sdk, { subject: { kind: 'item', id: 'fbtest-item' } })
    await page.until(() => childListRead(page))
    assert.deepEqual(actionWords(tree), [])
  })
})
