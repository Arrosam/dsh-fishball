/**
 * The UI-FIX-F contrast page: the drawn cards, with every style sheet a real DSH page holds, laid
 * out and styled by a real headless Chromium, whose computed colours the rows measure.
 *
 * Approach (live browser, not a static CSS resolver): Chromium resolves `var(--dsw-…)`,
 * `color-mix(in srgb, …)`, the cascade and `::placeholder` exactly as DSH's page does, so the rows
 * measure the colours a user sees and need no CSS evaluator of their own. Where each part comes from:
 * - the cards' DOM and the sheets they mount: fishball-ui's real `client.js` with its parts
 *   (`client.asks.js`, `client.strip.js`), run unread in the F-SETTINGS scripted page through the
 *   existing card harnesses (fishball-core/asks/render.mjs `cardPage`, fishball-ui/model-dialog/
 *   strip.mjs `stripPage`); the rendered tree is written out as HTML. The style sheets are the
 *   `<style>` elements the page appended to `<head>` and did not remove;
 * - DSH's theme tokens: the installed dsh-client-ui-theme's own sheets, collected by running its
 *   plugin's `apply` (the sheet effects, labelled `ui-theme: <name> stylesheet`) up to the first
 *   service it reads beyond them; light is `body`, dark is `body[data-ds-dark-theme]`;
 * - DSH's page styles: the stylesheets dsh-web-frontend's `index.html` links, in its order (they
 *   hold the real Tag rules and DSH's default `::placeholder`). The scripted page's Tag stand-in
 *   renders `<span data-tone class=…>`; the real Tag adds its module class first (`clsx(tag,
 *   className)`, both SDKs), so the written HTML adds that class, read from the shipped Tag rule.
 * Chromium is the LITE rows' (test/v2-page-cases/lite-browser.mjs `launchChromium`): headless, a
 * temp profile, the mock keychain and the basic password store, loopback DevTools only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, walk } from '../../../support/rp-recommend.mjs'
import { launchChromium } from '../../../v2-page-cases/lite-browser.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { DSH_FILES, HOOK, THEME } from './constants.mjs'

const UTF8 = 'utf8'
const PAGE = Object.freeze({ blank: 'about:blank', base: 'http://127.0.0.1/', lang: 'en' })

// ------------------------------------------------------------------------- the page's sheets

/** A `document` observer for the card harnesses: every element appended to <head>, with `removed`. */
export function sheetCollector() {
  const sheets = []
  const onDocument = (document) => {
    document.createElement = (tagName) => {
      const element = { tagName: String(tagName).toLowerCase(), id: '', textContent: '', removed: false, dataset: {}, style: {}, setAttribute() {}, append() {}, appendChild() {} }
      element.remove = () => { element.removed = true }
      return element
    }
    document.head.appendChild = (element) => { sheets.push(element); return element }
    document.head.append = (...elements) => { sheets.push(...elements) }
  }
  return { onDocument, live: () => sheets.filter((s) => !s.removed && s.tagName === 'style').map((s) => s.textContent) }
}

const themeCache = new Map()
/**
 * DSH's theme sheets of one SDK, in mount order: its plugin's `apply` runs in a browser sandbox
 * with a context whose `effect` runs only the sheet effects; the first other member it reads ends
 * the run (everything after it is settings rows and services, not styles).
 */
export function themeSheets(sdk) {
  if (themeCache.has(sdk)) return themeCache.get(sdk)
  const file = DSH_FILES.theme(sdk)
  const page = createBrowserSandbox({ lang: PAGE.lang, baseURI: PAGE.base, fetch: async () => new Response('') })
  const sheets = []
  page.document.createElement = () => ({ dataset: {}, textContent: '', remove() {} })
  page.document.head.appendChild = (element) => { sheets.push(element.textContent); return element }
  page.run(fs.readFileSync(file, UTF8), file)
  const { React } = createReactShim({ stale() {} })
  // The theme's other imports (primitives, the client store) are not used by its sheets.
  const inert = new Proxy(function inert() {}, { get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : inert), apply: () => inert, construct: () => inert })
  const jsx = (type, props, key) => React.createElement(type, key === undefined ? props : { ...props, key })
  const modules = { react: React, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: React.Fragment } }
  const [registration] = page.registrations
  const plugin = registration.factory((name) => modules[name] ?? inert)
  const done = Symbol('the theme read a service: its sheets are mounted')
  const effects = { effect(fn, label) { if (DSH_FILES.themeSheetLabel.test(String(label))) fn() } }
  const ctx = new Proxy(effects, { get(target, key) { if (key in target) return target[key]; throw done } })
  try { plugin.apply(ctx) } catch (error) { if (error !== done) throw error }
  if (sheets.length === 0) throw new Error('dsh-client-ui-theme mounted no sheet on SDK ' + sdk)
  themeCache.set(sdk, sheets)
  return sheets
}

const frontendCache = new Map()
/** DSH's page stylesheets (dsh-web-frontend index.html's links, in order) and the real Tag's module class. */
export function frontendStyles(sdk) {
  if (frontendCache.has(sdk)) return frontendCache.get(sdk)
  const dist = DSH_FILES.frontendDist(sdk)
  const html = fs.readFileSync(path.join(dist, DSH_FILES.indexHtml), UTF8)
  const sheets = [...html.matchAll(DSH_FILES.stylesheetLink)].map((m) => fs.readFileSync(path.join(dist, m[1]), UTF8))
  const tagClass = sheets.map((css) => DSH_FILES.tagClass.exec(css)?.[1]).find(Boolean)
  if (!tagClass) throw new Error('no DSH Tag rule in the SDK ' + sdk + ' page styles')
  const styles = Object.freeze({ sheets, tagClass })
  frontendCache.set(sdk, styles)
  return styles
}

// ------------------------------------------------------------------------- the drawn DOM as HTML

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link'])
const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (text) => escapeText(text).replace(/"/g, '&quot;')
const ATTR_NAME = Object.freeze({ className: 'class', htmlFor: 'for', tabIndex: 'tabindex' })
const kebab = (name) => name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/** One rendered host node as HTML; a Tag stand-in gets the real Tag's module class first. */
function htmlOf(node, tagClass) {
  if (typeof node === 'string') return escapeText(node)
  const props = { ...node.props }
  if (props[STAND_IN.primitive] === HOOK.tagPrimitive) props.className = [tagClass, props.className].filter(Boolean).join(' ')
  let inner = (node.children ?? []).map((c) => htmlOf(c, tagClass)).join('')
  if (node.tag === 'textarea' && props.value !== undefined) { inner = escapeText(props.value); delete props.value }
  const attrs = Object.entries(props).flatMap(([name, value]) => {
    if (value === undefined || value === null || value === false || typeof value === 'function' || name === 'key' || name === 'ref') return []
    if (name === 'style' && typeof value === 'object') return [`style="${escapeAttr(Object.entries(value).map(([k, v]) => `${kebab(k)}:${v}`).join(';'))}"`]
    if (typeof value === 'object') return []
    const attr = ATTR_NAME[name] ?? name
    return [value === true ? attr : `${attr}="${escapeAttr(value)}"`]
  })
  const open = `<${node.tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
  return VOID.has(node.tag) ? open : `${open}${inner}</${node.tag}>`
}

/** Whether the tree holds an element `predicate` accepts (a precondition the rows check before measuring). */
export const holds = (tree, predicate) => [...walk(tree)].some(({ node }) => predicate(node))

/**
 * The full document: DSH's page styles, DSH's theme sheets, then the sheets the Fishball page
 * mounted (a real DSH page links its styles in <head>, its theme plugin appends its sheets, and
 * Fishball's chunks append theirs after), and the drawn tree in `body`, dark when `theme` says so.
 */
export function documentOf(sdk, { tree, sheets, theme }) {
  const { sheets: page, tagClass } = frontendStyles(sdk)
  const styles = [...page, ...themeSheets(sdk), ...sheets].map((css) => `<style>${css}</style>`).join('')
  const body = tree.map((n) => htmlOf(n, tagClass)).join('')
  return `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body${theme.darkAttribute ? ' ' + THEME.attribute : ''}>${body}</body></html>`
}

// ------------------------------------------------------------------------- the browser

let browser = null
/** One headless Chromium for the file's rows, started on first use; `stopBrowser` ends it. */
async function chromium() {
  browser ??= launchChromium().then((started) => {
    if (!started) throw new Error('no Chromium binary')
    return started
  })
  return browser
}
/** Stop the browser if a row started it (the cases register this as the file's `after` hook). */
export async function stopBrowser() {
  const started = await browser?.catch(() => null)
  browser = null
  await started?.stop()
}

/**
 * Load `html` in a fresh tab and evaluate `expression` (a function's source applied to `arg`) in
 * it; the tab closes afterwards. Returns the JSON value it returns.
 */
export async function measure(html, expression, arg) {
  const { devtools } = await chromium()
  const { targetId } = await devtools.send('Target.createTarget', { url: PAGE.blank })
  try {
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
    await devtools.send('Page.enable', {}, sessionId)
    const { frameTree } = await devtools.send('Page.getFrameTree', {}, sessionId)
    await devtools.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId)
    const result = await devtools.send('Runtime.evaluate', { expression: `(${expression})(${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true }, sessionId)
    if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
    return result.result.value
  } finally {
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

/**
 * The page-side probe (runs in Chromium; plain source, no imports). `arg`:
 * - `target`: the measured element's selector; `tone` (optional): the closest ancestor-or-self of it
 *   that carries the colours (the DSH Tag holding the badge); `behind`: 'parent' to read the
 *   element the tone sits on;
 * - `root`: the card's selector; every element from the target up to it is "measured";
 * - `ownSheetsFrom`: the index of the first Fishball sheet (DSH's sheets come first);
 * - `notLiteral`: colour words that are not a hard-coded colour (transparent, currentcolor, …);
 * - `colours`: CSS colour expressions to resolve in the target's parent (the oracle's controls).
 * Returns the computed text and ::placeholder colours, the background colours from the target, the
 * tone and the behind element outwards, the tone's outline colours (inset box-shadows with a
 * spread, borders with a width), every declaration of the Fishball sheets' rules that select a
 * measured element (pseudo-elements stripped) with the hard-coded colours in its value (hex,
 * colour functions, named colours, outside custom-property names), and the resolved expressions.
 */
export const PROBE = String(function probe(arg) {
  const css = (el, pseudo) => getComputedStyle(el, pseudo ?? null)
  const layers = (el) => { const out = []; for (let at = el; at; at = at.parentElement) out.push(css(at).backgroundColor); return out }
  const target = document.querySelector(arg.target)
  if (!target) return { missing: arg.target }
  const tone = arg.tone ? target.closest(arg.tone) : target
  if (!tone) return { missing: arg.tone }
  const behind = arg.behind === 'parent' ? tone.parentElement : null
  // Chromium serialises each box-shadow as "<colour> <x> <y> <blur> <spread> [inset]", comma separated at the top level.
  const shadows = (text) => {
    if (!text || text === 'none') return []
    const parts = []; let depth = 0; let part = ''
    for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(part.trim()); part = '' } else part += ch }
    parts.push(part.trim())
    return parts.map((p) => { const close = p.indexOf(')'); return { colour: p.slice(0, close + 1), lengths: p.slice(close + 1).trim().split(/\s+/) } })
  }
  const outlines = shadows(css(tone).boxShadow).filter((s) => s.lengths.includes('inset') && parseFloat(s.lengths[3] ?? '0') > 0).map((s) => ({ kind: 'inset box-shadow', colour: s.colour }))
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const s = css(tone)
    if (parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none') outlines.push({ kind: 'border-' + side.toLowerCase(), colour: s['border' + side + 'Color'] })
  }
  const measured = []
  for (let at = target; at; at = at.parentElement) { measured.push(at); if (at.matches(arg.root)) break }
  const literalsOf = (value) => {
    const bare = value.replace(/--[\w-]+/g, ' ')
    const found = [...bare.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)].map((m) => m[0])
    for (const word of bare.split(/[^\w-]+/)) if (word && !/^-?\d/.test(word) && !arg.notLiteral.includes(word.toLowerCase()) && CSS.supports('color', word)) found.push(word)
    return found
  }
  const declarations = []
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { visit(rule.cssRules); continue }
      if (!rule.selectorText) continue
      const plain = rule.selectorText.replace(/::?(placeholder|before|after|marker|selection)/g, '')
      let hit = false
      try { hit = measured.some((el) => el.matches(plain)) } catch { hit = false }
      if (!hit) continue
      // cssText keeps a shorthand whose value holds var() as written (its longhands read empty).
      for (const decl of rule.style.cssText.split(';').map((d) => d.trim()).filter(Boolean)) {
        const at = decl.indexOf(':')
        const value = decl.slice(at + 1).trim()
        declarations.push({ selector: rule.selectorText, property: decl.slice(0, at).trim(), value, literals: literalsOf(value) })
      }
    }
  }
  for (const sheet of [...document.styleSheets].slice(arg.ownSheetsFrom)) visit(sheet.cssRules)
  const colours = {}
  for (const expression of arg.colours ?? []) {
    const el = document.createElement('span')
    el.style.color = expression
    target.parentElement.appendChild(el)
    colours[expression] = css(el).color
    el.remove()
  }
  const placeholder = css(target, '::placeholder')
  return {
    text: css(target).color,
    toneText: css(tone).color,
    placeholderAttr: target.getAttribute('placeholder'),
    shownText: target.textContent.trim(),
    placeholder: { colour: placeholder.color, opacity: Number(placeholder.opacity) },
    layers: layers(target),
    toneLayers: layers(tone),
    behindLayers: behind ? layers(behind) : null,
    outlines,
    declarations,
    colours,
  }
})

/** How many of the document's sheets are DSH's (the page styles and the theme): the Fishball sheets follow them. */
export const dshSheetCount = (sdk) => frontendStyles(sdk).sheets.length + themeSheets(sdk).length
