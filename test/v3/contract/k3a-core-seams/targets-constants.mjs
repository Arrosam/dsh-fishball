/**
 * Oracles for the K3a MULTI-0 rows (2026-11-18): core's `TARGETS`, `MCP.identity` /
 * `MCP.serverIdentity`, fishball-shared's `SEAM_TARGETS`, and the hosted reservation. Sources:
 * packages/core/contracts/README.md "MULTI-0 amendment (K3/K3a, 2026-11-18)" and its Examples
 * table (normative), PLAN-MULTI §3–§5, §7, D07, Q01–Q12, the MULTI-1 amendment of the list route
 * (relayed 2026-11-18), and the contract files as the published interface. Fixture ids are test
 * inputs built from the frozen formats, not product values.
 */
import path from 'node:path'
import { V3 } from '../package-boundaries/constants.mjs'

/** README "Ids": `t-` / `e-` + 16 letters of lowercase base32 (RFC 4648 alphabet, lower-cased). */
export const IDS = Object.freeze({
  parentId: 'parent',
  id: Object.freeze({ prefix: 't-', randomChars: 16, alphabet: 'abcdefghijklmnopqrstuvwxyz234567' }),
  epoch: Object.freeze({ prefix: 'e-', randomChars: 16, alphabet: 'abcdefghijklmnopqrstuvwxyz234567' }),
  /** DSH's credential-key segment grammar (both SDKs), as targets.d.ts quotes it. */
  keySegment: /^[a-z][a-z0-9-]*$/,
  /** DSH's credential-reference grammar (both SDKs), as link.d.ts quotes it. */
  refName: /^[A-Za-z_][A-Za-z0-9_]*$/,
  forbidden: '_',
})

/** README "Target record": storage `fishball_core_targets/targets` v1. */
export const STORE = Object.freeze({ domain: 'fishball_core_targets', table: 'targets', version: 1 })

/** README "Local keys": kinds and the plain-token form; the manager message id prefix is K3's `MESSAGE.idPrefix`. */
export const KEYS = Object.freeze({
  kind: Object.freeze({ event: 'event', approval: 'approval', session: 'session' }),
  encoding: 'base64url',
  /** The plain-token alphabet of base64url. */
  token: /^[A-Za-z0-9_-]+$/,
  /** README's key spelling `["event","t-a…","e-a…","event-1"]`, for ids with no character JSON escapes. */
  readmeKey: (kind, id, epoch, remote) => `["${kind}","${id}","${epoch}","${remote}"]`,
  /** README Examples row: A and B both send `event-1` / offer `ap-1`. */
  sameEvent: 'event-1',
  sameApproval: 'ap-1',
  /** Decision table: remote ids that break a delimiter join (quote, comma, bracket, backslash, empty, a forged tail). */
  adversarial: Object.freeze(['event-1', 'event-1"', 'event-1",', '"]', 'a","b', 'a,b', '\\"', '', 'x"],["event","t-', 'event-1]']),
})

/** README "Added credentials" and "Hosted reservation". */
export const CREDENTIALS = Object.freeze({
  /** README's spelling `FISHBALL_TARGET_TOKEN_<id>__<epoch>` (`-` → `_`). */
  readmeRef: (id, epoch) => `FISHBALL_TARGET_TOKEN_${id.replaceAll('-', '_')}__${epoch.replaceAll('-', '_')}`,
  /** README's spellings `fishball-core/token-<id>-<epoch>`, `fishball-core/connect-<id>-<epoch>`. */
  readmeTokenRecord: (id, epoch) => `fishball-core/token-${id}-${epoch}`,
  readmeGrantRecord: (id, epoch) => `fishball-core/connect-${id}-${epoch}`,
  /** The parent's own names (README "Hosted reservation"); no added target may produce them. */
  parentOwned: Object.freeze({ ref: 'DSH_AGENT_TOKEN', records: Object.freeze(['fishball-core/hosted-agent', 'fishball-core/pending-token-origin']) }),
  keySeparator: '/',
})

/** README "Duplicate names" (D07, Q03): ` (n)`, n from 2. */
export const DUPLICATE = Object.freeze({ open: ' (', close: ')', firstSuffix: 2 })

/**
 * README "Tool names": `mcp__<readable≤16>__<facade>_<digest12>`, ≤ 64, `[A-Za-z0-9_-]`, SHA-256 of
 * `JSON.stringify([1, targetId, endpointEpoch, name, origin, rawName])`; the readable rule's
 * normal form, outside-run, join and fallback as constants.js publishes them (the README examples
 * `办公室-DSH` → `dsh`, `<b>x</b>` → `b-x-b` fix the rule's shape).
 */
export const TOOL_NAME = Object.freeze({
  prefix: 'mcp__',
  separator: '__',
  digestSeparator: '_',
  digestHexChars: 12,
  digestAlgorithm: 'sha256',
  digestVersion: 1,
  readableMaxChars: 16,
  readableFallback: 'dsh',
  readableJoin: '-',
  readableOutside: '[^A-Za-z0-9]+',
  normalForm: 'NFKD',
  maxChars: 64,
  allowed: '^[A-Za-z0-9_-]{1,64}$',
  origin: Object.freeze({ remote: 'remote', local: 'local' }),
})
/** Budget checks: the facade keeps at least one character; a digest is lowercase hex. */
export const TOOL_BUDGET = Object.freeze({ minFacadeChars: 1, hex: /^[0-9a-f]+$/, readableTrim: /^-+|-+$/g })

/** README "Added credentials": the reference and record spellings as `TARGETS.credentials` builds them. */
export const CREDENTIAL_PARTS = Object.freeze({
  tokenRefPrefix: 'FISHBALL_TARGET_TOKEN_',
  tokenRefSeparator: '__',
  refReplaced: '-',
  refReplacement: '_',
  tokenRecordPrefix: 'token-',
  grantRecordPrefix: 'connect-',
  recordSeparator: '-',
})

/** `TARGETS` exactly (README rows "Target record", "Ids", "Local keys", "Added credentials", "Duplicate names", "Tool names"). */
export const TARGETS_EXPECTED = Object.freeze({
  parentId: IDS.parentId,
  id: IDS.id,
  epoch: IDS.epoch,
  store: STORE,
  /** The persisted tool-name bindings and tombstones (README "Tool names": "a name bound (or retired)"; table name as constants.js). */
  bindingStore: Object.freeze({ domain: STORE.domain, table: 'tool_bindings', version: 1 }),
  key: Object.freeze({ kind: KEYS.kind, encoding: KEYS.encoding }),
  credentials: CREDENTIAL_PARTS,
  duplicate: DUPLICATE,
  toolName: TOOL_NAME,
})

/** Fixture targets: two equal-named targets A and B, and their epochs. */
const id = (letter) => IDS.id.prefix + letter.repeat(IDS.id.randomChars)
const epoch = (letter) => IDS.epoch.prefix + letter.repeat(IDS.epoch.randomChars)
export const FIXTURE = Object.freeze({
  a: Object.freeze({ targetId: id('a'), endpointEpoch: epoch('a') }),
  b: Object.freeze({ targetId: id('b'), endpointEpoch: epoch('b') }),
  /** A's endpoint after a URL change: same id, new epoch. */
  aNewEpoch: Object.freeze({ targetId: id('a'), endpointEpoch: epoch('c') }),
  /** BVA over the generated id: the first and last alphabet letters, and the alphabet in order cut to length. */
  bounds: Object.freeze(['first', 'last', 'mixed']),
  rawTool: 'sessions_list',
  officeName: 'Office-DSH',
})

/** Core's export name, the SEAM_TARGETS word groups, the digest encoding. */
export const NAMES = Object.freeze({
  targetsExport: 'TARGETS',
  wordGroups: Object.freeze(['state', 'kind', 'identity', 'placeholder', 'refusal']),
  hexEncoding: 'hex',
})

/**
 * README Examples (normative) for the tool-name rule, plus boundary rows derived from the rule as
 * constants.js documents it (NFKD, runs outside [A-Za-z0-9] → `-`, lower case, trim, cut to 16, trim).
 * `readable` is the expected readable key; `final` an optional exact-shape check of the whole name.
 */
export const TOOL_EXAMPLES = Object.freeze([
  Object.freeze({ row: 'README Office-DSH', name: 'Office-DSH', facade: 'sessions_list', readable: 'office-dsh', final: /^mcp__office-dsh__sessions_list_[0-9a-f]{12}$/ }),
  Object.freeze({ row: 'README 办公室-DSH', name: '办公室-DSH', facade: 'sessions_list', readable: 'dsh' }),
  Object.freeze({ row: 'README <b>x</b>', name: '<b>x</b>', facade: 'sessions_list', readable: 'b-x-b' }),
  Object.freeze({ row: 'NFKD accent', name: 'Café-DSH', facade: 'sessions_list', readable: 'cafe-dsh' }),
  Object.freeze({ row: 'NFKD full-width', name: 'ＤＳＨ', facade: 'sessions_list', readable: 'dsh' }),
  Object.freeze({ row: 'BVA readable 16', name: 'abcdefghijklmnop', facade: 'sessions_list', readable: 'abcdefghijklmnop' }),
  Object.freeze({ row: 'BVA readable 17', name: 'abcdefghijklmnopq', facade: 'sessions_list', readable: 'abcdefghijklmnop' }),
  Object.freeze({ row: 'BVA cut on a dash', name: 'abcdefghijklmno-pq', facade: 'sessions_list', readable: 'abcdefghijklmno' }),
  Object.freeze({ row: 'spaces and dots', name: ' My.Lab  DSH ', facade: 'sessions_list', readable: 'my-lab-dsh' }),
])
/** Names with nothing ASCII left (and `null`, Q01): the readable key is the rule's fallback. */
export const FALLBACK_NAMES = Object.freeze([null, '办公室', '---', ''])
/** README "200-char name, `acme-tools.` + 48 chars": readable cut to 16, facade cut from the end, total exactly 64. */
export const LONG_EXAMPLE = Object.freeze({ nameChars: 200, nameChar: 'n', namespace: 'acme-tools', dot: '.', localChars: 48, localChar: 'l', total: 64 })
/** Final names the `allowed` pattern must refuse (EP: space, dot, Unicode; BVA: empty and 65 characters). */
export const DISALLOWED = Object.freeze(['mcp__a b__x_0123456789ab', 'mcp__a.b__x_0123456789ab', 'mcp__办公__x_0123456789ab', ''])

/**
 * README Examples for duplicate names, as a state-transition table over one profile's targets
 * (D07, Q03, PLAN-MULTI §4.2). Each step: `observe` a target's raw name, `remove` it, or `add` a new
 * one observing a name; `expect` is every live target's resolved name after the step.
 */
export const DUPLICATE_STEPS = Object.freeze([
  Object.freeze({ step: 'A arrives as Office-DSH', op: 'observe', target: 'A', name: 'Office-DSH', expect: Object.freeze({ A: 'Office-DSH' }) }),
  Object.freeze({ step: 'B arrives as Office-DSH', op: 'observe', target: 'B', name: 'Office-DSH', expect: Object.freeze({ A: 'Office-DSH', B: 'Office-DSH (2)' }) }),
  Object.freeze({ step: 'A renames to Lab-DSH: B stays', op: 'observe', target: 'A', name: 'Lab-DSH', expect: Object.freeze({ A: 'Lab-DSH', B: 'Office-DSH (2)' }) }),
  Object.freeze({ step: 'B refreshes unchanged: keeps (2)', op: 'observe', target: 'B', name: 'Office-DSH', expect: Object.freeze({ A: 'Lab-DSH', B: 'Office-DSH (2)' }) }),
  Object.freeze({ step: 'C arrives as Office-DSH: lowest free', op: 'observe', target: 'C', name: 'Office-DSH', expect: Object.freeze({ A: 'Lab-DSH', B: 'Office-DSH (2)', C: 'Office-DSH' }) }),
  Object.freeze({ step: 'D arrives as Office-DSH: (3)', op: 'observe', target: 'D', name: 'Office-DSH', expect: Object.freeze({ A: 'Lab-DSH', B: 'Office-DSH (2)', C: 'Office-DSH', D: 'Office-DSH (3)' }) }),
  Object.freeze({ step: 'B is removed: nobody renumbers', op: 'remove', target: 'B', expect: Object.freeze({ A: 'Lab-DSH', C: 'Office-DSH', D: 'Office-DSH (3)' }) }),
  Object.freeze({ step: 'C renames into Lab-DSH: later appearance', op: 'observe', target: 'C', name: 'Lab-DSH', expect: Object.freeze({ A: 'Lab-DSH', C: 'Lab-DSH (2)', D: 'Office-DSH (3)' }) }),
])
/** README: a literal server name `Office-DSH (2)` held, and `Office-DSH` held → the next `Office-DSH` is `Office-DSH (3)`. */
export const LITERAL_STEPS = Object.freeze([
  Object.freeze({ step: 'L advertises the literal Office-DSH (2)', op: 'observe', target: 'L', name: 'Office-DSH (2)', expect: Object.freeze({ L: 'Office-DSH (2)' }) }),
  Object.freeze({ step: 'A arrives as Office-DSH', op: 'observe', target: 'A', name: 'Office-DSH', expect: Object.freeze({ L: 'Office-DSH (2)', A: 'Office-DSH' }) }),
  Object.freeze({ step: 'B arrives as Office-DSH: (3)', op: 'observe', target: 'B', name: 'Office-DSH', expect: Object.freeze({ L: 'Office-DSH (2)', A: 'Office-DSH', B: 'Office-DSH (3)' }) }),
])
export const DUPLICATE_OPS = Object.freeze({ observe: 'observe', remove: 'remove' })

/** The core MCP copy of K1's MULTI-0 values (the drift rows' key sets). */
export const MCP_MULTI = Object.freeze({
  identityKeys: Object.freeze(['name', 'uri', 'mimeType']),
  serverIdentityKeys: Object.freeze(['suffix', 'discoverMetaKey', 'updatedNotification']),
})

/**
 * `SEAM_TARGETS` exactly (fishball-shared/ui-seam; README rows "Public state", "Routes", "Ask
 * handle"; the MULTI-1 amendment: GET `/api/fishball/targets`, 200 TargetsSnapshot).
 */
const ROUTE_BASE = '/api/fishball/targets'
export const SEAM = Object.freeze({
  exportName: 'SEAM_TARGETS',
  values: Object.freeze({
    snapshotVersion: 1,
    member: 'targets',
    state: Object.freeze({ connected: 'connected', connecting: 'connecting', failed: 'failed', notSet: 'not-set' }),
    kind: Object.freeze({ parent: 'parent', remote: 'remote' }),
    identity: Object.freeze({ pending: 'pending', live: 'live', unsupported: 'unsupported', stale: 'stale' }),
    placeholder: Object.freeze({ unnamed: 'name-unavailable', unset: 'not-set' }),
    route: Object.freeze({
      list: ROUTE_BASE,
      read: 'GET',
      connect: ROUTE_BASE + '/connect',
      cancel: ROUTE_BASE + '/cancel',
      retry: ROUTE_BASE + '/retry',
      pairing: ROUTE_BASE + '/pairing',
      add: ROUTE_BASE + '/add',
      remove: ROUTE_BASE + '/remove',
      url: ROUTE_BASE + '/url',
      method: 'POST',
      targetIdField: 'targetId',
      fields: Object.freeze({ url: 'url', choice: 'choice', confirmed: 'confirmed' }),
    }),
    ask: Object.freeze({ handleField: 'handle', voided: 'voided' }),
    refusal: Object.freeze({
      unknownTarget: 'unknown-target', targetDuplicate: 'target-duplicate', targetReserved: 'target-reserved', confirmationRequired: 'confirmation-required',
    }),
  }),
  routeBase: ROUTE_BASE,
  actionPrefix: ROUTE_BASE + '/',
  /** The route keys that are not paths. */
  routeMeta: Object.freeze(['read', 'method', 'targetIdField', 'fields', 'list']),
  /** The POST action routes (README "Routes"). */
  actions: Object.freeze(['connect', 'cancel', 'retry', 'pairing', 'add', 'remove', 'url']),
})

/** The declared unions that must equal a SEAM_TARGETS vocabulary (one value source each, ui-seam.js). */
export const SEAM_UNIONS = Object.freeze([
  Object.freeze({ type: 'TargetKind', key: 'kind' }),
  Object.freeze({ type: 'TargetState', key: 'state' }),
  Object.freeze({ type: 'TargetIdentityState', key: 'identity' }),
])
/** Cross-side names: what SEAM_TARGETS spells against the members and parameters core declares. */
export const SEAM_DECL = Object.freeze({
  snapshot: 'TargetsSnapshot', version: 'version',
  view: 'TargetView', control: 'control',
  askCard: 'AskCard', state: 'state',
  targets: 'FishballTargets', ui: 'FishballUi', targetsType: 'FishballTargets',
  add: 'add', setUrl: 'setUrl', choose: 'choose', remove: 'remove',
  source: 'TargetSource',
})

/** The instance's own copy of the hosted-import names (packages/dsh-instance, read as data; no booting). */
export const INSTANCE_COPY = Object.freeze({
  file: path.join(V3.instance.dir, 'src', 'native-runtime', 'constants.js'),
  exportName: 'HOSTED',
})

/**
 * DSH storage's unit-name grammar (dsh-storage `UNIT_NAME_RE`, imported by dsh-storage-domain, which
 * refuses a domain or table name outside it at open, both SDKs). Every frozen store of core's
 * contracts is checked against the SDK's own pattern, and a known-bad name proves the check bites.
 */
export const STORAGE_NAMES = Object.freeze({
  entry: path.join('node_modules', '@deepseek-ai', 'dsh-storage', 'lib', 'index.js'),
  exportName: 'UNIT_NAME_RE',
  /** The contract exports that are storage units, and the member path of each nested store. */
  stores: Object.freeze([
    Object.freeze({ exportName: 'LEDGER', path: Object.freeze([]) }),
    Object.freeze({ exportName: 'TARGETS', path: Object.freeze(['store']) }),
    Object.freeze({ exportName: 'TARGETS', path: Object.freeze(['bindingStore']) }),
  ]),
  refused: 'tool-bindings',
})
