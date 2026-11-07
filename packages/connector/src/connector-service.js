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
import { ATTACH_ERROR, CONNECTOR_SERVICE, ERROR, STATUS, STATUS_CODES, ContractError, validateAttachment } from '../contract/index.js'
import { API_CODE, PLUGIN } from './constants.js'
import { diagnosticOf } from './errors.js'
import { createApprovalRelay } from './slim/host/approvals.js'
import { createBridgeHost } from './slim/host/bridge.js'
import { createSessionPort } from './slim/host/session-port.js'

/** The row's own bookkeeping for the provided service; never a contract name. */
const BINDING = Object.freeze({
  cleanup: 'fishball-connector: fishballConnector instance binding',
})

/**
 * What the connector's frame shows as the instance's state (design §0.5 "The frame", D27,
 * conn-OQ-25, conn-OQ-53). A `status()` state is shown as it is. Two display states are the
 * connector's own and never contract STATUS values: `unattached` with no instance, `attached`
 * for an instance that gave no `status`. A `status()` that throws or answers outside
 * STATUS/STATUS_CODES shows `failed` with NATIVE_UNAVAILABLE.
 */
export const FRAME_STATE = Object.freeze({ unattached: 'unattached', attached: 'attached' })
const STATUS_STATES = new Set(Object.values(STATUS))
const STATUS_CODE_SET = new Set(Object.values(STATUS_CODES))
/** Why a status() answer was not shown; logged by these codes only, never by value. */
const STATUS_FAULT = Object.freeze({ threw: 'status-threw', invalid: 'status-invalid' })
const RETRY_FAULT = 'retry-rejected'
const UNSAFE_STATUS = Object.freeze({ state: STATUS.failed, code: STATUS_CODES.unavailable })

/** The instance's status() as one safe {state, code, fault}; never throws. */
function readStatus(status) {
  if (status === undefined) return { state: FRAME_STATE.attached, code: null, fault: null }
  let value
  try { value = status() } catch { return { ...UNSAFE_STATUS, fault: STATUS_FAULT.threw } }
  // The contract's `{state, code}`: a STATUS state and a STATUS_CODES code or null (§1.1).
  const valid = value !== null && typeof value === 'object' && STATUS_STATES.has(value.state) &&
    (value.code === null || STATUS_CODE_SET.has(value.code))
  return valid ? { state: value.state, code: value.code, fault: null } : { ...UNSAFE_STATUS, fault: STATUS_FAULT.invalid }
}

/**
 * Provide the `fishballConnector` service on the connector row and dispose it with the row.
 *
 * The returned object is the row's own internal view of the attachment, for its browser routes
 * and its state snapshot only. It is deliberately not on the provided service: the service keeps
 * exactly the contract's two members (`attachInstance`, `current`, conn-OQ-49), and `current()`
 * keeps exactly CONNECTOR_SERVICE_API.currentKeys, so no instance can reach `ui`, `status` or
 * `retry` of another (or its own) attachment through the connector.
 *
 * @param {object} ctx - the connector row's Cordis context (provide, get, effect, logger).
 * @param {object} [options]
 * @param {() => void} [options.onChange] - called after every attach and every end of an attachment.
 * @returns {{view: () => object, retry: () => Promise<object>}} view(): the frame's
 *   {attached, name, ui, state, code, canRetry, attachCount}, where `attached` is false for an
 *   instance whose channel ended (kept below) as for none; retry(): awaits the instance's
 *   retry() when the frame offers Retry, and resolves {ok: true} or {ok: false, code} (never rejects).
 */
export function provideConnectorService(ctx, { onChange } = {}) {
  if (!ctx || typeof ctx.provide !== 'function') throw new TypeError('fishball connector: a Cordis context is required')
  const logger = typeof ctx.logger === 'function' ? ctx.logger(PLUGIN.logger) : undefined
  const changed = () => { try { onChange?.() } catch (error) { logger?.warn('instance change listener failed (%s)', diagnosticOf(error)) } }
  /** The last status fault logged, so a bad status() is logged once per change (conn-OQ-53). */
  let loggedFault = null
  /** The row is gone: no new attachment is possible and the service leaves the container. */
  let closed = false
  /** The live attachment record, or undefined in no-instance mode. */
  let active
  /**
   * The last attachment whose channel ended without its detach() (the transport's onClose, or a
   * close by the connector), kept for the frame only (contract §9): a killed child closes its
   * channel while the instance stays the owner of the status that says why (`failed`,
   * NATIVE_CHILD_EXITED) and of the Retry that restarts it (design §18.4 E2E-B6). It plays no part
   * in routing: current() stays null and a new attach is accepted. Its detach(), the next attach
   * and the row's dispose forget it. Only an attachment that gave `status` is kept, since there is
   * nothing to show for one that did not.
   */
  let kept
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

  /** Leave the attachment this record owns; false when it is not the live one (a stale call, §1.3). */
  function release(record) {
    if (record === undefined || active !== record) return false
    active = undefined
    closeRecord(record)
    return true
  }

  /** detach() and the row's dispose: no-instance mode, and the frame forgets this instance too. */
  function end(record) {
    const released = release(record)
    const forgotten = record !== undefined && kept === record
    if (forgotten) kept = undefined
    if (released || forgotten) changed()
  }

  /** The channel ended without detach(): no-instance mode, with the instance's own status kept for the frame. */
  function lose(record) {
    if (!release(record)) return
    kept = record.status === undefined ? undefined : record
    changed()
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
      // Kept for the row's frame only (view, retry above), never handed back through current().
      ui: validated.ui,
      status: validated.status,
      retry: validated.retry,
      approvals: undefined,
      host: undefined,
      connection: undefined,
    }
    // Reserve the one place before the transport can report a close: a synchronous onClose
    // during the attach below must end this record like any later close, not be lost.
    active = record
    kept = undefined
    try {
      // The session port reads the row's own live registries through SESSION_STATE, and the
      // approval relay re-registers that row's tool bodies; neither is re-implemented here.
      const sessions = createSessionPort(ctx, { enabled: () => !closed && active === record })
      const approvals = createApprovalRelay({ ctx, sessions })
      const host = createBridgeHost({ hostId: validated.id, sessions })
      // The relay's handlers and connection edge must exist before the transport attaches, so the
      // handshake advertises them (approvals.js).
      approvals.attach(host)
      host.onConnection(({ ready }) => { if (!ready) lose(record) })
      record.approvals = approvals
      record.host = host
      record.connection = host.attach(validated.transport)
    } catch (error) {
      if (active === record) active = undefined
      // A close reported during this failed attach may have kept it; a refused attach keeps nothing.
      if (kept === record) kept = undefined
      closeRecord(record)
      throw error
    }
    // Counted even if the channel closed during the attach: the attach itself was accepted.
    attachCount = record.snapshot.attachCount
    // A close during the attach already ended the record (and reported it); report only a live one.
    if (active === record) changed()
    return Object.freeze({ detach: () => end(record) })
  }

  /**
   * The attachment as the frame shows it, or the kept one with `attached: false`; status() is read
   * afresh on every call.
   */
  function view() {
    const record = active ?? kept
    if (record === undefined) {
      return { attached: false, name: null, ui: {}, state: FRAME_STATE.unattached, code: null, canRetry: false, attachCount }
    }
    const { state, code, fault } = readStatus(record.status)
    if (fault !== loggedFault) {
      if (fault !== null) logger?.warn('instance status not shown (%s)', fault)
      loggedFault = fault
    }
    return {
      attached: record === active, name: record.snapshot.name, ui: { ...record.ui }, state, code,
      // Retry only for a failed instance that gave retry (conn-OQ-25).
      canRetry: state === STATUS.failed && record.retry !== undefined,
      attachCount: record.snapshot.attachCount,
    }
  }

  /** The frame's Retry: awaits the instance's own retry(); a rejection is NATIVE_UNAVAILABLE (conn-OQ-25). */
  async function retry() {
    const record = active ?? kept
    if (record === undefined || !view().canRetry) return { ok: false, code: API_CODE.unavailable }
    try {
      await record.retry()
      return { ok: true }
    } catch {
      logger?.warn('instance retry failed (%s)', RETRY_FAULT)
      return { ok: false, code: STATUS_CODES.unavailable }
    }
  }

  ctx.effect(() => {
    const dispose = ctx.provide(CONNECTOR_SERVICE, service)
    return () => {
      closed = true
      // At most one of them exists: an attach forgets the kept one.
      end(active ?? kept)
      dispose?.()
    }
  }, BINDING.cleanup)
  return Object.freeze({ view, retry })
}
