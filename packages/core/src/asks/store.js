/**
 * The ask-card store (task F-ASKCARD; K3 `ask-card.d.ts`; R-FB-11, R-CON-05, R-CON-06).
 *
 * One durable record per ask, keyed by its `approvalId`, in a DSH storage-domain table of the
 * Fishball DSH. Every `ask` event core polls is recorded, filed or not, because an acked event is
 * never polled again: Fishball's model may file the card later, after a restart included. Only a
 * filed record is a card (`list()`); an unfiled one is the ask Fishball is still deciding itself.
 *
 * Known window (an F-WIRE obligation): the store follows the link's polls beside the interception
 * service, which acks an event once its own ledger holds it, not once this table does. A crash
 * between the two writes loses the record, and filing that ask later answers `unknown-offer`. Until
 * F-WIRE orders this store's write before the ack, that window stays open.
 *
 * Startup reconciliation (Fishball's decision, 2026-11-16): an unfiled ask whose call ended is
 * deleted at the next startup reconciliation (index.js `reconcile`), so the table cannot grow by the
 * asks whose call died with a connector restart, which retires nothing. It is an event, not a timer
 * (R-CON-05): it runs once per start, and a filed card is never touched by it.
 *
 * Transitions (no timer anywhere, R-CON-05: only an event or an answer moves a record):
 * - `ask` event, approvalId unknown → open, unfiled; a replay (known approvalId) changes nothing;
 * - filing → filed (open only);
 * - the user's answer committed → answered;
 * - `settlement` naming the approvalId, or `retirement` naming the ask's eventId → closed (open only);
 * - a connector answer of `already-settled` / `expired` → closed.
 *
 * An unfiled ask that closes is deleted rather than kept closed: every ask Fishball answers itself
 * ends that way, and keeping them would grow the table by one record per ask forever. Its offer id
 * stays in memory only (`closedOffers`) so that filing it in the same process answers `expired`;
 * after a restart such an id is unknown. A new revision of a known request (another `offerId` for
 * the same `approvalId`) replaces its record unless that was answered: a permission request is
 * re-offered after its earlier offer was retired (re-enable, re-hand; F-FIX), and only the newest
 * offer can be answered, so the new offer is a new, unfiled record the model may file again.
 */
import { ASKS, ASK_MISUSE, CARD_STATE } from './constants.js'

const STATES = new Set(Object.values(CARD_STATE))
const isText = (value) => typeof value === 'string'

/** Validates a stored record when the domain opens; a malformed one fails the open (as the ledger's). */
const recordSchema = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && [value.approvalId, value.offerId, value.eventId, value.sessionId, value.question].every(isText)
      && (value.sessionTitle === null || isText(value.sessionTitle)) && Array.isArray(value.choices) && value.choices.every(isText)
      && Number.isSafeInteger(value.askedAt) && STATES.has(value.state) && typeof value.filed === 'boolean'
    if (!ok) throw new TypeError(ASK_MISUSE.record)
    return value
  },
})

/**
 * Open the card table.
 * @param ctx - a Cordis context with `ctx.storage.domain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` from `@deepseek-ai/dsh-storage-domain`, passed
 *   in by the row that owns core's manifest (F-WIRE), as `openLedger` takes them.
 * @returns {Promise<{table: object, close: () => Promise<void>}>} the caller owns and closes it.
 */
export async function openAskCards(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: ASKS.domain,
    version: ASKS.version,
    tables: { [ASKS.table]: domainTable(recordSchema) },
  }))
  return { table: domain.table(ASKS.table), close: () => domain.close() }
}

/** The K3 `AskCard` of a record: its frozen public fields only. */
export const cardOf = (record) => Object.freeze({
  approvalId: record.approvalId,
  offerId: record.offerId,
  sessionId: record.sessionId,
  sessionTitle: record.sessionTitle,
  question: record.question,
  choices: Object.freeze([...record.choices]),
  askedAt: record.askedAt,
  state: record.state,
})

/**
 * The record an `ask` event becomes, or undefined when its payload is not K1's descriptor (K1's
 * schema was checked by the connector; this only guards the fields the card shows). The card's
 * `choices` are Q3 = A's Allow and Reject, whatever the descriptor lists.
 */
export function recordOf(event) {
  const descriptor = event?.payload
  const fields = [descriptor?.approvalId, descriptor?.offerId, descriptor?.prompt, descriptor?.title, event?.eventId, event?.sourceSessionId]
  if (!fields.every(isText) || !Number.isSafeInteger(descriptor.at)) return undefined
  return {
    approvalId: descriptor.approvalId,
    offerId: descriptor.offerId,
    eventId: event.eventId,
    sessionId: event.sourceSessionId,
    sessionTitle: descriptor.title === '' ? null : descriptor.title,
    question: descriptor.prompt,
    choices: [...ASKS.choices],
    askedAt: descriptor.at,
    state: CARD_STATE.open,
    filed: false,
  }
}

/**
 * The state machine over one KvTable. Every move is a compare-and-set inside `KvTable.update`
 * (the domain's one write chain), so of two racing moves exactly one wins.
 * @param table - `get`, `entries`, `put`, `update`, `delete`.
 * @param onChange - called after each write that changed what `cards()` lists.
 */
export function createCardStore(table, onChange) {
  const closedOffers = new Set()
  const records = () => [...table.entries()].map(([, record]) => record)
  const byOffer = (offerId) => records().find((record) => record.offerId === offerId)
  const changed = (record) => { if (record.filed) onChange() }

  /** Apply `next` when `guard(current)` holds; returns the moved record, or undefined. */
  async function move(approvalId, guard, next) {
    let moved
    if (table.get(approvalId) === undefined) return undefined
    await table.update(approvalId, (current) => {
      if (!guard(current)) return current
      moved = { ...current, ...next }
      return moved
    })
    if (moved !== undefined) changed(moved)
    return moved
  }

  const isOpen = (record) => record.state === CARD_STATE.open

  /** Closes the record when `guard` holds; an unfiled one is then deleted (see the header). */
  async function closeWhere(approvalId, guard) {
    const closed = await move(approvalId, guard, { state: CARD_STATE.closed })
    if (closed === undefined || closed.filed) return
    closedOffers.add(closed.offerId)
    await table.delete(approvalId)
  }

  return Object.freeze({
    get: (approvalId) => table.get(approvalId),
    byOffer,
    /** Filed records, oldest ask first. */
    cards: () => records().filter((record) => record.filed).sort((a, b) => a.askedAt - b.askedAt),
    wasClosed: (offerId) => closedOffers.has(offerId),

    /**
     * Records a new request; a known offer (a replay) is left as it is, and so is one this process
     * already closed and deleted (an unacked replay of it). After a restart such a replay is
     * recorded again as open: filing it then gives a card whose answer the connector refuses
     * `expired`, which closes it, so nothing is committed twice. A new offer of a known, unanswered
     * request replaces its record (see the header).
     */
    async add(record) {
      const known = table.get(record.approvalId)
      const reoffered = known !== undefined && known.offerId !== record.offerId && known.state !== CARD_STATE.answered
      if ((known !== undefined && !reoffered) || closedOffers.has(record.offerId)) return
      await table.put(record.approvalId, record)
      // A filed card the new offer replaced leaves the list until the model files the new offer.
      if (reoffered && known.filed) onChange()
    },

    file: (approvalId) => move(approvalId, (current) => isOpen(current) && !current.filed, { filed: true }),

    /** The committed answer wins over any close that arrived while it was in flight. */
    answered: (approvalId) => move(approvalId, (current) => current.state !== CARD_STATE.answered, { state: CARD_STATE.answered }),

    /**
     * Closes an open record. The close is the compare-and-set itself, so a filing queued before it
     * is kept (closed, listed) and one queued after it finds the ask closed; only a record still
     * unfiled after the close is deleted (see the header).
     */
    close: (approvalId) => closeWhere(approvalId, isOpen),

    /** Deletes an open record only while it is unfiled: a filing that won the race keeps its card open. */
    dropUnfiled: (approvalId) => closeWhere(approvalId, (current) => isOpen(current) && !current.filed),

    /** Open, unfiled records: the startup reconciliation's candidates. */
    unfiled: () => records().filter((record) => isOpen(record) && !record.filed),

    /** The approvalId of the open record whose ask event is `eventId` (a retirement names the event). */
    approvalOfEvent: (eventId) => records().find((record) => record.eventId === eventId)?.approvalId,
  })
}
