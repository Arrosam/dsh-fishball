/**
 * fishball-test-helpers ./react-shim: the hook shim and the tree queries.
 * Techniques: ST for a component's life (mount → state change → re-render → deps change → unmount),
 * EP for the hook kinds and the rendered node kinds, BVA for the render-loop guard (n and n + 1
 * renders), DT for the effect's deps (none / [] / unchanged / changed).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { SHIM, byAttr, buttons, contains, createReactShim, deferred, edit, effectDisposer, fakePrimitives, findAll, idempotent, jsxRuntime, press, snapshotStore, subtree, textOf, walk } from '../react-shim.mjs'
import { settle } from '../wait.mjs'

const T = Object.freeze({ root: 'root', other: 'other', mark: 'data-fbtest', label: 'count' })

/** A component that logs its effect runs and cleanups. */
function counterWorld(observe = {}) {
  const shim = createReactShim(observe)
  const { React } = shim
  const h = React.createElement
  const log = []
  let setCount
  function Counter({ step }) {
    const [count, set] = React.useState(0)
    setCount = set
    React.useEffect(() => { log.push('effect ' + step); return () => log.push('cleanup ' + step) }, [step])
    return h('div', { [T.mark]: T.label }, String(count))
  }
  return { shim, React, h, log, Counter, set: (v) => setCount(v) }
}

test('HLP-SHIM-ST-01 mount runs the effect; a state change re-renders once per batch; a deps change cleans up then re-runs; unmount cleans up', async () => {
  const w = counterWorld()
  let step = 1
  w.shim.mount(T.root, () => w.h(w.Counter, { step }))
  assert.deepEqual(w.log, ['effect 1'])
  assert.equal(textOf(w.shim.treeOf(T.root)[0]), '0')
  const before = w.shim.renders()
  w.set(1); w.set(2)
  await settle()
  assert.equal(textOf(w.shim.treeOf(T.root)[0]), '2')
  assert.equal(w.shim.renders() - before, 1, 'two sets in one turn are one render')
  assert.deepEqual(w.log, ['effect 1'], 'unchanged deps: the effect does not re-run')
  step = 2
  w.shim.rerender()
  await settle()
  assert.deepEqual(w.log, ['effect 1', 'cleanup 1', 'effect 2'])
  w.shim.unmountRoot(T.root)
  assert.deepEqual(w.log, ['effect 1', 'cleanup 1', 'effect 2', 'cleanup 2'])
  assert.deepEqual(w.shim.roots(), [])
})

test('HLP-SHIM-ST-02 a state update after unmount is not applied and is reported as stale', async () => {
  let stale = 0
  const w = counterWorld({ stale: () => { stale += 1 } })
  w.shim.mount(T.root, () => w.h(w.Counter, { step: 1 }))
  w.shim.unmountRoot(T.root)
  const renders = w.shim.renders()
  w.set(5)
  await settle()
  assert.equal(stale, 1)
  assert.equal(w.shim.renders(), renders, 'no render for a stale update')
})

const DEPS_ROWS = Object.freeze([
  { row: 1, deps: () => undefined, reruns: true, why: 'no deps: every render' },
  { row: 2, deps: () => [], reruns: false, why: 'empty deps: mount only' },
  { row: 3, deps: (n) => [n % 1], reruns: false, why: 'unchanged value' },
  { row: 4, deps: (n) => [n], reruns: true, why: 'changed value' },
])
for (const r of DEPS_ROWS) {
  test(`HLP-SHIM-DT-01 row ${r.row} effect deps: ${r.why} → ${r.reruns ? 're-runs' : 'stays'} on re-render`, async () => {
    const shim = createReactShim()
    const { React } = shim
    let runs = 0
    let n = 0
    function C() { React.useEffect(() => { runs += 1 }, r.deps(n)); return null }
    shim.mount(T.root, () => React.createElement(C))
    n = 1
    shim.rerender()
    await settle()
    assert.equal(runs, r.reruns ? 2 : 1)
  })
}

test('HLP-SHIM-EP-01 hooks: reducer, memo, callback, ref, id, context, external store', async () => {
  const shim = createReactShim()
  const { React } = shim
  const h = React.createElement
  const store = snapshotStore({ n: 1 })
  const Theme = React.createContext('light')
  const seen = {}
  let dispatch
  function C() {
    const [total, d] = React.useReducer((s, a) => s + a, 10)
    dispatch = d
    const ref = React.useRef(0)
    ref.current += 1
    const id = React.useId()
    const memo = React.useMemo(() => ({ made: true }), [])
    const cb = React.useCallback(() => 1, [])
    const { n } = React.useSyncExternalStore(store.subscribe, store.getSnapshot)
    Object.assign(seen, { total, renders: ref.current, id, theme: React.useContext(Theme), n })
    seen.memos = (seen.memos ?? new Set()).add(memo)
    seen.cbs = (seen.cbs ?? new Set()).add(cb)
    return null
  }
  shim.mount(T.root, () => h(Theme.Provider, { value: 'dark' }, h(C)))
  const firstId = seen.id
  dispatch(5)
  await settle()
  store.set({ n: 2 })
  await settle()
  assert.equal(seen.total, 15)
  assert.equal(seen.n, 2)
  assert.equal(seen.theme, 'dark')
  assert.equal(seen.renders, 3)
  assert.equal(seen.id, firstId, 'useId is stable')
  assert.equal(seen.memos.size, 1)
  assert.equal(seen.cbs.size, 1)
  store.update((draft) => { draft.n = 3 })
  await settle()
  assert.equal(seen.n, 3, 'update(draft) reaches the subscriber')
})

test('HLP-SHIM-EP-02 a changed key remounts a lone child; a removed child is unmounted', async () => {
  const shim = createReactShim()
  const { React } = shim
  const h = React.createElement
  const mounts = []
  function Child({ id }) { React.useEffect(() => { mounts.push('+' + id); return () => mounts.push('-' + id) }, []); return h('span', null, id) }
  let key = 'a'
  let shown = true
  shim.mount(T.root, () => h('div', null, shown ? h(Child, { key, id: key }) : null))
  key = 'b'
  shim.rerender(); await settle()
  shown = false
  shim.rerender(); await settle()
  assert.deepEqual(mounts, ['+a', '-a', '+b', '-b'])
})

test('HLP-SHIM-BVA-01 the render guard allows renderGuard renders and fails the next one', () => {
  const shim = createReactShim({}, { renderGuard: 2 })
  shim.mount(T.root, () => null)
  shim.mount(T.other, () => null)
  assert.throws(() => shim.mount(T.root, () => null), /render loop: more than 2 renders/)
  assert.equal(SHIM.renderGuard, 200)
})

test('HLP-SHIM-EP-03 hostRef sees host elements with a ref, during render; commit sees each pass', () => {
  const refs = []
  let commits = 0
  const shim = createReactShim({ hostRef: (path, tag) => refs.push([path, tag]), commit: () => { commits += 1 } })
  const { React } = shim
  shim.mount(T.root, () => React.createElement('div', null, React.createElement('button', { ref: () => {} }), React.createElement('p')))
  assert.equal(refs.length, 1)
  assert.equal(refs[0][1], 'button')
  assert.equal(commits, 1)
})

test('HLP-SHIM-EP-04 queries over the tree: text, walk, findAll, byAttr, subtree, contains, buttons; press and edit', () => {
  const shim = createReactShim()
  const { React } = shim
  const h = React.createElement
  const P = fakePrimitives(React)
  const clicks = []
  const edits = []
  shim.mount(T.root, () => h('section', { [T.mark]: 'a' },
    h('p', { [T.mark]: 'b' }, 'one ', 2),
    h(P.Button, { onClick: () => clicks.push(1) }, 'press'),
    h(P.Anything, { title: 'generic' }, h('input', { onChange: (e) => edits.push(e.target.value) })),
    h(P.StateDot, { state: 'x' })))
  const tree = shim.treeOf(T.root)
  const [section] = tree
  assert.equal(textOf(section), 'one 2press')
  assert.equal([...walk(tree)].length, 6)
  assert.equal(byAttr(tree, T.mark).length, 2)
  assert.equal(byAttr(tree, T.mark, 'b')[0].tag, 'p')
  const generic = byAttr(tree, SHIM.primitive, 'Anything')[0]
  assert.equal(generic.props.title, 'generic')
  assert.equal(findAll(tree, (n) => n.props[SHIM.primitive] === 'StateDot')[0].tag, 'span')
  assert.equal(subtree(section).length, 6)
  assert.ok(contains(section, generic))
  assert.equal(buttons(section).length, 1)
  assert.equal(buttons(section)[0].props.type, 'button')
  press(buttons(section)[0])
  edit(findAll(tree, (n) => n.tag === 'input')[0], 'typed')
  assert.deepEqual(clicks, [1])
  assert.deepEqual(edits, ['typed'])
  assert.throws(() => press(undefined), /nothing to press/)
})

test('HLP-SHIM-EP-05 jsx runtime, deferred, idempotent and effect disposers', async () => {
  const { React } = createReactShim()
  const { jsx } = jsxRuntime(React)
  assert.equal(jsx('a', { href: 'x' }, 'k').key, 'k')
  const d = deferred()
  setTimeout(() => d.resolve('done'))
  assert.equal(await d.promise, 'done')
  let runs = 0
  const once = idempotent(() => { runs += 1 })
  once(); once()
  assert.equal(runs, 1)
  const order = []
  const all = effectDisposer([() => order.push(1), () => order.push(2)])
  all(); all()
  assert.deepEqual(order, [2, 1], 'an iterable is disposed in reverse, once')
  assert.doesNotThrow(() => effectDisposer(undefined)())
})
