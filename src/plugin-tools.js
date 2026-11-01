/**
 * Fishball's plugin tools (DESIGN §4 "Who changes what", §10d): list_plugins, set_plugin_enabled,
 * add_plugin, remove_plugin, get_plugin_settings, set_plugin_settings. They are registered in
 * scope P, so only Fishball has them.
 *
 * - set_plugin_enabled changes Fishball's own state only; the change applies when the
 *   current turn ends (the catalog applies it in the idle phase).
 * - Turning on one of Fishball's own plugins (Session messages, Session watching, Plugin
 *   management, Permission requests) that is off asks you first (revision 10c).
 * - Turning on a plugin with tools nobody has checked raises a DSH permission request listing
 *   them (N4). A package plugin (DSH plugin off in the profile, or one installed in Fishball only)
 *   is mounted first, with its tools masked, so they can be listed. Unless it is turned on, the
 *   listing ends and it is unmounted again.
 * - add_plugin installs only after you allow it (N3), into Fishball's own package
 *   folder (src/fishball-packages.js), never the DSH profile, then turns it on for Fishball
 *   through the same path.
 *
 * Every request is made in the tool body through approval.request (so it is audited in Fishball's
 * log and a pre-execute listener such as Auto review cannot allow it first, S17), and never
 * blocks (rev11f, §7a.11): it becomes a card labelled Fishball in your pile, the tool returns
 * waiting-for-approval at once with the request id, and nothing else happens. When you allow it,
 * Fishball is told to run it again, and the identical call then runs (src/own-requests.js).
 * - remove_plugin uninstalls a plugin installed in Fishball only, after you click Allow once;
 *   a DSH plugin can never be uninstalled from Fishball (refused before any prompt).
 * - get_plugin_settings reads the settings of a plugin Fishball runs itself, secrets shown only as
 *   set or not set; set_plugin_settings changes them after you allow it, and never a
 *   secret field (Q-manager-secrets). Every refusal comes before the prompt.
 *
 * A plugin that registers its tools lazily (browser-skill reveals bsk_* on first use) has no
 * tools to list when it is turned on; they appear later as unchecked and are allowed the same
 * way, by asking for the plugin again (set_plugin_enabled on), which then lists them.
 *
 * Results are structured JSON with stable codes; nothing here writes the DSH profile's
 * package.json, lockfile or cordis.patch.yml.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { APPROVAL_GRANTED, CHANGED_BY, PLUGIN_ACTION, PLUGIN_ERROR, PLUGIN_KIND, SESSION_INFO } from './constants.js'
import { cutToBytes } from './text.js'
import { SettingsError } from './plugin-settings.js'
import { CatalogError, fishballInstalledKey } from './plugin-catalog.js'
import { PackageError } from './fishball-packages.js'
import { diagnosticOf } from './errors.js'
import { digestOf } from './digest.js'

/** Audit key of an install request: a digest, never the raw spec. */
const SPEC_AUDIT_PREFIX = 'spec:'

export const PLUGIN_TOOL = Object.freeze({ list: 'list_plugins', set: 'set_plugin_enabled', add: 'add_plugin', remove: 'remove_plugin', getSettings: 'get_plugin_settings', setSettings: 'set_plugin_settings' })

/** Model-facing texts (stable; no secrets). */
const TEXT = Object.freeze({
  listDescription: 'List the plugins Fishball can use: each one\'s status (installed-in-fishball, dsh-enabled, dsh-disabled, builtin), the actions it offers, who last changed it, and why any of its tools are not available (hidden, plugin off, unchecked, or other-sessions: a tool Fishball provides to other sessions).',
  setDescription: 'Turn one plugin on or off for Fishball only. The DSH profile is not changed, and other sessions are not affected, except by Fishball\'s own plugins: Session messages off takes message_fishball away from them, and Permission requests off sends their permission requests straight to the user. The change takes effect when your current turn ends. Turning on a plugin with tools nobody has checked, or one of Fishball\'s own plugins that is off, asks the user first: the call returns waiting-for-approval at once.',
  addDescription: 'Install a plugin package for Fishball only, after the user allows it: the call returns waiting-for-approval at once, and you are told to run it again once the user allows it. It goes into Fishball\'s own package folder, not the DSH profile, so other sessions never see it; Fishball then turns it on for itself.',
  removeDescription: 'Uninstall a plugin installed in Fishball only (status installed-in-fishball), after the user allows it: the call returns waiting-for-approval at once, and you are told to run it again once the user allows it. Plugins installed in DSH cannot be uninstalled from Fishball; turn them off instead. The uninstall happens when your current turn ends.',
  removeReasonArg: 'Why Fishball wants to uninstall this plugin, shown to the user with the request.',
  removesLater: 'Allowed. It is uninstalled when this turn ends.',
  removePrompt: (plugin, reason) => `Fishball asks to uninstall "${plugin}", a plugin installed for Fishball only. Reason: ${reason}`,
  pluginArg: 'The plugin key exactly as list_plugins shows it.',
  onArg: 'true to turn the plugin on for Fishball, false to turn it off.',
  specArg: 'One package spec: a registry name, an absolute path, a git address or a tarball URL.',
  reasonArg: 'Why Fishball needs this plugin, shown to the user with the request.',
  appliesLater: 'Saved. It takes effect when this turn ends.',
  addPrompt: (spec, reason) => `Fishball asks to install the plugin "${spec}" for Fishball only, in its own package folder; the DSH profile and other sessions are not changed. Reason: ${reason}`,
  getSettingsDescription: 'Read the settings of one plugin Fishball runs itself (built in, installed in Fishball only, or a DSH plugin that is off in DSH and on in Fishball): each field\'s path, kind, description, the plugin\'s own value and the current value. Secret fields show only whether they are set. A plugin on in DSH shares DSH\'s settings (shared: true); change those on DSH\'s Plugins page.',
  setSettingsDescription: 'Change settings of one plugin Fishball runs itself, after the user allows it: the call returns waiting-for-approval at once, and you are told to run it again once the user allows it. Pass only the fields to change, as a nested object for one row (get_plugin_settings lists rows and fields). Secret fields cannot be set by Fishball. The change takes effect when your current turn ends.',
  rowArg: 'The row id exactly as get_plugin_settings shows it.',
  valuesArg: 'The fields to change, as a nested object, for example {"limit": 5}. Objects are merged; lists and other values replace.',
  settingsReasonArg: 'Why Fishball wants this change, shown to the user with the request.',
  settingsPrompt: (plugin, row, lines, reason) => [
    `Fishball asks to change settings of "${plugin}" (row ${row}) for Fishball only; other sessions and the DSH profile are not changed:`,
    ...lines,
    `Reason: ${reason}`,
  ].join('\n'),
  /** A field without a value, and a secret (never shown), in the prompt's `path: old → new` lines. */
  unsetValue: 'unset',
  secretValue: 'secret',
  ownPluginPrompt: (title) => `Fishball asks to turn on "${title}", one of Fishball's own plugins, for itself. It is off now; allowing turns it on when this turn ends.`,
  uncheckedHeader: (plugin) => `Fishball wants to turn on "${plugin}" for itself. Nobody has checked these tools yet; allowing shows them to Fishball:`,
  /** One entry of a request's list: `- entry` in the prompt, the entry alone on the card. */
  listLine: (entry) => `- ${entry}`,
})

const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const ok = (fields = {}) => ({ ok: true, ...fields })

/** A value in the settings prompt: JSON, cut to maxBytes (the settingsPromptValueBytes limit, DESIGN §10d). */
const promptValue = (value, maxBytes) => cutToBytes(value === undefined ? TEXT.unsetValue : JSON.stringify(value), maxBytes, SESSION_INFO.ellipsis)

/** One entry per changed field: `path: old → new` (a secret never shows its values). */
const changeEntries = (changes, maxBytes) => changes.map((change) => `${change.path.join('.')}: ${change.secret ? TEXT.secretValue : `${promptValue(change.old, maxBytes)} → ${promptValue(change.new, maxBytes)}`}`)
/** One entry per unchecked tool: its name and the first line of its description (N4). */
const toolEntries = (unchecked) => unchecked.map((tool) => `${tool.name}: ${tool.description}`)
/** A request's text for DSH: the header, then each entry on its own line. */
const listPrompt = (header, entries) => [header, ...entries.map(TEXT.listLine)].join('\n')
const refused = (code, fields = {}) => ({ ok: false, code, ...fields })


/**
 * Register the tools.
 * @param deps.register - (definition) => disposer, registering in scope P.
 * @param deps.catalog - PluginCatalog.
 * @param deps.composition - AssistantComposition (decisions()).
 * @param deps.tools - tools service; deps.scope - scope key P.
 * @param deps.approval - approval service; deps.packages - FishballPackages.
 * @param deps.own - OwnRequests (what each card shows); deps.broker - ApprovalBroker (cardFor).
 * @param deps.settings - PluginSettings (src/plugin-settings.js).
 * @param deps.logger - plugin logger.
 * @param deps.readLimits - () => current limits.
 */
export function registerPluginTools({ register, catalog, composition, tools, scope, approval, packages, settings, logger, readLimits, own, broker }) {
  /**
   * Ask the user (§7a.11): only 'allowed-once' (the pass of an identical call you allowed) grants.
   * @param prompt - the request's text for DSH (audited in Fishball's log).
   * @param card - what the card shows: { reason, detail?, subject? } (src/own-requests.js expect).
   * @param refuse - () => Promise<the result> when it is refused without a card (a never-asking mode).
   * @returns undefined when allowed, else what the tool returns: the waiting result or refuse()'s.
   */
  const gate = async (exec, toolName, prompt, card, refuse) => {
    own.expect(exec.callId, card)
    let outcome
    try {
      outcome = await approval.request({ agent: exec.agent, toolName, callId: exec.callId, reason: prompt, signal: exec.signal })
    } finally {
      own.forget(exec.callId)
    }
    if (outcome === APPROVAL_GRANTED) return undefined
    return broker.cardFor(exec.callId) ?? refuse()
  }

  /**
   * Turn a plugin on for Fishball, asking about unchecked tools first (shared by set and add).
   * From add_plugin, the request stands for set_plugin_enabled on the installed plugin (`subject`):
   * the install's pass never covers it, and once you allow it, Fishball turns the plugin on.
   * A package plugin (a DSH plugin off in the profile, or a Fishball-installed one) that is not
   * running yet is mounted for listing first; the listing
   * ends on EVERY path that does not turn it on, a thrown prompt included (review M3). A
   * plugin already running is not remounted (review M2): only its unchecked tools are asked.
   */
  const enable = async (plugin, exec, toolName) => {
    catalog.assertCanEnable(plugin)
    /** Refused without a card: audited, and the plugin stays as it was. */
    const rejected = (fields) => rejectedAs(plugin, PLUGIN_ACTION.on, fields)
    // One of Fishball's own plugins that is off: your off holds unless you allow it (revision 10c).
    // setDesired checks again in its queue, so an off of yours arriving meanwhile still holds.
    const asks = catalog.asksToEnable(plugin) && !catalog.desiredOn(plugin)
    const subject = toolName === PLUGIN_TOOL.set ? undefined : { toolName: PLUGIN_TOOL.set, args: { plugin, on: true } }
    if (asks) {
      const ownPrompt = TEXT.ownPluginPrompt(catalog.titleOf(plugin))
      const stop = await gate(exec, toolName, ownPrompt, { reason: ownPrompt, subject }, rejected)
      if (stop !== undefined) return stop
    }
    const listing = catalog.mountsPackage(plugin) && !catalog.isRunning(plugin)
    let turnedOn = false
    try {
      // Inside the try: a mount that throws still ends the listing (review N4).
      if (listing) {
        const failure = await catalog.mountForListing(plugin)
        if (failure !== undefined) return refused(failure)
      }
      const unchecked = catalog.uncheckedOf(plugin, tools, scope)
      if (unchecked.length > 0) {
        const header = TEXT.uncheckedHeader(plugin)
        const entries = toolEntries(unchecked)
        const stop = await gate(exec, toolName, listPrompt(header, entries), { reason: header, detail: entries, subject }, () => rejected({ unchecked: unchecked.map((tool) => tool.name) }))
        if (stop !== undefined) return stop
      }
      // Turn on first: a refused setDesired (a racing toggle reached the limit) then stores no
      // allowance for a plugin that stays off (review N5).
      await catalog.setDesired(plugin, true, CHANGED_BY.fishball, { asked: asks })
      turnedOn = true
      await catalog.allowTools(unchecked)
      return ok({ plugin, on: true, allowedTools: unchecked.map((tool) => tool.name), note: TEXT.appliesLater })
    } finally {
      // Turned on: the next apply (idle phase) ends the listing with the plugin mounted for real.
      if (listing && !turnedOn) await catalog.endListing(plugin)
    }
  }

  /** Refused without a card (a never-asking mode): audited as rejected, as before rev11f. */
  const rejectedAs = async (subject, action, fields) => {
    await catalog.audit(subject, action, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
    return refused(PLUGIN_ERROR.rejected, fields)
  }

  /** Read the catalog again; the refusal for a plugin it does not list, else undefined. */
  const unknownPlugin = async (plugin) => {
    await catalog.refresh()
    return catalog.has(plugin) ? undefined : refused(PLUGIN_ERROR.unknownPlugin)
  }

  /** Run a tool body; a CatalogError becomes a refusal with its code. */
  const guarded = (body) => async (args, exec) => {
    try {
      return await body(args, exec)
    } catch (error) {
      if (error instanceof CatalogError) return refused(error.code)
      if (error instanceof SettingsError) return refused(error.code, error.path === undefined ? {} : { path: error.path })
      if (error instanceof PackageError) return refused(PLUGIN_ERROR.installFailed, { reason: error.code })
      logger.warn('plugin tool failed (%s)', diagnosticOf(error))
      throw error
    }
  }

  return [
    register(defineTool({
      name: PLUGIN_TOOL.list,
      description: TEXT.listDescription,
      parameters: {},
      output: JSON_OUTPUT,
      execute: guarded(async () => {
        await catalog.refresh()
        return catalog.snapshot(composition.decisions())
      }),
    })),
    register(defineTool({
      name: PLUGIN_TOOL.set,
      description: TEXT.setDescription,
      parameters: {
        plugin: { type: 'string', required: true, description: TEXT.pluginArg },
        on: { type: 'boolean', required: true, description: TEXT.onArg },
      },
      output: JSON_OUTPUT,
      execute: guarded(async ({ plugin, on }, exec) => {
        const unknown = await unknownPlugin(plugin)
        if (unknown) return unknown
        if (on) return enable(plugin, exec, PLUGIN_TOOL.set)
        await catalog.setDesired(plugin, false, CHANGED_BY.fishball)
        return ok({ plugin, on: false, note: TEXT.appliesLater })
      }),
    })),
    register(defineTool({
      name: PLUGIN_TOOL.add,
      description: TEXT.addDescription,
      parameters: {
        spec: { type: 'string', required: true, description: TEXT.specArg },
        reason: { type: 'string', required: true, description: TEXT.reasonArg },
      },
      output: JSON_OUTPUT,
      execute: guarded(async ({ spec, reason }, exec) => {
        // A spec DSH's parser refuses is refused before the user is asked (PackageError via guarded).
        packages.check(spec)
        // The audit stores a digest of the spec, never the spec: a git or tarball URL can carry
        // credentials, and DESIGN §11 stores no secrets (review M10).
        const specKey = SPEC_AUDIT_PREFIX + digestOf(spec)
        const stop = await gate(exec, PLUGIN_TOOL.add, TEXT.addPrompt(spec, reason), { reason }, () => rejectedAs(specKey, PLUGIN_ACTION.add))
        if (stop !== undefined) return stop
        let name
        try {
          ({ name } = await packages.install(spec))
        } catch (error) {
          if (!(error instanceof PackageError)) throw error
          await catalog.audit(specKey, PLUGIN_ACTION.add, CHANGED_BY.fishball, error.code)
          return refused(PLUGIN_ERROR.installFailed, { reason: error.code })
        }
        const installed = fishballInstalledKey(name)
        try { await catalog.adopt(name, CHANGED_BY.fishball) } catch (error) {
          if (error instanceof CatalogError) return refused(error.code, { installed })
          throw error
        }
        // Installed either way: the result names it even when turning it on is refused (L5).
        try {
          return { ...(await enable(installed, exec, PLUGIN_TOOL.add)), installed }
        } catch (error) {
          if (error instanceof CatalogError) return refused(error.code, { installed })
          throw error
        }
      }),
    })),
    register(defineTool({
      name: PLUGIN_TOOL.remove,
      description: TEXT.removeDescription,
      parameters: {
        plugin: { type: 'string', required: true, description: TEXT.pluginArg },
        reason: { type: 'string', required: true, description: TEXT.removeReasonArg },
      },
      output: JSON_OUTPUT,
      execute: guarded(async ({ plugin, reason }, exec) => {
        const unknown = await unknownPlugin(plugin)
        if (unknown) return unknown
        // DSH plugins and built-ins: refused before the user is asked (Fishball never changes the DSH profile).
        if (catalog.kindOf(plugin) !== PLUGIN_KIND.fishballInstalled) return refused(PLUGIN_ERROR.notRemovable)
        // Already being uninstalled: nothing to ask the user (review L1).
        if (catalog.isRemoving(plugin)) return refused(PLUGIN_ERROR.removing)
        const stop = await gate(exec, PLUGIN_TOOL.remove, TEXT.removePrompt(plugin, reason), { reason }, () => rejectedAs(plugin, PLUGIN_ACTION.remove))
        if (stop !== undefined) return stop
        await catalog.requestRemove(plugin, CHANGED_BY.fishball)
        return ok({ plugin, removing: true, note: TEXT.removesLater })
      }),
    })),
    register(defineTool({
      name: PLUGIN_TOOL.getSettings,
      description: TEXT.getSettingsDescription,
      parameters: {
        plugin: { type: 'string', required: true, description: TEXT.pluginArg },
      },
      output: JSON_OUTPUT,
      execute: guarded(async ({ plugin }) => {
        const unknown = await unknownPlugin(plugin)
        if (unknown) return unknown
        return ok({ plugin, ...(await settings.fields(plugin)) })
      }),
    })),
    register(defineTool({
      name: PLUGIN_TOOL.setSettings,
      description: TEXT.setSettingsDescription,
      parameters: {
        plugin: { type: 'string', required: true, description: TEXT.pluginArg },
        row: { type: 'string', required: true, description: TEXT.rowArg },
        values: { type: 'object', additionalProperties: true, required: true, description: TEXT.valuesArg },
        reason: { type: 'string', required: true, description: TEXT.settingsReasonArg },
      },
      output: JSON_OUTPUT,
      execute: guarded(async ({ plugin, row, values, reason }, exec) => {
        const unknown = await unknownPlugin(plugin)
        if (unknown) return unknown
        // Every refusal (shared, unknown row, no settings, secret, invalid) comes before the prompt.
        const preview = await settings.plan(plugin, row, { values }, { secrets: false })
        if (preview.changes.length === 0) return refused(PLUGIN_ERROR.noChange)
        const entries = changeEntries(preview.changes, readLimits().settingsPromptValueBytes)
        const stop = await gate(exec, PLUGIN_TOOL.setSettings, TEXT.settingsPrompt(plugin, row, entries.map(TEXT.listLine), reason), { reason, detail: entries }, () => rejectedAs(plugin, PLUGIN_ACTION.settings))
        if (stop !== undefined) return stop
        // Saved against the values stored now: a change you made while the prompt was open is
        // kept, and the saved config is checked again (a refusal now answers its code).
        const saved = await settings.save(plugin, row, { values }, { secrets: false }, CHANGED_BY.fishball)
        return ok({ plugin, row, changed: saved.changes.map((change) => change.path.join('.')), note: TEXT.appliesLater })
      }),
    })),
  ]
}
