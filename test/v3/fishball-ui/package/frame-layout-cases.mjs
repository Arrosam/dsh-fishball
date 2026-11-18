/**
 * MULTI-3 requirement F black-box rows (PLAN-MULTI §6.4): on Fishball's page at narrow width, DSH's
 * real sidebar is the bottom bar, restyled by fishball-page's CSS; elsewhere DSH is unchanged; on
 * rc.1 below 768px there is no bar and the native drawer opener stays. Measured in a real headless
 * Chromium (frame-layout.mjs) with DSH's own layout and sidebar sheets and fishball-page's rules as
 * its real client mounted them (nav-page.mjs). Rows skip where no Chromium exists, as the LITE and
 * contrast rows do.
 *
 * Techniques:
 * - Decision table MULTI-BAR-DT-01: SDK × Fishball page (mark) × width (BVA 390, 480 | 481, 1280) →
 *   bar or DSH unchanged;
 * - BVA MULTI-BAR-BVA-01: the narrow edge 480 / 481;
 * - EP MULTI-BAR-EP-01: panel entries (DSH's own and a third-party one) all in the bar with their
 *   own icons, and the Settings seat; the workspaces region not in the bar;
 * - BVA MULTI-BAR-BVA-02: many entries → the 44px row scrolls horizontally, no wrap;
 * - Decision table MULTI-DRAWER-DT-01: rc.1 below 768px, drawer closed / open → no bar, the opener
 *   visible; the open drawer shows the panels, Settings and the target list;
 * - Control MULTI-BAR-CTRL-01: DSH alone (no Fishball rules) draws no bar at 390px.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { chromeBinary } from '../../../v2-page-cases/lite-browser.mjs'
import { HARNESS } from '../contrast/constants.mjs'
import { measure, stopBrowser } from '../contrast/page.mjs'
import { LAYOUT_PROBE, frameDocument } from './frame-layout.mjs'
import { navPage } from './nav-page.mjs'
import { checkDesktopTargetAddress } from './target-address.mjs'
import { FRAME_LAYOUT as L } from './polish-constants.mjs'

const show = (v) => JSON.stringify(v)
const near = (a, b) => Math.abs(a - b) <= L.epsilon
const W = L.widths
const PROBE_ARG = Object.freeze({ panelHook: L.panelHook, iconHook: L.iconHook, settingsHook: L.settingsHook, workspacesHook: L.workspacesHook, conversationHook: L.conversationHook })
const manyPanels = () => Array.from({ length: L.manyPanels }, (_x, i) => ({ id: `fbtest-panel-${i}`, label: `Fbtest Long Panel Label ${i}` }))
/** The parts a "DSH unchanged" comparison reads (the conversation box is the page's own business). */
const sidebarPicture = (r) => ({ column: r.column, rows: r.rows, icons: r.icons, settings: r.settings, workspaces: r.workspaces, opener: r.opener })

function browserRow(sdk, id, row, title, fn) {
  caseTest(sdk, id, row, title, async (t) => {
    if (!chromeBinary()) { t.skip(HARNESS.skipNoChrome); return }
    await fn(t)
  })
}

export function registerFrameLayoutCases(sdk) {
  after(stopBrowser)
  /** fishball-page's mounted rules, once per test context (its real client in nav-page.mjs). */
  const pageRules = async (t) => (await navPage(t, sdk)).styles()
  /** The DSH layout state each SDK is in at `width` with the sidebar left as DSH opens it. */
  const layoutAt = (width) => {
    const drawer = sdk === L.drawerSdk && width < L.drawerBelow
    // rc.5 and rc.1 both auto-collapse below 1024px (SIDEBAR_AUTO_COLLAPSE); a drawer starts closed.
    return { drawer, collapsed: width < L.autoCollapseBelow }
  }
  const probe = async (t, { width, mark, rules = true, panels = L.panels, collapsed, drawer }) => {
    const state = layoutAt(width)
    const html = frameDocument(sdk, { panels, mark, collapsed: collapsed ?? state.collapsed, drawer: drawer ?? state.drawer, pageRules: rules ? await pageRules(t) : [] })
    return measure(html, LAYOUT_PROBE, PROBE_ARG, { width, height: L.height })
  }
  const assertBar = (r, why) => {
    assert.ok(r.column, `${why}: no sidebar column`)
    assert.equal(r.column.position, 'fixed', `${why}: the sidebar column is not fixed (${show(r.column)})`)
    assert.ok(near(r.column.h, L.barHeight), `${why}: bar height ${r.column.h}, ${L.barHeight} expected`)
    assert.ok(near(r.column.y + r.column.h, r.viewport.h), `${why}: the bar is not at the bottom (${show(r.column)})`)
    assert.ok(near(r.column.x, 0) && near(r.column.w, r.viewport.w), `${why}: the bar does not span the width (${show(r.column)})`)
  }
  const assertNoBar = (r, why) => {
    const bar = r.column && r.column.position === 'fixed' && near(r.column.h, L.barHeight) && near(r.column.y + r.column.h, r.viewport.h)
    assert.ok(!bar, `${why}: a ${L.barHeight}px bottom bar (${show(r.column)})`)
  }
  const isRc1 = sdk === L.drawerSdk

  browserRow(sdk, 'SHOT-TARGET-URL-EP-01', 'desktop duplicate names', 'the expanded Night-Build address fits, ellipsizes, or wraps without an orphaned URL suffix', async (t) => {
    await checkDesktopTargetAddress(t, sdk, await pageRules(t))
  })

  // ---- MULTI-BAR-DT-01 / BVA-01: the bar exists exactly on Fishball's page in the narrow query (rc.5)
  for (const width of [W.narrow, W.edge]) {
    browserRow(sdk, 'MULTI-BAR-DT-01', `page ${width}px`, isRc1
      ? `rc.1, Fishball's page, ${width}px (< 768: drawer) → no bar; the native drawer opener is visible`
      : `Fishball's page, ${width}px → the sidebar column is a fixed ${L.barHeight}px bar at the bottom spanning the width`, async (t) => {
      const r = await probe(t, { width, mark: true })
      if (isRc1) { assertNoBar(r, `${width}px`); assert.equal(r.opener, true, 'the native drawer opener is hidden'); return }
      assertBar(r, `${width}px`)
    })
  }
  browserRow(sdk, 'MULTI-BAR-BVA-01', 'page 481px', `Fishball's page, 481px (just outside max-width: 480px) → DSH's sidebar exactly as without Fishball's rules`, async (t) => {
    const [ours, plain] = [await probe(t, { width: W.above, mark: true }), await probe(t, { width: W.above, mark: true, rules: false })]
    assertNoBar(ours, '481px')
    assert.deepEqual(sidebarPicture(ours), sidebarPicture(plain))
  })
  browserRow(sdk, 'MULTI-BAR-DT-01', 'page 1280px', `Fishball's page, 1280px → DSH's sidebar exactly as without Fishball's rules`, async (t) => {
    const [ours, plain] = [await probe(t, { width: W.desktop, mark: true }), await probe(t, { width: W.desktop, mark: true, rules: false })]
    assertNoBar(ours, '1280px')
    assert.deepEqual(sidebarPicture(ours), sidebarPicture(plain))
  })
  for (const width of [W.narrow, W.desktop]) {
    browserRow(sdk, 'MULTI-BAR-DT-01', `not the page ${width}px`, `not Fishball's page (no <html data-fishball-page>), ${width}px → DSH's sidebar exactly as without Fishball's rules`, async (t) => {
      const [ours, plain] = [await probe(t, { width, mark: false }), await probe(t, { width, mark: false, rules: false })]
      assertNoBar(ours, `${width}px`)
      assert.deepEqual(sidebarPicture(ours), sidebarPicture(plain))
    })
  }

  // ---- MULTI-BAR-EP-01: what the bar holds (rc.5; rc.1 has no bar at these widths)
  if (!isRc1) {
    browserRow(sdk, 'MULTI-BAR-EP-01', 'entries and settings', `the bar shows every panel entry (DSH's and a third-party one) with its own icon, inside the bar, and the Settings seat; the workspaces region is not shown`, async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true })
      assertBar(r, 'precondition')
      const top = r.column.y - L.epsilon
      for (const row of r.rows) {
        assert.ok(row.shown, `${row.id}: not shown`)
        assert.ok(row.y >= top && row.y + row.h <= r.viewport.h + L.epsilon, `${row.id}: outside the bar (${show(row)})`)
      }
      assert.deepEqual(r.icons.filter((i) => !i.shown).map((i) => i.id), [], 'an entry\'s own icon is hidden')
      assert.ok(r.settings.shown && r.settings.y >= top, `the Settings seat is not in the bar (${show(r.settings)})`)
      assert.equal(r.workspaces, false, 'the target list / workspaces region shows inside the bar')
    })
    browserRow(sdk, 'MULTI-BAR-EP-01', 'one row', 'the bar\'s entries sit in one row (one top edge), left to right in their order', async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true })
      const ys = new Set(r.rows.map((row) => Math.round(row.y)))
      assert.equal(ys.size, 1, `rows on ${ys.size} lines: ${show(r.rows)}`)
      assert.deepEqual(r.rows.map((row) => row.id), L.panels.map((p) => p.id))
      assert.ok(r.rows.every((row, i) => i === 0 || row.x > r.rows[i - 1].x), show(r.rows.map((row) => row.x)))
    })
    // ---- MULTI-BAR-BVA-02: overflow scrolls horizontally, no wrap, no More
    browserRow(sdk, 'MULTI-BAR-BVA-02', `${L.manyPanels} entries`, `${L.manyPanels} long entries at 390px → the bar stays ${L.barHeight}px, one row, the entries scroll horizontally`, async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true, panels: manyPanels() })
      assertBar(r, 'many entries')
      assert.equal(new Set(r.rows.map((row) => Math.round(row.y))).size, 1, 'the entries wrapped')
      assert.equal(r.rowsOverflow, true, 'no horizontal scroller holds the entries')
      assert.ok(r.scrolledBy > 0, `scrolling did not move the entries (${r.scrolledBy})`)
    })
    browserRow(sdk, 'MULTI-BAR-BVA-02', 'one entry', 'one entry at 390px → the bar, the entry and Settings shown, nothing scrolls', async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true, panels: [L.panels[0]] })
      assertBar(r, 'one entry')
      assert.ok(r.rows[0].shown && r.settings.shown)
      assert.equal(r.rowsOverflow, false)
    })
  }

  // ---- review amendments (g) and (i), rc.5 at 390px
  if (!isRc1) {
    browserRow(sdk, 'MULTI-SHEET-EP-01', 'expanded sheet gutter', `rc.5, Fishball's page, 390px, the sidebar expanded → a sheet from the left edge leaving a ${L.sheetGutter}px gutter of the frame on the right; no column inert`, async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true, collapsed: false })
      assertNoBar(r, 'expanded')
      assert.ok(near(r.column.x, 0), `the sheet does not start at the left edge (${show(r.column)})`)
      assert.ok(near(r.viewport.w - (r.column.x + r.column.w), L.sheetGutter), `gutter ${r.viewport.w - (r.column.x + r.column.w)}px, ${L.sheetGutter} expected`)
      assert.deepEqual(r.inert, [], 'a column is inert')
    })
    for (const collapsed of [true, false]) {
      browserRow(sdk, 'MULTI-SHEET-EP-02', `rightbar column ${collapsed ? 'bar' : 'sheet'}`, `rc.5, Fishball's page, 390px (${collapsed ? 'bar' : 'sheet'}) → [data-rightbar-col] stays in grid column 3`, async (t) => {
        const r = await probe(t, { width: W.narrow, mark: true, collapsed })
        assert.equal(r.rightbar?.gridColumnStart, '3', show(r.rightbar))
      })
    }
  }
  caseTest(sdk, 'MULTI-SHEET-ST-01', 'gutter / Escape close, focus in', 'rc.5 ≤480px: a pointerdown in the gutter or Escape (focus in the sheet or body, not handled) closes the sheet; opening moves focus into it (user 8A)', null, L.sheetBehaviourTodo)

  // ---- MULTI-BAR-CTRL-01: the measuring sees the difference (without Fishball's rules there is no bar)
  browserRow(sdk, 'MULTI-BAR-CTRL-01', 'no page rules', 'control: the same frame at 390px without fishball-page\'s rules has no bottom bar, so a pass above is not an artefact', async (t) => {
    assertNoBar(await probe(t, { width: W.narrow, mark: true, rules: false }), 'DSH alone')
  })

  // ---- MULTI-DRAWER-DT-01: rc.1 below 768px uses the native drawer
  if (isRc1) {
    browserRow(sdk, 'MULTI-DRAWER-DT-01', 'open drawer', 'rc.1, Fishball\'s page, 390px, the drawer opened → no bar; the real sidebar shows the panels with their icons, Settings and the target list', async (t) => {
      const r = await probe(t, { width: W.narrow, mark: true, collapsed: false, drawer: true })
      assertNoBar(r, 'open drawer')
      assert.deepEqual(r.rows.filter((row) => !row.shown).map((row) => row.id), [], 'a panel entry is hidden in the drawer')
      assert.deepEqual(r.icons.filter((i) => !i.shown).map((i) => i.id), [])
      assert.equal(r.settings.shown, true, 'Settings is hidden in the drawer')
      assert.equal(r.workspaces, true, 'the target list is hidden in the drawer')
    })
    browserRow(sdk, 'MULTI-DRAWER-DT-01', 'mid width', 'rc.1, Fishball\'s page, 600px (drawer, outside the narrow query) → DSH\'s drawer exactly as without Fishball\'s rules', async (t) => {
      const [ours, plain] = [await probe(t, { width: W.mid, mark: true }), await probe(t, { width: W.mid, mark: true, rules: false })]
      assert.deepEqual(sidebarPicture(ours), sidebarPicture(plain))
    })
  }
}
