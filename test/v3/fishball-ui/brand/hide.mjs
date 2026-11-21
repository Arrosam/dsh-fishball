/**
 * LOGO-BUTTON's New Session rows: fishball-page's real native-control hiding (`mountRemovals`) over
 * a scripted shell document (modified `navPage`, whose `shell` option supplies the document queries).
 * The shell holds the two controls the requirement names:
 * - the brand row's own button, whose subtree carries DSH's `[data-slot="sidebar.brand.mark"]`
 *   outlet (empty before the logo mounts, holding `[data-fishball-logo-mark]` after);
 * - the actual New Session button.
 * Both start hidden with the localized `session.new.label`. The captured wide button stays visible
 * even if DSH restores that label on the same node. A replacement has no capture and must stay
 * hidden until owned; the separate New Session launcher stays hidden throughout.
 */
import { LABEL, PAGE_MARK } from './constants.mjs'
import { navPage } from '../package/nav-page.mjs'

/**
 * One fake shell element with attributes, children and body-observer notifications. It is also the
 * page's global `Node` (navPage's `shell.Node`): as in a browser, `node instanceof Node` holds for every
 * shell element and `nodeType` is `Node.ELEMENT_NODE`.
 */
export class Node {
  static ELEMENT_NODE = 1
  static TEXT_NODE = 3
  static DOCUMENT_NODE = 9
  constructor(tag, props = {}) {
    this.nodeType = Node.ELEMENT_NODE
    this.tagName = String(tag).toUpperCase()
    this.attributes = new Map()
    this.children = []
    this.parent = null
    this.listeners = new Map()
    this.style = {}
    this.dataset = {}
    this.removed = false
    for (const [name, value] of Object.entries(props)) this.attributes.set(name, String(value))
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  hasAttribute(name) { return this.attributes.has(name) }
  setAttribute(name, value) { this.attributes.set(name, String(value)); notify(this, { type: 'attributes', target: this, attributeName: name }) }
  removeAttribute(name) { this.attributes.delete(name); notify(this, { type: 'attributes', target: this, attributeName: name }) }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
  appendChild(node) { node.parent = this; node.removed = false; this.children.push(node); notify(node, { type: 'childList', target: this, addedNodes: [node] }); return node }
  append(...nodes) { for (const node of nodes) this.appendChild(node) }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); node.removed = true; notify(this, { type: 'childList', target: this, removedNodes: [node] }); return node }
  remove() { this.parent?.removeChild(this) }
  contains(node) { for (let at = node; at; at = at.parent) if (at === this) return true; return false }
  getBoundingClientRect() { return { x: 0, y: 0, width: 0, height: 0 } }
  closest(selector) { for (let at = this; at; at = at.parent) if (matches(at, selector)) return at; return null }
  matches(selector) { return matches(this, selector) }
  querySelectorAll(selector) { return descendants(this).filter((n) => matches(n, selector)) }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
}
const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)])
/** Simple selectors the page uses: a tag, `[name]`, `[name="value"]`, and their comma lists. */
function matches(node, selector) {
  return String(selector).split(',').some((part) => {
    const one = part.trim()
    if (!one) return false
    if (/^[a-z]+$/i.test(one)) return node.tagName.toLowerCase() === one.toLowerCase()
    const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one)
    return Boolean(m) && node.attributes.has(m[1]) && (m[2] === undefined || node.attributes.get(m[1]) === m[2])
  })
}

const observerState = new WeakMap()
/**
 * Notify a body observer for a change anywhere below it (microtask, as the browser reports it). A
 * browser's childList record always carries both node lists (possibly empty), so they are filled in.
 */
function notify(node, given) {
  const record = given.type === 'childList' ? { addedNodes: [], removedNodes: [], ...given } : given
  for (let at = node; at; at = at.parent) {
    const observers = observerState.get(at)
    if (!observers) continue
    for (const observer of observers) {
      observer.pending.push(record)
      observer.schedule()
    }
  }
}
/** A body observer as fishball-page uses: one callback after a burst of changes. */
export function bodyObserverClass() {
  return class BodyMutationObserver {
    constructor(callback) { this.callback = callback; this.pending = []; this.observed = new Set() }
    observe(target) { const list = observerState.get(target) ?? new Set(); list.add(this); observerState.set(target, list); this.observed.add(target) }
    disconnect() { for (const target of this.observed) observerState.get(target)?.delete(this); this.observed.clear() }
    takeRecords() { return this.pending.splice(0) }
    schedule() {
      if (this.queued) return
      this.queued = true
      queueMicrotask(() => { this.queued = false; const records = this.pending.splice(0); this.callback(records, this) })
    }
  }
}

/** Build the scripted shell document. */
export function shellDocument(lang) {
  const body = new Node('div')
  const brandRow = new Node('div', { 'data-shell-logo-row': '' })
  const brand = new Node('button', { type: 'button', 'aria-label': LABEL.newSession[lang] })
  const markSlot = new Node('span', { 'data-slot': 'sidebar.brand.mark' })
  const nameSlot = new Node('span', { 'data-slot': 'sidebar.brand.name' })
  brand.appendChild(markSlot)
  brand.appendChild(nameSlot)
  brandRow.appendChild(brand)
  const newSession = new Node('button', { type: 'button', 'aria-label': LABEL.newSession[lang] })
  const other = new Node('button', { type: 'button', 'aria-label': 'Settings' })
  // In both SDKs the collapsed rail's mark belongs to its Open sidebar toggle, not New session.
  // Keep the synthetic partial name outlet too: an outlet alone does not prove click capture.
  const markOnly = new Node('button', { type: 'button', 'aria-label': LABEL.railOpen[lang] })
  markOnly.appendChild(new Node('span', { 'data-slot': 'sidebar.brand.mark' }))
  const nameOnly = new Node('button', { type: 'button', 'aria-label': LABEL.newSession[lang] })
  nameOnly.appendChild(new Node('span', { 'data-slot': 'sidebar.brand.name' }))
  body.appendChild(brandRow)
  body.appendChild(newSession)
  body.appendChild(other)
  body.appendChild(markOnly)
  body.appendChild(nameOnly)
  return {
    body, brand, brandRow, markSlot, nameSlot, newSession, other, markOnly, nameOnly,
    buttons: () => descendants(body).filter((n) => n.tagName === 'BUTTON'),
    querySelectorAll: (selector) => descendants(body).filter((n) => n.tagName === 'BUTTON' && matches(n, selector)),
    querySelector: (selector) => descendants(body).find((n) => matches(n, selector)) ?? null,
    getElementsByName: () => [],
    MutationObserver: bodyObserverClass(),
    Node,
    /** The logo occupant mounts inside the shell's brand mark slot. */
    mountLogo() { const mark = new Node('span', { 'data-fishball-logo-mark': '' }); markSlot.appendChild(mark); return mark },
    /** The shell re-renders as a browser replaces both controls; both carry the initial label. */
    rerender() {
      const nextBrand = new Node('button', { type: 'button', 'aria-label': LABEL.newSession[lang] })
      const nextMarkSlot = new Node('span', { 'data-slot': 'sidebar.brand.mark' })
      nextMarkSlot.appendChild(new Node('span', { 'data-fishball-logo-mark': '' }))
      nextBrand.appendChild(nextMarkSlot)
      nextBrand.appendChild(new Node('span', { 'data-slot': 'sidebar.brand.name' }))
      const nextNewSession = new Node('button', { type: 'button', 'aria-label': LABEL.newSession[lang] })
      brandRow.removeChild(brand)
      body.removeChild(newSession)
      brandRow.appendChild(nextBrand)
      body.children.splice(1, 0, nextNewSession)
      nextNewSession.parent = body
      notify(body, { type: 'childList', target: body })
      return { brand: nextBrand, newSession: nextNewSession }
    },
  }
}

/**
 * The page with the scripted shell. Returns the shell and a helper that waits for the page's
 * reconcile pass (one microtask + the harness settle rounds).
 */
export async function hidePage(t, sdk, { lang = 'en' } = {}) {
  const shell = shellDocument(lang)
  const page = await navPage(t, sdk, {
    lang,
    shell,
    translate: (namespace, key) => (namespace === 'sidebar' && key === 'session.new.label' ? LABEL.newSession[lang] : key),
  })
  return {
    ...shell,
    page,
    html: page.html,
    hidden: (node) => node.hasAttribute('data-fishball-hidden'),
    async flush() { await page.settle() },
    /** The shell's own page mark is not part of this scripted document. */
    pageMark: PAGE_MARK,
  }
}