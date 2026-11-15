/**
 * A scripted Plugins page for the connector's own settings page (`packages/dsh-connector/client.js`).
 * No browser: the repo's existing harness parts are reused, as the R-EMBED and R-CORE pages do:
 * - support/browser-sandbox.mjs: the classic script runs in a node:vm page with
 *   `window.__ModuleLoader__`; `document.createElement`, `head`/`body` appends and
 *   `adoptedStyleSheets` are watched here, so a global style is observable;
 * - support/rp-recommend.mjs: the React shim (hooks, effects, re-render) and tree queries;
 * - fishball-core/package/page.mjs `pageServices`: the `slots` and `locale` page services;
 * - the SDK's own cordis `Context` applies the client plugin with its declared `inject`.
 * Scripted here: `configForms` (whileServed records its namespaces), the primitives (Button,
 * Modal, Switch follow their props: Modal renders nothing unless open, and exposes `onClose`), the
 * clipboard, and the Plugins page's owner props `{view, form: {state, mutate}}` over the tokens
 * world's settings document (mutate's `set ['tokens']` is the user's save: world.save).
 * The page's `fetch` goes to the real routes over the real registry (subject.mjs).
 *
 * LIMIT: not React's reconciler and not a DOM; interactions call the rendered elements' handlers.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { byAttr, createReactShim, textOf } from '../../../support/rp-recommend.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { eventually } from '../tokens/world.mjs'
import { CLIENT, FIXTURE, SUBJECT } from './constants.mjs'
import { clientSource, send } from './subject.mjs'

const settle = async () => { for (let i = 0; i < FIXTURE.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }

/** Button, Modal and Switch as their props say; any other export is a plain element. */
function primitives(React) {
  const h = React.createElement
  const known = {
    Button: ({ children, ...rest }) => h('button', { [CLIENT.primitiveAttr]: 'Button', ...rest }, children),
    Switch: ({ checked, onChange, ...rest }) => h('input', { [CLIENT.primitiveAttr]: 'Switch', type: 'checkbox', checked, onChange: (e) => onChange?.(typeof e === 'boolean' ? e : !checked), ...rest }),
    // A Modal the caller renders with `open: false` draws nothing; one rendered without `open` is open.
    Modal: ({ open, children, footer, title, ...rest }) => (open === false ? null : h('div', { [CLIENT.primitiveAttr]: CLIENT.modal, ...rest }, title ?? null, children, footer ?? null)),
  }
  const cache = new Map()
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return proxy
      if (name in known) return known[name]
      if (!cache.has(name)) cache.set(name, ({ children, ...rest }) => h('div', { [CLIENT.primitiveAttr]: name, ...rest }, children))
      return cache.get(name)
    },
  })
  return proxy
}

/** A tree without functions, as text: what a reader of the page could ever see in it. */
export const treeText = (tree) => JSON.stringify(tree)

/**
 * Loads client.js into a scripted page and applies it.
 * @param t - node:test context (cleanup).
 * @param options.sdk - the SDK whose cordis applies the plugin.
 * @param options.world - a tokens world (../tokens/world.mjs) whose registry the routes serve.
 * @param options.routes - the settings-page routes over that registry.
 */
export async function openTokensPage(t, { sdk, world, routes }) {
  const errors = []
  const requests = []
  const clipboard = []
  const created = { tags: [], appended: [] }
  const pageConsole = { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn: () => {}, log: () => {}, info: () => {}, debug: () => {} }
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), FIXTURE.baseURI)
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const body = init.body === undefined ? undefined : String(init.body)
    requests.push({ method, url: url.href, body })
    const answer = await send(routes, url.href, { method, body, headers: init.headers })
    return new Response(answer.text, { status: answer.status, headers: answer.headers })
  }
  const page = createBrowserSandbox({ lang: FIXTURE.lang, baseURI: FIXTURE.baseURI, fetch: pageFetch, console: pageConsole })
  const { document } = page
  const createElement = document.createElement
  document.createElement = (tag, ...rest) => { created.tags.push(String(tag).toLowerCase()); return createElement(tag, ...rest) }
  for (const target of [document.head, document.body]) for (const m of ['append', 'appendChild']) {
    const original = target[m]
    target[m] = (...nodes) => { created.appended.push(...nodes); return original.apply(target, nodes) }
  }
  page.sandbox.navigator.clipboard = { writeText: async (text) => { clipboard.push(text) } }
  page.window.navigator = page.sandbox.navigator

  page.run(clientSource(), SUBJECT.client)
  assert.equal(page.registrations.length, 1, '__ModuleLoader__.load calls: ' + page.registrations.length)
  const [definition] = page.registrations
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const required = []
  const modules = { [CLIENT.requires[0]]: React, [CLIENT.requires[1]]: primitives(React) }
  const plugin = definition.factory((spec) => {
    required.push(spec)
    if (!(spec in modules)) throw new Error('client.js required ' + JSON.stringify(spec))
    return modules[spec]
  })

  const services = pageServices(shim, FIXTURE.lang)
  const registrations = []
  const slots = {
    ...services.slots,
    register(options, Component) {
      const record = { options, Component, disposed: false }
      registrations.push(record)
      const dispose = services.slots.register(options, Component)
      return () => { record.disposed = true; dispose() }
    },
  }
  const dictionaries = []
  const locale = { ...services.locale, register(ns, dicts) { dictionaries.push({ ns, dicts }); return services.locale.register(ns, dicts) } }
  const served = []
  const configForms = {
    whileServed(namespaces, register) { served.push([...namespaces]); const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } },
    get: () => ({ getSnapshot: () => snapshot(), subscribe: () => () => {}, mutate, set: async () => false, dispose() {} }),
  }
  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', slots)
  root.provide('locale', locale)
  root.provide('configForms', configForms)
  const fiber = root.plugin(plugin.default ?? plugin)
  await settle()

  // The Plugins page's host-owned form over the world's settings document.
  let revision = FIXTURE.revision
  const mutations = []
  function snapshot() {
    return { status: 'ready', value: { [CLIENT.tokensField]: world.doc.tokens }, base: undefined, user: undefined, revision, writable: true }
  }
  async function mutate(ops, expected) {
    // The page's arrays come from the vm realm (another Array.prototype), so they are recorded as
    // plain data of this realm: deepStrictEqual compares prototypes, which is not what a case asserts.
    mutations.push({ ops: JSON.parse(JSON.stringify(ops)), expected })
    let accepted = true
    for (const op of ops) {
      if (op.op !== CLIENT.setOp || op.path?.[0] !== CLIENT.tokensField) continue
      const result = await world.save(op.value)
      accepted &&= result?.ok === true
    }
    await world.settled()
    revision += 1
    shim.rerender()
    return accepted
  }

  let mounted = 0
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    await fiber.dispose?.()
  })
  const pageApi = {
    definition, plugin, required, registrations, dictionaries, served, errors, requests, clipboard, created, mutations, document,
    /** The page entry of the slot key (CLIENT.slotKey). */
    entry: () => registrations.find((r) => !r.disposed && r.options.name === CLIENT.slot && r.options.key === CLIENT.slotKey),
    /** Renders the page entry in a new root, as the Plugins page opens it; returns its tree reader. */
    async open(view = CLIENT.view.page) {
      const entry = pageApi.entry()
      assert.ok(entry, `no ${CLIENT.slot} entry with key ${CLIENT.slotKey}`)
      const key = 'page-' + ++mounted
      shim.mount(key, () => React.createElement(entry.Component, { view, form: { state: snapshot(), mutate } }))
      await settle()
      const tree = () => shim.treeOf(key)
      return {
        key, tree,
        text: () => textOf({ children: tree() }),
        /** What a reader sees in `node`: its text plus the values its text fields display. */
        shown: (node) => [textOf(node), ...byAttr([node], 'value').map((n) => String(n.props.value))].join('\n'),
        find: (attr, value) => byAttr(tree(), attr, value),
        one(attr, value) {
          const found = byAttr(tree(), attr, value)
          assert.equal(found.length, 1, `elements with ${attr}${value === undefined ? '' : '=' + value}: ${found.length}`)
          return found[0]
        },
        modal: () => byAttr(tree(), CLIENT.primitiveAttr, CLIENT.modal),
        close: () => shim.unmountRoot(key),
      }
    },
    settle,
    /** Waits (polling) until `predicate` holds, re-rendering as async answers land. */
    until: async (predicate) => { await eventually(async () => { await settle(); return predicate() }); return predicate() },
  }
  return pageApi
}

/** Calls an element's handler as a user's input would. */
export function input(node, value) {
  const event = { target: { value }, currentTarget: { value }, preventDefault() {}, stopPropagation() {} }
  ;(node.props.onChange ?? node.props.onInput)?.(event)
}
export function click(node) {
  node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
}
