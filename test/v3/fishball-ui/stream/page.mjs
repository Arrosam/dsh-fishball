/**
 * R-FIX-FUI F3 / F9: every fishball-ui `conversation.input.dock` entry (the strip, the ask cards,
 * the pairing card) mounted for Fishball's own conversation in the F-SETTINGS scripted page, all
 * over ONE health-aware EventSource stand-in (event-source.mjs), so a case can fail one stream and
 * see what every card draws, and see which streams a Reconnect reopens.
 */
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { eventSourceClass } from './event-source.mjs'

export const DOCK = Object.freeze({
  slot: 'conversation.input.dock', managerSession: 'fbtest-fishball', mountKey: 'fbtest-stream-dock-',
  route: Object.freeze({ strip: 'api/fishball/strip', asks: 'api/fishball/asks/events', pairing: 'api/fishball/pairing' }),
  root: Object.freeze({ strip: 'data-fishball-strip', asks: 'data-fishball-asks', pairing: 'data-fishball-pairing' }),
})

/**
 * @param options.lang - the DSH UI locale.
 * @param options.onSandbox - sees the page realm before any script runs (F9 forces its default locale).
 */
export async function dockPage(t, sdk, { lang = 'en', onSandbox } = {}) {
  const sources = eventSourceClass()
  const w = createWorld({ sdk, lang })
  w.EventSource = sources.EventSource
  w.onSandbox = onSandbox
  const page = await loadPage(t, w)
  const docks = w.entries(DOCK.slot)
  const mount = () => { for (const [i, entry] of docks.entries()) w.shim.mount(DOCK.mountKey + i, () => w.renderEntry(entry, { sessionId: DOCK.managerSession })) }
  mount()
  await settle()
  const tree = () => docks.flatMap((_e, i) => w.shim.treeOf(DOCK.mountKey + i))
  const nodes = () => findAll(tree(), () => true)
  const has = (n, name) => n.props[name] !== undefined && n.props[name] !== false
  /** The open (not closed) sources of one route; the strip's url carries `?lang=`, the others may carry a query. */
  const live = (kind) => sources.opened.filter((s) => !s.closed && new URL(s.url, w.base).pathname.endsWith('/' + DOCK.route[kind]))
  const handle = {
    world: w, sources, nodes, tree, live,
    all: (kind) => sources.opened.filter((s) => new URL(s.url, w.base).pathname.endsWith('/' + DOCK.route[kind])),
    async deliver(kind, frame) { for (const s of live(kind)) s.deliver(frame); await settle() },
    async fail(kind, closed) { for (const s of live(kind)) s.fail({ closed }); await settle() },
    root: (kind) => nodes().find((n) => has(n, DOCK.root[kind])),
    /** The nodes under one card's root (strip, asks, pairing). */
    within: (kind) => { const r = handle.root(kind); return r ? findAll([r], () => true) : [] },
    byHook: (name, value, among = nodes()) => among.filter((n) => has(n, name) && (value === undefined || String(n.props[name]) === String(value))),
    text: (node) => (node ? textOf(node) : tree().map(textOf).join(' ')),
    press: (node) => page.press(node),
    async unmount() { for (const [i] of docks.entries()) w.shim.unmountRoot(DOCK.mountKey + i); await settle() },
    async remount() { mount(); await settle() },
  }
  return handle
}
