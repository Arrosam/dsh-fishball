/**
 * The status strip's route (F-WIRE; design §5a.2, §6.3a step 1; R-FB-03, R-FB-04, R-FB-09, R-FB-10;
 * K3a `ui.d.ts`). fishball-ui's Node row reads core's status service by its seam name
 * (`UI_STATUS.service`, never an import of core) and serves the drawn strip (`stripView`) to its
 * browser half (`client.strip.js`) through fishball-ui's view stream (src/stream.js). Each frame is
 * `stripView(snapshot, lang)`; without the service it is `fishball-off` (R-FB-10). The strip's
 * buttons call core's own Connect routes; no press goes through here.
 */
import { UI_STATUS } from 'fishball-shared/ui-seam'
import { VIEW_STREAM, queryKey, registerViewStream } from '../stream.js'
import { STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'
import { stripView } from './index.js'

export const STRIP_ROUTE = Object.freeze({
  ...VIEW_STREAM,
  path: '/api/fishball/strip',
  langParameter: 'lang',
})

/** The service's snapshot reader (`statusOf`'s rule, restated: no import of core). */
const sourceOf = (service) => (typeof service?.snapshot === 'function'
  ? { read: () => service.snapshot(), onChange: typeof service.onChange === 'function' ? (fn) => service.onChange(fn) : undefined }
  : undefined)

/**
 * @param {object} ctx fishball-ui's row context (`get`, `on`, `connection`)
 * @returns {() => void} withdraws the route and closes every open stream
 */
export function registerStripRoute(ctx) {
  return registerViewStream(ctx, {
    path: STRIP_ROUTE.path,
    service: UI_STATUS.service,
    source: sourceOf,
    frame: (snapshot, url) => stripView(snapshot, queryKey(url, STRIP_ROUTE.langParameter, STATUS_TEXT, STATUS_DEFAULT_LANG)),
  })
}
