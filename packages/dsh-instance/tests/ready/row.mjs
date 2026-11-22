/**
 * The host row (host.js `apply(ctx, config)`) over a fake row context, with
 * src/native-runtime/index.js answered by fake-runtime.mjs, so no child process starts. Everything
 * else is the real instance code bound to one SDK. A resolve hook carries the world's id from
 * host.js to every package module it loads, and swaps the runtime module for the fake.
 *
 * The fake ctx plays the members host.js and the modules it builds read: profileContext,
 * workspaceRegistry, appReady (fired by the case), connection.fetch, webServer, logger, effect,
 * provide, on, get, and the main DSH's llm / settings / configEditor / credentials / authorization,
 * which the model sync's source reads. `llm.listConfigurableProviders` is held open by the world, so
 * a case can see the sync's first read and keep it pending.
 */
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { importInstance, PACKAGE_DIR, packageFile } from '../support/instance.mjs'

const TAG = 'dshirow'
const worlds = (globalThis[Symbol.for('dshi-ready-row-worlds')] ??= new Map())
const FAKE = pathToFileURL(packageFile('tests/ready/fake-runtime.mjs')).href
const RUNTIME_MODULE = pathToFileURL(packageFile('src/native-runtime/index.js')).pathname
const PACKAGE_URL = pathToFileURL(PACKAGE_DIR + '/').href
let hooked = false
let counter = 0

const tagOf = (url) => { try { return new URL(url).searchParams.get(TAG) ?? undefined } catch { return undefined } }
const withTag = (url, id) => { const next = new URL(url); next.searchParams.set(TAG, id); return next.href }

function hook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const id = tagOf(context.parentURL)
      const resolved = nextResolve(specifier, context)
      if (id === undefined || !resolved.url.startsWith(PACKAGE_URL)) return resolved
      const url = new URL(resolved.url)
      if (url.pathname === RUNTIME_MODULE) {
        const fake = new URL(FAKE)
        for (const [k, v] of url.searchParams) fake.searchParams.set(k, v)
        return { ...resolved, url: withTag(fake.href, id), shortCircuit: true }
      }
      return { ...resolved, url: withTag(resolved.url, id) }
    },
  })
}

/** A promise and its resolver. */
export function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open: (value) => open(value) }
}

/**
 * One host row on `sdk` for the canonical main home `home`.
 * @returns {{apply(), fireReady(), service(), warns(), routes, providerReads, world}}
 */
export async function rowWorld(scope, sdk, home) {
  // Installs the SDK binding hook before this one, so this hook runs first and delegates to it.
  const { RUNTIME_LIMITS } = await importInstance(sdk, 'src/native-runtime/constants.js')
  hook()
  const id = String(++counter)
  const providersRead = gate()
  const providers = gate()
  const world = {
    limits: RUNTIME_LIMITS, hostId: randomUUID(), childOrigin: 'http://127.0.0.1:43129',
    runtimes: [], calls: { start: 0, shutdown: 0 },
    syncTransport: Object.freeze({ send() {}, onMessage: () => () => {}, onClose: () => () => {} }),
  }
  worlds.set(id, world)
  scope.defer(() => worlds.delete(id))
  const url = new URL(pathToFileURL(packageFile('host.js')))
  url.searchParams.set(SDK.versionTag, sdk)
  url.searchParams.set(TAG, id)
  const host = await import(url.href)
  const services = new Map()
  const effects = []
  const ready = new Set()
  const logs = []
  const routes = []
  /** The row's own status at each read of the main DSH's providers (the model sync's first step). */
  const providerReads = []
  const ctx = {
    profileContext: { home, dir: home, installAnchor: '', packageManager: undefined },
    workspaceRegistry: { list: () => [] },
    appReady: { onReady(fn) { ready.add(fn); return () => ready.delete(fn) } },
    connection: { fetch: { register(route) { routes.push(route); return () => {} } } },
    webServer: { getOrigin: () => 'http://127.0.0.1:43000' },
    logger: (name) => Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })])),
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
    provide(name, value) { services.set(name, value) },
    on: () => () => {},
    get: (name) => services.get(name) ?? ctx[name],
    llm: { listConfigurableProviders: () => { providerReads.push(services.get('nativeFishballRuntime')?.status().state); providersRead.open(); return providers.promise } },
    settings: { describe: async () => [] },
    configEditor: { entries: async () => [] },
    credentials: {},
    authorization: {},
  }
  scope.defer(async () => { providers.open([]); for (const dispose of effects.reverse()) await dispose() })
  return {
    world, routes, providerReads, host,
    /** Resolves at the model sync's first read of the main DSH's providers. */
    providersRead: providersRead.promise,
    apply: () => host.apply(ctx, { enabled: true }),
    fireReady() { for (const fn of [...ready]) fn(); ready.clear() },
    service: () => services.get('nativeFishballRuntime'),
    warns: () => logs.filter((l) => l.level === 'warn'),
  }
}
