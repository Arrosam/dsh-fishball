/**
 * The Task board tab beside fishball-ui on one scripted DSH page (fishball-test-helpers/scripted-page):
 * fishball-taskboard's real browser half and, when asked, fishball-ui's real client (each its published
 * `./client` export, found by name), applied by the current DSH's Cordis, with ONE health-aware
 * EventSource stand-in for every source the page opens. The right sidebar's two services are recorded
 * stand-ins; the tab is rendered with the per-tab hook `useTabInfo()` (dsh-client-ui-sidebar-right
 * SidebarRightTabInfo) whose `tab.visible` a case flips. Nothing of either implementation is read: a
 * source's URL, its open/closed state and the drawn text are the observations.
 */
import { eventSourceClass } from 'fishball-test-helpers/event-source'
import { exportPath } from 'fishball-test-helpers/packages'
import { textOf } from 'fishball-test-helpers/react-shim'
import { createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { CARRIER, TB_PAGE } from '../constants.mjs'
import { NAMES } from './names.mjs'

const client = (name) => ({ id: name, file: exportPath(name, TB_PAGE.clientExport) })

function tabInfo(React, id) {
  let info = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: TB_PAGE.idPrefix + 'pane-' + id, isFloating: false },
    tab: {
      id: TB_PAGE.idPrefix + 'tab-' + id, kind: NAMES.taskboard, contentId: TB_PAGE.idPrefix + 'content-' + id, visible: true,
      navigation: { address: TB_PAGE.idPrefix + 'content-' + id, params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: { bindCommands: () => () => {}, openResource() {}, openTab() {}, close() {} },
    },
  }
  const listeners = new Set()
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
  return {
    useTabInfo: () => React.useSyncExternalStore(subscribe, () => info),
    set(visible) { info = { ...info, sidebar: { ...info.sidebar, expanded: visible }, tab: { ...info.tab, visible } }; for (const fn of [...listeners]) fn() },
  }
}

/** The page; `withUi` false: fishball-taskboard alone (no fishballPageStream, its standalone path). */
export async function boardPage(t, { withUi = true, lang = TB_PAGE.lang } = {}) {
  const sources = eventSourceClass()
  const w = createWorld({ clients: [...(withUi ? [client(NAMES.ui)] : []), client(NAMES.taskboard)], lang })
  w.tabTypes = []
  Object.assign(w.services, {
    [TB_PAGE.right.controller]: { openTab() {}, openResource() {} },
    [TB_PAGE.right.tabs]: { register(definition) { w.tabTypes.push(definition); return () => {} } },
  })
  w.provided.push(TB_PAGE.right.controller, TB_PAGE.right.tabs)
  w.EventSource = sources.EventSource
  w.fetchOther = () => ({ status: TB_PAGE.notFound, text: '' })
  // fishball-ui's readers open the carrier only on the Fishball page.
  if (withUi) w.html.setAttribute(TB_PAGE.pageMark, '')
  const page = await loadPage(t, w)
  const pathOf = (s) => new URL(s.url, w.base).pathname
  const open = () => sources.opened.filter((s) => !s.closed)
  const tabs = new Map()
  const key = (id) => TB_PAGE.mountKey + id
  const handle = {
    world: w, sources,
    paths: () => open().map(pathOf),
    carriers: () => open().filter((s) => pathOf(s) === CARRIER.path),
    madeCarriers: () => sources.opened.filter((s) => pathOf(s) === CARRIER.path),
    others: () => sources.opened.filter((s) => pathOf(s) !== CARRIER.path).map(pathOf),
    service: () => w.root.get(TB_PAGE.client),
    async push(topic, frame) { for (const s of handle.carriers()) s.deliver({ topic, frame }); await page.settled() },
    async mountBoard(id = 0) {
      const body = w.entries(TB_PAGE.bodySlot).find((e) => e.options.key === NAMES.taskboard)
      if (!body) throw new Error(NAMES.taskboard + ' registered no ' + TB_PAGE.bodySlot + ' body')
      const tab = tabInfo(w.React, id)
      tabs.set(id, tab)
      await page.mount(key(id), () => w.renderEntry(body, { useTabInfo: tab.useTabInfo }))
    },
    async setVisible(id, visible) { tabs.get(id).set(visible); await page.settled() },
    async unmountBoard(id = 0) { await page.unmount(key(id)); tabs.delete(id) },
    text: (id = 0) => w.shim.treeOf(key(id)).map(textOf).join(' '),
  }
  return handle
}
