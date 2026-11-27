/**
 * Vocabulary for the K2 cases: the freeze of `dsh-agent-connector/tools` (v3-tasks.md row K2,
 * "resolves K flags in EXT"). The K-flagged EXT cases are EXT-UC-03, EXT-EP-01, EXT-BVA-01…04 and
 * EXT-DT-01 (docs/test-design/v3/07-contributors.md at `fb1cbd2`).
 *
 * Every value comes from docs/planning/v3-requirements.md (R-EXT-01…20, R-CON-02, R-SEC-04),
 * docs/planning/v3-design.md §9.1 and §13 where the requirement defers to it (flag D§n), and the
 * S5 report (`8f2788e`). None comes from an implementation.
 */
import path from 'node:path'

/** The frozen module, as consumers import it (R-CONN declared the subpath; K2 fills the folder). */
export const TOOLS_MODULE = Object.freeze({
  specifier: 'dsh-agent-connector/tools',
  /** Its folder in the connector package (the K2 "Owns" column). */
  folder: path.join('packages', 'dsh-connector', 'tools'),
  /** Source and declaration files whose text carries the service signatures (types only). */
  textFile: /\.(?:c|m)?(?:js|ts)$/,
})

/** The SDKs every case runs on (R-COMPAT-01). */
export const SDKS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])
/** The MCP core package each SDK carries (2.2.0 on both), the oracle of the spec-defined shapes. */
export const MCP_CORE = Object.freeze({ pkg: path.join('@modelcontextprotocol', 'core'), entry: path.join('dist', 'index.mjs') })

/** Design §13.2: names the contributor-facing API gives (`apiVersion`, `defineTool`, `ToolContributionError`). */
export const API = Object.freeze({ version: 1, define: 'defineTool', error: 'ToolContributionError', versionPath: /api_?version$/i })
/** Design §13.2: the service members, and their arity after S5 (`register(def)`, no `ctx` argument). */
export const SERVICE = Object.freeze({ register: 'register', emit: 'emit', mine: 'mine', ctxParam: /^\s*ctx\b/ })

/** R-EXT-12 / S5-Q3: the contributor field in `tools/list`. */
export const META_KEY = 'io.github.dsh-connector/contributor'
/** R-EXT-10: the only protocol revision handed to `execute`. */
export const PROTOCOL_VERSION = '2026-07-28'

/** Refusal codes (R-EXT-02/03, design §13.2). */
export const REGISTER_CODE = Object.freeze({
  invalid: 'tool-invalid', unidentified: 'contributor-unidentified', exists: 'tool-exists',
  reserved: 'namespace-reserved', closed: 'registry-closed',
})
/** EmitRefusal (R-EXT-16…19, design §13.2). */
export const EMIT_CODE = Object.freeze({
  unavailable: 'contributor-unavailable', invalid: 'event-invalid', tooLarge: 'payload-too-large',
  noAgent: 'no-agent', rateLimited: 'rate-limited', duplicate: 'duplicate', queueFull: 'queue-full',
  closed: 'registry-closed',
})
/** The shared result vocabulary a contributor's result may use or get (R-EXT-07/08, design §9.1 and §13.5). */
export const CALL_CODE = Object.freeze({
  failed: 'contributor-failed', operationFailed: 'operation-failed', limitExceeded: 'limit-exceeded', forbidden: 'forbidden',
})

/** Design §13.2: local tool name `[a-z0-9][a-z0-9_.-]{0,47}`, no leading/trailing `.`; codes `[a-z][a-z0-9-]{0,47}`. */
export const GRAMMAR = Object.freeze({ nameMax: 48, codeMax: 48 })
/** Design §13.2: description non-empty, at most 2 KiB UTF-8. */
export const DESCRIPTION_MAX_BYTES = 2048
/** A three-byte UTF-8 character, for byte-not-character boundaries. */
export const EURO = '€'
/** EXT-BVA-01: the namespace used to build a public name (`ns.` + local name). */
export const SHORT_NAMESPACE = 'ns'

/** R-EXT-18 (EXT-BVA-02/03): event limits. */
export const EVENT_LIMITS = Object.freeze({ payloadBytes: 8192, summaryChars: 500, perMinute: 30, burst: 10 })
/** Design §13.5 (EXT-EP-03 row 8): a contributor's message is cut to 500 characters. */
export const MESSAGE_MAX_CHARS = 500

/** Design §13.2: the per-call limits a definition may declare, each at most the connector's ceiling. */
export const LIMIT_KEYS = Object.freeze(['argumentBytes', 'resultBytes', 'timeoutMs'])
/** The words that find a frozen value by meaning in the module's exported data (its export names are K2's choice). */
export const MEANING = Object.freeze({
  limit: Object.freeze({ argumentBytes: /argument/i, resultBytes: /result/i, timeoutMs: /timeout/i }),
  payload: /payload/i,
  summary: /summary/i,
  message: /message/i,
  burst: /burst/i,
  perMinute: /minute|per_?min/i,
  quarantine: /quarantin/i,
})
/** Walk depth into exported data (constant objects are shallow; deeper is noise). */
export const WALK_DEPTH = 6

/** EXT-EP-01 row 14a: a non-hint annotation key a contributor might try. */
export const NON_HINT_ANNOTATION = 'contributor'

/**
 * Definitions handed to `defineTool` (EXT-EP-01, EXT-BVA-01, EXT-BVA-04 row 3). `valid` is row 1's
 * class: a grammar name, a non-empty description, an object input schema and an execute function.
 */
export const FIXTURE = Object.freeze({
  valid: Object.freeze({
    name: 'lookup',
    description: 'Look up one board item by its key.',
    inputSchema: Object.freeze({ type: 'object', properties: Object.freeze({ key: Object.freeze({ type: 'string' }) }), required: Object.freeze(['key']) }),
  }),
  /** Grammar-valid middle characters (`_ . -`) and a leading digit. */
  validNames: Object.freeze(['a_b.c-d', '0lookup']),
  /** Row 2 (upper case, space, `/`) and the first-character rule (`_`, `-` may not lead). */
  badCharacterNames: Object.freeze(['Lookup', 'look up', 'look/up', '_lookup', '-lookup']),
  /** Row 3. */
  dotEdgeNames: Object.freeze(['.lookup', 'lookup.']),
  /** Row 5: input schemas that are not objects. */
  nonObjectSchemas: Object.freeze([['a string', 'object'], ['null', null]]),
  arraySchema: Object.freeze({ type: 'array', items: Object.freeze({ type: 'string' }) }),
  /** Row 6: a `$ref` to a remote URL. */
  remoteRef: 'https://example.com/schema.json',
  /**
   * Row 6: JSON Schema keywords with a valid value each, in order; the first one outside the frozen
   * keyword subset stands for "an unsupported keyword" (the subset is K2's, so the pick follows it).
   */
  keywordCandidates: Object.freeze([
    ['patternProperties', { '^x-': { type: 'string' } }],
    ['unevaluatedProperties', false],
    ['dependentSchemas', { key: { required: ['other'] } }],
    ['$dynamicRef', '#node'],
    ['if', { required: ['key'] }],
    ['not', { required: ['key'] }],
    ['propertyNames', { maxLength: 8 }],
  ]),
  /** The keywords any subset must hold for an object schema with properties (row 1 uses them). */
  subsetCore: Object.freeze(['type', 'properties', 'required']),
  /** Row 7. */
  nonFunctionExecute: 'execute',
  /** Row 10: a codes entry breaking `[a-z][a-z0-9-]{0,47}`; and a list that keeps it. */
  badCodes: Object.freeze(['Not-found', '1st', '-x', 'with space']),
  goodCodes: Object.freeze(['not-found', 'x', 'stale-key-2']),
  /** Row 14a: a declared hint, kept as declared. */
  hint: Object.freeze({ readOnlyHint: true }),
  /** A contributor plugin as it appears in `_meta` (EXT-UC-01 step 3). */
  contributor: Object.freeze({ plugin: 'board-helper', version: '1.2.3' }),
  /** One ASCII character, to step a size by one byte. */
  pad: 'a',
})

/** MCP's tool-name rule (R-EXT-03, [spec: server/tools § Tool Names]): 1–128 of `A–Z a–z 0–9 _ - .`. */
export const MCP_TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/

/**
 * K2 amendment at the W3 merge (DECIDED #W3-2): a contributed tool's external (model-facing) name
 * is its public name with every `.` replaced by `__`. `name` is the frozen export; `value` the
 * decided value; `modelName` the model tool-name rule the mapping exists for (DSH's MCP client,
 * `[A-Za-z0-9_-]`); `vendored` core's copy of the constants; `readme`/`declaration` the contract
 * texts that must list and declare it.
 */
export const EXTERNAL_NAME_AMEND = Object.freeze({
  id: 'K2-AMEND-1',
  name: 'EXTERNAL_NAME',
  value: Object.freeze({ replaced: '.', replacement: '__' }),
  modelName: /^[A-Za-z0-9_-]+$/,
  readme: path.join('packages', 'dsh-connector', 'tools', 'README.md'),
  readmeExports: '## Exported names',
  declaration: path.join('packages', 'dsh-connector', 'tools', 'index.d.ts'),
  declares: /export declare const EXTERNAL_NAME\b/,
  /** Local names with no, one and several dots (grammar-valid, EXT-EP-01 row 1's class). */
  locals: Object.freeze(['tool', 'attention.signal', 'a.b.c-d_e']),
})

/** Owners of the rows K2 cannot check (v3-tasks.md W2–W5). */
export const LATER = Object.freeze({
  registry: 'C-EXT (contribution service registry: register path, namespace, list and call)',
  emit: 'C-EXT (emit validation, limits, dedupe and fate through K1 interfaces)',
  calls: 'C-EXT (pre/post call checks and containment over MCP)',
  quarantine: 'C-EXT (quarantine on the contributor activation)',
  settings: 'C-EXT (connector settings have no per-contributor rows; X-MATRIX checks the form on a real DSH)',
})
