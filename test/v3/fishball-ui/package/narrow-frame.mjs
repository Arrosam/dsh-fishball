/** Run the page client unread in LITE's real Chromium on the existing SDK frame fixture. Unlike
 * a sheet snapshot this exercises live DOM effects (notably the host's closed drawer starts inert).
 * Host callbacks model native resize/toggle/panel selection; this is not a boot of the DSH app. */
import { startEnvironment } from '../../../v2-page-cases/lite-browser.mjs'
import { frameDocument, LAYOUT_PROBE } from './frame-layout.mjs'
import { FRAME_LAYOUT as L } from './polish-constants.mjs'

let environment
export async function stopFrameEnvironment() {
  await (await environment)?.stop()
  environment = null
}
const settleFrames = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
const hostState = (sdk, width) => ({ drawer: sdk === L.drawerSdk && width < L.drawerBelow, collapsed: width < L.autoCollapseBelow })
export const frameProbeArg = Object.freeze({ panelHook: L.panelHook, iconHook: L.iconHook, settingsHook: L.settingsHook, workspacesHook: L.workspacesHook, conversationHook: L.conversationHook })

// Browser-side: apply the host's own state changes without replacing the sidebar or its buttons.
function mountFrame({ html, drawerTemplate, widths, drawerSdk, hooks, selectedSdk }) {
  const host = new DOMParser().parseFromString(html, 'text/html')
  document.head.append(...host.head.querySelectorAll('style'))
  document.body.replaceChildren(...host.body.children)
  document.body.style.margin = '0'
  const sidebar = document.querySelector('[data-slot="sidebar"]')
  const column = sidebar.parentElement
  const root = sidebar.firstElementChild
  const frame = column.parentElement
  const drawerFragment = new DOMParser().parseFromString(drawerTemplate, 'text/html')
  const actions = '[data-sidebar-opener], [data-fbtest-toggle], [data-sidebar-mask]'
  const toggleAttr = 'data-sidebar-collapsed'
  const drawerAttr = 'data-sidebar-drawer'
  let drawer = frame.hasAttribute(drawerAttr), collapsed = frame.hasAttribute(toggleAttr)
  const update = (nextDrawer, nextCollapsed) => {
    // DSH doesn't write unchanged values on a resize within the same native layout partition.
    if (nextDrawer === drawer && nextCollapsed === collapsed) return
    drawer = nextDrawer; collapsed = nextCollapsed
    frame.toggleAttribute(drawerAttr, drawer); frame.toggleAttribute(toggleAttr, collapsed)
    column.inert = drawer && collapsed
    root.classList.toggle(root.dataset.fbtestCollapseClass, collapsed && !drawer)
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
  addEventListener('resize', () => update(selectedSdk === drawerSdk && innerWidth < widths.drawer, innerWidth < widths.collapse))
  const seat = (name) => document.querySelector(`[data-slot="${name}"]`)
  // Render live slot contributions into their owner seats (including the real Fishball and Settings
  // buttons), not the stand-ins used by geometry-only controls. LITE also mounts a hero occupant.
  seat('sidebar.settings').replaceChildren()
  const hero = document.createElement('div'); hero.id = 'fb-hero-slot'; seat('main.conversation').appendChild(hero)
  const overlay = document.querySelector('[data-shell-overlay]'); overlay.id = 'fb-overlay'
  window.__lite.seatFor = name => name === 'settings.launcher' ? seat('sidebar.settings') : seat(name) ?? overlay
  window.__fbOriginalRows = [...sidebar.querySelectorAll(`[${hooks.panelHook}]`)]
}

export async function liveFrame(t, sdk, { width, panels = L.panels, collapsed = hostState(sdk, width).collapsed }) {
  environment ??= startEnvironment()
  const tab = await (await environment).openChild({ sdk })
  t.after(() => tab.close())
  const state = hostState(sdk, width)
  const htmlFor = (state) => frameDocument(sdk, { panels, mark: false, pageRules: [], ...state })
  const html = htmlFor({ ...state, collapsed })
  await tab.resize(width, L.height)
  const fixture = { html, drawerTemplate: state.drawer ? html : htmlFor({ drawer: true, collapsed: true }),
    widths: { rail: L.railWidth, wide: L.wideWidth, drawer: L.drawerBelow, collapse: L.autoCollapseBelow }, drawerSdk: L.drawerSdk, selectedSdk: sdk, hooks: frameProbeArg }
  await tab.evaluate(`window.__lite.mountHost = () => (${mountFrame})(${JSON.stringify(fixture)}); true`)
  const dicts = Object.fromEntries(['sidebar','chat','conversation'].map(k => [k, { en: {} }]))
  await tab.evaluate(`__lite.start(${JSON.stringify({ dicts })})`)
  const probe = async () => {
    await tab.evaluate(settleFrames)
    return tab.evaluate(`(${LAYOUT_PROBE})(${JSON.stringify(frameProbeArg)})`)
  }
  async function click(selector) {
    const point = await tab.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
    await tab.click(...point)
  }
  return { tab, probe, click, resize: width => tab.resize(width, L.height) }
}
