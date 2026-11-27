/**
 * The scripted DSH page: a package's real browser scripts, run unread in a fake DSH page applied by
 * the current DSH's own Cordis. No browser, no DSH process.
 *
 * What is real: the caller's client files (`clients: [{id, file}]`) and the package-local chunks
 * they load (from each client file's folder, ./client-graph), the current DSH's Cordis `Context`
 * that applies them with their declared `inject` lists, and DSH's own `SettingsFormModel` and
 * `settingsTextField` (./dsh-primitives).
 *
 * What is scripted, modelled on DSH's public client contracts:
 * - `slots`: register (listed by slot `name`), inject (the slot is declared, so the callback runs at
 *   once; its effect is disposed with the returned disposer), entries. Rendering follows
 *   dsh-client-ui-renderer: an entry with `locale` gets `t`, its `inject()` face is called once and
 *   its `hooks` become `use<Name>(selector?)` props, and owner props come last;
 * - `configForms` (dsh-client-ui-settings config-form.d.ts): `get(entryId)` → a ConfigForm whose
 *   snapshot is `{status, value, base, user, revision, writable}`, `subscribe`, `mutate(ops, rev)`
 *   (plus `set`/`unset`); `whileServed(namespaces, register)` runs `register(served)` while one of
 *   them is served and its disposer when none is; `describe()`. The case serves and withdraws
 *   namespaces (`world.serve`, `world.unserve`) and decides each mutate's answer (`mutateAnswer`);
 * - `remote`: `credentials.set(ref, value)` and `credentials.describe(refs)` as DSH Results
 *   (`{ok, value}`), `$on` (`world.emitRemote`); every other access is recorded in `remoteOther` and
 *   answers `{ok: false}`; also provided as the `remote.credentials` service, as DSH's gateway
 *   installs each namespace. With `remoteSession`, `remote` meets Cordis as DSH's Remote service
 *   does (`cordisRemote`): `ctx.remote.session` follows Cordis's inject rule;
 * - `locale` (register / bind / getSnapshot / getLocale / subscribe / resolveText; `world.setLang`),
 *   `layout` (panelInfo, selectPanel; `world.setActivePanel`), the optional `pluginNavigation`
 *   (openBundle, which selects the Plugins panel as DSH's does; openList);
 * - the document (./browser-sandbox over ./fake-dom): `<html>` attributes with working
 *   MutationObservers, the location with its fragment, `window.open` (`world.opened`), window
 *   listeners (`world.dispatchWindow`), matchMedia (`world.setMedia`), and the page's `fetch`;
 * - the page's `fetch`: a generic route table (`world.routes`, `world.route(path, answer)`), then
 *   `world.fetchOther`, else 404. A package serves its own routes there; nothing here knows them.
 *
 * Observation points: the rendered trees (./react-shim), every recorded service call, request,
 * opened window, page console line, module error and failed Cordis fiber.
 */
import { DSH_VERSION, importDsh } from './dsh.mjs'
import { applyPlugins, loadClients } from './client-graph.mjs'
import { createBrowserSandbox } from './browser-sandbox.mjs'
import { createDom } from './fake-dom.mjs'
import { STAND_IN, primitivesFor } from './dsh-primitives.mjs'
import { createReactShim, edit, effectDisposer, findAll, idempotent, jsxRuntime, press, reactDomModules, textOf } from './react-shim.mjs'
import { settle as settleRounds } from './wait.mjs'

/** DSH's client contracts the page models (its own vocabulary, not any package's). */
export const DSH_PAGE = Object.freeze({
  slot: Object.freeze({
    bundleConfig: 'plugins.bundle.config',
    headerActions: 'conversation.session.header.actions',
    main: 'main',
  }),
  /** `PluginConfigViewProps.view`. */
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  /** The Plugins page's panel id (dsh-client-ui-plugin-manager PANEL_ID). */
  pluginsPanel: 'plugins',
  /** The services a DSH page offers; `pluginNavigation` is optional. */
  services: Object.freeze(['slots', 'layout', 'locale', 'configForms', 'remote', 'remote.credentials']),
  navigation: 'pluginNavigation',
  /** The credentials Remote namespace as its own service (dsh-api-gateway `remote.<namespace>`). */
  remoteCredentials: 'remote.credentials',
  /**
   * The session Remote namespace as its own service, the Remote service's own name and namespace
   * member, and the `property` of the tracker Cordis's `Service` gives every service
   * (`{associate: name, property: 'ctx'}`).
   */
  remoteSession: 'remote.session',
  remoteName: 'remote',
  sessionNamespace: 'session',
  trackerProperty: 'ctx',
  /** ConfigFormSnapshot.status. */
  status: Object.freeze({ ready: 'ready', unavailable: 'unavailable', loading: 'loading' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  locales: Object.freeze(['en', 'zh']),
  /** Cordis fiber state FAILED and the status event (cordis lib/types/fiber.d.ts). */
  fiberFailed: 3,
  statusEvent: 'internal/status',
  alertRole: 'alert',
  /** The page modules a client may require. */
  modules: Object.freeze({ react: 'react', jsx: 'react/jsx-runtime', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
})

/** Harness values (never product oracles). */
export const SCRIPTED = Object.freeze({
  settleRounds: 80,
  base: 'http://scripted.test/',
  revision: 1,
  /** What a scripted write answers, and what a case may set it to. */
  answer: Object.freeze({ ok: 'ok', refused: 'refused', reject: 'reject' }),
  notFound: 404,
  ok: 200,
  get: 'GET',
  contentType: 'content-type',
  json: 'application/json',
  configMount: 'config',
  headerMount: 'header:',
})

/** Let promises, microtasks and re-renders settle (host timers, not the page's). */
export const settle = (rounds = SCRIPTED.settleRounds) => settleRounds(rounds)

const hookName = (name) => 'use' + name[0].toUpperCase() + name.slice(1)

/** Apply ops (`{op, path, value}`) to a nested object, returning a new one. */
export function applyOps(object, ops) {
  const next = structuredClone(object ?? {})
  for (const { op, path: at, value } of ops) {
    let node = next
    for (const key of at.slice(0, -1)) node = node[key] = typeof node[key] === 'object' && node[key] !== null ? node[key] : {}
    if (op === DSH_PAGE.op.set) node[at.at(-1)] = value
    else delete node[at.at(-1)]
  }
  return next
}

/** One settings namespace as DSH's mirror serves it to a ConfigForm. */
function namespaceForm(world, ns) {
  const listeners = new Set()
  let snapshot
  const unavailable = Object.freeze({ status: DSH_PAGE.status.unavailable, value: undefined, base: undefined, user: undefined, revision: undefined, writable: false })
  const refresh = () => {
    const served = world.namespaces.get(ns)
    snapshot = served ? Object.freeze({ status: DSH_PAGE.status.ready, value: served.value, base: served.base, user: served.user, revision: served.revision, writable: served.writable }) : unavailable
    for (const fn of [...listeners]) fn()
  }
  refresh()
  // `mutateAnswer`: true applies the ops; false answers false (a conflict); 'reject' throws (transport).
  const mutate = async (ops, expectedRevision) => {
    world.mutations.push({ ns, ops: structuredClone(ops), expectedRevision })
    world.sequence.push('mutate')
    const answer = world.mutateAnswer
    if (answer === SCRIPTED.answer.reject) throw new Error('scripted transport failure')
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
      set: (field, value) => mutate([{ op: DSH_PAGE.op.set, path: [field], value }]),
      unset: (field) => mutate([{ op: DSH_PAGE.op.unset, path: [field] }]),
    },
  }
}

/** A Remote namespace proxy whose unknown members are recorded and answer `{ok: false}`. */
function recordingNamespace(world, ns, known = {}) {
  return new Proxy(known, {
    get(target, member) {
      if (member in target) return target[member]
      if (typeof member !== 'string' || member === 'then') return undefined
      return (...args) => { world.remoteOther.push({ name: ns + '.' + member, args }); return Promise.resolve({ ok: false, error: { message: 'not scripted' } }) }
    },
  })
}

/**
 * Build one page world (the services and the document) without loading anything yet.
 * @param options.clients - the browser halves this page runs: `[{id, file}]` (absolute files), applied in order.
 * @param options.lang - the UI language (`en` by default).
 * @param options.locales - the locale ids `getLocale()` lists (DSH_PAGE.locales).
 * @param options.base - the document URL (SCRIPTED.base); document-relative requests follow it.
 * @param options.hash - the location fragment, or ''.
 * @param options.namespaces - `{ns: value}` or `{ns: {value, user?, base?, writable?, revision?}}` served at start
 *   (use `world.serve` for the long form; a plain value is served with `user` = value).
 * @param options.credentials - `{ref: configured}`: what `credentials.describe` answers at start.
 * @param options.navigation - provide `pluginNavigation` (default true).
 * @param options.omit - service names this page does not provide.
 * @param options.services - more services by name (`{sessions, uiWorkspace, …}`), provided after DSH's.
 * @param options.activePanel - the layout's active panel at load (default null).
 * @param options.routes - the page's route table (see `world.route`).
 * @param options.remoteSession - `undefined`: the plain scripted `remote`. Otherwise `remote` meets
 *   Cordis as DSH's Remote service does, and this face (or nothing, for `null`) is provided as
 *   `remote.session` by its own plugin fiber, as DSH's gateway provides every namespace: a service
 *   on the root would be readable without inject and hide Cordis's rule.
 * @param options.chunkFiles - `{'<file>' | '<id>/<file>': absPath}` loads that file in place of a chunk.
 * @param options.platform - more page modules by specifier (they win over the defaults).
 * @param options.modal - the faithful Modal stand-in in the primitives (./dsh-primitives).
 * @param options.hostRefs - give every host element rendered with a `ref` an element of the page's
 *   DOM (./fake-dom `hostRef`), so a component that climbs to a shell element sees a browser's.
 * @param options.shimOptions - extra observe options for the React shim (`hostRef`, `commit`).
 * @param options.version - the DSH whose Cordis and form logic run (default the current one).
 */
export function createWorld({
  clients = [], lang = 'en', locales = DSH_PAGE.locales, base = SCRIPTED.base, hash = '', namespaces = {}, credentials = {},
  navigation = true, omit = [], services: extraServices = {}, activePanel = null, routes = [], remoteSession, chunkFiles = {},
  platform = {}, modal = false, hostRefs = false, shimOptions = {}, version = DSH_VERSION,
} = {}) {
  const world = {
    version, lang, base, hash, clients: [...clients], remoteSession, chunkFiles, platform, modal,
    namespaces: new Map(),
    forms: new Map(),
    watchers: [],
    formGets: [],
    mutations: [],
    /** Every write in order across settings and credentials ('mutate' | 'credentials.set'). */
    sequence: [],
    /** true | false | 'reject' (SCRIPTED.answer.reject). */
    mutateAnswer: true,
    credentialSets: [],
    credentialDescribes: [],
    /** 'ok' | 'refused' | 'reject'. */
    credentialAnswer: SCRIPTED.answer.ok,
    credentials: new Map(Object.entries(credentials)),
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
    /** State updates of components already unmounted (the shim's `stale` count). */
    staleUpdates: 0,
    routes: [...routes],
    /** The answer to a request no route matched (`(call) => answer`); unset, it answers 404. */
    fetchOther: undefined,
    /** The page's EventSource class (./event-source); unset, a stream that never delivers. */
    EventSource: undefined,
    /** `(query) => boolean`, what matchMedia answers (`world.setMedia` changes it live). */
    media: undefined,
    /** Sees the page's `(document, dom)` before any script runs (add shell elements, collect sheets). */
    onDocument: undefined,
    /** Sees the page's global object before any script runs (its own Date, Intl, …). */
    onSandbox: undefined,
  }
  // The DOM exists before any script runs, so a case can set `<html>` marks or add shell elements first.
  world.dom = createDom()
  world.html = world.dom.html
  const shim = createReactShim({ stale() { world.staleUpdates += 1 }, ...(hostRefs ? { hostRef: world.dom.hostRef } : {}), ...shimOptions })
  const { React } = shim
  world.shim = shim
  world.React = React

  /**
   * Serve one route: `path` document-relative (or absolute), matched on origin and pathname (any
   * query); `answer(call)` returns `{status, json}`, `{status, text}`, a Response, or 'reject' (a
   * network failure). `method` limits it to one method. First match wins. Returns its disposer.
   */
  world.route = (path, answer, { method } = {}) => {
    const route = { path, answer, method }
    world.routes.push(route)
    return idempotent(() => { const at = world.routes.indexOf(route); if (at >= 0) world.routes.splice(at, 1) })
  }

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
  /** DSH starts serving `ns` (or serves a new value): forms refresh, watchers re-evaluate, the page re-renders. */
  world.serve = (ns, value, { user = value, base: layer = {}, writable = true, revision = SCRIPTED.revision } = {}) => {
    world.namespaces.set(ns, { value: structuredClone(value), user: structuredClone(user), base: layer, writable, revision })
    formOf(ns).refresh()
    evaluateWatchers()
    shim.rerender()
  }
  world.unserve = (ns) => { world.namespaces.delete(ns); formOf(ns).refresh(); evaluateWatchers(); shim.rerender() }
  world.valueOf = (ns) => world.namespaces.get(ns)?.value
  const configForms = {
    get: (entryId) => { world.formGets.push(entryId); return formOf(entryId).face },
    whileServed(names, register) {
      const watcher = { namespaces: [...names], register, live: true, dispose: null }
      world.watchers.push(watcher)
      evaluateWatchers()
      return () => { watcher.live = false; const d = watcher.dispose; watcher.dispose = null; d?.() }
    },
    describe: () => ({
      getSnapshot: () => ({ status: DSH_PAGE.status.ready, view: { namespaces: Object.fromEntries([...world.namespaces].map(([ns, s]) => [ns, { value: s.value, revision: s.revision }])) }, error: null }),
      subscribe: () => () => {},
      ensure: async () => {},
      acceptView() {},
    }),
  }
  for (const [ns, value] of Object.entries(namespaces)) world.serve(ns, value)

  // ---- remote ------------------------------------------------------------------------------
  const credentialsFace = recordingNamespace(world, 'credentials', {
    async set(ref, value) {
      world.credentialSets.push({ ref, value })
      world.sequence.push('credentials.set')
      if (world.credentialAnswer === SCRIPTED.answer.reject) throw new Error('scripted credential transport failure')
      if (world.credentialAnswer !== SCRIPTED.answer.ok) return { ok: false, error: { message: 'scripted refusal' } }
      world.credentials.set(ref, true)
      return { ok: true, value: undefined }
    },
    async describe(refs) {
      world.credentialDescribes.push([...refs])
      return { ok: true, value: Object.fromEntries(refs.map((ref) => [ref, { configured: world.credentials.get(ref) === true, writable: true }])) }
    },
  })
  const remote = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name === 'then') return undefined
      if (name === '$on') return (event, callback) => { const record = { event, callback, live: true }; world.remoteEvents.push(record); return () => { record.live = false } }
      if (name === 'credentials') return credentialsFace
      return recordingNamespace(world, name)
    },
  })
  world.emitRemote = (event, ...args) => { for (const r of world.remoteEvents.filter((x) => x.live && x.event === event)) r.callback(...args) }

  // ---- locale ------------------------------------------------------------------------------
  const dictionaries = new Map()
  const localeListeners = new Set()
  const lookup = (dict, key) => (dict && Object.hasOwn(dict, key) ? dict[key] : key.split('.').reduce((v, part) => (v && typeof v === 'object' ? v[part] : undefined), dict))
  /** DSH's translate: the active language, then en, then the key; `{name}` interpolation. */
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = lookup(dicts?.[world.lang], key) ?? lookup(dicts?.en, key) ?? key
    if (typeof template !== 'string') return key
    return params ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  world.translate = translate
  let localeRevision = 0
  /** The user switches DSH's UI language: the locale snapshot changes and its subscribers are told. */
  world.setLang = (next) => {
    world.lang = next
    localeRevision += 1
    world.html.lang = next
    for (const fn of [...localeListeners]) fn()
    shim.rerender()
  }
  const locale = {
    register(ns, dicts) {
      world.localeRegistrations.push({ ns, dicts })
      dictionaries.set(ns, dicts)
      shim.rerender()
      return idempotent(() => { if (dictionaries.get(ns) === dicts) dictionaries.delete(ns) })
    },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => ({ active: world.lang, revision: localeRevision }),
    getLocale: () => ({ active: world.lang, revision: localeRevision, locales: locales.map((id) => ({ id })) }),
    subscribe: (fn) => { localeListeners.add(fn); return () => localeListeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[world.lang] ?? text?.en),
  }

  // ---- layout and navigation ---------------------------------------------------------------
  let active = activePanel
  const panelListeners = new Set()
  world.setActivePanel = (id) => { active = id; for (const fn of [...panelListeners]) fn() }
  const layout = {
    panelInfo: { getSnapshot: () => ({ activePanelId: active }), subscribe: (fn) => { panelListeners.add(fn); return () => panelListeners.delete(fn) } },
    selectPanel(id) { world.selectPanel.push(id); world.setActivePanel(id); shim.rerender() },
    toggleSidebar() {},
  }
  // DSH's openBundle selects the Plugins panel itself (dsh-client-ui-plugin-manager), so the active
  // panel follows; it is not recorded as a selectPanel call of the page.
  const pluginNavigation = {
    openBundle(name) { world.openBundle.push(name); world.setActivePanel(DSH_PAGE.pluginsPanel); shim.rerender() },
    openList() { world.openList += 1 },
  }

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
  /** The Plugins page's configuration entries of one bundle (slot `plugins.bundle.config`, `key` = bundle). */
  world.configEntries = (bundle) => world.entries(DSH_PAGE.slot.bundleConfig).filter((e) => e.options.key === bundle)
  world.headerEntries = () => world.entries(DSH_PAGE.slot.headerActions)

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

  world.services = { slots, configForms, remote, [DSH_PAGE.remoteCredentials]: credentialsFace, locale, layout, [DSH_PAGE.navigation]: pluginNavigation, ...extraServices }
  world.provided = [...DSH_PAGE.services.filter((name) => !omit.includes(name)), ...(navigation && !omit.includes(DSH_PAGE.navigation) ? [DSH_PAGE.navigation] : []), ...Object.keys(extraServices)]
  return world
}

const asResponse = (answer) => {
  if (answer instanceof Response) return answer
  if (answer.json !== undefined) return new Response(JSON.stringify(answer.json), { status: answer.status ?? SCRIPTED.ok, headers: { [SCRIPTED.contentType]: SCRIPTED.json } })
  return new Response(answer.text ?? '', { status: answer.status ?? SCRIPTED.ok })
}

/** The page's fetch over the world's route table: records each call `{url, method, credentials, cache, body}`. */
function pageFetch(world) {
  return async (input, init = {}) => {
    const request = input instanceof Request ? input : undefined
    const url = new URL(String(request ? request.url : input), world.base)
    const method = String(init.method ?? request?.method ?? SCRIPTED.get).toUpperCase()
    const body = init.body ?? (request ? await request.clone().text() : undefined)
    // A Request carries its own options; read them from it when no init overrides them.
    const option = (name) => init[name] ?? request?.[name]
    const call = { url: url.href, path: url.pathname, method, credentials: option('credentials'), cache: option('cache'), headers: new Headers(option('headers') ?? {}), body: body === undefined ? undefined : String(body) }
    call.json = () => { try { return JSON.parse(call.body ?? 'null') } catch { return undefined } }
    world.fetches.push(call)
    const route = world.routes.find((r) => {
      const at = new URL(r.path, world.base)
      return at.origin === url.origin && at.pathname === url.pathname && (r.method === undefined || r.method.toUpperCase() === method)
    })
    const handler = route?.answer ?? world.fetchOther ?? (() => ({ status: SCRIPTED.notFound, text: '' }))
    const answer = await handler(call)
    if (answer === SCRIPTED.answer.reject) throw new TypeError('scripted network failure')
    return asResponse(answer)
  }
}

/** The page modules a scripted page answers: React, react-dom, the JSX runtime, DSH's primitives, then the world's own. */
function pageModules(world) {
  return {
    [DSH_PAGE.modules.react]: world.React,
    ...reactDomModules(),
    [DSH_PAGE.modules.primitives]: primitivesFor(world.React, { version: world.version, modal: world.modal }),
    [DSH_PAGE.modules.jsx]: jsxRuntime(world.React),
    ...world.platform,
  }
}

/** The page's console: every line, any level, in `world.console`. */
const consoleOf = (world) => new Proxy({}, { get: (_t, _level) => (...args) => { world.console.push(args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a) ?? String(a) } catch { return String(a) } }).join(' ')) } })

/**
 * Load the world's clients into its page and apply them to the current DSH's Cordis. Resolves to
 * the page handle once the chunks the apply started have loaded.
 * @param t - node:test context (cleanup: roots unmounted, timers stopped, fibers disposed).
 */
export async function loadPage(t, world) {
  const page = createBrowserSandbox({
    lang: world.lang, baseURI: world.base, hash: world.hash, fetch: pageFetch(world), console: consoleOf(world),
    dom: world.dom, ...(world.EventSource ? { EventSource: world.EventSource } : {}), ...(world.media ? { media: world.media } : {}),
  })
  world.page = page
  world.document = page.document
  world.location = page.window.location
  world.opened = page.opened
  world.dispatchWindow = (type, props) => page.dispatchWindow(type, props)
  world.setMedia = (fn) => page.setMedia(fn)
  world.onDocument?.(page.document, page.dom)
  world.onSandbox?.(page.sandbox)

  const { graph, table, settleChunks } = loadClients(page, world.clients, { platform: pageModules(world), chunkFiles: world.chunkFiles })
  const { Context, Service } = await importDsh('cordis', undefined, world.version)
  const root = new Context()
  root.on(DSH_PAGE.statusEvent, (fiber) => { if (fiber.state === DSH_PAGE.fiberFailed) world.failedFibers.push(fiber.runtime?.name ?? fiber.name ?? '?') })
  if (world.remoteSession !== undefined) world.services.remote = cordisRemote(world.services.remote, Service.tracker)
  for (const name of world.provided) root.provide(name, world.services[name])
  const owned = []
  if (world.remoteSession) {
    const fiber = root.plugin({ name: DSH_PAGE.remoteSession, apply: (ctx) => { ctx.provide(DSH_PAGE.remoteSession, world.remoteSession) } })
    await fiber
    owned.push(fiber)
  }
  const plugins = applyPlugins(root, graph, table, world.errors)
  world.root = root
  world.table = table
  world.plugins = plugins
  t.after(async () => {
    for (const key of world.shim.roots()) world.shim.unmountRoot(key)
    page.clearTimers()
    for (const p of [...plugins].reverse()) await Promise.resolve(p.fiber.dispose?.()).catch(() => {})
    for (const fiber of owned) await Promise.resolve(fiber.dispose?.()).catch(() => {})
  })
  await settleChunks(settle)
  return pageHandle(world, () => settleChunks(settle))
}

/**
 * The scripted `remote` as DSH's Remote service meets Cordis: Cordis's own tracker for a service
 * named `remote`, and no `session` member of its own, so `ctx.remote.session` is either the
 * `remote.session` service under Cordis's inject rule or absent.
 */
export function cordisRemote(remote, trackerKey) {
  const tracker = Object.freeze({ associate: DSH_PAGE.remoteName, property: DSH_PAGE.trackerProperty })
  return new Proxy(remote, {
    get(target, name, receiver) {
      if (name === trackerKey) return tracker
      if (name === DSH_PAGE.sessionNamespace) return undefined
      return Reflect.get(target, name, receiver)
    },
  })
}

/** Find and act on the rendered page. */
function pageHandle(world, settled) {
  const { shim, React } = world
  const act = (fn) => async (...args) => { fn(...args); await settled() }
  const handle = {
    world,
    /** Mount `element` (or `() => element`) as root `key` and settle. */
    async mount(key, build) { shim.mount(key, typeof build === 'function' ? build : () => build); await settled() },
    async unmount(key) { shim.unmountRoot(key); await settled() },
    /** Mount one bundle's configuration entry with `view`, as DSH's Plugins page renders it (root SCRIPTED.configMount). */
    async openConfig(bundle, view = DSH_PAGE.view.page, ownerProps = {}) {
      function ConfigHost() { const entry = world.configEntries(bundle)[0]; return entry ? world.renderEntry(entry, { view, ...ownerProps }) : null }
      await handle.mount(SCRIPTED.configMount, () => React.createElement(ConfigHost))
    },
    async closeConfig() { await handle.unmount(SCRIPTED.configMount) },
    /** The configuration root's tree; `all()` every root's. */
    tree: (key = SCRIPTED.configMount) => shim.treeOf(key),
    all: () => shim.tree(),
    text: (nodes = shim.tree()) => nodes.map(textOf).join(' '),
    /** Nodes with prop `name` set (not undefined/false), optionally equal to `value` as text. */
    byAttr: (name, value, nodes = shim.tree()) => findAll(nodes, (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value))),
    find: (predicate, nodes = shim.tree()) => findAll(nodes, predicate),
    press: act(press),
    edit: act(edit),
    /** The settings form stand-in's Save button (./dsh-primitives STAND_IN.save). */
    saveButton: (nodes = shim.tree()) => handle.byAttr(STAND_IN.save, undefined, nodes)[0],
    async save(nodes) { await handle.press(handle.saveButton(nodes)) },
    settled,
    /** Render every `conversation.session.header.actions` entry alone: `[{id, tree, key}]`. */
    async headers(ownerProps = {}) {
      const out = []
      for (const entry of world.headerEntries()) {
        const key = SCRIPTED.headerMount + (entry.options.id ?? out.length)
        await handle.mount(key, () => world.renderEntry(entry, ownerProps))
        out.push({ id: entry.options.id, tree: shim.treeOf(key), key })
      }
      return out
    },
    /** Rendered `role="alert"` nodes that show text. */
    alerts: (nodes = shim.tree()) => findAll(nodes, (n) => n.props.role === DSH_PAGE.alertRole && textOf(n).trim() !== ''),
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

/**
 * Run one chunk file alone in a fresh page and call its one registration's factory with a minimal
 * require (the page modules of a scripted page; `require.async` answers {}).
 * @returns {{ registrations, exports, required }} `exports` is undefined unless exactly one registration was made.
 */
export function loadChunkAlone(file, { version = DSH_VERSION, platform = {} } = {}) {
  const page = createBrowserSandbox({ lang: DSH_PAGE.locales[0], baseURI: SCRIPTED.base })
  page.runFile(file)
  const shim = createReactShim()
  const modules = pageModules({ React: shim.React, version, modal: false, platform })
  const required = []
  const require = Object.assign((name) => { required.push(name); if (!(name in modules)) throw new Error('unexpected require ' + name); return modules[name] }, { async: async () => ({}), asset: (r) => r })
  const { registrations } = page
  const exports = registrations.length === 1 ? registrations[0].factory(require) : undefined
  return { registrations, exports, required }
}
