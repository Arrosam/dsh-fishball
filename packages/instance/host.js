/**
 * The fishball-instance row (was native-host.js): starts the built-in instance's private child DSH
 * after main appReady; failure never aborts main boot.
 */
import Schema from '@deepseek-ai/schemastery'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { LIFETIME } from './src/native-runtime/constants.js'
import { registerNativeWeb } from './src/native-web.js'
import { registerEmbed } from './src/slim/host/embed.js'
import { registerAdminRoutes } from './src/slim/host/settings-routes.js'
import { registerProviderSyncRoutes } from './src/slim/host/provider-sync-routes.js'
import { createChildProviderSync } from './src/provider-sync-service.js'
import { CONNECTOR_CONTRACT, ContractError, ERROR, ROUTES } from './src/slim/contract.js'
import { BINDING_STATE, REFUSAL_CODE, contractStatus, followConnector } from './src/host/binding.js'
import { createAdminRelay } from './src/slim/host/admin.js'
import { migrateLaunchSettings } from './src/settings-migration.js'

const PLUGIN = Object.freeze({
  // The row id is the plugin's name (design §0.2, D22); the service keeps its name for its callers.
  name: 'fishball-instance', service: 'nativeFishballRuntime',
  // The contract's display name for this instance (inst-OQ-06), shown by the connector's view.
  displayName: 'Fishball instance',
  // The pages this instance registers with the connector (contract §1.2), both framed through the
  // main-side embed broker: the chat, and the same page's settings view (design §0.6, I6), which
  // the page selects by its `view=settings` query (src/slim/ui/shell.js).
  ui: Object.freeze({ chat: ROUTES.document, settings: ROUTES.document + '?view=settings' }),
  // Every service this row's ctx reads as a property must be listed: Cordis's context proxy
  // throws `cannot get property "<name>" without inject` for any other (0.2.1-rc.5 and
  // 0.2.2-rc.1 alike); ctx.get() is the only unchecked read. Each one below has the same name
  // in both versions and is a dsh-base row there, so none is optional. Neither version has an
  // optional inject form anyway: every listed key gates activation.
  dependencies: ['profileContext', 'workspaceRegistry', 'sessions', 'sessionController', 'agents', 'appReady', 'connection', 'webServer',
    // B9: the provider-sync source host is built on this row's ctx (createChildProviderSync) and
    // reads llm, settings, configEditor, credentials and authorization (src/provider-sync-host.js).
    // dsh-base turns settings/configEditor off only without profileContext, which is required
    // above anyway. llm is already a dependency of sessionController and credentials of
    // connection, so listing them adds no new reason for this row (and its child) to restart.
    'llm', 'settings', 'configEditor', 'credentials', 'authorization',
    // The one-time settings migration keeps its done-marker in its own storage domain
    // (src/settings-migration.js); storage-domain is a dsh-base row in both versions.
    'storageDomain',
    // The session port moved to the connector row in M1, which now injects what its model path reads.
  ],
  cleanup: 'fishball native host: stop owned child and retain private data',
  // The loader's event after a volatile-only config change (cordis-plugin-loader, both versions).
  volatileUpdate: 'loader/volatile-update',
  // Bound request/exit waits well inside rc.3's whole-app five-second grace.
  requestTimeoutMs: 750, stopTimeoutMs: 1000,
  state: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed', connectorMissing: BINDING_STATE.connectorMissing }),
  code: Object.freeze({ failed: 'NATIVE_START_FAILED', stop: 'NATIVE_STOP_FAILED', exited: 'NATIVE_CHILD_EXITED', unavailable: 'NATIVE_UNAVAILABLE', timeout: 'NATIVE_TIMEOUT', disabled: 'NATIVE_DISABLED' }),
})
/**
 * The child's fixed lifecycle limits (D23, §0.7): the runtime defaults with this row's stricter
 * request and exit waits. They are constants, not row settings, so a stored `limits` value is
 * ignored; the old `limits` and `controlLimits` fields left the schema with D23.
 */
const LIFECYCLE_LIMITS = Object.freeze({
  ...RUNTIME_LIMITS,
  requestTimeoutMs: Math.min(RUNTIME_LIMITS.requestTimeoutMs, PLUGIN.requestTimeoutMs),
  stopTimeoutMs: Math.min(RUNTIME_LIMITS.stopTimeoutMs, PLUGIN.stopTimeoutMs),
})
/**
 * A `.volatile()` config field arrives as a live reference (`{ get }`) so DSH's settings form can
 * edit it without remounting the row; a plain value is accepted too, so this helper also serves
 * direct construction. Only volatile fields appear in that form (§0.7).
 */
function fieldValue(field) {
  return field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field
}
export const name = PLUGIN.name
export const inject = [...PLUGIN.dependencies]
/**
 * The main DSH's whole form for the instance, and nothing else of its settings (§0.7, D23,
 * inst-OQ-04): `enabled`, the one field needed before the child exists. Volatile so DSH's Plugins
 * form can write it (§0.7); model sync is the "Model for Fishball" button I6 adds, an action
 * rather than a field, and there is no `providerSync` switch (D26). There is no launch field: the
 * child is started as the main DSH is (D28, src/native-runtime/constants.js HOST_LAUNCH), and an
 * old stored `nodeExecutable` or `executableSearchPath` is ignored (the schema keeps unknown keys
 * as they are and nothing reads them).
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).volatile().description('Start the private native child after main appReady. Turning it off stops the child at once and turning it on starts it, as the row switch does; private data is retained.'),
})
const unavailable = code => Object.assign(new Error(code), { code })
function bounded(promise, milliseconds) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(unavailable(PLUGIN.code.timeout)), milliseconds)
  })]).finally(() => clearTimeout(timer))
}
// Symbol.for survives ESM/HMR module replacement. A failed stop remains a barrier:
// a successor must never silently take over an uncertain live child.
const registry = globalThis[Symbol.for(LIFETIME.registryKey)] ??= new Map()

export async function apply(ctx, config) {
  let enabled = fieldValue(config.enabled) !== false
  const logger = typeof ctx.logger === 'function' ? ctx.logger(PLUGIN.name) : undefined
  let state = enabled ? PLUGIN.state.waiting : PLUGIN.state.disabled
  let code = null
  /**
   * Serializes the starts and stops that follow the `enabled` switch and the connector's arrivals
   * and departures, in the order they happened.
   */
  let toggle = Promise.resolve()
  /** The `fishballConnector` service while it is provided (src/host/binding.js), else undefined. */
  let connector
  let closed = false
  let appReady = false
  let owner
  let startup
  let disposal
  let cancelReady = () => {}
  let connection
  let unsubscribe = () => {}
  let unsubscribeAdmin = () => {}
  let unsubscribeProviderSync = () => {}
  /** T16's source side: syncs the main profile's API-key providers into the child's own target. */
  let providerSync
  const status = () => ({ enabled, state, code })
  /** End this row's attachment, if any; a stale detach changes nothing (contract §1.3). */
  const release = () => { connection?.detach(); connection = undefined }
  const set = (next, nextCode = null) => { state = next; code = nextCode; return status() }
  // T11's admin relay. Every page operation except status and restart travels to the child over
  // the lifecycle wire's own authenticated admin channel; the child applies it with its own
  // services, so the main process never writes a child file (§9). T12's routes call
  // service.admin.request(operation, payload).
  const admin = createAdminRelay({ status, restart })
  const key = ctx.profileContext.home
  const predecessor = registry.get(key)
  // Start teardown immediately, before the new module can queue startup.
  const barrier = predecessor ? predecessor.shutdown() : Promise.resolve()
  barrier.catch(() => { if (!closed) set(PLUGIN.state.failed, PLUGIN.code.stop) })
  try {
    // Created once per host row and shared by every host object; a wiring failure is a native
    // failure, never a main-boot failure (the catch below keeps the row unready).
    // T16: the child is the sync target. The source host reads the main profile's API-key
    // records only inside the sync's confirm step; the page never sees a value (§10).
    providerSync = createChildProviderSync({ ctx })
    owner = createNativeRuntime({
      mainHome: key, installAnchor: ctx.profileContext.installAnchor,
      get mainWorkspaces() { return ctx.workspaceRegistry.list().map(workspace => workspace.path) },
      limits: LIFECYCLE_LIMITS,
      onExit() { if (state === PLUGIN.state.ready || state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.exited) },
    })
    // One authenticated control transport, one envelope-v2 bridge, attached through the contract's
    // fishballConnector service (contract §1). The descriptor's `id` is the lifecycle host id this
    // runtime minted, which is also the frame host identity its child stamps; the binding has no
    // other identity to name the peer by. A replaced wire detaches before it attaches, because a
    // child restart is a detach followed by a new attach (§1.3).
    unsubscribe = owner.onControlTransport((transport, { hostId }) => {
      if (closed) throw unavailable(PLUGIN.code.unavailable)
      if (hostId !== owner.hostId) throw new ContractError(ERROR.host)
      release()
      // No child starts without the connector (D25), so this is only a connector that left
      // during the start: the departure's stop is already queued and ends this wire.
      if (typeof connector?.attachInstance !== 'function') return
      try {
        connection = connector.attachInstance({
          id: hostId, name: PLUGIN.displayName, contract: CONNECTOR_CONTRACT, transport, ui: PLUGIN.ui,
          // The connector's frame shows these (design §0.5 "The frame"); status() answers in the
          // contract's vocabulary only (contract §1.1, binding.js contractStatus).
          status: () => contractStatus(status()),
          // The instance's restart (design §0.6), queued like the card's Retry but not limited to
          // `failed`: the frame also offers it after the connector closed the channel itself, when
          // this instance may still be `ready` on a wire that is gone (B1). Rejects when the restart
          // ends `failed` (I1c R3), carrying that status's safe code, so the frame reports the Retry
          // as failed instead of as done.
          retry: async () => {
            const result = await follow(restart)
            if (result.state === PLUGIN.state.failed) throw unavailable(result.code ?? PLUGIN.code.failed)
          },
        })
      } catch (error) {
        connection = undefined
        logger?.warn('attach refused (%s)', error?.code ?? String(error))
        // `instance-busy` and `contract-version` fail the start (inst-OQ-03). The state is set
        // here, before the rethrow: the runtime then ends its attach and stops the child, whose
        // exit would otherwise report a `starting` instance as NATIVE_CHILD_EXITED (onExit above),
        // and start() below leaves a state that is no longer `starting` as it is. A stop that
        // began meanwhile keeps its own state. Any other refusal leaves the wire unbridged, as
        // before.
        if (Object.hasOwn(REFUSAL_CODE, error?.code)) {
          if (state === PLUGIN.state.starting) set(PLUGIN.state.failed, REFUSAL_CODE[error.code])
          throw error
        }
      }
    })
    // The admin transport comes up with each authenticated wire (and again after a restart); the
    // relay replaces whatever it held, so a reply can never cross instances.
    unsubscribeAdmin = owner.onAdminTransport((transport) => { if (!closed) admin.attach(transport) })
    // T16's provider-sync transport comes up on the same authenticated wire; a replaced
    // transport rejects whatever was in flight (the child restarted, so an answer is never
    // retried; the next Check previews afresh).
    unsubscribeProviderSync = owner.onProviderSyncTransport((transport, metadata) => {
      if (closed) return
      try { providerSync.attach(transport, metadata) } catch { /* the next wire replaces it */ }
    })
  } catch { set(PLUGIN.state.failed, PLUGIN.code.failed) }

  /** The state of an instance with no child: off, without the connector (D25), or stopped. */
  const idleState = () => (!enabled ? PLUGIN.state.disabled : connector === undefined ? PLUGIN.state.connectorMissing : PLUGIN.state.stopped)
  async function start() {
    if (closed || !owner) return status()
    if (!enabled) return set(PLUGIN.state.disabled)
    // Before main appReady an absent connector is not yet `connector-missing`: its row may still
    // be loading in the same boot. From appReady on, no child starts without it (D25).
    if (!appReady) return set(PLUGIN.state.waiting)
    if (connector === undefined) return set(PLUGIN.state.connectorMissing)
    if (startup) return startup
    startup = (async () => {
      set(PLUGIN.state.starting)
      try {
        await barrier
        if (closed) return status()
        await bounded(owner.start(), owner.limits.startupTimeoutMs)
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.ready)
      } catch {
        owner.parentExit()
        // Abort any late startup continuation; retained ownership prevents a duplicate.
        await owner.shutdown().catch(() => {})
        // A refused attach already left `starting` with its own code (the transport listener
        // above), so only another failure is NATIVE_START_FAILED; nothing restarts either by
        // itself (inst-OQ-03, inst-OQ-09).
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.failed)
      }
      return status()
    })().finally(() => { startup = undefined })
    return startup
  }
  async function stop() {
    if (!owner) return status()
    set(PLUGIN.state.stopping)
    try {
      await barrier
      await owner.shutdown()
      return set(idleState())
    } catch { return set(PLUGIN.state.failed, PLUGIN.code.stop) }
  }
  // The lifecycle's own restart, shared by the service and the admin relay (§9).
  async function restart() {
    const result = await stop()
    return result.state === PLUGIN.state.failed ? result : start()
  }
  /**
   * Queue one start or stop behind the earlier ones; a closed row runs nothing more.
   * @returns the action's own outcome; a failure there never breaks the queue.
   */
  function follow(action) {
    const run = toggle.then(() => (closed ? status() : action()))
    toggle = run.catch(() => {})
    return run
  }
  /**
   * Retry, for the instance's Plugins card and the connector's frame: a restart, only from
   * `failed` (design §0.5: Retry only with `failed`; inst-OQ-09: failed until Retry). Queued like
   * the switch and the connector's arrivals, so it never races them; in any other state it
   * changes nothing.
   * @returns {Promise<object>} the status once the retry has run.
   */
  function retry() {
    return follow(() => (state === PLUGIN.state.failed ? restart() : status()))
  }
  function shutdown() {
    if (disposal) return disposal
    closed = true
    cancelReady()
    unsubscribe()
    unsubscribeAdmin()
    unsubscribeProviderSync()
    admin.close()
    providerSync?.close()
    // Disabling the instance ends its attachment; the connector returns to no-instance mode
    // (contract §1.3, design §0.6).
    release()
    set(PLUGIN.state.stopping)
    // Do not swallow here: HMR successor awaits confirmed teardown, not a UI status.
    disposal = (async () => {
      try {
        await barrier
        if (owner) await owner.shutdown()
        set(enabled ? PLUGIN.state.stopped : PLUGIN.state.disabled)
        process.off('exit', onProcessExit)
      } catch {
        set(PLUGIN.state.failed, PLUGIN.code.stop)
        throw unavailable(PLUGIN.code.stop)
      }
    })()
    disposal.catch(() => {})
    return disposal
  }
  // rc.3 already owns SIGTERM/SIGINT and appExit, and awaits fiber disposal.
  // Do not install competing signal handlers. Explicit process.exit only allows
  // synchronous EOF; the pre-CLI child preload performs graceful bounded exit.
  const onProcessExit = () => owner?.parentExit()
  process.on('exit', onProcessExit)
  registry.set(key, { shutdown })
  ctx.effect(() => shutdown, PLUGIN.cleanup)
  const service = Object.freeze({
    status, start, stop, restart, retry,
    // T12's settings routes reach the child only through this relay (§9).
    admin,
    // The "Model for Fishball" API (§10, D26): status, Check and Add. The bridge's attach/request
    // stay private to this row, so no other row can talk to the child target.
    providerSync: Object.freeze({
      status: () => providerSync.status(),
      check: () => providerSync.check(),
      add: (payload) => providerSync.add(payload),
    }),
    async health() {
      if (closed || !owner || state !== PLUGIN.state.ready) return status()
      try {
        const health = await bounded(owner.health(), PLUGIN.requestTimeoutMs)
        if (health.state !== PLUGIN.state.ready) set(PLUGIN.state.failed, PLUGIN.code.unavailable)
      } catch { set(PLUGIN.state.failed, PLUGIN.code.unavailable) }
      return status()
    },
    // The embed broker reads the child origin and bearer from main-process memory only (§3.2).
    embedAccess: () => owner.embedAccess(),
    // T09's approvals and T06's attachments are served by the connector's bridge through the
    // fishballConnector binding; an operation neither supplies answers unsupported-operation (§5.2).
  })
  ctx.provide(PLUGIN.service, service)
  registerEmbed(ctx, service)
  // T12's settings page reaches the child only through the admin relay (§9).
  registerAdminRoutes(ctx, service)
  // The model-sync routes (models/check, models/add) sit beside the admin routes and are subject
  // to the same owner-only Fetch registry and same-origin fence (§10).
  registerProviderSyncRoutes(ctx, service)
  registerNativeWeb(ctx, service)
  // The one-time copy from the old row runs first (DSH writes settings only for an active row, so
  // not during apply); it may change `enabled`, which the volatile-update handler below follows.
  cancelReady = ctx.appReady.onReady(() => {
    void migrateLaunchSettings(ctx, { namespace: PLUGIN.name, schema: Config }).then(() => {
      appReady = true
      if (enabled && !closed) void start()
    })
  })
  // DSH's form writes `enabled` as a volatile field, so the row is not reloaded; the loader only
  // refreshes the live value and emits this event. Follow it as the row switch would: off stops
  // the child (state disabled), on starts it once main is ready.
  ctx.on(PLUGIN.volatileUpdate, () => {
    const next = fieldValue(config.enabled) !== false
    if (next === enabled || closed) return
    enabled = next
    // Disabling detaches first (design §0.6), so the connector shows no instance: a channel that
    // ends without detach() keeps this instance's status in the connector's frame (contract §1.3),
    // which is what a dead child and a restart want, but not a disable.
    if (!enabled) release()
    follow(() => (enabled ? start() : stop()))
  })
  // The connector's service arriving starts the instance and its leaving stops the child, with no
  // main restart either way (§0.6, inst-OQ-02). Its departure has already closed the attached
  // transport (contract §1.3); the stop ends the child itself and leaves `connector-missing`.
  followConnector(ctx, {
    appeared(service) {
      connector = service
      follow(start)
    },
    disappeared() {
      connector = undefined
      release()
      // A start still waiting for readiness is ended now, not after that wait: parentExit is the
      // first step of the stop's own shutdown, taken early. Leaving `starting` first keeps the
      // interrupted start from reporting itself as NATIVE_START_FAILED.
      if (state === PLUGIN.state.starting) { set(PLUGIN.state.stopping); owner?.parentExit() }
      follow(stop)
    },
  })
}
