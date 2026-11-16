/**
 * fishball-ui's own values (requirements 1.38 Q-N2; R-FB-14). The seam words it shares with core
 * are `fishball-shared/ui-seam`'s, never here: fishball-ui imports nothing of core (Q-G2).
 * - `name`: the fishball-ui row's id and Cordis plugin name, and its logger's name;
 * - `coreMissingRow`: the id and plugin name of the row that logs without core (src/core-missing.js);
 * - `patchFile`: fishball-ui's own bundle patch, relative to this folder (`src/`), the one definition
 *   of its UI guard rows; `diagnostic` is dsh-app-boot's error prefix when it is malformed.
 */
export const UI_PLUGIN = Object.freeze({
  name: 'fishball-ui',
  coreMissingRow: 'fishball-ui-core-missing',
  patchFile: '../cordis.patch.yml',
  diagnostic: 'fishball-ui',
})
