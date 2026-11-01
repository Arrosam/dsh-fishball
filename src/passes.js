/**
 * One-time passes and to-you tickets (DESIGN §7a.3, §7a.6, §9 "Passes and to-you tickets").
 *
 * Both let exactly one call through without a Fishball step:
 * - a pass (Fishball allowed the call with ask_fishball, or answered a thread) -> 'allowed-once';
 * - a to-you ticket (ask_fishball told the agent to make the call itself) -> your stock prompt.
 *
 * The key is `sessionId | toolName | sha256(canonical JSON of the arguments)` (spike S35), keys
 * sorted at every level, so the same arguments in another key order match and any changed value
 * does not. Entries live in memory and end when used, when their session's turn ends, or when the
 * session leaves management; no count cap (your answer: ending with the turn is enough, §16).
 */
import { createHash } from 'node:crypto'
import { canonical } from './digest.js'

const KEY_SEPARATOR = '|'

export class CallPasses {
  /** key -> { kind: PASS_KIND, sessionId, requestId?, seenByFishball } */
  #entries = new Map()

  /**
   * The key of one call, or undefined when its arguments are not known (no pass can match then).
   * @param sessionId - the session the user sees (a subagent's root).
   * @param args - the parsed arguments, or undefined.
   */
  static keyOf(sessionId, toolName, args) {
    if (args === undefined) return undefined
    return [sessionId, toolName, createHash('sha256').update(canonical(args)).digest('hex')].join(KEY_SEPARATOR)
  }

  /**
   * Let the call with this key through once (a later add for the same key replaces it).
   * @param origin.requestId - the request that left it; origin.seenByFishball - whether that
   *   request reached Fishball (it is then told how the call ended).
   */
  add(key, kind, sessionId, { requestId, seenByFishball }) {
    if (key === undefined) return
    this.#entries.set(key, { kind, sessionId, requestId, seenByFishball })
  }

  /** Use the entry of this key, if any: @returns { kind, sessionId, requestId?, seenByFishball } or undefined. */
  take(key) {
    if (key === undefined) return undefined
    const entry = this.#entries.get(key)
    this.#entries.delete(key)
    return entry
  }

  /** End every entry of one session (its turn ended, or it left management). */
  dropSession(sessionId) {
    for (const [key, entry] of [...this.#entries]) if (entry.sessionId === sessionId) this.#entries.delete(key)
  }
}
