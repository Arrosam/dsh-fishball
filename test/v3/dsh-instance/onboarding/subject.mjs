/**
 * Public-seam test harness for the Onboarding test suites (Parts 2, 3, 4).
 * Loads modules bound to the SDK under test without reading implementation internals.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../../support/set-panel.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { memoryWire, routeContext } from '../host/fakes.mjs'
import {
  CHILD_MODEL_CONTRACT,
  FIXTURE,
  HTTP,
  INSTANCE_ROUTES,
  ONBOARDING_ROUTES,
  PORTAL,
  UI_ATTR,
  WATCHDOG_NS,
  WATCHDOG_STATE,
} from './constants.mjs'

export { memoryWire, routeContext }

const TASK = 'ONBOARDING'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = async () => { for (let i = 0; i < FIXTURE.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const jsonResponse = (value, status = HTTP.ok) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const parseJson = (text) => { try { return JSON.parse(text) } catch { return undefined } }

export const at = (relative) => path.join(V3.instance.dir, relative)

async function requireModule(sdk, { task, entry, exports }) {
  assert.ok(fs.existsSync(entry), `${task}: missing module ${entry}`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
  for (const name of exports) {
    assert.ok(name in mod, `${task}: ${path.basename(entry)} must export ${name}`)
  }
  return mod
}

export const nativeConstantsModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: at('src/native-runtime/constants.js'),
  exports: ['CHILD_MODEL', 'ONBOARDING', 'runtimeLimits'],
})

export const childModelModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: at('src/native-runtime/child-model.js'),
  exports: ['normalizeModelSelection', 'sanitizeCatalog', 'createChildModelClient', 'createChildModelReceiver'],
})

export const wireModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: at('src/native-runtime/wire.js'),
  exports: ['Wire'],
})

export const onboardingModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: at('src/host/onboarding.js'),
  exports: ['createOnboarding'],
})

export const onboardingRoutesModule = (sdk) => requireModule(sdk, {
  task: TASK,
  entry: at('src/host/onboarding-routes.js'),
  exports: ['ONBOARDING_ROUTE', 'registerOnboardingRoutes'],
})

/** Scratch temp dir cleaned up automatically on test end. */
export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE.tempPrefix))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** Linked in-memory Duplex stream pair (same stream interface as net.Socket, works in any sandbox). */
function duplexPair() {
  let a
  let b
  a = new Duplex({
    read() {},
    write(chunk, _enc, cb) { b.push(chunk); cb() },
    final(cb) { b.push(null); cb() },
  })
  b = new Duplex({
    read() {},
    write(chunk, _enc, cb) { a.push(chunk); cb() },
    final(cb) { a.push(null); cb() },
  })
  a.on('close', () => { if (!b.destroyed) b.destroy() })
  b.on('close', () => { if (!a.destroyed) a.destroy() })
  return [a, b]
}

/** Real Wire pair over linked Duplex streams (authenticated). */
export async function wirePair(t, sdk) {
  const { Wire } = await wireModule(sdk)
  const { runtimeLimits } = await nativeConstantsModule(sdk)
  const [client, socket] = duplexPair()
  t.after(() => { client.destroy(); socket.destroy() })
  const hostWire = new Wire(client, runtimeLimits())
  const childWire = new Wire(socket, runtimeLimits())
  hostWire.authenticated = true
  childWire.authenticated = true
  return { hostWire, childWire, client, socket }
}

/**
 * Fake DSH child `settings` service matching `@deepseek-ai/dsh-settings` public contract:
 * `describe({ redactSecrets })` -> `{ writable, hasDocument, namespaces: SettingsNamespaceView[] }`
 * `mutate(ns, ops, expectedRevision)` -> updates stored value and increments revision.
 */
export function fakeChildSettings({
  namespacePresent = true,
  initialModel = null,
  revision = 7,
  failMutate = false,
  failDescribe = false,
} = {}) {
  let currentModel = initialModel
  let currentRevision = revision
  const calls = { describe: [], mutate: [] }
  return {
    calls,
    get model() { return currentModel },
    set model(v) { currentModel = v },
    get revision() { return currentRevision },
    async describe(opts) {
      calls.describe.push(opts)
      if (failDescribe) throw new Error('fbtest describe failed')
      return namespacePresent
        ? [{
            ns: CHILD_MODEL_CONTRACT.settingsNamespace,
            autoGenerate: false,
            schema: { type: 'object', dict: { model: { type: 'object' } } },
            value: currentModel === null ? {} : { model: currentModel },
            applies: 'live',
            secrets: [],
            revision: currentRevision,
          }]
        : []
    },
    async mutate(ns, ops, expectedRevision) {
      calls.mutate.push({ ns, ops, expectedRevision })
      if (failMutate) throw new Error('fbtest mutate failed')
      if (!namespacePresent || ns !== CHILD_MODEL_CONTRACT.settingsNamespace) {
        throw new Error('unknown namespace: ' + ns)
      }
      if (expectedRevision !== currentRevision) {
        throw new Error('revision conflict')
      }
      for (const op of ops) {
        if (op.op === 'set' && Array.isArray(op.path) && op.path.length === 1 && op.path[0] === 'model') {
          currentModel = op.value
        }
      }
      currentRevision += 1
      return { ok: true, revision: currentRevision }
    },
  }
}

/**
 * Invoke registered onboarding HTTP routes directly via `routeContext`.
 * Implements DSH's `ctx.connection.requestRejection({ headers })` contract by default
 * (pass `{ withRequestRejection: false }` to test fail-closed behavior when absent).
 */
export async function onboardingRoutesWorld(sdk, onboarding, { withRequestRejection = true } = {}) {
  const { registerOnboardingRoutes, ONBOARDING_ROUTE } = await onboardingRoutesModule(sdk)
  const rc = routeContext()
  const rejectionCalls = []
  if (withRequestRejection) {
    rc.ctx.connection.requestRejection = ({ headers } = {}) => {
      rejectionCalls.push({ headers })
      const readHeader = (name) => (typeof headers?.get === 'function' ? headers.get(name) : headers?.[name])
      const origin = readHeader('origin')
      const host = readHeader('host')
      if (!origin) return undefined
      try {
        return new URL(origin).host === host ? undefined : { status: HTTP.forbidden, reason: 'cross-origin' }
      } catch {
        return { status: HTTP.forbidden, reason: 'invalid-origin' }
      }
    }
  }
  registerOnboardingRoutes(rc.ctx, onboarding)
  const handlerOf = (route) => route.fetch ?? route.handler

  async function call(method, routePath, {
    body,
    headers = {},
    host = HTTP.host,
    origin = HTTP.origin,
    secFetchSite = 'same-origin',
  } = {}) {
    const route = rc.routes.find((r) => r.path === routePath)
    assert.ok(route, `route not registered: ${routePath}; registered: ${rc.routes.map((r) => r.path).join(', ')}`)
    const reqHeaders = { host }
    if (origin !== undefined) reqHeaders.origin = origin
    if (secFetchSite !== undefined) reqHeaders['sec-fetch-site'] = secFetchSite
    if (body !== undefined) reqHeaders['content-type'] = 'application/json'
    Object.assign(reqHeaders, headers)
    const rawBody = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    const request = new Request(`http://${HTTP.host}${routePath}`, {
      method,
      headers: reqHeaders,
      ...(rawBody === undefined ? {} : { body: rawBody }),
    })
    const response = await handlerOf(route)(request)
    const text = await response.text()
    return { status: response.status, json: parseJson(text), headers: response.headers, text }
  }

  return { call, routes: rc.routes, ONBOARDING_ROUTE, logs: rc.logs, rejectionCalls }
}

/** Fake primitives for scripted `dsh-instance` UI (includes Modal/Dialog slot & open handling). */
function onboardingPrimitives(React) {
  const base = fakePrimitives(React)
  class SettingsFormModel {
    constructor(scope, fields) { this.scope = scope; this.fields = fields }
    bind(build) { const value = build(); return { getSnapshot: () => value, subscribe: () => () => {}, get: () => value } }
    shell() { return { available: true, dirty: false, invalid: false, saving: false, failed: false, readOnly: false } }
    field() { return { text: '', value: undefined, overridden: false, invalid: false } }
    actions() { return { edit() {}, reset() {}, save: async () => true, discard() {} } }
    dispose() {}
  }
  const cache = new Map()
  const withSlots = (name) => {
    if (!cache.has(name)) {
      const Base = base[name]
      cache.set(name, function Primitive(props) {
        if ((name === 'Modal' || name === 'Dialog') && props.open === false) return null
        const slots = Object.entries(props)
          .filter(([k, v]) => k !== 'children' && (React.isValidElement(v) || (Array.isArray(v) && v.some(React.isValidElement))))
          .map(([, v]) => v)
        return slots.length === 0 ? React.createElement(Base, props) : React.createElement(Base, props, props.children, ...slots)
      })
    }
    return cache.get(name)
  }
  return new Proxy({}, {
    get: (_t, name) => (name === 'SettingsFormModel'
      ? SettingsFormModel
      : typeof name === 'string' && name !== 'then' && name !== 'default' && name !== '__esModule'
        ? withSlots(name)
        : base[name]),
  })
}

/**
 * Scripted DSH main page for `packages/dsh-instance/client.js` + `client.onboarding.js`.
 * Exposes the registered portal `Gate` and all network/service side effects.
 */
export async function openOnboardingPage(t, sdk, {
  lang = 'en',
  onboardingState = { ok: true, completed: false, needed: true, childReady: true, model: null, catalog: FIXTURE.catalog },
  failState = false,
  instanceStatus = { state: 'ready', code: null, detail: null, notice: null, busy: false },
  watchdogMode = WATCHDOG_STATE.ready,
  watchdogInitialModel = undefined,
  mainBundles = [],
  mainPlugins = [],
  pluginManagerMode = 'full',
  strictRemoteProxy = false,
  hostCatalog = FIXTURE.catalog,
  installedFishballBundles = [],
  missingProviders = FIXTURE.missingProviders,
  syncedCatalog = FIXTURE.syncedCatalog,
  respond = () => undefined,
} = {}) {
  let currentWatchdogMode = watchdogMode
  const world = {
    state: structuredClone(onboardingState),
    failState,
    status: { ...instanceStatus },
    hostCatalog: structuredClone(hostCatalog),
    installedFishballBundles: structuredClone(installedFishballBundles),
    mainBundles: structuredClone(mainBundles),
    mainPlugins: structuredClone(mainPlugins),
    requests: [],
    errors: [],
    watchdogCalls: { set: [], unset: [], mutate: [] },
    watchdogModel: watchdogInitialModel,
  }

  const answer = (method, pathname, rawBody) => {
    const body = rawBody ? parseJson(rawBody) : undefined
    const scripted = respond(method, pathname, body, world)
    if (scripted !== undefined) {
      return Promise.resolve(scripted).then((v) => (v instanceof Response ? v : jsonResponse(v)))
    }
    if (pathname === ONBOARDING_ROUTES.state && method === 'GET') {
      if (world.failState) return Promise.reject(new TypeError('fbtest network failure'))
      return jsonResponse(world.state)
    }
    if (pathname === ONBOARDING_ROUTES.model && method === 'POST') {
      world.state = { ...world.state, model: body }
      return jsonResponse({ ok: true, model: body })
    }
    if (pathname === ONBOARDING_ROUTES.complete && method === 'POST') {
      world.state = { ...world.state, completed: true, needed: false, outcome: body?.outcome }
      return jsonResponse({ ok: true, completed: true, outcome: body?.outcome })
    }
    if (pathname === INSTANCE_ROUTES.status && method === 'GET') {
      return jsonResponse(world.status)
    }
    if (pathname === INSTANCE_ROUTES.modelsCheck && method === 'POST') {
      return jsonResponse({
        ok: true,
        result: { checkId: FIXTURE.checkId, missing: structuredClone(missingProviders), notOffered: [], present: [] },
      })
    }
    if (pathname === INSTANCE_ROUTES.modelsAdd && method === 'POST') {
      const ids = body?.ids ?? []
      // Merge syncedCatalog into world.state.catalog so subsequent state refresh sees new models
      const existingGroups = world.state?.catalog?.groups ?? []
      world.state = {
        ...world.state,
        catalog: { groups: [...existingGroups, ...structuredClone(syncedCatalog.groups)] },
      }
      return jsonResponse({
        ok: true,
        result: { items: ids.map((id) => ({ id, outcome: 'added' })) },
      })
    }
    if (pathname === INSTANCE_ROUTES.pluginsList && method === 'GET') {
      return jsonResponse({ ok: true, bundles: world.installedFishballBundles, protected: [] })
    }
    if (pathname === INSTANCE_ROUTES.pluginsInspect && method === 'POST') {
      const inspection = {
        status: 'accepted',
        kind: 'registry',
        name: body?.spec,
        version: '1.0.0',
        spec: body?.spec,
        source: { kind: 'registry', spec: body?.spec },
        summary: { name: body?.spec, version: '1.0.0' },
      }
      return jsonResponse({ ok: true, value: inspection, inspection })
    }
    return new Response('', { status: 404 })
  }

  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), FIXTURE.pageBase)
    const method = String(init.method ?? 'GET').toUpperCase()
    const body = init.body === undefined ? undefined : String(init.body)
    world.requests.push({ method, path: url.pathname, body: body ? parseJson(body) : undefined, rawBody: body })
    return answer(method, url.pathname, body)
  }

  const pageConsole = {
    ...console,
    error: (...a) => world.errors.push(a.map(String).join(' ')),
    warn() {},
    log() {},
    info() {},
    debug() {},
  }

  const page = createBrowserSandbox({ lang, baseURI: FIXTURE.pageBase, fetch: pageFetch, console: pageConsole })
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const platform = {
    [BOOT.platform.react]: React,
    [BOOT.platform.reactDom]: { createPortal: (node) => node },
    [BOOT.platform.reactDomClient]: { createRoot: () => ({ render() {}, unmount() {} }) },
    [BOOT.platform.primitives]: onboardingPrimitives(React),
  }

  const run = (file) => {
    const atFile = path.join(V3.instance.dir, file)
    page.run(fs.readFileSync(atFile, 'utf8'), atFile, pathToFileURL(atFile).href)
  }
  run(FIXTURE.entryFile)

  const graph = [{ id: FIXTURE.rowId, rev: 'fbtest-onboarding' }]
  const loads = new Set()
  const table = moduleTable({
    page,
    platform,
    graph,
    loadChunk: (_owner, file) => {
      const load = Promise.resolve().then(() => run(file))
      loads.add(load)
      load.finally(() => loads.delete(load)).catch(() => {})
      return load
    },
  })

  // Track locale dictionaries and detect missing translation keys
  const baseServices = pageServices(shim, lang)
  const registeredDicts = new Map()
  const missingKeys = []
  const locale = {
    ...baseServices.locale,
    register(ns, dicts) {
      registeredDicts.set(ns, dicts)
      return baseServices.locale.register(ns, dicts)
    },
    bind(ns) {
      const fn = baseServices.locale.bind(ns)
      return (key, params) => {
        const dicts = registeredDicts.get(ns)
        if (!dicts || !(key in (dicts[lang] ?? {}))) missingKeys.push({ ns, lang, key })
        return fn(key, params)
      }
    },
  }

  // Model configForms matching `@deepseek-ai/dsh-client-ui-settings` SDK contract
  const formListeners = new Map()
  const notifyForm = (ns) => { for (const fn of [...(formListeners.get(ns) ?? [])]) fn() }
  const isWatchdogServed = () => currentWatchdogMode === WATCHDOG_STATE.ready || currentWatchdogMode === WATCHDOG_STATE.unsupported
  const watchdogSchemaOf = () => (currentWatchdogMode === WATCHDOG_STATE.ready
    ? { type: 'object', dict: { model: { type: 'object', dict: { provider: { type: 'string' }, model: { type: 'string' }, reasoningEffort: { type: 'string' } } } } }
    : { type: 'object', dict: { enabled: { type: 'boolean' } } })

  const makeNamespaces = () => {
    const list = [{
      ns: FIXTURE.rowId,
      autoGenerate: false,
      schema: { type: 'object', dict: { enabled: { type: 'boolean' } } },
      value: { enabled: true },
      applies: 'live',
      secrets: [],
      revision: 1,
    }]
    if (isWatchdogServed()) {
      list.push({
        ns: WATCHDOG_NS,
        autoGenerate: false,
        schema: watchdogSchemaOf(),
        value: currentWatchdogMode === WATCHDOG_STATE.ready
          ? (world.watchdogModel ? { model: world.watchdogModel } : {})
          : { enabled: true },
        applies: 'live',
        secrets: [],
        revision: 1,
      })
    }
    return list
  }

  let describeSnapshot = {
    status: 'ready',
    view: { writable: true, hasDocument: true, namespaces: makeNamespaces() },
    error: null,
  }
  const describeListeners = new Set()
  const formRefreshers = new Map()
  const whileServedSubscriptions = []
  const refreshDescribe = () => {
    describeSnapshot = {
      status: 'ready',
      view: { writable: true, hasDocument: true, namespaces: makeNamespaces() },
      error: null,
    }
    for (const refresh of formRefreshers.values()) refresh()
    for (const fn of [...describeListeners]) fn()
    const served = new Set(makeNamespaces().map((n) => n.ns))
    for (const sub of whileServedSubscriptions) sub.sync(served)
  }

  const formCache = new Map()
  const getForm = (ns) => {
    if (formCache.has(ns)) return formCache.get(ns)
    const getSnap = () => {
      if (ns === WATCHDOG_NS) {
        if (!isWatchdogServed()) {
          return { status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false }
        }
        return {
          status: 'ready',
          value: currentWatchdogMode === WATCHDOG_STATE.ready
            ? (world.watchdogModel ? { model: world.watchdogModel } : {})
            : { enabled: true },
          base: {},
          user: world.watchdogModel ? { model: world.watchdogModel } : {},
          revision: 1,
          writable: true,
        }
      }
      return { status: 'ready', value: { enabled: true }, base: { enabled: true }, user: {}, revision: 1, writable: true }
    }
    let cachedSnap = getSnap()
    formRefreshers.set(ns, () => { cachedSnap = getSnap(); notifyForm(ns) })
    const form = {
      getSnapshot: () => cachedSnap,
      subscribe(fn) {
        if (!formListeners.has(ns)) formListeners.set(ns, new Set())
        formListeners.get(ns).add(fn)
        return () => formListeners.get(ns)?.delete(fn)
      },
      async set(field, value) {
        if (ns === WATCHDOG_NS) {
          world.watchdogCalls.set.push({ field, value })
          if (field === 'model') world.watchdogModel = value
        }
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
      async unset(field) {
        if (ns === WATCHDOG_NS) {
          world.watchdogCalls.unset.push({ field })
          if (field === 'model') world.watchdogModel = undefined
        }
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
      async mutate(ops, rev) {
        if (ns === WATCHDOG_NS) world.watchdogCalls.mutate.push({ ops, rev })
        cachedSnap = getSnap()
        refreshDescribe()
        notifyForm(ns)
        return true
      },
    }
    formCache.set(ns, form)
    return form
  }

  const configForms = {
    get: getForm,
    describe: () => ({
      getSnapshot: () => describeSnapshot,
      subscribe: (fn) => { describeListeners.add(fn); return () => describeListeners.delete(fn) },
      ensure: async () => {},
      acceptView: () => {},
    }),
    whileServed(namespaces, register) {
      const wanted = [namespaces].flat()
      let dispose = null
      let active = false
      const sub = {
        sync(served) {
          const matched = wanted.filter((n) => served.has(n))
          if (matched.length > 0 && !active) {
            active = true
            dispose = register(new Set(matched))
          } else if (matched.length === 0 && active) {
            active = false
            const prev = dispose
            dispose = null
            if (typeof prev === 'function') prev()
          }
        },
      }
      whileServedSubscriptions.push(sub)
      sub.sync(new Set(makeNamespaces().map((n) => n.ns)))
      return () => {
        const idx = whileServedSubscriptions.indexOf(sub)
        if (idx >= 0) whileServedSubscriptions.splice(idx, 1)
        if (active && typeof dispose === 'function') dispose()
        active = false
        dispose = null
      }
    },
  }

  const remoteListeners = new Map()
  const emitRemote = (event, payload) => {
    for (const fn of [...(remoteListeners.get(event) ?? [])]) fn(payload)
  }
  const pluginManagerFace = pluginManagerMode === 'full'
    ? {
        listBundles: async () => ({ ok: true, value: structuredClone(world.mainBundles) }),
        listPlugins: async () => ({ ok: true, value: structuredClone(world.mainPlugins) }),
      }
    : pluginManagerMode === 'no-list'
      ? {}
      : undefined

  const remote = {
    $on: (event, fn) => {
      if (!remoteListeners.has(event)) remoteListeners.set(event, new Set())
      remoteListeners.get(event).add(fn)
      return () => remoteListeners.get(event)?.delete(fn)
    },
    session: {
      modelCatalog: async () => ({
        ok: true,
        value: {
          default: FIXTURE.modelA,
          routableProviders: world.hostCatalog.groups.map((g) => g.id),
          groups: structuredClone(world.hostCatalog.groups),
          failures: [],
        },
      }),
    },
  }
  if (strictRemoteProxy) {
    Object.defineProperty(remote, 'pluginManager', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('cannot get property "remote.pluginManager" without inject')
      },
    })
  } else if (pluginManagerFace !== undefined) {
    remote.pluginManager = pluginManagerFace
  }

  // Provide `dshConnectorUiPortal` to capture the registered OnboardingGate
  let activeGate = null
  const portalRegistrations = []
  const portal = {
    apiVersion: PORTAL.apiVersion,
    registerGate(Gate) {
      activeGate = Gate
      portalRegistrations.push(Gate)
      return () => { if (activeGate === Gate) activeGate = null }
    },
  }

  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', baseServices.slots)
  root.provide('locale', locale)
  root.provide('configForms', configForms)
  root.provide('remote', remote)
  root.provide('remote.session', remote.session)
  if (pluginManagerFace !== undefined) root.provide('remote.pluginManager', pluginManagerFace)
  root.provide(PORTAL.serviceName, portal)

  const plugins = applyPlugins(root, graph, table, world.errors)
  const settleAll = async () => {
    await settle()
    while (loads.size > 0) {
      await Promise.allSettled([...loads])
      await settle()
    }
  }
  await settleAll()

  // Mount shell.overlay entries as DSH's web shell does (hosts shared Fishball install dialog)
  const mountOverlays = () => {
    const entries = baseServices.slots.entries('shell.overlay')
    entries.forEach((entry, idx) => {
      const key = `shell-overlay-${idx}`
      if (!shim.roots().includes(key)) {
        shim.mount(key, () => React.createElement(entry.Component, {}))
      }
    })
  }
  mountOverlays()
  await settleAll()

  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of plugins.reverse()) await p.fiber.dispose?.()?.catch?.(() => {})
  })

  // Wait until OnboardingGate registers into dshConnectorUiPortal
  const waitUntil = async (predicate, ms = FIXTURE.waitMs) => {
    const end = Date.now() + ms
    for (;;) {
      await settleAll()
      const v = predicate()
      if (v || Date.now() >= end) return v
      await sleep(FIXTURE.pollMs)
    }
  }

  await waitUntil(() => activeGate !== null, FIXTURE.waitMs)

  const GATE_KEY = 'onboarding-gate'
  const api = {
    world,
    shim,
    registeredDicts,
    missingKeys,
    portalRegistrations,
    get gate() { return activeGate },
    settle: settleAll,
    until: waitUntil,
    emitRemote,
    async updateWatchdog({ mode, mainBundles: nextBundles, mainPlugins: nextPlugins } = {}) {
      if (mode !== undefined) currentWatchdogMode = mode
      if (nextBundles !== undefined) world.mainBundles = structuredClone(nextBundles)
      if (nextPlugins !== undefined) world.mainPlugins = structuredClone(nextPlugins)
      refreshDescribe()
      emitRemote('plugin-manager/changed', {})
      emitRemote('config-forms/changed', {})
      root.emit('config-forms/changed')
      await settleAll()
    },
    async mountGate({ title = FIXTURE.windowTitle } = {}) {
      assert.ok(activeGate, 'client.onboarding.js did not register a Gate in dshConnectorUiPortal')
      const renderFrame = () => React.createElement('div', { [UI_ATTR.testFrame]: 'mounted' }, 'CHILD_FRAME')
      shim.mount(GATE_KEY, () => React.createElement(activeGate, { title, renderFrame }))
      await settleAll()
    },
    async unmountGate() {
      shim.unmountRoot(GATE_KEY)
      await settleAll()
    },
    tree: () => shim.treeOf(GATE_KEY),
    find: (predicate) => findAll(shim.treeOf(GATE_KEY), predicate),
    byAttr: (attr, value) => findAll(
      shim.treeOf(GATE_KEY),
      (n) => n.props[attr] !== undefined && n.props[attr] !== false && (value === undefined || String(n.props[attr]) === String(value)),
    ),
    text: () => shim.treeOf(GATE_KEY).map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
    hasFrame: () => findAll(shim.treeOf(GATE_KEY), (n) => n.props[UI_ATTR.testFrame] === 'mounted').length > 0,
    requestsOf: (method, pathname) => world.requests.filter((r) => r.method === method && r.path === pathname),
    async press(node) {
      assert.ok(node, 'nothing to press')
      if (node.props.disabled) return
      node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
      await settleAll()
    },
    async select(node, value) {
      assert.ok(node, 'no select element')
      const target = { value }
      node.props.onChange?.({ target, currentTarget: target, preventDefault() {} })
      await settleAll()
    },
  }
  return api
}
