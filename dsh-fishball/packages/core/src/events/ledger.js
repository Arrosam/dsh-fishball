/**
 * Core's acceptance ledger (design §6.4, S2-Q1 / Q-S3-2 decided B): one durable record per
 * `eventId` in a DSH storage-domain table of the Fishball DSH. It records which side took the
 * event (`interceptor:<pluginId>` or Fishball), and for an interceptor whether its record is
 * offered, open, committing or closed. A record is internal state; nothing here ever enters an
 * agent's context (R-INT-09).
 *
 * Every state change is a compare-and-set inside `KvTable.update`, which runs on the domain's one
 * write chain, so two moves of one record never interleave and exactly one of two racing moves
 * wins (S3 `proto/interception.mjs`). The table has no put-if-absent, so `create` guards the first
 * write of an id in process; there is one core per Fishball DSH (R-ID-06).
 *
 * MULTI-1 (PLAN-MULTI §5; MULTI-0 `TARGETS.key`): one ledger serves every target, keyed by the
 * event's local key `[event, targetId, endpointEpoch, eventId]` (`recordKeyOf`), never by the raw
 * `eventId`: two targets may send the same id, and so may one target before and after an endpoint
 * change. A record holds that `key`, the raw `eventId` (its receipt is sent exactly as received) and
 * the event with its trusted `source`.
 */
import { LEDGER, MESSAGE, STATE, TARGETS } from '../../contracts/constants.js'
import { handleOf, keyOf } from '../targets/keys.js'
import { FINISHED, MISUSE } from './constants.js'

const STATES = new Set(Object.values(STATE))

/**
 * Validates a stored record when the domain opens. The domain calls `parse` on load only, so a
 * malformed record fails the open loudly (the default `invalid-record`) instead of being trusted.
 * The fields the state machine reads are checked; the rest of `event` is opaque here.
 */
const recordSchema = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && typeof value.key === 'string' && typeof value.eventId === 'string' && STATES.has(value.state)
      && typeof value.event?.source?.targetId === 'string' && typeof value.event.source.endpointEpoch === 'string'
      && typeof value.attempt === 'string' && Number.isSafeInteger(value.sequence) && typeof value.acked === 'boolean'
      && value.event !== null && typeof value.event === 'object' && typeof value.event.payloadDigest === 'string'
      && (value.plugin === undefined || typeof value.plugin === 'string')
      && (value.finishedAt === undefined || Number.isSafeInteger(value.finishedAt))
    if (!ok) throw new TypeError(MISUSE.record)
    return value
  },
})

/**
 * Open the ledger table.
 * @param ctx - a Cordis context with `ctx.storage.domain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` from `@deepseek-ai/dsh-storage-domain`,
 *   passed in by the row that owns core's manifest, so this module adds no dependency of its own.
 * @returns {Promise<{table: object, close: () => Promise<void>}>} the KvTable and the domain's closer;
 *   the caller owns the handle and closes it (as its own `ctx.effect`).
 */
export async function openLedger(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: LEDGER.domain,
    version: LEDGER.version,
    tables: { [LEDGER.table]: domainTable(recordSchema) },
  }))
  return { table: domain.table(LEDGER.table), close: () => domain.close() }
}

/** The ledger key of a polled event from `source` (a `TargetSource`). */
export const recordKeyOf = (source, eventId) => keyOf(TARGETS.key.kind.event, source.targetId, source.endpointEpoch, eventId)

/**
 * The stable message id an event gets in Fishball's session, from its ledger key; its live
 * admission is matched by it. `fbe_` + the key's handle (MULTI-0), so two targets' `event-1` are
 * two messages.
 */
export const messageIdOf = (key) => `${MESSAGE.idPrefix}${handleOf(key)}`

/** The K1 `inbox_ack` receipt of a record. */
export const receiptOf = (record) => ({ eventId: record.eventId, payloadDigest: record.event.payloadDigest })

/**
 * The state machine over one KvTable.
 * @param table - the ledger's KvTable (`get`, `entries`, `put`, `update`, `delete`).
 * @param now - the clock, epoch milliseconds; stamps `finishedAt` and drives retention.
 */
export function createLedger(table, now) {
  const creating = new Set()
  // A reduce, not Math.max(...spread): a spread of a very large table could exceed the call stack.
  let sequence = [...table.entries()].reduce((highest, [, record]) => Math.max(highest, record.sequence), 0)

  const records = () => [...table.entries()].map(([, record]) => record)

  return Object.freeze({
    get: (key) => table.get(key),
    records,
    /** Records in arrival order, optionally only those in one of `states`. */
    inOrder(states) {
      const wanted = new Set(states)
      return records().filter((record) => wanted.has(record.state)).sort((a, b) => a.sequence - b.sequence)
    },
    /**
     * Write the first record of a key. Returns false (writing nothing) when the key is known or
     * its first write is already in flight: the caller treats it as a replay.
     */
    async create(key, fields) {
      if (table.get(key) !== undefined || creating.has(key)) return false
      creating.add(key)
      try {
        await table.put(key, { key, sequence: ++sequence, acked: false, ...fields })
      } finally { creating.delete(key) }
      return true
    },
    /**
     * Compare-and-set: apply `next` only when `guard(current)` holds at the record's write slot.
     * A move into an end state stamps `finishedAt`.
     * @returns whether this call won the move.
     */
    async move(key, guard, next) {
      let won = false
      await table.update(key, (current) => {
        if (!guard(current)) return current
        won = true
        const moved = { ...current, ...next(current) }
        return FINISHED.includes(moved.state) && moved.finishedAt === undefined ? { ...moved, finishedAt: now() } : moved
      })
      return won
    },
    /**
     * Delete acked records (or, MULTI-1, records of an epoch `live` says is retired) that finished
     * more than LEDGER.finishedRetentionMs ago. One `delete` per
     * key: `KvTable.deleteMany` exists on 0.2.2-rc.1 only, `delete` on both SDKs.
     * @returns {Promise<number>} how many were deleted.
     */
    async prune(live = () => true) {
      const cutoff = now() - LEDGER.finishedRetentionMs
      // A retired epoch's finished record is never acked (its link is gone), and its replay can
      // never come back through a current link, so it ages out by `finishedAt` alone (review m6).
      const expired = records().filter((record) => (record.acked || !live(record.event.source)) && record.finishedAt !== undefined && record.finishedAt < cutoff)
      for (const record of expired) await table.delete(record.key)
      return expired.length
    },
  })
}
