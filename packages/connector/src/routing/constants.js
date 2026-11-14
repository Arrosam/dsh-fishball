/**
 * C-ROUTE's own constants (task C-ROUTE; K1 `Router`, `ManagedState`, `NoRecipient` in
 * `../../mcp-schema/index.d.ts`; README "Managed state", K1c-1…4). Every tunable and every
 * refusal word is K1's or K2's and is imported where it is used; this file holds only the words
 * K1 types without a runtime value, the module's storage layout, and its messages.
 */
import { EVENT_TYPE, REFUSAL } from '../../mcp-schema/index.js'
import { EMIT_REFUSAL } from '../../tools/index.js'

/**
 * K1 `NoRecipient.fallback` (types only in K1, so the words are written once here, as C-TOKENS does
 * for `RevocationKind`). `unavailable` and `no-fishball` are the refusal words their callers answer
 * with, so they come from their owners (REFUSAL, K2 EMIT_REFUSAL); the other three are routing
 * outcomes only:
 * - toUser: an unmanaged session's offer goes to the user in that session (R-CON-09);
 * - queue: a `message` held in the no-recipient queue (K1c-3);
 * - dropped: not produced at all (unmanaged `turn-finished` / `state`, R-WATCH-02; a `notice` with
 *   no designated paired Fishball, Fishball 2026-11-14).
 */
export const ROUTE_FALLBACK = Object.freeze({
  toUser: 'to-user',
  queue: 'queue',
  unavailable: REFUSAL.unavailable,
  noFishball: EMIT_REFUSAL.noFishball,
  dropped: 'dropped',
})

/** Events that follow an earlier one and go to the pair that received it (R-EVS-03): K1 `RouteSubject.followsPrincipal`. */
export const FOLLOW_UP_TYPES = Object.freeze([EVENT_TYPE.settlement, EVENT_TYPE.retirement, EVENT_TYPE.takeback])

/**
 * What an event naming no managed session (or no session) becomes, by type (EVT-DT-01 rules 2–5,
 * EVT-EP-01). `designated: true` types go to the designated Fishball pair when one is paired, and
 * `none` is their outcome without one. The others never go to the designated pair: an offer is the
 * user's (R-CON-09); `turn-finished`, `state` (R-WATCH-02) and `handover` (it is committed only once
 * its target manages the session) are not produced. A contributor event is `designated` with
 * `no-fishball` (R-EXT-17), handled by prefix where this table is read.
 */
export const UNMANAGED_ROUTE = Object.freeze({
  [EVENT_TYPE.permission]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.toUser }),
  [EVENT_TYPE.question]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.toUser }),
  [EVENT_TYPE.planReview]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.toUser }),
  [EVENT_TYPE.turnFinished]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.dropped }),
  [EVENT_TYPE.state]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.dropped }),
  [EVENT_TYPE.handover]: Object.freeze({ designated: false, none: ROUTE_FALLBACK.dropped }),
  [EVENT_TYPE.message]: Object.freeze({ designated: true, none: ROUTE_FALLBACK.queue }),
  [EVENT_TYPE.ask]: Object.freeze({ designated: true, none: ROUTE_FALLBACK.unavailable }),
  [EVENT_TYPE.notice]: Object.freeze({ designated: true, none: ROUTE_FALLBACK.dropped }),
})
export const CONTRIBUTED_ROUTE = Object.freeze({ designated: true, none: ROUTE_FALLBACK.noFishball })

/**
 * The routing module's durable tables: one DSH storage domain of the connector, apart from the
 * mailbox's, with per-record layout so one change writes one record.
 * - `managed` (key: digest of the root session id) `{sessionId, principalKey}` (K1c-1: durable);
 * - `held` (key: a random path-safe id) `{seq, sourceSessionId, payload}`: the no-recipient
 *   `message` queue (K1c-3), in `seq` order.
 * Keys must be path-safe (`[A-Za-z0-9_-]+`, dsh-storage-json): a session id is opaque, so its
 * digest is the key. Authoritative data: a record that fails its schema fails the open.
 */
export const ROUTING_STORE = Object.freeze({
  domain: 'fishball_routing',
  version: 1,
  layout: 'per-record',
  table: Object.freeze({ managed: 'managed', held: 'held' }),
})

/** The managed table's record key: the hex SHA-256 of the session id (path-safe whatever the id). */
export const RECORD_KEY = Object.freeze({ algorithm: 'sha256', encoding: 'hex' })

/** The first `seq` of an empty held queue; each accepted message takes the next one. */
export const HELD_SEQUENCE = Object.freeze({ first: 0, step: 1 })

/** Programming-error messages (a caller bug, thrown as TypeError; never shown to a client). */
export const MISUSE = Object.freeze({
  followUp: 'fishball routing: a settlement, retirement or takeback needs followsPrincipal',
  produce: 'fishball routing: produce() takes offers, ask, message, notice, turn-finished and state only (follow-ups go through settle/withdraw, handover and takeback through the hand-over service, contributor events through C-EXT)',
  offer: 'fishball routing: an answerable event needs an offer, and its offer id must not be live already',
  sessionId: 'fishball routing: a session id must be a non-empty string',
  principalKey: 'fishball routing: a principal key must be a non-empty string',
  maxQueuedInputs: 'fishball routing: maxQueuedInputs() must return a positive whole number',
})

/** Background log lines: `logger.warn(LOG.format, line, diagnostic code)`; no payload, key or id is ever logged. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  noticeDropped: 'routing: a notice with no designated paired Fishball was not produced',
  commitRefused: 'routing: the mailbox refused an event',
  retireFailed: 'routing: retiring a live offer failed; the management change stands',
  flushFailed: 'routing: moving held messages into the designated mailbox failed; they stay queued in order',
  listenerFailed: 'routing: a change listener threw',
  watchFailed: 'routing: producing a turn-finished or state event failed',
})
