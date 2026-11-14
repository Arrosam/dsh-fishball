/**
 * The mailbox's durable tables (design §3.4: "one durable ledger per pair in the connector's own
 * storage domain"). Only this module reads or writes them, so the in-memory index in `mailbox.js`
 * stays true to them.
 *
 * `boxes` (key: digest of the principal key) holds `{principalKey, generation, head, held?}`:
 * - `generation` is `mailboxGeneration`. It is set when the box is first created and never
 *   changed here. Fishball accepted the rule on 2026-11-14 and it lands as a K1 amendment after
 *   the W2 merge: only lost or reset storage starts a new generation; delete, hold expiry and
 *   re-enable keep it. Until that amendment, nothing here starts one.
 * - `head` is the last sequence handed out. It is stored so that pruning or dropping events never
 *   lets a sequence be handed out twice in one generation.
 * - `held = {since, expired?}` marks a disabled entry (R-TOK-05).
 * - `dropping = {asks, throughSequence, until?}` exists only while a drop is in progress. It lets a drop cut short by a
 *   crash be finished with its asks still reported (`mailbox.js` `dropEvents`).
 * `events` (key: `eventId`) holds `{boxKey, state, event, dedupeKey?, finishedAt?}`.
 */
import { z } from 'zod'
import { EVENT_STATE, MAILBOX_STORE } from './constants.js'

const boxRecord = z.object({
  principalKey: z.string().min(1),
  generation: z.string().min(1),
  head: z.number().int().nonnegative(),
  held: z.object({ since: z.number().int(), expired: z.boolean().optional() }).optional(),
  dropping: z.object({ asks: z.array(z.string()), throughSequence: z.number().int().nonnegative(), until: z.number().int().optional() }).optional(),
})

/** The stored event is the K1 MailboxEvent as committed; its payload is opaque at this layer. */
const eventRecord = z.object({
  boxKey: z.string().min(1),
  state: z.enum(Object.values(EVENT_STATE)),
  event: z.object({
    eventId: z.string().min(1),
    mailboxGeneration: z.string().min(1),
    sequence: z.number().int().positive(),
    type: z.string().min(1),
    at: z.number().int(),
    sourceSessionId: z.string().nullable(),
    correlationId: z.string().nullable(),
    offer: z.object({ offerId: z.string(), revision: z.number().int(), decisionKind: z.string() }).optional(),
    payload: z.unknown(),
    payloadDigest: z.string(),
  }),
  dedupeKey: z.string().optional(),
  finishedAt: z.number().int().optional(),
})

/**
 * Open the mailbox's domain.
 * @param ctx - a Cordis context with `ctx.storageDomain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` from `@deepseek-ai/dsh-storage-domain`.
 *   C-WIRE passes it in from the connector row, so the module binds to the running SDK's copy.
 * @returns {Promise<{tables: {boxes: object, events: object}, close: () => Promise<void>}>}. The
 *   caller owns the handle and closes it, as its own `ctx.effect`.
 */
export async function openMailboxTables(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storageDomain.open(defineDomain({
    name: MAILBOX_STORE.domain,
    version: MAILBOX_STORE.version,
    layout: MAILBOX_STORE.layout,
    tables: {
      [MAILBOX_STORE.table.boxes]: domainTable(boxRecord),
      [MAILBOX_STORE.table.events]: domainTable(eventRecord),
    },
  }))
  return {
    tables: { boxes: domain.table(MAILBOX_STORE.table.boxes), events: domain.table(MAILBOX_STORE.table.events) },
    close: () => domain.close(),
  }
}
