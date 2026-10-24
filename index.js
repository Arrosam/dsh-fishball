/**
 * Fishball host half: one DSH host row that owns the always-on assistant session.
 *
 * Wiring only; each responsibility lives in its own module:
 * - src/config.js          safety limits (live plugin config)
 * - src/store.js           durable assistant record, plugin states, tool allowances (fails closed)
 * - src/composition.js     scope P, persona, private tree, tool mask, bsk_inspect copy, guards
 * - src/plugin-catalog.js  Fishball's own plugin states and tool decisions
 * - src/plugin-tools.js    list_plugins, set_plugin_enabled, add_plugin
 * - src/context-window.js  the context-window setting and its enforcement (src/context-policy.js)
 * - src/intake.js          every input that wakes Fishball (durable, deduplicated, wake guard)
 * - src/messaging.js       message_fishball, "Send to Fishball", message_session, start_session
 * - src/watches.js         "tell Fishball when finished": watches, their notices and tools
 * - src/approvals.js       other sessions' permission requests go to Fishball first
 * - src/sources.js         ctx.fishball: plugins publish events to Fishball (DESIGN §8)
 * - src/lifecycle.js       create / resume / recovery / archive of the one session
 * - src/http.js            /api/fishball/* for the settings page and the brand button
 */
// Evaluated first, so the register() wrapper sees every tool registered after this row loads.
import './src/tool-attribution.js'
import { Config, readLimits } from './src/config.js'
import { PLUGIN, ERROR, STATUS, EVENT, SERVICE, API_CODE, CHANGED_BY, PLUGIN_ERROR, CONTEXT, WATCH_BY, AGENT_IDLE } from './src/constants.js'
import { LifecycleStateError, diagnosticOf } from './src/errors.js'
import { StateFeed } from './src/state-feed.js'
import { Store } from './src/store.js'
import { AssistantComposition } from './src/composition.js'
import { CatalogError, PluginCatalog } from './src/plugin-catalog.js'
import { ContextWindow } from './src/context-window.js'
import { IntakeError, IntakeLedger } from './src/intake.js'
import { registerInbound, registerOutbound, SOURCE_ID } from './src/messaging.js'
import { uncheckedToolsNotifier } from './src/unchecked-notice.js'
import { Watches, WatchError } from './src/watches.js'
import { ApprovalBroker } from './src/approvals.js'
import { SourceRegistry } from './src/sources.js'
import { registerPluginTools } from './src/plugin-tools.js'
import { AssistantLifecycle, InactiveLifecycle } from './src/lifecycle.js'
import { registerRoutes } from './src/http.js'
import { HIDDEN_TOOLS } from './src/tool-rules.js'

export const name = PLUGIN.name
export { Config }

/** Services the row cannot work without; see SERVICE for why each is needed. */
export const inject = Object.values(SERVICE)

/** Settings-page commands before the catalog exists, or after a core failure. */
const unavailable = () => Promise.reject(new LifecycleStateError(API_CODE.unavailable))

export async function apply(ctx, config) {
  const logger = ctx.logger(PLUGIN.logger)
  const limits = () => readLimits(config)
  const feed = new StateFeed((error) => logger.warn('state listener failed (%s)', diagnosticOf(error)))
  let lifecycle = new InactiveLifecycle(STATUS.starting)
  let catalogView = () => null
  let contextView = () => null
  let intakeView = () => null
  let outboxView = () => null
  let watchesView = () => null
  let approvalsView = () => null
  let sourcesView = () => null
  const snapshot = () => ({ ...lifecycle.snapshot(), limits: limits(), hiddenTools: [...HIDDEN_TOOLS], catalog: catalogView(), contextWindow: contextView(), intake: intakeView(), outbox: outboxView(), watches: watchesView(), approvals: approvalsView(), sources: sourcesView() })
  /** Called on every published change once ctx.fishball exists (sources may become enabled). */
  let refreshSources = () => {}
  const publish = () => { refreshSources(); feed.publish(snapshot()) }
  /** Replace the active lifecycle (the stand-ins and the real one share one contract). */
  const use = (next) => { lifecycle = next; publish() }
  const commands = { setPlugin: unavailable, removeAllowance: unavailable, setContextWindow: unavailable, send: unavailable, addWatch: unavailable, removeWatch: unavailable }
  registerRoutes(ctx, {
    snapshot,
    subscribe: (listener) => feed.subscribe(listener),
    recover: (action) => lifecycle.recover(action),
    setPlugin: (plugin, on) => commands.setPlugin(plugin, on),
    removeAllowance: (toolKey) => commands.removeAllowance(toolKey),
    setContextWindow: (setting) => commands.setContextWindow(setting),
    send: (input) => commands.send(input),
    addWatch: (input) => commands.addWatch(input),
    removeWatch: (input) => commands.removeWatch(input),
  })
  // A limit edited on the Plugins page reaches this row without a remount (spike S21).
  ctx.on(EVENT.volatileUpdate, publish)

  let store
  try {
    store = await Store.open(ctx)
  } catch (error) {
    logger.warn('store could not be opened (%s)', diagnosticOf(error))
    return use(new InactiveLifecycle(STATUS.failed, ERROR.storeUnreadable))
  }

  const composition = new AssistantComposition(ctx, logger)
  // Boot mounts the tree once with the first evaluation; later policy changes remount through
  // the catalog's idle-phase apply (a change mid-turn waits for the turn to end).
  let booted = false
  const contextWindow = new ContextWindow(ctx, store, logger, {
    onChange: () => publish(),
    onPolicyChange: () => { if (booted) void catalog.schedule() },
    isCompactionRunning: () => catalog.isRunning(CONTEXT.compactionPlugin),
  })
  const catalog = new PluginCatalog(ctx, store, logger, {
    readLimits: limits,
    mountRows: (rows) => composition.mountRows(rows),
    adjustRows: (key, rows, purpose) => (key === CONTEXT.compactionPlugin ? contextWindow.compactionRows(rows, purpose) : rows),
    onApplied: () => contextWindow.confirmApplied(catalog.isRunning(CONTEXT.compactionPlugin)),
    pendingRowIds: () => composition.pendingRowIds(),
    ownsDefinition: (definition) => composition.ownsDefinition(definition),
    onChange: () => { composition.refreshMasks(); publish() },
  })
  try {
    await composition.mount()
    await catalog.refresh()
    await contextWindow.evaluate()
    await catalog.apply()
    composition.attachCatalog(catalog)
    composition.addAgentSetup((agentCtx, agent) => contextWindow.installAgent(agentCtx, agent))
    booted = true
    // An evaluation that finished while boot was mounting (llm/adapters-updated) is caught here.
    contextWindow.reconcile()
  } catch (error) {
    logger.warn('composition failed (%s)', diagnosticOf(error))
    return use(new InactiveLifecycle(STATUS.failed, ERROR.composeFailed, store.assistant()))
  }
  registerPluginTools({
    register: (definition) => composition.registerOwnTool(definition),
    catalog,
    composition,
    tools: ctx.tools,
    scope: composition.key,
    approval: ctx.approval,
    pluginManager: ctx.pluginManager,
    logger,
  })
  catalogView = () => catalog.snapshot(composition.decisions())
  contextView = () => contextWindow.snapshot()

  // Inputs (DESIGN §5b) and handing work off (§5d).
  const assistantId = () => store.assistant().sessionId
  /** The assistant's running agent; read through a function, the lifecycle is created below. */
  let assistantAgent = () => undefined
  const ledger = new IntakeLedger(ctx, store, logger, { readLimits: limits, onChange: () => publish() })
  composition.addAgentSetup((agentCtx, agent) => ledger.installAgent(agentCtx, agent))
  // Watches (DESIGN §5c): set up by you, by Fishball, or by another agent for its own session.
  const watches = new Watches(ctx, store, logger, { ledger, readLimits: limits, assistantId, onChange: () => publish() })
  // When Fishball goes idle its queue has room again: retry watch notices refused earlier.
  composition.addAgentSetup((agentCtx, agent) => agentCtx.on(EVENT.agentStatus, ({ agent: changed, status }) => {
    if (changed === agent && status === AGENT_IDLE) void watches.retry()
  }))
  /** A watch for a tool result: { watch } or { watchError } (the message itself still went out). */
  const watchFor = async (sessionId, by, since) => {
    try { return { watch: await watches.add({ sessionId, by, since }) } } catch (error) {
      if (error instanceof WatchError) return { watchError: error.code }
      throw error
    }
  }
  const inbound = registerInbound({ ctx, ledger, readLimits: limits, assistantId, isLive: () => assistantAgent() !== undefined, watch: watchFor })
  const outbound = registerOutbound({ ctx, register: (definition) => composition.registerOwnTool(definition), store, readLimits: limits, assistantId, logger, onChange: () => publish(), watch: watchFor })
  /** Sessions related to Fishball (read_session, DESIGN §5c): watched, messaged it, messaged or started by it, or forwarded by you. */
  const related = (sessionId) => watches.watched(sessionId) || ledger.hasSource(sessionId, Object.values(SOURCE_ID)) || outbound.contacted(sessionId)
  watches.registerTools((definition) => composition.registerOwnTool(definition), related)
  watchesView = () => watches.snapshot()
  // Other sessions' permission requests go to Fishball first (DESIGN §7a).
  const broker = new ApprovalBroker(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, isLive: () => assistantAgent() !== undefined,
    startedByFishball: (sessionId) => outbound.started(sessionId), agentOf: () => assistantAgent(), onChange: () => publish(),
  })
  broker.registerTools((definition) => composition.registerOwnTool(definition))
  approvalsView = () => broker.snapshot()
  // ctx.fishball (DESIGN §8): plugins publish events to Fishball through the ledger.
  const sources = new SourceRegistry(ctx, {
    ledger, catalog, readLimits: limits, isLive: () => assistantAgent() !== undefined,
    privateTree: (callerCtx) => composition.inPrivateTree(callerCtx), onChange: () => publish(), logger,
  })
  sourcesView = () => sources.snapshot()
  // A change of Fishball's state or of a plugin's on/off may enable sources (their onEnabled).
  refreshSources = () => sources.refresh()
  // When Fishball can no longer answer, waiting requests go to you at once (P7 review M1).
  ctx.effect(() => () => broker.releaseAll(), 'fishball: release permission requests')
  const asApiError = (ErrorClass) => async (task) => {
    try { return await task() } catch (error) {
      if (error instanceof ErrorClass) throw new LifecycleStateError(error.code)
      throw error
    }
  }
  // A watch from the GUI needs a running Fishball to report to (DESIGN §5c; P6 test A67).
  commands.addWatch = ({ sessionId }) => {
    if (assistantAgent() === undefined) return unavailable()
    return asApiError(WatchError)(() => watches.add({ sessionId, by: { kind: WATCH_BY.user } }))
  }
  commands.removeWatch = ({ watchId }) => asApiError(WatchError)(() => watches.remove(watchId))
  intakeView = () => ledger.snapshot()
  outboxView = () => outbound.snapshot()
  const notifyUnchecked = uncheckedToolsNotifier({ ledger, catalog, decisions: () => composition.decisions(), store, logger })
  commands.send = ({ sessionId, note }) => asApiError(IntakeError)(() => inbound.forward(sessionId, note))
  const logged = (label) => (error) => logger.warn('%s failed (%s)', label, diagnosticOf(error))
  /** A row waiting for a service may run now; its tools may have appeared too. */
  const recheck = () => void catalog.recheckWaiting().catch(logged('waiting re-audit'))
  // A tool registered or removed anywhere can change Fishball's catalog view, and may bring
  // unchecked tools Fishball must be told about.
  ctx.on(EVENT.toolsChange, () => { queueMicrotask(publish); recheck(); if (assistantAgent() !== undefined) notifyUnchecked() })
  ctx.on(EVENT.service, recheck)
  // A bundle installed or toggled while DSH runs joins the catalog at once (refresh schedules
  // the apply when the catalog's shape changed); the state feed shows it without a turn.
  // A tool registered by a bundle installed at runtime arrives BEFORE the catalog knows the
  // bundle, so it cannot be tied to a profile plugin yet; re-check once the catalog has it.
  ctx.on(EVENT.pluginManagerChanged, () => void catalog.refresh().then(() => {
    publish()
    if (assistantAgent() !== undefined) notifyUnchecked()
  }).catch(logged('catalog refresh')))
  commands.setPlugin = async (plugin, on) => {
    await catalog.refresh()
    try {
      await catalog.setDesired(plugin, on, CHANGED_BY.user)
    } catch (error) {
      if (error instanceof CatalogError) throw new LifecycleStateError(error.code === PLUGIN_ERROR.unknownPlugin ? API_CODE.unknown : API_CODE.refused)
      throw error
    }
  }
  commands.setContextWindow = (setting) => contextWindow.save(setting)
  commands.removeAllowance = async (toolKey) => {
    if (!(await catalog.removeAllowance(toolKey))) throw new LifecycleStateError(API_CODE.unknown)
  }

  // Each time Fishball goes live: settle the intake queue (restart, adopt), then tell Fishball
  // about unchecked tools of plugins already on (DESIGN §7, §11 steps 4-6).
  const onLive = () => void ledger.reconcile().then(() => watches.catchUp()).then(() => notifyUnchecked()).catch(logged('intake reconcile'))
  // Every lifecycle change publishes; when Fishball is no longer live, its waiting permission
  // requests go to you at once instead of timing out (P7 review M1).
  const onLifecycleChange = () => {
    if (assistantAgent() === undefined) broker.releaseAll()
    publish()
  }
  const assistant = new AssistantLifecycle(ctx, store, composition, logger, onLifecycleChange, onLive)
  catalog.agentOf = () => assistant.agent
  contextWindow.agentOf = () => assistant.agent
  ledger.agentOf = () => assistant.agent
  assistantAgent = () => assistant.agent
  ctx.effect(() => () => { ledger.stopping(); return assistant.stop() }, 'fishball: assistant session')
  use(assistant)
  // Start without blocking the host tree: a slow resume must not delay other rows.
  void assistant.start().catch((error) => logger.warn('assistant start failed (%s)', diagnosticOf(error)))
}
