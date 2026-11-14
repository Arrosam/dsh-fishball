/**
 * The contribution registry of one connector activation (task C-EXT; design §13.2–§13.5;
 * R-EXT-01…05, R-EXT-09, R-EXT-12, R-EXT-15, R-EXT-19; spike V3-S5 `8f2788e`).
 *
 * It owns the tool table, the namespace claims (TQ-13), the in-flight calls and the list-change
 * notification. It answers who may register, what `tools/list` shows and which registration a
 * `tools/call` reaches. The call and emit pipelines (calls.js, emit.js) run on top of it. The
 * activation records it reads belong to the contributors (activation.js), so they outlive it.
 *
 * Visibility (R-EXT-04, S5 Q4): a registration is listed and callable only while
 * - it is not disposed;
 * - its owner fiber is loading or active;
 * - its activation is current and not quarantined;
 * - this registry is open.
 * Every request evaluates it, so a contributor that is being disposed is invisible before its
 * disposers run. The table itself changes synchronously (design §13.4 step 1).
 */
import {
  CONTRIBUTOR_META_KEY, REGISTER_REFUSAL, REGISTRATION_STATE, ToolContributionError, ABORT_REASON,
  defineTool, effectiveLimits, isReservedNamespace, publicNameOf,
} from '../../tools/index.js'
import { refusalSchema } from '../../mcp-schema/index.js'
import { constant } from '../../mcp-schema/schema.js'
import { activationOf, isCurrent, recordOutcome, takeCommitted } from './activation.js'
import { HOST, LOG, RESULT_FIELD } from './constants.js'
import { contributorOf, isLive } from './identity.js'

const refusal = (code) => new ToolContributionError(code)

/**
 * The `outputSchema` advertised in `tools/list`, the same way the core tools advertise theirs
 * (Fishball 2026-11-14, C): `oneOf` the contributor's data schema extended with `ok: true`, and
 * K1's refusal envelope, so a client that checks `structuredContent` against it accepts both what
 * the connector sends on success (`{...data, ok: true}`) and every refusal. A data schema that
 * declares `ok` itself cannot be extended without changing its meaning, so it is refused
 * `tool-invalid` (PROPOSED, Fishball 2026-11-14: K2 has no more specific code).
 * @returns {object | undefined}
 */
function advertisedOutputSchema(dataSchema) {
  if (dataSchema === undefined) return undefined
  const properties = dataSchema.properties ?? {}
  if (Object.hasOwn(properties, RESULT_FIELD.ok)) throw refusal(REGISTER_REFUSAL.toolInvalid)
  const success = {
    ...dataSchema,
    properties: { ...properties, [RESULT_FIELD.ok]: constant(true) },
    required: [...(dataSchema.required ?? []), RESULT_FIELD.ok],
  }
  return { oneOf: [success, refusalSchema()] }
}

/** The MCP `Tool` object of a registration (R-EXT-12, S5-Q3). */
function toolEntry(publicName, def, who) {
  const hints = def.annotations !== undefined && Object.keys(def.annotations).length > 0 ? def.annotations : undefined
  const outputSchema = advertisedOutputSchema(def.outputSchema)
  return Object.freeze({
    name: publicName,
    ...(def.title === undefined ? {} : { title: def.title }),
    description: def.description,
    inputSchema: def.inputSchema,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    ...(hints === undefined ? {} : { annotations: hints }),
    _meta: { [CONTRIBUTOR_META_KEY]: { plugin: who.pkg, version: who.version } },
  })
}

/**
 * @param {object} ports
 * @param {{info: Function, warn: Function}} ports.logger
 * @param {() => void} [ports.onToolsChanged] called once per event-loop turn after the list changed
 *   (design §13.4 step 3); the MCP layer sends `notifications/tools/list_changed` from it.
 * @param {(act: object) => void} ports.retireCommitted retires an activation's pending events (emit.js)
 */
export function createRegistry({ logger, onToolsChanged, retireCommitted }) {
  /** publicName → registration. */
  const table = new Map()
  /** namespace → {pkg, acts}: the first package to reach the registry keeps it (TQ-13). */
  const claims = new Map()
  /** Running calls: {registration, abort(reason)}. */
  const inFlight = new Set()
  /** Activations this registry is attached to. */
  const attached = new Set()
  let closed = false
  /**
   * The connector row's fiber, once `provide` bound the registry to it. Like a contributor's, it
   * turns UNLOADING before its effects run (S5 L2), so a call in that window is already
   * `registry-closed` (EXT-EP-01 #13), not answered as if the connector were still up.
   */
  let hostFiber
  const isClosed = () => closed || (hostFiber !== undefined && !isLive(hostFiber))
  let changeScheduled
  /** Contributors already refused because another package holds their namespace (TQ-13: logged once). */
  const loggedNamespaceClash = new Set()

  /** Coalesce list changes per event-loop turn into one notification (design §13.4 step 3). */
  function changed() {
    if (closed || changeScheduled !== undefined || onToolsChanged === undefined) return
    changeScheduled = setImmediate(() => {
      changeScheduled = undefined
      try { onToolsChanged() } catch (error) { logger.warn(LOG.listChangedFailed, error?.name) }
    })
  }

  const isVisible = (reg) => !isClosed() && !reg.disposed && isLive(reg.owner) && isLive(reg.act.root) && isCurrent(reg.act) && !reg.act.quarantined

  /** Abort the running calls a predicate selects, with `reason`. */
  function abortCalls(select, reason) {
    for (const call of [...inFlight]) if (select(call.registration)) call.abort(reason)
  }

  /** Remove registrations from the table; aborts their calls; notifies when a listed one left. */
  function removeWhere(select) {
    let wasListed = false
    for (const [publicName, reg] of [...table]) {
      if (!select(reg)) continue
      wasListed ||= isVisible(reg)
      reg.disposed = true
      table.delete(publicName)
    }
    abortCalls(select, ABORT_REASON.withdrawn)
    if (wasListed) changed()
  }

  /**
   * The caller as a contributor allowed to use the service, or a refusal code: the checks shared
   * by `register` and `emit`, in EMIT_CHECK_ORDER's order (registry-closed, contributor-unidentified,
   * namespace-reserved). The namespace is not claimed here: `claim` does that once the caller is
   * accepted. A namespace clash is logged here, once per contributor package (TQ-13), so its
   * result says `logged`.
   * @returns {{who: object} | {code: string, who?: object, logged?: boolean}}
   */
  function admit(ctx) {
    if (isClosed()) return { code: REGISTER_REFUSAL.registryClosed }
    const who = contributorOf(ctx)
    if (who === undefined) return { code: REGISTER_REFUSAL.contributorUnidentified }
    const holder = claims.get(who.namespace)
    if (isReservedNamespace(who.namespace) || (holder !== undefined && holder.pkg !== who.pkg)) {
      if (!loggedNamespaceClash.has(who.pkg)) {
        loggedNamespaceClash.add(who.pkg)
        logger.warn(LOG.refused, who.namespace, REGISTER_REFUSAL.namespaceReserved)
      }
      return { code: REGISTER_REFUSAL.namespaceReserved, who, logged: true }
    }
    // A caller whose own fiber is no longer loading or active (a handle kept past its unload) is
    // `inactive`: `register` refuses it `contributor-unidentified` (Fishball 2026-11-14, E:
    // `registry-closed` means the connector), `emit` answers `contributor-unavailable` (EXT-DT-01
    // rule 1, S5 D8).
    if (!isLive(who.fiber) || !isLive(who.root)) return { code: REGISTER_REFUSAL.contributorUnidentified, who, inactive: true }
    return { who }
  }

  /** The caller's activation, attached to this registry, with its namespace claimed; or undefined. */
  function claim(who) {
    const act = activationOf(who)
    if (act === undefined) return undefined
    act.registries.add(api)
    attached.add(act)
    const holder = claims.get(who.namespace) ?? { pkg: who.pkg, acts: new Set() }
    holder.acts.add(act)
    claims.set(who.namespace, holder)
    return act
  }

  /** Log a refusal and throw it (EXT-EP-01 #14: nothing registered, one log line). */
  function refuse(code, who, logged = false) {
    if (!logged) logger.info(LOG.refused, who?.namespace ?? LOG.unidentified, code)
    throw refusal(code)
  }

  /**
   * `register(def)` for the caller context `ctx` (design §13.2). Returns the idempotent disposer.
   * @throws {ToolContributionError} a REGISTER_REFUSAL code
   */
  function register(ctx, definition) {
    const admitted = admit(ctx)
    if (admitted.code !== undefined) refuse(admitted.code, admitted.who, admitted.logged)
    const { who } = admitted
    let def, publicName, entry
    try {
      def = defineTool(definition)
      publicName = publicNameOf(who.namespace, def.name)
      entry = toolEntry(publicName, def, who)
    } catch (error) {
      refuse(error instanceof ToolContributionError ? error.code : REGISTER_REFUSAL.toolInvalid, who)
    }
    const holder = table.get(publicName)
    // A registration whose owner fiber is already gone only waits for its disposer; it holds no name.
    if (holder !== undefined && isLive(holder.owner) && !holder.act.ended) refuse(REGISTER_REFUSAL.toolExists, who)
    if (holder !== undefined) removeWhere((other) => other === holder)
    const act = claim(who)
    if (act === undefined) refuse(REGISTER_REFUSAL.contributorUnidentified, who)
    const reg = { publicName, def, limits: effectiveLimits(def), entry, act, owner: who.fiber, disposed: false }
    const dispose = () => {
      if (reg.disposed) return
      removeWhere((other) => other === reg)
    }
    // Bound to the *calling* fiber: an inject sub-scope that unloads disposes its own tools, even
    // when the contributor never calls the disposer (design §13.2).
    try {
      who.ctx.effect(() => dispose, HOST.labels.registration)
    } catch {
      refuse(REGISTER_REFUSAL.contributorUnidentified, who)
    }
    table.set(publicName, reg)
    // A quarantined activation's registration is accepted but not listed (EXT-ST-01 #6, K2).
    if (isVisible(reg)) changed()
    logger.info(LOG.registered, who.namespace, def.name)
    return dispose
  }

  /** The caller's registrations in its current activation (R-EXT-01 `mine`). */
  function mine(ctx) {
    const who = contributorOf(ctx)
    const act = who?.root[HOST.activationKey]
    if (act === undefined) return Object.freeze([])
    const state = act.quarantined ? REGISTRATION_STATE.quarantined : REGISTRATION_STATE.active
    return Object.freeze([...table.values()].filter((reg) => reg.act === act && !reg.disposed)
      .map((reg) => Object.freeze({ name: reg.def.name, publicName: reg.publicName, state })))
  }

  /** The listed contributed tools, sorted by public name (R-EXT-12; the core tools come first, in the MCP layer). */
  const list = () => [...table.values()].filter(isVisible).map((reg) => reg.entry)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  /** The registration a `tools/call` of `publicName` reaches, or undefined ("unknown tool", design §13.5 steps 1–2). */
  function resolve(publicName) {
    const reg = typeof publicName === 'string' ? table.get(publicName) : undefined
    return reg !== undefined && isVisible(reg) ? reg : undefined
  }

  /** Release the activation's namespace claim when no activation of that package holds it any more. */
  function release(act) {
    attached.delete(act)
    const holder = claims.get(act.namespace)
    if (holder === undefined) return
    holder.acts.delete(act)
    if (holder.acts.size === 0) claims.delete(act.namespace)
  }

  /** Withdraw what an activation holds here: its tools, its calls and its pending events (R-EXT-04, R-EXT-19). */
  function withdrawActivation(act) {
    removeWhere((reg) => reg.act === act)
    retireCommitted(act, takeCommitted(act))
  }

  const api = Object.freeze({
    register,
    mine,
    list,
    resolve,
    admit,
    claim,
    /** How many calls of an activation are running (TOOL_LIMITS.contributorInFlightCalls). */
    runningFor: (act) => [...inFlight].filter((call) => call.registration.act === act).length,
    /**
     * Count one outcome toward the activation's quarantine (R-EXT-09, R-EXT-19). When it
     * quarantines, every registry attached to the activation withdraws it, and it is logged once.
     */
    count(act, failed) {
      if (!recordOutcome(act, failed)) return
      logger.warn(LOG.quarantined, act.namespace)
      for (const registry of [...act.registries]) registry.activationQuarantined(act)
    },
    /** Track a running call, so a withdrawal can abort it. Returns its untrack function. */
    track(call) {
      inFlight.add(call)
      return () => inFlight.delete(call)
    },
    /** The activation ended (its contributor was disabled, unloaded, reloaded or uninstalled). */
    activationEnded(act) {
      withdrawActivation(act)
      release(act)
      logger.info(LOG.withdrawn, act.namespace)
    },
    /**
     * The activation was quarantined (R-EXT-09): its registrations stay in the table but are no
     * longer listed (`mine()` shows them `quarantined`). Its calls are aborted and its pending
     * events retired.
     */
    activationQuarantined(act) {
      const wasListed = [...table.values()].some((reg) => reg.act === act && !reg.disposed)
      abortCalls((reg) => reg.act === act, ABORT_REASON.withdrawn)
      retireCommitted(act, takeCommitted(act))
      if (wasListed) changed()
    },
    /** Bind the registry's lifetime to the connector row's fiber (see `hostFiber`). */
    bindHost(fiber) { hostFiber = fiber },
    /**
     * Connector unload (EXT-ST-01 #10): later calls through a saved handle get `registry-closed`,
     * every running call is withdrawn, and the activations stay with their contributors.
     */
    close() {
      if (closed) return
      closed = true
      if (changeScheduled !== undefined) clearImmediate(changeScheduled)
      abortCalls(() => true, ABORT_REASON.withdrawn)
      for (const reg of table.values()) reg.disposed = true
      table.clear()
      for (const act of attached) act.registries.delete(api)
      attached.clear()
      claims.clear()
    },
  })
  return api
}
