/**
 * Offline harness for the child's slim settings panel `packages/core/ui/fishball-settings/client.js`
 * (SET), used by the main-only model sync cases (test/v2-page-cases/set-main-only-sync.test.mjs).
 *
 * Black box. The two classic scripts run unread in a node:vm context, the way DSH's module loader
 * runs them: the panel registers `{id: 'fishball-settings', factory}` and loads the instance's
 * `client.js` as its package-local chunk `./client.instance.js` (docs/planning/v2-set.md "Launch
 * overlay"), so the chunk is evaluated with `document.currentScript` naming that chunk URL. React
 * is the hook shim of rp-recommend.mjs (no React is resolvable here and nothing may be installed);
 * the primitives render host elements carrying every prop. The fake ctx models only the public
 * client surfaces the panel names (`slots`, `layout`, `locale`, `ctx.get`, `ctx.effect`).
 *
 * Observation points: the rendered host tree (data attributes, text, tags, order), every browser
 * fetch the page makes, and the chunk's `exports.shared`. Timers the page schedules are tracked and
 * cleared when the test ends, so a status poll cannot keep the test process alive.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BODY_SOUL } from './body-soul-env.mjs'
import { createBrowserSandbox } from './browser-sandbox.mjs'
import { createReactShim, findAll, settle, textOf } from './rp-recommend.mjs'
import { EMBED_UI } from './constants.mjs'

export const PANEL = Object.freeze({
  panelClient: path.join(BODY_SOUL.core, 'ui', 'fishball-settings', 'client.js'),
  instanceClient: EMBED_UI.statusLine,
  moduleId: 'fishball-settings',
  chunk: 'client.status.js',
  chunkRequest: './client.status.js',
  baseURI: 'http://child.test/fishball-child/',
  chunkURL: 'http://child.test/fishball-child/fishball-hosted-settings/client.status.js?rev=1',
  panelSlot: 'main',
  modules: Object.freeze({ react: 'react', reactDom: 'react-dom', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  route: Object.freeze({
    status: 'api/fishball-instance/status',
    retry: 'api/fishball-instance/retry',
    restart: 'api/fishball-instance/restart',
  }),
  status: Object.freeze({
    ready: Object.freeze({ state: 'ready', code: null }),
    starting: Object.freeze({ state: 'starting', code: null }),
    failed: Object.freeze({ state: 'failed', code: 'NATIVE_CHILD_EXITED' }),
    unavailable: Object.freeze({ state: 'unavailable', code: null }),
  }),
  notFound: 404,
})

/** Primitives: Button is a host <button>, every other export a generic element; all props kept. Shared with test/v3/core/page.mjs. */
export function fakePrimitives(React) {
  const cache = new Map()
  const make = (name) => function Primitive({ children, ...rest }) {
    return React.createElement(name === 'Button' ? 'button' : 'div', { 'data-primitive': name, ...rest }, children)
  }
  const primitives = new Proxy({}, {
    get(_target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (!cache.has(name)) cache.set(name, make(name))
      return cache.get(name)
    },
  })
  return primitives
}

/**
 * Activate the panel in one language and render its `main` slot entry.
 * @param t - the node:test context (cleanup).
 * @param options.lang - 'en' or 'zh', the child's active locale.
 * @param options.status - the `{state, code}` GET status answers.
 */
export async function mountPanel(t, { lang = 'en', status = PANEL.status.ready } = {}) {
  const fetches = []
  const json = (body, init) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init })
  async function browserFetch(input, init = {}) {
    const url = new URL(String(input instanceof Request ? input.url : input), PANEL.baseURI)
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    fetches.push({ url: url.href, pathname: url.pathname, method })
    if (url.pathname.endsWith('/' + PANEL.route.status)) return json(status)
    if (url.pathname.endsWith('/' + PANEL.route.retry)) return json(status)
    if (url.pathname.endsWith('/' + PANEL.route.restart)) return json({ ok: true, result: PANEL.status.starting })
    return json({ error: 'not found' }, { status: PANEL.notFound })
  }
  const page = createBrowserSandbox({ lang, baseURI: PANEL.baseURI, fetch: browserFetch })
  const { registrations } = page
  page.run(readFileSync(PANEL.panelClient, 'utf8'), PANEL.panelClient)
  // The default bundle loader inserts a <script> for the chunk: currentScript names its URL.
  page.run(readFileSync(PANEL.instanceClient, 'utf8'), PANEL.chunk, PANEL.chunkURL)

  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const modules = { [PANEL.modules.react]: React, [PANEL.modules.reactDom]: { createPortal: (node) => node }, [PANEL.modules.primitives]: fakePrimitives(React) }
  const chunk = { exports: undefined, requests: [] }
  const requireFor = () => Object.assign((name) => {
    if (!(name in modules)) throw new Error('unexpected require ' + name)
    return modules[name]
  }, {
    async: async (spec) => {
      chunk.requests.push(spec)
      const entry = registrations.find((r) => r.chunk === spec.replace(/^\.\//, ''))
      if (!entry) throw new Error('no registered chunk for ' + spec)
      chunk.exports ??= entry.factory(requireFor())
      return chunk.exports
    },
  })
  const main = registrations.find((r) => r.chunk === undefined && r.id === PANEL.moduleId)
  if (!main) throw new Error('the panel did not register ' + PANEL.moduleId)
  const plugin = main.factory(requireFor())

  const dictionaries = new Map()
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = dicts?.[lang]?.[key] ?? dicts?.en?.[key] ?? key
    return params && typeof template === 'string' ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  const locale = {
    register(ns, dicts) { dictionaries.set(ns, dicts); shim.rerender(); return () => { dictionaries.delete(ns) } },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => ({ active: lang, revision: 0 }),
    getLocale: () => ({ active: lang, revision: 0 }),
    subscribe: () => () => {},
  }
  const slotEntries = []
  const panelInfo = { value: { activePanelId: PANEL.moduleId } }
  const disposers = []
  const ctx = {
    locale,
    layout: {
      panelInfo: { getSnapshot: () => panelInfo.value, subscribe: () => () => {} },
      selectPanel(id) { panelInfo.value = { activePanelId: id } },
      toggleSidebar() {},
    },
    slots: {
      register(options, Component) { const entry = { options, Component }; slotEntries.push(entry); return () => { const at = slotEntries.indexOf(entry); if (at >= 0) slotEntries.splice(at, 1) } },
      inject(_name, fn) { const dispose = fn(); return () => { if (typeof dispose === 'function') dispose() } },
      entries: () => [],
      getVersion: () => 0,
      subscribe: () => () => {},
    },
    get: () => undefined,
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
  }
  plugin.apply(ctx)
  t.after(() => {
    try { shim.unmountRoot('panel') } catch { /* already gone */ }
    for (const dispose of disposers.reverse()) { try { dispose() } catch { /* already gone */ } }
    page.clearTimers()
  })
  await settle()
  const panel = slotEntries.find((entry) => entry.options.name === PANEL.panelSlot)
  if (!panel) throw new Error('the panel registered no ' + PANEL.panelSlot + ' entry')
  shim.mount('panel', () => React.createElement(panel.Component, {}))
  await settle()
  return {
    fetches, chunk, slotEntries,
    tree: () => shim.tree(),
    all: () => findAll(shim.tree(), () => true),
    byAttr: (name) => findAll(shim.tree(), (node) => node.props[name] !== undefined && node.props[name] !== false),
    text: (node) => textOf(node),
    /** Press a button the way a user would and let the page settle. */
    async press(node) {
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settle()
    },
  }
}
