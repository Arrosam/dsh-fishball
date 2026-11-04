/** Explicit opt-in native runtime host. The legacy index.js is not imported. */
import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { CONTROL, ControlError, DEFAULT_CONTROL_LIMITS } from './src/native-control/index.js'
import { createNativeHostAdapter, NATIVE_HOST } from './src/native-host-adapter.js'

const PLUGIN = Object.freeze({
  name: 'fishball-native-host',
  service: 'nativeFishballRuntime',
  dependencies: Object.freeze(['profileContext', 'workspaceRegistry', 'sessions', 'sessionController']),
  cleanup: 'fishball native host: detach control (retain child and private data)',
  minimumLimit: 1,
  config: Object.freeze({
    nodeExecutable: 'Explicit absolute Node executable. Never infer Node from Electron or PATH.',
    executableSearchPath: 'Explicit PATH for the private runtime; every component must be absolute.',
    managedSessionIds: 'Exact host-local session IDs this runtime may control. Empty denies every session; no remote grants.',
    autoStart: 'Explicitly start or reattach when this row loads. Default is no child startup.',
    limits: 'Native lifecycle resource limits.',
    controlLimits: 'Narrow control-channel resource limits, not permissions.',
  }),
})
const limitSchema = (defaults) => Schema.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
  [key, Schema.natural().min(PLUGIN.minimumLimit).default(value)])))

export const name = PLUGIN.name
export const inject = [...PLUGIN.dependencies]
export const Config = Schema.object({
  nodeExecutable: Schema.string().required().description(PLUGIN.config.nodeExecutable),
  executableSearchPath: Schema.string().required().description(PLUGIN.config.executableSearchPath),
  managedSessionIds: Schema.array(Schema.string()).default([]).description(PLUGIN.config.managedSessionIds).volatile(),
  autoStart: Schema.boolean().default(false).description(PLUGIN.config.autoStart),
  limits: limitSchema(RUNTIME_LIMITS).description(PLUGIN.config.limits),
  controlLimits: limitSchema(DEFAULT_CONTROL_LIMITS).description(PLUGIN.config.controlLimits),
})
const readValue = (value) => typeof value?.get === 'function' ? value.get() : value
const unavailable = () => { throw new ControlError(CONTROL.error.disconnected) }

/** The service is host-local; this plugin registers no remote route or tool proxy. */
export async function apply(ctx, config) {
  const options = {
    // Verified public ProfileContext.home is the DSH home, not profileContext.dir.
    mainHome: ctx.profileContext.home,
    installAnchor: ctx.profileContext.installAnchor,
    nodeExecutable: config.nodeExecutable,
    executableSearchPath: config.executableSearchPath,
    // Re-read real registry paths on every lifecycle preflight, not profile cwd.
    get mainWorkspaces() { return ctx.workspaceRegistry.list().map(workspace => workspace.path) },
    limits: config.limits,
    control: { limits: config.controlLimits },
  }
  const owner = createNativeRuntime(options)
  const hosts = new Map()
  let connection
  let currentHost
  let closed = false
  const unsubscribe = owner.onControlTransport((transport, { hostId, instanceId, connectionId }) => {
    if (closed) unavailable()
    if (hostId !== owner.hostId || typeof instanceId !== 'string' || !instanceId) throw new ControlError(CONTROL.error.host)
    // Host epoch/dedupe belongs to this main process and durable host ID, not a
    // transient child instance. A reconnect must not create a fresh message ledger.
    let host = hosts.get(hostId)
    if (!host) {
      host = createNativeHostAdapter(ctx, {
        hostId, managedSessionIds: () => readValue(config.managedSessionIds) ?? [], limits: config.controlLimits,
      }, { createUserMessage })
      hosts.set(hostId, host)
    }
    connection?.close()
    connection = host.attach(transport, { connectionId, principalId: NATIVE_HOST.principalId })
    currentHost = host
  })
  const invoke = (method) => {
    if (closed) unavailable()
    return owner[method]()
  }
  const service = Object.freeze({
    start: () => invoke('start'),
    stop: () => invoke('stop'),
    restart: () => invoke('restart'),
    health: () => invoke('health'),
    openUrl: () => invoke('openUrl'),
    registerApproval(input) {
      if (closed || !currentHost) unavailable()
      return currentHost.registerApproval(input)
    },
  })
  ctx.effect(() => () => {
    closed = true
    unsubscribe()
    for (const host of hosts.values()) host.close()
    hosts.clear()
    currentHost = undefined
    connection = undefined
    // Main restarts must not stop the independent runtime. Explicit stop remains
    // available on the service before disable/upgrade; no private state is removed.
    return owner.detach()
  }, PLUGIN.cleanup)
  ctx.provide(PLUGIN.service, service)
  if (config.autoStart === true) await service.start()
}
