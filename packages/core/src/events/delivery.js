/**
 * Core's delivery list: events accepted for the Fishball agent, held by core until the agent is
 * fully idle, then admitted by `Agent.followup` from inside `runMaintenance` (design §6.4,
 * R-EVT-03; spike V3-S2 `a499141` "hold, don't queue").
 *
 * WAKE (the user's design, 2026-11-21): events are handed over in batches, so Fishball, whose every
 * turn re-reads its whole context, is woken less often. Each event's class is read from the live
 * settings when it arrives (wake.js):
 * - a wake event joins the open buffer and restarts the quiet window; when the window passes with
 *   no new wake event, the buffer is sealed as one batch. A buffer holding the max batch of wake
 *   events is sealed at once and its message ends with the `TEXT.batchLimit` notice;
 * - a silent event joins the open buffer and touches no timer, so it never wakes Fishball by
 *   itself: it rides along, as one line of the `TEXT.silentSummary` block, with the next batch;
 * - the user's own message never waits: the first model step that carries one (`agent/pre-step`)
 *   takes every waiting event, sealed or open, as one batch message in front of it, so the events and
 *   the user's words are one model step (rule 5).
 * A sealed batch is fixed: events after it start the next one. It is delivered as ONE message,
 * whose id is its first record's own message id and whose source names every event it carries.
 * The ledger accounting is per record, as before: the batch's admission, discard or redelivery
 * applies to every record in it. Records recovered at a start, and a batch handed back by an owner
 * teardown, already waited their window: they are due at the next idle.
 *
 * Why hold instead of queueing into DSH's inbox: a `followup` queued on a busy agent is lost when
 * the user then stops cleanly or the owner disposes the agent (S2 rows 12, 13), and a restored
 * pending input never wakes by itself. Inside `runMaintenance` the followup only latches the wake;
 * the maintenance release starts the turn that claims it, so nothing else can claim it first.
 *
 * Whether an event was delivered is decided by core's own ledger alone (the user's decision
 * 2026-11-14 4.A): core never reads the Fishball session's log, so a cleared, compacted or
 * replaced session cannot make it wake Fishball twice. Core learns the admission live, from the
 * agent's own session events, and records `admitted` in its ledger. A `session/flush` listener
 * makes DSH's checkpoint before any model dispatch wait for that ledger write (the checkpoint
 * policy flushes before every model request, on both SDKs), so a crash after the model saw the
 * event always finds `admitted` at restart.
 *
 * Documented exceptions to R-EVT-03's "exactly one turn", accepted by the user (2026-11-14, rule
 * for edge cases normal use cannot reach):
 * - crash window (decision A): a crash after the session durably recorded the admission but before
 *   the ledger's `admitted` write was durable delivers the event once more after restart: two
 *   admissions, and the first reached no model (EVT-DT-03 row 9b);
 * - ledger write failure (A2): if the `admitted` write itself fails, it is logged and the flush
 *   still succeeds, so a later restart may wake Fishball for the event once more;
 * - inbox cleared by another owner (B1): every removal of a handed-over, unclaimed message from
 *   DSH's inbox counts as the user's and discards the event, including DSH's own teardown or an
 *   archive stop in the microtask between hand-over and claim. The inbox event carries no cause;
 * - a stale copy removed before recovery (11e stop, A): a copy an earlier process left pending in
 *   DSH's inbox, removed by the user before core's recovery subscribes to the agent, is unseen by
 *   core (it reads no log) and so delivered once more (EVT-ST-02 row 11e).
 */
import { freezeMessage } from '@deepseek-ai/dsh-llm'
import { MESSAGE, PRESENT_RETRY, REASON, STATE, TEXT, WAKE } from '../../contracts/constants.js'
import { HOST, LOG } from './constants.js'
import { codeOf } from './diagnostics.js'
import { createHandover } from './handover.js'
import { messageIdOf } from './ledger.js'
import { classOf, wakeSettings } from './wake.js'

/** The backoff (K3 PRESENT_RETRY, DECIDED D1) before attempt n + 1 of presenting an event (n is 1-based). */
const backoffAfter = (attempt) => PRESENT_RETRY.backoffMs * PRESENT_RETRY.backoffFactor ** (attempt - 1)

/** A timer that never keeps the process alive: a held event is delivered again at the next start. */
const realDelay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.() })

/** The global timers; each handle is unref'd where it is armed (see `arm`). */
const GLOBAL_TIMERS = Object.freeze({ setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle) })

/**
 * MULTI-1: every list and map here is keyed by the ledger record's local key (`record.key`,
 * ledger.js `recordKeyOf`); the raw `eventId` is only logged and shown.
 * @param options.ledger - the acceptance ledger (ledger.js).
 * @param options.fishball - the Fishball side's port:
 *   - `activate(): Promise<Agent>` resolves the manager session's live agent (creating or resuming
 *     it), as the chat row's `activate` does;
 *   - `present(event): ContentBlock[]` the model-facing content of one event (the X9 pipeline's
 *     framing; owned by the façade/wiring, not by this module).
 * @param options.logger - `{info, warn}` background log; never given payloads.
 * @param options.delay - `(ms) => Promise<void>`, the wait between presentation attempts.
 * @param options.live - `(source) => boolean`, whether an event's target epoch is current (MULTI-1,
 *   PLAN-MULTI §3.1, §5): a retired epoch's event is never handed to the model, not at recovery and
 *   not from the list, because the only tools under its target id now reach the replacement
 *   endpoint. It stays in the ledger as read-only history, in state `fishball`, undelivered.
 * @param options.batching - `() => {quietWindowSeconds, maxBatch, classes}`, the wake settings, read
 *   at each event so a change applies from the next one (wake.js checks them); default WAKE.defaults.
 * @param options.timers - `{setTimeout(fn, ms), clearTimeout(handle)}` for the quiet window; default
 *   the global ones.
 */
export function createDelivery({ ledger, fishball, logger, delay = realDelay, live = () => true, batching = () => WAKE.defaults, timers = GLOBAL_TIMERS }) {
  /**
   * record message id → key of every record in state `fishball` this generation knows: buffered,
   * sealed, backing off, handed over, or left pending in DSH's inbox by an earlier process. Every
   * one is watched, so whichever turn admits or discards it, core records that once.
   */
  const tracked = new Map()
  /** key → its class (`WAKE.class`), decided by the settings when it arrived. */
  const classes = new Map()
  /** The open buffer: keys in arrival order, not sealed yet. */
  const buffer = []
  /**
   * Sealed batches `{keys, limit?, message?}` waiting for a hand-over, oldest first; `limit` is the
   * max batch that cut it (its notice names that number, not a later setting's).
   */
  const due = []
  /** batch message id → a batch handed to the agent (its followup, or a user's step) and not settled. */
  const handed = new Map()
  /**
   * message id → keys of a batch copy an earlier process left pending in DSH's inbox (read from the
   * inbox's own pending list at recovery, never from the log): its admission or discard settles
   * every record it carries, and a hand-over of any of them removes it first.
   */
  const copies = new Map()
  /** key → failed presentation attempts so far (in memory: a restart starts again). */
  const failures = new Map()
  /** keys waiting out a presentation backoff; in no batch meanwhile. */
  const backingOff = new Set()
  /** keys whose content is the given-up notice (decision 3.A); their ledger reason says so. */
  const givenUp = new Set()
  /** Ledger writes of admissions not yet durable; the flush checkpoint waits for them. */
  const writes = new Set()
  let window
  let draining = false
  // A drain asked for while one runs; honoured as soon as that one ends, so no request is lost.
  let again = false
  let closed = false
  // Held while recovery runs, so no new hand-over races it, the order stays oldest first, and the
  // agent is activated once.
  let recovering = false

  const isTracked = (key) => tracked.has(messageIdOf(key))
  const isWake = (key) => classes.get(key) !== WAKE.class.silent
  const wakeCount = (keys) => keys.filter(isWake).length

  /** Every record key a message of core's carries, or undefined when the message is not core's. */
  function keysOf(messageId) {
    return handed.get(messageId)?.keys ?? copies.get(messageId) ?? (tracked.has(messageId) ? [tracked.get(messageId)] : undefined)
  }

  /** Start tracking a record; returns false when it was already tracked. */
  function track(key) {
    const messageId = messageIdOf(key)
    if (tracked.has(messageId)) return false
    tracked.set(messageId, key)
    classes.set(key, classOf(wakeSettings(batching()), ledger.get(key).event.type))
    return true
  }

  /** Take `key` out of `keys`, in place. */
  function drop(keys, key) {
    const index = keys.indexOf(key)
    if (index >= 0) keys.splice(index, 1)
    return index >= 0
  }

  /** Forget a record everywhere this generation holds it (a handed batch keeps its own list). */
  function untrack(key) {
    tracked.delete(messageIdOf(key))
    classes.delete(key)
    backingOff.delete(key)
    failures.delete(key)
    drop(buffer, key)
    // A sealed batch that lost a record is presented again from what is left.
    for (const batch of due) if (drop(batch.keys, key)) batch.message = undefined
  }

  function finish(key, state, reason) {
    const write = ledger.move(key, (current) => current.state === STATE.fishball, () => ({ state, reason })).then((won) => {
      if (!won) return
      const { eventId: raw, event: { type } } = ledger.get(key)
      if (state === STATE.admitted) logger?.info(LOG.admitted, raw, type)
      else logger?.info(LOG.discarded, raw, type, reason)
      // A2 (2026-11-14): a failed write is logged, never rethrown into the flush; see the header.
    }, (error) => logger?.warn(LOG.deliverFailed, ledger.get(key)?.eventId, codeOf(error)))
    writes.add(write)
    void write.finally(() => writes.delete(write))
    return write
  }

  /**
   * The end of one message of core's, observed live (never by reading the log, decision 4.A): the
   * same outcome for every record it carries. `reasonOf(key)` gives each record's ledger reason.
   */
  function settle(messageId, state, reasonOf) {
    const keys = (keysOf(messageId) ?? []).filter(isTracked)
    handed.delete(messageId)
    copies.delete(messageId)
    handover.forget(messageId)
    for (const key of keys) {
      const reason = reasonOf(key)
      untrack(key)
      void finish(key, state, reason)
    }
  }

  /**
   * A handed batch back to the head of the due list, to be handed over again at the next true idle
   * with its message as built, so it is not presented again. A copy of an earlier process needs
   * nothing more: its records were queued by recovery.
   */
  function redeliver(messageId) {
    const batch = handed.get(messageId)
    handed.delete(messageId)
    copies.delete(messageId)
    handover.forget(messageId)
    if (batch !== undefined) {
      const keys = batch.keys.filter(isTracked)
      // A user's step may have taken silent records only: those never wake Fishball by themselves.
      if (wakeCount(keys) === 0) buffer.unshift(...keys)
      else due.unshift({ keys, limit: batch.limit, message: keys.length === batch.keys.length ? batch.message : undefined })
    }
    void drain()
  }

  // ---------------------------------------------------------------- the buffer and its window

  function stopWindow() {
    if (window !== undefined) timers.clearTimeout(window)
    window = undefined
  }

  /** (Re)starts the quiet window; its end seals the buffer. */
  function arm(ms) {
    stopWindow()
    window = timers.setTimeout(() => { window = undefined; seal(); void drain() }, ms)
    window?.unref?.()
  }

  /** Seals the open buffer as one due batch; `limit`: the max batch it was cut at, if it was. */
  function seal(limit) {
    stopWindow()
    if (buffer.length > 0) due.push({ keys: buffer.splice(0), limit })
  }

  /**
   * One record joins the open buffer (the header's rules). With `wait` false (recovery) no window
   * is started: the caller seals what is left.
   * @returns whether the buffer was sealed at the max batch.
   */
  function collect(key, settings, wait) {
    buffer.push(key)
    if (!isWake(key)) return false
    if (wakeCount(buffer) >= settings.maxBatch) { seal(settings.maxBatch); return true }
    if (wait && settings.windowMs === 0) seal()
    else if (wait) arm(settings.windowMs)
    return false
  }

  /**
   * Follows the agent as soon as a buffer opens, so the user's next step sees the waiting events
   * (rule 5) even before core hands anything over. Activation is the chat row's, as for a hand-over.
   */
  async function follow(record) {
    try {
      const agent = await fishball.activate()
      if (!closed) handover.watch(agent)
    } catch (error) { logger?.warn(LOG.deliverFailed, record.eventId, codeOf(error)) }
  }

  /**
   * Silent records waiting in the open buffer ride along with the batch about to be handed over,
   * the next wake delivery (a batch whose message is already built keeps it, so nothing is
   * presented twice; they then go with the one after).
   */
  function absorbSilent(batch) {
    if (batch.message !== undefined) return
    const silent = buffer.filter((key) => !isWake(key))
    for (const key of silent) drop(buffer, key)
    batch.keys.push(...silent)
  }

  // ---------------------------------------------------------------- presentation

  /**
   * The model-facing content of one wake record. A presenter that throws is retried after the
   * PRESENT_RETRY backoff without blocking the events beside it: the record leaves its batch and
   * comes back as a due batch of its own. After the last attempt it is given up: one log line, and
   * Fishball gets a short notice naming it in its place (the user's decision 2026-11-14 3.A).
   * @returns {object[]|undefined} the content, or undefined when the record waits for a retry.
   */
  function contentOf(record) {
    try {
      const content = fishball.present(record.event)
      failures.delete(record.key)
      return content
    } catch (error) {
      const attempt = (failures.get(record.key) ?? 0) + 1
      failures.set(record.key, attempt)
      if (attempt < PRESENT_RETRY.attempts) {
        logger?.warn(LOG.presentFailed, record.eventId, record.event.type, codeOf(error))
        backingOff.add(record.key)
        void delay(backoffAfter(attempt)).then(() => {
          if (closed || !backingOff.delete(record.key) || ledger.get(record.key)?.state !== STATE.fishball) return
          due.push({ keys: [record.key] })
          void drain()
        })
        return undefined
      }
      failures.delete(record.key)
      givenUp.add(record.key)
      logger?.warn(LOG.presentGivenUp, record.eventId, record.event.type, REASON.presentGivenUp, codeOf(error))
      return [{ type: TEXT.blockType, text: TEXT.presentGivenUp(record.eventId, record.event.type) }]
    }
  }

  /** What a batch message's source says of one record (its key lets a later process settle it). */
  const referenceOf = (record) => ({ key: record.key, eventId: record.eventId, type: record.event.type, targetId: record.event.source.targetId })

  /**
   * The one message of a batch, built once and kept until handed over, so a busy agent that refuses
   * the hand-over never makes core present the same events again. Records retired meanwhile are
   * history and leave it (never presented); so do records waiting for a presentation retry.
   * With `needsWake` (a hand-over of core's own) a batch left with silent records only wakes
   * nobody: they go back to the open buffer, for the next wake event or user message.
   * @returns the frozen message, or undefined when there is nothing to hand over.
   */
  function messageOf(batch, needsWake) {
    if (batch.message !== undefined) return batch.message
    const content = []
    const kept = []
    for (const key of batch.keys.filter(isTracked)) {
      const record = ledger.get(key)
      if (!live(record.event.source)) { untrack(key); continue }
      if (!isWake(key)) { kept.push(record); continue }
      const blocks = contentOf(record)
      if (blocks !== undefined) { content.push(...blocks); kept.push(record) }
    }
    batch.keys = kept.map((record) => record.key)
    if (needsWake && wakeCount(batch.keys) === 0) buffer.unshift(...batch.keys.splice(0))
    if (batch.keys.length === 0) return undefined
    const silent = kept.filter((record) => !isWake(record.key))
    if (silent.length > 0) content.push({ type: TEXT.blockType, text: TEXT.silentSummary(silent.map((record) => TEXT.silentLine(record.event))) })
    if (batch.limit !== undefined) content.push({ type: TEXT.blockType, text: TEXT.batchLimit(batch.limit) })
    batch.message = freezeMessage({
      id: messageIdOf(kept[0].key),
      role: MESSAGE.role,
      content,
      source: { kind: MESSAGE.sourceKind, events: kept.map(referenceOf) },
    })
    return batch.message
  }

  /** Message ids a pending copy of an earlier process may carry for one batch's records. */
  function staleIdsOf(batch) {
    const keys = new Set(batch.keys)
    const ids = batch.keys.map(messageIdOf)
    for (const [id, carried] of copies) if (carried.some((key) => keys.has(key))) ids.push(id)
    return [...new Set(ids)]
  }

  /** Every waiting event, sealed or open, as one batch (the user's step takes them all, rule 5). */
  function takeAll() {
    seal()
    const batches = due.splice(0)
    return { keys: batches.flatMap((batch) => batch.keys), limit: batches.find((batch) => batch.limit !== undefined)?.limit }
  }

  /**
   * Rule 5 (`agent/pre-step`): a step that carries the user's own message (`HOST.userSource`) gets
   * every waiting event in front of it, in the same model step. The batch was never in the inbox,
   * so it is followed as a claim of that step's turn: its admission, or its turn's end, decides it.
   * A record a message of this very step already carries (an earlier process's copy) stays out.
   */
  async function preStep(agent, _payload, next) {
    const decision = await next()
    if (decision?.kind !== HOST.enter || closed || recovering) return decision
    if (!decision.messages.some((message) => message.source?.kind === HOST.userSource)) return decision
    const inStep = new Set(decision.messages.flatMap((message) => keysOf(message.id) ?? []))
    const batch = takeAll()
    batch.keys = batch.keys.filter((key) => !inStep.has(key))
    const message = messageOf(batch, false)
    if (message === undefined) return decision
    // The batch enters the step directly, never the inbox, so every pending copy goes, its own id's too.
    for (const id of staleIdsOf(batch)) { handover.removeCopy(agent, id); copies.delete(id) }
    handed.set(message.id, batch)
    handover.claim(agent, message.id)
    return { ...decision, messages: [message, ...decision.messages] }
  }

  /**
   * Each agent is followed through its live events (handover.js `createHandover`): an admission
   * ends every record of the message; a claim whose turn ended without admitting it is decided by
   * the turn's end; any removal from DSH's inbox but core's own is the user's (B1, 2026-11-14; see
   * the header). DSH's checkpoint before a model request (`session/flush`) waits for the admission
   * writes.
   */
  const handover = createHandover({
    isMine: (messageId) => keysOf(messageId) !== undefined,
    admitted: (messageId) => settle(messageId, STATE.admitted, (key) => (givenUp.delete(key) ? REASON.presentGivenUp : REASON.handled)),
    dropped: (messageId, reason) => settle(messageId, STATE.discarded, (key) => { givenUp.delete(key); return reason }),
    redeliver,
    idle: () => { void drain() },
    closed: () => closed,
    flush: () => Promise.all([...writes]),
    preStep,
  })

  /**
   * Hand the head due batch to the agent when it is truly idle. `runMaintenance` throws
   * synchronously unless nothing else owns the agent (public status also reads idle during someone
   * else's maintenance), so a refusal keeps the batch held until the next quiescence. One batch per
   * idle edge: each becomes its own next turn, never part of a running one (EVT-DT-03 rule 6); only
   * the user's own step takes waiting events into a running turn (rule 5, `preStep`).
   */
  async function drain() {
    // One drain at a time from start to hand-over: two would read the same head and present it
    // twice (the second presentation round of one event, EVT-ST-02 row 10b).
    if (draining) { again = true; return }
    if (closed || recovering || due.length === 0) return
    draining = true
    try { await handOverHead() } finally {
      draining = false
      if (again) { again = false; void drain() }
    }
  }

  /** Hand over the head due batch once; schedules the next drain itself when there is work. */
  async function handOverHead() {
    let agent
    try {
      agent = await fishball.activate()
    } catch (error) {
      // No retry timer (no requirement gives one): the next intake or idle edge drains again.
      logger?.warn(LOG.deliverFailed, ledger.get(due[0]?.keys[0])?.eventId, codeOf(error))
      return
    }
    // A close while activating: held events wait for the next owner's recovery rather than
    // entering an agent that is being disposed (S2 §2.2 owner teardown). The user's step may have
    // taken every due batch meanwhile.
    if (closed || due.length === 0) return
    handover.watch(agent)
    const batch = due[0]
    absorbSilent(batch)
    const message = messageOf(batch, true)
    if (message === undefined) { due.shift(); again = due.length > 0; return }
    // "Fully idle" is the true-idle claim of runMaintenance. Parked input is not waited for: in an
    // idle agent it never wakes by itself (S2 §2.1 item 3), so waiting would hold the batch forever.
    // Every copy an earlier generation left pending for these records is removed first.
    const stale = staleIdsOf(batch)
    handed.set(message.id, batch)
    const task = handover.handOver(agent, message, stale)
    if (task === undefined) { handed.delete(message.id); return }
    due.shift()
    for (const id of stale) if (id !== message.id) copies.delete(id)
    task.catch((error) => {
      logger?.warn(LOG.deliverFailed, ledger.get(batch.keys[0])?.eventId, codeOf(error))
      if (handed.get(message.id) === batch) redeliver(message.id)
    })
    if (due.length > 0) again = true
  }

  /**
   * The pending copies an earlier process left in the agent's inbox (its public pending lists, not
   * the log): a copy carrying a retired epoch's record is removed (it could join the next unrelated
   * turn), any other is remembered with the records it carries.
   */
  function readCopies(agent) {
    const pending = [...(agent.inbox?.nextTurn ?? []), ...(agent.inbox?.nextStep ?? [])]
    for (const message of pending) {
      const carried = message.source?.kind === MESSAGE.sourceKind && Array.isArray(message.source.events) ? message.source.events.map((ref) => ref?.key) : []
      const keys = carried.filter((key) => typeof key === 'string' && ledger.get(key)?.state === STATE.fishball)
      if (keys.some((key) => !live(ledger.get(key).event.source))) handover.removeCopy(agent, message.id)
      else if (keys.length > 0) copies.set(message.id, keys)
    }
  }

  return Object.freeze({
    /**
     * A record just accepted for Fishball (state `fishball`): buffered by its class (the header);
     * the first record of a buffer starts following the agent.
     */
    add(record) {
      if (closed || !track(record.key)) return
      if (buffer.length === 0) void follow(record)
      if (collect(record.key, wakeSettings(batching()), true) || window === undefined) void drain()
    },
    /**
     * Startup: every record still in state `fishball` was accepted for Fishball and not admitted,
     * by the ledger alone (decision 4.A), so it is delivered again once, oldest first, in batches
     * that are due at once (they already waited). Its id is tracked from now on, so a copy an
     * earlier process left pending in DSH's inbox is recorded whichever turn admits or discards it.
     * A record this generation already tracks (recovery just moved it here) joins the same batches.
     * Recovery activates the agent itself. If that fails, the records recovery queued (and only
     * those) are dropped from this run and wait for the next start, with no in-run retry (the
     * user's decision 2026-11-14 2.B).
     */
    async recover() {
      recovering = true
      const mine = []
      try {
        const retired = []
        for (const record of ledger.inOrder([STATE.fishball])) {
          if (!live(record.event.source)) retired.push(messageIdOf(record.key))
          else if (track(record.key)) mine.push(record.key)
        }
        if (closed || (tracked.size === 0 && retired.length === 0)) return
        try {
          const agent = await fishball.activate()
          if (closed) return
          // A restored inbox copy can join the next unrelated turn even if core never queues it.
          for (const id of retired) handover.removeCopy(agent, id)
          readCopies(agent)
          handover.watch(agent)
        } catch (error) {
          for (const key of mine) untrack(key)
          throw error
        }
        const waiting = [...takeAll().keys, ...mine].sort((a, b) => ledger.get(a).sequence - ledger.get(b).sequence)
        const settings = wakeSettings(batching())
        for (const key of new Set(waiting)) collect(key, settings, false)
        // Due at once, as they already waited; silent records alone stay buffered (they never wake).
        if (wakeCount(buffer) > 0) seal()
      } finally {
        recovering = false
        void drain()
      }
    },
    /**
     * Drops every waiting (buffered, sealed or backing-off) record of a retired target epoch
     * (`retired(source)`), so none is handed over later; one already handed to DSH is left to its
     * own outcome. Sends nothing.
     */
    retire(retired) {
      const waiting = [...buffer, ...due.flatMap((batch) => batch.keys), ...backingOff]
      for (const key of waiting) if (retired(ledger.get(key).event.source)) untrack(key)
      if (wakeCount(buffer) === 0) stopWindow()
    },
    /** Hold hand-overs while the interception's own recovery moves records here. */
    hold() { recovering = true },
    /** Stop delivering before the agent's owner disposes it (S2: teardown cancels queued input). */
    close() { closed = true; stopWindow() },
  })
}
