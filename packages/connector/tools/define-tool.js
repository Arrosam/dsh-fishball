/**
 * `defineTool(def)`: the call-site validator of a contributed tool (design §9.1, §13.2;
 * R-EXT-02). A contributor may call it to fail early at its own call site; the connector's
 * `register(def)` runs the same check, so both refuse a definition the same way.
 *
 * Contract:
 * - a valid definition returns a frozen copy holding only the known fields (`name`, `title`,
 *   `description`, `inputSchema`, `outputSchema`, `limits`, `codes`, `annotations`, `execute`).
 *   Unknown fields are dropped, so a `namespace` in the definition is ignored (the namespace
 *   always comes from the caller, R-EXT-03), and `annotations` keeps only the specification's
 *   behaviour hints (R-EXT-12);
 * - the schemas, limits, codes and annotations in the copy are frozen snapshots taken by one
 *   read each, so the copy cannot change after the check;
 * - an invalid one throws `ToolContributionError` with code `tool-invalid` (Fishball's decision:
 *   the same error `register` throws, not a returned `{ok, code}`);
 * - it does not check the public name's 128-character bound, which needs the caller's namespace:
 *   `register` does that with `publicNameOf`.
 */
import { ANNOTATION_HINTS, CALL_CODE, NAME_GRAMMAR, REGISTER_REFUSAL, TOOL_LIMITS } from './constants.js'
import { ToolContributionError } from './errors.js'
import { isLocalName } from './names.js'
import { isJsonValue, isObjectRootSchema, isPlainArray, isPlainRecord } from './schema.js'

const UTF8 = new TextEncoder()
const byteLength = (text) => UTF8.encode(text).length
const CONNECTOR_CODES = Object.freeze(Object.values(CALL_CODE))

/** A field that failed its check. A sentinel, so an absent optional field can stay `undefined`. */
const INVALID = Symbol('invalid')

/**
 * Every check below reads its input exactly once and works on what it read, so a getter that
 * answers differently on a second read can never slip a value past the check (review finding).
 */

/** A declared limit is a positive whole number at or below its ceiling (PROPOSED: integers only). */
const limitValid = (value, ceiling) => Number.isSafeInteger(value) && value > 0 && value <= ceiling

function checkedLimits(limits) {
  if (limits === undefined) return undefined
  if (!isPlainRecord(limits)) return INVALID
  const out = {}
  for (const [key, ceiling] of Object.entries(TOOL_LIMITS.ceiling)) {
    const value = limits[key]
    if (value === undefined) continue
    if (!limitValid(value, ceiling)) return INVALID
    out[key] = value
  }
  return Object.freeze(out)
}

/** Each code once into a copy, then checked; a CALL_CODE may not be declared (it would be spoofable). */
function checkedCodes(codes) {
  if (codes === undefined) return undefined
  if (!isPlainArray(codes)) return INVALID
  const copy = Object.freeze([...codes])
  const valid = copy.every((code) => typeof code === 'string' && NAME_GRAMMAR.code.test(code) && !CONNECTOR_CODES.includes(code))
  return valid ? copy : INVALID
}

/** Only the specification's hints are kept; a hint that is not a boolean is refused (PROPOSED). */
function checkedAnnotations(annotations) {
  if (annotations === undefined) return undefined
  if (!isPlainRecord(annotations)) return INVALID
  const out = {}
  for (const hint of ANNOTATION_HINTS) {
    const value = annotations[hint]
    if (value === undefined) continue
    if (typeof value !== 'boolean') return INVALID
    out[hint] = value
  }
  return Object.freeze(out)
}

/** Recursively frozen; the input must already be plain JSON data. */
function deepFreeze(value) {
  if (typeof value === 'object' && value !== null) Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

/**
 * A schema as frozen JSON data of its own. One structural copy is taken (`structuredClone` reads
 * each getter once and throws on functions, caught as a refusal), and every check runs on that
 * copy: it must be plain JSON data (no Map, Date or class instance survives) and in the subset.
 * The copy, not the caller's object, is what the definition keeps, so a later change to the
 * caller's schema changes nothing.
 */
function checkedSchema(schema, optional) {
  if (schema === undefined && optional) return undefined
  const copy = structuredClone(schema)
  if (!isJsonValue(copy) || !isObjectRootSchema(copy)) return INVALID
  return deepFreeze(copy)
}

const descriptionValid = (text) => typeof text === 'string' && text.length > 0 && byteLength(text) <= TOOL_LIMITS.descriptionBytes
const optionalText = (text) => (text === undefined || typeof text === 'string' ? text : INVALID)

/**
 * Validate a contributed tool definition.
 * @param {import('./index.js').ContributedTool} definition
 * @returns {Readonly<import('./index.js').ContributedTool>} the frozen, known-fields-only copy
 * @throws {ToolContributionError} `tool-invalid`
 */
export function defineTool(definition) {
  const refuse = () => { throw new ToolContributionError(REGISTER_REFUSAL.toolInvalid) }
  let known
  try {
    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) refuse()
    const name = definition.name
    const description = definition.description
    const execute = definition.execute
    known = {
      name: isLocalName(name) ? name : INVALID,
      title: optionalText(definition.title),
      description: descriptionValid(description) ? description : INVALID,
      inputSchema: checkedSchema(definition.inputSchema, false),
      outputSchema: checkedSchema(definition.outputSchema, true),
      limits: checkedLimits(definition.limits),
      codes: checkedCodes(definition.codes),
      annotations: checkedAnnotations(definition.annotations),
      execute: typeof execute === 'function' ? execute : INVALID,
    }
  } catch (error) {
    // A hostile getter or proxy on the definition is a bad definition too, never a foreign error.
    if (error instanceof ToolContributionError) throw error
    refuse()
  }
  const fields = Object.entries(known)
  if (fields.some(([, value]) => value === INVALID)) refuse()
  return Object.freeze(Object.fromEntries(fields.filter(([, value]) => value !== undefined)))
}

/**
 * The limits a call of a validated tool runs under: each declared value, or the ceiling when
 * none is declared (design §13.5: min(declared, ceiling); a declared value is never above it).
 * @param {Readonly<import('./index.js').ContributedTool>} definition a `defineTool` result
 * @returns {Readonly<{argumentBytes: number, resultBytes: number, timeoutMs: number}>}
 */
export function effectiveLimits(definition) {
  const declared = definition.limits ?? {}
  return Object.freeze(Object.fromEntries(Object.entries(TOOL_LIMITS.ceiling).map(([key, ceiling]) => [key, declared[key] ?? ceiling])))
}
