/**
 * ContextWindow: the context-window setting of the one assistant session (DESIGN §6).
 *
 * - Setting: { contextWindowTokens?, maxOutputTokens? } in domain fishball, recorded with the
 *   assistant session id it was made for, so it applies to that session only; an adopted new
 *   session starts from the defaults (R3 "persists for this session only").
 * - Effective window: min(your value, the model's window), the model's window coming from
 *   ctx.llm.resolveModelInfo for the route Fishball uses. It is re-evaluated when you save,
 *   after every turn (the model picker may have changed the route) and on
 *   llm/adapters-updated, and when a limit that prices it changes (src/config.js).
 * - Enforcement reuses DSH's compaction: the derived policy (src/context-policy.js) becomes
 *   the config of the compaction row in Fishball's private tree (compactionRows); a change
 *   schedules the catalog's idle-phase apply, and the loader then reloads only that row.
 * - Output cap: an agent-scoped, prepended agent/request listener sets each request's
 *   maxTokens (installAgent). It is read live, so a new cap applies from the next request.
 * - Hard ceiling (spike S6): a request whose measured size exceeds the effective window
 *   minus the reply cap is answered once per turn with a synthetic CONTEXT_WINDOW_EXCEEDED,
 *   which makes DSH's overflow compaction run and retry. A step must never be rejected (the
 *   user's message would be lost), so: only once per turn, and when DSH's recovery does not
 *   retry (nothing compactable, a failed summary, its retry already used), Fishball retries
 *   the request itself, which then goes to the model unchanged (installAgent).
 *   Overflow compaction keeps no retained tail (DSH selects with retain 0). Each hit leaves
 *   an assistant/attempt record in the log, as any failed attempt does.
 * - Known limits: an adopted new session's setup turn runs under the old session's
 *   compaction config until the next idle phase (its cap and ceiling are already its own);
 *   the cap treats a maxTokens equal to the logged one as carried over, so another plugin
 *   that sets the same value on every request is replaced by the cap from its second request.
 */
import { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm'
import { AGENT_IDLE, API_CODE, CONTEXT, CONTEXT_PROJECTION, EVENT, LLM_FINISH, OPTIONAL_SERVICE, REQUEST_RETRY } from './constants.js'
import { LifecycleStateError, diagnosticOf } from './errors.js'
import { PRICING_LIMITS, evaluateWindow } from './context-policy.js'
import { DEFAULT_LIMITS } from './config.js'
import { tokenCount } from './store.js'

/** The synthetic overflow's text (never shown to the user: DSH's overflow recovery consumes it). */
const OVERFLOW_MESSAGE = 'fishball: request exceeds the context window you set'

/** A setting you can save: each field a positive whole number or null (unset). */
export const isSettingInput = (value) => value === null || tokenCount.safeParse(value).success

/** Replace the config of the row with id rowId among rows, including group children. */
function withRowConfig(rows, rowId, config) {
  return rows.map((row) => {
    if (row.id === rowId) return { ...row, config }
    if (row.group && Array.isArray(row.config)) return { ...row, config: withRowConfig(row.config, rowId, config) }
    return row
  })
}

/** What applies with no setting: no cap, no ceiling. */
const DEFAULT_STATE = Object.freeze(evaluateWindow({}, {}, 0, DEFAULT_LIMITS))

/** The pricing limits' values, compared to tell a change of them from other config changes. */
const pricingKey = (limits) => JSON.stringify(PRICING_LIMITS.map((field) => limits[field]))

/** The compaction config as compared with the one last handed to the tree. */
const configKey = (config) => JSON.stringify(config)

/** Whether a failure is Fishball's own synthetic overflow (not the provider's). */
const isSyntheticOverflow = (failure) => failure?.code === CONTEXT_WINDOW_EXCEEDED_CODE && failure?.message === OVERFLOW_MESSAGE

export class ContextWindow {
  #ctx
  #store
  #logger
  #onChange
  #onPolicyChange
  #isCompactionRunning
  #readLimits
  #modelSelection
  /** pricingKey of the limits last seen, so only a change of them re-evaluates. */
  #pricing
  #agentOf = () => undefined
  #state = DEFAULT_STATE
  /** The assistant session #state was evaluated for (its setting is that session's). */
  #stateSession = null
  /**
   * The compaction config staged for the next apply, and the one an apply CONFIRMED running
   * (review N1: rows are built before they mount, so building proves nothing). #mounted is
   * undefined while Fishball's compaction is not running, so nothing is scheduled for it.
   */
  #staged
  #mounted
  /** Last model info each route reported, so a failed or slow lookup keeps enforcement. */
  #knownModels = new Map()
  /** Serializes evaluations, so a slow model lookup never overwrites a newer answer. */
  #evaluations = Promise.resolve()
  /** Whether this turn already got its one synthetic overflow (hard ceiling). */
  #overflowSent = false

  /**
   * @param ctx - fishball row context (llm, agentDefaultModel, sessionProjections; tokenMeter optional).
   * @param store - Store (settings table).
   * @param logger - plugin logger (codes only).
   * @param options.onChange - called after the published state changed.
   * @param options.onPolicyChange - called when the compaction config differs from the one
   *   last mounted (the catalog schedules its idle-phase apply).
   * @param options.isCompactionRunning - () => whether Fishball's compaction plugin runs.
   * @param options.readLimits - () => current limits (read at each evaluation and save).
   * @param options.modelSelection - () => dedicated Fishball choice, or null before an explicit save.
   */
  constructor(ctx, store, logger, { onChange, onPolicyChange, isCompactionRunning, readLimits, modelSelection = () => null }) {
    this.#ctx = ctx
    this.#store = store
    this.#logger = logger
    this.#onChange = onChange
    this.#onPolicyChange = onPolicyChange
    this.#isCompactionRunning = isCompactionRunning
    this.#readLimits = readLimits
    this.#modelSelection = modelSelection
    this.#pricing = pricingKey(readLimits())
    ctx.on(EVENT.adaptersUpdated, () => { void this.evaluate() })
    // DSH broadcasts every plugin's volatile change; only a change of the pricing limits matters here.
    ctx.on(EVENT.volatileUpdate, () => {
      const key = pricingKey(this.#readLimits())
      if (key === this.#pricing) return
      this.#pricing = key
      void this.evaluate()
    })
    ctx.on(EVENT.llmStream, (options, next) => this.#ceiling(options, next))
  }

  /** The assistant agent, once the lifecycle exists. */
  set agentOf(provider) {
    this.#agentOf = provider
  }

  /** The stored setting when it was made for the current assistant session, else {}. */
  setting() {
    const record = this.#store.settings.get(CONTEXT.settingsKey)
    if (record === undefined || record.sessionId !== this.#store.assistant().sessionId) return {}
    return { contextWindowTokens: record.contextWindowTokens, maxOutputTokens: record.maxOutputTokens }
  }

  /**
   * Re-evaluate the stored setting against the current model, and schedule a remount when
   * the compaction config differs from the one last MOUNTED (review M1: comparing with the
   * previous evaluation lost changes made while a mount was in progress).
   */
  evaluate() {
    const run = this.#evaluations.then(async () => {
      const sessionId = this.#store.assistant().sessionId
      this.#state = evaluateWindow(this.setting(), await this.#modelInfo(), this.#envelopeTokens(), this.#readLimits())
      this.#stateSession = sessionId
      this.reconcile()
      this.#onChange()
    })
    this.#evaluations = run.catch((error) => this.#logger.warn('context window evaluation failed (%s)', diagnosticOf(error)))
    return this.#evaluations
  }

  /**
   * Save your setting after checking it against the current model.
   * @param input - { contextWindowTokens, maxOutputTokens }, each a positive integer or null.
   * @throws LifecycleStateError with the CONTEXT_ERROR code it was refused with, or
   *   API_CODE.unavailable before the assistant session exists.
   */
  async save({ contextWindowTokens, maxOutputTokens }) {
    const sessionId = this.#store.assistant().sessionId
    if (sessionId === null) throw new LifecycleStateError(API_CODE.unavailable)
    const setting = { contextWindowTokens: contextWindowTokens ?? undefined, maxOutputTokens: maxOutputTokens ?? undefined }
    const candidate = evaluateWindow(setting, await this.#modelInfo(), this.#envelopeTokens(), this.#readLimits())
    if (candidate.error !== null) throw new LifecycleStateError(candidate.error)
    const table = this.#store.settings
    if (setting.contextWindowTokens === undefined && setting.maxOutputTokens === undefined) await table.delete(CONTEXT.settingsKey)
    else await table.put(CONTEXT.settingsKey, { sessionId, ...setting, changedAt: new Date().toISOString() })
    await this.evaluate()
  }

  /** Schedule a remount when the running compaction's config is not the current one. */
  reconcile() {
    if (this.#mounted !== undefined && configKey(this.#mounted) !== configKey(this.#state.config)) this.#onPolicyChange()
  }

  /**
   * The private tree's compaction rows with the engine config (catalog hook). An apply stages
   * the current config; a mid-turn listing mount keeps the confirmed one, so a policy change
   * still lands only in the idle phase (DESIGN §6).
   */
  compactionRows(rows, { listing = false } = {}) {
    const config = listing && this.#mounted !== undefined ? this.#mounted : this.#state.config
    if (!listing) this.#staged = config
    return withRowConfig(rows, CONTEXT.compactionRow, config)
  }

  /**
   * After an apply: the staged config is confirmed when Fishball's compaction runs; with it
   * off or broken nothing is mounted (review N1 b, c). A failed apply never gets here, so its
   * staged config stays unconfirmed and the next reconcile tries again (N1 a).
   */
  confirmApplied(compactionRunning) {
    this.#mounted = compactionRunning ? this.#staged : undefined
    this.reconcile()
  }

  /**
   * Agent setup: the reply cap, the ceiling's retry, and a re-evaluation after each turn.
   * Prepended, so each runs outermost and sees the final value.
   */
  installAgent(agentCtx, agent) {
    // A new agent may be a new session (adopt): evaluate for it at once (its first turn runs
    // on the defaults until then, see #stateOf).
    void this.evaluate()
    agentCtx.on(EVENT.agentRequest, async (payload, next) => this.#capped(agent, await next()), { prepend: true })
    agentCtx.on(EVENT.agentRequestError, async (payload, next) => {
      const action = await next()
      // DSH's recovery did not retry Fishball's own synthetic overflow: retry it here; the
      // ceiling has fired this turn, so the request now goes to the model (review H1).
      if (action?.kind !== REQUEST_RETRY && isSyntheticOverflow(payload.failure)) return { kind: REQUEST_RETRY }
      return action
    }, { prepend: true })
    agentCtx.on(EVENT.agentStatus, ({ agent: changed, status }) => {
      if (changed !== agent || status !== AGENT_IDLE) return
      this.#overflowSent = false
      void this.evaluate()
    })
  }

  /**
   * One request's config with Fishball's reply cap.
   * DSH seeds each request from the previous logged header, which keeps an explicit maxTokens
   * (dsh-agent-loop requestProposal drops only an adapter default). So a value equal to the
   * logged one is the previous request's, normally Fishball's own earlier cap: it is dropped,
   * letting the adapter's default apply, and the current cap is set. A value an inner
   * listener set for THIS request differs from the logged one and is kept, capped.
   */
  #capped(agent, config) {
    const cap = this.#stateOf(agent).outputCap
    const carried = config.maxTokens !== undefined && config.maxTokens === agent.session.requestHeader()?.config.maxTokens
    const { maxTokens, ...rest } = config
    const own = carried ? undefined : maxTokens
    if (cap === undefined) return own === undefined ? rest : { ...rest, maxTokens: own }
    return { ...rest, maxTokens: Math.min(own ?? cap, cap) }
  }

  /**
   * The evaluated state when it was evaluated for this agent's session, else no setting's
   * (DSH's defaults): an adopted new session's setup turn can start before the evaluation
   * for it finishes, and must not inherit the old session's cap (R3: this session only).
   */
  #stateOf(agent) {
    return agent.session.id === this.#stateSession ? this.#state : DEFAULT_STATE
  }

  /** Detached view for the settings page. */
  snapshot() {
    const setting = this.setting()
    // Until the evaluation for an adopted new session finishes, show what applies to it.
    const state = this.#stateSession === this.#store.assistant().sessionId ? this.#state : DEFAULT_STATE
    const agent = this.#agentOf()
    const pressure = this.#measured(agent)
    const smaller = state.error === null && state.effectiveWindow !== undefined && state.effectiveWindow < state.modelWindow
    return {
      contextWindowTokens: setting.contextWindowTokens ?? null,
      maxOutputTokens: setting.maxOutputTokens ?? null,
      modelWindow: state.modelWindow ?? null,
      effectiveWindow: state.effectiveWindow ?? null,
      outputCap: state.outputCap ?? null,
      threshold: state.threshold ?? null,
      pressureTokens: pressure ?? null,
      error: state.error,
      // A smaller window is enforced by compaction; with it off, only the reply cap applies.
      compactionOff: smaller && !this.#isCompactionRunning(),
    }
  }

  /**
   * The model window and default reply cap for Fishball's dedicated choice, as soon as
   * saved, even before a request logs that route. Without an explicit choice, preserve
   * the setup lifecycle's latest request route or DSH default fallback.
   * Bounded, so a slow adapter discovery never stalls boot or a save. A failed lookup keeps
   * the route's last known answer (review M3); unknown only if it was never known.
   */
  async #modelInfo() {
    const route = this.#modelSelection() ?? this.#agentOf()?.session.requestHeader()?.config ?? this.#ctx.agentDefaultModel.currentSelection()
    if (!route?.provider || !route?.model) return {}
    const key = route.provider + '\n' + route.model
    try {
      const info = await this.#ctx.llm.resolveModelInfo(route.provider, route.model, AbortSignal.timeout(CONTEXT.modelInfoTimeoutMs))
      const known = { window: info.context?.contextWindow, defaultMaxTokens: info.defaultMaxTokens }
      this.#knownModels.set(key, known)
      return known
    } catch (error) {
      this.#logger.warn('model window lookup failed (%s)', diagnosticOf(error))
      return this.#knownModels.get(key) ?? {}
    }
  }

  /** System prompt plus tool declarations of the latest request (DSH's context breakdown). */
  #envelopeTokens() {
    const breakdown = this.#projection(this.#agentOf(), CONTEXT_PROJECTION.breakdown)?.breakdown
    return breakdown === undefined ? 0 : breakdown.systemTokens + breakdown.toolsTokens
  }

  /**
   * The assistant session's current request size, as DSH's compaction measures it against
   * the threshold (tokenMeter.measure().totalTokens; the contextPressure projection's own
   * pressureTokens is the last provider usage sample and cannot see a compaction). Undefined
   * without an agent or a token meter: the display then omits it and the ceiling stays off.
   */
  #measured(agent) {
    const meter = this.#ctx.get(OPTIONAL_SERVICE.tokenMeter)
    if (agent === undefined || meter === undefined) return undefined
    try { return meter.measure(agent.session).totalTokens } catch { return undefined }
  }

  /** One session projection of the assistant session, or undefined (no agent, or not registered). */
  #projection(agent, key) {
    if (agent === undefined) return undefined
    try { return this.#ctx.sessionProjections.stateOf(agent.session, key) } catch { return undefined }
  }

  /**
   * Hard ceiling (see the module comment): one synthetic overflow per turn, else pass through.
   * Measures on each of Fishball's requests (O(surface), as DSH's own pre-step check does).
   */
  #ceiling(options, next) {
    const agent = this.#agentOf()
    if (agent === undefined || options.sessionId !== agent.session.id || options.purpose !== undefined) return next()
    const { effectiveWindow, outputCap, modelWindow } = this.#stateOf(agent)
    // Without Fishball's compaction nothing would recover from the error, and the turn would
    // fail: a step is never rejected, so the ceiling needs the compaction plugin running.
    if (this.#overflowSent || effectiveWindow === undefined || effectiveWindow >= modelWindow || !this.#isCompactionRunning()) return next()
    const measured = this.#measured(agent)
    if (measured === undefined || measured <= effectiveWindow - (outputCap ?? 0)) return next()
    this.#overflowSent = true
    return (async function* () {
      yield { type: LLM_FINISH.chunk, reason: { kind: LLM_FINISH.error, failure: { message: OVERFLOW_MESSAGE, code: CONTEXT_WINDOW_EXCEEDED_CODE } } }
    })()
  }
}
