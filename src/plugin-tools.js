/**
 * Fishball's plugin tools (DESIGN §4 "Who changes what", §10d): list_plugins, set_plugin_enabled,
 * add_plugin, remove_plugin, get_plugin_settings, set_plugin_settings. They are registered in
 * scope P, so only Fishball has them.
 *
 * - set_plugin_enabled changes Fishball's own state only; the change applies when the
 *   current turn ends (the catalog applies it in the idle phase).
 * - Turning on a plugin with tools nobody has checked raises a normal DSH permission
 *   request listing them (N4). A package plugin (DSH plugin off in the profile, or one installed
 *   in Fishball only) is mounted first, with its tools
 *   masked, so they can be listed. Reject changes nothing and unmounts it again.
 * - add_plugin installs only after you click Allow once (N3), into Fishball's own package
 *   folder (src/fishball-packages.js), never the DSH profile, then turns it on for Fishball
 *   through the same path.
 * - remove_plugin uninstalls a plugin installed in Fishball only, after you click Allow once;
 *   a DSH plugin can never be uninstalled from Fishball (refused before any prompt).
 * - get_plugin_settings reads the settings of a plugin Fishball runs itself, secrets shown only as
 *   set or not set; set_plugin_settings changes them after you click Allow once, and never a
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
import { randomUUID } from 'node:crypto'
import { createUserMessage, boundContextSummary } from '@deepseek-ai/dsh-llm'
import { APPROVAL_GRANTED, CHANGED_BY, INTAKE_ERROR, INTAKE_KIND, PLUGIN_INSTALL_REQUEST, PLUGIN_ACTION, PLUGIN_CHANGE_OK as OUTCOME_OK, PLUGIN_ERROR, PLUGIN_KIND, PLUGIN_MANAGER, SESSION_INFO, SOURCE } from './constants.js'
import { IntakeError } from './intake.js'
import { byteLength, cutToBytes } from './text.js'
import { SettingsError } from './plugin-settings.js'
import { authorOf } from './author.js'
import { CatalogError, fishballInstalledKey } from './plugin-catalog.js'
import { PackageError } from './fishball-packages.js'
import { diagnosticOf } from './errors.js'
import { digestOf } from './digest.js'

/** Audit key of an install request: a digest, never the raw spec. */
const SPEC_AUDIT_PREFIX = 'spec:'

export const PLUGIN_TOOL = Object.freeze({ list: 'list_plugins', set: 'set_plugin_enabled', add: 'add_plugin', remove: 'remove_plugin', getSettings: 'get_plugin_settings', setSettings: 'set_plugin_settings' })

/** Model-facing texts (stable; no secrets). */
const TEXT = Object.freeze({
  listDescription: 'List the plugins Fishball can use: each one\'s status (installed-in-fishball, dsh-enabled, dsh-disabled, builtin), the actions it offers, who last changed it, and why any of its tools are not available (hidden, plugin off, or unchecked).',
  setDescription: 'Turn one plugin on or off for Fishball only. Other sessions are not affected and the DSH profile is not changed. The change takes effect when your current turn ends. Turning on a plugin with tools nobody has checked asks the user first.',
  addDescription: 'Install a plugin package for Fishball only, after the user allows it in a permission prompt. It goes into Fishball\'s own package folder, not the DSH profile, so other sessions never see it; Fishball then turns it on for itself.',
  removeDescription: 'Uninstall a plugin installed in Fishball only (status installed-in-fishball), after the user allows it in a permission prompt. Plugins installed in DSH cannot be uninstalled from Fishball; turn them off instead. The uninstall happens when your current turn ends.',
  removeReasonArg: 'Why Fishball wants to uninstall this plugin, shown to the user in the permission prompt.',
  removesLater: 'Allowed. It is uninstalled when this turn ends.',
  /** You asked on the settings page; your own request, so it is not framed as untrusted. */
  installRequest: (spec) => [
    'Fishball: the user asked, on your settings page, to install this plugin for you only:',
    JSON.stringify(spec),
    'Call add_plugin with exactly this spec; the user is then asked to allow it in the permission prompt.',
  ].join('\n'),
  installRequestSummary: 'The user asked to install a plugin',
  removePrompt: (plugin, reason) => `Fishball asks to uninstall "${plugin}", a plugin installed for Fishball only. Reason: ${reason}`,
  pluginArg: 'The plugin key exactly as list_plugins shows it.',
  onArg: 'true to turn the plugin on for Fishball, false to turn it off.',
  specArg: 'One package spec: a registry name, an absolute path, a git address or a tarball URL.',
  reasonArg: 'Why Fishball needs this plugin, shown to the user in the permission prompt.',
  appliesLater: 'Saved. It takes effect when this turn ends.',
  addPrompt: (spec, reason) => `Fishball asks to install the plugin "${spec}" for Fishball only, in its own package folder; the DSH profile and other sessions are not changed. Reason: ${reason}`,
  getSettingsDescription: 'Read the settings of one plugin Fishball runs itself (built in, installed in Fishball only, or a DSH plugin that is off in DSH and on in Fishball): each field\'s path, kind, description, the plugin\'s own value and the current value. Secret fields show only whether they are set. A plugin on in DSH shares DSH\'s settings (shared: true); change those on DSH\'s Plugins page.',
  setSettingsDescription: 'Change settings of one plugin Fishball runs itself, after the user allows it in a permission prompt. Pass only the fields to change, as a nested object for one row (get_plugin_settings lists rows and fields). Secret fields cannot be set by Fishball. The change takes effect when your current turn ends.',
  rowArg: 'The row id exactly as get_plugin_settings shows it.',
  valuesArg: 'The fields to change, as a nested object, for example {"limit": 5}. Objects are merged; lists and other values replace.',
  settingsReasonArg: 'Why Fishball wants this change, shown to the user in the permission prompt.',
  settingsPrompt: (plugin, row, lines, reason) => [
    `Fishball asks to change settings of "${plugin}" (row ${row}) for Fishball only; other sessions and the DSH profile are not changed:`,
    ...lines,
    `Reason: ${reason}`,
  ].join('\n'),
  /** A field without a value, and a secret (never shown), in the prompt's `path: old → new` lines. */
  unsetValue: 'unset',
  secretValue: 'secret',
  uncheckedPrompt: (plugin, unchecked) => [
    `Fishball wants to turn on "${plugin}" for itself. Nobody has checked these tools yet; allowing shows them to Fishball:`,
    ...unchecked.map((tool) => `- ${tool.name}: ${tool.description}`),
  ].join('\n'),
})

const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const ok = (fields = {}) => ({ ok: true, ...fields })

/** A value in the settings prompt: JSON, cut to promptValueBytes (DESIGN §10d). */
const promptValue = (value) => cutToBytes(value === undefined ? TEXT.unsetValue : JSON.stringify(value), PLUGIN_MANAGER.promptValueBytes, SESSION_INFO.ellipsis)

/** The prompt's lines, one per changed field: `- path: old → new` (a secret never shows its values). */
const changeLines = (changes) => changes.map((change) => `- ${change.path.join('.')}: ${change.secret ? TEXT.secretValue : `${promptValue(change.old)} → ${promptValue(change.new)}`}`)
const refused = (code, fields = {}) => ({ ok: false, code, ...fields })


/**
 * "Install" on the settings page (DESIGN §10): DSH asks for a permission only inside a running
 * turn of the asking session, so the page cannot raise add_plugin's prompt itself. It hands the
 * request to Fishball through the intake ledger, which wakes it; Fishball calls add_plugin.
 * @param deps.ledger - IntakeLedger; deps.readLimits - () => limits; deps.packages - FishballPackages.
 * @returns (spec) => Promise; rejects IntakeError(tooLarge | queueFull) or PackageError(invalidSpec |
 *   alreadyInstalled). The spec is checked first, so an invalid one never wakes Fishball (review M3).
 */
export function installRequester({ ledger, readLimits, packages }) {
  return async (spec) => {
    packages.check(spec)
    // maxMessageBytes bounds your own text (the spec), as for "Send to Fishball"; Fishball's framing does not count.
    if (byteLength(spec) > readLimits().maxMessageBytes) throw new IntakeError(INTAKE_ERROR.tooLarge)
    const text = TEXT.installRequest(spec)
    await ledger.publish({
      kind: INTAKE_KIND.user,
      sourceIdentity: PLUGIN_INSTALL_REQUEST.sourceIdentity,
      dedupeKey: randomUUID(),
      message: createUserMessage({ content: [{ type: 'text', text }], source: { ...SOURCE.notice, summary: boundContextSummary(TEXT.installRequestSummary), author: authorOf(INTAKE_KIND.user) } }),
    })
  }
}

/**
 * Register the tools.
 * @param deps.register - (definition) => disposer, registering in scope P.
 * @param deps.catalog - PluginCatalog.
 * @param deps.composition - AssistantComposition (decisions()).
 * @param deps.tools - tools service; deps.scope - scope key P.
 * @param deps.approval - approval service; deps.packages - FishballPackages.
 * @param deps.settings - PluginSettings (src/plugin-settings.js).
 * @param deps.logger - plugin logger.
 */
export function registerPluginTools({ register, catalog, composition, tools, scope, approval, packages, settings, logger }) {
  /** Ask the user through DSH's normal prompt; only Allow once grants. */
  const ask = async (exec, toolName, reason) => {
    const outcome = await approval.request({ agent: exec.agent, toolName, callId: exec.callId, reason, signal: exec.signal })
    return outcome === APPROVAL_GRANTED
  }

  /**
   * Turn a plugin on for Fishball, asking about unchecked tools first (shared by set and add).
   * A package plugin (a DSH plugin off in the profile, or a Fishball-installed one) that is not
   * running yet is mounted for listing first; the listing
   * ends on EVERY path that does not turn it on, a thrown prompt included (review M3). A
   * plugin already running is not remounted (review M2): only its unchecked tools are asked.
   */
  const enable = async (plugin, exec, toolName) => {
    catalog.assertCanEnable(plugin)
    const listing = catalog.mountsPackage(plugin) && !catalog.isRunning(plugin)
    let turnedOn = false
    try {
      // Inside the try: a mount that throws still ends the listing (review N4).
      if (listing) {
        const failure = await catalog.mountForListing(plugin)
        if (failure !== undefined) return refused(failure)
      }
      const unchecked = catalog.uncheckedOf(plugin, tools, scope)
      if (unchecked.length > 0 && !(await ask(exec, toolName, TEXT.uncheckedPrompt(plugin, unchecked)))) {
        await catalog.audit(plugin, PLUGIN_ACTION.on, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
        return refused(PLUGIN_ERROR.rejected, { unchecked: unchecked.map((tool) => tool.name) })
      }
      // Turn on first: a refused setDesired (a racing toggle reached the limit) then stores no
      // allowance for a plugin that stays off (review N5).
      await catalog.setDesired(plugin, true, CHANGED_BY.fishball)
      turnedOn = true
      await catalog.allowTools(unchecked)
      return ok({ plugin, on: true, allowedTools: unchecked.map((tool) => tool.name), note: TEXT.appliesLater })
    } finally {
      // Turned on: the next apply (idle phase) ends the listing with the plugin mounted for real.
      if (listing && !turnedOn) await catalog.endListing(plugin)
    }
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
        if (!(await ask(exec, PLUGIN_TOOL.add, TEXT.addPrompt(spec, reason)))) {
          await catalog.audit(specKey, PLUGIN_ACTION.add, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
          return refused(PLUGIN_ERROR.rejected)
        }
        let name
        try {
          ({ name } = await packages.install(spec))
        } catch (error) {
          if (!(error instanceof PackageError)) throw error
          await catalog.audit(specKey, PLUGIN_ACTION.add, CHANGED_BY.fishball, error.code)
          return refused(PLUGIN_ERROR.installFailed, { reason: error.code })
        }
        const installed = fishballInstalledKey(name)
        await catalog.audit(installed, PLUGIN_ACTION.add, CHANGED_BY.fishball, OUTCOME_OK)
        await catalog.refresh()
        if (!catalog.has(installed)) return refused(PLUGIN_ERROR.restartRequired, { installed })
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
        if (!(await ask(exec, PLUGIN_TOOL.remove, TEXT.removePrompt(plugin, reason)))) {
          await catalog.audit(plugin, PLUGIN_ACTION.remove, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
          return refused(PLUGIN_ERROR.rejected)
        }
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
        if (!(await ask(exec, PLUGIN_TOOL.setSettings, TEXT.settingsPrompt(plugin, row, changeLines(preview.changes), reason)))) {
          await catalog.audit(plugin, PLUGIN_ACTION.settings, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
          return refused(PLUGIN_ERROR.rejected)
        }
        // Saved against the values stored now: a change you made while the prompt was open is
        // kept, and the saved config is checked again (a refusal now answers its code).
        const saved = await settings.save(plugin, row, { values }, { secrets: false }, CHANGED_BY.fishball)
        return ok({ plugin, row, changed: saved.changes.map((change) => change.path.join('.')), note: TEXT.appliesLater })
      }),
    })),
  ]
}
