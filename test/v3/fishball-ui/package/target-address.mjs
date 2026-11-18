/** Screenshot regression: exercise the actual target details at the desktop sidebar width, not a full-page mock. */
import assert from 'node:assert/strict'
import { frontendStyles, htmlOf, measure, sheetCollector, themeSheets } from '../contrast/page.mjs'
import { FIXTURE, SIDEBAR } from '../model-dialog/targets-constants.mjs'
import { sidebarPage, snapshotOf, targetView, viewModule } from '../model-dialog/targets.mjs'
import { FRAME_LAYOUT } from './polish-constants.mjs'
import { frameDocument } from './frame-layout.mjs'

const NIGHT = Object.freeze({ name: '<b>Night-Build</b> 研发-DSH', url: 'https://night.example.com/mcp' })
const DESKTOP = Object.freeze({ width: 1440, height: 900 })
// Primitive icon stand-ins are empty SVGs without the SDK's sizing. At Chromium's default 300×150,
// the settings icon alone widens the details grid beyond the sidebar and displaces the address.
const ICON_SIZE = 'svg[data-primitive] { width: 1em; height: 1em }'

/** Read glyph positions instead of prescribing CSS: a break before the whole `mcp` segment is legitimate. */
function inspectAddress({ selector, epsilon }) {
  const el = document.querySelector(selector)
  if (!el) return null
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const glyphs = []
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (let i = 0; i < n.length; i++) {
      range.setStart(n, i); range.setEnd(n, i + 1)
      const box = range.getBoundingClientRect()
      if (box.width && box.height) glyphs.push({ ch: n.data[i], top: box.top, bottom: box.bottom, right: box.right, owner: n.parentElement })
    }
  }
  const last = glyphs.at(-1)
  if (!last) return null
  let ellipsis = false
  let clipped = false
  let clippedBelow = false
  for (let p = last.owner; p; p = p.parentElement) {
    const style = getComputedStyle(p)
    const rect = p.getBoundingClientRect()
    // Range still reports the second line's glyphs even if an ancestor crops that line from view.
    if ((style.overflowY === 'hidden' || style.overflowY === 'clip') && last.bottom > rect.top + p.clientTop + p.clientHeight + epsilon) clippedBelow = true
    if (style.overflowX === 'visible' || last.right <= rect.right + epsilon) continue
    clipped = true
    if (style.textOverflow === 'ellipsis') ellipsis = true
  }
  return {
    text: el.innerText, title: last.owner.closest('[title]')?.title,
    finalLine: glyphs.filter(g => Math.abs(g.top - last.top) <= epsilon).map(g => g.ch).join(''),
    clipped, ellipsis, clippedBelow,
  }
}

export async function checkDesktopTargetAddress(t, sdk, pageRules) {
  const sheets = sheetCollector()
  const p = await sidebarPage(t, sdk, { onDocument: sheets.onDocument })
  const targets = [targetView(0, { name: FIXTURE.names.plain }),
    targetView(1, { serverName: FIXTURE.names.plain, name: FIXTURE.names.suffixed, duplicateSuffix: 2 }), targetView(2, NIGHT)]
  const { targetsView } = await viewModule(sdk)
  await p.deliver(targetsView(snapshotOf(targets), 'en', FIXTURE.zones[0]))
  for (const { name } of targets) assert.ok(p.textOf(p.row(name)).includes(name), `name not displayed as plain text: ${name}`)
  await p.toggle(NIGHT.name)
  assert.equal(String(p.row(NIGHT.name).props['aria-expanded']), 'true')
  const { tagClass } = frontendStyles(sdk)
  const html = frameDocument(sdk, { panels: FRAME_LAYOUT.panels, mark: true, collapsed: false,
    workspaces: p.tree().map(n => htmlOf(n, tagClass)).join(''), pageRules: [...themeSheets(sdk), ...pageRules, ...sheets.live(), ICON_SIZE] })
  const r = await measure(html, String(inspectAddress), { selector: `[${SIDEBAR.urlHook}]`, epsilon: FRAME_LAYOUT.epsilon }, DESKTOP)
  assert.ok(r, 'expanded target details show no address')
  assert.equal(r.text, NIGHT.url, 'expanded details must retain the full address')
  assert.ok(r.finalLine.endsWith(NIGHT.url.split('/').at(-1)), `address ends with an orphan on its own line: ${JSON.stringify(r.finalLine)}`)
  assert.equal(r.title, NIGHT.url, 'hover must expose the full address')
  assert.ok(!r.clippedBelow, `the final address line is clipped vertically: ${JSON.stringify(r.finalLine)}`)
  assert.ok(!r.clipped || r.ellipsis, 'address is cut off without an ellipsis')
}
