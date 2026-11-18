/**
 * MULTI-3 requirement F (PLAN-MULTI §6.4): DSH's real sidebar, restyled by Fishball's page CSS into
 * the narrow bottom bar, measured in a real headless Chromium (the contrast rows' browser,
 * ../contrast/page.mjs `measure`). No product file is read.
 *
 * The document holds, in this order:
 * - DSH's own layout and sidebar sheets: the CSS-module text each SDK's dsh-client-ui-layout
 *   (AppFrame) and dsh-client-ui-sidebar (SidebarRoot) client bundle mounts as a `<style>`
 *   (cut out by its `const css = "…"` beside its `tagId`, as primitives.mjs cuts DSH's form logic),
 *   and DSH's page stylesheets (dsh-web-frontend index.html's links);
 * - the rules fishball-page mounted while it ran in nav-page.mjs (its real client, unread);
 * - a frame written from the two SDKs' own render code (AppFrame.js and SidebarRoot.js, both
 *   SDKs): the frame `div.<frame>` with `data-sidebar-collapsed` / `data-sidebar-drawer`, its
 *   `div.<sidebarCol>` holding the slot anchor `div[data-slot="sidebar"]` (renderer SlotOutlet,
 *   `display: contents`) and the sidebar root `div.<root>`, which holds the logo row, New Session,
 *   `nav.<panelList>` of panel rows (`button.<panelRow>` > `span.<panelGlyph>` >
 *   `div[data-slot="sidebar.panellist"]` > the entry's icon), `div.<regionArea>` >
 *   `div[data-slot="sidebar.workspaces"]`, and `div.<footArea>` > `div.<footerActions>` >
 *   `div[data-slot="sidebar.footer.action"]` and `div.<settingsArea>` > `div[data-slot="sidebar.settings"]`;
 *   then `div.<centerCol>` with `div[data-slot="main"]` > `div[data-slot="main.conversation"]`,
 *   `div.<rightbarCol>`, `div.<bottomRow>[data-shell-bottom]` and the overlay layer. rc.1 adds the
 *   drawer mask and, in drawer mode, the leading seat with the native opener
 *   (`button[data-sidebar-opener]`). Class names are read from each bundle's own module map.
 * - `<html data-fishball-page>` when the row is on Fishball's page.
 */
import fs from 'node:fs'
import path from 'node:path'
import { SDK } from '../../contract/package-boundaries/constants.mjs'
import { frontendStyles } from '../contrast/page.mjs'
import { FRAME_LAYOUT as L } from './polish-constants.mjs'

const bundle = (sdk, pkg) => fs.readFileSync(path.join(SDK.versionsDir, sdk, 'node_modules', '@deepseek-ai', pkg, 'lib', 'client.js'), 'utf8')
const cache = new Map()

/** One CSS module of a DSH client bundle: its class map and the sheet it mounts. */
function cssModule(sdk, pkg, name) {
  const key = [sdk, pkg, name].join('|')
  if (cache.has(key)) return cache.get(key)
  const source = bundle(sdk, pkg)
  const map = new RegExp(`var ${name}_module_css_default = (\\{[^}]*\\})`).exec(source)
  const css = new RegExp(`const css = ("(?:[^"\\\\]|\\\\.)*");\\s*const tagId = "@deepseek-ai/${pkg}/${name}\\.module\\.css"`).exec(source)
  if (!map || !css) throw new Error(`no ${name} CSS module in ${pkg} of SDK ${sdk}`)
  const classes = JSON.parse(map[1].replace(/,\s*\}$/, '}'))
  const out = Object.freeze({ classes, css: JSON.parse(css[1]) })
  cache.set(key, out)
  return out
}

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * The frame's HTML. `panels`: [{id, label}]; `collapsed` / `drawer` the layout's own attributes
 * (rc.1 sets `drawer` below 768px); `mark` whether `<html data-fishball-page>` is set.
 */
export function frameDocument(sdk, { panels, collapsed, drawer = false, mark, pageRules }) {
  const frame = cssModule(sdk, L.layoutPkg, L.frameModule).classes
  const side = cssModule(sdk, L.sidebarPkg, L.sidebarModule).classes
  const slot = (key, inner = '') => `<div data-slot="${key}" style="display:contents">${inner}</div>`
  const rows = panels.map(({ id, label }) => `<button type="button" class="${side.panelRow}" aria-label="${esc(label)}" ${L.panelHook}="${esc(id)}"><span class="${side.panelGlyph}" aria-hidden="true">${slot(L.slot.panellist, `<svg ${L.iconHook}="${esc(id)}" width="18" height="18" viewBox="0 0 18 18"><rect width="18" height="18"/></svg>`)}</span></button>`).join('')
  const root = `<div class="${side.root}${collapsed && !drawer ? ' ' + side.collapsed : ''}">`
    + `<div class="${side.logoRow}"><button type="button" class="${side.iconButton} ${side.toggle}" data-sidebar-toggle aria-label="toggle"><span class="${side.railMark}" aria-hidden="true">${slot(L.slot.brandMark, '<svg width="24" height="24"></svg>')}</span><svg width="18" height="18"></svg></button></div>`
    + `<button type="button" class="${side.newSession}" ${L.newSessionHook} aria-label="New session"><span>+</span></button>`
    + `<nav class="${side.panelList}" aria-label="Global panels">${rows}</nav>`
    + `<div class="${side.regionArea}">${slot(L.slot.workspaces, `<section ${L.workspacesHook}>targets</section>`)}</div>`
    + `<div class="${side.footArea}"><div class="${side.footerActions}">${slot(L.slot.footer, '')}</div><div class="${side.settingsArea}">${slot(L.slot.settings, `<button type="button" class="fishball-settings-launcher" ${L.settingsHook} aria-label="Settings">S</button>`)}</div></div>`
    + '</div>'
  const attrs = [collapsed ? 'data-sidebar-collapsed' : '', drawer ? 'data-sidebar-drawer' : ''].filter(Boolean).join(' ')
  const opener = drawer ? `<div class="${frame.leadingSeat}" data-shell-leading><button type="button" data-sidebar-opener aria-label="Open sidebar">≡</button></div>` : ''
  const mask = drawer && frame.drawerMask ? `<div class="${frame.drawerMask}" data-sidebar-mask aria-hidden="true"></div>` : ''
  const body = `<div style="height:100vh"><div class="${frame.frame}" ${attrs} style="grid-template-columns:${collapsed ? L.railWidth : L.wideWidth}px minmax(0px,1fr) minmax(0px,0px)">`
    + mask
    + `<div class="${frame.sidebarCol}" ${drawer && collapsed ? 'inert' : ''}>${slot(L.slot.sidebar, root)}</div>`
    + `<div class="${frame.centerCol}">${slot(L.slot.main, slot(L.slot.conversation, `<div ${L.conversationHook} style="height:100%">conversation</div>`))}</div>`
    + `<div class="${frame.rightbarCol}" data-rightbar-col></div>`
    + `<div class="${frame.bottomRow}" data-shell-bottom></div>`
    + `<div class="${frame.overlayLayer}" data-shell-overlay></div>`
    + opener
    + '</div></div>'
  const sheets = [...frontendStyles(sdk).sheets, cssModule(sdk, L.layoutPkg, L.frameModule).css, cssModule(sdk, L.sidebarPkg, L.sidebarModule).css, ...pageRules]
  return `<!doctype html><html${mark ? ' data-fishball-page' : ''}><head><meta charset="utf-8">${sheets.map((css) => `<style>${css}</style>`).join('')}</head><body style="margin:0">${body}</body></html>`
}

/**
 * The page-side probe (runs in Chromium): geometry and computed style of the sidebar column, the
 * panel rows, their icons, the settings seat, the workspaces region, the native opener and the
 * conversation; whether the panel list overflows and scrolls horizontally.
 */
export const LAYOUT_PROBE = String(function probe(arg) {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { x: r.x, y: r.y, w: r.width, h: r.height, display: s.display, visibility: s.visibility, position: s.position } }
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[inert]') }
  const col = document.querySelector('[data-slot="sidebar"]')?.parentElement
  const rows = [...document.querySelectorAll(`[${arg.panelHook}]`)]
  const scroller = (() => { for (let at = rows[0]?.parentElement; at && at !== document.body; at = at.parentElement) { const s = getComputedStyle(at); if (['auto', 'scroll'].includes(s.overflowX) && at.scrollWidth > at.clientWidth) return at } return null })()
  const scrolled = (() => { if (!scroller) return null; const before = rows.at(-1).getBoundingClientRect().x; scroller.scrollLeft = scroller.scrollWidth; return before - rows.at(-1).getBoundingClientRect().x })()
  return {
    viewport: { w: innerWidth, h: innerHeight },
    column: box(col),
    rows: rows.map((r) => ({ id: r.getAttribute(arg.panelHook), shown: shown(r), ...box(r) })),
    icons: [...document.querySelectorAll(`[${arg.iconHook}]`)].map((i) => ({ id: i.getAttribute(arg.iconHook), shown: shown(i) })),
    settings: { shown: shown(document.querySelector(`[${arg.settingsHook}]`)), ...box(document.querySelector(`[${arg.settingsHook}]`)) },
    workspaces: shown(document.querySelector(`[${arg.workspacesHook}]`)),
    opener: shown(document.querySelector('[data-sidebar-opener]')),
    conversation: box(document.querySelector(`[${arg.conversationHook}]`)),
    frame: box(document.querySelector('[data-slot="sidebar"]')?.parentElement?.parentElement),
    rightbar: (() => { const el = document.querySelector('[data-rightbar-col]'); return el ? { ...box(el), gridColumnStart: getComputedStyle(el).gridColumnStart } : null })(),
    inert: [...document.querySelectorAll('[inert]')].map((el) => el.className),
    rowsOverflow: Boolean(scroller),
    scrolledBy: scrolled,
  }
})
