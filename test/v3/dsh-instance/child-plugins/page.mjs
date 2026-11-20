/**
 * A scripted DSH Plugins page for the instance's browser half (client.js with its chunks
 * client.status.js, client.models.js and client.fishball.js), run unread the way DSH's module
 * loader runs them. No browser.
 *
 * Real: the client scripts, DSH's module table (../../contract/package-boundaries/client-graph.mjs)
 * and the SDK's own Cordis `Context`, which applies the plugin with its declared `inject`.
 * Scripted (public seams only): React (support/rp-recommend.mjs hook shim), the primitives
 * (support/set-panel.mjs fakePrimitives: every prop kept), the page services `slots` / `locale`
 * (../../fishball-core/package/page.mjs pageServices), `configForms` (one served namespace),
 * `remote` (`$on` and `pluginManager.listBundles` → `{ok, value: BundleInfo[]}`, DSH's own
 * browser remote shape), and the page's `fetch`, answered per path (the instance's HTTP contract,
 * README "Settings page" / "Plugins for Fishball"; the list answers `{ok, bundles, protected}`,
 * `protected` the names the instance owns, from which the client decides "nothing").
 *
 * Observation points: the rendered tree of a mounted slot entry and every request the page sent.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../../support/set-panel.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { PAGE, PROTECTED, ROUTE } from './constants.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = async () => { for (let i = 0; i < PAGE.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

/** Every visible string of a subtree: text children and the string props a primitive shows (title, description, label…). */
export function wordsOf(nodes) {
  const out = []
  for (const node of [nodes].flat()) {
    if (typeof node === 'string') { out.push(node); continue }
    for (const n of [node, ...findAll(node.children ?? [], () => true)]) {
      for (const [k, v] of Object.entries(n.props ?? {})) if (typeof v === 'string' && !k.startsWith('data-') && !['type', 'variant', 'size', 'role', 'className', 'id'].includes(k)) out.push(v)
      for (const c of n.children ?? []) if (typeof c === 'string') out.push(c)
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * The primitives: support/set-panel.mjs fakePrimitives, plus a stand-in for DSH's form model class
 * `SettingsFormModel` (a class, not a component; the repo's real cut of it,
 * ../../fishball-core/settings/primitives.mjs, cannot load in this split checkout because it needs
 * packages/core). The stand-in keeps the model's face (bind → store, shell, field, actions, dispose)
 * with an idle, saved form: the Restart rows never touch the launch form.
 */
function primitives(React) {
  const base = fakePrimitives(React)
  class SettingsFormModel {
    constructor(scope, fields) { this.scope = scope; this.fields = fields }
    bind(build) { const value = build(); return { getSnapshot: () => value, subscribe: () => () => {}, get: () => value } }
    shell() { return { available: true, dirty: false, invalid: false, saving: false, failed: false, readOnly: false } }
    field() { return { text: '', value: undefined, overridden: false, invalid: false } }
    actions() { return { edit() {}, reset() {}, save: async () => true, discard() {} } }
    dispose() {}
  }
  // A dialog's controls arrive as element props (`footer`, `actions`…); render them after the
  // children, as the real primitive draws them, so the harness can find and press them.
  const cache = new Map()
  const withSlots = (name) => {
    if (!cache.has(name)) {
      const Base = base[name]
      cache.set(name, function Primitive(props) {
        const slots = Object.entries(props).filter(([k, v]) => k !== 'children' && (React.isValidElement(v) || (Array.isArray(v) && v.some(React.isValidElement)))).map(([, v]) => v)
        return slots.length === 0 ? React.createElement(Base, props) : React.createElement(Base, props, props.children, ...slots)
      })
    }
    return cache.get(name)
  }
  return new Proxy({}, { get: (_t, name) => (name === 'SettingsFormModel' ? SettingsFormModel : typeof name === 'string' && name !== 'then' && name !== 'default' && name !== '__esModule' ? withSlots(name) : base[name]) })
}

/**
 * Open the scripted page.
 * @param options.lang - page language.
 * @param options.status - the status route's answer `{state, code, busy?}` (mutable through api.world.status).
 * @param options.mainBundles - DSH's listBundles value (BundleInfo-like rows).
 * @param options.fishball - the Fishball list's bundles (GET ROUTE.list answer's `bundles`).
 */
export async function openPage(t, sdk, { lang = 'en', status = { state: 'ready', code: null }, mainBundles = [], fishball = [] } = {}) {
  const world = { status: { detail: null, notice: null, busy: false, ...status }, mainBundles, fishball, requests: [], errors: [] }
  const answer = (method, pathname, body) => {
    if (pathname === ROUTE.status && method === 'GET') return json(world.status)
    if (pathname === ROUTE.restart && method === 'POST') return json(world.status)
    if (pathname === ROUTE.list && method === 'GET') return json({ ok: true, bundles: world.fishball, protected: [...PROTECTED] })
    if (pathname === ROUTE.use && method === 'POST') return json({ ok: true, name: JSON.parse(body ?? '{}').name, applied: 'restarting' })
    return new Response('', { status: 404 })
  }
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), PAGE.base)
    const method = String(init.method ?? 'GET').toUpperCase()
    const body = init.body === undefined ? undefined : String(init.body)
    world.requests.push({ method, path: url.pathname, body })
    return answer(method, url.pathname, body)
  }
  const pageConsole = { ...console, error: (...a) => world.errors.push(a.map(String).join(' ')), warn() {}, log() {}, info() {}, debug() {} }
  const page = createBrowserSandbox({ lang, baseURI: PAGE.base, fetch: pageFetch, console: pageConsole })
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const platform = {
    [BOOT.platform.react]: React,
    [BOOT.platform.reactDom]: { createPortal: (node) => node },
    [BOOT.platform.reactDomClient]: { createRoot: () => ({ render() {}, unmount() {} }) },
    [BOOT.platform.primitives]: primitives(React),
  }
  const run = (file) => { const at = path.join(V3.instance.dir, file); page.run(fs.readFileSync(at, 'utf8'), at, pathToFileURL(at).href) }
  run(PAGE.entry)
  const graph = [{ id: PAGE.row, rev: 'fbtest' }]
  const loads = new Set()
  const table = moduleTable({ page, platform, graph, loadChunk: (_owner, file) => { const load = Promise.resolve().then(() => run(file)); loads.add(load); load.finally(() => loads.delete(load)).catch(() => {}); return load } })
  const services = pageServices(shim, lang)
  const snapshot = Object.freeze({ status: 'ready', value: { enabled: true }, base: { enabled: true }, user: {}, revision: 1, writable: true })
  const form = { getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async () => true }
  const configForms = { get: () => form, whileServed(_ns, register) { const dispose = register(); return () => { if (typeof dispose === 'function') dispose() } } }
  const remote = new Proxy({}, {
    get(_t, ns) {
      if (typeof ns !== 'string' || ns === 'then') return undefined
      if (ns === '$on') return () => () => {}
      return new Proxy({}, { get(_t2, name) {
        if (typeof name !== 'string' || name === 'then') return undefined
        if (name === 'listBundles') return async () => ({ ok: true, value: structuredClone(world.mainBundles) })
        return async () => ({ ok: false, error: { message: 'not scripted' } })
      } })
    },
  })
  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', services.slots)
  root.provide('locale', services.locale)
  root.provide('configForms', configForms)
  root.provide('remote', remote)
  const plugins = applyPlugins(root, graph, table, world.errors)
  const settleAll = async () => { await settle(); while (loads.size > 0) { await Promise.allSettled([...loads]); await settle() } }
  await settleAll()
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.()?.catch?.(() => {})
  })
  const api = {
    world, shim, services,
    settle: settleAll,
    /** Mount one slot entry under `key` with `props`. */
    async mount(key, Component, props) { shim.mount(key, () => React.createElement(Component, props)); await settleAll(); await sleep(PAGE.pollMs); await settleAll() },
    tree: (key) => shim.treeOf(key),
    find: (key, predicate) => findAll(shim.treeOf(key), predicate),
    byAttr: (key, name) => findAll(shim.treeOf(key), (n) => n.props[name] !== undefined && n.props[name] !== false),
    text: (key) => shim.treeOf(key).map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
    async until(predicate, ms = PAGE.waitMs) {
      const end = Date.now() + ms
      for (;;) { await settleAll(); const v = predicate(); if (v || Date.now() >= end) return v; await sleep(PAGE.pollMs) }
    },
    /** Click as a user does; a disabled control takes no click. */
    async press(node) {
      assert.ok(node, 'nothing to press')
      if (node.props.disabled) return
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settleAll()
    },
  }
  return api
}

/** The instance's settings page entry (its bundle or row configuration slot, keyed by the package name). */
export function settingsEntry(page) {
  for (const slot of PAGE.configSlots) {
    const entry = page.services.entries.get(slot)?.find((e) => String(e.options.key ?? '').startsWith(PAGE.row))
    if (entry) return entry
  }
  assert.fail('no settings entry keyed ' + PAGE.row + ' in ' + PAGE.configSlots.join(' / ') + '; errors: ' + page.world.errors.join('; '))
}

/** The per-plugin detail action entry (plugins.detail.actions). */
export function detailEntry(page) {
  const entry = page.services.entries.get(PAGE.detailSlot)?.[0]
  assert.ok(entry, 'no ' + PAGE.detailSlot + ' entry; errors: ' + page.world.errors.join('; '))
  return entry
}
