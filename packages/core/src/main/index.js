/**
 * fishball-core's main row (task F-WIRE; design §5a.1, §6.3, §6.3a, §6.4; R-FB-02…14; K3
 * `contracts/index.d.ts`, K3a `link.d.ts`, `connect.d.ts`, `ui.d.ts`; MULTI-1 `targets.d.ts`). It
 * composes every core module once per row life and provides `fishballInstance` (apiVersion 2) and
 * `fishballStatus`; it replaced the V2 child app and its loopback server (src/slim/, deleted: V2 was
 * never deployed, the user's rule 2026-11-16). The same row runs in a standalone DSH and in a hosted
 * child: nothing here needs the instance, its `nativeRuntime` or any wire channel.
 *
 * Composition, in order:
 * 1. the durable tables (identity records, acceptance ledger, ask cards, target records and tool
 *    bindings), each closed with the row;
 * 2. the one manager session (src/manager/), before anything that reads its model;
 * 3. the interception service (F-INTERCEPT) and the ask cards (F-ASKCARD), once for every target;
 * 4. the target collection (src/targets/, MULTI-1): one link with its credentials, Connect, pairing,
 *    façade and poll pipeline per target epoch (PLAN-MULTI D01), the web callback (Q-A3 B) shared
 *    by state; and status (F-STATUS) over it;
 * 5. the manager-scope contributions: every target's façade tools and `ask_user` (namespaced,
 *    PLAN-MULTI §4.4), the reminder tools and the private Skills, registered through X2 so they reach
 *    only the manager;
 * 6. the routes (the target routes, the web callback, the ask cards); the session route is its own row.
 *
 * Start order (K3 events.d.ts, F-ASKCARD): each link starts at once; `events.recover()` runs once at
 * app ready, when the plugins of this DSH have registered, and polled pages wait for it before any
 * intake; each target's ask cards reconcile once per start, at its link's first `connected`
 * (targets/runtime.js). A change of the client metadata URL or `identity.id` reconnects every link;
 * a change of `identity.name` asks every pairing to send it (R-NAME-03); a change of the instance's
 * target reconnects the parent; a change of `model` is applied to the live manager.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { SEAM_TARGETS, UI_SEAM } from 'fishball-shared/ui-seam'
import { GUARDS } from '../../contracts/constants.js'
import { createAsks, openAskCards, registerAskRoutes } from '../asks/index.js'
import { LOG as BRIDGE_LOG } from '../bridge/constants.js'
// The Fishball branch's content of one event, the same for every target's.
import { presentEvent as presentOf } from '../bridge/index.js'
import { codeOf } from '../events/diagnostics.js'
import { LOG as EVENTS_LOG } from '../events/constants.js'
import { createEvents, openLedger } from '../events/index.js'
import { acceptId, openRecords } from '../identity/index.js'
import { createWebCallback } from '../link/web-callback.js'
import { createReminders } from '../manager/reminders.js'
import { CONTRIBUTED_TOOLS } from '../manager/contributed.js'
import { createManagerService } from '../manager/service.js'
import { createManagerSession } from '../manager/session.js'
import { attachPrivateSkills } from '../manager/skills.js'
import { STATUS_MODEL, createStatus } from '../status/index.js'
import { TARGET_LOG } from '../targets/constants.js'
import { createTargets } from '../targets/index.js'
import { registerTargetRoutes } from '../targets/routes.js'
import { openTargets } from '../targets/store.js'
import { Config, valueAt } from './config.js'
import { followService } from './follow.js'
import { openGeneratedId } from './identity.js'
import { MAIN } from './constants.js'

export const name = MAIN.name
export const inject = MAIN.inject
export { Config }

const storageDomain = Object.freeze({ defineDomain, domainTable })

/**
 * The row's storage handles, closed with the row. The closer is registered before the first open,
 * so a failed open, or a row disposed while an open is awaited, still closes every handle that did
 * open: dsh-storage-domain keeps an open domain's name reserved, and a leaked one would refuse the
 * next apply of this row (`already-open`) until the process restarts.
 */
function ownedHandles(ctx, drainTargets) {
  const handles = []
  let closed = false
  const close = (handle) => handle.close().catch(() => {})
  // Cordis runs independent disposers concurrently. Keep these tables open until target writes finish.
  ctx.effect(() => async () => {
    closed = true
    try { await drainTargets() } finally { await Promise.all(handles.splice(0).map(close)) }
  })
  /** Opens one handle (`open(ctx, storageDomain)` → `{close, …}`) and owns it. */
  return async (open) => {
    const handle = await open(ctx, storageDomain)
    if (closed) close(handle)
    else handles.push(handle)
    return handle
  }
}

export async function apply(ctx, config) {
  const logger = ctx.logger(MAIN.logger)
  const warn = (what) => (error) => logger.warn(MAIN.text.failed, what, codeOf(error))
  const setting = (key) => valueAt(config, MAIN.setting[key])

  // 1. tables, and the generated id (identity.js)
  let targets
  const own = ownedHandles(ctx, () => targets?.close())
  const [{ table: records }, { table: ledger }, { table: cards }, targetTables, generated] = await Promise.all([
    own(openRecords), own(openLedger), own(openAskCards), own(openTargets), own(openGeneratedId),
  ])
  const clientId = idInForce(() => setting('id'), generated.id, logger)

  // 2. The manager service and its one session (before the façades: their image gate reads the model).
  const service = createManagerService(ctx)
  const session = createManagerSession(ctx, { setup: service.setup, published: service.published, model: () => setting('model') })
  service.bind(session)
  await service.start()
  await session.start()
  ctx.effect(() => () => { service.close(); session.close() })

  // 3–4. interception and ask cards (once), over the target collection's ports (bound below).
  // Intake waits for the ledger's recovery (K3 events.d.ts: recover() before intake), which runs at
  // app ready; polls that arrive earlier queue behind it, unacked.
  const recovery = Promise.withResolvers()
  const ports = Object.freeze({
    live: (source) => targets?.live(source) === true,
    ack: (receipts, source) => targets.ack(receipts, source),
    callTool: (source, toolName, args) => targets.callTool(source, toolName, args),
  })
  const bridgeOptions = Object.freeze({
    logger: ctx.logger(BRIDGE_LOG.name),
    attachments: () => ctx.get(MAIN.attachments),
    imagesSupported: async () => {
      const selection = session.currentModel()
      if (selection === undefined) return true
      const info = await ctx.llm.resolveModelInfo(selection.provider, selection.model).catch(() => undefined)
      return info?.inputModalities === undefined || info.inputModalities.includes(MAIN.imageModality)
    },
  })
  const events = createEvents({
    table: ledger,
    link: ports,
    fishball: { activate: () => session.activate(), present: (event) => presentOf(event) },
    logger: ctx.logger(EVENTS_LOG.name),
    // Read at each event (volatile fields), so a save applies to the next one (WAKE).
    batching: () => Object.fromEntries(Object.entries(MAIN.setting.wake).map(([key, path]) => [key, valueAt(config, path)])),
  })
  ctx.effect(() => () => events.close())
  const asks = createAsks({ targets: ports, table: cards, logger })
  ctx.effect(() => () => asks.close())
  targets = createTargets(ctx, {
    tables: targetTables, identityRecords: records, asks, events, recovered: recovery.promise, bridgeOptions,
    settings: { clientId, clientMetadataUrl: () => setting('metadataUrl'), name: () => setting('name') },
    logger: ctx.logger(TARGET_LOG.name),
  })
  // The parent's epoch follows the instance's setting before this row finishes applying (review
  // M3): DSH's boot awaits every row before app ready, and the instance probes the child's
  // credential only after app ready (dsh-instance child.js `attach` needs `childReadiness`), so the
  // probe never sees a parent record core is about to retire.
  await targets.settled()
  // The guard row is its own row and may start after this one, be replaced or go away.
  const guards = followService(ctx, GUARDS.serviceName, { report: (report) => report.report() ?? null, onChange: 'onChange' })
  ctx.effect(() => () => guards.dispose())
  const status = createStatus(ctx, { targets: targets.service, guards, notify: (input) => service.manager.notify(input), brand: () => setting('brandStyle') })

  // 5. Contributions. Each is one X2 registration: only the manager's scope receives it.
  const reminders = createReminders(ctx, { resolveAgent: (id, next) => session.resolveAgent(id, next) })
  ctx.effect(() => () => reminders.close())
  // A tool registered through the agent's own `tools` goes with the X2 fiber (dsh-tools traces the
  // caller); every target's façade re-registers on its `tools/list`, so the mount's disposer is an
  // effect of that fiber. Each target's `ask_user` comes with its façade (targets/runtime.js).
  ctx.effect(() => service.manager.registerSetup(MAIN.setupId.bridge, (agentCtx) => { agentCtx.effect(() => targets.mount(agentCtx.tools)) }))
  ctx.effect(() => service.manager.registerSetup(MAIN.setupId.reminders, (agentCtx) => { reminders.registerTools(agentCtx.tools) }))
  ctx.effect(() => attachPrivateSkills(ctx, service.manager))

  // 6. routes. Without DSH's web listener there is no web callback; Connect then uses the loopback one.
  const webServer = ctx.get(MAIN.webServer)
  const webCallback = webServer === undefined ? undefined : createWebCallback({ webServer })
  if (webCallback !== undefined) ctx.effect(() => () => webCallback.dispose())
  ctx.effect(() => registerTargetRoutes(ctx, targets, { callbackFor: (request) => webCallback?.callbackFor(request) }))
  ctx.effect(() => registerAskRoutes(ctx, {
    service: asks.service, managerSessionId: () => session.sessionId(), onManagerChange: (fn) => session.onChange(() => fn()),
  }))

  // The two services (K3 index.d.ts, MULTI-0 apiVersion 2; F-STATUS).
  ctx.provide(MAIN.service, Object.freeze({
    apiVersion: MAIN.apiVersion,
    // Core's own read for its guard row (manager/contributed.js); not part of the K3 contract.
    [CONTRIBUTED_TOOLS]: (agent) => service.contributedTools(agent),
    manager: service.manager,
    events: events.service,
    bridge: targets.targetBound.bridge,
    attention: targets.targetBound.attention,
    [UI_SEAM.member]: Object.freeze({
      managerSessionId: () => session.sessionId(),
      [SEAM_TARGETS.member]: targets.service,
      guards: Object.freeze({ report: () => guards.report(), onChange: (fn) => guards.onChange(fn) }),
      asks: asks.service,
    }),
  }))
  ctx.provide(STATUS_MODEL.serviceName, status)

  followSettings(ctx, { targets, session, setting, clientId, warn })

  const ready = () => {
    service.markReady()
    // recover() never rejects (its failure is logged and its barrier settles), so intake always opens.
    // After the parent follows the instance (review m13): its open records are re-offered only
    // while its epoch is live, so recovery must not run before its runtime exists.
    void targets.settled().then(() => events.recover()).catch(warn(MAIN.text.recover)).finally(() => recovery.resolve())
    void service.resumePending().catch(warn(MAIN.text.resume))
  }
  // Every DSH launcher provides appReady (both SDKs); a bare Cordis host has no ready moment, so it
  // recovers at once.
  const appReady = ctx.get(STATUS_MODEL.services.appReady)
  if (typeof appReady?.onReady === 'function') ctx.effect(() => appReady.onReady(ready))
  else ready()
}

/**
 * The `identity.id` in force (R-ID-02, R-ID-10; R-FIX F09). The user's id wins whenever it holds a
 * value; a blank setting is no value, so the generated id applies. DSH saves a volatile setting
 * without asking the row (its settings service checks only that the path is volatile), so the save
 * rule `acceptId` runs here, on every read: an invalid value is never used or sent, the id in force
 * stays the last valid one (the generated id at first), and the refusal is logged once per value,
 * by its code only.
 * @returns {() => string} the id to connect and pair with
 */
function idInForce(read, generated, logger) {
  let previous = generated
  let refused
  return () => {
    const next = read() || generated
    const accepted = acceptId(next, previous)
    if (accepted.ok) { previous = accepted.id; refused = undefined }
    else if (refused !== next) { refused = next; logger.warn(MAIN.text.failed, MAIN.text.id, accepted.code) }
    return accepted.id
  }
}

/**
 * Follows the settings the links and the manager read (the module header): the row's own volatile
 * fields through DSH's loader event, the instance's child settings through the settings document
 * event. Each change is compared with the last value seen, so an unrelated save changes nothing.
 */
function followSettings(ctx, { targets, session, setting, clientId, warn }) {
  // The effective id, so saving the generated one at the first start is no change.
  const snapshot = () => JSON.stringify([setting('metadataUrl'), clientId()])
  let linkKey = snapshot()
  let nameKey = JSON.stringify(setting('name'))
  let modelKey = JSON.stringify(setting('model'))
  const changed = () => {
    const nextLink = snapshot()
    const nextName = JSON.stringify(setting('name'))
    const link = nextLink !== linkKey
    const name = nextName !== nameKey
    linkKey = nextLink
    nameKey = nextName
    // The instance's target (the parent's URL) and its presence are read by the collection itself.
    targets.settingsChanged({ link, name })
    const nextModel = JSON.stringify(setting('model'))
    if (nextModel !== modelKey) { modelKey = nextModel; void session.applyModel().catch(warn(MAIN.text.model)) }
  }
  ctx.on(MAIN.event.volatileUpdate, changed)
  ctx.on(MAIN.event.settingsUpdated, changed)
}
