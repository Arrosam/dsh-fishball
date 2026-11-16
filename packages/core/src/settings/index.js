/**
 * Core's own settings page, Node half (task F-SETTINGS): the Connect routes the page's Connect
 * control and fishball-ui's status strip call (`client.settings.js`, fishball-ui `client.strip.js`),
 * and the page's settings names (`SETTINGS`) for the row schema. Composition only; core's main row
 * mounts them (`registerSettingsRoutes(ctx, {callbackFor})` and `registerConnectCancelRoute(ctx)`, F-WIRE).
 *
 * Everything else on the page is DSH's own: the fields are the row's settings namespace, saved
 * through DSH's settings service, and the write-only token field writes DSH's credential store
 * through `remote.credentials`. So this route is the page's only server code.
 */
import { UI_SEAM } from 'fishball-shared/ui-seam'
import { GUARDS } from '../../contracts/constants.js'
import { CONNECT_ROUTE } from './constants.js'

export { CONNECT_ROUTE, SETTINGS } from './constants.js'
export { effectiveTarget, hasInstanceTarget } from './target.js'

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: CONNECT_ROUTE.headers })
const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]))

/**
 * `fishballInstance.ui.connect`, looked up per request: the service may be replaced or withdrawn
 * at any time, and a stale reference would answer for a link that no longer exists.
 * @returns the member, or `undefined` when no compatible one is there
 */
function connectOf(ctx) {
  const service = ctx.get(GUARDS.services.instance)
  const connect = service?.apiVersion === CONNECT_ROUTE.instanceApiVersion ? service[UI_SEAM.member]?.connect : undefined
  return typeof connect?.status === 'function' && typeof connect.begin === 'function' && typeof connect.cancel === 'function' ? connect : undefined
}

/**
 * Exactly the `ConnectBegin` / `ConnectStatus` members: anything else the objects carry stays in
 * the process. An outcome outside `connect.d.ts` is not answered at all.
 */
function beginAnswer(begin) {
  const members = CONNECT_ROUTE.beginMembers[begin?.outcome]
  return members === undefined ? undefined : { outcome: begin.outcome, ...pick(begin, members) }
}
const statusAnswer = (status) => pick(status, ['state', 'code'])

/** One answer of a compatible `ui.connect`, or 503 (also for a throw: its message could name a credential detail). */
function answering(ctx, act) {
  const unavailable = () => json(CONNECT_ROUTE.unavailable, { code: CONNECT_ROUTE.unavailableCode })
  return async (request) => {
    try {
      const connect = connectOf(ctx)
      if (connect === undefined) return unavailable()
      const answer = await act(connect, request)
      return answer === undefined ? unavailable() : json(CONNECT_ROUTE.ok, answer)
    } catch {
      return unavailable()
    }
  }
}

/**
 * Registers `GET|POST /api/fishball/connect` (CONNECT_ROUTE) on DSH's authenticated exact-route
 * channel. Returns DSH's disposer.
 * @param {{get(name: string): any, connection: {fetch: {register(route: object): () => Promise<void>}}}} ctx core's row context
 * @param {{callbackFor?: (request: Request) => object | undefined}} [options] the press's callback
 *   choice from the page's own origin (link/web-callback.js, Q-A3 B). `undefined` is the loopback
 *   callback, and then `begin()` is called with no argument, as K3a's `FishballConnect.begin()` is
 */
export function registerSettingsRoutes(ctx, { callbackFor = () => undefined } = {}) {
  const begin = (connect, request) => {
    const via = callbackFor(request)
    return via === undefined ? connect.begin() : connect.begin(via)
  }
  return ctx.connection.fetch.register({
    path: CONNECT_ROUTE.path,
    methods: [CONNECT_ROUTE.read, CONNECT_ROUTE.begin],
    requestBody: CONNECT_ROUTE.requestBody,
    fetch: answering(ctx, async (connect, request) => (request.method === CONNECT_ROUTE.begin ? beginAnswer(await begin(connect, request)) : statusAnswer(connect.status()))),
  })
}

/**
 * Registers `POST /api/fishball/connect/cancel` (CONNECT_ROUTE.cancelPath): `cancel()`, then the
 * status (fishball-ui's strip Cancel, design §6.3a step 2; F-WIRE). Returns DSH's disposer.
 * @param ctx as `registerSettingsRoutes`
 */
export function registerConnectCancelRoute(ctx) {
  return ctx.connection.fetch.register({
    path: CONNECT_ROUTE.cancelPath,
    methods: [CONNECT_ROUTE.begin],
    requestBody: CONNECT_ROUTE.requestBody,
    fetch: answering(ctx, async (connect) => {
      connect.cancel()
      return statusAnswer(connect.status())
    }),
  })
}
