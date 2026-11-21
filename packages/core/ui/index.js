/**
 * fishball-ui's Node row (requirements 1.38 Q-N2; R-FB-14). fishball-ui's patch turns it on only
 * beside core (`cordis.patch.yml`). It provides `UI_GUARDS.service`, fishball-ui's presence: core's
 * guard check reports the UI guard rows of core's patch only while it is there (R-FB-09; R-FIX-FUI).
 * It serves the sidebar's DSH targets drawn from core's status service (src/status/route.js; MULTI-3:
 * each target's pairing is drawn there too, so the R-FIX-FUI pairing routes are gone with core's scalar
 * `ui.pairing`). Its browser half is client.js. It reads core only through core's published routes and services by the names in
 * `fishball-shared/ui-seam`, never through an import (Q-G2), and depends on no DSH-side package
 * (R-ARCH-10). fishball-page's `api/fishball/session` is core's own route (fishball-core
 * `src/session/route.js`, since I-HOST), in a hosted child and a standalone DSH alike.
 */
import { followInstance } from 'fishball-shared/instance-follower'
import { SEAM_PAGE_STREAM, UI_GUARDS, UI_INSTANCE } from 'fishball-shared/ui-seam'
import { UI_PLUGIN } from './src/constants.js'
import { VIEW_STREAM } from './src/stream.js'
import { registerStripRoute, stripTopic } from './src/status/route.js'

export const name = UI_PLUGIN.name
/** The routes need DSH's connection channel (its owner-only exact Fetch routes). */
export const inject = ['connection']

export function apply(ctx) {
  // A marker with nothing to read: the rows are core's patch's (R-FIX-FUI).
  ctx.provide(UI_GUARDS.service, Object.freeze({}))
  ctx.effect(() => registerStripRoute(ctx), UI_PLUGIN.name + ': targets route')
  // The page reads the strip view as a topic of core's one page stream (SEAM_PAGE_STREAM).
  const instance = Object.freeze({ service: UI_INSTANCE.service, apiVersion: SEAM_PAGE_STREAM.apiVersion, serviceEvent: VIEW_STREAM.serviceEvent })
  followInstance(ctx, instance, (bound) => bound[SEAM_PAGE_STREAM.member].register(SEAM_PAGE_STREAM.topic.strip, stripTopic(ctx)))
}
