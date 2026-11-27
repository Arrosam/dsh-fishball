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

/**
 * Generated names (the user's decision, 2026-11-21, superseding R-NAME-04's "the connector never
 * assigns a name"): a pair the connector would otherwise leave nameless, shown as `ID: <id>`, gets a
 * readable name "<Adjective> <Noun>" (`./names.js`). The words are short, friendly, ASCII and
 * capitalised, so every name is already R-NAME-02-normal (no whitespace run, no control character,
 * NFC) and far below NAME_RULES.maxChars even with a suffix; no word is a prefix of "ID:".
 * - `randomTries`: random draws before falling back. With 32 × 32 = 1024 base names and the handful
 *   of agents one DSH pairs, all of them colliding is practically never the case; the bound only
 *   keeps the generator total;
 * - `firstSuffix`: the fallback appends " 2", " 3", … to the last draw until a name is free (" 2"
 *   reads as "the second one"; there is no " 1"). Among `held + 1` suffixes one is always free, so
 *   the fallback ends.
 */
export const GENERATED_NAME = Object.freeze({
  adjectives: Object.freeze([
    'Amber', 'Azure', 'Brave', 'Bright', 'Calm', 'Clever', 'Coral', 'Crisp', 'Daring', 'Eager', 'Gentle', 'Golden', 'Happy', 'Jolly', 'Keen', 'Kind',
    'Lively', 'Lucky', 'Merry', 'Mighty', 'Nimble', 'Noble', 'Plucky', 'Quick', 'Quiet', 'Rapid', 'Silver', 'Sunny', 'Swift', 'Tidy', 'Vivid', 'Witty',
  ]),
  nouns: Object.freeze([
    'Badger', 'Beaver', 'Crane', 'Dolphin', 'Falcon', 'Ferret', 'Finch', 'Fox', 'Gecko', 'Hare', 'Heron', 'Koala', 'Lynx', 'Marten', 'Narwhal', 'Otter',
    'Owl', 'Panda', 'Pelican', 'Puffin', 'Quokka', 'Raven', 'Robin', 'Seal', 'Sparrow', 'Squirrel', 'Swan', 'Tiger', 'Turtle', 'Walrus', 'Wombat', 'Wren',
  ]),
  separator: ' ',
  randomTries: 16,
  firstSuffix: 2,
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
  backfillFailed: 'pair store: naming the nameless pairs at open failed',
})
