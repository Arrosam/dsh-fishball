/**
 * How the instance row follows the connector's `fishballConnector` service (design §0.6,
 * inst-OQ-02). The row cannot list the service in its own `inject`: every key listed there gates
 * the row's activation, and the instance must load, and report, without the connector (D25). So
 * it opens an optional sub-scope with `ctx.inject([fishballConnector])`. Cordis activates that
 * sub-scope when the connector row provides the service and unloads it when the service leaves
 * (disable, uninstall, reload), on 0.2.1-rc.5 and 0.2.2-rc.1 alike. That is how a connector
 * enabled at runtime is noticed with no main restart, and how a disabled one is noticed at once.
 */
import { ATTACH_ERROR, CONNECTOR_SERVICE, STATUS, STATUS_CODES } from '../slim/contract.js'

/** The instance's own state while the connector service is absent (D25); not a contract value. */
export const BINDING_STATE = Object.freeze({ connectorMissing: 'connector-missing' })
/**
 * The instance's own codes for a refused attach (design §18.5 inst-OQ-03). They are instance
 * codes, not contract STATUS_CODES, so they never reach the connector through `status()`.
 */
export const BINDING_CODE = Object.freeze({ instanceBusy: 'NATIVE_INSTANCE_BUSY', contractVersion: 'NATIVE_CONTRACT_VERSION' })
/**
 * Launch refusals this row reports as their own code instead of the generic NATIVE_START_FAILED
 * (D2). INVALID_MAIN_HOME is the one the user can act on: the DSH home is not a canonical real
 * path (README Install).
 */
export const LAUNCH_CODE = Object.freeze({ invalidMainHome: 'INVALID_MAIN_HOME' })
/**
 * The attach refusals that fail the start and stop the child, each with the code it reports
 * (inst-OQ-03: no attach means nothing can use the child). The other refusals (`ui-invalid`,
 * `transport-invalid`, `instance-invalid`) would be this row's own descriptor bug; the design
 * names no outcome for them, so they are only logged, as before.
 */
export const REFUSAL_CODE = Object.freeze({
  [ATTACH_ERROR.busy]: BINDING_CODE.instanceBusy,
  [ATTACH_ERROR.version]: BINDING_CODE.contractVersion,
})
/** Every state and code the instance itself reports: the contract's plus the binding's. */
export const INSTANCE_STATES = Object.freeze([...Object.values(STATUS), ...Object.values(BINDING_STATE)])
export const INSTANCE_CODES = Object.freeze([...Object.values(STATUS_CODES), ...Object.values(BINDING_CODE), ...Object.values(LAUNCH_CODE)])

const CONTRACT_STATES = new Set(Object.values(STATUS))
const CONTRACT_CODES = new Set(Object.values(STATUS_CODES))
/**
 * What the connector shows for a `status()` answer outside STATUS/STATUS_CODES (§18.5
 * conn-OQ-53). Giving it here keeps the frame's tag the same while the connector never sees, or
 * logs, a value the contract does not define.
 */
const OUTSIDE_CONTRACT = Object.freeze({ state: STATUS.failed, code: STATUS_CODES.unavailable })

/**
 * The instance's status in the contract's vocabulary, for the attachment's `status()` (contract
 * §1.1: only STATUS states and STATUS_CODES codes or null). The instance's own extras cannot
 * occur while it is attached: `connector-missing` follows the connector's departure, which has
 * already detached it, and a refusal code means the attach never happened. They map to the
 * connector's own out-of-vocabulary outcome rather than to a state the design never chose.
 *
 * @param {{state: string, code: string|null}} status - the instance's own status.
 * @returns {{state: string, code: string|null}} a new object of exactly those two keys.
 */
export function contractStatus({ state, code }) {
  const inContract = CONTRACT_STATES.has(state) && (code === null || CONTRACT_CODES.has(code))
  return inContract ? { state, code } : { ...OUTSIDE_CONTRACT }
}

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
    // Register the departure as an effect of the sub-scope instead of returning it. Cordis treats
    // any callback with a prototype as a class: it calls `new callback(...)` and discards the
    // constructor's return value, so a returned disposer never runs on either target version
    // (@deepseek-ai/cordis 4.0.5, isConstructor and the plugin runner). The effect is collected
    // by the sub-scope's own fiber and runs when the injected service goes away.
    scope.effect(() => disappeared, 'fishball-instance: connector departure')
  })
}
