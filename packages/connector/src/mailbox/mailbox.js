/**
 * The per-pair durable mailbox (task C-MAILBOX; K1 `Mailbox` in `mcp-schema/index.d.ts`; design
 * §3.3, §3.4, §5.3; R-CON-03, R-CON-04, R-EVT-01/02/04, R-ID-06, R-TOK-05, R-EXT-18/19).
 *
 * - One box per principal key, and so per (token entry, bound id) pair. A box is never shared:
 *   every read and every write names its box, and a hint goes only to that box's own principal
 *   (EVT-EP-04, S1 F2, S7 §4.4).
 * - Every mutation runs on one serial chain. A commit's capacity check, its dedupe check and its
 *   sequence number therefore come from one consistent state, and two commits can never take one
 *   sequence. The domain's own write chain orders single writes only, not this
 *   read-check-write.
 * - Write order of a commit: the event record first, then the box's `head`. The commit is durable
 *   once the event record is. A crash before the head write is repaired from the events
 *   themselves (`headOf`), so no sequence is ever handed out twice.
 * - The hint is sent after the event is durable, in the same dispatch, before `commit` resolves
 *   (R-EVT-04). It is a hint only: a failing sink is logged and the event stays pollable
 *   (R-CON-04: "losing a notification loses no event").
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, MAILBOX, QUEUE, REFUSAL, RESOURCE, RESYNC_REASON,
} from '../../mcp-schema/index.js'
import { EMIT_REFUSAL } from '../../tools/index.js'
import { canonical } from '../digest.js'
import { EVENT_STATE, HASH, LOG, MISUSE, SAFE_KEY, START_SEQUENCE } from './constants.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import { assertDraft, contributorOf } from './draft.js'

const hash = (text) => createHash(HASH.algorithm).update(text).digest(HASH.encoding)
const ENDED = Object.freeze([EVENT_STATE.acked, EVENT_STATE.retired])

/** K1 QUEUE: past `maxQueuedInputs`, only these are refused `queue-full`; every other type always commits. */
const refusedWhenFull = (type) => QUEUE.refusedTypes.includes(type) || (QUEUE.contributedRefused && type.startsWith(CONTRIBUTED_TYPE_PREFIX))

function assertPrincipal(principalKey) {
  if (typeof principalKey !== 'string' || principalKey.length === 0) throw new TypeError(MISUSE.principalKey)
}

/**
 * @param {object} ports
 * @param {{boxes: object, events: object}} ports.tables - from `openMailboxTables`.
 * @param {{resourceUpdated(principalKey: string, uri: string): void}} ports.hints - C-HTTP's K1 `HintSink`.
 * @param {() => number} [ports.now] - the clock, in epoch milliseconds.
 * @param {() => string} [ports.newId] - a fresh path-safe id, used for event ids and generations.
 * @param {number} [ports.maxQueuedInputs] - the connector setting (design §3.4). Its default is K1's.
 * @param {{warn: Function}} [ports.logger] - the background log.
 * @returns the K1 `Mailbox` plus `expireHolds(now)` (Fishball 2026-11-14, item 7).
 */
export function createMailbox({ tables, hints, now = Date.now, newId = randomUUID, maxQueuedInputs = QUEUE.maxQueuedInputs, logger }) {
  if (!Number.isSafeInteger(maxQueuedInputs) || maxQueuedInputs < 1) throw new TypeError(MISUSE.maxQueuedInputs)
  const { boxes, events } = tables

  // In-memory index of event ids by box. It is derived from the durable table, which stays the
  // authority. Only this module writes the table, so the index cannot drift from it.
  const byBox = new Map()
  const idsOf = (boxKey) => {
    if (!byBox.has(boxKey)) byBox.set(boxKey, new Set())
    return byBox.get(boxKey)
  }
  for (const [eventId, record] of events.entries()) idsOf(record.boxKey).add(eventId)

  let chain = Promise.resolve()
  /** Runs `step` after every earlier mutation has settled. A failed step never blocks later ones. */
  function serial(step) {
    const run = chain.then(step)
    chain = run.catch(() => {})
    return run
  }

  const boxKeyOf = (principalKey) => hash(principalKey)
  const recordsOf = (boxKey) => [...idsOf(boxKey)].map((eventId) => events.get(eventId))
  const pendingOf = (boxKey) => recordsOf(boxKey).filter((record) => record.state === EVENT_STATE.pending)
    .sort((a, b) => a.event.sequence - b.event.sequence)
  /** The last sequence handed out. A crash between a commit's two writes leaves the event ahead of the stored head. */
  const headOf = (boxKey, box) => recordsOf(boxKey).reduce((head, record) => Math.max(head, record.event.sequence), box.head)

  function freshId() {
    const id = newId()
    if (typeof id !== 'string' || !SAFE_KEY.test(id)) throw new TypeError(MISUSE.eventKey)
    return id
  }

  /** The principal's box, created on first use with its one generation (Fishball 2026-11-14: no rule starts another). */
  async function boxOf(principalKey) {
    const boxKey = boxKeyOf(principalKey)
    const existing = boxes.get(boxKey)
    if (existing !== undefined) return { boxKey, box: existing }
    const box = { principalKey, generation: freshId(), head: START_SEQUENCE }
    await boxes.put(boxKey, box)
    return { boxKey, box }
  }

  function hint(principalKey) {
    try {
      hints.resourceUpdated(principalKey, RESOURCE.events.uri)
    } catch (error) {
      logger?.warn?.(LOG.hintFailed, error)
    }
  }

  /** Writes one event into `box`. A held box takes it and stays silent: its streams are closed (R-TOK-05). */
  async function append(principalKey, boxKey, box, draft) {
    const sequence = headOf(boxKey, box) + 1
    const eventId = freshId()
    const event = {
      eventId,
      mailboxGeneration: box.generation,
      sequence,
      type: draft.type,
      at: now(),
      sourceSessionId: draft.sourceSessionId,
      correlationId: draft.correlationId,
      ...(draft.offer === undefined ? {} : { offer: { offerId: draft.offer.offerId, revision: draft.offer.revision, decisionKind: draft.offer.decisionKind } }),
      payload: draft.payload,
      payloadDigest: hash(canonical(draft.payload)),
    }
    const record = { boxKey, state: EVENT_STATE.pending, event, ...(draft.dedupeKey === undefined ? {} : { dedupeKey: draft.dedupeKey }) }
    await events.put(eventId, record)
    idsOf(boxKey).add(eventId)
    await boxes.put(boxKey, { ...box, head: sequence })
    if (box.held === undefined) hint(principalKey)
    return eventId
  }

  /** A pending event from the same contributor with the same dedupe key (R-EXT-18). */
  const duplicateOf = (boxKey, draft) => draft.dedupeKey !== undefined && pendingOf(boxKey).some((record) => record.dedupeKey === draft.dedupeKey
    && contributorOf(record.event.type) === contributorOf(draft.type))

  /** Moves an ended event out after K1 `MAILBOX.ackedReceiptMs`. Until then its receipt makes a repeat ack a no-op. */
  async function prune(boxKey) {
    const cutoff = now() - MAILBOX.ackedReceiptMs
    for (const record of recordsOf(boxKey)) {
      if (ENDED.includes(record.state) && record.finishedAt < cutoff) await removeEvent(boxKey, record.event.eventId)
    }
  }

  async function removeEvent(boxKey, eventId) {
    await events.delete(eventId)
    idsOf(boxKey).delete(eventId)
  }

  const finish = (eventId, state) => events.update(eventId, (current) => ({ ...current, state, finishedAt: now() }))

  /** `limit` is a whole number of 1 to MAILBOX.pageMax, or absent. Outside that range it is `limit-exceeded`, never clamped (K1). */
  function pageSize(limit) {
    if (limit === undefined) return { size: MAILBOX.pageDefault }
    if (!Number.isSafeInteger(limit)) return { code: REFUSAL.invalidArguments }
    return limit < 1 || limit > MAILBOX.pageMax ? { code: REFUSAL.limitExceeded } : { size: limit }
  }

  /** The position a cursor names in `boxKey`'s box, or the refusal or resync it gets instead. */
  function positionOf(cursor, boxKey, box) {
    if (cursor === undefined) return { sequence: START_SEQUENCE }
    const parsed = decodeCursor(cursor)
    if (parsed === undefined) return { refusal: REFUSAL.invalidArguments }
    if (parsed.boxKey !== boxKey) return { refusal: REFUSAL.forbidden }
    if (parsed.generation !== box.generation) return { resync: { reason: RESYNC_REASON.staleCursor, headSequence: headOf(boxKey, box) } }
    return { sequence: parsed.sequence }
  }

  const receiptValid = (receipt) => receipt !== null && typeof receipt === 'object'
    && typeof receipt.eventId === 'string' && typeof receipt.payloadDigest === 'string'

  /** The ask events among `records` that will now never be answered: their correlation ids (R-TOK-05). */
  const asksOf = (records) => records.filter((record) => record.state === EVENT_STATE.pending && record.event.type === EVENT_TYPE.ask && record.event.correlationId !== null)
    .map((record) => record.event.correlationId)

  async function dropBox(boxKey, box, held) {
    const records = recordsOf(boxKey)
    for (const record of records) await removeEvent(boxKey, record.event.eventId)
    // The generation and the head stay (Fishball 2026-11-14 (b)). A dropped event's sequence is
    // never handed out again, and an old cursor still points into the same sequence.
    const { held: ignored, ...rest } = box
    await boxes.put(boxKey, { ...rest, head: headOf(boxKey, box), ...(held === undefined ? {} : { held }) })
    return Object.freeze(asksOf(records))
  }

  return Object.freeze({
    commit(recipient, draft) {
      assertPrincipal(recipient)
      assertDraft(draft)
      return serial(async () => {
        const { boxKey, box } = await boxOf(recipient)
        // K2 EMIT_CHECK_ORDER: a duplicate is answered before queue-full.
        if (duplicateOf(boxKey, draft)) return { ok: false, code: EMIT_REFUSAL.duplicate }
        if (refusedWhenFull(draft.type) && pendingOf(boxKey).length >= maxQueuedInputs) return { ok: false, code: REFUSAL.queueFull }
        return { ok: true, eventId: await append(recipient, boxKey, box, draft) }
      })
    },

    poll(principalKey, cursor, limit) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const page = pageSize(limit)
        if (page.code !== undefined) return { ok: false, code: page.code }
        const { boxKey, box } = await boxOf(principalKey)
        // A held box is not pollable (R-TOK-05). The entry's requests are refused before this point anyway.
        if (box.held !== undefined) return { ok: false, code: REFUSAL.forbidden }
        const position = positionOf(cursor, boxKey, box)
        if (position.refusal !== undefined) return { ok: false, code: position.refusal }
        if (position.resync !== undefined) return { ok: true, resync: position.resync }
        await prune(boxKey)
        const after = pendingOf(boxKey).filter((record) => record.event.sequence > position.sequence)
        const taken = after.slice(0, page.size)
        const last = taken.length > 0 ? taken[taken.length - 1].event.sequence : position.sequence
        return { ok: true, events: taken.map((record) => record.event), nextCursor: encodeCursor(boxKey, box.generation, last), hasMore: after.length > taken.length }
      })
    },

    ack(principalKey, receipts) {
      assertPrincipal(principalKey)
      return serial(async () => {
        if (!Array.isArray(receipts) || !receipts.every(receiptValid)) return { ok: false, code: REFUSAL.invalidArguments }
        const boxKey = boxKeyOf(principalKey)
        await prune(boxKey)
        // All or nothing (DECIDED #61): every receipt is checked before anything is written. The
        // first bad receipt, in list order, names the refusal (Fishball 2026-11-14, item 3).
        const toAck = new Set()
        for (const { eventId, payloadDigest } of receipts) {
          const record = events.get(eventId)
          // Another pair's event reads exactly as an unknown one (R-TOK-00).
          if (record === undefined || record.boxKey !== boxKey) return { ok: false, code: REFUSAL.unknownEvent }
          if (record.event.payloadDigest !== payloadDigest) return { ok: false, code: REFUSAL.digestMismatch }
          // Acked or retired: a no-op that counts 0 (EVT-ST-01 row 8; Fishball 2026-11-14 (a)).
          if (record.state === EVENT_STATE.pending) toAck.add(eventId)
        }
        for (const eventId of toAck) await finish(eventId, EVENT_STATE.acked)
        return { ok: true, acked: toAck.size }
      })
    },

    summary(principalKey) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const { boxKey, box } = await boxOf(principalKey)
        return { pending: pendingOf(boxKey).length, headSequence: headOf(boxKey, box), mailboxGeneration: box.generation }
      })
    },

    /**
     * The `retirement` names the retired event and keeps its session and correlation ids, so the
     * client can match it (Fishball 2026-11-14, item 6). An event that is not pending in this
     * box (acked, already retired, unknown) is left alone, and nothing is committed.
     */
    retire(principalKey, eventId, reason) {
      assertPrincipal(principalKey)
      const draft = { type: EVENT_TYPE.retirement, sourceSessionId: null, correlationId: null, payload: { retiredEventId: eventId, reason } }
      assertDraft(draft)
      return serial(async () => {
        const boxKey = boxKeyOf(principalKey)
        const record = events.get(eventId)
        if (record === undefined || record.boxKey !== boxKey || record.state !== EVENT_STATE.pending) return
        const { box } = await boxOf(principalKey)
        await finish(eventId, EVENT_STATE.retired)
        await append(principalKey, boxKey, box, { ...draft, sourceSessionId: record.event.sourceSessionId, correlationId: record.event.correlationId })
      })
    },

    /** Marks the box held. A repeat keeps the first `since`, so a second disable does not extend the 30 days (Fishball 2026-11-14 (b)). */
    hold(principalKey, at) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const { boxKey, box } = await boxOf(principalKey)
        if (box.held === undefined) await boxes.put(boxKey, { ...box, held: { since: at } })
      })
    },

    release(principalKey) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const boxKey = boxKeyOf(principalKey)
        const box = boxes.get(boxKey)
        if (box?.held === undefined) return
        const { held: ignored, ...rest } = box
        await boxes.put(boxKey, rest)
      })
    },

    drop(principalKey) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const { boxKey, box } = await boxOf(principalKey)
        return { droppedAsks: await dropBox(boxKey, box, undefined) }
      })
    },

    /**
     * Ends every hold that has lasted K1 `MAILBOX.disabledRetentionMs` at `at` (`at >= since +
     * retention`, K1's expiry convention). The held events are dropped as on delete (R-TOK-05),
     * and each dropped `ask` is reported, so C-REVOKE answers its asker `unavailable`. The box stays
     * held, marked expired: the entry is still disabled, and an expired hold is not dropped again.
     * Called explicitly by C-REVOKE; expiry is never lazy (Fishball 2026-11-14, item 7).
     * @returns {Promise<Array<{principalKey: string, droppedAsks: readonly string[]}>>}
     */
    expireHolds(at) {
      return serial(async () => {
        const expired = []
        for (const [boxKey, box] of boxes.entries()) {
          if (box.held === undefined || box.held.expired || at < box.held.since + MAILBOX.disabledRetentionMs) continue
          const droppedAsks = await dropBox(boxKey, box, { ...box.held, expired: true })
          expired.push(Object.freeze({ principalKey: box.principalKey, droppedAsks }))
        }
        return expired
      })
    },
  })
}
