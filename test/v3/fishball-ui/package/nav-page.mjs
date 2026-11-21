/**
 * UI-POLISH-F: fishball-page's own navigation (`nav.fishball-page-navigation`, SPEC §1), at the
 * component level, offline. The real `fishball-ui/fishball-page/client.js` runs unread in the node:vm
 * page (support/browser-sandbox.mjs) over:
 * - the SDK's real dsh-client-shortcuts `ShortcutsService` (its browser bundle, over an in-memory
 *   localStorage), with the native commands the LITE cases register (test/v2-page-cases/lite.test.mjs),
 *   wrapped in the public `ctx.shortcuts` face so a case can hold the config (pending) or make an
 *   edit fail (failed);
 * - recording fakes with the public SDK shapes for `slots`, `layout`, `uiWorkspace`, `uiSession`,
 *   `sessions` and `locale` (the LITE harness's, test/v2-page-cases/lite-harness.js), and the
 *   `api/fishball/session` route;
 * - React = the hook shim (support/rp-recommend.mjs) and DSH's primitives through the F-SETTINGS
 *   stand-ins (../../fishball-core/settings/primitives.mjs: Button, Tooltip, StateDot, icons).
 * The `settings.launcher` slot is mounted with DSH's `SettingsLauncherOwnerProps` (dsh-client-ui-settings
 * contract/slots.d.ts, both SDKs): `wide`, `settingsOpen`, `settingsShortcut?`, `openSettings`,
 * `openOnboarding`. `shell.overlay` entries are mounted with no props.
 *
 * The LITE browser rows (test/v2-page-cases/lite.test.mjs) cover the same page in a real Chromium; they
 * skip where no Chromium exists, so these rows pin the SPEC §1 markup without one.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { primitivesFor } from '../../fishball-core/settings/primitives.mjs'
import { NAV_PAGE } from './polish-constants.mjs'

const settle = async (rounds = NAV_PAGE.settleRounds) => { for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const idempotent = (fn) => { let done = false; return () => { if (!done) { done = true; fn() } } }

function store(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) }, set(next) { value = next; for (const fn of [...listeners]) fn() } }
}
function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(String(k), String(v)) }, removeItem: (k) => { map.delete(k) }, clear: () => map.clear(), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size } }
}
/** `<html>` with real attributes and a dataset (the shortcut service reads `dataset.platform`). */
function htmlElement(lang) {
  const attributes = new Map()
  return {
    lang, dataset: {},
    hasAttribute: (n) => attributes.has(n), getAttribute: (n) => (attributes.has(n) ? attributes.get(n) : null),
    setAttribute: (n, v) => { attributes.set(n, String(v)) }, removeAttribute: (n) => { attributes.delete(n) },
    toggleAttribute: (n, force) => { const on = force ?? !attributes.has(n); if (on) attributes.set(n, ''); else attributes.delete(n); return on },
    /** MULTI-3: attribute selectors only (`[a]`, `[a="v"]`, `:not([a])`, compound and comma lists), as `<html>` matches them. */
    matches: (selector) => String(selector).split(',').some((part) => {
      const one = part.trim()
      const parts = [...one.matchAll(/(:not\()?\[([\w-]+)(?:="([^"]*)")?\]\)?/g)]
      if (parts.length === 0 || parts.map((m) => m[0]).join('') !== one.replace(/^html/, '')) return false
      return parts.every(([, not, name, value]) => { const hit = attributes.has(name) && (value === undefined || attributes.get(name) === value); return not ? !hit : hit })
    }),
    closest() { return null },
    contains: () => false,
    addEventListener() {}, removeEventListener() {},
  }
}

/** The SDK's real ShortcutsService in `page`, with the native commands registered. */
function realShortcuts(sdk, page) {
  const file = path.join(runtimeOf(sdk), NAV_PAGE.shortcutsBundle)
  page.run(fs.readFileSync(file, 'utf8'), file)
  const reg = page.registrations.find((r) => r.id === NAV_PAGE.shortcutsModule)
  class Service { constructor(ctx, name) { this.ctx = ctx; this.name = name } }
  const ShortcutsService = reg.factory((name) => {
    if (name === NAV_PAGE.sdk.cordis) return { Service }
    if (name === NAV_PAGE.sdk.store) return { createSnapshotStore: store }
    if (name === NAV_PAGE.sdk.primitives) return { modalSelector: NAV_PAGE.modalSelector, observeComposition: () => ({ guards: (event) => event.isComposing, dispose() {} }) }
    throw new Error('unexpected SDK require ' + name)
  })
  const effects = []
  const service = new ShortcutsService({ effect(fn) { effects.push(fn()) }, locale: { subscribe: () => () => {} } })
  for (const [id, defaults] of Object.entries(NAV_PAGE.commands)) {
    service.register({ id, label: () => id, aliases: [], defaults, regions: NAV_PAGE.regions, modals: [], resolve: () => ({ status: 'handled', run() {} }) })
  }
  return { service, dispose: () => { for (const d of effects) d?.() } }
}

/**
 * One page. Options:
 * - `lang` 'en' | 'zh';
 * - `openFails` how many `uiWorkspace.openSession` calls reject first (the "unavailable" status);
 * - `holdConfig` the shortcut config stays `loading` (the "pending" status);
 * - `failEdits` every shortcut edit answers `write-failed` (the "failed" status);
 * - `launcher` the `settings.launcher` owner props over the defaults (`settingsOpen`, `settingsShortcut`);
 * - `width` (MULTI-3) the viewport width `window.matchMedia` answers `(max-width|min-width: Npx)` queries for;
 * - `shell` (LOGO-BUTTON) a scripted shell document: `{ body, querySelector, querySelectorAll, getElementsByName }`
 *   the page queries instead of the empty default, so fishball-page's native-control hiding
 *   (`mountRemovals`) sees the shell's buttons and its body observer works;
 * - `translate` `(namespace, key) => word` for the page's locale seat (the default answers the key);
 * - `primitives` (GENTLE-TOOLS avatar) extra exports of the primitives module over the stand-ins
 *   (e.g. FISH_LOGO_PATH / FISH_LOGO_VIEWBOX, which the stand-ins do not carry);
 * - `prepare(page, ctx)` runs before the page client loads (startup services such as configForms).
 *
 * MULTI-3 observation points: `log.registrations` (every `slots.register` options: name, id, key,
 * priority), `log.edits` (every shortcut edit operation), `log.toggles` (`layout.toggleSidebar`
 * calls), `styles()` (the text of every style rule or sheet the page mounted, through
 * `CSSStyleSheet` or a `<style>` element) and `html` (the `<html>` element's attributes).
 */
export async function navPage(t, sdk, { lang = NAV_PAGE.langs[0], openFails = 0, holdConfig = false, failEdits = false, launcher = {}, width = NAV_PAGE.wideWidth, shell, translate, primitives: extraPrimitives = {}, prepare = () => {} } = {}) {
  // Host refs: a host element with a ref gets a stable stand-in element (React's commit does the
  // same), so a component that portals into another's element (the Settings launcher into the
  // nav's seat) can find it. `createPortal(node, container)` renders an `fbtest-portal` host node
  // carrying its container; `composed()` puts each portal's content where its container is.
  const elements = new Map()
  const hostRef = (at, tag, props) => {
    const known = elements.get(at)
    const el = known?.el ?? { tagName: tag.toUpperCase(), fbtestAt: at, contains: () => false, getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }), focus() {}, blur() {}, addEventListener() {}, removeEventListener() {} }
    if (known?.ref === props.ref) return
    elements.set(at, { el, ref: props.ref })
    if (typeof props.ref === 'function') queueMicrotask(() => props.ref(el))
    else if (props.ref && typeof props.ref === 'object') props.ref.current = el
  }
  const shim = createReactShim({ stale() {}, hostRef })
  const { React } = shim
  const log = { opens: [], panels: [], openSettings: 0, fetches: [], errors: [], registrations: [], edits: [], toggles: 0 }
  const page = createBrowserSandbox({
    lang, baseURI: NAV_PAGE.baseURI,
    fetch: async (input) => {
      const url = new URL(String(input), NAV_PAGE.baseURI)
      log.fetches.push(url.pathname)
      if (url.pathname !== NAV_PAGE.sessionRoute) return new Response('', { status: 404 })
      return new Response(JSON.stringify({ sessionId: NAV_PAGE.manager }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  page.document.documentElement = htmlElement(lang)
  // LOGO-BUTTON: a scripted shell supplies the document queries the page's native-control hiding
  // uses (the brand row and the New Session button carry the same initial aria-label).
  if (shell) {
    page.document.body = shell.body ?? page.document.body
    if (shell.querySelector) page.document.querySelector = shell.querySelector
    if (shell.querySelectorAll) page.document.querySelectorAll = shell.querySelectorAll
    if (shell.getElementsByName) page.document.getElementsByName = shell.getElementsByName
    if (shell.MutationObserver) { page.sandbox.MutationObserver = shell.MutationObserver; page.window.MutationObserver = shell.MutationObserver }
  }
  // MULTI-3: document listeners (the narrow sheet's pointerdown / keydown) are recorded so a case can fire them.
  const docListeners = []
  page.document.addEventListener = (type, fn, options) => { docListeners.push({ type, fn, options }) }
  page.document.removeEventListener = (type, fn) => { const at = docListeners.findIndex((l) => l.type === type && l.fn === fn); if (at >= 0) docListeners.splice(at, 1) }
  page.document.activeElement = null
  // MULTI-3: the page's own style rules (constructed sheets or <style> elements), and a viewport.
  const sheets = []
  page.sandbox.CSSStyleSheet = class { constructor() { this.cssRules = []; sheets.push(this) } replaceSync(text) { this.text = String(text) } replace(text) { this.text = String(text); return Promise.resolve(this) } insertRule(rule, at = this.cssRules.length) { this.cssRules.splice(at, 0, { cssText: String(rule) }); return at } deleteRule(at) { this.cssRules.splice(at, 1) } }
  page.window.CSSStyleSheet = page.sandbox.CSSStyleSheet
  const elementsMade = []
  page.document.createElement = (tag) => { const el = { tagName: String(tag).toUpperCase(), textContent: '', dataset: {}, style: {}, removed: false, setAttribute(n, v) { el[n] = String(v) }, append() {}, appendChild() {}, remove() { el.removed = true } }; elementsMade.push(el); return el }
  const media = (query) => {
    const bound = NAV_PAGE.mediaWidth.exec(String(query))
    const matches = bound ? (bound[1] === NAV_PAGE.maxWidth ? width <= Number(bound[2]) : width >= Number(bound[2])) : false
    return { media: String(query), matches, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }
  }
  page.window.matchMedia = media
  page.sandbox.matchMedia = media
  // The browser's CSS namespace: CSS.supports answers as the Chromium the frame-layout rows measure
  // in does (every selector and declaration DSH's web page relies on, :has() included).
  const css = { supports: () => true, escape: (text) => String(text).replace(/[^\w-]/g, (c) => '\\' + c) }
  page.sandbox.CSS = css
  page.window.CSS = css
  page.window.innerWidth = width
  page.sandbox.localStorage = memoryStorage()
  page.window.localStorage = page.sandbox.localStorage
  page.sandbox.crypto = globalThis.crypto
  page.sandbox.Event = Event
  // In a browser the timers are window's own (the shortcut service calls window.clearTimeout).
  for (const name of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) page.window[name] = page.sandbox[name]
  page.sandbox.navigator.platform = NAV_PAGE.platform
  page.sandbox.navigator.userAgent = NAV_PAGE.userAgent
  const shortcuts = realShortcuts(sdk, page)
  const { service } = shortcuts
  const ready = () => service.config.getSnapshot().status !== NAV_PAGE.loading
  if (!ready()) await new Promise((resolve) => { const off = service.config.subscribe(() => { if (ready()) { off(); resolve() } }) })

  // ctx.shortcuts: the public face over the real service (the LITE harness's facade, trimmed).
  let held = holdConfig
  const own = new Set()
  const counted = (subscribe) => (fn) => { own.add(fn); const off = subscribe(fn); return () => { own.delete(fn); off() } }
  const face = {
    runtime: service.runtime, platform: service.platform, stopSequenceMs: service.stopSequenceMs, fixedCatalog: service.fixedCatalog,
    catalog: { getSnapshot: () => service.catalog.getSnapshot(), subscribe: counted((fn) => service.catalog.subscribe(fn)) },
    config: { getSnapshot: () => (held ? { ...service.config.getSnapshot(), status: NAV_PAGE.loading } : service.config.getSnapshot()), subscribe: counted((fn) => service.config.subscribe(fn)) },
    describeBinding: (binding) => service.describeBinding(binding),
    edit: async (operation, revision) => (log.edits.push(structuredClone(operation)), failEdits ? { status: NAV_PAGE.writeFailed, snapshot: service.config.getSnapshot() } : service.edit(operation, revision)),
    register: (command) => service.register(command), registerFixed: (command) => service.registerFixed(command),
    observeFixedInput: (listener) => service.observeFixedInput(listener), recording: (active) => service.recording(active), closeWindow: () => service.closeWindow(),
  }

  const current = store({ key: null })
  const catalog = (mainId) => ({
    ids: [NAV_PAGE.manager, NAV_PAGE.other], phase: 'ready', projectionsBySession: {},
    byId: Object.fromEntries([NAV_PAGE.manager, NAV_PAGE.other].map((id) => [id, { id, displayTitle: id, running: false, blank: false, updatedAt: 0, retainedBy: id === mainId ? { mainView: 1 } : {} }])),
  })
  const list = store(catalog(null))
  const panel = store({ activePanelId: null })
  let failures = openFails
  const show = (id) => { list.set(catalog(id)); current.set({ key: id }) }
  const launcherProps = { wide: false, settingsOpen: false, openSettings: () => { log.openSettings += 1 }, openOnboarding() {}, ...launcher }
  const mounted = []
  const slots = {
    register(options, Component) {
      const key = options.name + ':' + (options.id ?? mounted.length)
      log.registrations.push({ name: options.name, id: options.id, key: options.key, priority: options.priority })
      mounted.push({ key, options })
      const props = () => (options.name === NAV_PAGE.slot.launcher ? launcherProps : {})
      shim.mount(key, () => React.createElement(Component, props()))
      return idempotent(() => shim.unmountRoot(key))
    },
    inject(_name, fn) { const out = fn(); return () => { if (typeof out === 'function') out() } },
    entries: () => [], subscribe: () => () => {}, getVersion: () => 0,
  }
  const effects = []
  const ctx = {
    effect(fn) { const out = fn(); effects.push(out); return out },
    slots,
    layout: { panelInfo: panel, selectPanel: (id) => { log.panels.push(id); panel.set({ activePanelId: id }) }, toggleSidebar() { log.toggles += 1 } },
    uiWorkspace: {
      async openSession(id) { log.opens.push(id); if (failures > 0) { failures -= 1; throw new Error('fbtest: injected openSession rejection') } show(id) },
      async archiveSession() {}, async startSession() {}, async forkSession() {},
    },
    uiSession: { adapter: { current } },
    sessions: { list, async archive() {}, async fork() {}, async create() {} },
    locale: {
      bind: (ns) => (key) => translate?.(ns, key) ?? key, subscribe: () => () => {}, getSnapshot: () => ({ active: lang, revision: 0 }),
      getLocale: () => ({ active: lang, revision: 0, locales: NAV_PAGE.langs.map((id) => ({ id })) }), setLocale() {}, register: () => () => {},
    },
    shortcuts: face,
  }
  // Tests can supply startup services before fishball-page sees the child document.
  prepare(page, ctx)
  const file = NAV_PAGE.pageClient
  page.run(fs.readFileSync(file, 'utf8'), file)
  const entry = page.registrations.find((r) => r.id === NAV_PAGE.pageModule)
  const primitives = primitivesFor(sdk, React)
  const loadPlugin = () => entry.factory((name) => {
    if (name === NAV_PAGE.modules.react) return React
    if (name === NAV_PAGE.modules.reactDom) return { createPortal: (node, container) => React.createElement(NAV_PAGE.portalTag, { [NAV_PAGE.portalContainer]: container }, node) }
    if (name === NAV_PAGE.modules.primitives) return new Proxy(primitives, { get: (target, key) => (key === NAV_PAGE.modalSelectorKey ? NAV_PAGE.modalSelector : Object.hasOwn(extraPrimitives, key) ? extraPrimitives[key] : target[key]) })
    throw new Error('unexpected page require ' + name)
  })
  // A replacement page scope goes away; the document and native services prepared above stay live.
  const nativeEffects = effects.length
  let plugin = loadPlugin()
  const install = () => (plugin.default ?? plugin).apply({ ...ctx })
  const dispose = (from) => {
    for (const out of effects.splice(from).reverse()) { if (typeof out === 'function') out(); else out?.dispose?.() }
    for (const m of mounted.splice(0)) shim.unmountRoot(m.key)
  }
  const replace = async () => { dispose(nativeEffects); plugin = loadPlugin(); install(); await settle() }
  try { install() } catch (error) { log.errors.push(String(error?.stack ?? error)) }
  t.after(() => {
    dispose(0)
    shortcuts.dispose()
    page.clearTimers()
  })
  await settle()
  /** Every mounted root, each portal's content moved into the host node its container is. */
  const composed = () => {
    const all = shim.tree()
    const portals = findAll(all, (n) => n.tag === NAV_PAGE.portalTag)
    const into = (node) => {
      if (typeof node === 'string') return [node]
      if (node.tag === NAV_PAGE.portalTag) return []
      const at = [...elements.values()].find((e) => e.ref === node.props.ref)?.el
      const moved = at ? portals.filter((x) => x.props[NAV_PAGE.portalContainer] === at).flatMap((x) => x.children) : []
      return [{ ...node, children: [...(node.children ?? []), ...moved].flatMap(into) }]
    }
    return all.flatMap(into)
  }
  const nodes = () => findAll(composed(), () => true)
  const nav = () => nodes().find((n) => n.tag === NAV_PAGE.nav.tag && n.props.className?.split(' ').includes(NAV_PAGE.nav.className) && n.props['aria-label'] === NAV_PAGE.nav.label)
  return {
    shim, log, nodes, nav, settle, composed, install, replace,
    /** GENTLE-TOOLS avatar: tear the page scope down now (as DSH unmounting the page), keeping the native services. */
    unmount: async () => { dispose(nativeEffects); await settle() },
    /** MULTI-3: every style rule text the page mounted and still holds. */
    styles: () => [
      ...sheets.flatMap((sheet) => [sheet.text ?? '', ...sheet.cssRules.map((r) => r.cssText)]),
      ...elementsMade.filter((el) => el.tagName === NAV_PAGE.styleTag && !el.removed).map((el) => el.textContent),
    ].filter(Boolean),
    html: page.document.documentElement,
    /** MULTI-3: the live document listeners by type. */
    documentListeners: (type) => docListeners.filter((l) => l.type === type),
    /** Re-render the launcher with other owner props (DSH re-renders the slot so). */
    setLauncher: async (props) => { Object.assign(launcherProps, props); shim.rerender(); await settle() },
    /** The nav's subtree (empty when absent). */
    inNav: () => { const n = nav(); return n ? findAll([n], () => true) : [] },
    /** The main view shows `id` with no user action (LITE's drift). */
    drift: (id) => show(id),
    release: async () => { held = false; for (const fn of [...own]) fn(); await settle() },
    async press(node) {
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node, button: 0 })
      await settle()
    },
    async fire(node, handler) { node.props[handler]?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node }); await settle() },
    text: (node) => textOf(node),
  }
}
