/**
 * The dsh-instance row (was native-host.js): starts the built-in instance's private child DSH
 * after main appReady; failure never aborts main boot.
 *
 * I-HOST (requirements 1.28 R1, 1.33 Q-D1, 1.39, 1.41 Q-G3/Q-G6/Q-G7): it also provides the K3
 * child locator `dshInstanceChild` (src/host/locator.js), sets up the hosted token once at the
 * child's first start and on Reconnect, and finishes a reinstall's succession (src/host/hosted.js,
 * I-SUCCEED), supplies the child its target URL
 * (the child-side row's `targetUrl`), and serves its own settings page's routes (src/host/routes.js).
 * It imports no Fishball-side code (R-ARCH-10).
 */
import path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { createNativeRuntime, RUNTIME_LIMITS } from './src/native-runtime/index.js'
import { INSTANCE_PACKAGE, LIFETIME, HOSTED, LOCATOR, LOOPBACK, CHILD_STATE, LIFECYCLE_CODE, PLACEMENT, REFUSAL, RUNTIME } from './src/native-runtime/constants.js'
import { ensureFishballDirectory, existingLayout, pathsFor, privateDirectory } from './src/native-runtime/files.js'
import { createCredentialClient } from './src/native-runtime/credential.js'
import { createChildModelClient } from './src/native-runtime/child-model.js'
import { openHostedRecord } from './src/host/hosted-record.js'
import { childTargetUrl, createHostedToken, usableTokens } from './src/host/hosted.js'
import { createChildLocator } from './src/host/locator.js'
import { registerInstanceRoutes } from './src/host/routes.js'
import { registerProviderSyncRoutes } from './src/host/provider-sync-routes.js'
import { CHILD_PLUGINS, createChildPlugins } from './src/host/child-plugins.js'
import { registerChildPluginRoutes } from './src/host/child-plugin-routes.js'
import { createChildProviderSync, CHILD_SYNC } from './src/provider-sync-service.js'
import { createInitialSync } from './src/host/initial-sync.js'
import { createOnboarding } from './src/host/onboarding.js'
import { registerOnboardingRoutes } from './src/host/onboarding-routes.js'
import { launchDetail, launchStatus } from './src/host/launch-detail.js'

const PLUGIN = Object.freeze({
  // The row id is the plugin's name (design §0.2, D22); the service keeps its name for its callers.
  name: INSTANCE_PACKAGE, service: 'nativeFishballRuntime',
  // Every service this row's ctx reads as a property must be listed: Cordis's context proxy
  // throws `cannot get property "<name>" without inject` for any other (0.2.1-rc.5 and
  // 0.2.2-rc.1 alike); ctx.get() is the only unchecked read. Each one below has the same name
  // in both versions and is a dsh-base row there, so none is optional. Neither version has an
  // optional inject form anyway: every listed key gates activation.
  // R-ARCH-05: no service that reads or writes sessions, approvals, questions or prompts. The V2
  // binding's `sessions`, `sessionController` and `agents` left with it (I-HOST); the model-sync
  // source never calls the catalog read `verify`, which only the child's target runs.
  dependencies: ['profileContext', 'workspaceRegistry', 'appReady', 'connection', 'webServer',
    // B9: the provider-sync source host is built on this row's ctx (createChildProviderSync) and
    // reads llm, settings, configEditor, credentials and authorization (src/lib/provider-sync-host.js).
    // dsh-base turns settings/configEditor off only without profileContext, which is required
    // above anyway.
    'llm', 'settings', 'configEditor', 'credentials', 'authorization',
    // No storage-domain service: it held only the V2 launch-settings migration's marker (Q-M1:
    // V3 is a fresh install, so I-READY removed the migration).
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
})
const unavailable = code => Object.assign(new Error(code), { code })
/**
 * The hosted record, beside the runtime folder under the main home (hosted-record.js says why).
 * Only through the runtime layout's own proof of that folder (ensureFishballDirectory): an aliased
 * main home is refused before anything is read or created there (R-FIX-INSTANCE F08), and an
 * existing user-owned non-group/world-writable `<home>/fishball` (e.g. a `0755` leftover from a
 * pre-V3 release) is safely tightened to `0700` so `openHostedRecord` never fails while the child
 * boots cleanly.
 */
const hostedRecordFile = async (home) => path.join(await ensureFishballDirectory(home), HOSTED.record.file)
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
// Symbol.for survives ESM/HMR module replacement. A failed stop stays a barrier for automatic
// startup so a successor never silently takes over an uncertain live child; explicit stop/retry/
// restart or a later HMR shutdown re-verifies the predecessor instead of poisoning the process.
const registry = globalThis[Symbol.for(LIFETIME.registryKey)] ??= new Map()

export async function apply(ctx, config) {
  let enabled = fieldValue(config.enabled) !== false
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
  /** Counts the stops, so a start can tell whether a stop came after a startup began (F07). */
  let stops = 0
  /** The stop count `startup` began under. */
  let startupStops
  let disposal
  let cancelReady = () => {}
  let unsubscribeProviderSync = () => {}
  /** T16's source side: syncs the main profile's API-key providers into the child's own target. */
  let providerSync
  /** The one automatic model-list sync of a new child (src/host/initial-sync.js). */
  let initialSync
  /** The current wire's hosted-token channel (credential.js), or undefined. */
  let credentialClient
  let unsubscribeCredential = () => {}
  /** The current wire's onboarding child-model channel (child-model.js), or undefined. */
  let childModelClient
  let unsubscribeChildModel = () => {}
  let unsubscribeChildModelClose = () => {}
  /** Listeners of the locator's onChange (K3: status, origin or target status changed). */
  const changeListeners = new Set()
  const changed = () => { for (const listener of [...changeListeners]) { try { listener() } catch { /* one listener never stops the others */ } } }
  /** The connector's hosted-token service, looked up per call (K3: never through inject). */
  const connectorTokens = () => ctx.get(HOSTED.tokensService)
  /**
   * This DSH's own web origin as the child on this machine reaches it: the loopback host with the
   * port it listens on, whatever address it is bound to (0.0.0.0, a LAN address), because core
   * refuses plain `http:` to any other name (D5). undefined before it listens.
   */
  const hostOrigin = () => {
    try {
      const origin = new URL(ctx.webServer.getOrigin())
      origin.hostname = RUNTIME.host
      return origin.origin
    } catch { return undefined }
  }
  /**
   * The hosted-token rules once the record is read (src/host/hosted.js). `hostedNow` is set when
   * that resolves; before it, Reconnect answers not-ready and the target status reads target-unset.
   */
  let hostedNow
  let hostedFailed = false
  const key = ctx.profileContext.home
  let predecessor = registry.get(key)
  let barrierFailed = false
  let barrier = Promise.resolve()
  const trackBarrier = (next) => {
    barrierFailed = false
    barrier = next
    next.then(
      () => { if (barrier === next) predecessor = undefined },
      () => {
        if (barrier === next) barrierFailed = true
        if (!closed) set(PLUGIN.state.failed, PLUGIN.code.stop)
      },
    )
    return next
  }
  // Start teardown immediately, before the new module can queue startup.
  if (predecessor) trackBarrier(predecessor.shutdown())
  const awaitBarrier = ({ retry = false } = {}) => {
    if (retry && barrierFailed && predecessor) return trackBarrier(predecessor.shutdown())
    return barrier
  }
  // Opened after the predecessor row is gone, whatever its shutdown's outcome: its record writes
  // have drained by then (shutdown awaits them), so its last write never lands on top of this row's
  // (R-FIX-INSTANCE F05). Each row keeps its own copy of the record.
  const hostedReady = barrier.catch(() => {}).then(() => hostedRecordFile(key)).then(openHostedRecord).then((record) => {
    // A row that shut down while the record was read starts nothing: its successor row decides.
    if (closed) return undefined
    hostedNow = createHostedToken({
      tokens: connectorTokens,
      record,
      credentials: () => credentialClient,
      instanceId: () => record.instanceId,
      // The child runtime folder's id (its owner marker, read at each start): new after a reinstall.
      runtimeId: () => owner?.hostId,
      changed: () => changed(),
      warn: (format, value) => logger?.warn(format, value),
    })
    // The locator's `agentEntry` reads the record from now on: announce it (K3 `onChange`), so
    // dsh-connector-ui re-reads which agent has a window here.
    changed()
    return hostedNow
  }, (error) => {
    logger?.warn(PLUGIN.hostedRecordFailed, error?.code ?? PLUGIN.code.failed)
    if (!closed) {
      hostedFailed = true
      changed()
    }
    return undefined
  })
  const hostedProxy = Object.freeze({
    reconnect: async () => (await hostedReady)?.reconnect() ?? { ok: false, code: REFUSAL.notReady },
    targetStatus: () => hostedNow?.targetStatus() ?? HOSTED.target.unset,
    // Before the record is read the child's entry is unknown, so no agent has a window yet.
    agentEntry: () => hostedNow?.agentEntry() ?? null,
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
  try {
    // Created once per host row and shared by every host object; a wiring failure is a native
    // failure, never a main-boot failure (the catch below keeps the row unready).
    // T16: the child is the sync target. The source host reads the main profile's API-key
    // records only inside the sync's confirm step; the page never sees a value (§10).
    providerSync = createChildProviderSync({ ctx })
    initialSync = createInitialSync({
      sync: providerSync,
      codes: { failed: CHILD_SYNC.code.failed, outcomeFailed: CHILD_SYNC.outcome.failed },
      root: () => pathsFor(ctx.profileContext.home).root,
      warn: (format, value) => logger?.warn(format, value),
    })
    owner = createNativeRuntime({
      mainHome: key, installAnchor: ctx.profileContext.installAnchor,
      // A packaged DSH supplies its own pnpm; the packed set's install runs it (placement.js installPackedSet).
      packageManager: ctx.profileContext.packageManager,
      get mainWorkspaces() { return ctx.workspaceRegistry.list().map(workspace => workspace.path) },
      limits: LIFECYCLE_LIMITS,
      // MULTI-2: only the actual parent is handed off here. Core reserves it first/read-only;
      // additional targets are configured inside Fishball and never affect parent credentials.
      child: () => ({ [HOSTED.targetField]: childTargetUrl({ hostOrigin: hostOrigin(), connectorUsable: usableTokens(connectorTokens()) !== undefined }) }),
      onExit() { if (state === PLUGIN.state.ready || state === PLUGIN.state.starting) set(PLUGIN.state.failed, PLUGIN.code.exited) },
    })
    // No V2 connector binding, admin relay or settings relay (I-HOST, I-READY; user decision
    // 2026-11-16: "现在第二版根本没有实际部署的情况，把它当作一次发布前的设计变更，第三版其实就是第一版",
    // and "Delete it" for the admin relay). Core links to its target over MCP (design §6.3).
    // T16's provider-sync transport comes up on the same authenticated wire; a replaced
    // transport rejects whatever was in flight (the child restarted, so an answer is never
    // retried; the next Check previews afresh).
    unsubscribeProviderSync = owner.onProviderSyncTransport((transport, metadata) => {
      if (closed) return
      try { providerSync.attach(transport, metadata) } catch { /* the next wire replaces it */ }
    })
    // The hosted token's channel comes up with each authenticated wire; the first-start rule runs
    // once per wire (a restart is a new wire, and then the child holds its credential already).
    // A connector that arrives after the child started is used at the next start or on Reconnect:
    // the child's `targetUrl` was written at launch (R-HOST-05: "applies at the next start").
    unsubscribeCredential = owner.onCredentialTransport((transport) => {
      if (closed) return
      credentialClient?.close()
      credentialClient = createCredentialClient(transport, { timeoutMs: LIFECYCLE_LIMITS.requestTimeoutMs, importTimeoutMs: LIFECYCLE_LIMITS.requestTimeoutMs + HOSTED.credentialLockWaitMs })
      changed()
      void hostedReady.then((hosted) => hosted?.firstStart()).catch(() => {})
    })
    unsubscribeChildModel = owner.onChildModelTransport((transport) => {
      if (closed) return
      unsubscribeChildModelClose()
      childModelClient?.close()
      // Model catalog reads can touch provider verification; give them the full runtime request bound.
      const next = createChildModelClient(transport, { timeoutMs: RUNTIME_LIMITS.requestTimeoutMs })
      childModelClient = next
      unsubscribeChildModelClose = transport.onClose(() => { if (childModelClient === next) childModelClient = undefined })
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
    // The child starts after main appReady (R-HOST-02), even without a parent connector:
    // core keeps its reserved parent entry not set rather than replacing it with a remote.
    if (!appReady) return set(PLUGIN.state.waiting)
    if (startup) {
      // A start already running is this start, unless a stop came since it began: that one is
      // aborted, and its cleanup may still run (off, then on before it ended: R-FIX-INSTANCE F07).
      // Then this start waits for it to settle and starts afresh, rather than end with its outcome.
      if (startupStops === stops) return startup
      await startup.catch(() => {})
      return start()
    }
    const current = (async () => {
      set(PLUGIN.state.starting)
      try {
        await awaitBarrier()
        if (closed) return status()
        await bounded(owner.start(), owner.limits.startupTimeoutMs)
        if (!closed && state === PLUGIN.state.starting) {
          set(PLUGIN.state.ready)
          // The child's provider-sync transport is attached by now (index.js attach). Not awaited:
          // the first-install model sync never holds up or fails a start (initial-sync.js).
          void initialSync.run()
        }
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
    })().finally(() => { if (startup === current) startup = undefined })
    startup = current
    startupStops = stops
    return startup
  }
  async function stop() {
    if (!owner) return status()
    stops++
    set(PLUGIN.state.stopping)
    try {
      await awaitBarrier({ retry: true })
      await owner.shutdown()
      return set(idleState())
    } catch { return set(PLUGIN.state.failed, PLUGIN.code.stop) }
  }
  // The lifecycle's own restart: a stop, then a start unless the stop failed.
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
  /**
   * Restart, for the settings page's Restart button and after a Fishball plugin change (design
   * §28): queued like the switch, so it never races a start or stop. A switched-off instance runs
   * nothing to restart: refused with REFUSAL.disabled, and a plugin change then applies at its next start.
   * @returns {Promise<object>} the status once the restart has run, with `refused` when refused.
   */
  function requestRestart() {
    return follow(() => (enabled ? restart() : { ...status(), refused: REFUSAL.disabled }))
  }
  let stopped = false
  let hostedDrained
  function shutdown() {
    if (stopped) return Promise.resolve()
    if (disposal) return disposal
    if (!closed) {
      closed = true
      cancelReady()
      unsubscribeCredential()
      credentialClient?.close()
      unsubscribeChildModel()
      unsubscribeChildModelClose()
      unsubscribeChildModelClose = () => {}
      childModelClient?.close()
      childModelClient = undefined
      // Its steps still running end here (the credential channel just closed, so none waits long);
      // the successor opens the record only after this disposal (below).
      hostedDrained = hostedNow?.close()
      changeListeners.clear()
      unsubscribeProviderSync()
      providerSync?.close()
      set(PLUGIN.state.stopping)
    }
    // Do not swallow here: HMR successor awaits confirmed teardown, not a UI status.
    const current = (async () => {
      try {
        await awaitBarrier({ retry: true })
        if (owner) await owner.shutdown()
        stopped = true
        if (registry.get(key) === entry) registry.delete(key)
        set(enabled ? PLUGIN.state.stopped : PLUGIN.state.disabled)
      } catch {
        set(PLUGIN.state.failed, PLUGIN.code.stop)
        throw unavailable(PLUGIN.code.stop)
      } finally {
        process.off('exit', onProcessExit)
        // Whatever the child's stop did: the record's open (a new record writes at once) and the
        // hosted steps still running finish before a successor opens its copy (F05). Neither rejects.
        // Not bounded: a step may be inside the connector's own createHosted or retire, in-process
        // calls with no wait of their own, and giving up on one would reopen F05's lost write.
        await hostedReady
        await hostedDrained
        if (!stopped && disposal === current) disposal = undefined
      }
    })()
    disposal = current
    current.catch(() => {})
    return current
  }
  // rc.3 already owns SIGTERM/SIGINT and appExit, and awaits fiber disposal.
  // Do not install competing signal handlers. Explicit process.exit only allows
  // synchronous EOF; the pre-CLI child preload performs graceful bounded exit.
  const onProcessExit = () => owner?.parentExit()
  process.on('exit', onProcessExit)
  const entry = { shutdown }
  registry.set(key, entry)
  ctx.effect(() => shutdown, PLUGIN.cleanup)
  const service = Object.freeze({
    status, start, stop, restart, retry,
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
  // The child's plugins, managed from here (design §28): DSH's plugin manager for the child
  // profile, mounted on first use, and the Fishball tab's routes.
  const childPlugins = createChildPlugins({ ctx, restart: requestRestart, enabled: () => enabled, warn: (format, ...values) => logger?.warn(format, ...values) })
  registerChildPluginRoutes(ctx, childPlugins)
  registerInstanceRoutes(ctx, {
    status,
    // Surface an unreadable hosted record whenever the instance itself is not already failed
    // (otherwise the instance reports "running" while never pairing or appearing in the sidebar).
    notice: () => hostedNow?.notice() ?? (hostedFailed && state !== PLUGIN.state.failed ? HOSTED.notice.recordUnreadable : null),
    busy: () => childPlugins.busy(),
    retry: async () => { await locator.retry(); return status() },
    // The page's Restart is refused while a Fishball plugin change (or the restart it queued) runs;
    // that change's own restart goes straight to requestRestart, so it is never refused this way.
    restart: () => (childPlugins.busy() ? { ...status(), refused: CHILD_PLUGINS.code.busy } : requestRestart()),
    reconnect: () => locator.reconnect(),
    open: async ({ hostname, lang }) => {
      try { return { ok: true, url: (await locator.admit({ view: LOOPBACK.openView, lang, hostname })).url } } catch (error) { return { ok: false, code: error?.code ?? REFUSAL.failed } }
    },
  })
  // The model-sync routes (models/check, models/add) sit beside the page's routes, on the same
  // owner-only Fetch registry, with their own same-origin fence (§10).
  registerProviderSyncRoutes(ctx, service)
  // First-run onboarding routes (state, Fishball model selection, completion marker).
  // The runtime root is resolved through the layout proofs (F08) so an aliased mainHome or symlink
  // runtime folder is refused before onboarding.json is read or written.
  const onboarding = createOnboarding({
    childModel: () => (state === PLUGIN.state.ready ? childModelClient : undefined),
    root: async (create = false) => {
      const existing = await existingLayout(key)
      if (existing) return existing.root
      if (!create) return undefined
      await ensureFishballDirectory(key)
      const root = pathsFor(key).root
      await privateDirectory(root)
      return root
    },
    warn: (format, value) => logger?.warn(format, value),
  })
  registerOnboardingRoutes(ctx, onboarding)
  // R-HOST-02: the child starts after the main DSH's app ready signal.
  cancelReady = ctx.appReady.onReady(() => {
    appReady = true
    if (enabled && !closed) void start()
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
