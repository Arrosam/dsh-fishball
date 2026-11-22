/**
 * A real headless Chromium for browser rows, driven over the DevTools protocol on loopback only,
 * and the current DSH's page styles to load in it.
 *
 * - The browser: `FBTEST_CHROME`, else the newest local Playwright headless shell. A fresh temp
 *   profile, the mock keychain and the basic password store (never the user's keychain), no network
 *   but loopback. `launchChromium()` answers null when no Chromium is installed, so a case can skip
 *   with BROWSER.skipNoChrome.
 * - Loopback origins: `startEnvironment({origins})` serves each origin's route table on its own port
 *   (distinct ports are distinct browser origins, so storage is really partitioned) and opens tabs.
 * - Measuring: `measure(html, fn, arg)` loads a document in a fresh tab of one shared browser and
 *   evaluates `fn(arg)` in it; `PROBE` is a colour probe for contrast rows (./wcag computes the ratio).
 * - DSH's styles: `frontendStyles()` (the stylesheets dsh-web-frontend's index.html links, in order),
 *   `themeSheets()` (dsh-client-ui-theme's own sheets, collected by running its plugin's sheet
 *   effects), and `documentOf({tree, sheets, dark})`, a document with DSH's styles, its theme, a
 *   page's own sheets and a ./react-shim tree written as HTML. Chromium resolves `var(--dsw-…)`,
 *   `color-mix()`, the cascade and `::placeholder` as DSH's page does, so rows need no CSS evaluator.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createBrowserSandbox } from './browser-sandbox.mjs'
import { DSH_VERSION, dshPackageDir } from './dsh.mjs'
import { STAND_IN } from './dsh-primitives.mjs'
import { createReactShim, jsxRuntime } from './react-shim.mjs'
import { sleep } from './wait.mjs'

export const BROWSER = Object.freeze({
  env: 'FBTEST_CHROME',
  // Isolated runners replace HOME, not the location of the installed test browser.
  cache: path.join(os.userInfo().homedir, 'Library', 'Caches', 'ms-playwright'),
  shellPrefix: 'chromium_headless_shell-',
  shell: Object.freeze(['chrome-headless-shell-mac-arm64', 'chrome-headless-shell']),
  tempPrefix: 'fbtest-chrome-',
  portFile: 'DevToolsActivePort',
  loopback: '127.0.0.1',
  blank: 'about:blank',
  startBudgetMs: 15000,
  stopBudgetMs: 3000,
  loadBudgetMs: 15000,
  pollMs: 20,
  /** Why a browser row is skipped (harness only). */
  skipNoChrome: 'no Chromium on this machine (set FBTEST_CHROME, or install the Playwright headless shell)',
  args: Object.freeze(['--headless', '--use-mock-keychain', '--password-store=basic', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--remote-debugging-port=0']),
  noStore: 'no-store',
  types: Object.freeze({ html: 'text/html', js: 'text/javascript', css: 'text/css', text: 'text/plain' }),
})

/** DevTools key input vocabulary (Input.dispatchKeyEvent modifier bit mask, named keys). */
export const KEYS = Object.freeze({
  modifierBits: Object.freeze({ alt: 1, control: 2, meta: 4, shift: 8 }),
  named: Object.freeze({
    Enter: Object.freeze({ key: 'Enter', keyCode: 13 }),
    Escape: Object.freeze({ key: 'Escape', keyCode: 27 }),
    Tab: Object.freeze({ key: 'Tab', keyCode: 9 }),
    Space: Object.freeze({ key: ' ', keyCode: 32 }),
    Comma: Object.freeze({ key: ',', keyCode: 188 }),
    Slash: Object.freeze({ key: '/', keyCode: 191 }),
    ContextMenu: Object.freeze({ key: 'ContextMenu', keyCode: 93 }),
    F10: Object.freeze({ key: 'F10', keyCode: 121 }),
  }),
})

/** Key description for a physical code (`Key[A-Z]` or a KEYS.named key) plus modifiers. */
export function keyFor(code, modifiers = []) {
  const letter = /^Key([A-Z])$/.exec(code)
  const base = letter ? { key: letter[1].toLowerCase(), keyCode: letter[1].charCodeAt(0) } : KEYS.named[code]
  if (!base) throw new Error('no key description for ' + code)
  return { ...base, code, modifiers }
}

/** The Chromium binary: FBTEST_CHROME (null if it does not exist), else the newest Playwright headless shell, else null. */
export function chromeBinary() {
  if (process.env[BROWSER.env]) return existsSync(process.env[BROWSER.env]) ? process.env[BROWSER.env] : null
  if (!existsSync(BROWSER.cache)) return null
  const shells = readdirSync(BROWSER.cache).filter((name) => name.startsWith(BROWSER.shellPrefix)).sort().reverse()
  for (const dir of shells) {
    const binary = path.join(BROWSER.cache, dir, ...BROWSER.shell)
    if (existsSync(binary)) return binary
  }
  return null
}

async function until(read, budgetMs, what) {
  const start = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - start > budgetMs) throw new Error('timed out waiting for ' + what)
    await sleep(BROWSER.pollMs)
  }
}

/** Minimal flat-session DevTools client over Node's global WebSocket. */
class Devtools {
  constructor(socket) {
    this.socket = socket
    this.next = 0
    this.pending = new Map()
    this.listeners = new Set()
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data))
      // Protocol events (no id) go to onEvent listeners; replies settle their request.
      if (data.id === undefined) { for (const listener of this.listeners) listener(data); return }
      const waiter = this.pending.get(data.id)
      this.pending.delete(data.id)
      if (data.error) waiter?.reject(new Error(data.error.message))
      else waiter?.resolve(data.result)
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }
  /** Subscribe to protocol events (`{method, params, sessionId}`); returns the unsubscribe. */
  onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
}

/** Stop Chromium, the servers and the temp profile; safe when any part never started or already exited. */
async function teardown({ socket, proc, servers, dir, anchor }) {
  try { socket?.close() } catch {}
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise((resolve) => proc.once('exit', resolve))
    proc.kill()
    // Bounded: a Chromium that ignores SIGTERM is killed hard instead of hanging the run.
    const forced = setTimeout(() => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL') }, BROWSER.stopBudgetMs)
    await exited
    clearTimeout(forced)
  }
  await Promise.all(servers.filter(Boolean).map((server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) })))
  // Remove only the profile directory this module created under the OS temp dir.
  if (dir && path.dirname(dir) === anchor && path.basename(dir).startsWith(BROWSER.tempPrefix)) rmSync(dir, { recursive: true, force: true })
}

/** Spawn Chromium on a fresh temp profile and connect DevTools, filling `parts` so teardown(parts) cleans what started. */
async function launchInto(parts, binary) {
  parts.anchor = realpathSync(os.tmpdir())
  parts.dir = mkdtempSync(path.join(parts.anchor, BROWSER.tempPrefix))
  parts.proc = spawn(binary, [...BROWSER.args, '--user-data-dir=' + parts.dir, BROWSER.blank], { stdio: 'ignore' })
  let spawnError = null
  parts.proc.once('error', (error) => { spawnError = error })
  const portFile = path.join(parts.dir, BROWSER.portFile)
  const [port, wsPath] = await until(() => {
    if (spawnError) throw spawnError
    if (parts.proc.exitCode !== null || parts.proc.signalCode !== null) throw new Error('Chromium exited during startup (' + (parts.proc.exitCode ?? parts.proc.signalCode) + ')')
    const lines = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : []
    return lines.length === 2 ? lines : null
  }, BROWSER.startBudgetMs, 'Chromium DevTools port')
  const socket = new WebSocket(`ws://${BROWSER.loopback}:${port}${wsPath}`)
  parts.socket = socket
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), { once: true }) })
  return new Devtools(socket)
}

/**
 * Start a bare headless Chromium: `{devtools, stop}`, or null when no Chromium binary exists. A
 * Chromium that exists but cannot start rejects after cleanup.
 */
export async function launchChromium() {
  const binary = chromeBinary()
  if (!binary) return null
  const parts = { servers: [] }
  try {
    const devtools = await launchInto(parts, binary)
    return { devtools, stop: () => teardown(parts) }
  } catch (error) {
    await teardown(parts)
    throw error
  }
}

/** One tab's face: evaluate, trusted mouse and key input, resize, close. */
function tabFace(devtools, targetId, sessionId) {
  return {
    targetId, sessionId,
    resize: (width, height) => devtools.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId),
    async evaluate(expression) {
      const result = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
      return result.result.value
    },
    /** A real (trusted, user-activating) mouse click at viewport coordinates. */
    async click(x, y, button = 'left') {
      for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 }, sessionId)
    },
    /** A trusted key press (keydown + keyup) through the browser's input pipeline (`keyFor(code)`, `text` for a character). */
    async press({ key, code, keyCode, modifiers = [], text }) {
      const mask = modifiers.reduce((bits, name) => bits | KEYS.modifierBits[name], 0)
      // Native button activation needs the character-producing event, not just a raw key.
      for (const type of [text === undefined ? 'rawKeyDown' : 'keyDown', 'keyUp']) await devtools.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: mask, ...(type === 'keyDown' ? { text } : {}) }, sessionId)
    },
    close: () => devtools.send('Target.closeTarget', { targetId }).catch(() => {}),
  }
}

/** Open a new tab (attached, flat session) at `url`; `platform` overrides navigator.platform. */
export async function openTab(devtools, url, { platform } = {}) {
  const { targetId } = await devtools.send('Target.createTarget', { url: BROWSER.blank })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  if (platform) {
    const { userAgent } = await devtools.send('Browser.getVersion')
    await devtools.send('Emulation.setUserAgentOverride', { userAgent, platform }, sessionId)
  }
  await devtools.send('Page.navigate', { url }, sessionId)
  return tabFace(devtools, targetId, sessionId)
}

function serve(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    server.on('error', reject)
    server.listen(0, BROWSER.loopback, () => resolve(server))
  })
}

/** A content type from a file name (`.js`, `.mjs`, `.css`, `.html`), else text. */
const typeOf = (name) => (/\.m?js$/.test(name) ? BROWSER.types.js : /\.css$/.test(name) ? BROWSER.types.css : /(\.html?|\/)$/.test(name) ? BROWSER.types.html : BROWSER.types.text)

/**
 * Start the browser and loopback origins. Returns null when no Chromium binary exists.
 * @param options.origins - `{name: routes}`; `routes` maps a pathname to `() => body` (string or
 *   Buffer; content type from the path) or `() => ({type, body, status})`, or is a function
 *   `(url) => that | undefined` (undefined answers 404). Every answer is `cache-control: no-store`.
 * @returns {{ devtools, origin(name), closedOrigin, openTab(url, options), open(name, path, options), stop() }}
 *   `closedOrigin` is a port that was free and is closed again: a navigation there never loads.
 *   `open` opens a tab on one origin and waits until its document is complete.
 */
export async function startEnvironment({ origins = {} } = {}) {
  const binary = chromeBinary()
  if (!binary) return null
  const parts = { servers: [] }
  try {
    const urls = {}
    for (const [name, routes] of Object.entries(origins)) {
      const server = await serve(async (req, res) => {
        const url = new URL(req.url, 'http://' + req.headers.host)
        const route = typeof routes === 'function' ? () => routes(url) : routes[url.pathname]
        const answer = route ? await route(url) : undefined
        if (answer === undefined) { res.writeHead(404, { 'content-type': BROWSER.types.text }); res.end('not found'); return }
        const full = typeof answer === 'object' && !Buffer.isBuffer(answer) ? answer : { body: answer }
        res.writeHead(full.status ?? 200, { 'content-type': full.type ?? typeOf(url.pathname), 'cache-control': BROWSER.noStore })
        res.end(full.body)
      })
      parts.servers.push(server)
      urls[name] = `http://${BROWSER.loopback}:${server.address().port}`
    }
    const devtools = await launchInto(parts, binary)
    const closed = await serve(() => {})
    const closedOrigin = `http://${BROWSER.loopback}:${closed.address().port}`
    await new Promise((resolve) => closed.close(resolve))
    const origin = (name) => { if (!(name in urls)) throw new Error('no origin ' + name); return urls[name] }
    return {
      devtools, origin, closedOrigin,
      openTab: (url, options) => openTab(devtools, url, options),
      async open(name, pathname = '/', options) {
        const tab = await openTab(devtools, origin(name) + pathname, options)
        await until(() => tab.evaluate('document.readyState === "complete"').catch(() => false), BROWSER.loadBudgetMs, name + pathname)
        return tab
      },
      stop: () => teardown(parts),
    }
  } catch (error) {
    await teardown(parts)
    throw error
  }
}

// ------------------------------------------------------------------------- measuring in one shared browser

let shared = null
/** One headless Chromium for a test file, started on first use; `stopBrowser` ends it. Rejects when none is installed. */
export function sharedBrowser() {
  shared ??= launchChromium().then((started) => {
    if (!started) throw new Error(BROWSER.skipNoChrome)
    return started
  })
  return shared
}
/** Stop the shared browser if a case started it (register as the file's `after` hook). */
export async function stopBrowser() {
  const started = await shared?.catch(() => null)
  shared = null
  await started?.stop()
}

/**
 * Load `html` in a fresh tab of the shared browser and evaluate `expression` (a function's source,
 * applied to `arg` as JSON) in it; the tab closes afterwards. Returns its JSON value.
 * `viewport` `{width, height}` (CSS px) is emulated before the document loads, so media queries see it.
 */
export async function measure(html, expression, arg, viewport) {
  const { devtools } = await sharedBrowser()
  const { targetId } = await devtools.send('Target.createTarget', { url: BROWSER.blank })
  try {
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
    const tab = tabFace(devtools, targetId, sessionId)
    if (viewport) await tab.resize(viewport.width, viewport.height)
    await devtools.send('Page.enable', {}, sessionId)
    const { frameTree } = await devtools.send('Page.getFrameTree', {}, sessionId)
    await devtools.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html }, sessionId)
    return await tab.evaluate(`(${expression})(${JSON.stringify(arg)})`)
  } finally {
    await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

// ------------------------------------------------------------------------- DSH's page styles

/** DSH's installed files these helpers read, and its theme's public shape. */
export const DSH_STYLES = Object.freeze({
  theme: Object.freeze({ package: 'dsh-client-ui-theme', file: path.join('lib', 'client.js') }),
  frontend: Object.freeze({ package: 'dsh-web-frontend', dist: 'dist', index: 'index.html' }),
  /** The stylesheet links of DSH's page, in document order. */
  stylesheetLink: /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  /** DSH's Tag rule names its tones (`.<class>[data-tone=success]{…}`): the module class the real Tag renders. */
  tagClass: /\.([\w-]+)\[data-tone=success\]/,
  /** The label the theme gives each of its sheet effects (`ui-theme: <name> stylesheet`). */
  themeSheetLabel: /stylesheet$/,
  /** The light theme is `body`'s rules, the dark one `body[data-ds-dark-theme]`. */
  darkAttribute: 'data-ds-dark-theme',
  tagPrimitive: 'Tag',
  styleTag: 'style',
  lang: 'en',
  base: 'http://127.0.0.1/',
})

const themeCache = new Map()
/**
 * DSH's theme sheets of one version, in mount order: the theme plugin's `apply` runs in a browser
 * sandbox with a context whose `effect` runs only the sheet effects; the first other member it reads
 * ends the run (everything after is settings rows and services, not styles).
 */
export function themeSheets(version = DSH_VERSION) {
  if (themeCache.has(version)) return themeCache.get(version)
  const file = path.join(dshPackageDir(DSH_STYLES.theme.package, version), DSH_STYLES.theme.file)
  const page = createBrowserSandbox({ lang: DSH_STYLES.lang, baseURI: DSH_STYLES.base })
  page.runFile(file)
  const { React } = createReactShim()
  // The theme's other imports (primitives, the client store) are not used by its sheets.
  const inert = new Proxy(function inert() {}, { get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : inert), apply: () => inert, construct: () => inert })
  const modules = { react: React, 'react/jsx-runtime': jsxRuntime(React) }
  const [registration] = page.registrations
  const plugin = registration.factory((name) => modules[name] ?? inert)
  const done = Symbol('the theme read a service: its sheets are mounted')
  const effects = { effect(fn, label) { if (DSH_STYLES.themeSheetLabel.test(String(label))) fn() } }
  const ctx = new Proxy(effects, { get(target, key) { if (key in target) return target[key]; throw done } })
  try { (plugin.default ?? plugin).apply(ctx) } catch (error) { if (error !== done) throw error }
  const sheets = Object.freeze(page.dom.head.querySelectorAll(DSH_STYLES.styleTag).map((s) => s.textContent))
  if (sheets.length === 0) throw new Error('dsh-client-ui-theme mounted no sheet on DSH ' + version)
  themeCache.set(version, sheets)
  return sheets
}

const frontendCache = new Map()
/** DSH's page stylesheets (dsh-web-frontend index.html's links, in order) and the real Tag's module class (null if none). */
export function frontendStyles(version = DSH_VERSION) {
  if (frontendCache.has(version)) return frontendCache.get(version)
  const dist = path.join(dshPackageDir(DSH_STYLES.frontend.package, version), DSH_STYLES.frontend.dist)
  const html = readFileSync(path.join(dist, DSH_STYLES.frontend.index), 'utf8')
  const sheets = Object.freeze([...html.matchAll(DSH_STYLES.stylesheetLink)].map((m) => readFileSync(path.join(dist, m[1]), 'utf8')))
  const tagClass = sheets.map((css) => DSH_STYLES.tagClass.exec(css)?.[1]).find(Boolean) ?? null
  const styles = Object.freeze({ sheets, tagClass })
  frontendCache.set(version, styles)
  return styles
}

/** How many of a documentOf document's sheets are DSH's (page styles, then theme): a page's own sheets follow them. */
export const dshSheetCount = (version = DSH_VERSION) => frontendStyles(version).sheets.length + themeSheets(version).length

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link'])
const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (text) => escapeText(text).replace(/"/g, '&quot;')
const ATTR_NAME = Object.freeze({ className: 'class', htmlFor: 'for', tabIndex: 'tabindex' })
const kebab = (name) => name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/**
 * One rendered host node (./react-shim) as HTML. A Tag stand-in (./dsh-primitives) gets the real
 * Tag's module class first, as DSH's Tag renders `clsx(tag, className)`.
 */
export function htmlOf(node, tagClass = frontendStyles().tagClass) {
  if (typeof node === 'string') return escapeText(node)
  const props = { ...node.props }
  if (props[STAND_IN.primitive] === DSH_STYLES.tagPrimitive) props.className = [tagClass, props.className].filter(Boolean).join(' ')
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

/**
 * The full document: DSH's page styles, DSH's theme sheets, then `sheets` (a page's own, mounted
 * after DSH's as a real page mounts them), and `tree` (host nodes) or `body` (HTML) in `<body>`,
 * dark when `dark` is set.
 */
export function documentOf({ tree = [], body = '', sheets = [], dark = false, version = DSH_VERSION } = {}) {
  const { sheets: page, tagClass } = frontendStyles(version)
  const styles = [...page, ...themeSheets(version), ...sheets].map((css) => `<style>${css}</style>`).join('')
  const content = tree.map((n) => htmlOf(n, tagClass)).join('') + body
  return `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body${dark ? ' ' + DSH_STYLES.darkAttribute : ''}>${content}</body></html>`
}

/**
 * The page-side colour probe (runs in Chromium; plain source, no imports), for `measure(html, PROBE, arg)`:
 * - `target`: the measured element's selector; `tone` (optional): its closest ancestor-or-self that
 *   carries the colours; `behind`: 'parent' to read the element the tone sits on;
 * - `root`: every element from the target up to the first matching it is "measured";
 * - `ownSheetsFrom`: the index of the first sheet whose rules are read (`dshSheetCount()`);
 * - `notLiteral`: colour words that are not a hard-coded colour (transparent, currentcolor, …);
 * - `colours`: CSS colour expressions to resolve in the target's parent.
 * Returns the computed text and ::placeholder colours, the background layers from the target, the
 * tone and the behind element outwards (./wcag `backdrop` paints them), the tone's outlines (inset
 * box-shadows with a spread, borders with a width), every declaration of the read sheets' rules that
 * select a measured element with the hard-coded colours in its value, and the resolved expressions.
 * `{missing: selector}` when the target or tone is not found.
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
  for (let at = target; at; at = at.parentElement) { measured.push(at); if (arg.root && at.matches(arg.root)) break }
  const literalsOf = (value) => {
    const bare = value.replace(/--[\w-]+/g, ' ')
    const found = [...bare.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)].map((m) => m[0])
    for (const word of bare.split(/[^\w-]+/)) if (word && !/^-?\d/.test(word) && !(arg.notLiteral ?? []).includes(word.toLowerCase()) && CSS.supports('color', word)) found.push(word)
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
  for (const sheet of [...document.styleSheets].slice(arg.ownSheetsFrom ?? 0)) visit(sheet.cssRules)
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
