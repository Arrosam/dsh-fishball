/**
 * Constants of the connector's pair store (task C-PAIR; K1 `PairStore` in
 * `../../mcp-schema/index.d.ts`; design §5.8; spike V3-S3 `b4dca86`). Every tunable of the pair
 * and name rules (id grammar, name rules, `lastSeenAt` interval, `already-paired` advice, refusal
 * codes, scopes) is K1's and is imported from `../../mcp-schema`; this file holds only the store's
 * own layout and messages.
 */

/**
 * The pair registry's storage layout. S3: DSH storage has no multi-record transaction and no
 * secondary index, so every pair and name lives in ONE record of one domain, and each change is one
 * `KvTable.update` of it: the id and name uniqueness checks and the write are then one atomic step.
 * The default `single` layout is kept: the record is small (one entry per token entry) and is
 * authoritative, so a record that fails its check fails the open loudly (no `invalidRecords`).
 */
export const PAIRS = Object.freeze({
  domain: 'dsh_connector_pairs',
  version: 1,
  table: 'registry',
  recordKey: 'registry',
})

/** Programming-error messages (contract misuse, never shown to a client). */
export const MISUSE = Object.freeze({
  record: 'fishball pair registry: stored record does not match its shape',
  write: 'fishball pair store: refused to write a registry record that would not reopen (a caller passed a bad value)',
  invalidId: 'fishball pair store: the id is not a fishball id (the token endpoint admits only valid ids)',
  unknownPrincipal: 'fishball pair store: no pair has this principal key',
  selfSuccession: 'fishball pair store: an entry cannot succeed itself',
  reconnectUnpaired: 'fishball pair store: a page reconnect needs a bound entry (an unpaired one is bound with bindFromPage)',
})

/** Background log lines (no token value, id or name is ever logged). */
export const LOG = Object.freeze({
  /** `logger.warn(format, line, diagnostic code)`: the connector's log convention (../errors.js). */
  format: '%s (%s)',
  seenFailed: 'pair store: recording lastSeenAt failed',
  listenerFailed: 'pair store: a change listener threw',
})
