/**
 * The `fishballConnector` service: the connector's side of contract v1's in-process binding
 * (docs/connector-contract.md §1; design §0.4). The row provides it when it is applied, with or
 * without an instance, so an instance injects one name and the connector alone still offers the
 * same service (contract §9). It replaces M1's interim `fishballConnectorBridge`, which was an
 * internal seam and never part of the contract.
 *
 * One attachment at a time, and one attachment object per attach: attach creates this
 * attachment's session port, approval relay and bridge host, and ends them on detach. A child
 * restart is a detach followed by a new attach (contract §1.3), so a reconnect never inherits the
 * previous channel's offers or remembered requests; the intake ledger stays the durable queue
 * that replays unacknowledged inputs (src/intake.js).
 *
 * The descriptor's `id` is also the frame host identity. Every frame carries a `hostId`
 * (contract §3.1) and the binding declares no other identity, so the connector has no other way
 * to know which peer a frame belongs to. The built-in instance passes its lifecycle host id,
 * which is the same value its child's bridge client stamps on frames.
 */
import { ATTACH_ERROR, CONNECTOR_SERVICE, ERROR, ContractError, validateAttachment } from '../contract/index.js'
import { createApprovalRelay } from './slim/host/approvals.js'
import { createBridgeHost } from './slim/host/bridge.js'
import { createSessionPort } from './slim/host/session-port.js'

/** The row's own bookkeeping for the provided service; never a contract name. */
const BINDING = Object.freeze({
  cleanup: 'fishball-connector: fishballConnector instance binding',
})

/**
 * Provide the `fishballConnector` service on the connector row and dispose it with the row.
 *
 * @param {object} ctx - the connector row's Cordis context (provide, get, effect, logger).
 * @returns {void}
 */
export function provideConnectorService(ctx) {
  if (!ctx || typeof ctx.provide !== 'function') throw new TypeError('fishball connector: a Cordis context is required')
  /** The row is gone: no new attachment is possible and the service leaves the container. */
  let closed = false
  /** The live attachment record, or undefined in no-instance mode. */
  let active
  /** Attaches since the row was applied, reported by current() (contract §1, conn-OQ-08). */
  let attachCount = 0
  const service = Object.freeze({
    attachInstance: (descriptor) => attach(descriptor),
    current: () => (active === undefined ? null : active.snapshot),
  })

  /** Close one attachment's channel and objects; the transport closes on the connector's behalf. */
  function closeRecord(record) {
    // The connector closes the transport on its own dispose and after every closing failure
    // (contract §1.3, conn-OQ-48); the instance then sees its onClose and stops as
    // "connector missing" (inst-OQ-02).
    try { record.connection?.close() } catch { /* already gone */ }
    try { record.host?.close() } catch { /* already gone */ }
    try { record.approvals?.close() } catch { /* already gone */ }
  }

  /** End the attachment this record owns. A stale detach or onClose changes nothing (§1.3). */
  function end(record) {
    if (record === undefined || active !== record) return
    active = undefined
    closeRecord(record)
  }

  function attach(descriptor) {
    // A disposed row removes the service; only a holder of a stale reference reaches this, and
    // no attachment can exist any more.
    if (closed) throw new ContractError(ERROR.disconnected)
    // Contract §1.3 checks 1-5: the descriptor shape, the version, the transport, the ui paths,
    // then id/name/status/retry. They call no transport method, so a refusal has no side effect.
    const validated = validateAttachment(descriptor)
    // Check 6, last: one instance at a time (contract §1.3).
    if (active !== undefined) throw new ContractError(ATTACH_ERROR.busy)
    const record = {
      snapshot: Object.freeze({ id: validated.id, name: validated.name, attachedAt: Date.now(), attachCount: attachCount + 1 }),
      approvals: undefined,
      host: undefined,
      connection: undefined,
    }
    // Reserve the one place before the transport can report a close: a synchronous onClose
    // during the attach below must end this record like any later close, not be lost.
    active = record
    try {
      // The session port reads the row's own live registries through SESSION_STATE, and the
      // approval relay re-registers that row's tool bodies; neither is re-implemented here.
      const sessions = createSessionPort(ctx, { enabled: () => !closed && active === record })
      const approvals = createApprovalRelay({ ctx, sessions })
      const host = createBridgeHost({ hostId: validated.id, sessions })
      // The relay's handlers and connection edge must exist before the transport attaches, so the
      // handshake advertises them (approvals.js).
      approvals.attach(host)
      host.onConnection(({ ready }) => { if (!ready) end(record) })
      record.approvals = approvals
      record.host = host
      record.connection = host.attach(validated.transport)
    } catch (error) {
      if (active === record) active = undefined
      closeRecord(record)
      throw error
    }
    // Counted even if the channel closed during the attach: the attach itself was accepted.
    attachCount = record.snapshot.attachCount
    return Object.freeze({ detach: () => end(record) })
  }

  ctx.effect(() => {
    const dispose = ctx.provide(CONNECTOR_SERVICE, service)
    return () => {
      closed = true
      end(active)
      dispose?.()
    }
  }, BINDING.cleanup)
}
