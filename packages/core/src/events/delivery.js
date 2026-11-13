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
import { messageIdOf } from './ledger.js'

/**
 * Where one message id stands in a session log (S2 `classify`). Removals carry only a position,
 * so the pending lists are rebuilt from the ordered `agent/inbox/spliced` events.
 * @returns {{state: string, claimTurnEnd: string|undefined}} `claimTurnEnd` is how the turn that
 *   claimed it ended (`interrupted` is the crash closer resume appends; a user Stop is another kind).
 */
export function classify(events, messageId) {
  const lists = Object.fromEntries(HOST.inboxTargets.map((target) => [target, []]))
  let last = DELIVERY.absent
  let admitted = false
  let claimTurnEnd
  let awaitingEnd = false
  for (const event of events) {
    if (awaitingEnd && event.type === HOST.turnEnd) { claimTurnEnd = event.data?.reason?.kind; awaitingEnd = false }
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
export function createDelivery({ ledger, fishball, logger }) {
  /** eventIds accepted for Fishball, not yet handed to the agent, in arrival order. */
  const queue = []
  /** eventIds handed to `followup`, waiting for the log to show admission or a discard. */
  const inflight = new Set()
  const watched = new WeakSet()
  let draining = false
  let closed = false

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
   * Classify every in-flight event against the agent's log. Admission ends it (S2-Q2 A: a later
   * crash never re-wakes); a user Stop or inbox removal before admission discards it (S2-Q3 A).
   * Anything else waits for the next idle edge.
   */
  async function settle(agent) {
    if (inflight.size === 0) return
    const events = agent.session.snapshotEvents()
    for (const eventId of [...inflight]) {
      const record = ledger.get(eventId)
      const found = classify(events, messageIdOf(eventId))
      if (found.state === DELIVERY.admitted) await finish(record, STATE.admitted, REASON.handled)
      else if (found.state === DELIVERY.canceled) await finish(record, STATE.discarded, REASON.userStopped)
      else if (found.state === DELIVERY.claimed && found.claimTurnEnd !== undefined && found.claimTurnEnd !== HOST.interrupted) {
        await finish(record, STATE.discarded, REASON.userStopped)
      }
    }
  }

  /** Follow one agent's idle edges: settle what it admitted, then hand it the next held event. */
  function watch(agent) {
    if (watched.has(agent)) return
    watched.add(agent)
    agent.ctx.on(HOST.agentStatus, ({ status }) => {
      if (status !== HOST.idle || closed) return
      void settle(agent).then(drain, (error) => logger?.warn(LOG.deliverFailed, [...inflight].join(), String(error?.code ?? error?.name ?? error)))
    })
  }

  /**
   * Hand the head of the list to the agent when it is truly idle. `runMaintenance` throws
   * synchronously unless nothing else owns the agent (public status also reads idle during someone
   * else's maintenance), so a refusal keeps the event held until the next quiescence. One event per
   * idle edge: each becomes its own next turn, never part of a running one (EVT-DT-03 rule 6).
   */
  async function drain() {
    if (closed || draining || queue.length === 0) return
    draining = true
    let agent
    try {
      agent = await fishball.activate()
    } catch (error) {
      draining = false
      logger?.warn(LOG.deliverFailed, queue[0], String(error?.code ?? error?.name ?? error))
      return
    }
    draining = false
    // A close while activating: held events wait for the next owner's recover() rather than
    // entering an agent that is being disposed (S2 §2.2 owner teardown).
    if (closed || queue.length === 0) return
    watch(agent)
    const eventId = queue[0]
    const message = messageOf(ledger.get(eventId))
    let task
    try {
      task = agent.runMaintenance(async () => agent.followup(message))
    } catch {
      void agent.whenIdle().then(drain)
      return
    }
    queue.shift()
    inflight.add(eventId)
    task.catch((error) => {
      inflight.delete(eventId)
      queue.unshift(eventId)
      logger?.warn(LOG.deliverFailed, eventId, String(error?.code ?? error?.name ?? error))
    })
  }

  /**
   * Startup reconciliation of one accepted-for-Fishball record against the new agent's log (S2
   * §2.2), before any new intake.
   * - admitted: done; no second wake, no notice turn (S2-Q2 A).
   * - claimed and the turn ended `interrupted`: delivered again. The checkpoint policy flushes the
   *   request prefix (which holds the admission) before any model dispatch, so a claim without an
   *   admission dispatched nothing (S2 §2.1 item 5).
   * - claimed and stopped by the user, or canceled: discarded (S2-Q3 A).
   * - pending (left in DSH's inbox): re-seated under maintenance so its wake latches.
   * - absent: delivered.
   */
  async function reconcile(agent, record) {
    const found = classify(agent.session.snapshotEvents(), messageIdOf(record.eventId))
    if (found.state === DELIVERY.admitted) return finish(record, STATE.admitted, REASON.handled)
    if (found.state === DELIVERY.canceled) return finish(record, STATE.discarded, REASON.userStopped)
    if (found.state === DELIVERY.claimed && found.claimTurnEnd !== undefined && found.claimTurnEnd !== HOST.interrupted) {
      return finish(record, STATE.discarded, REASON.userStopped)
    }
    if (found.state === DELIVERY.pending) {
      inflight.add(record.eventId)
      const message = messageOf(record)
      try {
        await agent.runMaintenance(async () => { agent.inbox.remove(message.id); agent.followup(message) })
      } catch { /* busy: the running owner claims the pending input itself; settle() follows it */ }
      return undefined
    }
    queue.push(record.eventId)
    return undefined
  }

  return Object.freeze({
    /** A record just accepted for Fishball (state `fishball`); delivered at the next true idle. */
    add(record) {
      if (closed || queue.includes(record.eventId) || inflight.has(record.eventId)) return
      queue.push(record.eventId)
      void drain()
    },
    /** Reconcile every record still in state `fishball`, oldest first, then start delivering. */
    async recover() {
      const records = ledger.inOrder([STATE.fishball])
      if (records.length === 0 || closed) return
      const agent = await fishball.activate()
      watch(agent)
      for (const record of records) await reconcile(agent, record)
      void drain()
    },
    /** Stop delivering before the agent's owner disposes it (S2: teardown cancels queued input). */
    close() { closed = true },
  })
}
