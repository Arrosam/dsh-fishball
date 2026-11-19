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
 * - No sequence is ever handed out twice in a generation, or a client's cursor would skip an event
 *   silently (R-CON-03). A commit writes its event, then the box's `head`. If it crashes between
 *   the two, the head is repaired from the surviving events when the mailbox loads. The repaired
 *   head is written before any event is deleted, because the deleted event is the evidence.
 * - The hint is sent after the event is durable, in the same dispatch, before `commit` resolves
 *   (R-EVT-04). It is a hint only: a failing sink is logged and the event stays pollable
 *   (R-CON-04: "losing a notification loses no event").
 * - One `createMailbox` per opened tables handle. Its in-memory index is derived from the table at
 *   creation and kept in step only by its own writes; a second instance over the same tables would
 *   bypass the serial chain and drift.
 */
import { createHash, randomUUID } from 'node:crypto'
import {
  CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE, MAILBOX, QUEUE, REFUSAL, RESOURCE, RESYNC_REASON, RETIREMENT_REASON,
} from '../../mcp-schema/index.js'
import { EMIT_REFUSAL } from '../../tools/index.js'
import { canonical } from '../digest.js'
import { serialChain } from '../serial.js'
import { EVENT_STATE, HASH, LOG, MINIMUM, MISUSE, RETIRE_OUTCOME, SAFE_KEY, START_SEQUENCE } from './constants.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import { assertDraft, contributorOf, isNonEmptyString } from './draft.js'

const hash = (text) => createHash(HASH.algorithm).update(text).digest(HASH.encoding)

/** K1 QUEUE: past `maxQueuedInputs`, only these are refused `queue-full`; every other type always commits. */
const refusedWhenFull = (type) => QUEUE.refusedTypes.includes(type) || (QUEUE.contributedRefused && type.startsWith(CONTRIBUTED_TYPE_PREFIX))

function assertPrincipal(principalKey) {
  if (typeof principalKey !== 'string' || principalKey.length === 0) throw new TypeError(MISUSE.principalKey)
}

/** K1d-1: a synchronous TypeError, before the call is queued, for a bad key or the same key twice. */
function assertTransfer(from, to) {
  if (!isNonEmptyString(from) || !isNonEmptyString(to) || from === to) throw new TypeError(MISUSE.transfer)
}

/**
 * Every stored time must be a whole number of milliseconds (K1 WIRE). The storage domain validates
 * records only when it opens, so one bad value written today would make the whole mailbox domain
 * fail to open tomorrow.
 */
function assertTime(value) {
  if (!Number.isSafeInteger(value)) throw new TypeError(MISUSE.time)
  return value
}

/** A detached copy of a producer's draft; a value that cannot be copied is not a valid draft. */
function snapshotOf(draft) {
  try {
    return structuredClone(draft)
  } catch {
    throw new TypeError(MISUSE.draft)
  }
}

/** A `retirement` draft for `eventId`, checked as every draft is; the ids are the retired event's. */
function retirementDraft(eventId, reason) {
  const draft = { type: EVENT_TYPE.retirement, sourceSessionId: null, correlationId: null, payload: { retiredEventId: eventId, reason } }
  assertDraft(draft)
  return draft
}

/** The box record after the first expiry of its hold: still held (the entry is still disabled), now expired. */
const markExpired = (box) => ({ ...box, held: { ...box.held, expired: true } })

/**
 * @param {object} ports
 * @param {{boxes: object, events: object}} ports.tables - from `openMailboxTables`.
 * @param {{resourceUpdated(principalKey: string, uri: string): void}} ports.hints - C-HTTP's K1 `HintSink`.
 * @param {() => number} [ports.now] - the clock, in epoch milliseconds.
 * @param {() => string} [ports.newId] - a fresh path-safe id, used for event ids and generations.
 * @param {number | (() => number)} [ports.maxQueuedInputs] - the connector setting (design §3.4):
 *   a number, or a function read at each commit so a settings change applies live (C-WIRE-2: the
 *   no-recipient queue that read it live is gone, so the mailbox is now its only reader). Its
 *   default is K1's. A value that is not a whole number of at least 1 is a wiring bug (TypeError).
 * @param {{warn: Function}} [ports.logger] - the background log.
 * @returns the K1 `Mailbox` plus `expireHolds(now)` (Fishball 2026-11-14, item 7) and
 *   `stage(from, to)` (C-SUCCEED's staged transfer).
 */
export function createMailbox({ tables, hints, now = Date.now, newId = randomUUID, maxQueuedInputs = QUEUE.maxQueuedInputs, logger }) {
  const readBound = typeof maxQueuedInputs === 'function' ? maxQueuedInputs : () => maxQueuedInputs
  const queueBound = () => {
    const value = readBound()
    if (!Number.isSafeInteger(value) || value < MINIMUM.queuedInputs) throw new TypeError(MISUSE.maxQueuedInputs)
    return value
  }
  queueBound()
  const { boxes, events } = tables
  const clock = () => assertTime(now())
  // Only an error's name is logged: a sink's or the storage's message could name a principal key.
  // A throwing logger is swallowed too: a log line must never fail a write that is already durable.
  const warn = (line) => (error) => {
    try {
      logger?.warn?.(line, error?.name)
    } catch {
      // Nothing left to report it to.
    }
  }

  // The in-memory index, per box: pending event ids in sequence order (poll pages them), ended ones
  // (acked or retired, kept as receipts; in no particular order, nothing reads it in order), and the
  // last sequence handed out. It is derived from
  // the durable tables, which stay the authority, and saves every call a scan of all of a box's events.
  const index = new Map()
  function entryOf(boxKey) {
    let entry = index.get(boxKey)
    if (entry === undefined) {
      entry = { pending: new Set(), ended: new Set(), head: boxes.get(boxKey)?.head ?? START_SEQUENCE }
      index.set(boxKey, entry)
    }
    return entry
  }
  // Sorting once here means every later insertion is in sequence order, because new sequences only grow.
  const stored = [...events.entries()].sort(([, a], [, b]) => a.event.sequence - b.event.sequence)
  for (const [eventId, record] of stored) {
    const entry = entryOf(record.boxKey)
    ;(record.state === EVENT_STATE.pending ? entry.pending : entry.ended).add(eventId)
    entry.head = Math.max(entry.head, record.event.sequence)
  }

  /** Runs `step` after every earlier mutation has settled. A failed step never blocks later ones. */
  const serial = serialChain()

  const boxKeyOf = (principalKey) => hash(principalKey)
  const recordsIn = (ids) => [...ids].map((eventId) => events.get(eventId))

  /** Writes the in-memory head when the stored one is behind it (a commit that crashed before its head write). */
  async function persistHead(boxKey) {
    const box = boxes.get(boxKey)
    const { head } = entryOf(boxKey)
    if (box !== undefined && box.head < head) await boxes.put(boxKey, { ...box, head })
  }
  // The first step on the chain, so every call sees repaired heads. If the repair fails, the heads are
  // still right in memory, and the write is retried before the next delete in that box.
  serial(async () => { for (const boxKey of index.keys()) await persistHead(boxKey) }).catch(warn(LOG.headRepairFailed))

  function freshId() {
    const id = newId()
    if (typeof id !== 'string' || !SAFE_KEY.test(id)) throw new TypeError(MISUSE.id)
    return id
  }

  /**
   * The principal's box, created on first use with its one generation (K1 MAILBOX, DECIDED #W2-1).
   * Nothing else starts a generation: only a box record lost with its storage is created again.
   */
  async function boxOf(principalKey) {
    const boxKey = boxKeyOf(principalKey)
    const existing = boxes.get(boxKey)
    if (existing !== undefined) return { boxKey, box: existing }
    const box = { principalKey, generation: freshId(), head: entryOf(boxKey).head }
    await boxes.put(boxKey, box)
    return { boxKey, box }
  }

  const hintFailed = warn(LOG.hintFailed)
  function hint(principalKey) {
    try {
      const result = hints.resourceUpdated(principalKey, RESOURCE.events.uri)
      // HintSink returns nothing. If a sink returns a promise anyway, its rejection must not go unhandled.
      if (typeof result?.then === 'function') result.then(undefined, hintFailed)
    } catch (error) {
      hintFailed(error)
    }
  }

  /** Writes one event into the box. A held box takes it without a hint: its streams are closed (R-TOK-05). */
  async function append(principalKey, boxKey, draft) {
    const entry = entryOf(boxKey)
    const sequence = entry.head + 1
    const eventId = freshId()
    const at = clock()
    // `draft` is the commit's own snapshot (see `commit`), so the stored payload is detached from the producer.
    const { payload } = draft
    const event = {
      eventId,
      mailboxGeneration: boxes.get(boxKey).generation,
      sequence,
      type: draft.type,
      at,
      sourceSessionId: draft.sourceSessionId,
      correlationId: draft.correlationId,
      ...(draft.offer === undefined ? {} : { offer: { offerId: draft.offer.offerId, revision: draft.offer.revision, decisionKind: draft.offer.decisionKind } }),
      payload,
      payloadDigest: hash(canonical(payload)),
    }
    await events.put(eventId, {
      boxKey,
      state: EVENT_STATE.pending,
      event,
      ...(draft.dedupeKey === undefined ? {} : { dedupeKey: draft.dedupeKey }),
      ...(draft.activationTag === undefined ? {} : { activationTag: draft.activationTag }),
    })
    entry.pending.add(eventId)
    entry.head = sequence
    // The event is durable and pollable from here. A failed head write therefore fails nothing:
    // the head is right in memory and is repaired from the event at the next load (Fishball 2026-11-14, N1).
    await boxes.put(boxKey, { ...boxes.get(boxKey), head: sequence }).catch(warn(LOG.headWriteFailed))
    if (visibleNow(boxKey)) hint(principalKey)
    return eventId
  }

  /**
   * A pending event from the same contributor with the same dedupe key (R-EXT-18). It is checked within the
   * recipient's box only: the event limits are "per contributor and recipient" (R-EXT-18; Fishball 2026-11-14, S7).
   */
  const duplicateOf = (boxKey, draft) => draft.dedupeKey !== undefined && recordsIn(entryOf(boxKey).pending)
    .some((record) => record.dedupeKey === draft.dedupeKey && contributorOf(record.event.type) === contributorOf(draft.type))

  async function finish(boxKey, eventId, state, finishedAt) {
    await events.update(eventId, (current) => ({ ...current, state, finishedAt }))
    const entry = entryOf(boxKey)
    entry.pending.delete(eventId)
    entry.ended.add(eventId)
  }

  /**
   * Replaces one pending event by a `retirement` naming it. The retirement keeps the event's session
   * and correlation ids, so the client can match it (Fishball 2026-11-14, item 6).
   * The retirement is written first. A crash between the two writes then leaves the old event
   * pending next to its retirement, so the client still learns the offer is dead. The reverse
   * order could leave the old event retired with no retirement ever sent.
   */
  async function retireRecord(principalKey, boxKey, record, draft) {
    await append(principalKey, boxKey, { ...draft, sourceSessionId: record.event.sourceSessionId, correlationId: record.event.correlationId })
    await finish(boxKey, record.event.eventId, EVENT_STATE.retired, clock())
  }

  async function removeEvent(boxKey, eventId) {
    await events.delete(eventId)
    const entry = entryOf(boxKey)
    entry.pending.delete(eventId)
    entry.ended.delete(eventId)
  }

  /**
   * Forgets ended receipts once K1 `MAILBOX.ackedReceiptMs` has passed (`now >= finishedAt +
   * ackedReceiptMs`, K1's expiry convention). Until then a repeat ack of that event is a no-op success.
   */
  async function prune(boxKey) {
    const cutoff = clock() - MAILBOX.ackedReceiptMs
    const due = recordsIn(entryOf(boxKey).ended).filter((record) => record.finishedAt <= cutoff)
    if (due.length === 0) return
    await persistHead(boxKey)
    for (const record of due) await removeEvent(boxKey, record.event.eventId)
  }

  /** `limit` is a whole number of 1 to MAILBOX.pageMax, or absent. Outside that range it is `limit-exceeded`, never clamped (K1). */
  function pageSize(limit) {
    if (limit === undefined) return { size: MAILBOX.pageDefault }
    if (!Number.isSafeInteger(limit)) return { code: REFUSAL.invalidArguments }
    return limit < MINIMUM.pageSize || limit > MAILBOX.pageMax ? { code: REFUSAL.limitExceeded } : { size: limit }
  }

  /** The position a cursor names in `boxKey`'s box, or the refusal or resync it gets instead. */
  function positionOf(cursor, boxKey, box) {
    if (cursor === undefined) return { sequence: START_SEQUENCE }
    const parsed = decodeCursor(cursor)
    if (parsed === undefined) return { refusal: REFUSAL.invalidArguments }
    if (parsed.boxKey !== boxKey) return { refusal: REFUSAL.forbidden }
    const { head } = entryOf(boxKey)
    if (parsed.generation !== box.generation) return { resync: { reason: RESYNC_REASON.staleCursor, headSequence: head } }
    // This module never writes a position past its head, so such a cursor is forged (Fishball 2026-11-14, N11).
    if (parsed.sequence > head) return { refusal: REFUSAL.invalidArguments }
    return { sequence: parsed.sequence }
  }

  const receiptValid = (receipt) => receipt !== null && typeof receipt === 'object'
    && typeof receipt.eventId === 'string' && typeof receipt.payloadDigest === 'string'

  /**
   * The correlation ids of the pending `ask` events among `records` (R-TOK-05: their askers get
   * `unavailable`). An ask the client has already acked is not among them: an ack is not an answer, and
   * whether an ask is still open is C-ROUTE's and C-REVOKE's record, not this ledger's (Fishball 2026-11-14, S6).
   */
  const asksOf = (records) => records
    .filter((record) => record.state === EVENT_STATE.pending && record.event.type === EVENT_TYPE.ask && record.event.correlationId !== null)
    .map((record) => record.event.correlationId)

  /**
   * Deletes a box's events and returns the pending asks among them (R-TOK-05).
   * @param scope.through - only events up to this sequence: the head when the drop began, so a drop
   *   finished after a crash never takes an event committed after that crash.
   * @param scope.until - with a value, also only events committed at or before it; undefined means every
   *   event up to `through`.
   * @param scope.settle - the box record after the drop.
   * Crash-safe (Fishball 2026-11-14, S5): the head and the asks go into a durable `dropping` marker before
   * the first delete. A drop cut short is finished, with its asks still reported, by the next `drop` or
   * `expireHolds`. The generation and head are kept (Fishball 2026-11-14 (b)).
   */
  async function dropEvents(boxKey, { through, until, settle = (box) => box }) {
    const entry = entryOf(boxKey)
    const inScope = (record) => record.event.sequence <= through && (until === undefined || record.event.at <= until)
    const scope = recordsIn([...entry.pending, ...entry.ended]).filter(inScope)
    const before = boxes.get(boxKey)
    const asks = [...new Set([...(before.dropping?.asks ?? []), ...asksOf(scope)])]
    await boxes.put(boxKey, { ...before, head: entry.head, dropping: { asks, throughSequence: through, ...(until === undefined ? {} : { until }) } })
    for (const record of scope) await removeEvent(boxKey, record.event.eventId)
    const { dropping: ignored, ...rest } = boxes.get(boxKey)
    await boxes.put(boxKey, settle(rest))
    return Object.freeze([...asks])
  }

  /**
   * What `expireHolds(at)` does to one box: `undefined` (nothing), or the scope of a drop (`dropEvents`).
   * - The first expiry of a hold (`at >= since + disabledRetentionMs`) drops, once, every event committed
   *   up to that moment. An event committed later, even before C-REVOKE's call, is a later commit and
   *   lives 30 days from its own `at`, like the ones below.
   * - A box whose hold has expired is still held, because the entry is still disabled. Events committed to it
   *   since are dropped one by one, 30 days after their own commit (Fishball 2026-11-14, S8), so they cannot
   *   pile up without a limit.
   * - A drop cut short by a crash is finished over its recorded scope.
   */
  function expiryOf(boxKey, box, at) {
    const { held, dropping } = box
    const entry = entryOf(boxKey)
    // With `until`, time bounds the drop: an event committed after a crash is later than any `until`
    // already passed, so the current head is a safe `through`.
    if (held !== undefined && !held.expired && at >= held.since + MAILBOX.disabledRetentionMs) {
      return { through: entry.head, until: held.since + MAILBOX.disabledRetentionMs, settle: markExpired }
    }
    // An unbounded drop (`drop`, a delete) cut short: finish it over the sequences it began with.
    if (dropping !== undefined && dropping.until === undefined) return { through: dropping.throughSequence }
    const cutoff = held?.expired ? at - MAILBOX.disabledRetentionMs : undefined
    const due = cutoff !== undefined && recordsIn([...entry.pending, ...entry.ended]).some((record) => record.event.at <= cutoff)
    if (dropping === undefined && !due) return undefined
    return { through: entry.head, until: Math.max(...[cutoff, dropping?.until].filter((value) => value !== undefined)) }
  }

  /**
   * Whether a new event in the box is pollable now, so its streams get the hint: not while the box
   * is held (its streams are closed, R-TOK-05) nor while a staged transfer hides it (`stage`).
   */
  const visibleNow = (boxKey) => boxes.get(boxKey).held === undefined && index.get(boxKey)?.barrier === undefined

  /** Whether `record` is at or past the staging barrier of its box (`stage`), so not visible yet. */
  const behindBarrier = (boxKey, record) => {
    const barrier = index.get(boxKey)?.barrier
    return barrier !== undefined && record.event.sequence >= barrier
  }

  /**
   * Moves pending events of `from`'s box (all, or only those in `only`) to `to`'s, in sequence
   * order after `to`'s own (K1d-1): same `eventId`, `type`, `at`, ids, `offer`, payload and
   * digest; the sequence and the generation become `to`'s. Each event is rewritten in place under
   * its own record key, so a crash halfway leaves every event in exactly one box, and a repeat
   * moves the rest. Acked and retired events stay behind as receipts; nothing is committed, the
   * destination's `maxQueuedInputs` refuses nothing and neither box's hold changes. `to`'s streams
   * get one hint when something moved and its box is not held. A failed write moves nothing (K1d):
   * the events already moved are written back to `from`'s box as they were (`moveBack`), and the
   * call rejects. Only a crash in between can leave the move half done; each event is then in one
   * box, and a repeat moves the rest. `to`'s head keeps the sequences handed out, so none is reused.
   * Runs inside a serial step.
   * @returns the moved event ids, in order
   */
  async function moveEvents(from, to, only) {
    const fromKey = boxKeyOf(from)
    const moving = recordsIn(entryOf(fromKey).pending).filter((record) => only === undefined || only.has(record.event.eventId))
    if (moving.length === 0) return []
    const { boxKey: toKey } = await boxOf(to)
    const source = entryOf(fromKey)
    const target = entryOf(toKey)
    const moved = []
    try {
      for (const record of moving) {
        const sequence = target.head + 1
        const event = { ...record.event, mailboxGeneration: boxes.get(toKey).generation, sequence }
        await events.put(event.eventId, { ...record, boxKey: toKey, event })
        source.pending.delete(event.eventId)
        target.pending.add(event.eventId)
        target.head = sequence
        moved.push(record)
      }
    } catch (error) {
      await moveBack(moved, source, target)
      throw error
    } finally {
      // As in `append`: a failed head write is repaired at load from the surviving events.
      if (moved.length > 0) await boxes.put(toKey, { ...boxes.get(toKey), head: target.head }).catch(warn(LOG.headWriteFailed))
    }
    if (visibleNow(toKey)) hint(to)
    return moved.map((record) => record.event.eventId)
  }

  /**
   * A failed transfer's compensation: each moved record is written back as it was before the move
   * (its own box, sequence and generation). A write-back that fails too is logged and leaves that
   * event in `to`'s box, pending and delivered once from there; the rest still go back.
   */
  async function moveBack(records, source, target) {
    for (const record of records) {
      try {
        await events.put(record.event.eventId, record)
        target.pending.delete(record.event.eventId)
        source.pending.add(record.event.eventId)
      } catch (error) {
        warn(LOG.transferUndoFailed)(error)
      }
    }
    // `pending` is iterated in sequence order (see the index above): re-sort what came back.
    const restored = recordsIn(source.pending).sort((a, b) => a.event.sequence - b.event.sequence).map((record) => record.event.eventId)
    source.pending.clear()
    for (const eventId of restored) source.pending.add(eventId)
  }

  return Object.freeze({
    commit(recipient, producerDraft) {
      assertPrincipal(recipient)
      // One snapshot, taken now: it is what is checked and what is stored. The table keeps the stored
      // object itself and the step may run later, so a producer that changes its draft after calling
      // must change neither what was validated nor an event whose identity is fixed (R-EVT-02).
      const draft = snapshotOf(producerDraft)
      assertDraft(draft)
      return serial(async () => {
        const { boxKey } = await boxOf(recipient)
        // K2 EMIT_CHECK_ORDER: a duplicate is answered before queue-full.
        if (duplicateOf(boxKey, draft)) return { ok: false, code: EMIT_REFUSAL.duplicate }
        if (refusedWhenFull(draft.type) && entryOf(boxKey).pending.size >= queueBound()) return { ok: false, code: REFUSAL.queueFull }
        return { ok: true, eventId: await append(recipient, boxKey, draft) }
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
        const taken = []
        let hasMore = false
        for (const record of recordsIn(entryOf(boxKey).pending)) {
          if (record.event.sequence <= position.sequence) continue
          // A staged succession (`stage`) is not visible yet: nothing at or past its barrier is
          // handed out, so the cursor never passes an event that may still move back.
          if (behindBarrier(boxKey, record)) break
          if (taken.length === page.size) {
            hasMore = true
            break
          }
          taken.push(record.event)
        }
        const last = taken.length > 0 ? taken[taken.length - 1].sequence : position.sequence
        // Copies, so a caller cannot change the stored event under its fixed identity (R-EVT-02).
        return { ok: true, events: taken.map((event) => structuredClone(event)), nextCursor: encodeCursor(boxKey, box.generation, last), hasMore }
      })
    },

    ack(principalKey, receipts) {
      assertPrincipal(principalKey)
      return serial(async () => {
        if (!Array.isArray(receipts)) return { ok: false, code: REFUSAL.invalidArguments }
        const boxKey = boxKeyOf(principalKey)
        // Expired receipts go first, so a receipt older than MAILBOX.ackedReceiptMs reads as unknown.
        await prune(boxKey)
        // All or nothing (DECIDED #61): every receipt is checked before any event is acked. The first bad
        // receipt, in list order, names the refusal (Fishball 2026-11-14, item 3).
        const toAck = new Set()
        for (const receipt of receipts) {
          if (!receiptValid(receipt)) return { ok: false, code: REFUSAL.invalidArguments }
          const record = events.get(receipt.eventId)
          // Another pair's event reads exactly as an unknown one (R-TOK-00).
          // An event behind a staging barrier was never handed out to this pair, so it reads as unknown.
          if (record === undefined || record.boxKey !== boxKey || behindBarrier(boxKey, record)) return { ok: false, code: REFUSAL.unknownEvent }
          if (record.event.payloadDigest !== receipt.payloadDigest) return { ok: false, code: REFUSAL.digestMismatch }
          // Acked or retired: a no-op that counts 0 (EVT-ST-01 row 8; Fishball 2026-11-14 (a)).
          if (record.state === EVENT_STATE.pending) toAck.add(receipt.eventId)
        }
        const finishedAt = clock()
        // If a storage write fails partway, the receipts before it stay acked. A retry of the same call is
        // still safe: they count 0 the second time.
        for (const eventId of toAck) await finish(boxKey, eventId, EVENT_STATE.acked, finishedAt)
        return { ok: true, acked: toAck.size }
      })
    },

    summary(principalKey) {
      assertPrincipal(principalKey)
      return serial(async () => {
        const { boxKey, box } = await boxOf(principalKey)
        const entry = entryOf(boxKey)
        return { pending: entry.pending.size, headSequence: entry.head, mailboxGeneration: box.generation }
      })
    },

    /**
     * Resolves `{retired: true}` once the pending event is replaced (`retireRecord`). An event that
     * is not pending in this box (acked, already retired, unknown, another box's) is left alone,
     * nothing is committed, and it resolves `{retired: false}` (K1 amendment at the W3 merge), so a
     * caller whose event may have been acked meanwhile knows to tell the pair itself.
     */
    retire(principalKey, eventId, reason) {
      assertPrincipal(principalKey)
      const draft = retirementDraft(eventId, reason)
      return serial(async () => {
        // No box is created here: a pending event in this box means the box exists already.
        const boxKey = boxKeyOf(principalKey)
        const record = events.get(eventId)
        if (record === undefined || record.boxKey !== boxKey || record.state !== EVENT_STATE.pending) return RETIRE_OUTCOME.notRetired
        await retireRecord(principalKey, boxKey, record, draft)
        return RETIRE_OUTCOME.retired
      })
    },

    /**
     * Retires every pending event of `namespace` committed with `activationTag`, in every box, held
     * ones included (K1 `retireContributor`, R-EXT-19). C-EXT calls it once per withdrawn or
     * quarantined activation instead of keeping one retire per committed event. It scans the
     * pending index only, so its cost is the pending events, which QUEUE.maxQueuedInputs bounds per box.
     * One box's failure does not stop the others, as in `expireHolds`: it is logged, every other box
     * is still retired, and the call then rejects, so the caller knows a retry is needed; a repeat
     * retires only what is still pending.
     */
    retireContributor(namespace, activationTag) {
      if (!isNonEmptyString(namespace) || !isNonEmptyString(activationTag)) throw new TypeError(MISUSE.contributor)
      const draftFor = (record) => retirementDraft(record.event.eventId, RETIREMENT_REASON.contributorWithdrawn)
      return serial(async () => {
        let failure
        for (const [boxKey, entry] of index) {
          const matching = recordsIn(entry.pending)
            .filter((record) => record.activationTag === activationTag && contributorOf(record.event.type) === namespace)
          // A box with pending events has its record: `append` writes the event only into a box that exists.
          if (matching.length === 0) continue
          const { principalKey } = boxes.get(boxKey)
          try {
            for (const record of matching) await retireRecord(principalKey, boxKey, record, draftFor(record))
          } catch (error) {
            warn(LOG.retireContributorFailed)(error)
            failure ??= error
          }
        }
        if (failure !== undefined) throw failure
      })
    },

    /** Marks the box held. A repeat keeps the first `since`, so a second disable does not extend the 30 days (Fishball 2026-11-14 (b)). */
    hold(principalKey, at) {
      assertPrincipal(principalKey)
      assertTime(at)
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
        const { boxKey } = await boxOf(principalKey)
        return { droppedAsks: await dropEvents(boxKey, { through: entryOf(boxKey).head }) }
      })
    },

    /**
     * Reinstall succession's event move (K1d-1, R-HOST-09 step 5; task C-SUCCEED); see `moveEvents`.
     */
    transfer(from, to) {
      assertTransfer(from, to)
      return serial(async () => Object.freeze({ moved: (await moveEvents(from, to)).length }))
    },

    /**
     * Not K1 (as `expireHolds`; C-SUCCEED): `transfer` staged for a succession that may still fail
     * (routing `succeedPrincipal`). In one serial step it sets a **barrier** in `to`'s box at its
     * next sequence, then moves `from`'s pending events in as `transfer` does. Until `confirm` or
     * `undo`, `poll` stops at the barrier and `ack` treats what lies past it as unknown, so `to`
     * can neither see nor ack a moved event, nor anything committed to it meanwhile.
     * - `commit(draft)`: an event committed into `to`'s box past the barrier (the succession's
     *   re-issued offers); `undo` removes it again, so it is never seen if the succession fails.
     * - `confirm()`: lifts the barrier (synchronous, cannot fail) and sends `to` its hint.
     * - `undo(sourceSessions)`: removes the staged commits, moves the transferred events that are
     *   still pending back to `from`, and moves back every other event committed to `to` past the
     *   barrier whose `sourceSessionId` is one of `sourceSessions` (routed to `to` because of the
     *   succession's own state); then lifts the barrier. Every `to`'s own earlier event stays.
     * The barrier is in memory: a crash while staged leaves each event in one box and visible, and
     * the instance's next `retire` moves the rest (K1d "a repeat moves the rest").
     * @returns `{movedIds, commit, confirm, undo}`
     * @throws TypeError (synchronously) as `transfer`; (rejects) TypeError when `to` is staged already
     */
    stage(from, to) {
      assertTransfer(from, to)
      return serial(async () => {
        const { boxKey: toKey } = await boxOf(to)
        const target = entryOf(toKey)
        if (target.barrier !== undefined) throw new TypeError(MISUSE.staged)
        const barrier = target.head + 1
        target.barrier = barrier
        let movedIds
        try {
          movedIds = Object.freeze(await moveEvents(from, to))
        } catch (error) {
          target.barrier = undefined
          throw error
        }
        const added = new Set()
        const lift = () => { target.barrier = undefined }
        return Object.freeze({
          movedIds,
          commit(producerDraft) {
            const draft = snapshotOf(producerDraft)
            assertDraft(draft)
            return serial(async () => {
              const eventId = await append(to, toKey, draft)
              added.add(eventId)
              return eventId
            })
          },
          confirm() {
            lift()
            if (visibleNow(toKey)) hint(to)
          },
          undo: (sourceSessions) => serial(async () => {
            try {
              // The head is written before any delete, as `prune` does: the deleted event is its evidence.
              await persistHead(toKey)
              for (const eventId of added) await removeEvent(toKey, eventId)
              const routedHere = recordsIn(target.pending)
                .filter((record) => record.event.sequence >= barrier && sourceSessions.includes(record.event.sourceSessionId))
              await moveEvents(to, from, new Set([...movedIds, ...routedHere.map((record) => record.event.eventId)]))
            } finally {
              lift()
            }
          }),
        })
      })
    },

    /**
     * Applies hold expiry at `at` (`expiryOf`): the events it drops are gone as on delete (R-TOK-05),
     * and each dropped `ask` is reported, so C-REVOKE answers its asker `unavailable`. Called explicitly by
     * C-REVOKE; expiry is never lazy (Fishball 2026-11-14, item 7).
     * @returns {Promise<Array<{principalKey: string, droppedAsks: readonly string[]}>>} one entry per box it dropped from;
     *   a box whose drop failed is logged, left out, and finished by a later call.
     */
    expireHolds(at) {
      assertTime(at)
      return serial(async () => {
        const expired = []
        for (const [boxKey, box] of [...boxes.entries()]) {
          const job = expiryOf(boxKey, box, at)
          if (job === undefined) continue
          // One box's failure must not lose the asks other boxes already dropped: their markers are
          // cleared, so this answer is the only place those asks are reported. A failed box keeps its
          // marker, and the next call finishes it.
          try {
            const droppedAsks = await dropEvents(boxKey, job)
            expired.push(Object.freeze({ principalKey: box.principalKey, droppedAsks }))
          } catch (error) {
            warn(LOG.expiryFailed)(error)
          }
        }
        return expired
      })
    },
  })
}
