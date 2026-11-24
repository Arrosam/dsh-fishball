/**
 * Public-seam test harness for the fishball directory permissions & hosted-record notice suites.
 * Self-contained: imports only packages/dsh-instance modules bound to the SDK under test.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { createBrowserSandbox } from '../../../support/browser-sandbox.mjs'
import { INSTANCE } from '../../../support/constants.mjs'
import { createReactShim, findAll, textOf } from '../../../support/rp-recommend.mjs'
import { fakePrimitives } from '../../../support/set-panel.mjs'
import { applyPlugins, moduleTable } from '../../contract/package-boundaries/client-graph.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { BOOT, runtimeOf } from '../../fishball-core/package/constants.mjs'
import { pageServices } from '../../fishball-core/package/page.mjs'
import { fakeChildCredentials, fakeTokens } from '../host/fakes.mjs'
import { EXPORTS, HARNESS, MODES, MODULES, ROUTES, STATES, TASK, UI } from './constants.mjs'

const worlds = (globalThis[Symbol.for(HARNESS.worldsKey)] ??= new Map())
const FAKE_RUNTIME_URL = pathToFileURL(path.join(import.meta.dirname, 'fake-runtime.mjs')).href
const REPO_URL = pathToFileURL(path.dirname(path.dirname(V3.instance.dir)) + path.sep).href
let hooked = false
let worldCounter = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const settleRounds = async () => {
  for (let i = 0; i < HARNESS.settleRounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}
const parseJson = (text) => { try { return JSON.parse(text) } catch { return undefined } }

export const octal = (mode) => '0o' + (mode & MODES.mask).toString(8).padStart(3, '0')
export const modeOf = (targetPath) => fs.lstatSync(targetPath).mode & MODES.mask

/** Captures an async or sync call outcome as `{ value }` or `{ error }`. */
export async function settle(fn) {
  try { return { value: await fn() } } catch (error) { return { error } }
}

/** Loads a `packages/dsh-instance` module bound to `sdk` and verifies required exports. */
async function requireModule(sdk, relative, exports) {
  const entry = path.join(V3.instance.dir, relative)
  assert.ok(fs.existsSync(entry), `${TASK}: missing module ${entry}`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, entry))
  for (const name of exports) {
    assert.ok(name in mod, `${TASK}: ${path.basename(entry)} must export ${name}`)
  }
  return mod
}

export const filesModule = (sdk) => requireModule(sdk, MODULES.files, EXPORTS.files)
export const constantsModule = (sdk) => requireModule(sdk, MODULES.constants, EXPORTS.constants)
export const hostedRecordModule = (sdk) => requireModule(sdk, MODULES.hostedRecord, EXPORTS.hostedRecord)
export const routesModule = (sdk) => requireModule(sdk, MODULES.routes, EXPORTS.routes)
export const syncRoutesModule = (sdk) => requireModule(sdk, MODULES.syncRoutes, EXPORTS.syncRoutes)

/**
 * Restores owner rwx on directories under `root` (without following symlinks)
 * so cleanup never fails with EACCES on 0o500/0o555 fixtures.
 */
function restoreRemovableModes(root) {
  let stat
  try { stat = fs.lstatSync(root) } catch { return }
  if (!stat.isDirectory()) return
  try { fs.chmodSync(root, MODES.privateDir) } catch { /* best effort */ }
  let entries = []
  try { entries = fs.readdirSync(root) } catch { return }
  for (const name of entries) {
    restoreRemovableModes(path.join(root, name))
  }
}

/**
 * Creates an isolated scratch root under OS tmpdir with a canonical, symlinked (`alias`),
 * or symlinked-ancestor (`ancestor`) mainHome. Automatically cleaned up after test.
 */
export function tempHome(t, kind = 'canonical') {
  const tmpReal = fs.realpathSync(os.tmpdir())
  const base = fs.mkdtempSync(path.join(tmpReal, HARNESS.tempPrefix))
  t.after(() => {
    if (path.dirname(base) !== tmpReal || !path.basename(base).startsWith(HARNESS.tempPrefix)) {
      throw new Error('refusing to remove unexpected temp dir: ' + base)
    }
    restoreRemovableModes(base)
    fs.rmSync(base, { recursive: true, force: true })
  })
  const real = path.join(base, 'real-home')
  fs.mkdirSync(real, { mode: MODES.privateDir })
  if (kind === 'canonical') return { home: real, real, base }
  if (kind === 'alias') {
    const alias = path.join(base, 'alias-home')
    fs.symlinkSync(real, alias)
    return { home: alias, real, base }
  }
  if (kind === 'ancestor') {
    const ancestorLink = path.join(base, 'ancestor-link')
    fs.symlinkSync(real, ancestorLink)
    const nested = path.join(real, 'home')
    fs.mkdirSync(nested, { mode: MODES.privateDir })
    return { home: path.join(ancestorLink, 'home'), real: nested, base }
  }
  throw new Error('unknown tempHome kind: ' + kind)
}

/** Sets exact mode via chmodSync (bypassing process umask) and verifies the precondition. */
export function createDirWithMode(dirPath, mode) {
  fs.mkdirSync(dirPath)
  fs.chmodSync(dirPath, mode)
  assert.equal(modeOf(dirPath), mode, `fixture chmod failed on ${dirPath}`)
}

/** Creates a file with exact mode via chmodSync (bypassing process umask) and verifies it. */
export function createFileWithMode(filePath, content, mode) {
  fs.writeFileSync(filePath, content, 'utf8')
  fs.chmodSync(filePath, mode)
  assert.equal(modeOf(filePath), mode, `fixture chmod failed on ${filePath}`)
}

const rowIdOf = (url) => {
  try { return new URL(url).searchParams.get(HARNESS.worldParam) ?? undefined } catch { return undefined }
}
const tagRowUrl = (url, id) => {
  const next = new URL(url)
  next.searchParams.set(HARNESS.worldParam, id)
  return next.href
}

function installRowHook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const id = rowIdOf(context.parentURL)
      const resolved = nextResolve(specifier, context)
      if (id === undefined || !resolved.url.startsWith(REPO_URL)) return resolved
      const url = new URL(resolved.url)
      if (MODULES.runtimePattern.test(url.pathname)) {
        const fake = new URL(FAKE_RUNTIME_URL)
        for (const [k, v] of url.searchParams) fake.searchParams.set(k, v)
        return { ...resolved, url: tagRowUrl(fake.href, id) }
      }
      return { ...resolved, url: tagRowUrl(resolved.url, id) }
    },
  })
}

const liveField = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

/**
 * Boots the real `packages/dsh-instance/host.js` over a fake DSH ctx + fake native runtime,
 * while capturing real registered Fetch routes so tests can query `GET /api/dsh-instance/status`
 * and `POST /api/dsh-instance/retry` end-to-end against real disk state under `home`.
 */
export async function hostRowWorld(t, sdk, { home, enabled = true, startError = null } = {}) {
  installRowHook()
  // Ensures the SDK resolution hook (`?fbsdk=`) is installed before importing host.js.
  await constantsModule(sdk)

  const id = String(++worldCounter)
  const tokens = fakeTokens()
  const ctl = {
    instances: [],
    calls: { start: 0, stop: 0, shutdown: 0, parentExit: 0 },
    credentials: fakeChildCredentials(),
    startError,
  }
  worlds.set(id, ctl)
  t.after(() => worlds.delete(id))

  const hostUrl = new URL(pathToFileURL(path.join(V3.instance.dir, MODULES.host)))
  hostUrl.searchParams.set('fbsdk', sdk)
  hostUrl.searchParams.set(HARNESS.worldParam, id)
  const host = await import(hostUrl.href)

  const enabledRef = liveField(enabled)
  const contexts = []
  const logs = []

  function makeCtx() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const readyCallbacks = new Set()
    const routes = []
    const on = (event, fn) => {
      const set = listeners.get(event) ?? new Set()
      set.add(fn)
      listeners.set(event, set)
      return () => set.delete(fn)
    }
    const ctx = {
      profileContext: { home, installAnchor: '', packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: {
        onReady(fn) {
          readyCallbacks.add(fn)
          return () => readyCallbacks.delete(fn)
        },
      },
      connection: {
        fetch: {
          register(route) {
            routes.push(route)
            return () => {
              const idx = routes.indexOf(route)
              if (idx >= 0) routes.splice(idx, 1)
            }
          },
        },
        requestRejection: ({ headers } = {}) => {
          const read = (k) => (typeof headers?.get === 'function' ? headers.get(k) : headers?.[k])
          const origin = read('origin')
          const reqHost = read('host')
          if (!origin) return undefined
          try {
            return new URL(origin).host === reqHost ? undefined : { status: HARNESS.httpForbidden, reason: 'cross-origin' }
          } catch {
            return { status: HARNESS.httpForbidden, reason: 'invalid-origin' }
          }
        },
      },
      webServer: { getOrigin: () => HARNESS.hostOrigin },
      logger: (name) => Object.fromEntries(
        ['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })]),
      ),
      effect(fn) {
        const dispose = fn()
        if (typeof dispose === 'function') effects.push(dispose)
        return dispose
      },
      provide(name, value) { services.set(name, value) },
      on,
      get: (name) => (name === HARNESS.tokensService ? tokens : services.get(name)),
    }
    return {
      ctx,
      services,
      routes,
      fireReady() {
        for (const fn of [...readyCallbacks]) fn()
        readyCallbacks.clear()
      },
      emit(event, ...args) {
        for (const fn of [...(listeners.get(event) ?? [])]) fn(...args)
      },
      async dispose() {
        for (const fn of [...effects].reverse()) await fn()
        effects.length = 0
      },
    }
  }

  async function callRoute(method, routePath, { body, ctxEntry = contexts.at(-1) } = {}) {
    const route = ctxEntry.routes.find((r) => r.path === routePath && (!r.methods || r.methods.includes(method)))
    assert.ok(route, `route ${method} ${routePath} not registered; have: ${ctxEntry.routes.map((r) => r.path).join(', ')}`)
    const headers = {
      host: HARNESS.httpHost,
      origin: HARNESS.hostOrigin,
      'sec-fetch-site': 'same-origin',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    }
    const request = new Request(`http://${HARNESS.httpHost}${routePath}`, {
      method,
      headers,
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })
    const handler = route.fetch ?? route.handler
    const response = await handler(request)
    const text = await response.text()
    return { status: response.status, json: parseJson(text), headers: response.headers, text }
  }

  const world = {
    ctl,
    tokens,
    logs,
    get current() { return contexts.at(-1) },
    async apply() {
      const c = makeCtx()
      contexts.push(c)
      t.after(() => c.dispose())
      await host.apply(c.ctx, { [HARNESS.enabledField]: enabledRef.ref })
      return c
    },
    async dispose(c = contexts.at(-1)) {
      await c.dispose()
    },
    fireReady: () => contexts.at(-1).fireReady(),
    setEnabled(value) {
      enabledRef.set(value)
      contexts.at(-1).emit(HARNESS.volatileUpdate, [[HARNESS.enabledField]])
    },
    setStartError(error) { ctl.startError = error },
    locator: (c = contexts.at(-1)) => c.services.get(HARNESS.childService),
    getStatus: (c = contexts.at(-1)) => callRoute('GET', ROUTES.status, { ctxEntry: c }),
    postRetry: (c = contexts.at(-1)) => callRoute('POST', ROUTES.retry, { ctxEntry: c }),
    warns: () => logs.filter((entry) => entry.level === 'warn'),
    async until(predicate, timeoutMs = HARNESS.waitMs) {
      const end = Date.now() + timeoutMs
      for (;;) {
        const result = await predicate()
        if (result) return result
        if (Date.now() >= end) return false
        await sleep(HARNESS.pollMs)
      }
    },
  }
  return world
}

/** Fake primitives for `client.js` / `client.status.js` (self-contained, no monorepo imports). */
function statusPrimitives(React) {
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
        return slots.length === 0
          ? React.createElement(Base, props)
          : React.createElement(Base, props, props.children, ...slots)
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
 * Mounts the real `client.js` + `client.status.js` settings page against the real
 * `registerInstanceRoutes` with a scripted status/notice service.
 * Exposes registered locale dictionaries, missing keys, and rendered tree queries.
 */
export async function openStatusPage(t, sdk, {
  state = STATES.ready,
  code = null,
  detail = null,
  notice = null,
  lang = UI.langs[0],
} = {}) {
  const { registerInstanceRoutes } = await routesModule(sdk)
  const { registerProviderSyncRoutes } = await syncRoutesModule(sdk)

  const world = {
    status: { state, code, detail },
    notice,
    requests: [],
    errors: [],
  }

  const routes = []
  const routeCtx = {
    connection: {
      fetch: {
        register(route) {
          routes.push(route)
          return () => {
            const idx = routes.indexOf(route)
            if (idx >= 0) routes.splice(idx, 1)
          }
        },
      },
      requestRejection: () => undefined,
    },
    effect(fn) { return fn() },
    on: () => () => {},
    logger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
  }

  const service = {
    status: () => ({ ...world.status }),
    notice: () => world.notice,
    busy: () => false,
    async retry() {},
    async reconnect() { return { ok: true } },
    async open() { return { ok: false, code: 'not-ready' } },
    providerSync: {
      status: () => ({ state: STATES.ready }),
      async check() { return { ok: true, result: { checkId: 'fbtest', missing: [], notOffered: [], present: 0 } } },
      async add() { return { ok: true, result: { items: [] } } },
    },
  }
  registerInstanceRoutes(routeCtx, service)
  registerProviderSyncRoutes(routeCtx, service)

  const pageFetch = async (input, init = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input), HARNESS.pageBase)
    const method = String(init.method ?? 'GET').toUpperCase()
    world.requests.push({ method, path: url.pathname })
    const route = routes.find((r) => r.path === url.pathname && (!r.methods || r.methods.includes(method)))
    if (!route) return new Response('', { status: 404 })
    const headers = { ...(init.headers ?? {}), host: url.host, 'sec-fetch-site': 'same-origin' }
    return route.fetch(new Request(url, {
      method,
      headers,
      ...(method === 'GET' ? {} : { body: init.body ?? '' }),
    }))
  }

  const pageConsole = {
    ...console,
    error: (...args) => world.errors.push(args.map(String).join(' ')),
    warn() {},
    log() {},
    info() {},
    debug() {},
  }

  const page = createBrowserSandbox({ lang, baseURI: HARNESS.pageBase, fetch: pageFetch, console: pageConsole })
  const shim = createReactShim({ stale() {} })
  const { React } = shim
  const platform = {
    [BOOT.platform.react]: React,
    [BOOT.platform.reactDom]: { createPortal: (node) => node },
    [BOOT.platform.reactDomClient]: { createRoot: () => ({ render() {}, unmount() {} }) },
    [BOOT.platform.primitives]: statusPrimitives(React),
  }

  const runFile = (file) => {
    const abs = path.join(V3.instance.dir, file)
    page.run(fs.readFileSync(abs, 'utf8'), abs, pathToFileURL(abs).href)
  }
  runFile(MODULES.clientEntry)

  const graph = [{ id: UI.rowId, rev: 'fbtest-status-notice' }]
  const loads = new Set()
  const table = moduleTable({
    page,
    platform,
    graph,
    loadChunk: (_owner, file) => {
      const load = Promise.resolve().then(() => runFile(file))
      loads.add(load)
      load.finally(() => loads.delete(load)).catch(() => {})
      return load
    },
  })

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

  const formSnap = Object.freeze({ status: 'ready', value: { enabled: true }, base: { enabled: true }, user: {}, revision: 1, writable: true })
  const form = {
    getSnapshot: () => formSnap,
    subscribe: () => () => {},
    async mutate() { return true },
  }
  const configForms = {
    get: () => form,
    whileServed(_ns, register) {
      const dispose = register()
      return () => { if (typeof dispose === 'function') dispose() }
    },
  }

  const remote = new Proxy({}, {
    get(_t, ns) {
      if (typeof ns !== 'string' || ns === 'then') return undefined
      if (ns === '$on') return () => () => {}
      return new Proxy({}, {
        get(_t2, name) {
          if (typeof name !== 'string' || name === 'then') return undefined
          if (name === 'listBundles') return async () => ({ ok: true, value: [] })
          return async () => ({ ok: false, error: { message: 'not scripted' } })
        },
      })
    },
  })

  const { Context } = await import(pathToFileURL(path.join(runtimeOf(sdk), BOOT.cordisEntry)).href)
  const root = new Context()
  root.provide('slots', baseServices.slots)
  root.provide('locale', locale)
  root.provide('configForms', configForms)
  root.provide('remote', remote)

  const plugins = applyPlugins(root, graph, table, world.errors)
  const settleAll = async () => {
    await settleRounds()
    while (loads.size > 0) {
      await Promise.allSettled([...loads])
      await settleRounds()
    }
  }
  await settleAll()

  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    page.clearTimers()
    for (const p of [...plugins].reverse()) await p.fiber.dispose?.()?.catch?.(() => {})
  })

  let entry
  for (const slot of UI.configSlots) {
    entry = baseServices.entries.get(slot)?.find((e) => String(e.options.key ?? '').startsWith(UI.rowId))
    if (entry) break
  }
  assert.ok(entry, `missing settings entry for ${UI.rowId} in ${UI.configSlots.join(' / ')}; errors: ${world.errors.join('; ')}`)
  shim.mount('page', () => React.createElement(entry.Component, { view: 'page' }))
  await settleAll()

  const tree = () => shim.treeOf('page')
  return {
    world,
    registeredDicts,
    missingKeys,
    tree,
    settle: settleAll,
    text: (node) => (node === undefined ? tree().map(textOf).join(' ') : textOf(node)).replace(/\s+/g, ' ').trim(),
    find: (predicate, nodes = tree()) => findAll(nodes, predicate),
    byAttr: (name, value, nodes = tree()) => findAll(
      nodes,
      (n) => n.props[name] !== undefined && n.props[name] !== false && (value === undefined || String(n.props[name]) === String(value)),
    ),
    async until(predicate, ms = HARNESS.waitMs) {
      const end = Date.now() + ms
      for (;;) {
        await settleAll()
        const value = predicate()
        if (value || Date.now() >= end) return value
        await sleep(HARNESS.pollMs)
      }
    },
  }
}
