/**
 * Fishball's plugin tools (DESIGN §4 "Who changes what"): list_plugins, set_plugin_enabled,
 * add_plugin. They are registered in scope P, so only Fishball has them.
 *
 * - set_plugin_enabled changes Fishball's own state only; the change applies when the
 *   current turn ends (the catalog applies it in the idle phase).
 * - Turning on a plugin with tools nobody has checked raises a normal DSH permission
 *   request listing them (N4). A Fishball-only plugin is mounted first, with its tools
 *   masked, so they can be listed. Reject changes nothing and unmounts it again.
 * - add_plugin installs only after you click Allow once (N3), with its bundle left off in
 *   the profile, then turns it on for Fishball through the same path.
 *
 * A plugin that registers its tools lazily (browser-skill reveals bsk_* on first use) has no
 * tools to list when it is turned on; they appear later as unchecked and are allowed the same
 * way, by asking for the plugin again (set_plugin_enabled on), which then lists them.
 *
 * Results are structured JSON with stable codes; nothing here writes the profile's
 * package.json or cordis.patch.yml except DSH's own installer in add_plugin.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { APPROVAL_GRANTED, CHANGED_BY, PLUGIN_ACTION, PLUGIN_ERROR, PLUGIN_KIND } from './constants.js'
import { CatalogError } from './plugin-catalog.js'
import { diagnosticOf } from './errors.js'
import { digestOf } from './digest.js'

/** Audit key of an install request: a digest, never the raw spec. */
const SPEC_AUDIT_PREFIX = 'spec:'

export const PLUGIN_TOOL = Object.freeze({ list: 'list_plugins', set: 'set_plugin_enabled', add: 'add_plugin' })

/** Model-facing texts (stable; no secrets). */
const TEXT = Object.freeze({
  listDescription: 'List the plugins Fishball can use, with each one\'s Fishball-only on/off state, who last changed it, and why any of its tools are not available (hidden, plugin off, or unchecked).',
  setDescription: 'Turn one plugin on or off for Fishball only. Other sessions are not affected and the profile is not changed. The change takes effect when your current turn ends. Turning on a plugin with tools nobody has checked asks the user first.',
  addDescription: 'Install a plugin package into the profile for Fishball, after the user allows it in a permission prompt. Its bundle stays off for other sessions; Fishball then turns it on for itself.',
  pluginArg: 'The plugin key exactly as list_plugins shows it.',
  onArg: 'true to turn the plugin on for Fishball, false to turn it off.',
  specArg: 'One package spec: a registry name, an absolute path, a git address or a tarball URL.',
  reasonArg: 'Why Fishball needs this plugin, shown to the user in the permission prompt.',
  appliesLater: 'Saved. It takes effect when this turn ends.',
  addPrompt: (spec, reason) => `Fishball asks to install the plugin "${spec}" into this profile, with its bundle off for other sessions. Reason: ${reason}`,
  uncheckedPrompt: (plugin, unchecked) => [
    `Fishball wants to turn on "${plugin}" for itself. Nobody has checked these tools yet; allowing shows them to Fishball:`,
    ...unchecked.map((tool) => `- ${tool.name}: ${tool.description}`),
  ].join('\n'),
})

const JSON_OUTPUT = Object.freeze({ schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const ok = (fields = {}) => ({ ok: true, ...fields })
const refused = (code, fields = {}) => ({ ok: false, code, ...fields })

/**
 * Register the tools.
 * @param deps.register - (definition) => disposer, registering in scope P.
 * @param deps.catalog - PluginCatalog.
 * @param deps.composition - AssistantComposition (decisions()).
 * @param deps.tools - tools service; deps.scope - scope key P.
 * @param deps.approval - approval service; deps.pluginManager - plugin manager.
 * @param deps.logger - plugin logger.
 */
export function registerPluginTools({ register, catalog, composition, tools, scope, approval, pluginManager, logger }) {
  /** Ask the user through DSH's normal prompt; only Allow once grants. */
  const ask = async (exec, toolName, reason) => {
    const outcome = await approval.request({ agent: exec.agent, toolName, callId: exec.callId, reason, signal: exec.signal })
    return outcome === APPROVAL_GRANTED
  }

  /**
   * Turn a plugin on for Fishball, asking about unchecked tools first (shared by set and add).
   * A Fishball-only plugin that is not running yet is mounted for listing first; the listing
   * ends on EVERY path that does not turn it on, a thrown prompt included (review M3). A
   * plugin already running is not remounted (review M2): only its unchecked tools are asked.
   */
  const enable = async (plugin, exec, toolName) => {
    catalog.assertCanEnable(plugin)
    const listing = catalog.kindOf(plugin) === PLUGIN_KIND.fishballOnly && !catalog.isRunning(plugin)
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

  /** Run a tool body; a CatalogError becomes a refusal with its code. */
  const guarded = (body) => async (args, exec) => {
    try {
      return await body(args, exec)
    } catch (error) {
      if (error instanceof CatalogError) return refused(error.code)
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
        await catalog.refresh()
        if (!catalog.has(plugin)) return refused(PLUGIN_ERROR.unknownPlugin)
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
        if (spec.trim().length === 0) return refused(PLUGIN_ERROR.installFailed)
        // The audit stores a digest of the spec, never the spec: a git or tarball URL can carry
        // credentials, and DESIGN §11 stores no secrets (review M10).
        const specKey = SPEC_AUDIT_PREFIX + digestOf(spec)
        if (!(await ask(exec, PLUGIN_TOOL.add, TEXT.addPrompt(spec, reason)))) {
          await catalog.audit(specKey, PLUGIN_ACTION.add, CHANGED_BY.fishball, PLUGIN_ERROR.rejected)
          return refused(PLUGIN_ERROR.rejected)
        }
        const result = await pluginManager.installBundle(spec, { enabled: false })
        const installed = result.bundle
        if (result.error !== undefined || installed === undefined) {
          const code = result.error?.code ?? PLUGIN_ERROR.installFailed
          await catalog.audit(specKey, PLUGIN_ACTION.add, CHANGED_BY.fishball, code)
          return refused(PLUGIN_ERROR.installFailed, { reason: code })
        }
        await catalog.audit(installed, PLUGIN_ACTION.add, CHANGED_BY.fishball, result.application)
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
  ]
}
