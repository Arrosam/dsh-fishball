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
 * Whether an accepted event reached the agent is DERIVED from the durable session log by the
 * event's stable message id, never from a "woken" bit written before or after the wake (S2 §2.2,
 * MCP-S2 §4.2: a bit is wrong on one side of the crash either way).
 */
import { freezeMessage } from '@deepseek-ai/dsh-llm'
import { DELIVERY, HOST, LOG, MESSAGE, REASON, STATE } from './constants.js'
import { codeOf } from './diagnostics.js'
import { messageIdOf } from './ledger.js'

/**
 * Where one message id stands in a session log (S2 `classify`). Removals carry only a position,
 * so the pending lists are rebuilt from the ordered `agent/inbox/spliced` events.
 * @returns {{state: string, claimTurnEnd: object|undefined}} `claimTurnEnd` is the `turn/end`
 *   reason of the turn that claimed it (`{kind}`, and `{kind: 'aborted', reason: {kind}}` for a
 *   cancellation), or undefined while that turn has not ended.
 */
export function classify(events, messageId) {
  const lists = Object.fromEntries(HOST.inboxTargets.map((target) => [target, []]))
  let last = DELIVERY.absent
  let admitted = false
  let claimTurnEnd
  let awaitingEnd = false
  for (const event of events) {
    if (awaitingEnd && event.type === HOST.turnEnd) { claimTurnEnd = event.data?.reason; awaitingEnd = false }
    if (event.type === HOST.userMessage && event.data?.id === messageId) admitted = true
    if (event.type !== HOST.inboxSpliced) continue
    const { target, start, removedCount = 0, inserted = [], outcome } = event.data
    const removed = (lists[target] ??= []).splice(start, removedCount, ...inserted)
    if (inserted.some((item) => item.id === messageId)) last = DELIVERY.pending
    if (!removed.some((item) => item.id === messageId)) continue
    if (outcome === HOST.canceled) last = DELIVERY.canceled
    else { last = DELIVERY.claimed; awaitingEnd = true; claimTurnEnd = undefined }
  }
  return { state: admitted ? DELIVERY.admitted : last, claimTurnEnd }
}

/**
 * @param options.ledger - the acceptance ledger (ledger.js).
 * @param options.fishball - the Fishball side's port:
 *   - `activate(): Promise<Agent>` resolves the manager session's live agent (creating or resuming
 *     it), as the chat row's `activate` does;
 *   - `present(event): ContentBlock[]` the model-facing content of one event (the X9 pipeline's
 *     framing; owned by the façade/wiring, not by this module).
 * @param options.logger - `{info, warn}` background log; never given payloads.
 */
/**
 * What a claim without an admission means (S2 §2.1 item 5: the checkpoint flushes the admission
 * before any model dispatch, so such a claim dispatched nothing).
 * - not ended yet: wait;
 * - `interrupted` (a crash) or `aborted` by `disposed` (owner teardown or a graceful stop, which
 *   is not the user's decision): re-deliver;
 * - `aborted` by `user`: the user's Stop wins, discard (S2-Q3 A);
 * - any other end: discard as `claim-turn-ended`, pending a user decision (REASON.claimTurnEnded).
 * @returns {string|symbol|undefined} a REASON to discard with, REDELIVER, or undefined to wait.
 */
const REDELIVER = Symbol('redeliver')
const PENDING = Symbol('pending')
const WAIT = Symbol('wait')
const DONE = Symbol('done')
function claimVerdict(end) {
  if (end === undefined) return undefined
  if (end.kind === HOST.interrupted || (end.kind === HOST.aborted && end.reason?.kind === HOST.causeDisposed)) return REDELIVER
  return end.kind === HOST.aborted && end.reason?.kind === HOST.causeUser ? REASON.userStopped : REASON.claimTurnEnded
}

export function createDelivery({ ledger, fishball, logger }) {
  /** eventIds accepted for Fishball, not yet handed to the agent, in arrival order. */
  const queue = []
  /** eventIds handed to `followup`, waiting for the log to show admission or a discard. */
  const inflight = new Set()
  const watched = new WeakSet()
  let draining = false
  let closed = false
  // Held while recover() reconciles the previous generation, so no new hand-over races it, the
  // order stays oldest first, and the agent is activated once (review finding 7).
  let recovering = false

  const messageOf = (record) => freezeMessage({
    id: messageIdOf(record.eventId),
    role: MESSAGE.role,
    content: fishball.present(record.event),
    source: { kind: MESSAGE.sourceKind, eventId: record.eventId, type: record.event.type },
  })

  async function finish(record, state, reason) {
    const won = await ledger.move(record.eventId, (current) => current.state === STATE.fishball, () => ({ state, reason }))
    inflight.delete(record.eventId)
    if (!won) return
    if (state === STATE.admitted) logger?.info(LOG.admitted, record.eventId, record.event.type)
    else logger?.info(LOG.discarded, record.eventId, record.event.type, reason)
  }

  /**
   * The session log the classification reads. `snapshotEvents()` is marked deprecated for new
   * calls on both SDKs, and it is the only synchronous read of the full log both offer; the S2
   * spike reconciled from the same read. Its use is an open question for the user (review
   * 2026-11-14); it is confined to this one function so a replacement changes one place.
   */
  const logOf = (agent) => agent.session.snapshotEvents()

  /**
   * One record against the log. Admission ends it (S2-Q2 A: a later crash never re-wakes); a
   * removal from the inbox or a user Stop before admission discards it (S2-Q3 A).
   * @returns {Promise<symbol>} REDELIVER, PENDING, WAIT or DONE.
   */
  async function judge(agent, record, events) {
    const found = classify(events, messageIdOf(record.eventId))
    if (found.state === DELIVERY.admitted) { await finish(record, STATE.admitted, REASON.handled); return DONE }
    if (found.state === DELIVERY.canceled) { await finish(record, STATE.discarded, REASON.userStopped); return DONE }
    if (found.state === DELIVERY.pending) return PENDING
    if (found.state === DELIVERY.absent) return REDELIVER
    const verdict = claimVerdict(found.claimTurnEnd)
    if (verdict === undefined || verdict === REDELIVER) return verdict ?? WAIT
    await finish(record, STATE.discarded, verdict)
    return DONE
  }

  /**
   * Classify every in-flight event against the agent's log on an idle edge. A claim that will not
   * be admitted (a teardown) goes back to the head of the list; one still pending waits.
   */
  async function settle(agent) {
    if (inflight.size === 0) return
    const events = logOf(agent)
    for (const eventId of [...inflight]) {
      const record = ledger.get(eventId)
      const verdict = await judge(agent, record, events)
      if (verdict === REDELIVER) { inflight.delete(eventId); queue.unshift(eventId) }
    }
  }

  /** Follow one agent's idle edges: settle what it admitted, then hand it the next held event. */
  function watch(agent) {
    if (watched.has(agent)) return
    watched.add(agent)
    agent.ctx.on(HOST.agentStatus, ({ status }) => {
      if (status !== HOST.idle || closed) return
      void settle(agent).then(drain, (error) => logger?.warn(LOG.deliverFailed, [...inflight].join(), codeOf(error)))
    })
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
   * Hand the head of the list to the agent when it is truly idle. `runMaintenance` throws
   * synchronously unless nothing else owns the agent (public status also reads idle during someone
   * else's maintenance), so a refusal keeps the event held until the next quiescence. One event per
   * idle edge: each becomes its own next turn, never part of a running one (EVT-DT-03 rule 6).
   */
  async function drain() {
    if (closed || recovering || draining || queue.length === 0) return
    draining = true
    let agent
    try {
      agent = await fishball.activate()
    } catch (error) {
      // No retry timer (no requirement gives one): the next intake or idle edge drains again.
      logger?.warn(LOG.deliverFailed, queue[0], codeOf(error))
      return
    } finally { draining = false }
    // A close while activating: held events wait for the next owner's recover() rather than
    // entering an agent that is being disposed (S2 §2.2 owner teardown).
    if (closed || queue.length === 0) return
    watch(agent)
    const eventId = queue[0]
    const record = ledger.get(eventId)
    let message
    try {
      message = messageOf(record)
    } catch (error) {
      // An event that cannot be presented must not block every event behind it. It stays in
      // state `fishball` (never acked away unread), so the next start reconciles it again; what
      // should finally happen to it is an open user question (review 2026-11-14).
      queue.shift()
      logger?.warn(LOG.presentFailed, eventId, record.event.type, codeOf(error))
      void drain()
      return
    }
    // "Fully idle" is the true-idle claim of runMaintenance. Parked input is not waited for: in an
    // idle agent it never wakes by itself (S2 §2.1 item 3), so waiting would hold the event forever.
    const task = whenTrulyIdle(agent, async () => agent.followup(message))
    if (task === undefined) return
    queue.shift()
    inflight.add(eventId)
    task.catch((error) => {
      inflight.delete(eventId)
      queue.unshift(eventId)
      logger?.warn(LOG.deliverFailed, eventId, codeOf(error))
    })
  }

  /**
   * Startup reconciliation of one accepted-for-Fishball record against the new agent's log (S2
   * §2.2), before any new intake.
   * - admitted: done; no second wake, no notice turn (S2-Q2 A).
   * - claimed, no admission (claimVerdict): a crash or a teardown is delivered again; a user Stop
   *   is discarded (S2-Q3 A); any other end is discarded pending the user's decision.
   * - canceled (removed from the inbox): discarded (S2-Q3 A).
   * - pending (left in DSH's inbox): re-seated under maintenance so its wake latches; if another
   *   owner holds the agent, the pending input is left to it and settle() follows it.
   * - absent: delivered.
   */
  async function reconcile(agent, record, events) {
    const verdict = await judge(agent, record, events)
    if (verdict === REDELIVER) { queue.push(record.eventId); return }
    if (verdict !== PENDING) { if (verdict === WAIT) inflight.add(record.eventId); return }
    inflight.add(record.eventId)
    let message
    try { message = messageOf(record) } catch (error) { inflight.delete(record.eventId); logger?.warn(LOG.presentFailed, record.eventId, record.event.type, codeOf(error)); return }
    await whenTrulyIdle(agent, async () => { agent.inbox.remove(message.id); agent.followup(message) })
  }

  return Object.freeze({
    /** A record just accepted for Fishball (state `fishball`); delivered at the next true idle. */
    add(record) {
      if (closed || queue.includes(record.eventId) || inflight.has(record.eventId)) return
      queue.push(record.eventId)
      void drain()
    },
    /**
     * Reconcile every record still in state `fishball` from before this start, oldest first, then
     * start delivering. A record already added in this generation (recovery just moved an open
     * record of a plugin that is off to Fishball) is tracked here already; reconciling it too
     * would queue it twice and wake Fishball twice.
     */
    async recover() {
      recovering = true
      try {
        const records = ledger.inOrder([STATE.fishball]).filter((record) => !queue.includes(record.eventId) && !inflight.has(record.eventId))
        if (records.length === 0 || closed) return
        const agent = await fishball.activate()
        watch(agent)
        const events = logOf(agent)
        for (const record of records) await reconcile(agent, record, events)
        // Records the interception's recovery moved here were queued first; keep arrival order.
        queue.sort((a, b) => ledger.get(a).sequence - ledger.get(b).sequence)
      } finally {
        recovering = false
        void drain()
      }
    },
    /** Hold hand-overs while the interception's own recovery moves records here (finding 7). */
    hold() { recovering = true },
    /** Stop delivering before the agent's owner disposes it (S2: teardown cancels queued input). */
    close() { closed = true },
  })
}
