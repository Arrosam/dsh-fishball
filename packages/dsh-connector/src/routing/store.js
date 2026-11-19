/**
 * The routing module's durable table (K1c-1 "durable"; C-WIRE-2 withdrew K1c-3's queue). Only
 * this module's state owners read or write them, so their in-memory copies stay true to them.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { RECORD_KEY, ROUTING_STORE } from './constants.js'

const managedRecord = z.object({ sessionId: z.string().min(1), principalKey: z.string().min(1) })

/** The managed table's key for a session id: a digest, because a session id need not be path-safe. */
export const managedKeyOf = (sessionId) => createHash(RECORD_KEY.algorithm).update(sessionId).digest(RECORD_KEY.encoding)

/**
 * @param ctx - a Cordis context with `ctx.storageDomain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` of `@deepseek-ai/dsh-storage-domain`, passed in
 *   by the connector row (as C-MAILBOX and C-PAIR take it), so this module imports no host package.
 * @returns {Promise<{tables: {managed: object}, close: () => Promise<void>}>}
 */
export async function openRoutingTables(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: ROUTING_STORE.domain,
    version: ROUTING_STORE.version,
    layout: ROUTING_STORE.layout,
    tables: {
      [ROUTING_STORE.table.managed]: domainTable(managedRecord),
    },
  }))
  return {
    tables: { managed: domain.table(ROUTING_STORE.table.managed) },
    close: () => domain.close(),
  }
}
