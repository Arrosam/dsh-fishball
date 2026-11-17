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
 * - Use case UIPF-NAV-UC-01: each control does what it did (Settings opens DSH Settings, Fishball
 *   re-selects the manager, Plugins opens the Plugins panel, Retry retries).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { navPage } from './nav-page.mjs'
import { NAV, NAV_PAGE } from './polish-constants.mjs'

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
/** The nav's direct and nested controls in document order, by their data-fishball-nav hook. */
const controls = (page) => page.inNav().filter((n) => n.tag === 'button' && n.props[NAV.hook] !== undefined)
const control = (page, which) => controls(page).find((n) => n.props[NAV.hook] === which)
/** The order of the nav's hooked items: buttons by their hook word, the status by 'status'. */
const order = (page) => page.inNav().flatMap((n) => (n.tag === 'button' && n.props[NAV.hook] !== undefined ? [n.props[NAV.hook]] : n.props.role === NAV.statusRole ? ['status'] : []))
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
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)

  // ---- UIPF-NAV-EP-01 and the order without a status
  for (const lang of LANGS) {
    t('UIPF-NAV-EP-01', `order ${lang}`, `(${lang}) no status: the nav holds exactly settings, fishball, plugins in that order; no status, no Retry`, async (c) => {
      const page = await navPage(c, sdk, { lang })
      assert.ok(page.nav(), `no nav.${NAV.className}[aria-label="${NAV.label}"]`)
      assert.deepEqual(order(page), [...NAV.order], 'nav order')
      assert.deepEqual(page.log.errors, [])
    })
    for (const which of NAV.order) {
      t('UIPF-NAV-EP-01', `${which} ${lang}`, `(${lang}) ${which}: icon only, aria-label ${show(NAV.labels[lang][which])}, Tooltip label equals it`, async (c) => {
        const page = await navPage(c, sdk, { lang })
        assertIconButton(control(page, which), NAV.labels[lang][which], which)
      })
    }
    t('UIPF-NAV-EP-01', `retry ${lang}`, `(${lang}) retry (with a status): icon only, aria-label ${show(NAV.labels[lang].retry)}, Tooltip label equals it`, async (c) => {
      const page = await navPage(c, sdk, { lang, ...STATUSES.unavailable })
      assertIconButton(control(page, NAV.retry), NAV.labels[lang].retry, 'retry')
    })
  }
  t('UIPF-NAV-EP-01', 'settings hooks', `the Settings launcher is button.${NAV.launcherClass} with aria-haspopup="${NAV.haspopup}" inside the nav`, async (c) => {
    const page = await navPage(c, sdk)
    const node = control(page, NAV.order[0])
    assert.ok(node, 'no settings control in the nav')
    assert.ok(String(node.props.className ?? '').split(' ').includes(NAV.launcherClass), `class ${show(node.props.className)}`)
    assert.equal(node.props['aria-haspopup'], NAV.haspopup)
  })

  // ---- UIPF-NAV-BVA-01: aria-expanded follows settingsOpen; the shortcut keys
  for (const open of [false, true]) {
    t('UIPF-NAV-BVA-01', `settingsOpen ${open}`, `the launcher owner prop settingsOpen ${open} → aria-expanded "${open}"`, async (c) => {
      const page = await navPage(c, sdk, { launcher: { settingsOpen: open } })
      assert.equal(String(control(page, NAV.order[0])?.props['aria-expanded']), String(open))
    })
  }
  t('UIPF-NAV-BVA-01', 'settingsOpen false → true', 'aria-expanded follows a re-render from false to true', async (c) => {
    const page = await navPage(c, sdk)
    assert.equal(String(control(page, NAV.order[0])?.props['aria-expanded']), 'false')
    await page.setLauncher({ settingsOpen: true })
    assert.equal(String(control(page, NAV.order[0])?.props['aria-expanded']), 'true')
  })
  for (const [row, shortcut] of [['no shortcut', undefined], ['two keys', NAV.shortcut]]) {
    t('UIPF-NAV-BVA-01', `shortcut ${row}`, `the Settings tooltip on hover shows its label${shortcut ? ' and DSH\'s settings shortcut keys' : ' and no shortcut keys'}`, async (c) => {
      const page = await navPage(c, sdk, { launcher: shortcut ? { settingsShortcut: shortcut } : {} })
      await page.fire(control(page, NAV.order[0]), 'onMouseEnter')
      const [tip] = tooltips(page)
      assert.ok(tip, 'no tooltip on hover')
      assert.ok(texts(tip).includes(NAV.labels.en.settings), `tooltip text ${show(texts(tip))}`)
      const keys = below(tip).filter((n) => n.props[STAND_IN.shortcut] !== undefined).map((n) => texts(n).join(' '))
      assert.deepEqual(keys, shortcut ? [shortcut.keys.join(' ')] : [], 'shortcut keys in the tooltip')
    })
  }

  // ---- UIPF-NAV-ST-01: the tooltip shows on hover or focus, portalled, and goes again
  for (const [enter, leave] of [['onMouseEnter', 'onMouseLeave'], ['onFocus', 'onBlur']]) {
    for (const which of NAV.order) {
      t('UIPF-NAV-ST-01', `${which} ${enter}`, `${which}: no tooltip → ${enter}: one role="tooltip" with the label, portalled to document.body → ${leave}: none`, async (c) => {
        const page = await navPage(c, sdk)
        assert.deepEqual(tooltips(page), [], 'a tooltip before any hover or focus')
        await page.fire(control(page, which), enter)
        const shown = tooltips(page)
        assert.equal(shown.length, 1, `${shown.length} tooltips`)
        assert.ok(texts(shown[0]).includes(NAV.labels.en[which]), `tooltip text ${show(texts(shown[0]))}`)
        assert.equal(shown[0].props[STAND_IN.portal], 'true', 'the Tooltip is not portalled (DSH Tooltip portal)')
        await page.fire(control(page, which), leave)
        assert.deepEqual(tooltips(page), [], 'the tooltip stayed')
      })
    }
  }

  // ---- UIPF-NAV-DT-01: status × language
  for (const [word, options] of Object.entries(STATUSES)) {
    for (const lang of LANGS) {
      t('UIPF-NAV-DT-01', `${word} ${lang}`, `(${lang}) ${word}: span[role=status][${NAV.statusHook}=${word}] reads ${show(NAV.status[word][lang])} after a StateDot ${NAV.status[word].dot}; order settings, fishball, plugins, status, retry`, async (c) => {
        const page = await navPage(c, sdk, { lang, ...options })
        const statuses = page.inNav().filter((n) => n.props.role === NAV.statusRole)
        assert.equal(statuses.length, 1, `status nodes ${show(statuses.map((s) => texts(s)))}`)
        const [status] = statuses
        assert.equal(status.tag, 'span')
        assert.equal(status.props[NAV.statusHook], word)
        assert.equal(texts(status).join(' '), NAV.status[word][lang])
        // "preceded by a DSH StateDot": its first element child, or the element right before it.
        const inside = (status.children ?? []).find((n) => typeof n !== 'string')
        const flat = page.inNav()
        const before = flat[flat.indexOf(status) - 1]
        const dot = [inside, before].find((n) => n?.props?.[STAND_IN.primitive] === 'StateDot')
        assert.ok(dot, 'no StateDot before the status text')
        assert.equal(dot.props['data-state'], NAV.status[word].dot)
        if (NAV.status[word].dot === 'ongoing') assert.equal(dot.tag, 'svg', 'the pending dot is not the spinner svg')
        assert.deepEqual(order(page), [...NAV.order, 'status', NAV.retry])
      })
    }
  }
  t('UIPF-NAV-ST-02', 'pending → protected', 'pending (config loading) → the config is read: the status and Retry go, the three icons stay', async (c) => {
    const page = await navPage(c, sdk, STATUSES.pending)
    assert.deepEqual(order(page), [...NAV.order, 'status', NAV.retry], 'pending')
    await page.release()
    assert.deepEqual(order(page), [...NAV.order], 'after the config is read')
  })

  // ---- UIPF-NAV-UC-01: clicking behaves as before
  t('UIPF-NAV-UC-01', 'settings', 'pressing Settings opens DSH Settings (the launcher owner prop openSettings, once)', async (c) => {
    const page = await navPage(c, sdk)
    await page.press(control(page, 'settings'))
    assert.equal(page.log.openSettings, 1)
  })
  // As LITE-UC-02 / LITE-ST-04 observe it: from the Plugins panel, or after the view drifted to
  // another session, Fishball returns to the manager (and leaves the Plugins panel).
  t('UIPF-NAV-UC-01', 'fishball from plugins', 'Plugins pressed, then Fishball: the Plugins panel is left and only the manager is opened', async (c) => {
    const page = await navPage(c, sdk)
    await page.press(control(page, 'plugins'))
    await page.press(control(page, 'fishball'))
    assert.notEqual(page.log.panels.at(-1), NAV.plugins, 'still on the Plugins panel: ' + show(page.log.panels))
    assert.ok(page.log.opens.length >= 1 && page.log.opens.every((id) => id === NAV_PAGE.manager), show(page.log.opens))
  })
  t('UIPF-NAV-UC-01', 'fishball after drift', 'the view drifted to another session, then Fishball: the manager is opened again', async (c) => {
    const page = await navPage(c, sdk)
    page.drift(NAV_PAGE.other)
    await page.settle()
    const before = page.log.opens.length
    await page.press(control(page, 'fishball'))
    assert.equal(page.log.opens.length, before + 1, 'no openSession after the press: ' + show(page.log.opens))
    assert.equal(page.log.opens.at(-1), NAV_PAGE.manager)
  })
  t('UIPF-NAV-UC-01', 'plugins', `pressing Plugins opens the Plugins panel (layout.selectPanel('${NAV.plugins}'))`, async (c) => {
    const page = await navPage(c, sdk)
    await page.press(control(page, 'plugins'))
    assert.equal(page.log.panels.at(-1), NAV.plugins)
  })
  t('UIPF-NAV-UC-01', 'retry', 'unavailable → pressing Retry tries to open the manager again; once it opens, the status and Retry go', async (c) => {
    const page = await navPage(c, sdk, { openFails: 1 })
    assert.deepEqual(order(page), [...NAV.order, 'status', NAV.retry], 'unavailable first')
    const before = page.log.opens.length
    await page.press(control(page, NAV.retry))
    assert.ok(page.log.opens.length > before, 'Retry did not open the manager again')
    assert.deepEqual(order(page), [...NAV.order], 'after a successful Retry')
  })
}
