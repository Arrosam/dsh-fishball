/**
 * The router (task C-ROUTE; K1 `Router.recipientFor`; R-EVS-03, R-ROUTE-02…04, R-CON-09, R-EXT-17,
 * R-WATCH-02; EVT-DT-01, EVT-EP-01). One pure decision over the live facts it is given, made when
 * the event is created, so a later change of manager never moves it (EVT-DT-01 rule 8). Every
 * producer asks it, so each produced event has exactly one recipient or none.
 *
 * Order of the rules:
 * 1. A follow-up (`settlement`, `retirement`, `takeback`) goes to `followsPrincipal`, the pair that
 *    got the original (EVT-DT-01 rules 6–7).
 * 2. An event naming a managed session goes to its manager, whatever its type, connected or not
 *    (R-CON-09: the no-principal rules apply only to unmanaged sessions; PLAT-UC-03 E2; an `ask`
 *    from a managed session waits in its manager's mailbox, Fishball 2026-11-14).
 * 3. Otherwise by type (`UNMANAGED_ROUTE`): offers are the user's, unmanaged `turn-finished` /
 *    `state` are not produced; `message`, `ask`, `notice` and contributor events go to the
 *    designated **paired** agent, with three extra rules:
 *    - `message`: while the no-recipient queue holds anything, a new one joins its end, so it never
 *      overtakes an older one (K1c-3);
 *    - `ask`: the designated pair must be connected now (K1 CONNECTED), else `unavailable` at once
 *      (R-ROUTE-04, design §3.5);
 *    - with no designated paired agent the type's `none` outcome applies (`queue`,
 *      `unavailable`, `dropped` for a notice, Fishball 2026-11-14; `no-agent` for a contributor).
 */
import { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE } from '../../mcp-schema/index.js'
import { CONTRIBUTED_ROUTE, FOLLOW_UP_TYPES, MISUSE, ROUTE_FALLBACK, UNMANAGED_ROUTE } from './constants.js'

const noRecipient = (fallback) => Object.freeze({ recipient: null, fallback })
const to = (recipient) => Object.freeze({ recipient })

/**
 * @param {object} facts - live reads, each synchronous:
 * @param {(sessionId: string) => string | undefined} facts.managerOf - K1c `ManagedState.managerOf`
 * @param {() => string | undefined} facts.designated - the designated agent's principal key, only
 *   while `routing.agentToken` names a **paired** entry (K1c-3)
 * @param {(principalKey: string) => boolean} facts.isConnected - K1 `Presence.isConnected`
 * @param {() => number} facts.heldCount - messages in the no-recipient queue now
 * @returns the K1 `Router`
 */
export function createRouter({ managerOf, designated, isConnected, heldCount }) {
  function unmanagedRoute(type) {
    return type.startsWith(CONTRIBUTED_TYPE_PREFIX) ? CONTRIBUTED_ROUTE : UNMANAGED_ROUTE[type]
  }

  return Object.freeze({
    recipientFor({ type, sessionId, followsPrincipal }) {
      if (FOLLOW_UP_TYPES.includes(type)) {
        if (typeof followsPrincipal !== 'string' || followsPrincipal.length === 0) throw new TypeError(MISUSE.followUp)
        return to(followsPrincipal)
      }
      const manager = sessionId === null || sessionId === undefined ? undefined : managerOf(sessionId)
      if (manager !== undefined) return to(manager)
      const route = unmanagedRoute(type)
      if (route === undefined || !route.designated) return noRecipient(route?.none ?? ROUTE_FALLBACK.dropped)
      if (type === EVENT_TYPE.message && heldCount() > 0) return noRecipient(ROUTE_FALLBACK.queue)
      const fishball = designated()
      if (fishball === undefined) return noRecipient(route.none)
      if (type === EVENT_TYPE.ask && !isConnected(fishball)) return noRecipient(route.none)
      return to(fishball)
    },
  })
}
