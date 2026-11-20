/**
 * C-ROUTE's own constants (task C-ROUTE; K1 `Router`, `ManagedState`, `NoRecipient` in
 * `../../mcp-schema/index.d.ts`; README "Managed state", K1c-1…4). Every tunable and every
 * refusal word is K1's or K2's and is imported where it is used; this file holds only the words
 * K1 types without a runtime value, the module's storage layout, and its messages.
 */
import { EVENT_TYPE } from '../../mcp-schema/index.js'
import { EMIT_REFUSAL } from '../../tools/index.js'

/**
 * K1 `NoRecipient.fallback` (types only in K1, so the words are written once here, as C-TOKENS does
 * for `RevocationKind`). `no-agent` is the refusal word a contributor's `emit` answers with, so it
 * comes from its owner (K2 EMIT_REFUSAL); the other two are routing outcomes only:
 * - toUser: an unmanaged session's offer goes to the user in that session (R-CON-09);
 * - dropped: not produced at all (C-WIRE-2: every non-offer event naming no managed session).
 * C-WIRE-2 withdrew `queue` and `unavailable` with the designated agent and `ask_agent`.
 */
export const ROUTE_FALLBACK = Object.freeze({
  toUser: 'to-user',
  noAgent: EMIT_REFUSAL.noAgent,
  dropped: 'dropped',
})

/** Events that follow an earlier one and go to the pair that received it (R-EVS-03): K1 `RouteSubject.followsPrincipal`. */
export const FOLLOW_UP_TYPES = Object.freeze([EVENT_TYPE.settlement, EVENT_TYPE.retirement, EVENT_TYPE.takeback])

/**
 * The outcome of an event naming no managed session (or no session), by type: only an offer has a
 * place to go, the user's prompt or card in its session (R-CON-09). Every other built-in type is
 * dropped (the router's default), and a contributor event is `no-agent` (R-EXT-17).
 */
export const UNMANAGED_ROUTE = Object.freeze({
  [EVENT_TYPE.permission]: ROUTE_FALLBACK.toUser,
  [EVENT_TYPE.question]: ROUTE_FALLBACK.toUser,
  [EVENT_TYPE.planReview]: ROUTE_FALLBACK.toUser,
})
export const CONTRIBUTED_ROUTE = ROUTE_FALLBACK.noAgent

/**
 * The routing module's durable tables: one DSH storage domain of the connector, apart from the
 * mailbox's, with per-record layout so one change writes one record.
 * - `managed` (key: digest of the root session id) `{sessionId, principalKey}` (K1c-1: durable).
 * C-WIRE-2 withdrew the `held` table with the no-recipient queue; a stored one is not opened
 * (V3 is a fresh install, Q-M1).
 * Keys must be path-safe (`[A-Za-z0-9_-]+`, dsh-storage-json): a session id is opaque, so its
 * digest is the key. Authoritative data: a record that fails its schema fails the open.
 */
export const ROUTING_STORE = Object.freeze({
  domain: 'dsh_connector_routing',
  version: 1,
  layout: 'per-record',
  table: Object.freeze({ managed: 'managed' }),
})

/** The managed table's record key: the hex SHA-256 of the session id (path-safe whatever the id). */
export const RECORD_KEY = Object.freeze({ algorithm: 'sha256', encoding: 'hex' })

/** Programming-error messages (a caller bug, thrown as TypeError; never shown to a client). */
export const MISUSE = Object.freeze({
  followUp: 'fishball routing: a settlement, retirement or takeback needs followsPrincipal',
  offerType: 'fishball routing: offer() takes permission, question and plan-review only',
  offer: 'fishball routing: an answerable event needs an offer, and its offer id must not be live already',
  sessionId: 'fishball routing: a session id must be a non-empty string',
  payload: 'fishball routing: a message or settlement payload must be a value structuredClone can copy',
  principalKey: 'fishball routing: a principal key must be a non-empty string',
  entryKey: 'fishball routing: endPrincipal needs an entry key, a non-empty string',
  freshRetirements: 'fishball routing: endPrincipal needs {freshRetirements: boolean} (false for a delete)',
  succession: 'fishball routing: succeedPrincipal needs two different principal keys and a commit function',
  revision: 'fishball routing: a re-issued offer\'s revision would not fit the K1 offer id',
})

/** A succession re-issues a live offer with the next revision (R-HOST-09, Q-S3-1: `r<n>` → `r<n+1>`). */
export const OFFER_REVISION = Object.freeze({ step: 1 })

/** Background log lines: `logger.warn(LOG.format, line, diagnostic code)`; no payload, key or id is ever logged. */
export const LOG = Object.freeze({
  format: '%s (%s)',
  commitRefused: 'routing: the mailbox refused an event',
  retireFailed: 'routing: retiring a live offer failed; the management change stands',
  followUpFailed: 'routing: the handover or takeback event of a stored change failed; the change stands',
  listenerFailed: 'routing: a change listener threw',
  watchFailed: 'routing: producing a turn-finished event failed',
  moveUndoFailed: 'routing: moving managed sessions back after a failed succession step failed; they still name the successor',
  succeedUndoFailed: 'routing: undoing a failed succession step failed; managed state or events may still name the successor',
  reissueFailed: 'routing: retiring a re-issued offer\'s old event failed; it stays pending, and answers to it are refused expired',
})
