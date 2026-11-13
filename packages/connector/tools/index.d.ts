/**
 * Types of `fishball-connector/tools` (task K2; design §13.2). The values are in `index.js`;
 * the prose freeze is `README.md`.
 */

/** A JSON value as it survives JSON text. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/** One node of the supported JSON Schema subset (DSH's enforced subset; see schema.js). */
export interface JsonSchemaNode {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  oneOf?: JsonSchemaNode[]
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  additionalProperties?: boolean
  items?: JsonSchemaNode
  enum?: Array<string | number | boolean | null>
  const?: string | number | boolean | null
  description?: string
  title?: string
  default?: JsonValue
  examples?: JsonValue
}

/** An object-rooted schema, as `inputSchema` and `outputSchema` must be. */
export type JsonSchemaObject = JsonSchemaNode & { type: 'object' }

/**
 * The calling principal: an opaque, stable key and its current name. Design §13.2 types `name`
 * as `string`; it is `string | null` here because a principal may have no name (R-NAME-04,
 * Q-NAME-1 decided B, made after §13.2 was drafted).
 */
export interface ContributedPrincipal {
  readonly key: string
  readonly name: string | null
}

/** The per-call context handed to `execute` (R-EXT-10). Nothing else is reachable through it. */
export interface ContributedCall {
  readonly principal: ContributedPrincipal
  readonly protocolVersion: '2026-07-28'
  /** Fires on client cancel, disconnect, revocation, timeout or withdrawal; `reason` is an AbortReason. */
  readonly signal: AbortSignal
}

export type ContributedResult =
  | { ok: true; data: JsonValue; text?: string }
  | { ok: false; code: string; message?: string }

export interface ToolLimits {
  /** UTF-8 bytes of the arguments' JSON text, ≤ TOOL_LIMITS.ceiling.argumentBytes. */
  argumentBytes?: number
  /** UTF-8 bytes of `data`'s JSON text, ≤ TOOL_LIMITS.ceiling.resultBytes. */
  resultBytes?: number
  /** Milliseconds, ≤ TOOL_LIMITS.ceiling.timeoutMs. */
  timeoutMs?: number
}

/** The specification's behaviour hints; untrusted. Other keys are dropped. */
export interface ToolAnnotationHints {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface ContributedTool {
  /** Local name, NAME_GRAMMAR.local; the public name is `<namespace>.<name>`. */
  name: string
  title?: string
  /** Non-empty, ≤ TOOL_LIMITS.descriptionBytes UTF-8 bytes. */
  description: string
  inputSchema: JsonSchemaObject
  outputSchema?: JsonSchemaObject
  limits?: ToolLimits
  /** The domain refusal codes this tool may return, each NAME_GRAMMAR.code. */
  codes?: readonly string[]
  annotations?: ToolAnnotationHints
  execute(args: unknown, call: ContributedCall): Promise<ContributedResult>
}

export interface ContributedEvent {
  /** Local name, same grammar as a tool's; the public name is `<namespace>.<event>`. */
  event: string
  /** ≤ EVENT_LIMITS.payloadBytes UTF-8 bytes of JSON text. */
  payload: JsonValue
  /** Plain text, ≤ EVENT_LIMITS.summaryChars characters. */
  summary?: string
  /** A session of this DSH the event is about; it decides the recipient (R-EXT-17). */
  sessionId?: string
  /** A pending event with the same key from the same contributor is not queued again. */
  dedupeKey?: string
}

export type RegisterRefusal = 'tool-invalid' | 'contributor-unidentified' | 'tool-exists' | 'namespace-reserved' | 'registry-closed'
export type EmitRefusal =
  | 'event-invalid' | 'payload-too-large' | 'rate-limited' | 'queue-full' | 'duplicate'
  | 'no-fishball' | 'contributor-unavailable' | 'contributor-unidentified' | 'namespace-reserved' | 'registry-closed'
export type RegistrationState = 'active' | 'quarantined'
export type AbortReason = 'cancelled' | 'disconnected' | 'revoked' | 'timeout' | 'tool-withdrawn'

export interface Registration {
  readonly name: string
  readonly publicName: string
  readonly state: RegistrationState
}

/** `_meta[CONTRIBUTOR_META_KEY]` of a contributed tool in `tools/list`. */
export interface ContributorMeta {
  /** The contributor's package name. */
  plugin: string
  /** Its package version. */
  version: string
}

/**
 * The service `ctx.fishballConnectorTools` (inject it optionally: `'fishballConnectorTools?'`).
 * The caller is the context the service was reached through; there is no `ctx` argument (S5).
 * It offers no other member (R-EXT-11).
 */
export interface FishballConnectorTools {
  readonly apiVersion: 1
  /** Register one tool; returns its disposer (idempotent). Throws ToolContributionError. */
  register(definition: ContributedTool): () => void
  /** Emit one event to Fishball. Never throws for a refusal. */
  emit(event: ContributedEvent): Promise<{ ok: true; eventId: string } | { ok: false; code: EmitRefusal }>
  /** This caller's registrations in its current activation. */
  mine(): readonly Registration[]
}

export declare class ToolContributionError extends Error {
  readonly name: 'ToolContributionError'
  readonly code: RegisterRefusal
  constructor(code: RegisterRefusal)
}

export declare const apiVersion: 1
export declare const SCHEMA_SUBSET: Readonly<{
  type: Readonly<Record<'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null', string>>
  types: readonly string[]
  keywords: readonly string[]
  annotations: readonly string[]
  textAnnotations: readonly string[]
  typed: readonly string[]
  placement: Readonly<Record<string, readonly string[]>>
  oneOfMinBranches: 2
  root: 'object'
}>
export declare const TOOLS_API: Readonly<{ version: 1; service: 'fishballConnectorTools'; protocolVersion: '2026-07-28' }>
export declare const CONTRIBUTOR_META_KEY: 'io.github.dsh-fishball/contributor'
export declare const CONTRIBUTED_EVENT: Readonly<{ typePrefix: 'contributed:' }>
export declare const NAMESPACE: Readonly<{
  separator: '.'
  scopePrefix: '@'
  scopeSeparator: '/'
  replacement: '-'
  outside: RegExp
  identifying: RegExp
  aliases: Readonly<Record<string, string>>
  reserved: readonly string[]
}>
export declare const NAME_GRAMMAR: Readonly<{ local: RegExp; publicMaxChars: 128; code: RegExp }>
export declare const TOOL_LIMITS: Readonly<{
  descriptionBytes: number
  ceiling: Readonly<{ argumentBytes: number; resultBytes: number; timeoutMs: number }>
  contributorInFlightCalls: number
  messageChars: number
}>
export declare const EVENT_LIMITS: Readonly<{ payloadBytes: number; summaryChars: number; ratePerMinute: number; rateBurst: number; rateWindowMs: number }>
export declare const QUARANTINE: Readonly<{ moreThanFailures: number; windowOutcomes: number }>
export declare const EMIT_CHECK_ORDER: readonly EmitRefusal[]
export declare const REGISTER_REFUSAL: Readonly<{
  toolInvalid: 'tool-invalid'
  contributorUnidentified: 'contributor-unidentified'
  toolExists: 'tool-exists'
  namespaceReserved: 'namespace-reserved'
  registryClosed: 'registry-closed'
}>
export declare const EMIT_REFUSAL: Readonly<{
  eventInvalid: 'event-invalid'
  payloadTooLarge: 'payload-too-large'
  rateLimited: 'rate-limited'
  queueFull: 'queue-full'
  duplicate: 'duplicate'
  noFishball: 'no-fishball'
  contributorUnavailable: 'contributor-unavailable'
  contributorUnidentified: 'contributor-unidentified'
  namespaceReserved: 'namespace-reserved'
  registryClosed: 'registry-closed'
}>
export declare const CALL_CODE: Readonly<{
  contributorFailed: 'contributor-failed'
  toolWithdrawn: 'tool-withdrawn'
  limitExceeded: 'limit-exceeded'
  invalidArguments: 'invalid-arguments'
  queueFull: 'queue-full'
  rateLimited: 'rate-limited'
  operationFailed: 'operation-failed'
}>
export declare const SHARED_CODES: readonly string[]
export declare const ANNOTATION_HINTS: readonly ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']
export declare const REGISTRATION_STATE: Readonly<{ active: 'active'; quarantined: 'quarantined' }>
export declare const ABORT_REASON: Readonly<{ cancelled: 'cancelled'; disconnected: 'disconnected'; revoked: 'revoked'; timeout: 'timeout'; withdrawn: 'tool-withdrawn' }>

/** Validate a definition; returns a frozen known-fields-only copy. Throws ToolContributionError('tool-invalid'). */
export declare function defineTool(definition: ContributedTool): Readonly<ContributedTool>
/** min(declared, ceiling) for each per-call limit of a `defineTool` result. */
export declare function effectiveLimits(definition: Readonly<ContributedTool>): Readonly<Required<ToolLimits>>
/** Normalised namespace of a package name (alias applied), or undefined when none can be derived. */
export declare function namespaceOf(packageName: unknown): string | undefined
export declare function isReservedNamespace(namespace: string): boolean
export declare function isLocalName(name: unknown): name is string
/** `<namespace>.<localName>`, or undefined on a bad or over-long name; never throws. */
export declare function publicNameFor(namespace: string, localName: unknown): string | undefined
/** `<namespace>.<localName>`; throws ToolContributionError('tool-invalid') on a bad or over-long name. */
export declare function publicNameOf(namespace: string, localName: string): string
export declare function isObjectRootSchema(schema: unknown): schema is JsonSchemaObject
