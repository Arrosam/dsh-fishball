/** Native lifecycle host: enabled on appReady; failure never aborts main boot. */
import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { LIFETIME } from './src/native-runtime/constants.js'
import { CONTROL, ControlError, DEFAULT_CONTROL_LIMITS } from './src/native-control/index.js'
import { createNativeHostAdapter, NATIVE_HOST } from './src/native-host-adapter.js'
import { registerNativeWeb } from './src/native-web.js'

const PLUGIN = Object.freeze({
  name: 'fishball-native-host', service: 'nativeFishballRuntime',
  dependencies: ['profileContext', 'workspaceRegistry', 'sessions', 'sessionController', 'appReady', 'connection'],
  cleanup: 'fishball native host: stop owned child and retain private data',
  minimumLimit: 1,
  // Bound request/exit waits well inside rc.3's whole-app five-second grace.
  requestTimeoutMs: 750, stopTimeoutMs: 1000,
  state: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed' }),
  code: Object.freeze({ failed: 'NATIVE_START_FAILED', stop: 'NATIVE_STOP_FAILED', exited: 'NATIVE_CHILD_EXITED', unavailable: 'NATIVE_UNAVAILABLE', open: 'NATIVE_OPEN_FAILED', timeout: 'NATIVE_TIMEOUT', disabled: 'NATIVE_DISABLED' }),
})
const limitSchema = defaults => Schema.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
  [key, Schema.natural().min(PLUGIN.minimumLimit).default(value)])))
export const name = PLUGIN.name
export const inject = [...PLUGIN.dependencies]
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('Start the private native child after main appReady. Disable to stop it; private data is retained.'),
  nodeExecutable: Schema.string().required().description('Explicit absolute plain Node executable; never infer from Electron or PATH.'),
  executableSearchPath: Schema.string().required().description('Private PATH with absolute components only.'),
  managedSessionIds: Schema.array(Schema.string()).default([]).volatile().description('Exact locally authorized session IDs; empty denies every host session.'),
  limits: limitSchema(RUNTIME_LIMITS),
  controlLimits: limitSchema(DEFAULT_CONTROL_LIMITS),
})
const readValue = value => typeof value?.get === 'function' ? value.get() : value
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
  let currentHost
  let unsubscribe = () => {}
  const status = () => ({ enabled, state, code })
  const set = (next, nextCode = null) => { state = next; code = nextCode; return status() }
  const key = ctx.profileContext.home
  const predecessor = registry.get(key)
  // Start teardown immediately, before the new module can queue startup.
  const barrier = predecessor ? predecessor.shutdown() : Promise.resolve()
  barrier.catch(() => { if (!closed) set(PLUGIN.state.failed, PLUGIN.code.stop) })
  try {
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
    unsubscribe = owner.onControlTransport((transport, { hostId, instanceId, connectionId }) => {
      if (closed) throw unavailable(PLUGIN.code.unavailable)
      if (hostId !== owner.hostId || typeof instanceId !== 'string' || !instanceId) throw new ControlError(CONTROL.error.host)
      let host = hosts.get(hostId)
      if (!host) {
        host = createNativeHostAdapter(ctx, { hostId, managedSessionIds: () => readValue(config.managedSessionIds) ?? [], limits: config.controlLimits }, { createUserMessage })
        hosts.set(hostId, host)
      }
      connection?.close()
      connection = host.attach(transport, { connectionId, principalId: NATIVE_HOST.principalId })
      currentHost = host
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
  function shutdown() {
    if (disposal) return disposal
    closed = true
    cancelReady()
    unsubscribe()
    for (const host of hosts.values()) host.close()
    hosts.clear(); currentHost = undefined; connection = undefined
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
    status, start, stop,
    async restart() { const result = await stop(); return result.state === PLUGIN.state.failed ? result : start() },
    async health() {
      if (closed || !owner || state !== PLUGIN.state.ready) return status()
      try {
        const health = await bounded(owner.health(), PLUGIN.requestTimeoutMs)
        if (health.state !== PLUGIN.state.ready) set(PLUGIN.state.failed, PLUGIN.code.unavailable)
      } catch { set(PLUGIN.state.failed, PLUGIN.code.unavailable) }
      return status()
    },
    async openUrl() {
      if (closed || !owner || state !== PLUGIN.state.ready) throw unavailable(PLUGIN.code.unavailable)
      try {
        const url = await bounded(owner.openUrl(), PLUGIN.requestTimeoutMs)
        if (closed || state !== PLUGIN.state.ready) throw unavailable(PLUGIN.code.unavailable)
        return url
      }
      catch { throw unavailable(PLUGIN.code.open) }
    },
    registerApproval(input) {
      if (closed || !currentHost) throw new ControlError(CONTROL.error.disconnected)
      return currentHost.registerApproval(input)
    },
  })
  ctx.provide(PLUGIN.service, service)
  registerNativeWeb(ctx, service)
  cancelReady = ctx.appReady.onReady(() => { appReady = true; if (enabled && !closed) void start() })
}
