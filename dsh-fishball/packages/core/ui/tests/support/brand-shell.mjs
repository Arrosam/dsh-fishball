/**
 * LOGO-BUTTON component page: fishball-ui's real `client.js` and its chunks in the scripted DSH page
 * (./ui-page.mjs), with `<html data-fishball-page>` set as fishball-page sets it, over a scripted
 * shell that renders the two brand slots the way DSH's own sidebar does (dsh-client-ui-sidebar):
 * - the expanded brand row is the shell's own `button[aria-label="<New session>"]` holding
 *   `sidebar.brand.mark` (owner `{size: 24}`) and `sidebar.brand.name` (no owner props);
 * - the collapsed rail renders the mark slot inside the shell's toggle button
 *   (`aria-label="<Collapse sidebar>"`), beside DSH's own panel glyph;
 * - the shell also renders the real New Session button, sharing the initial label.
 *
 * Every host element rendered with a ref is an element of the page's DOM (fishball-test-helpers
 * fake-dom `hostRef`): attribute storage, the parent chain (`closest('button')`), capture and bubble
 * listeners and attribute MutationObservers, so a brand occupant that climbs from its slot root to
 * the shell button and observes its `aria-label` sees what it would in a browser. The shell's New
 * Session handler sits on the sidebar container (as React's delegated handler does): a click reaches
 * it only if the brand's own handler does not stop it.
 *
 * Streams are the page's one connection (./page-stream.mjs), whose health is both views'; the
 * sessions list is the public `{byId}` snapshot store; `uiWorkspace.openSession` records calls.
 */
import { createEvent } from 'fishball-test-helpers/fake-dom'
import { findAll, textOf, walk } from 'fishball-test-helpers/react-shim'
import { BRAND_FIXTURE, DSH_MARK, LABEL, PAGE_MARK, ROUTE, SHELL, SLOT, STATE_DOT } from './brand.mjs'
import { isPageStream, topicView } from './page-stream.mjs'
import { shellServices, uiPage, winnerOf } from './ui-page.mjs'

const h = (React) => React.createElement
/** The shell's own markup words (test-owned handles on the scripted shell, never product hooks). */
const SHELL_DOM = Object.freeze({
  sidebar: 'data-shell-sidebar', version: 'data-shell-version', logoRow: 'data-shell-logo-row', rail: 'data-shell-logo-rail', wide: 'data-shell-logo-wide',
  brand: 'data-shell-brand', wideButton: 'data-shell-wide', identity: 'data-brand-identity', toggle: 'data-sidebar-toggle', railMark: 'data-rail-mark',
  newSession: 'data-fishball-new-session', slot: 'data-slot', ownSlot: 'data-fbtest-slot', fallback: 'DSH', glyph: 18,
  keys: Object.freeze({ enter: 'Enter', space: ' ', spaceCode: 'Space' }), click: 'click', keydown: 'keydown', type: 'button',
  /** Props of a rendered drawing (`art`), compared as its geometry and paint. */
  paint: Object.freeze(['d', 'fill', 'stroke', 'strokeWidth', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'viewBox', 'transform', 'opacity']),
  shapes: Object.freeze(['path', 'svg', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'g']),
  /** The reduced-motion queries a browser answers in opposite directions. */
  reduce: /prefers-reduced-motion:reduce/, noPreference: /prefers-reduced-motion:no-preference/,
})

/**
 * DSH's FishLogo as the current DSH draws it (dsh-web-frontend, the function behind the primitives'
 * `FishLogo` export): `{size = 24, className}` → `<svg width={size} height={size·17.04/23.16}
 * viewBox="0 0 23.16 17.04" fill="none" aria-hidden><path fill="currentColor"/></svg>`. The helpers'
 * stand-in draws a bare `<svg data-primitive="FishLogo">` and drops `size`; this keeps that stand-in
 * (and its marker), draws DSH's geometry over it and records the `size` the caller passed
 * (DSH_MARK.sizeHandle). It wraps the page's createElement before the page loads, because the
 * primitives module binds it then.
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

const has = (node, name) => node.props[name] !== undefined && node.props[name] !== false
const byHook = (nodes, name, value) => nodes.filter((n) => has(n, name) && (value === undefined || String(n.props[name]) === String(value)))

/**
 * The scripted shell page.
 * @param options.lang - DSH UI language.
 * @param options.mark - set `<html data-fishball-page>` before any script (default true).
 * @param options.reducedMotion - start with `(prefers-reduced-motion: reduce)` matching.
 * @param options.openFails - how many `openSession` calls reject "unknown session" first.
 * @param options.prepareWorld - `(world)` before any script runs (a case's own services or wrappers).
 */
export async function brandPage(t, { lang = 'en', mark = true, reducedMotion = false, openFails = 0, prepareWorld } = {}) {
  const shell = shellServices({ openFails })
  let shellButton = null
  let toggleButton = null
  let reduced = reducedMotion
  const answer = (query) => {
    const text = String(query).replace(/\s+/g, '')
    if (SHELL_DOM.reduce.test(text)) return reduced
    if (SHELL_DOM.noPreference.test(text)) return !reduced
    return false
  }
  const p = await uiPage(t, {
    lang, hostRefs: true, services: shell.services,
    prepareWorld(w) {
      // What the page's matchMedia answers (the browser's reduced-motion preference), set before load.
      w.media = answer
      if (mark) w.html.setAttribute(PAGE_MARK, '')
      withFishLogo(w.React)
      prepareWorld?.(w)
    },
  })
  const w = p.world
  const counts = { newSession: 0, toggle: 0, overwrites: 0 }
  let collapsed = false
  const slot = (React, name, props, fallback) => {
    const entry = winnerOf(w.entries(name))
    return React.createElement('span', { [SHELL_DOM.slot]: name, [SHELL_DOM.ownSlot]: name }, entry ? w.renderEntry(entry, props) : fallback)
  }
  function Shell() {
    const React = w.React
    const el = h(React)
    const markSlot = () => slot(React, SLOT.mark, { size: BRAND_FIXTURE.ownerSize }, el('svg', { width: BRAND_FIXTURE.ownerSize, height: BRAND_FIXTURE.ownerSize, 'aria-hidden': 'true' }))
    const nameSlot = () => slot(React, SLOT.name, {}, el('span', null, SHELL_DOM.fallback))
    const onContainer = (container) => {
      if (!container || container.__shellBound) return
      container.__shellBound = true
      // React's delegated handlers live at the shell root: a click that reaches here runs the shell
      // control it hit (the brand row's New Session or the rail's own toggle).
      container.addEventListener(SHELL_DOM.click, (event) => { if (event.target?.hasAttribute?.(SHELL_DOM.toggle)) counts.toggle += 1; else counts.newSession += 1 })
      container.addEventListener(SHELL_DOM.keydown, (event) => { if (event.key === SHELL_DOM.keys.enter || event.key === SHELL_DOM.keys.space) counts.newSession += 1 })
    }
    const brandButton = () => el('button', {
      type: SHELL_DOM.type, [SHELL_DOM.brand]: '', [SHELL_DOM.wideButton]: '', 'aria-label': LABEL.newSession[lang], 'aria-keyshortcuts': SHELL.shortcut,
      ref: (node) => { if (node) shellButton = node },
    }, el('span', { [SHELL_DOM.identity]: '' }, markSlot(), nameSlot()))
    const toggle = () => el('button', {
      type: SHELL_DOM.type, [SHELL_DOM.toggle]: '', 'aria-label': LABEL.toggle[lang],
      ref: (node) => { if (node) toggleButton = node },
    }, el('span', { [SHELL_DOM.railMark]: '', 'aria-hidden': 'true' }, markSlot()), el('svg', { width: SHELL_DOM.glyph, height: SHELL_DOM.glyph, 'aria-hidden': 'true' }))
    const newSession = () => el('button', { type: SHELL_DOM.type, [SHELL_DOM.newSession]: '', 'aria-label': LABEL.newSession[lang] }, el('span', null, LABEL.newSession[lang]))
    return el('div', { [SHELL_DOM.sidebar]: '', ref: onContainer },
      el('div', { [SHELL_DOM.logoRow]: '' }, [
        collapsed ? el('div', { key: 'rail', [SHELL_DOM.rail]: '' }, toggle()) : el('div', { key: 'wide', [SHELL_DOM.wide]: '' }, brandButton()),
      ]),
      newSession())
  }
  const mountShell = () => w.shim.mount(BRAND_FIXTURE.mountKey, () => h(w.React)(Shell))
  mountShell()
  await p.settle()

  const tree = () => w.shim.treeOf(BRAND_FIXTURE.mountKey)
  const nodes = () => findAll(tree(), () => true)
  const byHookIn = (name, value, among = nodes()) => byHook(among, name, value)
  const root = (name, value) => byHookIn(name, value)[0]
  const markRoot = () => root('data-fishball-logo-mark')
  const nameRoot = () => root('data-fishball-logo-name')
  const parents = () => { const map = new Map(); for (const { node, parent } of walk(tree())) map.set(node, parent); return map }
  const ancestorButton = (node) => { const map = parents(); for (let at = map.get(node); at; at = map.get(at)) if (at.tag === 'button') return at; return null }
  const descendants = (node) => (node ? findAll([node], () => true) : [])
  const pageViews = (kind) => w.page ? p.sources.opened.filter((s) => isPageStream(s, w.base)).map((s) => topicView(s, ROUTE[kind])) : []

  const handle = {
    world: w, page: p.page, ui: p, sources: p.sources, shim: w.shim, sessions: shell.sessions, opens: shell.opens, attempts: shell.attempts, shell: counts,
    nodes, tree, root, markRoot, nameRoot, byHook: byHookIn, descendants, ancestorButton,
    /** The shell's own wide brand button (a DOM element) and its rail toggle. */
    button: () => shellButton,
    toggle: () => toggleButton,
    brandButton: () => ancestorButton(markRoot()),
    text: (node) => textOf(node),
    /** One view (strip / asks) of every page connection made, and of the open ones. */
    all: pageViews,
    live: (kind) => pageViews(kind).filter((v) => !v.closed),
    async deliver(kind, frame) { for (const v of handle.live(kind)) v.deliver(frame); await p.settle() },
    /** Raw JSON text as one view's frame (a frame that is not the view's shape). */
    async deliverRaw(kind, text) { for (const v of handle.live(kind)) v.deliverRaw(text); await p.settle() },
    /** The one page connection errors (CLOSED when `closed`, else CONNECTING): every view's health. */
    failConnection: (closed) => p.fail(closed),
    fail: (_kind, closed) => p.fail(closed),
    /** The manager in the sessions list (running or not). */
    async setRunning(running) { shell.sessions.set({ byId: { [BRAND_FIXTURE.manager]: { id: BRAND_FIXTURE.manager, running, blank: false } } }); await p.settle() },
    async setSessions(snapshot) { shell.sessions.set(snapshot); await p.settle() },
    /** The manager is already shown (the current uiSession key). */
    async setCurrent(key) { shell.current.set({ key }); await p.settle() },
    /** A main panel is open (the layout's active panel). */
    async setPanel(id) { w.setActivePanel(id); w.shim.rerender(); await p.settle() },
    clearPanels() { w.selectPanel.length = 0 },
    panels: () => [...w.selectPanel],
    async setCollapsed(value) { collapsed = value; w.shim.rerender(); await p.settle() },
    /** DSH's shell re-render writes its own New Session label over the brand button. */
    async overwriteLabel(label = LABEL.newSession[lang]) { counts.overwrites += 1; shellButton?.setAttribute('aria-label', label); await p.settle() },
    async setReducedMotion(value) { reduced = value; w.setMedia(answer); await p.settle() },
    async setPageMark(value) { if (value) w.html.setAttribute(PAGE_MARK, ''); else w.html.removeAttribute(PAGE_MARK); await p.settle() },
    /** The brand part goes as the shell would unload fishball-ui's bundle: its plugin fiber is disposed. */
    async unmountBrand() {
      const ui = w.plugins.find((plugin) => plugin.id === 'fishball-ui')
      if (ui) await Promise.resolve(ui.fiber.dispose?.()).catch(() => {})
      w.shim.rerender()
      await p.settle()
    },
    async unmountPage() { w.shim.unmountRoot(BRAND_FIXTURE.mountKey); await p.settle() },
    async remountShell() { mountShell(); await p.settle() },
    /** Activate an element as a mouse does: one native click event on it. */
    async click(element) {
      const event = createEvent(SHELL_DOM.click, { button: 0 })
      element?.dispatchEvent(event)
      await p.settle()
      return event
    },
    /** Activate an element by a key press: one native keydown on it. */
    async pressKey(element, key, props = {}) {
      const event = createEvent(SHELL_DOM.keydown, { key, code: key === SHELL_DOM.keys.space ? SHELL_DOM.keys.spaceCode : key, ...props })
      element?.dispatchEvent(event)
      await p.settle()
      return event
    },
    /** The page's mounted style text (style elements still in the document and constructed sheets). */
    styleText: () => w.page.styleTexts().join('\n'),
    styles: () => w.page.styleTexts(),
    settle: () => p.settle(),
    /** Whether a DSH StateDot stand-in is drawn inside `node`. */
    stateDot: (node) => descendants(node).find((n) => n.props['data-primitive'] === STATE_DOT),
    /** A stable serialization of the drawing (shapes and their geometry and paint). */
    art(node) {
      const paint = (n) => Object.fromEntries(Object.entries(n.props).filter(([k]) => SHELL_DOM.paint.includes(k)).map(([k, v]) => [k, String(v)]))
      return descendants(node).filter((n) => SHELL_DOM.shapes.includes(n.tag)).map((n) => ({ tag: n.tag, ...paint(n) }))
    },
  }
  return handle
}
