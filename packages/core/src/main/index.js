/**
 * fishball-core's main row (task F-WIRE; design §5a.1, §6.3, §6.3a, §6.4; R-FB-02…14; K3
 * `contracts/index.d.ts`, K3a `link.d.ts`, `connect.d.ts`, `ui.d.ts`). It composes every core module
 * once per row life and provides `fishballInstance` (apiVersion 1) and `fishballStatus`; it replaced
 * the V2 child app and its loopback server (src/slim/, deleted: V2 was never deployed, the user's
 * rule 2026-11-16). The same row runs in a standalone DSH and in a hosted child: nothing here needs
 * the instance, its `nativeRuntime` or any wire channel.
 *
 * Composition, in order:
 * 1. the durable tables (identity records, acceptance ledger, ask cards), each closed with the row;
 * 2. the link (F-LINK) with its credentials and Connect (F-LINK-SAVE, with the web callback of
 *    Q-A3 B) behind F-PAIR's gate; its target is `effectiveTarget` (F-SETTINGS) over the instance's
 *    `dsh-instance-child.targetUrl` and the user's `target.url`;
 * 3. the bridge façade (F-FACADE), the interception service (F-INTERCEPT), the ask cards (F-ASKCARD)
 *    and status (F-STATUS), all on that one link;
 * 4. the one manager session (src/manager/) with its manager-scope contributions: the façade's tools,
 *    `ask_user`, the reminder tools and the private Skills, registered through X2 so they reach only
 *    the manager;
 * 5. the routes (Connect, the web callback, the ask cards); the session route is its own row.
 *
 * The poll pipeline (F-WIRE "store the card before the ack"): every `inbox_poll` page is first taken
 * by the ask cards and only then handed to the interception service event by event, which acks each
 * event once its side accepted it. So a card is durable before its `ask` event is acked; an event
 * whose card could not be stored is not handed on (R-FIX F12), so it stays unacked and comes back.
 *
 * Start order (K3 events.d.ts, F-ASKCARD): the link starts at once; `events.recover()` runs once at
 * app ready, when the plugins of this DSH have registered, and polled pages wait for it before any
 * intake; `asks.reconcile()` runs once per start, at the link's first `connected`, after the pages
 * polled by then. A change of the target, the client metadata URL or `identity.id`
 * reconnects the link; a change of `identity.name` asks the pairing to send it (R-NAME-03); a change
 * of `model` is applied to the live manager (src/manager/session.js).
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { UI_SEAM } from 'fishball-shared/ui-seam'
import { GUARDS, LINK, MCP } from '../../contracts/constants.js'
import { createAsks, openAskCards, registerAskRoutes } from '../asks/index.js'
import { createBridge } from '../bridge/index.js'
import { codeOf } from '../events/diagnostics.js'
import { LOG as EVENTS_LOG } from '../events/constants.js'
import { createEvents, openLedger } from '../events/index.js'
import { acceptId, createPairing, openRecords, createRecords } from '../identity/index.js'
import { LINK_SAVE, createLinkCredentials } from '../link/index.js'
import { createWebCallback } from '../link/web-callback.js'
import { LOG as BRIDGE_LOG } from '../bridge/constants.js'
import { createReminders } from '../manager/reminders.js'
import { CONTRIBUTED_TOOLS } from '../manager/contributed.js'
import { createManagerService } from '../manager/service.js'
import { createManagerSession } from '../manager/session.js'
import { attachPrivateSkills } from '../manager/skills.js'
import { effectiveTarget, registerConnectCancelRoute, registerSettingsRoutes } from '../settings/index.js'
import { STATUS_MODEL, createStatus } from '../status/index.js'
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
function ownedHandles(ctx) {
  const handles = []
  let closed = false
  const close = (handle) => { void handle.close().catch(() => {}) }
  ctx.effect(() => () => { closed = true; for (const handle of handles.splice(0)) close(handle) })
  /** Opens one handle (`open(ctx, storageDomain)` → `{close, …}`) and owns it. */
  return async (open) => {
    const handle = await open(ctx, storageDomain)
    if (closed) close(handle)
    else handles.push(handle)
    return handle
  }
}

/**
 * The instance's target in a hosted child: another row's live settings, or undefined (standalone).
 * Read from DSH's settings once and again on every settings document change, not on each read:
 * `describe()` lists every namespace with its schema, and the link reads the target on each attempt.
 */
function followInstanceTarget(ctx) {
  const read = () => ctx.settings.describe().find((entry) => entry.ns === MAIN.instanceTarget.row)?.value?.[MAIN.instanceTarget.field]
  let value = read()
  ctx.on(MAIN.event.settingsUpdated, () => { value = read() })
  return () => value
}

export async function apply(ctx, config) {
  const logger = ctx.logger(MAIN.logger)
  const warn = (what) => (error) => logger.warn(MAIN.text.failed, what, codeOf(error))
  const setting = (key) => valueAt(config, MAIN.setting[key])
  const instanceTarget = followInstanceTarget(ctx)
  const target = () => effectiveTarget({ instance: instanceTarget(), user: setting('target') })

  // 1. tables, and the generated id (identity.js)
  const own = ownedHandles(ctx)
  const [{ table: records }, { table: ledger }, { table: cards }, generated] = await Promise.all([
    own(openRecords), own(openLedger), own(openAskCards), own(openGeneratedId),
  ])
  const clientId = idInForce(() => setting('id'), generated.id, logger)

  // 2. the link, its credentials and Connect
  // Without DSH's web listener there is no web callback; Connect then uses the loopback one.
  const webServer = ctx.get(MAIN.webServer)
  const webCallback = webServer === undefined ? undefined : createWebCallback({ webServer })
  if (webCallback !== undefined) ctx.effect(() => () => webCallback.dispose())
  const credentials = createLinkCredentials(ctx, { target, clientId, clientMetadataUrl: () => setting('metadataUrl') })
  ctx.effect(() => () => credentials.dispose())
  const pairing = createPairing({ records: createRecords(records), name: () => setting('name'), target, credentials: credentials.credentials, logger: ctx.logger(LINK_SAVE.logger) })
  const { link } = pairing
  ctx.effect(() => credentials.onChange(() => link.reconnect()))
  ctx.effect(() => () => { void link.stop() })

  // 4. The manager service and its one session (before the façade: its image gate reads the model).
  const service = createManagerService(ctx)
  const session = createManagerSession(ctx, { setup: service.setup, published: service.published, model: () => setting('model') })
  service.bind(session)
  await service.start()
  await session.start()
  ctx.effect(() => () => { service.close(); session.close() })

  // 3. façade, interception, ask cards, status
  const bridge = createBridge({
    link,
    logger: ctx.logger(BRIDGE_LOG.name),
    attachments: () => ctx.get(MAIN.attachments),
    imagesSupported: async () => {
      const selection = session.currentModel()
      if (selection === undefined) return true
      const info = await ctx.llm.resolveModelInfo(selection.provider, selection.model).catch(() => undefined)
      return info?.inputModalities === undefined || info.inputModalities.includes(MAIN.imageModality)
    },
  })
  ctx.effect(() => () => bridge.close())
  const events = createEvents({
    table: ledger,
    link: { ack: (receipts) => link.callTool(MCP.tools.inboxAck, { receipts }) },
    fishball: { activate: () => session.activate(), present: (event) => bridge.present(event) },
    logger: ctx.logger(EVENTS_LOG.name),
  })
  ctx.effect(() => () => events.close())
  // Intake waits for the ledger's recovery (K3 events.d.ts: recover() before intake), which runs at
  // app ready; polls that arrive earlier queue behind it, unacked.
  const recovery = Promise.withResolvers()
  const asks = createAsksOnPipeline({ link, cards, events, logger, recovered: recovery.promise })
  ctx.effect(() => () => asks.close())
  // The guard row is its own row and may start after this one, be replaced or go away.
  const guards = followService(ctx, GUARDS.serviceName, { report: (service) => service.report() ?? null, onChange: 'onChange' })
  ctx.effect(() => () => guards.dispose())
  const status = createStatus(ctx, { link, target, connect: credentials.connect, guards, bridge, notify: (input) => service.manager.notify(input) })

  // 4 (contributions). Each is one X2 registration: only the manager's scope receives it.
  const reminders = createReminders(ctx, { resolveAgent: (id, next) => session.resolveAgent(id, next) })
  ctx.effect(() => () => reminders.close())
  // A tool registered through the agent's own `tools` goes with the X2 fiber (dsh-tools traces the
  // caller); the façade's mount re-registers on every `tools/list`, so its disposer is an effect of that fiber.
  ctx.effect(() => service.manager.registerSetup(MAIN.setupId.bridge, (agentCtx) => { agentCtx.effect(() => bridge.mount(agentCtx.tools)) }))
  ctx.effect(() => service.manager.registerSetup(MAIN.setupId.asks, (agentCtx) => { agentCtx.tools.register(asks.tool) }))
  ctx.effect(() => service.manager.registerSetup(MAIN.setupId.reminders, (agentCtx) => { reminders.registerTools(agentCtx.tools) }))
  ctx.effect(() => attachPrivateSkills(ctx, service.manager))

  // 5. routes
  ctx.effect(() => registerSettingsRoutes(ctx, { callbackFor: (request) => webCallback?.callbackFor(request) }))
  ctx.effect(() => registerConnectCancelRoute(ctx))
  ctx.effect(() => registerAskRoutes(ctx, {
    service: asks.service, managerSessionId: () => session.sessionId(), onManagerChange: (fn) => session.onChange(() => fn()),
  }))

  // The two services (K3 index.d.ts; F-STATUS).
  ctx.provide(MAIN.service, Object.freeze({
    apiVersion: MAIN.apiVersion,
    // Core's own read for its guard row (manager/contributed.js); not part of the K3 contract.
    [CONTRIBUTED_TOOLS]: (agent) => service.contributedTools(agent),
    manager: service.manager,
    events: events.service,
    bridge: bridge.bridge,
    attention: bridge.attention,
    [UI_SEAM.member]: Object.freeze({
      managerSessionId: () => session.sessionId(),
      link: Object.freeze({ status: () => link.status(), onChange: (fn) => link.onStatus(fn) }),
      connect: credentials.connect,
      pairing: Object.freeze({ state: () => pairing.state(), onChange: (fn) => pairing.onChange(fn), choose: (choice, options) => pairing.choose(choice, options) }),
      guards: Object.freeze({ report: () => guards.report(), onChange: (fn) => guards.onChange(fn) }),
      asks: asks.service,
    }),
  }))
  ctx.provide(STATUS_MODEL.serviceName, status)

  followSettings(ctx, { link, pairing, session, setting, clientId, instance: instanceTarget, warn })

  // Start order (header).
  link.start()
  let reconciled = false
  ctx.effect(() => link.onStatus((next) => {
    if (reconciled || next.state !== LINK.state.connected) return
    reconciled = true
    void asks.drained().then(() => asks.reconcile()).catch(warn(MAIN.text.reconcile))
  }))
  const ready = () => {
    service.markReady()
    // recover() never rejects (its failure is logged and its barrier settles), so intake always opens.
    void events.recover().catch(warn(MAIN.text.recover)).finally(() => recovery.resolve())
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
 * The ask cards over a link whose polls reach the interception service only after the cards took
 * them (the module header's pipeline). The cards see the link through a port whose `onPoll` is fed
 * here; their other link calls go to the link itself.
 */
function createAsksOnPipeline({ link, cards, events, logger, recovered }) {
  const pages = new Set()
  const port = Object.freeze({
    onPoll: (fn) => { pages.add(fn); return () => { pages.delete(fn) } },
    callTool: (toolName, args, options) => link.callTool(toolName, args, options),
  })
  const asks = createAsks({ link: port, table: cards, logger })
  let pipeline = recovered
  const offPoll = link.onPoll((result) => {
    // Each page is its own link of the chain and ends caught, so one failed page never stops the
    // pages after it (a page left untaken is simply polled again, nothing was acked for it).
    pipeline = pipeline.then(async () => {
      const unstored = new Set()
      for (const fn of [...pages]) for (const eventId of (await fn(result)) ?? []) unstored.add(eventId)
      if (result?.ok !== true || !Array.isArray(result.events)) return
      for (const event of result.events) {
        if (unstored.has(event?.eventId)) continue
        try { await events.intake(event) } catch (error) { logger.warn(MAIN.text.failed, MAIN.text.intake, codeOf(error)) }
      }
    }).catch((error) => logger.warn(MAIN.text.failed, MAIN.text.page, codeOf(error)))
  })
  return Object.freeze({
    ...asks,
    /** Resolves once every page polled so far went through the pipeline. */
    drained: () => pipeline,
    close() { offPoll(); asks.close() },
  })
}

/**
 * Follows the settings the link and the manager read (the module header): the row's own volatile
 * fields through DSH's loader event, the instance's target through the settings document event.
 * Each change is compared with the last value seen, so an unrelated save changes nothing.
 */
function followSettings(ctx, { link, pairing, session, setting, clientId, instance, warn }) {
  // The effective id, so saving the generated one at the first start is no change.
  const snapshot = () => JSON.stringify([instance(), setting('target'), setting('metadataUrl'), clientId()])
  let linkKey = snapshot()
  let nameKey = JSON.stringify(setting('name'))
  let modelKey = JSON.stringify(setting('model'))
  const changed = () => {
    const nextLink = snapshot()
    if (nextLink !== linkKey) { linkKey = nextLink; link.reconnect() }
    const nextName = JSON.stringify(setting('name'))
    if (nextName !== nameKey) { nameKey = nextName; void pairing.nameChanged() }
    const nextModel = JSON.stringify(setting('model'))
    if (nextModel !== modelKey) { modelKey = nextModel; void session.applyModel().catch(warn(MAIN.text.model)) }
  }
  ctx.on(MAIN.event.volatileUpdate, changed)
  ctx.on(MAIN.event.settingsUpdated, changed)
}
