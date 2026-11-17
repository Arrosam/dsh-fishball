/**
 * The router (task C-ROUTE; K1 `Router.recipientFor`; R-EVS-03, R-ROUTE-02, R-CON-09, R-EXT-17,
 * R-WATCH-02; EVT-DT-01, EVT-EP-01; C-WIRE-2). One pure decision over the live facts it is given,
 * made when the event is created, so a later change of manager never moves it (EVT-DT-01 rule 8).
 * Every producer asks it, so each produced event has exactly one recipient or none.
 *
 * Order of the rules:
 * 1. A follow-up (`settlement`, `retirement`, `takeback`) goes to `followsPrincipal`, the pair that
 *    got the original (EVT-DT-01 rules 6–7).
 * 2. An event naming a managed session goes to its manager, whatever its type, connected or not
 *    (R-CON-09; PLAT-UC-03 E2).
 * 3. Otherwise there is no recipient, and the type's outcome applies (`UNMANAGED_ROUTE`): an offer
 *    is the user's (`to-user`), a contributor event is `no-agent`, everything else is not produced
 *    (`dropped`). C-WIRE-2 removed the designated agent (the user's answer q5, 2026-11-17: "Remove
 *    agentToken entirely"; "There is no 'designated agent' default for unmanaged sessions"), so
 *    nothing of an unmanaged session ever reaches a principal: "An unmanaged session's tools go to
 *    the user as normal DSH."
 */
import { CONTRIBUTED_TYPE_PREFIX } from '../../mcp-schema/index.js'
import { CONTRIBUTED_ROUTE, FOLLOW_UP_TYPES, MISUSE, ROUTE_FALLBACK, UNMANAGED_ROUTE } from './constants.js'

const noRecipient = (fallback) => Object.freeze({ recipient: null, fallback })
const to = (recipient) => Object.freeze({ recipient })

/**
 * @param {object} facts - live reads, each synchronous:
 * @param {(sessionId: string) => string | undefined} facts.managerOf - K1c `ManagedState.managerOf`
 * @returns the K1 `Router`
 */
export function createRouter({ managerOf }) {
  /** What an event that names no managed session becomes; any type not in the table is dropped. */
  const unmanagedOutcome = (type) => (type.startsWith(CONTRIBUTED_TYPE_PREFIX) ? CONTRIBUTED_ROUTE : UNMANAGED_ROUTE[type] ?? ROUTE_FALLBACK.dropped)

  return Object.freeze({
    recipientFor({ type, sessionId, followsPrincipal }) {
      if (FOLLOW_UP_TYPES.includes(type)) {
        if (typeof followsPrincipal !== 'string' || followsPrincipal.length === 0) throw new TypeError(MISUSE.followUp)
        return to(followsPrincipal)
      }
      const manager = sessionId === null || sessionId === undefined ? undefined : managerOf(sessionId)
      return manager === undefined ? noRecipient(unmanagedOutcome(type)) : to(manager)
    },
  })
}
