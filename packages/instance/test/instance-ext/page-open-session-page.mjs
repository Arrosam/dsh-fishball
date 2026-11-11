/**
 * Offline loader for the classic browser script child-web/fishball-page/client.js.
 *
 * The script registers itself through `window.__ModuleLoader__.load({id, factory(require)})`.
 * It runs in a node:vm context with a minimal fake window/document/fetch/React. Only public
 * SDK client surfaces named by the module's `inject` list are faked (slots, layout, uiWorkspace,
 * uiSession, sessions, locale) plus `ctx.effect`. Timers inside the page are spies so a case can
 * prove no polling timer is used.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, '..', '..', 'child-web', 'fishball-page', 'client.js')
export const PAGE_BASE = 'http://child.test/'

/** A tiny observable store: getSnapshot/subscribe, like the SDK's external stores. */
function store(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() },
    listeners,
  }
}

/**
 * Neutral public `ctx.shortcuts` (dsh-client-shortcuts `Shortcuts` shape): accepted, ready config
 * and a catalog with no command the page protects, so its shortcut gate is satisfied without any
 * edit. `catalog` and `config` share one store, as in the SDK registry. Edits are recorded only.
 */
function neutralShortcuts() {
  const state = store({
    catalog: [],
    config: { revision: 'page-open-neutral', sequence: 1, document: { schemaVersion: 1, profiles: {} }, status: 'ready', error: null, usingDefaults: true },
  })
  const edits = []
  return {
    runtime: 'web',
    platform: 'macos',
    stopSequenceMs: 500,
    edits,
    catalog: { getSnapshot: () => state.getSnapshot().catalog, subscribe: state.subscribe },
    config: { getSnapshot: () => state.getSnapshot().config, subscribe: state.subscribe },
    fixedCatalog: store([]),
    describeBinding: (binding) => ({ binding, keys: [], issue: null, conflicts: [] }),
    async edit(operation, revision) { edits.push({ operation, revision }); return { status: 'saved', snapshot: state.getSnapshot().config } },
    register: () => () => {},
    registerFixed: () => () => {},
    observeFixedInput: () => () => {},
  }
}

/** React stub: elements are plain objects; hooks read the store snapshot synchronously. */
function fakeReact() {
  const Fragment = Symbol('Fragment')
  return {
    Fragment,
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect() {},
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  }
}

/**
 * Harness plumbing, not an oracle: the page takes DSH's design-system `Button` from the client
 * primitives module. The stand-in renders the one native `<button type="button">` the real one
 * renders, so cases that find a button by tag and text stay valid.
 */
const PRIMITIVES = Object.freeze({ module: '@deepseek-ai/dsh-client-ui-primitives', buttonType: 'button' })
function primitives(React) {
  function Button({ variant: _variant, size: _size, children, ...props }) {
    return React.createElement(PRIMITIVES.buttonType, { type: PRIMITIVES.buttonType, ...props }, children)
  }
  return { Button }
}

/** Expand function components to host elements (one shallow render, no effects). */
function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(render)
  if (typeof node.type === 'function') return render(node.type({ ...node.props, children: node.children }))
  return [{ ...node, children: node.children.flatMap(render) }]
}

function textOf(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(textOf).join('')
}

function walk(nodes, visit) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    visit(node)
    walk(node.children, visit)
  }
}

/**
 * Load and apply the page. `respond({method, url})` returns {status, body} for each fetch.
 * Returns observation handles: fetch calls, openSession calls, timers, UI queries.
 * Optional `hooks` let a suite observe or fault the fakes without a second harness:
 * `beforeScript({sandbox, window, document})` runs before client.js is evaluated (globals the
 * page may read at load time), `beforeApply(ctx, env)` right before `plugin.apply(ctx)`.
 */
export function loadPage({ respond, hooks = {} }) {
  const fetches = []
  const opened = []
  const timers = { setTimeout: 0, setInterval: 0 }
  const windowListeners = new Map()
  const attributes = new Set()
  let registered

  class CSSStyleSheet {
    constructor() { this.cssRules = [] }
    insertRule(rule, index = this.cssRules.length) {
      this.cssRules.splice(index, 0, { cssText: rule, style: { setProperty() {}, removeProperty() {} } })
      return index
    }
  }
  const document = {
    baseURI: PAGE_BASE,
    adoptedStyleSheets: [],
    body: { appendChild() {}, removeChild() {} },
    documentElement: {
      setAttribute: (name) => { attributes.add(name) },
      removeAttribute: (name) => { attributes.delete(name) },
      hasAttribute: (name) => attributes.has(name),
      toggleAttribute(name, force) {
        const on = force === undefined ? !attributes.has(name) : Boolean(force)
        if (on) attributes.add(name)
        else attributes.delete(name)
        return on
      },
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    // The page's frame guard listens for anchor clicks on the document (LITE contract §5).
    addEventListener() {},
    removeEventListener() {},
  }
  const window = {
    __ModuleLoader__: { load(entry) { registered = entry } },
    // A real child document has a location (empty hash: no view/lang continuation) and window.open.
    location: { href: PAGE_BASE, hash: '', origin: new URL(PAGE_BASE).origin },
    open: () => null,
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type).add(fn)
    },
    removeEventListener(type, fn) { windowListeners.get(type)?.delete(fn) },
  }
  async function fetch(input, init = {}) {
    const url = new URL(String(input), PAGE_BASE)
    const method = String(init.method ?? 'GET').toUpperCase()
    const call = { method, url: url.href, pathname: url.pathname, init }
    fetches.push(call)
    const { status, body } = await respond(call)
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => structuredClone(body),
      text: async () => JSON.stringify(body),
    }
  }
  const sandbox = {
    window, document, fetch, CSSStyleSheet, URL, AbortController, queueMicrotask, structuredClone,
    console,
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return [] } },
    setTimeout: () => { timers.setTimeout++; return 0 },
    setInterval: () => { timers.setInterval++; return 0 },
    clearTimeout() {}, clearInterval() {},
    requestAnimationFrame: () => 0,
  }
  sandbox.globalThis = sandbox
  window.document = document
  hooks.beforeScript?.({ sandbox, window, document })
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(CLIENT, 'utf8'), sandbox, { filename: CLIENT })
  if (!registered || typeof registered.factory !== 'function') throw new Error('client.js did not register through __ModuleLoader__.load')

  const React = fakeReact()
  const modules = { react: React, 'react-dom': { createPortal: (node) => node }, [PRIMITIVES.module]: primitives(React) }
  const plugin = registered.factory((name) => {
    if (!(name in modules)) throw new Error('unexpected require ' + name)
    return modules[name]
  })

  const selected = store({ key: null })
  const panel = store({ activePanelId: null })
  const sessionsList = store([])
  const localeStore = store(0)
  const slots = []
  const disposers = []
  const ctx = {
    effect(execute) { const dispose = execute(); disposers.push(dispose); return dispose },
    slots: {
      register(options, Component) { const entry = { options, Component }; slots.push(entry); return () => { const at = slots.indexOf(entry); if (at >= 0) slots.splice(at, 1) } },
      inject(_name, fn) { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
    },
    layout: {
      panelInfo: panel,
      selectPanel: (id) => panel.set({ activePanelId: id }),
      toggleSidebar() {},
    },
    uiWorkspace: {
      async openSession(id) { opened.push(id); selected.set({ key: id }) },
    },
    uiSession: { adapter: { current: selected } },
    sessions: { list: sessionsList },
    locale: {
      bind: () => (key) => key,
      subscribe: localeStore.subscribe,
      getSnapshot: localeStore.getSnapshot,
      getLocale: () => ({ active: 'en', locales: [{ id: 'en', label: 'English' }], revision: 0 }),
      setLocale() {},
    },
    shortcuts: neutralShortcuts(),
  }
  hooks.beforeApply?.(ctx, { sandbox, window, document })
  plugin.apply(ctx)

  function view() { return slots.flatMap((entry) => render({ type: entry.Component, props: {}, children: [] })) }
  function buttons() {
    const found = []
    walk(view(), (node) => { if (node.type === 'button') found.push(node) })
    return found
  }
  return {
    plugin,
    fetches,
    opened,
    timers,
    posts: () => fetches.filter((call) => call.method === 'POST'),
    gets: () => fetches.filter((call) => call.method === 'GET'),
    /** Texts of all rendered nodes with role=status. */
    statuses() {
      const found = []
      walk(view(), (node) => { if (node.props?.role === 'status') found.push(textOf(node)) })
      return found
    },
    retry: () => buttons().find((node) => textOf(node) === 'Retry'),
    notifySessionsList: () => sessionsList.set([...sessionsList.getSnapshot()]),
    focus: () => { for (const fn of [...(windowListeners.get('focus') ?? [])]) fn({ type: 'focus' }) },
    dispose: () => { for (const dispose of disposers.splice(0).reverse()) if (typeof dispose === 'function') dispose() },
  }
}

/** Let page promises, microtasks and fake fetches settle (real host timers, not the page's). */
export async function settle(rounds = 20) {
  for (let index = 0; index < rounds; index++) await new Promise((resolve) => setImmediate(resolve))
}
