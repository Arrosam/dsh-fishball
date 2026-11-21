/**
 * LOGO-BUTTON component page: fishball-ui's real `client.js` and its chunks in the F-SETTINGS
 * scripted page (`../../fishball-core/settings/page.mjs`), with `<html data-fishball-page>` set as
 * fishball-page sets it, over a scripted shell that renders the two brand slots the way DSH's own
 * sidebar does (`dsh-client-ui-sidebar/lib/client.js`, both SDKs):
 * - the expanded brand row is the shell's own `button[aria-label="<New session>"]` holding
 *   `sidebar.brand.mark` (owner `{size: 24}`) and `sidebar.brand.name` (no owner props);
 * - the collapsed rail renders the mark slot inside the shell's toggle button
 *   (`aria-label="<Collapse sidebar>"`), beside DSH's own panel glyph;
 * - the shell also renders the real New Session button, sharing the initial label.
 *
 * `hostRef` gives every host element that React would commit a small DOM element with real
 * attribute storage, a parent/`closest('button')` chain, capture/bubble listeners and attribute
 * mutation notifications, so a brand occupant that climbs from its slot root to the shell button
 * and observes that button's `aria-label` sees what it would in a browser. The shell's New Session
 * handler sits on the sidebar container (as React's delegated handler does): a click reaches it
 * only if the brand's capture handler does not stop it.
 *
 * Streams are the health-aware EventSource stand-in (`../stream/event-source.mjs`): the page's one
 * connection (ROUTE.path), which carries both views as `{topic, frame}` and whose health is both's; the
 * sessions list is the public `{byId}` snapshot store; `uiWorkspace.openSession` records calls.
 */
import { createReactShim, findAll, textOf, walk } from '../../../support/rp-recommend.mjs'
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { CLIENTS } from '../../fishball-core/settings/constants.mjs'
import { eventSourceClass, isPageStream, topicView } from '../stream/event-source.mjs'
import { DSH_MARK, FIXTURE, LABEL, PAGE_MARK, ROUTE, SHELL, SLOT, STATE_DOT } from './constants.mjs'

const h = (React) => React.createElement

/** A snapshot store as DSH's `sessions.list` is: `{getSnapshot, subscribe}`. */
export function snapshotStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() },
  }
}

/**
 * DSH's FishLogo as both SDKs draw it (dsh-web-frontend bundle, the function behind the primitives'
 * `FishLogo` export): `{size = 24, className}` → `<svg width={size} height={size·17.04/23.16}
 * viewBox="0 0 23.16 17.04" fill="none" aria-hidden><path fill="currentColor"/></svg>`. The settings
 * page's stand-in draws a bare `<svg data-primitive="FishLogo">` and drops `size`, so a case could not
 * tell the mark's size; this keeps that stand-in (and its marker), draws DSH's geometry over it, and
 * records the `size` the caller passed (`DSH_MARK.sizeHandle`). It wraps the page's `createElement`
 * before the page loads, because the primitives module binds it then (as model-dialog's Modal does).
 */
function withFishLogo(React) {
  const create = React.createElement
  const drawn = new WeakMap()
  const { width, height } = DSH_MARK.viewBox
  const sized = (Icon) => function SizedIcon(props) {
    const out = Icon(props)
    if (out?.props?.['data-primitive'] !== DSH_MARK.primitive) return out
    const size = props?.size ?? DSH_MARK.defaultSize
    return create('svg', { ...out.props, width: size, height: (size * height) / width, viewBox: `0 0 ${width} ${height}`, fill: 'none', className: props?.className, [DSH_MARK.sizeHandle]: props?.size },
      create('path', { d: DSH_MARK.path, fill: 'currentColor' }))
  }
  React.createElement = function createElement(type, props, ...children) {
    if (typeof type !== 'function' || type.name !== DSH_MARK.standIn) return create(type, props, ...children)
    if (!drawn.has(type)) drawn.set(type, sized(type))
    return create(drawn.get(type), props, ...children)
  }
}

/** True when a prop is set (not undefined/false), as the sibling suites read markers. */
const has = (node, name) => node.props[name] !== undefined && node.props[name] !== false
const byHook = (nodes, name, value) => nodes.filter((n) => has(n, name) && (value === undefined || String(n.props[name]) === String(value)))

/** One fake DOM element: attributes, the parent chain, listeners and observed mutations. */
class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.attributes = new Map()
    this.listeners = new Map()
    this.parent = null
    this.children = []
    this.observers = new Set()
    this.style = {}
    this.dataset = {}
    this.removed = false
    this.textContent = ''
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  hasAttribute(name) { return this.attributes.has(name) }
  setAttribute(name, value) {
    const oldValue = this.getAttribute(name)
    this.attributes.set(name, String(value))
    notifyAttribute(this, name, oldValue)
  }
  removeAttribute(name) {
    if (!this.attributes.has(name)) return
    const oldValue = this.attributes.get(name)
    this.attributes.delete(name)
    notifyAttribute(this, name, oldValue)
  }
  addEventListener(type, fn, options) {
    const list = this.listeners.get(type) ?? []
    list.push({ fn, capture: options === true || options?.capture === true })
    this.listeners.set(type, list)
  }
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) ?? []
    const at = list.findIndex((l) => l.fn === fn)
    if (at >= 0) list.splice(at, 1)
  }
  focus() { this.focused = true }
  blur() { this.focused = false }
  remove() {
    this.removed = true
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this)
  }
  closest(selector) {
    for (let at = this; at; at = at.parent) if (matches(at, selector)) return at
    return null
  }
  matches(selector) { return matches(this, selector) }
  querySelectorAll(selector) { return findAllDom(this, (e) => matches(e, selector)) }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  dispatchEvent(event) {
    event.target ??= this
    const path = []
    for (let at = this; at; at = at.parent) path.unshift(at)
    let immediate = false
    const run = (element, listener) => {
      if (immediate) return
      event.currentTarget = element
      listener.fn.call(element, event)
      if (event.__immediate) immediate = true
    }
    for (const element of path) for (const listener of (element.listeners.get(event.type) ?? []).filter((l) => l.capture)) run(element, listener)
    for (const listener of (this.listeners.get(event.type) ?? []).filter((l) => !l.capture)) run(this, listener)
    if (!immediate && !event.__stop) for (const element of path.slice(0, -1).reverse()) for (const listener of (element.listeners.get(event.type) ?? []).filter((l) => !l.capture)) run(element, listener)
    return !event.defaultPrevented
  }
}
const findAllDom = (root, predicate) => [root, ...root.children.flatMap((c) => findAllDom(c, predicate))].filter(predicate)
/** Attribute selectors the page uses (`button`, `[name]`, `[name="value"]`). */
function matches(element, selector) {
  return String(selector).split(',').some((part) => {
    const one = part.trim()
    if (one === element.tagName.toLowerCase()) return true
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one)
    return Boolean(m) && element.attributes.has(m[1]) && (m[2] === undefined || element.attributes.get(m[1]) === m[2])
  })
}

/** Every fake element, so an attribute change can reach observers up the tree. */
const elementObservers = new Set()
function notifyAttribute(target, name, oldValue) {
  for (const observer of [...elementObservers]) {
    if (!observer.live) continue
    for (const observed of observer.observed) {
      if (observed !== target && !isAncestor(observed, target)) continue
      const options = observer.options.get(observed) ?? {}
      const filter = options.attributeFilter
      if (!options.attributes && !filter) continue
      if (filter && !filter.includes(name)) continue
      observer.pending.push({ type: 'attributes', attributeName: name, target, oldValue })
      if (!observer.queued) {
        observer.queued = true
        queueMicrotask(() => { observer.queued = false; const records = observer.pending.splice(0); if (observer.live) observer.callback(records, observer) })
      }
      break
    }
  }
}
const isAncestor = (ancestor, node) => { for (let at = node; at; at = at.parent) if (at === ancestor) return true; return false }

/** The page's MutationObserver: the brand scopes it to the shell button; `<html>` marks use it too. */
export function mutationObserverClass() {
  return class PageMutationObserver {
    constructor(callback) { this.callback = callback; this.observed = new Set(); this.options = new Map(); this.pending = []; this.live = true; this.queued = false }
    observe(target, options = {}) { this.observed.add(target); this.options.set(target, options); elementObservers.add(this) }
    disconnect() { this.live = false; for (const target of this.observed) if (![...elementObservers].some((o) => o !== this && o.live && o.observed.has(target))) this.options.delete(target); this.observed.clear(); elementObservers.delete(this) }
    takeRecords() { return this.pending.splice(0) }
  }
}

/**
 * The scripted shell page.
 * @param options.lang - DSH UI language.
 * @param options.mark - set `<html data-fishball-page>` before any script (default true).
 * @param options.reducedMotion - start with `(prefers-reduced-motion: reduce)` matching.
 */
export async function brandPage(t, sdk, { lang = 'en', mark = true, reducedMotion = false, openFails = 0, prepareWorld } = {}) {
  const sources = eventSourceClass()
  const shimOptions = {}
  const elementsByPath = new Map()
  const elements = []
  let shellContainer = null
  let shellButton = null
  let toggleButton = null
  const hostRef = (path, tag, props) => {
    const el = elementFor(path, tag)
    // React's commit sets the element's attributes from the host props (only what changed), as a
    // browser's DOM would receive them; the brand then finds this element from its slot root.
    for (const [name, value] of Object.entries(props)) {
      if (name === 'ref' || name === 'children' || name === 'key' || typeof value === 'function') continue
      if (name === 'style' && value && typeof value === 'object') { Object.assign(el.style, value); continue }
      const attr = name === 'className' ? 'class' : name
      if (value === undefined || value === null || value === false) { if (el.hasAttribute(attr)) el.removeAttribute(attr); continue }
      if (typeof value === 'object') continue
      const text = value === true ? '' : String(value)
      if (el.getAttribute(attr) !== text) el.setAttribute(attr, text)
    }
    if (typeof props.ref === 'function') props.ref(el)
    else if (props.ref && typeof props.ref === 'object') props.ref.current = el
  }
  shimOptions.hostRef = hostRef
  function elementFor(path, tag) {
    if (elementsByPath.has(path)) return elementsByPath.get(path)
    const el = new FakeElement(tag)
    el.path = path
    elements.push(el)
    elementsByPath.set(path, el)
    const segments = path.split('/')
    for (let at = segments.length - 1; at > 0; at--) {
      const parent = elementsByPath.get(segments.slice(0, at).join('/'))
      if (parent) { el.parent = parent; parent.children.push(el); break }
    }
    return el
  }

  const w = createWorld({ sdk, lang, shimOptions, clients: CLIENTS.uiOnly })
  const sessions = snapshotStore({ byId: {} })
  const current = snapshotStore({ key: null })
  const opens = []
  /** Each `openSession` attempt: the id it was called with and whether the fake accepted it. */
  const attempts = []
  let failures = openFails
  w.services.sessions = { list: sessions }
  w.services.uiSession = { adapter: { current } }
  w.services.uiWorkspace = {
    async openSession(id) {
      opens.push(id)
      if (failures > 0) { failures -= 1; attempts.push({ id, ok: false, error: 'unknown session' }); throw new Error('unknown session') }
      attempts.push({ id, ok: true })
      current.set({ key: id })
    },
    async archiveSession() {}, async startSession() {}, async forkSession() {},
  }
  w.provided.push('sessions', 'uiSession', 'uiWorkspace')
  w.EventSource = sources.EventSource

  // The reduced-motion preference the page's matchMedia answers; a case may flip it live. Each query
  // gets its own media object, as a browser answers `(prefers-reduced-motion: reduce)` and
  // `(prefers-reduced-motion: no-preference)` in opposite directions.
  const mediaOf = new Map()
  let reduced = reducedMotion
  const matchesQuery = (query) => {
    const text = String(query).replace(/\s+/g, '')
    if (/prefers-reduced-motion:reduce/.test(text)) return reduced
    if (/prefers-reduced-motion:no-preference/.test(text)) return !reduced
    return false
  }
  const mediaFor = (query) => {
    const text = String(query)
    if (mediaOf.has(text)) return mediaOf.get(text)
    const listeners = new Set()
    const media = {
      media: text,
      get matches() { return matchesQuery(text) },
      onchange: null,
      addEventListener(_type, fn) { listeners.add(fn) },
      removeEventListener(_type, fn) { listeners.delete(fn) },
      addListener(fn) { listeners.add(fn) },
      removeListener(fn) { listeners.delete(fn) },
      dispatchEvent() { return true },
      notify() { for (const fn of [...listeners]) fn({ matches: media.matches, media: text }) },
    }
    mediaOf.set(text, media)
    return media
  }
  const media = mediaFor(FIXTURE.reducedMotion)
  const matchMedia = (query) => mediaFor(query)
  w.onSandbox = (sandbox) => {
    sandbox.matchMedia = matchMedia
    sandbox.window.matchMedia = matchMedia
  }

  // Styles the page mounts: `<style>` elements (head/body) and constructed sheets.
  const styles = []
  w.onDocument = (document) => {
    document.adoptedStyleSheets ??= []
    const create = document.createElement
    document.createElement = (tag) => {
      const el = create(tag)
      el.tagName = String(tag).toLowerCase()
      el.attributes ??= new Map()
      el.setAttribute = (name, value) => el.attributes.set(name, String(value))
      el.removed = false
      el.style ??= {}
      el.remove = () => { el.removed = true; const at = styles.indexOf(el); if (at >= 0) styles.splice(at, 1) }
      return el
    }
    const addStyle = (el) => { if (el?.tagName === 'style' && !styles.includes(el)) styles.push(el); return el }
    document.head.appendChild = addStyle
    document.head.append = (...els) => { for (const el of els) addStyle(el) }
    document.body.appendChild = addStyle
    document.body.append = (...els) => { for (const el of els) addStyle(el) }
  }
  w.html.MutationObserver = mutationObserverClass()
  if (mark) w.html.element.setAttribute(PAGE_MARK, '')
  // Our observer also sees `<html>` attribute writes (the page root mark going away).
  const htmlSet = w.html.element.setAttribute.bind(w.html.element)
  const htmlRemove = w.html.element.removeAttribute.bind(w.html.element)
  w.html.element.setAttribute = (name, value) => { const old = w.html.element.getAttribute(name); htmlSet(name, value); notifyAttribute(w.html.element, name, old) }
  w.html.element.removeAttribute = (name) => { const old = w.html.element.getAttribute(name); if (old !== null) { htmlRemove(name); notifyAttribute(w.html.element, name, old) } }
  // A browser `<html>` answers attribute selectors (fishball-page's own fake does too).
  w.html.element.matches = (selector) => String(selector).split(',').some((part) => {
    const one = part.trim().replace(/^html/, '')
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one)
    return Boolean(m) && w.html.element.hasAttribute(m[1]) && (m[2] === undefined || w.html.element.getAttribute(m[1]) === m[2])
  })

  withFishLogo(w.React)
  prepareWorld?.(w)
  const page = await loadPage(t, w)

  let collapsed = false
  let shellVersion = 0
  const shell = { newSession: 0, toggle: 0, overwrites: 0 }
  const brandEntries = () => w.entries(SLOT.mark)
  const nameEntries = () => w.entries(SLOT.name)
  const elect = (entries) => [...entries].sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]
  const slot = (React, name, props, fallback) => {
    const entry = elect(name === SLOT.mark ? brandEntries() : nameEntries())
    return React.createElement('span', { 'data-slot': name, 'data-fbtest-slot': name },
      entry ? w.renderEntry(entry, props) : fallback)
  }
  function Shell() {
    const React = w.React
    const el = h(React)
    const mark = () => slot(React, SLOT.mark, { size: FIXTURE.ownerSize }, el('svg', { width: 24, height: 24, 'aria-hidden': 'true' }))
    const name = () => slot(React, SLOT.name, {}, el('span', null, 'DSH'))
    const onContainer = (container) => {
      if (!container || container.__shellBound) return
      container.__shellBound = true
      shellContainer = container
      // React's delegated handlers live at the shell root: a click that reaches here runs the shell
      // control it hit (the brand row's New Session or the rail's own toggle).
      container.addEventListener('click', (event) => {
        const target = event.target
        if (target?.hasAttribute?.('data-sidebar-toggle')) shell.toggle += 1
        else shell.newSession += 1
      })
      container.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') shell.newSession += 1
      })
    }
    const brandButton = () => el('button', {
      type: 'button', 'data-shell-brand': '', 'data-shell-wide': '', 'aria-label': LABEL.newSession[lang],
      'aria-keyshortcuts': SHELL.shortcut,
      ref: (node) => { if (node && node !== shellButton) shellButton = node },
      onClick: () => { shell.newSession += 1 },
    }, el('span', { 'data-brand-identity': '' }, mark(), name()))
    const toggle = () => el('button', {
      type: 'button', 'data-sidebar-toggle': '', 'aria-label': LABEL.toggle[lang],
      ref: (node) => { if (node && node !== toggleButton) toggleButton = node },
      onClick: () => { shell.toggle += 1 },
    }, el('span', { 'data-rail-mark': '', 'aria-hidden': 'true' }, mark()), el('svg', { width: 18, height: 18, 'aria-hidden': 'true' }))
    const newSession = () => el('button', {
      type: 'button', 'data-fishball-new-session': '', 'aria-label': LABEL.newSession[lang],
      onClick: () => { shell.newSession += 1 },
    }, el('span', null, LABEL.newSession[lang]))
    return el('div', { 'data-shell-sidebar': '', 'data-shell-version': String(shellVersion), ref: onContainer },
      el('div', { 'data-shell-logo-row': '' }, [
        collapsed
          ? el('div', { key: 'rail', 'data-shell-logo-rail': '' }, toggle())
          : el('div', { key: 'wide', 'data-shell-logo-wide': '' }, brandButton()),
      ]),
      newSession())
  }
  const mountShell = () => w.shim.mount(FIXTURE.mountKey, () => h(w.React)(Shell))
  mountShell()
  await settle()

  const tree = () => w.shim.treeOf(FIXTURE.mountKey)
  const nodes = () => findAll(tree(), () => true)
  const byHookIn = (name, value, among = nodes()) => byHook(among, name, value)
  const root = (name, value) => byHookIn(name, value)[0]
  const markRoot = () => root('data-fishball-logo-mark')
  const nameRoot = () => root('data-fishball-logo-name')
  const parents = () => { const map = new Map(); for (const { node, parent } of walk(tree())) map.set(node, parent); return map }
  const ancestorButton = (node) => { const map = parents(); for (let at = map.get(node); at; at = map.get(at)) if (at.tag === 'button') return at; return null }
  const descendants = (node) => (node ? findAll([node], () => true) : [])

  const handle = {
    world: w, page, sources, shim: w.shim, sessions, opens, attempts, shell, styles, media,
    nodes, tree, root, markRoot, nameRoot, byHook: byHookIn, descendants, ancestorButton,
    button: () => shellButton,
    toggle: () => toggleButton,
    container: () => shellContainer,
    brandButton: () => ancestorButton(markRoot()),
    newSessionButton: () => root('data-fishball-new-session') ?? nodes().find((n) => n.props['data-fishball-new-session'] !== undefined),
    text: (node) => textOf(node),
    /** One view (strip / asks) of every live page connection: its frames go under the view's topic; failing it fails the connection. */
    live: (kind) => handle.all(kind).filter((v) => !v.closed),
    all: (kind) => sources.opened.filter((s) => isPageStream(s, w.base)).map((s) => topicView(s, ROUTE[kind])),
    async deliver(kind, frame) { for (const s of handle.live(kind)) s.deliver(frame); await settle() },
    /** Raw JSON text as one view's frame (a frame that is not the view's shape), on every live page connection. */
    async deliverRaw(kind, text) { for (const s of handle.live(kind)) s.deliverRaw(text); await settle() },
    /** The one page connection errors (CLOSED when `closed`, else CONNECTING): every view's health. */
    async failConnection(closed) { for (const s of sources.opened.filter((x) => !x.closed && isPageStream(x, w.base))) s.fail({ closed }); await settle() },
    async fail(kind, closed) { for (const s of handle.live(kind)) s.fail({ closed }); await settle() },
    /** Manager id in the sessions list, as a fresh snapshot store value (running or not). */
    async setRunning(running) { sessions.set({ byId: { [FIXTURE.manager]: { id: FIXTURE.manager, running, blank: false } } }); await settle() },
    async setSessions(snapshot) { sessions.set(snapshot); await settle() },
    /** The manager is already shown (the current uiSession key). */
    async setCurrent(key) { current.set({ key }); await settle() },
    /** A main panel is open (the layout's active panel). */
    async setPanel(id) { w.setActivePanel(id); w.shim.rerender(); await settle() },
    clearPanels() { w.selectPanel.length = 0 },
    panels: () => [...w.selectPanel],
    async setCollapsed(value) { collapsed = value; w.shim.rerender(); await settle() },
    /** DSH's shell re-render writes its own New Session label over the brand button. */
    async overwriteLabel(label = LABEL.newSession[lang]) { shell.overwrites += 1; if (shellButton) shellButton.setAttribute('aria-label', label); await settle() },
    async setReducedMotion(value) { reduced = value; for (const media of mediaOf.values()) media.notify(); await settle() },
    async setPageMark(value) {
      if (value) w.html.element.setAttribute(PAGE_MARK, '')
      else w.html.element.removeAttribute(PAGE_MARK)
      await settle()
    },
    async unmountBrand() {
      const ui = w.plugins.find((p) => p.id === 'fishball-ui')
      if (ui) await Promise.resolve(ui.fiber.dispose?.()).catch(() => {})
      w.shim.rerender()
      await settle()
    },
    async unmountPage() { w.shim.unmountRoot(FIXTURE.mountKey); await settle() },
    /** The shell mounted again after unmountPage (fishball-ui.connections mounts and unmounts its readers). */
    async remountShell() { mountShell(); await settle() },
    /** A browser event: capture listeners see it first; stopImmediatePropagation ends the path. */
    event(type, props = {}) {
      const event = {
        type, ...props, defaultPrevented: false, __stop: false, __immediate: false,
        preventDefault() { event.defaultPrevented = true },
        stopPropagation() { event.__stop = true },
        stopImmediatePropagation() { event.__immediate = true; event.__stop = true },
      }
      return event
    },
    /** Activate an element as a mouse does: one native click event on it. */
    async click(element) {
      const event = handle.event('click', { button: 0 })
      element?.dispatchEvent(event)
      await settle()
      return event
    },
    /** Activate an element by a key press: one native keydown on it. */
    async pressKey(element, key, props = {}) {
      const event = handle.event('keydown', { key, code: key === ' ' ? 'Space' : key, ...props })
      element?.dispatchEvent(event)
      await settle()
      return event
    },
    /** The page's style text, from style elements and constructed sheets still mounted. */
    styleText: () => [...styles.filter((s) => !s.removed).map((s) => s.textContent), ...(w.page?.document?.adoptedStyleSheets ?? []).map((s) => s.text ?? (s.cssRules ?? []).map((r) => r.cssText).join('\n'))].filter(Boolean).join('\n'),
    settle,
    LABEL, STATE_DOT,
    /** Whether a DSH StateDot stand-in is drawn inside `node`. */
    stateDot: (node) => descendants(node).find((n) => n.props['data-primitive'] === STATE_DOT),
    /** A stable serialization of the drawing (paths/shapes and their geometry and paint). */
    art(node) {
      const paint = (n) => Object.fromEntries(Object.entries(n.props).filter(([k]) => ['d', 'fill', 'stroke', 'strokeWidth', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'viewBox', 'transform', 'opacity'].includes(k)).map(([k, v]) => [k, String(v)]))
      return descendants(node).filter((n) => ['path', 'svg', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'g'].includes(n.tag)).map((n) => ({ tag: n.tag, ...paint(n) }))
    },
  }
  return handle
}
