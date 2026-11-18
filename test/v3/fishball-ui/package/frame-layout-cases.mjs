/**
 * MULTI-3 requirement F black-box rows (PLAN-MULTI §6.4): on Fishball's page at narrow width, DSH's
 * original sidebar is the bottom bar; elsewhere DSH is unchanged. rc.1 retains its native opener;
 * opening the drawer replaces the narrow bar. Matrix and interaction rows run the real page client
 * in Chromium on the SDK-shaped frame. Older stylesheet-only rows remain as independent controls.
 *
 * Techniques:
 * - Decision table MULTI-BAR-DT-01: SDK × Fishball page (mark) × width (BVA 390, 480 | 481, 1280) →
 *   bar or DSH unchanged;
 * - BVA MULTI-BAR-BVA-01: the narrow edge 480 / 481;
 * - EP MULTI-BAR-EP-01: panel entries (DSH's own and a third-party one) all in the bar with their
 *   own icons, and the Settings seat; the workspaces region not in the bar;
 * - BVA MULTI-BAR-BVA-02: many entries → the 44px row scrolls horizontally, no wrap;
 * - Decision table MULTI-DRAWER-DT-01: rc.1 at ≤480px, closed → bar + opener; open → drawer,
 *   showing panels, Settings and targets. At 481..767px both states remain native;
 * - Control MULTI-BAR-CTRL-01: DSH alone (no Fishball rules) draws no bar at 390px.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { chromeBinary, keyFor } from '../../../v2-page-cases/lite-browser.mjs'
import { liveFrame, frameProbeArg, stopFrameEnvironment } from './narrow-frame.mjs'
import { HARNESS } from '../contrast/constants.mjs'
import { measure, stopBrowser } from '../contrast/page.mjs'
import { LAYOUT_PROBE, frameDocument } from './frame-layout.mjs'
import { navPage } from './nav-page.mjs'
import { checkDesktopTargetAddress, checkLongTargetAddress } from './target-address.mjs'
import { FRAME_LAYOUT as L } from './polish-constants.mjs'

// Browser-side geometry oracle. Check inset edge midpoints (corners may be rounded) against the
// actual hit target; viewport bounds alone miss a panel hidden behind the footer or a scroll clip.
async function panelVisibility(index, budgetMs) {
  const el = window.__fbOriginalRows[index], until = performance.now() + budgetMs
  do {
    const r = el.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const points = [[r.left + 1, cy], [r.right - 1, cy], [cx, r.top + 1], [cx, r.bottom - 1], [cx, cy]]
    const obstruction = points.find(([x,y]) => !el.contains(document.elementFromPoint(x,y)))
    if (r.width && r.height && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && !obstruction) return null
    if (performance.now() >= until) return { rect: r.toJSON(), obstruction, hit: obstruction && document.elementFromPoint(...obstruction)?.tagName }
    await new Promise(requestAnimationFrame)
  } while (true)
}
const show = (v) => JSON.stringify(v)
const near = (a, b) => Math.abs(a - b) <= L.epsilon
const W = L.widths
const matrixWidths = [W.minimum, W.narrow, W.edge, W.above, L.drawerBelow - 1, L.drawerBelow, L.autoCollapseBelow]
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
  after(stopFrameEnvironment)
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
    return measure(html, LAYOUT_PROBE, frameProbeArg, { width, height: L.height })
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

  browserRow(sdk, 'SHOT-TARGET-URL-EP-02', 'desktop overlong segment', 'the expanded address ellipsizes on one line and preserves the full URL as text and title', async (t) => {
    await checkLongTargetAddress(t, sdk, await pageRules(t))
  })

  const assertContents = (r, panels) => {
    assert.deepEqual(r.rows.map(b => b.id), panels.map(p => p.id))
    assert.deepEqual(r.icons.filter(i => i.shown).map(i => i.id), panels.map(p => p.id))
    for (const button of [...r.rows, r.toggle, r.footer, r.settings]) {
      assert.ok(button.shown && button.y >= r.column.y - L.epsilon && button.y + button.h <= r.viewport.h + L.epsilon, `outside the row: ${show(button)}`)
    }
    assert.equal(r.workspaces, false, 'target list in bottom row')
    assert.equal(new Set(r.rows.map(b => Math.round(b.y))).size, 1, 'panel buttons wrap')
    assert.ok(r.rows.every((b, i) => !i || b.x > r.rows[i-1].x), 'panel order reversed')
  }
  const checkLayout = async (t, live, width, panels) => {
    const r = await live.probe()
    assert.equal(r.viewport.w, width)
    if (width <= W.edge) { assertBar(r, width); assertContents(r, panels) }
    else {
      assertNoBar(r, width)
      const plain = await probe(t, { width, panels, rules: false, mark: false })
      for (const part of ['column','rows','icons','opener','toggle','workspaces']) assert.deepEqual(r[part], plain[part], `${width}px native ${part}`)
    }
    if (isRc1 && width < L.drawerBelow) assert.equal(r.opener, true, 'native drawer opener hidden')
  }
  const sets = { stock: L.panels.slice(0, -1), plugin: L.panels }
  for (const width of matrixWidths) for (const [partition, panels] of Object.entries(sets)) {
    browserRow(sdk, 'MULTI-BAR-DT-01', `page ${width}px ${partition}`, 'collapsed narrow row or native sidebar/drawer at the SDK width', async t => {
      await checkLayout(t, await liveFrame(t, sdk, { width, panels }), width, panels)
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

  // The closed rc.1 drawer is initially inert: geometry-only snapshots cannot answer these rows.
  const activeBar = async (t, panels = L.panels) => (await liveFrame(t, sdk, { width: W.narrow, panels })).probe()
  {
    browserRow(sdk, 'MULTI-BAR-EP-01', 'entries and settings', `the bar shows every panel entry (DSH's and a third-party one) with its own icon, inside the bar, and the Settings seat; the workspaces region is not shown`, async (t) => {
      const r = await activeBar(t)
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
      const r = await activeBar(t)
      const ys = new Set(r.rows.map((row) => Math.round(row.y)))
      assert.equal(ys.size, 1, `rows on ${ys.size} lines: ${show(r.rows)}`)
      assert.deepEqual(r.rows.map((row) => row.id), L.panels.map((p) => p.id))
      assert.ok(r.rows.every((row, i) => i === 0 || row.x > r.rows[i - 1].x), show(r.rows.map((row) => row.x)))
    })
    // ---- MULTI-BAR-BVA-02: overflow scrolls horizontally, no wrap, no More
    browserRow(sdk, 'MULTI-BAR-BVA-02', `${L.manyPanels} entries`, `${L.manyPanels} long entries at 390px → the bar stays ${L.barHeight}px, one row, the entries scroll horizontally`, async (t) => {
      const r = await activeBar(t, manyPanels())
      assertBar(r, 'many entries')
      assert.equal(new Set(r.rows.map((row) => Math.round(row.y))).size, 1, 'the entries wrapped')
      assert.equal(r.rowsOverflow, true, 'no horizontal scroller holds the entries')
      assert.ok(r.scrolledBy > 0, `scrolling did not move the entries (${r.scrolledBy})`)
    })
    browserRow(sdk, 'MULTI-BAR-BVA-02', 'one entry', 'one entry at 390px → the bar, the entry and Settings shown, nothing scrolls', async (t) => {
      const r = await activeBar(t, [L.panels[0]])
      assertBar(r, 'one entry')
      assert.ok(r.rows[0].shown && r.settings.shown)
      assert.equal(r.rowsOverflow, false)
    })
  }

  browserRow(sdk, 'NARROW-RESIZE-01', 'same mounted page', 'resize across both breakpoints and return to the narrow original sidebar', async t => {
    const widths = [W.edge, W.above, L.drawerBelow - 1, L.drawerBelow, L.autoCollapseBelow, W.minimum]
    const live = await liveFrame(t, sdk, { width: widths[0] })
    for (const width of widths) {
      await live.resize(width)
      await checkLayout(t, live, width, L.panels)
    }
  })
  for (const width of isRc1 ? [W.narrow, W.above] : [W.narrow]) {
    browserRow(sdk, 'NARROW-TOGGLE-01', `${width}px`, 'native open → expanded sidebar → native close restores the initial layout', async t => {
      const live = await liveFrame(t, sdk, { width })
      await checkLayout(t, live, width, L.panels)
      await live.click(isRc1 ? '[data-sidebar-opener]' : '[data-fbtest-toggle]')
      const opened = await live.probe()
      assertNoBar(opened, 'opened')
      assert.ok(opened.rows.every(b => b.shown) && opened.settings.shown && opened.workspaces, 'expanded sidebar contents unreachable')
      if (!isRc1) assert.ok(near(width - opened.column.w, L.sheetGutter), 'expanded sheet gutter')
      await live.click('[data-fbtest-toggle]')
      await checkLayout(t, live, width, L.panels)
    })
  }
  for (const key of ['Enter', 'Space']) {
    browserRow(sdk, 'NARROW-KEY-01', key, 'Tab to all original nav actions; activate an initially offscreen plugin', async t => {
      const panels = [...L.panels, ...manyPanels()]
      const { tab } = await liveFrame(t, sdk, { width: W.minimum, panels })
      const last = panels.at(-1).id
      const visibility = (index, budget = L.focusScrollBudgetMs) => tab.evaluate(`(${panelVisibility})(${index},${budget})`)
      assert.notEqual(await visibility(panels.length - 1, 0), null, 'precondition: last button is already fully in view')
      const required = [...panels.map(p => p.id), 'toggle', 'footer', 'settings']
      const focused = `(() => { const el = document.activeElement; if (__fbOriginalRows.includes(el)) return el.getAttribute('${L.panelHook}'); if (el.matches('[data-fbtest-toggle]')) return 'toggle'; for (const [name,key] of [['sidebar.settings','settings'],['sidebar.footer.action','footer']]) if (el.matches('[data-slot="'+name+'"] button')) return key; return null })()`
      // A bounded walk, never a programmatic focus: inert, tabindex=-1 and clipped rows must fail.
      for (const backwards of [false, true]) {
        const visited = new Set(), direction = backwards ? 'Shift+Tab' : 'Tab'
        for (let i = 0; i < 2 * required.length && visited.size < required.length; i++) {
          await tab.press(keyFor('Tab', backwards ? ['shift'] : []))
          const id = await tab.evaluate(focused)
          if (!required.includes(id)) continue
          visited.add(id)
          const index = panels.findIndex(p => p.id === id)
          if (index >= 0) assert.equal(await visibility(index), null, `${direction}: ${id} not fully visible and unobscured`)
          if (id === last && !backwards) {
            await tab.press({ ...keyFor(key), text: key === 'Enter' ? '\r' : ' ' })
            const clicks = await tab.evaluate('__lite.log.timeline.filter(e => e.kind === "drift" && e.panel).map(e => e.panel)')
            assert.deepEqual(clicks, [last], 'original plugin handler did not run exactly once')
          }
        }
        assert.deepEqual(required.filter(id => !visited.has(id)), [], `actions missing from ${direction} path`)
      }
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
