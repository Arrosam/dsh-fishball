/**
 * A node:vm page for running classic client scripts unread, the way DSH's browser module loader
 * runs them: each served script calls `window.__ModuleLoader__.load({id, chunk?, factory})`, and the
 * page collects those registrations (./client-graph turns them into a module table).
 *
 * The page's global object IS `window` (as in a browser), so `window.x` and a bare `x` are one.
 * What a page holds:
 * - `document`: ./fake-dom's elements (`documentElement` with `lang`, `head`, `body`, element
 *   creation, the simple selectors, attribute MutationObservers), `baseURI`, `currentScript` while a
 *   script runs, `adoptedStyleSheets`, `hidden`;
 * - `location` (the document URL, fragment included), the caller's `fetch`, the caller's console;
 * - window listeners, recorded and fired by `dispatchWindow(type, props)`; `window.open`, recorded
 *   in `opened` (answers null);
 * - `matchMedia(query)`: `matches` is the caller's `media(query)` (default false); `setMedia(fn)`
 *   changes the answer and tells the listeners of every query whose answer changed;
 * - timers, tracked so `clearTimers()` stops what the page scheduled when a case ends;
 * - `EventSource`: the caller's (./event-source), else one that never delivers, so a client that
 *   opens a stream at apply time keeps its first state instead of throwing on a missing global;
 * - `CSSStyleSheet` whose `replaceSync`/`replace` keep the text (`styleTexts()` reads them back).
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { createDom } from './fake-dom.mjs'

const SANDBOX = Object.freeze({ utf8: 'utf8', styleTag: 'style', change: 'change' })

/** A stream that never delivers (the default EventSource). */
class SilentEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  constructor(url) { this.url = String(url); this.readyState = SilentEventSource.CONNECTING }
  close() { this.readyState = SilentEventSource.CLOSED }
  addEventListener() {}
  removeEventListener() {}
}

/** Constructed sheets keep their text, so the page's styles can be read back. */
class TextStyleSheet {
  constructor() { this.text = ''; this.cssRules = [] }
  replaceSync(text) { this.text = String(text); this.cssRules = [{ cssText: this.text }] }
  async replace(text) { this.replaceSync(text); return this }
  insertRule(rule, index = this.cssRules.length) { this.cssRules.splice(index, 0, { cssText: String(rule) }); this.text = this.cssRules.map((r) => r.cssText).join('\n'); return index }
}

/**
 * @param options.lang - the page language (`<html lang>`, navigator.language(s)).
 * @param options.baseURI - the document URL; `location` follows it (`hash` is added to it).
 * @param options.hash - the location fragment ('' by default), e.g. '#view=settings'.
 * @param options.fetch - the page's `fetch(input, init)` (default: every request answers 404).
 * @param options.console - the page's console (default: the test process's).
 * @param options.EventSource - the page's EventSource class.
 * @param options.media - `(query) => boolean`, what matchMedia answers.
 * @param options.dom - a ./fake-dom DOM to use (default: a fresh one).
 * @returns {{ sandbox, window, document, dom, registrations, opened, listeners, run, runFile,
 *   dispatchWindow, setMedia, styleTexts, clearTimers }}
 */
export function createBrowserSandbox({
  lang, baseURI, hash = '', fetch = async () => new Response('', { status: 404 }), console: pageConsole = console,
  EventSource = SilentEventSource, media = () => false, dom = createDom(),
}) {
  const registrations = []
  const opened = []
  const listeners = new Map()
  const timers = new Set()
  const track = (id) => { timers.add(id); return id }
  const untrack = (clear) => (id) => { timers.delete(id); clear(id) }
  dom.html.lang = lang
  const location = new URL(hash, baseURI)
  const document = {
    baseURI: new URL(baseURI).href,
    currentScript: null,
    documentElement: dom.html,
    head: dom.head,
    body: dom.body,
    adoptedStyleSheets: [],
    hidden: false,
    visibilityState: 'visible',
    createElement: dom.createElement,
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    querySelector: (selector) => (dom.html.matches(selector) ? dom.html : dom.html.querySelector(selector)),
    querySelectorAll: (selector) => [...(dom.html.matches(selector) ? [dom.html] : []), ...dom.html.querySelectorAll(selector)],
    getElementById: (id) => dom.html.descendants().find((e) => e.id === id) ?? null,
    getElementsByClassName: (name) => dom.html.getElementsByClassName(name),
    addEventListener() {},
    removeEventListener() {},
    get location() { return location },
  }

  // matchMedia: one media object per query text, as a browser answers repeated queries.
  let answer = media
  const mediaLists = new Map()
  const matchMedia = (query) => {
    const text = String(query)
    if (mediaLists.has(text)) return mediaLists.get(text).list
    const subscribers = new Set()
    const list = {
      media: text, onchange: null,
      get matches() { return Boolean(answer(text)) },
      addEventListener: (_type, fn) => subscribers.add(fn), removeEventListener: (_type, fn) => subscribers.delete(fn),
      addListener: (fn) => subscribers.add(fn), removeListener: (fn) => subscribers.delete(fn),
      dispatchEvent: () => true,
    }
    mediaLists.set(text, { list, subscribers, last: list.matches })
    return list
  }
  const setMedia = (next) => {
    answer = next
    for (const entry of mediaLists.values()) {
      const now = entry.list.matches
      if (now === entry.last) continue
      entry.last = now
      const event = { type: SANDBOX.change, matches: now, media: entry.list.media }
      entry.list.onchange?.(event)
      for (const fn of [...entry.subscribers]) fn(event)
    }
  }

  const sandbox = {
    document, location, fetch, console: pageConsole, URL, URLSearchParams, Request, Response, Headers, Blob, FormData,
    AbortController, AbortSignal, TextEncoder, TextDecoder, queueMicrotask, structuredClone, Intl, Date,
    setTimeout: (fn, ms, ...args) => track(setTimeout(fn, ms, ...args)),
    clearTimeout: untrack(clearTimeout),
    setInterval: (fn, ms, ...args) => track(setInterval(fn, ms, ...args)),
    clearInterval: untrack(clearInterval),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    MutationObserver: dom.MutationObserver,
    EventSource,
    CSSStyleSheet: TextStyleSheet,
    matchMedia,
    navigator: { language: lang, languages: [lang], platform: '', userAgent: '' },
    __ModuleLoader__: { load(entry) { registrations.push(entry) } },
    addEventListener(type, fn) { const list = listeners.get(type) ?? []; list.push(fn); listeners.set(type, list) },
    removeEventListener(type, fn) { const list = listeners.get(type) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1) },
    open: (...args) => { opened.push(args); return null },
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  const run = (source, filename, scriptSrc) => {
    document.currentScript = scriptSrc === undefined ? null : { src: scriptSrc }
    try { vm.runInContext(source, sandbox, { filename }) } finally { document.currentScript = null }
  }
  return {
    sandbox, window: sandbox, document, dom, registrations, opened, listeners, setMedia,
    /** Run one script; `document.currentScript.src` names `scriptSrc` meanwhile, as for a loaded <script>. */
    run,
    /** Run a file, its own file URL as `currentScript.src`. */
    runFile: (file) => run(fs.readFileSync(file, SANDBOX.utf8), file, pathToFileURL(file).href),
    /** Fire a window event to the page's listeners. */
    dispatchWindow(type, props = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ type, ...props }) },
    /** The text of every `<style>` still in the document and of every adopted constructed sheet, in order. */
    styleTexts: () => [
      ...dom.html.querySelectorAll(SANDBOX.styleTag).map((s) => s.textContent),
      ...document.adoptedStyleSheets.map((s) => s.text ?? (s.cssRules ?? []).map((r) => r.cssText).join('\n')),
    ].filter(Boolean),
    clearTimers() { for (const id of timers) { clearTimeout(id); clearInterval(id) } timers.clear() },
  }
}
