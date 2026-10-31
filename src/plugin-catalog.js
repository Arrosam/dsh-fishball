/**
 * PluginCatalog: Fishball's own plugin states (DESIGN §4 "Plugin states", §7 "Tools nobody
 * has checked").
 *
 * Catalog: every DSH plugin (a bundle installed in the profile or offered by the installation,
 * `pluginManager.listBundles()`, except Fishball itself), the DSH built-ins of src/builtins.js,
 * and the plugins Fishball installed for itself (src/fishball-packages.js). Each has a
 * Fishball-only on/off state, stored in domain `fishball`:
 * - profile (DSH plugin enabled in the profile): on = its tools are visible to Fishball; off = masked;
 * - fishball-only (DSH plugin installed, off in the profile): on = its rows run in the private tree;
 * - builtin: on = its rows run in the private tree;
 * - fishball-installed (installed in Fishball only): on = its rows run in the private tree.
 * Absent state means the default: DSH plugins are off unless they keep the old default
 * (src/plugin-defaults.js), default-on built-ins are on, Fishball-installed plugins are off.
 *
 * Statuses and actions (DESIGN §4 "Plugin statuses"): a Fishball-installed plugin can be turned
 * on or off and uninstalled; a DSH plugin can only be turned on or off for Fishball, never
 * uninstalled, because Fishball does not change the DSH profile.
 *
 * Two snapshots:
 * - DESIRED: the stored choices; durable at once.
 * - APPLIED: what the private tree runs and the mask shows. It changes only in the agent's
 *   idle phase (`agent.runMaintenance`), so a toggle never lands mid-turn. The one mid-turn
 *   change is a LISTING mount: one package plugin mounted with every tool masked so a
 *   prompt can list them; every other plugin keeps its applied rows.
 *
 * Tool decisions (`evaluate`) are pure reads of the applied snapshot, so the mask and the
 * guard always agree with what the model was shown.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readPluginMeta } from '@deepseek-ai/dsh-app-boot'
import { BUILTIN_PLUGINS, BUILTIN_PREFIX } from './builtins.js'
import { anchorRowModules, BundleRowsError, readBundleRows, readPackageRows } from './bundle-rows.js'
import { CHECKED_TOOLS, isChecked } from './checked-tools.js'
import { parametersDigest } from './digest.js'
import { ownerOf } from './tool-attribution.js'
import { BSK_INSPECT, HIDDEN_TOOLS } from './tool-rules.js'
import { builtinPrefix, fishballInstalledPrefix, fishballOnlyPrefix, prefixRows, RowIdConflictError } from './row-ids.js'
import { diagnosticOf } from './errors.js'
import { AuditLog } from './audit.js'
import { compoundKey } from './keys.js'
import { CHANGED_BY, FISHBALL_INSTALLED_PREFIX, FISHBALL_PACKAGES, OPTIONAL_SERVICE, PLUGIN, PLUGIN_ACTION, PLUGIN_CHANGE_OK as OUTCOME_OK, PLUGIN_DSH, PLUGIN_ERROR, PLUGIN_KIND, PLUGIN_OFFER, PLUGIN_RUNS, PLUGIN_SETTINGS_STATE, PLUGIN_STATUS, TOOL_STATUS } from './constants.js'
import { PackageError } from './fishball-packages.js'

const HIDDEN = new Set(HIDDEN_TOOLS)
/** Reviews that keep a tool from Fishball whatever its plugin's state. */
const NOT_FOR_FISHBALL = new Set([TOOL_STATUS.hidden, TOOL_STATUS.unchecked, TOOL_STATUS.otherSessions])
/** Separator of the catalog's shape signature (not a storage key). */
const SHAPE_SEPARATOR = '__'
/** Cordis fiber state of an active plugin (cordis Fiber._getState). */
const FIBER_ACTIVE = 2
/** Review standings that are not themselves a TOOL_STATUS (see #decide). */
const REVIEW = Object.freeze({ trusted: 'trusted', checked: 'checked', allowed: 'allowed' })
/** listBundles availability of a bundle whose files cannot be read. */
const MISSING = 'missing'
/** Stable codes a plugin can store as lastError; anything else is reported as rowFailed. */
const STORED_ERRORS = new Set(Object.values(PLUGIN_ERROR))
/** DSH plugins: the kinds Fishball can only turn on or off, never uninstall. */
const DSH_KINDS = new Set([PLUGIN_KIND.profile, PLUGIN_KIND.fishballOnly])
/** Kinds whose rows come from an installed package and run in the private tree (they count toward maxFishballOnlyPlugins). */
const PACKAGE_TREE_KINDS = new Set([PLUGIN_KIND.fishballOnly, PLUGIN_KIND.fishballInstalled])

/** Catalog key of a Fishball-installed package. */
export const fishballInstalledKey = (packageName) => FISHBALL_INSTALLED_PREFIX + packageName

/** The status a plugin shows, from its kind and desired on/off state. */
function statusOf(kind, on) {
  if (kind === PLUGIN_KIND.builtin) return PLUGIN_STATUS.builtin
  if (kind === PLUGIN_KIND.fishballInstalled) return PLUGIN_STATUS.installedInFishball
  return on ? PLUGIN_STATUS.dshEnabled : PLUGIN_STATUS.dshDisabled
}

/** Where the plugin stands in DSH (snapshot `dsh`, DESIGN §10d). */
const DSH_OF = Object.freeze({
  [PLUGIN_KIND.profile]: PLUGIN_DSH.on,
  [PLUGIN_KIND.fishballOnly]: PLUGIN_DSH.off,
  [PLUGIN_KIND.builtin]: PLUGIN_DSH.builtin,
  [PLUGIN_KIND.fishballInstalled]: PLUGIN_DSH.none,
})

/** Where the plugin runs, from its kind and Fishball's desired on/off (snapshot `runs`). */
function runsOf(kind, on) {
  if (kind === PLUGIN_KIND.profile) return on ? PLUGIN_RUNS.everywhere : PLUGIN_RUNS.dsh
  return on ? PLUGIN_RUNS.fishball : PLUGIN_RUNS.nowhere
}

/** The display fields DSH's metadata offers the list (the icon is served by its own route). */
function displayMeta(meta) {
  if (meta === undefined || meta === null) return null
  const out = {}
  if (meta.title !== undefined) out.title = meta.title
  if (meta.description !== undefined) out.description = meta.description
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Version and display metadata of a package in Fishball's own folder, read without running its
 * code (DSH's readPluginMeta). Missing pieces are null: the list still shows the package name.
 */
function packageFacts(name, dir, folder) {
  let version = null
  let description = null
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, FISHBALL_PACKAGES.manifest), 'utf8'))
    version = typeof manifest.version === 'string' ? manifest.version : null
    description = typeof manifest.description === 'string' ? manifest.description : null
  } catch { /* unreadable manifest: the catalog reports it when it is mounted */ }
  let meta
  try { meta = readPluginMeta(name, pathToFileURL(path.join(folder, FISHBALL_PACKAGES.manifest)).href) } catch { meta = undefined }
  return { version, description, meta }
}

/**
 * Why a package plugin cannot run in Fishball's tree, read from its patch alone (S1): these codes
 * mean it never can, so the page says so up front (revision 10b). A row failure is only known on
 * mounting, so it is not one of them.
 */
const PATCH_BLOCKERS = new Set([PLUGIN_ERROR.editsOtherRows, PLUGIN_ERROR.noRows, PLUGIN_ERROR.noProfile])

/**
 * The actions a plugin offers: on/off for all, uninstall only for Fishball-installed ones; none
 * while it is being uninstalled. A plugin that cannot run in Fishball's tree (`blocked`) offers
 * no "on" (revision 10b: the page says why instead of a switch that is refused).
 */
function actionsOf(kind, on, removing, blocked) {
  if (removing) return []
  if (blocked && !on) return kind === PLUGIN_KIND.fishballInstalled ? [PLUGIN_OFFER.uninstall] : []
  const toggle = on ? PLUGIN_OFFER.disable : PLUGIN_OFFER.enable
  return kind === PLUGIN_KIND.fishballInstalled ? [toggle, PLUGIN_OFFER.uninstall] : [toggle]
}

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
  #defaults
  #packages
  #hasSettings
  #ownPluginOf
  #agentOf = () => undefined
  /** key -> catalog entry { key, title, kind, defaultOn, rows?, bundle?, rowIds?, packageName?, packageDir?, prefix } */
  #entries = new Map()
  /** Applied snapshot: plugins whose rows run / tools show, allowed tool keys. */
  #appliedOn = new Map()
  #appliedAllowed = new Set()
  /** Package plugins mounted only so their tools can be listed for a prompt. */
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
  /** Tail of the uninstalls run after applies (finishRemovals). */
  #removals = Promise.resolve()
  /** Patch problems by plugin, package version and folder, so a refresh reads a patch only once per version. */
  #patchProblems = new Map()

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
   *   layer (scope P): only those can belong to a built-in or package plugin.
   * @param options.onChange - called after the applied snapshot changes.
   * @param options.defaults - PluginDefaults (which DSH plugins keep the old default).
   * @param options.packages - FishballPackages (Fishball's own package folder).
   * @param options.hasSettings - (key) => whether settings are stored for the plugin (snapshot `settings`).
   * @param options.ownPluginOf - (toolName) => the key of Fishball's own plugin a tool Fishball
   *   registers belongs to, or undefined (revision 10c).
   */
  constructor(ctx, store, logger, { readLimits, mountRows, adjustRows = (key, rows) => rows, pendingRowIds, ownsDefinition, onChange, onApplied = () => {}, defaults, packages, hasSettings = () => false, ownPluginOf = () => undefined }) {
    this.#ctx = ctx
    this.#store = store
    this.#logger = logger
    this.#readLimits = readLimits
    this.#changes = new AuditLog(() => store.pluginChanges, () => readLimits().auditEntriesKept)
    this.#mountRows = mountRows
    this.#adjustRows = adjustRows
    this.#onApplied = onApplied
    this.#pendingRowIds = pendingRowIds
    this.#ownPluginOf = ownPluginOf
    this.#ownsDefinition = ownsDefinition
    this.#onChange = onChange
    this.#defaults = defaults
    this.#packages = packages
    this.#hasSettings = hasSettings
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
    let bundles
    try {
      bundles = await this.#ctx.pluginManager.listBundles()
    } catch (error) {
      this.#logger.warn('plugin list unavailable (%s)', diagnosticOf(error))
    }
    // Only plugins you added or DSH offers; the installation's own surface bundles are not plugins.
    const dshPlugins = (bundles ?? []).filter((bundle) => bundle.name !== PLUGIN.name && (bundle.installed || bundle.optional))
    // Only a listing that worked may move the defaults baseline or forget choices (a failed one lists nothing).
    if (bundles !== undefined) {
      const present = new Set(dshPlugins.map((bundle) => bundle.name))
      // The old default was on only for plugins enabled in the DSH profile (review H1).
      const enabled = new Set(dshPlugins.filter((bundle) => bundle.enabled).map((bundle) => bundle.name))
      await this.#defaults.observe(present, enabled)
      await this.#forgetDshPlugins(present)
    }
    const installed = this.#packages.list()
    // Only a folder that could be read may forget choices (an unreadable one lists nothing).
    if (installed !== undefined) await this.#forgetFishballInstalled(new Set(installed.map((pkg) => fishballInstalledKey(pkg.name))))
    for (const bundle of dshPlugins) {
      if (bundle.availability === MISSING) continue
      entries.set(bundle.name, {
        key: bundle.name,
        title: bundle.name,
        kind: bundle.enabled ? PLUGIN_KIND.profile : PLUGIN_KIND.fishballOnly,
        // Off for Fishball unless it was present when this version first started on an existing install (DESIGN §4).
        defaultOn: bundle.enabled && this.#defaults.keepsOldDefault(bundle.name),
        bundle,
        rowIds: new Set(bundle.rows.map((row) => row.rowId)),
        prefix: fishballOnlyPrefix(bundle.name),
        packageName: bundle.name,
        version: bundle.version ?? null,
        description: bundle.description ?? null,
        meta: bundle.meta,
      })
    }
    for (const { name, dir } of installed ?? []) {
      const key = fishballInstalledKey(name)
      entries.set(key, { key, title: name, kind: PLUGIN_KIND.fishballInstalled, defaultOn: false, packageName: name, packageDir: dir, prefix: fishballInstalledPrefix(name), ...packageFacts(name, dir, this.#packages.dir) })
    }
    for (const entry of entries.values()) entry.patchProblem = this.#patchProblem(entry)
    this.#entries = entries
    const shape = [...entries.values()].map((entry) => entry.key + SHAPE_SEPARATOR + entry.kind).join('\n')
    const changed = this.#shape !== '' && shape !== this.#shape
    this.#shape = shape
    if (changed) this.schedule()
  }

  /**
   * Forget the stored choice of DSH plugins no longer installed (DESIGN §4): installed again,
   * one counts as new and starts off.
   * @param present - Set of the DSH plugins a successful listing returned.
   */
  async #forgetDshPlugins(present) {
    await this.#forgetMissing((record) => DSH_KINDS.has(record.kind), present)
  }

  /**
   * Forget the stored choice of Fishball-installed plugins whose package is gone (an uninstall
   * whose record outlived the package, or a folder edited by hand), so installing it again
   * starts clean instead of looking like it is being removed (review H2).
   */
  async #forgetFishballInstalled(present) {
    await this.#forgetMissing((record) => record.kind === PLUGIN_KIND.fishballInstalled, present)
  }

  /** Delete stored choices of the matching kinds whose key is not in present. */
  async #forgetMissing(ofKind, present) {
    for (const [key, record] of [...this.#store.plugins.entries()]) {
      if (ofKind(record) && !present.has(key)) await this.#store.plugins.delete(key)
    }
  }

  /** Whether `key` names a catalog plugin. */
  has(key) {
    return this.#entries.has(key)
  }

  /** The plugin's PLUGIN_KIND. @throws CatalogError(unknownPlugin). */
  kindOf(key) {
    return this.#require(key).kind
  }

  /**
   * Whether Fishball must ask you before it turns this plugin on: one of its own feature plugins
   * (revision 10c), so your off holds unless you allow it.
   */
  asksToEnable(key) {
    return this.#require(key).asksToEnable === true
  }

  /** The plugin's title as the Fishball tab shows it (Fishball's prompts name it so). */
  titleOf(key) {
    return this.#require(key).title
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

  /**
   * Whether the plugin's rows come from an installed package and run in the private tree when on
   * (a DSH plugin off in the profile, or a Fishball-installed one): it must be mounted to list its tools.
   */
  mountsPackage(key) {
    return PACKAGE_TREE_KINDS.has(this.#require(key).kind)
  }

  /**
   * Why a package plugin can never run in Fishball's tree, from its patch (cached per version and
   * folder), or undefined. Reads the rows without resolving modules: that is a mount-time matter.
   */
  #patchProblem(entry) {
    if (!PACKAGE_TREE_KINDS.has(entry.kind)) return undefined
    const cacheKey = [entry.key, entry.kind, entry.bundle?.version ?? entry.version ?? '', entry.packageDir ?? ''].join(SHAPE_SEPARATOR)
    if (!this.#patchProblems.has(cacheKey)) {
      let problem
      try {
        if (entry.kind === PLUGIN_KIND.fishballInstalled) readPackageRows(entry.packageDir)
        else readBundleRows(entry.bundle, this.#ctx.get(OPTIONAL_SERVICE.profileContext))
      } catch (error) {
        if (error instanceof BundleRowsError && PATCH_BLOCKERS.has(error.code)) problem = error.code
      }
      this.#patchProblems.set(cacheKey, problem)
    }
    return this.#patchProblems.get(cacheKey)
  }

  /**
   * Why the plugin cannot be turned on for Fishball (snapshot `blocked`, revision 10b): its patch,
   * or, once Fishball has turned it off for publishing a service (its features are DSH's own,
   * reached from DSH's interface), that diagnostic. A reinstall forgets the stored choice and
   * with it the second reason.
   */
  #blockedOf(entry) {
    if (entry.patchProblem !== undefined) return entry.patchProblem
    const record = this.#store.plugins.get(entry.key)
    return record?.kind === entry.kind && record.lastError === PLUGIN_ERROR.leaksService ? PLUGIN_ERROR.leaksService : undefined
  }

  /** Whether the plugin is being uninstalled (it offers no other action until then). */
  isRemoving(key) {
    const record = this.#store.plugins.get(key)
    return record?.removing === true && record.kind === this.#entries.get(key)?.kind
  }

  /** Tree plugins (built-ins, DSH plugins off in the profile, Fishball-installed plugins). */
  #treePlugins() {
    return [...this.#entries.values()].filter((entry) => entry.kind !== PLUGIN_KIND.profile)
  }

  /**
   * Refuse turning a plugin on when it cannot run for Fishball: a plugin being uninstalled, a
   * package whose patch edits other rows or has none, or one more than `maxFishballOnlyPlugins`
   * package plugins in the private tree at once (DSH plugins off in the profile and
   * Fishball-installed ones). Lowering the limit never stops plugins already on (DESIGN §11);
   * built-ins are a fixed set and do not count (§16).
   * @throws CatalogError with the PLUGIN_ERROR code.
   */
  assertCanEnable(key) {
    const entry = this.#require(key)
    if (this.isRemoving(key)) throw new CatalogError(PLUGIN_ERROR.removing)
    if (!PACKAGE_TREE_KINDS.has(entry.kind) || this.desiredOn(key)) return
    const blocked = this.#blockedOf(entry)
    if (blocked !== undefined) throw new CatalogError(blocked)
    this.#rowsOf(entry)
    const running = this.#treePlugins().filter((other) => PACKAGE_TREE_KINDS.has(other.kind) && this.desiredOn(other.key))
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
   * @returns { key, own } — own: Fishball registered it, and key is its own plugin (revision 10c);
   *   key undefined for DSH host rows.
   */
  #pluginOfOwner(owner, definition, name) {
    if (owner === undefined) return { key: undefined, own: false }
    if (owner.module === PLUGIN.name) return { key: this.#ownPluginOf(name), own: true }
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
   * The catalog plugin a loader row belongs to (ctx.fishball sources, DESIGN §8): a profile
   * bundle's row by its id, or a private-tree row by its plugin prefix; else undefined.
   * @param rowId - the loader entry's id; @param inTree - whether the row runs in the private tree.
   */
  pluginOfRow(rowId, inTree) {
    for (const entry of this.#entries.values()) {
      if (entry.kind === PLUGIN_KIND.profile ? !inTree && entry.rowIds.has(rowId) : inTree && rowId?.startsWith(entry.prefix)) return entry.key
    }
    return undefined
  }

  /** Whether a plugin is on for Fishball as applied now (its sources are accepted; Fishball's own features follow it). */
  isAppliedOn(key) {
    return this.#appliedOn.get(key) === true
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
   * - hidden: on the §7 hidden list (or a bsk_inspect that is not Fishball's save-less copy);
   * - other-sessions: one of Fishball's own host-row tools, which serve other sessions
   *   (message_fishball), never Fishball itself;
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
    const { key, own } = this.#pluginOfOwner(owner, judged, name)
    const review = (() => {
      // Fishball's own HOST-row tools serve other sessions (message_fishball); only the tools
      // it registers in its own scope P are for Fishball itself. Checked before the hidden list,
      // which also names message_fishball for the guard, so the page says whom it serves (revision 10c).
      if (own && !isCopy && !this.#ownsDefinition(judged)) return TOOL_STATUS.otherSessions
      // An own tool missing from index.js OWN_TOOL_PLUGIN has no switch: hidden, not trusted (review L5).
      if (own && !isCopy && key === undefined) return TOOL_STATUS.hidden
      if (HIDDEN.has(name) || (name === BSK_INSPECT.name && !isCopy)) return TOOL_STATUS.hidden
      if ((own && !isCopy) || this.#entries.get(key)?.kind === PLUGIN_KIND.builtin) return REVIEW.trusted
      if (owner === undefined) return TOOL_STATUS.unchecked
      if (isChecked(name, owner.module, digest)) return REVIEW.checked
      if (allowedKeys.has(toolKeyOf(owner.module, name, digest))) return REVIEW.allowed
      return TOOL_STATUS.unchecked
    })()
    const pluginOff = key !== undefined && (this.#listing.has(key) || this.#appliedOn.get(key) !== true)
    const status = NOT_FOR_FISHBALL.has(review) ? review
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
      // Only plugins on for Fishball: with DSH plugins off by default, an off one is no news (DESIGN §7).
      if (this.#entries.get(decision.plugin)?.kind !== PLUGIN_KIND.profile || !this.isAppliedOn(decision.plugin)) continue
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
   * @param options.asked - Fishball turning on one of its own plugins after you allowed it.
   * @throws CatalogError(unknownPlugin | limitReached | editsOtherRows | noRows | noProfile | askFirst).
   */
  setDesired(key, on, by, { asked = false } = {}) {
    return this.#serializedChoice(async () => {
      if (on) this.assertCanEnable(key)
      const entry = this.#require(key)
      // Checked here, in the queue: an off of yours queued while Fishball decided not to ask
      // still holds (revision 10c review M1). `asked` means you allowed it in Fishball's prompt.
      if (on && by === CHANGED_BY.fishball && !asked && entry.asksToEnable === true && !this.desiredOn(key)) throw new CatalogError(PLUGIN_ERROR.askFirst)
      if (this.isRemoving(key)) throw new CatalogError(PLUGIN_ERROR.removing)
      await this.#putChoice(key, entry, { on, changedBy: by })
      await this.audit(key, on ? PLUGIN_ACTION.on : PLUGIN_ACTION.off, by, OUTCOME_OK)
      this.schedule()
    })
  }

  /**
   * Choose to uninstall a Fishball-installed plugin: it is turned off and marked removing at
   * once (durable), the next idle-phase apply unmounts it, and the package is removed after
   * that apply (finishRemovals), so its code has stopped before its files go. A repeated
   * request while one is pending changes nothing.
   * @throws CatalogError(unknownPlugin | notRemovable).
   */
  requestRemove(key, by) {
    return this.#serializedChoice(async () => {
      const entry = this.#require(key)
      if (entry.kind !== PLUGIN_KIND.fishballInstalled) throw new CatalogError(PLUGIN_ERROR.notRemovable)
      if (this.isRemoving(key)) return
      await this.#putChoice(key, entry, { on: false, changedBy: by, removing: true })
      this.schedule()
    })
  }

  /**
   * Store one plugin's Fishball state, stamped with its current kind and the time (DESIGN §9).
   * @param fields - { on, changedBy, lastError?, removing? }.
   */
  #putChoice(key, entry, fields) {
    return this.#store.plugins.put(key, { kind: entry.kind, ...fields, changedAt: new Date().toISOString() })
  }

  /**
   * Run one check-and-write after the previous one (see setDesired). A stored choice changes the
   * snapshot (on, status, actions, removing) before the apply, so it is published at once.
   */
  #serializedChoice(task) {
    const run = this.#choices.then(async () => { await task(); this.#onChange() })
    this.#choices = run.catch(() => {})
    return run
  }

  /**
   * Uninstall every plugin marked removing whose rows are no longer applied (after an apply, and
   * after boot, which finishes an uninstall a restart interrupted). Success forgets the plugin
   * and audits `remove`; a failure keeps it installed and off with lastError remove-failed.
   */
  finishRemovals() {
    const run = this.#removals.then(async () => {
      let removed = false
      for (const [key, record] of [...this.#store.plugins.entries()]) {
        const entry = this.#entries.get(key)
        // Only once its rows are gone: neither applied nor mounted for a mid-turn listing.
        if (record.removing !== true || entry?.kind !== PLUGIN_KIND.fishballInstalled || this.#appliedOn.get(key) === true || this.#listing.has(key)) continue
        try {
          await this.#packages.remove(entry.packageName)
          await this.#store.plugins.delete(key)
          await this.audit(key, PLUGIN_ACTION.remove, record.changedBy, OUTCOME_OK)
        } catch (error) {
          if (!(error instanceof PackageError)) this.#logger.warn('plugin %s could not be uninstalled (%s)', key, diagnosticOf(error))
          await this.#putChoice(key, entry, { on: false, changedBy: record.changedBy, lastError: PLUGIN_ERROR.removeFailed })
          await this.audit(key, PLUGIN_ACTION.remove, record.changedBy, PLUGIN_ERROR.removeFailed)
        }
        removed = true
      }
      if (removed) {
        await this.refresh()
        this.#onChange()
      }
    })
    this.#removals = run.catch((error) => this.#logger.warn('uninstalls failed (%s)', diagnosticOf(error)))
    return this.#removals
  }

  /**
   * Take in a package just installed in Fishball's folder: audit the install and read the
   * catalog again (shared by add_plugin and the install dialog, review L1).
   * @returns the plugin's catalog key. @throws CatalogError(restartRequired) when the catalog does not list it yet.
   */
  async adopt(packageName, by) {
    const key = fishballInstalledKey(packageName)
    await this.audit(key, PLUGIN_ACTION.add, by, OUTCOME_OK)
    await this.refresh()
    if (!this.has(key)) throw new CatalogError(PLUGIN_ERROR.restartRequired)
    return key
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
   * Mount one package plugin now, with every tool masked, so its tools can be listed in
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
          // Outside the idle phase: a package removal must not hold Fishball's next turn.
          await this.finishRemovals()
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
   * Rows of one tree-mounted plugin, with private-tree ids. Every kind passes through adjustRows
   * before ids are prefixed: the context window sets the compaction row there, and your plugin
   * settings are merged in there (DESIGN §10d). @throws CatalogError.
   * @param purpose - { listing } passed to adjustRows (a mid-turn listing mount).
   */
  #rowsOf(entry, purpose = {}) {
    try {
      return prefixRows(this.#adjustRows(entry.key, this.#plainRows(entry), purpose), entry.prefix)
    } catch (error) {
      throw this.#rowsError(entry, error)
    }
  }

  /** The plugin's own rows, unprefixed, with module names as the private tree imports them. */
  #plainRows(entry) {
    if (entry.kind === PLUGIN_KIND.builtin) return entry.rows
    if (entry.kind === PLUGIN_KIND.fishballInstalled) return anchorRowModules(readPackageRows(entry.packageDir), entry.packageDir)
    return readBundleRows(entry.bundle, this.#ctx.get(OPTIONAL_SERVICE.profileContext))
  }

  /** A stable CatalogError for a failure to read or prefix a plugin's rows. */
  #rowsError(entry, error) {
    if (error instanceof CatalogError) return error
    if (error instanceof BundleRowsError) return new CatalogError(error.code)
    if (error instanceof RowIdConflictError) return new CatalogError(PLUGIN_ERROR.rowIdConflict)
    // A missing or unparsable bundle file: a stable code, never the raw fs/YAML error (M8b).
    this.#logger.warn('plugin %s rows unreadable (%s)', entry.key, diagnosticOf(error))
    return new CatalogError(PLUGIN_ERROR.rowFailed)
  }

  /**
   * The rows whose settings the plugin page and the settings tools work on (DESIGN §10d):
   * unprefixed, without your values merged in. `shared` is true for a plugin on in DSH, whose
   * settings are DSH's. A plugin whose rows cannot be read has none.
   * @throws CatalogError(unknownPlugin).
   */
  settingsRows(key) {
    const entry = this.#require(key)
    let rows
    try { rows = this.#plainRows(entry) } catch (error) {
      this.#logger.warn('plugin %s settings rows unreadable (%s)', key, diagnosticOf(error))
      rows = []
    }
    return { shared: entry.kind === PLUGIN_KIND.profile, rows }
  }

  /** The plugin's newest audit entries, newest first: { action, by, at, outcome }. */
  history(key, limit) {
    return this.#changes.recent(Infinity).filter((entry) => entry.plugin === key).slice(0, limit).map(({ action, by, at, outcome }) => ({ action, by, at, outcome }))
  }

  /** The plugin's icon as DSH's metadata gives it (a base64 data URL), or undefined. @throws CatalogError(unknownPlugin). */
  iconOf(key) {
    const icon = this.#require(key).meta?.icon
    return typeof icon === 'string' ? icon : undefined
  }

  /** Snapshot `settings` of one plugin (DESIGN §10d). @throws CatalogError(unknownPlugin). */
  settingsState(key) {
    return this.#settingsState(this.#require(key))
  }

  #settingsState(entry) {
    const stored = this.#hasSettings(entry.key)
    if (entry.kind === PLUGIN_KIND.profile) return stored ? PLUGIN_SETTINGS_STATE.unused : PLUGIN_SETTINGS_STATE.none
    if (stored) return PLUGIN_SETTINGS_STATE.changed
    return entry.kind === PLUGIN_KIND.builtin && entry.rows.length === 0 ? PLUGIN_SETTINGS_STATE.none : PLUGIN_SETTINGS_STATE.default
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
    await this.#putChoice(key, entry, { on: false, changedBy: previous?.changedBy ?? CHANGED_BY.fishball, lastError: stored })
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
        const on = this.desiredOn(entry.key)
        const removing = this.isRemoving(entry.key)
        return {
          plugin: entry.key,
          title: entry.title,
          kind: entry.kind,
          status: statusOf(entry.kind, on),
          actions: actionsOf(entry.kind, on, removing, this.#blockedOf(entry) !== undefined),
          removing,
          on,
          applied: this.#appliedOn.get(entry.key) === true,
          waiting: this.#waiting.has(entry.key),
          changedBy: record?.kind === entry.kind ? record.changedBy : null,
          lastError: record?.lastError ?? null,
          dsh: entry.own === true ? PLUGIN_DSH.fishball : DSH_OF[entry.kind],
          runs: runsOf(entry.kind, on),
          packageName: entry.packageName ?? null,
          version: entry.version ?? null,
          description: entry.description ?? null,
          meta: displayMeta(entry.meta),
          hasIcon: typeof entry.meta?.icon === 'string',
          settings: this.#settingsState(entry),
          blocked: this.#blockedOf(entry) ?? null,
          tools: (toolsByPlugin.get(entry.key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
        }
      }),
      allowedTools: [...this.#store.toolApprovals.entries()].map(([key, record]) => ({ key, module: record.module, toolName: record.toolName })),
      otherTools: [...(decisions ?? [])].filter(([, decision]) => decision.plugin === null && decision.status !== TOOL_STATUS.visible).map(([name, decision]) => ({ name, status: decision.status })),
    }
  }
}
