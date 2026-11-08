/**
 * A tiny DOM stand-in for the pure UI builders (ui/records.js, ui/settings.js).
 *
 * The real page runs in a browser; these tests exercise the builders' own logic in Node, so the
 * fake only implements what the builders read or call: element creation, text, classes, dataset,
 * attributes, listeners, form-control values and a tag-name query. It is deliberately not a DOM
 * implementation: no layout, no HTML parsing, no selectors beyond simple tag lists.
 */

/** One element. `childNodes` holds elements and strings, as DOM nodes do. */
export class FakeElement {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase()
    this.ownerDocument = document
    this.className = ''
    this.childNodes = []
    this.attributes = {}
    this.dataset = {}
    this.listeners = new Map()
    this.value = ''
    this.checked = false
    this.disabled = false
    this.hidden = false
    this.type = ''
  }

  append(...nodes) { for (const node of nodes) this.childNodes.push(node) }
  appendChild(node) { this.childNodes.push(node); return node }
  replaceChildren(...nodes) { this.childNodes = nodes }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name).push(fn)
  }

  /** Fire a listener the way the page would; the builders ignore the event object. */
  dispatch(name) { for (const fn of this.listeners.get(name) ?? []) fn({ target: this, currentTarget: this }) }

  set textContent(value) { this.childNodes = value === '' ? [] : [String(value)] }
  get textContent() { return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('') }

  /** Descendants whose tag name is in a comma-separated selector list (`button, input`). */
  querySelectorAll(selector) {
    const tags = new Set(selector.split(',').map((tag) => tag.trim().toUpperCase()).filter(Boolean))
    const found = []
    for (const node of this.walk()) if (tags.has(node.tagName)) found.push(node)
    return found
  }

  /** Every element below this one, depth first. */
  *walk() { for (const node of this.childNodes) if (typeof node !== 'string') { yield node; yield* node.walk() } }
}

/** One document whose elements point back at it, as `container.ownerDocument` expects. */
export function createFakeDocument() {
  const document = {
    createElement: (tag) => new FakeElement(tag, document),
    createTextNode: (text) => String(text),
  }
  return Object.freeze(document)
}

export const fakeDocument = createFakeDocument()
