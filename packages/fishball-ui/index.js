/**
 * fishball-ui's Node row (requirements 1.38 Q-N2; R-FB-14). fishball-ui's patch turns it on only
 * beside core (`cordis.patch.yml`). It provides `UI_GUARDS.service` `{rows}`, the UI guard rows of
 * fishball-ui's patch, so core's guard check also reports them (R-FB-09). Its browser half is
 * client.js. It reads core only through core's published routes and `fishball-shared/ui-seam`,
 * never through an import (Q-G2), and depends on no DSH-side package (R-ARCH-10). One route is not
 * core's yet: fishball-page's `api/fishball/session` is served by the V2 hosted child
 * (dsh-instance's session-route.js) until core publishes the manager-session route.
 */
import { UI_GUARDS } from 'fishball-shared/ui-seam'
import { UI_PLUGIN } from './src/constants.js'
import { readUiGuardRows } from './src/guards.js'

export const name = UI_PLUGIN.name

export function apply(ctx) {
  ctx.provide(UI_GUARDS.service, Object.freeze({ rows: readUiGuardRows() }))
}
