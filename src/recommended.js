/**
 * Fishball's recommended plugins (DESIGN §10f, revision 12): a curated list shown on its
 * settings page, each entry with the state its package has in Fishball's catalog.
 *
 * The list is data. Every entry was installed through Fishball's own install route in a
 * throwaway sandbox on 2026-11-02 and ran for Fishball alone (spikes/rev12-recheck.mjs).
 * Left out, with the reasons in DESIGN §10f and §16 "Revision 12":
 * - your rule "1c" (a plugin that cannot run for Fishball alone): billion-context and
 *   dsh-handoff-compaction edit other rows; @xmanrui/dsh-im, dsh-plugin-weixin,
 *   @wsz987/dsh-channels, dsh-lark-bot and ReMe publish a service to the whole process;
 * - after the re-check: @openviking/dsh-memory-plugin 0.5.32 now publishes a service
 *   (leaks-service), and dsh-slack 0.4.7 requires DSH 0.2.1-rc.3 (incompatible-version).
 * Pet lists none: a Fishball-only plugin's browser part is never served (P10-S22).
 *
 * Install goes through the ordinary "Install for Fishball" dialog with the entry's spec, so the
 * list grants nothing: the dialog installs any spec you type, after your click (revision 10a).
 */
import { FISHBALL_INSTALLED_PREFIX, PLUGIN_KIND } from './constants.js'

/** Category keys, in display order (the highlighted ones first). The browser keeps the same keys. */
export const RECOMMENDED_CATEGORY = Object.freeze({ context: 'context', memory: 'memory', channel: 'channel', pet: 'pet' })

/** Categories shown highlighted: you said they significantly improve the experience. */
const HIGHLIGHTED = Object.freeze([RECOMMENDED_CATEGORY.context, RECOMMENDED_CATEGORY.memory])

/** An entry's state, from its package's place in Fishball's catalog (DESIGN §10f table). */
export const RECOMMENDED_STATE = Object.freeze({ install: 'install', installed: 'installed', dshOn: 'dsh-on', dshOff: 'dsh-off' })

const NPM_PAGE = 'https://www.npmjs.com/package/'

/** One npm entry: its spec is its package name, and its source is its npm page. */
const npm = (category, packageName) => Object.freeze({ category, packageName, spec: packageName, source: NPM_PAGE + packageName })

/** The list, in display order within each category. */
export const RECOMMENDED_PLUGINS = Object.freeze([
  npm(RECOMMENDED_CATEGORY.context, 'dsh-idle-compact'),
  npm(RECOMMENDED_CATEGORY.context, 'dsh-plugin-save-token'),
  npm(RECOMMENDED_CATEGORY.context, 'smart-compaction'),
  npm(RECOMMENDED_CATEGORY.memory, 'meow-memory'),
  npm(RECOMMENDED_CATEGORY.memory, '@a9i5k4/dsh-auto-memory'),
  npm(RECOMMENDED_CATEGORY.memory, '@zilliz/memsearch-dsh'),
  npm(RECOMMENDED_CATEGORY.channel, '@michengai/dsh-im-connect'),
  npm(RECOMMENDED_CATEGORY.channel, '@zaofan/dsh-qqbot'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-telegram-notify'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-plugin-discord'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-dingtalk-channel'),
])

/** Catalog kinds that are DSH plugins (installed in the profile, on or off there). */
const DSH_KINDS = new Set([PLUGIN_KIND.profile, PLUGIN_KIND.fishballOnly])

/**
 * The catalog entry an entry follows: the one installed for Fishball only wins over a DSH plugin
 * of the same package, because it is the one Fishball runs (DESIGN §10f).
 */
function catalogEntryOf(plugins, packageName) {
  return plugins.find((plugin) => plugin.plugin === FISHBALL_INSTALLED_PREFIX + packageName)
    ?? plugins.find((plugin) => DSH_KINDS.has(plugin.kind) && plugin.packageName === packageName)
}

function stateOf(entry) {
  if (entry === undefined) return RECOMMENDED_STATE.install
  if (entry.kind === PLUGIN_KIND.fishballInstalled) return RECOMMENDED_STATE.installed
  return entry.on ? RECOMMENDED_STATE.dshOn : RECOMMENDED_STATE.dshOff
}

/**
 * The list as the settings page shows it (snapshot field `recommended`).
 * @param catalog - the catalog snapshot (`{plugins}`), or null before the catalog exists.
 * @returns null without a catalog, else {highlighted, categories: [{category, plugins: [{packageName,
 *   spec, source, plugin, state, blocked}]}]}; `plugin` is the catalog key or null, `blocked` the
 *   catalog's reason or null.
 */
export function recommendedView(catalog) {
  if (catalog === null) return null
  return {
    highlighted: [...HIGHLIGHTED],
    categories: Object.values(RECOMMENDED_CATEGORY).map((category) => ({
      category,
      plugins: RECOMMENDED_PLUGINS.filter((item) => item.category === category).map((item) => {
        const entry = catalogEntryOf(catalog.plugins, item.packageName)
        return { packageName: item.packageName, spec: item.spec, source: item.source, plugin: entry?.plugin ?? null, state: stateOf(entry), blocked: entry?.blocked ?? null }
      }),
    })),
  }
}
