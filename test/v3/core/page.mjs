/**
 * A scripted settings page for a REAL hosted child (HOST-UC-08 level "integration: child DSH with a
 * scripted settings page"). No browser.
 *
 * What is real: the host DSH (support/host.mjs, the instance row of this checkout), the child it
 * starts, the child's own boot graph (`__DSH_BOOT__`) and every Fishball client bundle and
 * package-local chunk the child serves, each fetched from the child's origin with the child's own
 * admission cookie; the child's routes the scripts call; and the SDK's own Cordis `Context`, which
 * applies the client plugins with their declared `inject` lists, so plugin-to-plugin services (such
 * as core's settings-section extension point) resolve as they do in the child's page.
 *
 * What is scripted: the DOM (support/browser-sandbox.mjs), React (the hook shim of
 * support/rp-recommend.mjs) and the three DSH page services the V2 panel injects (`slots`, `layout`,
 * `locale`), modelled on dsh-client-ui-renderer's SlotRegistry face (register/inject/entries) and
 * dsh-client-locale (register/bind/subscribe). Other DSH services are absent, so a plugin that needs
 * one stays pending: only plugins whose injects this page meets apply, and that is recorded.
 *
 * The extension point's contract (a section's mount and unmount, R-CORE (3)) is frozen only later
 * (K3), so a section's output is observed wherever it lands: in the panel's React tree, in a host
 * element the panel hands to `mount` (a scripted element, support/body-soul-dom.mjs), or in a React
 * root a section creates there (`react-dom/client`). All three are read as one tree.
 *
 * Observation points: the rendered `main` slot entry of the settings panel (data attributes, text,
 * roles), the header entry, every request the page makes, page console errors and plugin failures.
 * Actions (I-PLACE's K3 `unmount` rows): close and reopen the panel, dispose one client plugin.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../support/browser-sandbox.mjs'
import { applyPlugins, moduleTable } from '../shared/client-graph.mjs'
import { FakeElement } from '../../support/body-soul-dom.mjs'
import { createReactShim, findAll, textOf } from '../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../support/set-panel.mjs'
import { BOOT, BUDGET, HTTP, MARK, ROUTE, SLOT, runtimeOf } from './constants.mjs'

/** Cordis fiber states (cordis lib/types/fiber.d.ts, both SDKs). */
const FIBER = Object.freeze({ pending: 0, active: 2, failed: 3 })

/** The served bundle text without DSH's source-map trailer (dsh-client-modules appends `\n;\n//# sourceMappingURL=…`). */
const TRAILER = /\s*;?\s*\/\/# sourceMappingURL=\S*\s*$/
export const servedSource = (text) => text.replace(TRAILER, '').trimEnd()

/** A scripted element as a node of the observed tree: tag, attributes (data-* from dataset too) and children. */
function elementNode(element) {
  const dataset = Object.fromEntries(Object.entries(element.dataset).map(([k, v]) => ['data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v]))
  const props = { ...element.attributes, ...dataset }
  return { tag: element.tagName.toLowerCase(), props, children: element.childNodes.map((child) => (typeof child === 'string' ? child : elementNode(child))) }
}

const settle = async () => { for (let i = 0; i < BUDGET.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }

/** The child origin and its cookie, through the host's embed admission (the way the frame reaches it). */
export async function admitChild(host) {
  const admission = await fetch(host.origin + ROUTE.embed, { headers: { cookie: host.cookie, ...HTTP.sameOrigin }, redirect: 'manual' })
  await admission.arrayBuffer()
  const location = admission.headers.get('location')
  if (admission.status !== HTTP.seeOther || !location) throw new Error('the host did not admit to the child (status ' + admission.status + ')')
  const login = await fetch(location, { redirect: 'manual' })
  await login.arrayBuffer()
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('the child admission set no cookie')
  return { origin: new URL(location).origin, cookie }
}

/** One GET or POST at the child's own origin, with its cookie, as same-origin page code would send it. */
export async function childRequest(child, method, pathname, body) {
  const response = await fetch(child.origin + pathname, {
    method,
    headers: { cookie: child.cookie, origin: child.origin, ...HTTP.sameOrigin, 'content-type': 'application/json' },
    body,
  })
  const text = await response.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, text, json }
}

/** The child's boot graph: the non-SDK client entries (Fishball's and any other plugin's). */
export async function bootGraph(child) {
  const html = (await childRequest(child, 'GET', ROUTE.childRoot)).text
  const match = BOOT.graph.exec(html)
  if (!match) throw new Error('the child page carries no __DSH_BOOT__ graph')
  return JSON.parse(match[1]).entries.filter((entry) => !entry.id.startsWith(BOOT.sdkScope))
}

/** The scripted page services (see the header): slots, layout, locale. Also used by the R-EMBED main page. */
export function pageServices(shim, lang) {
  const entries = new Map()
  const bump = () => shim.rerender()
  const slots = {
    register(options, Component) {
      const list = entries.get(options.name) ?? []
      entries.set(options.name, list)
      const entry = { options, Component }
      list.push(entry)
      bump()
      return () => { const at = list.indexOf(entry); if (at >= 0) { list.splice(at, 1); bump() } }
    },
    // The slot is always declared here, so the injection runs once and its effect is disposed with it.
    // An effect is a disposer or, from a generator callback, an iterable of disposers (the V2 main clients yield several).
    inject(_name, callback) {
      const effect = callback()
      const disposers = typeof effect === 'function' ? [effect] : effect && typeof effect[Symbol.iterator] === 'function' ? [...effect] : []
      return () => { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose() }
    },
    entries: (name) => [...(entries.get(name) ?? [])],
    entriesOfSlot: (name) => [...(entries.get(name) ?? [])],
    subscribe: () => () => {},
    getVersion: () => 0,
  }
  const dictionaries = new Map()
  const listeners = new Set()
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = dicts?.[lang]?.[key] ?? dicts?.en?.[key] ?? key
    return params && typeof template === 'string' ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  const locale = {
    register(ns, dicts) { dictionaries.set(ns, dicts); bump(); return () => { if (dictionaries.get(ns) === dicts) dictionaries.delete(ns) } },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => ({ active: lang, revision: 0 }),
    getLocale: () => ({ active: lang, revision: 0 }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[lang] ?? text?.en),
  }
  let active = null
  const layout = {
    panelInfo: { getSnapshot: () => ({ activePanelId: active }), subscribe: () => () => {} },
    selectPanel(id) { active = id; bump() },
    toggleSidebar() {},
  }
  return { slots, locale, layout, entries }
}

/**
 * Load the child's Fishball client bundles into one scripted page and render the settings panel.
 * @param t - node:test context (cleanup).
 * @param options.sdk - the SDK whose Cordis applies the plugins.
 * @param options.child - { origin, cookie } from admitChild.
 * @param options.lang - page language.
 * @param options.exclude - `(entry, source) => boolean`: graph entries this page does not load (the
 *   "no section registered" partition leaves out the instance's hosted-section bundle).
 * @param options.plugins - extra client plugins (`{name, inject, apply}`) applied in the same Cordis
 *   root after the child's own, as a third-party client plugin of the child would be (K3's probe section).
 * @returns { panel: rendered host tree of the main settings entry, or null; header; entries; plugins; requests; errors; byAttr; text }
 */
export async function openSettingsPage(t, { sdk, child, lang = 'en', exclude = () => false, plugins: extra = [] }) {
  const requests = []
  const errors = []
  const baseURI = child.origin + ROUTE.childRoot
  // The page's fetch is the real network to the child, with the child's cookie (a same-origin page sends it).
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), baseURI)
    const method = String(init.method ?? 'GET').toUpperCase()
    requests.push({ method, pathname: url.pathname })
    const headers = { ...(init.headers ?? {}), cookie: child.cookie, ...HTTP.sameOrigin }
    if (url.origin === child.origin) headers.origin = child.origin
    return fetch(url, { ...init, headers })
  }
  const pageConsole = { ...console, error: (...args) => errors.push(args.map(String).join(' ')), warn: () => {}, log: () => {}, info: () => {}, debug: () => {} }
  const page = createBrowserSandbox({ lang, baseURI, fetch: pageFetch, console: pageConsole })
  // Host elements a component holds by ref: one scripted element per rendered position, handed over
  // during render (support/rp-recommend.mjs observe.hostRef), so a panel can mount a section into it.
  const elements = new Map()
  const hostRef = (key, tag, props) => {
    if (!elements.has(key)) elements.set(key, Object.assign(new FakeElement(tag, page.document), { style: {}, remove() {} }))
    const element = elements.get(key)
    if (typeof props.ref === 'function') props.ref(element)
    else if (props.ref && typeof props.ref === 'object') props.ref.current = element
  }
  page.document.createElement = (tag) => Object.assign(new FakeElement(tag, page.document), { style: {}, remove() {} })
  const shim = createReactShim({ stale() {}, hostRef })
  const { React } = shim
  // A React root a section creates in a host element renders through the same shim, keyed by that element.
  const rootsAt = new Map()
  const reactDomClient = {
    createRoot(element) {
      const key = 'section-root-' + rootsAt.size
      rootsAt.set(element, key)
      return { render(node) { shim.mount(key, () => node) }, unmount() { shim.unmountRoot(key) } }
    },
  }
  const platform = {
    [BOOT.platform.react]: React,
    [BOOT.platform.reactDom]: { createPortal: (node) => node, ...reactDomClient },
    [BOOT.platform.reactDomClient]: reactDomClient,
    [BOOT.platform.primitives]: fakePrimitives(React),
  }

  const fullGraph = await bootGraph(child)
  const fetchScript = async (url) => {
    const target = new URL(url, baseURI)
    const response = await childRequest(child, 'GET', target.pathname + target.search)
    if (response.status !== 200) throw new Error('the child did not serve ' + target.pathname + ' (' + response.status + ')')
    return { text: response.text, target }
  }
  const graph = []
  const excluded = []
  /** Every script this page ran, as served (trailer removed): { id, url, source, entry } (`entry`: a graph entry's own script, not a chunk). */
  const scripts = []
  for (const entry of fullGraph) {
    const { text, target } = await fetchScript(entry.url)
    if (exclude(entry, servedSource(text))) { excluded.push(entry.id); continue }
    graph.push(entry)
    scripts.push({ id: entry.id, url: target.pathname, source: servedSource(text), entry: true })
    page.run(text, target.pathname, target.href)
  }
  const loadScript = async (id, url) => {
    const { text, target } = await fetchScript(url)
    scripts.push({ id, url: target.pathname, source: servedSource(text), entry: false })
    page.run(text, target.pathname, target.href)
  }

  // Every package-local chunk load still in flight. A chunk is a real fetch from the DSH under test
  // (core's client loads its settings panel, client.settings.js, this way), so how long it takes
  // depends on that DSH's load; a fixed number of settle rounds raced it under gate load
  // (HOST-UC-08 A3 saw no panel). The page waits for these loads instead.
  const chunkLoads = new Set()
  const loadChunk = (ownerId, file, row) => {
    const load = loadScript(ownerId, BOOT.chunkUrl(ownerId, file, row.rev))
    chunkLoads.add(load)
    load.finally(() => chunkLoads.delete(load)).catch(() => {})
    return load
  }
  /** Settle until no chunk load is in flight (a started chunk may load another). Failures stay the plugin's own. */
  const settleChunks = async () => {
    await settle()
    while (chunkLoads.size > 0) {
      await Promise.allSettled([...chunkLoads])
      await settle()
    }
  }
  // The module table and the plugin apply: shared with the R-EMBED main page (../shared/client-graph.mjs).
  const table = moduleTable({ page, platform, graph, loadChunk })

  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  const services = pageServices(shim, lang)
  for (const name of BOOT.services) root.provide(name, services[name])
  const plugins = applyPlugins(root, graph, table, errors)
  for (const plugin of extra) plugins.push({ id: plugin.name, inject: plugin.inject ?? [], fiber: root.plugin(plugin) })
  // Unmount and stop the page's timers before the plugins go: a render or poll after a fiber's
  // disposal would read a service from an inactive Cordis context.
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
  })
  await settleChunks()

  const mainEntries = services.entries.get(SLOT.main) ?? []
  const render = (Component) => {
    if (!Component) return null
    shim.mount('panel', () => React.createElement(Component, {}))
    return shim.tree()
  }
  // The settings panel is the main entry that renders the panel marker (wherever core keys it).
  let panel = null
  for (const entry of mainEntries) {
    const tree = render(entry.Component)
    if (findAll(tree, (n) => n.props[MARK.panel] !== undefined).length > 0) { panel = entry; break }
  }
  if (panel) shim.mount('panel', () => React.createElement(panel.Component, {}))
  else shim.unmountRoot('panel')
  await settle()
  // The panel's own tree plus whatever was mounted into its host elements or section roots.
  const tree = () => (panel ? [...shim.tree(), ...[...elements.values()].map(elementNode)] : [])
  const byAttr = (name, value) => findAll(tree(), (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value)))
  /** Render one slot entry alone (its own root) and return its host tree. */
  const renderAlone = async (entry) => {
    shim.mount('alone', () => React.createElement(entry.Component, {}))
    await settle()
    const rendered = shim.treeOf('alone')
    shim.unmountRoot('alone')
    return rendered
  }
  return {
    renderAlone,
    entriesOf: (name) => services.entries.get(name) ?? [],
    panel, tree, byAttr, requests, errors, graph, excluded, scripts,
    header: services.entries.get(SLOT.header) ?? [],
    plugins: plugins.map((p) => ({ id: p.id, inject: p.inject, state: p.fiber.state })),
    failed: () => plugins.filter((p) => p.fiber.state === FIBER.failed).map((p) => p.id),
    text: () => tree().map(textOf).join(' '),
    /** Wait for an element with `attribute` to appear (the status line polls the child). */
    async waitFor(attribute) {
      const deadline = Date.now() + BUDGET.readyMs
      while (Date.now() < deadline && byAttr(attribute).length === 0) await new Promise((resolve) => setTimeout(resolve, BUDGET.pollMs))
      return byAttr(attribute)
    },
    async press(node) {
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settle()
    },
    /** Let the page settle (promises, re-renders). */
    settled: settle,
    /** Close the panel: its main slot entry leaves the page, as when the owner selects another panel. */
    async close() { shim.unmountRoot('panel'); await settle() },
    /** Open the panel again after close(). */
    async reopen() { if (panel) shim.mount('panel', () => React.createElement(panel.Component, {})); await settle() },
    /** Dispose one applied client plugin's fiber (a plugin's disposal, as DSH does at its unload). */
    async disposePlugin(id) {
      const found = plugins.find((p) => p.id === id)
      if (!found) throw new Error('no applied plugin ' + id)
      await found.fiber.dispose()
      await settle()
    },
  }
}

export { FIBER }
