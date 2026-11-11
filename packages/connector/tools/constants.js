/**
 * Frozen data of the contribution service `fishballConnectorTools` (task K2; design §13,
 * requirements R-EXT-01…20, spike V3-S5 `8f2788e`). Data only: no DSH import and no behaviour.
 * Every name here is part of the `./tools` freeze; changing one is a K2 amendment. Values the
 * requirements do not fix are marked "PROPOSED (user decision pending)": they are frozen as
 * written unless the user changes them at review.
 *
 * Every RegExp is itself frozen (an outer Object.freeze leaves `compile()` open to any importer)
 * and none has the `g` flag, so no `lastIndex` state is shared between importers.
 *
 * Units are part of each name. Values with different meanings keep separate names even when they
 * coincide (the event summary and the result message are both 500 characters, for different
 * reasons).
 */

const KIB = 1024
const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

/**
 * The service's version (design §9.1 names `apiVersion` as an export of `./tools`); the service
 * exposes the same value as its `apiVersion` member. It changes only with an incompatible member
 * change.
 */
export const apiVersion = 1

/** The service and its version. */
export const TOOLS_API = Object.freeze({
  version: apiVersion,
  service: 'fishballConnectorTools',
  // The only MCP revision the connector serves (Q12); handed to every call as `call.protocolVersion`.
  protocolVersion: '2026-07-28',
})

/**
 * The `tools/list` `_meta` key that carries `{plugin, version}` of a contributed tool's
 * contributor (R-EXT-12, S5-Q3). It is `_meta`, not `annotations`, because the stock 2.2.0 client
 * strips unknown annotation keys and keeps namespaced `_meta` keys (S5 §3.5).
 */
export const CONTRIBUTOR_META_KEY = 'io.github.dsh-fishball/contributor'

/**
 * Namespaces (R-EXT-03, design §13.3). The namespace is the normalised package name of the
 * caller's loader entry (S5-Q1); it attributes honest contributors and is not a security
 * boundary (S5-Q5 decided A).
 */
export const NAMESPACE = Object.freeze({
  // `<namespace>.<name>`: `.` is kept (S5-Q6). DSH's own MCP client hashes every dotted name for
  // DSH-hosted agents (S5 L5), so design §13.3's "soft budget so typical names avoid the hash"
  // cannot be met by any length; none is set (an open design amendment, see README).
  separator: '.',
  // Package-name normalisation (design §13.3): drop the scope's `@`, the scope's `/` becomes `-`,
  // lower-case, then every character outside the namespace alphabet becomes `-`.
  scopePrefix: '@',
  scopeSeparator: '/',
  replacement: '-',
  outside: Object.freeze(/[^a-z0-9-]/),
  // A normalised name identifies a package only if a letter or digit survives ("@/" or "___" do not).
  identifying: Object.freeze(/[a-z0-9]/),
  // The one fixed first-party alias, keyed on the normalised package name: the package is
  // `fishball-embed-ui` (S4-Q3 decided B, R-ARCH-01). S5's side note about a published
  // `dsh-fishball-embed-ui` predates that decision, so only the decided name is keyed.
  aliases: Object.freeze({ 'fishball-embed-ui': 'embed-ui' }),
  // `fishball` and the connector's own plugin name. Core tools need no entry: every contributed
  // name contains the separator and no core tool name does.
  reserved: Object.freeze(['fishball', 'fishball-connector']),
})

/** Name grammars (design §13.2; MCP server/tools § Tool Names for the public name). */
export const NAME_GRAMMAR = Object.freeze({
  // A tool's or an event's local name: 1–48 characters of `[a-z0-9_.-]`, starting with a letter
  // or digit, never ending with `.`.
  local: Object.freeze(/^(?!.*\.$)[a-z0-9][a-z0-9_.-]{0,47}$/),
  // MCP allows 1–128 characters; the public name is `<namespace>.<local name>`. Applies to tool
  // names. Event public names use the same bound (PROPOSED, user decision pending: R-EXT-16
  // gives events "the same namespace rule as tools"; a breach is `event-invalid`).
  publicMaxChars: 128,
  // A domain refusal code a tool declares in `codes`.
  code: Object.freeze(/^[a-z][a-z0-9-]{0,47}$/),
})

/**
 * Per-tool limits (design §13.2, §13.5). A tool may declare `limits` at or below each ceiling;
 * an undeclared limit is the ceiling, so the effective limit is always min(declared, ceiling).
 * PROPOSED (user decision pending): no requirement fixes the ceilings or the in-flight count.
 * - timeoutMs 30 s stays below the 60 s default per-call timeout of DSH's own MCP client
 *   (`dsh-mcp-client` DEFAULT_TOOL_CALL_TIMEOUT_MS, both SDKs), so the connector's
 *   `contributor-failed` arrives before a DSH-hosted client gives up;
 * - resultBytes 256 KiB matches DSH's default terminal tool result cap (dsh-tool-terminal);
 * - argumentBytes 64 KiB: a tool call's arguments are a request, not a transfer
 *   (attachments have their own core tools).
 */
export const TOOL_LIMITS = Object.freeze({
  descriptionBytes: 2 * KIB,
  ceiling: Object.freeze({
    argumentBytes: 64 * KIB,
    resultBytes: 256 * KIB,
    timeoutMs: 30 * SECOND_MS,
  }),
  // Calls of one contributor running at once, across all principals; one more gets `queue-full`
  // (design §13.5 step 5). PROPOSED. Design §13.5 step 5 also names a per-contributor call
  // *rate* limit; K2 sets none, so only the in-flight bound applies until the user sets one.
  // The per-principal in-flight and rate limits are the MCP endpoint's (K1).
  contributorInFlightCalls: 16,
  // A refusal's `message` is at most this many characters (code points, as the connector's other
  // `*Chars` limits count). It is scrubbed of secret shapes first, then cut, so a cut can never
  // leave an unmatched token prefix behind (design §13.5).
  messageChars: 500,
})

/** Contributor event limits (R-EXT-18, design §13.5a). */
export const EVENT_LIMITS = Object.freeze({
  // UTF-8 bytes of the payload's JSON text.
  payloadBytes: 8 * KIB,
  // Characters (code points). The summary is plain text: kept as given, never interpreted as
  // markup by the connector; whoever shows it shows it as text.
  summaryChars: 500,
  // A token bucket per (contributor namespace, recipient pair): capacity `rateBurst`, refilled
  // continuously at `ratePerMinute`. A refused emit, of any code, takes no token.
  ratePerMinute: 30,
  rateBurst: 10,
  rateWindowMs: MINUTE_MS,
})

/**
 * Quarantine (R-EXT-09, design §13.5: "`contributor-failed` on more than N of the last M calls").
 * The contributor is quarantined when, among its activation's last `windowOutcomes` counted
 * outcomes, the failures are **more than** `moreThanFailures`. Counted outcomes: every finished
 * call of its tools (a failure is `contributor-failed`; `tool-withdrawn` and refusals before
 * `execute` are not counted, because the contributor's code did not fail) and every emit that
 * reaches validation (a failure is `event-invalid` or `payload-too-large`, R-EXT-19; a success
 * counts as a success).
 * PROPOSED (user decision pending): N = 2, M = 5 keeps the spike's observed behaviour (V3-S5
 * Q-a: quarantine at the 3rd failure in 5) under the design's "more than N" wording.
 */
export const QUARANTINE = Object.freeze({
  moreThanFailures: 2,
  windowOutcomes: 5,
})

/**
 * `register(def)` and `defineTool(def)` refusals: thrown as `ToolContributionError {code}`.
 * `register` while the caller's activation is quarantined is **accepted but not listed** (a
 * normal disposer is returned; `mine()` shows it `quarantined`), because the quarantine is on the
 * activation (S5-Q2, EXT-ST-01 #6) and lifts only with a new one.
 */
export const REGISTER_REFUSAL = Object.freeze({
  toolInvalid: 'tool-invalid',
  contributorUnidentified: 'contributor-unidentified',
  toolExists: 'tool-exists',
  namespaceReserved: 'namespace-reserved',
  registryClosed: 'registry-closed',
})

/**
 * `emit(event)` refusals: always returned as `{ok: false, code}`, never thrown (R-EXT-18).
 * `contributor-unidentified` and `namespace-reserved` are not in design §13.2's EmitRefusal union;
 * they are added because R-EXT-16 applies the tools' namespace rule to events (PROPOSED, user
 * decision pending). Check order: EMIT_CHECK_ORDER.
 */
export const EMIT_REFUSAL = Object.freeze({
  eventInvalid: 'event-invalid',
  payloadTooLarge: 'payload-too-large',
  rateLimited: 'rate-limited',
  queueFull: 'queue-full',
  duplicate: 'duplicate',
  noFishball: 'no-fishball',
  contributorUnavailable: 'contributor-unavailable',
  contributorUnidentified: REGISTER_REFUSAL.contributorUnidentified,
  namespaceReserved: REGISTER_REFUSAL.namespaceReserved,
  registryClosed: REGISTER_REFUSAL.registryClosed,
})

/** Codes the connector itself puts in a contributed tool's result envelope (design §13.4, §13.5). */
export const CALL_CODE = Object.freeze({
  contributorFailed: 'contributor-failed',
  toolWithdrawn: 'tool-withdrawn',
  limitExceeded: 'limit-exceeded',
  invalidArguments: 'invalid-arguments',
  queueFull: 'queue-full',
  rateLimited: 'rate-limited',
  operationFailed: 'operation-failed',
})

/**
 * The order `emit` checks in; the first failing check's code is returned (EXT-DT-01 rules 1–8,
 * 11). The connector-side and caller checks come first because without them no contributor and
 * no activation exist to check further. A summary over EVENT_LIMITS.summaryChars or not a string
 * is `event-invalid` (it is a malformed event, not an oversize payload).
 */
export const EMIT_CHECK_ORDER = Object.freeze([
  EMIT_REFUSAL.registryClosed,
  EMIT_REFUSAL.contributorUnidentified,
  EMIT_REFUSAL.namespaceReserved,
  EMIT_REFUSAL.contributorUnavailable,
  EMIT_REFUSAL.eventInvalid,
  EMIT_REFUSAL.payloadTooLarge,
  EMIT_REFUSAL.noFishball,
  EMIT_REFUSAL.rateLimited,
  EMIT_REFUSAL.duplicate,
  EMIT_REFUSAL.queueFull,
])

/**
 * The connector's shared refusal vocabulary a tool may return without declaring it (design
 * §13.5, whose list ends "…"; this is its closed form, PROPOSED). Any other undeclared code
 * becomes `operation-failed`. A tool may not declare a CALL_CODE in `codes` (`tool-invalid`),
 * so a contributor can never produce `contributor-failed` or `tool-withdrawn` itself.
 */
export const SHARED_CODES = Object.freeze([
  CALL_CODE.limitExceeded,
  'forbidden',
  'unknown-session',
  'expired',
  'conflict',
  'unavailable',
  'unsupported-operation',
  CALL_CODE.operationFailed,
])

/**
 * The specification's behaviour hints (MCP ToolAnnotations, 2026-07-28) a contributor may
 * declare (R-EXT-12). They are untrusted hints. Any other `annotations` key is dropped, like
 * every unknown definition field; a hint that is not a boolean is `tool-invalid`.
 */
export const ANNOTATION_HINTS = Object.freeze(['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'])

/**
 * The JSON Schema subset of a contributed tool's `inputSchema` and `outputSchema` (R-EXT-02,
 * design §13.5 step 4: "the keyword subset matches what the hosts' client accepts"). It is DSH's
 * enforced subset (`@deepseek-ai/dsh-tools` `lib/types/json-schema.js`, the same file on
 * 0.2.1-rc.5 and 0.2.2-rc.1), plus an object root. `schema.js` applies it.
 */
const SCHEMA_TYPE = Object.freeze({ object: 'object', array: 'array', string: 'string', number: 'number', integer: 'integer', boolean: 'boolean', null: 'null' })
const SCALAR_TYPES = Object.freeze([SCHEMA_TYPE.string, SCHEMA_TYPE.number, SCHEMA_TYPE.integer, SCHEMA_TYPE.boolean, SCHEMA_TYPE.null])
export const SCHEMA_SUBSET = Object.freeze({
  type: SCHEMA_TYPE,
  types: Object.freeze(Object.values(SCHEMA_TYPE)),
  // The constraint keywords; every other keyword (`$ref`, `patternProperties`, `minLength`, …)
  // is refused, because DSH's client could not enforce it.
  keywords: Object.freeze(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const']),
  annotations: Object.freeze(['description', 'title', 'default', 'examples']),
  // Annotations that must be text when present.
  textAnnotations: Object.freeze(['description', 'title']),
  // Keywords that need a `type` (or `oneOf`) and may not sit beside `oneOf`.
  typed: Object.freeze(['properties', 'required', 'additionalProperties', 'items', 'enum', 'const']),
  // Which types each typed keyword belongs to.
  placement: Object.freeze({
    properties: Object.freeze([SCHEMA_TYPE.object]),
    required: Object.freeze([SCHEMA_TYPE.object]),
    additionalProperties: Object.freeze([SCHEMA_TYPE.object]),
    items: Object.freeze([SCHEMA_TYPE.array]),
    enum: SCALAR_TYPES,
    const: SCALAR_TYPES,
  }),
  oneOfMinBranches: 2,
  root: SCHEMA_TYPE.object,
})

/** `mine()` states of a registration. */
export const REGISTRATION_STATE = Object.freeze({ active: 'active', quarantined: 'quarantined' })

/**
 * `call.signal.reason` values, strings (design §13.2 ContributedCall.signal: "client cancel,
 * disconnect, revocation, timeout, contributor unload"; the names are PROPOSED).
 */
export const ABORT_REASON = Object.freeze({
  cancelled: 'cancelled',
  disconnected: 'disconnected',
  revoked: 'revoked',
  timeout: 'timeout',
  // The tool left the table: dispose, contributor unload, quarantine or connector unload.
  withdrawn: CALL_CODE.toolWithdrawn,
})

/** A contributor event's mailbox `type` is this prefix plus its public name (R-EXT-16). */
export const CONTRIBUTED_EVENT = Object.freeze({ typePrefix: 'contributed:' })
