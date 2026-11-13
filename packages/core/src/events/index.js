/**
 * fishball-core's events module (task F-INTERCEPT): the interception service K3 freezes as
 * `fishballInstance.events` (`packages/core/contracts/events.d.ts`), core's acceptance ledger and
 * its delivery list to the Fishball agent (design §6.4).
 *
 * Composition only; F-WIRE mounts it in core's rows. The ports are injected so the module stays
 * independent of the link (F-LINK), of how an event is framed for the model (the X9 pipeline,
 * F-FACADE) and of the chat row that owns the manager session:
 * - `table`: the ledger's KvTable, from `openLedger(ctx, storageDomain)`;
 * - `link.ack(receipts)`: `inbox_ack` through core's link (K1);
 * - `fishball.activate()`: the manager session's live agent;
 * - `fishball.present(event)`: the model-facing content blocks of one event;
 * - `logger`: the background log (R-INT-09).
 *
 * Order of use: `recover()` once after the Fishball DSH's plugins have registered (app ready),
 * then `intake(event)` for every polled event; `close()` before the agent's owner disposes it.
 */
import { createDelivery } from './delivery.js'
import { createInterception } from './interception.js'
import { createLedger } from './ledger.js'
import { createRegistry } from './registry.js'

export { openLedger, messageIdOf } from './ledger.js'
export { classify } from './delivery.js'
export { CONTRACT, DISPATCH, LEDGER, STATE } from './constants.js'

/**
 * @returns {{service: object, intake: Function, recover: Function, close: Function}} `service` is
 *   the K3 `FishballInstanceEvents` value (`fishballInstance.events`).
 */
export function createEvents({ table, link, fishball, logger }) {
  const ledger = createLedger(table)
  const registry = createRegistry({ logger })
  const delivery = createDelivery({ ledger, fishball, logger })
  return createInterception({ ledger, registry, delivery, link, logger })
}
