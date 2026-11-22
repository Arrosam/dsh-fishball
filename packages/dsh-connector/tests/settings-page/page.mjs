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
import { createBrowserSandbox } from '../../../../test/support/browser-sandbox.mjs'
import { byAttr, createReactShim, textOf } from '../../../../test/support/rp-recommend.mjs'
import { BOOT, runtimeOf } from '../../../../test/v3/fishball-core/package/constants.mjs'
import { pageServices } from '../../../../test/v3/fishball-core/package/page.mjs'
import { eventually } from '../tokens/world.mjs'
import { CLIENT, FIXTURE, ROUTE, SUBJECT } from './constants.mjs'
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
  // Each component keeps its export name (displayName), so a case can tell which primitive an
  // element prop such as a Button's `icon` holds, as DSH's own component names would.
  for (const [name, component] of Object.entries(known)) component.displayName = name
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return proxy
      if (name in known) return known[name]
      if (!cache.has(name)) cache.set(name, Object.assign(({ children, ...rest }) => h('div', { [CLIENT.primitiveAttr]: name, ...rest }, children), { displayName: name }))
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
 * @param options.lang - the page language (default FIXTURE.lang).
 * @param options.settings - the row's other settings at the start (R-FIX-CUI: `approval`, the
 *   limits), held by the host form beside `tokens`; `set` / `unset` ops on them are applied.
 * @param options.answerState - R-FIX-CUI: `(n) => Promise<Response> | undefined` answers the n-th
 *   (1-based) GET state itself (a held, failed or changed read); undefined leaves it to the routes.
 */
export async function openTokensPage(t, { sdk, world, routes, lang = FIXTURE.lang, settings = {}, answerState, beforeSave, dshForms = false }) {
  const errors = []
  const requests = []
  const clipboard = []
  const created = { tags: [], appended: [] }
  const pageConsole = { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn: () => {}, log: () => {}, info: () => {}, debug: () => {} }
  let stateReads = 0
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), FIXTURE.baseURI)
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const body = init.body === undefined ? undefined : String(init.body)
    requests.push({ method, url: url.href, body })
    if (url.pathname === ROUTE.state) stateReads += 1
    const scripted = url.pathname === ROUTE.state ? answerState?.(stateReads) : undefined
    if (scripted !== undefined) return scripted
    const answer = await send(routes, url.href, { method, body, headers: init.headers })
    return new Response(answer.text, { status: answer.status, headers: answer.headers })
  }
  const page = createBrowserSandbox({ lang, baseURI: FIXTURE.baseURI, fetch: pageFetch, console: pageConsole })
  const { document } = page
  // R-FIX-CUI: the document's listeners are kept, so `setHidden` can fire a visibilitychange.
  const docListeners = new Map()
  document.addEventListener = (type, fn) => { if (!docListeners.has(type)) docListeners.set(type, new Set()); docListeners.get(type).add(fn) }
  document.removeEventListener = (type, fn) => { docListeners.get(type)?.delete(fn) }
  const setHidden = async (hidden) => {
    document.hidden = hidden
    document.visibilityState = hidden ? CLIENT.visibility.hidden : CLIENT.visibility.visible
    for (const fn of [...(docListeners.get(CLIENT.visibility.event) ?? [])]) fn({ type: CLIENT.visibility.event })
    await settle()
  }
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
  // client.js loads its marks chunk with require.async (DESIGN.md §28). These rows test the settings
  // page only, and the marks part needs services this page does not provide, so the chunk is a stub
  // that registers nothing: the page must still be the only registration and locale namespace.
  const marksStub = async () => ({ marksPart: () => ({ name: 'dsh-connector-marks-stub', inject: [], apply() {} }) })
  const require = (spec) => {
    required.push(spec)
    if (!(spec in modules)) throw new Error('client.js required ' + JSON.stringify(spec))
    return modules[spec]
  }
  require.async = marksStub
  const plugin = definition.factory(require)

  const services = pageServices(shim, lang)
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
  /**
   * `dshForms`: `configForms.get` answers a form object shaped as DSH's own ConfigFormController
   * (dsh-client-ui-settings): class methods that read their own fields through `this`, so a page that
   * calls them detached from the object fails as it does in a real DSH. Otherwise a plain object of
   * closures.
   */
  class HostForm {
    #listeners = new Set()
    getSnapshot() { return formSnapshot() }
    subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener) }
    mutate(ops, expected) { return mutate(ops, expected) }
    set() { return Promise.resolve(false) }
    dispose() {}
  }
  const configForms = {
    whileServed(namespaces, register) { served.push([...namespaces]); const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } },
    get: () => (dshForms ? new HostForm() : { getSnapshot: formSnapshot, subscribe: () => () => {}, mutate, set: async () => false, dispose() {} }),
  }
  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', slots)
  root.provide('locale', locale)
  root.provide('configForms', configForms)
  const fiber = root.plugin(plugin.default ?? plugin)
  await settle()

  // The Plugins page's host-owned form over the world's settings document. `others` holds the row's
  // other settings (R-FIX-CUI); a mutate whose expected revision is not the live one is refused and
  // changes nothing, as DSH's settings service fences it (the dev session, 2026-11-18: the page never
  // relies on a stale revision being accepted).
  let revision = FIXTURE.revision
  const others = structuredClone(settings)
  const mutations = []
  let recovery
  function formSnapshot() { return recovery?.previous ?? snapshot() }
  function snapshot() {
    return { status: 'ready', value: { ...structuredClone(others), [CLIENT.tokensField]: world.doc.tokens }, base: undefined, user: undefined, revision, writable: true }
  }
  /** One `set` / `unset` op on `others` (a path below `tokens` is the world's). */
  function applyOther(op) {
    const parent = op.path.slice(0, -1).reduce((node, key) => (node[key] ??= {}), others)
    if (op.op === CLIENT.setOp) parent[op.path.at(-1)] = op.value
    else delete parent[op.path.at(-1)]
  }
  async function mutate(ops, expected) {
    // The page's arrays come from the vm realm (another Array.prototype), so they are recorded as
    // plain data of this realm: deepStrictEqual compares prototypes, which is not what a case asserts.
    const plain = JSON.parse(JSON.stringify(ops))
    mutations.push({ ops: plain, expected, liveRevision: revision })
    // A real host can be slow or offline before it checks the revision and persists.
    if (beforeSave) await beforeSave()
    if (expected !== undefined && expected !== revision) return false
    let accepted = true
    for (const op of plain) {
      if (op.path?.[0] !== CLIENT.tokensField) { applyOther(op); continue }
      if (op.op !== CLIENT.setOp) continue
      const result = await world.save(op.value)
      accepted &&= result?.ok === true
    }
    await world.settled()
    revision += 1
    // Without a write reply the form keeps its previous snapshot until recovery reads the host.
    const acknowledged = !recovery && accepted
    if (recovery) { await recovery.reread; recovery = undefined }
    shim.rerender()
    return acknowledged
  }
  /** Another editor (another tab) saves `ops` at the live revision: the page re-renders with it. */
  async function external(ops) {
    for (const op of ops) applyOther(op)
    revision += 1
    shim.rerender()
    await settle()
  }

  let mounted = 0
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    await fiber.dispose?.()
  })
  const pageApi = {
    definition, plugin, required, registrations, dictionaries, served, errors, requests, clipboard, created, mutations, document, external, setHidden,
    /** The page's window and the sandbox's own timers' cleanup (R-FIX-CUI: visibility, unmount). */
    window: page.window,
    stateReads: () => stateReads,
    loseNextSaveReply(reread) { recovery = { previous: snapshot(), reread } },
    formValue: () => formSnapshot().value,
    /** The host form's live value and revision (what a save changed). */
    value: () => snapshot().value,
    revision: () => revision,
    /** The page entry of the slot key (CLIENT.slotKey). */
    entry: () => registrations.find((r) => !r.disposed && r.options.name === CLIENT.slot && r.options.key === CLIENT.slotKey),
    /**
     * Renders the page entry in a new root, as the Plugins page opens it; returns its tree reader.
     * `ownerForm: false` renders it as DSH's plugin manager does for a bundle page: props `{view}`
     * only, so the page must use its own `configForms` form.
     */
    async open(view = CLIENT.view.page, { ownerForm = true } = {}) {
      const entry = pageApi.entry()
      assert.ok(entry, `no ${CLIENT.slot} entry with key ${CLIENT.slotKey}`)
      const key = 'page-' + ++mounted
      shim.mount(key, () => React.createElement(entry.Component, ownerForm ? { view, form: { state: formSnapshot(), mutate } } : { view }))
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