/**
 * fishball-ui's own values (requirements 1.38 Q-N2; R-FB-14). The seam words it shares with core
 * are `fishball-shared/ui-seam`'s, never here: fishball-ui imports nothing of core (Q-G2).
 * - `name`: the fishball-ui row's id and Cordis plugin name, and its logger's name;
 * - `coreMissingRow`: the id and plugin name of the row that logs without core (src/core-missing.js).
 */
export const UI_PLUGIN = Object.freeze({
  name: 'fishball-ui',
  coreMissingRow: 'fishball-ui-core-missing',
})
