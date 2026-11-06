/**
 * INTERIM (M1 only): the session bridge offered to the built-in instance as an internal service.
 *
 * C1 REPLACES THIS with the contract's `fishballConnector.attachInstance` (docs/connector-contract.md
 * §1). Do not build on it. It is not part of the contract, `./contract` does not export it, and a
 * third-party instance must never read it.
 *
 * Why it exists: M1 splits the repository into two packages but only moves code. Before the split,
 * the native host row built the bridge host, the session port and the approval relay itself.
 * Those modules work on main sessions, so they belong to the connector (design §0.2), and the
 * instance may import nothing of the connector except `./contract`. This service keeps the built-in
 * pair working across that boundary without an import. The instance reads it with `ctx.get` and
 * hands it the control transport of each authenticated wire, exactly as it did in-process before.
 *
 * Each hostId keeps one bridge host for the connector row's lifetime, so a child restart reconnects
 * to the same host, as before; host.attach replaces the previous connection itself. Unacked inbox
 * items wait in that host for the next connection, since closing the instance row no longer
 * closes the host.
 */
import { createBridgeHost } from './bridge.js'
import { createSessionPort } from './session-port.js'
import { createApprovalRelay } from './approvals.js'

export const INTERIM_BRIDGE = Object.freeze({
  /** The built-in instance's host.js names the same service (PLUGIN.bridgeService). */
  service: 'fishballConnectorBridge',
  cleanup: 'fishball-connector: interim bridge (replaced by attachInstance in C1)',
})

/** Provide the interim service on the connector row; disposing the row closes every host. */
export function provideInterimBridge(ctx) {
  let closed = false
  const sessions = createSessionPort(ctx, { enabled: () => !closed })
  const approvals = createApprovalRelay({ ctx, sessions })
  const hosts = new Map()
  const open = (transport, { hostId, connectionId } = {}) => {
    let host = hosts.get(hostId)
    if (!host) {
      host = createBridgeHost({ hostId, sessions })
      // The approval operations enter this host's welcome; the relay re-offers live cards on each connection.
      approvals.attach(host)
      hosts.set(hostId, host)
    }
    const connection = host.attach(transport, { connectionId })
    return Object.freeze({ close: () => connection.close() })
  }
  ctx.effect(() => {
    const dispose = ctx.provide(INTERIM_BRIDGE.service, Object.freeze({ open }))
    return () => {
      closed = true
      approvals.close()
      for (const host of hosts.values()) host.close()
      hosts.clear()
      dispose?.()
    }
  }, INTERIM_BRIDGE.cleanup)
}
