/**
 * A node:vm context standing in for a DSH page, for running Fishball's classic client scripts
 * unread the way DSH's module loader runs them (`window.__ModuleLoader__.load({id, chunk?, factory})`).
 *
 * Only what those scripts touch at the page level is modelled: `document` (baseURI, currentScript,
 * documentElement attributes, head/body appends, element creation, empty queries), `window`
 * (location, the module loader, listeners), the browser `fetch` the caller supplies, and timers.
 * Timers the page schedules are tracked so `clearTimers()` stops a status poll when a case ends.
 * Used by test/support/set-panel.mjs (V2 SET) and test/v3/core/page.mjs (V3 R-CORE).
 */
import vm from 'node:vm'

/**
 * @param options.lang - the page language (`<html lang>` and navigator.languages).
 * @param options.baseURI - the document URL; `location` follows it.
 * @param options.fetch - the page's `fetch(input, init)`.
 * @param options.console - the page's console (defaults to the test process's).
 * @returns {{ sandbox, window, document, registrations: object[], run(source, filename, scriptSrc?), clearTimers() }}
 *   `registrations` collects every `__ModuleLoader__.load` entry; `run` executes one script with
 *   `document.currentScript.src` naming `scriptSrc`, as a loaded <script> would.
 */
export function createBrowserSandbox({ lang, baseURI, fetch, console: pageConsole = console }) {
  const registrations = []
  const timers = new Set()
  const sandboxTimers = {
    setTimeout: (fn, ms, ...args) => { const id = setTimeout(fn, ms, ...args); timers.add(id); return id },
    clearTimeout: (id) => { timers.delete(id); clearTimeout(id) },
    setInterval: (fn, ms, ...args) => { const id = setInterval(fn, ms, ...args); timers.add(id); return id },
    clearInterval: (id) => { timers.delete(id); clearInterval(id) },
  }
  const html = { lang, hasAttribute: () => false, setAttribute() {}, removeAttribute() {}, toggleAttribute() { return false } }
  const document = {
    baseURI,
    currentScript: null,
    documentElement: html,
    adoptedStyleSheets: [],
    hidden: false,
    head: { append() {}, appendChild() {} },
    body: { append() {}, appendChild() {}, removeChild() {} },
    createElement: () => ({ setAttribute() {}, append() {}, appendChild() {}, remove() {}, style: {} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
  }
  const window = {
    __ModuleLoader__: { load(entry) { registrations.push(entry) } },
    location: new URL(baseURI),
    addEventListener() {},
    removeEventListener() {},
    open: () => null,
    document,
    fetch,
  }
  const sandbox = {
    window, document, fetch, console: pageConsole, URL, URLSearchParams, Request, Response, Headers,
    AbortController, AbortSignal, queueMicrotask, structuredClone, ...sandboxTimers,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return [] } },
    CSSStyleSheet: class { constructor() { this.cssRules = [] } replaceSync() {} insertRule() { return 0 } },
    navigator: { languages: [lang] },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  return {
    sandbox, window, document, registrations,
    run(source, filename, scriptSrc) {
      document.currentScript = scriptSrc === undefined ? null : { src: scriptSrc }
      try { vm.runInContext(source, sandbox, { filename }) } finally { document.currentScript = null }
    },
    clearTimers() { for (const id of timers) { clearTimeout(id); clearInterval(id) } timers.clear() },
  }
}
