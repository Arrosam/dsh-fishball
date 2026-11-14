/**
 * The routing module's durable tables (K1c-1 "durable", K1c-3 "durable connector queue"). Only
 * this module's state owners read or write them, so their in-memory copies stay true to them.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { RECORD_KEY, ROUTING_STORE } from './constants.js'

const managedRecord = z.object({ sessionId: z.string().min(1), principalKey: z.string().min(1) })
/** A held `message` (K1c-3): its place in the queue, its source session (or none) and its K1 payload. */
const heldRecord = z.object({ seq: z.number().int().nonnegative(), sourceSessionId: z.string().min(1).nullable(), payload: z.unknown() })

/** The managed table's key for a session id: a digest, because a session id need not be path-safe. */
export const managedKeyOf = (sessionId) => createHash(RECORD_KEY.algorithm).update(sessionId).digest(RECORD_KEY.encoding)

/**
 * @param ctx - a Cordis context with `ctx.storageDomain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed in
 *   by the connector row (as C-MAILBOX and C-PAIR take it), so this module imports no host package.
 * @returns {Promise<{tables: {managed: object, held: object}, close: () => Promise<void>}>}
 */
export async function openRoutingTables(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: ROUTING_STORE.domain,
    version: ROUTING_STORE.version,
    layout: ROUTING_STORE.layout,
    tables: {
      [ROUTING_STORE.table.managed]: domainTable(managedRecord),
      [ROUTING_STORE.table.held]: domainTable(heldRecord),
    },
  }))
  return {
    tables: { managed: domain.table(ROUTING_STORE.table.managed), held: domain.table(ROUTING_STORE.table.held) },
    close: () => domain.close(),
  }
}
