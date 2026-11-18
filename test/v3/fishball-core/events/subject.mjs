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
 * - `activate({agent, recovering})` replaces `fishball.activate`.
 * `recovering` is true while `start()` runs `recover()`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../../support/constants.mjs'
import { importInstance, importSdk } from '../../../private-skills/support/sdk.mjs'
import { DSH, FIXTURE, SOURCE, SUBJECT, TOOL } from './constants.mjs'

/** The module's entry and its constants, bound to `sdk` (their `@deepseek-ai/*` imports resolve to that SDK). */
async function modulesFor(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (F-INTERCEPT "Owns" packages/core/src/events/)`)
  const bound = (file) => importInstance(sdk, path.relative(INSTANCE.dir, file))
  const [events, constants, storageDomain] = await Promise.all([
    bound(SUBJECT.entry), bound(path.join(path.dirname(SUBJECT.entry), 'constants.js')), importSdk(sdk, DSH.storageDomain),
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
const presentDefault = (event) => [{ type: 'text', text: `${event.type} ${event.eventId}` }]

/** Core's events service over one world: `{ intercept, start, close }`; `start` is the caller's. */
export async function makeSubject(sdk, { ctx, agent, link, seam = {} }) {
  const { events: mod, constants, storageDomain } = await modulesFor(sdk)
  const ledger = await mod.openLedger(ctx, storageDomain)
  let recovering = false
  // MULTI-1 seam (relayed 2026-11-18): every intake names its TargetSource and the ack goes back
  // through that source's link. This world is one target (`seam.source`, default SOURCE.a); a
  // receipt acked for any other source is recorded as misrouted and never reaches the fake mailbox.
  const source = seam.source ?? SOURCE.a
  const misrouted = []
  const sameSource = (s) => s?.targetId === source.targetId && s?.endpointEpoch === source.endpointEpoch
  const table = seam.ledgerWrite === undefined ? ledger.table : guardedTable(ledger.table, (op, args) => seam.ledgerWrite({ op, args, recovering, table: ledger.table }))
  const events = mod.createEvents({
    table,
    link: {
      ack: (receipts, ackSource) => {
        if (sameSource(ackSource)) return link.callTool(TOOL.inboxAck, { receipts })
        misrouted.push({ receipts, source: ackSource })
        return Promise.resolve({ ok: false, code: FIXTURE.misroutedAck })
      },
      live: (s) => sameSource(s),
    },
    fishball: {
      activate: seam.activate === undefined ? async () => agent : async () => seam.activate({ agent, recovering }),
      present: seam.present === undefined ? presentDefault : (event) => seam.present(event, presentDefault),
    },
    logger: ctx.logger(constants.LOG.name),
    ...(seam.delay === undefined ? {} : { delay: seam.delay }),
  })

  // The stand-in poll loop: one poll at a time; a hint during a poll queues one more after it.
  let chain = Promise.resolve()
  let failure
  let stopped = false
  async function pollOnce() {
    let more = true
    while (more && !stopped) {
      const page = await link.callTool(TOOL.inboxPoll, {})
      for (const event of page.events ?? []) await events.intake(event, source)
      more = page.hasMore === true
    }
  }
  const poll = () => { chain = chain.then(pollOnce).catch((error) => { failure ??= error }) }
  let unlisten

  return {
    source,
    /** Acks core sent for another source than this world's (MULTI-1: must stay empty). */
    misrouted,
    intercept: (registration, onEvent) => events.service.intercept(registration, onEvent),
    async start() {
      recovering = true
      try { await events.recover() } finally { recovering = false }
      unlisten = link.onResourceUpdated(poll)
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
