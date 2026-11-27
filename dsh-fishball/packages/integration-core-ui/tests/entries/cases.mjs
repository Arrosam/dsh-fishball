/**
 * The two Fishball-page header entries and the `#view=settings` continuation (old test/v3/fishball-core/
 * settings with CLIENTS.both: SET3-UC-07 main 1 / F-UI ids, SET3-BVA-03 entries, SET3-DT-02/03/04,
 * SET3-UC-08, SET3-EP-05, SET3-ST-04, SET3-UC-10's entries halves, UIPF-ENTRY-EP-01 / ST-01). Since F-UI the
 * entries are fishball-ui's (client.entries.js); what they open is core's own settings page (its bundle
 * `fishball-core`, served by core's client.js). Requirements 7, 8 and 10 of F-SETTINGS, UI-POLISH-F §5.
 *
 * Techniques: DT (SET3-DT-02 pluginNavigation present / absent; SET3-DT-03 launcher on / off / later;
 * SET3-DT-04 the active panel when the session mark arrives), EP (SET3-EP-05 fragments; UIPF-ENTRY-EP-01
 * entry × language), ST (SET3-ST-04 the session mark again; UIPF-ENTRY-ST-01 hover), BVA (exactly one entry
 * of each kind). Level: component: fishball-test-helpers/scripted-page with core's and fishball-ui's real
 * clients (by name), DSH's own SettingsFormModel and stand-in primitives; DSH's native Settings launcher a
 * fake-DOM element of the page.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { STAND_IN, DESIGN } from 'fishball-test-helpers/dsh-primitives'
import { exportPath } from 'fishball-test-helpers/packages'
import { findAll, textOf } from 'fishball-test-helpers/react-shim'
import { DSH_PAGE, createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { NAME } from '../support/packages.mjs'
import { ENTRIES } from './constants.mjs'

const show = (v) => JSON.stringify(v)
const CLIENTS = Object.freeze({
  both: () => [{ id: NAME.core, file: exportPath(NAME.core, ENTRIES.clientExport) }, { id: NAME.ui, file: exportPath(NAME.ui, ENTRIES.clientExport) }],
  coreOnly: () => [{ id: NAME.core, file: exportPath(NAME.core, ENTRIES.clientExport) }],
})
const subtree = (node) => [node, ...(node.children ?? []).filter((c) => typeof c !== 'string').flatMap(subtree)]
const texts = (node) => (typeof node === 'string' ? [node.trim()].filter(Boolean) : (node.children ?? []).flatMap(texts))

/**
 * The Fishball page: both clients, core's namespace served (its settings page), `<html data-fishball-page>`,
 * and DSH's launcher element when `launcher`. `launcherPresses()` counts its clicks.
 */
async function entriesPage(t, { launcher = true, lang = ENTRIES.lang, clients = CLIENTS.both(), ...options } = {}) {
  const w = createWorld({ clients, lang, namespaces: { [NAME.core]: {} }, ...options })
  w.html.setAttribute(ENTRIES.pageMark, '')
  let presses = 0
  const launcherEl = w.dom.createElement(ENTRIES.launcherTag)
  launcherEl.className = ENTRIES.launcherClass
  launcherEl.addEventListener(ENTRIES.click, () => { presses += 1 })
  const setLauncher = (on) => { if (on) w.dom.body.append(launcherEl); else launcherEl.remove() }
  setLauncher(launcher)
  const page = await loadPage(t, w)
  const settingsOpens = () => w.openBundle.length + w.selectPanel.filter((id) => id === DSH_PAGE.pluginsPanel).length
  async function entry(which) {
    const headers = await page.headers()
    const found = headers.find((h) => page.byAttr(ENTRIES.hook, which, h.tree).length > 0)
    assert.ok(found, `no header action carries ${ENTRIES.hook}="${which}"; ids ${show(headers.map((h) => h.id))}`)
    const node = () => page.byAttr(ENTRIES.hook, which, w.shim.treeOf(found.key))[0]
    return { ...found, node, tree: () => w.shim.treeOf(found.key) }
  }
  async function press(e) {
    const node = e.node()
    const target = node.props.onClick ? node : page.find((n) => n.tag === ENTRIES.button && n.props.onClick, [node])[0]
    assert.ok(target, 'the entry has nothing to press')
    await page.press(target)
  }
  const markSession = async (value = '') => { w.html.setAttribute(ENTRIES.sessionMark, value); await page.settled() }
  return { world: w, page, entry, press, settingsOpens, launcherPresses: () => presses, setLauncher, markSession }
}

export function registerEntryCases() {
  caseTest('SET3-UC-07', 'main 1', 'two header actions with distinct ids: Fishball settings and DSH settings', async (t) => {
    const p = await entriesPage(t)
    const fishball = await p.entry(ENTRIES.which.fishball)
    const dsh = await p.entry(ENTRIES.which.dsh)
    assert.notEqual(fishball.id, undefined)
    assert.notEqual(fishball.id, dsh.id)
    const ids = p.world.headerEntries().map((e) => e.options.id)
    assert.equal(new Set(ids).size, ids.length, 'duplicate header ids')
  })
  caseTest('SET3-UC-07', 'F-UI ids', `the two header actions are ${ENTRIES.action.fishball.id} (order ${ENTRIES.action.fishball.order}) and ${ENTRIES.action.dsh.id} (order ${ENTRIES.action.dsh.order})`, async (t) => {
    const p = await entriesPage(t)
    for (const [which, action] of Object.entries(ENTRIES.action)) {
      assert.equal((await p.entry(ENTRIES.which[which])).id, action.id, which)
      assert.equal(p.world.headerEntries().find((e) => e.options.id === action.id)?.options.order, action.order, which + ' order')
    }
  })
  caseTest('SET3-UC-07', 'F-UI core only', "core's client alone: its settings page registers; no Fishball-page header entry and no view=settings open", async (t) => {
    const p = await entriesPage(t, { clients: CLIENTS.coreOnly(), hash: ENTRIES.continuation })
    assert.equal(p.world.configEntries(NAME.core).length, 1, "core's settings page entry")
    const headers = await p.page.headers()
    for (const which of Object.values(ENTRIES.which)) assert.equal(headers.flatMap((h) => p.page.byAttr(ENTRIES.hook, which, h.tree)).length, 0, which)
    assert.equal(p.settingsOpens(), 0)
  })
  caseTest('SET3-BVA-03', 'entries', 'exactly one entry of each kind across the header actions', async (t) => {
    const p = await entriesPage(t)
    const headers = await p.page.headers()
    for (const which of Object.values(ENTRIES.which)) assert.equal(headers.flatMap((h) => p.page.byAttr(ENTRIES.hook, which, h.tree)).length, 1, which)
  })
  caseTest('SET3-DT-02', 1, `pluginNavigation present → openBundle('${NAME.core}'), no selectPanel`, async (t) => {
    const p = await entriesPage(t)
    await p.press(await p.entry(ENTRIES.which.fishball))
    assert.deepEqual(p.world.openBundle, [NAME.core])
    assert.deepEqual(p.world.selectPanel, [])
  })
  caseTest('SET3-DT-02', 2, `pluginNavigation absent → layout.selectPanel('${DSH_PAGE.pluginsPanel}'), nothing else`, async (t) => {
    const p = await entriesPage(t, { navigation: false })
    await p.press(await p.entry(ENTRIES.which.fishball))
    assert.deepEqual(p.world.selectPanel, [DSH_PAGE.pluginsPanel])
    assert.deepEqual(p.world.opened, [])
  })
  caseTest('SET3-DT-03', 1, "DSH's launcher on the page → it is pressed once; no alert; no navigation", async (t) => {
    const p = await entriesPage(t, { launcher: true })
    const e = await p.entry(ENTRIES.which.dsh)
    await p.press(e)
    assert.equal(p.launcherPresses(), 1)
    assert.deepEqual(p.page.alerts(e.tree()), [])
    assert.deepEqual([p.world.openBundle, p.world.selectPanel], [[], []])
  })
  caseTest('SET3-DT-03', 2, 'no launcher on the page → an alert line (DSH Settings cannot be opened from here), nothing else happens', async (t) => {
    const p = await entriesPage(t, { launcher: false })
    const e = await p.entry(ENTRIES.which.dsh)
    const fetches = p.world.fetches.length
    await p.press(e)
    assert.ok(p.page.alerts().length > 0, 'no alert line')
    assert.equal(p.launcherPresses(), 0)
    assert.deepEqual([p.world.openBundle, p.world.selectPanel, p.world.opened], [[], [], []])
    assert.equal(p.world.fetches.length, fetches)
  })
  caseTest('SET3-DT-03', 3, 'the launcher appears later → the same press reaches it (looked up at the press)', async (t) => {
    const p = await entriesPage(t, { launcher: false })
    const e = await p.entry(ENTRIES.which.dsh)
    p.setLauncher(true)
    await p.press(e)
    assert.equal(p.launcherPresses(), 1)
  })
  caseTest('SET3-UC-08', 'main 1', "#view=settings at load → core's settings page opens once (the Fishball-settings action)", async (t) => {
    const p = await entriesPage(t, { hash: ENTRIES.continuation })
    assert.deepEqual(p.world.openBundle, [NAME.core])
  })
  caseTest('SET3-UC-08', 'main 1', `#view=settings without pluginNavigation → selectPanel('${DSH_PAGE.pluginsPanel}') once`, async (t) => {
    const p = await entriesPage(t, { hash: ENTRIES.continuation, navigation: false })
    assert.deepEqual(p.world.selectPanel, [DSH_PAGE.pluginsPanel])
  })
  for (const [rule, title, between, opens] of [
    [1, 'active panel still Plugins when the session mark arrives → opens again (2 in all)', () => {}, 2],
    [2, 'active panel none when the session mark arrives → opens again (2 in all)', (w) => w.setActivePanel(null), 2],
    [3, 'the owner moved to another panel first → no second open (1 in all)', (w) => w.setActivePanel(ENTRIES.otherPanel), 1],
  ]) {
    caseTest('SET3-DT-04', rule, title, async (t) => {
      const p = await entriesPage(t, { hash: ENTRIES.continuation })
      between(p.world)
      await p.markSession()
      assert.equal(p.settingsOpens(), opens, show({ openBundle: p.world.openBundle, selectPanel: p.world.selectPanel }))
    })
  }
  caseTest('SET3-ST-04', 1, 'session marked → marked again, removed and set again: no further open (only the first mark counts)', async (t) => {
    const p = await entriesPage(t, { hash: ENTRIES.continuation })
    await p.markSession()
    const after = p.settingsOpens()
    await p.markSession(ENTRIES.again)
    p.world.html.removeAttribute(ENTRIES.sessionMark)
    await p.markSession()
    assert.equal(p.settingsOpens(), after)
  })
  for (const [row, hash] of ENTRIES.fragments) {
    caseTest('SET3-EP-05', row, `fragment ${show(hash)} → nothing opens, at load or at the session mark`, async (t) => {
      const p = await entriesPage(t, { hash })
      await p.markSession()
      assert.equal(p.settingsOpens(), 0, show({ openBundle: p.world.openBundle, selectPanel: p.world.selectPanel }))
    })
  }
  caseTest('SET3-EP-05', 'query', 'view=settings in the query, not the fragment → nothing opens', async (t) => {
    const p = await entriesPage(t, { base: ENTRIES.queryBase })
    await p.markSession()
    assert.equal(p.settingsOpens(), 0)
  })
  caseTest('SET3-UC-10', 'main 3', 'the entries read in the active locale: zh differs from en', async (t) => {
    const read = async (lang) => { const p = await entriesPage(t, { lang }); return (await p.page.headers()).map((h) => h.tree.map(textOf).join('') + JSON.stringify(findAll(h.tree, () => true).map((n) => n.props['aria-label'] ?? null))).join('|') }
    assert.notEqual(await read(ENTRIES.langs[1]), await read(ENTRIES.langs[0]))
  })
  caseTest('SET3-UC-10', 'A1', 'configForms missing: the Fishball-page entries still register; nothing fails', async (t) => {
    const p = await entriesPage(t, { omit: [ENTRIES.configForms] })
    const headers = await p.page.headers()
    for (const which of Object.values(ENTRIES.which)) assert.ok(headers.some((h) => p.page.byAttr(ENTRIES.hook, which, h.tree).length > 0), which)
    assert.deepEqual(p.world.failedFibers, [])
    assert.deepEqual(p.world.errors, [])
  })
  caseTest('SET3-UC-10', 'F-UI locale', `the entries read their words from the locale namespace ${ENTRIES.locale} (en and zh, same keys)`, async (t) => {
    const p = await entriesPage(t)
    const mine = p.world.localeRegistrations.filter((r) => r.ns === ENTRIES.locale)
    assert.ok(mine.length > 0, show(p.world.localeRegistrations.map((r) => r.ns)))
    for (const r of mine) assert.equal(JSON.stringify(Object.keys(r.dicts.zh ?? {}).sort()), JSON.stringify(Object.keys(r.dicts.en ?? {}).sort()))
    const entries = p.world.headerEntries().filter((e) => Object.values(ENTRIES.action).some((a) => a.id === e.options.id))
    assert.deepEqual(entries.map((e) => e.options.locale), entries.map(() => ENTRIES.locale))
  })
  for (const lang of ENTRIES.langs) {
    for (const which of Object.values(ENTRIES.which)) {
      const label = ENTRIES.labels[lang][which]
      caseTest('UIPF-ENTRY-EP-01', `${which} ${lang}`, `(${lang}) the ${which} entry: a button, icon only, aria-label ${show(label)}, Tooltip label equals it, side ${ENTRIES.side}`, async (t) => {
        const p = await entriesPage(t, { lang })
        const node = (await p.entry(which)).node()
        assert.equal(node.tag, ENTRIES.button)
        const svgs = subtree(node).filter((n) => n.tag === ENTRIES.svg)
        assert.equal(svgs.length, 1)
        assert.equal(String(svgs[0].props['aria-hidden']), DESIGN.hidden)
        assert.deepEqual(texts(node), [], 'icon only')
        assert.equal(node.props['aria-label'], label)
        assert.equal(node.props[STAND_IN.tooltip], label)
        assert.equal(node.props[STAND_IN.tooltipSide], ENTRIES.side)
        assert.match(String(svgs[0].props[STAND_IN.primitive]), ENTRIES.glyph[which])
      })
    }
  }
  caseTest('UIPF-ENTRY-EP-01', 'dsh haspopup', `the DSH entry keeps aria-haspopup="${ENTRIES.haspopup}"`, async (t) => {
    const p = await entriesPage(t)
    assert.equal((await p.entry(ENTRIES.which.dsh)).node().props['aria-haspopup'], ENTRIES.haspopup)
  })
  caseTest('UIPF-ENTRY-ST-01', 'tooltip', "an entry's Tooltip shows on hover with its label and goes on leave", async (t) => {
    const p = await entriesPage(t)
    const e = await p.entry(ENTRIES.which.fishball)
    const tips = () => p.page.find((n) => n.props.role === DESIGN.tooltipRole, p.page.all())
    assert.deepEqual(tips(), [])
    e.node().props.onMouseEnter?.({})
    await p.page.settled()
    assert.deepEqual(tips().map((n) => texts(n).join(' ')), [ENTRIES.labels.en.fishball])
    e.node().props.onMouseLeave?.({})
    await p.page.settled()
    assert.deepEqual(tips(), [])
  })
}
