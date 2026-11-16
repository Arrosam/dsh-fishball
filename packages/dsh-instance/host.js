/**
 * The dsh-instance row (was native-host.js): starts the built-in instance's private child DSH
 * after main appReady; failure never aborts main boot.
 *
 * I-HOST (requirements 1.28 R1, 1.33 Q-D1, 1.39, 1.41 Q-G3/Q-G6/Q-G7): it also provides the K3
 * child locator `dshInstanceChild` (src/host/locator.js), sets up the hosted token once at the
 * child's first start and on Reconnect (src/host/hosted.js), supplies the child its target URL
 * (the child-side row's `targetUrl`), and serves its own settings page's routes (src/host/routes.js).
 * It imports no Fishball-side code (R-ARCH-10).
 */
import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { LIFETIME, HOSTED, LOCATOR, CHILD_STATE, LIFECYCLE_CODE, PLACEMENT } from './src/native-runtime/constants.js'
import { pathsFor } from './src/native-runtime/files.js'
import { createCredentialClient } from './src/native-runtime/credential.js'
import { publicStatus } from './src/native-web.js'
import { openHostedRecord } from './src/host/hosted-record.js'
import { childTargetUrl, createHostedToken } from './src/host/hosted.js'
import { createChildLocator } from './src/host/locator.js'
import { registerInstanceRoutes } from './src/host/routes.js'
import { createSettingsRelayServer } from './src/slim/settings-relay.js'
import { registerAdminRoutes } from './src/slim/host/settings-routes.js'
import { registerProviderSyncRoutes } from './src/slim/host/provider-sync-routes.js'
import { createChildProviderSync } from './src/provider-sync-service.js'
import { createAdminRelay } from './src/slim/host/admin.js'
import { migrateLaunchSettings } from './src/settings-migration.js'
import { launchDetail, launchStatus } from './src/host/launch-detail.js'

const PLUGIN = Object.freeze({
  // The row id is the plugin's name (design §0.2, D22); the service keeps its name for its callers.
  name: 'dsh-instance', service: 'nativeFishballRuntime',
  // Every service this row's ctx reads as a property must be listed: Cordis's context proxy
  // throws `cannot get property "<name>" without inject` for any other (0.2.1-rc.5 and
  // 0.2.2-rc.1 alike); ctx.get() is the only unchecked read. Each one below has the same name
  // in both versions and is a dsh-base row there, so none is optional. Neither version has an
  // optional inject form anyway: every listed key gates activation.
  dependencies: ['profileContext', 'workspaceRegistry', 'sessions', 'sessionController', 'agents', 'appReady', 'connection', 'webServer',
    // B9: the provider-sync source host is built on this row's ctx (createChildProviderSync) and
    // reads llm, settings, configEditor, credentials and authorization (dsh-connector-shared/provider-sync-host).
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
  state: CHILD_STATE,
  // Between a failed start's specific code and its message in the card's detail.
  detailSeparator: ': ',
  // The row's log line for a failed start: its specific code only, never the message (bug 2).
  startFailedLog: 'start failed (%s)',
  // The hosted record could not be read: Reconnect and the import stay unavailable (src/host/hosted-record.js).
  hostedRecordFailed: 'hosted record unreadable (%s)',
  code: LIFECYCLE_CODE,
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
  // R-HOST-05: the target, blank for a connector in this DSH; no token or credential reference
  // (1.31). Read at each child start, so a change applies at the next start.
  [HOSTED.targetField]: Schema.string().default('').volatile().description('The MCP endpoint of a remote DSH connector for Fishball to link to. Leave blank to use the connector in this DSH. Applies at the next start of the instance.'),
})
const unavailable = code => Object.assign(new Error(code), { code })
/** The page `Open Fishball` opens (K3 `AdmitView`): the child's Fishball page (Q-G3; the user's answer Q7 = A). */
const OPEN_VIEW = 'chat'
/** The hosted record, in the runtime folder under the main home (files.js pathsFor). */
const HOSTED_RECORD = (home) => path.join(pathsFor(home).root, HOSTED.record.file)
/**
 * The card's detail for a failed start: the specific code, then the failure's own first message
 * line when it has one beyond the code. Only the message text is handed on (never the error
 * object's other fields), so all of it passes main's public sanitizer (launchDetail).
 */
function startFailureDetail(error) {
  const code = typeof error?.code === 'string' ? error.code : undefined
  const message = typeof error?.message === 'string' ? error.message : ''
  // Node's system errors already start with their code ('ENOENT: no such file ...'): no repeat.
  const named = code === undefined || message.startsWith(code)
  const parts = named ? [message || code] : [code, message]
  return launchDetail({ message: parts.filter(Boolean).join(PLUGIN.detailSeparator) })
}
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
  const remoteTarget = () => {
    const value = fieldValue(config[HOSTED.targetField])
    return typeof value === 'string' ? value : ''
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(PLUGIN.name) : undefined
  let state = enabled ? PLUGIN.state.waiting : PLUGIN.state.disabled
  let code = null
  /**
   * A failed start's cause for the card (V1 rule: sanitized, at most 2000 characters,
   * src/host/launch-detail.js): `<specific code>: <first message line>`. The contract `code` stays
   * the safe NATIVE_START_FAILED; null whenever the state is not a failed start.
   */
  let detail = null
  /**
   * Serializes the starts and stops that follow the `enabled` switch, in the order they happened.
   */
  let toggle = Promise.resolve()
  let closed = false
  let appReady = false
  let owner
  let startup
  let disposal
  let cancelReady = () => {}
  let unsubscribeAdmin = () => {}
  let unsubscribeProviderSync = () => {}
  let unsubscribeSettings = () => {}
  /** T16's source side: syncs the main profile's API-key providers into the child's own target. */
  let providerSync
  /** The current wire's hosted-token channel (credential.js), or undefined. */
  let credentialClient
  let unsubscribeCredential = () => {}
  /** Listeners of the locator's onChange (K3: status, origin or target status changed). */
  const changeListeners = new Set()
  const changed = () => { for (const listener of [...changeListeners]) { try { listener() } catch { /* one listener never stops the others */ } } }
  /** The connector's hosted-token service, looked up per call (K3: never through inject). */
  const connectorTokens = () => ctx.get(HOSTED.tokensService)
  /** This DSH's own web origin, for the child's link to its connector; undefined before it listens. */
  const hostOrigin = () => { try { return ctx.webServer.getOrigin() } catch { return undefined } }
  /**
   * The hosted-token rules once the record is read (src/host/hosted.js). `hostedNow` is set when
   * that resolves; before it, Reconnect answers not-ready and the target status reads target-unset.
   */
  let hostedNow
  const hostedReady = openHostedRecord(HOSTED_RECORD(ctx.profileContext.home)).then((record) => {
    hostedNow = createHostedToken({
      tokens: connectorTokens,
      record,
      credentials: () => credentialClient,
      instanceId: () => owner?.hostId,
      remoteTarget,
      changed: () => changed(),
    })
    return hostedNow
  }, (error) => { logger?.warn(PLUGIN.hostedRecordFailed, error?.code ?? PLUGIN.code.failed); return undefined })
  const hostedProxy = Object.freeze({
    reconnect: async () => (await hostedReady)?.reconnect() ?? { ok: false, code: HOSTED.reconnect.notReady },
    targetStatus: () => hostedNow?.targetStatus() ?? HOSTED.target.unset,
    retryNotice: () => hostedNow?.retryNotice() ?? false,
  })
  const status = () => launchStatus({ enabled, state, code, detail })
  /**
   * The first bundle that blocked the last start (K3 `ChildStatus.plugin`, R-BND-03), or undefined.
   * Kept beside the code, so it is cleared with it.
   */
  let plugin
  /** The locator's K3 `ChildStatus`: the state and code, and the blocking bundle with `PROFILE_INCOMPATIBLE`. */
  const locatorStatus = () => (plugin === undefined ? { state, code } : { state, code, plugin })
  const set = (next, nextCode = null, nextDetail = null, nextPlugin = undefined) => { state = next; code = nextCode; detail = nextDetail; plugin = nextPlugin; changed(); return status() }
  /** A failed start (bug 2): the row's log names its specific code; the status carries its cause. */
  const failStart = (error, failedCode) => {
    logger?.warn(PLUGIN.startFailedLog, error?.code ?? PLUGIN.code.failed)
    return set(PLUGIN.state.failed, failedCode, startFailureDetail(error), failedCode === PLUGIN.code.incompatible ? error?.[PLACEMENT.pluginField] : undefined)
  }
  // T11's admin relay. Every page operation except status and restart travels to the child over
  // the lifecycle wire's own authenticated admin channel; the child applies it with its own
  // services, so the main process never writes a child file (§9). T12's routes call
  // service.admin.request(operation, payload).
  const admin = createAdminRelay({ status, restart })
  /**
   * The child's slim settings panel reaches this row for lifecycle requests only. Model sync is not
   * among them: only the owner's click in the main DSH's "Model for Fishball" block starts one
   * (service.providerSync below, behind the main owner routes), never a request from the child
   * (the user's decision of 2026-11-11, docs/planning/v2-set.md). The relay has no sync op, so no
   * code in the child process can check or copy the main DSH's providers through it.
   */
  const settingsRelay = createSettingsRelayServer({
    status: () => publicStatus(status()),
    retry: async () => publicStatus(await retry()),
    restart: async () => publicStatus(await follow(restart)),
  })
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
      // The child-side row's target at each start (R-HOST-05): this DSH's connector endpoint, or
      // the remote target the instance names. A URL, never a token.
      child: () => ({ [HOSTED.targetField]: childTargetUrl({ instanceTargetUrl: remoteTarget(), hostOrigin: hostOrigin(), connectorUsable: connectorTokens()?.apiVersion === HOSTED.apiVersion }) }),
      onExit() { if (state === PLUGIN.state.ready || state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.exited) },
    })
    // No V2 connector binding (I-HOST, user decision 2026-11-16: "现在第二版根本没有实际部署的情况，
    // 把它当作一次发布前的设计变更，第三版其实就是第一版"): the control channel the V2 session bridge
    // used is no longer attached here. Core links to its target over MCP instead (design §6.3).
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
    // SET: the child's slim settings panel asks this row for status, Retry and Restart
    // (src/slim/settings-relay.js). Restart is queued like every other start and stop; its answer
    // is usually lost with the child it replaces, which the panel expects.
    unsubscribeSettings = owner.onInstanceSettingsTransport((transport) => {
      if (closed) return
      try { settingsRelay.attach(transport) } catch { /* the next wire replaces it */ }
    })
    // The hosted token's channel comes up with each authenticated wire; the first-start rule runs
    // once per wire (a restart is a new wire, and then the child holds its credential already).
    unsubscribeCredential = owner.onCredentialTransport((transport) => {
      if (closed) return
      credentialClient?.close()
      credentialClient = createCredentialClient(transport, { timeoutMs: LIFECYCLE_LIMITS.requestTimeoutMs })
      changed()
      void hostedReady.then((hosted) => hosted?.firstStart()).catch(() => {})
    })
  } catch (error) { failStart(error, PLUGIN.code.failed) }

  /** The state of an instance with no child: off, or stopped. */
  const idleState = () => (enabled ? PLUGIN.state.stopped : PLUGIN.state.disabled)
  /**
   * The code a failed start keeps: a non-canonical main home (D2) and an incompatible enabled
   * bundle (R-BND-03) are the failures the user can act on; every other one is the generic code.
   */
  const startFailureCode = (error) => ([PLUGIN.code.invalidMainHome, PLUGIN.code.incompatible].includes(error?.code) ? error.code : PLUGIN.code.failed)
  async function start() {
    if (closed || !owner) return status()
    if (!enabled) return set(PLUGIN.state.disabled)
    // The child starts after main appReady (R-HOST-02), with or without a connector in this DSH:
    // a remote target needs none, and without any target core reports `target-unset` itself.
    if (!appReady) return set(PLUGIN.state.waiting)
    if (startup) return startup
    startup = (async () => {
      set(PLUGIN.state.starting)
      try {
        await barrier
        if (closed) return status()
        await bounded(owner.start(), owner.limits.startupTimeoutMs)
        if (!closed && state === PLUGIN.state.starting) set(PLUGIN.state.ready)
      } catch (error) {
        owner.parentExit()
        // Abort any late startup continuation; retained ownership prevents a duplicate.
        await owner.shutdown().catch(() => {})
        // Nothing restarts by itself (inst-OQ-03, inst-OQ-09). The specific cause goes to the row's
        // log and the status's detail (bug 2).
        if (!closed && state === PLUGIN.state.starting) {
          failStart(error, startFailureCode(error))
        } else if (!closed && state === PLUGIN.state.failed && code === PLUGIN.code.exited) {
          // A child that dies during the start fires onExit (above) before the launch loop sees
          // the exit, so this start is already failed / NATIVE_CHILD_EXITED. Keep that canonical
          // code but still log and publish the start's cause, as main's host.js does.
          failStart(error, PLUGIN.code.exited)
        }
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
   * Retry, for the instance's settings page: a restart, only from `failed` (design §0.5: Retry only
   * with `failed`; inst-OQ-09: failed until Retry). Queued like the switch, so it never races it; in
   * any other state it changes nothing. The locator adds the hosted-entry notice rule (locator.js).
   * @returns {Promise<object>} the status once the retry has run.
   */
  function retry() {
    return follow(() => (state === PLUGIN.state.failed ? restart() : status()))
  }
  function shutdown() {
    if (disposal) return disposal
    closed = true
    cancelReady()
    unsubscribeCredential()
    credentialClient?.close()
    changeListeners.clear()
    unsubscribeAdmin()
    unsubscribeProviderSync()
    unsubscribeSettings()
    settingsRelay.close()
    admin.close()
    providerSync?.close()
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
    // The "Model for Fishball" API (§10, D26): status, Check and Add. Main-process only: its one
    // caller is the main card's owner routes (registerProviderSyncRoutes below); nothing from the
    // child reaches it. The bridge's attach/request stay private to this row, so no other row can
    // talk to the child target.
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
  })
  ctx.provide(PLUGIN.service, service)
  // The K3 locator (child.d.ts) for dsh-connector-ui, and the instance's own page routes.
  const locator = createChildLocator({
    lifecycle: { status: locatorStatus, onChange: (fn) => { changeListeners.add(fn); return () => changeListeners.delete(fn) }, retry: () => retry() },
    origin: () => owner?.childOrigin(),
    ticket: (claims) => owner.mintTicket(claims),
    hosted: hostedProxy,
    providerSync: service.providerSync,
  })
  ctx.provide(LOCATOR.service, locator)
  registerInstanceRoutes(ctx, {
    status,
    notice: () => hostedNow?.notice() ?? null,
    retry: async () => { await locator.retry(); return status() },
    reconnect: () => locator.reconnect(),
    open: async ({ hostname, lang }) => {
      try { return { ok: true, url: (await locator.admit({ view: OPEN_VIEW, lang, hostname })).url } } catch (error) { return { ok: false, code: error?.code ?? HOSTED.reconnect.failed } }
    },
  })
  // The V2 embed broker (src/slim/host/embed.js) is not registered: it served the V2 connector's
  // frame, which the locator's admission replaces (design §4.1); REMOVE-V2 deletes the module.
  // T12's settings page reaches the child only through the admin relay (§9).
  registerAdminRoutes(ctx, service)
  // The model-sync routes (models/check, models/add) sit beside the admin routes and are subject
  // to the same owner-only Fetch registry and same-origin fence (§10).
  registerProviderSyncRoutes(ctx, service)
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
    follow(() => (enabled ? start() : stop()))
  })
}
