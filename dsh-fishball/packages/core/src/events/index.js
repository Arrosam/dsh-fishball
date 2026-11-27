/**
 * fishball-core's events module (task F-INTERCEPT): the interception service K3 freezes as
 * `fishballInstance.events` (`packages/core/contracts/events.d.ts`), core's acceptance ledger and
 * its delivery list to the Fishball agent (design §6.4).
 *
 * Composition only; F-WIRE mounts it in core's rows. The ports are injected so the module stays
 * independent of the link (F-LINK), of how an event is framed for the model (the X9 pipeline,
 * F-FACADE) and of the chat row that owns the manager session:
 * - `table`: the ledger's KvTable, from `openLedger(ctx, storageDomain)`;
 * - `link.ack(receipts, source)`: `inbox_ack` (K1) through the link of `source`'s target epoch,
 *   and `link.live(source)`, whether that epoch is current (MULTI-1: the target collection);
 * - `fishball.activate()`: the manager session's live agent;
 * - `fishball.present(event)`: the model-facing content blocks of one event;
 * - `logger`: the background log (R-INT-09);
 * - `now`: the clock in epoch milliseconds (default `Date.now`), for ledger retention;
 * - `delay(ms)`: the wait between presentation attempts (default an unref'd timer);
 * - `batching()`: the wake settings `{quietWindowSeconds, maxBatch, classes}`, read at each event
 *   (WAKE; default `WAKE.defaults`);
 * - `timers`: `{setTimeout, clearTimeout}` for the quiet window (default the global ones, unref'd).
 *
 * Order of use (confirmed by Fishball 2026-11-14): F-WIRE calls `recover()` once after app ready,
 * when the Fishball DSH's plugins have registered, because an open record is offered again only
 * to a plugin that is registered (R-INT-04); then `intake(event, source)` for every polled event of
 * the target epoch `source` (MULTI-1);
 * `close()` before the agent's owner disposes it.
 */
import { createDelivery } from './delivery.js'
import { createInterception } from './interception.js'
import { createLedger } from './ledger.js'
import { createRegistry } from './registry.js'

export { openLedger, messageIdOf, recordKeyOf } from './ledger.js'
export { INTERCEPT, LEDGER, PRESENT_RETRY, REASON, STATE, TEXT, WAKE } from '../../contracts/constants.js'
export { DISPATCH } from './constants.js'

/**
 * @returns {{service: object, intake: Function, recover: Function, close: Function}} `service` is
 *   the K3 `FishballInstanceEvents` value (`fishballInstance.events`).
 */
export function createEvents({ table, link, fishball, logger, now = Date.now, delay, batching, timers }) {
  const ledger = createLedger(table, now)
  const registry = createRegistry({ logger })
  const delivery = createDelivery({ ledger, fishball, logger, delay, live: (source) => link.live(source), batching, timers })
  return createInterception({ ledger, registry, delivery, link, logger })
}
