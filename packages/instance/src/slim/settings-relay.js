/**
 * The slim settings relay (SET, docs/planning/v2-set.md): the child's Fishball settings panel asks
 * the main host for what only the main host can do — the instance's status, Retry, Restart and the
 * model sync (Check / Add) — over the authenticated lifecycle wire.
 *
 * Why a relay and not a direct call: the panel runs in the child DSH at its own browser origin
 * (PG-ORIGIN), but the instance's lifecycle and the main DSH's provider inventory live in the main
 * process (host.js). The child cannot restart itself and must never read the main profile, so it
 * sends a typed request on its own payload channel (`instance-settings`, src/native-runtime/wire.js)
 * and the main host answers with the same service calls its own Plugins card routes use.
 *
 * Rules kept here:
 * - Requests flow child → main only; the main end never initiates.
 * - Typed and bounded both ways. A frame outside the shape is refused, never forwarded.
 * - Never retried. A request whose transport closes or that times out answers a typed refusal; an
 *   Add whose answer is lost reports every requested id `failed` `result-unknown`, because the main
 *   host may already have committed it (docs/slim-native-design.md §10).
 * - No secret crosses: the main handlers answer the public `{state, code, detail}` and the provider-sync
 *   browser shape (ids, names, model ids, outcomes, reasons, opaque check id) only.
 */
import { randomUUID } from 'node:crypto'
import { RUNTIME_LIMITS } from '../native-runtime/constants.js'
import { ADMIN_LIMITS } from './child/admin.js'
import { addSelection, SYNC_PAGE } from './host/provider-sync-routes.js'

export const SETTINGS_RELAY = Object.freeze({
  channel: 'instance-settings',
  version: 1,
  op: Object.freeze({ status: 'status', retry: 'retry', restart: 'restart', check: 'check', add: 'add' }),
  code: Object.freeze({
    unavailable: 'settings-relay-unavailable',
    disconnected: 'settings-relay-disconnected',
    timeout: 'settings-relay-timeout',
    closed: 'settings-relay-closed',
    failed: 'settings-relay-failed',
    invalid: 'invalid-request',
    // The provider-sync bridge's own code for an Add whose answer never came (provider-sync-service.js).
    unknown: 'result-unknown',
  }),
  /** The engine's per-entry page outcome for an unknown Add result (CHILD_SYNC.outcome.failed). */
  failedOutcome: 'failed',
  /**
   * Every bound is an existing one, not a new policy:
   * - a status read answers from main memory, so it gets the lifecycle request bound;
   * - Retry/Restart run a whole stop and start, so they get the stop plus startup bounds;
   * - Check/Add wait on the provider-sync bridge's wire request, which has the admin channel's
   *   interactive request bound (PROVIDER_SYNC_TARGET.limits mirrors ADMIN_LIMITS; that module
   *   needs the DSH SDK, so this one reads the admin limits it mirrors);
   * - the frame bound is the admin channel's, which rides the same wire, and a request id is
   *   bounded like an admin name;
   * - the Add body is bounded by the main Add route's body bound (SYNC_PAGE.maxBodyBytes), checked
   *   again here because a child-side caller need not come through that route;
   * - in-flight requests at each end are bounded by the lifecycle wire's own pending bound.
   */
  limits: Object.freeze({
    statusTimeoutMs: RUNTIME_LIMITS.requestTimeoutMs,
    lifecycleTimeoutMs: RUNTIME_LIMITS.stopTimeoutMs + RUNTIME_LIMITS.startupTimeoutMs,
    syncTimeoutMs: ADMIN_LIMITS.requestTimeoutMs,
    frameBytes: ADMIN_LIMITS.frameBytes,
    idChars: ADMIN_LIMITS.nameChars,
    addBytes: SYNC_PAGE.maxBodyBytes,
    maxPending: RUNTIME_LIMITS.maxPendingRequests,
  }),
})

const R = SETTINGS_RELAY
const OPS = new Set(Object.values(R.op))
/** Each op's answer bound; see SETTINGS_RELAY.limits. */
const TIMEOUT_MS = Object.freeze({
  [R.op.status]: R.limits.statusTimeoutMs,
  [R.op.retry]: R.limits.lifecycleTimeoutMs,
  [R.op.restart]: R.limits.lifecycleTimeoutMs,
  [R.op.check]: R.limits.syncTimeoutMs,
  [R.op.add]: R.limits.syncTimeoutMs,
})
const TRANSPORT_METHODS = Object.freeze(['send', 'onMessage', 'onClose'])
const refusal = (code) => ({ ok: false, error: { code } })
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max

/**
 * One op's payload: `add` is the main Add route's selection shape within its body bound (so the
 * child page's Add accepts exactly what the main card's does); every other op takes `{}`.
 */
function validPayload(op, payload) {
  if (!isRecord(payload)) return false
  if (op !== R.op.add) return Object.keys(payload).length === 0
  return addSelection(payload) !== undefined && Buffer.byteLength(JSON.stringify(payload)) <= R.limits.addBytes
}

function validRequest(frame) {
  return isRecord(frame) && frame.v === R.version && boundedText(frame.id, R.limits.idChars) &&
    OPS.has(frame.op) && validPayload(frame.op, frame.payload)
}

/** Wire text, or undefined when it does not fit one frame. */
function encode(frame) {
  let text
  try { text = JSON.stringify(frame) } catch { return undefined }
  return Buffer.byteLength(text) > R.limits.frameBytes ? undefined : text
}

function decode(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > R.limits.frameBytes) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

function checkTransport(transport) {
  for (const method of TRANSPORT_METHODS) {
    if (typeof transport?.[method] !== 'function') throw new TypeError('fishball settings relay: the transport must implement ' + method)
  }
}

/**
 * Shared attach/detach bookkeeping of one end's current transport. `onMessage` receives each frame
 * with the transport it arrived on; `onDetach` runs whenever the current transport goes away.
 * (The admin relay and the provider-sync bridge keep their own equivalent bookkeeping; folding
 * them onto this class is a separate refactor.)
 */
class RelayEnd {
  constructor(onDetach = () => {}) { this.transport = undefined; this.disposers = []; this.closed = false; this.onDetach = onDetach }
  attach(transport, onMessage) {
    if (this.closed) throw new Error('fishball settings relay: closed')
    checkTransport(transport)
    this.detach()
    this.transport = transport
    this.disposers.push(transport.onMessage((text) => onMessage(text, transport)),
      transport.onClose(() => { if (this.transport === transport) this.detach() }))
  }
  detach() {
    for (const dispose of this.disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    const had = this.transport !== undefined
    this.transport = undefined
    if (had) this.onDetach()
  }
  /** Send on `transport` only while it is still the current one. */
  send(transport, text) {
    if (transport === undefined || transport !== this.transport || text === undefined) return false
    try { transport.send(text); return true } catch { this.detach(); return false }
  }
}

/**
 * The main host's end. Each handler answers its op's result: `status`/`retry`/`restart` the public
 * `{state, code, detail}`, `check`/`add` the provider-sync outcome `{ok, result|error}` as it is.
 * @param {{status: Function, retry: Function, restart: Function, check: Function, add: Function}} handlers
 */
export function createSettingsRelayServer(handlers) {
  for (const op of OPS) if (typeof handlers?.[op] !== 'function') throw new TypeError('fishball settings relay: a handler is required for ' + op)
  const end = new RelayEnd()
  let inFlight = 0
  // A reply goes back only on the wire its request came in on: a request still running when the
  // child reconnects (a restart) must never be answered to the new child generation.
  const reply = (transport, id, outcome) => end.send(transport, encode({ v: R.version, id, ...outcome }) ?? encode({ v: R.version, id, ...refusal(R.code.failed) }))
  async function receive(text, transport) {
    if (end.closed) return
    const frame = decode(text)
    if (!validRequest(frame)) {
      if (isRecord(frame) && boundedText(frame.id, R.limits.idChars)) reply(transport, frame.id, refusal(R.code.invalid))
      return
    }
    if (inFlight >= R.limits.maxPending) { reply(transport, frame.id, refusal(R.code.unavailable)); return }
    inFlight++
    let outcome
    try {
      const result = await handlers[frame.op](frame.payload)
      // check/add already answer the page's typed outcome; the lifecycle ops answer a bare status.
      outcome = frame.op === R.op.check || frame.op === R.op.add
        ? (isRecord(result) && typeof result.ok === 'boolean' ? result : refusal(R.code.failed))
        : { ok: true, result }
    } catch { outcome = refusal(R.code.failed) } finally { inFlight-- }
    reply(transport, frame.id, outcome)
  }
  return Object.freeze({
    attach(transport) { end.attach(transport, (text, from) => { receive(text, from).catch(() => {}) }) },
    close() { end.closed = true; end.detach() },
  })
}

/**
 * The child's end. `request(op, payload)` always resolves `{ok, result|error}` and never retries.
 * @param {{timeoutMs?: number}} [options] - one bound for every op, overriding the per-op bounds
 *   of SETTINGS_RELAY.limits (fixtures).
 */
export function createSettingsRelayClient(options = {}) {
  const { timeoutMs } = options
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) throw new TypeError('fishball settings relay: timeoutMs must be a positive integer')
  const pending = new Map()
  // The wire's going away answers everything still in flight: no reply can come any more.
  const end = new RelayEnd(() => failAll(R.code.disconnected))
  /**
   * The answer to a request that went out but never came back. An Add may have committed, so
   * every requested id is reported unknown rather than "nothing added".
   */
  function lost(entry, code) {
    if (entry.op !== R.op.add) return refusal(code)
    return { ok: true, result: { items: entry.payload.ids.map((id) => ({ id, outcome: R.failedOutcome, reason: R.code.unknown })) } }
  }
  function settle(id, outcome) {
    const entry = pending.get(id)
    if (entry === undefined) return
    pending.delete(id)
    clearTimeout(entry.timer)
    entry.resolve(outcome)
  }
  function failAll(code) { for (const [id, entry] of [...pending]) settle(id, lost(entry, code)) }
  function receive(text) {
    const frame = decode(text)
    if (!isRecord(frame) || frame.v !== R.version || typeof frame.id !== 'string' || !pending.has(frame.id)) return
    const valid = frame.ok === true ? Object.hasOwn(frame, 'result') : frame.ok === false && typeof frame.error?.code === 'string'
    settle(frame.id, valid ? (frame.ok ? { ok: true, result: frame.result } : refusal(frame.error.code)) : refusal(R.code.failed))
  }
  return Object.freeze({
    // A replaced wire means the main host reconnected: nothing in flight can be answered, and
    // detaching the old transport (RelayEnd.onDetach) reports exactly that.
    attach(transport) { end.attach(transport, receive) },
    // In-flight requests answer `closed` before the detach could name them `disconnected`.
    close() { end.closed = true; failAll(R.code.closed); end.detach() },
    request(op, payload = {}) {
      if (!OPS.has(op) || !validPayload(op, payload)) return Promise.resolve(refusal(R.code.invalid))
      if (end.closed) return Promise.resolve(refusal(R.code.closed))
      if (end.transport === undefined) return Promise.resolve(refusal(R.code.unavailable))
      if (pending.size >= R.limits.maxPending) return Promise.resolve(refusal(R.code.unavailable))
      const id = randomUUID()
      // Sent before it is pending: a send that throws detaches this end (RelayEnd.send), and the
      // detach must not report this request as a lost answer — it never left, so it is
      // `unavailable` and an Add is not "may have committed". A reply can only arrive on a later
      // message event, so registering right after the synchronous send misses none.
      if (!end.send(end.transport, encode({ v: R.version, id, op, payload }))) return Promise.resolve(refusal(R.code.unavailable))
      return new Promise((resolve) => {
        const entry = { op, payload, resolve, timer: undefined }
        entry.timer = setTimeout(() => settle(id, lost(entry, R.code.timeout)), timeoutMs ?? TIMEOUT_MS[op])
        entry.timer.unref?.()
        pending.set(id, entry)
      })
    },
  })
}
