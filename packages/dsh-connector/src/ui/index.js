/**
 * The connector's UI backend (task C-UI-BACKEND; requirements 1.34, 1.38 Q-U1/Q-U2/Q-N1/Q-N3,
 * 1.41 Q-G4/Q-G5; R-ARCH-04, R-UI-04/05/10, R-FN-01, R-EXT-13; design §1.0, §3.6, §13.6).
 *
 * The user: "embed UI只是connector的附属，负责帮connector显示出和fishball交互的UI。所有的操作的功能
 * 实现都由connector完成，也就是connector当后端，embed UI当前端。" So every operation and all state
 * behind what `dsh-connector-ui` draws are here:
 * - the managed marks and the Hand over / Take back operations, over K3 `dshConnectorHandover`;
 * - the Hand over targets and their online / offline lights (R-UI-10), from the same service;
 * - the attention latch (§13.6) and the notify prompt (R-FN-01), with the handlers of the tools
 *   embed-UI declares;
 * - the owner-only routes and the live-change stream embed-UI's browser half reads.
 * There are no cards (Q-U2) and no inline records (Q-G4), so nothing here reads sessions.
 *
 * Composition only: C-WIRE (W4b) builds it with the routing module's hand-over service and calls
 * `provide(ctx)` on the connector row. Embed-UI's host half then finds `dshConnectorUi` with
 * `ctx.get` and calls `contribute` with its own `dshConnectorTools.register`; that is the C-EXT
 * mechanism, so the tools carry embed-UI's namespace and leave with it (Q-N3 = A).
 *
 * `createUiBackend({handover, maxNoteBytes, logger})` → `{service, provide(ctx), snapshot(), close()}`
 * (`maxNoteBytes()`: the Hand over / Take back note bound, the connector's live `maxMessageBytes`):
 * - `service` (frozen; what embed-UI may use): `apiVersion`, `routes` (UI_ROUTE) and
 *   `contribute(register) → dispose`. `register` is the caller's bound
 *   `dshConnectorTools.register`; it is called once per tool. A throw part-way disposes the
 *   registrations made and rethrows. The dispose is idempotent and resets the latch and the notice,
 *   because what embed-UI showed does not outlive its contribution (§13.6: reset on unload).
 * - `provide(ctx)`: follows the hand-over service and serves the routes and the service, for the
 *   context's life; once per backend. Its end closes the backend.
 * - `close()`: ends the streams, stops following the hand-over service and ends every
 *   contribution; a later `contribute` throws. Idempotent.
 */
import { diagnosticOf } from '../errors.js'
import { LIMITS } from '../config.js'
import { LOG, MISUSE, UI_ROUTE, UI_SERVICE } from './constants.js'

/** The `maxMessageBytes` default, from its one owner (config.js LIMITS). */
const MESSAGE_BYTES_FIELD = 'maxMessageBytes'
const defaultNoteBytes = () => LIMITS.find((limit) => limit.field === MESSAGE_BYTES_FIELD).defaultValue
import { createStreams, registerUiRoute, uiRoutes } from './routes.js'
import { createUiState } from './state.js'
import { uiTools } from './tools.js'

export { NOTIFY, UI_CODE, UI_ROUTE, UI_SERVICE, UI_TOOL } from './constants.js'

/**
 * Disposes a list of disposers once each, last first; a throwing disposer does not stop the rest.
 * @returns the first error, or undefined
 */
function disposeAll(disposers) {
  let first
  for (const dispose of disposers.splice(0).reverse()) {
    try { dispose?.() } catch (error) { first ??= error }
  }
  return first
}

/**
 * @param {object} deps
 * @param deps.handover - K3 `DshConnectorHandover` (the routing module's `handover`)
 * @param deps.maxNoteBytes - `() => number`, the live note bound in UTF-8 bytes; by default the
 *   connector's `maxMessageBytes` default (config.js LIMITS), so a backend built without the
 *   setting bounds a note as the row's default does. C-WIRE always passes the live setting.
 * @param deps.logger - `{warn}`
 */
export function createUiBackend({ handover, maxNoteBytes = defaultNoteBytes, logger }) {
  const streams = createStreams(() => state.snapshot(), logger)
  const state = createUiState({ handover, changed: () => streams.publish() })
  const contributions = new Set()
  let unfollow
  let provided = false
  let closed = false

  /** One contribution: every tool registered through `register`, ended together. */
  function contribute(register) {
    if (typeof register !== 'function') throw new TypeError(MISUSE.register)
    // A backend that is closed serves no tools: its state and streams are gone.
    if (closed) throw new Error(MISUSE.closed)
    const disposers = []
    for (const definition of uiTools(state)) {
      try { disposers.push(register(definition)) } catch (error) {
        disposeAll(disposers)
        throw error
      }
    }
    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      contributions.delete(end)
      const error = disposeAll(disposers)
      state.reset()
      if (error !== undefined) throw error
    }
    contributions.add(end)
    return end
  }

  const service = Object.freeze({ apiVersion: UI_SERVICE.apiVersion, routes: UI_ROUTE, contribute })

  function close() {
    if (closed) return
    closed = true
    unfollow?.()
    for (const end of [...contributions]) {
      // Its registrations are disposed either way; the failure is only reported.
      try { end() } catch (error) { logger.warn(LOG.format, LOG.endFailed, diagnosticOf(error)) }
    }
    streams.close()
  }

  return Object.freeze({
    service,
    snapshot: () => state.snapshot(),
    close,
    /**
     * Follows the hand-over service, registers the routes and provides the service, all for the
     * context's life: one effect, whose end (the row's unload, or the returned disposer) is
     * `close()` plus the routes and the service leaving. So a backend never outlives its row.
     */
    provide(ctx) {
      if (provided) throw new Error(MISUSE.provideTwice)
      provided = true
      return ctx.effect(() => {
        unfollow = handover.onChange(() => streams.publish())
        const disposers = []
        const end = () => {
          close()
          disposeAll(disposers)
        }
        try {
          for (const route of uiRoutes({ handover, state, streams, maxNoteBytes, logger })) disposers.push(registerUiRoute(ctx, route))
          disposers.push(ctx.provide(UI_SERVICE.name, service))
        } catch (error) {
          // A route path another row holds, or a failed provide: nothing of this backend stays.
          end()
          throw error
        }
        return end
      }, UI_SERVICE.label)
    },
  })
}
