/**
 * The mailbox port of the C-REVOKE world: the C-ROUTE suite's mailboxPort (a real C-MAILBOX plus
 * `onAcked`) with a journal of what reaches the mailbox and two test-only drivers. Nothing here
 * reads C-ROUTE's or C-MAILBOX's code.
 *
 * - `journal`: one frozen entry per completed `retire` (`{op, principalKey, eventId, reason,
 *   outcome}`), per `commit` (`{op: OP.freshRetirement, principalKey, retiredEventId, reason}` for
 *   a `retirement` draft, which only routing's fresh retirements are, else `{op: OP.commit, …}`),
 *   and per `hold` / `release` (on completion) and `drop` (on its start, so every entry before it
 *   ran before the drop began).
 * - `holdRetires()` → `{reached, open()}`: every `retire` after the call waits until `open()`;
 *   `reached` resolves once the first one waits (a slow retirement, for "resolves only after every
 *   retirement has run").
 * - `failRetireOf(eventId)` / `failFreshRetirementOf(eventId)`: that retire, or the fresh
 *   `retirement` commit naming that event, rejects (a retirement that fails).
 */
import { mailboxPort } from '../routing/fakes.mjs'
import { EVENT_TYPE, MISUSE, OP } from './constants.mjs'

/** `basePort` builds the C-ROUTE suite's port over `real` (mailboxPort, or lateAckPort for the ack race). */
export function revocationPort(real, basePort = mailboxPort) {
  const base = basePort(real)
  const journal = []
  const failing = { retire: new Set(), fresh: new Set() }
  let gate = null
  const log = (entry) => { journal.push(Object.freeze(entry)) }
  const fail = (entry) => { log({ ...entry, failed: true }); throw new Error(MISUSE.failure) }
  return {
    ...base,
    journal,
    failRetireOf(eventId) { failing.retire.add(eventId) },
    failFreshRetirementOf(eventId) { failing.fresh.add(eventId) },
    holdRetires() {
      let arrive
      let open
      const reached = new Promise((resolve) => { arrive = resolve })
      const opened = new Promise((resolve) => { open = resolve })
      gate = { arrive, opened }
      return { reached, open: () => { gate = null; open() } }
    },
    async retire(principalKey, eventId, reason) {
      const waiting = gate
      if (waiting !== null) { waiting.arrive(); await waiting.opened }
      if (failing.retire.has(eventId)) fail({ op: OP.retire, principalKey, eventId, reason })
      const outcome = await base.retire(principalKey, eventId, reason)
      log({ op: OP.retire, principalKey, eventId, reason, outcome })
      return outcome
    },
    async commit(recipient, draft) {
      const fresh = draft?.type === EVENT_TYPE.retirement
      const entry = fresh
        ? { op: OP.freshRetirement, principalKey: recipient, retiredEventId: draft.payload?.retiredEventId, reason: draft.payload?.reason }
        : { op: OP.commit, principalKey: recipient, type: draft?.type }
      if (fresh && failing.fresh.has(entry.retiredEventId)) fail(entry)
      const result = await base.commit(recipient, draft)
      log({ ...entry, result })
      return result
    },
    async hold(principalKey, now) { await base.hold(principalKey, now); log({ op: OP.hold, principalKey }) },
    async release(principalKey) { await base.release(principalKey); log({ op: OP.release, principalKey }) },
    drop(principalKey) { log({ op: OP.drop, principalKey }); return base.drop(principalKey) },
  }
}
