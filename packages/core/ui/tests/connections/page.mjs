/**
 * Component level of fishball-ui.connections: fishball-ui's real client and parts in the scripted DSH
 * page over the brand suite's scripted shell (../support/brand-shell.mjs: the sidebar brand slots,
 * `<html data-fishball-page>`), with ONE EventSource stand-in for every source the page opens.
 *
 * The readers a case mounts or unmounts, each as DSH renders it:
 * - `brand`: the shell with the two brand slots (mounted by the brand page);
 * - `sidebar`: the winner of the single slot `sidebar.workspaces` with the sidebar's owner props;
 * - `dock`: every `conversation.input.dock` entry for Fishball's conversation;
 * - a direct subscriber of the browser service `fishballPageStream` (R5), as an amenity's part would be.
 * Nothing of the implementation is read; a source's URL and its open/closed state are the observations.
 */
import { findAll } from 'fishball-test-helpers/react-shim'
import { brandPage } from '../support/brand-shell.mjs'
import { pageMessage } from '../support/page-stream.mjs'
import { winnerOf } from '../support/ui-page.mjs'
import { CARRIER, CLIENT, FIXTURE, READERS, SIDEBAR_OWNER, SLOT } from './constants.mjs'

/** Values cross from the page realm (node:vm): copied into this realm so deepEqual compares content only. */
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

/**
 * The Fishball page with fishball-ui; `readers` lists what is mounted at start (default every one).
 * @param options.lang - DSH UI language.
 */
export async function fishballPage(t, { lang = 'en', readers = READERS } = {}) {
  const p = await brandPage(t, { lang })
  const w = p.world
  const sources = p.sources
  const pathOf = (s) => new URL(s.url, w.base).pathname
  const open = () => sources.opened.filter((s) => !s.closed)
  const key = (name) => FIXTURE.mountKey + name
  const dockKeys = () => w.entries(SLOT.dock).map((_e, i) => key(SLOT.dock) + i)
  const mounted = new Set([READERS[0]])
  const mount = {
    brand: () => p.remountShell(),
    async sidebar() { w.shim.mount(key(SLOT.sidebar), () => { const e = winnerOf(w.entries(SLOT.sidebar)); return e ? w.renderEntry(e, { ...SIDEBAR_OWNER, expandSidebar() {} }) : null }); await p.settle() },
    async dock() { for (const [i, e] of w.entries(SLOT.dock).entries()) w.shim.mount(key(SLOT.dock) + i, () => w.renderEntry(e, { sessionId: FIXTURE.managerSession })); await p.settle() },
  }
  const unmount = {
    brand: () => p.unmountPage(),
    async sidebar() { w.shim.unmountRoot(key(SLOT.sidebar)); await p.settle() },
    async dock() { for (const k of dockKeys()) w.shim.unmountRoot(k); await p.settle() },
  }
  const handle = {
    world: w, sources,
    /** Every open source (every one is Fishball's: the scripted page has no DSH stream). */
    open,
    carriers: () => open().filter((s) => pathOf(s) === CARRIER.path),
    madeCarriers: () => sources.opened.filter((s) => pathOf(s) === CARRIER.path),
    /** Every source ever made to a route other than the carrier. */
    others: () => sources.opened.filter((s) => pathOf(s) !== CARRIER.path).map(pathOf),
    paths: () => open().map(pathOf),
    /** One wire message on every open carrier (R4: {topic, frame}). */
    async push(topic, frame) { for (const s of handle.carriers()) s.deliver(pageMessage(topic, frame)); await p.settle() },
    async pushRaw(data) { for (const s of handle.carriers()) s.deliverRaw(data); await p.settle() },
    fail: (closed) => p.failConnection(closed),
    /** The browser service (R5), as another part would reach it through Cordis. */
    service: () => w.root.get(CLIENT.service),
    /** A recording member of one topic: its frames and the health words it was told. */
    async subscribe(topic) {
      const member = { frames: [], health: [] }
      member.off = handle.service().subscribe(topic, { frame: (value) => member.frames.push(plain(value)), health: (word) => member.health.push(word) })
      await p.settle()
      return member
    },
    console: () => [...w.console],
    async setLang(next) { w.setLang(next); await p.settle() },
    mounted: () => [...mounted],
    async mount(name) { await mount[name](); mounted.add(name) },
    async unmount(name) { await unmount[name](); mounted.delete(name) },
    /** `<html data-fishball-page>` set or removed (leaving the Fishball page removes it). */
    setPageMark: (on) => p.setPageMark(on),
    /** The nodes of the whole page: the shell and every mounted root. */
    nodes: () => findAll(w.shim.tree(), () => true),
    press: (node) => p.page.press(node),
    settle: () => p.settle(),
  }
  // The others first, so the brand leaving (when not wanted) does not close and reopen the carrier.
  for (const name of readers.filter((n) => n !== READERS[0])) await handle.mount(name)
  if (!readers.includes(READERS[0])) await handle.unmount(READERS[0])
  /** Carriers made since the page reached its starting readers (a case's own transitions). */
  const start = handle.madeCarriers().length
  handle.madeSinceStart = () => handle.madeCarriers().length - start
  return handle
}
