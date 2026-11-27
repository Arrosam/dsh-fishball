/**
 * CHILD-PLUGINS page rows: DESIGN.md §28, R2–R5. In an instance-run child (the instance's child-side row
 * `dsh-instance-child` is in a launch overlay) fishball-core's patch runs fishball-ui's
 * fishball-child-plugins row, whose client hides DSH's own install entries on the Plugins page and shows
 * a notice; standalone it does not run and DSH's page is unchanged. R1 (which row runs, by mode) is
 * fishball-core's own (packages/core/tests/child-plugins); here the mode only decides whether the row's
 * client is on the page, as DSH would serve it.
 *
 * Requirements (the only source of the expected outcomes):
 * - R2 instance-run, DSH's Plugins page: Add plugin and its "Choose how to add a plugin" menu anchor
 *      hidden; the Discover tab and its panel hidden; every Uninstall and Update on a bundle page hidden;
 *      nothing on the Host refuses an install.
 * - R3 Discover the only extra tab: the tab bar hidden, except while Discover is selected (Installed
 *      stays reachable). Another contributed tab present: only Discover hides.
 * - R4 a notice at the top of the Plugins page toolbar, en / zh word for word, following the active
 *      UI language.
 * - R5 the hiding follows DSH's own words in the active language (switching keeps controls hidden).
 *
 * Level: integration, offline (./subject.mjs): DSH's dsh-app-boot composes core's patch with the launch
 * overlays and DSH's loader resolves the row; the row's public client runs in the scripted page after
 * DSH's real locale runtime and Plugins / Discover dictionaries; its sheets lie over a DOM drawn like
 * PluginManagerPage in headless Chromium. "Hidden" means Chromium's checkVisibility() is false.
 *
 * | Case | Req | Technique | Input / state | Expected |
 * |---|---|---|---|---|
 * | CP-R2-01 | R2 | EP | instance-run, en, Installed, loaded | Add plugin group, button, menu anchor hidden; Refresh, title, toolbar visible |
 * | CP-R2-02 | R2 | EP (state) | page not loaded (Add plugin disabled) | still hidden |
 * | CP-R2-03 | R2 | ST (menu open) | menu anchor aria-expanded=true | still hidden |
 * | CP-R2-04 | R2 | EP, 5 rows | bundle page: plain, scoped, quotes+backslash, CJK, not removable | Uninstall, Update hidden; crumb, title, switch, contributed action visible |
 * | CP-R2-05 | R2 | EP (control) | standalone (the row off), same DOM | every control visible, no notice |
 * | CP-R2-06 | R2 | EP | Host rows of plugin management, instance-run vs DSH alone | unchanged; the row's Node half reads no Host service |
 * | CP-R2-07 | R2 | DT, 12 rows | mode {instance-run, standalone} × page {head Update; + Update to; + Versions list} × busy {no, yes} | instance-run: every Update hidden; standalone: all visible; kept controls visible |
 * | CP-R2-08 | R2 | EP × language, 3 rows | instance-run, full page in zh, ja, en → zh | every Update hidden; kept controls visible |
 * | CP-R2-09 | R2 | BVA (look-alike) | contributed detail action reading "Update notes" (text) | visible; DSH's Update buttons hidden |
 * | CP-R3-01 | R3 | DT 1 | [Discover], Installed selected | bar hidden, Installed panel visible |
 * | CP-R3-02 | R3 | DT 2 | [Discover], Discover selected | bar and Installed visible; Discover tab and panel hidden |
 * | CP-R3-03…07 | R3 | DT 3–6, BVA | [Discover, other] on Installed / other / Discover; Discover last; three extra tabs | bar, Installed, others visible; only Discover hides |
 * | CP-R3-08 | R3 | DT 7 | [other] alone | bar and every tab visible |
 * | CP-R3-09 | R3 | BVA (look-alike id), 2 rows | '…-discover' alone, and beside Discover | look-alike and bar visible |
 * | CP-R3-10 | R3 | ST | [Discover]: Installed → Discover → Installed | bar hidden → visible → hidden |
 * | CP-R4-01 | R4 | EP | en | the en notice once |
 * | CP-R4-02 | R4 | EP | zh from the start | the zh notice, no en |
 * | CP-R4-03 | R4 | ST | en → zh → en | the notice follows each switch |
 * | CP-R4-04 | R4 | EP | ja (DSH's fallback ends in en) | the en notice, no zh |
 * | CP-R5-01 | R5 | EP | zh from the start | R2 controls hidden in zh markup |
 * | CP-R5-02 | R5 | ST | en → zh | hidden after the redraw |
 * | CP-R5-03 | R5 | ST | zh → en | hidden |
 * | CP-R5-04 | R5 | EP | ja | hidden; [Discover] on Installed: bar hidden |
 *
 * Not ported: CP-R2-09 "aria-label" (an accepted limit registered as a todo: a contributed button whose
 * aria-label starts with DSH's words hides too, DESIGN §28 "hidden by DSH's words") and CP-R4-05 (a todo:
 * the notice's place in the toolbar is not specified observably).
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { BUNDLES, CONTRIBUTED_UPDATE, DETAIL_ACTION, DSH, LANG, MODE, NOTICE, PAGE, TABS, VERSIONS } from './constants.mjs'
import { applyNodeHalf, childPage, composedWith, hostRows, launch, moduleClasses, pageBody, panelMark, show, tabMark, versionMark } from './subject.mjs'

const json = (value) => JSON.stringify(value)
const SKIP = 'no Chromium on this machine (set FBTEST_CHROME, or install the Playwright headless shell)'
const ADD = Object.freeze(['addGroup', 'addPrimary', 'addMore'])
const DETAIL_KEPT = Object.freeze(['crumb', 'detailTitle', 'switch', 'detailAction'])
/** R2 follow-up: a bundle page with every Update control DSH draws (the head's two and the Versions rows). */
const FULL_PAGE = Object.freeze({ headVersion: VERSIONS.head, versions: VERSIONS.newer.map((version) => ({ version })), installed: VERSIONS.installed })
const updateMarks = (pkg) => [...(pkg.headUpdate === false ? [] : ['update']), ...(pkg.headVersion === undefined ? [] : ['headVersion']), ...(pkg.versions ?? []).map((v) => versionMark(v.version))]
const discover = (words) => ({ id: DSH.discoverId, label: words.discover })
const fullPkg = (detailAction = DETAIL_ACTION) => ({ ...BUNDLES[0], ...FULL_PAGE, detailAction })

/** Draw one page state with the page's current words and sheets, and read what Chromium shows. */
async function view(page, lang, options = {}) {
  const words = page.words()
  const cls = moduleClasses(page.dshSheets())
  const tabs = (options.tabs ?? []).map((tab) => (tab === DSH.discoverId ? discover(words) : tab))
  const seen = await show(page.sheets(), pageBody({ t: words.t, cls, ...options, tabs }), lang)
  return { ...seen, notice: [seen.text, ...seen.generated].join('\n') }
}
const hidden = (seen, names, why) => { for (const name of names) assert.equal(seen.visible[name], false, why + ': ' + name + ' should be hidden; seen ' + json(seen.visible)) }
const shown = (seen, names, why) => { for (const name of names) assert.equal(seen.visible[name], true, why + ': ' + name + ' should be visible; seen ' + json(seen.visible)) }
const count = (text, part) => text.split(part).length - 1

/** The R2 list and detail controls in one language, as drawn by DSH in that language. */
async function assertInstallEntriesHidden(page, lang, why) {
  const list = await view(page, lang)
  hidden(list, ADD, why)
  shown(list, ['refresh', 'title'], why)
  const tabs = await view(page, lang, { tabs: [DSH.discoverId, TABS.other] })
  hidden(tabs, [tabMark(DSH.discoverId)], why)
  shown(tabs, ['tabs', tabMark(DSH.installedTab), tabMark(TABS.other.id)], why)
  const onDiscover = await view(page, lang, { tabs: [DSH.discoverId, TABS.other], selected: DSH.discoverId })
  hidden(onDiscover, [panelMark(DSH.discoverId)], why)
  const pkg = fullPkg()
  const detail = await view(page, lang, { view: 'detail', pkg })
  hidden(detail, ['uninstall', ...updateMarks(pkg)], why)
  shown(detail, DETAIL_KEPT, why)
}

export function registerChildPluginPageCases() {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const options = browser ? {} : { skip: SKIP }
  const cpTest = (id, row, title, fn) => caseTest(id, row, title, options, fn)
  /** The launch of one mode, checked: the composed row runs exactly in an instance-run child. */
  async function launched(t, mode) {
    const run = await launch(t, mode.overlays)
    assert.equal(run.runs, mode === MODE.instanceRun, 'precondition: core\'s patch runs fishball-child-plugins ' + (run.runs ? 'in' : 'outside') + ' ' + mode.name)
    return run
  }
  /** A page of one mode in `lang` (the row's client on it exactly when DSH runs the row). */
  const pageOf = async (t, lang, mode = MODE.instanceRun) => childPage(await launched(t, mode), { lang })
  const inJa = async (t) => { const page = await pageOf(t, LANG.en); page.addLanguage(LANG.ja); await page.setLang(LANG.ja.id); return page }

  // ---------------------------------------------------------------------------------------- R2
  cpTest('CP-R2-01', 'en list', 'instance-run: Add plugin, its group and its menu anchor are hidden; the rest of the toolbar is not', async (t) => {
    const seen = await view(await pageOf(t, LANG.en), LANG.en)
    hidden(seen, ADD, 'loaded list')
    shown(seen, ['refresh', 'title', PAGE.toolbarMarker], 'loaded list')
  })
  cpTest('CP-R2-02', 'not loaded', 'Add plugin stays hidden while the page is loading (disabled)', async (t) => {
    hidden(await view(await pageOf(t, LANG.en), LANG.en, { disabled: true }), ADD, 'loading list')
  })
  cpTest('CP-R2-03', 'menu open', 'the menu anchor stays hidden with its menu open', async (t) => {
    hidden(await view(await pageOf(t, LANG.en), LANG.en, { menuOpen: true }), ADD, 'menu open')
  })
  for (const pkg of BUNDLES) {
    cpTest('CP-R2-04', pkg.row, 'Uninstall is hidden on the bundle page; its other controls stay', async (t) => {
      const seen = await view(await pageOf(t, LANG.en), LANG.en, { view: 'detail', pkg: { ...pkg, detailAction: DETAIL_ACTION } })
      hidden(seen, ['uninstall', 'update'], pkg.title)
      shown(seen, DETAIL_KEPT, pkg.title)
    })
  }
  cpTest('CP-R2-05', 'standalone', 'without the row (standalone) the same page shows every control and no notice (the control row)', async (t) => {
    const page = await pageOf(t, LANG.en, MODE.standalone)
    const list = await view(page, LANG.en, { tabs: [DSH.discoverId] })
    shown(list, [...ADD, 'tabs', tabMark(DSH.discoverId)], 'standalone')
    assert.equal(count(list.notice, NOTICE.en), 0, 'standalone notice: ' + list.notice)
    shown(await view(page, LANG.en, { tabs: [DSH.discoverId], selected: DSH.discoverId }), [panelMark(DSH.discoverId)], 'standalone')
    const pkg = fullPkg()
    shown(await view(page, LANG.en, { view: 'detail', pkg }), ['uninstall', ...updateMarks(pkg), ...DETAIL_KEPT], 'standalone')
  })
  // Runs without Chromium: composition and the Node half only.
  caseTest('CP-R2-06', 'host', 'nothing on the Host refuses an install: DSH\'s plugin management rows are as DSH composes them, and the row\'s Node half reads no Host service', async (t) => {
    const { rows, rowDir } = await launched(t, MODE.instanceRun)
    assert.deepEqual(json(hostRows(rows)), json(hostRows(await composedWith())), 'plugin management rows changed')
    const { read } = await applyNodeHalf(rowDir)
    assert.deepEqual(read, [], 'the Node half read ' + json(read))
  })

  // R2 follow-up: the bundle page's Update controls (they run pnpm in the child), decision table.
  const PAGES = [
    ['head Update only', {}],
    ['head Update + Update to', { headVersion: VERSIONS.head }],
    ['head + Versions list', FULL_PAGE],
  ]
  for (const mode of [MODE.instanceRun, MODE.standalone]) {
    for (const [pageName, parts] of PAGES) {
      for (const busy of [false, true]) {
        const row = mode.name + ', ' + pageName + (busy ? ', busy' : '')
        cpTest('CP-R2-07', row, mode === MODE.instanceRun ? 'every Update button is hidden; the other controls stay' : 'standalone shows every Update button', async (t) => {
          const pkg = { ...BUNDLES[0], ...parts, busy, detailAction: DETAIL_ACTION }
          const seen = await view(await pageOf(t, LANG.en, mode), LANG.en, { view: 'detail', pkg })
          if (mode === MODE.instanceRun) hidden(seen, updateMarks(pkg), row)
          else shown(seen, updateMarks(pkg), row)
          shown(seen, DETAIL_KEPT, row)
        })
      }
    }
  }
  const languages = [
    ['zh', (t) => pageOf(t, LANG.zh), LANG.zh],
    ['ja', inJa, LANG.ja.id],
    ['en → zh', async (t) => { const page = await pageOf(t, LANG.en); await page.setLang(LANG.zh); return page }, LANG.zh],
  ]
  for (const [row, open, lang] of languages) {
    cpTest('CP-R2-08', row, 'the Update buttons are hidden in DSH\'s words of the active language', async (t) => {
      const pkg = fullPkg()
      const seen = await view(await open(t), lang, { view: 'detail', pkg })
      hidden(seen, updateMarks(pkg), row)
      shown(seen, DETAIL_KEPT, row)
    })
  }
  cpTest('CP-R2-09', 'text only', 'a contributed action reading "Update notes" stays visible', async (t) => {
    const pkg = fullPkg(CONTRIBUTED_UPDATE)
    const seen = await view(await pageOf(t, LANG.en), LANG.en, { view: 'detail', pkg })
    shown(seen, DETAIL_KEPT, 'text only')
    hidden(seen, updateMarks(pkg), 'text only')
  })

  // ---------------------------------------------------------------------------------------- R3
  const bar = (seen, visible, why) => assert.equal(seen.visible.tabs, visible, why + ': tab bar ' + (visible ? 'visible' : 'hidden') + '; seen ' + json(seen.visible))
  cpTest('CP-R3-01', '[Discover] on Installed', 'Discover the only extra tab, Installed selected: the tab bar is hidden', async (t) => {
    const seen = await view(await pageOf(t, LANG.en), LANG.en, { tabs: [DSH.discoverId] })
    bar(seen, false, 'rule 1')
    shown(seen, [panelMark(DSH.installedTab)], 'rule 1')
  })
  cpTest('CP-R3-02', '[Discover] on Discover', 'Discover selected: the bar and Installed stay reachable; Discover and its panel are hidden', async (t) => {
    const seen = await view(await pageOf(t, LANG.en), LANG.en, { tabs: [DSH.discoverId], selected: DSH.discoverId })
    bar(seen, true, 'rule 2')
    shown(seen, [tabMark(DSH.installedTab)], 'rule 2')
    hidden(seen, [tabMark(DSH.discoverId), panelMark(DSH.discoverId)], 'rule 2')
  })
  const withOther = [
    ['03', 'on Installed', [DSH.discoverId, TABS.other], DSH.installedTab],
    ['04', 'on the other tab', [DSH.discoverId, TABS.other], TABS.other.id],
    ['05', 'on Discover', [DSH.discoverId, TABS.other], DSH.discoverId],
    ['06', 'Discover last', [TABS.other, DSH.discoverId], DSH.installedTab],
    ['07', 'three extra tabs', [DSH.discoverId, TABS.other, TABS.other2], DSH.installedTab],
  ]
  for (const [row, title, tabs, selected] of withOther) {
    cpTest('CP-R3-' + row, title, 'another contributed tab present: only Discover hides', async (t) => {
      const seen = await view(await pageOf(t, LANG.en), LANG.en, { tabs, selected })
      bar(seen, true, title)
      const others = tabs.filter((tab) => tab !== DSH.discoverId).map((tab) => tabMark(tab.id))
      shown(seen, [tabMark(DSH.installedTab), ...others], title)
      hidden(seen, [tabMark(DSH.discoverId)], title)
      if (selected === DSH.discoverId) hidden(seen, [panelMark(DSH.discoverId)], title)
      else shown(seen, [panelMark(selected)], title)
    })
  }
  cpTest('CP-R3-08', '[other] alone', 'no Discover: the bar and every tab stay', async (t) => {
    const seen = await view(await pageOf(t, LANG.en), LANG.en, { tabs: [TABS.other] })
    bar(seen, true, 'rule 7')
    shown(seen, [tabMark(DSH.installedTab), tabMark(TABS.other.id)], 'rule 7')
  })
  for (const [row, tabs] of [['alone', [TABS.nearMiss]], ['beside Discover', [DSH.discoverId, TABS.nearMiss]]]) {
    cpTest('CP-R3-09', row, 'a contributed tab whose id ends in "-discover" is not Discover: it and the bar stay', async (t) => {
      const seen = await view(await pageOf(t, LANG.en), LANG.en, { tabs })
      bar(seen, true, row)
      shown(seen, [tabMark(TABS.nearMiss.id)], row)
      if (tabs.includes(DSH.discoverId)) hidden(seen, [tabMark(DSH.discoverId)], row)
    })
  }
  cpTest('CP-R3-10', 'Installed → Discover → Installed', 'the bar shows only while Discover is selected', async (t) => {
    const page = await pageOf(t, LANG.en)
    const states = []
    for (const selected of [DSH.installedTab, DSH.discoverId, DSH.installedTab]) states.push((await view(page, LANG.en, { tabs: [DSH.discoverId], selected })).visible.tabs)
    assert.deepEqual(states, [false, true, false])
  })

  // ---------------------------------------------------------------------------------------- R4
  const notices = (seen) => ({ en: count(seen.notice, NOTICE.en), zh: count(seen.notice, NOTICE.zh) })
  const ONLY_EN = Object.freeze({ en: 1, zh: 0 })
  const ONLY_ZH = Object.freeze({ en: 0, zh: 1 })
  cpTest('CP-R4-01', 'en', 'the toolbar shows the English notice once', async (t) => {
    assert.deepEqual(notices(await view(await pageOf(t, LANG.en), LANG.en)), ONLY_EN)
  })
  cpTest('CP-R4-02', 'zh', 'in Chinese from the start the toolbar shows the Chinese notice', async (t) => {
    assert.deepEqual(notices(await view(await pageOf(t, LANG.zh), LANG.zh)), ONLY_ZH)
  })
  cpTest('CP-R4-03', 'en → zh → en', 'the notice follows each language switch', async (t) => {
    const page = await pageOf(t, LANG.en)
    const seen = [notices(await view(page, LANG.en))]
    await page.setLang(LANG.zh)
    seen.push(notices(await view(page, LANG.zh)))
    await page.setLang(LANG.en)
    seen.push(notices(await view(page, LANG.en)))
    assert.deepEqual(seen, [ONLY_EN, ONLY_ZH, ONLY_EN])
  })
  cpTest('CP-R4-04', 'ja', 'a language without its own notice shows DSH\'s fallback (en), not Chinese', async (t) => {
    assert.deepEqual(notices(await view(await inJa(t), LANG.ja.id)), ONLY_EN)
  })

  // ---------------------------------------------------------------------------------------- R5
  cpTest('CP-R5-01', 'zh', 'in Chinese from the start the install entries are hidden in Chinese markup', async (t) => {
    await assertInstallEntriesHidden(await pageOf(t, LANG.zh), LANG.zh, 'zh')
  })
  cpTest('CP-R5-02', 'en → zh', 'after switching to Chinese the redrawn page keeps them hidden', async (t) => {
    const page = await pageOf(t, LANG.en)
    await page.setLang(LANG.zh)
    await assertInstallEntriesHidden(page, LANG.zh, 'en → zh')
  })
  cpTest('CP-R5-03', 'zh → en', 'after switching back to English they stay hidden', async (t) => {
    const page = await pageOf(t, LANG.zh)
    await page.setLang(LANG.en)
    await assertInstallEntriesHidden(page, LANG.en, 'zh → en')
  })
  cpTest('CP-R5-04', 'ja', 'in a further language DSH has words for (ja) they are hidden in its markup', async (t) => {
    const page = await inJa(t)
    await assertInstallEntriesHidden(page, LANG.ja.id, 'ja')
    const only = await view(page, LANG.ja.id, { tabs: [DSH.discoverId] })
    assert.equal(only.visible.tabs, false, 'ja: [Discover] on Installed: tab bar hidden; seen ' + json(only.visible))
  })
}
