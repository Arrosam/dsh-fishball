/** Execute the public browser plugin entry and drive its host extension boundaries, never its private helpers. */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { REPO } from './constants.mjs'
import { MODEL_CASE as C } from './dedicated-model.mjs'

const UI = Object.freeze({
  file: path.join(REPO, 'packages', 'connector', 'client.js'), base: 'http://fishball.test/', fishball: 'dedicated-fishball', ordinary: 'ordinary-control',
  moduleId: 'fishball-connector', dock: 'conversation.input.dock', settings: 'plugins.bundle.config', empty: '', slash: '/',
  defaultLocale: 'en',
  method: Object.freeze({ get: 'GET', post: 'POST' }),
  catalog: Object.freeze({ groups: [{ id: C.selection.provider, name: 'Test provider', models: [{ id: C.original.model, name: 'Original model' }, { id: C.selection.model, name: 'Dedicated model' }] }], failures: [], routableProviders: [C.selection.provider], default: C.original }),
})
export { UI }

const inert = () => undefined
const primitive = (name) => (props) => ({ type: name, props })
const neutral = new Proxy(function () {}, { get: (_target, key) => key === Symbol.toPrimitive ? () => UI.empty : neutral, apply: () => neutral })
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]))

/** Options add only external boundaries: an HTTP-served combo script, real fetch, OS motion preference, and locale. */
export async function clientHarness(options = {}) {
  const { locale = UI.defaultLocale } = options
  let definition
  let dictionaries
  let current
  let position
  let root
  let tree
  let dirty = false
  const cells = new Map()
  const effects = []
  const disposers = []
  const sources = []
  const registrations = []
  const blocks = new Map()
  const sent = []
  const opened = []
  const reloads = []
  const subscriptions = new Map()
  // Each fixture reply or rejection settles the oldest pending POST, including overlapping status calls.
  const answers = []
  const React = {
    Fragment: 'fragment',
    useId() { return current + UI.slash + position++ },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } }),
    useState(initial) { const state = hook(); if (!('value' in state)) state.value = typeof initial === 'function' ? initial() : initial; return [state.value, (next) => { state.value = typeof next === 'function' ? next(state.value) : next; dirty = true }] },
    useRef(initial) { const state = hook(); state.value ??= { current: initial }; return state.value },
    useMemo(fn, deps) { const state = hook(); if (!equalDeps(state.deps, deps)) { state.deps = deps; state.value = fn() }; return state.value },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const state = hook(); if (!equalDeps(state.deps, deps)) { state.deps = deps; effects.push(() => { state.cleanup?.(); state.cleanup = fn() }) } },
    useLayoutEffect(fn, deps) { return React.useEffect(fn, deps) },
    useSyncExternalStore(subscribe, get) { if (!subscriptions.has(subscribe)) subscriptions.set(subscribe, subscribe(() => { dirty = true })); return get() },
  }
  function hook() { const key = current + UI.slash + position++; if (!cells.has(key)) cells.set(key, {}); return cells.get(key) }
  function expand(node, key = UI.slash) {
    if (node == null || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map((child, index) => expand(child, key + index))
    if (typeof node.type === 'function') {
      const previous = [current, position]
      current = key; position = C.zero
      const rendered = node.type(node.props ?? {})
      ;[current, position] = previous
      return expand(rendered, key + UI.slash)
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, key + UI.slash) } }
  }
  async function flush() {
    do {
      dirty = false
      if (root) tree = expand(root)
      while (effects.length) effects.shift()()
      await Promise.resolve()
    } while (dirty)
    return tree
  }
  const styles = []
  const documentListeners = new Map()
  const document = {
    baseURI: UI.base, head: { appendChild: (element) => styles.push(element) }, documentElement: { setAttribute: inert, removeAttribute: inert },
    createElement: () => ({ remove: inert, setAttribute: inert }), getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, new Set()); documentListeners.get(type).add(listener) },
    removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener) },
  }
  const fetch = async (url, request = {}) => {
    // Interception precedes URL parsing; undefined delegates to the existing transport or fixture.
    const intercepted = options.interceptFetch?.(url, request)
    if (intercepted !== undefined) return intercepted
    const pathname = new URL(url).pathname
    if (options.fetch) return options.fetch(url, request)
    if ((request.method ?? UI.method.get) === UI.method.post) {
      sent.push({ pathname, body: JSON.parse(request.body) })
      return new Promise((resolve, reject) => { answers.push({ resolve: (ok, body = {}) => resolve({ ok, json: async () => body }), reject }) })
    }
    return { ok: true, json: async () => ({ ok: true, catalog: UI.catalog }) }
  }
  vm.runInNewContext(options.script ?? fs.readFileSync(UI.file, 'utf8'), {
    window: { location: { reload: (...args) => reloads.push(args) }, __ModuleLoader__: { load: (value) => { if (value.id === UI.moduleId) definition = value } }, matchMedia: () => ({ matches: options.reducedMotion ?? false }), addEventListener: inert, removeEventListener: inert },
    document, fetch, URL, AbortController, console, setTimeout, clearTimeout, matchMedia: () => ({ matches: options.reducedMotion ?? false }), CSS: { escape: (value) => value },
    EventSource: class { constructor() { sources.push(this) } close() {} },
    MutationObserver: class { observe() {} disconnect() {} },
  })
  const primitives = new Proxy({}, { get: (_target, key) => key === 'SettingsFormModel' ? class { subscribe = () => inert; getSnapshot = () => ({}); bind() { return { subscribe: () => inert, getSnapshot: () => ({ fields: new Proxy({}, { get: () => ({ text: UI.empty }) }) }) } }; actions() { return {} }; dispose() {} } : key === 'settingsNumberField' ? inert : primitive(String(key)) })
  const exported = definition.factory((name) => name === 'react' ? React : name === 'react-dom' ? { createPortal: (element) => element } : name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : neutral)
  const slots = {
    inject(_name, factory) { const value = factory(); if (value?.[Symbol.iterator]) for (const item of value) void item; return inert },
    register(options, Component) { registrations.push({ ...options, Component }); return inert },
  }
  const settings = { openBundle: (...args) => opened.push(args), open: (...args) => opened.push(args) }
  const conversation = { blocks: { storeFor: (id) => ({ getSnapshot: () => blocks.get(id) }), set: (id, block) => block === undefined ? blocks.delete(id) : blocks.set(id, block) } }
  const ctx = {
    slots, conversation,
    inject(_deps, fn) { return fn(ctx) },
    locale: { bind: () => (key, values = {}) => { let text = dictionaries?.[locale]?.[key] ?? dictionaries?.en?.[key] ?? key; for (const [name, value] of Object.entries(values)) text = text.replaceAll('{'+name+'}', value); return text }, register(_ns, value) { dictionaries = value; return inert }, resolveText: (text) => text },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
    configForms: { get: () => neutral, whileServed(_ids, fn) { return fn() } },
    get: (name) => name === 'conversation' ? conversation : name.toLowerCase().includes('plugin') || name.toLowerCase().includes('setting') ? settings : undefined,
  }
  exported.apply(ctx)
  const state = (selection = null) => ({ status: 'live', sessionId: UI.fishball, modelSelection: selection, limits: {}, hiddenTools: [], preferences: {}, catalog: null })
  async function emitSnapshot(snapshot) { for (const source of sources) source.onmessage?.({ data: JSON.stringify(snapshot) }); return flush() }
  async function emit(selection = null) { return emitSnapshot(state(selection)) }
  return {
    registrations, blocks, sent, opened, state, styles, reloads,
    async render(Component, props = {}) { root = React.createElement(Component, props); return flush() },
    flush, emit, emitSnapshot,
    unmount() {
      // A real root cleanup runs before a later mount; clear hook cells so a new
      // mount cannot accidentally reuse the obsolete instance in lifecycle tests.
      root = null; tree = null; effects.length = C.zero
      for (const dispose of subscriptions.values()) dispose?.()
      subscriptions.clear()
      for (const cell of cells.values()) cell.cleanup?.()
      cells.clear()
    },
    reply(ok, body) { answers.shift()?.resolve(ok, body); return flush() },
    reject(error) { answers.shift()?.reject(error); return flush() },
    dispose() { for (const dispose of subscriptions.values()) dispose?.(); for (const cell of cells.values()) cell.cleanup?.(); while (disposers.length) disposers.pop()() },
  }
}

export function nodes(tree, predicate) {
  if (tree == null) return []
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate))
  if (typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
export const textOf = (tree) => tree == null ? UI.empty : Array.isArray(tree) ? tree.map(textOf).join(' ') : typeof tree === 'object' ? textOf(tree.props?.children) : String(tree)
