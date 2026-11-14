/**
 * `emit(event)`: contributor events (design §13.5a; R-EXT-16…19; EXT-DT-01, EXT-DT-02; spike V3-S5 D1–D8).
 *
 * The checks run in K2's EMIT_CHECK_ORDER, and the first failing one is returned as a code, never
 * thrown (R-EXT-18):
 * - registry-closed, contributor-unidentified, namespace-reserved (registry.admit);
 * - contributor-unavailable: the caller's fiber is gone, or its activation is quarantined or
 *   cannot be made (R-EXT-19);
 * - event-invalid: not an object; a name outside the grammar; a summary that is not a string or is
 *   over EVENT_LIMITS.summaryChars; a payload that is not lossless JSON; a `sessionId` or
 *   `dedupeKey` that is not a string; or a `sessionId` naming no session of this DSH (TQ-14);
 * - payload-too-large: the payload's JSON text is over EVENT_LIMITS.payloadBytes;
 * - no-fishball: the router names no recipient (R-EXT-17);
 * - rate-limited: the (contributor, recipient) token bucket is empty;
 * - duplicate and queue-full: the mailbox's answer to the commit (K1 `Mailbox.commit`).
 *
 * Quarantine counting (K2; Fishball 2026-11-14, D): `event-invalid` and `payload-too-large` count
 * as failures and an accepted emit counts as a success. Refusals after validation are not counted.
 * Ports that throw (`sessionExists`, the router, the mailbox) are logged and answered `queue-full`:
 * nothing was queued and the contributor may retry (Fishball 2026-11-14, #4). Such an emit is not
 * counted and takes no token.
 */
import { CONTRIBUTED_TYPE_PREFIX, RETIREMENT_REASON } from '../../mcp-schema/index.js'
import { EMIT_CHECK_ORDER, EMIT_REFUSAL, EVENT_LIMITS, publicNameFor } from '../../tools/index.js'
import { retireCommitted } from './activation.js'
import { EMIT, LOG, PORT } from './constants.js'
import { isLive } from './identity.js'
import { byteLength, snapshotJson } from './json.js'

/**
 * The order `emitFor` below checks in. Its data dependencies fix it (the rate bucket needs the
 * recipient, and duplicate / queue-full are the commit's answer), so it is written out as code, and
 * this list is checked against K2's EMIT_CHECK_ORDER when the module loads. A K2 amendment of the
 * order then fails the connector's load loudly instead of letting `emit` silently disagree with it.
 */
const IMPLEMENTED_ORDER = Object.freeze([
  EMIT_REFUSAL.registryClosed, EMIT_REFUSAL.contributorUnidentified, EMIT_REFUSAL.namespaceReserved,
  EMIT_REFUSAL.contributorUnavailable, EMIT_REFUSAL.eventInvalid, EMIT_REFUSAL.payloadTooLarge,
  EMIT_REFUSAL.noFishball, EMIT_REFUSAL.rateLimited, EMIT_REFUSAL.duplicate, EMIT_REFUSAL.queueFull,
])
if (IMPLEMENTED_ORDER.length !== EMIT_CHECK_ORDER.length || IMPLEMENTED_ORDER.some((code, index) => EMIT_CHECK_ORDER[index] !== code)) {
  throw new Error(EMIT.orderMismatch)
}

const codePoints = (text) => [...text].length
const ANY_VALUE = Object.freeze({})
/** An emit refusal: always a returned value, never a throw (R-EXT-18). */
export const refused = (code) => Object.freeze({ ok: false, code })
const optionalString = (value) => value === undefined || typeof value === 'string'

/** Thrown inside the pipeline when a port fails; carries the port's name for the log. */
class PortFailure {
  constructor(port, error) { this.port = port; this.error = error }
}

async function port(name, task) {
  try { return await task() } catch (error) { throw new PortFailure(name, error) }
}

/**
 * The event's fields read once each, or undefined when it is malformed (event-invalid). The
 * payload is one snapshot (json.js), so what is measured is what is sent.
 */
function readEvent(event, namespace) {
  try {
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return undefined
    const { event: name, payload, summary, sessionId, dedupeKey } = event
    const publicName = publicNameFor(namespace, name)
    if (publicName === undefined) return undefined
    if (!optionalString(summary) || (summary !== undefined && codePoints(summary) > EVENT_LIMITS.summaryChars)) return undefined
    if (!optionalString(sessionId) || !optionalString(dedupeKey)) return undefined
    const snapshot = snapshotJson(payload, ANY_VALUE)
    if (snapshot === undefined) return undefined
    return { publicName, payload: snapshot.value, payloadText: snapshot.text, summary, sessionId, dedupeKey }
  } catch {
    // A hostile getter or proxy is a malformed event.
    return undefined
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./registry.js').createRegistry>} deps.registry
 * @param {import('../../mcp-schema/index.js').Mailbox} deps.mailbox K1 `Mailbox` (C-MAILBOX)
 * @param {import('../../mcp-schema/index.js').Router} deps.router K1 `Router` (C-ROUTE)
 * @param {(sessionId: string) => boolean | Promise<boolean>} deps.sessionExists whether a session
 *   of this DSH has that id (Fishball 2026-11-14, #3; C-WIRE wires it to DSH's sessions)
 * @param {{warn: Function}} deps.logger
 * @param {() => number} deps.now the clock in epoch milliseconds, for the rate buckets
 */
export function createEmit({ registry, mailbox, router, sessionExists, logger, now }) {
  /**
   * `<namespace>\0<recipient>` → {credit, at}: EVENT_LIMITS' token bucket in integer units. One
   * token is `rateWindowMs` credit, and each millisecond adds `ratePerMinute` credit, capped at
   * `rateBurst` tokens. Integer arithmetic, so no refill drifts from the frozen rate however the
   * emits are spaced (a fractional token count would).
   */
  const buckets = new Map()
  const TOKEN = EVENT_LIMITS.rateWindowMs
  const CAPACITY = EVENT_LIMITS.rateBurst * TOKEN

  /** Take one token, or return false; a refused emit takes none (K2), so `refund` returns it. */
  function take(key) {
    const at = now()
    const bucket = buckets.get(key) ?? { credit: CAPACITY, at }
    bucket.credit = Math.min(CAPACITY, bucket.credit + (at - bucket.at) * EVENT_LIMITS.ratePerMinute)
    bucket.at = at
    buckets.set(key, bucket)
    if (bucket.credit < TOKEN) return false
    bucket.credit -= TOKEN
    return true
  }
  /**
   * Give back the token of an emit that queued nothing after all. A known, accepted effect: an
   * emit racing it in between may have been refused `rate-limited` for the token it then held.
   */
  const refund = (key) => { const bucket = buckets.get(key); if (bucket !== undefined) bucket.credit = Math.min(CAPACITY, bucket.credit + TOKEN) }

  /** The retire function of one committed event; the mailbox makes an acked one a no-op (R-EXT-19). */
  function retirer(act, recipient, eventId) {
    // Through a microtask, so a synchronous throw is caught too and never reaches a withdrawal.
    return () => {
      Promise.resolve().then(() => mailbox.retire(recipient, eventId, RETIREMENT_REASON.contributorWithdrawn))
        .catch((error) => logger.warn(LOG.retireFailed, act.namespace, error?.code ?? error?.name))
    }
  }

  /**
   * Whether the contributor can still emit: its activation current and not quarantined, its
   * calling fiber live. Checked again after each await, because a quarantine or a withdrawal may
   * have happened meanwhile; such an emit queues nothing (R-EXT-19).
   */
  const available = (act, who) => !act.ended && !act.quarantined && isLive(who.fiber)

  /** A validation failure: counted toward the quarantine (R-EXT-19). */
  function invalid(act, code) {
    registry.count(act, true)
    return refused(code)
  }

  async function emitFor(ctx, event) {
    const admitted = registry.admit(ctx)
    if (admitted.inactive) return refused(EMIT_REFUSAL.contributorUnavailable)
    if (admitted.code !== undefined) return refused(admitted.code)
    const { who } = admitted
    const act = registry.claim(who)
    if (act === undefined || !available(act, who)) return refused(EMIT_REFUSAL.contributorUnavailable)
    const read = readEvent(event, act.namespace)
    if (read === undefined) return invalid(act, EMIT_REFUSAL.eventInvalid)
    let key
    try {
      if (read.sessionId !== undefined && await port(PORT.sessionExists, () => sessionExists(read.sessionId)) !== true) {
        return invalid(act, EMIT_REFUSAL.eventInvalid)
      }
      if (byteLength(read.payloadText) > EVENT_LIMITS.payloadBytes) return invalid(act, EMIT_REFUSAL.payloadTooLarge)
      const type = CONTRIBUTED_TYPE_PREFIX + read.publicName
      const route = await port(PORT.router, () => router.recipientFor({ type, sessionId: read.sessionId ?? null, contributor: act.namespace }))
      if (!available(act, who)) return refused(EMIT_REFUSAL.contributorUnavailable)
      if (typeof route?.recipient !== 'string') return refused(EMIT_REFUSAL.noFishball)
      key = act.namespace + EMIT.bucketKeySeparator + route.recipient
      if (!take(key)) {
        key = undefined
        return refused(EMIT_REFUSAL.rateLimited)
      }
      const draft = {
        type,
        sourceSessionId: read.sessionId ?? null,
        correlationId: null,
        payload: { namespace: act.namespace, event: read.publicName, data: read.payload, ...(read.summary === undefined ? {} : { summary: read.summary }) },
        ...(read.dedupeKey === undefined ? {} : { dedupeKey: read.dedupeKey }),
      }
      // `take` and the draft are synchronous, so nothing can have changed since the check above.
      const committed = await port(PORT.mailbox, () => mailbox.commit(route.recipient, draft))
      if (committed?.ok !== true) {
        refund(key)
        return refused(committed?.code === EMIT_REFUSAL.duplicate ? EMIT_REFUSAL.duplicate : EMIT_REFUSAL.queueFull)
      }
      act.committed.push(retirer(act, route.recipient, committed.eventId))
      // The contributor may have been withdrawn or quarantined while the commit ran: its event then
      // shares that fate at once (R-EXT-19).
      if (act.ended || act.quarantined) retireCommitted(act)
      registry.count(act, false)
      return Object.freeze({ ok: true, eventId: committed.eventId })
    } catch (error) {
      if (!(error instanceof PortFailure)) throw error
      if (key !== undefined) refund(key)
      logger.warn(LOG.portFailed, act.namespace, error.port, error.error?.code ?? error.error?.name)
      return refused(EMIT_REFUSAL.queueFull)
    }
  }

  return Object.freeze({
    /** `emit(event)` for the caller context `ctx`; never rejects (R-EXT-18). */
    emit: (ctx, event) => emitFor(ctx, event),
  })
}
