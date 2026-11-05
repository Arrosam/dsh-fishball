/**
 * The admin relay, main-host half (§9, §15 T11).
 *
 * The rebuilt settings page (T12) reads and changes the isolated child's model, plugins and
 * settings, and restarts it, without the main process writing one child file. This module is
 * the relay: the page calls `request()`, the child's admin service
 * (src/slim/child/admin.js) applies the change with its own DSH services, and this file only
 * frames requests, correlates replies and answers the two host-side operations.
 *
 * Rules kept here, because they are the relay's part of the contract:
 * - The child is the only writer (§9). Nothing here opens a child file: status comes from the
 *   running lifecycle, restart is the lifecycle's own restart, and every other operation is a
 *   typed request the child applies itself.
 * - Refusals are typed, never thrown into the page (§15 T11). `request()` always resolves to
 *   `{ok:true,result}` or `{ok:false,error:{code}}`; a transport failure, a timeout, a
 *   malformed reply and an oversized reply are all codes, not exceptions.
 * - A timeout is terminal for that request. The child may still be applying it (a pnpm install
 *   outlives any interactive wait), so the relay answers `timeout` and never resends; a late
 *   reply is dropped because its request id is no longer pending — the same rule as the session
 *   bridge's "unconfirmed is never retried" (§5.2).
 * - The transport is a channel view of the already-authenticated lifecycle wire
 *   (`{send, onMessage, onClose}`), not a socket and not the wire's owner. This module never
 *   closes it: the session bridge shares that wire, and an admin problem must not take delivery
 *   down.
 *
 * Merge hooks (see the delivery report; this file owns none of them):
 * 1. `src/native-runtime/wire.js` must carry ADMIN.channel as its own payload channel, with the
 *    same framing and backlog the `control` channel has, and hand each end
 *    `{send, onMessage, onClose}`. The bridge keeps `control` exclusively.
 * 2. The main host row creates one relay with the lifecycle's status and restart, and calls
 *    `attach(transport)` from `ctx.nativeRuntime.onAdminTransport(listener)` on every
 *    (re)connect; the child overlay inserts src/slim/child/admin.js as its own row, which does
 *    the same with its end of that channel.
 * 3. T12's routes call `relay.request(operation, payload)`; they never reach the child
 *    directly and never write a file.
 */
import { RECOMMENDED_CATEGORY, RECOMMENDED_PLUGINS } from '../../recommended.js'
import {
  ADMIN, ADMIN_ERROR, ADMIN_LIMITS, ADMIN_OPERATION, ADMIN_OPERATIONS, AdminFailure,
  createAdminCodec, refusal, refusalOf, validateRequest, validateResult,
} from '../child/admin.js'

export { ADMIN, ADMIN_ERROR, ADMIN_LIMITS, ADMIN_OPERATION, ADMIN_OPERATIONS }

/**
 * The isolated Fishball's installable plugins (Q4): a fixed recommended list plus any package
 * spec the owner types into the page. The list is the repository's curated catalogue
 * (src/recommended.js) with the memory category removed, because the child starts with no
 * memory or search plugin installed (§4, D2) and recommending one would contradict that
 * baseline; the catalogue holds no search plugin to remove. The list grants nothing: install
 * accepts any spec, and the child's plugin manager still refuses what it cannot install.
 */
export const ADMIN_RECOMMENDED = Object.freeze(RECOMMENDED_PLUGINS.filter(
  (entry) => entry.category !== RECOMMENDED_CATEGORY.memory,
))

const TRANSPORT_METHODS = Object.freeze(['send', 'onMessage', 'onClose'])
const EMPTY = Object.freeze({})

/**
 * Create the main-side relay.
 *
 * @param {object} options
 * @param {() => {state: string, code?: string|null}} options.status - the lifecycle state in
 *   the contract's STATUS vocabulary, with the safe STATUS_CODES code or null.
 * @param {() => Promise<unknown>} [options.restart] - the lifecycle's restart; resolves once
 *   the child is started again (a new admin transport follows). Absent: restart is refused.
 * @returns the relay; see the methods below for the exact contract.
 */
export function createAdminRelay(options) {
  const { status, restart } = options ?? {}
  if (typeof status !== 'function') throw new TypeError('fishball admin: a status port is required')
  if (restart !== undefined && typeof restart !== 'function') throw new TypeError('fishball admin: restart must be a function')
  return new AdminRelay(status, restart)
}

/**
 * The relay: one live admin channel, request/reply correlation, and the two operations the
 * child never sees.
 */
class AdminRelay {
  constructor(status, restart) {
    this.status = status
    this.restart = restart
    this.codec = createAdminCodec()
    this.pending = new Map()
    this.transport = undefined
    this.disposers = []
    this.closed = false
  }

  /**
   * Attach the admin channel of one authenticated child connection. A replaced transport
   * rejects whatever was still in flight with `disconnected`: the child restarted, so its
   * answers cannot be trusted to belong to this instance.
   * @param {{send: Function, onMessage: Function, onClose: Function}} transport
   */
  attach(transport) {
    if (this.closed) throw new Error('fishball admin: the relay is closed')
    for (const method of TRANSPORT_METHODS) {
      if (typeof transport?.[method] !== 'function') {
        throw new TypeError('fishball admin: the transport must implement ' + method)
      }
    }
    this.detach()
    this.transport = transport
    this.disposers.push(transport.onMessage((encoded) => this.receive(encoded)))
    this.disposers.push(transport.onClose(() => this.detach()))
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.detach()
  }

  /**
   * Run one page operation. Never throws and never retries.
   *
   * Request/result shapes are ADMIN_OPERATIONS' and are validated on both ends; the two host
   * operations are:
   * - `admin.status` → `{state, code}` from the lifecycle.
   * - `admin.restart` → restarts the child, then answers the same status.
   * `admin.plugins.get` answers the child's inventory plus this host's
   * `recommended` list (ADMIN_RECOMMENDED).
   *
   * @param {string} operation - one of ADMIN_OPERATION's values.
   * @param {object} [payload] - the operation's request payload.
   * @returns {Promise<{ok: true, result: object}|{ok: false, error: {code: string}}>}
   */
  async request(operation, payload = EMPTY) {
    try { return await this.run(operation, payload) } catch { return refusal(ADMIN_ERROR.failed) }
  }

  async run(operation, payload) {
    const spec = Object.hasOwn(ADMIN_OPERATIONS, operation) ? ADMIN_OPERATIONS[operation] : undefined
    if (spec === undefined) return refusal(ADMIN_ERROR.operation)
    if (spec.local) return this.local(operation, payload)
    const transport = this.transport
    if (transport === undefined) return refusal(ADMIN_ERROR.unavailable)
    let frame
    try { frame = this.codec.request(operation, payload) } catch (error) { return refusalOf(error) }
    const outcome = await this.exchange(transport, frame, spec.timeoutMs)
    if (!outcome.ok || operation !== ADMIN_OPERATION.pluginsGet) return outcome
    return { ok: true, result: { ...outcome.result, recommended: ADMIN_RECOMMENDED } }
  }

  async local(operation, payload) {
    try { validateRequest(operation, payload) } catch (error) { return refusalOf(error) }
    if (operation === ADMIN_OPERATION.status) return this.statusOutcome()
    return this.restartOutcome()
  }

  /** The lifecycle's status, narrowed to the two fields the page may see (§11: no path, no pid). */
  statusOutcome() {
    let value
    try {
      const reported = this.status()
      value = { state: reported?.state, code: reported?.code ?? null }
      validateResult(ADMIN_OPERATION.status, value)
    } catch {
      return refusal(ADMIN_ERROR.failed)
    }
    return { ok: true, result: value }
  }

  /** Restart is the lifecycle's own operation; the admin only waits for it and reports the state. */
  async restartOutcome() {
    if (this.restart === undefined) return refusal(ADMIN_ERROR.unavailable)
    try { await this.restart() } catch { return refusal(ADMIN_ERROR.failed) }
    return this.statusOutcome()
  }

  exchange(transport, frame, timeoutMs) {
    let encoded
    try { encoded = this.codec.encode(frame) } catch (error) { return Promise.resolve(refusalOf(error)) }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(frame.id)
        resolve(refusal(ADMIN_ERROR.timeout))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(frame.id, { operation: frame.op, resolve, timer })
      try { transport.send(encoded) } catch {
        this.pending.delete(frame.id)
        clearTimeout(timer)
        resolve(refusal(ADMIN_ERROR.disconnected))
      }
    })
  }

  receive(encoded) {
    let frame
    try { frame = this.codec.decode(encoded) } catch { return }
    if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string') return
    const pending = this.pending.get(frame.id)
    // A reply to nothing: a late answer to a timed-out request, or another instance's frame.
    // Dropping it is the only safe answer; nothing is retried.
    if (pending === undefined) return
    this.pending.delete(frame.id)
    clearTimeout(pending.timer)
    let outcome
    try { outcome = this.codec.acceptReply(frame, pending.operation) } catch {
      outcome = refusal(ADMIN_ERROR.invalidResponse)
    }
    pending.resolve(outcome)
  }

  detach() {
    for (const dispose of this.disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    this.transport = undefined
    for (const [id, pending] of [...this.pending.entries()]) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.resolve(refusal(ADMIN_ERROR.disconnected))
    }
  }
}
