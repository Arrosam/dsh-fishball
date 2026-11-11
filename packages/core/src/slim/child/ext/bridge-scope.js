/** X12 is a local restriction over the retained authenticated bridge, not a transport. */
import { ContractError, ERROR, OPERATIONS } from 'fishball-connector/contract'

const SCOPE = Object.freeze({
  invalidPlugin: 'fishball bridge scope: a plugin id is required',
  invalidOperations: 'fishball bridge scope: operations must be a list',
})

/**
 * Bind this factory only in instance-owned composition. Never publish the raw client to
 * extension consumers: it owns capability declaration and the authenticated transport.
 *
 * @param {{requiredCapabilities: string[], request: Function}} client
 * @returns {(pluginId: string, operations: string[]) => {request: Function}}
 */
export function createBridgeScope(client) {
  const request = client.request.bind(client)
  return (pluginId, operations) => {
    if (typeof pluginId !== 'string' || !pluginId.trim()) throw new TypeError(SCOPE.invalidPlugin)
    if (!Array.isArray(operations)) throw new TypeError(SCOPE.invalidOperations)
    // Copy before checking: changing the caller's list must never widen a live handle.
    const allowed = new Set(operations)
    const required = new Set([...client.requiredCapabilities, ...(client.allowedOptionalCapabilities ?? [])].filter((operation) => Object.hasOwn(OPERATIONS, operation)))
    for (const operation of allowed) {
      if (!required.has(operation)) throw new ContractError(ERROR.forbidden)
    }
    return Object.freeze({
      supports(operation) {
        if (!allowed.has(operation)) throw new ContractError(ERROR.forbidden)
        return client.supports(operation)
      },
      async request(operation, payload) {
        // Refuse before invoking any bridge method, even while detached. The ordinary
        // request path still owns validation, X19, reservation, timeout and transport.
        if (!allowed.has(operation)) throw new ContractError(ERROR.forbidden)
        return request(operation, payload)
      },
    })
  }
}
