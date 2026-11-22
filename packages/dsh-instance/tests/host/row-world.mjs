/**
 * The host row (host.js `apply(ctx, config)`) over a fake row context and a fake runtime. host.js
 * is imported under `?fbrow=<id>` (and the SDK tag): a resolve hook carries the row tag to every
 * package module it loads and answers its `src/native-runtime/index.js` with fake-runtime.mjs, so no
 * child process is launched; their `node:fs/promises` is fs-hold.mjs (F05). Everything else is the
 * real instance code: the hosted record on disk, the hosted-token rules, the locator and the
 * credential client (with the real receiver at the fake child's end of each in-memory wire).
 *
 * The fake ctx plays the members host.js reads (its `inject` list and ctx.get): profileContext,
 * workspaceRegistry, appReady (fired by the case), connection.fetch, webServer.getOrigin, logger,
 * effect, provide, on (the loader's volatile update, emitted by the case) and get (the fake
 * connector `dshConnectorTokens`). Volatile fields are live `{get}` references, as the loader passes
 * them. `extraTarget` is a leftover `targetUrl` field (MULTI-2 removed it; adversarial input).
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PACKAGE_DIR, importInstance, packageFile } from '../support/instance.mjs'
import { FIXTURE, K3, MODULE, ROW } from './constants.mjs'
import { fakeChildCredentials, fakeTokens, gate, turn, until } from './fakes.mjs'
import { callRoute, scopeOf } from './worlds.mjs'

const worlds = (globalThis[Symbol.for(ROW.worldsKey)] ??= new Map())
const FAKE_RUNTIME = pathToFileURL(path.join(import.meta.dirname, 'fake-runtime.mjs')).href
const FS_HOLD = pathToFileURL(path.join(import.meta.dirname, 'fs-hold.mjs')).href
const FS_PROMISES = 'node:fs/promises'
const PACKAGE_URL = pathToFileURL(PACKAGE_DIR + path.sep).href
const RUNTIME_URL = pathToFileURL(packageFile(MODULE.runtime)).href
let hooked = false
let counter = 0

const rowOf = (url) => { try { return new URL(url).searchParams.get(ROW.worldParam) ?? undefined } catch { return undefined } }
const withRow = (url, id) => { const next = new URL(url); next.searchParams.set(ROW.worldParam, id); return next.href }
const bare = (url) => { const u = new URL(url); u.search = ''; return u.href }

function hook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const id = rowOf(context.parentURL)
      if (id !== undefined && specifier === FS_PROMISES && !String(context.parentURL).startsWith(FS_HOLD)) return { url: withRow(FS_HOLD, id), shortCircuit: true }
      const resolved = nextResolve(specifier, context)
      if (id === undefined || !resolved.url.startsWith(PACKAGE_URL)) return resolved
      if (bare(resolved.url) === RUNTIME_URL) return { ...resolved, url: withRow(FAKE_RUNTIME, id) }
      return { ...resolved, url: withRow(resolved.url, id) }
    },
  })
}

/** A volatile field as the loader passes it: a live reference. */
const live = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

/**
 * One host-row world on `sdk`. Options: `home` (the main home), `enabled`, `extraTarget` (a leftover
 * targetUrl field), `holdStarts` (how many starts wait on `startGate`), `credentials`
 * (fakeChildCredentials options; one store shared by every child start).
 */
export async function rowWorld(t, sdk, { home, enabled = true, extraTarget = FIXTURE.blank, holdStarts = 0, credentials } = {}) {
  // Loads the package's own modules bound to the SDK (and installs the SDK hook before this one).
  const { RUNTIME_LIMITS } = await importInstance(sdk, MODULE.constants)
  const { createCredentialReceiver } = await importInstance(sdk, MODULE.credential)
  hook()
  const id = String(++counter)
  const tokens = fakeTokens()
  const ctl = {
    runtimeLimits: RUNTIME_LIMITS, createCredentialReceiver,
    instances: [], launches: [], wires: [], calls: { start: 0, stop: 0, shutdown: 0, parentExit: 0 },
    holdStarts, startGate: gate(), cleanupGate: gate(), credentials: fakeChildCredentials(credentials),
    holdRecord: false, recordGate: gate(), recordHeld: gate(),
    // The next start rejects with this error (a blocked start), and the tickets the row asked for.
    failNext: undefined, minted: [],
  }
  worlds.set(id, ctl)
  const scope = scopeOf(t)
  scope.defer(() => worlds.delete(id))
  const url = new URL(pathToFileURL(packageFile(MODULE.host)))
  url.searchParams.set('fbsdk', sdk)
  url.searchParams.set(ROW.worldParam, id)
  const host = await import(url.href)
  const fields = { [ROW.enabled]: live(enabled), [ROW.extraTarget]: live(extraTarget) }
  const contexts = []
  const logs = []
  const routes = []
  function makeCtx() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const ready = new Set()
    const ctx = {
      profileContext: { home, installAnchor: FIXTURE.blank, packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: { onReady(fn) { ready.add(fn); return () => ready.delete(fn) } },
      connection: { fetch: { register(route) { routes.push(route); return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) } } } },
      webServer: { getOrigin: () => FIXTURE.hostOrigin },
      logger: (name) => Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })])),
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
      provide(name, value) { services.set(name, value) },
      on(event, fn) { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); return () => set.delete(fn) },
      get: (name) => (name === K3.tokensService ? tokens : services.get(name)),
    }
    return {
      ctx, services,
      fireReady() { for (const fn of [...ready]) fn(); ready.clear() },
      emit(event, ...args) { for (const fn of [...(listeners.get(event) ?? [])]) fn(...args) },
      async dispose() { for (const fn of effects.reverse()) await fn() },
    }
  }
  const world = {
    tokens, ctl, logs, host, routes,
    /** One request to a route this row registered. */
    call: (...args) => callRoute(routes, ...args),
    get current() { return contexts.at(-1) },
    /** Hold the next hosted.json write until `releaseRecord()`; resolves once it is held. */
    holdRecordWrite() { ctl.holdRecord = true; return ctl.recordHeld.promise },
    releaseRecord: () => ctl.recordGate.open(),
    /** Apply the row on a new ctx (the first apply, or a reload of the same home). */
    async apply() {
      const c = makeCtx()
      contexts.push(c)
      scope.defer(() => { ctl.recordGate.open(); ctl.cleanupGate.open(); ctl.startGate.open(); return c.dispose() })
      await host.apply(c.ctx, { [ROW.enabled]: fields[ROW.enabled].ref, [ROW.extraTarget]: fields[ROW.extraTarget].ref })
      return c
    },
    /** Change a volatile field and emit the loader's volatile update to the current ctx. */
    setField(name, value) { fields[name].set(value); world.current.emit(ROW.volatileUpdate, [[name]]) },
    fireReady: () => world.current.fireReady(),
    locator: (c = world.current) => c.services.get(K3.service),
    status: (c = world.current) => world.locator(c).status(),
    recordWarns: () => logs.filter((l) => l.level === ROW.warnLevel && l.args[0] === ROW.recordWarn).map((l) => l.args),
    dispose: (c = world.current) => c.dispose(),
    /** Wait for `cond()` (no deadline). */
    until,
    turn,
  }
  return world
}