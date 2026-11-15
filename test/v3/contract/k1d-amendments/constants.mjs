/**
 * Vocabulary for the K1d cases: the W4 contract gate that amends K1 (`dsh-connector/mcp-schema`)
 * and K3's `host-services/tokens.d.ts` before C-REVOKE and C-SUCCEED (W4 briefs G3).
 *
 * Every expected value comes from the spec at `design/v3` `9a531192`: v3-design.md §1.0c, §5.1–
 * §5.5a, §5.9 (the "What this changes" table); v3-requirements.md 1.27–1.33, 1.41, R-OA-22,
 * R-OA-23, R-ID-01, R-HOST-09, R-ROUTE-04, R-ROUTE-06; the W4 briefs G3, C-REVOKE, C-SUCCEED; and
 * the open-questions "Decided by Fishball's session" items 1–13 and 45. None comes from an
 * implementation. Names the spec itself writes (`TOKEN_VALUE.minChars`, `ENTRY_STATUS`,
 * `SETTINGS_REFUSAL`, `RevocationKind`, `TokenEntry`, `Mailbox.transfer`, `SettingsWriter`,
 * `SessionNotes`, `PairStore.reconnectFromPage`, …) are read by name; values the spec gives without
 * a name (the `agent_id` parameter, the derived-id parts) are found by meaning.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/** Case ids: one per frozen item of the gate (the task's numbering, W4 briefs G3). */
export const ID = Object.freeze({
  token: 'K1d-TOKEN',
  hosted: 'K1d-HOSTED',
  page: 'K1d-PAGE',
  transfer: 'K1d-TRANSFER',
  retire: 'K1d-RETIRE',
  ports: 'K1d-PORTS',
  names: 'K1d-NAMES',
  vendor: 'K1d-VENDOR',
  readme: 'K1d-README',
})

/** Contract files under test (task K1d "Owns"; K3 tokens.d.ts by G3 item 5). */
export const FILES = Object.freeze({
  schemaDir: path.join(REPO, 'packages', 'dsh-connector', 'mcp-schema'),
  hostDir: path.join(REPO, 'packages', 'dsh-connector', 'host-services'),
  declarations: 'index.d.ts',
  readme: 'README.md',
  /** Files whose text is contract: sources, declarations, the prose freeze. */
  text: /\.(?:(?:c|m)?(?:js|ts)|md)$/,
  code: /\.(?:c|m)?(?:js|ts)$/,
  /** Core's vendored copy and its generator (design §9.1; the script's usage line). */
  coreVendor: path.join(REPO, 'packages', 'core', 'vendor'),
  vendorScript: path.join(REPO, 'packages', 'core', 'scripts', 'vendor-mcp-schema.mjs'),
  vendorFolder: 'vendor',
  vendorEntry: path.join('mcp-schema', 'index.js'),
  tempPrefix: 'fbtest-k1d-vendor-',
})

/** Design §5.2 step 1, §1.0c: 32 random bytes, base64url, prefix `dsht_`; §5.1: SHA-256 digest only. */
const GENERATED_BYTES = 32
export const TOKEN = Object.freeze({
  prefix: 'dsht_',
  bytes: GENERATED_BYTES,
  /** 256 bits is the floor §5.1 relies on ("every value is now 256 random bits"). */
  minBits: 256,
  bitsPerByte: 8,
  digest: 'sha256',
  encoding: 'base64url',
  /** A generated value as design §5.2 writes it (C-TOKENS-REVEAL's oracle: `dsht_` + 43 base64url). */
  valuePattern: /^dsht_[A-Za-z0-9_-]{43}$/,
})

/** Design §5.9 table rows K1 ENTRY_STATUS, SETTINGS_REFUSAL, RevocationKind (decided item 9). */
export const VOCAB = Object.freeze({
  entryStatus: Object.freeze(['ok']),
  settingsRefusal: Object.freeze(['token-duplicate']),
  revocationKind: Object.freeze(['disabled', 'deleted']),
})
/**
 * Codes no K1 export, type or README row may still produce (design §5.2 "Withdrawn", §5.3, §5.9;
 * requirements 1.27). `token-not-created` is the one G3 item 5 says `token-duplicate` replaces.
 */
export const WITHDRAWN_CODES = Object.freeze(['token-too-short', 'token-unconfigured', 'ref-duplicate', 'value-duplicate', 'value-changed', 'token-not-created'])
/** A README block that names a withdrawn code must say it is withdrawn or replaced. */
export const WITHDRAWN_WORDS = /withdraw|replac|revers|lapse/i

/**
 * Names the spec withdraws from K1 (design §5.9 table; R-OA-23; decided item 6): none may remain
 * in the module's code or declarations (comments may record the withdrawal).
 */
export const WITHDRAWN_NAMES = Object.freeze(['isTokenLongEnough', 'refreshChainMaxMs', 'chainsOf', 'ChainsState', 'renewFromPage'])
/** Design §5.9: `TOKEN_VALUE.minChars` (not NAME_RULES.minChars, which is a name rule and stays). */
export const WITHDRAWN_MEMBER = Object.freeze({ owner: 'TOKEN_VALUE', key: 'minChars' })
/** R-OA-23: no exported duration names a refresh chain. */
export const CHAIN_MEANING = /chain/i

/** Design §5.9 row "K1 RevocationKind, TokenEntry": `hosted: boolean` replaces `ref` and `generated`. */
export const TOKEN_ENTRY = Object.freeze({
  type: 'TokenEntry',
  added: Object.freeze({ hosted: 'boolean' }),
  removed: Object.freeze(['ref', 'generated']),
  status: 'status',
  revocation: 'RevocationKind',
  registry: 'TokenRegistry',
  onRevoked: 'onRevoked',
})

/** Design §5.4, §5.9 row "K3 host-services/tokens.d.ts"; G3 item 5. */
export const HOSTED = Object.freeze({
  service: 'dshConnectorTokens',
  members: Object.freeze(['apiVersion', 'createHosted', 'entryState', 'retire']),
  /** "`create(label)` is connector-internal (its own route), not a K3 member". */
  notMembers: Object.freeze(['create']),
  createHosted: Object.freeze({ params: 1 }),
  entryState: Object.freeze({ params: 1 }),
  retire: Object.freeze({ params: 2 }),
  createdFields: Object.freeze(['entryKey', 'label', 'value']),
  errorCodeType: 'CreateHostedErrorCode',
  errorCodes: Object.freeze(['operation-failed']),
  movedCode: 'credentials-unwritable',
  stateType: 'HostedEntryState',
  states: Object.freeze(['enabled', 'disabled', 'deleted']),
  /** §5.9: "`disabled` means switched off only". */
  disabledMeaning: /switched (?:it )?off/i,
  /** R-HOST-10 (1.29 R6 = B, 1.32 R11): a deleted hosted entry is never replaced on its own; Retry creates no token. */
  deletedMeaning: /never replaced on its own|creates\s+\*{0,2}no\*{0,2}\s+token/i,
  retireCodeType: 'RetireRefusalCode',
  /** Unchanged (DECIDED #13, kept; C-SUCCEED brief). */
  retireCodes: Object.freeze(['unknown-entry', 'not-hosted', 'successor-unpaired', 'operation-failed']),
  promise: /^Promise\s*</,
})

/** R-OA-22, R-OA-23, design §5.5a, §5.9 rows Pairing and Chain cap; decided item 6. */
export const PAGE = Object.freeze({
  pairStore: 'PairStore',
  tokenStore: 'OAuthTokenStore',
  kept: Object.freeze(['bindFromPage', 'pair']),
  reconnect: 'reconnectFromPage',
  /** reconnect(entryKey, id, client): the same token with the same id reconnects the same principal. */
  reconnectParams: 3,
  /** K1d-5 (relayed 2026-11-16): an unpaired entry is a caller bug, a TypeError. */
  reconnectUnpaired: Object.freeze([['unpaired is a caller bug', /unpaired/i], ['a TypeError', /TypeError/]]),
  refreshRecord: 'RefreshRecord',
  /** K1d-5: withdrawn with the chain cap (R-OA-23). */
  removedRefreshField: 'chainStartedAt',
  alreadyPaired: 'already-paired',
  removedPairMember: 'renewFromPage',
  removedStoreMember: 'chainsOf',
  removedType: 'ChainsState',
  /** §1.0c: the authorization-request extension parameter. */
  agentIdParam: 'agent_id',
})

/** Design §5.5a: `cid-` + the first 16 lowercase base32 characters of SHA-256(client id URL). */
const BASE32_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const DERIVED_ID = Object.freeze({
  prefix: 'cid-',
  chars: 16,
  /** RFC 4648 §6, lower-cased as §5.5a says. */
  alphabet: BASE32_UPPER.toLowerCase(),
  digest: 'sha256',
  /** BVA: the derived id is exactly prefix + chars long, whatever the URL's length. */
  length: 'cid-'.length + 16,
  bitsPerChar: 5,
  bitsPerByte: 8,
  /**
   * EP over client id URLs (fixture values): short, with a query, very long, non-ASCII (the UTF-8
   * input K1d-5 pins), and one byte different from the first (a different id).
   */
  samples: Object.freeze([
    ['a short https URL', 'https://client.example/oauth/metadata.json'],
    ['a URL with a query', 'https://example.com/cimd.json?v=1'],
    ['a very long URL', 'https://a.example/' + 'p/'.repeat(1000) + 'client.json'],
    ['a URL with non-ASCII characters', 'https://bücher.example/客户端.json'],
  ]),
  /** Two inputs that differ in one character derive two ids (the derivation is not constant). */
  distinctPair: Object.freeze(['https://client.example/a.json', 'https://client.example/b.json']),
  /** K1d-5: the input and output encodings the contract must state. */
  inputDoc: Object.freeze([['the client_id is hashed as UTF-8', /UTF-8/], ['as received, not normalised', /as (?:the request carries it|received)|no normali[sz]ation/i], ['base32 without padding', /no padding|unpadded/i]]),
})
/** RFC 4648 §10 test vectors (self-check of the test's encoder), padding dropped and lower-cased as §5.5a uses it. */
export const BASE32_VECTORS = Object.freeze([['f', 'my'], ['foobar', 'mzxw6ytboi'], ['', '']])
/** R-ID-02: 1–64 of `A–Z a–z 0–9 _ -`, no dot (the oracle the derived id must fit). */
export const ID_ORACLE = Object.freeze({
  pattern: /^[A-Za-z0-9_-]{1,64}$/,
  accepted: Object.freeze(['Az_09-', 'a']),
  refused: Object.freeze(['a.b', '.']),
})

/** W4 briefs G3 items 1–2, decided item 45: the Mailbox members K1d freezes. */
export const MAILBOX = Object.freeze({
  type: 'Mailbox',
  transfer: 'transfer',
  transferParams: Object.freeze(['fromPrincipal', 'toPrincipal']),
  keyType: 'PrincipalKey',
  moved: 'moved',
  movedType: 'number',
  retire: 'retire',
  promise: /^Promise\s*</,
  /** What G3 item 1 says transfer does, each as words its declaration must carry. */
  transferDoc: Object.freeze([
    ['every pending event moves', /pending/i],
    ['held events included', /held/i],
    ['the same eventIds', /eventId/],
    ['in order', /\border\b/i],
    ['commits nothing', /commit/i],
    ['misuse is a TypeError', /TypeError/],
    ['thrown synchronously', /synchronous/i],
  ]),
  retireDoc: Object.freeze([['misuse is a TypeError', /TypeError/], ['thrown synchronously', /synchronous/i]]),
})

/** Decided item 45: misuse of `retire`, by argument (Equivalence Partitioning; fixture values, not product values). */
export const RETIRE_MISUSE = Object.freeze({
  principalKey: Object.freeze([['a number', 42], ['the empty string', ''], ['undefined', undefined], ['null', null]]),
  // The empty string is left out: the contract defines eventId misuse as "would not make a valid
  // retirement draft" and does not say whether '' does (reported to Fishball as an open point).
  eventId: Object.freeze([['a number', 42], ['undefined', undefined], ['null', null]]),
  reason: Object.freeze([['an unknown word', 'fbtest-not-a-reason'], ['undefined', undefined], ['a number', 42]]),
})

/** G3 item 4, design §5.1, §5.2 step 3, W4 Q2 = A: the two connector-internal ports. */
export const PORTS = Object.freeze({
  writer: 'SettingsWriter',
  writerMembers: Object.freeze([['addToken', 1], ['removeToken', 1], ['setDesignated', 1]]),
  item: Object.freeze(['label', 'enabled', 'key']),
  /** §5.1: "never the value, a digest or a reference". */
  itemForbidden: /value|digest|ref|secret|token/i,
  designatedUnset: /\bundefined\b/,
  writerDoc: Object.freeze([['resolves once the document is saved', /saved/i], ['and the registry has applied it', /registry/i]]),
  notes: 'SessionNotes',
  notesMember: 'system',
  notesParams: Object.freeze(['sessionId', 'note']),
  notesDoc: Object.freeze([['the note starts no turn (Q2 = A)', /starts no turn|no turn/i]]),
  internal: /connector-internal/i,
  promise: /^Promise\s*</,
})

/**
 * Design §1.0c: DSH-side names renamed neutrally. A line of a K1 or K3 contract file that still
 * carries one must be a rename record citing §1.0c. Fishball-side names (`fishball-core`,
 * `fishballInstance`, the hosted label "Fishball (hosted)") and prose crediting Fishball stay.
 */
export const OLD_NAMES = Object.freeze([
  'fishball-connector', 'fishball-embed-ui', 'fishball-instance', '/api/fishball/', 'fishball:pair', 'fishball-events',
  'fishball://events', 'fishball_id', 'message_fishball', 'ask_fishball', 'fishballToken', 'no-fishball',
  'fishballConnectorTools', 'fishballConnectorHandover', 'fishballConnectorTokens', 'fishballChild',
  'dsh-fishball/contributor', 'fishball_tokens', 'fishball_oauth', 'fishball_intake', 'fbt_',
])
/** §1.0c "Fishball-only words in the connector", matched without case. */
export const OLD_WORDS = Object.freeze([/designated fishball/i, /fishball principal/i])
export const RENAME_RECORD = /§1\.0c/
/**
 * No exported string or key of K1 is a §1.0c old name. (V2's `session_read` message role
 * `fishball` comes from `./contract`'s payload vocabulary, which §1.0c's table does not list; it
 * is reported, not asserted.)
 */
export const OLD_IN_DATA = OLD_NAMES
/** §1.0c new names that K1 / K3 must carry. */
export const NEW_NAMES = Object.freeze({
  scope: Object.freeze(['agent', 'agent:pair']),
  resource: Object.freeze(['agent-events', 'dsh-agent://events']),
  pathPrefix: '/api/agent/',
  noAgent: 'no-agent',
  designated: 'routing.agentToken',
  services: Object.freeze(['dshConnectorHandover', 'dshConnectorTokens', 'dshInstanceChild']),
  oldServicePrefix: /^fishball/i,
  contextType: 'Context',
})

/**
 * Item 9: the README records each change. Each entry: [what, words that one README block (a
 * paragraph, list item or table row) must all carry].
 */
export const README_RECORDS = Object.freeze([
  ['SETTINGS_REFUSAL token-duplicate replaces ref-duplicate and value-duplicate', [/token-duplicate/, /ref-duplicate/, /value-duplicate/]],
  ['token-duplicate also covers an item with no record (R5, decided item 9)', [/token-duplicate/, /no\s+record/i]],
  ['ENTRY_STATUS is ok only (token-too-short, token-unconfigured withdrawn)', [/ENTRY_STATUS/, /token-too-short/, /token-unconfigured/]],
  ['RevocationKind disabled | deleted (value-changed withdrawn)', [/REVOCATION_KIND|RevocationKind/, /value-changed/]],
  ['TOKEN_VALUE.minChars and isTokenLongEnough withdrawn', [/minChars/, /isTokenLongEnough/]],
  ['TOKEN_VALUE digest only, SHA-256', [/digestAlgorithm/, /SHA-256/i]],
  ['TokenEntry: hosted replaces ref and generated', [/TokenEntry/, /hosted/]],
  ['no chain cap: refreshChainMaxMs withdrawn (R-OA-23)', [/refreshChainMaxMs/, /R-OA-23/]],
  ['DECIDED #18 reversed', [/^\|\s*18\s*\|/, /revers/i]],
  ['chainsOf and renewFromPage withdrawn; reconnectFromPage', [/chainsOf/, /renewFromPage/, /reconnectFromPage/]],
  ['the page binds with agent_id or the cid- derived id', [/agent_id/, /cid-/]],
  ['Mailbox.transfer', [/transfer/, /TypeError/]],
  ['Mailbox.retire misuse is a synchronous TypeError (decided item 45)', [/retire/, /synchronous/i, /TypeError/]],
  ['SettingsWriter and SessionNotes ports', [/SettingsWriter/, /SessionNotes/]],
  ['the neutral names of §1.0c', [/§1\.0c/]],
])
/** The K3 README rows the token amendment changes (design §5.9 row "K3 host-services/tokens.d.ts"). */
export const K3_README_RECORDS = Object.freeze([
  ['createHosted answers {entryKey, label, value}', [/createHosted/, /value/, /entryKey/]],
  ['credentials-unwritable moved to the instance', [/credentials-unwritable/, /instance/i]],
  ['entryState disabled is switched off only', [/entryState/, /switched off/i]],
  ['retry() creates no token (R-HOST-10, R6 = B)', [/retry\(\)/, /creates\s+\*{0,2}no\*{0,2}\s+token/i]],
])
/** Block starts in a Markdown file: a table row, a list item, a heading (or a blank line before). */
export const MD_BLOCK_START = /^\s*(?:\||[-*]\s|#)/

/** Owners of the rows this gate cannot run (v3 W4 briefs). */
export const LATER = Object.freeze({
  succeed: 'C-SUCCEED (Mailbox.transfer behaviour, packages/dsh-connector/src/mailbox/ transfer only)',
  wire: 'C-WIRE (binds SettingsWriter and SessionNotes, W4b)',
  reveal: 'C-TOKENS-REVEAL (create / createHosted generate dsht_ values, digest-only records, token-duplicate)',
  childRetry: 'K3b / I-HOST (child.d.ts retry() still says a deleted entry is replaced; host-services README names its owner)',
})
