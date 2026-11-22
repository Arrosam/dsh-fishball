/**
 * The one place that binds the cases to F-INTERCEPT's module (`packages/core/src/events/index.js`).
 * Its entry is composition with injected ports; F-WIRE mounts it in core's rows, and F-LINK owns
 * the real link and poll loop. Until those exist this seam stands in for both, from their
 * contracts only, so a case never changes when they land:
 *
 * - `openLedger(ctx, {defineDomain, domainTable})` opens the ledger in the world's real
 *   dsh-storage-domain over dsh-storage-json, so a SIGKILLed world reopens the same records;
 * - `createEvents({table, link, fishball, logger})` with
 *   - `link.ack(receipts)` = K1 `inbox_ack` through the world's fake link;
 *   - `fishball.activate()` = the world's Fishball manager agent (a real DSH `Agent`);
 *   - `fishball.present(event)` = one text block naming the event's type and id. The wording is
 *     another task's (X9 / F-FACADE); the id carries the case's marker, so every oracle finds it;
 *   - `logger` = a cordis logger of the world's context, so the world's exporter sees every line;
 * - the world has no `fishballInstance` row (F-WIRE), so `intercept` reaches the service with no
 *   traced caller: a registration ends only by its disposer, which the world's plugins run as a
 *   fiber effect;
 * - `start()` is the world's "ready" point (its plugins have registered): `recover()` once, then
 *   the poll loop. Core polls once when started and once per `dsh-agent://events` hint (design §6.3
 *   "poll once on every (re)connect"), hands every polled event to `intake` in order, one poll at
 *   a time, and keeps paging while the connector says `hasMore`;
 * - `close()` stops the loop, closes the events module, then the ledger.
 *
 * Optional `seam` hooks a case may pass (decisions 2026-11-14 2 and 3), each off by default:
 * - `present(event, base)` replaces the presenter; `base` is the default one above;
 * - `delay(ms)` is handed to `createEvents` as its presenter-backoff wait;
 * - `ledgerWrite({op, args, recovering, table})` runs before every ledger write (`put`, `update`,
 *   `delete`; `table` is the unguarded ledger table, for reads); a throw or rejection makes that
 *   write reject, and it may hold the write;
 * - `activate({agent, recovering})` replaces `fishball.activate`;
 * - WAKE-BATCH (seam relayed 2026-11-21): `batching()` → `{quietWindowSeconds, maxBatch, classes}`,
 *   read live by core at each event; absent, the world passes the defaults with a 0 s window
 *   (`WAKE_CONTRACT.immediate`, the lead's harness choice) so the pre-batching rows keep their
 *   timing; `batching: null` passes nothing (the product default). `timers` is core's
 *   `{setTimeout, clearTimeout}` (world.mjs fakeClock), passed only when given.
 * `recovering` is true while `start()` runs `recover()`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { importBound } from 'fishball-test-helpers/bind'
import { importDsh } from 'fishball-test-helpers/dsh'
import { DSH, FIXTURE, SOURCE, SUBJECT, TOOL, WAKE_CONTRACT } from './constants.mjs'

/** The module's entry and its constants, bound to the current DSH (their `@deepseek-ai/*` imports resolve to it). */
async function modulesFor() {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (F-INTERCEPT "Owns" packages/core/src/events/)`)
  const bound = (file) => importBound(file)
  const [events, constants, storageDomain] = await Promise.all([
    bound(SUBJECT.entry), bound(path.join(path.dirname(SUBJECT.entry), 'constants.js')), importDsh(DSH.storageDomain),
  ])
  return { events, constants, storageDomain }
}

/** The ledger's write methods (dsh-storage-domain `KvTable`), the ones `seam.ledgerWrite` guards. */
const LEDGER_WRITES = Object.freeze(['put', 'update', 'delete'])
/** `table` with `guard(op, args)` awaited before each write; reads pass straight through. */
function guardedTable(table, guard) {
  return new Proxy(table, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      if (!LEDGER_WRITES.includes(prop)) return value.bind(target)
      return async (...args) => { await guard(prop, args); return value.apply(target, args) }
    },
  })
}
/** The `batching` option (see the header): the case's, the 0 s default, or none (`null`). */
function batchingOf(seam) {
  if (seam.batching === null) return {}
  if (seam.batching !== undefined) return { batching: seam.batching }
  const immediate = WAKE_CONTRACT.immediate
  return immediate === undefined ? {} : { batching: () => immediate }
}
const presentDefault = (event) => [{ type: 'text', text: `${event.type} ${event.eventId}` }]

/** Core's events service over one world: `{ intercept, start, close }`; `start` is the caller's. */
export async function makeSubject({ ctx, agent, link, second, seam = {} }) {
  const { events: mod, constants, storageDomain } = await modulesFor()
  const ledger = await mod.openLedger(ctx, storageDomain)
  let recovering = false
  // MULTI-1 seam (relayed 2026-11-18): every intake names its TargetSource and the ack goes back
  // through that source's link. The world is one target (`seam.source`, default SOURCE.a), or two
  // when `second` is given (SOURCE.b, its own mailbox). A receipt acked for a source no target of
  // this world holds is recorded as misrouted and never reaches any fake mailbox.
  const source = seam.source ?? SOURCE.a
  const targets = [{ source, link }, ...(second === undefined ? [] : [{ source: seam.secondSource ?? SOURCE.b, link: second }])]
  const misrouted = []
  const same = (s, t) => s?.targetId === t.targetId && s?.endpointEpoch === t.endpointEpoch
  // MULTI-1: `seam.retired` lists sources whose endpoint epoch is retired in this process (removed or
  // URL-changed while the DSH was down): their link is gone, so they are neither live nor polled, and an
  // ack for them is misrouted.
  const retired = seam.retired ?? []
  const isRetired = (s) => retired.some((r) => same(s, r))
  const targetOf = (s) => (isRetired(s) ? undefined : targets.find((t) => same(s, t.source)))
  const table = seam.ledgerWrite === undefined ? ledger.table : guardedTable(ledger.table, (op, args) => seam.ledgerWrite({ op, args, recovering, table: ledger.table }))
  const events = mod.createEvents({
    table,
    link: {
      ack: (receipts, ackSource) => {
        const target = targetOf(ackSource)
        if (target !== undefined) return target.link.callTool(TOOL.inboxAck, { receipts })
        misrouted.push({ receipts, source: ackSource })
        return Promise.resolve({ ok: false, code: FIXTURE.misroutedAck })
      },
      live: (s) => targetOf(s) !== undefined,
    },
    fishball: {
      activate: seam.activate === undefined ? async () => agent : async () => seam.activate({ agent, recovering }),
      present: seam.present === undefined ? presentDefault : (event) => seam.present(event, presentDefault),
    },
    logger: ctx.logger(constants.LOG.name),
    ...(seam.delay === undefined ? {} : { delay: seam.delay }),
    ...batchingOf(seam),
    ...(seam.timers === undefined ? {} : { timers: seam.timers }),
  })

  // The stand-in poll loop: one poll at a time; a hint during a poll queues one more after it.
  let chain = Promise.resolve()
  let failure
  let stopped = false
  async function pollOnce() {
    for (const target of targets.filter((t) => !isRetired(t.source))) {
      let more = true
      while (more && !stopped) {
        const page = await target.link.callTool(TOOL.inboxPoll, {})
        for (const event of page.events ?? []) await events.intake(event, target.source)
        more = page.hasMore === true
      }
    }
  }
  const poll = () => { chain = chain.then(pollOnce).catch((error) => { failure ??= error }) }
  let unlisten

  return {
    source,
    sources: targets.map((t) => t.source),
    /** Acks core sent for another source than this world's (MULTI-1: must stay empty). */
    misrouted,
    intercept: (registration, onEvent) => events.service.intercept(registration, onEvent),
    async start() {
      recovering = true
      try { await events.recover() } finally { recovering = false }
      const unlistens = targets.map((t) => t.link.onResourceUpdated(poll))
      unlisten = () => { for (const off of unlistens) off() }
      poll()
      await chain
    },
    async close() {
      stopped = true
      unlisten?.()
      await chain
      events.close()
      await ledger.close()
      // A poll that threw (intake rejected) would otherwise vanish inside the loop.
      if (failure !== undefined) throw failure
    },
  }
}
