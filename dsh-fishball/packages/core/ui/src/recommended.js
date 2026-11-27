/**
 * Fishball's recommended plugins (DESIGN §10f, revision 12): a curated list. In V2 its only reader
 * is the Fishball Recommended tab (below); the older per-entry catalog state view
 * (recommendedView) and the admin relay's ADMIN_RECOMMENDED copy were removed as dead code.
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
 * The list grants nothing: an entry is installed through DSH's own Plugins page install dialog,
 * after your click, as any spec you type would be. Its reader is the Fishball Recommended tab
 * (fishball-recommend-plugins, fishball-ui's since F-UI), which reads it through recommendedList()
 * and is on only in a standalone Fishball (DESIGN §28: an instance-run child installs nothing
 * itself; dsh-instance shows its own copy of the list in the main DSH).
 */

/** Category keys, in display order (the highlighted ones first). The browser keeps the same keys. */
export const RECOMMENDED_CATEGORY = Object.freeze({ context: 'context', memory: 'memory', channel: 'channel', pet: 'pet' })

/** Categories shown highlighted: you said they significantly improve the experience. */
const HIGHLIGHTED = Object.freeze([RECOMMENDED_CATEGORY.context, RECOMMENDED_CATEGORY.memory])

const NPM_PAGE = 'https://www.npmjs.com/package/'

/** The optional note metadata of an entry, as an object to spread: empty when there is no note. */
const noteOf = (item) => (item.noteKey === undefined ? {} : { noteKey: item.noteKey })

/**
 * One npm entry: its spec is its package name, and its source is its npm page.
 * `options.noteKey` (optional) names a message-dictionary key for a note shown under the entry
 * (task B6). The key is data only: the dictionaries and its drawing belong to the
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

/** The list grouped by category in display order, each item mapped by `mapItem`. */
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
