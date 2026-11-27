/**
 * Offline world for fishball-ui's `fishball-recommend-plugins` browser half, the Recommended tab
 * (T-RP / RP), moved from test/support/rp-recommend.mjs. The classic script runs unread in a
 * node:vm context over fishball-test-helpers/react-shim's React (hooks, effects with cleanup,
 * re-render, unmount) with fakes of the public client surfaces only. Each activation is its own
 * plugin generation, so disposal and re-activation are observable.
 *
 * The fake DSH "world" models only the documented seams the contract names:
 *   - slots: list slot `plugins.tab` (registry.d.ts: inject() runs its callback while the slot is
 *     declared, re-runs it on re-declaration, and belongs to the caller's fiber, so plugin unload
 *     removes the contribution); register() returns an idempotent disposer.
 *   - the Plugins page renders the selected entry with owner props {t, install, openPackage}, where
 *     `install` stands for the SDK's `installFrom` (lib/client.js) and `t` is the entry's locale seat.
 *   - locale: register(ns, {zh, en}) / bind(ns) / t(key, params) with `{name}` interpolation and
 *     key fallback (dsh-client-locale README + lib/client.js translate()).
 *   - remote: `$on(event, cb)` returns a disposer and is NOT auto-removed by the fake fiber (the
 *     plugin owns it); ctx.on is fiber-owned as in Cordis. Every other remote access is recorded.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { importBound } from 'fishball-test-helpers/bind'
import { buttons, byAttr, contains, createReactShim, deferred, findAll, idempotent, subtree, textOf } from 'fishball-test-helpers/react-shim'
import { settle as settleRounds } from 'fishball-test-helpers/wait'
import { UI } from './ui-page.mjs'

export { buttons, byAttr, contains, deferred, findAll, subtree, textOf }

/** Import one of fishball-ui's own modules (relative to its folder), bound to the current DSH. */
export const loadUi = (relative) => importBound(UI.file(relative))
/** CJK ideographs: the observable mark of the Chinese variant. */
export const CJK = /[\u3400-\u9fff]/

export const RP = Object.freeze({
  pluginDir: UI.file('fishball-recommend-plugins'),
  clientFile: 'client.js',
  indexModule: 'fishball-recommend-plugins/index.js',
  dataModule: 'src/recommended.js',
  moduleId: 'fishball-recommend-plugins',
  baseURI: 'http://child.test/fishball-child/',
  listPath: 'api/fishball/recommended',
  routePath: '/api/fishball/recommended',
  slot: 'plugins.tab',
  tabId: 'fishball-recommended',
  events: Object.freeze({ changed: 'plugin-manager/changed', reset: 'connection/reset' }),
  remoteNs: 'pluginManager',
  remoteAllowed: Object.freeze(['listBundles', 'inspect']),
  locales: Object.freeze({ en: 'en', zh: 'zh' }),
  modules: Object.freeze({ react: 'react', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  attr: Object.freeze({
    root: 'data-plugin-tab',
    category: 'data-recommended-category',
    highlighted: 'data-highlighted',
    pkg: 'data-recommended-package',
    note: 'data-recommended-note',
    empty: 'data-recommended-empty',
    state: 'data-recommended-state',
  }),
  installedState: 'installed',
  alertRole: 'alert',
  /** Fixture answers of the native inspection (not historical versions; any exact version works). */
  fixture: Object.freeze({ version: '9.8.7-rp-fixture', registry: 'https://registry.rp-fixture.test/', kind: 'registry' }),
  /** An install button reads "Install" (en) / "安装" (zh) and never "Installed" / "已安装". */
  installText: Object.freeze({ en: /\binstall\b/i, zh: /安装/, notEn: /installed/i, notZh: /已安装/ }),
  renderGuard: 200,
  settleRounds: 40,
})

// ---------------------------------------------------------------------------------------------
// Fake DSH world: one page, its slot registry, locale, remote; plugin generations activate in it
// ---------------------------------------------------------------------------------------------

/** Fake primitives: Button renders a host <button>, every other export a generic element. */
function fakePrimitives(React) {
  const generic = (name) => function Primitive({ children, ...rest }) { return React.createElement('div', { 'data-primitive': name, ...rest }, children) }
  const known = {
    Button: function Button({ children, ...rest }) { return React.createElement('button', { type: 'button', ...rest }, children) },
    StateDot: function StateDot({ children, ...rest }) { return React.createElement('span', { 'data-primitive': 'StateDot', ...rest }, children) },
  }
  const cache = new Map()
  const target = {}
  const primitives = new Proxy(target, {
    get(_t, name) {
      if (name === '__esModule' || name === 'then' || typeof name === 'symbol') return undefined
      if (name === 'default') return primitives
      if (name in known) return known[name]
      if (!cache.has(name)) cache.set(name, generic(name))
      return cache.get(name)
    },
  })
  return primitives
}

/** The Node half's registered fetch route (index.js through its public apply). */
export async function loadNodeRoute() {
  const mod = await loadUi(RP.indexModule)
  return applyNodeHalf(mod)
}
export function applyNodeHalf(mod) {
  const routes = []
  const accessed = []
  const fetchFace = { register(route) { routes.push(route); return () => {} } }
  const ctx = new Proxy({
    connection: { fetch: fetchFace },
    effect(fn) { return fn() },
  }, { get(target, name) { if (typeof name === 'string') accessed.push(name); return target[name] } })
  mod.apply(ctx)
  return { mod, routes, accessed }
}

/**
 * Create one page world.
 * @param options.locale - active locale id.
 * @param options.bundles - child BundleInfo-like rows `{name, installed, enabled}`.
 * @param options.respond - optional override `(call) => Response|Promise<Response>` for the list fetch.
 */
export async function createWorld({ locale = RP.locales.en, bundles = [], respond } = {}) {
  const observe = { staleUpdates: 0, stale() { this.staleUpdates++ } }
  const shim = createReactShim(observe, { renderGuard: RP.renderGuard })
  const { React } = shim
  const primitives = fakePrimitives(React)
  const route = (await loadNodeRoute()).routes.find((r) => r.path === RP.routePath)
  const source = readFileSync(path.join(RP.pluginDir, RP.clientFile), 'utf8')

  const world = {
    observe, shim, React, route,
    bundles: [...bundles],
    fetches: [],
    installs: [],
    /** The same owner.install targets uncloned: `installs` goes through JSON, which drops a field set to undefined. */
    installTargets: [],
    opened: [],
    inspects: [],
    listCalls: 0,
    remoteAccess: [],
    otherRemoteCalls: [],
    requires: [],
    /** Override to control one listBundles call: `(callIndex) => promise of {ok, value|error}` or undefined for default. */
    onListBundles: undefined,
    /** Inspection answer: `(spec, options) => {ok, value|error}` (may return a promise). */
    onInspect: undefined,
    respond,
    generations: [],
  }

  // ---- locale ----------------------------------------------------------------------------------
  const localeState = { active: locale, revision: 0, dicts: new Map(), registrations: [], listeners: new Set() }
  const bumpLocale = () => { localeState.revision++; for (const fn of [...localeState.listeners]) fn(); shim.rerender() }
  function lookup(dict, key) {
    if (!dict) return undefined
    if (Object.hasOwn(dict, key)) return dict[key]
    return key.split('.').reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), dict)
  }
  function translate(ns, key, params) {
    const dicts = localeState.dicts.get(ns)
    const template = lookup(dicts?.[localeState.active], key) ?? lookup(dicts?.en, key) ?? key
    if (typeof template !== 'string') return key
    return params ? template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : template
  }
  const bound = new Map()
  const localeFace = {
    register(ns, dicts) {
      const record = { ns, dicts, removed: 0 }
      localeState.registrations.push(record)
      localeState.dicts.set(ns, dicts)
      bumpLocale()
      return idempotent(() => { record.removed++; if (localeState.dicts.get(ns) === dicts) localeState.dicts.delete(ns); bumpLocale() })
    },
    bind(ns) { if (!bound.has(ns)) bound.set(ns, (key, params) => translate(ns, key, params)); return bound.get(ns) },
    getSnapshot: () => ({ active: localeState.active, revision: localeState.revision }),
    getLocale: () => ({ active: localeState.active, revision: localeState.revision }),
    subscribe(fn) { localeState.listeners.add(fn); return () => localeState.listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[localeState.active] ?? text?.en),
  }
  world.locale = {
    state: localeState,
    set(id) { localeState.active = id; bumpLocale() },
    translate,
    dictionaries: () => localeState.registrations,
  }

  // ---- slots ---------------------------------------------------------------------------------
  let serial = 0
  const slots = { declared: new Set([RP.slot]), entries: new Map(), injections: [], version: 0 }
  const bumpSlots = () => { slots.version++; shim.rerender() }
  function addEntry(options, Component, owner) {
    const list = slots.entries.get(options.name) ?? []
    slots.entries.set(options.name, list)
    const entry = { options, Component, owner, serial: ++serial }
    list.push(entry)
    bumpSlots()
    return idempotent(() => { const at = list.indexOf(entry); if (at >= 0) list.splice(at, 1); bumpSlots() })
  }
  const runEffect = (effect) => {
    if (typeof effect === 'function') return idempotent(effect)
    if (effect && typeof effect[Symbol.iterator] === 'function') { const all = [...effect]; return idempotent(() => { for (const fn of all.reverse()) fn() }) }
    return () => {}
  }
  world.slots = {
    state: slots,
    entries: (name = RP.slot) => [...(slots.entries.get(name) ?? [])],
    ours: () => world.slots.entries().filter((entry) => entry.options.id === RP.tabId),
    /** A component the SDK itself contributes, such as Discover (plugin-market lib/client.js). */
    registerNative: (options, Component) => addEntry({ name: RP.slot, ...options }, Component, 'native'),
    /** Collapse and re-declare the slot: live inject effects are disposed and run again. */
    redeclare(name = RP.slot) {
      for (const injection of slots.injections) if (injection.key === name && injection.live) { injection.active(); injection.active = runEffect(injection.callback()) }
    },
    liveInjections: () => slots.injections.filter((i) => i.live).length,
  }

  // ---- remote --------------------------------------------------------------------------------
  const remoteSubs = []
  const ctxSubs = []
  // Raw (non-idempotent) disposers: every call is counted, so "removed once" is observed on the
  // plugin's own disposal rather than guaranteed by this fake.
  const subscribe = (list, event, callback) => {
    const record = { event, callback, live: true, removed: 0 }
    list.push(record)
    return { record, dispose: () => { record.live = false; record.removed++ } }
  }
  world.subs = {
    remote: remoteSubs,
    ctx: ctxSubs,
    live: (list, event) => list.filter((s) => s.live && (event === undefined || s.event === event)).length,
  }
  world.emitRemote = (event, payload) => { for (const s of remoteSubs.filter((r) => r.live && r.event === event)) s.callback(payload) }
  world.emitCtx = (event, payload) => { for (const s of ctxSubs.filter((r) => r.live && r.event === event)) s.callback(payload) }

  async function listBundles() {
    const index = world.listCalls++
    const custom = world.onListBundles?.(index)
    if (custom !== undefined) return custom
    return { ok: true, value: world.bundles.map((b) => ({ official: false, availability: 'profile', optional: false, removable: true, rows: [], overrides: [], ...b })) }
  }
  async function inspect(spec, options, signal) {
    world.inspects.push({ spec, options, signal })
    if (world.onInspect) return world.onInspect(spec, options, signal)
    return { ok: true, value: { status: 'accepted', kind: RP.fixture.kind, name: spec.replace(/(.)@.*$/, '$1'), version: RP.fixture.version, registry: RP.fixture.registry, bundle: true } }
  }
  const spyNamespace = (ns) => new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string' || name === 'then') return undefined
      world.remoteAccess.push(ns + '.' + name)
      if (ns === RP.remoteNs && name === 'listBundles') return listBundles
      if (ns === RP.remoteNs && name === 'inspect') return inspect
      return (...args) => { world.otherRemoteCalls.push({ name: ns + '.' + name, args }); return Promise.resolve({ ok: false, error: { message: 'not faked' } }) }
    },
  })
  function remoteFor(generation) {
    return new Proxy({}, {
      get(_t, name) {
        if (name === '$on') return (event, callback) => { const s = subscribe(remoteSubs, event, callback); s.record.generation = generation.index; return s.dispose }
        if (typeof name !== 'string' || name === 'then') return undefined
        return spyNamespace(name)
      },
    })
  }

  // ---- fetch (browser) -----------------------------------------------------------------------
  async function browserFetch(input, init = {}) {
    const url = new URL(String(input instanceof Request ? input.url : input), RP.baseURI).href
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const call = { url, method, init }
    world.fetches.push(call)
    if (world.respond) return world.respond(call)
    if (url !== new URL(RP.listPath, RP.baseURI).href) return new Response(null, { status: 404 })
    return route.fetch(new Request(url, { method }))
  }

  // ---- page ----------------------------------------------------------------------------------
  const page = { visible: false, selected: RP.tabId }
  const owner = {
    install(target) { world.installs.push(JSON.parse(JSON.stringify(target))); world.installTargets.push(target) },
    openPackage(name) { world.opened.push(name) },
  }
  function PageRoot() {
    if (!page.visible) return null
    const entry = world.slots.entries().find((e) => e.options.id === page.selected)
    if (!entry) return null
    const t = localeFace.bind(entry.options.locale)
    return React.createElement('section', { 'data-test-page': 'plugins' },
      React.createElement(entry.Component, { key: 'entry-' + entry.serial, t, install: owner.install, openPackage: owner.openPackage }))
  }
  world.page = {
    show() { page.visible = true; shim.mount('page', () => React.createElement(PageRoot)) },
    hide() { page.visible = false; shim.rerender() },
    tree: () => shim.tree(),
    root: () => byAttr(shim.tree(), RP.attr.root, RP.tabId)[0],
    alerts: () => findAll(shim.tree(), (n) => n.props.role === RP.alertRole && textOf(n).trim() !== ''),
    rows: () => byAttr(shim.tree(), RP.attr.pkg),
    row: (name) => byAttr(shim.tree(), RP.attr.pkg, name)[0],
    categories: () => byAttr(shim.tree(), RP.attr.category),
  }
  world.isInstalled = (row) => subtree(row).some((n) => n.props[RP.attr.state] === RP.installedState)
  world.installButtons = (row) => buttons(row).filter((b) => {
    const text = textOf(b)
    return localeState.active === RP.locales.zh
      ? RP.installText.zh.test(text) && !RP.installText.notZh.test(text)
      : RP.installText.en.test(text) && !RP.installText.notEn.test(text)
  })
  world.clickInstall = async (name) => {
    const row = world.page.row(name)
    if (!row) throw new Error('no row for ' + name)
    const [button] = world.installButtons(row)
    if (!button) throw new Error('no Install button in row ' + name)
    if (button.props.disabled) throw new Error('Install button of ' + name + ' is disabled')
    button.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: button, target: button })
    await settle()
  }

  // ---- plugin generations --------------------------------------------------------------------
  world.activate = async () => {
    const generation = { index: world.generations.length, disposers: [], rawEffects: [], disposed: 0 }
    world.generations.push(generation)
    const fiber = (dispose) => { generation.disposers.push(dispose); return dispose }
    let registered
    const window = {
      __ModuleLoader__: { load(entry) { registered = entry } },
      addEventListener() {}, removeEventListener() {},
      location: new URL(RP.baseURI),
    }
    const document = { baseURI: RP.baseURI, documentElement: { lang: localeState.active } }
    const sandbox = {
      window, document, fetch: browserFetch, URL, URLSearchParams, Request, Response, Headers, AbortController, AbortSignal,
      queueMicrotask, structuredClone, console, setTimeout, clearTimeout, navigator: { languages: [localeState.active] },
    }
    sandbox.globalThis = sandbox
    window.document = document
    window.fetch = browserFetch
    vm.createContext(sandbox)
    vm.runInContext(source, sandbox, { filename: path.join(RP.pluginDir, RP.clientFile) })
    if (!registered || registered.id !== RP.moduleId || typeof registered.factory !== 'function') throw new Error('client.js did not call __ModuleLoader__.load({id: ' + RP.moduleId + ', factory})')
    const modules = { [RP.modules.react]: React, [RP.modules.primitives]: primitives }
    const plugin = registered.factory((name) => {
      world.requires.push(name)
      if (!(name in modules)) throw new Error('unexpected require ' + name)
      return modules[name]
    })
    const ctx = {
      effect(fn) {
        const raw = fn()
        generation.rawEffects.push(raw)
        return fiber(runEffect(raw))
      },
      // Cordis ctx.on disposers are idempotent and fiber-owned; remote.$on (below) is counted raw.
      on(event, callback) { const s = subscribe(ctxSubs, event, callback); s.record.generation = generation.index; return fiber(idempotent(s.dispose)) },
      locale: localeFace,
      remote: remoteFor(generation),
      slots: {
        inject(key, callback) {
          const injection = { key, callback, live: true, active: () => {}, generation: generation.index }
          slots.injections.push(injection)
          if (slots.declared.has(key)) injection.active = runEffect(callback())
          return fiber(idempotent(() => { injection.live = false; injection.active() }))
        },
        register(options, Component) { return addEntry(options, Component, generation.index) },
        entries: (key) => world.slots.entries(key),
        getVersion: () => slots.version,
        subscribe: () => () => {},
      },
    }
    generation.plugin = plugin
    generation.ctx = ctx
    plugin.apply(ctx)
    generation.dispose = () => { generation.disposed++; for (const dispose of [...generation.disposers].reverse()) dispose() }
    await settle()
    return generation
  }
  return world
}

/** Let promises, microtasks and re-renders settle (host timers, not the page's). */
export const settle = (rounds = RP.settleRounds) => settleRounds(rounds)

/** A world with the tab activated and its page shown. */
export async function openTab(options) {
  const world = await createWorld(options)
  const generation = await world.activate()
  world.page.show()
  await settle()
  return { world, generation }
}
