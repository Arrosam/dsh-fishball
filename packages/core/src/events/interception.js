/**
 * fishball-core's interception service and its dispatch of polled events (task F-INTERCEPT; K3
 * `packages/core/contracts/events.d.ts`; design §6.4; R-INT-01…09, R-EVT-03; spikes V3-S2
 * `a499141`, V3-S3 `b4dca86`).
 *
 * Every polled event is recorded in core's acceptance ledger and dispatched with no LLM involved:
 * to exactly one interceptor (the highest priority, then the earliest registration), or, with no
 * candidate, to the Fishball agent through core's delivery list. Core acks an event at the
 * connector only after the receiving side durably accepted it (R-INT-08).
 *
 * One record, one owner at a time. Each move is a compare-and-set on the ledger tagged with the
 * offer's `attempt`, so a handler whose attempt lost (disposed, fallen back, re-offered after a
 * restart) is fenced: its `accept`, `commit` and `release` all lose (S3 §4 items 1–3).
 */
import { randomUUID } from 'node:crypto'
import { ACKABLE, CONTRACT, DISPATCH, HOST, INTERCEPTOR_HELD, LOG, MISUSE, REASON, STATE, UNDECIDED } from './constants.js'
import { receiptOf } from './ledger.js'

const reasonOf = (error) => String(error?.code ?? error?.name ?? error)

/**
 * @param options.ledger - the acceptance ledger (ledger.js `createLedger`).
 * @param options.registry - the registrations (registry.js `createRegistry`).
 * @param options.delivery - core's delivery list (delivery.js `createDelivery`).
 * @param options.link - core's MCP link as far as this module needs it:
 *   `ack(receipts): Promise<{ok: true} | {ok: false, code: string}>`, i.e. `inbox_ack` (K1).
 * @param options.logger - `{info, warn}`: the background log (R-INT-09); never given a payload.
 */
export function createInterception({ ledger, registry, delivery, link, logger }) {
  let recovering = Promise.resolve()
  let closed = false

  /** Ack a record once it is a durable acceptance; a failure is logged and retried on replay. */
  async function ack(eventId) {
    const record = ledger.get(eventId)
    if (record === undefined || record.acked || !ACKABLE.includes(record.state)) return
    try {
      const result = await link.ack([receiptOf(record)])
      if (result?.ok !== true) { logger?.warn(LOG.ackFailed, eventId, String(result?.code)); return }
      await ledger.move(eventId, (current) => !current.acked, () => ({ acked: true }))
    } catch (error) { logger?.warn(LOG.ackFailed, eventId, reasonOf(error)) }
  }

  /**
   * Move an event held by `attempt`, offered or accepted-undecided, to Fishball. Only the winner of the move
   * delivers it, so Fishball is woken at most once (S3: "only the winner of the move to fishball").
   */
  async function toFishball(eventId, attempt, reason) {
    const won = await ledger.move(eventId, (current) => current.attempt === attempt && UNDECIDED.includes(current.state),
      () => ({ state: STATE.fishball, reason }))
    if (!won) return false
    const record = ledger.get(eventId)
    logger?.info(LOG.toFishball, eventId, record.event.type, reason)
    delivery.add(record)
    void ack(eventId)
    return true
  }

  async function close(entry, eventId, attempt, reason) {
    const won = await ledger.move(eventId, (current) => current.attempt === attempt && INTERCEPTOR_HELD.includes(current.state),
      () => ({ state: STATE.closed, reason }))
    if (won) logger?.info(LOG.closed, eventId, ledger.get(eventId).event.type, entry.pluginId, reason)
  }

  /**
   * Hand one recorded event to one registration under a fresh `attempt`, and settle the record
   * when the handler settles (core keeps it open until then, S2-Q1 B). Not awaited by intake: a
   * handler may decide for a long time (Watchdog's side session) without blocking the poll loop.
   */
  async function offer(entry, event, attempt) {
    const { eventId } = event
    entry.held.set(eventId, attempt)
    const owns = (current) => current.attempt === attempt
    // Every commit the handler starts, awaited or not, decides the record before it is settled.
    const commits = []
    const ctl = Object.freeze({
      async accept() {
        if (!registry.isLive(entry)) return false
        // A record offered again after a restart is already durably accepted (open or
        // committing): accept is then true for its new attempt, with no second move or ack.
        const current = ledger.get(eventId)
        if (owns(current) && (current.state === STATE.open || current.state === STATE.committing)) return true
        const won = await ledger.move(eventId, (record) => owns(record) && record.state === STATE.offered && registry.isLive(entry),
          () => ({ state: STATE.open }))
        if (!won) return false
        logger?.info(LOG.accepted, eventId, event.type, entry.pluginId)
        // The record is durable before accept resolves; the ack follows it (R-INT-08). The
        // handler does not wait for the connector: a lost ack is recovered by the replay.
        void ack(eventId)
        return true
      },
      commit(send) {
        const task = (async () => {
          const won = await ledger.move(eventId, (current) => owns(current) && current.state === STATE.open, () => ({ state: STATE.committing }))
          if (!won) return { ok: false, code: CONTRACT.fenced }
          logger?.info(LOG.committing, eventId, event.type, entry.pluginId)
          let result
          // K3: commit never rejects; a rejected send is an answer that never reached the
          // connector (PROPOSED in K3, as S3's prototype treated it).
          try { result = await send() } catch { result = { ok: false, code: CONTRACT.disconnected } }
          if (result?.ok === false && result.code === CONTRACT.disconnected) {
            await ledger.move(eventId, (current) => owns(current) && current.state === STATE.committing, () => ({ state: STATE.open }))
            await toFishball(eventId, attempt, REASON.sendNotDelivered)
          }
          return result
        })()
        commits.push(task)
        return task
      },
      async release(released, options) {
        if (options?.toFishball !== true) throw new TypeError(MISUSE.release)
        if (released?.eventId !== eventId) return false
        return toFishball(eventId, attempt, REASON.released)
      },
    })

    let failed = false
    try { await entry.onEvent(event, ctl) } catch { failed = true }
    await Promise.all(commits)
    entry.held.delete(eventId)
    const record = ledger.get(eventId)
    if (!owns(record)) return
    if (record.state === STATE.offered) {
      // An effect made before accept counts as not accepted (R-INT-01, EVT-DT-04 rule 9).
      await toFishball(eventId, attempt, failed ? REASON.handlerFailed : REASON.notAccepted)
    } else if (record.state === STATE.open && failed) {
      await toFishball(eventId, attempt, REASON.handlerFailed)
    } else {
      await close(entry, eventId, attempt, failed ? REASON.commitInterrupted : REASON.handled)
    }
  }

  /** Re-check liveness after the durable write (S3 §4 item 1), then hand over or fall back. */
  async function handOver(entry, event, attempt) {
    if (registry.isLive(entry)) { void offer(entry, event, attempt); return }
    // A record whose commit began (re-offered after a restart) cannot fall back; it closes.
    if (!(await toFishball(event.eventId, attempt, REASON.pluginNotLive))) await close(entry, event.eventId, attempt, REASON.commitInterrupted)
  }

  /**
   * One polled event (K1 `MailboxEvent`). Resolves once its receiver is decided and recorded;
   * the interceptor's handler and the Fishball delivery continue after it.
   * @returns {Promise<'interceptor'|'fishball'|'duplicate'>}
   */
  async function intake(event) {
    await recovering
    if (closed) return DISPATCH.duplicate
    // Retention runs on intake as well as at startup, so a long-running Fishball DSH also sheds
    // finished records; it scans the in-memory table and writes only when something expired.
    await ledger.prune()
    const known = ledger.get(event.eventId)
    if (known !== undefined) return replay(event.eventId)
    const chosen = registry.choose(event)
    const attempt = randomUUID()
    const fields = chosen === undefined
      ? { state: STATE.fishball, reason: REASON.noMatch, attempt, event }
      : { state: STATE.offered, plugin: chosen.pluginId, attempt, event }
    if (!(await ledger.create(event.eventId, fields))) return replay(event.eventId)
    if (chosen === undefined) {
      logger?.info(LOG.toFishball, event.eventId, event.type, REASON.noMatch)
      delivery.add(ledger.get(event.eventId))
      void ack(event.eventId)
      return DISPATCH.fishball
    }
    await handOver(chosen, event, attempt)
    return ledger.get(event.eventId).state === STATE.fishball ? DISPATCH.fishball : DISPATCH.interceptor
  }

  /** A known `eventId` again (lost ack, reconnect): dropped; only the ack is repeated (S2, S3). */
  async function replay(eventId) {
    logger?.info(LOG.replay, eventId)
    await ack(eventId)
    return DISPATCH.duplicate
  }

  /**
   * Synchronous unregister (R-WD-07 "at once"). Events it held that are offered or accepted and
   * undecided fall back to Fishball once; one whose commit began stays fenced with it.
   */
  function dispose(entry) {
    if (!registry.remove(entry)) return
    for (const [eventId, attempt] of entry.held) void toFishball(eventId, attempt, REASON.disposed)
  }

  /**
   * Startup reconciliation from the durable ledger, before any intake (S2 §2.2). It must run once
   * the plugins of this Fishball DSH have had their chance to register (after app ready), since an
   * open record goes back to "the same plugin" only if that plugin is registered (R-INT-04).
   * - offered: the crash came before `accept` → Fishball once (S2 row 20).
   * - open: offered again to the same plugin under a new attempt, keeping its durable state (it
   *   dedupes by `eventId`; `accept` resolves true, and a handler that just returns closes it), or
   *   Fishball once when that plugin is off (EVT-DT-04 rules 7, 8).
   * - committing: offered again the same way; its state stays `committing`, so a new `commit` is
   *   fenced. When the plugin is off the record closes with it. It never moves to Fishball,
   *   because the answer may already be at the connector (R-INT-04: "committed or fenced, never
   *   both").
   * - fishball: reconciled against the session log by the delivery list.
   * Then every durable acceptance still unacked is acked, and expired finished records go.
   */
  function recover() {
    recovering = (async () => {
      for (const record of ledger.inOrder([STATE.offered, STATE.open, STATE.committing])) {
        if (record.state === STATE.offered) { await toFishball(record.eventId, record.attempt, REASON.restartBeforeAccept); continue }
        const entry = registry.chooseFor(record.plugin, record.event)
        if (entry !== undefined) {
          const attempt = randomUUID()
          const moved = await ledger.move(record.eventId, (current) => current.attempt === record.attempt, () => ({ attempt }))
          if (moved) await handOver(entry, record.event, attempt)
        } else if (record.state === STATE.open) await toFishball(record.eventId, record.attempt, REASON.restartPluginOff)
        else await close({ pluginId: record.plugin }, record.eventId, record.attempt, REASON.commitInterrupted)
      }
      await delivery.recover()
      for (const record of ledger.inOrder(ACKABLE)) if (!record.acked) await ack(record.eventId)
      await ledger.prune()
    })()
    return recovering
  }

  /**
   * The K3 `FishballInstanceEvents` service. It carries Cordis's tracker, so a plugin that
   * reaches it through a traced `fishballInstance` lands here with `this.ctx` = its own context
   * (spike V3-S5 I1): its fiber then tells "plugin off or down" (R-INT-04), and its unload
   * disposes the registration through an effect. Without a traced caller only `dispose` ends it.
   */
  const service = Object.freeze({
    [HOST.tracker]: HOST.trackerOptions,
    intercept(registration, onEvent) {
      const caller = this?.[HOST.trackerOptions.property]
      const entry = registry.add(registration, onEvent, caller?.fiber)
      let unbind
      const disposer = () => { dispose(entry); unbind?.() }
      try { unbind = caller?.effect(() => () => dispose(entry), HOST.disposerLabel) } catch { unbind = undefined }
      return disposer
    },
  })

  return Object.freeze({
    service,
    intake,
    recover,
    close() { closed = true; delivery.close() },
  })
}
