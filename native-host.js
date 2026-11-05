/** Native lifecycle host: enabled on appReady; failure never aborts main boot. */
import Schema from '@deepseek-ai/schemastery'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { LIFETIME } from './src/native-runtime/constants.js'
import { DEFAULT_CONTROL_LIMITS } from './src/native-control/index.js'
import { registerNativeWeb } from './src/native-web.js'
import { registerEmbed } from './src/slim/host/embed.js'
import { registerAdminRoutes } from './src/slim/host/settings-routes.js'
import { registerProviderSyncRoutes } from './src/slim/host/provider-sync-routes.js'
import { createChildProviderSync } from './src/provider-sync-service.js'
import { ContractError, ERROR } from './src/slim/contract.js'
import { createBridgeHost } from './src/slim/host/bridge.js'
import { createSessionPort } from './src/slim/host/session-port.js'
import { createAdminRelay } from './src/slim/host/admin.js'
import { createApprovalRelay } from './src/slim/host/approvals.js'

const PLUGIN = Object.freeze({
  name: 'fishball-native-host', service: 'nativeFishballRuntime',
  dependencies: ['profileContext', 'workspaceRegistry', 'sessions', 'sessionController', 'agents', 'appReady', 'connection', 'webServer'],
  cleanup: 'fishball native host: stop owned child and retain private data',
  minimumLimit: 1,
  // Bound request/exit waits well inside rc.3's whole-app five-second grace.
  requestTimeoutMs: 750, stopTimeoutMs: 1000,
  state: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed' }),
  code: Object.freeze({ failed: 'NATIVE_START_FAILED', stop: 'NATIVE_STOP_FAILED', exited: 'NATIVE_CHILD_EXITED', unavailable: 'NATIVE_UNAVAILABLE', timeout: 'NATIVE_TIMEOUT', disabled: 'NATIVE_DISABLED' }),
})
const limitSchema = defaults => Schema.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
  [key, Schema.natural().min(PLUGIN.minimumLimit).default(value)])))
export const name = PLUGIN.name
export const inject = [...PLUGIN.dependencies]
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('Start the private native child after main appReady. Disable to stop it; private data is retained.'),
  nodeExecutable: Schema.string().required().description('Explicit absolute plain Node executable; never infer from Electron or PATH.'),
  executableSearchPath: Schema.string().required().description('Private PATH with absolute components only.'),
  // Kept for configuration compatibility only: the slim bridge authorizes a session through the
  // main Fishball row's managed registry (§5.2), not through this v1 allowlist. T15 retires it.
  managedSessionIds: Schema.array(Schema.string()).default([]).volatile().description('Retained for configuration compatibility; the slim bridge uses the main Fishball row\'s managed sessions.'),
  limits: limitSchema(RUNTIME_LIMITS),
  // The v1 control row no longer mounts; the bridge keeps its own ceilings (src/slim/host/bridge.js).
  // The key stays accepted so an installed profile config keeps loading.
  controlLimits: limitSchema(DEFAULT_CONTROL_LIMITS),
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
  const enabled = config.enabled !== false
  let state = enabled ? PLUGIN.state.waiting : PLUGIN.state.disabled
  let code = null
  let closed = false
  let appReady = false
  let owner
  let startup
  let disposal
  let cancelReady = () => {}
  const hosts = new Map()
  let connection
  let unsubscribe = () => {}
  let unsubscribeAdmin = () => {}
  let unsubscribeProviderSync = () => {}
  /** The bridge's session service: the main Fishball row's registries plus the DSH services its tools use. */
  let sessions
  /** T09's approval/question/prompt/grant operations and the cards they offer the child. */
  let approvals
  /** T16's source side: syncs the main profile's API-key providers into the child's own target. */
  let providerSync
  const status = () => ({ enabled, state, code })
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
    sessions = createSessionPort(ctx, { enabled: () => enabled && !closed })
    approvals = createApprovalRelay({ ctx, sessions })
    // T16: the child is the sync target. The source host reads the main profile's API-key
    // records only inside the sync's confirm step; the page never sees a value (§10).
    providerSync = createChildProviderSync({ ctx })
    owner = createNativeRuntime({
      mainHome: key, installAnchor: ctx.profileContext.installAnchor,
      nodeExecutable: config.nodeExecutable, executableSearchPath: config.executableSearchPath,
      get mainWorkspaces() { return ctx.workspaceRegistry.list().map(workspace => workspace.path) },
      limits: { ...config.limits,
        requestTimeoutMs: Math.min(config.limits?.requestTimeoutMs ?? RUNTIME_LIMITS.requestTimeoutMs, PLUGIN.requestTimeoutMs),
        stopTimeoutMs: Math.min(config.limits?.stopTimeoutMs ?? RUNTIME_LIMITS.stopTimeoutMs, PLUGIN.stopTimeoutMs),
      },
      control: { limits: config.controlLimits },
      onExit() { if (state === PLUGIN.state.ready || state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.exited) },
    })
    // One authenticated control transport, one envelope-v2 bridge. The v1 control row is gone,
    // so a foreign frame can no longer close the wire (src/slim/host/bridge.js's receive rule).
    unsubscribe = owner.onControlTransport((transport, { hostId, connectionId }) => {
      if (closed) throw unavailable(PLUGIN.code.unavailable)
      if (hostId !== owner.hostId) throw new ContractError(ERROR.host)
      let host = hosts.get(hostId)
      if (!host) {
        host = createBridgeHost({ hostId, sessions })
        // The nine T09 operations enter this host's welcome; the relay also re-offers the live
        // cards on every new connection (the host never replays an answer).
        approvals.attach(host)
        hosts.set(hostId, host)
      }
      connection?.close()
      connection = host.attach(transport, { connectionId })
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
      try {
        await barrier
        if (closed) return status()
        await bounded(owner.start(), owner.limits.startupTimeoutMs)
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.ready)
      } catch {
        owner.parentExit()
        // Abort any late startup continuation; retained ownership prevents a duplicate.
        await owner.shutdown().catch(() => {})
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
    approvals?.close()
    providerSync?.close()
    for (const host of hosts.values()) host.close()
    hosts.clear(); connection = undefined
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
    // T09's approvals, questions, prompts and grants are registered on each host by the relay;
    // T06's attachment.read/put come from the session port's image port. An operation neither
    // supplies answers unsupported-operation (§5.2).
  })
  ctx.provide(PLUGIN.service, service)
  registerEmbed(ctx, service)
  // T12's settings page reaches the child only through the admin relay (§9).
  registerAdminRoutes(ctx, service)
  // T16's provider-sync route sits beside the admin routes and is subject to the same
  // owner-only Fetch registry and same-origin fence (§10).
  registerProviderSyncRoutes(ctx, service)
  registerNativeWeb(ctx, service)
  cancelReady = ctx.appReady.onReady(() => { appReady = true; if (enabled && !closed) void start() })
}
