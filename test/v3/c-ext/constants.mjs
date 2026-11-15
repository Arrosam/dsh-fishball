/**
 * Vocabulary for the C-EXT cases (v3-tasks.md row C-EXT, wave W2; docs/test-design/v3/07-contributors.md):
 * EXT-UC-01…03, EXT-EP-01…04, EXT-BVA-01…04, EXT-DT-01…02, EXT-ST-01, and the EXT-UC-04 / EXT-DT-03
 * rows other tasks own (todo).
 *
 * Every product value comes from a frozen contract module, never from an implementation:
 * - K2 `dsh-connector/tools` (packages/dsh-connector/tools/): codes, limits, grammar, the `_meta`
 *   key, the alias and reserved namespaces, abort reasons, the emit check order;
 * - K1 `dsh-connector/mcp-schema` (packages/dsh-connector/mcp-schema/): the K1 interfaces' words
 *   the fakes speak (retirement reason, queue size, scope, the generated-token prefix).
 * The rest is fixture data (package names, markers, pairs) and harness timing, which are not
 * product values.
 */
import path from 'node:path'
import * as K1 from '../../../packages/dsh-connector/mcp-schema/index.js'
import * as K2 from '../../../packages/dsh-connector/tools/index.js'
import { REPO } from '../../support/constants.mjs'

export { K1, K2 }

/** The C-EXT "Owns" folder. FBTEST_C_EXT_ENTRY moves the entry (another checkout). */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_EXT_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'contrib', 'index.js'),
  /** The factory export (subject.mjs; the seam C-EXT relayed through Fishball, 2026-11-14). */
  factory: 'createContributions',
})

/** The installed SDK packages the world is built from (read only). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  /** MCP core 2.2.0 of each SDK: the oracle of the spec-defined `Tool` and `CallToolResult` shapes. */
  mcpCore: Object.freeze({ pkg: path.join('@modelcontextprotocol', 'core'), entry: path.join('dist', 'index.mjs') }),
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so no line the registry writes is missed. */
  allLevels: 3,
  /** A loader row naming a built-in plugin. */
  builtinPrefix: 'cordis:',
})

/**
 * The service's members (K2 README "Service" table and index.d.ts `DshConnectorTools`: "It offers
 * no other member", R-EXT-11). K2 freezes them as names in prose and types, not as data.
 */
export const SERVICE_MEMBERS = Object.freeze(['apiVersion', 'emit', 'mine', 'register'])

const pad = (n, ch = 'a') => ch.repeat(n)
/** Design §13.2: a local name is at most 48 characters (K2 freezes it only inside NAME_GRAMMAR.local). */
const LOCAL_MAX = 48
/** EXT-BVA-01: a namespace whose length makes `<ns>.<48-char local>` exactly MCP's 128 (and one more). */
const LONG_NS = K2.NAME_GRAMMAR.publicMaxChars - K2.NAMESPACE.separator.length - LOCAL_MAX
const LONG_SUFFIX = 'fbtest'

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  hookKey: 'fbtest.c-ext.worlds',
  tempPrefix: 'fbtest-c-ext-',
  pluginsDir: 'plugins',
  connectorRow: 'fbtest-connector',
  /** The reference instant of the injected clock (EXT-BVA-03). */
  epochMs: 1_800_000_000_000,
  version: '1.2.3',
  /** Contributor packages (EXT-UC-01…03, EXT-EP-02). */
  pkg: Object.freeze({
    board: 'board-helper', acme: '@acme/tools', embed: 'dsh-connector-ui', ci: 'ci-watch', flaky: 'flaky',
    other: 'fbtest-other', holder: 'fbtest-holder', user: 'fbtest-user', declared: 'fbtest-real-package',
    dash: 'a-b', scoped: '@a/b', short: 'ns',
    long128: pad(LONG_NS - LONG_SUFFIX.length, 'n') + LONG_SUFFIX, long129: pad(LONG_NS + 1 - LONG_SUFFIX.length, 'n') + LONG_SUFFIX,
  }),
  /** The namespaces those packages derive (design §13.3; R-EXT-03). */
  ns: Object.freeze({ acme: 'acme-tools', embed: 'embed-ui', dash: 'a-b' }),
  /** EXT-EP-02 row 5b: what the plugin module declares as its own name. */
  declaredName: 'fbtest-declared-name',
  /** EXT-EP-02 row 4: a namespace a contributor tries to choose. */
  chosenNamespace: 'other',
  /** EXT-BVA-01: lengths of a local name. */
  localMax: LOCAL_MAX,
  pad,
  tool: Object.freeze({ lookup: 'lookup', go: 'go', second: 'second' }),
  description: 'Look up one board item by its key.',
  inputSchema: Object.freeze({ type: 'object', properties: Object.freeze({ key: Object.freeze({ type: 'string' }) }), required: Object.freeze(['key']) }),
  outputSchema: Object.freeze({ type: 'object', properties: Object.freeze({ count: Object.freeze({ type: 'integer' }) }), required: Object.freeze(['count']) }),
  /** Decision 2026-11-14: an outputSchema may not declare the envelope's own `ok`. */
  outputSchemaWithOk: Object.freeze({ type: 'object', properties: Object.freeze({ ok: Object.freeze({ type: 'boolean' }) }) }),
  /** Decision 2026-11-14: `data` that is not a plain object, or carries its own `ok`. */
  nonObjectData: Object.freeze([Object.freeze([1]), 'data', null, Object.freeze({ ok: false })]),
  /** Decision 2026-11-14: `_meta.version` of a package with no version. */
  noVersion: '',
  /** The field that pads a result's `data` to an exact size. */
  padKey: 'pad',
  /** The domain code `lookup` declares (EXT-EP-03 row 2). */
  declaredCode: 'not-found',
  undeclaredCode: 'weird',
  hint: Object.freeze({ readOnlyHint: true }),
  nonHint: 'contributor',
  /** JSON text overhead of `{"key":""}`, to build an argument of an exact byte size. */
  argumentOverheadBytes: JSON.stringify({ key: '' }).length,
  /** JSON text overhead of a string value (its two quotes). */
  stringOverheadBytes: JSON.stringify('').length,
  euro: '€',
  /** EXT-BVA-02 row 4. */
  euroCount: 2731,
  marker: 'FBTEST-C-EXT-',
  secretPath: '/fbtest/secret/path/index.js',
  /** EXT-EP-03 row 8: a token-shaped value inside a long message, and the message length. */
  tokenTail: 'Zq9xW2vB7nM4kL1pR8sT3uY6aD5fG0hJ',
  messageLength: 600,
  messageTokenAt: 10,
  /** What pads the message after the token: a space first, so no scrub pattern can run past the token's end. */
  messageFill: ' a',
  summaryHtml: '<b>Build</b> **42** <script>x</script> failed',
  badEventNames: Object.freeze(['', 'A B']),
  event: Object.freeze({ build: 'build.failed', note: 'note' }),
  summary: 'Build 42 failed',
  dedupeKey: 'build-42',
  /** EXT-BVA-04: declared limits below the ceilings. */
  declared: Object.freeze({ argumentBytes: 1000, resultBytes: 1000, timeoutMs: 1000 }),
  /** EXT-BVA-04 row 6 / 0d: how early a "T − ε" return comes (wide, so a busy machine cannot cross T). */
  earlyMs: 300,
  /** Sessions of the connector's DSH (EXT-DT-02); S1 is managed by E2. */
  session: Object.freeze({ managed: 'fbtest-s1', unmanaged: 'fbtest-s2', unknown: 'fbtest-s9' }),
  /** Paired principals (K1 `Pair`); keys are opaque fixture strings. */
  pairs: Object.freeze({
    d: Object.freeze({ entryKey: 'fbtest-entry-d', principalKey: 'fbtest-pk-d', id: 'fbtest-id-d', name: 'Fishball', label: 'fbtest-label-d', token: 'dsht_fbtestTokenOfD0000000000000000000000' }),
    e2: Object.freeze({ entryKey: 'fbtest-entry-e2', principalKey: 'fbtest-pk-e2', id: 'fbtest-id-e2', name: 'Ops', label: 'fbtest-label-e2', token: 'dsht_fbtestTokenOfE20000000000000000000000' }),
  }),
  /** A mailbox event the fake preloads (EXT-DT-01 rule 7); its type is not a contributor's. */
  fillerType: K1.EVENT_TYPE.message,
  /** EXT-EP-01 rows 2–10: one class each. */
  badNames: Object.freeze({ characters: Object.freeze(['Lookup', 'look up', 'look/up']), dotEdges: Object.freeze(['.lookup', 'lookup.']) }),
  arraySchema: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
  nonObjectSchemas: Object.freeze(['object', null]),
  remoteRef: 'https://example.com/schema.json',
  /** Row 6: keywords with a valid value each; only those outside K2's SCHEMA_SUBSET are used. */
  keywordCandidates: Object.freeze([['patternProperties', Object.freeze({ '^x-': Object.freeze({ type: 'string' }) })], ['$ref', '#/definitions/x']]),
  badCodes: Object.freeze(['Not-Found', '1st']),
  connectorSetting: 'fbtestSetting',
})

/** Harness timing (not product values). */
export const WAIT = Object.freeze({
  testMs: 60_000,
  /** EXT-BVA-04 row 0d waits out the 30 s ceiling. */
  ceilingTestMs: 90_000,
  settleMs: 5_000,
  pollMs: 10,
})

/** Owners of the rows this task cannot check (v3-tasks.md W3–W5). */
export const LATER = Object.freeze({
  http: 'C-HTTP (the endpoint\'s 401 before any MCP processing)',
  tools: 'C-TOOLS (tools/list composition: core tools first, pair-only tokens see none)',
  facade: 'F-FACADE (core\'s façade and the X9 path in the Fishball DSH)',
  attention: 'U-ATTN (embed-UI\'s attention latch and its contributed tools)',
  wire: 'C-WIRE (the connector settings schema: no per-contributor rows, no quarantine control)',
  matrix: 'X-MATRIX (a real dsh-hmr hot reload on a real DSH)',
})
