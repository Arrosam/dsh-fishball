/**
 * LITE's browser environment (test-owned, no product import): a headless Chromium
 * (fishball-test-helpers/browser) over two throwaway loopback origins.
 * - The "child" origin serves the harness page (./lite-harness.js: a native-like child document and
 *   `window.__lite`), fishball-page's client (executed unread) and the current DSH's real
 *   dsh-client-shortcuts browser bundle; a case's own `scripts` ({pathname: () => body}) beside them.
 * - The "main" origin only holds main-DSH storage sentinels.
 * Distinct ports are distinct browser origins, so localStorage is really partitioned. Each case opens
 * a fresh tab, so page state never leaks between cases.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BROWSER, startEnvironment } from 'fishball-test-helpers/browser'
import { DSH_RUNTIME, DSH_VERSION } from 'fishball-test-helpers/dsh'
import { until } from 'fishball-test-helpers/wait'
import { PAGE_CLIENT } from './page-client.mjs'

export const LITE_ENV = Object.freeze({
  pageClient: PAGE_CLIENT,
  harness: path.join(import.meta.dirname, 'lite-harness.js'),
  shortcutsBundle: path.join('@deepseek-ai', 'dsh-client-shortcuts', 'lib', 'client.js'),
  routes: Object.freeze({ harness: '/', harnessScript: '/harness.js', page: '/page/client.js', sdkPrefix: '/sdk/', main: '/main' }),
  /** The harness page asks for its shortcut bundle under the DSH version it is told. */
  sdkParam: 'sdk',
  /** The harness is ready when its document is loaded and `window.__lite` exists. */
  ready: 'document.readyState === "complete" && typeof window.__lite === "object"',
  loaded: 'document.readyState === "complete"',
  linuxPlatform: 'Linux x86_64',
  html: '<!doctype html><html><head><meta charset="utf-8"><title>lite</title></head><body><script src="/harness.js"></script></body></html>',
  mainHtml: '<!doctype html><title>main</title>',
})

/** The current DSH's node_modules (the shortcut bundle and the native dictionaries come from it). */
export const sdkRuntime = () => DSH_RUNTIME

/**
 * The locale tables of a DSH client bundle: `const en = {"key": "word"}` (0.2.1/0.2.2-rc.1) or,
 * minified since 0.2.2-rc.5, `const en={"key":\`word\`}`. Both are read; a word is a quoted string.
 */
const TABLE = Object.freeze({
  open: (lang) => new RegExp('const ' + lang + '\\s*=\\s*\\{'),
  /** Global, so a search can start at a table's opening (a table's words may hold `{name}` braces). */
  word: (key) => new RegExp('"' + key.replace(/\./g, '\\.') + '":\\s*(?:"([^"]*)"|\`([^\`]*)\`)', 'g'),
})
/**
 * A native en/zh label from one DSH client bundle. The page hides controls by the localized label DSH
 * itself shows, so the label is DSH's own.
 */
function nativeDictionary(pkg, key) {
  const source = readFileSync(path.join(DSH_RUNTIME, '@deepseek-ai', pkg, 'lib', 'client.js'), 'utf8')
  const pick = (lang) => {
    const open = TABLE.open(lang).exec(source)
    // The first occurrence after this language's table opens is its own (each table lists every key).
    const word = TABLE.word(key)
    word.lastIndex = open ? open.index : source.length
    const match = word.exec(source)
    if (!match) throw new Error(`native ${lang} label ${key} not found in ${pkg}`)
    return match[1] ?? match[2]
  }
  return { en: { [key]: pick('en') }, zh: { [key]: pick('zh') } }
}
const merge = (a, b) => ({ en: { ...a.en, ...b.en }, zh: { ...a.zh, ...b.zh } })
/** The native dictionaries `__lite.start` takes (`dicts`). */
export function liteDictionaries() {
  return {
    sidebar: nativeDictionary('dsh-client-ui-sidebar', 'session.new.label'),
    chat: nativeDictionary('dsh-client-ui-chat', 'message.branch'),
    conversation: merge(nativeDictionary('dsh-client-ui-conversation', 'session.hierarchy'), nativeDictionary('dsh-client-ui-conversation', 'hero.chooseWorkspace')),
  }
}

/**
 * Start the browser and both origins; null when no Chromium exists. `scripts` adds child-origin
 * scripts (`{pathname: () => body}`, served as JavaScript).
 * @returns {{ childOrigin, mainOrigin, closedOrigin, openChild({hash, platform}), openMain(), stop() }}
 */
export async function startLiteEnvironment({ scripts = {} } = {}) {
  const files = { ...scripts, [LITE_ENV.routes.harnessScript]: () => readFileSync(LITE_ENV.harness, 'utf8'), [LITE_ENV.routes.page]: () => readFileSync(LITE_ENV.pageClient, 'utf8') }
  const child = (url) => {
    if (url.pathname === LITE_ENV.routes.harness) return LITE_ENV.html
    if (files[url.pathname]) return { type: BROWSER.types.js, body: files[url.pathname]() }
    if (url.pathname.startsWith(LITE_ENV.routes.sdkPrefix)) return { type: BROWSER.types.js, body: readFileSync(path.join(DSH_RUNTIME, LITE_ENV.shortcutsBundle), 'utf8') }
    return undefined
  }
  const env = await startEnvironment({ origins: { child, main: { [LITE_ENV.routes.main]: () => LITE_ENV.mainHtml } } })
  if (!env) return null
  return {
    childOrigin: env.origin('child'), mainOrigin: env.origin('main'), closedOrigin: env.closedOrigin,
    /** A fresh child tab running the harness over the current DSH's shortcut service. */
    async openChild({ hash = '', platform } = {}) {
      const tab = await env.openTab(env.origin('child') + LITE_ENV.routes.harness + '?' + LITE_ENV.sdkParam + '=' + encodeURIComponent(DSH_VERSION) + hash, { platform })
      await until(() => tab.evaluate(LITE_ENV.ready).catch(() => false), BROWSER.loadBudgetMs)
      return tab
    },
    open: (name, pathname, options) => env.open(name, pathname, options),
    openMain: () => env.open('main', LITE_ENV.routes.main),
    devtools: env.devtools,
    stop: () => env.stop(),
  }
}