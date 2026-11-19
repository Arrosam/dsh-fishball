/**
 * The connector's contribution service `dshConnectorTools` (task C-EXT; design §13;
 * R-EXT-01…19; K2 `./tools` freeze `d1d0b25`; spike V3-S5 `8f2788e`).
 *
 * Composition only; C-WIRE mounts it in the connector row. The ports are injected, so the module
 * depends on the frozen K1 interfaces only, never on the modules behind them:
 * - `mailbox`: K1 `Mailbox` (C-MAILBOX). `emit` commits through it, and a withdrawal retires
 *   through it;
 * - `router`: K1 `Router` (C-ROUTE), the one recipient of an event (R-EXT-17);
 * - `sessionExists(sessionId)`: whether a session of this DSH has that id (TQ-14; C-WIRE wires it);
 * - `onToolsChanged()`: called once per event-loop turn after the contributed list changed. The
 *   MCP layer sends `notifications/tools/list_changed` from it (design §13.4);
 * - `logger` (`{info, warn}`), and `now` (epoch milliseconds, default `Date.now`) for the event
 *   rate buckets.
 *
 * `provide(ctx)` provides the service on the connector row's context and closes the registry when
 * that row unloads (EXT-ST-01 #10). One `createContributions` serves **one** connector activation:
 * its registry stays closed after that unload, so the next activation creates a new one, and a
 * second `provide` throws instead of serving a dead service. `list()` and `call()` are for the MCP layer (C-HTTP / C-TOOLS)
 * only. The service itself has exactly the K2 members (R-EXT-11): `apiVersion`, `register`, `emit`
 * and `mine`.
 */
import { EMIT_REFUSAL, TOOLS_API } from '../../tools/index.js'
import { createCalls } from './calls.js'
import { HOST, LOG, SERVICE_REUSED } from './constants.js'
import { createEmit, refused } from './emit.js'
import { createRegistry } from './registry.js'

export { LOG } from './constants.js'

/**
 * @returns {{service: object, provide: (ctx: object) => () => void, list: () => object[],
 *   call: (publicName: string, args: unknown, context: {principal: {key: string, name: string | null}, signal?: AbortSignal}) => Promise<object | undefined>,
 *   close: () => void}}
 */
export function createContributions({ mailbox, router, sessionExists, onToolsChanged, logger, now = Date.now }) {
  // The registry retires through emit's mailbox port; `events` is bound before any call can reach it.
  const registry = createRegistry({ logger, onToolsChanged, retireEvents: (act) => events.retireEvents(act) })
  const events = createEmit({ registry, mailbox, router, sessionExists, logger, now })
  const calls = createCalls({ registry, logger })
  let provided = false

  /** The traced caller context (`this.ctx` through Cordis's tracker; S5 I1). */
  const callerOf = (self) => self?.[HOST.trackerOptions.property]

  /**
   * The K2 service. It carries Cordis's tracker, so in its methods `this.ctx` is the caller's own
   * context. A call that does not come through Cordis has no context and is
   * `contributor-unidentified`.
   */
  const service = Object.freeze({
    [HOST.tracker]: HOST.trackerOptions,
    apiVersion: TOOLS_API.version,
    register(definition) { return registry.register(callerOf(this), definition) },
    async emit(event) {
      try {
        return await events.emit(callerOf(this), event)
      } catch (error) {
        // Every refusal is a returned code, never an exception into the contributor (R-EXT-18).
        // Anything unforeseen means nothing was queued: answered like a failed port (Fishball #4).
        logger.warn(LOG.emitFailed, error?.code ?? error?.name)
        return refused(EMIT_REFUSAL.queueFull)
      }
    },
    mine() { return registry.mine(callerOf(this)) },
  })

  return Object.freeze({
    service,
    provide(ctx) {
      if (provided) throw new Error(SERVICE_REUSED)
      provided = true
      registry.bindHost(ctx.fiber)
      return ctx.effect(() => {
        const dispose = ctx.provide(TOOLS_API.service, service)
        return () => {
          registry.close()
          dispose?.()
        }
      }, HOST.labels.service)
    },
    list: registry.list,
    call: calls.call,
    close: registry.close,
  })
}
