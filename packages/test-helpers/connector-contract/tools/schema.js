/**
 * The validator of SCHEMA_SUBSET (constants.js): one scalar `type` or an exact-one `oneOf`;
 * object `properties` / `required` / boolean `additionalProperties`; array `items`; type-correct
 * scalar `enum` / `const`; lossless-JSON annotations. Contributed schemas must also be
 * object-rooted (MCP Tool.inputSchema; design §13.2).
 *
 * Why the rule is restated here instead of importing DSH's `assertObjectJsonSchema`: `./tools` is a
 * data-and-types module (design §9.1) that a contributor (embed-UI) imports without loading DSH
 * runtime packages, and it must load in plain Node. If DSH's subset ever changes, this file
 * follows it as a K2 amendment.
 */
import { SCHEMA_SUBSET } from './constants.js'

const { type: TYPE } = SCHEMA_SUBSET

/**
 * A plain data record: not an array, prototype Object.prototype or null, string keys only.
 * Stricter than DSH on one point, on purpose: DSH also accepts a plain object of another realm
 * (vm context); a contributor runs in the connector's own realm, so this one refuses it.
 */
export function isPlainRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(value, key))
}

/** A dense, undecorated array: own index for every position and no other own key but `length`. */
export function isPlainArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false
  if (Reflect.ownKeys(value).length !== value.length + 1) return false
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false
  return true
}

/** A finite JSON number; -0 is excluded because JSON text cannot carry it. */
const isJsonNumber = (value) => typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)

/** Whether a value survives JSON text unchanged (no undefined, functions, cycles, class instances). */
export function isJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return isJsonNumber(value)
  if (seen.has(value)) return false
  const children = isPlainArray(value) ? value : isPlainRecord(value) ? Object.values(value) : undefined
  if (!children) return false
  seen.add(value)
  const ok = children.every((child) => isJsonValue(child, seen))
  seen.delete(value)
  return ok
}

function scalarMatches(type, value) {
  switch (type) {
    case TYPE.string: return typeof value === 'string'
    case TYPE.number: return isJsonNumber(value)
    case TYPE.integer: return isJsonNumber(value) && Number.isInteger(value)
    case TYPE.boolean: return typeof value === 'boolean'
    case TYPE.null: return value === null
    default: return false
  }
}

const has = (node, key) => Object.hasOwn(node, key)

function annotationsValid(node) {
  return SCHEMA_SUBSET.annotations.every((key) => !has(node, key) || isJsonValue(node[key]))
    && SCHEMA_SUBSET.textAnnotations.every((key) => !has(node, key) || typeof node[key] === 'string')
}

function objectValid(node, seen) {
  const properties = has(node, 'properties') ? node.properties : {}
  if (!isPlainRecord(properties)) return false
  if (!Object.values(properties).every((child) => nodeValid(child, seen))) return false
  if (has(node, 'required')) {
    const { required } = node
    if (!isPlainArray(required) || !required.every((key) => typeof key === 'string' && has(properties, key))) return false
  }
  return !has(node, 'additionalProperties') || typeof node.additionalProperties === 'boolean'
}

function scalarValid(node, type) {
  const enumValid = has(node, 'enum') && isPlainArray(node.enum) && node.enum.length > 0 && node.enum.every((entry) => scalarMatches(type, entry))
  if (has(node, 'enum') && !enumValid) return false
  if (!has(node, 'const')) return true
  return scalarMatches(type, node.const) && (!enumValid || node.enum.includes(node.const))
}

function typedValid(node, seen) {
  const { type } = node
  if (typeof type !== 'string' || !SCHEMA_SUBSET.types.includes(type)) return false
  const misplaced = Object.entries(SCHEMA_SUBSET.placement).some(([key, types]) => has(node, key) && !types.includes(type))
  if (misplaced) return false
  if (type === TYPE.object) return objectValid(node, seen)
  if (type === TYPE.array) return !has(node, 'items') || nodeValid(node.items, seen)
  return scalarValid(node, type)
}

/** One schema node and everything below it, in DSH's subset. */
function nodeValid(node, seen) {
  if (!isPlainRecord(node) || seen.has(node)) return false
  const known = Object.keys(node).every((key) => SCHEMA_SUBSET.keywords.includes(key) || SCHEMA_SUBSET.annotations.includes(key))
  if (!known || !annotationsValid(node)) return false
  const hasType = has(node, 'type')
  const hasOneOf = has(node, 'oneOf')
  if (hasType && hasOneOf) return false
  seen.add(node)
  let ok
  if (hasOneOf) {
    ok = isPlainArray(node.oneOf) && node.oneOf.length >= SCHEMA_SUBSET.oneOfMinBranches
      && !SCHEMA_SUBSET.typed.some((key) => has(node, key))
      && node.oneOf.every((branch) => nodeValid(branch, seen))
  } else if (hasType) {
    ok = typedValid(node, seen)
  } else {
    // An annotation-only node is DSH's "any JSON value"; typed keywords need a type.
    ok = !SCHEMA_SUBSET.typed.some((key) => has(node, key))
  }
  seen.delete(node)
  return ok
}

/**
 * Whether a schema is in the supported subset and has an object root
 * (`{type: "object", …}`). Total: never throws, whatever the input.
 * @param {unknown} schema
 * @returns {boolean}
 */
export function isObjectRootSchema(schema) {
  try {
    return isPlainRecord(schema) && schema.type === SCHEMA_SUBSET.root && nodeValid(schema, new Set())
  } catch {
    // A hostile getter or proxy is not a schema.
    return false
  }
}
