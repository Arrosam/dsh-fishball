/**
 * Runs packages/messenger/client.js against a stub host and reports what it mounts. The file is executed, never read:
 * the tests look only at the stylesheet it puts into document.head (node has no layout engine, so a stylesheet's text
 * is the observable). Stubs follow the browser module contract: window.__ModuleLoader__.load({ id, factory(require) })
 * where the factory returns { inject, apply(ctx, { useAssistantSessionId, mark }) } and `ctx.effect(fn)` runs `fn` and
 * keeps the disposer it returns.
 */
import fs from 'node:fs'
import vm from 'node:vm'
import { MESSENGER, MESSENGER_TABLE } from './constants.mjs'

/** A value that answers every property read and call with another such value (the host services the tests do not drive). */
const inertHost = () => new Proxy(function () {}, { get: (_t, key) => (key === Symbol.toPrimitive ? () => '' : inertHost()), apply: () => inertHost() })

/** The part of `document` the module touches: createElement, head.appendChild, element.remove, getElementById. */
function makeDocument() {
  const head = {
    children: [],
    appendChild(el) { el.parentNode = head; head.children.push(el); return el },
  }
  return {
    head,
    createElement: (tag) => ({ tag, parentNode: null, remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null } } }),
    getElementById: (id) => head.children.find((el) => el.id === id) ?? null,
  }
}

/**
 * Load the module once; `apply()` turns the look on (as DSH does when the plugin is enabled) and returns a handle whose
 * `dispose()` turns it off. Several `apply()` calls on one load model off -> on.
 */
export function loadMessenger(file = process.env[MESSENGER_TABLE.fileEnv] ?? MESSENGER.clientFile) {
  const document = makeDocument()
  let definition
  const window = { __ModuleLoader__: { load: (def) => { definition = def } } }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document, console })
  const mod = definition.factory(() => inertHost())
  return {
    document,
    moduleId: definition.id,
    /** The mounted stylesheets: the `<style>` elements in document.head with the module's style id. */
    styles: () => document.head.children.filter((el) => el.id === MESSENGER_TABLE.styleId),
    apply() {
      const disposers = []
      const ctx = { slots: inertHost(), locale: inertHost(), effect: (fn) => { const d = fn(); disposers.push(d); return d } }
      mod.apply(ctx, { useAssistantSessionId: () => 'session', mark: MESSENGER_TABLE.mark })
      return { dispose: () => { while (disposers.length) { const d = disposers.pop(); if (typeof d === 'function') d() } } }
    },
  }
}

/** Scan `text` for top-level `chars`, skipping quoted strings and (...) / [...] groups (data: URLs hold `;` and `,`). */
function* topLevel(text, chars) {
  let quote = null; let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(' || c === '[') { depth++; continue }
    if (c === ')' || c === ']') { depth--; continue }
    if (depth === 0 && chars.includes(c)) yield i
  }
}
const splitTop = (text, sep) => { const parts = []; let from = 0; for (const i of topLevel(text, sep)) { parts.push(text.slice(from, i)); from = i + 1 } parts.push(text.slice(from)); return parts }

/** Index of the `}` that closes the `{` at `open`, skipping braces inside quoted strings; -1 when unbalanced. */
function matchingBrace(text, open) {
  let quote = null; let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

/** Declarations "a:b;c:d !important" -> { prop: { value, important } } (properties lower-cased). */
function parseDeclarations(body) {
  const out = {}
  for (const piece of splitTop(body, ';')) {
    const at = piece.indexOf(':')
    if (at < 0 || !piece.trim()) continue
    const important = /!\s*important\s*$/i.test(piece)
    out[piece.slice(0, at).trim().toLowerCase()] = { value: piece.slice(at + 1).replace(/!\s*important\s*$/i, '').trim(), important }
  }
  return out
}

/** Style text -> [{ selectors: [string], decls, at: string|null }]; at-rules are flattened with their prelude in `at`. */
export function parseCss(css, at = null) {
  const rules = []
  let rest = css.replace(/\/\*[\s\S]*?\*\//g, '')
  while (rest.trim()) {
    const open = [...topLevel(rest, '{')][0]
    if (open === undefined) break
    const close = matchingBrace(rest, open)
    if (close < 0) break
    const prelude = rest.slice(0, open).trim(); const body = rest.slice(open + 1, close)
    if (prelude.startsWith('@')) rules.push(...parseCss(body, prelude))
    else rules.push({ selectors: splitTop(prelude, ',').map((s) => s.trim()).filter(Boolean), decls: parseDeclarations(body), at })
    rest = rest.slice(close + 1)
  }
  return rules
}

/** `selector` without its `:where( ... )` groups (parentheses may nest, as in `:where(a:has(b) c)`). */
function withoutWhere(selector) {
  let out = ''
  for (let i = 0; i < selector.length; i++) {
    if (!selector.startsWith(':where(', i)) { out += selector[i]; continue }
    let depth = 0
    for (i += ':where'.length; i < selector.length; i++) { if (selector[i] === '(') depth++; else if (selector[i] === ')' && --depth === 0) break }
  }
  return out
}

/**
 * Specificity [ids, classes+attributes+pseudo-classes, elements] of a selector. `:has()` and `:not()` count their
 * argument (the argument's own atoms are counted where they stand) and not themselves; `:where()` counts nothing.
 */
export function specificity(selector) {
  const plain = withoutWhere(selector).replace(/"[^"]*"|'[^']*'/g, '""').replace(/::[\w-]+/g, ' ')
  const ids = (plain.match(/#[\w-]+/g) ?? []).length
  const attrs = (plain.match(/\[[^\]]*\]/g) ?? []).length
  const classes = (plain.replace(/\[[^\]]*\]/g, '').match(/\.[\w-]+/g) ?? []).length
  const pseudos = (plain.replace(/\[[^\]]*\]/g, '').match(/:(?!(?:has|is|not)\()[\w-]+/g) ?? []).length
  const pseudoElements = (selector.match(/::[\w-]+/g) ?? []).length
  const elements = (plain.replace(/\[[^\]]*\]/g, '').replace(/[.#:][\w-]+(\([^)]*\))?/g, ' ').match(/(?:^|[\s>+~(,])[a-zA-Z][\w-]*/g) ?? []).length
  return [ids, attrs + classes + pseudos, elements + pseudoElements]
}
/** -1, 0 or 1 comparing two specificity triples. */
export const compareSpecificity = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0 }

/** The simple selectors (attribute selectors and classes, also inside :has()) a selector requires. */
export const selectorAtoms = (selector) => selector.match(/\[[^\]]*\]|\.[\w-]+/g) ?? []
