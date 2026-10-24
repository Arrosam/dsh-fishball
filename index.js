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
 * - src/lifecycle.js       create / resume / recovery / archive of the one session
 * - src/http.js            /api/fishball/* for the settings page and the brand button
 */
// Evaluated first, so the register() wrapper sees every tool registered after this row loads.
import './src/tool-attribution.js'
import { Config, readLimits } from './src/config.js'
import { PLUGIN, ERROR, STATUS, EVENT, SERVICE, API_CODE, CHANGED_BY, PLUGIN_ERROR, CONTEXT } from './src/constants.js'
import { LifecycleStateError, diagnosticOf } from './src/errors.js'
import { StateFeed } from './src/state-feed.js'
import { Store } from './src/store.js'
import { AssistantComposition } from './src/composition.js'
import { CatalogError, PluginCatalog } from './src/plugin-catalog.js'
import { ContextWindow } from './src/context-window.js'
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
  const snapshot = () => ({ ...lifecycle.snapshot(), limits: limits(), hiddenTools: [...HIDDEN_TOOLS], catalog: catalogView(), contextWindow: contextView() })
  const publish = () => feed.publish(snapshot())
  /** Replace the active lifecycle (the stand-ins and the real one share one contract). */
  const use = (next) => { lifecycle = next; publish() }
  const commands = { setPlugin: unavailable, removeAllowance: unavailable, setContextWindow: unavailable }
  registerRoutes(ctx, {
    snapshot,
    subscribe: (listener) => feed.subscribe(listener),
    recover: (action) => lifecycle.recover(action),
    setPlugin: (plugin, on) => commands.setPlugin(plugin, on),
    removeAllowance: (toolKey) => commands.removeAllowance(toolKey),
    setContextWindow: (setting) => commands.setContextWindow(setting),
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
  const logged = (label) => (error) => logger.warn('%s failed (%s)', label, diagnosticOf(error))
  /** A row waiting for a service may run now; its tools may have appeared too. */
  const recheck = () => void catalog.recheckWaiting().catch(logged('waiting re-audit'))
  // A tool registered or removed anywhere can change Fishball's catalog view.
  ctx.on(EVENT.toolsChange, () => { queueMicrotask(publish); recheck() })
  ctx.on(EVENT.service, recheck)
  // A bundle installed or toggled while DSH runs joins the catalog at once (refresh schedules
  // the apply when the catalog's shape changed); the state feed shows it without a turn.
  ctx.on(EVENT.pluginManagerChanged, () => void catalog.refresh().then(publish).catch(logged('catalog refresh')))
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

  const assistant = new AssistantLifecycle(ctx, store, composition, logger, publish)
  catalog.agentOf = () => assistant.agent
  contextWindow.agentOf = () => assistant.agent
  ctx.effect(() => () => assistant.stop(), 'fishball: assistant session')
  use(assistant)
  // Start without blocking the host tree: a slow resume must not delay other rows.
  void assistant.start().catch((error) => logger.warn('assistant start failed (%s)', diagnosticOf(error)))
}
