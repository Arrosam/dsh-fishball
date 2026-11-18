import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { mountMain } from './cases.mjs'
import { byTag, hostWorld, openPage, press, textIn } from './world.mjs'

const READY = Object.freeze({ type: 'fishball:frame-ready', version: 1 })
const DEADLINE = 15_000
const AGAIN = 'Open Fishball again'
const TIMEOUT = "Fishball didn't load"

// Only the scripted page's timeout queue is virtual. SDK activity and the suite keep their own clocks.
function clock() {
  let now = 0
  const deadlines = new Map()
  return {
    install({ sandbox, window }) {
      const setTimeout = (fn, delay, ...args) => {
        const id = Symbol('timer')
        deadlines.set(id, { due: now + Number(delay || 0), call: () => fn(...args) })
        return id
      }
      for (const target of [window, sandbox]) Object.assign(target, { setTimeout, clearTimeout: (id) => deadlines.delete(id) })
    },
    advance(ms) {
      const end = now + ms
      for (;;) {
        const first = [...deadlines].sort((a, b) => a[1].due - b[1].due)[0]
        if (!first || first[1].due > end) break
        const [id, { due, call }] = first
        deadlines.delete(id); now = due; call()
      }
      now = end
    },
  }
}

// A DOM ref's browsing context follows the mounted element, not its src. Navigating an existing
// iframe must not give it a fresh WindowProxy (otherwise stale-frame tests could pass falsely).
function frameRefs() {
  let current
  return {
    adaptReact(react) {
      function FixtureFrame({ frameProps }) {
        const node = react.useRef({ contentWindow: Object.freeze({}) }).current
        node.src = frameProps.src
        react.useLayoutEffect(() => {
          const bind = (value) => { if (typeof frameProps.ref === 'function') frameProps.ref(value); else if (frameProps.ref) frameProps.ref.current = value }
          current = node; bind(node)
          return () => { bind(null); if (current === node) current = undefined }
        }, [frameProps.ref, node])
        return react.createElement('iframe', frameProps)
      }
      return { ...react, createElement(tag, props, ...children) {
        if (tag !== 'iframe') return react.createElement(tag, props, ...children)
        // Present the iframe as a keyed child even if the caller supplied no siblings, so the shim's
        // existing keyed-child reconciliation handles a changed key as well as unmount/remount.
        return [react.createElement(FixtureFrame, { key: props?.key, frameProps: props ?? {} })]
      } }
    },
    source: () => current?.contentWindow,
  }
}

function pathTo(nodes, target) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    if (node === target) return [node]
    const nested = pathTo(node.children, target)
    if (nested.length) return [node, ...nested]
  }
  return []
}
const concealed = (node) => node.props.hidden === true || node.props.style?.display === 'none' || node.props.style?.visibility === 'hidden'

async function windowView(t, host) {
  const timer = clock()
  const { adaptReact, source } = frameRefs()
  const page = await openPage(t, host, { prepare: timer.install, adaptReact })
  const view = await mountMain(page)
  const frame = () => byTag(view.tree(), 'iframe')[0]
  assert.ok(await page.waitFor(frame), 'the host mounted no child frame')
  const hidden = () => pathTo(view.tree(), frame()).some(concealed)
  const tick = async (ms) => { timer.advance(ms); await page.settle() }
  const again = () => byTag(view.tree(), 'button').find((n) => (n.props['aria-label'] ?? textIn(n)) === AGAIN && !n.props.disabled && !pathTo(view.tree(), n).some(concealed))
  const signal = async (fields = {}) => {
    assert.ok(source(), 'mounted frame must be addressable')
    page.frames.dispatch('message', { data: READY, source: source(), origin: new URL(frame().props.src, page.baseURI).origin, ...fields })
    await page.settle()
  }
  return { page, view, frame, source, tick, hidden, again, signal }
}

export function registerFrameReadyCases(sdk) {
  const row = (name, title, fn) => caseTest(sdk, 'FRAME-READY', name, title, async (t) => fn(t, await hostWorld(t, sdk)))
  row('filter', 'load and near-match messages never reveal the waiting frame; exact current source, origin and payload reveal it', async (t, host) => {
    const w = await windowView(t, host)
    assert.ok(w.hidden(), 'waiting frame is visible')
    w.frame().props.onLoad?.({ currentTarget: { contentWindow: w.source() } })
    await w.page.settle()
    assert.ok(w.hidden(), 'load alone revealed the frame')
    for (const [label, fields] of Object.entries({
      'another frame': { source: {} }, 'null source': { source: null },
      'same hostname, different port': { origin: new URL(w.page.baseURI).origin },
      'wrong type': { data: { ...READY, type: 'other' } }, 'wrong version': { data: { ...READY, version: 2 } },
      'missing version': { data: { type: READY.type } }, 'extra field': { data: { ...READY, note: 'fixture' } },
      'null payload': { data: null }, 'string payload': { data: READY.type }, 'array payload': { data: [READY] },
    })) { await w.signal(fields); assert.ok(w.hidden(), `${label} revealed the child`) }
    const first = w.source()
    await w.signal()
    assert.equal(w.hidden(), false, 'valid readiness left the frame hidden')
    assert.equal(w.source(), first, 'revealing replaced the frame')
  })
  row('timeout', '14999 ms is still waiting; at 15000 ms the hidden frame has an explanation and an enabled native retry button', async (t, host) => {
    const w = await windowView(t, host)
    await w.tick(DEADLINE - 1)
    assert.ok(!textIn(w.view.tree()).includes(TIMEOUT), 'recovery shown before deadline')
    assert.ok(!w.again(), 'retry offered before deadline')
    await w.signal({ source: {} }) // Must not restart the deadline.
    await w.tick(1)
    assert.ok(w.hidden(), 'timed-out frame is visible')
    const text = textIn(w.view.tree())
    assert.ok(text.includes(TIMEOUT), 'missing timeout heading')
    assert.ok(text.includes("This frame hasn't confirmed that Fishball loaded."), 'missing timeout explanation')
    assert.ok(w.again(), 'no accessible enabled retry button')
    assert.notEqual(String(w.again().props.tabIndex), '-1', 'retry cannot receive keyboard focus')
  })
  row('late', 'late readiness clears recovery and reveals the original frame without another admission', async (t, host) => {
    const w = await windowView(t, host)
    const original = w.source()
    const admissions = host.child.admissions.length
    await w.tick(DEADLINE)
    assert.ok(w.again(), 'recovery not visible before late signal')
    await w.signal()
    assert.equal(host.child.admissions.length, admissions, 'late readiness requested another admission')
    assert.equal(w.source(), original)
    assert.ok(!w.hidden() && !w.again() && !textIn(w.view.tree()).includes(TIMEOUT), 'late readiness did not clear recovery')
  })
  row('isolation', 'B retry gets a fresh frame; stale and other-window messages cannot affect either client', async (t, host) => {
    const a = await windowView(t, host)
    await a.signal()
    const aFrame = a.source()
    const b = await windowView(t, host)
    const stale = b.source()
    await b.signal({ source: aFrame })
    assert.ok(b.hidden() && !a.hidden(), 'independent windows shared readiness')
    await b.tick(DEADLINE)
    assert.ok(b.again() && !a.again(), 'B timeout changed A')
    const count = host.child.admissions.length
    await press(b.page, b.again())
    assert.ok(await b.page.waitFor(() => b.source() && b.source() !== stale), 'retry did not create a fresh browsing context')
    assert.equal(host.child.admissions.length, count + 1, 'retry did not obtain exactly one fresh admission')
    assert.equal(host.child.retries, 0, 'opening the frame again restarted the child')
    assert.ok(!b.again(), 'new frame inherited old recovery state')
    await b.signal({ source: stale })
    assert.ok(b.hidden(), 'stale readiness revealed replacement')
    await b.signal()
    assert.ok(!a.hidden() && !b.hidden() && !b.again(), 'both windows did not finish ready')
    assert.equal(a.source(), aFrame, 'B retry replaced A')
  })
}
