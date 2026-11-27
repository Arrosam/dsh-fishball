/** The Fishball tab now lists only installed plugins (fcb5802; README "Plugins for Fishball"). */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { wordsOf } from '@dsh-instance/test-helpers/page'
import { byAttr, findAll } from '@dsh-instance/test-helpers/react-shim'
import { gate } from '@dsh-instance/test-helpers/wait'
import { HOOK, PAGE_UI, ROUTE, STAND } from './constants.mjs'
import { alerts, openDialogs, requestsTo, scriptedInstance } from './fakes.mjs'
import { openTab } from './open.mjs'

const TAB = Object.freeze({
  bundles: Object.freeze([
    Object.freeze({ name: 'fbtest-tab-alpha', version: '1.2.3', description: 'Alpha description', enabled: true }),
    Object.freeze({ name: 'fbtest-tab-beta', description: 'Beta description', enabled: false }),
  ]),
  recommended: /\brecommended\b|推荐插件/i,
  uninstall: 'Uninstall',
  busy: 'busy',
  switchPrimitive: 'Switch',
  tagPrimitive: 'Tag',
})
const withBundles = (handlers) => {
  const world = scriptedInstance({ handlers })
  world.plugins.bundles = [...TAB.bundles]
  return world
}
const card = (tree, name) => byAttr(tree(), HOOK.card, name)[0]
const switchOf = (tree, name) => {
  // DSH's Switch does not forward data attributes; use the wrapper and the primitive's props.
  const [wrapper] = byAttr(tree(), HOOK.toggleWrap, name)
  assert.ok(wrapper, 'no switch wrapper for ' + name)
  const [control] = byAttr([wrapper], STAND.primitive, TAB.switchPrimitive)
  assert.ok(control, 'no Switch in wrapper for ' + name)
  return control.props
}
async function flip(page, tree, name) {
  const control = switchOf(tree, name)
  assert.equal(control.disabled, false)
  control.onChange(!control.checked) // SDK Switch's onChange receives a boolean, not a DOM event.
  await page.settle()
}
const posted = (page, route) => requestsTo(page, 'POST', route).map((req) => JSON.parse(req.body))

eachSdk((sdk) => {
  for (const lang of PAGE_UI.langs) {
    caseTest(sdk, 'CPB-EP-TAB', lang, 'installed cards show their title, optional version and description; no Recommendations section', async (t) => {
      const { page, tree } = await openTab(t, sdk, { lang, world: withBundles() })
      const sections = findAll(tree(), (node) => node.tag === 'section')
      assert.equal(sections.length, 1, 'the tab should have only the installed section')
      assert.doesNotMatch(wordsOf(tree()), TAB.recommended)
      for (const bundle of TAB.bundles) {
        const item = card(tree, bundle.name)
        assert.ok(item, 'missing card for ' + bundle.name)
        assert.ok(wordsOf(item).includes(bundle.name))
        assert.ok(wordsOf(item).includes(bundle.description))
        const versions = byAttr([item], STAND.primitive, TAB.tagPrimitive).map(wordsOf)
        assert.deepEqual(versions, bundle.version ? [bundle.version] : [])
        assert.equal(switchOf(tree, bundle.name).checked, bundle.enabled)
        assert.equal(byAttr([item], HOOK.uninstall, bundle.name).length, 1)
      }
      assert.deepEqual(page.errors, [])
    })
  }

  caseTest(sdk, 'CPB-ST-TOGGLE', 'both directions', 'a toggle posts the boolean, disables both switches while held, then reads the inventory and reflects the answer', async (t) => {
    const hold = gate()
    t.after(() => hold.open())
    const world = withBundles({ ['POST ' + ROUTE.toggle]: async (request) => {
      const { name, enabled } = JSON.parse(request.body)
      await hold.promise
      world.plugins.bundles = world.plugins.bundles.map((b) => b.name === name ? { ...b, enabled } : b)
      return { ok: true, name, enabled }
    } })
    const { page, tree } = await openTab(t, sdk, { world })
    const [first, second] = TAB.bundles
    const reads = () => requestsTo(page, 'GET', ROUTE.plugins).length
    const before = reads()
    await flip(page, tree, first.name)
    assert.deepEqual(posted(page, ROUTE.toggle), [{ name: first.name, enabled: false }])
    assert.equal(switchOf(tree, first.name).checked, true, 'the held write has not been reflected in inventory')
    for (const { name } of TAB.bundles) assert.equal(switchOf(tree, name).disabled, true, name)
    hold.open()
    await page.settle()
    assert.ok(reads() > before, 'did not reread inventory after the toggle')
    assert.equal(switchOf(tree, first.name).checked, false)
    await flip(page, tree, second.name)
    assert.deepEqual(posted(page, ROUTE.toggle), [{ name: first.name, enabled: false }, { name: second.name, enabled: true }])
    assert.equal(switchOf(tree, second.name).checked, true)
    assert.deepEqual(page.errors, [])
  })

  caseTest(sdk, 'CPB-EP-TOGGLE', 'refusal', 'a busy refusal shows an alert on the card, keeps the value, and restores interaction', async (t) => {
    const world = withBundles({ ['POST ' + ROUTE.toggle]: () => ({ ok: false, code: TAB.busy }) })
    const { page, tree } = await openTab(t, sdk, { world })
    const [{ name }] = TAB.bundles
    await flip(page, tree, name)
    assert.deepEqual(posted(page, ROUTE.toggle), [{ name, enabled: false }])
    assert.equal(alerts([card(tree, name)]).length, 1)
    const { checked, disabled } = switchOf(tree, name)
    assert.deepEqual({ checked, disabled }, { checked: true, disabled: false })
    assert.deepEqual(page.errors, [])
  })

  caseTest(sdk, 'CPB-ST-UNINSTALL', 'confirm', 'Uninstall opens a dialog with no POST; on confirm remove the card after refreshing the inventory', async (t) => {
    const world = withBundles({ ['POST ' + ROUTE.uninstall]: (request) => {
      const { name } = JSON.parse(request.body)
      world.plugins.bundles = world.plugins.bundles.filter((b) => b.name !== name)
      return { ok: true, name }
    } })
    const { page, tree } = await openTab(t, sdk, { world })
    const [first, second] = TAB.bundles
    await page.press(byAttr(tree(), HOOK.uninstall, first.name)[0])
    assert.deepEqual(posted(page, ROUTE.uninstall), [])
    const [dialog] = openDialogs(tree())
    assert.ok(dialog, 'no uninstall confirmation')
    const [confirm] = findAll([dialog], (node) => node.tag === 'button' && wordsOf(node) === TAB.uninstall)
    const readsBefore = requestsTo(page, 'GET', ROUTE.plugins).length
    await page.press(confirm)
    assert.ok(requestsTo(page, 'GET', ROUTE.plugins).length > readsBefore, 'did not reread inventory after uninstall')
    assert.deepEqual(posted(page, ROUTE.uninstall), [{ name: first.name }])
    assert.equal(card(tree, first.name), undefined)
    assert.ok(card(tree, second.name), 'uninstall removed the wrong card')
    assert.deepEqual(page.errors, [])
  })
})
