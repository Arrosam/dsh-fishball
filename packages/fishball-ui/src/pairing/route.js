/**
 * The pairing card's routes (R-FIX-FUI; R-ID-07; K3a `ui.d.ts` `FishballUi.pairing`). fishball-ui's
 * Node row reads core's `fishballInstance.ui.pairing` by its seam names (`UI_INSTANCE`, `UI_SEAM.member`;
 * never an import of core), looked up per request and per service change, so a replaced or withdrawn
 * core is followed:
 * - `GET /api/fishball/pairing?lang=&tz=`: the view stream (src/stream.js), each frame
 *   `pairingView(state, lang, tz)`; without core, a view with no lines;
 * - `POST /api/fishball/pairing/choose` `{choice, confirmed}`: core's `choose(choice, {confirmed})`,
 *   answered as it is (`{ok: true}` or core's refusal). Core alone decides what a choice may do: a
 *   choice it does not offer, or Continue without the confirmation, is its refusal, not this route's.
 * Both routes are owner-only (DSH's authenticated exact-route channel), as the strip's.
 */
import { UI_INSTANCE, UI_SEAM } from 'fishball-shared/ui-seam'
import { VIEW_STREAM, queryKey, registerViewStream } from '../stream.js'
import { PAIRING_DEFAULT_LANG, PAIRING_TEXT, pairingView } from './index.js'

export const PAIRING_ROUTE = Object.freeze({
  path: '/api/fishball/pairing',
  choosePath: '/api/fishball/pairing/choose',
  langParameter: 'lang',
  zoneParameter: 'tz',
  post: 'POST',
  ok: 200,
  badRequest: 400,
  unavailable: 503,
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  /** This route's own refusals; core's own (`not-offered`, `not-confirmed`, `not-saved`) pass through. */
  code: Object.freeze({ invalidArguments: 'invalid-arguments', unavailable: 'pairing-unavailable' }),
})

/** Core's `ui.pairing`, or undefined when the service is absent or not the drawn version. */
function pairingOf(service) {
  const pairing = service?.apiVersion === UI_INSTANCE.apiVersion ? service[UI_SEAM.member]?.pairing : undefined
  return typeof pairing?.state === 'function' && typeof pairing.onChange === 'function' && typeof pairing.choose === 'function' ? pairing : undefined
}

const sourceOf = (service) => {
  const pairing = pairingOf(service)
  return pairing === undefined ? undefined : { read: () => pairing.state(), onChange: (fn) => pairing.onChange(fn) }
}

/** The reader's time zone, as the browser sent it; absent reads as the process's own (pairingView). */
const zoneOf = (url) => new URL(url).searchParams.get(PAIRING_ROUTE.zoneParameter) ?? undefined

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: PAIRING_ROUTE.json })
const refusal = (status, code) => json(status, { ok: false, code })

async function choose(ctx, request) {
  let body
  try { body = await request.json() } catch { body = undefined }
  if (body === null || typeof body !== 'object' || typeof body.choice !== 'string') return refusal(PAIRING_ROUTE.badRequest, PAIRING_ROUTE.code.invalidArguments)
  const pairing = pairingOf(ctx.get(UI_INSTANCE.service))
  if (pairing === undefined) return refusal(PAIRING_ROUTE.unavailable, PAIRING_ROUTE.code.unavailable)
  try {
    // Only a literal `true` confirms: the box ticked in the card (R-ID-07).
    return json(PAIRING_ROUTE.ok, await pairing.choose(body.choice, { confirmed: body.confirmed === true }))
  } catch {
    return refusal(PAIRING_ROUTE.unavailable, PAIRING_ROUTE.code.unavailable)
  }
}

/**
 * @param {object} ctx fishball-ui's row context (`get`, `on`, `connection`)
 * @returns {() => Promise<void>} withdraws both routes and closes every open stream
 */
export function registerPairingRoutes(ctx) {
  const withdraw = []
  const dispose = async () => { await Promise.all(withdraw.splice(0).map((one) => one?.())) }
  try {
    withdraw.push(registerViewStream(ctx, {
      path: PAIRING_ROUTE.path,
      service: UI_INSTANCE.service,
      source: sourceOf,
      frame: (view, url) => pairingView(view, queryKey(url, PAIRING_ROUTE.langParameter, PAIRING_TEXT, PAIRING_DEFAULT_LANG), zoneOf(url)),
    }))
    withdraw.push(ctx.connection.fetch.register({ path: PAIRING_ROUTE.choosePath, methods: [PAIRING_ROUTE.post], requestBody: VIEW_STREAM.requestBody, fetch: (request) => choose(ctx, request) }))
  } catch (error) {
    // A path another row claimed: withdraw what was registered, so no half-registered pair remains.
    void dispose().catch(() => {})
    throw error
  }
  return dispose
}
