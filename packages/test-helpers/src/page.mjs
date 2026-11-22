/**
 * A scripted DSH page for a package's browser half. No browser: the package's classic client scripts
 * run unread in a node:vm page (browser-sandbox.mjs), DSH's module table resolves their `require`
 * and package-local chunks (client-graph.mjs), and the SDK's own Cordis `Context` applies the plugin
 * with its declared `inject`, so a plugin starts only when the services it names are provided.
 *
 * Scripted (public seams only): React (react-shim.mjs), the primitives the caller picks, the page
 * services `slots` and `locale` (pageServices below), any other root service the caller provides, and
 * the page's `fetch` (the caller's `respond(request)`).
 *
 * Observation points: the slot entries the plugins register (mount one with `mountEntry`), every
 * request the page sent, page console errors and plugin failures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from './browser-sandbox.mjs'
import { applyPlugins, moduleTable } from './client-graph.mjs'
import { PAGE } from './constants.mjs'
import { createReactShim, findAll, textOf } from './react-shim.mjs'
import { cordisOf } from './sdk.mjs'

const settleOnce = () => new Promise((resolve) => setImmediate(resolve))
export async function settle(rounds = PAGE.settleRounds) { for (let i = 0; i < rounds; i++) await settleOnce() }

/**
 * The page services `slots` and `locale` as DSH's renderer and locale client expose them
 * (register/inject/entries; register/bind/getLocale/subscribe). `setLang` switches the page language.
 */
export function pageServices(shim, lang) {
  const entries = new Map()
  const bump = () => shim.rerender()
  const slots = {
    register(options, Component) {
      const list = entries.get(options.name) ?? []
      entries.set(options.name, list)
      const entry = { options, Component }
      list.push(entry)
      bump()
      return () => { const at = list.indexOf(entry); if (at >= 0) { list.splice(at, 1); bump() } }
    },
    // The slot is always declared here, so the injection runs once and its effect is disposed with it.
    inject(_name, callback) {
      const effect = callback()
      const disposers = typeof effect === 'function' ? [effect] : effect && typeof effect[Symbol.iterator] === 'function' ? [...effect] : []
      return () => { for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose() }
    },
    entries: (name) => [...(entries.get(name) ?? [])],
    entriesOfSlot: (name) => [...(entries.get(name) ?? [])],
    subscribe: () => () => {},
    getVersion: () => 0,
  }
  const dictionaries = new Map()
  const listeners = new Set()
  const translate = (ns, key, params) => {
    const dicts = dictionaries.get(ns)
    const template = dicts?.[lang]?.[key] ?? dicts?.en?.[key] ?? key
    return params && typeof template === 'string' ? template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : template
  }
  let snapshot = { active: lang, revision: 0 }
  const locale = {
    register(ns, dicts) { dictionaries.set(ns, dicts); bump(); return () => { if (dictionaries.get(ns) === dicts) dictionaries.delete(ns) } },
    bind: (ns) => (key, params) => translate(ns, key, params),
    getSnapshot: () => snapshot,
    getLocale: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    resolveText: (text) => (typeof text === 'string' ? text : text?.[lang] ?? text?.en),
  }
  const setLang = (next) => {
    if (next === lang) return
    lang = next
    snapshot = { active: lang, revision: snapshot.revision + 1 }
    for (const notify of [...listeners]) notify()
    bump()
  }
  return { slots, locale, entries, setLang }
}

/** A ConfigForm (dsh-client-ui-settings) serving one namespace's `value`. */
export function configForm(value) {
  const listeners = new Set()
  let snapshot = Object.freeze({ status: 'ready', value, base: value, user: {}, revision: 1, writable: true })
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    async mutate() { snapshot = Object.freeze({ ...snapshot, revision: snapshot.revision + 1 }); for (const fn of [...listeners]) fn(); return true },
  }
}

/**
 * Open a scripted page.
 * @param t - node:test context (cleanup).
 * @param options.sdk - the SDK whose Cordis applies the plugins.
 * @param options.packageDir - the package folder holding the scripts.
 * @param options.id - the package's module id (its graph entry).
 * @param options.entry - the entry script, relative to packageDir (default client.js).
 * @param options.lang - page language.
 * @param options.base - the document URL.
 * @param options.primitives - `(React) => module` for @deepseek-ai/dsh-client-ui-primitives.
 * @param options.respond - `({method, path, body, headers}) => Response | Promise<Response>`; default 404.
 * @param options.services - `(shim) => ({name: service})`, extra root services (configForms, remote …).
 */
export async function openPage(t, { sdk, packageDir, id, entry = 'client.js', lang = 'en', base = 'http://127.0.0.1:47000/', primitives, respond, services: extraServices = () => ({}) }) {
  const requests = []
  const errors = []
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), base)
    const method = String(init.method ?? 'GET').toUpperCase()
    const request = { method, path: url.pathname, search: url.search, body: init.body === undefined ? undefined : String(init.body), headers: init.headers ?? {} }
    requests.push(request)
    return respond ? respond(request) : new Response('', { status: 404 })
  }
  const pageConsole = { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn() {}, log() {}, info() {}, debug() {} }
  const page = createBrowserSandbox({ lang, baseURI: base, fetch: pageFetch, console: pageConsole })
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const reactDomClient = { createRoot: () => ({ render() {}, unmount() {} }) }
  const platform = {
    [PAGE.platform.react]: React,
    [PAGE.platform.reactDom]: { createPortal: (node) => node, ...reactDomClient },
    [PAGE.platform.reactDomClient]: reactDomClient,
    [PAGE.platform.primitives]: primitives(React),
  }
  const run = (file) => { const at = path.join(packageDir, file); page.run(fs.readFileSync(at, 'utf8'), at, pathToFileURL(at).href) }
  run(entry)
  const graph = [{ id, rev: 'test' }]
  const loads = new Set()
  const table = moduleTable({ page, platform, graph, loadChunk: (_owner, file) => { const load = Promise.resolve().then(() => run(file)); loads.add(load); load.finally(() => loads.delete(load)).catch(() => {}); return load } })
  const services = pageServices(shim, lang)
  const Context = await cordisOf(sdk)
  const root = new Context()
  root.provide('slots', services.slots)
  root.provide('locale', services.locale)
  for (const [name, service] of Object.entries(extraServices(shim))) root.provide(name, service)
  const plugins = applyPlugins(root, graph, table, errors)
  const settleAll = async () => { await settle(); while (loads.size > 0) { await Promise.allSettled([...loads]); await settle() } }
  await settleAll()
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.().catch?.(() => {})
  })
  return {
    shim, React, requests, errors, services,
    settle: settleAll,
    /** Every entry registered on slot `name`. */
    entriesOf: (name) => services.entries.get(name) ?? [],
    /** Mount one slot entry's component with `props` under root key `key`; returns its tree reader. */
    async mountEntry(key, entryOf, props = {}) {
      shim.mount(key, () => React.createElement(entryOf.Component, props))
      await settleAll()
      return () => shim.treeOf(key)
    },
    unmount: async (key) => { shim.unmountRoot(key); await settleAll() },
    find: (nodes, predicate) => findAll(nodes, predicate),
    text: (nodes) => [nodes].flat().map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
    /** Click `node` as a user does; a disabled control takes no click. */
    async press(node) {
      if (!node) throw new Error('nothing to press')
      if (node.props.disabled) return
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settleAll()
    },
    /** Wait (re-settling) until `predicate` holds, with no deadline; returns its value. */
    async until(predicate, pollMs = PAGE.pollMs) {
      for (;;) { await settleAll(); const v = predicate(); if (v) return v; await new Promise((r) => setTimeout(r, pollMs)) }
    },
  }
}

/** A JSON Response. */
export const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

/** Every visible string of a subtree: text children and the string props a primitive shows (title, label …). */
export function wordsOf(nodes) {
  const out = []
  const skip = new Set(['type', 'variant', 'size', 'role', 'className', 'id'])
  for (const node of [nodes].flat()) {
    if (typeof node === 'string') { out.push(node); continue }
    for (const n of [node, ...findAll(node.children ?? [], () => true)]) {
      for (const [k, v] of Object.entries(n.props ?? {})) if (typeof v === 'string' && !k.startsWith('data-') && !skip.has(k)) out.push(v)
      for (const c of n.children ?? []) if (typeof c === 'string') out.push(c)
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}
