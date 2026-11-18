/**
 * The U-DRAW world: one connector DSH host process and one main page, both in this test process,
 * per case. Nothing is launched and nothing is written to disk.
 *
 * Host half (real): the SDK's Cordis and plugin loader (as the C-EXT and C-UI-BACKEND suites build
 * them); a connector row (`cordis:` built-in) running the real C-EXT `createContributions` and the
 * real C-UI-BACKEND `createUiBackend` over a FakeHandover (K3, the C-UI-BACKEND suite's fake); an
 * instance row providing a fake `dshInstanceChild` (K3); and embed-UI's own host entry
 * (`packages/dsh-connector-ui/index.js`) loaded as a loader row BY FILE URL, so its loader entry is
 * its package and C-EXT traces the contributed namespace to `dsh-connector-ui` (R-EXT-03). The
 * URL carries the SDK tag of test/private-skills/support/sdk.mjs, so its `@deepseek-ai/*` imports
 * bind to the SDK under test.
 *
 * Fake on the host: DSH's `connection` service (a route table: `fetch.register({path, methods,
 * fetch, requestBody})`), `appReady` (fired by the case), the K3 services, and the V2 connector
 * service of the legacy fallback (dev correction 2026-11-16).
 *
 * Browser half (real code, scripted page): every file of `src/client/` runs unread in a node:vm
 * page (test/support/browser-sandbox.mjs) through the module table DSH's loader gives a client
 * (../../contract/package-boundaries/client-graph.mjs), and the SDK's Cordis applies the plugin
 * over the five client services it uses. React is the hook shim of test/support/rp-recommend.mjs
 * (no React is installed in this checkout). The page's `fetch` and `EventSource` are answered by
 * the host's route table, so the page talks to the real UI backend exactly through the routes.
 *
 * Observation points: the host's log records (cordis exporter), its route table, the C-EXT tool
 * list and calls, the fakes' call records, the page's requests, slot registrations, rendered trees
 * and the client service calls (pluginNavigation, locale registrations).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { HARNESS } from '../../../private-skills/support/constants.mjs'
import { importInstance, importSdk } from '../../../private-skills/support/sdk.mjs'
import { INSTANCE } from '../../../support/constants.mjs'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../../support/set-panel.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { FakeHandover, recordingLogger, row } from '../../dsh-connector/ui/fakes.mjs'
import { SUBJECT as BACKEND_SUBJECT } from '../../dsh-connector/ui/constants.mjs'
import { ADMIT, ATTR, BACKEND, CHILD, DIAGNOSTIC, DSH, EMBED, FIXTURE, K2, PAGE_HOST, ROUTE, SERVICE, SLOT, TAG, TEXT, WAIT } from './constants.mjs'

export { row }

const settle = async (rounds = WAIT.settleRounds) => { for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Polls `predicate` until it holds or `ms` pass (a harness wait, never an oracle); returns its last value. */
export async function until(predicate, ms = WAIT.settleMs) {
  const end = Date.now() + ms
  for (;;) {
    const value = await predicate()
    if (value || Date.now() >= end) return value
    await sleep(WAIT.pollMs)
  }
}

/** A module of this checkout bound to `sdk` (sdk.mjs tags every repository import). */
const importBound = (sdk, file) => importInstance(sdk, path.relative(INSTANCE.dir, file))
/** The URL embed-UI's host entry is loaded by: a file URL with the SDK tag, so C-EXT finds its package.json. */
const embedUrl = (sdk) => { const url = new URL(pathToFileURL(EMBED.hostEntry)); url.searchParams.set(HARNESS.versionTag, sdk); return url.href }

// ---------------------------------------------------------------------------------------------
// Host fakes
// ---------------------------------------------------------------------------------------------

/**
 * DSH's `connection` service as the host rows see it: `fetch.register` adds a route and returns
 * its disposer. `dispatch` answers one request the way DSH routes it (by exact path, then method).
 * DSH's owner-only fence and Host/Origin checks are not modelled: no case here depends on them.
 */
function createConnection() {
  const routes = []
  const fetchFace = {
    register(route) {
      const entry = { ...route, live: true }
      routes.push(entry)
      return () => { entry.live = false }
    },
  }
  const live = () => routes.filter((r) => r.live)
  async function dispatch(method, url, { body, headers = {} } = {}) {
    const target = new URL(url)
    const route = live().find((r) => r.path === target.pathname)
    if (!route) return new Response(null, { status: ROUTE.notFound })
    if (Array.isArray(route.methods) && !route.methods.includes(method)) return new Response(null, { status: ROUTE.methodNotAllowed })
    const init = { method, headers: { host: target.host, ...headers } }
    if (body !== undefined && method !== 'GET') init.body = body
    return route.fetch(new Request(target, init))
  }
  return { service: { fetch: fetchFace }, routes: live, paths: () => live().map((r) => r.path), dispatch }
}

/** K3 `dshInstanceChild` (child.d.ts): the rules the cases lean on, and a record of every call. */
function createChild({ apiVersion = SERVICE.apiVersion, status = CHILD.ready } = {}) {
  const listeners = new Set()
  const child = {
    status: { ...status },
    admissions: [],
    retries: 0,
    /** Changes the state and notifies, as the locator does on a lifecycle change. */
    set(next) { child.status = { ...next }; for (const fn of [...listeners]) { try { fn() } catch { /* a listener's failure is its own */ } } },
  }
  const refusal = (code) => Object.assign(new Error(code), { code })
  child.service = {
    apiVersion,
    status: () => ({ ...child.status }),
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    origin: (hostname) => (child.status.state === CHILD.ready.state ? `http://${hostname}:${ADMIT.port}` : null),
    async admit(request) {
      if (child.status.state !== CHILD.ready.state) throw refusal('not-ready')
      const url = `http://${request.hostname}:${ADMIT.port}${ADMIT.path}?${ADMIT.ticketParam}=${ADMIT.ticketPrefix}${child.admissions.length + 1}`
      child.admissions.push({ ...request, url })
      return { url }
    },
    // #77: embed-UI has no Retry of its own; a call here is a defect the cases count.
    async retry() { child.retries++ },
    targetStatus: () => ({ ...CHILD.connectedTarget }),
    providerSync: { status: () => ({ state: 'inactive' }), check: async () => ({ ok: false, error: { code: 'fbtest-off' } }), add: async () => ({ ok: false, error: { code: 'fbtest-off' } }) },
  }
  return child
}

/** `appReady` (dsh-cmdline AppReady): listeners wait until the case fires it. */
function createAppReady() {
  const listeners = new Set()
  return {
    service: { onReady(fn) { listeners.add(fn); return () => { listeners.delete(fn) } } },
    fire() { for (const fn of [...listeners]) fn(); listeners.clear() },
  }
}

// ---------------------------------------------------------------------------------------------
// The host world
// ---------------------------------------------------------------------------------------------

/**
 * @param options.ui - provide `dshConnectorUi` (default true); `uiApiVersion` overrides its apiVersion.
 * @param options.tools - provide `dshConnectorTools` (default true).
 * @param options.child - `null` for no instance row, else `{apiVersion, status, disabled}`.
 * @param options.legacy - provide the V2 `dshConnector` service (DECIDED.legacy).
 * @param options.appReady - `'none'` (no service: diagnostics at once) or `'pending'`.
 * @param options.embedFirst - load embed-UI's row before the connector row (UDRAW-ST-04 #5).
 * @param options.embed - false leaves embed-UI uninstalled (U-WIRE matrix).
 */
export async function hostWorld(t, sdk, options = {}) {
  const { ui = true, tools = true, uiApiVersion, child: childOptions = {}, legacy = false, appReady = 'none', embedFirst = false } = options
  const [{ Context }, { Loader }, contrib, uiModule] = await Promise.all([
    importSdk(sdk, DSH.cordis), importSdk(sdk, DSH.loader),
    importBound(sdk, BACKEND_SUBJECT.contribEntry), importBound(sdk, BACKEND_SUBJECT.entry),
  ])
  const ctx = new Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: DIAGNOSTIC.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: (m.args ?? []).map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') }) })
  await ctx.plugin(Loader)
  const loader = ctx.loader
  const connection = createConnection()
  ctx.provide(SERVICE.connection, connection.service)
  const ready = createAppReady()
  if (appReady === 'pending') ctx.provide(SERVICE.appReady, ready.service)
  const handover = new FakeHandover()
  const child = childOptions === null ? null : createChild(childOptions)

  const world = {
    sdk, ctx, loader, logs, connection, handover, child, ready,
    backend: undefined,
    registry: undefined,
    embedId: undefined,
    /** Log records of `type` whose text holds `needle`. */
    logsWith: (type, needle) => logs.filter((l) => l.type === type && l.text.includes(needle)),
    errors: () => world.logsWith(DIAGNOSTIC.errorType, DIAGNOSTIC.connectorMissing),
    warns: () => world.logsWith(DIAGNOSTIC.warnType, DIAGNOSTIC.instanceMissing),
    /** Every log record mentioning either diagnostic, any level. */
    diagnostics: (needle) => logs.filter((l) => l.text.includes(needle)),
    /** K2's public name of one of embed-UI's tools: `<alias>.<local>` (never hard-coded). */
    publicName: (local) => K2.publicNameOf(K2.namespaceOf(EMBED.name), local),
    names: () => world.registry?.list().map((tool) => tool.name) ?? [],
    /** One `tools/call` by the fixture agent; `undefined` for an unknown tool. */
    call: (local, args) => world.registry.call(world.publicName(local), args, { principal: FIXTURE.caller }),
    /** One request to a host route as the owner's page at `host` sends it: `{status, json, text}`. */
    async request(method, pathname, body, host = PAGE_HOST.loopback) {
      const url = PAGE_HOST.scheme + host + ':' + PAGE_HOST.port + pathname
      const response = await connection.dispatch(method, url, { body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } })
      const text = await response.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: response.status, json, text }
    },
    async setEmbed(disabled) { await loader.update(world.embedId, { disabled: disabled ? true : null }); await loader.await() },
    async setConnector(disabled) { await loader.update(world.connectorId, { disabled: disabled ? true : null }); await loader.await() },
    async close() { await ctx.fiber.dispose() },
  }
  t.after(() => world.close())

  loader.builtins.connector = {
    name: FIXTURE.connectorRow,
    inject: [SERVICE.connection],
    apply(cctx) {
      if (tools) {
        const contributions = contrib[BACKEND_SUBJECT.contribFactory]({
          mailbox: { commit: async () => ({ ok: false, code: K2.EMIT_REFUSAL.queueFull }), retire: async () => ({ retired: false }), retireContributor: async () => {} },
          router: { recipientFor: () => ({ recipient: null, fallback: K2.EMIT_REFUSAL.noAgent }) },
          sessionExists: () => false, onToolsChanged: () => {}, logger: cctx.logger(FIXTURE.connectorRow),
        })
        contributions.provide(cctx)
        world.registry = contributions
      }
      if (ui) {
        const backend = uiModule[BACKEND_SUBJECT.factory]({ handover, logger: recordingLogger() })
        // An apiVersion other than 1 is provided as a copy of the service with that version, over
        // the same routes: the partition is "a UI backend of another version" (Q-U1, K3).
        const provide = (name, value) => cctx.provide(name, uiApiVersion === undefined ? value : { ...value, apiVersion: uiApiVersion })
        backend.provide({ effect: (fn, label) => cctx.effect(fn, label), provide, connection: cctx.connection })
        world.backend = backend
      }
    },
  }
  loader.builtins.instance = { name: FIXTURE.instanceRow, apply(cctx) { cctx.provide(SERVICE.child, child.service) } }
  // The V2 connector service only marks presence (DECIDED.legacy): no V2 member is exercised here.
  loader.builtins.legacy = { name: SERVICE.legacy, apply(cctx) { cctx.provide(SERVICE.legacy, { fbtestLegacy: true }) } }

  const connectorRow = async () => { if (ui || tools) world.connectorId = await loader.create({ name: FIXTURE.builtinPrefix + 'connector' }) }
  const embedRow = async () => { if (options.embed !== false) world.embedId = await loader.create({ name: embedUrl(sdk) }) }
  if (child) await loader.create({ name: FIXTURE.builtinPrefix + 'instance', ...(childOptions?.disabled ? { disabled: true } : {}) })
  if (legacy) await loader.create({ name: FIXTURE.builtinPrefix + 'legacy' })
  await loader.await()
  for (const step of embedFirst ? [embedRow, connectorRow] : [connectorRow, embedRow]) { await step(); await loader.await() }
  await settle()
  return world
}

// ---------------------------------------------------------------------------------------------
// The scripted page
// ---------------------------------------------------------------------------------------------

/**
 * The primitives the browser half takes from `@deepseek-ai/dsh-client-ui-primitives`. The shared
 * fake (support/set-panel.mjs) makes Button a <button> and every other export a <div>; Menu and
 * Modal need behaviour to be observed, so they are modelled on their props as DSH's own clients
 * use them (dsh-client-ui-conversation Menu {open, onClose, items, onSelect, anchor}; Modal {open,
 * onClose, title, description, footer}). MenuItemButton is a role=menuitem <button> (the workspace
 * slot contract). The form model is a stand-in that holds nothing (the Plugins card is not tested).
 */
function primitivesFor(React) {
  const base = fakePrimitives(React)
  const h = React.createElement
  class FormModelStandIn { bind(snapshot) { return { getSnapshot: snapshot, subscribe: () => () => {} } } shell() { return {} } field() { return {} } actions() { return {} } dispose() {} }
  const own = {
    Menu: function Menu({ open, onClose, items = [], onSelect, anchor, children }) {
      const list = open ? h('div', { role: 'menu' }, items.map((item) => h('button', { key: item.id, type: 'button', role: ATTR.menuitem, [ATTR.menuItemId]: item.id, onClick: () => onSelect?.(item.id) }, item.label))) : null
      return h(React.Fragment, null, anchor, children, list, open ? h('button', { type: 'button', 'data-fbtest-menu-close': true, onClick: () => onClose?.() }) : null)
    },
    Modal: function Modal({ open, onClose, title, description, footer, children }) {
      if (!open) return null
      return h('div', { role: ATTR.dialog }, title, description, children, footer, h('button', { type: 'button', 'data-fbtest-modal-close': true, onClick: () => onClose?.() }))
    },
    // DSH's own row-menu entries hand MenuItemButton `onSelect` (dsh-client-ui-workspace, both SDKs); a click selects.
    MenuItemButton: function MenuItemButton({ children, separatorBefore, onSelect, icon, shortcut, ...rest }) { return h('button', { type: 'button', role: ATTR.menuitem, ...rest, onClick: rest.onClick ?? (() => onSelect?.()) }, icon, children) },
    SettingsFormModel: FormModelStandIn,
    settingsNumberField: (field) => field,
  }
  return new Proxy(base, { get: (target, name) => (Object.hasOwn(own, name) ? own[name] : target[name]) })
}

/** `configForms` as a Plugins card reads it: every namespace served, no values (the card is not under test). */
const configForms = () => ({
  get: () => ({ getSnapshot: () => ({ value: {}, revision: 0 }), subscribe: () => () => {}, set: async () => ({ ok: true }), dispose() {} }),
  whileServed(_ns, register) { const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } },
})

/**
 * The page's EventSource: a GET of the host route, read as server-sent events. Each `data:` frame
 * is one `message` event, as a browser's EventSource delivers it.
 */
function eventSourceClass(world, page) {
  return class PageEventSource {
    constructor(url) {
      this.url = new URL(String(url), page.baseURI).href
      this.readyState = 0
      this.listeners = new Map()
      this.closed = false
      page.streams.push(this)
      this.pump()
    }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn) }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
    emit(type, event) {
      if (this.closed) return
      this['on' + type]?.(event)
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event)
    }
    async pump() {
      const response = await world.connection.dispatch('GET', this.url)
      page.requests.push({ method: 'GET', path: new URL(this.url).pathname, body: undefined, stream: true })
      if (response.status !== 200 || !response.body) { this.readyState = 2; this.emit('error', {}); return }
      this.readyState = 1
      this.emit('open', {})
      this.reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        for (;;) {
          const chunk = await this.reader.read()
          if (chunk.done) break
          buffer += decoder.decode(chunk.value, { stream: true })
          let at
          while ((at = buffer.indexOf(BACKEND.frame.end)) >= 0) {
            const frame = buffer.slice(0, at)
            buffer = buffer.slice(at + BACKEND.frame.end.length)
            const data = frame.split('\n').filter((line) => line.startsWith(BACKEND.frame.prefix.trim())).map((line) => line.slice(BACKEND.frame.prefix.trim().length).replace(/^ /, '')).join('\n')
            this.emit('message', { data })
          }
        }
      } catch { /* a cancelled read ends the stream */ }
      if (!this.closed) { this.readyState = 2; this.emit('error', {}) }
    }
    close() { this.closed = true; this.readyState = 2; this.reader?.cancel().catch(() => {}) }
  }
}

/**
 * Open the main page at `host` and apply embed-UI's browser half.
 * @param options.host - the page's hostname (PAGE_HOST).
 * @param options.failServices - the services read fails (a network error), UDRAW-EP-02 row 5.
 * @param options.lang - the page language (TEXT.langs; default English).
 * @param options.holdChunks - R-FIX-CUI (UI-06): chunk files whose load waits until
 *   `releaseChunk(file)` (a chunk that arrives late; a permitted load order of the real entry).
 */
export async function openPage(t, world, { host = PAGE_HOST.loopback, failServices = false, withoutConfigForms = false, embed = true, lang = TEXT.langs[0], holdChunks = [], prepare = () => {}, adaptReact = (react) => react } = {}) {
  const baseURI = PAGE_HOST.scheme + host + ':' + PAGE_HOST.port + ROUTE.absolutePrefix
  const page = { baseURI, requests: [], chunks: [], streams: [], navigations: [], dictionaries: [], errors: [] }
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), baseURI)
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const body = typeof init.body === 'string' ? init.body : undefined
    page.requests.push({ method, path: url.pathname, body })
    if (failServices && url.pathname === ROUTE.services) throw new TypeError('fbtest: network error')
    return world.connection.dispatch(method, url.href, { body, headers: init.headers ?? {} })
  }
  const pageConsole = { ...console, error: (...args) => page.errors.push(args.map(String).join(' ')), warn() {}, log() {}, info() {}, debug() {} }
  const sandbox = createBrowserSandbox({ lang, baseURI, fetch: pageFetch, console: pageConsole })
  const frames = scriptedFrames(sandbox)
  const PageEventSource = eventSourceClass(world, page)
  sandbox.sandbox.EventSource = PageEventSource
  sandbox.window.EventSource = PageEventSource

  prepare(sandbox)
  const shim = createReactShim({ stale() {} })
  const React = adaptReact(shim.React)
  const platform = { [DSH.react]: React, [DSH.reactDom]: { createPortal: (node) => node }, [DSH.primitives]: primitivesFor(React) }
  const graph = embed ? [{ id: EMBED.moduleId, rev: EMBED.rev }] : []
  const chunkLoads = new Set()
  const runFile = (file) => sandbox.run(fs.readFileSync(path.join(EMBED.clientDir, file), 'utf8'), path.join(EMBED.clientDir, file), new URL(file, baseURI).href)
  const track = (load) => { chunkLoads.add(load); load.finally(() => chunkLoads.delete(load)).catch(() => {}) }
  // A held chunk's load is tracked only once released, so settling the page does not wait for it.
  const held = new Map()
  const loadChunk = (_owner, file) => {
    page.chunks.push(file)
    if (holdChunks.includes(file)) {
      let release
      const gate = new Promise((resolve) => { release = resolve })
      const load = gate.then(() => runFile(file))
      held.set(file, () => { track(load); release() })
      return load
    }
    const load = Promise.resolve().then(() => runFile(file))
    track(load)
    return load
  }
  if (embed) runFile(EMBED.clientEntry)
  const table = moduleTable({ page: sandbox, platform, graph, loadChunk })

  const { Context } = await importSdk(world.sdk, DSH.cordis)
  const root = new Context()
  const services = pageServices(shim, lang)
  const locale = { ...services.locale, register(ns, dicts) { page.dictionaries.push({ ns, dicts }); return services.locale.register(ns, dicts) } }
  const registrations = []
  const slots = {
    ...services.slots,
    register(options, Component) {
      const record = { slot: options.name, id: options.id, key: options.key, options, disposed: false }
      registrations.push(record)
      const dispose = services.slots.register(options, Component)
      return () => { record.disposed = true; dispose() }
    },
  }
  const pluginNavigation = { openBundle: (name) => page.navigations.push({ openBundle: name }), openList: () => page.navigations.push({ openList: true }) }
  const provided = { slots, locale, configForms: configForms(), pluginNavigation, layout: services.layout }
  for (const [name, value] of Object.entries(provided)) if (!withoutConfigForms || name !== 'configForms') root.provide(name, value)
  const plugins = applyPlugins(root, graph, table, page.errors)
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    for (const stream of page.streams) stream.close()
    sandbox.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
  })
  const settleAll = async () => { await settle(); while (chunkLoads.size > 0) { await Promise.allSettled([...chunkLoads]); await settle() } }
  await settleAll()
  // The browser half reads services, then opens its stream: give both their round trips.
  await until(async () => { await settleAll(); return registrations.length > 0 || page.requests.some((r) => r.path === ROUTE.services) }, WAIT.quietMs)
  await sleep(WAIT.quietMs)
  await settleAll()

  let mounted = 0
  const entries = (slot) => services.entries.get(slot) ?? []
  /**
   * The props DSH's renderer adds to an entry (dsh-client-ui-renderer `runInject` /
   * `bindInjectSources`, identical on both SDKs): the registration's `inject(key?)` face, where
   * every `hooks` source becomes a `use<Name>` selector hook (`standardHookPropName`) and every
   * other member is passed as it is; a session-scoped slot passes the Session id as `key`. The
   * renderer memoizes the face for the registration's life, so it is built once per entry here.
   * `t` is the entry's locale seat (`options.locale`).
   */
  const injectCache = new WeakMap()
  const hookName = (name) => 'use' + name[0].toUpperCase() + name.slice(1)
  const selectorHook = (source) => (select = (v) => v) => select(React.useSyncExternalStore((fn) => source.subscribe(fn), () => source.getSnapshot()))
  function injectedProps(entry, sessionId) {
    const cacheKey = entry.options
    if (!injectCache.has(cacheKey)) injectCache.set(cacheKey, new Map())
    const perKey = injectCache.get(cacheKey)
    if (!perKey.has(sessionId)) {
      const face = typeof entry.options.inject === 'function' ? entry.options.inject(...(sessionId === undefined ? [] : [sessionId])) ?? {} : {}
      const { hooks = {}, ...rest } = face
      perKey.set(sessionId, { ...rest, ...Object.fromEntries(Object.entries(hooks).map(([name, source]) => [hookName(name), selectorHook(source)])) })
    }
    const t = entry.options.locale === undefined ? {} : { t: locale.bind(entry.options.locale) }
    return { ...t, ...perKey.get(sessionId) }
  }
  const api = {
    ...page, shim, plugins, registrations,
    /** The page's document (a case may answer its queries, e.g. where the sidebar fish is on screen). */
    document: sandbox.document,
    live: () => registrations.filter((r) => !r.disposed),
    entries,
    settle: settleAll,
    /**
     * Mount every entry of `slot` with `props` in one root; returns `{tree(), unmount()}`. `slot` may be
     * a list of slots (UI-FIX-D: DSH draws the session header's actions and utilities seats in one
     * header, so a case reads both as one header); their entries mount in that order.
     */
    async mount(slot, props = {}, pick = () => true) {
      const key = 'fbtest-' + ++mounted
      const slots = Array.isArray(slot) ? slot : [slot]
      const seated = slots.flatMap((name) => entries(name).filter(pick).map((entry) => ({ entry, scopeKey: SLOT.sessionScoped.includes(name) ? props.sessionId : undefined })))
      shim.mount(key, () => React.createElement(React.Fragment, null, seated.map(({ entry, scopeKey }, i) => React.createElement(entry.Component, { key: String(i), ...injectedProps(entry, scopeKey), ...props }))))
      await settleAll()
      return { tree: () => shim.treeOf(key), unmount: async () => { shim.unmountRoot(key); await settleAll() } }
    },
    /** Every mounted host node. */
    tree: () => shim.tree(),
    /** Requests the page sent to one backend route (`ui` key) or host route path. */
    posts: (pathname) => page.requests.filter((r) => r.method === 'POST' && r.path === pathname),
    /** Waits until `predicate()` holds, re-settling the page between polls. */
    async waitFor(predicate, ms = WAIT.settleMs) { return until(async () => { await settleAll(); return predicate() }, ms) },
    /** Whether `file`'s load was asked for and is still held (holdChunks). */
    isHeld: (file) => held.has(file),
    /** Lets a held chunk load (UI-06), then settles the page. */
    async releaseChunk(file) {
      assert.ok(held.has(file), 'harness: ' + file + ' was never asked for or is not held')
      held.get(file)()
      held.delete(file)
      await settleAll()
    },
    /** The page's animation frames and window events (R-FIX-CUI UI-07; scriptedFrames). */
    frames,
  }
  return api
}

/**
 * The page's animation frames and window events, scripted (R-FIX-CUI UI-07): requestAnimationFrame
 * queues a callback that runs only on `runFrame()`, cancelAnimationFrame drops it; window listeners
 * are kept, so `dispatch(type)` fires one event (e.g. `resize`). The page sees the same functions as
 * globals and as `window` members (in a browser `window` is the global object).
 */
function scriptedFrames(sandbox) {
  const queued = new Map()
  let next = 0
  const listeners = new Map()
  const requestAnimationFrame = (fn) => { next += 1; queued.set(next, fn); return next }
  const cancelAnimationFrame = (id) => { queued.delete(id) }
  const addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) }
  const removeEventListener = (type, fn) => { listeners.get(type)?.delete(fn) }
  for (const target of [sandbox.sandbox, sandbox.window]) Object.assign(target, { requestAnimationFrame, cancelAnimationFrame, addEventListener, removeEventListener })
  return {
    /** Callbacks waiting for the next frame. */
    pending: () => queued.size,
    /** Runs the callbacks queued before this frame (those they queue wait for the next one). */
    runFrame() { const due = [...queued.values()]; queued.clear(); for (const fn of due) fn(performance.now()) },
    /** How many listeners of `type` the page holds on window. */
    listening: (type) => listeners.get(type)?.size ?? 0,
    dispatch(type, fields = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ ...fields, type }) },
  }
}

// ---------------------------------------------------------------------------------------------
// Tree queries and user actions
// ---------------------------------------------------------------------------------------------

/** Nodes with `attr` (equal to `value` when given) under `nodes`. */
export const withAttr = (nodes, attr, value) => findAll(nodes, (n) => n.props[attr] !== undefined && n.props[attr] !== false && (value === undefined || String(n.props[attr]) === String(value)))
export const byTag = (nodes, tag) => findAll(nodes, (n) => n.tag === tag)
/** A node's text with runs of whitespace collapsed (a bold prefix and its id are separate text nodes). */
export const textIn = (node) => (Array.isArray(node) ? node.map(textIn).join(' ') : typeof node === 'string' ? node : textOf(node)).replace(/\s+/g, ' ').trim()
export const subtreeOf = (node) => [node, ...findAll(node.children ?? [], () => true)]
/**
 * An attribute as the DOM would carry it: React writes a `data-*` boolean `true` as the string
 * "true" and a number as its decimal text, so the contract's `="true"` matches either spelling.
 */
export const attrOf = (node, attr) => (node?.props[attr] === undefined || node.props[attr] === false || node.props[attr] === null ? undefined : String(node.props[attr]))

/** Click `node` as a user does. */
export async function press(page, node) {
  assert.ok(node, 'nothing to press')
  assert.equal(typeof node.props.onClick, 'function', 'the node has no click handler: ' + JSON.stringify(node.props))
  node.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
  await page.settle()
}

/** Type `value` into a text field as a user does (React's onChange with the new value). */
export async function type(page, node, value) {
  assert.ok(node, 'no text field')
  const target = { value }
  ;(node.props.onChange ?? node.props.onInput)?.({ target, currentTarget: target, preventDefault() {} })
  await page.settle()
}

/** The light of a principal under `node`: `{online, label}` from [data-fishball-online]. */
export function lightOf(node) {
  const [light] = withAttr([node], ATTR.online)
  return light ? { online: attrOf(light, ATTR.online), label: light.props[ATTR.ariaLabel] ?? textIn(light) } : undefined
}

/** Whether `node` shows the bold `ID:` prefix (a <strong> whose text is exactly `ID:`). */
export const hasBoldId = (node) => byTag([node], TAG.strong).some((n) => textIn(n) === TEXT.idPrefix)

/** The standard props a session-scoped or row-scoped slot entry receives (DSH slot contracts). */
export const sessionProps = (sessionId) => ({ sessionId, displayTitle: FIXTURE.title, useMenuOpenState: () => [true, () => {}] })
export const fishProps = () => ({ size: SLOT.fishSize, active: false })
