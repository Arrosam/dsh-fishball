/**
 * The fishball-instance row (was native-host.js): starts the built-in instance's private child DSH
 * after main appReady; failure never aborts main boot.
 */
import Schema from '@deepseek-ai/schemastery'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { LIFETIME } from './src/native-runtime/constants.js'
import { DEFAULT_CONTROL_LIMITS } from './src/native-control/index.js'
import { launchDefaults } from './src/native-runtime/node-default.js'
import { registerNativeWeb } from './src/native-web.js'
import { registerEmbed } from './src/slim/host/embed.js'
import { registerAdminRoutes } from './src/slim/host/settings-routes.js'
import { registerProviderSyncRoutes } from './src/slim/host/provider-sync-routes.js'
import { createChildProviderSync } from './src/provider-sync-service.js'
import { ContractError, ERROR } from './src/slim/contract.js'
import { createAdminRelay } from './src/slim/host/admin.js'
import { migrateLaunchSettings } from './src/settings-migration.js'

const PLUGIN = Object.freeze({
  // The row id is the plugin's name (design §0.2, D22); the service keeps its name for its callers.
  name: 'fishball-instance', service: 'nativeFishballRuntime',
  // INTERIM (M1): the connector's session bridge, read with ctx.get because the instance may import
  // nothing of the connector but ./contract. C1/I1 replace it with fishballConnector.attachInstance;
  // the connector names it in src/slim/host/interim-bridge.js (INTERIM_BRIDGE.service).
  bridgeService: 'fishballConnectorBridge',
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
  state: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed' }),
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
 * inst-OQ-04): the launch fields needed before the child exists. Volatile so DSH's Plugins form
 * can write them (§0.7); model sync is the "Model for Fishball" button I6 adds, an action rather
 * than a field, and there is no `providerSync` switch (D26).
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).volatile().description('Start the private native child after main appReady. Turning it off stops the child at once and turning it on starts it, as the row switch does; private data is retained.'),
  // Optional so a plain install starts the child (B2): unset means the first `node` on the host's
  // PATH, which the runtime still verifies as plain Node 22+ (src/native-runtime/node-default.js).
  nodeExecutable: Schema.string().volatile().description('Absolute plain Node 22+ executable for the private child. Empty: the first node on DSH\'s PATH (never Electron; it is verified before use). Applies at the next start.'),
  executableSearchPath: Schema.string().volatile().description('Private PATH for the child, absolute components only. Empty: that node\'s folder plus DSH\'s absolute PATH entries. Applies at the next start.'),
})
/**
 * A start refused because of a launch setting (decision 2026-11-07: no format check on save, a
 * clear error at start). The runtime's codes below are thrown only while it checks these two
 * settings (src/native-runtime/installation.js isolatedEnvironment and verifyNode), so each names
 * its setting; a file-system error counts only when its path is the executable itself. The detail
 * carries the setting's name and the path tried, never a token or key.
 */
const LAUNCH_ERROR = Object.freeze({
  searchPathCodes: Object.freeze(['INVALID_EXECUTABLE_PATH']),
  nodeCodes: Object.freeze(['INVALID_NODE', 'PROBE_FAILED', 'PROBE_TIMEOUT', 'PROBE_OUTPUT_LIMIT']),
  defaultNote: ' (default)',
  unset: '(none found)',
  detail: Object.freeze({
    nodeExecutable: (value) => `nodeExecutable: ${value} is not a plain Node 22+ executable that can be run.`,
    executableSearchPath: (value) => `executableSearchPath: ${value} must be a non-empty PATH of absolute directories.`,
  }),
  logger: 'fishball-instance',
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

/**
 * The launch settings for one start, read when the runtime asks (the getters below), so a value
 * saved in DSH's form applies at the next start without reloading the row.
 */
function launchSettings(config) {
  const configured = { nodeExecutable: fieldValue(config.nodeExecutable), executableSearchPath: fieldValue(config.executableSearchPath) }
  return { configured, launch: launchDefaults(configured, process.env.PATH) }
}
/** The detail of a start refused by a launch setting, or null for any other failure. */
function launchFailure(error, { configured, launch }) {
  const tried = (field) => (launch[field] ?? LAUNCH_ERROR.unset) + (configured[field] === undefined ? LAUNCH_ERROR.defaultNote : '')
  if (LAUNCH_ERROR.searchPathCodes.includes(error?.code)) return LAUNCH_ERROR.detail.executableSearchPath(tried('executableSearchPath'))
  if (LAUNCH_ERROR.nodeCodes.includes(error?.code) || (error?.path !== undefined && error.path === launch.nodeExecutable)) return LAUNCH_ERROR.detail.nodeExecutable(tried('nodeExecutable'))
  return null
}

export async function apply(ctx, config) {
  let enabled = fieldValue(config.enabled) !== false
  let state = enabled ? PLUGIN.state.waiting : PLUGIN.state.disabled
  let code = null
  /** Why the last start failed, when a launch setting was the cause (shown with the code). */
  let detail = null
  /** The settings the current start uses, so a failure names the values it actually tried. */
  let attempt = launchSettings(config)
  /** Serializes the `enabled` switch's starts and stops in the order the user toggled. */
  let toggle = Promise.resolve()
  const logger = ctx.logger(LAUNCH_ERROR.logger)
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
  const status = () => ({ enabled, state, code, detail })
  const set = (next, nextCode = null, nextDetail = null) => { state = next; code = nextCode; detail = nextDetail; return status() }
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
      // Read at each start (attempt is renewed in start()), so the form's values apply at the next start.
      get nodeExecutable() { return attempt.launch.nodeExecutable },
      get executableSearchPath() { return attempt.launch.executableSearchPath },
      get mainWorkspaces() { return ctx.workspaceRegistry.list().map(workspace => workspace.path) },
      limits: LIFECYCLE_LIMITS,
      control: { limits: DEFAULT_CONTROL_LIMITS },
      onExit() { if (state === PLUGIN.state.ready || state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.exited) },
    })
    // One authenticated control transport, one envelope-v2 bridge, now hosted by the connector row
    // (interim, M1). Without the connector the wire stays up unbridged: a throw here would fail the
    // whole start (src/native-runtime/index.js attach), whereas before M1 a missing main row only
    // made the bridge's operations answer feature-off. Defining connector-missing is I1's (§0.6).
    unsubscribe = owner.onControlTransport((transport, { hostId, connectionId }) => {
      if (closed) throw unavailable(PLUGIN.code.unavailable)
      if (hostId !== owner.hostId) throw new ContractError(ERROR.host)
      connection?.close(); connection = undefined
      const bridge = ctx.get(PLUGIN.bridgeService)
      if (typeof bridge?.open === 'function') connection = bridge.open(transport, { hostId, connectionId })
    })
    // The admin transport comes up with each authenticated wire (and again after a restart); the
    // relay replaces whatever it held, so a reply can never cross instances.
    unsubscribeAdmin = owner.onAdminTransport((transport) => { if (!closed) admin.attach(transport) })
    // T16's provider-sync transport comes up on the same authenticated wire; a replaced
    // transport rejects whatever was in flight (the child restarted, so an answer is never
    // retried; the next Refresh models previews afresh).
    unsubscribeProviderSync = owner.onProviderSyncTransport((transport, metadata) => {
      if (closed) return
      try { providerSync.attach(transport, metadata) } catch { /* the next wire replaces it */ }
    })
  } catch { set(PLUGIN.state.failed, PLUGIN.code.failed) }

  async function start() {
    if (closed || !owner) return status()
    if (!enabled) return set(PLUGIN.state.disabled)
    if (!appReady) return set(PLUGIN.state.waiting)
    if (startup) return startup
    startup = (async () => {
      set(PLUGIN.state.starting)
      attempt = launchSettings(config)
      try {
        await barrier
        if (closed) return status()
        await bounded(owner.start(), owner.limits.startupTimeoutMs)
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.ready)
      } catch (error) {
        owner.parentExit()
        // Abort any late startup continuation; retained ownership prevents a duplicate.
        await owner.shutdown().catch(() => {})
        const reason = launchFailure(error, attempt)
        if (reason !== null) logger.warn('%s: %s', PLUGIN.code.failed, reason)
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.failed, reason)
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
      return set(enabled ? PLUGIN.state.stopped : PLUGIN.state.disabled)
    } catch { return set(PLUGIN.state.failed, PLUGIN.code.stop) }
  }
  // The lifecycle's own restart, shared by the service and the admin relay (§9).
  async function restart() {
    const result = await stop()
    return result.state === PLUGIN.state.failed ? result : start()
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
    connection?.close(); connection = undefined
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
    status, start, stop, restart,
    // T12's settings routes reach the child only through this relay (§9).
    admin,
    // T16's provider-sync page API (§10): only status and the one-step sync. The bridge's
    // attach/request stay private to this row, so no other row can talk to the child target.
    providerSync: Object.freeze({
      status: () => providerSync.status(),
      sync: () => providerSync.sync(),
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
    // T09's approvals and T06's attachments are served by the connector's bridge (interim, M1);
    // an operation neither supplies answers unsupported-operation (§5.2).
  })
  ctx.provide(PLUGIN.service, service)
  registerEmbed(ctx, service)
  // T12's settings page reaches the child only through the admin relay (§9).
  registerAdminRoutes(ctx, service)
  // T16's provider-sync route sits beside the admin routes and is subject to the same
  // owner-only Fetch registry and same-origin fence (§10).
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
  // the child (state disabled), on starts it once main is ready. The path fields need nothing
  // here: the runtime reads them at the next start.
  ctx.on(PLUGIN.volatileUpdate, () => {
    const next = fieldValue(config.enabled) !== false
    if (next === enabled || closed) return
    enabled = next
    toggle = toggle.then(() => (closed ? status() : enabled ? start() : stop())).catch(() => {})
  })
}
