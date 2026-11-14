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
import { HELD_SEQUENCE } from './constants.js'

/**
 * @param {object} deps
 * @param deps.table - the routing domain's `held` table (store.js)
 * @param deps.newKey - a fresh path-safe record key
 * @param deps.limit - `() => number`: the live `maxQueuedInputs`
 * @returns the queue (`count`, `hold`, `flushTo`)
 */
export function createHeldQueue({ table, newKey, limit }) {
  /** Records in queue order, from the table (the authority) at open. */
  const queue = [...table.entries()].map(([key, record]) => ({ key, record })).sort((a, b) => a.record.seq - b.record.seq)
  let nextSeq = queue.length === 0 ? HELD_SEQUENCE.first : queue[queue.length - 1].record.seq + HELD_SEQUENCE.step

  return Object.freeze({
    count: () => queue.length,

    /** @returns `{ok: true}` once stored, or `queue-full` past the live bound (nothing stored). */
    async hold(sourceSessionId, payload) {
      if (queue.length >= limit()) return Object.freeze({ ok: false, code: REFUSAL.queueFull })
      const record = { seq: nextSeq, sourceSessionId, payload }
      const key = newKey()
      await table.put(key, record)
      nextSeq += HELD_SEQUENCE.step
      queue.push({ key, record })
      return Object.freeze({ ok: true })
    },

    /**
     * Moves held messages, oldest first, into `recipient`'s mailbox until one does not fit. A
     * message is deleted only after its commit, so a crash in between sends it twice at worst,
     * never loses it (K1c-3: never dropped once accepted).
     */
    async flushTo(recipient, commit) {
      while (queue.length > 0) {
        const { key, record } = queue[0]
        const committed = await commit(recipient, { type: EVENT_TYPE.message, sourceSessionId: record.sourceSessionId, correlationId: null, payload: record.payload })
        if (!committed.ok) return
        queue.shift()
        await table.delete(key)
      }
    },
  })
}
