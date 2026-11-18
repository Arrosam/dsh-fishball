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
 *
 * MULTI-1 (PLAN-MULTI §5; MULTI-0 `events.d.ts`): one service for every target. A polled event
 * arrives with its target's trusted `source` (`TargetSource`), which the record and the event a
 * handler sees carry; the record is keyed by `(targetId, endpointEpoch, eventId)` (ledger.js
 * `recordKeyOf`), so equal remote ids of two targets are two records. Every ack goes through the
 * record's own target (`link.ack(receipts, source)`), never another's. A record of a removed target
 * or retired epoch (`link.live(source)` false) takes no part in recovery or acking again: it stays
 * as history, as a crash would leave it.
 */
import { randomUUID } from 'node:crypto'
// `LINK.disconnected` is core's own copy of the connector's word (K3a), not read from the link itself.
import { INTERCEPT, LINK, REASON, STATE } from '../../contracts/constants.js'
import { ACKABLE, DISPATCH, HOST, INTERCEPTOR_HELD, LOG, MISUSE, UNDECIDED } from './constants.js'
import { codeOf } from './diagnostics.js'
import { receiptOf, recordKeyOf } from './ledger.js'

/** The event as handlers, filters and Fishball see it: one detached, frozen copy (K3 readonly). */
const frozen = (value) => {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value) }
  return value
}
const snapshotOf = (event) => frozen(structuredClone(event))

/**
 * @param options.ledger - the acceptance ledger (ledger.js `createLedger`).
 * @param options.registry - the registrations (registry.js `createRegistry`).
 * @param options.delivery - core's delivery list (delivery.js `createDelivery`).
 * @param options.link - the targets' links as far as this module needs them:
 *   `ack(receipts, source): Promise<{ok: true} | {ok: false, code: string}>`, i.e. `inbox_ack`
 *   (K1) through the link of `source`'s target epoch, and `live(source): boolean`, whether that
 *   target epoch is still current.
 * @param options.logger - `{info, warn}`: the background log (R-INT-09); never given a payload.
 */
export function createInterception({ ledger, registry, delivery, link, logger }) {
  let recovering = Promise.resolve()
  let pruning = false
  // Once close() has run, the ledger's owner may close its storage domain, and a ledger read or
  // move then rejects ("domain … is closed"). The paths that run un-awaited after an intake (the
  // offer's tail and its commit fallback, accept and the ack it schedules, dispose's fallback) would
  // turn that into an unhandledRejection, so each checks `closed` right before its first ledger call,
  // with no await between, and then does nothing. Records are left as they stand, as a crash would
  // leave them: recover() at the next start settles offered, open and committing records and acks
  // the unacked ones (its doc below). A close() that lands during a move already queued is
  // tolerated, because the domain still drains a write queued before it began closing.
  let closed = false

  /**
   * Retention, off the dispatch path: never awaited by intake, one pass at a time, a failure only
   * logged. It scans the in-memory table, so it costs one pass per intake and writes only when a
   * record expired.
   */
  function prune() {
    if (pruning) return
    pruning = true
    void ledger.prune().catch((error) => logger?.warn(LOG.pruneFailed, codeOf(error))).finally(() => { pruning = false })
  }

  /** Ack a record once it is a durable acceptance; a failure is logged and retried on replay. */
  async function ack(eventId) {
    if (closed) return
    const record = ledger.get(eventId)
    if (record === undefined || record.acked || !ACKABLE.includes(record.state) || !link.live(record.event.source)) return
    try {
      const result = await link.ack([receiptOf(record)], record.event.source)
      if (result?.ok !== true) { logger?.warn(LOG.ackFailed, record.eventId, codeOf(result)); return }
      await ledger.move(eventId, (current) => !current.acked, () => ({ acked: true }))
    } catch (error) { logger?.warn(LOG.ackFailed, record.eventId, codeOf(error)) }
  }

  /**
   * Move an event held by `attempt` in one of `from` (offered or accepted-undecided by default) to
   * Fishball. Only the winner of the move delivers it, so Fishball is woken at most once (S3: "only
   * the winner of the move to fishball").
   */
  async function toFishball(eventId, attempt, reason, from = UNDECIDED) {
    const won = await ledger.move(eventId, (current) => current.attempt === attempt && from.includes(current.state),
      () => ({ state: STATE.fishball, reason }))
    if (!won) return false
    const record = ledger.get(eventId)
    logger?.info(LOG.toFishball, record.eventId, record.event.type, reason)
    delivery.add(record)
    void ack(eventId)
    return true
  }

  async function close(entry, eventId, attempt, reason) {
    const won = await ledger.move(eventId, (current) => current.attempt === attempt && INTERCEPTOR_HELD.includes(current.state),
      () => ({ state: STATE.closed, reason }))
    if (won) { const record = ledger.get(eventId); logger?.info(LOG.closed, record.eventId, record.event.type, entry.pluginId, reason) }
  }

  /**
   * Hand one recorded event to one registration under a fresh `attempt`, and settle the record
   * when the handler settles (core keeps it open until then, S2-Q1 B). Not awaited by intake: a
   * handler may decide for a long time without blocking the poll loop.
   */
  async function offer(entry, event, attempt, eventId) {
    entry.held.set(eventId, attempt)
    const owns = (current) => current.attempt === attempt
    // Every commit the handler starts, awaited or not, decides the record before it is settled.
    const commits = []
    // Core keeps the record open only until the handler settles (K3): from then on the controller
    // is fenced, so a late commit can never race the close (review finding 6).
    let settled = false
    // A commit whose fence write failed sent nothing: the open record goes to Fishball (see commit).
    let fenceFailed = false
    /**
     * The durable move offered → open.
     * @returns {Promise<{won: boolean, moved: boolean}>} `moved` when this call made the move.
     */
    async function acceptOnce() {
      if (closed || settled || !registry.isLive(entry)) return { won: false, moved: false }
      // A record offered again after a restart is already durably accepted (open or committing):
      // accept is then true for its new attempt with no second move; recover() acks it.
      const current = ledger.get(eventId)
      if (owns(current) && (current.state === STATE.open || current.state === STATE.committing)) return { won: true, moved: false }
      const moved = await ledger.move(eventId, (record) => !settled && owns(record) && record.state === STATE.offered && registry.isLive(entry),
        () => ({ state: STATE.open }))
      if (moved) logger?.info(LOG.accepted, event.eventId, event.type, entry.pluginId)
      return { won: moved, moved }
    }
    const ctl = Object.freeze({
      accept() {
        const accepted = acceptOnce()
        // R-INT-08: the ack goes out only after accept has resolved, never inside it. setImmediate
        // runs after the handler's own continuation of `await ctl.accept()`. The handler does not
        // wait for the connector; a lost ack is recovered by the replay.
        void accepted.then(({ moved }) => { if (moved) setImmediate(() => { void ack(eventId) }) })
        return accepted.then(({ won }) => won)
      },
      commit(send) {
        const task = (async () => {
          let won
          // K3: commit never rejects. A fence write that failed moved nothing, so nothing was sent
          // and the record is still accepted (open): this commit is fenced, and the handler's end
          // sends the record to Fishball (R-FIX F14).
          try {
            won = !settled && await ledger.move(eventId, (current) => !settled && owns(current) && current.state === STATE.open,
              () => ({ state: STATE.committing }))
          } catch (error) {
            logger?.warn(LOG.commitFenceFailed, event.eventId, codeOf(error))
            fenceFailed = true
            won = false
          }
          if (!won) return { ok: false, code: INTERCEPT.fenced }
          logger?.info(LOG.committing, event.eventId, event.type, entry.pluginId)
          let result
          // K3: commit never rejects; a rejected send is an answer that never reached the
          // connector (K3 events.d.ts, as S3's prototype treated it).
          try { result = await send() } catch { result = { ok: false, code: LINK.disconnected } }
          // One move committing → fishball, so no crash can fall between two writes (finding 15).
          // Not after close() (see `closed`): a rejected move would also break "commit never
          // rejects" (K3). The record stays committing.
          if (!closed && result?.ok === false && result.code === LINK.disconnected) await fallBack(eventId, attempt, REASON.sendNotDelivered, [STATE.committing])
          return result
        })()
        commits.push(task)
        return task
      },
      async release(released, options) {
        if (options?.toFishball !== true) throw new TypeError(MISUSE.release)
        // The very event offered (its target too: two targets may share an eventId).
        if (settled || released?.eventId !== event.eventId || released?.source?.targetId !== event.source.targetId
          || released?.source?.endpointEpoch !== event.source.endpointEpoch) return false
        return toFishball(eventId, attempt, REASON.released)
      },
    })

    let failed = false
    try { await entry.onEvent(event, ctl) } catch { failed = true }
    settled = true
    await Promise.all(commits)
    entry.held.delete(eventId)
    // A handler can outlive close(), since the offer is not awaited (see `closed`).
    if (closed) return
    const record = ledger.get(eventId)
    if (!owns(record)) return
    if (record.state === STATE.offered) {
      // An effect made before accept counts as not accepted (R-INT-01, EVT-DT-04 rule 9).
      await toFishball(eventId, attempt, failed ? REASON.handlerFailed : REASON.notAccepted)
    } else if (record.state === STATE.open && (failed || fenceFailed)) {
      await toFishball(eventId, attempt, fenceFailed ? REASON.sendNotDelivered : REASON.handlerFailed)
    } else {
      await close(entry, eventId, attempt, failed ? REASON.commitInterrupted : REASON.handled)
    }
  }

  /**
   * A move to Fishball whose write failure is logged, never thrown: it runs inside `commit`, which
   * never rejects (K3). The record stays where it was, and the next start's recovery settles it.
   */
  async function fallBack(eventId, attempt, reason, from) {
    try { return await toFishball(eventId, attempt, reason, from) } catch (error) {
      logger?.warn(LOG.fallbackFailed, ledger.get(eventId)?.eventId, codeOf(error))
      return false
    }
  }

  /** Re-check liveness after the durable write (S3 §4 item 1), then hand over or fall back. */
  async function handOver(entry, event, attempt, key) {
    // The offer runs detached; a ledger write that fails at its end is logged (never unhandled),
    // and the record is left for the next start's recovery, as a crash would leave it.
    if (registry.isLive(entry)) { void offer(entry, event, attempt, key).catch((error) => logger?.warn(LOG.offerFailed, event.eventId, codeOf(error))); return }
    // A record whose commit began (re-offered after a restart) cannot fall back; it closes.
    if (!(await toFishball(key, attempt, REASON.pluginNotLive))) await close(entry, key, attempt, REASON.commitInterrupted)
  }

  /**
   * One polled event (K1 `MailboxEvent`) from the target epoch `source` (MULTI-1, a trusted
   * `TargetSource` the caller assigns; a `source` member the connector sent is replaced). Resolves
   * once its receiver is decided and recorded; the interceptor's handler and the Fishball delivery
   * continue after it.
   * @returns {Promise<'interceptor'|'fishball'|'duplicate'|'closed'>} `closed`: after close(), the
   *   event was neither recorded nor acked, so the connector will offer it again.
   */
  async function intake(polled, source) {
    await recovering
    // Not recorded and not acked: the caller must not treat it as handled (finding 12).
    if (closed) return DISPATCH.closed
    prune()
    const key = recordKeyOf(source, polled.eventId)
    if (ledger.get(key) !== undefined) return replay(key)
    const event = snapshotOf({ ...polled, source })
    const chosen = registry.choose(event)
    const attempt = randomUUID()
    const fields = chosen === undefined
      ? { state: STATE.fishball, reason: REASON.noMatch, attempt, eventId: event.eventId, event }
      : { state: STATE.offered, plugin: chosen.pluginId, attempt, eventId: event.eventId, event }
    if (!(await ledger.create(key, fields))) return replay(key)
    if (chosen === undefined) {
      logger?.info(LOG.toFishball, event.eventId, event.type, REASON.noMatch)
      delivery.add(ledger.get(key))
      void ack(key)
      return DISPATCH.fishball
    }
    await handOver(chosen, event, attempt, key)
    return ledger.get(key).state === STATE.fishball ? DISPATCH.fishball : DISPATCH.interceptor
  }

  /** A known event again (lost ack, reconnect): dropped; only the ack is repeated (S2, S3). */
  async function replay(key) {
    logger?.info(LOG.replay, ledger.get(key)?.eventId)
    await ack(key)
    return DISPATCH.duplicate
  }

  /**
   * Synchronous unregister (R-INT-04, EVT-UC-03 E1). Events it held that are offered or accepted and
   * undecided fall back to Fishball once; one whose commit began stays fenced with it.
   */
  function dispose(entry) {
    // The registration still goes (it is in memory); only the fallback needs the ledger.
    if (!registry.remove(entry) || closed) return
    for (const [key, attempt] of entry.held) void fallBack(key, attempt, REASON.disposed, UNDECIDED)
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
   * - fishball: accepted for Fishball and not admitted, by the ledger alone: the delivery list
   *   delivers it again once (the user's decision 2026-11-14 4.A).
   * Then every durable acceptance still unacked is acked, and expired finished records go.
   */
  function recover() {
    recovering = reconcile().catch((error) => {
      // The barrier always settles, so one failed recovery never blocks every later intake. The
      // records it did not reach stay in the ledger for the next start, with no in-run retry (the
      // user's decision 2026-11-14 2.B).
      logger?.warn(LOG.recoverFailed, codeOf(error))
    })
    return recovering
  }

  async function reconcile() {
    delivery.hold()
    try {
      for (const record of ledger.inOrder([STATE.offered, STATE.open, STATE.committing])) {
        // A removed target's or retired epoch's record is history (PLAN-MULTI §5): never re-offered.
        if (!link.live(record.event.source)) continue
        if (record.state === STATE.offered) { await toFishball(record.key, record.attempt, REASON.restartBeforeAccept); continue }
        const entry = registry.chooseFor(record.plugin, record.event)
        if (entry !== undefined) {
          const attempt = randomUUID()
          const moved = await ledger.move(record.key, (current) => current.attempt === record.attempt, () => ({ attempt }))
          if (moved) await handOver(entry, snapshotOf(record.event), attempt, record.key)
        } else if (record.state === STATE.open) await toFishball(record.key, record.attempt, REASON.restartPluginOff)
        else await close({ pluginId: record.plugin }, record.key, record.attempt, REASON.commitInterrupted)
      }
    } finally {
      // Releases the hold even when a move above failed, so delivery never stays blocked. The ack
      // sweep and retention need no agent, so they run even when delivery's recovery failed.
      try { await delivery.recover() } finally {
        for (const record of ledger.inOrder(ACKABLE)) if (!record.acked) await ack(record.key)
        prune()
      }
    }
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
    /**
     * MULTI-1 (PLAN-MULTI §3.1, §5): a target epoch was retired. Its events still waiting for
     * Fishball are dropped from the delivery list; their records stay in the ledger as read-only
     * history (state `fishball`, never delivered, never acked). Sends nothing.
     */
    retire: (retired) => delivery.retire(retired),
    close() { closed = true; delivery.close() },
  })
}
