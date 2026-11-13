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
 *   the poll loop. Core polls once when started and once per `fishball://events` hint (design §6.3
 *   "poll once on every (re)connect"), hands every polled event to `intake` in order, one poll at
 *   a time, and keeps paging while the connector says `hasMore`;
 * - `close()` stops the loop, closes the events module, then the ledger.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance, importSdk } from '../../private-skills/support/sdk.mjs'
import { DSH, SUBJECT, TOOL } from './constants.mjs'

/** The module's entry and its constants, bound to `sdk` (their `@deepseek-ai/*` imports resolve to that SDK). */
async function modulesFor(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (F-INTERCEPT "Owns" packages/core/src/events/)`)
  const bound = (file) => importInstance(sdk, path.relative(INSTANCE.dir, file))
  const [events, constants, storageDomain] = await Promise.all([
    bound(SUBJECT.entry), bound(path.join(path.dirname(SUBJECT.entry), 'constants.js')), importSdk(sdk, DSH.storageDomain),
  ])
  return { events, constants, storageDomain }
}

/** Core's events service over one world: `{ intercept, start, close }`; `start` is the caller's. */
export async function makeSubject(sdk, { ctx, agent, link }) {
  const { events: mod, constants, storageDomain } = await modulesFor(sdk)
  const ledger = await mod.openLedger(ctx, storageDomain)
  const events = mod.createEvents({
    table: ledger.table,
    link: { ack: (receipts) => link.callTool(TOOL.inboxAck, { receipts }) },
    fishball: {
      activate: async () => agent,
      present: (event) => [{ type: 'text', text: `${event.type} ${event.eventId}` }],
    },
    logger: ctx.logger(constants.LOG.name),
  })

  // The stand-in poll loop: one poll at a time; a hint during a poll queues one more after it.
  let chain = Promise.resolve()
  let failure
  let stopped = false
  async function pollOnce() {
    let more = true
    while (more && !stopped) {
      const page = await link.callTool(TOOL.inboxPoll, {})
      for (const event of page.events ?? []) await events.intake(event)
      more = page.hasMore === true
    }
  }
  const poll = () => { chain = chain.then(pollOnce).catch((error) => { failure ??= error }) }
  let unlisten

  return {
    intercept: (registration, onEvent) => events.service.intercept(registration, onEvent),
    async start() {
      await events.recover()
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
