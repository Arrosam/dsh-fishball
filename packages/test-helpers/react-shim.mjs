/**
 * A hand-written React for client scripts run in node:vm, and queries over what it renders.
 *
 * Why a shim: React is not resolvable from the repository (DSH ships it only inside its prebuilt
 * web frontend bundle) and nothing may be installed, so a page answers `require('react')` with this.
 * It has real hooks (state, reducer, effects with cleanup, memo, refs, context, external stores),
 * re-renders on state change (batched in one microtask) and unmounts components that leave the
 * tree, running their effect cleanups. LIMIT: it is not React's reconciler — no concurrent
 * rendering, no StrictMode double effects, no real DOM (host elements are plain objects; see
 * ./fake-dom `hostRef` for the elements a ref receives); effects run after each synchronous render
 * pass, layout effects with them.
 *
 * A rendered host node is `{tag, props, children}` (children are host nodes and strings).
 */

export const SHIM = Object.freeze({
  /** More renders than this in one shim is a render loop (a case bug or a product bug), not a page. */
  renderGuard: 200,
  /** The attribute generic primitive stand-ins carry their export name in. */
  primitive: 'data-primitive',
  fragment: 'shim.fragment',
})

const depsChanged = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))

/**
 * @param observe.stale - called when a component already unmounted sets its state.
 * @param observe.hostRef - `(path, tag, props)` for every host element rendered with a `ref`.
 * @param observe.commit - `(tree, slotOf)` after each render pass, before effects run.
 * @param options.renderGuard - the render-loop limit (SHIM.renderGuard).
 * @returns {{ React, mount(key, build), unmountRoot(key), rerender(), tree(), treeOf(key), roots(), renders() }}
 */
export function createReactShim(observe = {}, { renderGuard = SHIM.renderGuard } = {}) {
  const Fragment = Symbol.for(SHIM.fragment)
  const instances = new Map()
  const roots = new Map()
  const contextValues = new Map()
  let current = null
  let scheduled = false
  let renders = 0
  let tree = []
  const treesByRoot = new Map()
  const hostSlots = observe.commit && new WeakMap()

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
      if (!inst.alive) { observe.stale?.(); return }
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

  function renderNode(node, at, visited, keyedByParent = false) {
    if (node === null || node === undefined || typeof node === 'boolean') return []
    if (typeof node === 'string' || typeof node === 'number') return [String(node)]
    if (Array.isArray(node)) return node.flatMap((child, i) => renderNode(child, at + '/' + (child?.key ?? i), visited, true))
    if (!node.$$rp) throw new Error('rendered a non-element object')
    // A changed key replaces even a lone child (not just an element in an array).
    if (!keyedByParent && node.key != null) at += '/key:' + JSON.stringify(node.key)
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
      const host = { tag: type, props: rest, children: renderNode(children, at + '/' + type, visited) }
      hostSlots?.set(host, at + '/' + type)
      return [host]
    }
    throw new Error('unsupported element type ' + String(type))
  }
  function unmount(inst) {
    inst.alive = false
    instances.delete(inst.id)
    for (const state of inst.effects) if (typeof state.cleanup === 'function') { const fn = state.cleanup; state.cleanup = undefined; fn() }
  }
  function rerender() {
    if (++renders > renderGuard) throw new Error('render loop: more than ' + renderGuard + ' renders')
    const visited = new Set()
    const next = []
    treesByRoot.clear()
    for (const [key, build] of roots) {
      const rendered = renderNode(build(), 'root:' + key, visited)
      treesByRoot.set(key, rendered)
      next.push(...rendered)
    }
    tree = next
    // A DOM commit can act (navigate an iframe) before passive effects clear it on a later render.
    observe.commit?.(tree, (host) => hostSlots.get(host))
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
    /** Mount (or replace) one root: `build()` answers its element on every render. Renders at once. */
    mount(key, build) { roots.set(key, build); rerender() },
    unmountRoot(key) { roots.delete(key); rerender() },
    /** Schedule one render (in a microtask, batched). */
    rerender: schedule,
    tree: () => tree,
    /** The rendered host tree of one root (mount key). */
    treeOf: (key) => treesByRoot.get(key) ?? [],
    /** The keys of the mounted roots. */
    roots: () => [...roots.keys()],
    renders: () => renders,
  }
}

/** The automatic JSX runtime (`react/jsx-runtime`) a bundled classic script may require, over a shim's React. */
export function jsxRuntime(React) {
  const jsx = (type, props, key) => React.createElement(type, key === undefined ? props : { ...props, key })
  return { jsx, jsxs: jsx, Fragment: React.Fragment }
}

/** `react-dom` and `react-dom/client` as a scripted page answers them: portals render inline, roots do nothing. */
export function reactDomModules() {
  const client = { createRoot: () => ({ render() {}, unmount() {} }), hydrateRoot: () => ({ render() {}, unmount() {} }) }
  return { 'react-dom': { createPortal: (node) => node, ...client }, 'react-dom/client': client }
}

/**
 * A primitives module (`@deepseek-ai/dsh-client-ui-primitives` as a page answers it): the `known`
 * components by name, then `special(name)` when it answers one, and for every other export a generic
 * `<div data-primitive="<name>">` that forwards its props and children.
 */
export function primitivesModule(React, known = {}, special = () => undefined) {
  const generic = new Map()
  const primitives = new Proxy(known, {
    get(target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (name in target) return target[name]
      const own = special(name)
      if (own) return own
      if (!generic.has(name)) generic.set(name, function Primitive({ children, ...rest }) { return React.createElement('div', { [SHIM.primitive]: name, ...rest }, children) })
      return generic.get(name)
    },
  })
  return primitives
}

/** The plain fake primitives: Button is a `<button type="button">`, StateDot a `<span>`, every other export generic. */
export function fakePrimitives(React) {
  const h = React.createElement
  return primitivesModule(React, {
    Button: function Button({ children, ...rest }) { return h('button', { type: 'button', ...rest }, children) },
    StateDot: function StateDot({ children, ...rest }) { return h('span', { [SHIM.primitive]: 'StateDot', ...rest }, children) },
  })
}

// ---------------------------------------------------------------------------------------------
// Queries over the rendered host tree
// ---------------------------------------------------------------------------------------------

/** The text a node shows (a string, or all text below a host node). */
export function textOf(node) {
  if (typeof node === 'string') return node
  return (node.children ?? []).map(textOf).join('')
}
/** Every host node below `nodes` (depth first), with its parent: `{node, parent}`. */
export function* walk(nodes, parent = null) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield { node, parent }
    yield* walk(node.children, node)
  }
}
export const findAll = (nodes, predicate) => [...walk(nodes)].map((entry) => entry.node).filter(predicate)
/** Host nodes carrying prop `name` (any value, or `value` compared as text). */
export const byAttr = (nodes, name, value) => findAll(nodes, (n) => n.props[name] !== undefined && (value === undefined || String(n.props[name]) === String(value)))
/** The node itself and every element below it. */
export const subtree = (node) => [node, ...findAll(node.children, () => true)]
export const contains = (ancestor, node) => subtree(ancestor).includes(node)
export const buttons = (node) => subtree(node).filter((n) => n.tag === 'button')

/** The event object a click handler receives from `press`. */
const clickEvent = (node) => ({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
/** Call a host node's onClick as a click would. Throws when there is no node. */
export function press(node) {
  if (!node) throw new Error('nothing to press')
  node.props.onClick?.(clickEvent(node))
}
/** Call an input's onChange with `value`, as typing it would. Throws when there is no node. */
export function edit(node, value) {
  if (!node) throw new Error('nothing to edit')
  node.props.onChange?.({ target: { value }, currentTarget: { value } })
}

// ---------------------------------------------------------------------------------------------
// Small tools pages share
// ---------------------------------------------------------------------------------------------

/** `{promise, resolve, reject}`: a promise a case settles when it chooses. */
export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A disposer that runs `fn` once, however often it is called. */
export function idempotent(fn) {
  let done = false
  return () => { if (done) return; done = true; fn() }
}

/**
 * The disposer of an effect's result, as Cordis's `ctx.effect` takes it: a function, an iterable of
 * functions (disposed in reverse order), or nothing. Idempotent.
 */
export function effectDisposer(effect) {
  if (typeof effect === 'function') return idempotent(effect)
  if (effect && typeof effect[Symbol.iterator] === 'function') { const all = [...effect]; return idempotent(() => { for (const fn of all.reverse()) fn?.() }) }
  return () => {}
}

/** A snapshot store with DSH's client-store face: `getSnapshot`, `subscribe`, `set`, `update(draft => …)`. */
export function snapshotStore(initial) {
  let value = initial
  const listeners = new Set()
  const notify = () => { for (const fn of [...listeners]) fn() }
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { value = next; notify() },
    update: (fn) => { const draft = structuredClone(value); fn(draft); value = draft; notify() },
  }
}
