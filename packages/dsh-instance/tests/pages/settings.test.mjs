/**
 * The instance's own settings page and the page's footprint on DSH (README "Settings page"; package
 * manifest; DSH plugin-manager README "Configuration pages": `plugins.bundle.config`, keyed by the
 * bundle's package name, for a bundle's own configuration; dsh-client-ui-settings README
 * "Following served namespaces").
 *
 * | Case | Technique | Input | Expected |
 * |---|---|---|---|
 * | HOST-EP-01 row 4 shipped | EP | the manifest | dsh.client web, ./client → client.js, client.js and its chunks exist and ship in files |
 * | HOST-EP-01 row 4 slots | EP | the page applied | registers the settings page at plugins.bundle.config keyed dsh-instance, and otherwise only the Fishball feature's slots the README lists (tab, Add menu, detail action, shell overlay) |
 * | HOST-EP-01 row 4 not served | EP | the Host serves no dsh-instance namespace | no settings entry |
 * | HOST-EP-01 row 4 summary | EP over the view | view summary | the one-liner, no form |
 * | HOST-EP-01 row 4 no token | EP | every action pressed | no password field; no request or text names a token or the credential reference |
 * | UIPD-INST-SECTIONS ×2 | EP over the language | en / zh | headings Fishball / Model for Fishball / Launch; no remote target editor; Open then Reconnect under Fishball; Open has an icon |
 * | UIPD-INST-RETRY ×7 | EP over the state | the seven states | Retry only for failed, primary, one POST retry; the status tag holds a StateDot |
 * | UIPD-INST-SYNC ×4 | state transition + decision | Check, then tick/untick | listed ticked Checkboxes named in <strong>; Add posts exactly the ticked ids; none ticked → Add disabled |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { wordsOf } from '@dsh-instance/test-helpers/page'
import { findAll } from '@dsh-instance/test-helpers/react-shim'
import { packageFile } from '../support/instance.mjs'
import { CHECK, CREDENTIAL_REF, HEADINGS, HOOK, PAGE_UI, ROUTE, SLOT, STAND, STATE, WORDS } from './constants.mjs'
import { requestsTo, scriptedInstance, show, statusOf } from './fakes.mjs'
import { openSettings } from './open.mjs'
import { openInstancePage } from './page.mjs'

const byHook = (tree, name, value) => findAll(tree(), (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value)))
const primitive = (n) => String(n.props[STAND.primitive] ?? '')
/** Everything a request carried: path, query, body and headers. */
const carried = (page) => page.requests.map((r) => [r.path, r.search, r.body ?? '', JSON.stringify(r.headers)].join(' ')).join('\n')

/** The settings page listed after Check (UIPD-INST-SYNC). */
async function listed(t, sdk) {
  const { page, tree } = await openSettings(t, sdk)
  await page.until(() => byHook(tree, HOOK.check).some((n) => !n.props.disabled))
  await page.press(byHook(tree, HOOK.check)[0])
  await page.until(() => byHook(tree, HOOK.entry).length === CHECK.missing.length)
  const boxOf = (id) => findAll(byHook(tree, HOOK.entry, id), (n) => n.tag === 'input' && n.props.type === 'checkbox')[0]
  const adds = () => requestsTo(page, 'POST', ROUTE.add).map((r) => JSON.parse(r.body))
  return { page, tree, boxOf, adds }
}

eachSdk((sdk) => {
  // ------------------------------------------------------------------ the page's footprint
  caseTest(sdk, 'HOST-EP-01', '4 shipped', "the instance's browser code is its own page: dsh.client web, ./client export, client.js + its chunks shipped", async () => {
    const manifest = JSON.parse(fs.readFileSync(packageFile('package.json'), 'utf8'))
    assert.equal(manifest.dsh?.client?.platform, 'web')
    assert.equal(manifest.exports?.['./client'], './' + PAGE_UI.entry)
    for (const file of [PAGE_UI.entry, ...PAGE_UI.chunks]) {
      assert.ok(fs.existsSync(packageFile(file)), file + ' missing')
      assert.ok(manifest.files.includes(file), file + ' not in files')
    }
  })

  caseTest(sdk, 'HOST-EP-01', '4 slots', 'the settings page registers at plugins.bundle.config keyed dsh-instance; the only other slots are the Fishball feature\'s (tab, Add menu, detail action, overlay)', async (t) => {
    const page = await openInstancePage(t, { sdk, respond: scriptedInstance().respond })
    assert.deepEqual(page.errors, [])
    assert.deepEqual(page.slotNames(), [SLOT.addActions, SLOT.detailActions, SLOT.bundleConfig, SLOT.tab, SLOT.overlay].sort())
    assert.deepEqual(page.entriesOf(SLOT.bundleConfig).map((e) => e.options.key), [PAGE_UI.id])
    assert.deepEqual(page.entriesOf(SLOT.rowConfig), [], 'a row configuration page')
    for (const name of [SLOT.tab, SLOT.addActions, SLOT.detailActions, SLOT.overlay]) assert.equal(page.entriesOf(name).length, 1, name)
  })

  caseTest(sdk, 'HOST-EP-01', '4 not served', 'while the Host serves no dsh-instance namespace the page registers no settings entry', async (t) => {
    const page = await openInstancePage(t, { sdk, respond: scriptedInstance().respond, served: false })
    assert.deepEqual(page.entriesOf(SLOT.bundleConfig), [])
  })

  caseTest(sdk, 'HOST-EP-01', '4 summary', "view summary renders the page's one-line summary, not the form", async (t) => {
    const page = await openInstancePage(t, { sdk, respond: scriptedInstance().respond })
    const [entry] = page.entriesOf(SLOT.bundleConfig)
    const tree = await page.mount('summary', entry, { view: 'summary' })
    const text = wordsOf(tree())
    assert.ok(text.length > 0 && /Fishball/.test(text), 'summary: ' + show(text))
    assert.deepEqual(findAll(tree(), (n) => n.tag === 'button' || n.tag === 'input'), [])
  })

  caseTest(sdk, 'HOST-EP-01', '4 no token', 'the settings page shows no token field: no password input, and no request or text names a token or the credential reference', async (t) => {
    const world = scriptedInstance({ status: statusOf(STATE.failed) })
    const { page, tree } = await openSettings(t, sdk, { world })
    await page.until(() => byHook(tree, HOOK.retry).length > 0)
    assert.deepEqual(findAll(tree(), (n) => n.tag === 'input' && n.props.type === 'password'), [], 'a password input')
    assert.deepEqual(findAll(tree(), (n) => primitive(n) === 'SettingsSecretField'), [], 'a secret field')
    // Press every action the page offers: Retry while failed, then (ready) Reconnect, Open, Check, Add.
    await page.press(byHook(tree, HOOK.retry)[0])
    world.status = statusOf(STATE.ready, { busy: false })
    await page.tick(1000)
    await page.until(() => byHook(tree, HOOK.state, STATE.ready).length > 0)
    for (const hook of [HOOK.reconnect, HOOK.open, HOOK.check]) await page.press(byHook(tree, hook)[0])
    await page.until(() => byHook(tree, HOOK.add).length > 0)
    await page.press(byHook(tree, HOOK.add)[0])
    await page.until(() => requestsTo(page, 'POST', ROUTE.add).length > 0)
    for (const path of [ROUTE.retry, ROUTE.reconnect, ROUTE.open, ROUTE.check, ROUTE.add]) assert.equal(requestsTo(page, 'POST', path).length, 1, path)
    assert.ok(!carried(page).includes(CREDENTIAL_REF), 'a request names ' + CREDENTIAL_REF)
    assert.ok(!/token/i.test(page.requests.map((r) => r.body ?? '').join('\n')), 'a request body carries a token')
    assert.ok(!wordsOf(tree()).includes(CREDENTIAL_REF), 'the page names ' + CREDENTIAL_REF)
  })

  // ------------------------------------------------------------------ sections (EP over the language)
  for (const lang of PAGE_UI.langs) {
    caseTest(sdk, 'UIPD-INST-SECTIONS', lang, `headings ${HEADINGS[lang].join(' / ')}; no remote target editor; Open Fishball then Reconnect under Fishball; Open Fishball has an icon`, async (t) => {
      const { tree } = await openSettings(t, sdk, { lang })
      assert.deepEqual(findAll(tree(), (n) => n.tag === 'h3').map(wordsOf), [...HEADINGS[lang]])
      assert.deepEqual(byHook(tree, HOOK.target), [], 'a remote target editor')
      assert.deepEqual(findAll(tree(), (n) => n.props['aria-label'] === WORDS.targetLabel[lang] || n.props.label === WORDS.targetLabel[lang]), [], 'a remote target field under another hook')
      assert.deepEqual(findAll(tree(), (n) => n.tag === 'input' && n.props.type === 'text'), [], 'an editable text field (the only launch field is the enabled switch)')
      const order = findAll(tree(), () => true)
      const [heading] = findAll(tree(), (n) => n.tag === 'h3')
      const [open] = byHook(tree, HOOK.open)
      const [reconnect] = byHook(tree, HOOK.reconnect)
      assert.ok(open && reconnect, 'Open Fishball or Reconnect missing')
      assert.ok(order.indexOf(heading) < order.indexOf(open) && order.indexOf(open) < order.indexOf(reconnect), 'Open / Reconnect are not under the Fishball heading in that order')
      assert.ok(wordsOf(open).includes(WORDS.open[lang]), 'Open says ' + show(wordsOf(open)))
      assert.ok(findAll([open], (n) => n !== open && primitive(n).startsWith('Icon')).length > 0, 'Open Fishball has no icon')
    })
  }

  // ------------------------------------------------------------------ Retry only for failed (EP over the state)
  for (const state of [STATE.disabled, STATE.waiting, STATE.starting, STATE.ready, STATE.stopping, STATE.stopped, STATE.failed]) {
    const failed = state === STATE.failed
    caseTest(sdk, 'UIPD-INST-RETRY', state, `status ${state} → ${failed ? 'Retry shown, variant primary; pressing it POSTs retry once' : 'no Retry'}; the status tag holds a StateDot`, async (t) => {
      const world = scriptedInstance({ status: statusOf(state) })
      const { page, tree } = await openSettings(t, sdk, { world })
      await page.until(() => byHook(tree, HOOK.state, state).length > 0)
      const [line] = byHook(tree, HOOK.state, state)
      assert.ok(findAll([line], (n) => primitive(n) === 'StateDot').length > 0, 'no StateDot in the status line')
      const retry = byHook(tree, HOOK.retry)
      assert.equal(retry.length, failed ? 1 : 0, 'Retry buttons')
      if (!failed) return
      assert.equal(retry[0].props[STAND.variant], 'primary')
      assert.equal(wordsOf(retry[0]), WORDS.retry.en)
      await page.press(retry[0])
      await page.until(() => requestsTo(page, 'POST', ROUTE.retry).length > 0)
      assert.equal(requestsTo(page, 'POST', ROUTE.retry).length, 1)
    })
  }

  // ------------------------------------------------------------------ model sync: Checkbox and Add
  caseTest(sdk, 'UIPD-INST-SYNC', 'listed', 'Check → each missing provider is a DSH Checkbox, ticked, labelled with its name in <strong>', async (t) => {
    const { tree, boxOf } = await listed(t, sdk)
    for (const entry of CHECK.missing) {
      const [box] = findAll(byHook(tree, HOOK.entry, entry.id), (n) => primitive(n) === 'Checkbox')
      assert.ok(box, 'no Checkbox for ' + entry.id)
      assert.deepEqual(findAll([box], (n) => n.tag === 'strong').map(wordsOf), [entry.name])
      assert.equal(boxOf(entry.id).props.checked, true, entry.id + ' is not ticked')
    }
  })
  caseTest(sdk, 'UIPD-INST-SYNC', 'untick one', 'untick the second provider → Add posts {checkId, ids} with exactly the first and third', async (t) => {
    const { page, tree, boxOf, adds } = await listed(t, sdk)
    const [first, second, third] = CHECK.missing.map((e) => e.id)
    await page.toggle(boxOf(second))
    assert.equal(boxOf(second).props.checked, false)
    await page.press(byHook(tree, HOOK.add)[0])
    await page.until(() => adds().length > 0)
    assert.deepEqual(adds(), [{ checkId: CHECK.checkId, ids: [first, third] }])
  })
  caseTest(sdk, 'UIPD-INST-SYNC', 'untick, tick', 'untick then tick a provider again → Add posts all three ids', async (t) => {
    const { page, tree, boxOf, adds } = await listed(t, sdk)
    const [first] = CHECK.missing.map((e) => e.id)
    await page.toggle(boxOf(first))
    await page.toggle(boxOf(first))
    await page.press(byHook(tree, HOOK.add)[0])
    await page.until(() => adds().length > 0)
    assert.deepEqual(adds().length, 1)
    assert.deepEqual([...adds()[0].ids].sort(), CHECK.missing.map((e) => e.id).sort())
  })
  caseTest(sdk, 'UIPD-INST-SYNC', 'none ticked', 'untick every provider → Add is disabled and nothing is posted', async (t) => {
    const { page, tree, boxOf, adds } = await listed(t, sdk)
    for (const entry of CHECK.missing) await page.toggle(boxOf(entry.id))
    const [add] = byHook(tree, HOOK.add)
    assert.equal(Boolean(add.props.disabled), true, 'Add is enabled with nothing ticked')
    await page.press(add)
    assert.deepEqual(adds(), [])
  })
})
