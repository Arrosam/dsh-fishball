/**
 * A small React stand-in for running DSH client scripts in Node without React installed: hooks,
 * effects with cleanup, re-render on state change and unmount. It is not React's reconciler (no
 * concurrent rendering, no StrictMode double effects, no DOM); effects run after each synchronous
 * render pass. Host elements render to plain `{tag, props, children}` nodes the queries below read.
 */
import { SHIM } from './constants.mjs'

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
    if (++renders > SHIM.renderGuard) throw new Error('render loop: more than ' + SHIM.renderGuard + ' renders')
    const visited = new Set()
    const next = []
    treesByRoot.clear()
    for (const [key, build] of roots) {
      const rendered = renderNode(build(), 'root:' + key, visited)
      treesByRoot.set(key, rendered)
      next.push(...rendered)
    }
    tree = next
    // A DOM commit can navigate an iframe before passive effects clear it on a later render.
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
