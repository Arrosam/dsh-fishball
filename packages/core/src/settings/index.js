/**
 * Core's own settings page, Node half (task F-SETTINGS): the Connect route the page's Connect
 * control calls (`client.settings.js`), and the page's settings names (`SETTINGS`) for F-WIRE's
 * row schema. Composition only; F-WIRE mounts the route in core's row (`registerSettingsRoutes(ctx)`
 * from that row's `apply`).
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
  return typeof connect?.status === 'function' && typeof connect.begin === 'function' ? connect : undefined
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

/**
 * Registers `GET|POST /api/fishball/connect` (CONNECT_ROUTE) on DSH's authenticated exact-route
 * channel. Returns DSH's disposer.
 * @param {{get(name: string): any, connection: {fetch: {register(route: object): () => Promise<void>}}}} ctx core's row context
 */
export function registerSettingsRoutes(ctx) {
  const unavailable = () => json(CONNECT_ROUTE.unavailable, { code: CONNECT_ROUTE.unavailableCode })
  return ctx.connection.fetch.register({
    path: CONNECT_ROUTE.path,
    methods: [CONNECT_ROUTE.read, CONNECT_ROUTE.begin],
    requestBody: CONNECT_ROUTE.requestBody,
    async fetch(request) {
      try {
        const connect = connectOf(ctx)
        if (connect === undefined) return unavailable()
        const answer = request.method === CONNECT_ROUTE.begin ? beginAnswer(await connect.begin()) : statusAnswer(connect.status())
        return answer === undefined ? unavailable() : json(CONNECT_ROUTE.ok, answer)
      } catch {
        // Never serialize an exception: its message could name a credential detail.
        return unavailable()
      }
    },
  })
}
