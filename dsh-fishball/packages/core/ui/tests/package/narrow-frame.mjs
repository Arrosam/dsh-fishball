/**
 * Run fishball-page's client unread in LITE's real Chromium (../support/lite-env.mjs) on the frame
 * fixture (./frame-layout.mjs). Unlike a sheet snapshot this exercises live DOM effects (notably the
 * host's closed drawer starts inert). Host callbacks model native resize / toggle / panel selection;
 * this is not a boot of the DSH app.
 */
import { startLiteEnvironment } from '../support/lite-env.mjs'
import { DRAWER_LAYOUT, LAYOUT_PROBE, frameDocument } from './frame-layout.mjs'
import { FRAME_LAYOUT as L } from './polish-constants.mjs'

let environment
export async function stopFrameEnvironment() {
  await (await environment)?.stop()
  environment = null
}
const settleFrames = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
/** The DSH layout state at `width` with the sidebar left as DSH opens it (a drawer below 768px where the layout has one; collapsed below 1024px). */
export const hostState = (width) => ({ drawer: DRAWER_LAYOUT && width < L.drawerBelow, collapsed: width < L.autoCollapseBelow })
export const frameProbeArg = Object.freeze({ panelHook: L.panelHook, iconHook: L.iconHook, settingsHook: L.settingsHook, workspacesHook: L.workspacesHook, conversationHook: L.conversationHook })
/** The native dictionaries the frame rows start LITE with: empty, the frame carries its own labels. */
const FRAME_DICTS = Object.freeze(Object.fromEntries(['sidebar', 'chat', 'conversation'].map((k) => [k, { en: {} }])))

// Browser-side: apply the host's own state changes without replacing the sidebar or its buttons.
function mountFrame({ html, drawerTemplate, railTemplate, widths, drawerLayout, hooks, collapseSettleMs }) {
  const host = new DOMParser().parseFromString(html, 'text/html')
  document.head.append(...host.head.querySelectorAll('style'))
  document.body.replaceChildren(...host.body.children)
  document.body.style.margin = '0'
  const sidebar = document.querySelector('[data-slot="sidebar"]')
  const column = sidebar.parentElement
  const root = sidebar.firstElementChild
  const frame = column.parentElement
  const drawerFragment = new DOMParser().parseFromString(drawerTemplate, 'text/html')
  const railFragment = new DOMParser().parseFromString(railTemplate, 'text/html')
  const toggle = root.querySelector('[data-fbtest-toggle]'), brandSelector = '[data-fbtest-wide-brand]'
  const actions = '[data-sidebar-opener], [data-fbtest-toggle], [data-sidebar-mask]'
  const toggleAttr = 'data-sidebar-collapsed'
  const drawerAttr = 'data-sidebar-drawer'
  let drawer = frame.hasAttribute(drawerAttr), collapsed = frame.hasAttribute(toggleAttr)
  let settleTimer
  const endFade = () => {
    clearTimeout(settleTimer)
    settleTimer = undefined
    root.classList.remove(root.dataset.fbtestFadeClass)
    root.style.removeProperty('width')
  }
  const update = (nextDrawer, nextCollapsed) => {
    // DSH doesn't write unchanged values on a resize within the same native layout partition.
    if (nextDrawer === drawer && nextCollapsed === collapsed) return
    if ((drawer || !collapsed) !== (nextDrawer || !nextCollapsed)) {
      if (nextDrawer || !nextCollapsed) {
        // An interrupted fade never mounted the rail mark. Keep the still-mounted wide brand.
        if (settleTimer !== undefined) endFade()
        else {
          toggle.querySelector('[data-slot="sidebar.brand.mark"]').parentElement.remove()
          toggle.before(drawerFragment.querySelector(brandSelector).cloneNode(true))
        }
      } else {
        const settleRail = () => {
          root.querySelector(brandSelector).remove()
          toggle.prepend(railFragment.querySelector('[data-fbtest-toggle] [data-slot="sidebar.brand.mark"]').parentElement.cloneNode(true))
          if (settleTimer !== undefined) endFade()
          root.classList.add(root.dataset.fbtestCollapseClass)
        }
        if (collapseSettleMs) {
          // AppFrame has collapsed, but rc.5 SidebarRoot keeps wide content and its last width.
          root.classList.add(root.dataset.fbtestFadeClass)
          root.style.width = `${widths.wide}px`
          settleTimer = setTimeout(settleRail, collapseSettleMs)
        } else settleRail()
      }
    }
    drawer = nextDrawer; collapsed = nextCollapsed
    frame.toggleAttribute(drawerAttr, drawer); frame.toggleAttribute(toggleAttr, collapsed)
    column.inert = drawer && collapsed
    root.classList.toggle(root.dataset.fbtestCollapseClass, collapsed && !drawer && !root.classList.contains(root.dataset.fbtestFadeClass))
    frame.style.gridTemplateColumns = `${collapsed ? widths.rail : widths.wide}px minmax(0px,1fr) minmax(0px,0px)`
    for (const selector of ['[data-sidebar-mask]', '[data-shell-leading]']) {
      const el = frame.querySelector(selector)
      if (drawer && !el) frame.appendChild(drawerFragment.querySelector(selector).cloneNode(true))
      if (!drawer) el?.remove()
    }
  }
  window.__lite.toggleHost = () => update(drawer, !collapsed)
  frame.addEventListener('click', event => {
    if (event.target.closest(actions)) window.__lite.toggleHost()
    const panel = event.target.closest(`[${hooks.panelHook}]`)
    if (panel) window.__lite.showPanel(panel.getAttribute(hooks.panelHook))
  })
  addEventListener('resize', () => update(drawerLayout && innerWidth < widths.drawer, innerWidth < widths.collapse))
  const seat = (name) => document.querySelector(`[data-slot="${name}"]`)
  // Render live slot contributions into their owner seats (including the real Fishball and Settings
  // buttons), not the stand-ins used by geometry-only controls. LITE also mounts a hero occupant.
  seat('sidebar.settings').replaceChildren()
  const hero = document.createElement('div'); hero.id = 'fb-hero-slot'; seat('main.conversation').appendChild(hero)
  const overlay = document.querySelector('[data-shell-overlay]'); overlay.id = 'fb-overlay'
  window.__lite.seatFor = name => name === 'settings.launcher' ? seat('sidebar.settings') : seat(name) ?? overlay
  window.__fbOriginalRows = [...sidebar.querySelectorAll(`[${hooks.panelHook}]`)]
}

/** A live frame tab at `width`, or null when no Chromium exists. */
export async function liveFrame(t, { width, panels = L.panels, collapsed = hostState(width).collapsed, collapseSettleMs = 0 }) {
  environment ??= startLiteEnvironment()
  const env = await environment
  if (!env) return null
  const tab = await env.openChild()
  t.after(() => tab.close())
  const state = hostState(width)
  const htmlFor = (s) => frameDocument({ panels, mark: false, pageRules: [], ...s })
  const html = htmlFor({ ...state, collapsed })
  await tab.resize(width, L.height)
  const fixture = { html, collapseSettleMs, railTemplate: htmlFor({ drawer: false, collapsed: true }), drawerTemplate: state.drawer ? html : htmlFor({ drawer: true, collapsed: true }),
    widths: { rail: L.railWidth, wide: L.wideWidth, drawer: L.drawerBelow, collapse: L.autoCollapseBelow }, drawerLayout: DRAWER_LAYOUT, hooks: frameProbeArg }
  await tab.evaluate(`window.__lite.mountHost = () => (${mountFrame})(${JSON.stringify(fixture)}); true`)
  await tab.evaluate(`__lite.start(${JSON.stringify({ dicts: FRAME_DICTS })})`)
  const probe = async () => {
    await tab.evaluate(settleFrames)
    return tab.evaluate(`(${LAYOUT_PROBE})(${JSON.stringify(frameProbeArg)})`)
  }
  async function click(selector) {
    const point = await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
    await tab.click(...point)
  }
  return { tab, probe, click, resize: (w) => tab.resize(w, L.height) }
}
