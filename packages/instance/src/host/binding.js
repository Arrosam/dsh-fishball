/**
 * How the instance row follows the connector's `fishballConnector` service (design §0.6,
 * inst-OQ-02). The row cannot list the service in its own `inject`: every key listed there gates
 * the row's activation, and the instance must load, and report, without the connector (D25). So
 * it opens an optional sub-scope with `ctx.inject([fishballConnector])`. Cordis activates that
 * sub-scope when the connector row provides the service and unloads it when the service leaves
 * (disable, uninstall, reload), on 0.2.1-rc.5 and 0.2.2-rc.1 alike. That is how a connector
 * enabled at runtime is noticed with no main restart, and how a disabled one is noticed at once.
 */
import { CONNECTOR_SERVICE } from '../slim/contract.js'

/** The instance's own state while the connector service is absent (D25); not a contract value. */
export const BINDING_STATE = Object.freeze({ connectorMissing: 'connector-missing' })

/**
 * Report the connector service's arrivals and departures.
 *
 * @param {object} ctx - the instance row's Cordis context.
 * @param {object} handlers
 * @param {(connector: object) => void} handlers.appeared - the service is provided and active.
 * @param {() => void} handlers.disappeared - the service left. It runs inside the sub-scope's
 *   unload, so it should only schedule work: the connector's own disposal awaits this unload.
 * @returns {void} The sub-scope is a child of the row and ends with it.
 */
export function followConnector(ctx, { appeared, disappeared }) {
  ctx.inject([CONNECTOR_SERVICE], function fishballConnectorBinding(scope) {
    appeared(scope[CONNECTOR_SERVICE])
    return disappeared
  })
}
