/**
 * fishball-ui's Node row (requirements 1.38 Q-N2; R-FB-14). fishball-ui's patch turns it on only
 * beside core (`cordis.patch.yml`). It serves the sidebar's DSH targets and their pairing status
 * from core's status service (src/status/route.js). Its browser half is client.js. It reads core
 * only through published routes and services by the names in
 * `fishball-shared/ui-seam`, never through an import (Q-G2), and depends on no DSH-side package
 * (R-ARCH-10). fishball-page's `api/fishball/session` is core's own route (fishball-core
 * `src/session/route.js`, since I-HOST), in a hosted child and a standalone DSH alike.
 */
import { followInstance } from 'fishball-shared/instance-follower'
import { SEAM_PAGE_STREAM, UI_INSTANCE } from 'fishball-shared/ui-seam'
import { UI_PLUGIN } from './src/constants.js'
import { VIEW_STREAM } from './src/stream.js'
import { registerStripRoute, stripTopic } from './src/status/route.js'

export const name = UI_PLUGIN.name
/** The routes need DSH's connection channel (its owner-only exact Fetch routes). */
export const inject = ['connection']

export function apply(ctx) {
  ctx.effect(() => registerStripRoute(ctx), UI_PLUGIN.name + ': targets route')
  // The page reads the strip view as a topic of core's one page stream (SEAM_PAGE_STREAM).
  const instance = Object.freeze({ service: UI_INSTANCE.service, apiVersion: SEAM_PAGE_STREAM.apiVersion, serviceEvent: VIEW_STREAM.serviceEvent })
  followInstance(ctx, instance, (bound) => bound[SEAM_PAGE_STREAM.member].register(SEAM_PAGE_STREAM.topic.strip, stripTopic(ctx)))
}
