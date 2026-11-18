/**
 * UI-POLISH-F §1 black-box rows: the Fishball page navigation as an icon toolbar
 * (.runtime/reports/ui-polish-f/SPEC.md §1). Component level over nav-page.mjs (the real
 * fishball-page client, the SDK's real shortcut service, DSH primitive stand-ins).
 *
 * Techniques:
 * - EP UIPF-NAV-EP-01: control (settings, fishball, plugins, retry) × language (en, zh) → icon only
 *   (one `<svg aria-hidden="true">`, no text node), aria-label, Tooltip label = aria-label;
 * - Decision table UIPF-NAV-DT-01: what the page shows (no status / unavailable / failed / pending)
 *   × language → status text, `data-fishball-nav-status`, StateDot, Retry presence and the order;
 * - BVA UIPF-NAV-BVA-01: Settings `settingsOpen` false / true → `aria-expanded`; shortcut keys
 *   absent / two keys → the Settings tooltip shows none / them;
 * - State transition UIPF-NAV-ST-01: Tooltip hidden → shown (hover or focus) → hidden (leave or blur);
 *   UIPF-NAV-ST-02 pending → released: the status and Retry go;
 * - Use case UIPF-NAV-UC-01: each control does what it did (Settings opens DSH Settings, Retry retries).
 *
 * Re-baselined (MULTI-3 requirement F, PLAN-MULTI §6.4): the tray and its Fishball / Plugins buttons
 * are removed (those rows stay listed, withdrawn); the Settings launcher, the status and Retry are
 * looked up page-wide. New: MULTI-NAV-EP-01 (no tray), MULTI-NAV-EP-02 (status visible at 390 / 1280px),
 * MULTI-NAV-ST-01 (no forced drawer close), MULTI-NAV-DT-01 (sidebar.left.toggle no longer remapped).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { navPage } from './nav-page.mjs'
import { NAV, NAV_PAGE } from './polish-constants.mjs'
import { WITHDRAWN } from '../model-dialog/targets-constants.mjs'
import { withdrawnRow } from '../model-dialog/withdrawn.mjs'

const show = (v) => JSON.stringify(v)
const LANGS = NAV_PAGE.langs
const STATUSES = Object.freeze({
  unavailable: Object.freeze({ openFails: Number.MAX_SAFE_INTEGER }),
  failed: Object.freeze({ failEdits: true }),
  pending: Object.freeze({ holdConfig: true }),
})
/** Subtree of `node` (itself included). */
const below = (node) => [node, ...(node.children ?? []).filter((c) => typeof c !== 'string').flatMap(below)]
/** Every text node under `node`, trimmed, non-empty. */
const texts = (node) => (typeof node === 'string' ? [node.trim()].filter(Boolean) : (node.children ?? []).flatMap(texts))
/**
 * Re-baselined (MULTI-3 requirement F): Fishball's own tray (nav.fishball-page-navigation with
 * Fishball / Plugins) is removed; the Settings launcher, the status and Retry remain on the page,
 * wherever they are drawn, so they are looked up page-wide by their hooks.
 */
const controls = (page) => page.nodes().filter((n) => n.tag === 'button' && n.props[NAV.hook] !== undefined)
const control = (page, which) => controls(page).find((n) => n.props[NAV.hook] === which)
const launcher = (page) => page.nodes().find((n) => n.tag === 'button' && String(n.props.className ?? '').split(' ').includes(NAV.launcherClass))
/** The page's status items: the status by 'status', Retry by 'retry'. */
const statusItems = (page) => page.nodes().flatMap((n) => (n.props[NAV.statusHook] !== undefined ? ['status'] : n.tag === 'button' && n.props[NAV.hook] === NAV.retry ? [NAV.retry] : []))
/** The status's accessible text: its own text, else its aria-label (a small status control). */
const statusText = (node) => texts(node).join(' ') || node.props['aria-label'] || ''
const tooltips = (page) => page.nodes().filter((n) => n.props.role === 'tooltip')

/** One control is an icon button: one svg aria-hidden, no text node, the aria-label, a Tooltip with the same label. */
function assertIconButton(node, label, why) {
  assert.ok(node, `${why}: no button`)
  const svgs = below(node).filter((n) => n.tag === 'svg')
  assert.equal(svgs.length, 1, `${why}: ${svgs.length} svg elements, one expected`)
  assert.equal(String(svgs[0].props['aria-hidden']), 'true', `${why}: the svg is not aria-hidden="true"`)
  assert.deepEqual(texts(node), [], `${why}: the button holds text ${show(texts(node))} (icon only)`)
  assert.equal(node.props['aria-label'], label, `${why}: aria-label`)
  assert.equal(node.props[STAND_IN.tooltip], label, `${why}: the Tooltip label is not the aria-label (or no DSH Tooltip wraps it)`)
}

export function registerNavCases(sdk) {
  for (const mode of ['known-parent', 'no-ancestor-origin', 'standalone']) {
    caseTest(sdk, 'FRAME-READY', 'child/' + mode, 'the installed page sends only one nonsecret marker per loaded framed document to its direct parent', async (t) => {
      const origin = 'http://localhost:4242'
      const messages = []
      const unexpected = []
      for (const loaded of [1, 2]) {
        const page = await navPage(t, sdk, { prepare({ sandbox, window, document }) {
          document.referrer = ''
          window.location.ancestorOrigins = mode === 'known-parent' ? [origin] : []
          const parent = mode === 'standalone' ? window : { postMessage: (data, target) => messages.push([structuredClone(data), target?.targetOrigin ?? target]) }
          // A nested embed has distinct direct-parent and top-level windows. Neither self nor top is a recipient.
          window.postMessage = (...args) => unexpected.push(args)
          const top = mode === 'standalone' ? window : { postMessage: window.postMessage }
          for (const target of [sandbox, window]) Object.assign(target, { self: window, parent, top, location: window.location })
        } })
        assert.deepEqual(page.log.errors, [])
        const expected = Array.from({ length: mode === 'standalone' ? 0 : loaded }, () => [{ type: 'fishball:frame-ready', version: 1 }, mode === 'known-parent' ? origin : '*'])
        assert.deepEqual(messages, expected)
        assert.deepEqual(unexpected, [])
        page.install()
        await page.settle()
        assert.deepEqual(messages, expected, 'reapplying the page sent another marker')
        assert.deepEqual(unexpected, [])
      }
    })
  }

  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)
  const gone = (id, row, title) => withdrawnRow(sdk, id, row, title, WITHDRAWN.tray)
  const SETTINGS = NAV.order[0]

  // ---- the withdrawn tray (Fishball / Plugins buttons, their order, tooltips and presses)
  for (const lang of LANGS) {
    gone('UIPF-NAV-EP-01', `order ${lang}`, `(${lang}) the nav holds settings, fishball, plugins`)
    for (const which of ['fishball', 'plugins']) gone('UIPF-NAV-EP-01', `${which} ${lang}`, `(${lang}) ${which}: icon only`)
  }
  for (const enter of ['onMouseEnter', 'onFocus']) for (const which of ['fishball', 'plugins']) gone('UIPF-NAV-ST-01', `${which} ${enter}`, `${which}: tooltip on ${enter}`)
  for (const row of ['fishball from plugins', 'fishball after drift', 'plugins']) gone('UIPF-NAV-UC-01', row, `pressing ${row}`)
  // A Fishball button contributed to DSH's own sidebar.footer.action seat is not the tray, so it is not
  // asserted either way here (the requirement removes the tray and its Plugins duplicate of the native row).
  t('MULTI-NAV-EP-01', 'no tray', `no nav.${NAV.className}, no page-owned nav element and no Plugins button of the page (the real sidebar's Plugins row is the one)`, async (c) => {
    const page = await navPage(c, sdk)
    assert.equal(page.nav(), undefined, 'the tray is still drawn')
    assert.deepEqual(page.nodes().filter((n) => n.tag === 'nav').map((n) => n.props.className), [])
    assert.deepEqual(controls(page).filter((n) => n.props[NAV.hook] === 'plugins').map((n) => n.props[NAV.hook]), [])
    assert.deepEqual(page.log.errors, [])
  })

  // ---- the Settings launcher stays reachable (button.fishball-settings-launcher)
  for (const lang of LANGS) {
    t('UIPF-NAV-EP-01', `settings ${lang}`, `(${lang}) the Settings launcher: icon only, aria-label ${show(NAV.labels[lang].settings)}, Tooltip label equals it`, async (c) => {
      const page = await navPage(c, sdk, { lang })
      assertIconButton(launcher(page), NAV.labels[lang].settings, 'settings')
    })
    t('UIPF-NAV-EP-01', `retry ${lang}`, `(${lang}) retry (with a status): icon only, aria-label ${show(NAV.labels[lang].retry)}, Tooltip label equals it`, async (c) => {
      const page = await navPage(c, sdk, { lang, ...STATUSES.unavailable })
      assertIconButton(control(page, NAV.retry), NAV.labels[lang].retry, 'retry')
    })
  }
  t('UIPF-NAV-EP-01', 'settings hooks', `the Settings launcher is button.${NAV.launcherClass} with aria-haspopup="${NAV.haspopup}"`, async (c) => {
    const page = await navPage(c, sdk)
    const node = launcher(page)
    assert.ok(node, `no button.${NAV.launcherClass}`)
    assert.equal(node.props['aria-haspopup'], NAV.haspopup)
  })
  for (const open of [false, true]) {
    t('UIPF-NAV-BVA-01', `settingsOpen ${open}`, `the launcher owner prop settingsOpen ${open} → aria-expanded "${open}"`, async (c) => {
      const page = await navPage(c, sdk, { launcher: { settingsOpen: open } })
      assert.equal(String(launcher(page)?.props['aria-expanded']), String(open))
    })
  }
  t('UIPF-NAV-BVA-01', 'settingsOpen false → true', 'aria-expanded follows a re-render from false to true', async (c) => {
    const page = await navPage(c, sdk)
    assert.equal(String(launcher(page)?.props['aria-expanded']), 'false')
    await page.setLauncher({ settingsOpen: true })
    assert.equal(String(launcher(page)?.props['aria-expanded']), 'true')
  })
  for (const [row, shortcut] of [['no shortcut', undefined], ['two keys', NAV.shortcut]]) {
    t('UIPF-NAV-BVA-01', `shortcut ${row}`, `the Settings tooltip on hover shows its label${shortcut ? ' and DSH\'s settings shortcut keys' : ' and no shortcut keys'}`, async (c) => {
      const page = await navPage(c, sdk, { launcher: shortcut ? { settingsShortcut: shortcut } : {} })
      await page.fire(launcher(page), 'onMouseEnter')
      const [tip] = tooltips(page)
      assert.ok(tip, 'no tooltip on hover')
      assert.ok(texts(tip).includes(NAV.labels.en.settings), `tooltip text ${show(texts(tip))}`)
      const keys = below(tip).filter((n) => n.props[STAND_IN.shortcut] !== undefined).map((n) => texts(n).join(' '))
      assert.deepEqual(keys, shortcut ? [shortcut.keys.join(' ')] : [], 'shortcut keys in the tooltip')
    })
  }
  for (const [enter, leave] of [['onMouseEnter', 'onMouseLeave'], ['onFocus', 'onBlur']]) {
    t('UIPF-NAV-ST-01', `${SETTINGS} ${enter}`, `settings: no tooltip → ${enter}: one role="tooltip" with the label, portalled → ${leave}: none`, async (c) => {
      const page = await navPage(c, sdk)
      assert.deepEqual(tooltips(page), [], 'a tooltip before any hover or focus')
      await page.fire(launcher(page), enter)
      const shown = tooltips(page)
      assert.equal(shown.length, 1, `${shown.length} tooltips`)
      assert.ok(texts(shown[0]).includes(NAV.labels.en.settings))
      assert.equal(shown[0].props[STAND_IN.portal], 'true', 'the Tooltip is not portalled (DSH Tooltip portal)')
      await page.fire(launcher(page), leave)
      assert.deepEqual(tooltips(page), [], 'the tooltip stayed')
    })
  }
  t('UIPF-NAV-UC-01', 'settings', 'pressing Settings opens DSH Settings (the launcher owner prop openSettings, once)', async (c) => {
    const page = await navPage(c, sdk)
    await page.press(launcher(page))
    assert.equal(page.log.openSettings, 1)
  })

  // ---- the status and Retry stay visible and actionable (a small status control)
  t('UIPF-NAV-EP-01', 'no status', 'no status: no status control and no Retry', async (c) => {
    const page = await navPage(c, sdk)
    assert.deepEqual(statusItems(page), [])
  })
  for (const [word, options] of Object.entries(STATUSES)) {
    for (const lang of LANGS) {
      t('UIPF-NAV-DT-01', `${word} ${lang}`, `(${lang}) ${word}: one [${NAV.statusHook}=${word}] reading ${show(NAV.status[word][lang])} (text or accessible name) with a StateDot ${NAV.status[word].dot}, then Retry`, async (c) => {
        const page = await navPage(c, sdk, { lang, ...options })
        const statuses = page.nodes().filter((n) => n.props[NAV.statusHook] !== undefined)
        assert.equal(statuses.length, 1, `status nodes ${statuses.length}`)
        const [status] = statuses
        assert.equal(status.props[NAV.statusHook], word)
        assert.equal(status.props.role, NAV.statusRole)
        assert.equal(statusText(status), NAV.status[word][lang])
        const inside = below(status).find((n) => n.props?.[STAND_IN.primitive] === 'StateDot')
        const flat = page.nodes()
        const before = flat[flat.indexOf(status) - 1]
        const dot = [inside, before].find((n) => n?.props?.[STAND_IN.primitive] === 'StateDot')
        assert.ok(dot, 'no StateDot with the status')
        assert.equal(dot.props['data-state'], NAV.status[word].dot)
        if (NAV.status[word].dot === 'ongoing') assert.equal(dot.tag, 'svg', 'the pending dot is not the spinner svg')
        assert.deepEqual(statusItems(page), ['status', NAV.retry])
      })
    }
  }
  t('UIPF-NAV-ST-02', 'pending → protected', 'pending (config loading) → the config is read: the status and Retry go', async (c) => {
    const page = await navPage(c, sdk, STATUSES.pending)
    assert.deepEqual(statusItems(page), ['status', NAV.retry], 'pending')
    await page.release()
    assert.deepEqual(statusItems(page), [], 'after the config is read')
  })
  t('UIPF-NAV-UC-01', 'retry', 'unavailable → pressing Retry tries to open the manager again; once it opens, the status and Retry go', async (c) => {
    const page = await navPage(c, sdk, { openFails: 1 })
    assert.deepEqual(statusItems(page), ['status', NAV.retry], 'unavailable first')
    const before = page.log.opens.length
    await page.press(control(page, NAV.retry))
    assert.ok(page.log.opens.length > before, 'Retry did not open the manager again')
    assert.deepEqual(statusItems(page), [], 'after a successful Retry')
  })
  for (const width of [NAV_PAGE.narrowWidth, NAV_PAGE.wideWidth]) {
    t('MULTI-NAV-EP-02', `status visible ${width}px`, `${width}px: the unavailable status and Retry are drawn (not in a hidden subtree)`, async (c) => {
      const page = await navPage(c, sdk, { width, ...STATUSES.unavailable })
      assert.deepEqual(statusItems(page), ['status', NAV.retry])
      const hidden = page.nodes().filter((n) => n.props.hidden === true || n.props[NAV_PAGE.hiddenHook] !== undefined || n.props['aria-hidden'] === 'true' || n.props['aria-hidden'] === true)
      for (const item of [page.nodes().find((n) => n.props[NAV.statusHook] !== undefined), control(page, NAV.retry)]) {
        assert.ok(!hidden.some((h) => below(h).includes(item)), 'the status or Retry is inside a hidden subtree')
      }
    })
  }

  // ---- requirement A: fishball-page keeps its fail-closed Empty occupant of sidebar.workspaces at -1
  // (so with fishball-ui's target list unloaded, DSH's workspace browser still never shows).
  t('MULTI-NAV-EP-03', 'empty shadow', `fishball-page registers ${NAV_PAGE.workspacesSlot} at priority ${NAV_PAGE.emptyShadowPriority}, below DSH's 0, and draws no workspace or session control there`, async (c) => {
    const page = await navPage(c, sdk)
    const mine = page.log.registrations.filter((r) => r.name === NAV_PAGE.workspacesSlot)
    assert.deepEqual(mine.map((r) => r.priority), [NAV_PAGE.emptyShadowPriority])
    const drawn = page.shim.treeOf(NAV_PAGE.workspacesSlot + ':0')
    assert.deepEqual(below({ children: drawn }).filter((n) => n.tag === 'button' || n.props?.role === 'tree' || n.props?.role === 'treeitem').map((n) => n.tag), [])
  })

  // ---- requirement F: the page no longer forces the drawer closed nor remaps sidebar.left.toggle
  for (const width of [NAV_PAGE.narrowWidth, NAV_PAGE.wideWidth]) {
    t('MULTI-NAV-ST-01', `no forced close ${width}px`, `${width}px: loading the page calls layout.toggleSidebar() zero times`, async (c) => {
      const page = await navPage(c, sdk, { width })
      assert.equal(page.log.toggles, 0)
    })
  }
  t('MULTI-NAV-DT-01', 'shortcut remaps', `the gate edits no ${NAV_PAGE.sidebarToggle} binding; the session / workspace shortcuts are still remapped (${NAV_PAGE.stillRemapped.join(', ')})`, async (c) => {
    const page = await navPage(c, sdk)
    const ids = page.log.edits.map((op) => op.id)
    assert.equal(ids.includes(NAV_PAGE.sidebarToggle), false, show(page.log.edits))
    for (const id of NAV_PAGE.stillRemapped) assert.ok(ids.includes(id), `${id} not remapped: ${show(ids)}`)
  })
}
