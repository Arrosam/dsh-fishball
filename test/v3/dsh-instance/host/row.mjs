/**
 * The host row (host.js `apply(ctx, config)`) over a fake row context and a fake runtime, for the
 * R-FIX-INSTANCE row cases (fix-cases.mjs). host.js is imported under `?fbrow=<id>`: a resolve hook
 * carries the tag to every module it loads and answers its `src/native-runtime/index.js` with
 * fake-runtime.mjs, so no child process is launched. Everything else is the real instance code:
 * the hosted record on disk, the hosted-token rules, the locator, the credential client (and the
 * real receiver at the fake child's end of each in-memory wire). Its `node:fs/promises` is
 * fs-hold.mjs, which can hold one hosted.json write open (F05).
 *
 * The fake ctx plays only the members host.js reads (its `inject` list and ctx.get): `profileContext`,
 * `workspaceRegistry`, `appReady` (fired by the case), `connection.fetch`, `webServer.getOrigin`,
 * `logger`, `effect`, `provide`, `on` (the loader's volatile update, emitted by the case), `get`
 * (the fake connector `dshConnectorTokens`). Volatile settings are live `{get}` references, as the
 * loader hands them over.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { FIXTURE, K3, RELAYED, RFI } from './constants.mjs'
import { fakeChildCredentials, fakeTokens } from './fakes.mjs'
import { fixtureScope } from './subject.mjs'

const worlds = (globalThis[Symbol.for(RFI.worldsKey)] ??= new Map())
const FAKE_RUNTIME = pathToFileURL(path.join(import.meta.dirname, 'fake-runtime.mjs')).href
const FS_HOLD = pathToFileURL(path.join(import.meta.dirname, 'fs-hold.mjs')).href
const FS_PROMISES = 'node:fs/promises'
const REPO_URL = pathToFileURL(path.dirname(path.dirname(V3.instance.dir)) + path.sep).href
let hooked = false
let counter = 0

const rowOf = (url) => { try { return new URL(url).searchParams.get(RFI.worldParam) ?? undefined } catch { return undefined } }
const withRow = (url, id) => { const next = new URL(url); next.searchParams.set(RFI.worldParam, id); return next.href }

function hook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const id = rowOf(context.parentURL)
      // A row world's own modules get fs-hold.mjs for node:fs/promises (never fs-hold itself).
      if (id !== undefined && specifier === FS_PROMISES && !String(context.parentURL).startsWith(FS_HOLD)) return { url: withRow(FS_HOLD, id), shortCircuit: true }
      const resolved = nextResolve(specifier, context)
      if (id === undefined || !resolved.url.startsWith(REPO_URL)) return resolved
      const url = new URL(resolved.url)
      if (RFI.runtimeModule.test(url.pathname)) {
        const fake = new URL(FAKE_RUNTIME)
        for (const [k, v] of url.searchParams) fake.searchParams.set(k, v)
        return { ...resolved, url: withRow(fake.href, id) }
      }
      return { ...resolved, url: withRow(resolved.url, id) }
    },
  })
}

/** A promise with its resolver: `promise`, `open()`. */
export function gate() {
  let open
  const promise = new Promise((resolve) => { open = resolve })
  return { promise, open: () => open() }
}

/** A volatile field as the loader passes it: a live reference. */
const live = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

/**
 * One host-row world on `sdk`. Options: `home` (the main home; default a canonical scratch dir the
 * case passes), `enabled`, `targetUrl`, `holdStarts` (how many starts wait on `startGate`),
 * `credentials` (fakeChildCredentials options; the store is shared by every child start).
 * `apply()` applies the row (again: a reload of the same home), `dispose()` disposes its current ctx.
 */
export async function rowWorld(t, sdk, { home, enabled = true, targetUrl = FIXTURE.blank, holdStarts = 0, credentials } = {}) {
  hook()
  // Installs the SDK binding hook (sdk.mjs) before host.js is imported under its tag.
  await importInstance(sdk, path.join('src', 'native-runtime', 'constants.js'))
  const id = String(++counter)
  const tokens = fakeTokens()
  const ctl = {
    instances: [], launches: [], wires: [], calls: { start: 0, stop: 0, shutdown: 0, parentExit: 0 },
    holdStarts, startGate: gate(), cleanupGate: gate(), credentials: fakeChildCredentials(credentials),
    // fs-hold.mjs: when armed, the next hosted.json write waits on recordGate (recordHeld opens as it starts waiting).
    holdRecord: false, recordGate: gate(), recordHeld: gate(),
  }
  worlds.set(id, ctl)
  const scope = fixtureScope(t)
  scope.defer(() => worlds.delete(id))
  const url = new URL(pathToFileURL(path.join(V3.instance.dir, RELAYED.modules.host)))
  url.searchParams.set('fbsdk', sdk)
  url.searchParams.set(RFI.worldParam, id)
  const host = await import(url.href)
  const fields = { [RFI.row.enabled]: live(enabled), [RFI.row.target]: live(targetUrl) }
  const contexts = []
  const logs = []
  function makeCtx() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const ready = new Set()
    const on = (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); return () => set.delete(fn) }
    const ctx = {
      profileContext: { home, installAnchor: FIXTURE.blank, packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: { onReady(fn) { ready.add(fn); return () => ready.delete(fn) } },
      connection: { fetch: { register: () => () => {} } },
      webServer: { getOrigin: () => FIXTURE.hostOrigin },
      logger: (name) => Object.fromEntries(['debug', 'info', 'warn', 'error'].map((level) => [level, (...args) => logs.push({ name, level, args })])),
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
      provide(name, value) { services.set(name, value) },
      on,
      get: (name) => (name === RFI.row.tokensService ? tokens : services.get(name)),
    }
    return {
      ctx, services,
      fireReady() { for (const fn of [...ready]) fn(); ready.clear() },
      emit(event, ...args) { for (const fn of [...(listeners.get(event) ?? [])]) fn(...args) },
      async dispose() { for (const fn of effects.reverse()) await fn() },
    }
  }
  const world = {
    tokens, ctl, logs, host,
    get current() { return contexts.at(-1) },
    /** Hold the next hosted.json write until `releaseRecord()`; resolves once it is held. */
    holdRecordWrite() { ctl.holdRecord = true; return ctl.recordHeld.promise },
    releaseRecord: () => ctl.recordGate.open(),
    /** Apply the row on a new ctx (the first apply, or a reload of the same home). */
    async apply() {
      const c = makeCtx()
      contexts.push(c)
      scope.defer(() => {
        // An assertion may exit while a fake write or aborted start is blocked on the row.
        ctl.recordGate.open()
        ctl.cleanupGate.open()
        return c.dispose()
      })
      await host.apply(c.ctx, { [RFI.row.enabled]: fields[RFI.row.enabled].ref, [RFI.row.target]: fields[RFI.row.target].ref })
      return c
    },
    /** Change a volatile field and emit the loader's volatile update to the current ctx. */
    setField(name, value) { fields[name].set(value); world.current.emit(RFI.row.volatileUpdate, [[name]]) },
    fireReady: () => world.current.fireReady(),
    locator: (c = world.current) => c.services.get(K3.service),
    status: (c = world.current) => world.locator(c).status(),
    warns: () => logs.filter((l) => l.level === RFI.row.warnLevel),
    dispose: (c = world.current) => c.dispose(),
    /** Poll until `cond()` holds or RFI.wait.readyMs passes; returns whether it held. */
    async until(cond) {
      const end = Date.now() + RFI.wait.readyMs
      while (!cond()) { if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, RFI.wait.pollMs)) }
      return true
    },
  }
  return world
}
