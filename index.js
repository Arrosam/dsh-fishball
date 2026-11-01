/**
 * Fishball host half: one DSH host row that owns the always-on assistant session.
 *
 * Wiring only; each responsibility lives in its own module:
 * - src/config.js          safety limits (live plugin config)
 * - src/store.js           durable assistant record, plugin states, tool allowances (fails closed)
 * - src/composition.js     scope P, persona, private tree, tool mask, bsk_inspect copy, guards
 * - src/plugin-catalog.js  Fishball's own plugin states and tool decisions
 * - src/plugin-defaults.js which DSH plugins keep the old default (others start off in Fishball)
 * - src/fishball-packages.js plugins installed in Fishball only (its own package folder)
 * - src/plugin-tools.js    list_plugins, set_plugin_enabled, add_plugin, remove_plugin, plugin settings tools
 * - src/plugin-settings.js settings of the plugins Fishball runs itself (the plugin manager, DESIGN §10d)
 * - src/context-window.js  the context-window setting and its enforcement (src/context-policy.js)
 * - src/intake.js          every input that wakes Fishball (durable, deduplicated, wake guard)
 * - src/messaging.js       message_fishball, "Send to Fishball", message_session, start_session
 * - src/managed.js         which sessions Fishball manages, their tools, Hand over / Take back, release_session
 * - src/session-titles.js  current titles of the managed sessions (the settings page's list)
 * - src/watches.js         "tell Fishball when finished": watches, their notices and tools
 * - src/unread.js          unread replies from Fishball (the sidebar mark's count)
 * - src/preferences.js    your display choices (the sidebar brand icon)
 * - src/approvals.js       managed sessions' permission requests go to Fishball first
 * - src/request-desk.js    ask_fishball and list_user_messages (managed sessions only)
 * - src/passes.js          one-time passes and to-you tickets
 * - src/pile.js            your pile: requests Fishball sent you, answered there or on the session's row
 * - src/tags.js            tag records: each answer Fishball gave, for the asking turn's tail
 * - src/grants.js          standing grants: calls they cover run without waking Fishball
 * - src/result-wording.js  what an agent reads after Fishball answered its direct call
 * - src/sources.js         ctx.fishball: plugins publish events to Fishball (DESIGN §8)
 * - src/lifecycle.js       create / resume / recovery / archive of the one session
 * - src/http.js            /api/fishball/* for the settings page, the brand button and the Messenger look
 */
// Evaluated first, so the register() wrapper sees every tool registered after this row loads.
import './src/tool-attribution.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Config, readLimits } from './src/config.js'
import { PLUGIN, ERROR, STATUS, EVENT, SERVICE, API_CODE, CHANGED_BY, PLUGIN_ERROR, CONTEXT, WATCH_BY, AGENT_IDLE, MESSENGER, HTTP, PACKAGE_ERROR, FEATURE_OFF, GRANT_END, GRANT_ERROR } from './src/constants.js'
import { LifecycleStateError, diagnosticOf } from './src/errors.js'
import { StateFeed } from './src/state-feed.js'
import { Store } from './src/store.js'
import { AssistantComposition } from './src/composition.js'
import { CatalogError, PluginCatalog, fishballInstalledKey } from './src/plugin-catalog.js'
import { ContextWindow } from './src/context-window.js'
import { IntakeError, IntakeLedger } from './src/intake.js'
import { MESSAGING_TOOL, registerInbound, registerOutbound, SOURCE_ID } from './src/messaging.js'
import { MANAGED_TOOL, ManagedError, ManagedRegistry } from './src/managed.js'
import { SessionTitles } from './src/session-titles.js'
import { uncheckedToolsNotifier } from './src/unchecked-notice.js'
import { WATCH_TOOL, Watches, WatchError } from './src/watches.js'
import { Unread } from './src/unread.js'
import { Preferences } from './src/preferences.js'
import { APPROVAL_TOOL, ApprovalBroker } from './src/approvals.js'
import { DESK_TOOL, requestDeskTools } from './src/request-desk.js'
import { CallPasses } from './src/passes.js'
import { Pile } from './src/pile.js'
import { TagRecords } from './src/tags.js'
import { GRANT_TOOL, Grants } from './src/grants.js'
import { ResultWording } from './src/result-wording.js'
import { SourceRegistry } from './src/sources.js'
import { PLUGIN_TOOL, registerPluginTools } from './src/plugin-tools.js'
import { PluginDefaults } from './src/plugin-defaults.js'
import { PluginSettings, SettingsError } from './src/plugin-settings.js'
import { FishballPackages, PackageError } from './src/fishball-packages.js'
import { byteLength } from './src/text.js'
import { mountFishballPluginManager } from './src/fishball-plugin-manager.js'
import { AssistantLifecycle, InactiveLifecycle } from './src/lifecycle.js'
import { registerRoutes } from './src/http.js'
import { HIDDEN_TOOLS } from './src/tool-rules.js'
import { FEATURE_KEY } from './src/builtins.js'

export const name = PLUGIN.name
export { Config }

/** Services the row cannot work without; see SERVICE for why each is needed. */
export const inject = Object.values(SERVICE)

/** Each tool Fishball registers, by the key of its own plugin (DESIGN §10d revision 10c). */
const OWN_TOOL_PLUGIN = new Map([
  [MESSAGING_TOOL, FEATURE_KEY.messages],
  [MANAGED_TOOL, FEATURE_KEY.messages],
  [WATCH_TOOL, FEATURE_KEY.watching],
  [PLUGIN_TOOL, FEATURE_KEY.plugins],
  [APPROVAL_TOOL, FEATURE_KEY.approvals],
  [DESK_TOOL, FEATURE_KEY.approvals],
  [GRANT_TOOL, FEATURE_KEY.approvals],
].flatMap(([tools, key]) => Object.values(tools).map((name) => [name, key])))

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
  let unreadView = () => null
  let preferencesView = () => null
  /** The Messenger look's on/off for the browser (DESIGN §10c); null until the catalog exists. */
  let lookView = () => null
  /** Which of Fishball's own feature plugins run (revision 10c); null until the catalog exists. */
  let featuresView = () => null
  /** Managed sessions (revision 11, §10e); null until the registry exists. */
  let managedView = () => null
  /** Your pile and the tag records (rev11c, §10e); null until the broker exists. */
  let pileView = () => null
  let tagsView = () => null
  /** Active standing grants (rev11d, §10e); null until they exist. */
  let grantsView = () => null
  /** Fishball's tools that only managed sessions have, listed under their plugin ("For other sessions"). */
  let managedToolNames = () => []
  /** Make each feature follow its plugin's applied state; wired once the features exist. */
  let syncFeatures = () => {}
  const snapshot = () => ({ ...lifecycle.snapshot(), limits: limits(), hiddenTools: [...HIDDEN_TOOLS], catalog: catalogView(), contextWindow: contextView(), intake: intakeView(), outbox: outboxView(), watches: watchesView(), approvals: approvalsView(), sources: sourcesView(), unread: unreadView(), preferences: preferencesView(), look: lookView(), features: featuresView(), managed: managedView(), pile: pileView(), tags: tagsView(), grants: grantsView() })
  /** Called on every published change once ctx.fishball exists (sources may become enabled). */
  let refreshSources = () => {}
  const publish = () => { refreshSources(); feed.publish(snapshot()) }
  /** Replace the active lifecycle (the stand-ins and the real one share one contract). */
  const use = (next) => { lifecycle = next; publish() }
  const commands = { setPlugin: unavailable, removePlugin: unavailable, removeAllowance: unavailable, pluginDetail: unavailable, pluginIcon: unavailable, saveSettings: unavailable, inspectInstall: unavailable, install: unavailable, cancelInstall: unavailable, refreshPlugins: unavailable, setContextWindow: unavailable, send: unavailable, addWatch: unavailable, removeWatch: unavailable, markRead: unavailable, setBrandStyle: unavailable, setManaged: unavailable, answerRequest: unavailable, revokeGrant: unavailable }
  registerRoutes(ctx, {
    snapshot,
    subscribe: (listener) => feed.subscribe(listener),
    recover: (action) => lifecycle.recover(action),
    setPlugin: (plugin, on) => commands.setPlugin(plugin, on),
    removePlugin: (plugin) => commands.removePlugin(plugin),
    removeAllowance: (toolKey) => commands.removeAllowance(toolKey),
    pluginDetail: (plugin) => commands.pluginDetail(plugin),
    pluginIcon: (plugin) => commands.pluginIcon(plugin),
    saveSettings: (input) => commands.saveSettings(input),
    inspectInstall: (spec) => commands.inspectInstall(spec),
    install: (input) => commands.install(input),
    cancelInstall: (requestId) => commands.cancelInstall(requestId),
    refreshPlugins: () => commands.refreshPlugins(),
    setContextWindow: (setting) => commands.setContextWindow(setting),
    send: (input) => commands.send(input),
    addWatch: (input) => commands.addWatch(input),
    removeWatch: (input) => commands.removeWatch(input),
    markRead: () => commands.markRead(),
    setBrandStyle: (style) => commands.setBrandStyle(style),
    setManaged: (input) => commands.setManaged(input),
    answerRequest: (input) => commands.answerRequest(input),
    revokeGrant: (input) => commands.revokeGrant(input),
    // Read per request: served whether the look is on or off, the browser decides (DESIGN §10c).
    messengerScript: () => readFile(path.join(import.meta.dirname, MESSENGER.clientFile)),
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
  // Decided once, before the first catalog listing: an install whose session already exists
  // keeps the old default for the DSH plugins present now (src/plugin-defaults.js).
  const defaults = new PluginDefaults(store)
  try {
    await defaults.begin(store.assistant().sessionId !== null)
  } catch (error) {
    logger.warn('plugin defaults could not be recorded (%s)', diagnosticOf(error))
    return use(new InactiveLifecycle(STATUS.failed, ERROR.storeUnreadable, store.assistant()))
  }
  const packages = new FishballPackages(ctx, logger)
  // Installs run DSH's own install process, inherited for Fishball's folder (DESIGN §10d, S31).
  packages.attachManager((facts) => mountFishballPluginManager(ctx, facts, limits().pluginManagerStartMs))
  // Boot mounts the tree once with the first evaluation; later policy changes remount through
  // the catalog's idle-phase apply (a change mid-turn waits for the turn to end).
  let booted = false
  /** Run after each idle-phase apply; wired to the unchecked-tools notice once it exists. */
  let afterApply = () => {}
  const contextWindow = new ContextWindow(ctx, store, logger, {
    onChange: () => publish(),
    onPolicyChange: () => { if (booted) void catalog.schedule() },
    isCompactionRunning: () => catalog.isRunning(CONTEXT.compactionPlugin),
    readLimits: limits,
  })
  const catalog = new PluginCatalog(ctx, store, logger, {
    readLimits: limits,
    mountRows: (rows) => composition.mountRows(rows),
    // The context window sets the compaction row; then your plugin settings go on top (DESIGN §10d).
    adjustRows: (key, rows, purpose) => settings.overlay(key, key === CONTEXT.compactionPlugin ? contextWindow.compactionRows(rows, purpose) : rows, purpose),
    // A DSH plugin just turned on for Fishball may bring unchecked tools Fishball must hear about (DESIGN §7).
    onApplied: () => { contextWindow.confirmApplied(catalog.isRunning(CONTEXT.compactionPlugin)); settings.confirmApplied(); afterApply() },
    pendingRowIds: () => composition.pendingRowIds(),
    ownsDefinition: (definition) => composition.ownsDefinition(definition),
    onChange: () => { composition.refreshMasks(); syncFeatures(); publish() },
    defaults,
    packages,
    hasSettings: (key) => settings.has(key),
    ownPluginOf: (name) => OWN_TOOL_PLUGIN.get(name),
    otherSessionTools: () => managedToolNames(),
  })
  // Settings of the plugins Fishball runs in its private tree (DESIGN §10d).
  const settings = new PluginSettings(store, {
    rowsOf: (key) => catalog.settingsRows(key),
    loadModule: (name) => composition.loadPluginModule(name),
    resolveConfig: (config) => composition.resolveConfig(config),
    // The context window owns the Compaction engine row's config (DESIGN §6): no second form.
    isFixedRow: (key, rowId) => key === CONTEXT.compactionPlugin && rowId === CONTEXT.compactionRow,
    onSaved: () => { publish(); void catalog.schedule() },
    audit: (plugin, action, by, outcome) => catalog.audit(plugin, action, by, outcome),
    logger,
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
    packages,
    settings,
    logger,
    readLimits: limits,
  })
  // An uninstall a restart interrupted finishes now (its rows were not mounted at boot).
  void catalog.finishRemovals()
  catalogView = () => catalog.snapshot(composition.decisions())
  // The choice, not the applied state: the look mounts no rows, so the browser need not wait
  // for Fishball's turn to end before it changes.
  lookView = () => ({ messenger: catalog.desiredOn(MESSENGER.pluginKey) })
  // The browser hides your buttons of a feature that is off (revision 10c).
  featuresView = () => Object.fromEntries(Object.entries(FEATURE_KEY).map(([feature, key]) => [feature, catalog.isAppliedOn(key)]))
  contextView = () => contextWindow.snapshot()

  // Inputs (DESIGN §5b) and handing work off (§5d).
  const assistantId = () => store.assistant().sessionId
  /** The assistant's running agent; read through a function, the lifecycle is created below. */
  let assistantAgent = () => undefined
  const ledger = new IntakeLedger(ctx, store, logger, { readLimits: limits, onChange: () => publish() })
  composition.addAgentSetup((agentCtx, agent) => ledger.installAgent(agentCtx, agent))
  // Watches (DESIGN §5c): set up by you, by Fishball, or by another agent for its own session.
  const watches = new Watches(ctx, store, logger, { ledger, readLimits: limits, assistantId, onChange: () => publish(), isEnabled: () => catalog.isAppliedOn(FEATURE_KEY.watching) })
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
  /** Managed sessions (revision 11, §5e); created below, once message_fishball's definition exists. */
  let managedRegistry
  const manage = (sessionId, by) => managedRegistry.manage(sessionId, by)
  const messagesOn = () => catalog.isAppliedOn(FEATURE_KEY.messages)
  const inbound = registerInbound({ ctx, ledger, readLimits: limits, assistantId, isLive: () => assistantAgent() !== undefined, watch: watchFor, isEnabled: messagesOn, isManaged: (sessionId) => managedRegistry.isManaged(sessionId), manage })
  const outbound = registerOutbound({ ctx, register: (definition) => composition.registerOwnTool(definition), store, readLimits: limits, assistantId, logger, onChange: () => publish(), watch: watchFor, manage })
  const approvalsOn = () => catalog.isAppliedOn(FEATURE_KEY.approvals)
  /** ask_fishball and list_user_messages; created with the broker below. */
  let deskTools = []
  /**
   * What a managed agent has now: message_fishball while Session messages runs (rev11a), and
   * ask_fishball and list_user_messages while Permission requests runs (rev11b, §5e Reading).
   */
  const managedTools = () => [...(messagesOn() ? [inbound.tool] : []), ...(approvalsOn() ? deskTools : [])]
  // The settings page lists managed sessions by title (§10e): titles followed while they are managed.
  const sessionTitles = new SessionTitles(ctx, { onChange: () => publish() })
  const followManaged = () => sessionTitles.follow(managedRegistry.snapshot().map((entry) => entry.sessionId))
  managedRegistry = new ManagedRegistry(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, onChange: () => { followManaged(); publish() }, isEnabled: messagesOn, managedTools,
    // Waiting requests of a session taken back or released go to you, and its grants end (§5e);
    // the broker and the grants exist below.
    onLeave: (sessionId, change) => {
      broker.releaseSession(sessionId)
      void grants.endSession(sessionId, change).catch(logged('grants end'))
    },
  })
  managedRegistry.registerTools((definition) => composition.registerOwnTool(definition))
  followManaged()
  managedView = () => managedRegistry.snapshot().map((entry) => ({ ...entry, title: sessionTitles.get(entry.sessionId) }))
  managedToolNames = () => managedTools().map((tool) => tool.name)
  /** Sessions related to Fishball (read_session, DESIGN §5c): watched, messaged it, messaged or started by it, or forwarded by you. */
  const related = (sessionId) => watches.watched(sessionId) || ledger.hasSource(sessionId, Object.values(SOURCE_ID)) || outbound.contacted(sessionId)
  watches.registerTools((definition) => composition.registerOwnTool(definition), related)
  watchesView = () => watches.snapshot()
  // Replies you have not seen (the mark's count); cleared when the browser shows Fishball's chat.
  const unread = new Unread(ctx, store, logger, { assistantId, onChange: () => publish() })
  unreadView = () => unread.snapshot()
  commands.markRead = () => unread.markRead()
  const preferences = new Preferences(store, { onChange: () => publish() })
  preferencesView = () => preferences.snapshot()
  commands.setBrandStyle = (style) => preferences.setBrandStyle(style)
  // Requests Fishball sends you, and the tags of its answers (rev11c, §7a.6, §9).
  const pile = new Pile(() => publish())
  const tags = new TagRecords(store, limits, { logger, onChange: () => publish() })
  // Standing grants (rev11d, §7a.8): paused while Fishball is not live or Permission requests is off.
  const grants = new Grants(store, logger, { readLimits: limits, isPaused: () => assistantAgent() === undefined || !approvalsOn(), onChange: () => publish(), isManaged: (sessionId) => managedRegistry.isManaged(sessionId) })
  grants.registerTools((definition) => composition.registerOwnTool(definition))
  ctx.effect(() => () => grants.stop(), 'fishball: grant expiry timer')
  // Managed sessions' permission requests go to Fishball first (DESIGN §7a).
  const broker = new ApprovalBroker(ctx, store, logger, {
    ledger, readLimits: limits, assistantId, isLive: () => assistantAgent() !== undefined,
    startedByFishball: (sessionId) => outbound.started(sessionId), agentOf: () => assistantAgent(), onChange: () => publish(),
    isEnabled: approvalsOn,
    isManaged: (sessionId) => managedRegistry.isManaged(sessionId),
    passes: new CallPasses(),
    // The one post-execute listener that sets Fishball's wording (spike S35).
    wording: new ResultWording(ctx),
    pile,
    tags,
    grants,
    // answer_prompt makes the prompt's session managed (the fifth way in, rev11e §7a.9).
    manage,
  })
  broker.registerTools((definition) => composition.registerOwnTool(definition))
  deskTools = requestDeskTools({ ctx, broker, readLimits: limits })
  // Managed agents already live get the two tools now that they exist.
  managedRegistry.sync()
  approvalsView = () => broker.snapshot()
  // Cards come only from managed sessions, whose titles are followed (session-titles.js); text, never markup (§10e).
  pileView = () => pile.cards().map((card) => ({ ...card, title: sessionTitles.get(card.sessionId) }))
  tagsView = () => tags.snapshot()
  // Grants belong to managed sessions, whose titles are followed (session-titles.js).
  grantsView = () => grants.snapshot().map((grant) => ({ ...grant, title: sessionTitles.get(grant.sessionId) }))
  // Your Revoke beside the pile (§10e): 409 unknown, or ended once it expired, was revoked or its session left.
  commands.revokeGrant = async ({ grantId }) => {
    const code = await grants.revoke(grantId, GRANT_END.user)
    if (code !== undefined) throw new LifecycleStateError(code === GRANT_ERROR.unknown ? API_CODE.unknown : API_CODE.ended)
  }
  // Your Allow once / Reject on a card (§10e): 409 expired once the card left; a note over maxMessageBytes is refused.
  commands.answerRequest = async ({ requestId, decision, note }) => {
    if (note !== undefined && byteLength(note) > limits().maxMessageBytes) throw new LifecycleStateError(API_CODE.tooLarge)
    if (!broker.answerCard({ requestId, decision, note })) throw new LifecycleStateError(API_CODE.expired)
  }
  // Off takes the feature away at the apply: message_fishball leaves managed sessions (they stay
  // managed, Q-r11-plugins-off), and requests waiting for Fishball go to you at once (revision 10c).
  syncFeatures = () => {
    managedRegistry.sync()
    if (!approvalsOn()) broker.releaseAll()
  }
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
    // Off answers feature-off even while Fishball is stopped (review L4).
    if (!catalog.isAppliedOn(FEATURE_KEY.watching)) return Promise.reject(new LifecycleStateError(FEATURE_OFF))
    if (assistantAgent() === undefined) return unavailable()
    return asApiError(WatchError)(() => watches.add({ sessionId, by: { kind: WATCH_BY.user } }))
  }
  commands.removeWatch = ({ watchId }) => asApiError(WatchError)(() => watches.remove(watchId))
  intakeView = () => ledger.snapshot()
  outboxView = () => outbound.snapshot()
  const notifyUnchecked = uncheckedToolsNotifier({ ledger, catalog, decisions: () => composition.decisions(), store, logger })
  /** The notice asks Fishball to call set_plugin_enabled: only while Plugin management gives it that tool (review L3). */
  const canNotifyUnchecked = () => assistantAgent() !== undefined && catalog.isAppliedOn(FEATURE_KEY.plugins)
  afterApply = () => { if (canNotifyUnchecked()) notifyUnchecked() }
  commands.send = ({ sessionId, note }) => asApiError(IntakeError)(() => inbound.forward(sessionId, note))
  // Hand over to Fishball / Take back from Fishball (§10e): 409 unavailable while Fishball is not
  // live (archived, stopped, in recovery, failed), as the watches route reads "ready" (§5c).
  commands.setManaged = ({ sessionId, managed }) => {
    // Off answers feature-off even while Fishball is stopped, as for watches (review L4).
    if (!messagesOn()) return Promise.reject(new LifecycleStateError(FEATURE_OFF))
    if (assistantAgent() === undefined) return unavailable()
    return asApiError(ManagedError)(() => (managed ? managedRegistry.handOver(sessionId) : managedRegistry.takeBack(sessionId)))
  }
  const logged = (label) => (error) => logger.warn('%s failed (%s)', label, diagnosticOf(error))
  // Sessions DSH no longer finds leave the registry (§9), and their grants end. Grants that ended
  // while DSH was down end now (§11 "Restart").
  void managedRegistry.prune().catch(logged('managed sessions check'))
  void grants.reconcile().catch(logged('grants check'))
  /** A row waiting for a service may run now; its tools may have appeared too. */
  const recheck = () => void catalog.recheckWaiting().catch(logged('waiting re-audit'))
  // A tool registered or removed anywhere can change Fishball's catalog view, and may bring
  // unchecked tools Fishball must be told about.
  ctx.on(EVENT.toolsChange, () => { queueMicrotask(publish); recheck(); if (canNotifyUnchecked()) notifyUnchecked() })
  ctx.on(EVENT.service, recheck)
  // A bundle installed or toggled while DSH runs joins the catalog at once (refresh schedules
  // the apply when the catalog's shape changed); the state feed shows it without a turn.
  // A tool registered by a bundle installed at runtime arrives BEFORE the catalog knows the
  // bundle, so it cannot be tied to a profile plugin yet; re-check once the catalog has it.
  ctx.on(EVENT.pluginManagerChanged, () => void catalog.refresh().then(() => {
    publish()
    if (canNotifyUnchecked()) notifyUnchecked()
  }).catch(logged('catalog refresh')))
  /** Run one of your plugin changes; a CatalogError answers 409 unknown or refused. */
  const pluginChange = async (change) => {
    await catalog.refresh()
    try {
      await change()
    } catch (error) {
      if (error instanceof CatalogError) throw new LifecycleStateError(error.code === PLUGIN_ERROR.unknownPlugin ? API_CODE.unknown : API_CODE.refused)
      throw error
    }
  }
  commands.setPlugin = (plugin, on) => pluginChange(() => catalog.setDesired(plugin, on, CHANGED_BY.user))
  // Your own uninstall needs no prompt: you are the one approving (DESIGN §4).
  commands.removePlugin = (plugin) => pluginChange(() => catalog.requestRemove(plugin, CHANGED_BY.user))
  /** A PackageError as a 409 with its code (and the packages whose scripts wait for your approval). */
  const asPackageAnswer = async (task) => {
    try { return await task() } catch (error) {
      if (error instanceof PackageError) throw new LifecycleStateError(error.code, error.details === undefined ? {} : { fields: error.details })
      throw error
    }
  }
  // Install for Fishball from the dialog (DESIGN §10d revision 10a): your click approves it, as in
  // DSH's own Add plugin; DSH's process installs into Fishball's folder, then it is turned on.
  /** A spec is your own text: maxMessageBytes bounds it, as it bounded the page's spec before (review L7). */
  const boundSpec = (spec) => {
    if (byteLength(spec) > limits().maxMessageBytes) throw new PackageError(PACKAGE_ERROR.tooLarge)
  }
  commands.inspectInstall = (spec) => asPackageAnswer(() => { boundSpec(spec); return packages.inspect(spec) })
  commands.cancelInstall = (requestId) => asPackageAnswer(() => packages.cancel(requestId))
  commands.install = ({ spec, requestId, approvedBuilds }) => asPackageAnswer(async () => {
    boundSpec(spec)
    const { name, version } = await packages.install(spec, { requestId, approvedBuilds })
    const plugin = fishballInstalledKey(name)
    // Installed either way; taking it in or turning it on can still be refused (restart required, the plugin limit).
    try {
      await catalog.adopt(name, CHANGED_BY.user)
      await catalog.setDesired(plugin, true, CHANGED_BY.user)
      return { plugin, name, version, on: true }
    } catch (error) {
      if (error instanceof CatalogError) return { plugin, name, version, on: false, code: error.code }
      throw error
    }
  })
  // The Fishball tab's Refresh: read the bundle list and Fishball's folder again, then publish.
  commands.refreshPlugins = async () => {
    await catalog.refresh()
    publish()
  }
  commands.setContextWindow = (setting) => contextWindow.save(setting)
  commands.removeAllowance = async (toolKey) => {
    if (!(await catalog.removeAllowance(toolKey))) throw new LifecycleStateError(API_CODE.unknown)
  }
  /** A plugin the catalog knows (after a fresh listing), else the given refusal. */
  const knownPlugin = async (plugin, status) => {
    await catalog.refresh()
    if (!catalog.has(plugin)) throw new LifecycleStateError(API_CODE.unknown, { status })
  }
  // The plugin page (DESIGN §10d): rows with their settings form, and the plugin's history.
  commands.pluginDetail = async (plugin) => {
    await knownPlugin(plugin, HTTP.notFound)
    const { shared, rows } = await settings.describe(plugin)
    return { plugin, shared, settings: catalog.settingsState(plugin), rows, history: catalog.history(plugin, limits().pluginHistoryShown) }
  }
  commands.pluginIcon = (plugin) => {
    const icon = catalog.has(plugin) ? catalog.iconOf(plugin) : undefined
    if (icon === undefined) throw new LifecycleStateError(API_CODE.unknown, { status: HTTP.notFound })
    return icon
  }
  /** How the settings route answers each refusal (DESIGN §10d "Host API"). */
  const SETTINGS_ANSWER = {
    [PLUGIN_ERROR.unknownRow]: () => new LifecycleStateError(API_CODE.unknown),
    [PLUGIN_ERROR.sharedWithDsh]: () => new LifecycleStateError(API_CODE.sharedWithDsh),
    [PLUGIN_ERROR.noSettings]: () => new LifecycleStateError(API_CODE.noSettings),
    [PLUGIN_ERROR.invalidSettings]: (error) => new LifecycleStateError(API_CODE.invalid, { status: HTTP.badRequest, fields: { path: error.path } }),
  }
  // Your own settings need no prompt: you are the one approving, and you may set secrets.
  commands.saveSettings = async ({ plugin, row, values, reset }) => {
    await knownPlugin(plugin)
    try {
      await settings.save(plugin, row, { values, reset }, { secrets: true }, CHANGED_BY.user)
    } catch (error) {
      if (error instanceof SettingsError && SETTINGS_ANSWER[error.code]) throw SETTINGS_ANSWER[error.code](error)
      throw error
    }
  }

  // Each time Fishball goes live: settle the intake queue (restart, adopt), then tell Fishball
  // about unchecked tools of plugins already on (DESIGN §7, §11 steps 4-6).
  const onLive = () => void ledger.reconcile().then(() => watches.catchUp()).then(() => { if (catalog.isAppliedOn(FEATURE_KEY.plugins)) notifyUnchecked() }).catch(logged('intake reconcile'))
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
