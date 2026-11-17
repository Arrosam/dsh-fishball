/**
 * Core's delivery list: events accepted for the Fishball agent, held by core until the agent is
 * fully idle, then admitted by `Agent.followup` from inside `runMaintenance` (design §6.4,
 * R-EVT-03; spike V3-S2 `a499141` "hold, don't queue").
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
import { MESSAGE, PRESENT_RETRY, REASON, STATE, TEXT } from '../../contracts/constants.js'
import { LOG } from './constants.js'
import { codeOf } from './diagnostics.js'
import { createHandover } from './handover.js'
import { messageIdOf } from './ledger.js'

/** The backoff (K3 PRESENT_RETRY, DECIDED D1) before attempt n + 1 of presenting an event (n is 1-based). */
const backoffAfter = (attempt) => PRESENT_RETRY.backoffMs * PRESENT_RETRY.backoffFactor ** (attempt - 1)

/** A timer that never keeps the process alive: a held event is delivered again at the next start. */
const realDelay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.() })

/**
 * @param options.ledger - the acceptance ledger (ledger.js).
 * @param options.fishball - the Fishball side's port:
 *   - `activate(): Promise<Agent>` resolves the manager session's live agent (creating or resuming
 *     it), as the chat row's `activate` does;
 *   - `present(event): ContentBlock[]` the model-facing content of one event (the X9 pipeline's
 *     framing; owned by the façade/wiring, not by this module).
 * @param options.logger - `{info, warn}` background log; never given payloads.
 * @param options.delay - `(ms) => Promise<void>`, the wait between presentation attempts.
 */
export function createDelivery({ ledger, fishball, logger, delay = realDelay }) {
  /** eventIds accepted for Fishball, not yet handed to the agent, in arrival order. */
  const queue = []
  /**
   * messageId → eventId of every record in state `fishball` this generation knows: queued, backing
   * off, handed to `followup`, or left pending in DSH's inbox by an earlier process. Every one is
   * watched, so whichever turn admits or discards it, core records that once (review 2, finding 1).
   */
  const tracked = new Map()
  /** eventId → failed presentation attempts so far (in memory: a restart starts again). */
  const failures = new Map()
  /** eventIds waiting out a presentation backoff; not in `queue` meanwhile. */
  const backingOff = new Set()
  /**
   * eventId → its frozen message, built once and kept until handed over, so a busy agent that
   * refuses the hand-over never makes core present the same event again.
   */
  const prepared = new Map()
  /** eventIds whose message is the given-up notice (decision 3.A); their ledger reason says so. */
  const givenUp = new Set()
  /** Ledger writes of admissions not yet durable; the flush checkpoint waits for them. */
  const writes = new Set()
  let draining = false
  // A drain asked for while one runs; honoured as soon as that one ends, so no request is lost.
  let again = false
  let closed = false
  // Held while recovery runs, so no new hand-over races it, the order stays oldest first, and the
  // agent is activated once.
  let recovering = false

  const messageOf = (record, content) => freezeMessage({
    id: messageIdOf(record.eventId),
    role: MESSAGE.role,
    content,
    source: { kind: MESSAGE.sourceKind, eventId: record.eventId, type: record.event.type },
  })

  /** Start tracking a record's message id; returns false when it was already tracked. */
  function track(eventId) {
    const messageId = messageIdOf(eventId)
    if (tracked.has(messageId)) return false
    tracked.set(messageId, eventId)
    return true
  }

  /** Forget an event everywhere this generation holds it; returns its eventId. */
  function untrack(messageId) {
    const eventId = tracked.get(messageId)
    tracked.delete(messageId)
    handover.forget(messageId)
    prepared.delete(eventId)
    backingOff.delete(eventId)
    dequeue(eventId)
    return eventId
  }

  /** Take `eventId` off the list, wherever it is: a reentrant callback may have moved the head. */
  function dequeue(eventId) {
    const index = queue.indexOf(eventId)
    if (index >= 0) queue.splice(index, 1)
  }

  function finish(eventId, state, reason) {
    const write = ledger.move(eventId, (current) => current.state === STATE.fishball, () => ({ state, reason })).then((won) => {
      if (!won) return
      const { type } = ledger.get(eventId).event
      if (state === STATE.admitted) logger?.info(LOG.admitted, eventId, type)
      else logger?.info(LOG.discarded, eventId, type, reason)
      // A2 (2026-11-14): a failed write is logged, never rethrown into the flush; see the header.
    }, (error) => logger?.warn(LOG.deliverFailed, eventId, codeOf(error)))
    writes.add(write)
    void write.finally(() => writes.delete(write))
    return write
  }

  /**
   * Back to the head of the list, to be handed over again at the next true idle. Its message, if
   * already built, is kept, so it is not presented again.
   */
  function redeliver(eventId, message) {
    handover.forget(messageIdOf(eventId))
    if (message !== undefined) prepared.set(eventId, message)
    if (!queue.includes(eventId)) queue.unshift(eventId)
    void drain()
  }

  /** The end of one tracked event, observed live (never by reading the log, decision 4.A). */
  function settleOne(messageId, state, reason) {
    void finish(untrack(messageId), state, reason)
  }

  /**
   * Each agent is followed through its live events (handover.js `createHandover`): an admission
   * ends the event; a claim whose turn ended without admitting it is decided by the turn's end; any
   * removal from DSH's inbox but core's own is the user's (B1, 2026-11-14; see the header). DSH's
   * checkpoint before a model request (`session/flush`) waits for the admission writes.
   */
  const handover = createHandover({
    isMine: (messageId) => tracked.has(messageId),
    admitted(messageId) {
      const reason = givenUp.delete(tracked.get(messageId)) ? REASON.presentGivenUp : REASON.handled
      settleOne(messageId, STATE.admitted, reason)
    },
    dropped: (messageId, reason) => settleOne(messageId, STATE.discarded, reason),
    redeliver: (messageId) => redeliver(tracked.get(messageId)),
    idle: () => { void drain() },
    closed: () => closed,
    flush: () => Promise.all([...writes]),
  })

  /**
   * The model-facing content of the head event. A presenter that throws is retried after the
   * PRESENT_RETRY backoff without blocking the events behind it; after the last attempt the event is
   * given up: one log line, and Fishball gets a short notice naming it as its one wake (the user's
   * decision 2026-11-14 3.A).
   * @returns {object[]|undefined} the content, or undefined when the event waits for a retry.
   */
  function contentOf(record) {
    try {
      const content = fishball.present(record.event)
      failures.delete(record.eventId)
      return content
    } catch (error) {
      const attempt = (failures.get(record.eventId) ?? 0) + 1
      failures.set(record.eventId, attempt)
      if (attempt < PRESENT_RETRY.attempts) {
        logger?.warn(LOG.presentFailed, record.eventId, record.event.type, codeOf(error))
        backingOff.add(record.eventId)
        void delay(backoffAfter(attempt)).then(() => {
          backingOff.delete(record.eventId)
          if (closed || ledger.get(record.eventId)?.state !== STATE.fishball || queue.includes(record.eventId)) return
          queue.push(record.eventId)
          void drain()
        })
        return undefined
      }
      failures.delete(record.eventId)
      givenUp.add(record.eventId)
      logger?.warn(LOG.presentGivenUp, record.eventId, record.event.type, REASON.presentGivenUp, codeOf(error))
      return [{ type: TEXT.blockType, text: TEXT.presentGivenUp(record.eventId, record.event.type) }]
    }
  }

  /**
   * Hand the head of the list to the agent when it is truly idle. `runMaintenance` throws
   * synchronously unless nothing else owns the agent (public status also reads idle during someone
   * else's maintenance), so a refusal keeps the event held until the next quiescence. One event per
   * idle edge: each becomes its own next turn, never part of a running one (EVT-DT-03 rule 6).
   */
  async function drain() {
    // One drain at a time from start to hand-over: two would read the same head and present it
    // twice (the second presentation round of one event, EVT-ST-02 row 10b).
    if (draining) { again = true; return }
    if (closed || recovering || queue.length === 0) return
    draining = true
    try { await handOverHead() } finally {
      draining = false
      if (again) { again = false; void drain() }
    }
  }

  /** Hand over the head of the list once; schedules the next drain itself when there is work. */
  async function handOverHead() {
    let agent
    try {
      agent = await fishball.activate()
    } catch (error) {
      // No retry timer (no requirement gives one): the next intake or idle edge drains again.
      logger?.warn(LOG.deliverFailed, queue[0], codeOf(error))
      return
    }
    // A close while activating: held events wait for the next owner's recovery rather than
    // entering an agent that is being disposed (S2 §2.2 owner teardown).
    if (closed || queue.length === 0) return
    handover.watch(agent)
    const eventId = queue[0]
    if (!prepared.has(eventId)) {
      const record = ledger.get(eventId)
      const content = contentOf(record)
      if (content === undefined) { dequeue(eventId); again = true; return }
      prepared.set(eventId, messageOf(record, content))
    }
    const message = prepared.get(eventId)
    // "Fully idle" is the true-idle claim of runMaintenance. Parked input is not waited for: in an
    // idle agent it never wakes by itself (S2 §2.1 item 3), so waiting would hold the event forever.
    // A copy left pending by an earlier generation is removed first, so one id is pending once.
    const task = handover.handOver(agent, message)
    if (task === undefined) return
    dequeue(eventId)
    prepared.delete(eventId)
    task.catch((error) => {
      logger?.warn(LOG.deliverFailed, eventId, codeOf(error))
      if (tracked.has(message.id)) redeliver(eventId, message)
    })
    if (queue.length > 0) again = true
  }

  return Object.freeze({
    /** A record just accepted for Fishball (state `fishball`); delivered at the next true idle. */
    add(record) {
      if (closed || !track(record.eventId)) return
      queue.push(record.eventId)
      void drain()
    },
    /**
     * Startup: every record still in state `fishball` was accepted for Fishball and not admitted,
     * by the ledger alone (decision 4.A), so it is delivered again once, oldest first. Its id is
     * tracked from now on, so a copy an earlier process left pending in DSH's inbox is recorded
     * whichever turn admits or discards it. A record this generation already tracks (recovery
     * just moved it here) is not queued twice.
     * Recovery activates the agent itself. If that fails, the records recovery queued (and only
     * those) are dropped from this run and wait for the next start, with no in-run retry (the
     * user's decision 2026-11-14 2.B).
     */
    async recover() {
      recovering = true
      const mine = []
      try {
        for (const record of ledger.inOrder([STATE.fishball])) if (track(record.eventId)) { queue.push(record.eventId); mine.push(record.eventId) }
        if (queue.length === 0 || closed) return
        try {
          handover.watch(await fishball.activate())
        } catch (error) {
          for (const eventId of mine) untrack(messageIdOf(eventId))
          throw error
        }
        queue.sort((a, b) => ledger.get(a).sequence - ledger.get(b).sequence)
      } finally {
        recovering = false
        void drain()
      }
    },
    /** Hold hand-overs while the interception's own recovery moves records here. */
    hold() { recovering = true },
    /** Stop delivering before the agent's owner disposes it (S2: teardown cancels queued input). */
    close() { closed = true },
  })
}
