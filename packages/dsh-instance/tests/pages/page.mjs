/**
 * The instance's browser half on a scripted DSH page, for the pages area: client.js runs unread with
 * its three chunks (client.status.js, client.models.js, client.fishball.js) on the helpers' page
 * parts (browser sandbox, DSH's module table, the SDK's own Cordis, the hook shim, primitivesFor
 * with the faithful Modal stand-in).
 *
 * Why not '@dsh-instance/test-helpers/page' openPage as it is: the status line re-reads the status
 * once a second only while the page is visible (client.status.js STATUS_UI.pollMs, conn-OQ-25), so
 * the cadence is itself behaviour and needs an injected clock, and visibility needs `document.hidden`;
 * openPage exposes neither, and its `until` has a deadline. This opener adds exactly those three
 * (a page clock, `setHidden`, an `until` with no deadline) and is otherwise openPage.
 *
 * Root services the page declares (package.json dsh.client.inject and the plugins' inject):
 * `slots`, `locale` (helpers pageServices), `configForms` (one ConfigForm and DSH's `whileServed`,
 * dsh-client-ui-settings README "Following served namespaces") and `remote`
 * (`pluginManager.listBundles` → `{ok, value: BundleInfo[]}`, `$on`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '@dsh-instance/test-helpers/browser-sandbox'
import { applyPlugins, moduleTable } from '@dsh-instance/test-helpers/client-graph'
import { PAGE } from '@dsh-instance/test-helpers/constants'
import { configForm, pageServices, settle } from '@dsh-instance/test-helpers/page'
import { primitivesFor } from '@dsh-instance/test-helpers/primitives'
import { createReactShim, findAll } from '@dsh-instance/test-helpers/react-shim'
import { cordisOf } from '@dsh-instance/test-helpers/sdk'
import { turn } from '@dsh-instance/test-helpers/wait'
import { PACKAGE_DIR } from '../support/instance.mjs'
import { PAGE_UI } from './constants.mjs'

/**
 * A page clock: the page's setTimeout/setInterval run only when `tick` moves it. After each timer
 * fires the page settles, so a read the timer started is answered before the next timer fires,
 * as it is on a real page where a second is far longer than a local answer.
 */
export function pageClock(settleAll) {
  let now = 0
  let seq = 0
  const timers = new Map()
  const add = (fn, ms, every, args) => { const id = ++seq; timers.set(id, { fn, at: now + Math.max(0, Number(ms) || 0), every, args }); return id }
  return {
    setTimeout: (fn, ms, ...args) => add(fn, ms, null, args),
    setInterval: (fn, ms, ...args) => add(fn, ms, Math.max(1, Number(ms) || 0), args),
    clear: (id) => { timers.delete(id) },
    clearAll: () => timers.clear(),
    pending: () => timers.size,
    /** Move the clock by `ms`, firing every timer due on the way, in order. */
    async tick(ms) {
      const end = now + ms
      for (;;) {
        let next
        for (const [id, timer] of timers) if (timer.at <= end && (next === undefined || timer.at < timers.get(next).at)) next = id
        if (next === undefined) break
        const timer = timers.get(next)
        now = timer.at
        if (timer.every === null) timers.delete(next)
        else timer.at += timer.every
        timer.fn(...timer.args)
        await settleAll()
      }
      now = end
      await settleAll()
    },
  }
}

/**
 * Open the scripted page.
 * @param options.sdk - the SDK whose Cordis applies the plugins and whose bundle gives the form logic.
 * @param options.lang - the page language.
 * @param options.respond - `(request) => Response | Promise<Response>` for the page's fetch.
 * @param options.mainBundles - BundleInfo[] that DSH's own listBundles answers.
 * @param options.served - whether the Host serves the instance's settings namespace (default true).
 */
export async function openInstancePage(t, { sdk, lang = 'en', respond, mainBundles = [], served = true }) {
  const requests = []
  const errors = []
  const loads = new Set()
  let shim
  const settleAll = async () => { await settle(); while (loads.size > 0) { await Promise.allSettled([...loads]); await settle() } }
  const clock = pageClock(settleAll)
  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), PAGE_UI.base)
    const method = String(init.method ?? 'GET').toUpperCase()
    const request = { method, path: url.pathname, search: url.search, body: init.body === undefined ? undefined : String(init.body), headers: init.headers ?? {} }
    requests.push(request)
    return respond ? respond(request) : new Response('', { status: 404 })
  }
  const pageConsole = { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn() {}, log() {}, info() {}, debug() {} }
  const page = createBrowserSandbox({ lang, baseURI: PAGE_UI.base, fetch: pageFetch, console: pageConsole })
  // The injected clock replaces the page's timers; crypto is a browser global the install dialog uses.
  Object.assign(page.sandbox, { setTimeout: clock.setTimeout, setInterval: clock.setInterval, clearTimeout: clock.clear, clearInterval: clock.clear, crypto: globalThis.crypto })
  shim = createReactShim({ stale() {} })
  const { React } = shim
  const reactDomClient = { createRoot: () => ({ render() {}, unmount() {} }) }
  const platform = {
    [PAGE.platform.react]: React,
    [PAGE.platform.reactDom]: { createPortal: (node) => node, ...reactDomClient },
    [PAGE.platform.reactDomClient]: reactDomClient,
    [PAGE.platform.primitives]: primitivesFor(sdk, React, { modal: true }),
  }
  const run = (file) => { const at = path.join(PACKAGE_DIR, file); page.run(fs.readFileSync(at, 'utf8'), at, pathToFileURL(at).href) }
  run(PAGE_UI.entry)
  const graph = [{ id: PAGE_UI.id, rev: 'test' }]
  const table = moduleTable({ page, platform, graph, loadChunk: (_owner, file) => { const load = Promise.resolve().then(() => run(file)); loads.add(load); load.finally(() => loads.delete(load)).catch(() => {}); return load } })
  const services = pageServices(shim, lang)
  const form = configForm({ enabled: true })
  const configForms = {
    get: () => form,
    whileServed(namespaces, register) {
      if (!served) return () => {}
      const dispose = register(new Set(namespaces))
      return () => { if (typeof dispose === 'function') dispose() }
    },
  }
  const remoteListeners = new Map()
  const remote = {
    pluginManager: { listBundles: async () => ({ ok: true, value: structuredClone(mainBundles) }) },
    $on(name, listener) {
      const list = remoteListeners.get(name) ?? new Set()
      remoteListeners.set(name, list)
      list.add(listener)
      return () => list.delete(listener)
    },
  }
  const Context = await cordisOf(sdk)
  const root = new Context()
  root.provide('slots', services.slots)
  root.provide('locale', services.locale)
  root.provide('configForms', configForms)
  root.provide('remote', remote)
  const plugins = applyPlugins(root, graph, table, errors)
  await settleAll()
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    clock.clearAll()
    for (const p of plugins.reverse()) await p.fiber.dispose?.()?.catch?.(() => {})
  })
  const api = {
    shim, React, requests, errors, services, clock, document: page.document,
    settle: settleAll,
    /** Move the page clock by `ms`. */
    tick: (ms) => clock.tick(ms),
    /** The page becomes hidden or visible (document.hidden), as a browser tab does. */
    setHidden(hidden) { page.document.hidden = hidden; page.document.visibilityState = hidden ? 'hidden' : 'visible' },
    /** Every slot name with at least one registered entry. */
    slotNames: () => [...services.entries.entries()].filter(([, list]) => list.length > 0).map(([name]) => name).sort(),
    entriesOf: (name) => services.entries.get(name) ?? [],
    /** Mount one slot entry with `props` under `key`; returns the reader of its rendered tree. */
    async mount(key, entry, props = {}) {
      shim.mount(key, () => React.createElement(entry.Component, props))
      await settleAll()
      return () => shim.treeOf(key)
    },
    unmount: async (key) => { shim.unmountRoot(key); await settleAll() },
    find: (nodes, predicate) => findAll(nodes, predicate),
    /** Click as a user does; a disabled control takes no click. */
    async press(node) {
      if (!node) throw new Error('nothing to press')
      if (node.props.disabled) return
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settleAll()
    },
    /** Tick or untick a checkbox input as a user does (its change event carries the new value). */
    async toggle(input) {
      if (!input) throw new Error('no checkbox')
      if (input.props.disabled) return
      input.props.onChange?.({ target: { checked: !input.props.checked }, currentTarget: input })
      await settleAll()
    },
    /** Settle until `predicate` holds; no deadline, so a condition that never comes shows as a hang. */
    async until(predicate) {
      for (;;) { await settleAll(); const value = predicate(); if (value) return value; await turn() }
    },
  }
  return api
}
