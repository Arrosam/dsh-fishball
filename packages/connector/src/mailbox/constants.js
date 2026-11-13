/**
 * The mailbox's own vocabulary (task C-MAILBOX). Every tunable comes from K1 (`MAILBOX`, `QUEUE`,
 * `RESOURCE`, `RESYNC_REASON` in `fishball-connector/mcp-schema`). What is here is internal to this
 * module: its storage layout, record states, and encodings.
 */

/**
 * The durable ledger: one DSH storage domain of the connector, kept apart from `fishball` and
 * `fishball_intake` so it has its own write chain. Per-record layout, because events are written
 * often and individually. Keys must be path-safe there (`[A-Za-z0-9_-]+`, dsh-storage-json):
 * - a box's key is the hex digest of its principal key, which is opaque and need not be path-safe;
 * - an event's key is its `eventId`.
 * Authoritative data, so a record that fails its schema fails the open (no `backup-and-skip`).
 */
export const MAILBOX_STORE = Object.freeze({
  domain: 'fishball_mailbox',
  version: 1,
  layout: 'per-record',
  table: Object.freeze({ boxes: 'boxes', events: 'events' }),
})

/**
 * One event record's state (EVT-ST-01).
 * - pending: returned by polls until acked or retired.
 * - acked: an `inbox_ack` matched it. Kept as a receipt for K1 `MAILBOX.ackedReceiptMs`, so a
 *   repeat ack is a no-op success.
 * - retired: a `retirement` replaced it. Its receipt is kept the same way, so an ack that races
 *   the retirement is a no-op success and does not fail the whole batch (Fishball 2026-11-14 (a)).
 * Held (disable) is a property of the box, not of an event: a re-enable returns every event as it
 * was, with the same identity.
 */
export const EVENT_STATE = Object.freeze({ pending: 'pending', acked: 'acked', retired: 'retired' })

/** `payloadDigest` (K1 WIRE: 64 lowercase hex, SHA-256) and the box key share this hash. */
export const HASH = Object.freeze({ algorithm: 'sha256', encoding: 'hex' })

/**
 * Cursor wire form: base64url of a JSON array `[boxKey, mailboxGeneration, sequence]`. A cursor is
 * opaque to clients (K1 WIRE). It holds no secret: the box key is a digest, and a forged cursor
 * can only name another box (`forbidden`) or skip the client's own events.
 */
export const CURSOR = Object.freeze({ encoding: 'base64url', fields: 3 })

/** The position before the first event of a generation (sequences start at 1). */
export const START_SEQUENCE = 0

/** Background-log lines. They never carry a payload or a principal key. */
export const LOG = Object.freeze({
  hintFailed: 'fishball mailbox: the listen-stream hint failed; the event is committed and stays pollable',
})

/** TypeError messages for a producer's programming error (K3 #17 style: a bug, not a CommitResult). */
export const MISUSE = Object.freeze({
  draft: 'fishball mailbox: invalid event draft',
  maxQueuedInputs: 'fishball mailbox: maxQueuedInputs must be a positive whole number',
  principalKey: 'fishball mailbox: a principal key must be a non-empty string',
  eventKey: 'fishball mailbox: newId() must return a path-safe event id',
})

/** Path-safe record keys (dsh-storage-json per-record layout). */
export const SAFE_KEY = Object.freeze(/^[A-Za-z0-9_-]+$/)
