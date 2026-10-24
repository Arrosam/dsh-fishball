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
import { EntryTree } from '@deepseek-ai/cordis-plugin-loader'
import { prepareProfileEntries } from '@deepseek-ai/dsh-app-boot'
import { auditRows } from '@deepseek-ai/dsh-agent-preset-registry'
import { ASSISTANT, EVENT } from './constants.js'
import { deferLogged } from './errors.js'
import { HIDDEN_PROMPT_ENTRIES, PERSONA_ROW } from './persona.js'
import { BSK_INSPECT, FILE_WRITE_TOOLS, HIDDEN_TOOLS, REFUSAL, SAFE_SANDBOX_MODE, SANDBOX_ESCALATION_ARG, SHELL_TOOLS } from './tool-rules.js'

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
  if (HIDDEN.has(name)) return REFUSAL.hidden(name)
  if (!SHELL.has(name)) return undefined
  if (args !== null && typeof args === 'object' && args[SANDBOX_ESCALATION_ARG] !== undefined) return REFUSAL.escalation(name)
  return sandboxMode === SAFE_SANDBOX_MODE ? undefined : REFUSAL.notReadOnly(name, sandboxMode)
}

export class AssistantComposition {
  #rowCtx
  #logger
  #key = {}
  #pctx
  #tree

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
    await tree.root.update(prepareProfileEntries(pctx, [structuredClone(PERSONA_ROW)], pctx.baseUrl))
    const audit = await auditRows(tree)
    const unusable = [...audit.failed, ...audit.pending]
    if (unusable.length > 0) throw new Error(unusable.join('\n'))
    this.#shadowPromptEntries(pctx)
    // Nearest scope wins, so this one declaration in P covers the agent joined under it.
    pctx.tools.presentAs(ASSISTANT.toolPresentation)
    this.#installBskCopy(pctx)
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

  /**
   * Agent setup: bind A under P, keep the mask current, and install the guard.
   * @returns setup(agentCtx, agent) for ctx.agents.create/resume.
   */
  setup() {
    return (agentCtx, agent) => {
      bindScopeParent(scopeOf(agentCtx), this.#key)
      this.#maintainMask(agentCtx)
      agentCtx.tools.guard((exec) => {
        const mode = this.#rowCtx.sandboxPolicy.resolve({ session: agent.session }).mode
        return guardDecision(exec.name, exec.arguments, mode)
      })
    }
  }

  /**
   * Deny every hidden name A inherits; rebuild on tools/change.
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
    const tools = this.#rowCtx.tools
    let lift
    let applied = ''
    const apply = () => {
      const names = HIDDEN_TOOLS.filter((name) => tools.get(name, this.#key) !== undefined)
      const signature = names.join(',')
      if (signature === applied) return
      const next = names.length > 0 ? agentCtx.tools.restrict({ deny: names }) : undefined
      lift?.()
      lift = next
      applied = signature
    }
    agentCtx.on(EVENT.toolsChange, () => deferLogged(apply, this.#logger, 'tool mask'))
    // A failure here fails the agent's setup, so the assistant never starts unmasked.
    apply()
  }
}
