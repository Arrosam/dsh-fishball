/**
 * The status strip's route (F-WIRE; design §5a.2, §6.3a step 1; R-FB-03, R-FB-04, R-FB-09, R-FB-10;
 * K3a `ui.d.ts`). fishball-ui's Node row reads core's status service by its seam name
 * (`UI_STATUS.service`, never an import of core) and serves the drawn strip (`stripView`) to its
 * browser half (`client.strip.js`): one owner-only SSE stream on DSH's authenticated exact-route
 * channel. Each frame is `stripView(snapshot, lang)`: the first at once, then one per change of
 * core's snapshot, and one when the service itself arrives, is replaced or leaves (then
 * `fishball-off`, R-FB-10). The strip's buttons call core's own Connect routes; no press goes
 * through here.
 */
import { UI_STATUS } from 'fishball-shared/ui-seam'
import { STATUS_DEFAULT_LANG, STATUS_TEXT } from './text.js'
import { stripView } from './index.js'

export const STRIP_ROUTE = Object.freeze({
  path: '/api/fishball/strip',
  method: 'GET',
  requestBody: 'buffered',
  langParameter: 'lang',
  ok: 200,
  headers: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  frame: (json) => `data: ${json}\n\n`,
  /** Cordis's event for a service provided, replaced or withdrawn (both SDKs), with its name. */
  serviceEvent: 'internal/service',
  abort: 'abort',
})

/** The service's snapshot, or `fishball-off` without one (`statusOf`'s rule, restated: no import of core). */
const snapshotOf = (service) => (typeof service?.snapshot === 'function' ? service.snapshot() : undefined)
/** `en` or `zh` from the request; anything else draws the default. */
const langOf = (url) => {
  const lang = new URL(url).searchParams.get(STRIP_ROUTE.langParameter)
  return Object.hasOwn(STATUS_TEXT, lang) ? lang : STATUS_DEFAULT_LANG
}

/**
 * @param {object} ctx fishball-ui's row context (`get`, `on`, `connection`)
 * @returns {() => void} withdraws the route and closes every open stream
 */
export function registerStripRoute(ctx) {
  const streams = new Set()

  function stream(request) {
    const lang = langOf(request.url)
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        let offSnapshot = () => {}
        let last
        const push = () => {
          const json = JSON.stringify(stripView(snapshotOf(ctx.get(UI_STATUS.service)), lang))
          if (json === last) return
          last = json
          try { controller.enqueue(encoder.encode(STRIP_ROUTE.frame(json))) } catch { close() }
        }
        const follow = () => {
          offSnapshot()
          const service = ctx.get(UI_STATUS.service)
          offSnapshot = typeof service?.onChange === 'function' ? service.onChange(push) : () => {}
          push()
        }
        const offService = ctx.on(STRIP_ROUTE.serviceEvent, (name) => { if (name === UI_STATUS.service) follow() })
        close = () => {
          if (!streams.delete(close)) return
          offSnapshot()
          offService()
          request.signal?.removeEventListener(STRIP_ROUTE.abort, close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal?.addEventListener(STRIP_ROUTE.abort, close)
        follow()
      },
      cancel: () => close(),
    })
    return new Response(body, { status: STRIP_ROUTE.ok, headers: STRIP_ROUTE.headers })
  }

  const withdraw = ctx.connection.fetch.register({ path: STRIP_ROUTE.path, methods: [STRIP_ROUTE.method], requestBody: STRIP_ROUTE.requestBody, fetch: stream })
  return () => {
    for (const close of [...streams]) close()
    return withdraw?.()
  }
}
