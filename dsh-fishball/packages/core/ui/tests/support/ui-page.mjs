/**
 * fishball-ui's page world: fishball-ui's real browser half (client.js and the package-local chunks it
 * loads) alone in fishball-test-helpers' scripted DSH page, with the helpers' health-aware EventSource
 * stand-in for every source the page opens. Nothing of core's runs here: what core would serve (the
 * page connection's frames, its owner-only routes) is scripted by the case through the stream
 * stand-in (./page-stream.mjs) and the page's route table (`world.route`, `world.fetchOther`).
 *
 * `uiPage(t, options)` loads the page and answers a handle that mounts slot entries as DSH renders
 * them and finds the rendered nodes by their public hooks. The shell services the brand part needs
 * (`sessions`, `uiSession`, `uiWorkspace`) are `shellServices()`, provided only when a case asks.
 */
import path from 'node:path'
import { eventSourceClass } from 'fishball-test-helpers/event-source'
import { findAll, snapshotStore, textOf } from 'fishball-test-helpers/react-shim'
import { createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { isPageStream, topicView } from './page-stream.mjs'

const DIR = path.join(import.meta.dirname, '..', '..')

/** fishball-ui's own files, located from this package folder. */
export const UI = Object.freeze({
  dir: DIR,
  id: 'fishball-ui',
  client: path.join(DIR, 'client.js'),
  file: (...parts) => path.join(DIR, ...parts),
})
/** fishball-ui's browser half as a scripted page loads it. */
export const UI_CLIENT = Object.freeze({ id: UI.id, file: UI.client })

/** DSH's shell service names the brand part injects beside the page's own (dsh-client-ui-* services). */
export const SHELL_SERVICE = Object.freeze({ sessions: 'sessions', uiSession: 'uiSession', uiWorkspace: 'uiWorkspace' })
export const UNKNOWN_SESSION = 'unknown session'

/**
 * DSH's session services as the brand part reads them: `sessions.list` (a `{byId}` snapshot store),
 * `uiSession.adapter.current` (`{key}`) and `uiWorkspace.openSession`, which records every call and
 * rejects the first `openFails` with "unknown session" (as DSH does for an id not yet listed).
 */
export function shellServices({ openFails = 0 } = {}) {
  const sessions = snapshotStore({ byId: {} })
  const current = snapshotStore({ key: null })
  const opens = []
  const attempts = []
  let failures = openFails
  const services = {
    [SHELL_SERVICE.sessions]: { list: sessions },
    [SHELL_SERVICE.uiSession]: { adapter: { current } },
    [SHELL_SERVICE.uiWorkspace]: {
      async openSession(id) {
        opens.push(id)
        if (failures > 0) { failures -= 1; attempts.push({ id, ok: false, error: UNKNOWN_SESSION }); throw new Error(UNKNOWN_SESSION) }
        attempts.push({ id, ok: true })
        current.set({ key: id })
      },
      async archiveSession() {}, async startSession() {}, async forkSession() {},
    },
  }
  return { services, sessions, current, opens, attempts }
}

const has = (node, name) => node.props[name] !== undefined && node.props[name] !== false
/** The single-slot winner as DSH's slots elect it: the lowest priority renders. */
export const winnerOf = (entries) => [...entries].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]

/** A world with fishball-ui's client and a fresh EventSource stand-in; `createWorld` options pass through. */
export function uiWorld({ clients = [UI_CLIENT], ...options } = {}) {
  const sources = eventSourceClass()
  const world = createWorld({ clients, ...options })
  world.EventSource = sources.EventSource
  return { world, sources }
}

/**
 * Load fishball-ui's page. `prepareWorld(world, sources)` runs before any script (marks on <html>,
 * routes, onDocument, onSandbox); every other option is `createWorld`'s.
 */
export async function uiPage(t, { prepareWorld, ...options } = {}) {
  const { world, sources } = uiWorld(options)
  prepareWorld?.(world, sources)
  const page = await loadPage(t, world)
  const mounted = new Map()
  const tree = () => [...mounted.values()].flat().flatMap((key) => world.shim.treeOf(key))
  const handle = {
    world, page, sources,
    settle: () => page.settled(),
    /** The open page connections, and every one ever made. */
    carriers: () => sources.opened.filter((s) => !s.closed && isPageStream(s, world.base)),
    madeCarriers: () => sources.opened.filter((s) => isPageStream(s, world.base)),
    /** One topic's view of every open page connection. */
    views: (topic) => handle.carriers().map((s) => topicView(s, topic)),
    async deliver(topic, frame) { for (const v of handle.views(topic)) v.deliver(frame); await page.settled() },
    async deliverRaw(topic, text) { for (const v of handle.views(topic)) v.deliverRaw(text); await page.settled() },
    /** Every open page connection errors: CLOSED when `closed`, else CONNECTING (the browser retries). */
    async fail(closed) { for (const s of handle.carriers()) s.fail({ closed }); await page.settled() },
    /** Render one slot's winner (`pick` chooses another entry) as root `key`, with the owner props. */
    async mount(key, slotName, ownerProps = {}, pick = winnerOf) {
      world.shim.mount(key, () => { const entry = pick(world.entries(slotName)); return entry ? world.renderEntry(entry, ownerProps) : null })
      mounted.set(key, [key])
      await page.settled()
    },
    /** Render every entry of a list slot, each under its own root. */
    async mountAll(key, slotName, ownerProps = {}) {
      const keys = world.entries(slotName).map((entry, i) => { const at = key + i; world.shim.mount(at, () => world.renderEntry(entry, ownerProps)); return at })
      mounted.set(key, keys)
      await page.settled()
    },
    async unmount(key) { for (const at of mounted.get(key) ?? []) world.shim.unmountRoot(at); mounted.delete(key); await page.settled() },
    /** The nodes of the roots this handle mounted (all roots: `page.all()`). */
    tree,
    nodes: (among = tree()) => findAll(among, () => true),
    byHook: (name, value, among = handle.nodes()) => among.filter((n) => has(n, name) && (value === undefined || String(n.props[name]) === String(value))),
    /** The node and every node below it ([] for none). */
    within: (node) => (node ? findAll([node], () => true) : []),
    text: (node) => (node ? textOf(node) : tree().map(textOf).join(' ')),
    press: (node) => page.press(node),
    /** DSH's UI language changes live. */
    async setLang(lang) { world.setLang(lang); await page.settled() },
  }
  return handle
}
