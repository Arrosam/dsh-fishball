/**
 * AssistantComposition: the private world Fishball's agent runs in (DESIGN §4, §7).
 *
 * Scope P is minted from the fishball row's fiber (spike S1: a private tree must hang off
 * a plugin fiber). P carries Fishball's persona row, its prompt shadows, its tool
 * presentation and its own tools. The agent scope A is bound under P in the agent's
 * `setup`, and the tool mask lives in A: a restriction filters only what a scope
 * INHERITS, so masking in A covers both global tools and tools P registers (spike S2,
 * dsh-tools view()).
 *
 * The mask is recomputed on every `tools/change` because `restrict()` throws on names that
 * are not registered: only currently registered hidden names are denied.
 */
import { bindScopeParent, createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import { EntryTree, interpolate } from '@deepseek-ai/cordis-plugin-loader'
import { prepareProfileEntries } from '@deepseek-ai/dsh-app-boot'
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import { auditRows, leakedServices } from '@deepseek-ai/dsh-agent-preset-registry'
import { ASSISTANT, EVENT, TOOL_STATUS } from './constants.js'
import { deferLogged } from './errors.js'
import { HIDDEN_PROMPT_ENTRIES, PERSONA_ROW } from './persona.js'
import { BSK_INSPECT, FILE_WRITE_TOOLS, HIDDEN_TOOLS, REFUSAL, SAFE_SANDBOX_MODE, SANDBOX_ESCALATION_ARG, SELF_MESSAGE_TOOL, SHELL_TOOLS } from './tool-rules.js'

const HIDDEN = new Set(HIDDEN_TOOLS)
const FILE_WRITE = new Set(FILE_WRITE_TOOLS)
const SHELL = new Set(SHELL_TOOLS)

/**
 * In-memory Loader tree for P's rows. Same pattern as the preset registry's PresetTree:
 * `write()` persists nothing, and the owner's subtree pointers are restored so the host
 * Loader keeps seeing the row's own entry correctly.
 */
class PrivateTree extends EntryTree {
  constructor(ctx) {
    const owner = ctx.fiber.entry
    const subtree = owner?.subtree
    const subgroup = owner?.subgroup
    super(ctx)
    if (owner === undefined) return
    if (subtree === undefined) delete owner.subtree
    else owner.subtree = subtree
    if (subgroup === undefined) delete owner.subgroup
    else owner.subgroup = subgroup
  }

  write() {}
}

/**
 * Remove save options from a JSON schema copy: the listed properties, and listed values
 * from listed enums (also inside `required`). Pure; the input is not changed.
 */
export function withoutSaveOptions(parameters, rule = BSK_INSPECT) {
  const copy = structuredClone(parameters ?? {})
  const props = copy.properties ?? {}
  for (const name of rule.removedProperties) delete props[name]
  for (const { property, removedValues } of rule.enumFilters) {
    const prop = props[property]
    if (Array.isArray(prop?.enum)) prop.enum = prop.enum.filter((v) => !removedValues.includes(v))
  }
  if (Array.isArray(copy.required)) copy.required = copy.required.filter((name) => !rule.removedProperties.includes(name))
  return copy
}

/** Whether a bsk_inspect call asks for one of the removed save options. */
export function asksToSave(args, rule = BSK_INSPECT) {
  if (args === null || typeof args !== 'object') return false
  if (rule.removedProperties.some((name) => args[name] !== undefined)) return true
  return rule.enumFilters.some(({ property, removedValues }) => removedValues.includes(args[property]))
}

/**
 * The guard's decision for one of Fishball's calls (DESIGN §7). Returns a refusal text, or
 * undefined to let the call run. Pure: the sandbox mode is passed in.
 */
export function guardDecision(name, args, sandboxMode) {
  if (FILE_WRITE.has(name)) return REFUSAL.fileWrite(name)
  if (name === SELF_MESSAGE_TOOL) return REFUSAL.selfMessage(name)
  if (HIDDEN.has(name)) return REFUSAL.hidden(name)
  if (!SHELL.has(name)) return undefined
  if (args !== null && typeof args === 'object' && args[SANDBOX_ESCALATION_ARG] !== undefined) return REFUSAL.escalation(name)
  return sandboxMode === SAFE_SANDBOX_MODE ? undefined : REFUSAL.notReadOnly(name, sandboxMode)
}

/** auditRows lines start with the row id ("<id> (<module>): <detail>"). */
const byRowId = (lines) => new Map(lines.map((line) => [line.slice(0, line.indexOf(' ')), line]))

/** Tool statuses the mask denies (everything but visible). */
const MASKED = new Set([TOOL_STATUS.hidden, TOOL_STATUS.pluginOff, TOOL_STATUS.unchecked])

export class AssistantComposition {
  #rowCtx
  #logger
  #key = {}
  #pctx
  #tree
  /** Catalog deciding each tool; until attached, only the §7 hidden list is denied. */
  #catalog
  /** Rebuild the mask of every agent set up under P (one per live agent). */
  #maskRefreshers = new Set()
  /** Further per-agent setups other features add (the context window's reply cap). */
  #agentSetups = []

  /**
   * @param rowCtx - the fishball row's plugin context (needs tools, sandboxPolicy, systemPrompt).
   * @param logger - plugin logger (codes only).
   */
  constructor(rowCtx, logger) {
    this.#rowCtx = rowCtx
    this.#logger = logger
  }

  /** Global scope key P that the agent scope joins. */
  get key() {
    return this.#key
  }

  /**
   * Mint P, mount its rows, shadow named global prompt entries, fix the tool presentation
   * and install the bsk_inspect copy. Rejects when a row fails or is still waiting for a
   * service after the audit, so the assistant never starts half-composed (DESIGN §11).
   */
  async mount() {
    const pctx = (this.#pctx = createScope(this.#rowCtx, this.#key).ctx.extend({ baseUrl: this.#rowCtx.baseUrl }))
    const tree = (this.#tree = new PrivateTree(pctx))
    pctx.effect(() => () => tree.root.stop(), 'fishball: private tree')
    // The persona is core: a failure here fails the mount (catalog rows are audited per plugin).
    const audit = await this.mountRows([])
    const core = [...audit.failed.values(), ...audit.pending.values(), ...audit.leaked]
    if (core.length > 0) throw new Error(core.join('\n'))
    this.#shadowPromptEntries(pctx)
    // Nearest scope wins, so this one declaration in P covers the agent joined under it.
    pctx.tools.presentAs(ASSISTANT.toolPresentation)
    this.#installBskCopy(pctx)
  }

  /**
   * Replace the private tree's plugin rows: the persona row plus `rows` (catalog plugins,
   * already given private-tree ids). DSH's compatibility checks apply (`prepareProfileEntries`).
   * @returns per-row audit, each keyed by row id: failed (import or activation failed),
   *   pending (waiting for a service that may still arrive) and leaked (published a service
   *   outside P).
   */
  async mountRows(rows) {
    const pctx = this.#pctx
    const tree = this.#tree
    await tree.root.update(prepareProfileEntries(pctx, [structuredClone(PERSONA_ROW), ...rows], pctx.baseUrl))
    const audit = await auditRows(tree)
    const leaked = new Set()
    for (const entry of tree.entries()) {
      if (entry.fiber !== undefined && leakedServices(this.#rowCtx, entry.fiber).length > 0) leaked.add(entry.options.id)
    }
    return { failed: byRowId(audit.failed), pending: byRowId(audit.pending), leaked }
  }

  /**
   * A row module as the private tree would import it (same resolution base), unwrapped the way
   * DSH's loader unwraps plugin exports. Reading a plugin's settings schema needs it (DESIGN §10d);
   * nothing is mounted.
   */
  async loadPluginModule(name) {
    return this.#rowCtx.loader.unwrapExports(await this.#tree.import(name))
  }

  /** A row config with its `!!js` values evaluated as the private tree evaluates them when mounting. */
  resolveConfig(config) {
    return interpolate(this.#pctx, config)
  }

  /** Whether a context runs inside Fishball's private tree (its fiber descends from P's tree). */
  inPrivateTree(ctx) {
    const rows = new Set([...this.#tree.entries()].map((entry) => entry.fiber).filter(Boolean))
    let fiber = ctx?.fiber
    while (fiber !== undefined) {
      if (rows.has(fiber)) return true
      const parent = fiber.parent?.fiber
      if (parent === undefined || parent === fiber) return false
      fiber = parent
    }
    return false
  }

  /** Row ids of the private tree still waiting for a service (a read-only re-audit). */
  async pendingRowIds() {
    return new Set(byRowId((await auditRows(this.#tree)).pending).keys())
  }

  /**
   * Whether a tool definition lives in P's own layer (the private tree or Fishball's own
   * tools), not in the global layer. Only those can belong to a built-in or Fishball-only
   * plugin; a host row choosing a matching id prefix does not qualify (review M4).
   */
  ownsDefinition(definition) {
    if (definition === undefined) return false
    const name = definition.name
    const tools = this.#rowCtx.tools
    // P's view of that name is this definition and the global view is not: it is P's own.
    return tools.get(name, this.#key) === definition && tools.get(name) !== definition
  }

  /**
   * Let the catalog decide the mask (P3). Until then only the §7 hidden list is denied.
   * @param catalog - PluginCatalog (evaluate(tools, scopeKey)).
   */
  attachCatalog(catalog) {
    this.#catalog = catalog
    this.refreshMasks()
  }

  /** Recompute every live agent's mask now (after the catalog's applied snapshot changed). */
  refreshMasks() {
    for (const refresh of this.#maskRefreshers) deferLogged(refresh, this.#logger, 'tool mask')
  }

  /**
   * Register one of Fishball's own tools in P (only Fishball's agent sees it).
   * @returns the disposer.
   */
  registerOwnTool(definition) {
    return this.#pctx.tools.register(definition)
  }

  /** Tool decisions for P's view (what the agent inherits). */
  decisions() {
    return this.#catalog?.evaluate(this.#rowCtx.tools, this.#key) ?? new Map()
  }

  /**
   * The guard's catalog check, DEFAULT-DENY (review H2): a call runs only when the tool is
   * visible in P's view right now (decided live, not from the last mask rebuild), or it is
   * the reserved `run_code` transport, whose inner calls pass this guard one by one. A tool
   * registered in the agent's OWN scope (agent-team does this on agent/created) is not in
   * P's view and cannot be restricted, so it is refused here.
   *
   * The decision is about P's definition, but the call runs the definition the CALLING scope
   * resolves (dsh-tools resolveExecution(name, exec.agent)), where an agent-own tool shadows
   * an inherited one of the same name. So the call is also refused unless both resolve to the
   * same definition: an agent-own `web_search` cannot borrow the visible one's decision (N1).
   * @param name - the called tool.
   * @param callerScope - `exec.agent`, the scope the executor resolves the call in.
   */
  #allows(name, callerScope) {
    if (this.#catalog === undefined) return !HIDDEN.has(name)
    if (name === RUN_CODE_NAME) return true
    const tools = this.#rowCtx.tools
    if (tools.get(name, callerScope) !== tools.get(name, this.#key)) return false
    return this.decisionFor(name)?.status === TOOL_STATUS.visible
  }

  /** One tool's live decision in P's view, or undefined when P does not see it. */
  decisionFor(name) {
    return this.#catalog?.evaluateOne(this.#rowCtx.tools, this.#key, name)
  }

  /** Names the mask denies right now, among the tools A inherits. */
  #maskedNames() {
    const tools = this.#rowCtx.tools
    if (this.#catalog === undefined) return HIDDEN_TOOLS.filter((name) => tools.get(name, this.#key) !== undefined)
    return [...this.decisions()].filter(([, decision]) => MASKED.has(decision.status)).map(([name]) => name).sort()
  }

  /** Empty scoped entries with the same names hide the global ones for Fishball only (spike S9). */
  #shadowPromptEntries(pctx) {
    const prompt = pctx.systemPrompt
    for (const { name, orderName, section, context } of HIDDEN_PROMPT_ENTRIES) {
      if (section) prompt.section({ name, order: prompt.getSectionOrder(orderName), text: '' })
      if (context) prompt.context({ name, order: prompt.getContextOrder(orderName), text: '' })
    }
  }

  /**
   * Fishball's scoped bsk_inspect (spike S19): registered in P only while the global tool
   * exists, re-derived when the global definition changes, and delegating other calls.
   */
  #installBskCopy(pctx) {
    const tools = this.#rowCtx.tools
    let current
    let dispose
    const sync = () => {
      const original = tools.get(BSK_INSPECT.name)
      // Our own copy is P-scoped, so the global view returns the plugin's definition.
      if (original === current) return
      dispose?.()
      dispose = undefined
      current = original
      if (original === undefined) return
      dispose = pctx.tools.register({
        ...original,
        parameters: withoutSaveOptions(original.parameters),
        async execute(args, exec) {
          if (asksToSave(args)) throw new Error(REFUSAL.bskSave())
          return original.execute(args, exec)
        },
      })
    }
    pctx.on(EVENT.toolsChange, () => deferLogged(sync, this.#logger, 'bsk_inspect copy'))
    sync()
  }

  /** Add a per-agent setup (agentCtx, agent) that runs after the scope, mask and guard. */
  addAgentSetup(setup) {
    this.#agentSetups.push(setup)
  }

  /**
   * Agent setup: bind A under P, keep the mask current, install the guard, then the setups
   * other features added (addAgentSetup).
   * @returns setup(agentCtx, agent) for ctx.agents.create/resume.
   */
  setup() {
    return (agentCtx, agent) => {
      bindScopeParent(scopeOf(agentCtx), this.#key)
      this.#maintainMask(agentCtx)
      agentCtx.tools.guard((exec) => {
        const mode = this.#rowCtx.sandboxPolicy.resolve({ session: agent.session }).mode
        return guardDecision(exec.name, exec.arguments, mode) ?? (this.#allows(exec.name, exec.agent) ? undefined : REFUSAL.masked(exec.name))
      })
      for (const extra of this.#agentSetups) extra(agentCtx, agent)
    }
  }

  /**
   * Deny every masked name A inherits; rebuild on tools/change and when the catalog's
   * applied snapshot changes. (The guard decides live, so a mask rebuild that runs a
   * microtask late never lets a call through.)
   *
   * Names are read from P's view, never A's: P carries no restriction, so it shows exactly
   * what A inherits (global plus P's own tools). A's own view drops names A already denies,
   * which would make each rebuild lift the mask it just applied and loop on tools/change.
   * A hidden tool in A's OWN layer is not restrictable; the guard refuses it by name.
   *
   * The new restriction is applied before the old one is lifted, and the applied signature
   * moves only on success, so a failing restrict() keeps the previous mask.
   */
  #maintainMask(agentCtx) {
    let lift
    let applied = ''
    const apply = () => {
      const names = this.#maskedNames()
      const signature = names.join(',')
      if (signature === applied) return
      const next = names.length > 0 ? agentCtx.tools.restrict({ deny: names }) : undefined
      lift?.()
      lift = next
      applied = signature
    }
    agentCtx.on(EVENT.toolsChange, () => deferLogged(apply, this.#logger, 'tool mask'))
    this.#maskRefreshers.add(apply)
    agentCtx.effect(() => () => { this.#maskRefreshers.delete(apply) }, 'fishball: mask refresher')
    // A failure here fails the agent's setup, so the assistant never starts unmasked.
    apply()
  }
}
