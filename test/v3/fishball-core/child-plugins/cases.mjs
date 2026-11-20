/**
 * CHILD-PLUGINS black-box cases: DESIGN.md §28, the fishball-core part. In an instance-run child
 * (the instance's child-side row 'dsh-instance-child' is in a launch overlay) only the main DSH
 * installs, so core switches its rows by mode and hides DSH's own install entries with a notice.
 *
 * Requirements (the only source of the expected outcomes):
 * - R1 instance-run: fishball-child-plugins on, fishball-recommend-plugins off; standalone (no such
 *      overlay row): the reverse.
 * - R2 instance-run, DSH's Plugins page: Add plugin and its "Choose how to add a plugin" menu anchor
 *      hidden; the Discover tab and its panel hidden; every Uninstall on a bundle page hidden;
 *      nothing on the Host refuses an install.
 * - R3 Discover the only extra tab: the tab bar hidden, except while Discover is selected (Installed
 *      stays reachable). Another contributed tab present: only Discover hides.
 * - R4 a notice at the top of the Plugins page toolbar, en / zh word for word, following the active
 *      UI language.
 * - R5 the hiding follows DSH's own words in the active language (switching keeps controls hidden).
 *
 * Levels: integration, offline. R1 composes with the SDK's own dsh-app-boot and resolves each row
 * with its own loader; R2-R5 run the row's public client in the scripted page after DSH's real
 * locale runtime and dictionaries, and lay the produced sheets over a DOM drawn like DSH's
 * PluginManagerPage markup in a headless Chromium (subject.mjs). "Hidden" means Chromium's
 * checkVisibility() is false.
 *
 * | Case    | Req | Technique              | Input / state                                                        | Expected |
 * |---------|-----|------------------------|----------------------------------------------------------------------|----------|
 * | CP-R1-01 | R1 | DT rule 1, EP          | no launch overlay                                                    | child off, recommend on |
 * | CP-R1-02 | R1 | DT rule 2, EP          | one overlay inserting dsh-instance-child                             | child on, recommend off |
 * | CP-R1-03 | R1 | EP                     | overlay inserting only an unrelated row                              | standalone |
 * | CP-R1-04 | R1 | EP                     | overlay inserting the child row among others (last)                  | instance-run |
 * | CP-R1-05 | R1 | EP                     | two overlay files, only the second inserts the child row             | instance-run |
 * | CP-R1-06 | R1 | BVA (empty)            | an overlay file with no patch                                        | standalone |
 * | CP-R1-07 | R1 | BVA (near miss), 4 rows| dsh-instance, dsh-instance-child-extra, xdsh-instance-child, upper case | standalone |
 * | CP-R1-08 | R1 | BVA (no context)       | no profileContext (not a dsh-launched profile)                       | standalone |
 * | CP-R1-09 | R1 | EP (exclusive)         | both modes                                                           | each row composed once; exactly one of the two on |
 * | CP-R2-01 | R2 | EP                     | instance-run, en, Installed, loaded                                  | Add plugin group, button and menu anchor hidden; Refresh, title visible |
 * | CP-R2-02 | R2 | EP (state)             | page not loaded (Add plugin disabled)                                | still hidden |
 * | CP-R2-03 | R2 | ST (menu open)         | menu anchor aria-expanded=true                                       | still hidden |
 * | CP-R2-04 | R2 | EP, 5 rows             | bundle page: plain, scoped, quotes+backslash, CJK title, not removable (disabled) | Uninstall and Update hidden; crumb, title, switch, contributed action visible |
 * | CP-R2-05 | R2 | EP (control)           | standalone (no row), same DOM                                        | every control visible, no notice |
 * | CP-R2-07 | R2 | DT (Update controls), 12 rows | mode {instance-run, standalone} × page {head Update only; head Update + "Update to {v}"; + Versions list (3 newer rows)} × busy {no, yes} | instance-run: every Update / Update-to button hidden; standalone: all visible; both: crumb, title, switch, contributed action visible |
 * | CP-R2-08 | R2 | EP × language, 3 rows | instance-run, full page (head Update, head Update-to, Versions list) drawn in zh, ja, and after en → zh | every Update button hidden; kept controls visible |
 * | CP-R2-09 | R2 | BVA (look-alike), 2 rows | contributed detail action reading "Update notes": as its text only, and as its aria-label | text only: contributed action visible, DSH's Update buttons hidden; aria-label: todo, accepted limit (a label starting with DSH's words hides too) |
 * | CP-R2-06 | R2 | EP                     | Host rows of plugin management, instance-run vs DSH alone            | unchanged; the row's Node half reads no Host service |
 * | CP-R3-01 | R3 | DT 1                   | tabs [Discover], Installed selected                                  | tab bar hidden, Installed panel visible |
 * | CP-R3-02 | R3 | DT 2, ST               | tabs [Discover], Discover selected                                   | bar and Installed tab visible; Discover tab and panel hidden |
 * | CP-R3-03 | R3 | DT 3                   | [Discover, other], Installed selected                                | bar, Installed, other visible; Discover hidden |
 * | CP-R3-04 | R3 | DT 4                   | [Discover, other], other selected                                    | as 03, other panel visible |
 * | CP-R3-05 | R3 | DT 5                   | [Discover, other], Discover selected                                 | bar visible; Discover tab, panel hidden |
 * | CP-R3-06 | R3 | DT 6                   | [other, Discover] (Discover last)                                    | only Discover hides |
 * | CP-R3-07 | R3 | BVA (3 extra tabs)     | [Discover, other, other2]                                            | only Discover hides |
 * | CP-R3-08 | R3 | DT 7                   | [other] alone                                                        | bar and all tabs visible |
 * | CP-R3-09 | R3 | BVA (look-alike id)    | [look-alike '…-discover'] alone, and beside Discover                 | look-alike tab and bar visible |
 * | CP-R3-10 | R3 | ST                     | [Discover]: Installed → Discover → Installed                         | bar hidden → visible → hidden |
 * | CP-R4-01 | R4 | EP                     | en                                                                   | toolbar shows the en notice once |
 * | CP-R4-02 | R4 | EP                     | zh from the start                                                    | toolbar shows the zh notice, no en notice |
 * | CP-R4-03 | R4 | ST                     | en → zh → en                                                         | notice follows each switch, one notice |
 * | CP-R4-04 | R4 | EP (other language)    | ja (DSH's fallback chain ends in en)                                 | the en notice (DSH's fallback), no zh |
 * | CP-R4-05 | R4 | position               | notice "at the top" of the toolbar                                   | todo: placement within the toolbar is not specified observably |
 * | CP-R5-01 | R5 | EP                     | zh from the start, zh-drawn page                                     | R2 controls hidden |
 * | CP-R5-02 | R5 | ST                     | en → zh, page redrawn in zh                                          | R2 controls hidden, Uninstall hidden |
 * | CP-R5-03 | R5 | ST                     | zh → en                                                              | R2 controls hidden |
 * | CP-R5-04 | R5 | EP (other language)    | ja, page drawn in DSH's ja words                                     | Add plugin, anchor, Discover, Uninstall hidden; R3 rules hold |
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { stopBrowser } from '../../fishball-ui/contrast/page.mjs'
import { composedWith } from '../../fishball-ui/package/subject.mjs'
import { BUNDLES, DETAIL_ACTION, DSH, LANG, NOTICE, PAGE, ROWS, TABS, VERSIONS } from './constants.mjs'
import { applyNodeHalf, childPage, hostRows, launch, moduleClasses, pageBody, panelMark, show, tabMark, versionMark } from './subject.mjs'

const json = (value) => JSON.stringify(value)
/** R2-09: a contributed detail action whose words begin like DSH's Update label (BVA look-alike). */
const CONTRIBUTED_UPDATE = 'Update notes'
const ADD = Object.freeze(['addGroup', 'addPrimary', 'addMore'])
const DETAIL_KEPT = Object.freeze(['crumb', 'detailTitle', 'switch', 'detailAction'])
/** R2 follow-up: a bundle page with every Update control DSH draws (the head's two and the Versions rows). */
const FULL_PAGE = Object.freeze({ headVersion: VERSIONS.head, versions: VERSIONS.newer.map((version) => ({ version })), installed: VERSIONS.installed })
const updateMarks = (pkg) => [...(pkg.headUpdate === false ? [] : ['update']), ...(pkg.headVersion === undefined ? [] : ['headVersion']), ...(pkg.versions ?? []).map((v) => versionMark(v.version))]
const discover = (words) => ({ id: DSH.discoverId, label: words.discover })

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
  const pkg = { ...BUNDLES[0], ...FULL_PAGE, detailAction: DETAIL_ACTION }
  const detail = await view(page, lang, { view: 'detail', pkg })
  hidden(detail, ['uninstall', ...updateMarks(pkg)], why)
  shown(detail, DETAIL_KEPT, why)
}

export function registerChildPluginCases(sdk) {
  after(stopBrowser)
  const mode = (on) => ({ child: on, recommend: !on })
  const INSTANCE_RUN = mode(true)
  const STANDALONE = mode(false)

  // ---------------------------------------------------------------------------------------- R1
  const r1 = [
    ['01', 'no launch overlay', [], STANDALONE],
    ['02', 'one overlay inserting dsh-instance-child', [[ROWS.instanceChild]], INSTANCE_RUN],
    ['03', 'an overlay inserting only an unrelated row', [[ROWS.other]], STANDALONE],
    ['04', 'the child row among other inserted rows', [[ROWS.other, ROWS.instanceChild]], INSTANCE_RUN],
    ['05', 'two overlay files, the second inserts the child row', [[ROWS.other], [ROWS.instanceChild]], INSTANCE_RUN],
    ['06', 'an overlay file with no patch', [[]], STANDALONE],
  ]
  for (const [row, title, overlays, expected] of r1) {
    caseTest(sdk, 'CP-R1-' + row, 'mode', title, async (t) => {
      const { on } = await launch(t, sdk, overlays)
      assert.deepEqual(on, expected, title + ': ' + json(on))
    })
  }
  for (const id of ROWS.nearMisses) {
    caseTest(sdk, 'CP-R1-07', id, 'an overlay row id next to dsh-instance-child is standalone', async (t) => {
      const { on } = await launch(t, sdk, [[id]])
      assert.deepEqual(on, STANDALONE, id + ': ' + json(on))
    })
  }
  caseTest(sdk, 'CP-R1-08', 'no profileContext', 'a context outside a dsh-launched profile is standalone', async (t) => {
    const { on } = await launch(t, sdk, [], { noProfileContext: true })
    assert.deepEqual(on, STANDALONE, json(on))
  })
  caseTest(sdk, 'CP-R1-09', 'exclusive', 'each row is composed once and exactly one of them runs, in both modes', async (t) => {
    for (const overlays of [[], [[ROWS.instanceChild]]]) {
      const { on, count: n } = await launch(t, sdk, overlays)
      assert.deepEqual(n, { child: 1, recommend: 1 }, 'composed rows ' + json(n))
      assert.notEqual(on.child, on.recommend, json(on))
    }
  })

  // ---------------------------------------------------------------------------------------- R2
  caseTest(sdk, 'CP-R2-01', 'en list', 'instance-run: Add plugin, its group and its menu anchor are hidden; the rest of the toolbar is not', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const seen = await view(page, LANG.en)
    hidden(seen, ADD, 'loaded list')
    shown(seen, ['refresh', 'title', PAGE.toolbarMarker], 'loaded list')
  })
  caseTest(sdk, 'CP-R2-02', 'not loaded', 'Add plugin stays hidden while the page is loading (disabled)', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    hidden(await view(page, LANG.en, { disabled: true }), ADD, 'loading list')
  })
  caseTest(sdk, 'CP-R2-03', 'menu open', 'the menu anchor stays hidden with its menu open', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    hidden(await view(page, LANG.en, { menuOpen: true }), ADD, 'menu open')
  })
  for (const pkg of BUNDLES) {
    caseTest(sdk, 'CP-R2-04', pkg.row, 'Uninstall is hidden on the bundle page; its other controls stay', async () => {
      const page = await childPage(sdk, { lang: LANG.en })
      const seen = await view(page, LANG.en, { view: 'detail', pkg: { ...pkg, detailAction: DETAIL_ACTION } })
      hidden(seen, ['uninstall', 'update'], pkg.title)
      shown(seen, DETAIL_KEPT, pkg.title)
    })
  }
  caseTest(sdk, 'CP-R2-05', 'standalone', 'without the row the same page shows every control and no notice (the control row)', async () => {
    const page = await childPage(sdk, { lang: LANG.en, withRow: false })
    const list = await view(page, LANG.en, { tabs: [DSH.discoverId] })
    shown(list, [...ADD, 'tabs', tabMark(DSH.discoverId)], 'standalone')
    assert.equal(count(list.notice, NOTICE.en), 0, 'standalone notice: ' + list.notice)
    shown(await view(page, LANG.en, { tabs: [DSH.discoverId], selected: DSH.discoverId }), [panelMark(DSH.discoverId)], 'standalone')
    const pkg = { ...BUNDLES[0], ...FULL_PAGE, detailAction: DETAIL_ACTION }
    shown(await view(page, LANG.en, { view: 'detail', pkg }), ['uninstall', ...updateMarks(pkg), ...DETAIL_KEPT], 'standalone')
  })
  caseTest(sdk, 'CP-R2-06', 'host', 'nothing on the Host refuses an install: DSH\'s plugin management rows are as DSH composes them, and the row\'s Node half reads no Host service', async (t) => {
    const { rows } = await launch(t, sdk, [[ROWS.instanceChild]])
    const alone = await composedWith(sdk)
    assert.deepEqual(json(hostRows(rows)), json(hostRows(alone)), 'plugin management rows changed')
    const { read } = await applyNodeHalf()
    assert.deepEqual(read, [], 'the Node half read ' + json(read))
  })

  // R2 follow-up: the bundle page's Update controls (they run pnpm in the child), decision table.
  const PAGES = [
    ['head Update only', {}],
    ['head Update + Update to', { headVersion: VERSIONS.head }],
    ['head + Versions list', FULL_PAGE],
  ]
  for (const [instanceRun, modeName] of [[true, 'instance-run'], [false, 'standalone']]) {
    for (const [pageName, parts] of PAGES) {
      for (const busy of [false, true]) {
        const row = modeName + ', ' + pageName + (busy ? ', busy' : '')
        caseTest(sdk, 'CP-R2-07', row, instanceRun ? 'every Update button is hidden; the other controls stay' : 'standalone shows every Update button', async () => {
          const page = await childPage(sdk, { lang: LANG.en, withRow: instanceRun })
          const pkg = { ...BUNDLES[0], ...parts, busy, detailAction: DETAIL_ACTION }
          const seen = await view(page, LANG.en, { view: 'detail', pkg })
          if (instanceRun) hidden(seen, updateMarks(pkg), row)
          else shown(seen, updateMarks(pkg), row)
          shown(seen, DETAIL_KEPT, row)
        })
      }
    }
  }
  const languages = [
    ['zh', async () => childPage(sdk, { lang: LANG.zh }), LANG.zh],
    ['ja', async () => { const page = await childPage(sdk, { lang: LANG.en }); page.addLanguage(LANG.ja); await page.setLang(LANG.ja.id); return page }, LANG.ja.id],
    ['en → zh', async () => { const page = await childPage(sdk, { lang: LANG.en }); await page.setLang(LANG.zh); return page }, LANG.zh],
  ]
  for (const [row, open, lang] of languages) {
    caseTest(sdk, 'CP-R2-08', row, 'the Update buttons are hidden in DSH\'s words of the active language', async () => {
      const page = await open()
      const pkg = { ...BUNDLES[0], ...FULL_PAGE, detailAction: DETAIL_ACTION }
      const seen = await view(page, lang, { view: 'detail', pkg })
      hidden(seen, updateMarks(pkg), row)
      shown(seen, DETAIL_KEPT, row)
    })
  }
  caseTest(sdk, 'CP-R2-09', 'text only', 'a contributed action reading "Update notes" stays visible', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const pkg = { ...BUNDLES[0], ...FULL_PAGE, detailAction: CONTRIBUTED_UPDATE }
    const seen = await view(page, LANG.en, { view: 'detail', pkg })
    shown(seen, DETAIL_KEPT, 'text only')
    hidden(seen, updateMarks(pkg), 'text only')
  })
  // Accepted limit (the lead, 2026-11-20, DESIGN.md §28 "hidden by DSH's words"): the rule matches DSH's label
  // templates by their words, so a contributed button whose aria-label starts the same way hides too.
  caseTest(sdk, 'CP-R2-09', 'aria-label', 'a contributed action labelled "Update notes" stays visible', undefined,
    'accepted limit, not a defect: the hide rule matches DSH\'s label templates by their words ("Update …", "Uninstall …"), so a contributed button whose aria-label starts with the same words is hidden too (DESIGN.md §28, hiding by DSH\'s words accepted by the user)')

  // ---------------------------------------------------------------------------------------- R3
  const bar = (seen, visible, why) => assert.equal(seen.visible.tabs, visible, why + ': tab bar ' + (visible ? 'visible' : 'hidden') + '; seen ' + json(seen.visible))
  caseTest(sdk, 'CP-R3-01', '[Discover] on Installed', 'Discover the only extra tab, Installed selected: the tab bar is hidden', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const seen = await view(page, LANG.en, { tabs: [DSH.discoverId] })
    bar(seen, false, 'rule 1')
    shown(seen, [panelMark(DSH.installedTab)], 'rule 1')
  })
  caseTest(sdk, 'CP-R3-02', '[Discover] on Discover', 'Discover selected: the bar and Installed stay reachable; Discover and its panel are hidden', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const seen = await view(page, LANG.en, { tabs: [DSH.discoverId], selected: DSH.discoverId })
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
    caseTest(sdk, 'CP-R3-' + row, title, 'another contributed tab present: only Discover hides', async () => {
      const page = await childPage(sdk, { lang: LANG.en })
      const seen = await view(page, LANG.en, { tabs, selected })
      bar(seen, true, title)
      const others = tabs.filter((tab) => tab !== DSH.discoverId).map((tab) => tabMark(tab.id))
      shown(seen, [tabMark(DSH.installedTab), ...others], title)
      hidden(seen, [tabMark(DSH.discoverId)], title)
      if (selected === DSH.discoverId) hidden(seen, [panelMark(DSH.discoverId)], title)
      else shown(seen, [panelMark(selected)], title)
    })
  }
  caseTest(sdk, 'CP-R3-08', '[other] alone', 'no Discover: the bar and every tab stay', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const seen = await view(page, LANG.en, { tabs: [TABS.other] })
    bar(seen, true, 'rule 7')
    shown(seen, [tabMark(DSH.installedTab), tabMark(TABS.other.id)], 'rule 7')
  })
  for (const [row, tabs] of [['alone', [TABS.nearMiss]], ['beside Discover', [DSH.discoverId, TABS.nearMiss]]]) {
    caseTest(sdk, 'CP-R3-09', row, 'a contributed tab whose id ends in "-discover" is not Discover: it and the bar stay', async () => {
      const page = await childPage(sdk, { lang: LANG.en })
      const seen = await view(page, LANG.en, { tabs })
      bar(seen, true, row)
      shown(seen, [tabMark(TABS.nearMiss.id)], row)
      if (tabs.includes(DSH.discoverId)) hidden(seen, [tabMark(DSH.discoverId)], row)
    })
  }
  caseTest(sdk, 'CP-R3-10', 'Installed → Discover → Installed', 'the bar shows only while Discover is selected', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const states = []
    for (const selected of [DSH.installedTab, DSH.discoverId, DSH.installedTab]) states.push((await view(page, LANG.en, { tabs: [DSH.discoverId], selected })).visible.tabs)
    assert.deepEqual(states, [false, true, false])
  })

  // ---------------------------------------------------------------------------------------- R4
  const notices = (seen) => ({ en: count(seen.notice, NOTICE.en), zh: count(seen.notice, NOTICE.zh) })
  caseTest(sdk, 'CP-R4-01', 'en', 'the toolbar shows the English notice once', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    assert.deepEqual(notices(await view(page, LANG.en)), { en: 1, zh: 0 })
  })
  caseTest(sdk, 'CP-R4-02', 'zh', 'in Chinese from the start the toolbar shows the Chinese notice', async () => {
    const page = await childPage(sdk, { lang: LANG.zh })
    assert.deepEqual(notices(await view(page, LANG.zh)), { en: 0, zh: 1 })
  })
  caseTest(sdk, 'CP-R4-03', 'en → zh → en', 'the notice follows each language switch', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    const seen = [notices(await view(page, LANG.en))]
    await page.setLang(LANG.zh)
    seen.push(notices(await view(page, LANG.zh)))
    await page.setLang(LANG.en)
    seen.push(notices(await view(page, LANG.en)))
    assert.deepEqual(seen, [{ en: 1, zh: 0 }, { en: 0, zh: 1 }, { en: 1, zh: 0 }])
  })
  caseTest(sdk, 'CP-R4-04', 'ja', 'a language without its own notice shows DSH\'s fallback (en), not Chinese', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    page.addLanguage(LANG.ja)
    await page.setLang(LANG.ja.id)
    assert.deepEqual(notices(await view(page, LANG.ja.id)), { en: 1, zh: 0 })
  })
  caseTest(sdk, 'CP-R4-05', 'position', 'the notice is at the top of the toolbar', undefined,
    'R4 names the place ("at the top of the Plugins page toolbar", "where Add plugin was") but no observable order or geometry to assert without the implementation\'s layout choice; the rows check it is inside the visible toolbar')

  // ---------------------------------------------------------------------------------------- R5
  caseTest(sdk, 'CP-R5-01', 'zh', 'in Chinese from the start the install entries are hidden in Chinese markup', async () => {
    await assertInstallEntriesHidden(await childPage(sdk, { lang: LANG.zh }), LANG.zh, 'zh')
  })
  caseTest(sdk, 'CP-R5-02', 'en → zh', 'after switching to Chinese the redrawn page keeps them hidden', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    await page.setLang(LANG.zh)
    await assertInstallEntriesHidden(page, LANG.zh, 'en → zh')
  })
  caseTest(sdk, 'CP-R5-03', 'zh → en', 'after switching back to English they stay hidden', async () => {
    const page = await childPage(sdk, { lang: LANG.zh })
    await page.setLang(LANG.en)
    await assertInstallEntriesHidden(page, LANG.en, 'zh → en')
  })
  caseTest(sdk, 'CP-R5-04', 'ja', 'in a further language DSH has words for (ja) they are hidden in its markup', async () => {
    const page = await childPage(sdk, { lang: LANG.en })
    page.addLanguage(LANG.ja)
    await page.setLang(LANG.ja.id)
    await assertInstallEntriesHidden(page, LANG.ja.id, 'ja')
    const only = await view(page, LANG.ja.id, { tabs: [DSH.discoverId] })
    assert.equal(only.visible.tabs, false, 'ja: [Discover] on Installed: tab bar hidden; seen ' + json(only.visible))
  })
}