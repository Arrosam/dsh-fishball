/**
 * The host row (host.js `apply(ctx, config)`) over a fake row context, with
 * `src/native-runtime/index.js` answered by fake-runtime.mjs (no child process starts) and the
 * package's `node:fs/promises` by fs-hold.mjs. Everything else is the real instance code bound to one
 * SDK. host.js is loaded under the world's tag (test-helpers swap), so each world has its own
 * module instances.
 *
 * The fake ctx plays the members host.js and the modules it builds read (its `inject` list and
 * ctx.get): profileContext, workspaceRegistry, appReady (fired by the case), connection.fetch,
 * webServer.getOrigin, logger, effect, provide, on (the loader's volatile update, emitted by
 * `setField`) and get (the world's `tokens` as `dshConnectorTokens`, else a provided service, else
 * a ctx member), plus any `members(services)` the caller adds. Config fields are live `{get}`
 * references, as the loader passes volatile fields.
 */
import path from 'node:path'
import { SDK } from '@dsh-instance/test-helpers/constants'
import { fetchRegistry } from '@dsh-instance/test-helpers/routes'
import { swapWorlds } from '@dsh-instance/test-helpers/swap'
import { gate } from '@dsh-instance/test-helpers/wait'
import { HOSTED_RECORD, MODULE, ROW, TOKENS } from './constants.mjs'
import { PACKAGE_DIR, importInstance, packageFile } from './instance.mjs'

const worlds = swapWorlds(ROW.tag, {
  root: PACKAGE_DIR,
  replace: {
    [packageFile(MODULE.runtime)]: path.join(import.meta.dirname, 'fake-runtime.mjs'),
    [ROW.fsPromises]: path.join(import.meta.dirname, 'fs-hold.mjs'),
  },
})

/** A volatile field as the loader passes it: a live reference. */
const live = (initial) => {
  let value = initial
  return { ref: { get: () => value }, set: (next) => { value = next } }
}

/**
 * One host-row world on `sdk` for the main home `home`; cleanups go to `scope`.
 * @param options.fields - the row's config fields and their first values.
 * @param options.volatileUpdate - the loader's event `setField` emits.
 * @param options.tokens - what ctx.get answers for dshConnectorTokens.
 * @param options.credentials - the child store a ready start's credential receiver writes into (none: no credential channel).
 * @param options.syncTransport - the provider-sync transport a ready start offers (none: never offered).
 * @param options.holdStarts - how many starts wait on `ctl.startGate`.
 * @param options.hostId / childOrigin / webOrigin / launchToken / generation - what the fake runtime and ctx answer.
 * @param options.members - `(services) → extra ctx members` (the main DSH's services a module reads).
 * @param options.release - run at cleanup before the row's effects are disposed (open what the caller holds).
 */
export async function hostRowWorld(scope, sdk, options) {
  const { home, fields: initial, volatileUpdate, tokens, credentials, syncTransport, holdStarts = 0, hostId, childOrigin, webOrigin, launchToken, generation, members = () => ({}), release = () => {} } = options
  // Loads the package's own modules bound to the SDK (and installs the SDK hook before the swap hook).
  const { RUNTIME_LIMITS } = await importInstance(sdk, MODULE.constants)
  const { createCredentialReceiver } = await importInstance(sdk, MODULE.credential)
  const ctl = {
    runtimeLimits: RUNTIME_LIMITS, createCredentialReceiver, credentials, syncTransport, hostId, childOrigin, launchToken, generation,
    instances: [], launches: [], wires: [], calls: { start: 0, stop: 0, shutdown: 0, parentExit: 0 },
    holdStarts, startGate: gate(), cleanupGate: gate(),
    holdRecord: false, recordGate: gate(), recordHeld: gate(),
    // The next start rejects with this error (a blocked start), and the tickets the row asked for.
    failNext: undefined, minted: [],
  }
  const id = worlds.open(ctl)
  scope.defer(() => worlds.close(id))
  const host = await worlds.importIn(id, packageFile(MODULE.host), { [SDK.versionTag]: sdk })
  const fields = Object.fromEntries(Object.entries(initial).map(([name, value]) => [name, live(value)]))
  const config = () => Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.ref]))
  const contexts = []
  const logs = []
  const registry = fetchRegistry()
  function makeCtx() {
    const services = new Map()
    const effects = []
    const listeners = new Map()
    const ready = new Set()
    const ctx = {
      profileContext: { home, dir: home, installAnchor: ROW.installAnchor, packageManager: undefined },
      workspaceRegistry: { list: () => [] },
      appReady: { onReady(fn) { ready.add(fn); return () => ready.delete(fn) } },
      connection: { fetch: registry.fetch },
      webServer: { getOrigin: () => webOrigin },
      logger: (name) => Object.fromEntries(ROW.logLevels.map((level) => [level, (...args) => logs.push({ name, level, args })])),
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') effects.push(dispose); return dispose },
      provide(name, value) { services.set(name, value) },
      on(event, fn) { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); return () => set.delete(fn) },
      get: (name) => (name === TOKENS.service ? tokens : services.get(name) ?? ctx[name]),
      ...members(services),
    }
    return {
      ctx, services,
      fireReady() { for (const fn of [...ready]) fn(); ready.clear() },
      emit(event, ...args) { for (const fn of [...(listeners.get(event) ?? [])]) fn(...args) },
      async dispose() { for (const fn of effects.reverse()) await fn() },
    }
  }
  const world = {
    ctl, logs, host, routes: registry.routes,
    get current() { return contexts.at(-1) },
    /** Hold the next hosted.json write until `releaseRecord()`; resolves once it is held. */
    holdRecordWrite() { ctl.holdRecord = true; return ctl.recordHeld.promise },
    releaseRecord: () => ctl.recordGate.open(),
    /** Apply the row on a new ctx (the first apply, or a reload of the same home). */
    async apply() {
      const c = makeCtx()
      contexts.push(c)
      scope.defer(() => { ctl.recordGate.open(); ctl.cleanupGate.open(); ctl.startGate.open(); release(); return c.dispose() })
      await host.apply(c.ctx, config())
      return c
    },
    /** Change a config field and emit the loader's volatile update to the current ctx. */
    setField(name, value) { fields[name].set(value); world.current.emit(volatileUpdate, [[name]]) },
    fireReady: () => world.current.fireReady(),
    /** A service the row provided on `c` (default: the current ctx). */
    serviceOf: (name, c = world.current) => c.services.get(name),
    dispose: (c = world.current) => c.dispose(),
  }
  return world
}

/** <home>/fishball/hosted.json. */
export const hostedRecordOf = (home) => path.join(home, HOSTED_RECORD.dir, HOSTED_RECORD.file)
