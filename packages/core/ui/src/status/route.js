/**
 * The sidebar targets' route (MULTI-3; first the status strip's, F-WIRE; design §5a.2; R-FB-03,
 * R-FB-04, R-FB-09, R-FB-10; K3a `ui.d.ts`). fishball-ui's Node row reads core's status service by
 * its seam name (`UI_STATUS.service`, never an import of core) and serves the drawn targets
 * (`targetsView`) to its browser half (`client.strip.js`) through fishball-ui's view stream
 * (src/stream.js). Each frame is `targetsView(snapshot, lang, tz)`; without the service it is
 * `fishball-off` (R-FB-10). `tz` is the browser's own time zone, for each target's pairing
 * last-seen time (R-FIX-FUI). No press goes through here: the sidebar's buttons call core's own
 * target routes (`SEAM_TARGETS.route`). The path keeps its old name: it is the same stream.
 *
 * The Fishball page reads the same view as the `strip` topic of core's one page stream
 * (`SEAM_PAGE_STREAM`, `stripTopic`), so it holds no connection of its own; the route stays for
 * readers outside the page.
 */
import { UI_STATUS } from 'fishball-shared/ui-seam'
import { VIEW_STREAM, queryKey, registerViewStream } from '../stream.js'
import { STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'
import { targetsView } from './index.js'

export const STRIP_ROUTE = Object.freeze({
  ...VIEW_STREAM,
  path: '/api/fishball/strip',
  langParameter: 'lang',
  zoneParameter: 'tz',
})

/** The service's snapshot reader (`statusOf`'s rule, restated: no import of core). */
const sourceOf = (service) => (typeof service?.snapshot === 'function'
  ? { read: () => service.snapshot(), onChange: typeof service.onChange === 'function' ? (fn) => service.onChange(fn) : undefined }
  : undefined)

/** The reader's time zone, as the browser sent it; absent reads as the process's own (pairingView). */
const zoneOf = (url) => new URL(url).searchParams.get(STRIP_ROUTE.zoneParameter) ?? undefined

/** The drawn view for one reader's URL (its `lang` and `tz`); the route and the topic share it. */
const stripFrame = (snapshot, url) => targetsView(snapshot, queryKey(url, STRIP_ROUTE.langParameter, STATUS_TEXT, STATUS_DEFAULT_LANG), zoneOf(url))

/**
 * @param {object} ctx fishball-ui's row context (`get`, `on`, `connection`)
 * @returns {() => void} withdraws the route and closes every open stream
 */
export function registerStripRoute(ctx) {
  return registerViewStream(ctx, {
    path: STRIP_ROUTE.path,
    service: UI_STATUS.service,
    source: sourceOf,
    frame: stripFrame,
  })
}

/**
 * The strip view as a topic of core's page stream (`fishballInstance.page.register`): the frame for
 * the stream's URL, and a change whenever the status service changes or arrives, is replaced or
 * leaves (as the route follows it).
 * @param {object} ctx fishball-ui's row context (`get`, `on`)
 * @returns {{frame(url: string): object, onChange(fn: () => void): () => void}}
 */
export function stripTopic(ctx) {
  const read = () => sourceOf(ctx.get(UI_STATUS.service))
  return Object.freeze({
    frame: (url) => stripFrame(read()?.read(), url),
    onChange(fn) {
      const follow = () => read()?.onChange?.(fn) ?? (() => {})
      let off = follow()
      const offService = ctx.on(VIEW_STREAM.serviceEvent, (name) => {
        if (name !== UI_STATUS.service) return
        off()
        off = follow()
        fn()
      })
      return () => { off(); offService() }
    },
  })
}
