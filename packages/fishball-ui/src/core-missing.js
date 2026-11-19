/**
 * fishball-ui without core (requirements 1.41 Q-G2 = A: "fishball-ui without core logs
 * `fishball-core-missing` and changes nothing"). fishball-ui's patch turns this row on, and every
 * other fishball-ui row off, exactly when `fishball-core` is not in this DSH (`cordis.patch.yml`); the
 * UI guard rows are core's patch's (R-FIX-FUI), so without core nothing else changes. So its one job is the one line, once per start of the row.
 * It is a package subpath row (`fishball-ui/core-missing`), not a path row, so DSH serves no
 * fishball-ui browser code for it: without core the DSH shows no Fishball UI at all.
 */
import { UI_SEAM } from 'fishball-shared/ui-seam'
import { UI_PLUGIN } from './constants.js'

export const name = UI_PLUGIN.coreMissingRow

export function apply(ctx) {
  ctx.logger(UI_PLUGIN.name).warn(UI_SEAM.coreMissing)
}
