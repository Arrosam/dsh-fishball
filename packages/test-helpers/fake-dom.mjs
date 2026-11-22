/**
 * A small DOM for pages run in node:vm (./browser-sandbox, ./scripted-page): elements with real
 * attribute storage, a parent/children tree, capture and bubble listeners, the simple selectors
 * client scripts use, and MutationObservers that see attribute changes as a browser reports them.
 *
 * What is modelled, and what is not (so a case knows what it may rely on):
 * - attributes (get/set/has/remove/toggle), `id`, `className`, `classList`, `lang`, and a
 *   `dataset` that reads and writes the `data-*` attributes, as a browser's does;
 * - the tree: append, appendChild, prepend, insertBefore, removeChild, replaceChildren, remove,
 *   contains, parentElement; `textContent` is a plain property (it does not replace children);
 * - selectors: one compound simple selector per comma part — an optional tag, `#id`, `.class`es and
 *   `[name]` / `[name="value"]` parts (`button`, `.launcher`, `button[aria-label="New"]`).
 *   Combinators (descendant, child, sibling) and pseudo-classes match nothing;
 * - events: `dispatchEvent` runs capture listeners from the root down, then the target's, then bubble
 *   listeners up (`stopPropagation`, `stopImmediatePropagation`, `preventDefault` honoured);
 *   `click()` dispatches one bubbling `click`;
 * - MutationObserver: attribute records only (no childList, no characterData), batched per observer
 *   in one microtask; `attributeFilter` implies `attributes`; `subtree` extends to descendants;
 *   `oldValue` only with `attributeOldValue`, as in a browser.
 *
 * `hostRef` connects ./react-shim's rendered host elements to this DOM: pass it as the shim's
 * `observe.hostRef` and every host element rendered with a `ref` gets one element here (kept per
 * render path), its attributes set from the host props as React's commit would set them, and its
 * parent the nearest such element above it on the render path. A component that climbs from its
 * slot root to a shell element (`closest('button')`) and observes it then sees what it would in a
 * browser.
 */

const DOM = Object.freeze({
  dataPrefix: 'data-',
  classAttr: 'class',
  idAttr: 'id',
  langAttr: 'lang',
  events: Object.freeze({ click: 'click' }),
  /** Host props React never writes as attributes. */
  skippedProps: Object.freeze(['ref', 'children', 'key']),
  /** React prop names whose attribute name differs. */
  attrOf: Object.freeze({ className: 'class', htmlFor: 'for' }),
  record: 'attributes',
  pathSeparator: '/',
})

const kebab = (name) => name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
const camel = (name) => name.replace(/-(\w)/g, (_m, c) => c.toUpperCase())

/** One compound simple selector: `tag#id.class[name="value"]` (all parts optional). */
const SIMPLE = /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/
const PART = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g

function matchesOne(element, selector) {
  const m = SIMPLE.exec(selector)
  if (!m || selector === '') return false
  if (m[1] && m[1] !== '*' && m[1].toLowerCase() !== element.localName) return false
  for (const p of m[2].matchAll(PART)) {
    if (p[1] !== undefined && element.getAttribute(DOM.idAttr) !== p[1]) return false
    if (p[2] !== undefined && !element.classList.contains(p[2])) return false
    if (p[3] !== undefined && (!element.hasAttribute(p[3]) || (p[4] !== undefined && element.getAttribute(p[3]) !== p[4]))) return false
  }
  return true
}
/** Whether `element` matches any comma part of `selector`. */
export const matchesSelector = (element, selector) => String(selector).split(',').some((part) => matchesOne(element, part.trim()))

/** A browser-like event object for `dispatchEvent`. */
export function createEvent(type, props = {}) {
  const event = {
    type, bubbles: true, cancelable: true, ...props, defaultPrevented: false, target: null, currentTarget: null,
    stopped: false, immediateStopped: false,
    preventDefault() { event.defaultPrevented = true },
    stopPropagation() { event.stopped = true },
    stopImmediatePropagation() { event.immediateStopped = true; event.stopped = true },
  }
  return event
}

/** A fresh DOM: `{html, head, body, createElement, MutationObserver, hostRef, elementAt, hosted}`. */
export function createDom() {
  const observers = new Set()

  function notifyAttribute(target, name, oldValue) {
    for (const observer of [...observers]) {
      for (const [observed, options] of observer.targets) {
        if (observed !== target && !(options.subtree && observed.contains(target))) continue
        const filter = options.attributeFilter
        if (!options.attributes && !filter) continue
        if (filter && !filter.includes(name)) continue
        observer.pending.push({ type: DOM.record, attributeName: name, target, oldValue: options.attributeOldValue ? oldValue : null })
        if (!observer.queued) {
          observer.queued = true
          queueMicrotask(() => {
            observer.queued = false
            const records = observer.pending.splice(0)
            if (records.length > 0 && observers.has(observer)) observer.callback(records, observer)
          })
        }
        break
      }
    }
  }

  class FakeElement {
    constructor(tag) {
      this.localName = String(tag).toLowerCase()
      this.tagName = this.localName.toUpperCase()
      this.attributes = new Map()
      this.listeners = new Map()
      this.parentElement = null
      this.children = []
      this.style = {}
      this.textContent = ''
      this.removed = false
      this.focused = false
      const element = this
      this.dataset = new Proxy({}, {
        get: (_t, key) => (typeof key === 'string' ? element.getAttribute(DOM.dataPrefix + kebab(key)) ?? undefined : undefined),
        set: (_t, key, value) => { element.setAttribute(DOM.dataPrefix + kebab(String(key)), value); return true },
        has: (_t, key) => typeof key === 'string' && element.hasAttribute(DOM.dataPrefix + kebab(key)),
        deleteProperty: (_t, key) => { element.removeAttribute(DOM.dataPrefix + kebab(String(key))); return true },
        ownKeys: () => [...element.attributes.keys()].filter((k) => k.startsWith(DOM.dataPrefix)).map((k) => camel(k.slice(DOM.dataPrefix.length))),
        getOwnPropertyDescriptor: (_t, key) => (typeof key === 'string' && element.hasAttribute(DOM.dataPrefix + kebab(key)) ? { enumerable: true, configurable: true, value: element.getAttribute(DOM.dataPrefix + kebab(key)) } : undefined),
      })
      this.classList = {
        contains: (name) => element.classes().includes(name),
        add: (...names) => element.setClasses([...new Set([...element.classes(), ...names])]),
        remove: (...names) => element.setClasses(element.classes().filter((c) => !names.includes(c))),
        toggle: (name, force) => { const on = force ?? !element.classList.contains(name); if (on) element.classList.add(name); else element.classList.remove(name); return on },
      }
    }
    classes() { return (this.getAttribute(DOM.classAttr) ?? '').split(/\s+/).filter(Boolean) }
    setClasses(list) { this.setAttribute(DOM.classAttr, list.join(' ')) }
    get parentNode() { return this.parentElement }
    get id() { return this.getAttribute(DOM.idAttr) ?? '' }
    set id(value) { this.setAttribute(DOM.idAttr, value) }
    get className() { return this.getAttribute(DOM.classAttr) ?? '' }
    set className(value) { this.setAttribute(DOM.classAttr, value) }
    get lang() { return this.getAttribute(DOM.langAttr) ?? '' }
    set lang(value) { this.setAttribute(DOM.langAttr, value) }
    get firstElementChild() { return this.children[0] ?? null }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
    getAttributeNames() { return [...this.attributes.keys()] }
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
    toggleAttribute(name, force) {
      const on = force ?? !this.hasAttribute(name)
      if (on && !this.hasAttribute(name)) this.setAttribute(name, '')
      if (!on) this.removeAttribute(name)
      return on
    }
    adopt(node) {
      if (!(node instanceof FakeElement)) return false
      node.detach()
      node.parentElement = this
      node.removed = false
      return true
    }
    detach() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this)
      this.parentElement = null
    }
    append(...nodes) { for (const node of nodes) if (this.adopt(node)) this.children.push(node) }
    appendChild(node) { this.append(node); return node }
    prepend(...nodes) { for (const node of [...nodes].reverse()) if (this.adopt(node)) this.children.unshift(node) }
    insertBefore(node, reference) {
      if (!this.adopt(node)) return node
      const at = this.children.indexOf(reference)
      if (at < 0) this.children.push(node)
      else this.children.splice(at, 0, node)
      return node
    }
    removeChild(node) { if (node?.parentElement === this) node.remove(); return node }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes) }
    remove() { this.detach(); this.removed = true }
    contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false }
    closest(selector) { for (let at = this; at; at = at.parentElement) if (matchesSelector(at, selector)) return at; return null }
    matches(selector) { return matchesSelector(this, selector) }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]) }
    querySelectorAll(selector) { return this.descendants().filter((e) => matchesSelector(e, selector)) }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
    getElementsByClassName(name) { return this.descendants().filter((e) => e.classList.contains(name)) }
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
    dispatchEvent(event) {
      event.target ??= this
      const path = []
      for (let at = this; at; at = at.parentElement) path.unshift(at)
      const run = (element, capture) => {
        for (const listener of [...(element.listeners.get(event.type) ?? [])].filter((l) => l.capture === capture)) {
          if (event.immediateStopped) return
          event.currentTarget = element
          listener.fn.call(element, event)
        }
      }
      for (const element of path.slice(0, -1)) { if (event.stopped) break; run(element, true) }
      // At the target, capture listeners run before the others (the order browsers settled on).
      if (!event.stopped) { run(this, true); run(this, false) }
      if (event.bubbles !== false) for (const element of path.slice(0, -1).reverse()) { if (event.stopped) break; run(element, false) }
      return !event.defaultPrevented
    }
    click() { this.dispatchEvent(createEvent(DOM.events.click, { button: 0 })) }
    focus() { this.focused = true }
    blur() { this.focused = false }
  }

  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.targets = new Map(); this.pending = []; this.queued = false }
    observe(target, options = {}) { this.targets.set(target, options); observers.add(this) }
    disconnect() { this.targets.clear(); this.pending.length = 0; observers.delete(this) }
    takeRecords() { return this.pending.splice(0) }
  }

  const createElement = (tag) => new FakeElement(tag)
  const html = createElement('html')
  const head = createElement('head')
  const body = createElement('body')
  html.append(head, body)

  // ---- hostRef: the React shim's host elements with a ref, by render path ----------------------
  const byPath = new Map()
  function elementAt(path, tag) {
    if (byPath.has(path)) return byPath.get(path)
    const element = createElement(tag)
    element.path = path
    byPath.set(path, element)
    const segments = path.split(DOM.pathSeparator)
    for (let at = segments.length - 1; at > 0; at--) {
      const parent = byPath.get(segments.slice(0, at).join(DOM.pathSeparator))
      if (parent) { parent.append(element); break }
    }
    return element
  }
  function hostRef(path, tag, props) {
    const element = elementAt(path, tag)
    // React's commit writes only what changed; an attribute write the page did not cause would
    // reach the page's observers as a mutation, so unchanged values are left alone. An attribute
    // React wrote before whose prop is now gone (or falsy) is removed, as React removes it; one the
    // page itself set is not React's and stays.
    const written = new Set()
    for (const [name, value] of Object.entries(props)) {
      if (DOM.skippedProps.includes(name) || typeof value === 'function') continue
      if (name === 'style' && value && typeof value === 'object') { Object.assign(element.style, value); continue }
      if (value === undefined || value === null || value === false || typeof value === 'object') continue
      const attr = DOM.attrOf[name] ?? name
      const text = value === true ? '' : String(value)
      written.add(attr)
      if (element.getAttribute(attr) !== text) element.setAttribute(attr, text)
    }
    for (const attr of element.hostAttributes ?? []) if (!written.has(attr)) element.removeAttribute(attr)
    element.hostAttributes = written
    if (typeof props.ref === 'function') props.ref(element)
    else if (props.ref && typeof props.ref === 'object') props.ref.current = element
  }

  return {
    html, head, body, createElement, Element: FakeElement, MutationObserver: FakeMutationObserver,
    hostRef, elementAt, hosted: () => [...byPath.values()], createEvent,
    /** Live observers (a case may check that a page disconnected its own). */
    observerCount: () => observers.size,
  }
}
