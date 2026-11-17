/**
 * fishball-ui's Node row (requirements 1.38 Q-N2; R-FB-14). fishball-ui's patch turns it on only
 * beside core (`cordis.patch.yml`). It provides `UI_GUARDS.service`, fishball-ui's presence: core's
 * guard check reports the UI guard rows of core's patch only while it is there (R-FB-09; R-FIX-FUI).
 * It serves the status strip drawn from core's status service (src/status/route.js, F-WIRE) and the
 * pairing card drawn from core's `ui.pairing` (src/pairing/route.js, R-FIX-FUI). Its browser half is
 * client.js. It reads core only through core's published routes and services by the names in
 * `fishball-shared/ui-seam`, never through an import (Q-G2), and depends on no DSH-side package
 * (R-ARCH-10). fishball-page's `api/fishball/session` is core's own route (fishball-core
 * `src/session/route.js`, since I-HOST), in a hosted child and a standalone DSH alike.
 */
import { UI_GUARDS } from 'fishball-shared/ui-seam'
import { UI_PLUGIN } from './src/constants.js'
import { registerPairingRoutes } from './src/pairing/route.js'
import { registerStripRoute } from './src/status/route.js'

export const name = UI_PLUGIN.name
/** The routes need DSH's connection channel (its owner-only exact Fetch routes). */
export const inject = ['connection']

export function apply(ctx) {
  // A marker with nothing to read: the rows are core's patch's (R-FIX-FUI).
  ctx.provide(UI_GUARDS.service, Object.freeze({}))
  ctx.effect(() => registerStripRoute(ctx), UI_PLUGIN.name + ': status strip route')
  ctx.effect(() => registerPairingRoutes(ctx), UI_PLUGIN.name + ': pairing routes')
}
