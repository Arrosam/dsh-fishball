/**
 * The ask-card store (task F-ASKCARD; K3 `ask-card.d.ts`; R-FB-11, R-CON-05, R-CON-06).
 *
 * One durable record per request, keyed by its `approvalId`, in a DSH storage-domain table of the
 * Fishball DSH. Every card-able offer core polls (`ASKS.eventTypes`: a `permission` request since
 * F-FIX, and the frozen `ask`) is recorded, filed or not, because an acked event is never polled
 * again: Fishball's model may file the card later, after a restart included. Only a filed record is
 * a card (`list()`); an unfiled one is the request Fishball is still deciding itself.
 *
 * Known window (an F-WIRE obligation): the store follows the link's polls beside the interception
 * service, which acks an event once its own ledger holds it, not once this table does. A crash
 * between the two writes loses the record, and filing that request later answers `unknown-offer`.
 *
 * Startup reconciliation (Fishball's decision, 2026-11-16): an unfiled record whose call ended is
 * deleted at the next startup reconciliation (index.js `reconcile`), so the table cannot grow by the
 * requests whose call died with a connector restart, which retires nothing. It is an event, not a
 * timer (R-CON-05): it runs once per start, and a filed card is never touched by it.
 *
 * Transitions (no timer anywhere, R-CON-05: only an event or an answer moves a record):
 * - offer event, approvalId unknown → open, unfiled;
 * - offer event of a known approvalId at a HIGHER revision (the envelope's `offer.revision`), while
 *   the record is not answered → replaced by the new offer, open and unfiled (F-FIX: a permission
 *   request is re-offered after its earlier offer was retired, by a re-enable or a re-hand, and only
 *   the newest offer can be answered). The replaced offer id joins `closedOffers`, so filing it
 *   answers `expired`. The same or a lower revision is a replay and changes nothing, so re-polling
 *   an unacked page (r1, then r2) never undoes a filed r2;
 * - filing an offer id → filed (open, and still that offer only);
 * - the user's answer committed on an offer → answered (that offer only);
 * - `settlement` naming the approvalId, or `retirement` naming the record's eventId → closed (open only);
 * - a connector answer of `already-settled` / `expired` to an offer → closed (that offer only).
 * The per-offer moves keep a late answer to an older offer from moving its replacement.
 *
 * An unfiled record that closes is deleted rather than kept closed: every request Fishball answers
 * itself ends that way, and keeping them would grow the table by one record per request forever.
 * Its offer id stays in memory only (`closedOffers`) so that filing it in the same process answers
 * `expired`; after a restart such an id is unknown. An unfiled record is only ever closed from the
 * intake chain (index.js), where offers are also added, so its delete cannot remove a replacement
 * that arrived meanwhile; a filed record is never deleted.
 */
import { APPROVAL } from '../../contracts/constants.js'
import { ASKS, ASK_MISUSE, CARD_STATE } from './constants.js'

const STATES = new Set(Object.values(CARD_STATE))
const isText = (value) => typeof value === 'string'
/** An optional text field: a string, or `null` / absent (a record stored before F-FIX has none). */
const isOptionalText = (value) => value === undefined || value === null || isText(value)
const textOrNull = (value) => (isText(value) && value.trim() !== '' ? value : null)

/** Validates a stored record when the domain opens; a malformed one fails the open (as the ledger's). */
const recordSchema = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && [value.approvalId, value.offerId, value.eventId, value.sessionId, value.question].every(isText)
      && (value.sessionTitle === null || isText(value.sessionTitle)) && Array.isArray(value.choices) && value.choices.every(isText)
      && Number.isSafeInteger(value.askedAt) && STATES.has(value.state) && typeof value.filed === 'boolean'
      && (value.revision === undefined || value.revision === null || Number.isSafeInteger(value.revision))
      && [value.arguments, value.argumentsStatus, value.reason].every(isOptionalText)
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
  arguments: record.arguments ?? null,
  argumentsStatus: record.argumentsStatus ?? null,
  reason: record.reason ?? null,
  choices: Object.freeze([...record.choices]),
  askedAt: record.askedAt,
  state: record.state,
})

/**
 * The record an offer event becomes, or undefined when its payload is not K1's descriptor (K1's
 * schema was checked by the connector; this only guards the fields the card shows). The card's
 * `choices` are Q3 = A's Allow and Reject, whatever the descriptor lists; Reject alone when the
 * descriptor says the call's arguments are not complete, because the connector refuses an allow
 * then (`arguments-incomplete`), so Allow could never be committed (the user, 2026-11-17).
 * The arguments and the session's reason are shown on the card (the user, 2026-11-17: "Show
 * arguments and reason"), as the connector sent them.
 */
const incomplete = (status) => isText(status) && status !== APPROVAL.argumentsStatus.complete

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
    arguments: isText(descriptor.arguments) ? descriptor.arguments : null,
    argumentsStatus: isText(descriptor.argumentsStatus) ? descriptor.argumentsStatus : null,
    reason: textOrNull(descriptor.reason),
    choices: [...(incomplete(descriptor.argumentsStatus) ? ASKS.incompleteChoices : ASKS.choices)],
    revision: Number.isSafeInteger(event.offer?.revision) ? event.offer.revision : null,
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
  const isOffer = (offerId) => (record) => record.offerId === offerId
  /** Whether `next` is a newer offer of the request `current` holds (see the header). */
  const supersedes = (next, current) => current.state !== CARD_STATE.answered && current.offerId !== next.offerId
    && Number.isSafeInteger(next.revision) && Number.isSafeInteger(current.revision) && next.revision > current.revision

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
    /** Filed records, oldest request first. */
    cards: () => records().filter((record) => record.filed).sort((a, b) => a.askedAt - b.askedAt),
    wasClosed: (offerId) => closedOffers.has(offerId),

    /**
     * Records an offer. An unknown request is stored; a known one is replaced only by a newer offer
     * (see the header), decided inside the update so a filing queued meanwhile is seen. One this
     * process already closed and deleted (an unacked replay of it) is left out. After a restart
     * such a replay is recorded again as open: filing it then gives a card whose answer the
     * connector refuses `expired`, which closes it, so nothing is committed twice.
     */
    async add(record) {
      if (closedOffers.has(record.offerId)) return
      if (table.get(record.approvalId) === undefined) { await table.put(record.approvalId, record); return }
      let replaced
      await table.update(record.approvalId, (current) => {
        if (!supersedes(record, current)) return current
        replaced = current
        return record
      })
      if (replaced === undefined) return
      closedOffers.add(replaced.offerId)
      // A filed card the new offer replaced leaves the list until the model files the new offer.
      changed(replaced)
    },

    file: (approvalId, offerId) => move(approvalId, (current) => isOffer(offerId)(current) && isOpen(current) && !current.filed, { filed: true }),

    /** The committed answer on `offerId` wins over any close that arrived while it was in flight. */
    answered: (approvalId, offerId) => move(approvalId, (current) => isOffer(offerId)(current) && current.state !== CARD_STATE.answered, { state: CARD_STATE.answered }),

    /**
     * Closes an open record, whatever its offer (a settlement or retirement ends the request). The
     * close is the compare-and-set itself, so a filing queued before it is kept (closed, listed) and
     * one queued after it finds the request closed; only a record still unfiled after the close is
     * deleted (see the header).
     */
    close: (approvalId) => closeWhere(approvalId, isOpen),

    /** Closes the open record only while it still holds `offerId` (the connector refused that offer's answer). */
    closeOffer: (approvalId, offerId) => closeWhere(approvalId, (current) => isOffer(offerId)(current) && isOpen(current)),

    /** Deletes an open record only while it is unfiled and still holds `offerId`: a filing that won the race keeps its card open. */
    dropUnfiled: (approvalId, offerId) => closeWhere(approvalId, (current) => isOffer(offerId)(current) && isOpen(current) && !current.filed),

    /** Open, unfiled records: the startup reconciliation's candidates. */
    unfiled: () => records().filter((record) => isOpen(record) && !record.filed),

    /** The approvalId of the open record whose offer event is `eventId` (a retirement names the event). */
    approvalOfEvent: (eventId) => records().find((record) => record.eventId === eventId)?.approvalId,
  })
}
