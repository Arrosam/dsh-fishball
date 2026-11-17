/**
 * A scripted Plugins page for the instance's own settings page (dsh-instance client.js and its two
 * chunks, client.status.js and client.models.js). No browser.
 *
 * What is real: the three client scripts, run unread as DSH's module loader runs them
 * (support/browser-sandbox.mjs, the module table of ../../contract/package-boundaries/client-graph.mjs);
 * the SDK's own Cordis `Context`, which applies the plugin with its declared `inject`; DSH's own
 * `SettingsFormModel` (../../fishball-core/settings/primitives.mjs, cut from the SDK's web bundle);
 * and the instance's own host routes the page calls (`registerInstanceRoutes` and
 * `registerProviderSyncRoutes`), registered on a fake Fetch registry over a scripted service.
 *
 * What is scripted: React (the hook shim of support/rp-recommend.mjs); the page services `slots`,
 * `locale` (../../fishball-core/package/page.mjs pageServices) and `configForms` (one served
 * namespace, the instance row's `{enabled, targetUrl}`); the primitives: the F-SETTINGS stand-ins,
 * with `Button` keeping the variant it was given (`data-fbtest-variant`, a harness handle) and
 * `Checkbox` a checkbox input whose `onChange` gets the new boolean, as DSH's own Checkbox gives it.
 *
 * Observation points: the rendered page tree, every request the page sent, the scripted service's
 * calls (retry, the sync check and add with their bodies).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { primitivesFor as settingsPrimitives } from '../../fishball-core/settings/primitives.mjs'
import { PAGE, PAGE_POLISH as P } from './constants.mjs'
import { routesModule, instanceModule } from './subject.mjs'

const settle = async () => { for (let i = 0; i < P.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** The instance row's id: its settings namespace and its module id (the slot key's two halves). */
const ROW = V3.instance.name

/** The page's primitives: the F-SETTINGS stand-ins, Button and Checkbox as their props say. */
function primitives(sdk, React) {
  const h = React.createElement
  const base = settingsPrimitives(sdk, React)
  const own = {
    Button: function Button({ children, variant, size, icon, ...rest }) { return h('button', { type: 'button', [P.primitiveAttr]: 'Button', [P.variantAttr]: variant, ...rest }, icon ?? null, children) },
    Checkbox: function Checkbox({ checked, onChange, label, disabled, ...rest }) {
      return h('label', { [P.primitiveAttr]: P.checkbox }, h('input', { type: 'checkbox', checked, disabled, onChange: () => onChange?.(!checked), ...rest }), label)
    },
  }
  return new Proxy({}, { get: (_t, name) => (Object.hasOwn(own, name) ? own[name] : base[name]) })
}

/**
 * The instance's host routes over a scripted service: `status` answers `{state, code}` from
 * `world.status`; Retry counts and moves `failed` to `starting`; the sync check answers P.check and
 * Add records its body.
 */
async function hostRoutes(sdk, world) {
  const { registerInstanceRoutes } = await routesModule(sdk)
  const { registerProviderSyncRoutes } = await instanceModule(sdk, 'syncRoutes', 'registerProviderSyncRoutes')
  const routes = []
  const ctx = {
    connection: { fetch: { register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1) } } }, requestRejection: () => undefined },
    effect(fn) { return fn() },
    on: () => () => {},
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  }
  const service = {
    status: () => ({ ...world.status, detail: null }),
    notice: () => null,
    async retry() { world.calls.retry += 1; if (world.status.state === P.failed) world.status = { state: 'starting', code: null } },
    async reconnect() { world.calls.reconnect += 1; return { ok: true } },
    async open() { return { ok: false, code: 'not-ready' } },
    providerSync: {
      status: () => ({ state: P.ready }),
      async check() { world.calls.check += 1; return { ok: true, result: structuredClone(P.check) } },
      async add(request) { world.calls.add.push(structuredClone(request)); return { ok: true, result: { items: request.ids.map((id) => ({ id, outcome: 'added' })) } } },
    },
  }
  registerInstanceRoutes(ctx, service)
  registerProviderSyncRoutes(ctx, service)
  return routes
}

/** The instance row's ConfigForm (dsh-client-ui-settings config-form.d.ts): one served namespace. */
function configForm(value) {
  const listeners = new Set()
  let snapshot = Object.freeze({ status: 'ready', value, base: value, user: {}, revision: 1, writable: true })
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    async mutate() { snapshot = Object.freeze({ ...snapshot, revision: snapshot.revision + 1 }); for (const fn of [...listeners]) fn(); return true },
  }
}

/**
 * Open the instance's settings page.
 * @param options.state - the status route's state (P.states); `code` its code.
 * @param options.lang - `en` or `zh`.
 */
export async function openInstancePage(t, sdk, { state = P.ready, code = null, lang = P.langs[0] } = {}) {
  const world = { status: { state, code }, calls: { retry: 0, reconnect: 0, check: 0, add: [] }, requests: [], errors: [] }
  const routes = await hostRoutes(sdk, world)
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), P.base)
    const method = String(init.method ?? 'GET').toUpperCase()
    world.requests.push({ method, path: url.pathname, body: init.body === undefined ? undefined : String(init.body) })
    const route = routes.find((r) => r.path === url.pathname && (r.methods ?? []).includes(method))
    if (!route) return new Response('', { status: 404 })
    const headers = { ...(init.headers ?? {}), host: url.host, 'sec-fetch-site': 'same-origin' }
    return route.fetch(new Request(url, { method, headers, ...(method === 'GET' ? {} : { body: init.body ?? '' }) }))
  }
  const pageConsole = { ...console, error: (...a) => world.errors.push(a.map(String).join(' ')), warn() {}, log() {}, info() {}, debug() {} }
  const page = createBrowserSandbox({ lang, baseURI: P.base, fetch: pageFetch, console: pageConsole })
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const platform = { [BOOT.platform.react]: React, [BOOT.platform.primitives]: primitives(sdk, React) }
  const run = (file) => { const at = path.join(V3.instance.dir, file); page.run(fs.readFileSync(at, 'utf8'), at, pathToFileURL(at).href) }
  run(PAGE.entry)
  const graph = [{ id: ROW, rev: 'fbtest' }]
  const loads = new Set()
  const table = moduleTable({ page, platform, graph, loadChunk: (_owner, file) => { const load = Promise.resolve().then(() => run(file)); loads.add(load); load.finally(() => loads.delete(load)).catch(() => {}); return load } })
  const services = pageServices(shim, lang)
  const form = configForm({ enabled: true, targetUrl: '' })
  const configForms = { get: () => form, whileServed(_ns, register) { const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } } }
  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', services.slots)
  root.provide('locale', services.locale)
  root.provide('configForms', configForms)
  const plugins = applyPlugins(root, graph, table, world.errors)
  const settleAll = async () => { await settle(); while (loads.size > 0) { await Promise.allSettled([...loads]); await settle() } }
  await settleAll()
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
  })
  const entry = services.entries.get(PAGE.slot)?.find((e) => e.options.key === `${ROW}#${ROW}`)
  assert.ok(entry, `no ${PAGE.slot} entry keyed ${ROW}#${ROW}; errors: ${world.errors.join('; ')}`)
  shim.mount('page', () => React.createElement(entry.Component, { view: 'page' }))
  await settleAll()
  const tree = () => shim.treeOf('page')
  const api = {
    world, tree,
    settle: settleAll,
    text: (node) => (node === undefined ? tree().map(textOf).join(' ') : textOf(node)).replace(/\s+/g, ' ').trim(),
    find: (predicate, nodes = tree()) => findAll(nodes, predicate),
    byAttr: (name, value, nodes = tree()) => findAll(nodes, (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value))),
    /** Waits (polling, re-settling) until `predicate` holds; returns its last value. */
    async until(predicate, ms = P.waitMs) {
      const end = Date.now() + ms
      for (;;) { await settleAll(); const v = predicate(); if (v || Date.now() >= end) return v; await sleep(P.pollMs) }
    },
    /** Click `node` as a user does; a disabled control takes no click, as in a browser. */
    async press(node) {
      assert.ok(node, 'nothing to press')
      if (node.props.disabled) return
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settleAll()
    },
    async toggle(input) { input.props.onChange?.({ target: { checked: !input.props.checked } }); await settleAll() },
  }
  return api
}
