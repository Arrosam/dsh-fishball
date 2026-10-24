/**
 * PluginCatalog: Fishball's own plugin states (DESIGN §4 "Plugin states", §7 "Tools nobody
 * has checked").
 *
 * Catalog: every bundle installed in the profile or offered by the installation
 * (`pluginManager.listBundles()`), except Fishball itself, plus the DSH built-ins of
 * src/builtins.js. Each has a Fishball-only on/off state, stored in domain `fishball`:
 * - profile (enabled in the profile): on = its tools are visible to Fishball; off = masked;
 * - fishball-only (installed, off in the profile): on = its rows run in the private tree;
 * - builtin: on = its rows run in the private tree.
 * Absent state means the default: profile plugins and default-on built-ins are on.
 *
 * Two snapshots:
 * - DESIRED: the stored choices; durable at once.
 * - APPLIED: what the private tree runs and the mask shows. It changes only in the agent's
 *   idle phase (`agent.runMaintenance`), so a toggle never lands mid-turn. The one mid-turn
 *   change is a LISTING mount: one Fishball-only plugin mounted with every tool masked so a
 *   prompt can list them; every other plugin keeps its applied rows.
 *
 * Tool decisions (`evaluate`) are pure reads of the applied snapshot, so the mask and the
 * guard always agree with what the model was shown.
 */
import { BUILTIN_PLUGINS, BUILTIN_PREFIX } from './builtins.js'
import { BundleRowsError, readBundleRows } from './bundle-rows.js'
import { CHECKED_TOOLS, isChecked } from './checked-tools.js'
import { parametersDigest } from './digest.js'
import { ownerOf } from './tool-attribution.js'
import { BSK_INSPECT, HIDDEN_TOOLS } from './tool-rules.js'
import { builtinPrefix, fishballOnlyPrefix, prefixRows, RowIdConflictError } from './row-ids.js'
import { diagnosticOf } from './errors.js'
import { AuditLog } from './audit.js'
import { compoundKey } from './keys.js'
import { CHANGED_BY, PLUGIN, PLUGIN_ACTION, PLUGIN_ERROR, PLUGIN_KIND, TOOL_STATUS } from './constants.js'

const HIDDEN = new Set(HIDDEN_TOOLS)
/** Separator of the catalog's shape signature (not a storage key). */
const SHAPE_SEPARATOR = '__'
/** Cordis fiber state of an active plugin (cordis Fiber._getState). */
const FIBER_ACTIVE = 2
/** Optional service the profile launcher provides (absent in non-profile hosts). */
const PROFILE_CONTEXT = 'profileContext'
const OUTCOME_OK = 'ok'
/** Review standings that are not themselves a TOOL_STATUS (see #decide). */
const REVIEW = Object.freeze({ trusted: 'trusted', checked: 'checked', allowed: 'allowed' })
/** listBundles availability of a bundle whose files cannot be read. */
const MISSING = 'missing'
/** Stable codes a plugin can store as lastError; anything else is reported as rowFailed. */
const STORED_ERRORS = new Set(Object.values(PLUGIN_ERROR))

/** Stable key of one tool allowance: module, name and parameter digest (src/keys.js). */
export const toolKeyOf = (module, toolName, digest) => compoundKey([module, toolName, digest])

/** First line of a tool description, for prompts and the catalog view. */
const firstLine = (text) => String(text ?? '').split('\n')[0]

/** A catalog request refused with a stable PLUGIN_ERROR code. */
export class CatalogError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export class PluginCatalog {
  #ctx
  #store
  #logger
  #readLimits
  #onChange
  #mountRows
  #adjustRows
  #onApplied
  #pendingRowIds
  #ownsDefinition
  #agentOf = () => undefined
  /** key -> catalog entry { key, title, kind, defaultOn, rows?, bundle?, rowIds?, prefix } */
  #entries = new Map()
  /** Applied snapshot: plugins whose rows run / tools show, allowed tool keys. */
  #appliedOn = new Map()
  #appliedAllowed = new Set()
  /** Fishball-only plugins mounted only so their tools can be listed for a prompt. */
  #listing = new Set()
  /** Tree plugins whose rows wait for a host service (pending, not broken; re-audited). */
  #waiting = new Set()
  /** Last catalog shape (keys and kinds), to notice installs and moves. */
  #shape = ''
  #pending = false
  #applying
  /** Tail of the serialized on/off choices (setDesired). */
  #choices = Promise.resolve()
  /** Plugin change audit (src/audit.js). */
  #changes
  /** Bumped whenever #waiting is replaced, so a stale re-audit is dropped. */
  #waitingRevision = 0

  /**
   * @param ctx - fishball row context (pluginManager, loader, profileContext?).
   * @param store - Store (plugins, toolApprovals, pluginChanges tables).
   * @param logger - plugin logger.
   * @param options.readLimits - () => current limits.
   * @param options.mountRows - (rows) => Promise<{ failed, pending, leaked }> (row-id keyed),
   *   replacing every plugin row of the private tree.
   * @param options.adjustRows - (pluginKey, rows, { listing }) => rows, before ids are
   *   prefixed (the context window sets the compaction row's config this way; default
   *   unchanged). listing is true for a mid-turn listing mount.
   * @param options.onApplied - called after an idle-phase apply mounted the tree (not after a
   *   listing mount, and not when the apply failed).
   * @param options.pendingRowIds - () => Promise<Set> of private-tree row ids still waiting.
   * @param options.ownsDefinition - (definition) => whether it lives in the private tree's
   *   layer (scope P): only those can belong to a built-in or Fishball-only plugin.
   * @param options.onChange - called after the applied snapshot changes.
   */
  constructor(ctx, store, logger, { readLimits, mountRows, adjustRows = (key, rows) => rows, pendingRowIds, ownsDefinition, onChange, onApplied = () => {} }) {
    this.#ctx = ctx
    this.#store = store
    this.#logger = logger
    this.#readLimits = readLimits
    this.#changes = new AuditLog(() => store.pluginChanges, () => readLimits().auditEntriesKept)
    this.#mountRows = mountRows
    this.#adjustRows = adjustRows
    this.#onApplied = onApplied
    this.#pendingRowIds = pendingRowIds
    this.#ownsDefinition = ownsDefinition
    this.#onChange = onChange
  }

  /** The agent whose idle phase applies changes (wired after the lifecycle exists). */
  set agentOf(provider) {
    this.#agentOf = provider
  }

  /**
   * Read the bundle list again. A changed catalog (a plugin installed, removed, or moved
   * between "everyone" and "Fishball only") schedules an apply, so the tree and the mask
   * follow at the next idle phase.
   */
  async refresh() {
    const entries = new Map(BUILTIN_PLUGINS.map((builtin) => [builtin.key, { ...builtin, kind: PLUGIN_KIND.builtin, prefix: builtinPrefix(builtin.key.slice(BUILTIN_PREFIX.length)) }]))
    let bundles = []
    try {
      bundles = await this.#ctx.pluginManager.listBundles()
    } catch (error) {
      this.#logger.warn('plugin list unavailable (%s)', diagnosticOf(error))
    }
    for (const bundle of bundles) {
      // Only plugins you added or DSH offers; the installation's own surface bundles are not plugins.
      if (bundle.name === PLUGIN.name || bundle.availability === MISSING || !(bundle.installed || bundle.optional)) continue
      entries.set(bundle.name, {
        key: bundle.name,
        title: bundle.name,
        kind: bundle.enabled ? PLUGIN_KIND.profile : PLUGIN_KIND.fishballOnly,
        defaultOn: bundle.enabled,
        bundle,
        rowIds: new Set(bundle.rows.map((row) => row.rowId)),
        prefix: fishballOnlyPrefix(bundle.name),
      })
    }
    this.#entries = entries
    const shape = [...entries.values()].map((entry) => entry.key + SHAPE_SEPARATOR + entry.kind).join('\n')
    const changed = this.#shape !== '' && shape !== this.#shape
    this.#shape = shape
    if (changed) this.schedule()
  }

  /** Whether `key` names a catalog plugin. */
  has(key) {
    return this.#entries.has(key)
  }

  /** The plugin's PLUGIN_KIND. @throws CatalogError(unknownPlugin). */
  kindOf(key) {
    return this.#require(key).kind
  }

  /** Whether the plugin is on both as desired and as applied (nothing to do for "on"). */
  isRunning(key) {
    return this.desiredOn(key) && this.#appliedOn.get(key) === true
  }

  #require(key) {
    const entry = this.#entries.get(key)
    if (entry === undefined) throw new CatalogError(PLUGIN_ERROR.unknownPlugin)
    return entry
  }

  /** Tree plugins (built-ins and Fishball-only) that count toward maxFishballOnlyPlugins. */
  #treePlugins() {
    return [...this.#entries.values()].filter((entry) => entry.kind !== PLUGIN_KIND.profile)
  }

  /**
   * Refuse turning a plugin on when it cannot run for Fishball: a Fishball-only bundle that
   * edits other rows or has none, or one more than `maxFishballOnlyPlugins` Fishball-only
   * plugins at once. Lowering the limit never stops plugins already on (DESIGN §11). The
   * limit counts Fishball-only plugins, the ones you add; built-ins are a fixed set (§16).
   * @throws CatalogError with the PLUGIN_ERROR code.
   */
  assertCanEnable(key) {
    const entry = this.#require(key)
    if (entry.kind !== PLUGIN_KIND.fishballOnly || this.desiredOn(key)) return
    this.#rowsOf(entry)
    const running = this.#treePlugins().filter((other) => other.kind === PLUGIN_KIND.fishballOnly && this.desiredOn(other.key))
    if (running.length >= this.#readLimits().maxFishballOnlyPlugins) throw new CatalogError(PLUGIN_ERROR.limitReached)
  }

  /** Desired on/off of one plugin: its stored choice, else its default. */
  desiredOn(key) {
    const record = this.#store.plugins.get(key)
    const entry = this.#entries.get(key)
    // A stored choice for a plugin whose kind changed (moved in or out of the profile) is stale.
    if (record !== undefined && record.kind === entry?.kind) return record.on
    return entry?.defaultOn ?? false
  }

  /**
   * The catalog plugin a tool belongs to, from its registering row.
   * Tree plugins are recognised by row-id prefix AND by living in the private tree's layer,
   * so a host row cannot pass as a built-in by choosing a matching id (review M4).
   * @returns { key, own } — own: Fishball registered it; key undefined for DSH host rows.
   */
  #pluginOfOwner(owner, definition) {
    if (owner === undefined) return { key: undefined, own: false }
    if (owner.module === PLUGIN.name) return { key: undefined, own: true }
    const inTree = this.#ownsDefinition(definition)
    for (const entry of this.#entries.values()) {
      const matches = entry.kind === PLUGIN_KIND.profile
        ? !inTree && entry.rowIds.has(owner.rowId)
        : inTree && owner.rowId?.startsWith(entry.prefix)
      if (matches) return { key: entry.key, own: false }
    }
    return { key: undefined, own: false }
  }

  /**
   * Decide every tool Fishball could see.
   * Reads the CURRENT catalog entries: a bundle moved between "everyone" and "Fishball only"
   * on the Plugins page mid-turn is reclassified at once, before the idle-phase apply. That
   * is fail-closed (its tools lose their plugin and stand only on checked or allowed), and it
   * follows your own profile change, so no applied copy of the entries is kept (review R2).
   * @param tools - the tools service.
   * @param scope - scope key P (its view is exactly what the agent inherits).
   * @returns Map name -> { status, review, plugin, module, digest, description }.
   */
  evaluate(tools, scope) {
    const decisions = new Map()
    for (const { name } of tools.schemas(scope)) {
      decisions.set(name, this.#decide(tools, name, tools.get(name, scope), this.#appliedAllowed))
    }
    return decisions
  }

  /** One tool's decision in `scope`'s view, or undefined when that view lacks the tool. */
  evaluateOne(tools, scope, name) {
    const definition = tools.get(name, scope)
    return definition === undefined ? undefined : this.#decide(tools, name, definition, this.#appliedAllowed)
  }

  /**
   * One tool's decision. `review` is the tool's own standing, independent of its plugin's
   * on/off state; `status` combines it with that state:
   * - hidden: on the §7 hidden list (or a bsk_inspect that is not Fishball's save-less copy),
   *   or one of Fishball's own host-row tools, which serve other sessions (message_fishball);
   * - trusted: Fishball's own tool, or a tool of a DSH built-in Fishball mounts;
   * - checked / allowed: in the checked constants, or allowed by you, for these parameters;
   * - unchecked: anything else, including a tool whose registering row is unknown.
   * @param allowedKeys - allowance keys to honour (the applied snapshot, or the store).
   */
  #decide(tools, name, definition, allowedKeys) {
    // Fishball's bsk_inspect copy is judged by the original it delegates to (DESIGN §7).
    const isCopy = name === BSK_INSPECT.name && ownerOf(definition)?.module === PLUGIN.name
    const judged = isCopy ? tools.get(name) : definition
    const digest = parametersDigest(judged?.parameters)
    const owner = ownerOf(judged) ?? this.#claimedOwner(tools, name, judged, digest)
    const { key, own } = this.#pluginOfOwner(owner, judged)
    const review = (() => {
      if (HIDDEN.has(name) || (name === BSK_INSPECT.name && !isCopy)) return TOOL_STATUS.hidden
      // Fishball's own HOST-row tools serve other sessions (message_fishball); only the tools
      // it registers in its own scope P are for Fishball itself.
      if (own && !isCopy && !this.#ownsDefinition(judged)) return TOOL_STATUS.hidden
      if ((own && !isCopy) || this.#entries.get(key)?.kind === PLUGIN_KIND.builtin) return REVIEW.trusted
      if (owner === undefined) return TOOL_STATUS.unchecked
      if (isChecked(name, owner.module, digest)) return REVIEW.checked
      if (allowedKeys.has(toolKeyOf(owner.module, name, digest))) return REVIEW.allowed
      return TOOL_STATUS.unchecked
    })()
    const pluginOff = key !== undefined && (this.#listing.has(key) || this.#appliedOn.get(key) !== true)
    const status = review === TOOL_STATUS.hidden || review === TOOL_STATUS.unchecked ? review
      : pluginOff ? TOOL_STATUS.pluginOff : TOOL_STATUS.visible
    return { status, review, plugin: key ?? null, module: owner?.module ?? null, digest, description: firstLine(judged?.description) }
  }

  /**
   * Owner of a global tool registered before Fishball's register wrapper existed (a plugin
   * whose module loaded first; see src/tool-attribution.js). Such a tool has no recorded owner.
   * It is attributed only to a module that already CLAIMS this exact tool, when all hold:
   * - the tool sits in the GLOBAL layer (a private-tree tool always loads after the wrapper);
   * - its name and parameter digest match a claim: a CHECKED_TOOLS entry, or a tool you
   *   allowed (the allowance records the module it was allowed for);
   * - a live loader entry runs the claiming module.
   *
   * Limitation (review M5): this proves the claiming module runs, not that it registered the
   * tool. A plugin that registers lazily (browser-skill) is active before its tools exist, so
   * another in-process plugin registering an identical name and schema first would be
   * attributed to it. In-process plugins run with host authority anyway (DESIGN §11), so this
   * accepts no new capability: such a plugin could equally wrap the real tool. Anything that
   * matches no claim stays unattributed and unchecked.
   */
  #claimedOwner(tools, name, definition, digest) {
    if (definition === undefined || tools.get(name) !== definition) return undefined
    const claims = []
    if (Object.hasOwn(CHECKED_TOOLS, name) && CHECKED_TOOLS[name].digest === digest) claims.push(CHECKED_TOOLS[name].module)
    for (const [, record] of this.#store.toolApprovals.entries()) {
      if (record.toolName === name && record.paramsDigest === digest) claims.push(record.module)
    }
    for (const entry of this.#ctx.loader.entries()) {
      if (claims.includes(entry.options.name) && !entry.disabled && entry.fiber?.state === FIBER_ACTIVE) return { rowId: entry.options.id, module: entry.options.name }
    }
    return undefined
  }

  /**
   * Unchecked tools of plugins that run for everyone (kind profile), with a known owner, from
   * the applied view: the ones Fishball must be told about (DESIGN §7 "Plugins already on").
   * @returns [{ plugin, name, module, digest }].
   */
  uncheckedProfileTools(decisions) {
    const out = []
    for (const [name, decision] of decisions) {
      if (decision.status !== TOOL_STATUS.unchecked || decision.module === null || decision.plugin === null) continue
      if (this.#entries.get(decision.plugin)?.kind !== PLUGIN_KIND.profile) continue
      out.push({ plugin: decision.plugin, name, module: decision.module, digest: decision.digest })
    }
    return out
  }

  /**
   * Unchecked tools of one plugin that you have not allowed, from the current registry (for
   * the prompt). A tool whose registering row is unknown cannot be listed for a plugin; it
   * shows under otherTools and stays hidden (DESIGN §7: a gap fails closed).
   */
  uncheckedOf(key, tools, scope) {
    const stored = new Set(this.#store.toolApprovals.keys())
    const out = []
    for (const { name } of tools.schemas(scope)) {
      const decision = this.#decide(tools, name, tools.get(name, scope), stored)
      if (decision.plugin === key && decision.review === TOOL_STATUS.unchecked && decision.module !== null) {
        out.push({ name, module: decision.module, digest: decision.digest, description: decision.description })
      }
    }
    return out
  }

  /**
   * Record one on/off choice durably and schedule it. Choices are serialized: a settings-page
   * toggle can race a Fishball tool call, and the limit check must see the other's write
   * (review L3), so each check-and-write runs after the previous one finished.
   * @throws CatalogError(unknownPlugin | limitReached | editsOtherRows | noRows | noProfile).
   */
  setDesired(key, on, by) {
    const run = this.#choices.then(async () => {
      if (on) this.assertCanEnable(key)
      const entry = this.#require(key)
      await this.#store.plugins.put(key, { kind: entry.kind, on, changedBy: by, changedAt: new Date().toISOString() })
      await this.audit(key, on ? PLUGIN_ACTION.on : PLUGIN_ACTION.off, by, OUTCOME_OK)
      this.schedule()
    })
    this.#choices = run.catch(() => {})
    return run
  }

  /** Durably allow tools nobody had checked, for exactly these parameters. */
  async allowTools(tools) {
    const allowedAt = new Date().toISOString()
    for (const tool of tools) {
      await this.#store.toolApprovals.put(toolKeyOf(tool.module, tool.name, tool.digest), { module: tool.module, toolName: tool.name, paramsDigest: tool.digest, allowedAt })
    }
    this.schedule()
  }

  /** Withdraw one allowance. @returns whether it existed. */
  async removeAllowance(toolKey) {
    const removed = await this.#store.toolApprovals.delete(toolKey)
    if (removed) this.schedule()
    return removed
  }

  /**
   * Mount one Fishball-only plugin now, with every tool masked, so its tools can be listed in
   * a prompt (DESIGN §7). Runs inside a tool call (mid-turn): every other plugin keeps its
   * applied rows (review M1), and the listed plugin's tools stay masked (plugin-off while
   * listing) until the next applied snapshot. Callers end the listing on every path that
   * does not turn the plugin on (`endListing`).
   * @returns a PLUGIN_ERROR code when its rows could not run, else undefined.
   */
  async mountForListing(key) {
    this.#listing.add(key)
    const broken = await this.#remount(this.#appliedTreePlugins(), { listing: true })
    this.#onChange()
    return broken.get(key)
  }

  /** Unmount a plugin mounted only for listing (Reject, or any failure in the prompt). */
  async endListing(key) {
    if (!this.#listing.delete(key)) return
    await this.#remount(this.#appliedTreePlugins(), { listing: true })
    this.#onChange()
  }

  /** Append one plugin change to the audit, keeping the newest `auditEntriesKept`. */
  async audit(plugin, action, by, outcome) {
    await this.#changes.append({ plugin, action, by, at: new Date().toISOString(), outcome }, [plugin, action])
  }

  /**
   * Apply desired states in the agent's idle phase. Coalesces: one run picks up every
   * change made before it starts. A failed apply keeps the previous snapshot and is NOT
   * re-armed: it is retried only when the next change (a toggle, an allowance, a catalog
   * shape change) calls schedule() again (review L2). Never await this from inside a turn
   * (it waits for idle).
   */
  schedule() {
    this.#pending = true
    this.#applying ??= (async () => {
      try {
        while (this.#pending) {
          this.#pending = false
          await this.#inIdlePhase(() => this.apply())
        }
      } catch (error) {
        this.#logger.warn('plugin changes could not be applied (%s)', diagnosticOf(error))
      } finally {
        this.#applying = undefined
      }
    })()
    return this.#applying
  }

  async #inIdlePhase(task) {
    for (;;) {
      const agent = this.#agentOf()
      if (agent === undefined) return task()
      await agent.whenIdle()
      let running
      // runMaintenance throws synchronously when a turn claimed the agent first; wait again.
      try { running = agent.runMaintenance(() => task()) } catch { continue }
      return running
    }
  }

  /**
   * Remount the private tree for the desired states and replace the applied snapshot. The
   * snapshot moves only after the tree is mounted, so a failure keeps the previous one.
   */
  async apply() {
    this.#listing.clear()
    const desired = this.#treePlugins().filter((entry) => this.desiredOn(entry.key))
    const broken = await this.#remount(desired)
    this.#appliedOn = new Map([...this.#entries.keys()].map((key) => [key, this.desiredOn(key) && !broken.has(key)]))
    this.#appliedAllowed = new Set(this.#store.toolApprovals.keys())
    this.#onApplied()
    this.#onChange()
  }

  /** Tree plugins in the applied snapshot, plus those being listed. */
  #appliedTreePlugins() {
    return this.#treePlugins().filter((entry) => this.#appliedOn.get(entry.key) === true || this.#listing.has(entry.key))
  }

  /**
   * Rows of one tree-mounted plugin, with private-tree ids. @throws CatalogError.
   * @param purpose - { listing } passed to adjustRows (a mid-turn listing mount).
   */
  #rowsOf(entry, purpose = {}) {
    try {
      if (entry.kind === PLUGIN_KIND.builtin) return prefixRows(this.#adjustRows(entry.key, entry.rows, purpose), entry.prefix)
      return prefixRows(readBundleRows(entry.bundle, this.#ctx.get(PROFILE_CONTEXT)), entry.prefix)
    } catch (error) {
      if (error instanceof BundleRowsError) throw new CatalogError(error.code)
      if (error instanceof RowIdConflictError) throw new CatalogError(PLUGIN_ERROR.rowIdConflict)
      // A missing or unparsable bundle file: a stable code, never the raw fs/YAML error (M8b).
      this.#logger.warn('plugin %s rows unreadable (%s)', entry.key, diagnosticOf(error))
      throw new CatalogError(PLUGIN_ERROR.rowFailed)
    }
  }

  /**
   * Mount exactly these tree plugins (every other row is unmounted).
   * - A plugin whose rows cannot be read, fail, or publish a host service is BROKEN: it is
   *   turned off with a stable diagnostic, and the tree is mounted again without it, so the
   *   other plugins keep running (DESIGN §4 "Auditing").
   * - A plugin whose rows only WAIT for a host service still starting (`auditRows` pending)
   *   is not broken: DSH documents that such rows activate once the provider finishes. It
   *   stays on; its tools appear when it activates, and `recheckWaiting` clears the flag
   *   then (review H1: a slow host service at boot must not switch a built-in off for good;
   *   review N6: "Starting…" ends without waiting for the next apply). Display limits: DSH's
   *   audit also counts an absent OPTIONAL inject as waiting, and a service provided inside an
   *   isolated realm is not announced to this row, so "Starting…" can persist for such rows
   *   until the next apply; the plugin runs either way (review R3, R4).
   * @returns Map key -> PLUGIN_ERROR for the plugins turned off.
   */
  async #remount(plugins, purpose = {}) {
    const broken = new Map()
    const rowsFor = (entries) => entries.flatMap((entry) => {
      try { return this.#rowsOf(entry, purpose) } catch (error) {
        broken.set(entry.key, error instanceof CatalogError ? error.code : PLUGIN_ERROR.rowFailed)
        return []
      }
    })
    const owns = (entry, rowIds) => [...rowIds].some((rowId) => rowId.startsWith(entry.prefix))
    // Mount again without each newly broken plugin until a mount breaks none, so a failure in
    // a later mount is caught too (review L2). Ends: `broken` grows on every repeat.
    let candidates = plugins
    let result
    for (;;) {
      // Rows first: an unreadable bundle joins `broken` here, not as a new break (review R1).
      const rows = rowsFor(candidates)
      const known = broken.size
      result = await this.#mountRows(rows)
      for (const entry of candidates) {
        if (owns(entry, result.leaked)) broken.set(entry.key, PLUGIN_ERROR.leaksService)
        else if (owns(entry, result.failed.keys())) broken.set(entry.key, PLUGIN_ERROR.rowFailed)
      }
      if (broken.size === known) break
      candidates = candidates.filter((entry) => !broken.has(entry.key))
    }
    this.#waiting = new Set(plugins.filter((entry) => !broken.has(entry.key) && owns(entry, result.pending.keys())).map((entry) => entry.key))
    this.#waitingRevision++
    for (const [key, code] of broken) await this.#markBroken(key, code)
    return broken
  }

  /**
   * Re-audit plugins waiting for a host service (called when a service or tool changes), so
   * "Starting…" ends once the rows run, without a remount. A remount that lands during the
   * audit owns the newer answer, so this one is dropped (revision check).
   */
  async recheckWaiting() {
    if (this.#waiting.size === 0) return
    const revision = this.#waitingRevision
    const pending = await this.#pendingRowIds()
    if (revision !== this.#waitingRevision) return
    const still = new Set([...this.#waiting].filter((key) => {
      const prefix = this.#entries.get(key)?.prefix
      return prefix !== undefined && [...pending].some((rowId) => rowId.startsWith(prefix))
    }))
    if (still.size === this.#waiting.size) return
    this.#waiting = still
    this.#waitingRevision++
    this.#onChange()
  }

  /** Turn a broken plugin off with its diagnostic; who changed it last is kept as it was. */
  async #markBroken(key, code) {
    this.#listing.delete(key)
    const entry = this.#entries.get(key)
    const previous = this.#store.plugins.get(key)
    const stored = STORED_ERRORS.has(code) ? code : PLUGIN_ERROR.rowFailed
    await this.#store.plugins.put(key, { kind: entry.kind, on: false, changedBy: previous?.changedBy ?? CHANGED_BY.fishball, changedAt: new Date().toISOString(), lastError: stored })
    await this.audit(key, PLUGIN_ACTION.on, previous?.changedBy ?? CHANGED_BY.fishball, stored)
    this.#logger.warn('plugin %s turned off for Fishball (%s)', key, stored)
  }

  /** Detached view for the settings page and list_plugins. */
  snapshot(decisions) {
    const toolsByPlugin = new Map()
    for (const [name, decision] of decisions ?? []) {
      if (decision.plugin === null) continue
      const list = toolsByPlugin.get(decision.plugin) ?? []
      list.push({ name, status: decision.status })
      toolsByPlugin.set(decision.plugin, list)
    }
    return {
      plugins: [...this.#entries.values()].map((entry) => {
        const record = this.#store.plugins.get(entry.key)
        return {
          plugin: entry.key,
          title: entry.title,
          kind: entry.kind,
          on: this.desiredOn(entry.key),
          applied: this.#appliedOn.get(entry.key) === true,
          waiting: this.#waiting.has(entry.key),
          changedBy: record?.kind === entry.kind ? record.changedBy : null,
          lastError: record?.lastError ?? null,
          tools: (toolsByPlugin.get(entry.key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
        }
      }),
      allowedTools: [...this.#store.toolApprovals.entries()].map(([key, record]) => ({ key, module: record.module, toolName: record.toolName })),
      otherTools: [...(decisions ?? [])].filter(([, decision]) => decision.plugin === null && decision.status !== TOOL_STATUS.visible).map(([name, decision]) => ({ name, status: decision.status })),
    }
  }
}
