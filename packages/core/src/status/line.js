/**
 * The status strip's line and control (design §6.3a step 1; R-FB-03, R-FB-04; REM-DT-01's display).
 * Pure: it combines the link's status, the target URL rule and Connect's state.
 *
 * | Rule | Seen | line | control |
 * | --- | --- | --- | --- |
 * | 1 | link `connected` | `connected` | — |
 * | 2 | the target URL is not usable (blank, invalid, insecure: F-LINK's `checkTarget`) | the link's word and code | — |
 * | 3 | link `target-unreachable` (any code, `TARGET_INCOMPATIBLE` included) | the link's word and code | — |
 * | 4 | no Connect (a hosted child with the same-DSH import), or Connect `authorized` | the link's word and code | — |
 * | 5 | Connect `authorizing` | `authorizing` ("finish on the approval page") | cancel |
 * | 6 | Connect `needs-configuration` | `needs-configuration` with its code (Connect sends nothing) | — |
 * | 7 | Connect `needs-authorization` or `failed`, link `token-refused` | the link's word and code | connect |
 * | 7a | as 7, link `target-unset` (no saved grant yet) | Connect's state and code | connect |
 * First match wins. Rule 2 before Connect: a usable target is the precondition of Connect
 * (§6.3a "with a target set"). Rule 3 keeps an unreachable target's word: pressing Connect cannot
 * reach it. Rule 7 keeps `token-refused` / `token-revoked` beside Connect, since a refused grant
 * "shows Connect again" (R-FB-04) and the user should still see why.
 */
import { CONNECT } from '../../contracts/constants.js'
import { TARGET_STATE, checkTarget } from '../link/index.js'
import { STATUS_MODEL } from './constants.js'

const line = (kind, code) => Object.freeze({ kind, code: code ?? null })
const linkLine = (link) => line(link.state, link.code)
const result = (shown, control = null) => Object.freeze({ line: shown, control })

/** Connect states that offer the Connect button (rule 7). */
const CONNECTABLE = Object.freeze([CONNECT.state.needsAuthorization, CONNECT.state.failed])

/**
 * @param {{state: string, code: string | null}} link the link's status
 * @param {unknown} target the configured target URL
 * @param {{state: string, code: string | null} | null} connect Connect's status, or null without Connect
 * @returns {{line: {kind: string, code: string | null}, control: string | null}}
 */
export function stripLine(link, target, connect) {
  if (link.state === TARGET_STATE.connected || link.state === TARGET_STATE.unreachable || !checkTarget(target).ok) return result(linkLine(link))
  if (connect === null || connect.state === CONNECT.state.authorized) return result(linkLine(link))
  if (connect.state === CONNECT.state.authorizing) return result(line(connect.state), STATUS_MODEL.control.cancel)
  if (!CONNECTABLE.includes(connect.state)) return result(line(connect.state, connect.code))
  const shown = link.state === TARGET_STATE.refused ? linkLine(link) : line(connect.state, connect.code)
  return result(shown, STATUS_MODEL.control.connect)
}
