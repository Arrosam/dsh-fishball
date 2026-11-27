/**
 * A scripted main page for a REAL host DSH (R-EMBED definition of done: "the same UI renders from
 * embed-UI on both SDKs"). No browser.
 *
 * What is real: the host DSH (support/host.mjs, this checkout's packages linked into its profile),
 * its boot graph (`__DSH_BOOT__`), every non-SDK client bundle and package-local chunk it serves,
 * fetched from its own origin with the owner's cookie, and the SDK's own Cordis `Context`, which
 * applies each client plugin with its declared `inject` list.
 *
 * What is scripted: the DOM (support/browser-sandbox.mjs), React and the primitives (the shims the
 * R-CORE page uses), and the page services the V2 main clients inject: `slots`, `locale` and
 * `layout` from the R-CORE page, plus `configForms`, which serves every settings namespace so the
 * Plugins cards register (they register only while the Host serves their row's namespace), and
 * `pluginNavigation` (dsh-client-ui-plugin-manager), which records every `openBundle` / `openList`
 * call in `navigations` (#77: the window's Retry link opens the instance's settings page). Network
 * reads such as the connector's EventSource are absent: a contribution that waits for state
 * (the sidebar fish) is not counted, only contributions registered at apply time.
 *
 * Observation points: the graph entries and their served sources, the plugins and their fiber
 * states, every slot registration with the graph entry that made it, and page console errors.
 */
import { createBrowserSandbox } from 'dsh-connector-test-helpers/page/browser-sandbox'
import { createReactShim } from 'dsh-connector-test-helpers/page/react-shim'
import { fakePrimitives } from 'dsh-connector-test-helpers/page/primitives'
import { applyPlugins, moduleTable } from 'dsh-connector-test-helpers/page/client-graph'
import { BOOT, BUDGET, HTTP, ROUTE, runtimeOf } from 'dsh-connector-test-helpers/page/boot'
import { FIBER, pageServices, servedSource } from 'dsh-connector-test-helpers/page/services'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PAGE } from './constants.mjs'

const settle = async () => { for (let i = 0; i < BUDGET.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }

/**
 * The page's transport: `host.send` when the caller gives one (U-SHELL opens the page under another
 * hostname of the same listener), else the process's fetch.
 */
const sendOf = (host) => host.send ?? fetch

/** One GET at the host's own origin with the owner's cookie, as same-origin page code sends it. */
async function hostGet(host, pathname) {
  const response = await sendOf(host)(host.origin + pathname, { headers: { cookie: host.cookie, ...HTTP.sameOrigin } })
  return { status: response.status, text: await response.text() }
}

/** The host's boot graph: every non-SDK client entry (Fishball's and any other plugin's). */
export async function hostGraph(host) {
  const html = (await hostGet(host, ROUTE.childRoot)).text
  const match = BOOT.graph.exec(html)
  if (!match) throw new Error('the host page carries no __DSH_BOOT__ graph')
  return JSON.parse(match[1]).entries.filter((entry) => !entry.id.startsWith(BOOT.sdkScope))
}

/**
 * `configForms` as the Plugins cards use it: `get(ns)` hands a form scope, `whileServed(ns, fn)`
 * runs `fn` at once (every namespace counts as served here) and returns its disposer.
 */
function configForms() {
  const form = () => ({ getSnapshot: () => ({ value: {}, revision: 0 }), subscribe: () => () => {}, set: async () => ({ ok: true }), dispose() {} })
  return {
    get: (ns) => form(ns),
    whileServed(_namespaces, register) { const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } },
  }
}

/**
 * The Plugins cards build their forms from ui-primitives' `SettingsFormModel` (and field helpers
 * such as `settingsNumberField`) at apply time, before registering. The shared fake primitives
 * (support/set-panel.mjs) make every export a component, so a card would throw before its
 * registration. This page answers those two names with a stand-in that holds no values and writes
 * nothing; only "did the card register" is observed here, never its form.
 */
class FormModelStandIn {
  bind(snapshot) { return { getSnapshot: snapshot, subscribe: () => () => {} } }
  shell() { return {} }
  field() { return {} }
  actions() { return {} }
  dispose() {}
}
const FORM_EXPORTS = Object.freeze({ SettingsFormModel: FormModelStandIn, settingsNumberField: (field) => field })
function primitivesWithForms(primitives) {
  return new Proxy(primitives, { get: (target, name) => (Object.hasOwn(FORM_EXPORTS, name) ? FORM_EXPORTS[name] : target[name]) })
}

/**
 * Load the host's client bundles into one scripted page and apply them.
 * @param t - node:test context (cleanup).
 * @param options.sdk - the SDK whose Cordis applies the plugins.
 * @param options.host - a booted host handle (support/host.mjs), or `{ origin, cookie, send }` where
 *   `send(url, init)` is the page's fetch (the page is then opened at `origin`).
 * @param options.prepare - `(page) => void`, run on the browser sandbox before any script (for example to
 *   install recording `localStorage` / `sessionStorage` globals or a `document.cookie` accessor).
 * @param options.lang - the page language at open (PAGE.lang by default); `setLang` changes it later.
 * @returns {{ graph, scripts, plugins, failed(), registrations, errors, navigations, entries(slot), mount(entry, props), setLang(lang) }}
 *   registrations: every slot entry as { slot, id?, key?, owner, options, disposed } where owner is the graph entry that
 *   registered it and `disposed` turns true when that registration is withdrawn;
 *   entries(slot): the registered `{ options, Component }` of a slot; mount: render one entry in its own
 *   root, returning `{ tree(), unmount() }` (the tree follows the entry's later state).
 */
export async function openMainPage(t, { sdk, host, prepare = () => {}, lang = PAGE.lang }) {
  const errors = []
  const baseURI = host.origin + ROUTE.childRoot
  const pageFetch = async (input, init = {}) => sendOf(host)(new URL(String(input instanceof Request ? input.url : input), baseURI), { ...init, headers: { ...(init.headers ?? {}), cookie: host.cookie, ...HTTP.sameOrigin } })
  const pageConsole = { ...console, error: (...args) => errors.push(args.map(String).join(' ')), warn: () => {}, log: () => {}, info: () => {}, debug: () => {} }
  const page = createBrowserSandbox({ lang, baseURI, fetch: pageFetch, console: pageConsole })
  prepare(page)
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const platform = {
    [BOOT.platform.react]: React,
    [BOOT.platform.reactDom]: { createPortal: (node) => node },
    [BOOT.platform.primitives]: primitivesWithForms(fakePrimitives(React)),
  }

  const graph = await hostGraph(host)
  const scripts = []
  const runScript = async (id, url, entry) => {
    const target = new URL(url, baseURI)
    const response = await hostGet(host, target.pathname + target.search)
    if (response.status !== 200) throw new Error('the host did not serve ' + target.pathname + ' (' + response.status + ')')
    scripts.push({ id, url: target.pathname, source: servedSource(response.text), entry })
    page.run(response.text, target.pathname, target.href)
  }
  for (const entry of graph) await runScript(entry.id, entry.url, true)
  const table = moduleTable({ page, platform, graph, loadChunk: (ownerId, file, row) => runScript(ownerId, BOOT.chunkUrl(ownerId, file, row.rev), false) })

  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const navigations = []
  const pluginNavigation = { openBundle: (name) => { navigations.push({ openBundle: name }) }, openList: () => { navigations.push({ openList: true }) } }
  const services = { ...pageServices(shim, lang), configForms: configForms(), pluginNavigation }
  // The user's language choice: the snapshot, its listeners and `resolveText` (DSH's own API for
  // picking a language's text) follow `setLang`. The registered dictionaries' words stay the
  // open-time language's; only the language a client reads and reacts to is observed here.
  const language = { active: lang, revision: 0, listeners: new Set() }
  const snapshot = () => ({ active: language.active, revision: language.revision })
  services.locale = {
    ...services.locale,
    getSnapshot: snapshot,
    getLocale: snapshot,
    subscribe(fn) { language.listeners.add(fn); return () => language.listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[language.active] ?? text?.en),
  }
  // One root per graph entry, all over the same page services, with a `slots` face that records the
  // entry: every registration is attributed to the bundle that made it. The V2 main clients share no
  // Cordis service with each other, so separate roots change nothing they see.
  const registrations = []
  const plugins = []
  for (const entry of graph) {
    const root = new Context()
    const slots = {
      ...services.slots,
      register(options, Component) {
        const record = { slot: options.name, id: options.id, key: options.key, owner: entry.id, options, disposed: false }
        registrations.push(record)
        const dispose = services.slots.register(options, Component)
        return () => { record.disposed = true; dispose() }
      },
    }
    for (const name of PAGE.services) root.provide(name, name === 'slots' ? slots : services[name])
    plugins.push(...applyPlugins(root, [entry], table, errors))
  }
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
  })
  await settle()
  let mounted = 0
  return {
    graph, scripts, registrations, errors, navigations,
    entries: (slot) => services.entries.get(slot) ?? [],
    async mount(entry, props = {}) {
      const key = 'entry-' + ++mounted
      shim.mount(key, () => React.createElement(entry.Component, props))
      await settle()
      return { tree: () => shim.treeOf(key), unmount: () => shim.unmountRoot(key) }
    },
    async setLang(next) {
      language.active = next
      language.revision += 1
      page.document.documentElement.lang = next
      for (const fn of [...language.listeners]) fn()
      shim.rerender()
      await settle()
    },
    /**
     * Wait until `done(registrations)` holds or the budget ends: the moved parts are package-local
     * chunks the entry loads with require.async, so their slots arrive after the network fetches.
     */
    async waitFor(done) {
      const deadline = Date.now() + BUDGET.readyMs
      while (Date.now() < deadline && !done(registrations)) await new Promise((resolve) => setTimeout(resolve, BUDGET.pollMs))
      return done(registrations)
    },
    plugins: plugins.map((p) => ({ id: p.id, inject: p.inject, state: p.fiber.state })),
    failed: () => plugins.filter((p) => p.fiber.state === FIBER.failed).map((p) => p.id),
  }
}
