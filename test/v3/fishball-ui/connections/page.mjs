/**
 * Component level of fishball-ui.connections: fishball-ui's real client and parts (and, when asked,
 * fishball-taskboard's real browser half) in the F-SETTINGS scripted page, over the brand suite's
 * scripted shell (../brand/page.mjs: the sidebar brand slots, `<html data-fishball-page>`), with ONE
 * health-aware EventSource stand-in for every source the page opens (../stream/event-source.mjs).
 *
 * The readers a case mounts or unmounts, each as DSH renders it:
 * - `brand`: the shell with the two brand slots (mounted by the brand page; `unmountShell` removes it);
 * - `sidebar`: the winner of the single slot `sidebar.workspaces` with the sidebar's owner props;
 * - `dock`: every `conversation.input.dock` entry for Fishball's conversation;
 * - `board`: fishball-taskboard's `sidebar.right.pane.tab` body, given the right sidebar's per-tab
 *   hook `useTabInfo()` (dsh-client-ui-sidebar-right SidebarRightTabInfo) whose `tab.visible` a case flips;
 * - a direct subscriber of the browser service `fishballPageStream` (R5), as an amenity part would be.
 * The right sidebar's two services are stand-ins that record registrations (the board's tab type).
 * Nothing of the implementation is read; a source's URL and its open/closed state are the observations.
 */
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { CLIENTS } from '../../fishball-core/settings/constants.mjs'
import { brandPage } from '../brand/page.mjs'
import { eventSourceClass } from '../stream/event-source.mjs'
import { CARRIER, CLIENT, FIXTURE, TASKBOARD } from './constants.mjs'

const RIGHT = Object.freeze({ controller: 'sidebarRight', tabs: 'sidebarRightTabs' })
const SLOT = Object.freeze({ sidebar: 'sidebar.workspaces', dock: 'conversation.input.dock' })
const SIDEBAR_OWNER = Object.freeze({ wide: true })
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

/** The right sidebar's controller and tab-type registry, recorded (the board's browser half injects both). */
function rightSidebar(world) {
  world.tabTypes = []
  world.services[RIGHT.controller] = { openTab() {}, openResource() {} }
  world.services[RIGHT.tabs] = { register(definition) { world.tabTypes.push(definition); return () => {} } }
  world.provided.push(RIGHT.controller, RIGHT.tabs)
  world.extraClients = [{ id: TASKBOARD.moduleId, file: TASKBOARD.client }]
}

/** One right-sidebar tab's information as `useTabInfo()` answers it; `set` changes it live. */
function tabInfo(React, id) {
  let info = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'fbtest-pane-' + id, isFloating: false },
    tab: {
      id: 'fbtest-tab-' + id, kind: TASKBOARD.moduleId, contentId: 'fbtest-content-' + id, visible: true,
      navigation: { address: 'fbtest-content-' + id, params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: { bindCommands: () => () => {}, openResource() {}, openTab() {}, close() {} },
    },
  }
  const listeners = new Set()
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
  return {
    useTabInfo: () => React.useSyncExternalStore(subscribe, () => info),
    set(visible, expanded = visible) { info = { ...info, sidebar: { ...info.sidebar, expanded }, tab: { ...info.tab, visible } }; for (const fn of [...listeners]) fn() },
  }
}

/** The handle every page shape shares: sources, the board tabs, and the service. */
function common(w, sources) {
  const path = (s) => new URL(s.url, w.base).pathname
  const open = () => sources.opened.filter((s) => !s.closed)
  const boards = new Map()
  const handle = {
    world: w, sources,
    /** Every open source (every one is Fishball's: the scripted page has no DSH stream). */
    open,
    /** The open carriers, and every carrier ever made. */
    carriers: () => open().filter((s) => path(s) === CARRIER.path),
    madeCarriers: () => sources.opened.filter((s) => path(s) === CARRIER.path),
    /** Every source ever made to a route other than the carrier. */
    others: () => sources.opened.filter((s) => path(s) !== CARRIER.path).map(path),
    paths: () => open().map(path),
    /** One wire message on every open carrier (R4: {topic, frame}). */
    async push(topic, frame) { for (const s of handle.carriers()) s.deliver({ topic, frame }); await settle() },
    async pushRaw(data) { for (const s of handle.carriers()) s.deliverRaw(data); await settle() },
    async fail(closed) { for (const s of open()) s.fail({ closed }); await settle() },
    /** The browser service (R5), as another part would reach it through Cordis. */
    service: () => w.root.get(CLIENT.service),
    /** A recording member of one topic: its frames and the health words it was told. */
    async subscribe(topic) {
      const member = { frames: [], health: [] }
      // Values cross from the page realm (node:vm): copied into this realm so deepEqual compares content only.
      member.off = handle.service().subscribe(topic, { frame: (value) => member.frames.push(plain(value)), health: (word) => member.health.push(word) })
      await settle()
      return member
    },
    async mountBoard(id = 0) {
      const body = w.entries(TASKBOARD.bodySlot).find((e) => e.options.key === TASKBOARD.moduleId)
      if (!body) throw new Error('fishball-taskboard registered no ' + TASKBOARD.bodySlot + ' body')
      const tab = tabInfo(w.React, id)
      boards.set(id, tab)
      w.shim.mount(FIXTURE.mountKey + 'board' + id, () => w.renderEntry(body, { useTabInfo: tab.useTabInfo }))
      await settle()
    },
    async setBoardVisible(id, visible) { boards.get(id).set(visible); await settle() },
    async unmountBoard(id = 0) { w.shim.unmountRoot(FIXTURE.mountKey + 'board' + id); boards.delete(id); await settle() },
    boardText: (id = 0) => w.shim.treeOf(FIXTURE.mountKey + 'board' + id).map(textOf).join(' '),
    /** Console lines the page wrote (R8). */
    console: () => [...w.console],
    async setLang(lang) { w.setLang(lang); await settle() },
    settle,
  }
  return handle
}

/**
 * The Fishball page with fishball-ui (and optionally fishball-taskboard). Mounted at once: the
 * brand (the shell), unless `readers` says otherwise; `readers` lists what to mount at start.
 * @param options.lang - DSH UI language.
 * @param options.taskboard - load fishball-taskboard's browser half too.
 * @param options.readers - any of 'brand', 'sidebar', 'dock', 'board' (default every one loaded).
 */
export async function fishballPage(t, sdk, { lang = 'en', taskboard = true, readers } = {}) {
  const p = await brandPage(t, sdk, { lang, prepareWorld: (w) => { if (taskboard) rightSidebar(w) } })
  const w = p.world
  const handle = { ...common(w, p.sources), brandPage: p }
  const mounted = new Set(['brand'])
  const winner = () => [...w.entries(SLOT.sidebar)].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]
  const mount = {
    brand: async () => { await p.remountShell?.() },
    sidebar: async () => { w.shim.mount(FIXTURE.mountKey + 'sidebar', () => { const e = winner(); return e ? w.renderEntry(e, { ...SIDEBAR_OWNER, expandSidebar() {} }) : null }); await settle() },
    dock: async () => { for (const [i, e] of w.entries(SLOT.dock).entries()) w.shim.mount(FIXTURE.mountKey + 'dock' + i, () => w.renderEntry(e, { sessionId: FIXTURE.managerSession })); await settle() },
    board: () => handle.mountBoard(0),
  }
  const unmount = {
    brand: () => p.unmountPage(),
    sidebar: async () => { w.shim.unmountRoot(FIXTURE.mountKey + 'sidebar'); await settle() },
    dock: async () => { for (const [i] of w.entries(SLOT.dock).entries()) w.shim.unmountRoot(FIXTURE.mountKey + 'dock' + i); await settle() },
    board: () => handle.unmountBoard(0),
  }
  Object.assign(handle, {
    mounted: () => [...mounted],
    async mount(name) { await mount[name](); mounted.add(name) },
    async unmount(name) { await unmount[name](); mounted.delete(name) },
    /** `<html data-fishball-page>` set or removed (leaving the Fishball page removes it). */
    setPageMark: (on) => p.setPageMark(on),
    /** The nodes of the whole page: the shell and every mounted root. */
    nodes: () => findAll(w.shim.tree(), () => true),
    press: (node) => p.page.press(node),
  })
  const wanted = readers ?? ['brand', 'sidebar', 'dock', ...(taskboard ? ['board'] : [])]
  // The others first, so the brand leaving (when not wanted) does not close and reopen the carrier.
  for (const name of wanted.filter((n) => n !== 'brand')) await handle.mount(name)
  if (!wanted.includes('brand')) await handle.unmount('brand')
  /** Carriers made since the page reached its starting readers (a case's own transitions). */
  const start = handle.madeCarriers().length
  handle.madeSinceStart = () => handle.madeCarriers().length - start
  return handle
}

/**
 * A page with fishball-taskboard's browser half alone (no Fishball client: R6's standalone fallback).
 * `prepareWorld(world)` (optional) adjusts the world before any script runs (fishball-taskboard.view
 * sets `onDocument` to collect the sheets the tab mounts, and its own `fetchOther`).
 */
export async function boardOnlyPage(t, sdk, { lang = 'en', prepareWorld } = {}) {
  const sources = eventSourceClass()
  const w = createWorld({ sdk, lang, clients: CLIENTS.none })
  w.EventSource = sources.EventSource
  rightSidebar(w)
  w.fetchOther = () => ({ status: 404, text: '' })
  prepareWorld?.(w)
  await loadPage(t, w)
  return common(w, sources)
}