/**
 * The F-SETTINGS scripted page: core's real browser scripts in a fake DSH page. No browser, no DSH
 * process.
 *
 * What is real: core's `client.js` and the chunk it loads, `client.settings.js`, and (F-UI) fishball-ui's
 * `client.js` and the parts it loads (`client.entries.js`, `client.asks.js`), run unread as DSH's
 * module loader runs them (support/browser-sandbox.mjs, the module table of
 * ../../contract/package-boundaries/client-graph.mjs); the SDK's own Cordis `Context`, which applies
 * them with their declared `inject` lists; DSH's own `SettingsFormModel` and `settingsTextField`
 * (primitives.mjs).
 *
 * What is scripted, modelled on DSH's public client contracts (both SDKs):
 * - `slots`: register (keyed by `key`, listed by `id`), inject (the slot is declared, so the callback
 *   runs at once; its effect is disposed with the returned disposer), entries. Rendering follows
 *   dsh-client-ui-renderer: an entry with `locale` gets `t`, its `inject()` face is called once and its
 *   `hooks` become `use<Name>(selector?)` props, and owner props come last;
 * - `configForms` (dsh-client-ui-settings config-form.d.ts): `get(entryId)` → a ConfigForm whose
 *   snapshot is `{status, value, base, user, revision, writable}`, `subscribe`, `mutate(ops, rev)`;
 *   `whileServed(namespaces, register)` runs `register(served)` while one of them is served and its
 *   disposer when none is; the test serves and withdraws namespaces;
 * - `remote`: `credentials.set(ref, value)` and `credentials.describe(refs)` as DSH Results
 *   (`{ok, value}`), `$on`; every other access is recorded;
 * - `locale` (register / bind / getSnapshot / subscribe), `layout` (panelInfo, selectPanel), and the
 *   optional `pluginNavigation` (openBundle, openList);
 * - the document: `<html>` attributes with a working MutationObserver, the location (with the
 *   fragment), `window.open`, window listeners (`focus`), DSH's native Settings launcher
 *   (`.fishball-settings-launcher`, present or not), and the page's `fetch` to the Connect route.
 *
 * Observation points: the rendered trees of the bundle configuration entry (view `page` or
 * `summary`) and of each header action, every recorded service call, request, opened window, page
 * console line, and every Cordis fiber that failed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { CLIENTS, CORDIS_ENTRY, CONNECT, CORE, DSH, FIBER, FIXTURE, HARNESS, HOSTED_IMPORT, MARK, ROUTE, STATUS_EVENT, SUBJECT, UI, runtimeOf } from './constants.mjs'
import { STAND_IN, primitivesFor } from './primitives.mjs'

export const settle = async (rounds = HARNESS.settleRounds) => { for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve)) }

const idempotent = (fn) => { let done = false; return () => { if (!done) { done = true; fn() } } }
const effectDisposer = (effect) => {
  if (typeof effect === 'function') return idempotent(effect)
  if (effect && typeof effect[Symbol.iterator] === 'function') { const all = [...effect]; return idempotent(() => { for (const fn of all.reverse()) fn?.() }) }
  return () => {}
}
const hookName = (name) => 'use' + name[0].toUpperCase() + name.slice(1)

/** Apply ops (`{op, path, value}`) to a nested object, returning a new one. */
function applyOps(object, ops) {
  const next = structuredClone(object ?? {})
  for (const { op, path: at, value } of ops) {
    let node = next
    for (const key of at.slice(0, -1)) node = node[key] = typeof node[key] === 'object' && node[key] !== null ? node[key] : {}
    if (op === DSH.op.set) node[at.at(-1)] = value
    else delete node[at.at(-1)]
  }
  return next
}

/** One settings namespace as DSH's mirror serves it to a ConfigForm. */
function namespaceForm(world, ns) {
  const listeners = new Set()
  let snapshot
  const unavailable = Object.freeze({ status: DSH.status.unavailable, value: undefined, base: undefined, user: undefined, revision: undefined, writable: false })
  const refresh = () => {
    const served = world.namespaces.get(ns)
    snapshot = served ? Object.freeze({ status: DSH.status.ready, value: served.value, base: served.base, user: served.user, revision: served.revision, writable: served.writable }) : unavailable
    for (const fn of [...listeners]) fn()
  }
  refresh()
  const mutate = async (ops, expectedRevision) => {
    const call = { ns, ops: structuredClone(ops), expectedRevision }
    world.mutations.push(call)
    world.sequence.push('mutate')
    const answer = world.mutateAnswer
    if (answer === 'reject') throw new Error('fbtest transport failure')
    if (answer !== true) return false
    const served = world.namespaces.get(ns)
    if (!served) return false
    served.user = applyOps(served.user, ops)
    served.value = applyOps(served.value, ops)
    served.revision += 1
    refresh()
    return true
  }
  return {
    refresh,
    face: {
      getSnapshot: () => snapshot,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
      mutate,
      set: (field, value) => mutate([{ op: DSH.op.set, path: [field], value }]),
      unset: (field) => mutate([{ op: DSH.op.unset, path: [field] }]),
    },
  }
}

/**
 * Build one page world (the services and the document) without loading anything yet.
 * @param options.sdk - the SDK whose Cordis and form logic run.
 * @param options.lang - `en` or `zh`.
 * @param options.base - the document URL (FIXTURE.base or FIXTURE.subBase).
 * @param options.hash - the location fragment (`#view=settings`, …) or ''.
 * @param options.core - core's namespace value (nested) or null for "not served".
 * @param options.coreUser - core's stored user layer (defaults to the value).
 * @param options.instanceTarget - the instance namespace's value, or null for "not served".
 * @param options.configured - `credentials.describe(...).configured` for the token reference.
 * @param options.navigation - provide `pluginNavigation` (default true).
 * @param options.launcher - DSH's native Settings launcher is on the page (default true).
 * @param options.omit - service names this page does not provide.
 * @param options.activePanel - the layout's active panel at load (default null).
 * @param options.clients - CLIENTS.both (core and fishball-ui, the default) or CLIENTS.coreOnly.
 * @param options.remoteSession - E-FIX-3 (B5). `undefined` (the default): the legacy scripted
 *   `remote` above. Otherwise the page's `remote` is modelled as DSH's own Remote service is under
 *   Cordis (dsh-api-gateway client, both SDKs): it carries the tracker Cordis's `Service`
 *   constructor gives a service named `remote` (`{associate: 'remote', property: 'ctx'}`), so the
 *   SDK's real Cordis redirects `ctx.remote.<ns>` to the service `remote.<ns>` and applies its rule
 *   (a plugin that did not inject it gets "cannot get property … without inject"), and a namespace
 *   DSH does not mount is absent (`undefined`). A face `{modelCatalog(), $on?}` is then provided as
 *   `remote.session` by its OWN plugin fiber, as DSH's gateway provides every namespace
 *   (`ownerCtx.plugin({name: 'remote.<ns>'})`): a service on an ancestor fiber (the root) would be
 *   readable without inject and hide the rule. `null`: the same Remote, no `remote.session`.
 * @param options.chunkFiles - E-FIX-3: `{<chunk file name>: <absolute path>}` loads that file in
 *   place of the package's own chunk (the base-commit copy of the mutating-test check).
 */
export function createWorld({
  sdk, lang = 'en', base = FIXTURE.base, hash = '', core = {}, coreUser, instanceTarget = null, configured = false,
  navigation = true, launcher = true, omit = [], activePanel = null, clients = CLIENTS.both, remoteSession, chunkFiles = {},
} = {}) {
  const world = {
    sdk, lang, base, clients, remoteSession, chunkFiles,
    namespaces: new Map(),
    forms: new Map(),
    watchers: [],
    formGets: [],
    mutations: [],
    /** Every write in order across settings and credentials ('mutate' | 'credentials.set'). */
    sequence: [],
    mutateAnswer: true,
    credentialSets: [],
    credentialDescribes: [],
    credentialAnswer: 'ok',
    credentials: new Map([[HOSTED_IMPORT.credentialRef, configured]]),
    remoteOther: [],
    remoteEvents: [],
    localeRegistrations: [],
    selectPanel: [],
    openBundle: [],
    openList: 0,
    fetches: [],
    opened: [],
    console: [],
    errors: [],
    failedFibers: [],
    launcherPresses: 0,
    windowListeners: new Map(),
    /** R-FIX-FUI: state updates of components already unmounted (the shim's `stale` count). */
    staleUpdates: 0,
    /**
     * R-FIX-FUI: the answer to a page fetch of any other URL (`(call) => answer`, same shapes as
     * `connect`); unset, such a fetch answers 404.
     */
    fetchOther: undefined,
    connect: {
      get: () => ({ status: ROUTE.ok, json: { state: CONNECT.state.needsAuthorization, code: null } }),
      post: () => ({ status: ROUTE.ok, json: { outcome: 'authorized' } }),
    },
  }
  const shim = createReactShim({ stale() { world.staleUpdates += 1 } })
  const { React } = shim
  world.shim = shim
  world.React = React

  // ---- configForms -------------------------------------------------------------------------
  const formOf = (ns) => { if (!world.forms.has(ns)) world.forms.set(ns, namespaceForm(world, ns)); return world.forms.get(ns) }
  const served = () => new Set(world.namespaces.keys())
  const evaluateWatchers = () => {
    for (const w of world.watchers) {
      if (!w.live) continue
      const hit = w.namespaces.some((ns) => world.namespaces.has(ns))
      if (hit && !w.dispose) w.dispose = effectDisposer(w.register(served()))
      else if (!hit && w.dispose) { const d = w.dispose; w.dispose = null; d() }
    }
  }
  world.serve = (ns, value, { user = value, base: layer = {}, writable = true, revision = FIXTURE.revision } = {}) => {
    world.namespaces.set(ns, { value: structuredClone(value), user: structuredClone(user), base: layer, writable, revision })
    formOf(ns).refresh()
    evaluateWatchers()
    shim.rerender()
  }
  world.unserve = (ns) => { world.namespaces.delete(ns); formOf(ns).refresh(); evaluateWatchers(); shim.rerender() }
  world.coreValue = () => world.namespaces.get(CORE.namespace)?.value
  const configForms = {
    get: (entryId) => { world.formGets.push(entryId); return formOf(entryId).face },
    whileServed(namespaces, register) {
      const watcher = { namespaces: [...namespaces], register, live: true, dispose: null }
      world.watchers.push(watcher)
      evaluateWatchers()
      return () => { watcher.live = false; const d = watcher.dispose; watcher.dispose = null; d?.() }
    },
    describe: () => ({
      getSnapshot: () => ({ status: DSH.status.ready, view: { namespaces: Object.fromEntries([...world.namespaces].map(([ns, s]) => [ns, { value: s.value, revision: s.revision }])) }, error: null }),
      subscribe: () => () => {},
      ensure: async () => {},
      acceptView() {},
    }),
  }
  if (core !== null) world.serve(CORE.namespace, core, { user: coreUser ?? core })
  if (instanceTarget !== null) world.serve(HOSTED_IMPORT.targetSetting.row, instanceTarget)

  // ---- remote ------------------------------------------------------------------------------
  const credentials = {
    async set(ref, value) {
      world.credentialSets.push({ ref, value })
      world.sequence.push('credentials.set')
      if (world.credentialAnswer === 'reject') throw new Error('fbtest credential transport failure')
      if (world.credentialAnswer !== 'ok') return { ok: false, error: { message: 'fbtest refused' } }
      world.credentials.set(ref, true)
      return { ok: true, value: undefined }
    },
    async describe(refs) {
      world.credentialDescribes.push([...refs])
      return { ok: true, value: Object.fromEntries(refs.map((ref) => [ref, { configured: world.credentials.get(ref) === true, writable: true }])) }
    },
  }
  const credentialsFace = new Proxy(credentials, {
    get(target, member) {
      if (member in target) return target[member]
      if (typeof member !== 'string' || member === 'then') return undefined
      return (...args) => { world.remoteOther.push({ name: 'credentials.' + member, args }); return Promise.resolve({ ok: false, error: { message: 'not faked' } }) }
    },
  })
  const remote = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name === 'then') return undefined
      if (name === '$on') return (event, callback) => { const record = { event, callback, live: true }; world.remoteEvents.push(record); return () => { record.live = false } }
      if (name === 'credentials') return credentialsFace
      return new Proxy({}, {
        get(_n, member) {
          if (typeof member !== 'string' || member === 'then') return undefined
          return (...args) => { world.remoteOther.push({ name: name + '.' + member, args }); return Promise.resolve({ ok: false, error: { message: 'not faked' } }) }
        },
      })
    },
  })
  world.emitRemote = (event, ...args) => { for (const r of world.remoteEvents.filter((x) => x.live && x.event === event)) r.callback(...args) }

  // ---- locale ------------------------------------------------------------------------------
  const dictionaries = new Map()
  const listeners = new Set()
  const lookup = (dict, key) => (dict && Object.hasOwn(dict, key) ? dict[key] : key.split('.').reduce((v, part) => (v && typeof v === 'object' ? v[part] : undefined), dict))
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = lookup(dicts?.[lang], key) ?? lookup(dicts?.en, key) ?? key
    if (typeof template !== 'string') return key
    return params ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  const locale = {
    register(ns, dicts) {
      world.localeRegistrations.push({ ns, dicts })
      dictionaries.set(ns, dicts)
      shim.rerender()
      return idempotent(() => { if (dictionaries.get(ns) === dicts) dictionaries.delete(ns) })
    },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => ({ active: lang, revision: 0 }),
    getLocale: () => ({ active: lang, revision: 0, locales: DSH.locales.map((id) => ({ id })) }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[lang] ?? text?.en),
  }

  // ---- layout and navigation ---------------------------------------------------------------
  let active = activePanel
  const panelListeners = new Set()
  const layout = {
    panelInfo: { getSnapshot: () => ({ activePanelId: active }), subscribe: (fn) => { panelListeners.add(fn); return () => panelListeners.delete(fn) } },
    selectPanel(id) { world.selectPanel.push(id); active = id; for (const fn of [...panelListeners]) fn(); shim.rerender() },
    toggleSidebar() {},
  }
  world.setActivePanel = (id) => { active = id; for (const fn of [...panelListeners]) fn() }
  // DSH's openBundle selects the Plugins panel itself (dsh-client-ui-plugin-manager), so the active
  // panel follows; it is not recorded as a selectPanel call of the page.
  const pluginNavigation = {
    openBundle(name) { world.openBundle.push(name); world.setActivePanel(DSH.pluginsPanel); shim.rerender() },
    openList() { world.openList += 1 },
  }
  /** Every request to open core's settings page, by either route (requirement 7). */
  world.settingsOpens = () => world.openBundle.length + world.selectPanel.filter((id) => id === DSH.pluginsPanel).length

  // ---- slots -------------------------------------------------------------------------------
  const slotEntries = new Map()
  const slots = {
    register(options, Component) {
      const list = slotEntries.get(options.name) ?? []
      slotEntries.set(options.name, list)
      const entry = { options, Component }
      list.push(entry)
      shim.rerender()
      return idempotent(() => { const at = list.indexOf(entry); if (at >= 0) list.splice(at, 1); shim.rerender() })
    },
    inject: (_name, callback) => effectDisposer(callback()),
    entries: (name) => [...(slotEntries.get(name) ?? [])],
    subscribe: () => () => {},
    getVersion: () => 0,
  }
  world.entries = (name) => slots.entries(name)
  world.configEntries = () => world.entries(DSH.slot.bundleConfig).filter((e) => e.options.key === CORE.bundle)
  world.headerEntries = () => world.entries(DSH.slot.headerActions)

  // DSH's renderer: kit (t) + the entry's inject face (hooks → use<Name>) + owner props.
  const faces = new WeakMap()
  const injected = (entry) => {
    if (!entry.options.inject) return {}
    if (!faces.has(entry)) {
      const { hooks, ...rest } = entry.options.inject() ?? {}
      const bound = { ...rest }
      for (const [name, source] of Object.entries(hooks ?? {})) {
        bound[hookName(name)] = (selector = (v) => v) => selector(React.useSyncExternalStore(source.subscribe, source.getSnapshot))
      }
      faces.set(entry, bound)
    }
    return faces.get(entry)
  }
  world.renderEntry = (entry, ownerProps = {}) => {
    const kit = entry.options.locale === undefined ? {} : { t: locale.bind(entry.options.locale) }
    return React.createElement(entry.Component, { ...kit, ...injected(entry), ...ownerProps })
  }

  // DSH installs each Remote namespace as its own `remote.<namespace>` service too (dsh-api-gateway
  // remoteServiceKey), so a plugin may declare `remote.credentials` in its inject list.
  world.services = { slots, configForms, remote, [DSH.remoteCredentials]: credentialsFace, locale, layout, pluginNavigation }
  world.provided = DSH.services.filter((name) => !omit.includes(name))
  if (navigation && !omit.includes(DSH.service.navigation)) world.provided.push(DSH.service.navigation)

  // ---- document ----------------------------------------------------------------------------
  world.html = fakeHtml()
  world.launcher = launcher
  world.location = new URL(hash, base)
  return world
}

/** `<html>`: attributes, and MutationObservers that see their changes (as a browser reports them). */
function fakeHtml() {
  const attributes = new Map()
  const observers = new Set()
  const notify = (name, oldValue) => {
    for (const o of observers) {
      const opts = o.options
      if (!opts.attributes && !opts.attributeFilter) continue
      if (opts.attributeFilter && !opts.attributeFilter.includes(name)) continue
      const record = { type: 'attributes', attributeName: name, target: html, oldValue: opts.attributeOldValue ? oldValue : null }
      queueMicrotask(() => { if (observers.has(o)) o.callback([record], o.instance) })
    }
  }
  const html = {
    lang: 'en',
    get dataset() { return Object.fromEntries([...attributes].filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_m, c) => c.toUpperCase()), v])) },
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute(name, value) { const old = html.getAttribute(name); attributes.set(name, String(value)); notify(name, old) },
    removeAttribute(name) { if (!attributes.has(name)) return; const old = attributes.get(name); attributes.delete(name); notify(name, old) },
    toggleAttribute(name, force) { const on = force ?? !attributes.has(name); if (on) html.setAttribute(name, ''); else html.removeAttribute(name); return on },
    addEventListener() {},
    removeEventListener() {},
  }
  const MutationObserver = class {
    constructor(callback) { this.callback = callback }
    observe(target, options = {}) { if (target === html) { this.entry = { callback: this.callback, options, instance: this }; observers.add(this.entry) } }
    disconnect() { if (this.entry) observers.delete(this.entry) }
    takeRecords() { return [] }
  }
  return { element: html, MutationObserver, observers }
}

const asJson = (body, status) => new Response(JSON.stringify(body), { status, headers: { [ROUTE.contentType]: ROUTE.json } })

/**
 * Load core's client into the world's page and apply it. Resolves to the page handle.
 * @param t - node:test context (cleanup).
 */
export async function loadPage(t, world) {
  const pageConsole = new Proxy({}, { get: (_t, level) => (...args) => { world.console.push(args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a) ?? String(a) } catch { return String(a) } }).join(' ')) } })
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), world.base)
    const method = String(init.method ?? (input instanceof Request ? input.method : ROUTE.get)).toUpperCase()
    const body = init.body ?? (input instanceof Request ? await input.clone().text() : undefined)
    // A Request carries its own options; read them from it when no init overrides them.
    const option = (name) => init[name] ?? (input instanceof Request ? input[name] : undefined)
    const call = { url: url.href, method, credentials: option('credentials'), cache: option('cache'), body: body === undefined ? undefined : String(body) }
    world.fetches.push(call)
    const isRoute = url.href === new URL(ROUTE.relative, world.base).href
    const handler = !isRoute ? (world.fetchOther ?? (() => ({ status: 404, text: '' }))) : method === ROUTE.post ? world.connect.post : world.connect.get
    const answer = await handler(call)
    if (answer === 'reject') throw new TypeError('fbtest network failure')
    return answer.json !== undefined ? asJson(answer.json, answer.status) : new Response(answer.text ?? '', { status: answer.status })
  }
  const page = createBrowserSandbox({ lang: world.lang, baseURI: world.base, fetch: pageFetch, console: pageConsole })
  // The world's document: <html>, location, window listeners, window.open, DSH's launcher.
  page.document.documentElement = world.html.element
  page.sandbox.MutationObserver = world.html.MutationObserver
  page.window.location = world.location
  page.sandbox.location = world.location
  page.window.addEventListener = (name, fn) => { const list = world.windowListeners.get(name) ?? []; list.push(fn); world.windowListeners.set(name, list) }
  page.window.removeEventListener = (name, fn) => { const list = world.windowListeners.get(name) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1) }
  page.sandbox.addEventListener = page.window.addEventListener
  page.sandbox.removeEventListener = page.window.removeEventListener
  // A case may stand in its own server-sent stream (the ask-card render rows feed the card frames).
  if (world.EventSource !== undefined) { page.sandbox.EventSource = world.EventSource; page.window.EventSource = world.EventSource }
  // UI-FIX-F: a case may observe the page's document before any script runs (the contrast rows
  // collect the style sheets the page mounts in <head>; test/v3/fishball-ui/contrast/page.mjs).
  world.onDocument?.(page.document)
  // R-FIX-FUI F9: a case may adjust the page realm itself (its own Date and Intl) before any script runs.
  world.onSandbox?.(page.sandbox)
  page.window.open = (...args) => { world.opened.push(args); return null }
  page.sandbox.open = page.window.open
  const launcher = { className: DSH.launcherClass, classList: { contains: (c) => c === DSH.launcherClass }, click() { world.launcherPresses += 1 }, dispatchEvent() { world.launcherPresses += 1; return true }, focus() {} }
  const matchesLauncher = (selector) => world.launcher && String(selector).split(',').map((s) => s.trim()).includes(DSH.launcherSelector)
  page.document.querySelector = (selector) => (matchesLauncher(selector) ? launcher : null)
  page.document.querySelectorAll = (selector) => (matchesLauncher(selector) ? [launcher] : [])
  page.document.getElementsByClassName = (name) => (world.launcher && name === DSH.launcherClass ? [launcher] : [])
  world.setLauncher = (present) => { world.launcher = present }
  world.dispatchWindow = (name) => { for (const fn of [...(world.windowListeners.get(name) ?? [])]) fn({ type: name }) }

  const platform = {
    react: world.React,
    'react-dom': { createPortal: (node) => node, createRoot: () => ({ render() {}, unmount() {} }) },
    'react-dom/client': { createRoot: () => ({ render() {}, unmount() {} }) },
    '@deepseek-ai/dsh-client-ui-primitives': primitivesFor(world.sdk, world.React),
    'react/jsx-runtime': jsxRuntime(world.React),
  }
  // Each graph entry's chunks load from its own package folder (DSH's package-local chunk route).
  const entries = [{ id: CORE.moduleId, file: SUBJECT.coreClient }, ...(world.clients === CLIENTS.both ? [{ id: UI.moduleId, file: SUBJECT.uiClient }] : [])]
  const run = (file) => page.run(fs.readFileSync(file, 'utf8'), file, pathToFileURL(file).href)
  for (const e of entries) run(e.file)
  const graph = entries.map((e) => ({ id: e.id, rev: 'fbtest' }))
  const dirOf = (owner) => path.dirname(entries.find((e) => e.id === owner).file)
  const table = moduleTable({ page, platform, graph, loadChunk: async (owner, file) => run(world.chunkFiles[file] ?? path.join(dirOf(owner), file)) })

  const { Context, Service } = await import(pathToFileURL(path.join(runtimeOf(world.sdk), CORDIS_ENTRY)).href)
  const root = new Context()
  root.on(STATUS_EVENT, (fiber) => { if (fiber.state === FIBER.failed) world.failedFibers.push(fiber.runtime?.name ?? fiber.name ?? '?') })
  if (world.remoteSession !== undefined) world.services.remote = cordisRemote(world.services.remote, Service.tracker)
  for (const name of world.provided) root.provide(name, world.services[name])
  const owned = []
  if (world.remoteSession) {
    const fiber = root.plugin({ name: DSH.remoteSession, apply: (ctx) => { ctx.provide(DSH.remoteSession, world.remoteSession) } })
    await fiber
    owned.push(fiber)
  }
  const plugins = applyPlugins(root, graph, table, world.errors)
  world.root = root
  t.after(async () => {
    for (const key of world.shim.roots()) world.shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
    for (const fiber of owned) await fiber.dispose?.().catch?.(() => {})
  })
  await settle()
  return pageHandle(world)
}

/**
 * The scripted `remote` as DSH's Remote service meets Cordis (createWorld `remoteSession`): Cordis's
 * own tracker for a service named `remote`, and no `session` member of its own, so `ctx.remote.session`
 * is either the `remote.session` service under Cordis's inject rule or absent.
 */
export function cordisRemote(remote, trackerKey) {
  const tracker = Object.freeze({ associate: DSH.remoteName, property: DSH.trackerProperty })
  return new Proxy(remote, {
    get(target, name, receiver) {
      if (name === trackerKey) return tracker
      if (name === DSH.sessionNamespace) return undefined
      return Reflect.get(target, name, receiver)
    },
  })
}

/** The automatic JSX runtime a bundled classic script may require, over the same shim. */
function jsxRuntime(React) {
  const jsx = (type, props, key) => React.createElement(type, key === undefined ? props : { ...props, key })
  return { jsx, jsxs: jsx, Fragment: React.Fragment }
}

/** Find and act on the rendered page. */
function pageHandle(world) {
  const { shim, React } = world
  const h = React.createElement
  /** Mount core's bundle configuration entry with `view` (DSH's Plugins page renders it so). */
  function ConfigHost({ view }) {
    const entry = world.configEntries()[0]
    return entry ? world.renderEntry(entry, { view }) : null
  }
  const press = async (node) => {
    if (!node) throw new Error('nothing to press')
    node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
    await settle()
  }
  const handle = {
    world,
    async open(view = 'page') { shim.mount('config', () => h(ConfigHost, { view })); await settle() },
    async close() { shim.unmountRoot('config'); await settle() },
    tree: () => shim.treeOf('config'),
    all: () => shim.tree(),
    text: () => shim.treeOf('config').map(textOf).join(' '),
    byAttr: (name, value, nodes = shim.treeOf('config')) => findAll(nodes, (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value))),
    find: (predicate, nodes = shim.treeOf('config')) => findAll(nodes, predicate),
    /** The field wrapper of one setting, and the input inside it. */
    field(name) {
      const [wrapper] = handle.byAttr(MARK.field, name)
      const input = wrapper ? findAll([wrapper], (n) => n.tag === 'input')[0] : undefined
      return { wrapper, input }
    },
    async edit(name, value) {
      const { input } = handle.field(name)
      if (!input) throw new Error('no input for ' + name)
      input.props.onChange?.({ target: { value }, currentTarget: { value } })
      await settle()
    },
    saveButton: () => handle.byAttr(STAND_IN.save)[0],
    async save() { await press(handle.saveButton()) },
    press,
    settled: settle,
    /** Render every header action of the Fishball page alone and return [{id, tree}]. */
    async headers() {
      const out = []
      for (const entry of world.headerEntries()) {
        const key = 'header:' + (entry.options.id ?? out.length)
        shim.mount(key, () => world.renderEntry(entry))
        await settle()
        out.push({ id: entry.options.id, tree: shim.treeOf(key), key })
      }
      return out
    },
    alerts: (nodes = shim.tree()) => findAll(nodes, (n) => n.props.role === MARK.alertRole && textOf(n).trim() !== ''),
    /** Every string any rendered node shows or carries in a prop, but the password inputs' value. */
    visibleStrings(nodes = shim.tree()) {
      const out = []
      for (const node of findAll(nodes, () => true)) {
        out.push(textOf(node))
        for (const [k, v] of Object.entries(node.props)) if (!(node.tag === 'input' && node.props.type === 'password' && k === 'value') && typeof v === 'string') out.push(v)
      }
      return out
    },
  }
  return handle
}

/** A minimal require for loading the chunk alone (requirement 10: its export). */
export function loadChunkAlone(sdk) {
  const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.base, fetch: async () => new Response('', { status: 404 }) })
  page.run(fs.readFileSync(SUBJECT.chunk, 'utf8'), SUBJECT.chunk)
  const shim = createReactShim({ stale() {} })
  const modules = {
    react: shim.React,
    'react-dom': { createPortal: (n) => n },
    '@deepseek-ai/dsh-client-ui-primitives': primitivesFor(sdk, shim.React),
    'react/jsx-runtime': jsxRuntime(shim.React),
  }
  const required = []
  const registrations = page.registrations
  const exports = registrations.length === 1 ? registrations[0].factory(Object.assign((name) => { required.push(name); if (!(name in modules)) throw new Error('unexpected require ' + name); return modules[name] }, { async: async () => ({}), asset: (r) => r })) : undefined
  return { registrations, exports, required }
}
