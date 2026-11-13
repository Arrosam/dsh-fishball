/**
 * Core's delivery list: events accepted for the Fishball agent, held by core until the agent is
 * fully idle, then admitted by `Agent.followup` from inside `runMaintenance` (design §6.4,
 * R-EVT-03; spike V3-S2 `a499141` "hold, don't queue").
 *
 * Why hold instead of queueing into DSH's inbox: a `followup` queued on a busy agent is lost when
 * the user then stops cleanly or the owner disposes the agent (S2 rows 12, 13), and a restored
 * pending input never wakes by itself. Inside `runMaintenance` the release claims the message on
 * the same JS stack, so the session log never holds "inserted, not claimed".
 *
 * Whether an event was delivered is decided by core's own ledger alone (the user's decision
 * 2026-11-14 4.A): core never reads the Fishball session's log, so a cleared, compacted or
 * replaced session cannot make it wake Fishball twice. Core learns the admission live, from the
 * agent's own session events, and records `admitted` in its ledger. A `session/flush` listener
 * makes DSH's checkpoint before any model dispatch wait for that ledger write (the checkpoint
 * policy flushes before every model request, on both SDKs), so a crash after the model saw the
 * event always finds `admitted` at restart. Remaining window, documented: a crash after the
 * admission was written to the session log but before the ledger write was durable, and before
 * any model dispatch, delivers the event once more after restart; the first admission then reached
 * no model.
 */
import { freezeMessage } from '@deepseek-ai/dsh-llm'
import { HOST, LOG, MESSAGE, PRESENT_RETRY, REASON, STATE, TEXT } from './constants.js'
import { codeOf } from './diagnostics.js'
import { messageIdOf } from './ledger.js'

const REDELIVER = Symbol('redeliver')

/**
 * What the end of the turn that claimed an event, before admitting it, means (the user's decision
 * 2026-11-14 1.B; S2-Q3 A). Such a claim reached no model (S2 §2.1 item 5).
 * - owner teardown (`aborted` by `disposed`, which is not the user's decision): deliver again;
 * - a user Stop: discard (S2-Q3 A);
 * - an error, a blocked step, a stop by a parent or a hook, or any other end: discard.
 * @returns {string|symbol} a REASON to discard with, or REDELIVER.
 */
function claimVerdict(end) {
  if (end?.kind === HOST.aborted && end.reason?.kind === HOST.causeDisposed) return REDELIVER
  return end?.kind === HOST.aborted && end.reason?.kind === HOST.causeUser ? REASON.userStopped : REASON.claimTurnEnded
}

/** The PROPOSED backoff before attempt n + 1 of presenting an event (n is 1-based). */
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
  /** messageId → eventId of every event handed to `followup` and not yet admitted or discarded. */
  const inflight = new Map()
  /** messageIds claimed by a turn that has not admitted them yet. */
  const claimed = new Set()
  /** eventId → failed presentation attempts so far (in memory: a restart starts again). */
  const failures = new Map()
  /** eventIds waiting out a presentation backoff; not in `queue` meanwhile. */
  const backingOff = new Set()
  /**
   * eventId → its frozen message, built once and kept until handed over, so a busy agent that
   * refuses the hand-over never makes core present the same event again.
   */
  const prepared = new Map()
  /** Ledger writes of admissions not yet durable; the flush checkpoint waits for them. */
  const writes = new Set()
  const watched = new WeakSet()
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

  function finish(eventId, state, reason) {
    const write = ledger.move(eventId, (current) => current.state === STATE.fishball, () => ({ state, reason })).then((won) => {
      if (!won) return
      const { type } = ledger.get(eventId).event
      if (state === STATE.admitted) logger?.info(LOG.admitted, eventId, type)
      else logger?.info(LOG.discarded, eventId, type, reason)
    }, (error) => logger?.warn(LOG.deliverFailed, eventId, codeOf(error)))
    writes.add(write)
    void write.finally(() => writes.delete(write))
    return write
  }

  /** Back to the head of the list, to be handed over again at the next true idle. */
  function redeliver(messageId) {
    const eventId = inflight.get(messageId)
    inflight.delete(messageId)
    claimed.delete(messageId)
    queue.unshift(eventId)
    void drain()
  }

  /** The end of one in-flight event, observed live (never by reading the log, decision 4.A). */
  function settleOne(messageId, state, reason) {
    const eventId = inflight.get(messageId)
    inflight.delete(messageId)
    claimed.delete(messageId)
    void finish(eventId, state, reason)
  }

  /**
   * One appended event of the agent's own session (dsh-session `session/event`): the admission
   * (`user/message` with our id) ends the event; the end of a turn that claimed it without
   * admitting it decides it by claimVerdict.
   */
  function observe(event) {
    if (event.type === HOST.userMessage && inflight.has(event.data?.id)) return settleOne(event.data.id, STATE.admitted, REASON.handled)
    if (event.type !== HOST.turnEnd) return undefined
    const verdict = claimVerdict(event.data?.reason)
    for (const messageId of [...claimed]) {
      if (verdict === REDELIVER) redeliver(messageId)
      else settleOne(messageId, STATE.discarded, verdict)
    }
    return undefined
  }

  /**
   * Follow one agent, all through its public live events (dsh-agent, both SDKs), never its log:
   * - `agent/inbox/claimed`: a turn took our message (it is admitted or its turn ends next);
   * - `agent/inbox/discarded`: removed from the inbox before admission, the user's (S2-Q3 A);
   * - `session/event`: the admission, and the claiming turn's end;
   * - `session/flush`: DSH's checkpoint before a model request waits for our admission writes;
   * - `agent/status` idle: the next hand-over.
   */
  function watch(agent) {
    if (watched.has(agent)) return
    watched.add(agent)
    const mine = (payload) => !closed && payload.agent === agent && inflight.has(payload.message?.id)
    agent.ctx.on(HOST.inboxClaimed, (payload) => { if (mine(payload)) claimed.add(payload.message.id) })
    agent.ctx.on(HOST.inboxDiscarded, (payload) => { if (mine(payload)) settleOne(payload.message.id, STATE.discarded, REASON.userStopped) })
    agent.ctx.on(HOST.sessionEvent, (session, event) => { if (!closed && session === agent.session) observe(event) })
    agent.ctx.on(HOST.sessionFlush, () => Promise.all([...writes]))
    agent.ctx.on(HOST.agentStatus, ({ status }) => { if (status === HOST.idle && !closed) void drain() })
  }

  /** Run `job` under the agent's true-idle maintenance, or retry once it is idle again. */
  function whenTrulyIdle(agent, job) {
    try {
      return agent.runMaintenance(job)
    } catch {
      // Another owner holds the agent (a turn, or another plugin's maintenance, which emits no
      // status edge); whenIdle follows both (dsh-agent runMaintenance contract).
      void agent.whenIdle().then(() => { if (!closed) void drain() })
      return undefined
    }
  }

  /**
   * The model-facing content of the head event. A presenter that throws is retried after the
   * PROPOSED backoff without blocking the events behind it; after the last attempt the event is
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
    watch(agent)
    const eventId = queue[0]
    if (!prepared.has(eventId)) {
      const record = ledger.get(eventId)
      const content = contentOf(record)
      if (content === undefined) { queue.shift(); again = true; return }
      prepared.set(eventId, messageOf(record, content))
    }
    const message = prepared.get(eventId)
    // "Fully idle" is the true-idle claim of runMaintenance. Parked input is not waited for: in an
    // idle agent it never wakes by itself (S2 §2.1 item 3), so waiting would hold the event forever.
    // A copy left pending by an earlier generation is removed first, so one id is pending once.
    const task = whenTrulyIdle(agent, async () => { agent.inbox.remove(message.id); agent.followup(message) })
    if (task === undefined) return
    queue.shift()
    prepared.delete(eventId)
    inflight.set(message.id, eventId)
    task.catch((error) => {
      inflight.delete(message.id)
      queue.unshift(eventId)
      logger?.warn(LOG.deliverFailed, eventId, codeOf(error))
    })
    if (queue.length > 0) again = true
  }

  return Object.freeze({
    /** A record just accepted for Fishball (state `fishball`); delivered at the next true idle. */
    add(record) {
      if (closed || queue.includes(record.eventId) || backingOff.has(record.eventId) || inflight.has(messageIdOf(record.eventId))) return
      queue.push(record.eventId)
      void drain()
    },
    /**
     * Startup: every record still in state `fishball` was accepted for Fishball and not admitted,
     * by the ledger alone (decision 4.A), so it is delivered again once, oldest first. A record
     * this generation already queued (recovery just moved it here) is not queued twice.
     * Recovery activates the agent itself. If that fails, recovery fails: the records it queued are
     * dropped from this run and wait for the next start, with no in-run retry (the user's decision
     * 2026-11-14 2.B). While recovery holds the list no intake runs, so the list holds only them.
     */
    async recover() {
      recovering = true
      try {
        for (const record of ledger.inOrder([STATE.fishball])) if (!queue.includes(record.eventId)) queue.push(record.eventId)
        if (queue.length === 0 || closed) return
        try {
          watch(await fishball.activate())
        } catch (error) {
          queue.length = 0
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
