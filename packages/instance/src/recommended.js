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
 *   (leaks-service), and dsh-slack 0.4.7 requires DSH 0.2.1-rc.3 (incompatible-version);
 * - your answer after the re-check: @zaofan/dsh-qqbot wrote a folder into DSH's working directory
 *   while it ran for Fishball, which promises never to write local files (QQ stays reachable
 *   through @michengai/dsh-im-connect).
 * Pet lists none (P10-S22).
 *
 * Install goes through the ordinary "Install for Fishball" dialog with the entry's spec, so the
 * list grants nothing: the dialog installs any spec you type, after your click (revision 10a).
 * In V2 the child's Fishball Recommended tab (child-web/fishball-recommend-plugins) reads the same
 * list through recommendedList() and installs through DSH's own Plugins page dialog instead.
 */

// PLUGIN_KIND and FISHBALL_INSTALLED_PREFIX moved here from the main row's src/constants.js
// (M1): this module is their only reader, and the instance package cannot import that file.
/** Where a catalog plugin runs (DESIGN §4 "Plugin states"). */
export const PLUGIN_KIND = Object.freeze({
  /** Enabled in the profile: runs for every session; Fishball can only mask it. */
  profile: 'profile',
  /** Installed but off in the profile: runs in Fishball's private tree when on. */
  fishballOnly: 'fishball-only',
  /** A DSH capability package Fishball mounts in its private tree when on. */
  builtin: 'builtin',
  /**
   * Installed by Fishball for itself alone, in its own package folder (src/fishball-packages.js),
   * never in the DSH profile; runs in its private tree when on. A package of the same name may
   * also be a DSH plugin: the two are separate catalog entries.
   */
  fishballInstalled: 'fishball-installed',
})

/**
 * Catalog key prefix of a Fishball-installed plugin (DESIGN §4): its key is this plus the package
 * name, so it never collides with a DSH plugin of the same name (whose key is the bare name).
 */
export const FISHBALL_INSTALLED_PREFIX = 'fishball:'

/** Category keys, in display order (the highlighted ones first). The browser keeps the same keys. */
export const RECOMMENDED_CATEGORY = Object.freeze({ context: 'context', memory: 'memory', channel: 'channel', pet: 'pet' })

/** Categories shown highlighted: you said they significantly improve the experience. */
const HIGHLIGHTED = Object.freeze([RECOMMENDED_CATEGORY.context, RECOMMENDED_CATEGORY.memory])

/** An entry's state, from its package's place in Fishball's catalog (DESIGN §10f table). */
export const RECOMMENDED_STATE = Object.freeze({ install: 'install', installed: 'installed', dshOn: 'dsh-on', dshOff: 'dsh-off' })

const NPM_PAGE = 'https://www.npmjs.com/package/'

/** The optional note metadata of an entry, as an object to spread: empty when there is no note. */
const noteOf = (item) => (item.noteKey === undefined ? {} : { noteKey: item.noteKey })

/**
 * One npm entry: its spec is its package name, and its source is its npm page.
 * `options.noteKey` (optional) names a message-dictionary key for a note shown under the entry
 * (board design §7, task B6). The key is data only: the dictionaries and its drawing belong to the
 * presentation owner (RP), so an entry without it keeps exactly its earlier shape.
 */
const npm = (category, packageName, options = {}) => Object.freeze({
  category, packageName, spec: packageName, source: NPM_PAGE + packageName, ...noteOf(options),
})

/** The list, in display order within each category. */
export const RECOMMENDED_PLUGINS = Object.freeze([
  npm(RECOMMENDED_CATEGORY.context, 'dsh-idle-compact'),
  npm(RECOMMENDED_CATEGORY.context, 'dsh-plugin-save-token'),
  npm(RECOMMENDED_CATEGORY.context, 'smart-compaction'),
  npm(RECOMMENDED_CATEGORY.memory, 'meow-memory', { noteKey: 'settings.recommendedNote.meowMemory' }),
  npm(RECOMMENDED_CATEGORY.memory, '@a9i5k4/dsh-auto-memory'),
  npm(RECOMMENDED_CATEGORY.memory, '@zilliz/memsearch-dsh'),
  npm(RECOMMENDED_CATEGORY.channel, '@michengai/dsh-im-connect'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-telegram-notify'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-plugin-discord'),
  npm(RECOMMENDED_CATEGORY.channel, 'dsh-dingtalk-channel'),
])

/** The fields every reader shows for an entry, before its own state and its optional note. */
const identityOf = (item) => ({ packageName: item.packageName, spec: item.spec, source: item.source })

/**
 * The list grouped by category in display order, each item mapped by `mapItem`: the one grouping
 * rule for every view of the list, so the child's Fishball Recommended tab (recommendedList) and
 * the older catalog view (recommendedView) never order or group differently. recommendedView has
 * no caller left in this repository since the M1 split (the admin relay reads ADMIN_RECOMMENDED);
 * deleting it is outside the RP increment, which only shares this rule with it.
 */
function grouped(mapItem) {
  return {
    highlighted: [...HIGHLIGHTED],
    categories: Object.values(RECOMMENDED_CATEGORY).map((category) => ({
      category,
      plugins: RECOMMENDED_PLUGINS.filter((item) => item.category === category).map(mapItem),
    })),
  }
}

/**
 * The fixed list as the child's Fishball Recommended tab reads it (V2 RP). It carries no catalog
 * state: the tab decides Install/Installed from the child's own native bundle inventory.
 * @returns {{highlighted: string[], categories: {category: string, plugins: {packageName: string,
 *   spec: string, source: string, noteKey?: string}[]}[]}} a fresh JSON-safe copy.
 */
export function recommendedList() {
  return grouped((item) => ({ ...identityOf(item), ...noteOf(item) }))
}

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
 *   spec, source, plugin, state, blocked, noteKey?}]}]}; `plugin` is the catalog key or null, `blocked` the
 *   catalog's reason or null, and `noteKey` is present only on an entry that has a note.
 */
export function recommendedView(catalog) {
  if (catalog === null) return null
  return grouped((item) => {
    const entry = catalogEntryOf(catalog.plugins, item.packageName)
    return { ...identityOf(item), plugin: entry?.plugin ?? null, state: stateOf(entry), blocked: entry?.blocked ?? null, ...noteOf(item) }
  })
}
