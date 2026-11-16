/**
 * Offline harness for the child-only `fishball-recommend-plugins` browser half (T-RP / RP).
 *
 * Why a hand-written React shim: React is not resolvable here (no node_modules in the worktree, and
 * neither pinned DSH install ships `react`; it exists only inside the prebuilt dsh-web-frontend
 * bundle). Nothing may be installed, so — as packages/dsh-instance/test/instance-ext/page-open-session-page.mjs
 * does for fishball-page — the classic script runs in a node:vm context with fakes of the public
 * client surfaces only. That page harness's React is a no-op (no state/effects); the recommendation
 * tab needs real hooks, effects with cleanup, re-render on state change and unmount, so this shim
 * adds those. LIMIT: this is not React's reconciler (no concurrent rendering, StrictMode double
 * effects, or real DOM); effects run after each synchronous render pass.
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
import { BODY_SOUL, loadUi } from './body-soul-env.mjs'

// V3 F-UI: the tab package and its data moved, unchanged, from core's ui/ into fishball-ui.
export const RP = Object.freeze({
  pluginDir: path.join(BODY_SOUL.ui, 'fishball-recommend-plugins'),
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
// React shim
// ---------------------------------------------------------------------------------------------

const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))

export function createReactShim(observe) {
  const Fragment = Symbol.for('rp.fragment')
  const instances = new Map()
  const roots = new Map()
  const contextValues = new Map()
  let current = null
  let scheduled = false
  let renders = 0
  let tree = []
  const treesByRoot = new Map()

  function createElement(type, props, ...children) {
    const { key = null, ...rest } = props ?? {}
    if (children.length === 1) rest.children = children[0]
    else if (children.length > 1) rest.children = children
    return { $$rp: true, type, key, props: rest }
  }
  function hook(init) {
    if (!current) throw new Error('hook called outside a component render')
    const index = current.cursor++
    if (!(index in current.hooks)) current.hooks[index] = init()
    return current.hooks[index]
  }
  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => { scheduled = false; rerender() })
  }
  function useState(initial) {
    const inst = current
    const state = hook(() => ({ value: typeof initial === 'function' ? initial() : initial }))
    state.set ??= (next) => {
      if (!inst.alive) { observe.stale(); return }
      const value = typeof next === 'function' ? next(state.value) : next
      if (!Object.is(value, state.value)) { state.value = value; schedule() }
    }
    return [state.value, state.set]
  }
  function useReducer(reducer, initialArg, init) {
    const [value, set] = useState(() => (init ? init(initialArg) : initialArg))
    const state = current.hooks[current.cursor - 1]
    state.dispatch ??= (action) => set((prev) => reducer(prev, action))
    return [value, state.dispatch]
  }
  function useEffect(effect, deps) {
    const inst = current
    const state = hook(() => ({ deps: undefined, cleanup: undefined, first: true }))
    if (state.first || depsChanged(state.deps, deps)) {
      state.first = false
      state.deps = deps
      inst.pending.push(() => {
        if (typeof state.cleanup === 'function') state.cleanup()
        state.cleanup = effect()
      })
    }
    inst.effects.add(state)
  }
  function useMemo(factory, deps) {
    const state = hook(() => ({ deps: undefined, value: undefined, first: true }))
    if (state.first || depsChanged(state.deps, deps)) { state.first = false; state.deps = deps; state.value = factory() }
    return state.value
  }
  const useCallback = (fn, deps) => useMemo(() => fn, deps)
  const useRef = (initial) => hook(() => ({ current: initial }))
  function useSyncExternalStore(subscribe, getSnapshot) {
    const inst = current
    useEffect(() => subscribe(() => { if (inst.alive) schedule() }), [subscribe])
    return getSnapshot()
  }
  let ids = 0
  const useId = () => hook(() => ':rp' + (ids++) + ':')
  function createContext(defaultValue) {
    const context = { defaultValue }
    context.Provider = { $$provider: context }
    return context
  }
  function useContext(context) {
    const stack = contextValues.get(context)
    return stack && stack.length ? stack[stack.length - 1] : context.defaultValue
  }

  function renderNode(node, at, visited) {
    if (node === null || node === undefined || typeof node === 'boolean') return []
    if (typeof node === 'string' || typeof node === 'number') return [String(node)]
    if (Array.isArray(node)) return node.flatMap((child, i) => renderNode(child, at + '/' + (child?.key ?? i), visited))
    if (!node.$$rp) throw new Error('rendered a non-element object')
    const { type, props } = node
    if (type === Fragment) return renderNode(props.children, at + '/f', visited)
    if (type && type.$$provider) {
      const stack = contextValues.get(type.$$provider) ?? []
      contextValues.set(type.$$provider, stack)
      stack.push(props.value)
      try { return renderNode(props.children, at + '/p', visited) } finally { stack.pop() }
    }
    if (typeof type === 'function') {
      const id = at + ':' + (type.name || 'anonymous')
      let inst = instances.get(id)
      if (!inst || inst.type !== type) {
        if (inst) unmount(inst)
        inst = { id, type, hooks: [], effects: new Set(), pending: [], alive: true, cursor: 0 }
        instances.set(id, inst)
      }
      visited.add(id)
      const previous = current
      current = inst
      inst.cursor = 0
      let output
      try { output = type(props) } finally { current = previous }
      return renderNode(output, id + '/0', visited)
    }
    if (typeof type === 'string') {
      const { children, ...rest } = props
      // A host element with a ref gets its element during render, before effects run, as React's
      // commit does; only harnesses that model elements (observe.hostRef) see it.
      if (rest.ref !== undefined && observe.hostRef) observe.hostRef(at + '/' + type, type, rest)
      return [{ tag: type, props: rest, children: renderNode(children, at + '/' + type, visited) }]
    }
    throw new Error('unsupported element type ' + String(type))
  }
  function unmount(inst) {
    inst.alive = false
    instances.delete(inst.id)
    for (const state of inst.effects) if (typeof state.cleanup === 'function') { const fn = state.cleanup; state.cleanup = undefined; fn() }
  }
  function rerender() {
    if (++renders > RP.renderGuard) throw new Error('render loop: more than ' + RP.renderGuard + ' renders')
    const visited = new Set()
    const next = []
    treesByRoot.clear()
    for (const [key, build] of roots) {
      const rendered = renderNode(build(), 'root:' + key, visited)
      treesByRoot.set(key, rendered)
      next.push(...rendered)
    }
    tree = next
    for (const inst of [...instances.values()]) if (!visited.has(inst.id)) unmount(inst)
    for (const inst of [...instances.values()]) for (const run of inst.pending.splice(0)) run()
  }

  const React = {
    Fragment, createElement, useState, useReducer, useEffect, useLayoutEffect: useEffect, useInsertionEffect: useEffect,
    useMemo, useCallback, useRef, useSyncExternalStore, useId, createContext, useContext,
    memo: (component) => component,
    forwardRef: (fn) => function ForwardRef(props) { return fn(props, props.ref ?? null) },
    startTransition: (fn) => fn(),
    useTransition: () => [false, (fn) => fn()],
    useDeferredValue: (value) => value,
    isValidElement: (value) => Boolean(value && value.$$rp),
    Children: { toArray: (children) => [children].flat(Infinity).filter((c) => c !== null && c !== undefined && typeof c !== 'boolean') },
  }
  return {
    React,
    mount(key, build) { roots.set(key, build); rerender() },
    unmountRoot(key) { roots.delete(key); rerender() },
    rerender: schedule,
    tree: () => tree,
    /** The rendered host tree of one root (mount key). */
    treeOf: (key) => treesByRoot.get(key) ?? [],
    /** The keys of the mounted roots. */
    roots: () => [...roots.keys()],
    renders: () => renders,
  }
}

// ---------------------------------------------------------------------------------------------
// Fake DOM queries over the rendered host tree
// ---------------------------------------------------------------------------------------------

export function textOf(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(textOf).join('')
}
export function* walk(nodes, parent = null) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield { node, parent }
    yield* walk(node.children, node)
  }
}
export const findAll = (nodes, predicate) => [...walk(nodes)].map((entry) => entry.node).filter(predicate)
export const byAttr = (nodes, name, value) => findAll(nodes, (n) => n.props[name] !== undefined && (value === undefined || String(n.props[name]) === String(value)))
/** The node itself and every element below it. */
export const subtree = (node) => [node, ...findAll(node.children, () => true)]
export const contains = (ancestor, node) => subtree(ancestor).includes(node)
export const buttons = (node) => subtree(node).filter((n) => n.tag === 'button')

// ---------------------------------------------------------------------------------------------
// Fake DSH world: one page, its slot registry, locale, remote; plugin generations activate in it
// ---------------------------------------------------------------------------------------------

function idempotent(fn) {
  let done = false
  return () => { if (done) return; done = true; fn() }
}
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
export { deferred }

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
  const shim = createReactShim(observe)
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
export async function settle(rounds = RP.settleRounds) {
  for (let index = 0; index < rounds; index++) await new Promise((resolve) => setImmediate(resolve))
}

/** A world with the tab activated and its page shown. */
export async function openTab(options) {
  const world = await createWorld(options)
  const generation = await world.activate()
  world.page.show()
  await settle()
  return { world, generation }
}
