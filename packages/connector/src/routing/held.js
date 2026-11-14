/**
 * The no-recipient `message` queue (task C-ROUTE; K1 `NoRecipient.fallback` `queue`; README
 * "Managed state", K1c-3; R-CON-09, R-ROUTE-04; PLAT-UC-03 E1).
 *
 * - Holds a `message_fishball` from an unmanaged session (or none) while no paired entry is
 *   designated, durably (the `held` table), in arrival order.
 * - Bounded by the live `maxQueuedInputs` (default K1 QUEUE.maxQueuedInputs): one more is `queue-full`.
 *   Accepted messages are never dropped.
 * - Once a paired entry is designated, connected or not, `flush` moves them in order into its
 *   mailbox. One the mailbox refuses (`queue-full`) stops the flush there, so the rest stay in
 *   order and move in as room frees up (an ack in that mailbox, or a change of designation).
 * - While it is not empty, the router sends a new such message here, so it never overtakes an
 *   older one.
 * All of it runs on one serial chain with the routing decision of `message_fishball` itself
 * (`index.js`), so a flush and a new message never interleave.
 */
import { EVENT_TYPE, REFUSAL } from '../../mcp-schema/index.js'
import { HELD_SEQUENCE, MISUSE } from './constants.js'
import { heldRecord } from './store.js'

/**
 * @param {object} deps
 * @param deps.table - the routing domain's `held` table (store.js)
 * @param deps.newKey - a fresh path-safe record key
 * @param deps.limit - `() => number`: the live `maxQueuedInputs`
 * @param deps.onDeleteFailed - `(error) => void`: a moved message's record could not be deleted (logged)
 * @returns the queue (`count`, `hold`, `flushTo`)
 */
export function createHeldQueue({ table, newKey, limit, onDeleteFailed }) {
  /** Records in queue order, from the table (the authority) at open. */
  const queue = [...table.entries()].map(([key, record]) => ({ key, record })).sort((a, b) => a.record.seq - b.record.seq)
  let nextSeq = queue.length === 0 ? HELD_SEQUENCE.first : queue[queue.length - 1].record.seq + HELD_SEQUENCE.step

  return Object.freeze({
    count: () => queue.length,

    /** @returns `{ok: true}` once stored, or `queue-full` past the live bound (nothing stored). */
    async hold(sourceSessionId, payload) {
      if (queue.length >= limit()) return Object.freeze({ ok: false, code: REFUSAL.queueFull })
      const record = { seq: nextSeq, sourceSessionId, payload }
      // The domain checks records only when it opens: one bad record would keep the whole routing
      // domain, managed state included, from opening. So it is checked before it is written.
      if (!heldRecord.safeParse(record).success) throw new TypeError(MISUSE.heldRecord)
      const key = newKey()
      await table.put(key, record)
      nextSeq += HELD_SEQUENCE.step
      queue.push({ key, record })
      return Object.freeze({ ok: true })
    },

    /**
     * Moves held messages, oldest first, into `recipient`'s mailbox until one does not fit. A
     * message leaves the table only after its commit: K1c-3 ("never dropped once accepted") rules
     * out the other order, which could lose one. Once committed it leaves the in-memory queue even
     * if its delete fails (logged), so this run never sends it again; only a restart over the
     * undeleted record can send it a second time. The recipient is the designated pair at the flush, as
     * K1c-3 says ("once a paired entry is designated, the held messages move into its mailbox").
     */
    async flushTo(recipient, commit) {
      while (queue.length > 0) {
        const { key, record } = queue[0]
        const committed = await commit(recipient, { type: EVENT_TYPE.message, sourceSessionId: record.sourceSessionId, correlationId: null, payload: record.payload })
        if (!committed.ok) return
        queue.shift()
        await table.delete(key).catch(onDeleteFailed)
      }
    },
  })
}
