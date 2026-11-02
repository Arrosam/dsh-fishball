/**
 * Which DSH plugins keep the old default for Fishball (DESIGN §4 "On at first start").
 *
 * Rule (owner's decision, 2026-10-25): every DSH plugin starts OFF in Fishball, except on a
 * Fishball install that existed before this rule: there, the DSH plugins present when this
 * version first started keep the default they had (on when enabled in the DSH profile, off
 * otherwise; a stored choice still wins). Nothing is migrated or turned off.
 * - "Existing install": Fishball's session had already been created when this version first
 *   started. Decided once, at that start, and stored.
 * - The baseline is the DSH plugins that were on for Fishball by default then: those enabled
 *   in the DSH profile. One installed but off in the profile was off in Fishball, so it is not
 *   in the baseline and stays off if you later enable it in DSH (review H1). It is taken from
 *   the first successful bundle listing, which boot runs right after begin(); if that listing
 *   fails, from the next one that works. A new install's baseline is empty.
 * - A DSH plugin that leaves the profile leaves the baseline, and its stored choice is
 *   forgotten (src/plugin-catalog.js), so installing it again counts as new: off.
 *
 * Stored in domain `fishball`, table plugin_defaults (one record), so the decision survives
 * restarts. Built-ins and Fishball-installed plugins are not covered: built-ins keep their own
 * defaults (src/builtins.js) and a Fishball-installed plugin starts off.
 */
import { PLUGIN_DEFAULTS } from './constants.js'

export class PluginDefaults {
  #store

  /** @param store - Store (pluginDefaults table). */
  constructor(store) {
    this.#store = store
  }

  #record() {
    return this.#store.pluginDefaults.get(PLUGIN_DEFAULTS.recordKey)
  }

  /**
   * Record, once, whether this is an existing install. Later starts change nothing.
   * @param existingInstall - whether Fishball's session already exists at this start.
   */
  async begin(existingInstall) {
    if (this.#record() !== undefined) return
    await this.#store.pluginDefaults.put(PLUGIN_DEFAULTS.recordKey, { existingInstall, dshPlugins: null, recordedAt: new Date().toISOString() })
  }

  /**
   * Follow a successful listing of the DSH plugins: take the baseline the first time, then drop
   * plugins that are no longer installed (installed again, they count as new).
   * @param present - Set of the catalog keys of every DSH plugin listed now.
   * @param enabled - the subset enabled in the DSH profile now (the baseline, the first time).
   */
  async observe(present, enabled) {
    const record = this.#record()
    if (record === undefined) return
    if (record.dshPlugins === null) {
      await this.#save({ ...record, dshPlugins: record.existingInstall ? [...enabled].sort() : [] })
      return
    }
    if (record.dshPlugins.some((key) => !present.has(key))) await this.#save({ ...record, dshPlugins: record.dshPlugins.filter((key) => present.has(key)) })
  }

  /** Whether a DSH plugin keeps the old default (it was present when this version first started on an existing install). */
  keepsOldDefault(key) {
    return this.#record()?.dshPlugins?.includes(key) === true
  }

  #save(record) {
    return this.#store.pluginDefaults.put(PLUGIN_DEFAULTS.recordKey, record)
  }
}
